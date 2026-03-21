# Score-Aware Reflection: prod-2026-03-21-200502800Z-86050544

## Task Attribution

- **Task ID**: 27 (T3, max score 6)
- **Prompt**: Nynorsk — register payment on 12301 EUR invoice to Bølgekraft AS (830993940) at settlement rate 11.83 NOK/EUR (original 10.83), book agio
- **Request ID**: 14c4b92d
- **Duration**: 92s

## Correctness Verdict

**Perfect.** `correctness=1.0`, `score_raw=10/10`, all 4 checks passed. The run achieved the correct final Tripletex state: payment registered (`amountOutstanding=0`) and agio booked on account 8060 via manual voucher.

## Efficiency Verdict

**Maximum score achieved.** `normalized_score=6` — the full T3 maximum. 5 API calls, 0 errors. The NOK fallback path (invoice lookup → paymentType → simple payment → account ID lookup → manual agio voucher) is the documented minimum and was executed without any wasted calls or retries.

**Leaderboard impact**: Task 27 best_score jumped from **1.5 → 6** (from 9 prior attempts to 10 total). This is the first full-score run on task 27 ever. The previous best of 1.5 (=25% correctness on a 6-point T3 task) came from runs that registered payment but did not book agio.

## Likely Root Cause

No root cause needed — perfect run. The breakthrough was the NOK fallback flow with manual agio voucher, which was added to the trusted standard after earlier 50% and 0% failures on this same task shape. All prior failures on task 27 fell into one of:
1. No NOK fallback at all (script errored on NOK invoice → 0%)
2. NOK fallback with payment only, no manual agio (→ 50%, checks 3-4 failed)
3. Manual agio voucher with `row: 0` (→ 422 error → 0%)

This run avoided all three traps by following the updated trusted standard.

## What Went Right

1. **Trusted standard followed exactly**: Read the standard, wrote one script with inline EUR/NOK branching, executed cleanly
2. **NOK detection correct**: `amount === amountCurrency` check triggered NOK fallback immediately
3. **Manual agio voucher with `row: 1`+**: Avoided the `row: 0` → 422 trap that killed earlier attempts
4. **Correct agio calculation**: 12301 × (11.83 − 10.83) = 12301 NOK, debit 1920, credit 8060
5. **Zero errors**: No 4xx, no retries, no wasted calls
6. **Single script execution**: No debugging scripts, no investigation — straight execution
7. **5 calls = documented minimum**: Every call was necessary, none could be eliminated (sandbox-proven: `account: { number }` doesn't work in vouchers, so the ID lookup call is mandatory)

## What To Change Next Time

Nothing needs to change for this task shape. The flow is proven optimal:

1. `GET /invoice?invoiceDateFrom=...&invoiceDateTo=...&fields=*,currency(*)` — find invoice, detect EUR vs NOK
2. `GET /invoice/paymentType?fields=*,debitAccount(*)` — find bank payment type
3. `PUT /invoice/{id}/:payment` — register payment (EUR: with `paidAmountCurrency`; NOK: simple `paidAmount=amountOutstanding`)
4. (NOK only) `GET /ledger/account?number=1920,8060&fields=id,number` — resolve account IDs
5. (NOK only) `POST /ledger/voucher?sendToLedger=true` — book agio manually with `row: 1`+

The only theoretical optimization (using `account: { number }` to skip the account lookup) was sandbox-disproven: Tripletex requires `account: { id }` in voucher postings. The 5-call NOK path and 3-call EUR path are true minimums.
