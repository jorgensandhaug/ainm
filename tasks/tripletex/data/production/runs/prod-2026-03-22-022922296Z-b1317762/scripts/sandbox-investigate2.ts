// Sandbox investigation: can we reduce API calls for travel expense?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const t = await r.text();
  if (!r.ok) { console.log(`GET ${path} → ${r.status}: ${t.slice(0,300)}`); return null; }
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
  // Get any employee from sandbox
  const empRes = await get("/employee?count=5&fields=*");
  const emp = empRes?.values?.find((e: any) => e.allowInformationRegistration);
  if (!emp) { console.log("No employee found"); return; }
  console.log(`Employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}, address=${JSON.stringify(emp.address)}`);

  const catRes = await get("/travelExpense/costCategory?count=1000&fields=*");
  const ptRes = await get("/travelExpense/paymentType?count=1000&fields=*");

  const categories = catRes?.values?.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = categories?.find((c: any) => c.description === "Fly");
  const taxiCat = categories?.find((c: any) => c.description === "Taxi");
  console.log(`Fly: id=${flyCat?.id}, vatType.id=${flyCat?.vatType?.id}`);
  console.log(`Taxi: id=${taxiCat?.id}, vatType.id=${taxiCat?.vatType?.id}`);

  const payTypes = ptRes?.values?.filter((p: any) => p.showOnTravelExpenses);
  const payType = payTypes?.[0];
  console.log(`PaymentType: id=${payType?.id}, desc=${payType?.description}`);

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

  // TEST 1: POST without paymentType on costs
  console.log("\n=== TEST 1: POST without paymentType ===");
  const t1 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test no payType",
    travelDetails: baseTravelDetails,
    perDiemCompensations: basePerDiem,
    costs: [{
      costCategory: { id: flyCat.id },
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      vatType: { id: flyCat.vatType.id },
      date: "2026-03-10",
    }],
  });
  if (t1.status === 201) {
    console.log("  OK — paymentType is optional");
    // Check what paymentType was assigned
    const rb = await get(`/travelExpense/${t1.data.value.id}?fields=*,costs(*)`);
    console.log("  Auto-assigned paymentType:", JSON.stringify(rb?.value?.costs?.[0]?.paymentType));
    // Try to deliver
    const d1 = await put(`/travelExpense/:deliver?id=${t1.data.value.id}`);
    if (d1.status === 200) {
      console.log("  DELIVERED OK without paymentType!");
      const final = d1.data.values?.[0] ?? d1.data.value;
      console.log("  State:", final?.state);
    }
    await del(`/travelExpense/${t1.data.value.id}`);
  }

  // TEST 2: POST without vatType on costs
  console.log("\n=== TEST 2: POST without vatType ===");
  const t2 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test no vatType",
    travelDetails: baseTravelDetails,
    perDiemCompensations: basePerDiem,
    costs: [{
      costCategory: { id: flyCat.id },
      paymentType: { id: payType.id },
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      date: "2026-03-10",
    }],
  });
  if (t2.status === 201) {
    console.log("  OK — vatType is optional");
    const rb = await get(`/travelExpense/${t2.data.value.id}?fields=*,costs(*)`);
    console.log("  Auto-assigned vatType:", JSON.stringify(rb?.value?.costs?.[0]?.vatType));
    const d2 = await put(`/travelExpense/:deliver?id=${t2.data.value.id}`);
    if (d2.status === 200) console.log("  DELIVERED OK without vatType!");
    await del(`/travelExpense/${t2.data.value.id}`);
  }

  // TEST 3: POST with vatType=0 (no VAT)
  console.log("\n=== TEST 3: POST with vatType=0 ===");
  const t3 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test vatType 0",
    travelDetails: baseTravelDetails,
    perDiemCompensations: basePerDiem,
    costs: [{
      costCategory: { id: flyCat.id },
      paymentType: { id: payType.id },
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      vatType: { id: 0 },
      date: "2026-03-10",
    }],
  });
  if (t3.status === 201) {
    console.log("  OK — vatType 0 works");
    const d3 = await put(`/travelExpense/:deliver?id=${t3.data.value.id}`);
    if (d3.status === 200) console.log("  DELIVERED OK with vatType=0!");
    await del(`/travelExpense/${t3.data.value.id}`);
  }

  // TEST 4: POST costCategory by description (no lookup needed)
  console.log("\n=== TEST 4: POST costCategory by description ===");
  const t4 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test cat desc",
    travelDetails: baseTravelDetails,
    perDiemCompensations: basePerDiem,
    costs: [{
      costCategory: { description: "Fly" },
      paymentType: { id: payType.id },
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      vatType: { id: 0 },
      date: "2026-03-10",
    }],
  });
  if (t4.status === 201) {
    console.log("  OK — costCategory by description works!");
    await del(`/travelExpense/${t4.data.value.id}`);
  }

  // TEST 5: POST without costCategory at all
  console.log("\n=== TEST 5: POST without costCategory ===");
  const t5 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test no cat",
    travelDetails: baseTravelDetails,
    perDiemCompensations: basePerDiem,
    costs: [{
      paymentType: { id: payType.id },
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      date: "2026-03-10",
    }],
  });
  if (t5.status === 201) {
    console.log("  OK — costCategory is optional!");
    await del(`/travelExpense/${t5.data.value.id}`);
  }

  // TEST 6: POST without both paymentType and vatType (only costCategory)
  console.log("\n=== TEST 6: POST with only costCategory (no paymentType, no vatType) ===");
  const t6 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test minimal cost",
    travelDetails: baseTravelDetails,
    perDiemCompensations: basePerDiem,
    costs: [{
      costCategory: { id: flyCat.id },
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      date: "2026-03-10",
    }],
  });
  if (t6.status === 201) {
    console.log("  OK — minimal cost fields work");
    // Read back to check auto-assigned fields
    const rb = await get(`/travelExpense/${t6.data.value.id}?fields=*,costs(*)`);
    const cost = rb?.value?.costs?.[0];
    console.log("  Auto paymentType:", JSON.stringify(cost?.paymentType));
    console.log("  Auto vatType:", JSON.stringify(cost?.vatType));
    const d6 = await put(`/travelExpense/:deliver?id=${t6.data.value.id}`);
    if (d6.status === 200) {
      console.log("  DELIVERED OK with minimal fields!");
      // Check the scored fields
      const final = d6.data.values?.[0];
      console.log("  Final state:", final?.state);
    }
    await del(`/travelExpense/${t6.data.value.id}`);
  }

  // TEST 7: POST paymentType by description
  console.log("\n=== TEST 7: POST paymentType by description ===");
  const t7 = await post("/travelExpense", {
    employee: { id: emp.id },
    title: "Test pt desc",
    travelDetails: baseTravelDetails,
    perDiemCompensations: basePerDiem,
    costs: [{
      costCategory: { id: flyCat.id },
      paymentType: { description: "Privat utlegg" },
      comments: "flight test",
      amountCurrencyIncVat: 1000, amountNOKInclVAT: 1000,
      vatType: { id: flyCat.vatType.id },
      date: "2026-03-10",
    }],
  });
  if (t7.status === 201) {
    console.log("  OK — paymentType by description works!");
    await del(`/travelExpense/${t7.data.value.id}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
