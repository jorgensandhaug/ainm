// Investigate rateType IDs — are they account-specific or global?
// Also look at what rateType the system picks when we omit it.

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
  // Look up rateTypes for "Overnatting over 12 timer - innland" (rateCategory 740)
  // Use a paginated approach since the full list is too large
  console.log("=== Looking up rateType by rateCategory 740 ===");
  const rt740 = await get("/travelExpense/rate?rateCategoryId=740&count=10&fields=*,rateCategory(*)");
  if (rt740) {
    for (const r of rt740.values ?? []) {
      console.log(`  rateType ${r.id}: rate=${r.rate}, category=${r.rateCategory?.id}:${r.rateCategory?.name}, type=${r.type}`);
    }
  }

  // Also try rateCategory 11 (sandbox equivalent name)
  console.log("\n=== Looking up rateType by rateCategory 11 ===");
  const rt11 = await get("/travelExpense/rate?rateCategoryId=11&count=10&fields=*,rateCategory(*)");
  if (rt11) {
    for (const r of rt11.values ?? []) {
      console.log(`  rateType ${r.id}: rate=${r.rate}, category=${r.rateCategory?.id}:${r.rateCategory?.name}, type=${r.type}`);
    }
  }

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

  // Test: create WITHOUT rateType and WITHOUT count — let system auto-detect
  console.log("\n=== TEST: NO rateType, just location and overnightAccommodation ===");
  const payloadNoRT = {
    employee: { id: emp.id },
    title: "Test no rateType auto",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-06", returnDate: "2026-03-08",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom, destination: "Tromsø",
      detailedJourneyDescription: "test", purpose: "test",
    },
    perDiemCompensations: [{
      location: "Tromsø", count: 3,
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Fly", amountCurrencyIncVat: 3900, amountNOKInclVAT: 3900, vatType: { id: flyCat!.vatType?.id }, date: "2026-03-06" },
    ],
  };
  const resNoRT = await post("/travelExpense", payloadNoRT);
  if (resNoRT) {
    // Try to deliver — does it fail without rateType?
    const delNoRT = await put(`/travelExpense/:deliver?id=${resNoRT.value.id}`);
    console.log("Deliver without rateType:", delNoRT ? "SUCCESS" : "FAILED");
    if (delNoRT) {
      const rbNoRT = await get(`/travelExpense/${resNoRT.value.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*),travelDetails(*)`);
      const pd = rbNoRT!.value.perDiemCompensations?.[0];
      console.log("  rateType auto-assigned:", pd?.rateType?.id, "rateCat:", pd?.rateType?.rateCategory?.id, pd?.rateType?.rateCategory?.name);
      console.log("  rate:", pd?.rate, "amount:", pd?.amount, "count:", pd?.count);
    }
  }

  // Critical test: Create with rateCategory reference only (not rateType)
  console.log("\n=== TEST: rateCategory only (no rateType) ===");
  const payloadCatOnly = {
    employee: { id: emp.id },
    title: "Test rateCategory only",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-03", returnDate: "2026-03-05",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom, destination: "Tromsø",
      detailedJourneyDescription: "test", purpose: "test",
    },
    perDiemCompensations: [{
      location: "Tromsø", count: 3,
      rateCategory: { id: 740 },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      { costCategory: { id: flyCat!.id }, paymentType: { id: payType!.id }, comments: "Fly", amountCurrencyIncVat: 3900, amountNOKInclVAT: 3900, vatType: { id: flyCat!.vatType?.id }, date: "2026-03-03" },
    ],
  };
  const resCO = await post("/travelExpense", payloadCatOnly);
  if (resCO) {
    const rbCO = await get(`/travelExpense/${resCO.value.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*),travelDetails(*)`);
    const pd = rbCO!.value.perDiemCompensations?.[0];
    console.log("  rateType:", pd?.rateType?.id, "rateCat:", pd?.rateType?.rateCategory?.id, pd?.rateType?.rateCategory?.name);
    console.log("  rate:", pd?.rate, "amount:", pd?.amount, "count:", pd?.count);
    // Try deliver
    const delCO = await put(`/travelExpense/:deliver?id=${resCO.value.id}`);
    console.log("  Deliver:", delCO ? "SUCCESS" : "FAILED");
  }

  // Key hypothesis: maybe we should NOT set rateType at all and let the system pick
  // based on the travel dates and overnight status
  console.log("\n=== TEST: Completely bare perDiem — only location+count+overnight ===");
  console.log("(trying to see if system auto-assigns correct rateType on deliver)");

  console.log("\nDONE");
}

main().catch(e => { console.error(e); process.exit(1); });
