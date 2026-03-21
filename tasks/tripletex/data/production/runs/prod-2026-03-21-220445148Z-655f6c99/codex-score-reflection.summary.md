# Score-Aware Reflection — Run 655f6c99

## 1. Task Attribution

- **Run ID**: prod-2026-03-21-220445148Z-655f6c99
- **Attributed task**: T23 (Reconcile bank statement with open invoices)
- **Task tier**: T3 (tasks 19–30), max normalized score = 6
- **Prompt language**: German
- **Leaderboard diff**: T23 best_score 0.6 → 0.6 (no improvement), attempt 10 → 11
- **Other tasks in this batch**: T06 improved 1.4→1.5333, T27 held at 6 (already maxed)

## 2. Correctness Verdict

**NOT CORRECT. Score: 0.6/6 (10% of max).**

- Raw score: 2/10
- Checks: 1/2 passed — **Check 1 failed**, Check 2 passed
- Check 1 is worth 8/10 raw points (80% of total)
- This is the 9th consecutive attempt at T23 (11 total including 2 timeouts) that scored ≤ 0.6

The run achieved correct customer payments, correct supplier voucher, and correct non-invoice line booking — but **failed to create a closed bank reconciliation object** (`POST /bank/reconciliation` with `isClosed: true`). Check 1 almost certainly validates the existence of a closed bank reconciliation for the relevant accounting period.

## 3. Efficiency Verdict

Efficiency is moot because correctness was far from perfect. The run used 11 calls with 0 errors, which would have been efficient for the old (incomplete) path. The correct path requires 13–14 calls:

| Path | Calls | Breakdown |
|---|---|---|
| This run (incomplete) | 11 | 5 reads + 5 payments + 1 voucher |
| Correct safe path | 14 | 6 reads + 5 payments + 1 voucher + 1 balance read + 1 reconciliation |
| Correct optimistic path | 13 | 6 reads + 5 payments + 1 voucher + 1 reconciliation (trust CSV saldo) |

The 11-call path was efficient but incomplete — it's pointless to optimize call count when the missing calls are the ones that produce 80% of the score.

## 4. Likely Root Cause

**The agent executed an outdated version of the trusted standard that did not include Step 6 (bank reconciliation).**

The trusted standard was updated during the same session's reflection pass to add:
1. `GET /ledger/accountingPeriod?count=100&fields=*` in the initial parallel batch (6th read)
2. `GET /balanceSheet?dateFrom=...&dateTo=...&accountNumberFrom=1920&accountNumberTo=1920` after all payments
3. `POST /bank/reconciliation` with `{ account: {id}, accountingPeriod: {id}, type: "MANUAL", bankAccountClosingBalanceCurrency: <balance>, isClosed: true }`

The agent read the trusted standard before the update and correctly followed what it said — but the standard was missing the critical bank reconciliation step. This is a systemic knowledge gap, not an execution error.

**Contributing factor**: The run used only 5 parallel reads (the old standard) instead of 6 (missing `/ledger/accountingPeriod`). Even if the agent had tried to create a bank reconciliation after the payments, it would have needed an extra call to get the accounting period ID.

## 5. What Went Right

1. **Zero errors**: All 11 API calls returned 2xx. No 4xx waste.
2. **Correct customer matching**: All 5 customer payments correctly matched — including partial payment (Müller GmbH 12593.75 of 25187.50 on invoice #4, and full 6500 on invoice #5).
3. **Correct supplier voucher**: 3 supplier payments (Becker, Schneider, Meyer) combined into 1 voucher with correct DR 2400 / CR 1920 postings.
4. **Non-invoice lines included**: Both Skattetrekk lines (Inn 393.31 on 2026-02-07 and Ut 301.90 on 2026-02-08) correctly booked with DR/CR 2600/1920.
5. **Combined voucher**: All supplier + non-invoice postings merged into a single 10-posting voucher (no wasted calls on separate vouchers).
6. **Fast execution**: Well within the 300s timeout — no documentation over-reading or LLM generation delays.
7. **Check 2 passed**: The invoice payments and voucher postings were fully correct.

## 6. What To Change Next Time

### Must Do (Critical — without this, Check 1 always fails)

1. **Add `GET /ledger/accountingPeriod?count=100&fields=*` to the initial parallel read batch** (6 reads instead of 5). This provides the period ID needed for bank reconciliation.

2. **After all payments and voucher creation, read the balance sheet**:
   ```
   GET /balanceSheet?dateFrom={period.start}&dateTo={period.end}&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*
   ```
   Use `balanceOut` as the closing balance.

3. **Create and close bank reconciliation in one call**:
   ```
   POST /bank/reconciliation
   {
     account: { id: <1920_id> },
     accountingPeriod: { id: <period_id> },
     type: "MANUAL",
     bankAccountClosingBalanceCurrency: <balanceOut>,
     isClosed: true
   }
   ```
   Period selection: find the period where `start <= lastCsvDate && end > lastCsvDate`.

4. **Fallback**: If `POST /bank/reconciliation` returns 403 (proxy blocks it), accept the loss gracefully — Check 2 still gives 2/10 raw (0.6 normalized).

### Should Do (Optimization)

5. **Consider trusting CSV saldo** to skip the balance sheet read (saves 1 call, 14→13). The CSV's last row Saldo column should equal the account 1920 balance if the environment's opening balance is set correctly. Risk: 422 if balance doesn't match, costing 1 wasted call + 1 retry = net worse.

6. **The trusted standard has been updated** with Step 6 and all 8 production run results. Future agents reading the standard will automatically get the correct path. No further documentation changes needed — just execution.

### Key Numbers

- **Current best for T23**: 0.6/6 (11 attempts, all failed Check 1)
- **Expected score with bank reconciliation**: up to 6/6 (both checks pass)
- **Score improvement potential**: +5.4 points (from 0.6 to 6.0) — this is the single highest-impact fix remaining
- **Call cost of the fix**: +2–3 extra calls (from 11 to 13–14)
