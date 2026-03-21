const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "miu7IYTQJKOdvSr1bR51a4fj26UOsr2954u_sR7OuXc";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers });
  const body = await r.json();
  console.log(`  status=${r.status}`);
  if (!r.ok) {
    console.log(`  error: ${JSON.stringify(body)}`);
    throw new Error(`GET ${path} failed: ${r.status}`);
  }
  return body;
}

async function post(path: string, payload: any): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const body = await r.json();
  console.log(`  status=${r.status}`);
  if (!r.ok) {
    console.log(`  error: ${JSON.stringify(body)}`);
    throw new Error(`POST ${path} failed: ${r.status}`);
  }
  return body;
}

async function put(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`PUT ${url}`);
  const r = await fetch(url, { method: "PUT", headers });
  const body = await r.json();
  console.log(`  status=${r.status}`);
  if (!r.ok) {
    console.log(`  error: ${JSON.stringify(body)}`);
    throw new Error(`PUT ${path} failed: ${r.status}`);
  }
  return body;
}

// Step 1: Find employee
const empResp = await get("/employee?email=pablo.sanchez@example.org&count=10&fields=*");
const employees = empResp.values;
if (!employees || employees.length === 0) throw new Error("Employee not found");

let emp = employees[0];
if (employees.length > 1) {
  const allowed = employees.filter((e: any) => e.allowInformationRegistration);
  if (allowed.length > 0) emp = allowed[0];
}
console.log(`  employee id=${emp.id}, address=${JSON.stringify(emp.address)}, companyId=${emp.companyId}`);

// Step 2: Resolve departureFrom
let departureFrom: string | null = null;
if (emp.address) {
  departureFrom = emp.address.city || emp.address.addressLine1 || emp.address.displayName || null;
}
if (!departureFrom && emp.companyId) {
  const compResp = await get(`/company/${emp.companyId}?fields=*,address(*)`);
  const comp = compResp.value;
  if (comp?.address) {
    departureFrom = comp.address.city || comp.address.addressLine1 || comp.address.displayName || comp.address.addressAsString || null;
  }
  console.log(`  company address fallback: departureFrom=${departureFrom}`);
}
if (!departureFrom) throw new Error("Cannot resolve departureFrom — blocked");

const departureDate = "2026-03-19";
const returnDate = "2026-03-21";

// Step 3: Parallel lookups
const [catResp, ptResp, rateResp] = await Promise.all([
  get("/travelExpense/costCategory?count=1000&fields=*"),
  get("/travelExpense/paymentType?count=1000&fields=*"),
  get(`/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=${departureDate}&dateTo=${returnDate}&count=1000&fields=*`),
]);

// Resolve cost categories
const allCats = catResp.values.filter((c: any) => c.showOnTravelExpenses);
const flyCat = allCats.find((c: any) => c.description === "Fly");
const taxiCat = allCats.find((c: any) => c.description === "Taxi");
if (!flyCat) throw new Error("Fly cost category not found");
if (!taxiCat) throw new Error("Taxi cost category not found");
console.log(`  Fly category id=${flyCat.id}, Taxi category id=${taxiCat.id}`);

// Resolve payment type
const activePts = ptResp.values.filter((p: any) => p.showOnTravelExpenses);
const paymentType = activePts[0];
if (!paymentType) throw new Error("No active travel payment type found");
console.log(`  paymentType id=${paymentType.id}, description=${paymentType.description}`);

// Resolve per-diem rate type — inspect structure
const rateValues = rateResp.values;
console.log(`  rate values count=${rateValues?.length}`);
if (rateValues?.length > 0) {
  console.log(`  first rate value keys: ${Object.keys(rateValues[0]).join(", ")}`);
  console.log(`  first rate value: ${JSON.stringify(rateValues[0])}`);
}
if (!rateValues || rateValues.length === 0) throw new Error("No per-diem rate types found");

// The rate response values have rateType and rateCategory as properties
// Pick a rate whose rateType.rate matches 800, else use first
let chosenRate = rateValues.find((r: any) => r.rate === 800);
if (!chosenRate) chosenRate = rateValues[0];

// Build the rateType object for the perDiemCompensation
// Need to include rateCategory and zone from the rate response
const rateTypeObj: any = {};
if (chosenRate.rateType) {
  rateTypeObj.id = chosenRate.rateType.id;
} else if (chosenRate.id) {
  rateTypeObj.id = chosenRate.id;
}
if (chosenRate.rateCategory) {
  rateTypeObj.rateCategory = { id: chosenRate.rateCategory.id };
}
if (chosenRate.zone) {
  rateTypeObj.zone = { id: chosenRate.zone.id };
}

console.log(`  chosen rateType: ${JSON.stringify(rateTypeObj)}`);

// Step 4: POST /travelExpense
const payload = {
  employee: { id: emp.id },
  title: "Conferencia Drammen",
  travelDetails: {
    isForeignTravel: false,
    isDayTrip: false,
    isCompensationFromRates: true,
    departureDate,
    returnDate,
    departureTime: "08:00",
    returnTime: "18:00",
    departureFrom,
    destination: "Drammen",
    detailedJourneyDescription: "Conferencia Drammen",
    purpose: "Conferencia Drammen",
  },
  perDiemCompensations: [
    {
      location: "Drammen",
      count: 3,
      rate: 800,
      amount: 2400,
      rateType: rateTypeObj,
      overnightAccommodation: "HOTEL",
    },
  ],
  costs: [
    {
      costCategory: { id: flyCat.id },
      paymentType: { id: paymentType.id },
      comments: "billete de avión",
      amountCurrencyIncVat: 7050,
      amountNOKInclVAT: 7050,
      vatType: { id: 0 },
      date: departureDate,
    },
    {
      costCategory: { id: taxiCat.id },
      paymentType: { id: paymentType.id },
      comments: "taxi",
      amountCurrencyIncVat: 550,
      amountNOKInclVAT: 550,
      vatType: { id: 0 },
      date: returnDate,
    },
  ],
};

const createResp = await post("/travelExpense", payload);
const expenseId = createResp.value?.id;
console.log(`  created expense id=${expenseId}, state=${createResp.value?.state}`);
console.log(`  costs count=${createResp.value?.costs?.length}`);
console.log(`  perDiemCompensations count=${createResp.value?.perDiemCompensations?.length}`);

// Step 5: PUT /travelExpense/:deliver
const deliverResp = await put(`/travelExpense/:deliver?id=${expenseId}`);
const delivered = deliverResp.values?.[0] || deliverResp.value;
console.log(`\n=== DELIVERED ===`);
console.log(`  id=${delivered?.id}`);
console.log(`  title=${delivered?.title}`);
console.log(`  state=${delivered?.state}`);
console.log(`  employee.id=${delivered?.employee?.id}`);
console.log(`  departureDate=${delivered?.travelDetails?.departureDate}`);
console.log(`  returnDate=${delivered?.travelDetails?.returnDate}`);
console.log(`  destination=${delivered?.travelDetails?.destination}`);
console.log(`  departureFrom=${delivered?.travelDetails?.departureFrom}`);
console.log(`  costs count=${delivered?.costs?.length}`);
console.log(`  perDiemCompensations count=${delivered?.perDiemCompensations?.length}`);
