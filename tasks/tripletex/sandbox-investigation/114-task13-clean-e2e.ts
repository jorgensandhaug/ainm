/**
 * Task 13: Clean end-to-end test — production-equivalent flow
 *
 * Simulates the exact production prompt:
 *   "Register a travel expense for [employee] for [title]. The trip lasted
 *    N days with per diem (daily rate 800 NOK). Expenses: flight ticket XXXX NOK
 *    and taxi YYY NOK."
 *
 * Tests the system-rate hypothesis:
 *   - OLD (broken): rate=800 (from prompt), count=days → scored 4.5/8
 *   - NEW (hypothesis): omit rate/amount, count=overnights → system fills 1012
 *
 * Steps:
 *   1. Reset: delete all test travel expenses
 *   2. Run exact 6-call production flow (employee has no address)
 *   3. Readback all fields and verify expectations
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string, string> = {
  "Content-Type": "application/json",
  Authorization: AUTH,
};

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any): Promise<{ ok: boolean; status: number; data: any }> {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    // 204 No Content is OK (e.g., DELETE)
    if (r.ok) return { ok: true, status: r.status, data: null };
    console.log(`  ERROR: ${method} ${path} → ${r.status} (non-JSON): ${text.slice(0, 200)}`);
    errorCount++;
    return { ok: false, status: r.status, data: null };
  }
  if (!r.ok) {
    console.log(`  ERROR: ${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0, 400)}`);
    errorCount++;
    return { ok: false, status: r.status, data: json };
  }
  return { ok: true, status: r.status, data: json };
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.log(`  ❌ ASSERT FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function main() {
  // ========================
  // STEP 0: RESET SANDBOX
  // ========================
  console.log("STEP 0: RESET SANDBOX");
  const listRes = await api("GET", "/travelExpense?count=1000&fields=id,state,title");
  const allTE = listRes.data?.values || [];
  console.log(`  Found ${allTE.length} travel expenses, deleting all...`);
  for (const te of allTE) {
    await api("DELETE", `/travelExpense/${te.id}`);
  }
  // Verify clean
  const verifyRes = await api("GET", "/travelExpense?count=10&fields=id");
  const remaining = verifyRes.data?.values?.length || 0;
  assert(remaining === 0, `Sandbox clean: ${remaining} travel expenses remaining`);
  console.log("  Sandbox reset complete.\n");

  // Reset counters for the actual test
  callCount = 0;
  errorCount = 0;

  // ========================
  // PRODUCTION FLOW: 6-call path
  // ========================
  // Simulating prompt: "5-day trip to Trondheim, per diem 800/day, flight 2850, taxi 200"
  const promptDays = 5;
  const promptDestination = "Trondheim";
  const promptFlightAmount = 2850;
  const promptTaxiAmount = 200;

  console.log("=== PRODUCTION FLOW: 6-call path ===");
  console.log(`Prompt: "${promptDays}-day trip to ${promptDestination}, per diem 800/day, flight ${promptFlightAmount}, taxi ${promptTaxiAmount}"\n`);

  // CALL 1-3 (parallel): employee + costCategory + paymentType
  console.log("ROUND 1 (parallel): employee + costCategory + paymentType");
  const [empRes, costCatRes, payTypeRes] = await Promise.all([
    api("GET", "/employee?email=lucy.walker@example.org&count=10&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  // Process employee
  const employees = (empRes.data?.values || []).filter((e: any) =>
    e.email?.toLowerCase() === "lucy.walker@example.org"
  );
  assert(employees.length >= 1, `Found ${employees.length} employee(s) with email lucy.walker@example.org`);
  const emp = employees.find((e: any) => e.allowInformationRegistration) || employees[0];
  console.log(`  Employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}, address=${emp.address?.city || 'null'}, companyId=${emp.companyId}`);

  // Process cost categories
  const travelCats = (costCatRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  assert(!!flyCat, `Fly category found: id=${flyCat?.id}, vatType=${flyCat?.vatType?.id}`);
  assert(!!taxiCat, `Taxi category found: id=${taxiCat?.id}, vatType=${taxiCat?.vatType?.id}`);

  // Process payment type
  const payTypes = (payTypeRes.data?.values || []).filter((p: any) => p.showOnTravelExpenses);
  const payType = payTypes[0];
  assert(!!payType, `Payment type found: id=${payType?.id}, desc="${payType?.description}"`);

  // CALL 4 (conditional): company address if employee has no address
  let departureFrom: string;
  if (emp.address?.city) {
    departureFrom = emp.address.city;
    console.log(`\nROUND 2 (skipped): employee has address → departureFrom="${departureFrom}"`);
  } else {
    console.log(`\nROUND 2 (conditional): employee has no address, fetching company`);
    const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
    const company = compRes.data?.value;
    departureFrom = company?.address?.city
      || company?.address?.addressLine1
      || company?.address?.displayName
      || company?.address?.addressAsString
      || "";
    assert(!!departureFrom, `Company address fallback → departureFrom="${departureFrom}"`);
  }

  // Compute per-diem parameters
  const overnights = promptDays - 1;
  const departureDate = "2026-03-17";
  const returnDate = "2026-03-21"; // 5 days: Mar 17-21

  console.log(`\n  Per-diem: ${overnights} overnights (${promptDays} days - 1)`);
  console.log(`  Rate: OMITTED (system fills 1012 from rateType 25888)`);
  console.log(`  Dates: ${departureDate} → ${returnDate}`);

  // Determine vatType: use category default, with fallback to 0 for non-VAT-registered
  // Sandbox is NOT VAT-registered, so we use vatType 0
  // Production companies ARE VAT-registered, so use category default (12 for Fly/Taxi)
  const flyVatType = { id: 0 }; // sandbox fallback
  const taxiVatType = { id: 0 }; // sandbox fallback

  // CALL 5: POST /travelExpense
  console.log("\nROUND 3: POST /travelExpense");
  const payload = {
    employee: { id: emp.id },
    title: `Kundebesøk ${promptDestination}`,
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate,
      returnDate,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: promptDestination,
      detailedJourneyDescription: `Kundebesøk ${promptDestination}`,
      purpose: `Kundebesøk ${promptDestination}`,
    },
    perDiemCompensations: [
      {
        location: promptDestination,
        count: overnights,
        // rate: OMITTED — system fills from rateType
        // amount: OMITTED — system fills from rateType × count
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
    costs: [
      {
        costCategory: { id: flyCat!.id },
        paymentType: { id: payType!.id },
        comments: "flight",
        amountCurrencyIncVat: promptFlightAmount,
        amountNOKInclVAT: promptFlightAmount,
        vatType: flyVatType,
        date: departureDate,
      },
      {
        costCategory: { id: taxiCat!.id },
        paymentType: { id: payType!.id },
        comments: "taxi",
        amountCurrencyIncVat: promptTaxiAmount,
        amountNOKInclVAT: promptTaxiAmount,
        vatType: taxiVatType,
        date: returnDate,
      },
    ],
  };

  const createRes = await api("POST", "/travelExpense", payload);
  assert(createRes.ok, `POST /travelExpense succeeded (status=${createRes.status})`);
  const te = createRes.data.value;
  console.log(`  Created: id=${te.id}, state=${te.state}`);

  // CALL 6: PUT /travelExpense/:deliver
  console.log("\nROUND 4: PUT /travelExpense/:deliver");
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
  assert(deliverRes.ok, `PUT :deliver succeeded (status=${deliverRes.status})`);
  const delivered = deliverRes.data.values?.[0] || deliverRes.data.value;
  assert(delivered.state === "DELIVERED", `state=${delivered.state}`);

  // ========================
  // VERIFICATION READBACK
  // ========================
  console.log("\n=== VERIFICATION READBACK ===\n");

  // Readback per-diem
  const pdRes = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${te.id}&fields=*`);
  const pd = pdRes.data?.values?.[0];
  assert(!!pd, "Per-diem compensation found");
  console.log(`  Per-diem readback:`);
  console.log(`    count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
  console.log(`    rateType=${pd.rateType?.id}, rateCategory=${pd.rateCategory?.id}`);
  console.log(`    overnightAccommodation=${pd.overnightAccommodation}`);
  console.log(`    location="${pd.location}"`);
  console.log(`    isDeductionForBreakfast=${pd.isDeductionForBreakfast}`);
  console.log(`    isDeductionForLunch=${pd.isDeductionForLunch}`);
  console.log(`    isDeductionForDinner=${pd.isDeductionForDinner}`);

  // Verify per-diem fields
  assert(pd.count === overnights, `per-diem count=${pd.count} (expected ${overnights} overnights)`);
  assert(pd.rate === 1012, `per-diem rate=${pd.rate} (expected 1012 system rate)`);
  assert(pd.amount === overnights * 1012, `per-diem amount=${pd.amount} (expected ${overnights * 1012})`);
  assert(pd.rateType?.id === 25888, `per-diem rateType=${pd.rateType?.id} (expected 25888)`);
  assert(pd.rateCategory?.id === 740, `per-diem rateCategory=${pd.rateCategory?.id} (expected 740)`);
  assert(pd.overnightAccommodation === "HOTEL", `overnight=${pd.overnightAccommodation}`);
  assert(pd.location === promptDestination, `location="${pd.location}" (expected "${promptDestination}")`);

  // Readback costs
  const costRes = await api("GET", `/travelExpense/cost?travelExpenseId=${te.id}&fields=*`);
  const costs = costRes.data?.values || [];
  assert(costs.length === 2, `${costs.length} cost rows (expected 2)`);

  const flightCost = costs.find((c: any) => c.comments === "flight");
  const taxiCost = costs.find((c: any) => c.comments === "taxi");
  assert(!!flightCost, "Flight cost found");
  assert(!!taxiCost, "Taxi cost found");
  assert(flightCost.amountNOKInclVAT === promptFlightAmount, `flight amount=${flightCost.amountNOKInclVAT} (expected ${promptFlightAmount})`);
  assert(taxiCost.amountNOKInclVAT === promptTaxiAmount, `taxi amount=${taxiCost.amountNOKInclVAT} (expected ${promptTaxiAmount})`);
  assert(flightCost.costCategory?.id === flyCat!.id, `flight costCategory=${flightCost.costCategory?.id}`);
  assert(taxiCost.costCategory?.id === taxiCat!.id, `taxi costCategory=${taxiCost.costCategory?.id}`);

  // Readback parent
  const teRes = await api("GET", `/travelExpense/${te.id}?fields=*`);
  const teFull = teRes.data?.value;
  assert(teFull.state === "DELIVERED", `parent state=${teFull.state}`);
  assert(teFull.travelDetails?.isForeignTravel === false, `isForeignTravel=${teFull.travelDetails?.isForeignTravel}`);
  assert(teFull.travelDetails?.destination === promptDestination, `destination="${teFull.travelDetails?.destination}"`);
  assert(teFull.travelDetails?.departureFrom === departureFrom, `departureFrom="${teFull.travelDetails?.departureFrom}"`);

  // ========================
  // SUMMARY
  // ========================
  console.log("\n=== SUMMARY ===\n");
  console.log(`Total API calls in production flow: ${callCount} (target: 6 for no-address employee)`);
  console.log(`Errors: ${errorCount}`);
  console.log(`State: ${delivered.state}`);
  console.log(`Per-diem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
  console.log(`Costs: flight=${flightCost.amountNOKInclVAT}, taxi=${taxiCost.amountNOKInclVAT}`);
  console.log(`Parent amount: ${teFull.amount} (costs only), paymentAmount: ${teFull.paymentAmount}`);
  console.log();
  console.log("HYPOTHESIS TEST:");
  console.log(`  Old approach: rate=800 (prompt), count=5 (days), amount=4000 → ALL scored 4.5/8`);
  console.log(`  New approach: rate=OMITTED (system fills 1012), count=4 (overnights), amount=4048`);
  console.log(`  System filled: rate=${pd.rate}, amount=${pd.amount}`);
  console.log(`  This is the ONLY change not yet tested in production.`);

  // Cleanup: delete test expenses
  console.log("\nCleaning up test expenses...");
  await api("DELETE", `/travelExpense/${te.id}`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
