# Score-Aware Reflection

## Task Attribution

- **Inference status:** ambiguous (2 leaderboard entries changed: T06 and T25)
- **Most likely task:** T25 (T3 tier, max 6)
- **Basis:** Task shape (overdue invoice + manual reminder fee on 1500/3400 + fee invoice + partial payment 5000) has been consistently attributed to T25 across 8+ prior production runs
- **T25 leaderboard:** best_score 6 → 6 (unchanged, already at max), attempts 10 → 11
- **T06 leaderboard:** best_score 1.53 → 1.53 (unchanged), attempts 19 → 20 (concurrent unrelated run)
- **Our submission:** `1f4aed21` queued at 22:31:54 (3 seconds after task completion at 22:31:51); still "processing" at capture time (22:32:23)
- **Score not directly available:** the submission was still being scored when the after-snapshot was captured; no `normalized_score` or `score_raw` yet

## Correctness Verdict

**Expected: perfect correctness (score_raw = score_max)**

Evidence:
- All 8 prior production runs of this exact task shape with the 6-call path scored 6/6 checks
- This run executed the identical 6-call path with 0 errors
- All payload structures were correct on the first attempt (voucher with `row: 1`/`row: 2`, invoice with `orders[].orderLines[]`, no `vatType` on order line)
- The run's console output confirms all writes succeeded: voucher `#1`, fee invoice `#4` (amount=40), payment reduced outstanding from 26312.5 to 21312.5
- No reason to expect a correctness failure

## Efficiency Verdict

**Expected: optimal efficiency (normalized_score = 6, matching T25 max)**

- 6 API calls — the proven canonical minimum for this task shape
- 0 errors / 0 wasted calls / 0 retries
- All prior 6-call runs scored normalized_score=6
- No unnecessary reads (zero follow-up GETs after writes)
- All potential 5-call shortcuts have been disproven in sandbox (paymentTypeId mandatory, account.id mandatory)

## Likely Root Cause

No issues to diagnose. The run was optimal in both correctness and efficiency. The only limitation is that T25's best_score was already at 6 (the max), so this run cannot improve the leaderboard — it can only maintain it.

## What Went Right

1. **Read the trusted standard first.** The agent read the full trusted standard before writing any code, ensuring all documented pitfalls were avoided.
2. **Perfect payload construction.** Every single API call succeeded on the first attempt:
   - Voucher: explicit `row: 1`/`row: 2`, `account: { id }`, `customer: { id }` on 1500 posting, balanced amounts
   - Fee invoice: `orders: [{ customer, orderDate, deliveryDate, orderLines: [...] }]` (not top-level `orderLines`)
   - Payment: included `paymentTypeId`, used exact `paidAmount=5000`
3. **Correct response parsing.** Handled both `values` (list) and `value` (single object) shapes from the start.
4. **No unnecessary calls.** Omitted `vatType` GET (API defaults to 0%), no follow-up verification GETs, no duplicate reads.
5. **Fast execution.** Single script, sequential calls, no retries.

## What To Change Next Time

Nothing. This is the optimal path for this task shape:

1. `GET /invoice?...&fields=*,customer(*)` — locate overdue invoice
2. `GET /invoice/paymentType?...` — resolve incoming payment type
3. `GET /ledger/account?number=1500,3400&fields=*` — resolve account IDs
4. `POST /ledger/voucher` — book manual fee (debit 1500, credit 3400)
5. `POST /invoice` — create and send fee invoice
6. `PUT /invoice/{id}/:payment?...&paidAmount=5000` — register partial payment

The trusted standard is comprehensive and up-to-date. The 6-call path has been confirmed across 9 production runs in 6 languages (nb, en, es, pt, de, fr) with 5 different fee amounts (35, 40, 50, 60, 70). No further optimization is possible.
