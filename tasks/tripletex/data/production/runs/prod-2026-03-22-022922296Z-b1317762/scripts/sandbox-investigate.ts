// Sandbox investigation: can we reduce API calls?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const t = await r.text();
  if (!r.ok) console.log(`GET ${path} → ${r.status}: ${t}`);
  else return JSON.parse(t);
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(`POST ${path} → ${r.status}`);
  if (!r.ok) console.log(`  Error: ${t}`);
  return { status: r.status, data: r.ok ? JSON.parse(t) : t };
}

async function del(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: H });
  console.log(`DELETE ${path} → ${r.status}`);
}

async function main() {
  // First, get the lookup data we need
  const [empRes, catRes, ptRes] = await Promise.all([
    get("/employee?email=ricardo.romero@example.org&count=10&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes?.values?.[0];
  console.log(`Employee: id=${emp?.id}, address=${JSON.stringify(emp?.address)}`);

  const categories = catRes?.values?.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = categories?.find((c: any) => c.description === "Fly");
  const taxiCat = categories?.find((c: any) => c.description === "Taxi");
  console.log(`Fly: id=${flyCat?.id}, vatType=${JSON.stringify(flyCat?.vatType)}`);
  console.log(`Taxi: id=${taxiCat?.id}, vatType=${JSON.stringify(taxiCat?.vatType)}`);

  const payTypes = ptRes?.values?.filter((p: any) => p.showOnTravelExpenses);
  console.log(`PaymentTypes:`, payTypes?.map((p: any) => `id=${p.id} desc="${p.description}"`));

  // TEST 1: Can we POST without paymentType on costs?
  console.log("\n--- TEST 1: POST without paymentType ---");
  const t1 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test no payType",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-10", returnDate: "2026-03-14",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom: "Oslo", destination: "Bergen",
      detailedJourneyDescription: "Test", purpose: "Test",
    },
    perDiemCompensations: [{
      location: "Bergen", count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [{
      costCategory: { id: flyCat.id },
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      vatType: { id: flyCat.vatType.id },
      date: "2026-03-10",
    }],
  });
  if (t1.status === 201) {
    console.log("  SUCCESS — paymentType is optional!");
    console.log("  Created id:", t1.data.value.id);
    // Check what paymentType was assigned
    const readback = await get(`/travelExpense/${t1.data.value.id}?fields=*,costs(*)`);
    console.log("  Cost paymentType:", JSON.stringify(readback?.value?.costs?.[0]?.paymentType));
    await del(`/travelExpense/${t1.data.value.id}`);
  }

  // TEST 2: Can we POST with employee+costCategory+paymentType combined in one GET?
  // Actually, let's test: can we skip costCategory lookup by hardcoding common IDs?
  // No — IDs are account-specific. But can we check if vatType=0 always works?
  console.log("\n--- TEST 2: POST with vatType=0 directly (skip category lookup for vatType) ---");
  const t2 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test vatType 0",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-10", returnDate: "2026-03-14",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom: "Oslo", destination: "Bergen",
      detailedJourneyDescription: "Test", purpose: "Test",
    },
    perDiemCompensations: [{
      location: "Bergen", count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [{
      costCategory: { id: flyCat.id },
      paymentType: { id: payTypes[0].id },
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      vatType: { id: 0 },
      date: "2026-03-10",
    }],
  });
  if (t2.status === 201) {
    console.log("  SUCCESS — vatType 0 works");
    await del(`/travelExpense/${t2.data.value.id}`);
  }

  // TEST 3: Can we combine employee + costCategory in one call?
  // No direct way. But can we use GET /employee with fields that include travelExpense info? No.

  // TEST 4: Can we skip costCategory entirely and use description-based matching?
  console.log("\n--- TEST 3: POST with costCategory by description (no ID) ---");
  const t3 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test cat by desc",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-10", returnDate: "2026-03-14",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom: "Oslo", destination: "Bergen",
      detailedJourneyDescription: "Test", purpose: "Test",
    },
    perDiemCompensations: [{
      location: "Bergen", count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [{
      costCategory: { description: "Fly" },
      paymentType: { id: payTypes[0].id },
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      vatType: { id: 0 },
      date: "2026-03-10",
    }],
  });
  if (t3.status === 201) {
    console.log("  SUCCESS — costCategory by description works!");
    await del(`/travelExpense/${t3.data.value.id}`);
  }

  // TEST 5: Can we POST without vatType entirely?
  console.log("\n--- TEST 4: POST without vatType on costs ---");
  const t4 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test no vatType",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-10", returnDate: "2026-03-14",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom: "Oslo", destination: "Bergen",
      detailedJourneyDescription: "Test", purpose: "Test",
    },
    perDiemCompensations: [{
      location: "Bergen", count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [{
      costCategory: { id: flyCat.id },
      paymentType: { id: payTypes[0].id },
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      date: "2026-03-10",
    }],
  });
  if (t4.status === 201) {
    console.log("  SUCCESS — vatType is optional, system fills default!");
    const readback = await get(`/travelExpense/${t4.data.value.id}?fields=*,costs(*)`);
    console.log("  Cost vatType:", JSON.stringify(readback?.value?.costs?.[0]?.vatType));
    await del(`/travelExpense/${t4.data.value.id}`);
  }

  // TEST 6: Can we combine employee + costCategory + paymentType queries?
  console.log("\n--- TEST 5: Check if costCategory and paymentType can be queried together ---");
  // No single endpoint does this. But the question is: can we skip one of these lookups?
  // If paymentType is optional (TEST 1) AND vatType is optional (TEST 4), we only need
  // costCategory for the ID (not for vatType). But we still need costCategory ID...
  // Unless we can use description-based matching (TEST 3).

  // TEST 7: Can we POST without costCategory entirely?
  console.log("\n--- TEST 6: POST without costCategory (just comments) ---");
  const t6 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test no costCat",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-10", returnDate: "2026-03-14",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom: "Oslo", destination: "Bergen",
      detailedJourneyDescription: "Test", purpose: "Test",
    },
    perDiemCompensations: [{
      location: "Bergen", count: 4,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [{
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      date: "2026-03-10",
    }],
  });
  if (t6.status === 201) {
    console.log("  SUCCESS — costCategory is optional!");
    await del(`/travelExpense/${t6.data.value.id}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
