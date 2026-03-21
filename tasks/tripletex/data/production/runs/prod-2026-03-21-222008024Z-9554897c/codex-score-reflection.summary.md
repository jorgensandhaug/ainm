# Score-Aware Reflection

## Task Attribution

- **Run ID**: `prod-2026-03-21-222008024Z-9554897c`
- **Inference status**: `ambiguous` — 3 candidate tasks in leaderboard diff (tasks 07, 15, 23)
- **Most likely attribution**: **Task 15** (T2, max 4) — "register customer invoice payment" is a T2 task shape; task 07 is T1 and task 23 is T3 (bank reconciliation), neither matching the prompt shape
- **Prompt**: German — register full payment for Grünfeld GmbH (888415769), 32800 NOK ex-VAT, "Datenberatung"
- **Task completed at**: `2026-03-21T22:21:04Z`

Leaderboard diff entries (all 3 had `attempt_delta=1`, likely from concurrent runs):
| Task | Tier | Max | Best Before | Best After | Delta |
|------|------|-----|-------------|------------|-------|
| 07 | T1 | 2 | 2 | 2 | 0 |
| 15 | T2 | 4 | 3.3333 | 3.3333 | 0 |
| 23 | T3 | 6 | 0.6 | 0.6 | 0 |

## Correctness Verdict

**Likely correct.** The submission entry most likely matching task 15 (completed at `22:21:33Z`) shows:
- `score_raw=8/8` (100% raw correctness)
- `4/4 checks passed`
- `normalized_score=3` out of T2 max `4`

All correctness checks passed. The final Tripletex state was correct: invoice `2147574550` was fully paid (`amountCurrencyOutstanding=0`), using the live outstanding amount (`41000`) rather than the prompt ex-VAT amount (`32800`).

## Efficiency Verdict

**Correct but not maximum score.** The run scored `normalized_score=3` against T2 max `4`, giving an efficiency ratio of `3/4 = 0.75`. The existing best for task 15 was `3.3333/4 = 0.8333`, meaning this run scored below the existing best.

The run used 3 API calls with 0 errors — which is the proven minimum for standalone invoice payment tasks without a same-run cached `paymentTypeId`. The higher existing best of `3.3333` likely came from a run that either:
1. Had a cached `paymentTypeId` from an earlier task in the same batch (2-call path), or
2. The scoring formula weights factors beyond just API call count (e.g., total LLM turns, wall-clock time, or script complexity)

**This run did not improve the best score** because `3 < 3.3333`.

## Likely Root Cause

The efficiency gap (`0.75` vs `0.8333` best) is **not caused by any mistake**. The 3-call path is the proven floor for standalone tasks. The `3.3333` best was likely achieved by a run that reused a `paymentTypeId` from a previous task in the same session (2-call path), which shaves off the `GET /invoice/paymentType` call.

There is no actionable improvement for standalone runs — the 3-call floor has been exhaustively proven across 11 production runs and multiple sandbox probes. The only way to score higher is via same-run caching in a multi-task batch.

## What Went Right

1. **Perfect correctness**: 4/4 checks passed, score_raw=8/8
2. **Minimal API calls**: 3 calls, 0 errors, 0 wasted calls
3. **Correct trusted standard selection**: Agent identified exact match immediately, read the standard before writing code
4. **Correct payment amount**: Used live outstanding `41000`, not prompt ex-VAT `32800`
5. **Correct field expansions**: `customer(*)`, `orderLines(*)`, `orders(*,orderLines(*))` on invoice; `debitAccount(*)`, `creditAccount(*)` on payment type
6. **Query parameters on PUT**: Correctly sent payment params as query params, not JSON body
7. **Single script execution**: No retries, no debugging, no wasted iterations

## What To Change Next Time

1. **Same-run paymentTypeId caching**: If this agent runs multiple tasks in the same session and an earlier task already resolved an incoming `paymentTypeId`, cache and reuse it to achieve the 2-call path (`normalized_score` would likely reach `3.3333` or higher)
2. **Nothing else to change**: The standalone 3-call path is already optimal. The gap to `3.3333` is purely a caching opportunity, not a bug or inefficiency in the current run
3. **Accept the floor**: For isolated single-task runs, `normalized_score=3` on a T2 task with 3 calls and 0 errors is the structural maximum without cross-task caching
