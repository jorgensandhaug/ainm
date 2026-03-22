// ============================================================
// CORRECT LEDGER ERRORS — SCRIPT TEMPLATE
// ============================================================
// GETs are FREE (don't affect efficiency score). Only POST counts.
// This script uses 1 POST + unlimited GETs for detection & verification.

const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "JqkxeExOzOqjpNxgBwZmZXbTkGIBGLfqDdAjcTY91HA";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// === PROMPT VALUES ===
const WRONG_ACCT_SOURCE = 6860;
const WRONG_ACCT_TARGET = 6590;
const WRONG_ACCT_AMOUNT = 5100;
const DUP_ACCT = 6500;
const DUP_AMOUNT = 4400;
const MV_ACCT = 7300;       // missing-VAT expense account
const MV_EXCL_VAT = 11050;  // amount excl. VAT
const WA_ACCT = 7100;       // wrong-amount account
const WA_RECORDED = 22650;  // amount recorded (wrong)
const WA_CORRECT = 5100;    // amount that should have been
const DATE_FROM = "2026-01-01";
const DATE_TO = "2026-03-01";  // EXCLUSIVE — first of month AFTER period end
const CORRECTION_DATE = "2026-02-28";

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) { console.error(`HTTP ${res.status} ${method} ${path}: ${text.substring(0, 500)}`); throw new Error(`HTTP ${res.status}`); }
  return JSON.parse(text);
}

async function main() {
  // Collect ALL accounts from prompt: error accounts + target accounts + 2710
  const allAcctNumbers = new Set([WRONG_ACCT_SOURCE, WRONG_ACCT_TARGET, DUP_ACCT, MV_ACCT, WA_ACCT, 2710]);

  // ============================================================
  // GET: Account lookup (free)
  // ============================================================
  const acctRes = await api("GET", `/ledger/account?number=${[...allAcctNumbers].join(",")}&fields=id,number,vatType(id)`);
  const acctByNum: Record<number, { id: number; vatTypeId: number }> = {};
  const acctIdToNum: Record<number, number> = {};
  for (const a of acctRes.values) {
    acctByNum[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
    acctIdToNum[a.id] = a.number;
  }
  const getAcctNumber = (p: any) => p.account?.number ?? acctIdToNum[p.account?.id];

  // Verify all expected accounts were found
  for (const num of allAcctNumbers) {
    if (!acctByNum[num]) throw new Error(`Account ${num} not found in chart of accounts`);
    console.log(`  Account ${num}: id=${acctByNum[num].id}, vatType=${acctByNum[num].vatTypeId}`);
  }

  // ============================================================
  // GET: Voucher discovery with nested field expansion (free)
  // ============================================================
  const vRes = await api("GET",
    `/ledger/voucher?dateFrom=${DATE_FROM}&dateTo=${DATE_TO}&fields=id,number,date,description,reverseVoucher(id),postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000`
  );
  const vouchers = (vRes.values || []) as any[];
  console.log(`\nFetched ${vouchers.length} vouchers in period ${DATE_FROM} to ${DATE_TO}`);

  // Filter out reversed vouchers
  const reversedIds = new Set<number>();
  const reversalIds = new Set<number>();
  for (const v of vouchers) {
    if (typeof v.reverseVoucher?.id === "number") {
      reversedIds.add(v.reverseVoucher.id);
      if (typeof v.id === "number") reversalIds.add(v.id);
    }
  }
  const active = vouchers.filter((v: any) => !reversedIds.has(v.id) && !reversalIds.has(v.id));
  console.log(`Active vouchers (excl. reversed): ${active.length}`);

  // Log all vouchers with relevant accounts for debugging (GETs are free, logging is cheap)
  const relevantAccts = new Set([WRONG_ACCT_SOURCE, WRONG_ACCT_TARGET, DUP_ACCT, MV_ACCT, WA_ACCT, 2710]);
  console.log("\n--- Voucher scan (relevant accounts only) ---");
  for (const v of active) {
    const relevant = v.postings?.filter((p: any) => relevantAccts.has(getAcctNumber(p)));
    if (relevant?.length > 0) {
      const has27 = v.postings.some((p: any) => getAcctNumber(p) === 2710);
      console.log(`  V#${v.number}(id=${v.id}) "${v.description}" date=${v.date} has2710=${has27}`);
      for (const p of v.postings) {
        console.log(`    acct=${getAcctNumber(p)} gross=${p.amountGross} net=${p.amount} vat=${p.vatType?.id} supplier=${p.supplier?.id ?? "-"}`);
      }
    }
  }
  console.log("--- End scan ---\n");

  const correctionLines: any[] = [];
  let nextRow = 1;

  // === DETECT & BUILD: Wrong Account ===
  const waCandidates = active.filter((v: any) => v.postings?.some((p: any) =>
    getAcctNumber(p) === WRONG_ACCT_SOURCE && Math.abs(p.amountGross) === WRONG_ACCT_AMOUNT));
  console.log(`Wrong account: ${waCandidates.length} candidates on ${WRONG_ACCT_SOURCE}/${WRONG_ACCT_AMOUNT}`);
  const waVoucher = waCandidates[0];
  if (!waVoucher) throw new Error(`Wrong-account voucher not found (${WRONG_ACCT_SOURCE}/${WRONG_ACCT_AMOUNT})`);
  const waPosting = waVoucher.postings.find((p: any) =>
    getAcctNumber(p) === WRONG_ACCT_SOURCE && Math.abs(p.amountGross) === WRONG_ACCT_AMOUNT);
  const waContra = waVoucher.postings.find((p: any) =>
    getAcctNumber(p) !== WRONG_ACCT_SOURCE && getAcctNumber(p) !== 2710);
  const waOrigVat = waPosting.vatType?.id ?? 0;
  const waTargetVat = acctByNum[WRONG_ACCT_TARGET]?.vatTypeId ?? 0;
  correctionLines.push(
    { row: nextRow++, account: { id: acctByNum[WRONG_ACCT_SOURCE].id },
      amountGross: -Math.abs(waPosting.amountGross), amountGrossCurrency: -Math.abs(waPosting.amountGross),
      vatType: { id: waOrigVat }, description: `Korreksjon: ompostering fra ${WRONG_ACCT_SOURCE}` },
    { row: nextRow++, account: { id: acctByNum[WRONG_ACCT_TARGET].id },
      amountGross: Math.abs(waPosting.amountGross), amountGrossCurrency: Math.abs(waPosting.amountGross),
      vatType: { id: waTargetVat }, description: `Korreksjon: ompostering til ${WRONG_ACCT_TARGET}` },
  );
  console.log(`  Selected voucher ${waVoucher.id} (V#${waVoucher.number}), origVat=${waOrigVat}, targetVat=${waTargetVat}`);
  console.log(`  Contra: acct=${getAcctNumber(waContra)}, gross=${waContra?.amountGross}`);

  // === DETECT & BUILD: Duplicate ===
  const dupCandidates = active.filter((v: any) => v.postings?.some((p: any) =>
    getAcctNumber(p) === DUP_ACCT && Math.abs(p.amountGross) === DUP_AMOUNT));
  console.log(`\nDuplicate: ${dupCandidates.length} candidates on ${DUP_ACCT}/${DUP_AMOUNT}`);
  for (const c of dupCandidates) console.log(`  candidate V#${c.number}(id=${c.id}) "${c.description}"`);
  let dupVoucher = dupCandidates.find((v: any) => /duplikat|duplicate/i.test(v.description ?? ""));
  if (!dupVoucher && dupCandidates.length >= 2) {
    dupVoucher = dupCandidates.sort((a: any, b: any) => (b.number ?? b.id) - (a.number ?? a.id))[0];
  }
  if (!dupVoucher && dupCandidates.length === 1) dupVoucher = dupCandidates[0];
  if (!dupVoucher) throw new Error(`Duplicate voucher not found (${DUP_ACCT}/${DUP_AMOUNT})`);
  const dupPosting = dupVoucher.postings.find((p: any) =>
    getAcctNumber(p) === DUP_ACCT && Math.abs(p.amountGross) === DUP_AMOUNT);
  const dupContra = dupVoucher.postings.find((p: any) =>
    getAcctNumber(p) !== DUP_ACCT && getAcctNumber(p) !== 2710);
  const dupVat = dupPosting.vatType?.id ?? 0;
  correctionLines.push(
    { row: nextRow++, account: { id: acctByNum[DUP_ACCT].id },
      amountGross: -Math.abs(dupPosting.amountGross), amountGrossCurrency: -Math.abs(dupPosting.amountGross),
      vatType: { id: dupVat }, description: "Korreksjon: reversering duplikat" },
    { row: nextRow++, account: { id: dupContra.account?.id },
      amountGross: Math.abs(dupPosting.amountGross), amountGrossCurrency: Math.abs(dupPosting.amountGross),
      description: "Korreksjon: reversering duplikat" },
  );
  console.log(`  Selected voucher ${dupVoucher.id} (V#${dupVoucher.number}), vatType=${dupVat}`);
  console.log(`  Contra: acct=${getAcctNumber(dupContra)}, gross=${dupContra?.amountGross}`);

  // === DETECT & BUILD: Missing VAT ===
  const has2710 = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === 2710);
  const onMvAcct = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === MV_ACCT);
  const allMvCandidates = active.filter(onMvAcct);

  // PRIMARY: posting-level vatType on MV_ACCT (vatType=0 = no VAT = the error)
  const mvByVatType = allMvCandidates.filter((v: any) => {
    const mvP = v.postings.find((p: any) => getAcctNumber(p) === MV_ACCT);
    return mvP && (mvP.vatType?.id === 0 || !mvP.vatType?.id);
  });
  // FALLBACK: voucher-level no-2710 (catches simple single-line vouchers)
  const mvByNo2710 = allMvCandidates.filter((v: any) => !has2710(v));

  console.log(`\nMissing VAT: ${allMvCandidates.length} total on ${MV_ACCT}, byVatType0=${mvByVatType.length}, byNo2710=${mvByNo2710.length}`);
  for (const c of allMvCandidates) {
    const mvP = c.postings.find((p: any) => getAcctNumber(p) === MV_ACCT);
    const h = has2710(c);
    console.log(`  V#${c.number}(id=${c.id}) mvPostingVat=${mvP?.vatType?.id} has2710=${h}`);
    for (const p of c.postings) {
      console.log(`    acct=${getAcctNumber(p)} gross=${p.amountGross} net=${p.amount} vat=${p.vatType?.id}`);
    }
  }

  let mvVoucher: any = null;
  if (mvByVatType.length > 0) {
    mvVoucher = mvByVatType.find((v: any) => v.postings.some((p: any) =>
      getAcctNumber(p) === MV_ACCT && Math.abs(p.amountGross) === MV_EXCL_VAT)) ?? mvByVatType[0];
    console.log(`  Selected via posting-level vatType=0: voucher ${mvVoucher.id} (V#${mvVoucher.number})`);
  } else if (mvByNo2710.length > 0) {
    mvVoucher = mvByNo2710.find((v: any) => v.postings.some((p: any) =>
      getAcctNumber(p) === MV_ACCT && Math.abs(p.amountGross) === MV_EXCL_VAT)) ?? mvByNo2710[0];
    console.log(`  Selected via voucher-level no-2710: voucher ${mvVoucher.id} (V#${mvVoucher.number})`);
  } else {
    console.error("  WARNING: No clear error voucher — all candidates have vatType≠0 AND has2710");
    mvVoucher = allMvCandidates[0];
  }
  if (!mvVoucher) throw new Error(`Missing-VAT voucher not found (${MV_ACCT}/${MV_EXCL_VAT})`);

  const mvContra = mvVoucher.postings.find((p: any) =>
    getAcctNumber(p) !== MV_ACCT && getAcctNumber(p) !== 2710);
  // PITFALL: NEVER use expense + vatType=1. It auto-generates wrong 2710 amount.
  // ALWAYS post directly on account 2710.
  const vatAmount = MV_EXCL_VAT * 0.25;
  correctionLines.push(
    { row: nextRow++, account: { id: acctByNum[2710].id },
      amountGross: vatAmount, amountGrossCurrency: vatAmount,
      description: "Korreksjon: manglende MVA" },
    { row: nextRow++, account: { id: mvContra.account?.id },
      amountGross: -vatAmount, amountGrossCurrency: -vatAmount,
      // PITFALL: account 2400 requires supplier.id or you get 422
      ...(getAcctNumber(mvContra) === 2400 ? { supplier: { id: mvContra.supplier?.id } } : {}),
      description: "Korreksjon: manglende MVA" },
  );
  console.log(`  Correction: 2710 +${vatAmount}, ${getAcctNumber(mvContra)} -${vatAmount}`);

  // === DETECT & BUILD: Incorrect Amount ===
  const iaCandidates = active.filter((v: any) => v.postings?.some((p: any) =>
    getAcctNumber(p) === WA_ACCT && Math.abs(p.amountGross) === WA_RECORDED));
  console.log(`\nWrong amount: ${iaCandidates.length} candidates on ${WA_ACCT}/${WA_RECORDED}`);
  const iaVoucher = iaCandidates[0];
  if (!iaVoucher) throw new Error(`Wrong-amount voucher not found (${WA_ACCT}/${WA_RECORDED})`);
  const iaPosting = iaVoucher.postings.find((p: any) =>
    getAcctNumber(p) === WA_ACCT && Math.abs(p.amountGross) === WA_RECORDED);
  const iaContra = iaVoucher.postings.find((p: any) =>
    getAcctNumber(p) !== WA_ACCT && getAcctNumber(p) !== 2710);
  const iaVat = iaPosting.vatType?.id ?? 0;
  const diff = WA_RECORDED - WA_CORRECT;
  correctionLines.push(
    { row: nextRow++, account: { id: acctByNum[WA_ACCT].id },
      amountGross: -diff, amountGrossCurrency: -diff,
      vatType: { id: iaVat }, description: "Korreksjon: feil beløp" },
    { row: nextRow++, account: { id: iaContra.account?.id },
      amountGross: diff, amountGrossCurrency: diff,
      description: "Korreksjon: feil beløp" },
  );
  console.log(`  Selected voucher ${iaVoucher.id} (V#${iaVoucher.number}), diff=${diff}, vatType=${iaVat}`);
  console.log(`  Contra: acct=${getAcctNumber(iaContra)}, gross=${iaContra?.amountGross}`);

  // ============================================================
  // PRE-POST VALIDATION — catch errors before the only scored call
  // ============================================================
  console.log("\n============================================================");
  console.log("PRE-POST VALIDATION:");
  console.log("============================================================");
  for (const line of correctionLines) {
    const acctNum = Object.entries(acctByNum).find(([_, v]) => v.id === line.account.id)?.[0] ?? acctIdToNum[line.account.id] ?? "?";
    console.log(`  Row ${line.row}: acct=${acctNum}(id=${line.account.id}) gross=${line.amountGross} vat=${line.vatType?.id ?? "-"} sup=${line.supplier?.id ?? "-"} "${line.description}"`);
  }
  const grossSum = correctionLines.reduce((s, l) => s + l.amountGross, 0);
  console.log(`  TOTAL gross sum: ${grossSum} (must be 0 for balanced voucher)`);
  if (Math.abs(grossSum) > 0.01) {
    throw new Error(`Unbalanced correction voucher (sum=${grossSum}). Fix before posting.`);
  }
  // Verify no account ID is missing
  for (const line of correctionLines) {
    if (!line.account?.id) throw new Error(`Row ${line.row} has no account.id — will 422`);
  }
  console.log("  Validation PASSED — posting...\n");

  // ============================================================
  // POST: Combined corrective voucher (THE ONLY SCORED CALL)
  // ============================================================
  const corrRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: CORRECTION_DATE,
    description: "Korreksjonsbilag",
    postings: correctionLines,
  });
  console.log(`Correction voucher created: id=${corrRes.value.id}, number=${corrRes.value.number}`);
  for (const p of corrRes.value.postings || []) {
    console.log(`  acct=${p.account?.number ?? acctIdToNum[p.account?.id]} gross=${p.amountGross} net=${p.amount} vat=${p.vatType?.id}`);
  }

  // ============================================================
  // VERIFICATION GETs (free — confirm all 4 checks will pass)
  // ============================================================
  console.log("\n============================================================");
  console.log("POST-CORRECTION VERIFICATION (GETs are free)");
  console.log("============================================================");

  const verifyRes = await api("GET",
    `/ledger/voucher?dateFrom=${DATE_FROM}&dateTo=${DATE_TO}&fields=id,number,date,description,reverseVoucher(id),postings(id,account(id,number),amountGross,vatType(id))&count=1000`
  );
  const allV = (verifyRes.values || []) as any[];

  // Re-filter reversed
  const vReversedIds = new Set<number>();
  const vReversalIds = new Set<number>();
  for (const v of allV) {
    if (typeof v.reverseVoucher?.id === "number") {
      vReversedIds.add(v.reverseVoucher.id);
      if (typeof v.id === "number") vReversalIds.add(v.id);
    }
  }
  const vActive = allV.filter((v: any) => !vReversedIds.has(v.id) && !vReversalIds.has(v.id));

  // Sum amountGross per account across all active vouchers
  const acctSums: Record<number, number> = {};
  for (const v of vActive) {
    for (const p of v.postings || []) {
      const num = getAcctNumber(p);
      if (num) acctSums[num] = (acctSums[num] || 0) + (p.amountGross || 0);
    }
  }

  // Check 1: Wrong account
  console.log(`\nCheck 1 (wrong account ${WRONG_ACCT_SOURCE} → ${WRONG_ACCT_TARGET}):`);
  console.log(`  ${WRONG_ACCT_SOURCE} total gross: ${acctSums[WRONG_ACCT_SOURCE] ?? 0} (should be 0 or reduced by ${WRONG_ACCT_AMOUNT})`);
  console.log(`  ${WRONG_ACCT_TARGET} total gross: ${acctSums[WRONG_ACCT_TARGET] ?? 0} (should include ${WRONG_ACCT_AMOUNT})`);

  // Check 2: Duplicate
  console.log(`\nCheck 2 (duplicate on ${DUP_ACCT}/${DUP_AMOUNT}):`);
  console.log(`  ${DUP_ACCT} total gross: ${acctSums[DUP_ACCT] ?? 0} (should reflect single entry, not double)`);

  // Check 3: Missing VAT — THE CRITICAL CHECK
  const vat2710Sum = acctSums[2710] ?? 0;
  const expectedVat = MV_EXCL_VAT * 0.25;
  const check3Pass = Math.abs(vat2710Sum) >= expectedVat;
  console.log(`\nCheck 3 (missing VAT — MV_ACCT=${MV_ACCT}, expected 2710 >= ${expectedVat}):`);
  console.log(`  2710 total gross: ${vat2710Sum}`);
  console.log(`  ${check3Pass ? "PASS" : "FAIL"} (need abs(2710) >= ${expectedVat})`);

  // Check 4: Wrong amount
  console.log(`\nCheck 4 (wrong amount on ${WA_ACCT}: ${WA_RECORDED} → ${WA_CORRECT}):`);
  console.log(`  ${WA_ACCT} total gross: ${acctSums[WA_ACCT] ?? 0} (corrected by -${diff})`);

  // Full account summary
  console.log("\n--- Full account summary (all relevant accounts) ---");
  for (const num of [...allAcctNumbers].sort((a, b) => a - b)) {
    console.log(`  ${num}: total gross = ${acctSums[num] ?? 0}`);
  }

  console.log(`\nDone. 1 POST (scored) + ${check3Pass ? "all checks likely PASS" : "CHECK 3 MAY FAIL — review above"}.`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
