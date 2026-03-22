/**
 * Task 13 deep per-diem investigation
 *
 * Checks 2, 3, 6 ALWAYS fail (19 attempts). Passing: 1, 4, 5.
 * Already disproven: rateType (25886 vs 25888), count (days vs overnights).
 *
 * This script:
 * 1. Explores per-diem rate categories in detail
 * 2. Checks travelExpense settings
 * 3. Creates test expenses with various per-diem configurations
 * 4. Reads back what the system stored to find discrepancies
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string, string> = {
  "Content-Type": "application/json",
  Authorization: AUTH,
};

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    console.log(`${method} ${path} → ${r.status} (non-JSON): ${text.slice(0, 200)}`);
    return null;
  }
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}`);
    console.log(JSON.stringify(json, null, 2).slice(0, 500));
    return null;
  }
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

async function main() {
  console.log("=== PHASE 1: EXPLORE PER-DIEM RATE SYSTEM ===\n");

  // 1a. Rate categories
  const rateCatRes = await api("GET", "/travelExpense/perDiemCompensation/rateCategory?fields=*&count=100");
  if (rateCatRes) {
    console.log(`\nRate categories (${rateCatRes.count} total):`);
    for (const rc of rateCatRes.values) {
      console.log(`  id=${rc.id}: ${rc.name || rc.description || '(no name)'}, isValidDomestic=${rc.isValidDomestic}, isValidAccommodation=${rc.isValidAccommodation}`);
      console.log(`    full: ${JSON.stringify(rc)}`);
    }
  }

  // 1b. Rates for per-diem (domestic, current date range)
  const rateRes = await api("GET", "/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-17&dateTo=2026-03-21&count=1000&fields=*,rateCategory(*)");
  if (rateRes) {
    console.log(`\nPer-diem rates (${rateRes.count} total):`);
    for (const r of rateRes.values) {
      console.log(`  id=${r.id}: rate=${r.rate}, rateCategory=${JSON.stringify(r.rateCategory)}, zone=${r.zone}`);
      console.log(`    full: ${JSON.stringify(r)}`);
    }
  }

  // 1c. Travel expense settings
  const settingsRes = await api("GET", "/travelExpense/settings?fields=*");
  if (settingsRes) {
    console.log(`\nTravel expense settings:`);
    console.log(JSON.stringify(settingsRes, null, 2));
  }

  // 1d. Per-diem compensation rate category/type info
  const rateCatRes2 = await api("GET", "/travelExpense/perDiemCompensation/rateCategory?count=100&fields=*,rateType(*)");
  if (rateCatRes2 && rateCatRes2 !== rateCatRes) {
    console.log(`\nRate categories with expanded rateType:`);
    for (const rc of rateCatRes2.values) {
      console.log(`  ${JSON.stringify(rc)}`);
    }
  }

  // 1e. Check if there's an overnight-accommodation enum
  console.log("\n\n=== PHASE 2: TEST OVERNIGHT ACCOMMODATION VALUES ===\n");

  // Get employee and categories
  const empRes = await api("GET", "/employee?count=1&fields=*");
  const emp = empRes?.values[0];
  if (!emp) throw new Error("No employee found");
  console.log(`Employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}`);

  const [costCatRes, payTypeRes, companyRes] = await Promise.all([
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
    api("GET", `/company/${emp.companyId}?fields=*,address(*)`),
  ]);

  const company = companyRes?.value;
  const departureFrom = emp.address?.city || company?.address?.city || "Oslo";
  const travelCats = costCatRes?.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats?.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats?.find((c: any) => c.description === "Taxi");
  const payType = payTypeRes?.values.find((p: any) => p.showOnTravelExpenses);

  console.log(`Fly cat: id=${flyCat?.id}, vatType=${JSON.stringify(flyCat?.vatType)}`);
  console.log(`Taxi cat: id=${taxiCat?.id}, vatType=${JSON.stringify(taxiCat?.vatType)}`);
  console.log(`PayType: id=${payType?.id}`);

  if (!flyCat || !taxiCat || !payType) throw new Error("Missing category/payType");

  function buildPayload(label: string, perDiemOverrides: any, costOverrides?: any) {
    return {
      employee: { id: emp.id },
      title: `T13 deep test: ${label}`,
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate: "2026-03-17",
        returnDate: "2026-03-21",
        departureTime: "08:00",
        returnTime: "18:00",
        departureFrom,
        destination: "Tromsø",
        detailedJourneyDescription: `Test: ${label}`,
        purpose: `Test: ${label}`,
      },
      perDiemCompensations: [
        {
          location: "Tromsø",
          count: 4,
          rate: 800,
          amount: 3200,
          rateType: { id: 25888, rateCategory: { id: 740 } },
          overnightAccommodation: "HOTEL",
          ...perDiemOverrides,
        },
      ],
      costs: [
        {
          costCategory: { id: flyCat.id },
          paymentType: { id: payType.id },
          comments: "flight",
          amountCurrencyIncVat: 2750,
          amountNOKInclVAT: 2750,
          vatType: { id: flyCat.vatType?.id || 0 },
          date: "2026-03-17",
          ...(costOverrides || {}),
        },
        {
          costCategory: { id: taxiCat.id },
          paymentType: { id: payType.id },
          comments: "taxi",
          amountCurrencyIncVat: 700,
          amountNOKInclVAT: 700,
          vatType: { id: taxiCat.vatType?.id || 0 },
          date: "2026-03-21",
          ...(costOverrides || {}),
        },
      ],
    };
  }

  async function createAndDeliver(label: string, payload: any): Promise<any> {
    console.log(`\n--- TEST: ${label} ---`);
    const createRes = await api("POST", "/travelExpense", payload);
    if (!createRes) return null;
    const te = createRes.value;
    console.log(`  Created: id=${te.id}, state=${te.state}`);

    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
    if (!deliverRes) {
      console.log(`  DELIVER FAILED for ${te.id}`);
      return { created: te, delivered: null };
    }
    const del = deliverRes.values?.[0] || deliverRes.value;
    console.log(`  Delivered: id=${del.id}, state=${del.state}`);

    // Read back per-diem
    const pdRes = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`);
    const pd = pdRes?.values?.[0];
    if (pd) {
      console.log(`  PerDiem readback:`);
      console.log(`    count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
      console.log(`    rateType=${JSON.stringify(pd.rateType)}, rateCategory=${JSON.stringify(pd.rateCategory)}`);
      console.log(`    overnightAccommodation=${pd.overnightAccommodation}`);
      console.log(`    location=${pd.location}`);
      console.log(`    isDeductionForBreakfast=${pd.isDeductionForBreakfast}`);
      console.log(`    Full: ${JSON.stringify(pd)}`);
    }

    // Read back costs
    const costRes = await api("GET", `/travelExpense/cost?travelExpenseId=${te.id}&fields=*`);
    if (costRes?.values) {
      for (const c of costRes.values) {
        console.log(`  Cost readback: cat=${c.costCategory?.id}, comments="${c.comments}", amountNOK=${c.amountNOKInclVAT}, vatType=${JSON.stringify(c.vatType)}`);
      }
    }

    // Read back the full travel expense
    const teReadback = await api("GET", `/travelExpense/${te.id}?fields=*`);
    if (teReadback?.value) {
      const v = teReadback.value;
      console.log(`  TE readback: amount=${v.amount}, paymentAmount=${v.paymentAmount}, isForeignTravel=${v.travelDetails?.isForeignTravel}, isCompensationFromRates=${v.travelDetails?.isCompensationFromRates}`);
    }

    return { created: te, delivered: del, perDiem: pd };
  }

  // ===== TEST MATRIX =====

  // Test 1: Baseline — count=4 (overnights), rate=800, amount=3200, HOTEL, vatType from category
  const t1 = await createAndDeliver(
    "baseline: count=4, rate=800, HOTEL, vatType=category",
    buildPayload("baseline-count4-rate800-hotel-vatcat", {})
  );

  // Test 2: count=5 (days), rate=800, amount=4000
  const t2 = await createAndDeliver(
    "count=5 (days), rate=800, amount=4000",
    buildPayload("count5-rate800", { count: 5, rate: 800, amount: 4000 })
  );

  // Test 3: count=4, rate=1012 (system rate), amount=4048
  const t3 = await createAndDeliver(
    "count=4, rate=1012 (system), amount=4048",
    buildPayload("count4-rate1012", { count: 4, rate: 1012, amount: 4048 })
  );

  // Test 4: overnightAccommodation=NONE
  const t4 = await createAndDeliver(
    "overnightAccommodation=NONE",
    buildPayload("overnight-NONE", { overnightAccommodation: "NONE" })
  );

  // Test 5: overnightAccommodation=BOARDING_HOUSE_WITHOUT_COOKING
  const t5 = await createAndDeliver(
    "overnightAccommodation=BOARDING_HOUSE_WITHOUT_COOKING",
    buildPayload("overnight-BHWC", { overnightAccommodation: "BOARDING_HOUSE_WITHOUT_COOKING" })
  );

  // Test 6: Try without setting rate/amount at all — let system calculate
  const t6 = await createAndDeliver(
    "no rate/amount — system calculate",
    buildPayload("no-rate-amount", { rate: undefined, amount: undefined })
  );

  // Test 7: count=4, rate=800, with isDeductionForBreakfast=true
  const t7 = await createAndDeliver(
    "isDeductionForBreakfast=true",
    buildPayload("deduction-breakfast", { isDeductionForBreakfast: true })
  );

  // Test 8: count=4, rate=800, with isDeductionForBreakfast=false (explicit)
  const t8 = await createAndDeliver(
    "isDeductionForBreakfast=false (explicit)",
    buildPayload("no-deduction-breakfast", { isDeductionForBreakfast: false })
  );

  // Test 9: vatType=0 on costs (the old broken way)
  const t9 = await createAndDeliver(
    "vatType=0 on costs (old way)",
    buildPayload("vattype0-costs", {}, { vatType: { id: 0 } })
  );

  // Test 10: Try using day-trip rateType 25886 for overnight trip but with correct count=4
  const t10 = await createAndDeliver(
    "rateType=25886 (day-trip) + count=4",
    buildPayload("ratetype25886-count4", {
      rateType: { id: 25886, rateCategory: { id: 738 } },
      count: 4,
      rate: 800,
      amount: 3200,
    })
  );

  // Test 11: Try count=5 (days) with rateType 25888 and rate=800
  // This is what most production runs did
  const t11 = await createAndDeliver(
    "production-like: count=5, rateType=25888, rate=800, vatType=0",
    buildPayload("prod-like", { count: 5, rate: 800, amount: 4000 }, { vatType: { id: 0 } })
  );

  // Test 12: Try the PRIVATE overnight accommodation
  const t12 = await createAndDeliver(
    "overnightAccommodation=PRIVATE",
    buildPayload("overnight-PRIVATE", { overnightAccommodation: "PRIVATE" })
  );

  console.log("\n\n=== PHASE 3: SUMMARY ===\n");
  const tests = [
    { label: "baseline: count=4, rate=800, HOTEL, vatType=cat", result: t1 },
    { label: "count=5, rate=800, amount=4000", result: t2 },
    { label: "count=4, rate=1012 (system), amount=4048", result: t3 },
    { label: "overnightAccommodation=NONE", result: t4 },
    { label: "overnightAccommodation=BOARDING_HOUSE_WO_COOK", result: t5 },
    { label: "no rate/amount (system calc)", result: t6 },
    { label: "isDeductionForBreakfast=true", result: t7 },
    { label: "isDeductionForBreakfast=false", result: t8 },
    { label: "vatType=0 on costs", result: t9 },
    { label: "rateType=25886 (day-trip) + count=4", result: t10 },
    { label: "production-like: count=5, vatType=0", result: t11 },
    { label: "overnightAccommodation=PRIVATE", result: t12 },
  ];

  for (const t of tests) {
    const pd = t.result?.perDiem;
    const status = t.result?.delivered?.state || "FAILED";
    console.log(`${t.label}:`);
    console.log(`  state=${status}, perDiem: count=${pd?.count}, rate=${pd?.rate}, amount=${pd?.amount}, overnight=${pd?.overnightAccommodation}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
