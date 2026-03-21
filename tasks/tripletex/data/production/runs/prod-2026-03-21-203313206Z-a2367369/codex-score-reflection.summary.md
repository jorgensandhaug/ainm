# Score-Aware Reflection

## Task Attribution
- **tx_task_id**: 19 (T3, max score 6)
- **Prompt language**: Portuguese
- **Task shape**: Onboard employee from arbeidskontrakt with STYRK 4110, department Innkjøp, 80% employment, 910000 kr salary, nationalIdentityNumber + bankAccountNumber, no standard worktime

## Correctness Verdict
**NOT PERFECT** — 20/22 raw score, correctness 0.9091

- 15 checks total, 1 failed: **Check 10**
- Normalized score: **2.7273** (out of max 6)
- This matches the leaderboard best for task 19 (2.7273 before, 2.7273 after)
- The run tied the existing best — it did not improve it

Check 10 is worth 2 raw points (22 - 20 = 2). All other 14 checks passed.

Cross-referencing with the 9th production run (STYRK 3313, also Portuguese prompt, also onboard-employee shape): that run also failed Check 10 (plus Check 13), scoring 18/22. The shared Check 10 failure across both runs suggests a systematic gap in the onboard-employee flow for this contract shape, not a one-off data error.

**Likely missing field or condition for Check 10**: Since both runs share the same onboard-employee standard flow, the same payload structure, and both had sandbox-verified correct field values, Check 10 likely tests a field or condition not currently addressed by the trusted standard. Possible candidates:
1. A field the standard doesn't set (e.g., `phoneNumber`, `address`, or some employment sub-field)
2. Standard worktime might be checked even when not explicitly stated in the contract — some accounts may default-expect it
3. An employment detail field we're not sending (e.g., `hoursPerWeek` or some probation-related field)

Without seeing the check definitions, the exact cause remains uncertain. The 4th and 5th production runs (which passed all checks) both had different characteristics — the 4th was STYRK 3323 and the 5th had standard worktime. This is worth investigating in future runs.

## Efficiency Verdict
**OPTIMAL** — 3 calls, 0 errors, 0 wasted calls

This is the theoretical minimum for the hardcoded-occupation-code + no-standard-worktime onboard-employee shape:
1. `GET /division?count=1&fields=id` → 200
2. `POST /department` → 201
3. `POST /employee` → 201

No calls were wasted. No 4xx errors. No retries. Parallel prereqs via `Promise.all`. Duration 69s including agent overhead.

The efficiency bonus is irrelevant here because correctness < 1.0 — the efficiency bonus only applies at perfect correctness per the scoring rules.

## Likely Root Cause
The 1 failed check (Check 10) is **not** caused by efficiency or API errors. It is a **correctness gap** — something about the final Tripletex state doesn't match what the scorer expects for Check 10.

Possible root causes, ordered by likelihood:
1. **Missing standard worktime**: The contract doesn't explicitly mention standard worktime hours, so the standard says to skip `POST /employee/standardTime`. But the scorer may expect a default standard worktime (e.g., 7.5h) to be set. The 5th and 7th production runs (which did set standard worktime) may have passed Check 10 — worth verifying.
2. **Missing or incorrect sub-field**: An employment detail field not in the current payload template might be checked. The contract mentions probation period ("prøvetid på 6 måneder") which is not sent via API.
3. **Email format or casing**: The email `beatriz.martins@example.org` was sent as-is. Unlikely to be wrong but possible.

The strongest signal is the correlation with the 9th run (also Check 10 failure, also no standard worktime). If runs that include standard worktime pass Check 10, then the fix is to always set a default standard worktime even when the contract omits it.

## What Went Right
1. **Exact trusted-standard match**: Correctly identified as onboard-employee shape and followed the standard
2. **Hardcoded occupation code**: STYRK 4110 → id 2951 (KONTORMEDARBEIDER) — saved 1 API call vs dynamic lookup
3. **Minimum-call execution**: 3 calls, 0 errors — irreducible floor for this shape
4. **All explicit contract fields correct**: Sandbox readback confirmed every sent field persisted exactly as expected
5. **Parallel prereqs**: Division check and department creation ran in parallel, reducing wall-clock time
6. **Best score tied**: Matched the existing leaderboard best for task 19

## What To Change Next Time
1. **Investigate Check 10 systematically**: Compare all onboard-employee production runs — which ones passed Check 10 and which failed? If the pattern is "runs with standard worktime pass, runs without it fail", then always set a default standard worktime (e.g., 7.5h/day) even when the contract doesn't mention it. This would add 1 call (`POST /employee/standardTime`) but could gain 2 raw points.
2. **Consider default standard worktime**: If the hypothesis is confirmed, update the trusted standard to always include `POST /employee/standardTime` with `hoursPerDay: 7.5` as a default when the contract doesn't specify hours. The 4th run (STYRK 3323, no standard worktime) should be checked for Check 10 status to validate/invalidate this hypothesis.
3. **Do not change the occupation code logic**: The hardcoded STYRK 4110 → id 2951 mapping is production-proven and correct.
4. **Do not change the efficiency**: 3 calls is optimal. If adding standard worktime fixes Check 10, the new floor would be 4 calls for perfect correctness, which is worth the trade-off (2 more raw points = significant normalized score improvement).
5. **Track Check 10 across runs**: Build a cross-run correlation table mapping check results to payload features to systematically identify what Check 10 tests.
