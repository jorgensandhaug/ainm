const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Z5hHOIPE0UPfovORt1Y1AVXeizAV-kxpSK0me4NgMXY";
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

// Step 1: Get employee
const empRes = await get("/employee?email=charlotte.smith@example.org&count=10&fields=*");
const employees = empRes.values.filter((e: any) => e.email?.toLowerCase() === "charlotte.smith@example.org");
const emp = employees.find((e: any) => e.allowInformationRegistration) || employees[0];
if (!emp) throw new Error("Employee not found");
console.log("Employee:", emp.id, emp.firstName, emp.lastName, "address:", emp.address, "companyId:", emp.companyId);

// Determine departureFrom from employee address
let departureFrom: string | null = null;
if (emp.address) {
  departureFrom = emp.address.city || emp.address.addressLine1 || emp.address.displayName || null;
}

// Step 2: Parallel lookups (company if needed + costCategory + paymentType)
const fetches: Promise<any>[] = [];
let companyIdx = -1;
if (!departureFrom && emp.companyId) {
  companyIdx = fetches.length;
  fetches.push(get(`/company/${emp.companyId}?fields=*,address(*)`));
}
const costCatIdx = fetches.length;
fetches.push(get("/travelExpense/costCategory?count=1000&fields=*"));
const payTypeIdx = fetches.length;
fetches.push(get("/travelExpense/paymentType?count=1000&fields=*"));

const results = await Promise.all(fetches);

if (companyIdx >= 0) {
  const co = results[companyIdx].value;
  const addr = co.address;
  if (addr) {
    departureFrom = addr.city || addr.addressLine1 || addr.displayName || addr.addressAsString || null;
  }
  console.log("Company address fallback → departureFrom:", departureFrom);
}
if (!departureFrom) throw new Error("No concrete departureFrom found from employee or company");

// Cost categories
const allCats = results[costCatIdx].values.filter((c: any) => c.showOnTravelExpenses);
const flyCat = allCats.find((c: any) => c.description === "Fly" || c.name === "Fly");
const taxiCat = allCats.find((c: any) => c.description === "Taxi" || c.name === "Taxi");
if (!flyCat || !taxiCat) throw new Error(`Missing cost categories: fly=${flyCat?.id}, taxi=${taxiCat?.id}`);
console.log("CostCategories: Fly=", flyCat.id, "Taxi=", taxiCat.id);

// Payment type
const payTypes = results[payTypeIdx].values.filter((p: any) => p.showOnTravelExpenses && !p.isInactive);
const payType = payTypes[0];
if (!payType) throw new Error("No active travel payment type found");
console.log("PaymentType:", payType.id, payType.description);

// Step 3: Build payload
// 2-day trip → overnight → rateType 25888/740
// Deterministic dates: 2026-03-20..2026-03-21
const departureDate = "2026-03-20";
const returnDate = "2026-03-21";

const payload = {
  employee: { id: emp.id },
  title: "Conference Tromsø",
  travelDetails: {
    isForeignTravel: false,
    isDayTrip: false,
    isCompensationFromRates: true,
    departureDate,
    returnDate,
    departureTime: "08:00",
    returnTime: "18:00",
    departureFrom,
    destination: "Tromsø",
    detailedJourneyDescription: "Conference Tromsø",
    purpose: "Conference Tromsø",
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
      date: departureDate,
    },
    {
      costCategory: { id: taxiCat.id },
      paymentType: { id: payType.id },
      comments: "taxi",
      amountCurrencyIncVat: 600,
      amountNOKInclVAT: 600,
      vatType: { id: 0 },
      date: returnDate,
    },
  ],
};

console.log("Creating travel expense...");
const createRes = await post("/travelExpense", payload);
const te = createRes.value;
console.log("Created:", te.id, "state:", te.state, "costs:", te.costs?.length, "perDiem:", te.perDiemCompensations?.length);

// Step 4: Deliver
console.log("Delivering...");
const deliverRes = await put(`/travelExpense/:deliver?id=${te.id}`);
const delivered = deliverRes.values?.[0] || deliverRes.value;
console.log("Delivered:", delivered.id, "state:", delivered.state);
console.log("Title:", delivered.title);
console.log("Employee:", delivered.employee?.id);
console.log("TravelDetails:", JSON.stringify(delivered.travelDetails));
console.log("Costs count:", delivered.costs?.length);
console.log("PerDiem count:", delivered.perDiemCompensations?.length);
console.log("DONE");
