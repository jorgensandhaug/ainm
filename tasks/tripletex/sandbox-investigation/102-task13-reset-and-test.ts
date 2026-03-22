/**
 * Task 13 Deep Analysis — Phase 2: Reset + Comprehensive E2E Test
 *
 * STEP 1: Clean up ALL existing travel expenses in sandbox
 * STEP 2: Run 3 hypothesis tests end-to-end:
 *   A) NO perDiemCompensations (isCompensationFromRates=false)
 *   B) perDiemCompensations with count=OVERNIGHTS (days-1), system rate
 *   C) perDiemCompensations with count=DAYS, system rate
 *
 * Each test does full lifecycle: create → readback → deliver → approve → createVouchers → readback → voucher postings
 *
 * Uses a 3-day trip (matching most common prod prompt): "Kundebesøk Stavanger", flight 3900, taxi 350
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string, string> = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any): Promise<any> {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { return { _status: r.status, _raw: text.slice(0, 300) }; }
  if (!r.ok) {
    console.log(`  ❌ ${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || '').slice(0, 300)}`);
    return { _status: r.status, _error: true, ...json };
  }
  console.log(`  ✓ ${method} ${path} → ${r.status}`);
  return { _status: r.status, ...json };
}

// ============================================================================
// STEP 1: CLEANUP
// ============================================================================
async function cleanupAllTravelExpenses() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  STEP 1: CLEANUP ALL TRAVEL EXPENSES                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const teList = await api("GET", "/travelExpense?count=1000&fields=id,state,isCompleted,title");
  const allTE = teList.values || [];
  console.log(`Found ${allTE.length} travel expenses to clean up\n`);

  let deleted = 0, failed = 0;
  for (const te of allTE) {
    // APPROVED → unapprove first
    if (te.state === "APPROVED") {
      const unapRes = await api("PUT", `/travelExpense/:unapprove?id=${te.id}`);
      if (unapRes._error) { failed++; continue; }
    }
    // Now delete (works for OPEN, DELIVERED, and unapproved)
    const delRes = await api("DELETE", `/travelExpense/${te.id}`);
    if (delRes._status === 204 || delRes._status === 200) {
      deleted++;
    } else {
      console.log(`  Failed to delete TE ${te.id} (state was ${te.state}): ${delRes._status}`);
      failed++;
    }
  }
  console.log(`\nCleanup result: deleted=${deleted}, failed=${failed}`);

  // Verify
  const verify = await api("GET", "/travelExpense?count=1&fields=id");
  console.log(`Remaining TEs after cleanup: ${verify.fullResultSize || verify.values?.length || 0}`);
  return (verify.fullResultSize || 0) === 0;
}

// ============================================================================
// STEP 2: E2E TESTS
// ============================================================================

// Test parameters (mimics production 3-day trip prompt)
const FLIGHT_AMOUNT = 3900;
const TAXI_AMOUNT = 350;
const DEPARTURE_DATE = "2026-03-20";
const RETURN_DATE = "2026-03-22"; // 3-day trip
const DESTINATION = "Stavanger";
const TITLE = "Kundebesøk Stavanger";

interface TestResult {
  label: string;
  teId: number;
  totalAmount: number;
  paymentAmount: number;
  state: string;
  isCompleted: boolean;
  voucherId: number | null;
  perDiemCount: number;
  perDiemRate: number | null;
  perDiemAmount: number | null;
  costCount: number;
  costs: Array<{ description: string; amount: number; vatTypeId: number }>;
  postings: Array<{ accountNumber: number; accountName: string; amount: number; amountGross: number }>;
}

async function runFullLifecycleTest(
  label: string,
  empId: number,
  flyCatId: number,
  taxiCatId: number,
  flyVatTypeId: number,
  taxiVatTypeId: number,
  payTypeId: number,
  departureFrom: string,
  perDiemConfig: "none" | "overnights" | "days"
): Promise<TestResult | null> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TEST: ${label}`);
  console.log(`Per-diem config: ${perDiemConfig}`);
  console.log(`${"=".repeat(70)}\n`);

  // Build payload
  const payload: any = {
    employee: { id: empId },
    title: TITLE,
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      departureDate: DEPARTURE_DATE,
      returnDate: RETURN_DATE,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: DESTINATION,
      detailedJourneyDescription: TITLE,
      purpose: TITLE,
    },
    costs: [
      {
        costCategory: { id: flyCatId },
        paymentType: { id: payTypeId },
        comments: "flybillett",
        amountCurrencyIncVat: FLIGHT_AMOUNT,
        amountNOKInclVAT: FLIGHT_AMOUNT,
        vatType: { id: flyVatTypeId },
        date: DEPARTURE_DATE,
      },
      {
        costCategory: { id: taxiCatId },
        paymentType: { id: payTypeId },
        comments: "taxi",
        amountCurrencyIncVat: TAXI_AMOUNT,
        amountNOKInclVAT: TAXI_AMOUNT,
        vatType: { id: taxiVatTypeId },
        date: RETURN_DATE,
      },
    ],
  };

  if (perDiemConfig === "none") {
    payload.travelDetails.isCompensationFromRates = false;
    // NO perDiemCompensations
  } else {
    payload.travelDetails.isCompensationFromRates = true;
    const count = perDiemConfig === "overnights" ? 2 : 3; // 3-day trip: 2 overnights or 3 days
    payload.perDiemCompensations = [
      {
        location: DESTINATION,
        count,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ];
  }

  console.log("Payload:", JSON.stringify(payload, null, 2));

  // ROUND 1: CREATE
  console.log("\n--- Round 1: CREATE ---");
  const createRes = await api("POST", "/travelExpense", payload);
  if (createRes._error) {
    console.log("CREATE FAILED:", JSON.stringify(createRes).slice(0, 500));
    return null;
  }
  const te = createRes.value;
  console.log(`  Created: id=${te.id}, state=${te.state}, amount=${te.amount}`);

  // ROUND 2: READBACK (detailed)
  console.log("\n--- Round 2: READBACK ---");
  const rb = await api("GET", `/travelExpense/${te.id}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*)),travelDetails(*)`);
  const rbv = rb.value;
  console.log("  Travel details:", JSON.stringify(rbv.travelDetails, null, 2));
  console.log(`  Amount: ${rbv.amount}, paymentAmount: ${rbv.paymentAmount}`);
  console.log(`  Per-diem compensations (${rbv.perDiemCompensations?.length || 0}):`);
  if (rbv.perDiemCompensations?.length > 0) {
    for (const pd of rbv.perDiemCompensations) {
      console.log(`    count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
      console.log(`    rateType: id=${pd.rateType?.id}, rate=${pd.rateType?.rate}`);
      console.log(`    rateCategory: id=${pd.rateCategory?.id}, name=${pd.rateCategory?.name}`);
      console.log(`    overnightAccommodation=${pd.overnightAccommodation}, location="${pd.location}"`);
      console.log(`    deductions: breakfast=${pd.isDeductionForBreakfast}, lunch=${pd.isDeductionForLunch}, dinner=${pd.isDeductionForDinner}`);
    }
  }
  console.log(`  Costs (${rbv.costs?.length || 0}):`);
  for (const c of rbv.costs || []) {
    console.log(`    "${c.comments}": amount=${c.amountNOKInclVAT}, vatType=${c.vatType?.id} (${c.vatType?.percentage}%), cat="${c.costCategory?.description}", date=${c.date}`);
  }

  // ROUND 3: DELIVER
  console.log("\n--- Round 3: DELIVER ---");
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
  if (deliverRes._error) {
    console.log("DELIVER FAILED");
    return null;
  }
  const delivered = deliverRes.values?.[0] || deliverRes.value;
  console.log(`  Delivered: state=${delivered.state}`);

  // ROUND 4: APPROVE
  console.log("\n--- Round 4: APPROVE ---");
  const approveRes = await api("PUT", `/travelExpense/:approve?id=${te.id}`);
  if (approveRes._error) {
    console.log("APPROVE FAILED");
    return null;
  }
  const approved = approveRes.values?.[0] || approveRes.value;
  console.log(`  Approved: state=${approved.state}, isApproved=${approved.isApproved}`);

  // ROUND 5: CREATE VOUCHERS
  console.log("\n--- Round 5: CREATE VOUCHERS ---");
  const cvRes = await api("PUT", `/travelExpense/:createVouchers?id=${te.id}&date=${RETURN_DATE}`);
  if (cvRes._error) {
    console.log("CREATE VOUCHERS FAILED");
    return null;
  }
  const vouchered = cvRes.values?.[0] || cvRes.value;
  console.log(`  CreateVouchers: state=${vouchered.state}, isCompleted=${vouchered.isCompleted}`);

  // ROUND 6: FINAL READBACK
  console.log("\n--- Round 6: FINAL READBACK ---");
  const finalRb = await api("GET", `/travelExpense/${te.id}?fields=*,perDiemCompensations(*),costs(*,costCategory(*)),voucher(*)`);
  const finalV = finalRb.value;
  console.log(`  FINAL STATE:`);
  console.log(`    amount=${finalV.amount}, paymentAmount=${finalV.paymentAmount}`);
  console.log(`    state=${finalV.state}, isCompleted=${finalV.isCompleted}`);
  console.log(`    voucher.id=${finalV.voucher?.id}, voucher.number=${finalV.voucher?.number}`);
  console.log(`    perDiemCompensations: ${finalV.perDiemCompensations?.length || 0}`);
  console.log(`    costs: ${finalV.costs?.length || 0}`);

  // ROUND 7: VOUCHER POSTINGS
  console.log("\n--- Round 7: VOUCHER POSTINGS ---");
  const postings: Array<{ accountNumber: number; accountName: string; amount: number; amountGross: number }> = [];
  if (finalV.voucher?.id) {
    const vRes = await api("GET", `/ledger/voucher/${finalV.voucher.id}?fields=*,postings(*,account(*))`);
    const voucher = vRes.value;
    console.log(`  Voucher: id=${voucher.id}, number=${voucher.number}, date=${voucher.date}`);
    console.log(`  Postings (${voucher.postings?.length || 0}):`);
    for (const p of voucher.postings || []) {
      console.log(`    ${p.account?.number} ${p.account?.name}: amount=${p.amount}, amountGross=${p.amountGross}`);
      postings.push({
        accountNumber: p.account?.number,
        accountName: p.account?.name,
        amount: p.amount,
        amountGross: p.amountGross,
      });
    }
  }

  const pd0 = rbv.perDiemCompensations?.[0];
  const costs = (rbv.costs || []).map((c: any) => ({
    description: c.comments,
    amount: c.amountNOKInclVAT,
    vatTypeId: c.vatType?.id,
  }));

  return {
    label,
    teId: te.id,
    totalAmount: finalV.amount,
    paymentAmount: finalV.paymentAmount,
    state: finalV.state,
    isCompleted: finalV.isCompleted,
    voucherId: finalV.voucher?.id || null,
    perDiemCount: rbv.perDiemCompensations?.length || 0,
    perDiemRate: pd0?.rate || null,
    perDiemAmount: pd0?.amount || null,
    costCount: costs.length,
    costs,
    postings,
  };
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  // STEP 1: Cleanup
  const cleanOk = await cleanupAllTravelExpenses();
  if (!cleanOk) {
    console.log("WARNING: Cleanup not fully complete, but continuing...\n");
  }

  // STEP 2: Get lookup data
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  STEP 2: LOOKUP DATA                                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const [empRes, catRes, payRes] = await Promise.all([
    api("GET", "/employee?count=1&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.values[0];
  const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = emp.address?.city || compRes.value?.address?.city || "Oslo";

  const cats = (catRes.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = cats.find((c: any) => c.description === "Fly");
  const taxiCat = cats.find((c: any) => c.description === "Taxi");
  const payType = (payRes.values || []).find((p: any) => p.showOnTravelExpenses);

  console.log(`Employee: id=${emp.id}, ${emp.firstName} ${emp.lastName}`);
  console.log(`DepartureFrom: ${departureFrom}`);
  console.log(`Fly: id=${flyCat.id}, vatType=${flyCat.vatType?.id}`);
  console.log(`Taxi: id=${taxiCat.id}, vatType=${taxiCat.vatType?.id}`);
  console.log(`PayType: id=${payType.id}`);

  // STEP 3: Run all 3 tests
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  STEP 3: RUN ALL HYPOTHESIS TESTS                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const results: TestResult[] = [];

  // Test A: No per-diem
  const resultA = await runFullLifecycleTest(
    "A: NO perDiemCompensations",
    emp.id, flyCat.id, taxiCat.id, flyCat.vatType?.id, taxiCat.vatType?.id, payType.id,
    departureFrom, "none"
  );
  if (resultA) results.push(resultA);

  // Test B: Per-diem with count=overnights (2 for 3-day trip)
  const resultB = await runFullLifecycleTest(
    "B: perDiem count=OVERNIGHTS (2)",
    emp.id, flyCat.id, taxiCat.id, flyCat.vatType?.id, taxiCat.vatType?.id, payType.id,
    departureFrom, "overnights"
  );
  if (resultB) results.push(resultB);

  // Test C: Per-diem with count=days (3 for 3-day trip)
  const resultC = await runFullLifecycleTest(
    "C: perDiem count=DAYS (3)",
    emp.id, flyCat.id, taxiCat.id, flyCat.vatType?.id, taxiCat.vatType?.id, payType.id,
    departureFrom, "days"
  );
  if (resultC) results.push(resultC);

  // STEP 4: COMPARISON TABLE
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  STEP 4: COMPARISON TABLE                                  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("| Field | A (no perDiem) | B (overnights=2) | C (days=3) |");
  console.log("|---|---|---|---|");
  for (const field of ["totalAmount", "paymentAmount", "state", "isCompleted", "voucherId", "perDiemCount", "perDiemRate", "perDiemAmount", "costCount"] as const) {
    console.log(`| ${field} | ${results[0]?.[field] ?? "N/A"} | ${results[1]?.[field] ?? "N/A"} | ${results[2]?.[field] ?? "N/A"} |`);
  }

  console.log("\nVoucher postings comparison:");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`\n${r.label}:`);
    for (const p of r.postings) {
      console.log(`  ${p.accountNumber} ${p.accountName}: amount=${p.amount}, amountGross=${p.amountGross}`);
    }
  }

  // KEY ANALYSIS
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  KEY ANALYSIS                                               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("Production prompt: 3-day trip, flight 3900, taxi 350");
  console.log(`Expected total WITHOUT per-diem: ${FLIGHT_AMOUNT + TAXI_AMOUNT}`);
  if (results[1]) {
    console.log(`Expected total WITH per-diem (overnights=2): flight+taxi + 2*rate = ${FLIGHT_AMOUNT + TAXI_AMOUNT} + 2*${results[1].perDiemRate} = ${FLIGHT_AMOUNT + TAXI_AMOUNT + 2 * (results[1].perDiemRate || 0)}`);
  }
  if (results[2]) {
    console.log(`Expected total WITH per-diem (days=3): flight+taxi + 3*rate = ${FLIGHT_AMOUNT + TAXI_AMOUNT} + 3*${results[2].perDiemRate} = ${FLIGHT_AMOUNT + TAXI_AMOUNT + 3 * (results[2].perDiemRate || 0)}`);
  }

  console.log("\n\nActual amounts:");
  for (const r of results) {
    console.log(`  ${r.label}: totalAmount=${r.totalAmount}, paymentAmount=${r.paymentAmount}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
