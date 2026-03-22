const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "hjM4APttiScr92UZlCKr4stPbhWzehqRaSVtYB11oXk";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${r.status} ${method} ${path}: ${JSON.stringify(json)}`);
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function run() {
  // Round 1: parallel lookups
  const [employees, categories, payTypes] = await Promise.all([
    api("GET", "/employee?email=ase.haugen@example.org&count=10&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = employees[0];
  console.log("Employee:", emp.id, emp.firstName, emp.lastName, emp.email, "address:", JSON.stringify(emp.address));

  // Filter categories for travel
  const travelCats = categories.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  console.log("Fly cat:", flyCat?.id, "vatType:", JSON.stringify(flyCat?.vatType));
  console.log("Taxi cat:", taxiCat?.id, "vatType:", JSON.stringify(taxiCat?.vatType));

  // Filter payment types for travel
  const travelPay = payTypes.filter((p: any) => p.showOnTravelExpenses);
  const payType = travelPay[0];
  console.log("PayType:", payType?.id, payType?.description);

  // Round 2: departureFrom - check employee address
  let departureFrom: string;
  if (emp.address && emp.address.city) {
    departureFrom = emp.address.city;
  } else {
    // Need company address
    const company = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
    departureFrom = company.address?.city;
    if (!departureFrom) throw new Error("No city found for departureFrom");
  }
  console.log("departureFrom:", departureFrom);

  // Dates: 4 days, use Mar 19-22
  const departureDate = "2026-03-19";
  const returnDate = "2026-03-22";
  // count = overnights = days - 1 = 3
  const overnightCount = 3;

  // Round 3: create travel expense
  const payload = {
    employee: { id: emp.id },
    title: "Kundebesøk Oslo",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
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
        amountCurrencyIncVat: 3600,
        amountNOKInclVAT: 3600,
        vatType: { id: flyCat.vatType?.id || 0 },
        date: departureDate,
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "Taxi",
        amountCurrencyIncVat: 250,
        amountNOKInclVAT: 250,
        vatType: { id: taxiCat.vatType?.id || 0 },
        date: returnDate,
      },
    ],
    perDiemCompensations: [
      {
        location: "Oslo",
        count: overnightCount,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
  };

  const te = await api("POST", "/travelExpense", payload);
  const teId = te.id;
  console.log("Created travel expense:", teId);

  // Round 4: readback
  await api("GET", `/travelExpense/${teId}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*)),travelDetails(*)`);

  // Round 5: deliver
  await api("PUT", `/travelExpense/:deliver?id=${teId}`);

  // Round 6: approve
  await api("PUT", `/travelExpense/:approve?id=${teId}`);

  // Round 7: createVouchers
  await api("PUT", `/travelExpense/:createVouchers?id=${teId}&date=${returnDate}`);

  // Round 8: final readback
  const final = await api("GET", `/travelExpense/${teId}?fields=*,perDiemCompensations(*),costs(*),voucher(*)`);
  console.log("isCompleted:", final.isCompleted, "state:", final.state, "voucherId:", final.voucher?.id);

  // Round 9: voucher postings
  if (final.voucher?.id) {
    await api("GET", `/ledger/voucher/${final.voucher.id}?fields=*,postings(*,account(*))`);
  }

  console.log("DONE");
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
