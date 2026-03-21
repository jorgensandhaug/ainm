# Score-Aware Reflection: prod-2026-03-21-182837970Z-aff0bd66

## 1. Task Attribution

- **tx_task_id**: 21
- **Task tier**: T3 (tasks 19–30), max score = 6
- **Attempt**: 5th for this task
- **Attributed via**: unique_attempt_delta on leaderboard entry for task 21

## 2. Correctness Verdict

**Not perfect.** Correctness = 12/14 = 0.8571.

- 1 of 10 checks failed: **Check 5**
- Check 5 is almost certainly the **occupation code** check
- The run used occupation code id **2881** (KONSERNREGNSKAPSSJEF — "Group Accounting Manager") instead of the correct id **4679** (REGNSKAPSSJEF — "Accounting Manager")
- Score_raw 12/14 means Check 5 costs **2 points** of the 14-point rubric

Feedback: `"1/10 checks failed."`
Checks: 1✓ 2✓ 3✓ 4✓ **5✗** 6✓ 7✓ 8✓ 9✓ 10✓

## 3. Efficiency Verdict

**Not assessed** — efficiency bonus only applies at perfect correctness. Since correctness < 1.0, normalized_score = 0.8571 × 3 (T3 base) = **2.5714**, with no efficiency bonus possible.

- Run used **5 API calls**, 0 errors, 0 retries
- Optimal would be **4 calls** with the Regnskapssjef hardcoded mapping (saves the GET occupationCode call)
- Even if correctness had been perfect at 5 calls, the extra call would have reduced the efficiency bonus vs the 4-call minimum

**Leaderboard movement**: best_score stayed at 2.5714 (tied with previous best from attempt 4). This run did not improve the leaderboard position.

## 4. Likely Root Cause

The single root cause explains both the correctness failure and the efficiency gap:

**`nameNO` substring matching returned the wrong occupation code.**

- The agent searched `GET /employee/employment/occupationCode?nameNO=regnskapssjef&count=1&fields=id`
- The `nameNO` filter is a **substring-containing match**, sorted alphabetically
- Results for `nameNO=regnskapssjef`: KONSERNREGNSKAPSSJEF (id 2881, "K" first), REGNSKAPSSJEF (id 4679, "R" second), SKATTEREGNSKAPSSJEF (id 5341, "S" third)
- With `count=1`, only the **wrong** first result (id 2881) was returned
- The agent used id 2881 in the employee payload, causing Check 5 to fail

This is the same `nameNO` substring matching pitfall that the trusted standard already warned about for `code=` searches, but had not documented for `nameNO=` searches until the post-run reflection updated it.

## 5. What Went Right

- **Trusted standard match**: correctly identified `onboard-employee.md` as the exact match and read it before writing
- **All 5 API calls succeeded**: 0 errors, 0 retries, 0 4xx responses
- **Correct flow structure**: parallel prereqs (GET /division + POST /department + GET occupationCode), then POST /employee with nested employmentDetails, then POST /employee/standardTime
- **Division handling**: correctly detected 0 rows from GET /division and omitted division from payload (fresh account)
- **All other fields correct**: 9/10 checks passed — employee identity, department, employment type/form, percentage, salary, standard worktime, remuneration type all persisted correctly
- **Fast execution**: completed in ~79 seconds, well within the 300s budget

## 6. What To Change Next Time

1. **Use hardcoded mapping Regnskapssjef → id 4679**: now added to the trusted standard's Known Hardcoded Mappings table. This eliminates the GET occupationCode call entirely and fixes correctness.

2. **Optimal flow for this task shape (4 calls)**:
   - `GET /division?count=1&fields=id` (parallel)
   - `POST /department` with name "Økonomi" (parallel)
   - `POST /employee` with nested employmentDetails including `occupationCode: { id: 4679 }`
   - `POST /employee/standardTime` with hoursPerDay 7.5

3. **For any future dynamic occupation code lookups**: use `count=10&fields=id,nameNO` and pick the row whose `nameNO` is an exact case-insensitive match — never blindly take the first result from `count=1`.

4. **Expected score at perfect correctness + 4 calls**: correctness = 1.0 → base score 3.0 + efficiency bonus for minimal-call execution → approaching 6.0 max.

5. **Playbook changes already committed** in the prior reflection (commit `6b61bf5a`):
   - `trusted-standards/onboard-employee.md`: added Regnskapssjef hardcoded mapping, updated dynamic lookup guidance
   - `trusted-standards/common-endpoints.md`: added nameNO substring pitfall warning, added Regnskapssjef and Systemutvikler mappings
   - `task-playbooks/onboard-employee.md`: added Regnskapssjef mapping, updated dynamic lookup guidance, added production run history
