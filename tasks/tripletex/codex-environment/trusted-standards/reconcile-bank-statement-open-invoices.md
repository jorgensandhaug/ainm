# Reconcile Bank Statement With Open Invoices — Trusted Standard

> **NO BETA ENDPOINTS.** NEVER use `/incomingInvoice*` or any `(BETA)` endpoint — they return `403`. Note: `/bank/reconciliation*` and `/bank/statement*` are NOT beta and work normally.

## When to use

Task asks to reconcile a bank statement (CSV) against open invoices. Incoming payments matched to customer invoices, outgoing payments matched to supplier invoices. May include partial payments.

## PRE-BUILT SCRIPT — USE THIS, DO NOT WRITE YOUR OWN

**This task has a pre-built, tested script at `./scripts/reconcile-bank-statement.ts`.** It handles all 9 steps including cross-month CSV reconciliation (production CSVs always span 2 months). **Do NOT write your own script** — the pre-built script was sandbox-verified with 10/10 matches, 0 errors.

**Execution steps** (3 commands, ~30s total):
```bash
# 1. Copy the pre-built script to your run scripts directory
cp ./scripts/reconcile-bank-statement.ts <RUN_SCRIPTS_DIR>/reconcile.ts

# 2. Execute it with bun (pass BASE_URL, TOKEN, CSV_PATH as args)
cd <RUN_SCRIPTS_DIR> && bun run reconcile.ts <BASE_URL> <TOKEN> <CSV_FILE_PATH>
```

Replace `<RUN_SCRIPTS_DIR>`, `<BASE_URL>`, `<TOKEN>`, and `<CSV_FILE_PATH>` with the values from the prompt. The script reads the CSV from disk, parses it, runs all 9 steps, and prints results.

**Why this matters**: production run 1d375699 timed out (0/1) because the LLM spent 106 seconds generating a 300-line script from the trusted standard. With the pre-built script, total execution time is ~30-60 seconds including reads, copy, and API calls — well within the 300s budget.

**If the pre-built script is missing** (file not found), fall back to writing a script based on the steps below. But this should never happen.

## MANDATORY CHECKLIST — your script MUST include ALL 9 steps

Steps 1–5 alone give 0.6/6 (Check 2 only). Steps 6+7 alone were proven INSUFFICIENT (57c8f4db, 02daaa35 both 0.6/6). **ALL of Steps 0, 6, 7, 8 are required for Check 1 (8 points).** Complete flow sandbox-verified END-TO-END on 2026-03-22 with 11/11 matches, 0 errors, all checks passed.

0. **Step 0**: Post opening balance voucher (DR 1920 / CR 2050) — makes ledger consistent with CSV saldo
1. **Step 1**: Fire 6 reads in parallel (including `accountingPeriod` covering ALL months in CSV, and account 2050)
2. **Step 2**: Select payment type (debitAccount.number === 1920)
3. **Step 3**: Match and pay customer invoices (`PUT /invoice/{id}/:payment`)
4. **Step 4**: Handle supplier payments (combined voucher if no supplier invoices)
5. **Step 5**: Book ALL non-invoice lines (Bankgebyr/Skattetrekk/Renteinntekter)
6. **Step 6**: `POST /bank/statement/import` with `SBANKEN_BEDRIFT_CSV` format — save txn IDs from response (positional, matches CSV order)
7. **Step 7**: `GET /ledger/posting` + create SEPARATE reconciliation PER accounting period + `POST /bank/reconciliation/match` for each CSV line (assign each match to the recon of its period)
8. **Step 8**: Close ALL bank reconciliations (`PUT /bank/reconciliation/{id}` with `isClosed: true`, one per period)

## CSV parsing

Parse locally. Classify lines:
- **Incoming customer**: description contains customer name + invoice reference, `Inn` column populated
- **Outgoing supplier**: description contains supplier name, `Ut` column populated (negative)
- **Non-invoice**: bank fees, tax, interest — **MUST be booked** (see Step 5)
- **Compute opening balance for Step 0**: `first_saldo - first_inn + Math.abs(first_ut)` (e.g. 104200 - 4200 + 0 = 100000). Ut values are negative in production CSVs, so use `Math.abs`. This is the bank balance before the first CSV transaction.
- **Closing balance for Step 8**: Use the CSV ending Saldo directly (last line's Saldo value). After posting the opening balance in Step 0, the ledger balance matches the CSV saldo.

## Optimal call flow (mixed incoming/outgoing, no supplier invoices — common case)

### Step 1: Fire 6 reads in parallel

```
GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)
GET /invoice/paymentType?count=1000&fields=*,debitAccount(*)
GET /supplier?count=1000&fields=*
GET /supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)
GET /ledger/account?number=1920,2050,2400,2600,7770,8050&fields=*
GET /ledger/accountingPeriod?startFrom=<first-csv-month-start>&startTo=<month-after-last-csv-date-start>&count=12&fields=*
```

**CRITICAL: the period query MUST cover ALL months in the CSV.** CSVs commonly span 2 months (e.g., Jan 16 – Feb 4). Use the first day of the first CSV date's month as `startFrom` and the first day of the month AFTER the last CSV date as `startTo`. Example: CSV dates 2026-01-16 to 2026-02-04 → `startFrom=2026-01-01&startTo=2026-03-01`. This returns both January and February periods in 1 call. Then group CSV lines by period (based on date) for multi-period reconciliation in Steps 7–8.

### Step 0: Post opening balance voucher (execute immediately after Step 1)

The CSV includes an opening saldo (typically 100000) representing the bank balance before the first transaction. Post this as a voucher so account 1920 starts at the correct balance.

```typescript
const openingBalance = csvLines[0].saldo - (csvLines[0].inn || 0) + Math.abs(csvLines[0].ut || 0);
if (openingBalance !== 0) {
  await post("ledger/voucher", {
    date: csvLines[0].date,
    description: "Inngående balanse",
    postings: [
      {
        row: 1,
        date: csvLines[0].date,
        description: "Inngående balanse",
        account: { id: acct1920Id },
        amount: openingBalance,
        amountCurrency: openingBalance,
        amountGross: openingBalance,
        amountGrossCurrency: openingBalance,
        currency: { id: 1 },
      },
      {
        row: 2,
        date: csvLines[0].date,
        description: "Inngående balanse",
        account: { id: acct2050Id },
        amount: -openingBalance,
        amountCurrency: -openingBalance,
        amountGross: -openingBalance,
        amountGrossCurrency: -openingBalance,
        currency: { id: 1 },
      },
    ],
  });
}
```

**Key requirements (sandbox-verified 2026-03-21)**:
- `row` must start at 1 (row 0 is system-reserved; causes 422)
- All 4 amount fields (`amount`, `amountCurrency`, `amountGross`, `amountGrossCurrency`) MUST be included; without `amountGross`/`amountGrossCurrency`, amounts are silently zeroed to 0.00 (no error returned)
- Account 2050 "Annen egenkapital" is the standard equity contra account (exists in all standard Norwegian chart-of-accounts)
- Post BEFORE any other transactions on 1920 and BEFORE closing bank reconciliation
- Execution order: Step 1 (reads) → Step 0 (opening balance) → Steps 2-5 (payments/vouchers) → Step 6 (bank import) → Step 7 (matching) → Step 8 (close recon)
- After posting, account 1920 balance = openingBalance + sum(all CSV movements) = CSV ending saldo

### Step 2: Select payment type

Pick the payment type where `debitAccount.number === 1920`.

### Step 3: Match and pay customer invoices

For each incoming bank line:
1. Extract customer name from description (case-insensitive)
2. Find open invoices matching customer name
3. Priority: exact outstanding match → smallest outstanding >= bankAmount → lowest invoiceNumber
4. Pay: `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<amount>`
5. Update local outstanding tracker after each payment (same customer may have multiple bank lines)

Partial payment: when bankAmount < outstanding, send bankAmount (not full outstanding).

### Step 4: Handle supplier payments

**If `/supplierInvoice` returned results**: use `POST /supplierInvoice/{id}/:addPayment` per match (also need `GET /ledger/paymentTypeOut` — 1 extra read).

**If `/supplierInvoice` returned 0 (common case)**: combine ALL supplier payments into ONE `POST /ledger/voucher`:

```typescript
{
  date: "<earliest-payment-date>",
  description: "Bank reconciliation - supplier payments",
  postings: [
    // For each supplier payment: 2 postings
    { row: N,   date: "<date>", account: { id: <2400_id> }, amountGross: <amount>,  amountGrossCurrency: <amount>,  supplier: { id: <supplierId> } },
    { row: N+1, date: "<date>", account: { id: <1920_id> }, amountGross: -<amount>, amountGrossCurrency: -<amount> },
    // ... next supplier payment at row N+2, N+3 ...
  ]
}
```

Row numbering starts at 1 (row 0 is system-reserved). Voucher date = earliest payment date. Individual posting dates preserved per-posting.

### Step 5: Book non-invoice lines

**CRITICAL: ALL bank statement lines must be accounted for, not just invoice-related ones.** Non-invoice lines must be booked to ensure the account 1920 balance is correct for the bank reconciliation in Step 8 (close recon). If non-invoice lines are skipped, the computed closing balance will not match the actual account balance, causing Step 8 to fail with 422.

Combine non-invoice postings into the same supplier voucher (if one exists) OR create a separate voucher. Each non-invoice line needs 2 postings (bank debit/credit + contra account):

| Line type | Direction | Bank side (1920) | Contra account | Contra acct # |
|---|---|---|---|---|
| Renteinntekter (interest income) | Inn (+) | debit (positive) | credit 8050 "Annen renteinntekt" | 8050 |
| Renteinntekter (negative interest / reversal) | Ut (-) | credit (negative) | debit 8050 "Annen renteinntekt" | 8050 |
| Bankgebyr (bank fee expense) | Ut (-) | credit (negative) | debit 7770 "Bank og kortgebyrer" | 7770 |
| Bankgebyr (fee refund) | Inn (+) | debit (positive) | credit 7770 "Bank og kortgebyrer" | 7770 |
| Skattetrekk (tax withholding) | Ut (-) | credit (negative) | debit 2600 "Forskuddstrekk" | 2600 |
| Skattetrekk (tax refund) | Inn (+) | debit (positive) | credit 2600 "Forskuddstrekk" | 2600 |

For each non-invoice line, add 2 postings:
```typescript
// Example: Renteinntekter 127.20 (Inn column, positive)
{ row: N,   date: "<date>", description: "Renteinntekter", account: { id: <1920_id> }, amount: 127.20,  amountCurrency: 127.20,  amountGross: 127.20,  amountGrossCurrency: 127.20  },
{ row: N+1, date: "<date>", description: "Renteinntekter", account: { id: <8050_id> }, amount: -127.20, amountCurrency: -127.20, amountGross: -127.20, amountGrossCurrency: -127.20 },

// Example: Skattetrekk 1413.40 (Ut column, negative/outgoing)
{ row: N+2, date: "<date>", description: "Skattetrekk",    account: { id: <2600_id> }, amount: 1413.40,  amountCurrency: 1413.40,  amountGross: 1413.40,  amountGrossCurrency: 1413.40  },
{ row: N+3, date: "<date>", description: "Skattetrekk",    account: { id: <1920_id> }, amount: -1413.40, amountCurrency: -1413.40, amountGross: -1413.40, amountGrossCurrency: -1413.40 },

// Example: Skattetrekk 1269.93 (Inn column, positive/incoming refund)
{ row: N+4, date: "<date>", description: "Skattetrekk",    account: { id: <1920_id> }, amount: 1269.93,  amountCurrency: 1269.93,  amountGross: 1269.93,  amountGrossCurrency: 1269.93  },
{ row: N+5, date: "<date>", description: "Skattetrekk",    account: { id: <2600_id> }, amount: -1269.93, amountCurrency: -1269.93, amountGross: -1269.93, amountGrossCurrency: -1269.93 },

// Example: Renteinntekter 1282.21 (Ut column, negative/outgoing — negative interest or reversal)
{ row: N+6, date: "<date>", description: "Renteinntekter", account: { id: <8050_id> }, amount: 1282.21,  amountCurrency: 1282.21,  amountGross: 1282.21,  amountGrossCurrency: 1282.21  },
{ row: N+7, date: "<date>", description: "Renteinntekter", account: { id: <1920_id> }, amount: -1282.21, amountCurrency: -1282.21, amountGross: -1282.21, amountGrossCurrency: -1282.21 },
```

**Direction rule**: the keyword determines the account (Renteinntekter→8050, Bankgebyr→7770, Skattetrekk→2600). The column (Inn/Ut) determines only the sign. For Inn: bank 1920 is positive (debit), contra is negative (credit). For Ut: contra is positive (debit), bank 1920 is negative (credit).

Sandbox-verified on 2026-03-21: voucher #609157175 with Renteinntekter Ut/8050 posted successfully. Earlier voucher #426 verified Bankgebyr/7770 + Skattetrekk Inn/Ut/2600. Voucher #349 verified Renteinntekter Inn/8050 + Bankgebyr/7770 + Skattetrekk/2600.

### Step 6: Import bank statement (CRITICAL for Check 1)

Convert the task CSV to `SBANKEN_BEDRIFT_CSV` format and import via `POST /bank/statement/import`. This creates `BankStatementTransaction` entries visible in the Tripletex bank statement view.

**Format: `SBANKEN_BEDRIFT_CSV`** with bank ID `112` (Sbanken — a constant reference data ID, same across all Tripletex instances).

Required columns and structure:
```
"Inngående saldo DD.MM.YYYY";"<opening_balance>"
"Utgående saldo DD.MM.YYYY";"<closing_balance>"
"Bokført";"Rentedato";"Beskrivelse";"Beløp"
"DD.MM.YYYY";"DD.MM.YYYY";"<description>";"<amount>"
...
```

**Conversion rules from task CSV** (`Dato;Forklaring;Inn;Ut;Saldo`):
- Dates: convert `YYYY-MM-DD` → `DD.MM.YYYY`
- Amounts: convert period decimal to comma decimal; merge Inn/Ut into single Beløp (positive for Inn, negative for Ut — Ut values are already negative in production CSVs, use directly)
- Opening saldo: first CSV line's Saldo minus first transaction amount (e.g., `104200 - 4200 = 100000`)
- Closing saldo: last CSV line's Saldo value
- Metadata row dates: use first transaction date for Inngående, last for Utgående

```typescript
function toSbankenBedriftCsv(csvLines: Array<{date: string, desc: string, inn: number, ut: number, saldo: number}>): string {
  const firstDate = csvLines[0].date.split("-").reverse().join(".");
  const lastDate = csvLines[csvLines.length - 1].date.split("-").reverse().join(".");
  const openingSaldo = csvLines[0].saldo - csvLines[0].inn + Math.abs(csvLines[0].ut || 0);
  const closingSaldo = csvLines[csvLines.length - 1].saldo;

  const fmt = (n: number) => n.toFixed(2).replace(".", ",");
  let out = `"Inngående saldo ${firstDate}";"${fmt(openingSaldo)}"\n`;
  out += `"Utgående saldo ${lastDate}";"${fmt(closingSaldo)}"\n`;
  out += `"Bokført";"Rentedato";"Beskrivelse";"Beløp"\n`;
  for (const l of csvLines) {
    const d = l.date.split("-").reverse().join(".");
    const amount = l.inn > 0 ? l.inn : l.ut;  // Ut is already negative in production CSVs
    out += `"${d}";"${d}";"${l.desc}";"${fmt(amount)}"\n`;
  }
  return out;
}

// Upload via multipart/form-data
const formData = new FormData();
formData.append("file", new Blob([sbankenCsv], { type: "text/csv" }), "bankstatement.csv");
const importUrl = `${BASE}/bank/statement/import?bankId=112&accountId=${acct1920Id}&fromDate=${firstCsvDate}&toDate=${dayAfterLastCsvDate}&fileFormat=SBANKEN_BEDRIFT_CSV`;
await fetch(importUrl, { method: "POST", headers: { Authorization: AUTH }, body: formData });
```

**Key facts (sandbox-verified 2026-03-21, production-shaped E2E verified 2026-03-22)**:
- `POST /bank/statement/import` returns `201` with `{ value: { id, openingBalanceCurrency, closingBalanceCurrency, transactions: [...] } }`
- All 10 CSV lines became 10 `BankStatementTransaction` entries with correct dates, descriptions, and amounts
- Transactions have `matchType: "NO_MATCH"` and `matched: false` initially
- The `accountId` parameter is the ledger account ID for account 1920 (already fetched in Step 1)
- The `fromDate`/`toDate` are the date range of the CSV (inclusive start, exclusive end — use day after last CSV date)
- Bank ID 112 (Sbanken) is constant reference data; no need to `GET /bank` to find it
- DNB_CSV, DANSKE_BANK_CSV, NORDEA_CSV, HAUGESUND_SPAREBANK_CSV all rejected the converted format with 422; only SBANKEN_BEDRIFT_CSV worked

**IMPORT RESPONSE HAS UNDEFINED amountCurrency/description BUT VALID txn IDs.** The import response `transactions` array preserves CSV row order. Save these txn IDs for matching in Step 7 — you do NOT need a separate `GET /bank/statement/transaction` call. Sandbox-verified 2026-03-22: `importResponse.transactions[i].id === GET bank/statement/transaction result[i].id` (same IDs, same order). Use the CSV amounts you already parsed for posting matching.

**Execution order**: import the bank statement AFTER Steps 4+5 (all vouchers posted) so that ledger postings exist when you do matching in Step 7. Save both the bank statement ID and the per-transaction IDs from the response.

### Step 7: Match bank transactions to ledger postings (CRITICAL for Check 1)

After all payments (Step 3) and vouchers (Steps 4-5) are posted, match each imported bank statement transaction to its corresponding ledger posting on account 1920.

**CRITICAL: MULTI-PERIOD RECONCILIATION.** CSVs typically span 2 months (e.g., Jan 16 – Feb 4). A bank transaction can ONLY be matched to a reconciliation whose accounting period covers the transaction's date. Matching a January transaction against a February reconciliation causes `422 "Banktransaksjoner er ikke en del av bankavstemmingen."` (production-confirmed 2026-03-22: 8 of 11 matches failed). You MUST create a SEPARATE reconciliation for EACH accounting period that has bank transactions.

```typescript
// 1. Get all postings on 1920 for the CSV date range (1 API call)
const postingsRes = await get(`ledger/posting?accountId=${acct1920Id}&dateFrom=${firstCsvDate}&dateTo=${nextMonthFirstDay}&count=1000&fields=id,date,amount,description`);
const allPostings1920 = postingsRes.values || [];

// 2. Use bank txn IDs from import response (Step 6) — NO extra GET needed
// importTxnIds[i] corresponds to csvLines[i] (positional mapping, sandbox-verified 2026-03-22)
const importTxnIds: number[] = importResponse.value.transactions.map((t: any) => t.id);

// 3. Group CSV lines by accounting period
const periodMap = new Map<number, { period: any, csvIndices: number[] }>();
for (let i = 0; i < csvLines.length; i++) {
  const lineDate = csvLines[i].date;
  const period = allPeriods.find((p: any) => lineDate >= p.start && lineDate < p.end);
  if (!periodMap.has(period.id)) periodMap.set(period.id, { period, csvIndices: [] });
  periodMap.get(period.id)!.csvIndices.push(i);
}

// 4. Create OPEN reconciliation for EACH period (can fire in parallel)
const recons: Record<number, any> = {};
await Promise.all([...periodMap.entries()].map(async ([periodId, { period }]) => {
  const res = await post("bank/reconciliation", {
    account: { id: acct1920Id },
    accountingPeriod: { id: periodId },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 0,
    isClosed: false,
  });
  recons[periodId] = res.value;
}));

// 5. Match each bank txn to posting with SAME amount on 1920
// Assign each match to the reconciliation of its period
const usedPostingIds = new Set<number>();
for (let i = 0; i < csvLines.length; i++) {
  const csvAmount = csvLines[i].inn > 0 ? csvLines[i].inn : csvLines[i].ut;
  const lineDate = csvLines[i].date;
  const period = allPeriods.find((p: any) => lineDate >= p.start && lineDate < p.end);
  const recon = recons[period.id];

  const matchPosting = allPostings1920.find((p: any) =>
    Math.abs(p.amount - csvAmount) < 0.01 && !usedPostingIds.has(p.id)
  );
  if (matchPosting && recon) {
    usedPostingIds.add(matchPosting.id);
    await post("bank/reconciliation/match", {
      bankReconciliation: { id: recon.id },
      transactions: [{ id: importTxnIds[i] }],
      postings: [{ id: matchPosting.id }],
    });
  }
}
```

**Key facts (sandbox-verified 2026-03-22, production-confirmed 2026-03-22)**:
- **MULTI-PERIOD IS MANDATORY**: bank txn date determines which reconciliation it belongs to. A Jan txn CANNOT match a Feb reconciliation. Production run 1d375699 proved this: 8/11 matches failed with 422 because all were assigned to a single Feb recon.
- Match validation: `csvAmount` must equal `posting.amount` (same sign, same value). Mismatched amounts cause `422 "Summen av posteringer og transaksjoner er ikke lik null."`
- Each match creates a `BankReconciliationMatch` with `type: "MANUAL"` and changes the bank txn to `matched: true`, `matchType: "ONE_TRANSACTION_TO_ONE_POSTING"`
- The posting must be on account 1920 (the bank account)
- For incoming customer payment (+5000): the `PUT /invoice/:payment` creates a debit posting on 1920 with amount +5000. Match with the same-amount bank txn.
- For outgoing supplier payment (-2000): the combined voucher has a credit posting on 1920 with amount -2000. Match with the same-amount bank txn.
- If multiple postings have the same amount, match by date first, then by order. Use a `usedPostingIds` set to avoid double-matching.
- The reconciliation must be OPEN (not closed) when creating matches. Close it in Step 8 AFTER all matches are created.
- **NO GET bank txns needed**: use import response txn IDs positionally (saves 1 API call).

### Step 8: Close ALL bank reconciliations (one per period)

After all matches are created in Step 7, close each reconciliation with the correct per-period closing balance.

**Per-period closing balance**: for each period, use the Saldo of the LAST CSV line in that period. Example: CSV spans Jan 16 – Feb 4; last Jan line (Jan 30) has Saldo 104525; last Feb line (Feb 4) has Saldo 107786.02. Jan closing = 104525, Feb closing = 107786.02.

```typescript
// Close each reconciliation — use creation version (version does NOT change after matches)
for (const [periodId, { period, csvIndices }] of periodMap) {
  const lastIdxInPeriod = csvIndices[csvIndices.length - 1];
  const periodClosingBalance = Math.round(csvLines[lastIdxInPeriod].saldo * 100) / 100;
  const recon = recons[periodId];

  await put(`bank/reconciliation/${recon.id}`, {
    id: recon.id,
    version: recon.version,  // version does NOT increment after matches (sandbox-verified 2026-03-22)
    account: { id: acct1920Id },
    accountingPeriod: { id: periodId },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: periodClosingBalance,
    isClosed: true,
  });
}
```

**Key facts (sandbox-verified 2026-03-22, production-confirmed 2026-03-22)**:
- `PUT /bank/reconciliation/{id}` with `isClosed: true` closes the reconciliation
- **Version does NOT change after matches**: sandbox-verified 2026-03-22 — after creating a recon (version=0) and posting 1 match, GET returned version=0. Production run 1d375699 also confirmed version=0 after 3 matches. Use the creation version directly — NO GET fresh recon needed. Saves P API calls.
- `bankAccountClosingBalanceCurrency` must EXACTLY match the actual account 1920 balance for that period
- If the balance doesn't match, the close fails with `422 "Utgående saldo er forskjellig fra registrert saldo"`
- **Per-period closing balance = Saldo of last CSV line in that period** — after Step 0 posts the opening balance, the cumulative ledger balance at any point = opening + sum of movements = CSV Saldo at that point
- **ROUND to 2 decimal places**: `Math.round(saldo * 100) / 100`
- **Cannot post to account 1920 in periods with closed reconciliations** — post all vouchers BEFORE closing
- **Close in chronological order** (earliest period first) to avoid blocking issues
- **Fallback**: if close fails with 422 balance mismatch, read balance sheet: `GET /balanceSheet?dateFrom=${period.start}&dateTo=${period.end}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*` → use `values[0].balanceOut`. Costs 1 extra call.
- **Fallback 2**: if bank reconciliation endpoints return `403`, skip Steps 7-8 entirely — Check 2 (2/10) still works.

## Call count (updated 2026-03-22)

- **Full flow formula**: 6 reads + 1 opening balance + N customer payments + 1 combined voucher + 1 bank import + 1 GET postings + P create recons + L POST matches + P PUT close recons = **10 + N + L + 2P** (where N = customer payments, L = CSV lines, P = number of distinct accounting periods)
- **Savings vs old formula (6 + N + L + 8)**: skip GET bank txns (use import response txn IDs positionally, -1 call); skip GET fresh recon (version unchanged after matches, -P calls); add per-period recon management (+P create, +P-1 close)
- **Example (2 periods)**: 5 customer + 3 supplier + 3 non-invoice = 11 lines, P=2: 10 + 5 + 11 + 4 = **30 calls, 0 errors** (vs old: 30 calls, 8 errors from single-period bug)
- **Example (1 period)**: same CSV but all in 1 month: 10 + 5 + 11 + 2 = **28 calls, 0 errors** (saves 2 calls vs old formula)
- Old path without Steps 0/6/7/8: 6 + N + 2 = ~13 calls (scored 0.6/6)
- **Even with 30 calls, the API executes in ~8-15 seconds** — well within the 300s budget. The bottleneck is LLM generation time, not API calls.

## Proven results

**ALL completed production runs scored 0.6/6.** None included the full Steps 0+6+7+8 with correct multi-period matching. The full flow (opening balance + bank import + multi-period matching + close) was sandbox-verified END-TO-END on 2026-03-22.

- **Spanish run 3 (1d375699): 30 calls, 8 errors (422), scored pending** — FIRST run with full Steps 0+6+7+8, but created SINGLE Feb recon for a Jan+Feb CSV (11 lines: 5 customer Jan 16-23, 3 supplier Jan 25-30, 3 non-invoice Feb 1-4). 8 Jan txns failed matching with 422 "Banktransaksjoner er ikke en del av bankavstemmingen" because they don't belong to the Feb recon. Only 3 Feb txns matched. Recon closed successfully but with only 3/11 matches. **Root cause**: single-period reconciliation for multi-period bank statement. **Fix**: create separate recon per period.
- **Norwegian run (ac903481): 16 calls, 1 error (422), scored pending** — 3rd bank reconciliation attempt. 6 reads + 5 customer payments (all full: Moe AS ×2, Johansen AS, Nilsen AS ×2) + 1 combined voucher (10 postings: 3 supplier Ødegård/Moe/Hansen + 2 Bankgebyr Ut) + 1 failed recon (floating-point 3506.4300000000003 caused 422) + 1 redundant account re-read + 1 balance sheet read + 1 successful recon (closingBalance=3506.43). **Wasted 3 calls** due to floating-point precision bug. Optimal would have been 13 calls (or 14 with bank statement import). No bank statement import attempted.
- **English run 11 (02daaa35): 13 calls, 0 errors, scored 0.6/6** — 2nd bank reconciliation attempt, optimal call count. 6 reads + 5 customer payments (4 full + 1 partial: Taylor Ltd 5156.25 of 10312.50) + 1 combined voucher (12 postings: 3 supplier payments Taylor+Taylor+Smith + 1 Renteinntekter Ut 1495.08 + 1 Skattetrekk Ut 1819.20 + 1 Skattetrekk Inn 1947.28) + 1 bank reconciliation (closingBalance=56951.75, Feb period). Used computed closing balance (no balance sheet fallback needed). **Confirms**: bank reconciliation alone does not affect the score.
- **Spanish run 2 (57c8f4db): 14 calls, 0 errors, scored 0.6/6** — FIRST bank reconciliation attempt, but Check 1 still failed. 6 reads + 5 customer payments (4 full + 1 partial: Rodríguez SL 14700 of 24500) + 1 combined voucher (12 postings: 3 supplier payments González/Torres/López + 1 Bankgebyr Inn refund 440.96 + 2 Skattetrekk Inn refunds 1563.12+1163.48) + 1 balance sheet read + 1 bank reconciliation (closingBalance=39130.06). **Key finding**: bank reconciliation alone is NOT sufficient — the reconciliation object had `transactions: []`.
- German run 2 (5fc92ebf): 11 calls, 0 errors, no bank reconciliation — scored 0.6/6
- German run 1 (655f6c99): 11 calls, 0 errors, no bank reconciliation — scored 0.6/6
- Portuguese run 2 (5c02a044): 11 calls, 0 errors, no bank reconciliation — scored 0.6/6 (included all non-invoice lines)
- English run 4: 11 calls, 0 errors, no bank reconciliation — scored 0.6/6
- Nynorsk run 2 (c76bbef3): 11 calls, 0 errors, no bank reconciliation — scored 0.6/6
- Portuguese run 1 (d1297531): 11 calls, 0 errors, no bank reconciliation — scored 0.6/6
- Nynorsk run 3 (2f10e207): 11 calls — **scored 0/1 endpoint_unreachable** (proxy expired)
- Spanish run 1 (bc688ea1): **0 calls, TIMED OUT** — scored 0/1
- Nynorsk run 1: 13 calls (3 separate vouchers instead of 1) — scored 0.6/6

## Critical pitfalls

- **ALL 4 STEPS REQUIRED FOR CHECK 1**: Step 0 (opening balance) + Step 6 (bank import) + Step 7 (matching) + Step 8 (close recon). Runs without these steps scored 0.6/6.
- **MULTI-PERIOD RECONCILIATION IS MANDATORY**: CSVs commonly span 2 months (e.g., Jan 16 – Feb 4). A bank transaction ONLY matches a reconciliation whose accounting period covers the transaction's date. Creating a single recon for the last month causes ALL earlier-month txns to fail with `422 "Banktransaksjoner er ikke en del av bankavstemmingen."` Production run 1d375699 confirmed: 8/11 matches failed because Jan txns were assigned to Feb recon. **FIX**: create a SEPARATE reconciliation for EACH accounting period that has bank transactions. Group CSV lines by period (compare date against period start/end). Close each recon with the Saldo of the last CSV line in that period.
- **DO NOT GET bank txns separately**: Import response `transactions` array has valid IDs in CSV order. Use positional mapping: `importResponse.value.transactions[i].id` = bank txn for `csvLines[i]`. Saves 1 API call. Sandbox-verified 2026-03-22.
- **RECON VERSION DOES NOT CHANGE AFTER MATCHES**: Sandbox-verified 2026-03-22 — after creating recon (version=0) and posting matches, GET returned version=0. Production run 1d375699 also confirmed version=0 after matches. Use creation version directly for close PUT. Do NOT waste a GET fresh recon call. Saves P API calls.
- **MATCH VALIDATION**: the matched posting's `amount` must equal the CSV line's amount (same sign, same value). Mismatched amounts → `422 "Summen av posteringer og transaksjoner er ikke lik null."`. The posting must be on account 1920.
- **RECONCILIATION MUST BE OPEN FOR MATCHING**: Create the reconciliation OPEN first (`isClosed: false`), create all matches, THEN close it in Step 8 via `PUT /bank/reconciliation/{id}` with `isClosed: true`.
- **SBANKEN CSV REQUIRES NORWEGIAN CHARS**: Headers must use `å`, `ø` (`Inngående`, `Utgående`, `Bokført`, `Beløp`). Without these chars the import returns `422`.
- **SBANKEN CSV Ut SIGN**: Production CSVs have NEGATIVE Ut values (e.g., `-11600.00`). When converting to Sbanken Beløp, use `l.ut` directly (already negative). Do NOT negate: `-l.ut` would produce positive amounts for outgoing, breaking the match. Production-shaped E2E verified 2026-03-22.
- **ROUND CLOSING BALANCE**: Always use `Math.round(saldo * 100) / 100` before sending to the API. Production run ac903481 had unrounded balance causing 422.
- **USE CSV ending saldo as closing balance** (after posting opening balance in Step 0): `csvLines[csvLines.length - 1].saldo`. After Step 0, the ledger balance = openingBalance + net movements = CSV ending saldo.
- **OPENING BALANCE VOUCHER REQUIRES ALL 4 AMOUNT FIELDS**: `amount`, `amountCurrency`, `amountGross`, `amountGrossCurrency` must ALL be set. Without `amountGross`/`amountGrossCurrency`, amounts are silently zeroed to 0.00.
- **CANNOT POST TO 1920 AFTER RECONCILIATION IS CLOSED**: Post all vouchers (Step 0, Steps 4-5) BEFORE closing the reconciliation in Step 8.
- **TIMEOUT RISK**: This is the most timeout-prone task shape. Read this trusted standard, then IMMEDIATELY write and execute one comprehensive script. Do NOT also read AGENTS.md, openapi.json, or playbook files. The API execution takes ~8-15s for the full flow; all remaining time is wasted on documentation or LLM generation. Skip Glob/search for trusted-standard files — go directly to `cat ./trusted-standards/reconcile-bank-statement-open-invoices.md`.
- Bank text invoice labels (e.g. `Faktura 1001`) do NOT equal Tripletex `invoiceNumber` — match on customer name + amount
- `amountCurrencyOutstanding` does NOT exist on `SupplierInvoiceDTO` — using it in `fields=` causes `400`
- For customer invoices use `amountCurrencyOutstanding` (both `amountOutstanding` and `amountCurrencyOutstanding` exist on `InvoiceDTO`; the latter is correct for foreign currency)
- Do NOT fire per-supplier `/supplierInvoice` queries — one broad query decides the path
- Do NOT create separate vouchers per supplier payment — combine into one
- Do NOT split into multiple scripts or debug passes
- **Non-invoice lines (Bankgebyr, Skattetrekk, Renteinntekter) must NOT be skipped** — they must be booked to the correct accounts (see Step 5)
- After paying a customer invoice, update local outstanding tracker before matching the next line
- Prompts may be in Portuguese, Nynorsk, French, German, Spanish, English — CSV column headers are always Norwegian (Dato, Forklaring, Inn, Ut, Saldo)
- `/bank/reconciliation` is NOT beta (verified in openapi.json and sandbox) — the AGENTS.md claim that it is beta is WRONG and should be ignored for this task shape
