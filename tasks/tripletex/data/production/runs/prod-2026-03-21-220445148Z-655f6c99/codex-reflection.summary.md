# Reflection: prod-2026-03-21-220445148Z-655f6c99

## 1. Task

Reconcile bank statement CSV with open invoices in Tripletex (German prompt). Match incoming payments to customer invoices and outgoing payments to supplier invoices, handling partial payments. CSV contained 10 lines: 5 customer payments (Weber, Meyer, Schneider, Müller×2), 3 supplier payments (Becker, Schneider, Meyer), 2 non-invoice lines (Skattetrekk Inn 393.31 + Ut 301.90).

**Result: scored 0.6/6 (Check 1 failed, Check 2 passed).**

## 2. Reflection

**What went well:**
- Script executed flawlessly: 11 calls, 0 errors, all 5 customer payments matched correctly (including partial payment Müller 12593.75 of 25187.50), 3 supplier payments + 2 Skattetrekk lines combined into 1 voucher (10 postings)
- Correct customer invoice matching: exact outstanding match for 4 invoices, partial payment handled correctly for Müller #4
- Non-invoice lines (Skattetrekk Inn/Ut) correctly booked with proper direction/account mapping
- Fast execution: script ran in seconds, well within 300s budget

**What went poorly:**
- Scored 0.6/6 — same as all prior runs. Check 1 failed again.
- Root cause: the run used the OLD trusted standard (pre-Step-6) which did not include bank reconciliation
- The trusted standard was updated AFTER this run to include Step 6 (bank reconciliation via `POST /bank/reconciliation` with `isClosed: true`), but this run never had access to the updated version

**Why the mistake happened:**
- The trusted standard at execution time did not include Step 6 (bank reconciliation). It had only 5 parallel reads and no bank reconciliation step.
- The standard was updated by a concurrent reflection pass (run 5c02a044) that identified bank reconciliation as the likely Check 1 fix, but the update landed after this run's agent had already read and executed the old standard.
- This is a timing issue: the learning from the 5c02a044 reflection pass wasn't available to this run's agent.

## 3. Call Efficiency

**Run used 11 calls (5 reads + 5 payments + 1 voucher). This was NOT minimal for the correct solution.**

The correct path (with bank reconciliation) requires:
- 6 parallel reads: invoice, paymentType, supplier, supplierInvoice, accounts, **accountingPeriod** (was missing)
- 5 customer payments (PUT)
- 1 combined voucher (supplier + non-invoice postings)
- 1 balance sheet read (GET /balanceSheet after all postings, for correct closing balance)
- 1 bank reconciliation (POST /bank/reconciliation with isClosed:true)

**Correct minimum: 14 calls** (6 + 5 + 1 + 1 + 1)

**Wasted vs missing calls:**
- No wasted calls in the 11-call execution — all were necessary for the partial solution
- 3 missing calls: GET /ledger/accountingPeriod, GET /balanceSheet, POST /bank/reconciliation
- These 3 additional calls would have enabled Check 1 to pass (potentially scoring 6/6 instead of 0.6/6)

**Optimistic path (13 calls):** Skip balance sheet read, use CSV ending saldo (128347.66) directly as `bankAccountClosingBalanceCurrency`. Saves 1 call but risks 422 if account opening balance doesn't match CSV-implied opening balance. Sandbox testing confirmed wrong balance → 422 error. The safe path (14 calls) is recommended.

## 4. Root Causes

1. **Missing bank reconciliation step** — The trusted standard at execution time did not include Step 6. All 8+ completed runs that omitted bank reconciliation scored exactly 0.6/6. The scorer checks for a closed bank reconciliation object, which was never created.

2. **Timing of learning** — The fix (Step 6) was identified by a concurrent reflection pass on run 5c02a044 and committed to the trusted standard, but this run's agent had already loaded and executed the old standard. This is a race condition in the learning pipeline.

3. **No fault in execution** — Given the trusted standard available at execution time, the agent performed optimally: 11 calls, 0 errors, correct matching, correct non-invoice booking. The only issue was the incomplete standard.

## 5. Sandbox Verification

Tested `POST /bank/reconciliation` with `isClosed: true` in sandbox:

1. **Correct balance → 201 Created**: `POST /bank/reconciliation` with `bankAccountClosingBalanceCurrency` matching the actual account 1920 balance (from GET /balanceSheet) succeeded and created+closed the reconciliation in 1 call.
   - March 2026 period: closingBalance=-22263.72 → created id=12705473, isClosed=true
   - April 2026 period: closingBalance=-54113.72 → created id=12705474, isClosed=true

2. **Wrong balance → 422**: Using `realBalance + 1000` as `bankAccountClosingBalanceCurrency` returned `422 "Utgående saldo er forskjellig fra registrert saldo"`.

3. **Period ordering constraint**: Cannot create a reconciliation for an earlier period if a later period already has a closed reconciliation (returns 422 "Det finnes en nyere, godkjent..."). Production runs should create the reconciliation for the period containing the LAST CSV entry date.

4. **Period selection**: Accounting periods are always monthly in fresh accounts (start = 1st of month, end = 1st of next month). Match with `p.start <= lastDate && p.end > lastDate`.

**Conclusion**: The balance sheet read (1 extra call) is essential to guarantee the correct closing balance. Using CSV saldo directly is risky — a 422 error wastes a call AND fails the reconciliation.

## 6. Playbook Changes

**Updated existing files (no new files created):**

- `./trusted-standards/reconcile-bank-statement-open-invoices.md`:
  - Added German run 1 (655f6c99) to production results
  - Updated "All 7" → "All 8" throughout
  - Strengthened "Next run should" → "Next run MUST" for Step 6
  - Added specific note that 655f6c99 used OLD 5-read path and still scored 0.6

- `./task-playbooks/reconcile-bank-statement-open-invoices.md`:
  - Added German run 1 (655f6c99) as new production result entry
  - Updated pitfall count from 7 → 8 runs
  - Added "(read from balance sheet AFTER all postings)" to bank reconciliation requirement

**No changes to AGENTS.md** — the trusted standards table already included this task shape.

## 7. Commit

```
a9f4f30a tripletex playbook: reconcile-bank-statement — add 9th production result (655f6c99, German prompt, 11 calls 0 errors, scored 0.6/6); 8th consecutive run without bank reconciliation all scoring 0.6 confirms bank reconciliation (Step 6) is the sole remaining blocker for Check 1
```

## 8. Reusable Heuristics

1. **Bank reconciliation is mandatory for this task shape.** All 8+ completed runs without it scored exactly 0.6/6. The next run MUST include Step 6: `GET /ledger/accountingPeriod` in initial parallel reads, `GET /balanceSheet` after all postings, then `POST /bank/reconciliation` with `isClosed: true`.

2. **Always read the balance sheet for closing balance.** Do not trust CSV ending saldo — the account opening balance may differ from the CSV-implied opening. Wrong balance → 422 error (sandbox-verified).

3. **Correct call count is 14 for the common shape** (5 customers, 3 suppliers, non-invoice lines, no supplier invoices): 6 reads + 5 payments + 1 voucher + 1 balance read + 1 bank recon.

4. **Period selection for bank reconciliation:** Use the period containing the LAST CSV entry date. Periods are monthly (`start` = 1st, `end` = 1st of next month). Match with `p.start <= lastDate && p.end > lastDate`. Optimized query: `GET /ledger/accountingPeriod?startFrom=<first-of-month>&startTo=<day-after-first>&count=1&fields=*`.

5. **Timing of trusted standard updates matters.** If a concurrent reflection pass updates the standard, the fix won't be available to runs that have already loaded the old version. Critical fixes should be prioritized for immediate deployment.

6. **German prompt confirmed:** CSV format is identical (Dato/Forklaring/Inn/Ut/Saldo headers), customer/supplier name matching works with German company names (GmbH suffix), "Lieferant" prefix identifies supplier payment lines, "Innbetaling fra" prefix identifies customer payment lines.
