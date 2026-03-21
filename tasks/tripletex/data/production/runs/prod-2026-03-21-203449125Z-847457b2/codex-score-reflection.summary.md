# Score Reflection — prod-2026-03-21-203449125Z-847457b2

## 1. Task Attribution

- **Task ID**: 27
- **Tier**: T3 (max score 6)
- **Prompt**: Register payment on 2716 EUR invoice to Fossekraft AS (928230651), original rate 10.11, settlement rate 9.33, book disagio
- **Attempt**: 12th attempt on task 27 (previous best was already 6)

## 2. Correctness Verdict

**Perfect.** Correctness = 1.0, score_raw = 10/10, 4/4 checks passed. All side effects correct:
- Payment registered (invoice outstanding = 0)
- Disagio booked on account 8160 with correct amount (2118.48 NOK)

## 3. Efficiency Verdict

**Maximum score achieved.** normalized_score = 6 = tier max. The run matched the leaderboard best_score of 6 (already set by a prior attempt). 5 API calls, 0 errors — this is the proven minimum for the NOK-fallback disagio path and earned no efficiency penalty.

No wasted calls:
1. GET /invoice — required (locate invoice)
2. GET /invoice/paymentType — required (resolve bank payment type)
3. PUT /invoice/:payment — required (register payment)
4. GET /ledger/account?number=8160 — required (resolve disagio account ID for voucher)
5. POST /ledger/voucher — required (book manual disagio)

## 4. Likely Root Cause

No issues. This was a clean, optimal execution. The run achieved the maximum possible score on the first try within this session.

## 5. What Went Right

- **Read trusted standard first**: Avoided all 8 documented API traps (silent param ignore, missing expansions, row-0 restriction, account:{number} rejection).
- **Both EUR and NOK paths inline**: Script handled both cases — no timeout risk from missing fallback (which caused 0% on attempt 67c52406).
- **Correct disagio direction**: debit 8160 (+2118.48), credit bank (−2118.48). This was the first full-score disagio production confirmation.
- **Reused debitAccount.id from paymentType**: No hardcoded 1920; used the actual bank account from Call 2.
- **Correct FX calculation**: 2716 × |9.33 − 10.11| = 2716 × 0.78 = 2118.48 NOK.
- **No 4xx errors**: Every call succeeded on first attempt.
- **Fast execution**: 80s duration, well within the 300s budget.

## 6. What To Change Next Time

Nothing. This run is the canonical reference for the NOK-fallback disagio path on task 27. The 5-call, 0-error pattern with max score is the optimal execution.

For future runs of this task shape:
- Continue using the trusted standard as-is — it now has production confirmations for both agio (86050544, 3386d6a5) and disagio (847457b2).
- The EUR auto-FX path (3 calls) has still never been exercised in production — every production invoice has been NOK. If a genuine EUR invoice appears, the `:payment` endpoint will auto-book FX in 3 calls with no manual voucher needed.
- No playbook or standard changes required — the prior reflection already added this run's confirmation to both files.
