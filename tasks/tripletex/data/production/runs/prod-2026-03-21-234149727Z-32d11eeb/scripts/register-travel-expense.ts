const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "zya04nInPkAB6SH6_PW5KRVV-0bBeqfwdEcC8R3ZL4U";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} → ${r.status}: ${t}`); }
  return (await r.json() as any).values;
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

// Round 1: parallel GETs
const [employees, costCategories, paymentTypes] = await Promise.all([
  get("/employee?email=svein.berge@example.org&count=10&fields=*"),
  get("/travelExpense/costCategory?count=1000&fields=*"),
  get("/travelExpense/paymentType?count=1000&fields=*"),
]);

const emp = employees.find((e: any) => e.email === "svein.berge@example.org") ?? employees[0];
console.log("Employee:", emp.id, emp.firstName, emp.lastName, "address:", emp.address, "companyId:", emp.companyId);

// Round 2: conditional company read for departureFrom
let departureFrom: string | null = null;
if (emp.address?.city) {
  departureFrom = emp.address.city;
} else if (emp.address?.addressLine1) {
  departureFrom = emp.address.addressLine1;
} else if (emp.companyId) {
  const r = await fetch(`${BASE}/company/${emp.companyId}?fields=*,address(*)`, { headers: H });
  if (!r.ok) throw new Error(`GET company → ${r.status}`);
  const company = (await r.json() as any).value;
  departureFrom = company.address?.city || company.address?.addressLine1 || company.address?.displayName || company.address?.addressAsString || null;
  console.log("Company address fallback:", departureFrom);
}

if (!departureFrom) throw new Error("BLOCKED: no concrete departureFrom from employee or company");

// Resolve cost categories (showOnTravelExpenses=true)
const travelCats = costCategories.filter((c: any) => c.showOnTravelExpenses);
const flyCat = travelCats.find((c: any) => c.description === "Fly") || travelCats.find((c: any) => /fly/i.test(c.description));
const taxiCat = travelCats.find((c: any) => c.description === "Taxi") || travelCats.find((c: any) => /taxi/i.test(c.description));
if (!flyCat || !taxiCat) throw new Error(`Missing cost categories: fly=${flyCat?.id}, taxi=${taxiCat?.id}`);
console.log("Fly category:", flyCat.id, "vatType:", JSON.stringify(flyCat.vatType));
console.log("Taxi category:", taxiCat.id, "vatType:", JSON.stringify(taxiCat.vatType));

// Resolve payment type (showOnTravelExpenses=true)
const travelPay = paymentTypes.filter((p: any) => p.showOnTravelExpenses);
const payType = travelPay[0];
if (!payType) throw new Error("No travel payment type found");
console.log("Payment type:", payType.id, payType.description);

// Dates: duration-only prompt, 5 days → deterministic 2026-03-17..2026-03-21
const departureDate = "2026-03-17";
const returnDate = "2026-03-21";

// Per-diem: 5 days → 4 overnights, rate=800, amount=3200
const perDiemCount = 4; // overnights = days - 1
const perDiemRate = 800;
const perDiemAmount = perDiemCount * perDiemRate; // 3200

const payload = {
  employee: { id: emp.id },
  title: "Kundebesøk Trondheim",
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
    detailedJourneyDescription: "Kundebesøk Trondheim",
    purpose: "Kundebesøk Trondheim",
  },
  perDiemCompensations: [
    {
      location: "Trondheim",
      count: perDiemCount,
      rate: perDiemRate,
      amount: perDiemAmount,
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

console.log("Creating travel expense...");
let expense: any;
try {
  expense = await post("/travelExpense", payload);
} catch (e: any) {
  // Recovery: if VAT_NOT_REGISTERED, retry with vatType 0
  if (e.message.includes("VAT_NOT_REGISTERED") || e.message.includes("Merverdiavgiftsregisteret")) {
    console.log("Company not VAT-registered, retrying with vatType 0...");
    payload.costs[0].vatType = { id: 0 };
    payload.costs[1].vatType = { id: 0 };
    expense = await post("/travelExpense", payload);
  } else {
    throw e;
  }
}

console.log("Created expense:", expense.id, "state:", expense.state);
console.log("Costs:", expense.costs?.length, "PerDiem:", expense.perDiemCompensations?.length);

// Deliver
console.log("Delivering...");
const delivered = await put(`/travelExpense/:deliver?id=${expense.id}`);
const d = delivered.values?.[0] || delivered.value;
console.log("Delivered expense:", d.id);
console.log("State:", d.state);
console.log("Title:", d.title);
console.log("Employee:", d.employee?.id);
console.log("Departure:", d.travelDetails?.departureDate, "→", d.travelDetails?.returnDate);
console.log("Destination:", d.travelDetails?.destination);
console.log("DepartureFrom:", d.travelDetails?.departureFrom);
console.log("isForeignTravel:", d.travelDetails?.isForeignTravel);
console.log("Costs count:", d.costs?.length);
console.log("PerDiem count:", d.perDiemCompensations?.length);
