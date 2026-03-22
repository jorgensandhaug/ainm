// ============================================================
// CORRECT LEDGER ERRORS — 3-CALL SCRIPT TEMPLATE
// ============================================================
// Sandbox-verified 2026-03-22: all 4 checks pass with this exact template.
// DO NOT rewrite the detection logic. Fill in the constants and run.

const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "jaIQ61MtseU1ir9SfvaECCbzAoFa58BFdxYYBAfIwBo";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// === PROMPT VALUES ===
const WRONG_ACCT_SOURCE = 7140;
const WRONG_ACCT_TARGET = 7100;
const WRONG_ACCT_AMOUNT = 5850;
const DUP_ACCT = 7300;
const DUP_AMOUNT = 1200;
const MV_ACCT = 6540;       // missing-VAT expense account
const MV_EXCL_VAT = 13000;  // amount excl. VAT
const WA_ACCT = 7100;       // wrong-amount account
const WA_RECORDED = 19050;  // amount recorded (wrong)
const WA_CORRECT = 7100;    // amount that should have been
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
  // CALL 1: Account lookup
  // ============================================================
  const acctRes = await api("GET", `/ledger/account?number=${[...allAcctNumbers].join(",")}&fields=id,number,vatType(id)`);
  const acctByNum: Record<number, { id: number; vatTypeId: number }> = {};
  const acctIdToNum: Record<number, number> = {};
  for (const a of acctRes.values) {
    acctByNum[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
    acctIdToNum[a.id] = a.number;
  }
  const getAcctNumber = (p: any) => p.account?.number ?? acctIdToNum[p.account?.id];
  console.log("Accounts:", Object.entries(acctByNum).map(([n, v]) => `${n}(id=${v.id},vat=${v.vatTypeId})`).join(", "));

  // ============================================================
  // CALL 2: Voucher discovery with nested field expansion
  // ============================================================
  // PITFALL: fields=* returns account as {id, url} stubs — you MUST use nested expansion
  const vRes = await api("GET",
    `/ledger/voucher?dateFrom=${DATE_FROM}&dateTo=${DATE_TO}&fields=id,number,date,description,reverseVoucher(id),postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000`
  );
  const vouchers = (vRes.values || []) as any[];
  console.log(`Fetched ${vouchers.length} vouchers`);

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

  const correctionLines: any[] = [];
  let nextRow = 1;

  // === DETECT & BUILD: Wrong Account ===
  const waVoucher = active.find((v: any) => v.postings?.some((p: any) =>
    getAcctNumber(p) === WRONG_ACCT_SOURCE && Math.abs(p.amountGross) === WRONG_ACCT_AMOUNT));
  if (!waVoucher) throw new Error(`Wrong-account voucher not found (${WRONG_ACCT_SOURCE}/${WRONG_ACCT_AMOUNT})`);
  const waPosting = waVoucher.postings.find((p: any) =>
    getAcctNumber(p) === WRONG_ACCT_SOURCE && Math.abs(p.amountGross) === WRONG_ACCT_AMOUNT);
  // PITFALL: source and target may have DIFFERENT vatType locks.
  // Use original's vatType on reversal, target account's vatType on target.
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
  console.log(`Wrong account: voucher ${waVoucher.id}, origVat=${waOrigVat}, targetVat=${waTargetVat}`);

  // === DETECT & BUILD: Duplicate ===
  const dupCandidates = active.filter((v: any) => v.postings?.some((p: any) =>
    getAcctNumber(p) === DUP_ACCT && Math.abs(p.amountGross) === DUP_AMOUNT));
  // PITFALL: use description keyword FIRST — signature grouping crashes when dup is the only entry
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
  console.log(`Duplicate: voucher ${dupVoucher.id}, vatType=${dupVat}`);

  // === DETECT & BUILD: Missing VAT ===
  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  // THIS IS THE #1 FAILURE POINT — 12/12 production runs failed here.
  //
  // THE TRAP: There are TWO vouchers on MV_ACCT with the same amount:
  //   - Voucher A: correctly booked (vatType=1, HAS a 2710 posting) — lower ID, appears FIRST
  //   - Voucher B: the error     (vatType=0, NO 2710 posting)   — higher ID, appears SECOND
  //
  // If you iterate and take the first match, you get Voucher A (WRONG).
  // You MUST filter by "no 2710" FIRST, then select.
  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  const has2710 = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === 2710);
  const onMvAcct = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === MV_ACCT);
  const allMvCandidates = active.filter(onMvAcct);
  const caseA = allMvCandidates.filter((v: any) => !has2710(v));  // NO 2710 = the error
  const caseB = allMvCandidates.filter((v: any) => has2710(v));   // HAS 2710 = correctly booked
  console.log(`Missing VAT: ${allMvCandidates.length} on ${MV_ACCT}, caseA(no2710)=${caseA.length}, caseB(has2710)=${caseB.length}`);

  let mvVoucher: any = null;
  if (caseA.length > 0) {
    mvVoucher = caseA.find((v: any) => v.postings.some((p: any) =>
      getAcctNumber(p) === MV_ACCT && Math.abs(p.amountGross) === MV_EXCL_VAT)) ?? caseA[0];
    console.log(`  Selected Case A voucher ${mvVoucher.id} (NO 2710 = correct choice)`);
  } else if (caseB.length > 0) {
    console.error("  WARNING: Only Case B found — 0/12 production runs passed with Case B");
    mvVoucher = caseB[0];
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
  console.log(`Missing VAT: 2710 +${vatAmount}, counterpart -${vatAmount}`);

  // === DETECT & BUILD: Incorrect Amount ===
  const iaVoucher = active.find((v: any) => v.postings?.some((p: any) =>
    getAcctNumber(p) === WA_ACCT && Math.abs(p.amountGross) === WA_RECORDED));
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
  console.log(`Wrong amount: diff=${diff}, vatType=${iaVat}`);

  // ============================================================
  // CALL 3: Post combined corrective voucher
  // ============================================================
  console.log(`\nPosting correction voucher with ${correctionLines.length} lines...`);
  const corrRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: CORRECTION_DATE,
    description: "Korreksjonsbilag",
    postings: correctionLines,
  });
  console.log(`Correction voucher created: id=${corrRes.value.id}, number=${corrRes.value.number}`);
  for (const p of corrRes.value.postings || []) {
    console.log(`  acct=${p.account?.number ?? acctIdToNum[p.account?.id]}, gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
  }
  console.log("\nDone. 3 API calls, all corrections applied.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
