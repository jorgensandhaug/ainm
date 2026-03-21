// Investigate: can we skip costCategory/paymentType lookups?
// Test 1: POST /travelExpense with costs that have no costCategory → see if API defaults
// Test 2: POST /travelExpense with costCategory by description instead of ID
// Test 3: Can we parallelize employee with costCat+payType to save latency?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("Error:", JSON.stringify(json, null, 2).substring(0, 500));
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // Get sandbox employee and cost categories first
  const empRes = await api("GET", "/employee?id=18478235&fields=*");
  const emp = empRes.data.values[0];
  console.log(`Employee: id=${emp.id}, companyId=${emp.companyId}`);

  // Get cost categories and payment types for reference
  const [catRes, ptRes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const travelCats = catRes.data.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  const payType = ptRes.data.values.filter((p: any) => p.showOnTravelExpenses)[0];
  console.log(`Fly: ${flyCat?.id}, Taxi: ${taxiCat?.id}, PayType: ${payType?.id}`);

  // Test 1: POST without costCategory on costs
  console.log("\n=== Test 1: POST without costCategory ===");
  const test1 = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Test no costCategory",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-17", returnDate: "2026-03-21",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom: "Oslo", destination: "Tromsø",
      purpose: "Test", detailedJourneyDescription: "Test"
    },
    costs: [{
      comments: "flight", amountCurrencyIncVat: 2600, amountNOKInclVAT: 2600,
      vatType: { id: 0 }, date: "2026-03-17",
      paymentType: { id: payType.id }
      // NO costCategory
    }],
    perDiemCompensations: [{
      location: "Tromsø", count: 5, rate: 800, amount: 4000,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL"
    }]
  });

  // Test 2: POST without paymentType on costs
  console.log("\n=== Test 2: POST without paymentType ===");
  const test2 = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Test no paymentType",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-17", returnDate: "2026-03-21",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom: "Oslo", destination: "Tromsø",
      purpose: "Test", detailedJourneyDescription: "Test"
    },
    costs: [{
      costCategory: { id: flyCat.id },
      comments: "flight", amountCurrencyIncVat: 2600, amountNOKInclVAT: 2600,
      vatType: { id: 0 }, date: "2026-03-17"
      // NO paymentType
    }],
    perDiemCompensations: [{
      location: "Tromsø", count: 5, rate: 800, amount: 4000,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL"
    }]
  });

  // If test 2 succeeded at POST, try to deliver it
  if (test2.ok) {
    console.log("\n=== Test 2b: Deliver the no-paymentType expense ===");
    const teId = test2.data.value.id;
    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${teId}`);
    if (deliverRes.ok) {
      console.log("DELIVERED without paymentType lookup! This saves 1 call.");
    }
  }

  // Test 3: POST with costs that have both no costCategory and no paymentType
  console.log("\n=== Test 3: POST without costCategory AND paymentType ===");
  const test3 = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Test no cat no pt",
    travelDetails: {
      isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
      departureDate: "2026-03-17", returnDate: "2026-03-21",
      departureTime: "08:00", returnTime: "18:00",
      departureFrom: "Oslo", destination: "Tromsø",
      purpose: "Test", detailedJourneyDescription: "Test"
    },
    costs: [{
      comments: "flight", amountCurrencyIncVat: 2600, amountNOKInclVAT: 2600,
      vatType: { id: 0 }, date: "2026-03-17"
    }],
    perDiemCompensations: [{
      location: "Tromsø", count: 5, rate: 800, amount: 4000,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL"
    }]
  });

  // If test 3 succeeded, try to deliver
  if (test3.ok) {
    console.log("\n=== Test 3b: Deliver the no-cat-no-pt expense ===");
    const teId = test3.data.value.id;
    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${teId}`);
    if (deliverRes.ok) {
      console.log("DELIVERED without costCategory AND paymentType lookups! This saves 2 calls.");
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
