const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "DvOuIOzRUPGoiuWR8D3_jC2wUSK0PewHPSmjoAtwLVk";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE_URL}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (res.status >= 400) throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Round 1 — parallel lookups (3 GETs)
  const [employees, costCategories, paymentTypes] = await Promise.all([
    api("GET", "/employee?email=magnus.bakken@example.org&count=10&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = employees[0];
  if (!emp) throw new Error("Employee not found");
  console.log(`Employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}, email=${emp.email}`);
  console.log(`Employee address: ${JSON.stringify(emp.address)}`);

  // Find Fly and Taxi categories
  const flyCat = costCategories.find((c: any) => c.description === "Fly" && c.showOnTravelExpenses);
  const taxiCat = costCategories.find((c: any) => c.description === "Taxi" && c.showOnTravelExpenses);
  if (!flyCat || !taxiCat) throw new Error(`Missing categories: fly=${!!flyCat}, taxi=${!!taxiCat}`);
  console.log(`Fly cat: id=${flyCat.id}, vatType.id=${flyCat.vatType?.id}`);
  console.log(`Taxi cat: id=${taxiCat.id}, vatType.id=${taxiCat.vatType?.id}`);

  // Find payment type for private expenses
  const payType = paymentTypes.find((t: any) => t.showOnTravelExpenses);
  if (!payType) throw new Error("No travel payment type found");
  console.log(`PaymentType: id=${payType.id}, description=${payType.description}`);

  // Round 2 — conditional: get departure city
  let departureFrom: string;
  if (emp.address?.city) {
    departureFrom = emp.address.city;
  } else {
    // Need company address
    const company = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
    departureFrom = company.address?.city;
    if (!departureFrom) throw new Error("No city for departureFrom");
  }
  console.log(`departureFrom: ${departureFrom}`);

  // Date range: 5-day trip, pick recent dates
  const departureDate = "2026-03-17";
  const returnDate = "2026-03-21";

  // Round 3 — create travel expense (1 POST)
  const travelExpense = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Kundebesøk Oslo",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: false,
      departureDate,
      returnDate,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Oslo",
      detailedJourneyDescription: "Kundebesøk Oslo",
      purpose: "Kundebesøk Oslo",
    },
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        comments: "Flybillett",
        amountCurrencyIncVat: 7150,
        amountNOKInclVAT: 7150,
        vatType: { id: flyCat.vatType?.id ?? 12 },
        date: departureDate,
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "Taxi",
        amountCurrencyIncVat: 450,
        amountNOKInclVAT: 450,
        vatType: { id: taxiCat.vatType?.id ?? 12 },
        date: returnDate,
      },
    ],
  });

  const teId = travelExpense.id;
  console.log(`Travel expense created: id=${teId}`);

  // Round 4 — readback verification
  const readback = await api("GET", `/travelExpense/${teId}?fields=*,perDiemCompensations(*),costs(*,costCategory(*),vatType(*)),travelDetails(*)`);
  console.log("Readback perDiemCompensations length:", readback.perDiemCompensations?.length ?? 0);

  // Round 5 — deliver
  const deliverResult = await api("PUT", `/travelExpense/:deliver?id=${teId}`);
  console.log("Deliver state:", deliverResult[0]?.state ?? deliverResult?.state);

  // Round 6 — approve
  const approveResult = await api("PUT", `/travelExpense/:approve?id=${teId}`);
  const approved = approveResult[0] ?? approveResult;
  console.log("Approve state:", approved.state, "isApproved:", approved.isApproved);

  // Round 7 — createVouchers
  await api("PUT", `/travelExpense/:createVouchers?id=${teId}&date=${returnDate}`);

  // Round 8 — final readback with voucher
  const finalTE = await api("GET", `/travelExpense/${teId}?fields=*,costs(*),voucher(*)`);
  console.log("isCompleted:", finalTE.isCompleted, "state:", finalTE.state, "amount:", finalTE.amount, "voucher.id:", finalTE.voucher?.id);

  // Round 9 — voucher postings
  if (finalTE.voucher?.id) {
    await api("GET", `/ledger/voucher/${finalTE.voucher.id}?fields=*,postings(*,account(*))`);
  }

  console.log("DONE");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
