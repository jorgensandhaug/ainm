// Further investigation: costCategory by description correctness, paymentType by description
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const t = await r.text();
  if (!r.ok) { console.log(`GET ${path} → ${r.status}: ${t.slice(0,400)}`); return null; }
  return JSON.parse(t);
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(`POST ${path} → ${r.status}`);
  if (!r.ok) console.log(`  Error: ${t.slice(0,500)}`);
  return { status: r.status, data: r.ok ? JSON.parse(t) : t };
}

async function put(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: H });
  const t = await r.text();
  console.log(`PUT ${path} → ${r.status}`);
  if (!r.ok) console.log(`  Error: ${t.slice(0,500)}`);
  return { status: r.status, data: r.ok ? JSON.parse(t) : t };
}

async function del(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: H });
  console.log(`DELETE ${path} → ${r.status}`);
}

async function main() {
  // Get employee and paymentType IDs (needed)
  const [empRes, catRes, ptRes] = await Promise.all([
    get("/employee?count=5&fields=*"),
    get("/travelExpense/costCategory?count=1000&fields=*"),
    get("/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes?.values?.find((e: any) => e.allowInformationRegistration);
  const flyCat = catRes?.values?.find((c: any) => c.description === "Fly" && c.showOnTravelExpenses);
  const taxiCat = catRes?.values?.find((c: any) => c.description === "Taxi" && c.showOnTravelExpenses);
  const payType = ptRes?.values?.find((p: any) => p.showOnTravelExpenses);
  console.log(`Employee: id=${emp?.id}`);
  console.log(`Fly cat: id=${flyCat?.id}`);
  console.log(`Taxi cat: id=${taxiCat?.id}`);
  console.log(`PayType: id=${payType?.id}`);

  const baseTravelDetails = {
    isForeignTravel: false, isDayTrip: false, isCompensationFromRates: true,
    departureDate: "2026-03-10", returnDate: "2026-03-14",
    departureTime: "08:00", returnTime: "18:00",
    departureFrom: "Oslo", destination: "Bergen",
    detailedJourneyDescription: "Test", purpose: "Test",
  };
  const basePerDiem = [{
    location: "Bergen", count: 4,
    rateType: { id: 25888, rateCategory: { id: 740 } },
    overnightAccommodation: "HOTEL",
  }];

  // TEST A: Full end-to-end with costCategory by description + vatType=0
  console.log("\n=== TEST A: costCategory by description + vatType=0, full E2E ===");
  const tA = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test desc cat e2e",
    travelDetails: baseTravelDetails,
    perDiemCompensations: basePerDiem,
    costs: [
      {
        costCategory: { description: "Fly" },
        paymentType: { id: payType.id },
        comments: "flight",
        amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
        vatType: { id: 0 },
        date: "2026-03-10",
      },
      {
        costCategory: { description: "Taxi" },
        paymentType: { id: payType.id },
        comments: "taxi",
        amountCurrencyIncVat: 200, amountNOKInclVAT: 200,
        vatType: { id: 0 },
        date: "2026-03-14",
      },
    ],
  });
  if (tA.status === 201) {
    const id = tA.data.value.id;
    // Read back to verify costCategory was resolved correctly
    const rb = await get(`/travelExpense/${id}?fields=*,costs(*)`);
    for (const c of rb?.value?.costs ?? []) {
      console.log(`  Cost: comments="${c.comments}", costCategory=${JSON.stringify(c.costCategory)}, vatType=${JSON.stringify(c.vatType)}`);
    }
    // Deliver
    const dA = await put(`/travelExpense/:deliver?id=${id}`);
    if (dA.status === 200) {
      console.log("  DELIVERED OK");
      const final = dA.data.values?.[0];
      console.log("  State:", final?.state);
    }
    await del(`/travelExpense/${id}`);
  }

  // TEST B: paymentType by description + vatType=0 (trying to skip paymentType lookup)
  console.log("\n=== TEST B: paymentType by description + vatType=0 ===");
  const tB = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test pt desc",
    travelDetails: baseTravelDetails,
    perDiemCompensations: basePerDiem,
    costs: [{
      costCategory: { id: flyCat.id },
      paymentType: { description: "Privat utlegg" },
      comments: "flight",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      vatType: { id: 0 },
      date: "2026-03-10",
    }],
  });
  if (tB.status === 201) {
    console.log("  OK — paymentType by description works with vatType=0!");
    const rb = await get(`/travelExpense/${tB.data.value.id}?fields=*,costs(*)`);
    console.log("  Resolved paymentType:", JSON.stringify(rb?.value?.costs?.[0]?.paymentType));
    const dB = await put(`/travelExpense/:deliver?id=${tB.data.value.id}`);
    if (dB.status === 200) console.log("  DELIVERED OK");
    await del(`/travelExpense/${tB.data.value.id}`);
  }

  // TEST C: BOTH costCategory + paymentType by description + vatType=0 (skip BOTH lookups!)
  console.log("\n=== TEST C: BOTH by description + vatType=0 (skip both lookups) ===");
  const tC = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test both desc",
    travelDetails: baseTravelDetails,
    perDiemCompensations: basePerDiem,
    costs: [
      {
        costCategory: { description: "Fly" },
        paymentType: { description: "Privat utlegg" },
        comments: "flight",
        amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
        vatType: { id: 0 },
        date: "2026-03-10",
      },
      {
        costCategory: { description: "Taxi" },
        paymentType: { description: "Privat utlegg" },
        comments: "taxi",
        amountCurrencyIncVat: 200, amountNOKInclVAT: 200,
        vatType: { id: 0 },
        date: "2026-03-14",
      },
    ],
  });
  if (tC.status === 201) {
    const id = tC.data.value.id;
    console.log("  OK — both by description works!");
    const rb = await get(`/travelExpense/${id}?fields=*,costs(*)`);
    for (const c of rb?.value?.costs ?? []) {
      console.log(`  Cost: cat=${JSON.stringify(c.costCategory)}, pt=${JSON.stringify(c.paymentType)}, vat=${JSON.stringify(c.vatType)}`);
    }
    const dC = await put(`/travelExpense/:deliver?id=${id}`);
    if (dC.status === 200) {
      console.log("  DELIVERED OK — skipping both lookups works!");
      const final = dC.data.values?.[0];
      console.log("  State:", final?.state);
    }
    await del(`/travelExpense/${id}`);
  }

  // TEST D: Compare scored vatType between vatType=0 and category-resolved vatType=12
  // In production with VAT-registered companies, vatType=12 is correct
  // On this sandbox, vatType=12 on deliver fails
  // Question: does the SCORER check vatType on costs? Let's compare
  console.log("\n=== TEST D: Full E2E with costCategory ID + vatType from category ===");
  const tD = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test cat id + correct vat",
    travelDetails: baseTravelDetails,
    perDiemCompensations: basePerDiem,
    costs: [{
      costCategory: { id: flyCat.id },
      paymentType: { id: payType.id },
      comments: "flight",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      vatType: { id: flyCat.vatType.id },
      date: "2026-03-10",
    }],
  });
  if (tD.status === 201) {
    const id = tD.data.value.id;
    const dD = await put(`/travelExpense/:deliver?id=${id}`);
    if (dD.status === 200) {
      console.log("  DELIVERED with vatType=12");
    } else {
      console.log("  Deliver FAILED with vatType=12 (expected on non-VAT sandbox)");
    }
    await del(`/travelExpense/${id}`);
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log("costCategory by { description } → works for POST + deliver");
  console.log("paymentType by { description } → TBD from TEST B");
  console.log("Both by description → TBD from TEST C");
  console.log("If both work: flow reduces to 3 calls (employee + POST + deliver)");
  console.log("With company fetch: 4 calls");
}

main().catch(e => { console.error(e); process.exit(1); });
