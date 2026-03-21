// Sandbox investigation: verify which fields are newly required
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers: H });
  if (!r.ok) { const t = await r.text(); console.error(`GET ${url} ${r.status}: ${t}`); return null; }
  return r.json();
}

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(`POST ${r.status}: ${t.substring(0, 500)}`);
  return { ok: r.ok, status: r.status, body: r.ok ? JSON.parse(t) : t };
}

async function put(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method: "PUT", headers: H });
  const t = await r.text();
  console.log(`PUT ${r.status}: ${t.substring(0, 500)}`);
  return { ok: r.ok, status: r.status, body: r.ok ? JSON.parse(t) : t };
}

async function main() {
  // Use known sandbox employee
  const empId = 18478235;
  const companyId = 108114337;

  // Get cost categories and payment types
  const [costCatRes, payTypeRes] = await Promise.all([
    get("travelExpense/costCategory?count=1000&fields=*"),
    get("travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const cats = (costCatRes?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => /^Fly$/i.test(c.description));
  const taxiCat = cats.find((c: any) => /^Taxi$/i.test(c.description));
  console.log("Fly cat:", flyCat?.id, flyCat?.description);
  console.log("Taxi cat:", taxiCat?.id, taxiCat?.description);

  const payTypes = (payTypeRes?.values || []).filter((p: any) => p.showOnTravelExpenses);
  const payType = payTypes[0];
  console.log("Payment type:", payType?.id, payType?.description);

  // Test 1: POST without destination and without location (old behavior)
  console.log("\n=== Test 1: Without destination, without location ===");
  const res1 = await post("travelExpense", {
    employee: { id: empId },
    title: "Test without destination and location",
    travelDetails: {
      departureDate: "2026-03-18",
      returnDate: "2026-03-21",
      departureFrom: "Oslo",
      purpose: "Test",
      isDayTrip: false,
      isCompensationFromRates: true,
    },
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        amountCurrencyIncVat: 1000,
        amountNOKInclVAT: 1000,
        vatType: { id: 0 },
        date: "2026-03-18",
        comments: "Flight",
      },
    ],
    perDiemCompensations: [
      {
        count: 3,
        rate: 800,
        amount: 2400,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
  });

  // Test 2: POST with destination but without location
  console.log("\n=== Test 2: With destination, without location ===");
  const res2 = await post("travelExpense", {
    employee: { id: empId },
    title: "Test with destination no location",
    travelDetails: {
      departureDate: "2026-03-18",
      returnDate: "2026-03-21",
      departureFrom: "Oslo",
      destination: "Trondheim",
      purpose: "Test",
      isDayTrip: false,
      isCompensationFromRates: true,
    },
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        amountCurrencyIncVat: 1000,
        amountNOKInclVAT: 1000,
        vatType: { id: 0 },
        date: "2026-03-18",
        comments: "Flight",
      },
    ],
    perDiemCompensations: [
      {
        count: 3,
        rate: 800,
        amount: 2400,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
  });

  // Test 3: POST with both destination and location
  console.log("\n=== Test 3: With destination and location ===");
  const res3 = await post("travelExpense", {
    employee: { id: empId },
    title: "Test with destination and location",
    travelDetails: {
      departureDate: "2026-03-18",
      returnDate: "2026-03-21",
      departureFrom: "Oslo",
      destination: "Trondheim",
      purpose: "Test",
      isDayTrip: false,
      isCompensationFromRates: true,
    },
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        amountCurrencyIncVat: 1000,
        amountNOKInclVAT: 1000,
        vatType: { id: 0 },
        date: "2026-03-18",
        comments: "Flight",
      },
    ],
    perDiemCompensations: [
      {
        count: 3,
        rate: 800,
        amount: 2400,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
        location: "Trondheim",
      },
    ],
  });

  // If test 3 succeeds, try to deliver it
  if (res3.ok) {
    const teId = res3.body.value.id;
    console.log("\n=== Test 3 deliver ===");
    const delRes3 = await put(`travelExpense/:deliver?id=${teId}`);
    if (delRes3.ok) {
      const d = delRes3.body.values?.[0];
      console.log("Delivered:", d?.id, "state:", d?.state);
    }
  }

  // If test 1 succeeded, try to deliver it
  if (res1.ok) {
    const teId = res1.body.value.id;
    console.log("\n=== Test 1 deliver (no destination) ===");
    const delRes1 = await put(`travelExpense/:deliver?id=${teId}`);
    if (delRes1.ok) {
      const d = delRes1.body.values?.[0];
      console.log("Delivered:", d?.id, "state:", d?.state);
    }
  }

  // If test 2 succeeded, try to deliver it
  if (res2.ok) {
    const teId = res2.body.value.id;
    console.log("\n=== Test 2 deliver (destination but no location) ===");
    const delRes2 = await put(`travelExpense/:deliver?id=${teId}`);
    if (delRes2.ok) {
      const d = delRes2.body.values?.[0];
      console.log("Delivered:", d?.id, "state:", d?.state);
    }
  }

  console.log("\nDone.");
}

main().catch(e => console.error(e));
