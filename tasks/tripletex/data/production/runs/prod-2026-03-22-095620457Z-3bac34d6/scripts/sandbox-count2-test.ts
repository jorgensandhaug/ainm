// Test hypothesis: count=2 (overnights for 3-day trip)
// rateCategory "Overnatting over 12 timer" literally means "overnight" — count should be overnights.
// 3-day trip = 2 overnights.

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

  // Full E2E with count=2
  console.log("=== FULL E2E: count=2 (overnights) for 3-day trip ===");
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
      location: "Stavanger",
      count: 2,  // ← 2 OVERNIGHTS for a 3-day trip
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
      // NO rate — let system auto-fill 1012
    }],
    costs: [
      { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Flybillett", amountCurrencyIncVat: 3900, amountNOKInclVAT: 3900, vatType: { id: flyCat!.vatType?.id }, date: "2026-03-18" },
      { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 350, amountNOKInclVAT: 350, vatType: { id: taxiCat!.vatType?.id }, date: "2026-03-20" },
    ],
  };

  const res = await post("/travelExpense", payload);
  if (!res) return;
  const teId = res.value.id;
  console.log("Created:", teId);

  // Readback
  const rb = await get(`/travelExpense/${teId}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*)),travelDetails(*)`);
  const te = rb!.value;
  console.log("\n--- READBACK ---");
  console.log("Title:", te.title, "Amount:", te.amount, "PaymentAmount:", te.paymentAmount);
  const td = te.travelDetails;
  console.log("TravelDetails:", td.departureDate, td.returnDate, td.departureTime, td.returnTime);
  console.log("  departureFrom:", td.departureFrom, "destination:", td.destination);
  console.log("  isForeignTravel:", td.isForeignTravel, "isDayTrip:", td.isDayTrip);
  const pd = te.perDiemCompensations?.[0];
  console.log("PerDiem: count:", pd?.count, "rate:", pd?.rate, "amount:", pd?.amount);
  console.log("  location:", pd?.location, "overnight:", pd?.overnightAccommodation);
  console.log("  rateType:", pd?.rateType?.id, "rateCat:", pd?.rateType?.rateCategory?.id, pd?.rateType?.rateCategory?.name);
  for (const c of te.costs ?? []) {
    console.log("Cost:", c.costCategory?.description, "=", c.amountCurrencyIncVat, "vat:", c.vatType?.id, c.vatType?.percentage);
  }

  // Full lifecycle: deliver → approve → createVouchers
  console.log("\n--- LIFECYCLE ---");
  const del = await put(`/travelExpense/:deliver?id=${teId}`);
  if (!del) return;
  console.log("Delivered:", del.values?.[0]?.state);

  const app = await put(`/travelExpense/:approve?id=${teId}`);
  if (!app) return;
  console.log("Approved:", app.values?.[0]?.state);

  const cv = await put(`/travelExpense/:createVouchers?id=${teId}&date=2026-03-20`);
  if (!cv) return;
  console.log("CreateVouchers:", cv.values?.[0]?.isCompleted);

  // Final readback
  const fin = await get(`/travelExpense/${teId}?fields=*,perDiemCompensations(*),costs(*),voucher(*)`);
  const f = fin!.value;
  console.log("\n--- FINAL ---");
  console.log("isCompleted:", f.isCompleted, "state:", f.state, "amount:", f.amount, "voucher:", f.voucher?.id);

  // Voucher postings
  if (f.voucher?.id) {
    const vr = await get(`/ledger/voucher/${f.voucher.id}?fields=*,postings(*,account(*))`);
    console.log("\nVoucher postings:");
    for (const p of vr!.value.postings ?? []) {
      console.log(`  ${p.account?.number} ${p.account?.name}: ${p.amount}`);
    }
  }

  // Comparison summary
  console.log("\n=== COMPARISON ===");
  console.log("count=3 (days): perDiem=3036, total=7286");
  console.log("count=2 (overnights): perDiem=", pd?.amount ?? "?", "total=", te.amount);

  console.log("\nDONE");
}

main().catch(e => { console.error(e); process.exit(1); });
