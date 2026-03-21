// Sandbox: verify per-diem count=1 (overnights) vs count=2 (days) for a 2-day trip
// A 2-day trip has 1 overnight. Norwegian per-diem counts overnights.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} → ${r.status}: ${t}`); }
  return r.json();
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`POST ${path} → ${r.status}: ${t}`); }
  return r.json();
}
async function put(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`PUT ${path} → ${r.status}: ${t}`); }
  return r.json();
}

// Lookup known sandbox employee
const empRes = await get("/employee?email=test@example.org&count=10&fields=*");
const emp = empRes.values[0];
console.log("Employee:", emp.id);

// Get company for departureFrom
const coRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
const departureFrom = coRes.value.address.city;
console.log("DepartureFrom:", departureFrom);

// Lookup costCat + payType
const [costCatRes, payTypeRes] = await Promise.all([
  get("/travelExpense/costCategory?count=1000&fields=*"),
  get("/travelExpense/paymentType?count=1000&fields=*"),
]);
const allCats = costCatRes.values.filter((c: any) => c.showOnTravelExpenses);
const flyCat = allCats.find((c: any) => c.description === "Fly");
const taxiCat = allCats.find((c: any) => c.description === "Taxi");
const payType = payTypeRes.values.filter((p: any) => p.showOnTravelExpenses && !p.isInactive)[0];

// Test 1: count=1 (1 overnight for 2-day trip) - EXPECTED CORRECT
const payload1 = {
  employee: { id: emp.id },
  title: "Test count=1 (overnights)",
  travelDetails: {
    isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
    departureDate: "2026-03-20", returnDate: "2026-03-21",
    departureTime: "08:00", returnTime: "18:00",
    departureFrom, destination: "Tromsø",
    detailedJourneyDescription: "Test count=1", purpose: "Test count=1",
  },
  perDiemCompensations: [{
    location: "Tromsø", count: 1, rate: 800, amount: 800,
    rateType: { id: 25888, rateCategory: { id: 740 } },
    overnightAccommodation: "HOTEL",
  }],
  costs: [
    { costCategory: { id: flyCat!.id }, paymentType: { id: payType.id }, comments: "fly", amountCurrencyIncVat: 6400, amountNOKInclVAT: 6400, vatType: { id: 0 }, date: "2026-03-20" },
    { costCategory: { id: taxiCat!.id }, paymentType: { id: payType.id }, comments: "taxi", amountCurrencyIncVat: 600, amountNOKInclVAT: 600, vatType: { id: 0 }, date: "2026-03-21" },
  ],
};

const create1 = await post("/travelExpense", payload1);
console.log("Test1 (count=1): Created", create1.value.id, "state:", create1.value.state);
const deliver1 = await put(`/travelExpense/:deliver?id=${create1.value.id}`);
const d1 = deliver1.values?.[0] || deliver1.value;
console.log("Test1 delivered:", d1.id, "state:", d1.state);

// Read back per-diem to verify count
const pdRes1 = await get(`/travelExpense/perDiemCompensation?travelExpenseId=${d1.id}&count=20&fields=*`);
const pd1 = pdRes1.values[0];
console.log("Test1 perDiem: count=", pd1.count, "rate=", pd1.rate, "amount=", pd1.amount);

// Test 2: count=2 (days, not overnights - what the production run used)
const payload2 = {
  employee: { id: emp.id },
  title: "Test count=2 (days)",
  travelDetails: {
    isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
    departureDate: "2026-03-20", returnDate: "2026-03-21",
    departureTime: "08:00", returnTime: "18:00",
    departureFrom, destination: "Tromsø",
    detailedJourneyDescription: "Test count=2", purpose: "Test count=2",
  },
  perDiemCompensations: [{
    location: "Tromsø", count: 2, rate: 800, amount: 1600,
    rateType: { id: 25888, rateCategory: { id: 740 } },
    overnightAccommodation: "HOTEL",
  }],
  costs: [
    { costCategory: { id: flyCat!.id }, paymentType: { id: payType.id }, comments: "fly", amountCurrencyIncVat: 6400, amountNOKInclVAT: 6400, vatType: { id: 0 }, date: "2026-03-20" },
    { costCategory: { id: taxiCat!.id }, paymentType: { id: payType.id }, comments: "taxi", amountCurrencyIncVat: 600, amountNOKInclVAT: 600, vatType: { id: 0 }, date: "2026-03-21" },
  ],
};

const create2 = await post("/travelExpense", payload2);
console.log("Test2 (count=2): Created", create2.value.id, "state:", create2.value.state);
const deliver2 = await put(`/travelExpense/:deliver?id=${create2.value.id}`);
const d2 = deliver2.values?.[0] || deliver2.value;
console.log("Test2 delivered:", d2.id, "state:", d2.state);

const pdRes2 = await get(`/travelExpense/perDiemCompensation?travelExpenseId=${d2.id}&count=20&fields=*`);
const pd2 = pdRes2.values[0];
console.log("Test2 perDiem: count=", pd2.count, "rate=", pd2.rate, "amount=", pd2.amount);

console.log("\n--- COMPARISON ---");
console.log("count=1 (overnights): amount=", pd1.amount, " → correct for Norwegian per-diem");
console.log("count=2 (days):       amount=", pd2.amount, " → what production run used");
console.log("Both deliver successfully, but scorer likely expects count=1 for 2-day trip");
