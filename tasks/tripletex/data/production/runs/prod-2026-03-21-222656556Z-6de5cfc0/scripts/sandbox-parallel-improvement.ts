// Sandbox test: verify improved parallelization pattern
// Round 1: employee + costCat + payType (3 parallel)
// Round 2: company (conditional, only if employee has no address)
// Round 3: POST
// Round 4: deliver
// This saves a round when employee HAS an address (3 rounds instead of 4)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

let callCount = 0;
async function get(path: string) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} → ${r.status}: ${t}`); }
  return r.json();
}
async function post(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`POST ${path} → ${r.status}: ${t}`); }
  return r.json();
}
async function put(path: string) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`PUT ${path} → ${r.status}: ${t}`); }
  return r.json();
}

// Round 1: Parallelize employee + costCat + payType
const [empRes, costCatRes, payTypeRes] = await Promise.all([
  get("/employee?email=test@example.org&count=10&fields=*"),
  get("/travelExpense/costCategory?count=1000&fields=*"),
  get("/travelExpense/paymentType?count=1000&fields=*"),
]);

// Use known sandbox employee
const emp = empRes.values[0];
if (!emp) throw new Error("No employee found");
console.log("Employee:", emp.id, emp.firstName, emp.lastName, "address:", emp.address?.city || "null", "companyId:", emp.companyId);

// Resolve departureFrom
let departureFrom: string | null = null;
if (emp.address) {
  departureFrom = emp.address.city || emp.address.addressLine1 || emp.address.displayName || null;
}

// Round 2 (conditional): company lookup if no address
if (!departureFrom && emp.companyId) {
  const coRes = await get(`/company/${emp.companyId}?fields=*,address(*)`);
  const addr = coRes.value?.address;
  if (addr) {
    departureFrom = addr.city || addr.addressLine1 || addr.displayName || addr.addressAsString || null;
  }
  console.log("Company fallback → departureFrom:", departureFrom);
}
if (!departureFrom) throw new Error("Blocked: no departureFrom");

// Resolve categories
const allCats = costCatRes.values.filter((c: any) => c.showOnTravelExpenses);
const flyCat = allCats.find((c: any) => c.description === "Fly" || c.name === "Fly");
const taxiCat = allCats.find((c: any) => c.description === "Taxi" || c.name === "Taxi");
console.log("Fly:", flyCat?.id, "Taxi:", taxiCat?.id);

const payTypes = payTypeRes.values.filter((p: any) => p.showOnTravelExpenses && !p.isInactive);
const payType = payTypes[0];
console.log("PayType:", payType?.id, payType?.description);

if (!flyCat || !taxiCat || !payType) throw new Error("Missing lookups");

// Round 3: POST
const payload = {
  employee: { id: emp.id },
  title: "Sandbox 2-day parallel test",
  travelDetails: {
    isForeignTravel: false,
    isDayTrip: false,
    isCompensationFromRates: true,
    departureDate: "2026-03-20",
    returnDate: "2026-03-21",
    departureTime: "08:00",
    returnTime: "18:00",
    departureFrom,
    destination: "Tromsø",
    detailedJourneyDescription: "Sandbox 2-day parallel test",
    purpose: "Sandbox 2-day parallel test",
  },
  perDiemCompensations: [
    {
      location: "Tromsø",
      count: 2,
      rate: 800,
      amount: 1600,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    },
  ],
  costs: [
    {
      costCategory: { id: flyCat.id },
      paymentType: { id: payType.id },
      comments: "flight ticket",
      amountCurrencyIncVat: 6400,
      amountNOKInclVAT: 6400,
      vatType: { id: 0 },
      date: "2026-03-20",
    },
    {
      costCategory: { id: taxiCat.id },
      paymentType: { id: payType.id },
      comments: "taxi",
      amountCurrencyIncVat: 600,
      amountNOKInclVAT: 600,
      vatType: { id: 0 },
      date: "2026-03-21",
    },
  ],
};

const createRes = await post("/travelExpense", payload);
const te = createRes.value;
console.log("Created:", te.id, "state:", te.state, "costs:", te.costs?.length, "perDiem:", te.perDiemCompensations?.length);

// Round 4: Deliver
const deliverRes = await put(`/travelExpense/:deliver?id=${te.id}`);
const delivered = deliverRes.values?.[0] || deliverRes.value;
console.log("Delivered:", delivered.id, "state:", delivered.state);
console.log("Total calls:", callCount);
console.log("DONE");
