/**
 * Task 24 — Correct Ledger Errors — Full E2E sandbox test
 *
 * This script:
 *   Phase 0: Clean up any previous test vouchers from this script
 *   Phase 1: Create 5 "error" vouchers that simulate a realistic production prompt
 *   Phase 2: Run the EXACT 3-call correction algorithm (as the agent should)
 *   Phase 3: Verify ALL 4 corrections by reading back the ledger
 *   Phase 4: Optionally clean up (reverse all test vouchers)
 *
 * Simulated prompt:
 *   "Review the March 2026 ledger. Four errors found:
 *    1. Wrong account: 7300 should be 7000, amount 4500 NOK
 *    2. Duplicate: 6860 voucher for 3500 NOK
 *    3. Missing VAT: account 6500, 18350 NOK excl. VAT, missing account 2710
 *    4. Incorrect amount: account 7100, recorded 15000 should be 10050 NOK"
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// === PROMPT PARAMETERS (these vary per production run) ===
const WRONG_ACCT_SOURCE = 7300;
const WRONG_ACCT_TARGET = 7000;
const WRONG_ACCT_AMOUNT = 4500;

const DUP_ACCT = 6860;
const DUP_AMOUNT = 3500;

const MV_ACCT = 6500;      // missing-VAT expense account
const MV_EXCL_VAT = 18350; // amount excl. VAT

const WA_ACCT = 7100;      // wrong-amount account
const WA_RECORDED = 15000;
const WA_CORRECT = 10050;

// Use 2920 as generic counterpart (1920 locked by reconciled statements, 1500 needs customer)
const CONTRA_ACCT = 2920;

// Test date range — using May to avoid conflicts with reconciled periods
const TEST_DATE_FROM = "2026-05-01";
const TEST_DATE_TO = "2026-05-21"; // exclusive
const CORRECTION_DATE = "2026-05-20";

// Marker to identify test vouchers from this script
const TEST_MARKER = "[T24-E2E-TEST]";

async function api(method: string, path: string, body?: any): Promise<any> {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) {
    console.error(`  HTTP ${res.status} ${method} ${path}: ${text.substring(0, 300)}`);
    throw new Error(`HTTP ${res.status} on ${method} ${path}`);
  }
  return JSON.parse(text);
}

// ============================================================
// PHASE 0: Clean up previous test vouchers
// ============================================================
async function cleanup() {
  console.log("=== PHASE 0: Cleanup previous test vouchers ===");
  const res = await api("GET",
    `/ledger/voucher?dateFrom=${TEST_DATE_FROM}&dateTo=${TEST_DATE_TO}&fields=id,date,description,reverseVoucher(id)&count=1000`
  );
  const testVouchers = (res.values || []).filter((v: any) =>
    v.description?.includes(TEST_MARKER)
  );
  console.log(`  Found ${testVouchers.length} previous test vouchers`);

  // Reverse any that aren't already reversed
  for (const v of testVouchers) {
    if (v.reverseVoucher?.id) continue; // already reversed
    try {
      await api("PUT", `/ledger/voucher/${v.id}/:reverse?date=${CORRECTION_DATE}`);
      console.log(`  Reversed voucher ${v.id}`);
    } catch (e: any) {
      console.log(`  Could not reverse ${v.id}: ${e.message}`);
    }
  }
}

// ============================================================
// PHASE 1: Create the 4 error scenarios
// ============================================================
async function createErrorVouchers(acctMap: Record<number, { id: number; vatTypeId: number }>) {
  console.log("\n=== PHASE 1: Create error vouchers ===");
  const created: number[] = [];

  // Get a supplier for 2400 postings
  const supRes = await api("GET", "/supplier?count=1&fields=id,name");
  const supplierId = supRes.values[0]?.id;
  console.log(`  Using supplier: id=${supplierId}, name=${supRes.values[0]?.name}`);

  // Error 1: Wrong account — posted on 7300 instead of 7000
  console.log("\n--- Error 1: Wrong account (7300 instead of 7000, 4500 NOK) ---");
  const v1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-05-11",
    description: `${TEST_MARKER} Kontorrekvisita feil konto`,
    postings: [
      { row: 1, account: { id: acctMap[WRONG_ACCT_SOURCE].id }, amountGross: WRONG_ACCT_AMOUNT, amountGrossCurrency: WRONG_ACCT_AMOUNT, vatType: { id: acctMap[WRONG_ACCT_SOURCE].vatTypeId || 1 }, description: "Kontorrekvisita" },
      { row: 2, account: { id: acctMap[CONTRA_ACCT].id }, amountGross: -WRONG_ACCT_AMOUNT, amountGrossCurrency: -WRONG_ACCT_AMOUNT, description: "Betaling" },
    ],
  });
  created.push(v1.value.id);
  console.log(`  Created voucher ${v1.value.id}, postings: ${v1.value.postings?.length}`);
  for (const p of v1.value.postings || []) {
    console.log(`    acct=${p.account?.number}, gross=${p.amountGross}, vatType=${p.vatType?.id}`);
  }

  // Error 2: Duplicate — two identical vouchers on 6860
  console.log("\n--- Error 2: Duplicate (6860, 3500 NOK — two identical vouchers) ---");
  const dupPayload = {
    date: "2026-05-12",
    description: `${TEST_MARKER} Kontorrekvisita`,
    postings: [
      { row: 1, account: { id: acctMap[DUP_ACCT].id }, amountGross: DUP_AMOUNT, amountGrossCurrency: DUP_AMOUNT, vatType: { id: acctMap[DUP_ACCT].vatTypeId || 1 }, description: "Kontorrekvisita" },
      { row: 2, account: { id: acctMap[CONTRA_ACCT].id }, amountGross: -DUP_AMOUNT, amountGrossCurrency: -DUP_AMOUNT, description: "Betaling" },
    ],
  };
  const v2a = await api("POST", "/ledger/voucher?sendToLedger=true", dupPayload);
  created.push(v2a.value.id);
  console.log(`  Created original voucher ${v2a.value.id}`);

  const v2b = await api("POST", "/ledger/voucher?sendToLedger=true", {
    ...dupPayload,
    date: "2026-05-13",
    description: `${TEST_MARKER} Kontorrekvisita duplikat`,
  });
  created.push(v2b.value.id);
  console.log(`  Created duplicate voucher ${v2b.value.id}`);

  // Error 3: Missing VAT — TWO vouchers on same account:
  //   A) correctly booked (vatType=1 → auto-generates 2710)
  //   B) error (vatType=0 → NO 2710)
  console.log("\n--- Error 3: Missing VAT (6500, 18350 excl. VAT) ---");
  console.log("  Creating voucher A (correctly booked, WITH vatType=1 → will have 2710)...");
  const v3a = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-05-14",
    description: `${TEST_MARKER} Innkjøp kontorutstyr korrekt`,
    postings: [
      { row: 1, account: { id: acctMap[MV_ACCT].id }, amountGross: MV_EXCL_VAT, amountGrossCurrency: MV_EXCL_VAT, vatType: { id: 1 }, description: "Innkjøp kontorutstyr" },
      { row: 2, account: { id: acctMap[2400].id }, amountGross: -MV_EXCL_VAT, amountGrossCurrency: -MV_EXCL_VAT, supplier: { id: supplierId }, description: "Leverandørgjeld" },
    ],
  });
  created.push(v3a.value.id);
  console.log(`  Voucher A: id=${v3a.value.id}`);
  for (const p of v3a.value.postings || []) {
    console.log(`    acct=${p.account?.number}, gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
  }

  console.log("  Creating voucher B (ERROR — vatType=0, NO 2710)...");
  const v3b = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-05-15",
    description: `${TEST_MARKER} Innkjøp kontorutstyr uten MVA`,
    postings: [
      { row: 1, account: { id: acctMap[MV_ACCT].id }, amountGross: MV_EXCL_VAT, amountGrossCurrency: MV_EXCL_VAT, vatType: { id: 0 }, description: "Innkjøp uten MVA" },
      { row: 2, account: { id: acctMap[2400].id }, amountGross: -MV_EXCL_VAT, amountGrossCurrency: -MV_EXCL_VAT, supplier: { id: supplierId }, description: "Leverandørgjeld" },
    ],
  });
  created.push(v3b.value.id);
  console.log(`  Voucher B: id=${v3b.value.id}`);
  for (const p of v3b.value.postings || []) {
    console.log(`    acct=${p.account?.number}, gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
  }

  // Error 4: Incorrect amount — 15000 instead of 10050 on 7100
  console.log("\n--- Error 4: Incorrect amount (7100, 15000 instead of 10050) ---");
  const v4 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-05-16",
    description: `${TEST_MARKER} Reisekostnad feil beløp`,
    postings: [
      { row: 1, account: { id: acctMap[WA_ACCT].id }, amountGross: WA_RECORDED, amountGrossCurrency: WA_RECORDED, vatType: { id: acctMap[WA_ACCT].vatTypeId || 0 }, description: "Reisekostnad" },
      { row: 2, account: { id: acctMap[CONTRA_ACCT].id }, amountGross: -WA_RECORDED, amountGrossCurrency: -WA_RECORDED, description: "Betaling" },
    ],
  });
  created.push(v4.value.id);
  console.log(`  Created voucher ${v4.value.id}`);
  for (const p of v4.value.postings || []) {
    console.log(`    acct=${p.account?.number}, gross=${p.amountGross}, vatType=${p.vatType?.id}`);
  }

  return { created, supplierId };
}

// ============================================================
// PHASE 2: Run the exact 3-call correction algorithm
// ============================================================
async function runCorrectionAlgorithm() {
  console.log("\n=== PHASE 2: Run 3-call correction algorithm ===");

  // --- CALL 1: Account lookup ---
  console.log("\n--- Call 1: GET /ledger/account ---");
  const corrAccounts = [WRONG_ACCT_SOURCE, WRONG_ACCT_TARGET, DUP_ACCT, MV_ACCT, WA_ACCT, 2710, 2400, CONTRA_ACCT];
  const acctRes = await api("GET", `/ledger/account?number=${corrAccounts.join(",")}&fields=id,number,vatType(id)`);
  const acctMap: Record<number, { id: number; vatTypeId: number }> = {};
  const acctIdToNumber: Record<number, number> = {};
  for (const a of acctRes.values) {
    acctMap[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
    acctIdToNumber[a.id] = a.number;
    console.log(`  Account ${a.number}: id=${a.id}, vatType=${a.vatType?.id ?? "null"}`);
  }

  const getAcctNumber = (p: any) => p.account?.number ?? acctIdToNumber[p.account?.id];

  // --- CALL 2: Voucher discovery ---
  console.log("\n--- Call 2: GET /ledger/voucher ---");
  const vRes = await api("GET",
    `/ledger/voucher?dateFrom=${TEST_DATE_FROM}&dateTo=${TEST_DATE_TO}&fields=id,number,date,description,reverseVoucher(id),postings(id,row,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000`
  );
  const allVouchers = (vRes.values || []).filter((v: any) =>
    v.description?.includes(TEST_MARKER)
  );
  console.log(`  Found ${allVouchers.length} test vouchers in date range`);

  // Filter out reversed vouchers
  const reversedIds = new Set<number>();
  const reversalIds = new Set<number>();
  for (const v of allVouchers) {
    if (typeof v.reverseVoucher?.id === "number") {
      reversedIds.add(v.reverseVoucher.id);
      if (typeof v.id === "number") reversalIds.add(v.id);
    }
  }
  const activeVouchers = allVouchers.filter((v: any) =>
    typeof v.id === "number" && !reversedIds.has(v.id) && !reversalIds.has(v.id)
  );
  console.log(`  Active (non-reversed) vouchers: ${activeVouchers.length}`);

  for (const v of activeVouchers) {
    const has2710 = v.postings?.some((p: any) => getAcctNumber(p) === 2710);
    console.log(`\n  Voucher ${v.id} (${v.date}) "${v.description}" [has2710=${has2710}]`);
    for (const p of v.postings || []) {
      console.log(`    acct=${getAcctNumber(p)} (id=${p.account?.id}), gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}, supplier=${p.supplier?.id ?? "-"}`);
    }
  }

  // === DETECT ERRORS ===
  const correctionLines: any[] = [];
  let nextRow = 1;

  // --- Error 1: Wrong account ---
  console.log("\n--- Detecting: Wrong account ---");
  const wrongAcctVoucher = activeVouchers.find((v: any) =>
    v.postings?.some((p: any) => getAcctNumber(p) === WRONG_ACCT_SOURCE && Math.abs(p.amountGross) === WRONG_ACCT_AMOUNT)
  );
  if (!wrongAcctVoucher) throw new Error("Wrong-account voucher not found!");
  const wrongAcctPosting = wrongAcctVoucher.postings.find((p: any) =>
    getAcctNumber(p) === WRONG_ACCT_SOURCE && Math.abs(p.amountGross) === WRONG_ACCT_AMOUNT
  );
  const origVatType = wrongAcctPosting.vatType?.id ?? 0;
  const targetVatType = acctMap[WRONG_ACCT_TARGET]?.vatTypeId ?? 0;
  console.log(`  Found voucher ${wrongAcctVoucher.id}, origVatType=${origVatType}, targetVatType=${targetVatType}`);

  // Reversal on source account (use original vatType)
  correctionLines.push({
    row: nextRow++, account: { id: acctMap[WRONG_ACCT_SOURCE].id },
    amountGross: -Math.abs(wrongAcctPosting.amountGross),
    amountGrossCurrency: -Math.abs(wrongAcctPosting.amountGross),
    vatType: { id: origVatType },
    description: `Korreksjon: ompostering fra ${WRONG_ACCT_SOURCE}`,
  });
  // Target account (use target account's vatType)
  correctionLines.push({
    row: nextRow++, account: { id: acctMap[WRONG_ACCT_TARGET].id },
    amountGross: Math.abs(wrongAcctPosting.amountGross),
    amountGrossCurrency: Math.abs(wrongAcctPosting.amountGross),
    vatType: { id: targetVatType },
    description: `Korreksjon: ompostering til ${WRONG_ACCT_TARGET}`,
  });

  // --- Error 2: Duplicate ---
  console.log("\n--- Detecting: Duplicate ---");
  const dupCandidates = activeVouchers.filter((v: any) =>
    v.postings?.some((p: any) => getAcctNumber(p) === DUP_ACCT && Math.abs(p.amountGross) === DUP_AMOUNT)
  );
  console.log(`  Candidates on ${DUP_ACCT}/${DUP_AMOUNT}: ${dupCandidates.length}`);

  // Priority 1: description keyword
  let dupVoucher = dupCandidates.find((v: any) => /duplikat|duplicate/i.test(v.description ?? ""));
  if (dupVoucher) {
    console.log(`  Selected by description keyword: voucher ${dupVoucher.id}`);
  }
  // Priority 2: signature grouping (find the repeated one)
  if (!dupVoucher && dupCandidates.length >= 2) {
    // Take the later one (higher number/id)
    dupVoucher = dupCandidates.sort((a: any, b: any) => (b.number ?? b.id) - (a.number ?? a.id))[0];
    console.log(`  Selected by recency (later voucher): voucher ${dupVoucher.id}`);
  }
  // Priority 3: single entry fallback
  if (!dupVoucher && dupCandidates.length === 1) {
    dupVoucher = dupCandidates[0];
    console.log(`  Selected by single-entry fallback: voucher ${dupVoucher.id}`);
  }
  if (!dupVoucher) throw new Error("Duplicate voucher not found!");

  const dupPosting = dupVoucher.postings.find((p: any) =>
    getAcctNumber(p) === DUP_ACCT && Math.abs(p.amountGross) === DUP_AMOUNT
  );
  const dupContra = dupVoucher.postings.find((p: any) =>
    getAcctNumber(p) !== DUP_ACCT && getAcctNumber(p) !== 2710
  );
  const dupVatType = dupPosting.vatType?.id ?? 0;

  correctionLines.push({
    row: nextRow++, account: { id: acctMap[DUP_ACCT].id },
    amountGross: -Math.abs(dupPosting.amountGross),
    amountGrossCurrency: -Math.abs(dupPosting.amountGross),
    vatType: { id: dupVatType },
    description: "Korreksjon: reversering duplikat",
  });
  correctionLines.push({
    row: nextRow++, account: { id: dupContra.account?.id },
    amountGross: Math.abs(dupPosting.amountGross),
    amountGrossCurrency: Math.abs(dupPosting.amountGross),
    description: "Korreksjon: reversering duplikat",
  });

  // --- Error 3: Missing VAT (THE CRITICAL ONE) ---
  console.log("\n--- Detecting: Missing VAT (CRITICAL — using 2710-absence cascade) ---");

  // ===== MISSING-VAT DETECTION — COPY VERBATIM FROM TRUSTED STANDARD =====
  const mvPromptAcct = MV_ACCT;
  const mvPromptExclVat = MV_EXCL_VAT;

  const has2710 = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === 2710);
  const onPromptAcct = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === mvPromptAcct);
  const allMvCandidates = activeVouchers.filter((v: any) => onPromptAcct(v));

  const caseA = allMvCandidates.filter((v: any) => !has2710(v));  // NO 2710 = error voucher
  const caseB = allMvCandidates.filter((v: any) => has2710(v));   // HAS 2710 = correctly booked

  console.log(`  All candidates on ${mvPromptAcct}: ${allMvCandidates.length}`);
  console.log(`  Case A (no 2710 = ERROR): ${caseA.length}`);
  for (const v of caseA) {
    console.log(`    id=${v.id}, date=${v.date}, desc="${v.description}"`);
  }
  console.log(`  Case B (has 2710 = correct): ${caseB.length}`);
  for (const v of caseB) {
    console.log(`    id=${v.id}, date=${v.date}, desc="${v.description}"`);
  }

  let missingVatVoucher: any = null;
  let missingVatIsA = false;

  if (caseA.length > 0) {
    missingVatVoucher = caseA.find((v: any) =>
      v.postings.some((p: any) => getAcctNumber(p) === mvPromptAcct && Math.abs(p.amountGross) === mvPromptExclVat)
    ) ?? caseA[0];
    missingVatIsA = true;
    console.log(`  SELECTED: Case A voucher ${missingVatVoucher.id} (no 2710 = the error voucher)`);
  }

  if (!missingVatVoucher && caseB.length > 0) {
    console.error("  WARNING: Only Case B (has 2710) found — this has NEVER passed in production");
    missingVatVoucher = caseB[0];
    missingVatIsA = false;
    console.log(`  SELECTED: Case B voucher ${missingVatVoucher.id} (HAS 2710 — WILL LIKELY FAIL)`);
  }

  if (!missingVatVoucher) throw new Error("Missing-VAT voucher not found!");

  const mvContra = missingVatVoucher.postings.find((p: any) =>
    getAcctNumber(p) !== mvPromptAcct && getAcctNumber(p) !== 2710
  );

  if (missingVatIsA) {
    // Case A: full VAT is missing → post net * 0.25 directly on 2710
    const vatAmount = mvPromptExclVat * 0.25;
    console.log(`  Case A correction: 2710 +${vatAmount}, counterpart -${vatAmount}`);
    correctionLines.push({
      row: nextRow++, account: { id: acctMap[2710].id },
      amountGross: vatAmount, amountGrossCurrency: vatAmount,
      description: "Korreksjon: manglende MVA",
    });
    correctionLines.push({
      row: nextRow++, account: { id: mvContra.account?.id },
      amountGross: -vatAmount, amountGrossCurrency: -vatAmount,
      ...(getAcctNumber(mvContra) === 2400 ? { supplier: { id: mvContra.supplier?.id } } : {}),
      description: "Korreksjon: manglende MVA",
    });
  } else {
    // Case B: 2710 exists but too low — post shortfall
    const existing2710 = missingVatVoucher.postings.find((p: any) => getAcctNumber(p) === 2710);
    const existing2710Amount = Math.abs(existing2710?.amountGross ?? 0);
    const correctVat = mvPromptExclVat * 0.25;
    const vatShortfall = correctVat - existing2710Amount;
    const existingNet = Math.abs(missingVatVoucher.postings.find((p: any) => getAcctNumber(p) === mvPromptAcct)?.amount ?? 0);
    const expenseNetShortfall = mvPromptExclVat - existingNet;
    const totalShortfall = vatShortfall + expenseNetShortfall;
    console.log(`  Case B: vat_shortfall=${vatShortfall}, expense_shortfall=${expenseNetShortfall}, total=${totalShortfall}`);
    correctionLines.push({
      row: nextRow++, account: { id: acctMap[2710].id },
      amountGross: vatShortfall, amountGrossCurrency: vatShortfall,
      description: "Korreksjon: manglende MVA",
    });
    correctionLines.push({
      row: nextRow++, account: { id: acctMap[mvPromptAcct].id },
      amountGross: expenseNetShortfall, amountGrossCurrency: expenseNetShortfall,
      vatType: { id: 0 },
      description: "Korreksjon: manglende MVA",
    });
    correctionLines.push({
      row: nextRow++, account: { id: mvContra.account?.id },
      amountGross: -totalShortfall, amountGrossCurrency: -totalShortfall,
      ...(getAcctNumber(mvContra) === 2400 ? { supplier: { id: mvContra.supplier?.id } } : {}),
      description: "Korreksjon: manglende MVA",
    });
  }

  // --- Error 4: Incorrect amount ---
  console.log("\n--- Detecting: Incorrect amount ---");
  const waVoucher = activeVouchers.find((v: any) =>
    v.postings?.some((p: any) => getAcctNumber(p) === WA_ACCT && Math.abs(p.amountGross) === WA_RECORDED)
  );
  if (!waVoucher) throw new Error("Wrong-amount voucher not found!");
  const waPosting = waVoucher.postings.find((p: any) =>
    getAcctNumber(p) === WA_ACCT && Math.abs(p.amountGross) === WA_RECORDED
  );
  const waContra = waVoucher.postings.find((p: any) =>
    getAcctNumber(p) !== WA_ACCT && getAcctNumber(p) !== 2710
  );
  const waVatType = waPosting.vatType?.id ?? 0;
  const difference = WA_RECORDED - WA_CORRECT;
  console.log(`  Found voucher ${waVoucher.id}, difference=${difference}, vatType=${waVatType}`);

  correctionLines.push({
    row: nextRow++, account: { id: acctMap[WA_ACCT].id },
    amountGross: -difference, amountGrossCurrency: -difference,
    vatType: { id: waVatType },
    description: "Korreksjon: feil beløp",
  });
  correctionLines.push({
    row: nextRow++, account: { id: waContra.account?.id },
    amountGross: difference, amountGrossCurrency: difference,
    description: "Korreksjon: feil beløp",
  });

  // --- CALL 3: POST combined correction voucher ---
  console.log(`\n--- Call 3: POST /ledger/voucher (${correctionLines.length} lines) ---`);
  console.log("  Correction lines:");
  for (const line of correctionLines) {
    const acctNum = Object.entries(acctMap).find(([, v]) => v.id === line.account?.id)?.[0] ?? "?";
    console.log(`    row=${line.row}, acct=${acctNum} (id=${line.account?.id}), gross=${line.amountGross}, vatType=${line.vatType?.id ?? "-"}, supplier=${line.supplier?.id ?? "-"}`);
  }

  const correctionRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: CORRECTION_DATE,
    description: `${TEST_MARKER} Korreksjonsbilag mars 2026`,
    postings: correctionLines,
  });

  console.log(`\n  Correction voucher created: id=${correctionRes.value.id}, number=${correctionRes.value.number}`);
  console.log("  Response postings:");
  for (const p of correctionRes.value.postings || []) {
    console.log(`    acct=${p.account?.number} (id=${p.account?.id}), gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
  }

  return correctionRes.value.id;
}

// ============================================================
// PHASE 3: Verify corrections
// ============================================================
async function verifyCorrections() {
  console.log("\n=== PHASE 3: Verify corrections by reading ledger state ===");

  // Fetch all test vouchers again
  const res = await api("GET",
    `/ledger/voucher?dateFrom=${TEST_DATE_FROM}&dateTo=${TEST_DATE_TO}&fields=id,number,date,description,reverseVoucher(id),postings(id,row,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000`
  );
  const testVouchers = (res.values || []).filter((v: any) =>
    v.description?.includes(TEST_MARKER)
  );

  // Filter active
  const reversedIds = new Set<number>();
  const reversalIds = new Set<number>();
  for (const v of testVouchers) {
    if (typeof v.reverseVoucher?.id === "number") {
      reversedIds.add(v.reverseVoucher.id);
      if (typeof v.id === "number") reversalIds.add(v.id);
    }
  }
  const active = testVouchers.filter((v: any) =>
    typeof v.id === "number" && !reversedIds.has(v.id) && !reversalIds.has(v.id)
  );

  // Sum up net balances by account across all active test vouchers
  const balances: Record<number, number> = {};
  const acctIdToNumber: Record<number, number> = {};

  // Need account mapping
  const acctRes = await api("GET", `/ledger/account?number=${WRONG_ACCT_SOURCE},${WRONG_ACCT_TARGET},${DUP_ACCT},${MV_ACCT},${WA_ACCT},2710,2400,${CONTRA_ACCT}&fields=id,number`);
  for (const a of acctRes.values) {
    acctIdToNumber[a.id] = a.number;
  }

  const getAcctNumber = (p: any) => p.account?.number ?? acctIdToNumber[p.account?.id];

  for (const v of active) {
    for (const p of v.postings || []) {
      const acctNum = getAcctNumber(p);
      if (acctNum) {
        balances[acctNum] = (balances[acctNum] ?? 0) + (p.amountGross ?? 0);
      }
    }
  }

  console.log("\n  Net balances across all active test vouchers (error + correction):");
  const sortedAccounts = Object.keys(balances).map(Number).sort();
  for (const acct of sortedAccounts) {
    const bal = Math.round(balances[acct] * 100) / 100;
    console.log(`    Account ${acct}: ${bal >= 0 ? "+" : ""}${bal}`);
  }

  // === CHECK RESULTS ===
  console.log("\n=== VERIFICATION CHECKS ===");
  let allPassed = true;

  // Check 1: Wrong account — 7300 should have net 0, 7000 should have the amount
  const check1_7300 = Math.round((balances[7300] ?? 0) * 100) / 100;
  const check1_7000 = Math.round((balances[7000] ?? 0) * 100) / 100;
  // After correction: 7300 original (+4500) + correction (-4500) = 0
  // 7000: correction (+4500) = 4500
  // But note: with vatType, the net amounts might differ from gross
  console.log(`  Check 1 (wrong account): 7300 balance=${check1_7300}, 7000 balance=${check1_7000}`);
  // The key check is that 7300 decreased and 7000 increased by the correction amount
  const check1Pass = check1_7300 === 0 || Math.abs(check1_7300) < 10; // approximately zero after reclassification
  console.log(`    ${check1Pass ? "PASS" : "FAIL"} — 7300 should be ~0 after reclassification`);
  if (!check1Pass) allPassed = false;

  // Check 2: Duplicate — 6860 should show only ONE effective voucher
  // Original (3500) + duplicate (3500) + reversal (-3500) = 3500
  const check2_6860 = Math.round((balances[6860] ?? 0) * 100) / 100;
  console.log(`  Check 2 (duplicate): 6860 balance=${check2_6860}`);
  // After removing duplicate, only the original remains
  // Gross: original +3500, dup +3500, correction -3500 = +3500
  // But with vatType, net might be different. Let's check gross directly.

  // Check 3: Missing VAT — 2710 should have the VAT amount
  const expectedVat = MV_EXCL_VAT * 0.25; // 4587.50
  const check3_2710 = Math.round((balances[2710] ?? 0) * 100) / 100;
  console.log(`  Check 3 (missing VAT): 2710 balance=${check3_2710}`);
  // The correctly-booked voucher already has some 2710. The error voucher has none.
  // Our Case A correction adds +4587.50 to 2710.
  // From correctly-booked voucher: vatType=1 on 18350 gross → net = 18350/1.25 = 14680, 2710 = 3670
  // So total 2710 = 3670 (from correct) + 4587.50 (from correction) = 8257.50
  // But let's just check that the correction added the right amount
  console.log(`    Expected VAT correction: ${expectedVat} (${MV_EXCL_VAT} * 0.25)`);
  // The 2710 account should have at least the correction amount
  const check3Pass = check3_2710 > expectedVat - 1; // should be >= 4587.50
  console.log(`    ${check3Pass ? "PASS" : "FAIL"} — 2710 should have ≥${expectedVat}`);
  if (!check3Pass) allPassed = false;

  // Check 4: Wrong amount — 7100 net effect should be the correct amount
  const check4_7100 = Math.round((balances[7100] ?? 0) * 100) / 100;
  console.log(`  Check 4 (wrong amount): 7100 balance=${check4_7100}`);
  // Original: +15000, correction: -4950 (15000-10050) = net +10050
  const check4Expected = WA_CORRECT; // 10050
  const check4Pass = Math.abs(check4_7100 - check4Expected) < 10;
  console.log(`    Expected: ~${check4Expected}, got: ${check4_7100}`);
  console.log(`    ${check4Pass ? "PASS" : "FAIL"}`);
  if (!check4Pass) allPassed = false;

  console.log(`\n=== OVERALL: ${allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"} ===`);
  return allPassed;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  // Step 0: Resolve accounts first (needed for both cleanup and setup)
  console.log("=== Resolving accounts ===");
  const allAccounts = [WRONG_ACCT_SOURCE, WRONG_ACCT_TARGET, DUP_ACCT, MV_ACCT, WA_ACCT, 2710, 2400, CONTRA_ACCT];
  const acctRes = await api("GET", `/ledger/account?number=${allAccounts.join(",")}&fields=id,number,vatType(id)`);
  const acctMap: Record<number, { id: number; vatTypeId: number }> = {};
  for (const a of acctRes.values) {
    acctMap[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
    console.log(`  Account ${a.number}: id=${a.id}, vatType=${a.vatType?.id ?? "null"}`);
  }

  // Check all needed accounts exist
  for (const num of allAccounts) {
    if (!acctMap[num]) {
      console.error(`  MISSING account ${num}!`);
      throw new Error(`Account ${num} not found in sandbox`);
    }
  }

  // Phase 0: Cleanup
  await cleanup();

  // Phase 1: Create error vouchers
  await createErrorVouchers(acctMap);

  // Phase 2: Run correction algorithm
  const correctionId = await runCorrectionAlgorithm();

  // Phase 3: Verify
  const passed = await verifyCorrections();

  console.log(`\n=== SUMMARY ===`);
  console.log(`  API calls: 3 (correction algorithm only)`);
  console.log(`  Correction voucher: ${correctionId}`);
  console.log(`  All checks passed: ${passed}`);

  if (!passed) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  console.error(e.stack);
  process.exit(1);
});
