/**
 * Task 13: Sandbox reset + end-to-end test
 *
 * Phase 1: Check if we can delete travel expenses (reset)
 * Phase 2: Clean sandbox by deleting OPEN travel expenses
 * Phase 3: Run a full production-like flow with different rate hypotheses
 * Phase 4: Read back everything and compare
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
    return { ok: r.ok, status: r.status, data: null };
  }
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0, 400)}`);
    return { ok: false, status: r.status, data: json };
  }
  return { ok: true, status: r.status, data: json };
}

async function main() {
  // ========================
  // PHASE 1: RESET INVESTIGATION
  // ========================
  console.log("=== PHASE 1: RESET INVESTIGATION ===\n");

  // List all existing travel expenses
  const listRes = await api("GET", "/travelExpense?count=1000&fields=id,state,title,employee(id,firstName,lastName)");
  const allTE = listRes.data?.values || [];
  console.log(`Total travel expenses in sandbox: ${allTE.length}`);
  for (const te of allTE) {
    console.log(`  id=${te.id} state=${te.state} title="${te.title}" emp=${te.employee?.firstName} ${te.employee?.lastName}`);
  }

  // Try DELETE on an OPEN travel expense
  const openTE = allTE.find((te: any) => te.state === "OPEN");
  if (openTE) {
    console.log(`\nTrying DELETE on OPEN expense id=${openTE.id}...`);
    const delRes = await api("DELETE", `/travelExpense/${openTE.id}`);
    console.log(`  DELETE result: status=${delRes.status}, ok=${delRes.ok}`);
  }

  // Try DELETE on a DELIVERED travel expense
  const deliveredTE = allTE.find((te: any) => te.state === "DELIVERED");
  if (deliveredTE) {
    console.log(`\nTrying DELETE on DELIVERED expense id=${deliveredTE.id}...`);
    const delRes = await api("DELETE", `/travelExpense/${deliveredTE.id}`);
    console.log(`  DELETE result: status=${delRes.status}, ok=${delRes.ok}`);
  }

  // ========================
  // PHASE 2: CLEAN SANDBOX
  // ========================
  console.log("\n=== PHASE 2: CLEAN SANDBOX ===\n");

  // Delete all OPEN travel expenses (if DELETE works)
  const openTEs = allTE.filter((te: any) => te.state === "OPEN");
  console.log(`OPEN travel expenses to clean: ${openTEs.length}`);
  for (const te of openTEs) {
    const del = await api("DELETE", `/travelExpense/${te.id}`);
    console.log(`  DELETE id=${te.id}: status=${del.status}`);
  }

  // ========================
  // PHASE 3: SETUP — gather employee, categories, payment types
  // ========================
  console.log("\n=== PHASE 3: SETUP ===\n");

  const [empRes, costCatRes, payTypeRes] = await Promise.all([
    api("GET", "/employee?count=1&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.data?.values?.[0];
  if (!emp) throw new Error("No employee found");

  // Company fallback for departureFrom
  const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = emp.address?.city || compRes.data?.value?.address?.city || "Oslo";

  const travelCats = (costCatRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  const payType = (payTypeRes.data?.values || []).find((p: any) => p.showOnTravelExpenses);

  console.log(`Employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}, addr=${emp.address?.city || 'null'}`);
  console.log(`DepartureFrom: ${departureFrom}`);
  console.log(`Fly category: id=${flyCat?.id}, vatType=${JSON.stringify(flyCat?.vatType)}`);
  console.log(`Taxi category: id=${taxiCat?.id}, vatType=${JSON.stringify(taxiCat?.vatType)}`);
  console.log(`PayType: id=${payType?.id}, desc=${payType?.description}`);

  if (!flyCat || !taxiCat || !payType) throw new Error("Missing category or payment type");

  // NOTE: sandbox is NOT VAT-registered, so vatType must be {id: 0}
  const sandboxVatType = { id: 0 };

  // ========================
  // PHASE 4: TEST MATRIX — create, deliver, readback
  // ========================
  console.log("\n=== PHASE 4: TEST MATRIX ===\n");

  // Production-like prompt: "5-day trip, per diem 800/day, flight 2850, taxi 200"
  const departureDate = "2026-03-17";
  const returnDate = "2026-03-21";
  const destination = "Trondheim";
  const flightAmount = 2850;
  const taxiAmount = 200;

  interface TestCase {
    label: string;
    perDiem: {
      count: number;
      rate?: number;
      amount?: number;
      rateType: { id: number; rateCategory: { id: number } };
      overnightAccommodation: string;
    };
  }

  const tests: TestCase[] = [
    {
      label: "A: prompt-rate (rate=800, count=4 overnights, amount=3200)",
      perDiem: {
        count: 4,
        rate: 800,
        amount: 3200,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    },
    {
      label: "B: system-rate (rate=1012, count=4 overnights, amount=4048)",
      perDiem: {
        count: 4,
        rate: 1012,
        amount: 4048,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    },
    {
      label: "C: omit-rate-amount (count=4 overnights, system fills rate)",
      perDiem: {
        count: 4,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    },
    {
      label: "D: prompt-rate-days (rate=800, count=5 days, amount=4000) — old production approach",
      perDiem: {
        count: 5,
        rate: 800,
        amount: 4000,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    },
    {
      label: "E: system-rate-days (rate=1012, count=5 days, amount=5060)",
      perDiem: {
        count: 5,
        rate: 1012,
        amount: 5060,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    },
    {
      label: "F: omit-rate-amount-days (count=5 days, system fills rate)",
      perDiem: {
        count: 5,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    },
  ];

  const results: any[] = [];

  for (const test of tests) {
    console.log(`\n--- ${test.label} ---`);

    const perDiemRow: any = {
      location: destination,
      count: test.perDiem.count,
      rateType: test.perDiem.rateType,
      overnightAccommodation: test.perDiem.overnightAccommodation,
    };
    if (test.perDiem.rate !== undefined) perDiemRow.rate = test.perDiem.rate;
    if (test.perDiem.amount !== undefined) perDiemRow.amount = test.perDiem.amount;

    const payload = {
      employee: { id: emp.id },
      title: `Test: ${test.label}`,
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate,
        returnDate,
        departureTime: "08:00",
        returnTime: "18:00",
        departureFrom,
        destination,
        detailedJourneyDescription: `Test: ${test.label}`,
        purpose: `Test: ${test.label}`,
      },
      perDiemCompensations: [perDiemRow],
      costs: [
        {
          costCategory: { id: flyCat.id },
          paymentType: { id: payType.id },
          comments: "flight",
          amountCurrencyIncVat: flightAmount,
          amountNOKInclVAT: flightAmount,
          vatType: sandboxVatType,
          date: departureDate,
        },
        {
          costCategory: { id: taxiCat.id },
          paymentType: { id: payType.id },
          comments: "taxi",
          amountCurrencyIncVat: taxiAmount,
          amountNOKInclVAT: taxiAmount,
          vatType: sandboxVatType,
          date: returnDate,
        },
      ],
    };

    // CREATE
    const createRes = await api("POST", "/travelExpense", payload);
    if (!createRes.ok) {
      console.log("  POST FAILED — skipping");
      results.push({ label: test.label, status: "POST_FAILED" });
      continue;
    }
    const te = createRes.data.value;
    console.log(`  Created: id=${te.id}, state=${te.state}`);

    // DELIVER
    const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
    if (!deliverRes.ok) {
      console.log("  DELIVER FAILED");
      // Readback anyway
      const pdRes = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`);
      results.push({ label: test.label, status: "DELIVER_FAILED", teId: te.id, perDiem: pdRes.data?.values?.[0] });
      continue;
    }
    const del = deliverRes.data.values?.[0] || deliverRes.data.value;
    console.log(`  Delivered: id=${del.id}, state=${del.state}`);

    // READBACK — per-diem details
    const pdRes = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`);
    const pd = pdRes.data?.values?.[0];

    // READBACK — cost details
    const costRes = await api("GET", `/travelExpense/cost?travelExpenseId=${te.id}&fields=*`);
    const costs = costRes.data?.values || [];

    // READBACK — parent
    const teRes = await api("GET", `/travelExpense/${te.id}?fields=*`);
    const teFull = teRes.data?.value;

    console.log(`  PerDiem readback:`);
    console.log(`    count=${pd?.count}, rate=${pd?.rate}, amount=${pd?.amount}`);
    console.log(`    rateType=${pd?.rateType?.id}, rateCategory=${pd?.rateCategory?.id}`);
    console.log(`    overnight=${pd?.overnightAccommodation}, location="${pd?.location}"`);
    console.log(`    deductions: breakfast=${pd?.isDeductionForBreakfast}, lunch=${pd?.isDeductionForLunch}, dinner=${pd?.isDeductionForDinner}`);

    console.log(`  Costs readback:`);
    for (const c of costs) {
      console.log(`    "${c.comments}" amount=${c.amountNOKInclVAT} date=${c.date} vatType=${c.vatType?.id} cat=${c.costCategory?.id}`);
    }

    console.log(`  Parent readback:`);
    console.log(`    amount=${teFull?.amount}, paymentAmount=${teFull?.paymentAmount}`);
    console.log(`    isForeignTravel=${teFull?.travelDetails?.isForeignTravel}`);
    console.log(`    destination=${teFull?.travelDetails?.destination}`);

    results.push({
      label: test.label,
      status: "DELIVERED",
      teId: te.id,
      perDiem: {
        count: pd?.count,
        rate: pd?.rate,
        amount: pd?.amount,
        rateType: pd?.rateType?.id,
        rateCategory: pd?.rateCategory?.id,
        overnightAccommodation: pd?.overnightAccommodation,
      },
      costs: costs.map((c: any) => ({
        comments: c.comments,
        amount: c.amountNOKInclVAT,
        date: c.date,
        vatType: c.vatType?.id,
      })),
      parent: {
        amount: teFull?.amount,
        paymentAmount: teFull?.paymentAmount,
      },
    });
  }

  // ========================
  // PHASE 5: SUMMARY COMPARISON
  // ========================
  console.log("\n\n=== PHASE 5: SUMMARY COMPARISON ===\n");
  console.log("| Test | State | PerDiem count | rate | amount | rateType | overnight | Costs |");
  console.log("|------|-------|---------------|------|--------|----------|-----------|-------|");
  for (const r of results) {
    if (r.status === "DELIVERED") {
      const pd = r.perDiem;
      console.log(
        `| ${r.label.split(":")[0]} | ${r.status} | ${pd.count} | ${pd.rate} | ${pd.amount} | ${pd.rateType} | ${pd.overnightAccommodation} | ${r.costs.map((c: any) => `${c.comments}=${c.amount}`).join(",")} |`
      );
    } else {
      console.log(`| ${r.label.split(":")[0]} | ${r.status} | - | - | - | - | - | - |`);
    }
  }

  console.log("\n\nKEY QUESTION: When rate/amount are omitted (test C, F), what does the system fill in?");
  console.log("If system fills rate=1012 (government rate), that's the untested production hypothesis.");
  console.log("Production scorer likely checks: count, rate, amount on the per-diem readback.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
