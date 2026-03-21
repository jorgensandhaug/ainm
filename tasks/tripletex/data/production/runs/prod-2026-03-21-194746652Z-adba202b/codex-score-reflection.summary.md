# Score-Aware Reflection

## Task Attribution

- **tx_task_id:** 16
- **Tier:** T2 (tasks 9–18), max score = 4
- **Prompt:** Register 38 hours for Camille Petit on "Design" activity of "Audit de sécurité" for Cascade SARL (824869383), 1400 NOK/h, generate project invoice (French)
- **Run ID:** prod-2026-03-21-194746652Z-adba202b

## Correctness Verdict

**Perfect.** correctness = 1.0, score_raw = 8/8, 4/4 checks passed, all_checks_passed = true.

No data errors, no missing side effects, no wrong payload mappings. The final Tripletex state was exactly correct:
- 38 hours registered (24 + 14 across two dates)
- Invoice with amountExcludingVatCurrency = 53,200 (38 × 1400)
- amountCurrencyOutstanding = 66,500 (25% VAT correctly applied)

## Efficiency Verdict

**normalized_score = 3 out of max 4.** This matches the previous leaderboard best_score of 3 for task 16. The run did not improve the best score (before: 3, after: 3; attempts: 15 → 16).

The run used **8 API calls with 0 errors**. For this specific prompt variant (38 hours > 24, non-chargeable activity, configured bank account), 8 calls is the structural floor:

| # | Call | Reducible? |
|---|------|------------|
| 1 | GET /employee | No — must resolve employee ID |
| 2 | GET /project | No — must resolve project + customer |
| 3 | GET /activity/>forTimeSheet | No — must resolve activity + isChargeable |
| 4 | POST /timesheet/entry (24h) | No — first chunk of >24 split |
| 5 | POST /timesheet/entry (14h) | No — second chunk of >24 split |
| 6 | GET /ledger/vatType | No — production has 25% VAT; omitting creates wrong totals |
| 7 | POST /order | No — must create order with line |
| 8 | PUT /order/:invoice | No — must create invoice |

**No wasted calls.** The gap between normalized_score 3 and max 4 is entirely due to the >24-hour split requiring an extra POST /timesheet/entry (8 calls vs. 7 for ≤24-hour variants). The efficiency formula penalizes the absolute call count; a ≤24-hour variant of the same task would use 7 calls and likely score higher. This is inherent to the prompt, not a fixable inefficiency.

## Likely Root Cause

No root cause to fix. The run was optimal for this exact prompt shape. The score gap is structural:
- ≤24-hour variants of task 16 need 7 calls → likely higher efficiency bonus
- >24-hour variants need 8 calls minimum → lower efficiency bonus
- The agent cannot control which variant the prompt assigns

The leaderboard best_score of 3 (unchanged by this run) suggests no prior attempt on task 16 has achieved 4/4 either, consistent with the >24-hour shape being a common rotation that caps at 3.

## What Went Right

1. **Immediate trusted-standard match.** Correctly identified `register-project-hours-and-create-project-invoice` as the exact standard without wasting time on spec exploration.
2. **Pre-planned >24-hour split.** Computed 24 + 14 before the first write, avoiding the `422` (>24h) and `409` (same-day duplicate) traps that previous runs discovered.
3. **Skipped hourly-rate path on non-chargeable.** After `isChargeable=false`, correctly bypassed `GET /project/hourlyRates` and rate creation, saving 1–3 calls.
4. **Included GET /ledger/vatType.** Production account had 25% VAT (id=3), not the sandbox's 0% (id=6). Without this call, the invoice would have silently used wrong VAT.
5. **Optimistic bank-account approach succeeded.** Bank was configured; the optimistic path saved 1 call vs. proactive hedge (8 vs. 9).
6. **Fast execution.** 156.7s wall time, well within the 300s budget.
7. **Zero errors.** No 4xx responses, no retries.

## What To Change Next Time

**Nothing actionable for this task shape.** The run achieved perfect correctness at the structural minimum call count for the >24-hour non-chargeable variant. The only way to score higher on task 16 is to receive a ≤24-hour prompt variant, which is outside agent control.

Confirmed heuristics to maintain:
- Keep the optimistic bank-account approach as default (saves 1 call when configured; 3 extra + 1 error when missing is still recoverable)
- Always include GET /ledger/vatType (production 25% VAT confirmed again)
- Always pre-plan >24-hour splits before first write
- Skip hourly-rate path entirely when isChargeable=false
