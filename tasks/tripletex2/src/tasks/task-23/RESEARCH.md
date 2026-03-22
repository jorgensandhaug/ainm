# Task 23 — Reconcile bank statement Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `23`
- Active strategy pin: `23.reconcile-bank-statement.v1`
- Task implementation: `task.ts`
- Strategy: `src/tasks/task-23/strategies/reconcile-bank-statement.ts` (1308 lines)

## Current Research Queue Snapshot

- Priority: `15`
- Band: `focus`
- Queue eligibility: `ready`
- Best known score: `0.6` / `6`

## Scoring Summary

- Score: raw 2/10, normalized 0.6/6
- Check 1: **ALWAYS fails** (worth ~8 points)
- Check 2: **ALWAYS passes** (worth 2 points)
- 7 total production runs: 5 scored 0.6/6, 2 scored 0 (crash/timeout)
- Score has NEVER improved beyond 0.6 across all attempts

## Root Cause Analysis (2026-03-22)

### Frontier Hypothesis Invalidated

The original frontier hypothesis from `research/frontier-import/task-23.md` stated:
> "Book all bank-statement lines, including non-invoice rows, instead of skipping them."

**This hypothesis is WRONG as a standalone fix.** Production run `prod-2026-03-21-214106773Z-5c02a044` booked ALL non-invoice lines (Bankgebyr via 7770, Skattetrekk via 2600, Renteinntekter via 8050) in a combined voucher and STILL scored 0.6/6 with Check 1 failing.

### Actual Root Cause: Missing Bank Reconciliation Flow

Check 1 tests whether a **closed bank reconciliation** exists with properly matched transactions. The strategy currently performs Steps 1-5 only. Check 1 requires the full 9-step flow.

Evidence from codex production runs:
- **Run 5c02a044**: Booked ALL non-invoice lines (12-posting combined voucher) but NO bank reconciliation → 0.6/6 (Check 1 fail)
- **Run 02daaa35**: Booked ALL non-invoice lines + created closed bank reconciliation with `POST /bank/reconciliation` → 0.6/6 (Check 1 fail). Failed because: (a) no opening balance voucher, and (b) no bank statement import with transaction matching
- **Run 57c8f4db**: Created bank reconciliation but reconciliation had `transactions: []` → 0.6/6 (Check 1 fail)
- **All runs without bank reconciliation**: 0.6/6 (Check 1 fail)

### Full Required Flow (Sandbox-Verified, Not Yet Tested in Production)

The codex trusted standard evolved through iterative experiments to identify a 9-step flow. Steps 0, 6, 7, 8 are ALL required for Check 1:

| Step | Action | Purpose |
|------|--------|---------|
| 0 | Post opening balance voucher (DR 1920, CR 2050) | Ledger balance matches CSV |
| 1 | 6 parallel reads (invoices, paymentTypes, suppliers, supplierInvoices, accounts, accountingPeriod) | Data gathering |
| 2 | Select payment type with debitAccount 1920 | Payment setup |
| 3 | Match and pay customer invoices | Invoice reconciliation |
| 4 | Handle supplier payments (combined voucher) | Invoice reconciliation |
| 5 | Book ALL non-invoice lines (Bankgebyr/Skattetrekk/Renteinntekter) | Balance consistency |
| 6 | `POST /bank/statement/import` with SBANKEN_BEDRIFT_CSV format | Creates bank statement transactions |
| 7 | `GET /ledger/posting` + `POST /bank/reconciliation/match` per line | Matches bank txns to ledger postings |
| 8 | `PUT /bank/reconciliation/{id}` with `isClosed: true` | Closes reconciliation |

## Strategy Code Gap Analysis

### Current strategy file: `strategies/reconcile-bank-statement.ts`

**What it does correctly:**
- Parses CSV with Norwegian headers (Dato, Forklaring, Inn, Ut, Saldo)
- Handles delimiter detection, BOM removal, date normalization
- Matches customer invoices by name + amount scoring (exact, partial, strong reference)
- Matches supplier invoices by name + amount scoring
- Falls through to `classifyNonInvoiceRow` for unmatched rows
- Posts vouchers for non-invoice lines with correct debit/credit logic
- Handles both incoming (amountNok > 0) and outgoing (amountNok < 0) vouchers

**Critical gaps (ordered by severity):**

1. **No bank reconciliation flow (Steps 0, 6, 7, 8)** — the strategy ends after posting vouchers. This is the reason Check 1 always fails. The entire bank statement import + matching + close flow is missing.

2. **Missing Skattetrekk classification** — `classifyNonInvoiceRow()` only handles `bank-fee` and `interest-income`. Skattetrekk rows will cause the strategy to throw:
   ```
   CSV row N could not be matched to an open invoice or a supported non-invoice booking pattern.
   ```
   The `NonInvoiceClassification` type union is `"bank-fee" | "interest-income"` — needs `"tax-withholding"`.

3. **Missing tax withholding account** — `DEFAULT_BANK_FEE_ACCOUNT_NUMBERS = [7770, 7790]` and `DEFAULT_INTEREST_INCOME_ACCOUNT_NUMBERS = [8050, 8060]` are defined, but there is no tax withholding account constant. Needs `DEFAULT_TAX_WITHHOLDING_ACCOUNT_NUMBERS = [2600]`.

4. **Interest income account list** — uses `[8050, 8060]` but standard Norwegian "Renteinntekter" is account 8040. Consider adding 8040 to the fallback list, or at least making 8050 the first preference (current code tries them in order).

5. **No opening balance voucher** — the strategy doesn't post an opening balance to make account 1920 match the CSV starting saldo. Without this, the ledger balance after all postings won't match the CSV ending saldo, which is needed for the bank reconciliation closing balance.

6. **No accounting period lookup** — needed for bank reconciliation. The period must be fetched from `/ledger/accountingPeriod`.

7. **No bank statement import** — `POST /bank/statement/import` with SBANKEN_BEDRIFT_CSV format is entirely missing. The CSV must be converted to Sbanken format (Norwegian chars required: Inngaende, Utgaende, Bokfort, Belop).

8. **No transaction matching** — `POST /bank/reconciliation/match` to pair bank transactions with ledger postings on 1920 is missing.

9. **No reconciliation close** — `PUT /bank/reconciliation/{id}` with `isClosed: true` is missing.

### CSV Parsing Issues

The CSV parser handles the `Inn - Ut` calculation correctly for standard positive values but needs attention for edge cases:
- Ut column values are sometimes negative (e.g., `-1282.21`). The formula `0 - (-1282.21) = +1282.21` makes the amountNok positive, which the strategy treats as an incoming amount. This is actually correct for the voucher posting direction logic.
- The strategy already handles both positive and negative amountNok in the voucher construction (`isIncoming` flag).

## Non-Invoice Row Analysis (Across All Production CSVs)

Three types observed across 7 production CSVs:

| Type | Norwegian | Account | Direction varies? |
|------|-----------|---------|-------------------|
| Interest income | Renteinntekter | 8050 (Annen renteinntekt) | Yes - appears in both Inn and Ut columns |
| Bank fees | Bankgebyr | 7770 (Bank og kortgebyrer) | Yes - appears in both Inn and Ut columns |
| Tax withholding | Skattetrekk | 2600 (Forskuddstrekk) | Yes - appears in both Inn and Ut columns |

All three types can appear in EITHER the Inn or Ut column. The direction determines the accounting treatment:
- **Inn (positive)**: Debit 1920, Credit contra account
- **Ut (negative)**: Debit contra account, Credit 1920

The strategy's voucher posting logic already handles both directions correctly via the `isIncoming` flag. The main gap is classification (Skattetrekk missing) and the broader bank reconciliation flow.

## Account Mappings (Sandbox-Verified)

| Purpose | Account # | Description |
|---------|-----------|-------------|
| Bank | 1920 | Bankinnskudd |
| Supplier liability | 2400 | Leverandorgjeld |
| Equity contra (opening balance) | 2050 | Annen egenkapital |
| Tax withholding | 2600 | Forskuddstrekk |
| Bank fees | 7770 | Bank og kortgebyrer |
| Interest income | 8050 | Annen renteinntekt |

## Call Count Estimate

Full flow (no supplier invoices, common case):
- 6 reads (invoice, paymentType, supplier, supplierInvoice, account, accountingPeriod)
- 1 opening balance voucher
- N customer payments (typically 5)
- 1 combined voucher (suppliers + non-invoice)
- 1 bank statement import
- 1 GET ledger postings
- L POST reconciliation/match (one per CSV line, typically 10-11)
- 1 GET/POST reconciliation
- 1 PUT close reconciliation
- Total: ~28 calls for 11-line CSV

API execution is ~8-15 seconds. Well within 300s budget.

## Dead Ends / Anti-Patterns

1. **Skipping non-invoice rows** — even though it doesn't fix Check 1 by itself, non-invoice lines MUST be booked to make the 1920 balance match the CSV saldo, which is required for the bank reconciliation close in Step 8.
2. **Bank reconciliation without matching** — creating a closed bank reconciliation without importing the bank statement and matching transactions does NOT pass Check 1 (proven by runs 02daaa35 and 57c8f4db).
3. **Bank reconciliation without opening balance** — the ledger balance won't match the CSV saldo, causing 422 on reconciliation close.
4. **DNB_CSV, DANSKE_BANK_CSV, NORDEA_CSV formats** — all rejected the converted format with 422. Only SBANKEN_BEDRIFT_CSV worked.
5. **Separate vouchers per supplier payment** — wastes API calls. Combine into one voucher.
6. **Bank text invoice numbers** — CSV says "Faktura 1001" but Tripletex invoiceNumber is 1. Match by customer name + amount, not invoice number.

## What Must Change in the Strategy

The strategy needs a major expansion from its current ~13-call flow to a ~28-call flow:

1. Add `"tax-withholding"` to `NonInvoiceClassification` union
2. Add Skattetrekk keyword detection in `classifyNonInvoiceRow()`
3. Add `DEFAULT_TAX_WITHHOLDING_ACCOUNT_NUMBERS = [2600]`
4. Add account 2050 to the account fetch query
5. Add accounting period fetch
6. Add opening balance voucher posting (Step 0)
7. Add bank statement CSV conversion to SBANKEN_BEDRIFT_CSV format
8. Add `POST /bank/statement/import` call (Step 6)
9. Add `GET /ledger/posting` to get posting IDs on 1920 (Step 7)
10. Add `POST /bank/reconciliation/match` for each CSV line (Step 7)
11. Add bank reconciliation create/close flow (Step 8)
12. Update `expectedCallProfile` from `{targetCalls: 6, maxCalls: 18}` to `{targetCalls: 28, maxCalls: 40}`

## Production Run Evidence

| Run ID | Non-invoice booked? | Bank recon? | Opening balance? | Bank import? | Matching? | Score |
|--------|--------------------| ------------|-----------------|-------------|-----------|-------|
| 8bf4760c | No | No | No | No | No | 0.6/6 |
| 4edaedea | No | No | No | No | No | 0.6/6 |
| c76bbef3 | No | No | No | No | No | 0.6/6 |
| d1297531 | No | No | No | No | No | 0.6/6 |
| 5c02a044 | YES | No | No | No | No | 0.6/6 |
| 57c8f4db | YES | YES (empty txns) | No | No | No | 0.6/6 |
| 02daaa35 | YES | YES (closed) | No | No | No | 0.6/6 |
| Full flow | YES | YES | YES | YES | YES | **UNTESTED** |

## Next Steps

1. **Add Skattetrekk classification** to prevent strategy crashes on tax withholding rows
2. **Implement the full 9-step bank reconciliation flow** — this is the structural fix for Check 1
3. **Sandbox-verify** the bank statement import (SBANKEN_BEDRIFT_CSV format conversion) and matching flow
4. **Production test** the complete flow to confirm Check 1 passes

## Next Improving-Agent Update Checklist

- Read the generated packet first.
- Compare against the current active strategy before editing code.
- Verify with the research OS / sandbox instead of writing strategy tests.
- The codex trusted standard at `tripletex/codex-environment/trusted-standards/reconcile-bank-statement-open-invoices.md` contains extensive sandbox-verified details on the full flow, including SBANKEN_BEDRIFT_CSV format conversion, matching logic, and reconciliation close.
- Write back the outcome here, even if the result is "no import" or "frontier unchanged".
