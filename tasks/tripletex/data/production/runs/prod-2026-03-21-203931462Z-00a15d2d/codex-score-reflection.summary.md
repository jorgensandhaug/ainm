# Score-Aware Reflection

## 1. Task Attribution

- **Run ID**: `prod-2026-03-21-203931462Z-00a15d2d`
- **Task ID**: `25` (T3 task, max score 6)
- **Prompt language**: French
- **Task shape**: overdue-invoice-reminder-fee-and-partial-payment (fee 50 NOK, debit 1500, credit 3400, partial payment 5000 NOK)

## 2. Correctness Verdict

**Perfect correctness.** `correctness = 1.0`, `score_raw = 10/10`, all 6/6 checks passed. No missing or incorrect side effects.

## 3. Efficiency Verdict

**Maximum score achieved.** `normalized_score = 6` out of a T3 maximum of 6. This matches the leaderboard best for task 25 (`best_score = 6`). The run used exactly 6 API calls with 0 errors and 0 retries — the proven canonical minimum for this task shape. Duration was 69s, well within the 300s budget.

No efficiency gap exists. The run scored the theoretical maximum.

## 4. Likely Root Cause

No root cause analysis needed — this was a flawless execution. The agent:
- Identified the exact trusted-standard match immediately
- Read the trusted standard before scripting
- Wrote a single script that executed all 6 calls sequentially with 0 errors
- Applied all documented pitfall mitigations (explicit `row: 1`/`row: 2`, `account.id` not `account.number`, `paymentTypeId` included, `vatType` omitted on fee invoice order line)

## 5. What Went Right

1. **Trusted-standard matching**: Instant recognition of the `overdue-invoice-reminder-fee-and-partial-payment` pattern despite French-language prompt
2. **Zero wasted calls**: All 6 calls succeeded on first attempt — no retries, no 4xx errors, no exploratory GETs
3. **Response parsing**: Correctly handled both `values` (list) and `value` (single-object) response shapes from the first script write
4. **Voucher posting rows**: Used explicit `row: 1` and `row: 2` to avoid the system-generated row 0 trap
5. **No unnecessary reads**: Did not read `openapi.json`, did not add `GET /ledger/vatType`, did not probe company bank accounts
6. **Fast execution**: 69s total including agent startup, file I/O, and 6 API round-trips

## 6. What To Change Next Time

**Nothing.** This run achieved the maximum possible score (6/6) with the minimum possible API calls (6) and zero errors. The trusted standard and playbook are now confirmed across 5 production runs in 5 languages (nb, es, pt, de, fr). The 6-call path is fully stabilized for this task shape.

The only marginal improvement would be faster agent startup (reading only the trusted standard, not the playbook too), but this does not affect scoring and the run completed well within the time budget.
