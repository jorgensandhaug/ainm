// Sandbox verification: create a travel expense with vatType from category defaults
// and per-diem count=overnights, then verify stored values match
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} → ${r.status}: ${t}`); }
  return await r.json() as any;
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json() as any;
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(j)}`);
  return j.value;
}

async function put(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H });
  const j = await r.json() as any;
  if (!r.ok) throw new Error(`PUT ${path} → ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

// Step 1: parallel GETs
const [empResp, catResp, payResp] = await Promise.all([
  get("/employee/18478235?fields=*").then((r: any) => ({ values: [r.value] })),
  get("/travelExpense/costCategory?count=1000&fields=*"),
  get("/travelExpense/paymentType?count=1000&fields=*"),
]);

const emp = empResp.values[0];
console.log("Employee:", emp.id, emp.firstName, emp.lastName, "companyId:", emp.companyId);

// Step 2: company for departureFrom (sandbox employee has no address)
const companyResp = await get(`/company/${emp.companyId}?fields=*,address(*)`);
const company = companyResp.value;
const departureFrom = company.address?.city || "Oslo";
console.log("DepartureFrom:", departureFrom);

// Resolve categories
const travelCats = catResp.values.filter((c: any) => c.showOnTravelExpenses);
const flyCat = travelCats.find((c: any) => c.description === "Fly");
const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
console.log("Fly cat:", flyCat.id, "vatType:", JSON.stringify(flyCat.vatType));
console.log("Taxi cat:", taxiCat.id, "vatType:", JSON.stringify(taxiCat.vatType));

const payType = payResp.values.filter((p: any) => p.showOnTravelExpenses)[0];
console.log("PayType:", payType.id, payType.description);

// NOTE: sandbox company is NOT VAT-registered, so vatType=12 will fail.
// Test 1: try with vatType=12 (category default) — expect 422
// Test 2: fallback to vatType=0 (sandbox recovery)
// In production, the company IS VAT-registered and vatType=12 succeeds.

const departureDate = "2026-03-17";
const returnDate = "2026-03-21";

const payload = {
  employee: { id: emp.id },
  title: "Sandbox verify vatType + count",
  travelDetails: {
    isForeignTravel: false,
    isDayTrip: false,
    isCompensationFromRates: true,
    departureDate,
    returnDate,
    departureTime: "08:00",
    returnTime: "18:00",
    departureFrom,
    destination: "Trondheim",
    detailedJourneyDescription: "Sandbox verify vatType + count",
    purpose: "Sandbox verify vatType + count",
  },
  perDiemCompensations: [
    {
      location: "Trondheim",
      count: 4, // 5 days → 4 overnights
      rate: 800,
      amount: 3200, // 4 * 800
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    },
  ],
  costs: [
    {
      costCategory: { id: flyCat.id },
      paymentType: { id: payType.id },
      comments: "Flybillett",
      amountCurrencyIncVat: 2850,
      amountNOKInclVAT: 2850,
      vatType: { id: flyCat.vatType?.id ?? 0 },
      date: departureDate,
    },
    {
      costCategory: { id: taxiCat.id },
      paymentType: { id: payType.id },
      comments: "Taxi",
      amountCurrencyIncVat: 200,
      amountNOKInclVAT: 200,
      vatType: { id: taxiCat.vatType?.id ?? 0 },
      date: departureDate,
    },
  ],
};

console.log("\n=== Test 1: POST with category default vatType ===");
let expense: any;
try {
  expense = await post("/travelExpense", payload);
  console.log("SUCCESS with category vatType! Expense:", expense.id);
} catch (e: any) {
  console.log("Expected failure (sandbox not VAT-registered):", e.message.substring(0, 200));
  // Retry with vatType 0
  payload.costs[0].vatType = { id: 0 };
  payload.costs[1].vatType = { id: 0 };
  console.log("\n=== Test 2: POST with vatType=0 (sandbox fallback) ===");
  expense = await post("/travelExpense", payload);
  console.log("SUCCESS with vatType=0. Expense:", expense.id);
}

// Deliver
const delivered = await put(`/travelExpense/:deliver?id=${expense.id}`);
const d = delivered.values?.[0] || delivered.value;
console.log("\nDelivered:", d.id, "state:", d.state);
console.log("Costs count:", d.costs?.length);
console.log("PerDiem count:", d.perDiemCompensations?.length);

// Read back costs and per-diem to verify stored values
console.log("\n=== Verify stored cost values ===");
const costsResp = await get(`/travelExpense/cost?travelExpenseId=${d.id}&count=20&fields=*`);
for (const c of costsResp.values) {
  console.log(`Cost: ${c.comments}, amount=${c.amountCurrencyIncVat}, vatType=${JSON.stringify(c.vatType)}, category=${c.costCategory?.id}`);
}

console.log("\n=== Verify stored per-diem values ===");
const pdResp = await get(`/travelExpense/perDiemCompensation?travelExpenseId=${d.id}&count=20&fields=*`);
for (const p of pdResp.values) {
  console.log(`PerDiem: location=${p.location}, count=${p.count}, rate=${p.rate}, amount=${p.amount}, rateType=${JSON.stringify(p.rateType)}, rateCategory=${JSON.stringify(p.rateCategory)}, overnightAccommodation=${p.overnightAccommodation}`);
}
