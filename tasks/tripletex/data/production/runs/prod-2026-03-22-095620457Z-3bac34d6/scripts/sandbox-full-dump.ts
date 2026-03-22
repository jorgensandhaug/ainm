// Full field dump of a created travel expense to identify what we might be getting wrong.
// Focus on fields we haven't been logging.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  if (!r.ok) { const t = await r.text(); console.log(`GET ${path} → ${r.status}: ${t}`); return null; }
  return r.json();
}
async function post(path: string, body: any) {
  const r = await fetch(BASE + path, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) { console.log(`POST ${path} → ${r.status}: ${t}`); return null; }
  return JSON.parse(t);
}
async function put(path: string, body?: any) {
  const opts: any = { method: "PUT", headers: H };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  const t = await r.text();
  if (!r.ok) { console.log(`PUT ${path} → ${r.status}: ${t}`); return null; }
  return JSON.parse(t);
}

async function main() {
  const [empRes, catRes, ptRes] = await Promise.all([
    get("/employee?count=10&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes!.values[0];
  const cats = catRes!.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly");
  const taxiCat = cats.find((c: any) => c.description === "Taxi");
  const payType = ptRes!.values.filter((p: any) => p.showOnTravelExpenses)[0];
  const compRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = emp.address?.city ?? compRes?.value?.address?.city ?? "Oslo";

  // Create travel expense matching the production task exactly
  const payload = {
    employee: { id: emp.id },
    title: "Kundebesøk Stavanger",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-18", returnDate: "2026-03-20",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom, destination: "Stavanger",
      detailedJourneyDescription: "Kundebesøk Stavanger",
      purpose: "Kundebesøk Stavanger",
    },
    perDiemCompensations: [{
      location: "Stavanger", count: 3,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 3900, amountNOKInclVAT: 3900, vatType: { id: flyCat!.vatType?.id }, date: "2026-03-18" },
      { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 350, amountNOKInclVAT: 350, vatType: { id: taxiCat!.vatType?.id }, date: "2026-03-20" },
    ],
  };

  const res = await post("/travelExpense", payload);
  if (!res) return;
  const teId = res.value.id;

  // Full readback with ALL expansions
  const rb = await get(`/travelExpense/${teId}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*),paymentType(*)),travelDetails(*),employee(*),department(*),voucher(*)`);
  console.log("=== FULL TRAVEL EXPENSE DUMP ===");
  console.log(JSON.stringify(rb!.value, null, 2));

  // Deliver, approve, createVouchers
  await put(`/travelExpense/:deliver?id=${teId}`);
  await put(`/travelExpense/:approve?id=${teId}`);
  await put(`/travelExpense/:createVouchers?id=${teId}&date=2026-03-20`);

  // Final full readback
  const fin = await get(`/travelExpense/${teId}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*),paymentType(*)),travelDetails(*),employee(*),voucher(*)`);
  console.log("\n=== FINAL FULL DUMP ===");
  console.log(JSON.stringify(fin!.value, null, 2));

  // Voucher
  if (fin!.value.voucher?.id) {
    const vr = await get(`/ledger/voucher/${fin!.value.voucher.id}?fields=*,postings(*,account(*))`);
    console.log("\n=== VOUCHER DUMP ===");
    console.log(JSON.stringify(vr!.value, null, 2));
  }

  // Also: check the per-diem compensation endpoint separately
  console.log("\n=== PER-DIEM COMPENSATION DETAIL ===");
  const pdRes = await get(`/travelExpense/perDiemCompensation?travelExpenseId=${teId}&fields=*,rateType(*,rateCategory(*))&count=10`);
  console.log(JSON.stringify(pdRes?.values, null, 2));

  // Also: check travel costs separately
  console.log("\n=== COSTS DETAIL ===");
  const costsRes = await get(`/travelExpense/cost?travelExpenseId=${teId}&fields=*,costCategory(*),vatType(*),paymentType(*)&count=10`);
  console.log(JSON.stringify(costsRes?.values, null, 2));

  console.log("\nDONE");
}

main().catch(e => { console.error(e); process.exit(1); });
