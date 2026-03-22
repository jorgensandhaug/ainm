// Deep investigation: test different per-diem configurations to find what
// changes checks 2, 3, 6.
// Hypotheses:
// A) count=2 (overnights for 3-day trip)
// B) overnightAccommodation="NONE" or other values
// C) rate=800 is actually stored differently
// D) isDayTrip matters somehow

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

async function main() {
  // Get lookups
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

  // Test: does setting rate=800 actually store 800 or does system override?
  console.log("=== TEST A: Explicit rate=800 ===");
  const payloadA = {
    employee: { id: emp.id },
    title: "Test explicit rate 800",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-10", returnDate: "2026-03-12",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom, destination: "Bergen",
      detailedJourneyDescription: "test", purpose: "test",
    },
    perDiemCompensations: [{
      location: "Bergen", count: 3, rate: 800,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Fly", amountCurrencyIncVat: 3900, amountNOKInclVAT: 3900, vatType: { id: flyCat!.vatType?.id }, date: "2026-03-10" },
      { costCategory: { id: taxiCat!.id }, paymentType: { id: payType!.id }, comments: "Taxi", amountCurrencyIncVat: 350, amountNOKInclVAT: 350, vatType: { id: taxiCat!.vatType?.id }, date: "2026-03-12" },
    ],
  };
  const resA = await post("/travelExpense", payloadA);
  if (resA) {
    const rbA = await get(`/travelExpense/${resA.value.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*),travelDetails(*)`);
    const pd = rbA!.value.perDiemCompensations?.[0];
    console.log("  rate:", pd?.rate, "amount:", pd?.amount, "count:", pd?.count, "total:", rbA!.value.amount);
  }

  // Test B: count=2 (overnights)
  console.log("\n=== TEST B: count=2 (overnights) ===");
  const payloadB = { ...payloadA, title: "Test count 2" };
  payloadB.perDiemCompensations = [{
    location: "Bergen", count: 2,
    rateType: { id: 25888, rateCategory: { id: 740 } },
    overnightAccommodation: "HOTEL",
  }];
  const resB = await post("/travelExpense", payloadB);
  if (resB) {
    const rbB = await get(`/travelExpense/${resB.value.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*),travelDetails(*)`);
    const pd = rbB!.value.perDiemCompensations?.[0];
    console.log("  rate:", pd?.rate, "amount:", pd?.amount, "count:", pd?.count, "total:", rbB!.value.amount);
  }

  // Test C: overnightAccommodation variations
  console.log("\n=== TEST C: overnightAccommodation=NONE ===");
  const payloadC = { ...payloadA, title: "Test overnight NONE" };
  payloadC.perDiemCompensations = [{
    location: "Bergen", count: 3,
    rateType: { id: 25888, rateCategory: { id: 740 } },
    overnightAccommodation: "NONE",
  }];
  const resC = await post("/travelExpense", payloadC);
  if (resC) {
    const rbC = await get(`/travelExpense/${resC.value.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*),travelDetails(*)`);
    const pd = rbC!.value.perDiemCompensations?.[0];
    console.log("  rate:", pd?.rate, "amount:", pd?.amount, "count:", pd?.count, "total:", rbC!.value.amount);
  }

  // Test D: What overnightAccommodation values are valid?
  console.log("\n=== TEST D: overnightAccommodation=BOARDING_HOUSE_WITHOUT_COOKING ===");
  const payloadD = { ...payloadA, title: "Test overnight BOARDING" };
  payloadD.perDiemCompensations = [{
    location: "Bergen", count: 3,
    rateType: { id: 25888, rateCategory: { id: 740 } },
    overnightAccommodation: "BOARDING_HOUSE_WITHOUT_COOKING",
  }];
  const resD = await post("/travelExpense", payloadD);
  if (resD) {
    const rbD = await get(`/travelExpense/${resD.value.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*),travelDetails(*)`);
    const pd = rbD!.value.perDiemCompensations?.[0];
    console.log("  rate:", pd?.rate, "amount:", pd?.amount, "count:", pd?.count, "total:", rbD!.value.amount);
  }

  // Test E: rate=800 count=2
  console.log("\n=== TEST E: rate=800 count=2 ===");
  const payloadE = { ...payloadA, title: "Test rate800 count2" };
  payloadE.perDiemCompensations = [{
    location: "Bergen", count: 2, rate: 800,
    rateType: { id: 25888, rateCategory: { id: 740 } },
    overnightAccommodation: "HOTEL",
  }];
  const resE = await post("/travelExpense", payloadE);
  if (resE) {
    const rbE = await get(`/travelExpense/${resE.value.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*),travelDetails(*)`);
    const pd = rbE!.value.perDiemCompensations?.[0];
    console.log("  rate:", pd?.rate, "amount:", pd?.amount, "count:", pd?.count, "total:", rbE!.value.amount);
  }

  // Test F: NO rateType (let system pick)
  console.log("\n=== TEST F: no rateType ===");
  const payloadF = { ...payloadA, title: "Test no rateType" };
  payloadF.perDiemCompensations = [{
    location: "Bergen", count: 3,
    overnightAccommodation: "HOTEL",
  }];
  const resF = await post("/travelExpense", payloadF);
  if (resF) {
    const rbF = await get(`/travelExpense/${resF.value.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*),travelDetails(*)`);
    const pd = rbF!.value.perDiemCompensations?.[0];
    console.log("  rate:", pd?.rate, "amount:", pd?.amount, "count:", pd?.count, "rateType:", pd?.rateType?.id, "total:", rbF!.value.amount);
  }

  // Test G: Look at available rateTypes and their rates
  console.log("\n=== Available rate types ===");
  const rateRes = await get("/travelExpense/rate?count=100&fields=*,rateCategory(*)");
  if (rateRes) {
    for (const r of rateRes.values ?? []) {
      console.log(`  rateType ${r.id}: rate=${r.rate}, category=${r.rateCategory?.id}:${r.rateCategory?.name}, type=${r.type}`);
    }
  }

  // Test H: What rateCategories exist?
  console.log("\n=== Rate categories ===");
  const rcRes = await get("/travelExpense/rateCategory?count=100&fields=*");
  if (rcRes) {
    for (const rc of rcRes.values ?? []) {
      console.log(`  rateCategory ${rc.id}: ${rc.name}, type=${rc.type}, ameldingWageCode=${rc.ameldingWageCode}`);
    }
  }

  console.log("\nDONE");
}

main().catch(e => { console.error(e); process.exit(1); });
