# Score-Aware Reflection — prod-2026-03-22-053320552Z-1f10881c

## 1. Task Attribution

- **Task ID:** 17 (T2 tier, max score 4.0)
- **Prompt:** Spanish — create dimension "Prosjekttype" with values "Forskning" + "Utvikling", book voucher on account 7000 for 14550 NOK linked to "Forskning"
- **Trusted standard:** `create-free-accounting-dimension-and-book-voucher.md` (exact match)

## 2. Correctness Verdict

**Perfect correctness.** 13/13 raw score, 6/6 checks passed, `correctness = 1.0`. No field-level errors, no missing side effects.

## 3. Efficiency Verdict

**Normalized score: 3.5/4.0 (87.5%).** This matches the leaderboard best for T17 (3.5 before, 3.5 after — this run tied the existing best). The 0.5 gap from 4.0 is a small efficiency penalty from using 5 API calls.

However, **3.5 is the practical ceiling** for this task shape. The 5-call path is the proven minimum:
1. `POST /ledger/accountingDimensionName` — mandatory (creates the dimension)
2. `POST /ledger/accountingDimensionValue` — mandatory (creates value 1)
3. `POST /ledger/accountingDimensionValue` — mandatory (creates value 2)
4. `GET /ledger/account?number=7000,1920&fields=*` — mandatory (account id resolution; number-only voucher posting returns 422)
5. `POST /ledger/voucher` — mandatory (books the voucher)

No lower-call path exists:
- Batch value creation (`POST /list` or array body) → 400/422 (sandbox-verified)
- Account by number on voucher posting → 422 (sandbox-verified 10+ times)
- All 9 consecutive production runs used exactly 5 calls; none scored higher than 3.5

## 4. Likely Root Cause

**No root cause to fix.** The efficiency penalty is structural — the scorer deducts slightly for 5 calls vs a theoretical lower bound that does not exist in Tripletex's API. No wasted calls, no retries, no 4xx errors. The 3.5 score is the maximum achievable.

## 5. What Went Right

- **Read trusted standard first** — correct workflow, avoided all documented pitfalls
- **5 calls, 0 errors** — minimum possible, no wasted calls
- **`row: 1`/`row: 2` on postings** — avoided the row-0 trap (422) that cost an earlier run 1 call
- **Dynamic `freeAccountingDimension{n}` from `dimensionIndex`** — correct field selection
- **Id-based account refs** — mandatory per sandbox verification
- **Spanish prompt handled correctly** — dimension names/values are Norwegian regardless of prompt language
- **Tied leaderboard best** — 3.5 = existing best for T17 across 23 attempts

## 6. What To Change Next Time

**Nothing.** This task shape is fully optimized:
- 5 calls is the proven minimum (no 4-call shortcut exists)
- 0 errors is the baseline (all pitfalls are documented in the trusted standard)
- 3.5/4.0 is the leaderboard ceiling for T17
- The trusted standard has been confirmed across 9 consecutive production runs in 5 languages (nb, pt, de, nn, es)

The only theoretical improvement would be if Tripletex adds batch value creation or account-by-number support on voucher postings in the future, which would enable a 4-call or 3-call path. Until then, 3.5 is the maximum score for this task.
