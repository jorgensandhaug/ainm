// Quick sandbox verification: confirm no-perDiem travel expense works E2E
const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
  if (res.status >= 400) {
    console.log(JSON.stringify(json, null, 2));
    throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  }
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Find an employee in sandbox
  const employees = await api("GET", "/employee?count=10&fields=*");
  const emp = employees.find((e: any) => e.email && e.allowInformationRegistration);
  if (!emp) throw new Error("No suitable employee found");
  console.log(`Employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}, email=${emp.email}, address.city=${emp.address?.city}`);

  // Get cost categories and payment types
  const [cats, payTypes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const flyCat = cats.find((c: any) => c.description === "Fly" && c.showOnTravelExpenses);
  const taxiCat = cats.find((c: any) => c.description === "Taxi" && c.showOnTravelExpenses);
  const payType = payTypes.find((t: any) => t.showOnTravelExpenses);

  console.log(`Fly: id=${flyCat?.id}, vatType.id=${flyCat?.vatType?.id}`);
  console.log(`Taxi: id=${taxiCat?.id}, vatType.id=${taxiCat?.vatType?.id}`);
  console.log(`PayType: id=${payType?.id}, desc=${payType?.description}`);

  // Get departure city
  let departureFrom = emp.address?.city;
  if (!departureFrom) {
    const company = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
    departureFrom = company.address?.city;
    console.log(`Company city: ${departureFrom}`);
  }

  // Use unique dates to avoid collision with previous sandbox tests
  const departureDate = "2026-07-01";
  const returnDate = "2026-07-05";

  // Create travel expense — NO perDiemCompensations
  const te = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Sandbox verify no-perDiem",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: false,
      departureDate,
      returnDate,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom: departureFrom || "Oslo",
      destination: "Bergen",
      detailedJourneyDescription: "Sandbox verify no-perDiem",
      purpose: "Sandbox verify no-perDiem",
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
  console.log(`Created TE: id=${te.id}`);

  // Readback
  const readback = await api("GET", `/travelExpense/${te.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*)),travelDetails(*)`);
  console.log(`perDiemCompensations count: ${readback.perDiemCompensations?.length}`);
  console.log(`costs count: ${readback.costs?.length}`);
  console.log(`amount: ${readback.amount}, paymentAmount: ${readback.paymentAmount}`);
  console.log(`travelDetails: departureFrom=${readback.travelDetails?.departureFrom}, destination=${readback.travelDetails?.destination}`);
  console.log(`isCompensationFromRates: ${readback.travelDetails?.isCompensationFromRates}`);
  for (const c of readback.costs || []) {
    console.log(`  cost: ${c.comments}, amount=${c.amountCurrencyIncVat}, cat=${c.costCategory?.description}, vat=${c.vatType?.id}/${c.vatType?.percentage}%`);
  }

  // Deliver
  const delivered = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
  console.log(`Deliver state: ${delivered[0]?.state}`);

  // Approve
  const approved = await api("PUT", `/travelExpense/:approve?id=${te.id}`);
  console.log(`Approve state: ${approved[0]?.state}, isApproved: ${approved[0]?.isApproved}`);

  // Create vouchers
  await api("PUT", `/travelExpense/:createVouchers?id=${te.id}&date=${returnDate}`);

  // Final readback
  const final_ = await api("GET", `/travelExpense/${te.id}?fields=*,costs(*,costCategory(*),vatType(*)),voucher(*),perDiemCompensations(*)`);
  console.log(`\n=== FINAL STATE ===`);
  console.log(`isCompleted: ${final_.isCompleted}`);
  console.log(`state: ${final_.state}`);
  console.log(`amount: ${final_.amount}`);
  console.log(`paymentAmount: ${final_.paymentAmount}`);
  console.log(`lowRateVAT: ${final_.lowRateVAT}`);
  console.log(`perDiemCompensations: ${final_.perDiemCompensations?.length}`);
  console.log(`voucher.id: ${final_.voucher?.id}`);
  console.log(`costs:`);
  for (const c of final_.costs || []) {
    console.log(`  ${c.comments}: amount=${c.amountCurrencyIncVat}, cat=${c.costCategory?.description}, vat=${c.vatType?.id}`);
  }

  // Voucher postings
  if (final_.voucher?.id) {
    const voucher = await api("GET", `/ledger/voucher/${final_.voucher.id}?fields=*,postings(*,account(*))`);
    console.log(`\n=== VOUCHER POSTINGS ===`);
    for (const p of voucher.postings || []) {
      console.log(`  acct ${p.account?.number} (${p.account?.name}): amount=${p.amount}, gross=${p.amountGross}, row=${p.row}, sysGen=${p.systemGenerated}`);
    }
  }

  console.log("\nSANDBOX VERIFY DONE");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
