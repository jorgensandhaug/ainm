/**
 * Task 13 Deep Analysis — Phase 3: Additional hypothesis tests
 *
 * From Phase 2 we know all 3 base approaches work E2E. Now test more variants:
 *   D) perDiem count=overnights + rate=800 (prompt rate) — does system override?
 *   E) perDiem count=overnights + rate=800 + amount=1600 (explicit)
 *   F) 5-day trip variant (count=4 overnights vs count=5 days)
 *   G) 2-day trip variant (count=1 overnight vs count=2 days) — critical edge case
 *
 * Also: deep readback of all per-diem fields to understand what scorer might check
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
  return { _status: r.status, ...json };
}

const EMP_ID = 18441996;
const FLY_CAT = 32813722;
const TAXI_CAT = 32813737;
const VAT_TYPE = 12;
const PAY_TYPE = 32813706;

interface TestResult {
  label: string;
  totalAmount: number;
  perDiemCount: number | null;
  perDiemRate: number | null;
  perDiemAmount: number | null;
  postingsSummary: string;
}

async function runTest(
  label: string,
  depDate: string,
  retDate: string,
  flightAmt: number,
  taxiAmt: number,
  perDiemOpts?: { count: number; rate?: number; amount?: number }
): Promise<TestResult | null> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`${"=".repeat(60)}`);

  const payload: any = {
    employee: { id: EMP_ID },
    title: "Kundebesøk Test",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      departureDate: depDate,
      returnDate: retDate,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom: "Oslo",
      destination: "Stavanger",
      detailedJourneyDescription: "Test",
      purpose: "Test",
      isCompensationFromRates: !!perDiemOpts,
    },
    costs: [
      { costCategory: { id: FLY_CAT }, paymentType: { id: PAY_TYPE }, comments: "flybillett", amountCurrencyIncVat: flightAmt, amountNOKInclVAT: flightAmt, vatType: { id: VAT_TYPE }, date: depDate },
      { costCategory: { id: TAXI_CAT }, paymentType: { id: PAY_TYPE }, comments: "taxi", amountCurrencyIncVat: taxiAmt, amountNOKInclVAT: taxiAmt, vatType: { id: VAT_TYPE }, date: retDate },
    ],
  };

  if (perDiemOpts) {
    const pd: any = {
      location: "Stavanger",
      count: perDiemOpts.count,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    };
    if (perDiemOpts.rate !== undefined) pd.rate = perDiemOpts.rate;
    if (perDiemOpts.amount !== undefined) pd.amount = perDiemOpts.amount;
    payload.perDiemCompensations = [pd];
  }

  // Create
  const createRes = await api("POST", "/travelExpense", payload);
  if (createRes._error) return null;
  const teId = createRes.value.id;

  // Deliver → Approve → CreateVouchers
  const delRes = await api("PUT", `/travelExpense/:deliver?id=${teId}`);
  if (delRes._error) return null;
  const appRes = await api("PUT", `/travelExpense/:approve?id=${teId}`);
  if (appRes._error) return null;
  const cvRes = await api("PUT", `/travelExpense/:createVouchers?id=${teId}&date=${retDate}`);
  if (cvRes._error) return null;

  // Full readback
  const teRb = await api("GET", `/travelExpense/${teId}?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*)),voucher(*)`);
  const v = teRb.value;

  // Deep per-diem readback
  const pd = v.perDiemCompensations?.[0];
  if (pd) {
    console.log(`  PerDiem: count=${pd.count}, rate=${pd.rate}, amount=${pd.amount}`);
    console.log(`    rateType.id=${pd.rateType?.id}, rateType.rate=${pd.rateType?.rate}`);
    console.log(`    overnightAccommodation=${pd.overnightAccommodation}, location="${pd.location}"`);
  } else {
    console.log(`  PerDiem: NONE`);
  }
  console.log(`  Total: amount=${v.amount}, paymentAmount=${v.paymentAmount}`);

  // Voucher postings
  let postingSummary = "";
  if (v.voucher?.id) {
    const vRes = await api("GET", `/ledger/voucher/${v.voucher.id}?fields=*,postings(*,account(*))`);
    const postings = vRes.value?.postings || [];
    const parts: string[] = [];
    for (const p of postings) {
      parts.push(`${p.account?.number}:${p.amount}`);
      console.log(`  Posting: ${p.account?.number} ${p.account?.name}: ${p.amount}`);
    }
    postingSummary = parts.join(", ");
  }

  return {
    label,
    totalAmount: v.amount,
    perDiemCount: pd?.count ?? null,
    perDiemRate: pd?.rate ?? null,
    perDiemAmount: pd?.amount ?? null,
    postingsSummary: postingSummary,
  };
}

async function main() {
  const results: TestResult[] = [];

  // D: count=2 (overnights) + rate=800 (explicit prompt rate) — 3-day trip
  const d = await runTest("D: 3-day, count=2(overnights), rate=800",
    "2026-03-20", "2026-03-22", 3900, 350,
    { count: 2, rate: 800, amount: 1600 });
  if (d) results.push(d);

  // E: count=2 (overnights), NO rate (system fills) — 3-day trip (same as Phase 2 Test B)
  const e = await runTest("E: 3-day, count=2(overnights), auto-rate",
    "2026-03-20", "2026-03-22", 3900, 350,
    { count: 2 });
  if (e) results.push(e);

  // F: 5-day trip, count=4 (overnights) — matching Spanish 5-day prompt
  const f = await runTest("F: 5-day, count=4(overnights), auto-rate",
    "2026-03-18", "2026-03-22", 2750, 700,
    { count: 4 });
  if (f) results.push(f);

  // G: 5-day trip, count=5 (days) — baseline comparison
  const g = await runTest("G: 5-day, count=5(days), auto-rate",
    "2026-03-18", "2026-03-22", 2750, 700,
    { count: 5 });
  if (g) results.push(g);

  // H: 2-day trip, count=1 (overnight) — edge case
  const h = await runTest("H: 2-day, count=1(overnight), auto-rate",
    "2026-03-21", "2026-03-22", 2500, 600,
    { count: 1 });
  if (h) results.push(h);

  // I: 2-day trip, count=2 (days) — baseline comparison
  const i = await runTest("I: 2-day, count=2(days), auto-rate",
    "2026-03-21", "2026-03-22", 2500, 600,
    { count: 2 });
  if (i) results.push(i);

  // J: 4-day trip, count=3 (overnights)
  const j = await runTest("J: 4-day, count=3(overnights), auto-rate",
    "2026-03-19", "2026-03-22", 6150, 750,
    { count: 3 });
  if (j) results.push(j);

  // K: 3-day trip, NO perDiem (control)
  const k = await runTest("K: 3-day, NO perDiem",
    "2026-03-20", "2026-03-22", 3900, 350);
  if (k) results.push(k);

  // Summary
  console.log("\n\n" + "=".repeat(70));
  console.log("COMPREHENSIVE COMPARISON");
  console.log("=".repeat(70));
  console.log("\n| Test | Total | PD count | PD rate | PD amount | Key postings |");
  console.log("|---|---|---|---|---|---|");
  for (const r of results) {
    console.log(`| ${r.label} | ${r.totalAmount} | ${r.perDiemCount ?? '-'} | ${r.perDiemRate ?? '-'} | ${r.perDiemAmount ?? '-'} | ${r.postingsSummary.split(', ').filter(p => !p.startsWith('2712') && !p.startsWith('7140')).join(', ')} |`);
  }

  console.log("\n\nKEY FINDINGS:");
  console.log("=============");

  // Check if rate=800 is stored or overridden
  const dResult = results.find(r => r.label.includes("rate=800"));
  if (dResult) {
    console.log(`\nrate=800 with count=2: stored rate=${dResult.perDiemRate}, amount=${dResult.perDiemAmount}`);
    console.log(`  → System ${dResult.perDiemRate === 800 ? 'KEEPS' : 'OVERRIDES'} the explicit rate`);
    console.log(`  → Per-diem amount: ${dResult.perDiemAmount} (expected 2×800=1600 if kept, 2×1012=2024 if overridden)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
