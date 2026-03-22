# Correct Ledger Errors

## Trust Level
- Trusted standard — use directly, skip `./openapi.json`

## Exact Match
- Prompt describes errors in the general ledger for a date range (e.g., Jan–Feb 2026)
- Four errors: wrong account, duplicate voucher, missing VAT, incorrect amount
- Prompt gives exact account numbers and amounts for each error

## Complete Script Template

**Read the prompt, extract the values below, paste this template, and run it.**

The prompt is in a random language (nb/en/de/es/fr/pt/nn). Extract these from it:

```
WRONG_ACCT_SOURCE  = <account that was wrongly used>       e.g. 6340
WRONG_ACCT_TARGET  = <account that should have been used>  e.g. 6390
WRONG_ACCT_AMOUNT  = <amount>                              e.g. 3050

DUP_ACCT           = <duplicate voucher account>           e.g. 6860
DUP_AMOUNT         = <duplicate voucher amount>            e.g. 1650

MV_ACCT            = <missing-VAT expense account>         e.g. 4500
MV_EXCL_VAT        = <amount excl. VAT>                    e.g. 22900

WA_ACCT            = <wrong-amount account>                e.g. 6860
WA_RECORDED        = <amount that was recorded>            e.g. 24450
WA_CORRECT         = <amount that should have been>        e.g. 10850
```

Also extract: `DATE_FROM`, `DATE_TO` (first of month AFTER period end — dateTo is EXCLUSIVE), `CORRECTION_DATE` (last day of period).

```typescript
// ============================================================
// CORRECT LEDGER ERRORS — 3-CALL SCRIPT TEMPLATE
// ============================================================
// Sandbox-verified 2026-03-22: all 4 checks pass with this exact template.
// DO NOT rewrite the detection logic. Fill in the constants and run.

const BASE = "<base_url>";
const TOKEN = "<session_token>";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// === PROMPT VALUES (fill these in from the prompt) ===
const WRONG_ACCT_SOURCE = ???;
const WRONG_ACCT_TARGET = ???;
const WRONG_ACCT_AMOUNT = ???;
const DUP_ACCT = ???;
const DUP_AMOUNT = ???;
const MV_ACCT = ???;       // missing-VAT expense account
const MV_EXCL_VAT = ???;   // amount excl. VAT
const WA_ACCT = ???;       // wrong-amount account
const WA_RECORDED = ???;   // amount recorded (wrong)
const WA_CORRECT = ???;    // amount that should have been
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
```

## Pitfalls Quick Reference

| # | Pitfall | What happens | Fix |
|---|---------|-------------|-----|
| 1 | `fields=*` on vouchers | Account numbers missing from postings | Use nested expansion `postings(id,account(id,number),...)` |
| 2 | `account: { number: X }` in POST | 422 `Kan ikke være null` | Must use `account: { id: X }` — resolve IDs in Call 1 |
| 3 | `dateTo=2026-02-28` for Jan-Feb | Feb 28 vouchers silently excluded | Use `dateTo=2026-03-01` (exclusive) |
| 4 | Missing-VAT: iterate & take first match | Selects correctly-booked voucher (has 2710) | Filter `!has2710` FIRST, then select |
| 5 | Missing-VAT: expense + `vatType:{id:1}` | Auto-generates wrong 2710 amount (too low) | Post directly on account 2710 |
| 6 | `vatType:{id:1}` on locked account (e.g. 7100) | 422 `Kontoen er låst til mva-kode 0` | Copy vatType from original posting; use target's vatType from Call 1 |
| 7 | Account 2400 without `supplier.id` | 422 `Leverandør mangler` | Copy `supplier.id` from original 2400 posting |
| 8 | Duplicate detection: signature grouping only | Crashes when dup is the only entry | Check description "duplikat" FIRST |
| 9 | Hardcode `vatType:{id:1}` on corrections | 422 on locked accounts | Always copy from original posting |

## Verification

E2E sandbox-verified 2026-03-22. All 4 checks passed with this exact template:
- Check 1 (wrong account): 7300→0, 7000→4500 PASS
- Check 2 (duplicate): one copy removed PASS
- Check 3 (missing VAT): 2710 received correct amount PASS
- Check 4 (wrong amount): corrected to target PASS

12 production runs scored 2.25/6 — checks 1,2,4 passed but Check 3 (missing VAT) failed EVERY time because scripts iterated vouchers sequentially instead of filtering by 2710 absence first. This template fixes that.
