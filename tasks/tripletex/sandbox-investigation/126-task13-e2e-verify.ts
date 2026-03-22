/**
 * Task 13: Full E2E verification of the production flow.
 * Mirrors exactly what the agent should do: 7 calls, 0 errors.
 *
 * Round 1 (parallel): GET employee + GET costCategory + GET paymentType
 * Round 2 (conditional): GET company (for departureFrom)
 * Round 3: POST /travelExpense
 * Round 4: PUT /travelExpense/:deliver
 * Round 5: PUT /travelExpense/:approve
 *
 * Then full readback + end-state verification.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string, string> = { "Content-Type": "application/json", Authorization: AUTH };

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const callNum = callCount;
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch {
    if (r.ok) { console.log(`  [${callNum}] ${method} ${path} → ${r.status} (no body)`); return { ok: true, status: r.status, data: null }; }
    errorCount++;
    console.log(`  [${callNum}] ERR ${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
    return { ok: false, status: r.status, data: text };
  }
  if (!r.ok) {
    errorCount++;
    console.log(`  [${callNum}] ERR ${method} ${path} → ${r.status}: ${JSON.stringify(json.validationMessages || json.message || json).slice(0, 400)}`);
  } else {
    console.log(`  [${callNum}] ${method} ${path} → ${r.status} OK`);
  }
  return { ok: r.ok, status: r.status, data: json };
}

async function main() {
  // Pre-cleanup (not counted)
  callCount = 0;
  errorCount = 0;
  const listRes = await fetch(`${BASE}/travelExpense?count=1000&fields=id`, { headers: H });
  const listData = await listRes.json();
  for (const te of (listData?.values || [])) {
    await fetch(`${BASE}/travelExpense/${te.id}`, { method: "DELETE", headers: H });
  }
  callCount = 0;
  errorCount = 0;

  console.log("=== ROUND 1: Parallel lookups (3 calls) ===");
  const [empRes, catRes, ptRes] = await Promise.all([
    api("GET", "/employee?email=lucy.walker@example.org&count=10&fields=*"),
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ]);

  const emp = empRes.data?.values?.[0];
  if (!emp) throw new Error("Employee not found");

  const travelCats = (catRes.data?.values || []).filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  const payType = (ptRes.data?.values || []).find((p: any) => p.showOnTravelExpenses && !p.isInactive);

  if (!flyCat || !taxiCat || !payType) throw new Error("Missing category/payType");

  console.log(`  employee: id=${emp.id} name=${emp.firstName} ${emp.lastName} address=${emp.address?.city || "null"}`);
  console.log(`  Fly cat: id=${flyCat.id} vatType=${JSON.stringify(flyCat.vatType)}`);
  console.log(`  Taxi cat: id=${taxiCat.id} vatType=${JSON.stringify(taxiCat.vatType)}`);
  console.log(`  payType: id=${payType.id} desc="${payType.description}"`);

  // Round 2: conditional company lookup (employee has no address in sandbox)
  console.log("\n=== ROUND 2: Company lookup for departureFrom (1 call) ===");
  const compRes = await api("GET", `/company/${emp.companyId}?fields=*,address(*)`);
  const departureFrom = compRes.data?.value?.address?.city || "Oslo";
  console.log(`  departureFrom: "${departureFrom}"`);

  // Round 3: POST /travelExpense
  console.log("\n=== ROUND 3: Create travel expense (1 call) ===");
  const createRes = await api("POST", "/travelExpense", {
    employee: { id: emp.id },
    title: "Kundebesøk Trondheim",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-17",
      returnDate: "2026-03-21",
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Trondheim",
      detailedJourneyDescription: "Kundebesøk Trondheim",
      purpose: "Kundebesøk Trondheim",
    },
    perDiemCompensations: [{
      location: "Trondheim",
      count: 5,
      rate: 800,
      rateType: { id: 25888, rateCategory: { id: 740 } },
      overnightAccommodation: "HOTEL",
    }],
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        comments: "Flybillett",
        amountCurrencyIncVat: 2850,
        amountNOKInclVAT: 2850,
        vatType: { id: flyCat.vatType?.id ?? 0 },
        date: "2026-03-17",
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "Taxi",
        amountCurrencyIncVat: 200,
        amountNOKInclVAT: 200,
        vatType: { id: taxiCat.vatType?.id ?? 0 },
        date: "2026-03-21",
      },
    ],
  });

  if (!createRes.ok) throw new Error("CREATE FAILED");
  const teId = createRes.data.value.id;
  console.log(`  created: id=${teId}`);

  // Round 4: PUT /travelExpense/:deliver
  console.log("\n=== ROUND 4: Deliver (1 call) ===");
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${teId}`);
  if (!deliverRes.ok) throw new Error("DELIVER FAILED");
  const deliveredTE = deliverRes.data?.values?.[0];
  console.log(`  state after deliver: ${deliveredTE?.state}`);

  // Round 5: PUT /travelExpense/:approve
  console.log("\n=== ROUND 5: Approve (1 call) ===");
  const approveRes = await api("PUT", `/travelExpense/:approve?id=${teId}`);
  if (!approveRes.ok) throw new Error("APPROVE FAILED");
  const approvedTE = approveRes.data?.values?.[0];
  console.log(`  state after approve: ${approvedTE?.state}`);

  // === EXECUTION SUMMARY ===
  console.log(`\n=== EXECUTION SUMMARY ===`);
  console.log(`  Total API calls: ${callCount}`);
  console.log(`  Errors: ${errorCount}`);

  // === FULL END-STATE VERIFICATION ===
  console.log(`\n=== END-STATE VERIFICATION ===`);

  // Read everything back
  const [parentRes, pdRes, costRes, voucherRes] = await Promise.all([
    fetch(`${BASE}/travelExpense/${teId}?fields=*,voucher(*)`, { headers: H }).then(r => r.json()),
    fetch(`${BASE}/travelExpense/perDiemCompensation?travelExpenseId=${teId}&fields=*`, { headers: H }).then(r => r.json()),
    fetch(`${BASE}/travelExpense/cost?travelExpenseId=${teId}&fields=*`, { headers: H }).then(r => r.json()),
    fetch(`${BASE}/ledger/voucher?dateFrom=2026-03-01&dateTo=2026-03-31&fields=*&count=100`, { headers: H }).then(r => r.json()),
  ]);

  const parent = parentRes?.value;
  const perDiems = pdRes?.values || [];
  const costs = costRes?.values || [];

  console.log("\n--- Parent Travel Expense ---");
  console.log(`  id: ${parent?.id}`);
  console.log(`  state: ${parent?.state}`);
  console.log(`  isCompleted: ${parent?.isCompleted}`);
  console.log(`  isApproved: ${parent?.isApproved}`);
  console.log(`  title: "${parent?.title}"`);
  console.log(`  amount: ${parent?.amount}`);
  console.log(`  paymentAmount: ${parent?.paymentAmount}`);
  console.log(`  voucher: ${JSON.stringify(parent?.voucher)}`);
  console.log(`  employee.id: ${parent?.employee?.id}`);
  console.log(`  approvedBy.id: ${parent?.approvedBy?.id}`);
  console.log(`  completedBy.id: ${parent?.completedBy?.id}`);

  console.log("\n--- Travel Details ---");
  const td = parent?.travelDetails;
  console.log(`  departureDate: ${td?.departureDate}`);
  console.log(`  returnDate: ${td?.returnDate}`);
  console.log(`  departureTime: ${td?.departureTime}`);
  console.log(`  returnTime: ${td?.returnTime}`);
  console.log(`  departureFrom: "${td?.departureFrom}"`);
  console.log(`  destination: "${td?.destination}"`);
  console.log(`  purpose: "${td?.purpose}"`);
  console.log(`  detailedJourneyDescription: "${td?.detailedJourneyDescription}"`);
  console.log(`  isForeignTravel: ${td?.isForeignTravel}`);
  console.log(`  isDayTrip: ${td?.isDayTrip}`);
  console.log(`  isCompensationFromRates: ${td?.isCompensationFromRates}`);

  console.log("\n--- Per-Diem Compensations ---");
  for (const pd of perDiems) {
    console.log(`  id=${pd.id}`);
    console.log(`    location: "${pd.location}"`);
    console.log(`    count: ${pd.count}`);
    console.log(`    rate: ${pd.rate}`);
    console.log(`    amount: ${pd.amount}`);
    console.log(`    overnightAccommodation: ${pd.overnightAccommodation}`);
    console.log(`    rateType: ${JSON.stringify(pd.rateType)}`);
    console.log(`    rateCategory: ${JSON.stringify(pd.rateCategory)}`);
    console.log(`    isDeductionForBreakfast: ${pd.isDeductionForBreakfast}`);
    console.log(`    isDeductionForLunch: ${pd.isDeductionForLunch}`);
    console.log(`    isDeductionForDinner: ${pd.isDeductionForDinner}`);
    console.log(`    countryCode: ${pd.countryCode}`);
  }

  console.log("\n--- Costs ---");
  for (const c of costs) {
    console.log(`  id=${c.id} "${c.comments}"`);
    console.log(`    costCategory: ${JSON.stringify(c.costCategory)}`);
    console.log(`    paymentType: ${JSON.stringify(c.paymentType)}`);
    console.log(`    amountNOKInclVAT: ${c.amountNOKInclVAT}`);
    console.log(`    amountNOKExclVAT: ${c.amountNOKExclVAT}`);
    console.log(`    vatType: ${JSON.stringify(c.vatType)}`);
    console.log(`    vatAmount: ${c.vatAmount}`);
    console.log(`    date: ${c.date}`);
    console.log(`    isPaidByEmployee: ${c.isPaidByEmployee}`);
  }

  // === ASSERTIONS ===
  console.log("\n=== ASSERTIONS ===");
  const assertions: [string, boolean][] = [
    ["state === APPROVED", parent?.state === "APPROVED"],
    ["isCompleted === true", parent?.isCompleted === true],
    ["isApproved === true", parent?.isApproved === true],
    ["title matches", parent?.title === "Kundebesøk Trondheim"],
    ["employee.id matches", parent?.employee?.id === emp.id],
    ["departureDate === 2026-03-17", td?.departureDate === "2026-03-17"],
    ["returnDate === 2026-03-21", td?.returnDate === "2026-03-21"],
    ["destination === Trondheim", td?.destination === "Trondheim"],
    ["isForeignTravel === false", td?.isForeignTravel === false],
    ["isDayTrip === false", td?.isDayTrip === false],
    ["isCompensationFromRates === true", td?.isCompensationFromRates === true],
    ["1 per-diem entry", perDiems.length === 1],
    ["perDiem.count === 5", perDiems[0]?.count === 5],
    ["perDiem.rate === 800", perDiems[0]?.rate === 800],
    ["perDiem.amount === 4000", perDiems[0]?.amount === 4000],
    ["perDiem.overnightAccommodation === HOTEL", perDiems[0]?.overnightAccommodation === "HOTEL"],
    ["2 cost entries", costs.length === 2],
    ["cost[0] Flybillett amount=2850", costs.find((c: any) => c.comments === "Flybillett")?.amountNOKInclVAT === 2850],
    ["cost[1] Taxi amount=200", costs.find((c: any) => c.comments === "Taxi")?.amountNOKInclVAT === 200],
    ["cost vatType=12 (Fly)", costs.find((c: any) => c.comments === "Flybillett")?.vatType?.id === 12],
    ["cost vatType=12 (Taxi)", costs.find((c: any) => c.comments === "Taxi")?.vatType?.id === 12],
    ["total amount > 0", parent?.amount > 0],
    ["0 errors in flow", errorCount === 0],
    ["7 API calls total", callCount === 7],
  ];

  let passed = 0;
  let failed = 0;
  for (const [label, result] of assertions) {
    const status = result ? "PASS" : "FAIL";
    if (!result) failed++;
    else passed++;
    console.log(`  [${status}] ${label}`);
  }

  console.log(`\n  ${passed}/${assertions.length} passed, ${failed} failed`);

  // Cleanup
  await fetch(`${BASE}/travelExpense/${teId}`, { method: "DELETE", headers: H });
  console.log("\n=== CLEANED UP ===");
}

main().catch(e => { console.error(e); process.exit(1); });
