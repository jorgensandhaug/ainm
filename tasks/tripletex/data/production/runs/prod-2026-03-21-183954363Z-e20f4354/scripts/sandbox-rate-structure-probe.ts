// Sandbox probe: verify the exact structure of /travelExpense/rate response
// and confirm the correct way to map it to perDiemCompensations[].rateType

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers });
  const body = await r.json();
  console.log(`  status=${r.status}`);
  if (!r.ok) { console.log(`  error: ${JSON.stringify(body)}`); throw new Error(`GET failed: ${r.status}`); }
  return body;
}

// 1. Get rate response and inspect structure
const rateResp = await get("/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-19&dateTo=2026-03-21&count=1000&fields=*");
console.log(`\n=== RATE RESPONSE STRUCTURE ===`);
console.log(`count=${rateResp.count}`);
for (const val of rateResp.values) {
  console.log(`\n  Rate object:`);
  console.log(`    id=${val.id}`);
  console.log(`    rate=${val.rate}`);
  console.log(`    rateCategory=${JSON.stringify(val.rateCategory)}`);
  console.log(`    zone=${JSON.stringify(val.zone)}`);
  console.log(`    all keys: ${Object.keys(val).join(", ")}`);
}

// 2. Now do a full travel expense create+deliver to verify the correct rateType mapping
const empResp = await get("/employee?email=test1@example.org&count=10&fields=*");
if (!empResp.values?.length) {
  // Fall back to a known sandbox employee
  console.log("\nNo test1 employee, using known sandbox employee 18478235");
}
const empId = empResp.values?.length ? empResp.values[0].id : 18478235;

// Get cost categories and payment types
const [catResp, ptResp] = await Promise.all([
  get("/travelExpense/costCategory?count=1000&fields=*"),
  get("/travelExpense/paymentType?count=1000&fields=*"),
]);

const allCats = catResp.values.filter((c: any) => c.showOnTravelExpenses);
const flyCat = allCats.find((c: any) => c.description === "Fly");
const taxiCat = allCats.find((c: any) => c.description === "Taxi");
const activePts = ptResp.values.filter((p: any) => p.showOnTravelExpenses);
const paymentType = activePts[0];

console.log(`\n=== RESOLVED LOOKUPS ===`);
console.log(`  flyCat=${flyCat?.id}, taxiCat=${taxiCat?.id}, paymentType=${paymentType?.id}`);

// 3. Map rate response to perDiemCompensations[].rateType
// The rate response values ARE the rate type objects.
// perDiemCompensations[].rateType needs: { id: rate.id, rateCategory: { id: rate.rateCategory.id } }
const chosenRate = rateResp.values[0];

console.log(`\n=== RATE TYPE MAPPING ===`);
console.log(`  Rate value id: ${chosenRate.id}`);
console.log(`  Rate value rateCategory.id: ${chosenRate.rateCategory?.id}`);
console.log(`  Maps to perDiemCompensations[].rateType: { id: ${chosenRate.id}, rateCategory: { id: ${chosenRate.rateCategory?.id} } }`);

// 4. Create and deliver a test expense
const payload = {
  employee: { id: empId },
  title: "Sandbox rate structure test",
  travelDetails: {
    isForeignTravel: false,
    isDayTrip: false,
    isCompensationFromRates: true,
    departureDate: "2026-03-19",
    returnDate: "2026-03-21",
    departureTime: "08:00",
    returnTime: "18:00",
    departureFrom: "Oslo",
    destination: "Drammen",
    detailedJourneyDescription: "Sandbox rate structure test",
    purpose: "Sandbox rate structure test",
  },
  perDiemCompensations: [
    {
      location: "Drammen",
      count: 3,
      rate: 800,
      amount: 2400,
      rateType: { id: chosenRate.id, rateCategory: { id: chosenRate.rateCategory?.id } },
      overnightAccommodation: "HOTEL",
    },
  ],
  costs: [
    {
      costCategory: { id: flyCat.id },
      paymentType: { id: paymentType.id },
      comments: "flight",
      amountCurrencyIncVat: 7050,
      amountNOKInclVAT: 7050,
      vatType: { id: 0 },
      date: "2026-03-19",
    },
    {
      costCategory: { id: taxiCat.id },
      paymentType: { id: paymentType.id },
      comments: "taxi",
      amountCurrencyIncVat: 550,
      amountNOKInclVAT: 550,
      vatType: { id: 0 },
      date: "2026-03-21",
    },
  ],
};

console.log(`\nPOST /travelExpense`);
const postR = await fetch(`${BASE}/travelExpense`, { method: "POST", headers, body: JSON.stringify(payload) });
const postBody = await postR.json();
console.log(`  status=${postR.status}`);
if (!postR.ok) {
  console.log(`  error: ${JSON.stringify(postBody)}`);
} else {
  const expId = postBody.value?.id;
  console.log(`  created id=${expId}, state=${postBody.value?.state}`);
  console.log(`  costs=${postBody.value?.costs?.length}, perDiems=${postBody.value?.perDiemCompensations?.length}`);

  // Deliver
  console.log(`\nPUT /travelExpense/:deliver?id=${expId}`);
  const delivR = await fetch(`${BASE}/travelExpense/:deliver?id=${expId}`, { method: "PUT", headers });
  const delivBody = await delivR.json();
  console.log(`  status=${delivR.status}`);
  if (!delivR.ok) {
    console.log(`  error: ${JSON.stringify(delivBody)}`);
  } else {
    const del = delivBody.values?.[0];
    console.log(`  DELIVERED id=${del?.id}, state=${del?.state}`);
    console.log(`  costs=${del?.costs?.length}, perDiems=${del?.perDiemCompensations?.length}`);
  }
}
