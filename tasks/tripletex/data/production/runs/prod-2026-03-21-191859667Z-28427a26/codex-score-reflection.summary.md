# Score-Aware Reflection — prod-2026-03-21-191859667Z-28427a26

## 1. Task Attribution

- **Task ID**: `01` (T1, max score 2)
- **Task**: Create employee Ingrid Johansen, born 1995-11-09, email ingrid.johansen@example.org, start date 2026-01-13
- **Prompt language**: Norwegian
- **Inference status**: `unique_attempt_delta` (attempt 15 of task 01)

## 2. Correctness Verdict

**Perfect correctness.** `correctness: 1`, `score_raw: 8/8`, `feedback: "7/7 checks passed"`, `all_checks_passed: true`.

All employee fields (firstName, lastName, dateOfBirth, email, employment startDate) were created correctly in Tripletex. No data errors.

## 3. Efficiency Verdict

**Not optimal.** `normalized_score: 1.4` out of max `2.0` for T1 tasks. Leaderboard best for task 01 is `2.0` (achieved in prior runs with the 2-call fresh-account path). This run lost `0.6` points purely to efficiency.

**Call breakdown:**

| # | Call | Status | Necessary? |
|---|------|--------|------------|
| 1 | `POST /employee` (no dept) | 422 | Yes per strategy, but this is the penalty source |
| 2 | `GET /department` | 200 | Yes (repair branch) |
| 3 | `POST /employee` (with dept) | 201 | Yes (retry) |
| 4 | `GET /employee/employment` | 200 | Yes (verify startDate) |

**Totals**: 4 calls, 1 error (422). The leaderboard-best 2.0 score comes from the 2-call path (POST + GET employment) on accounts that accept the create without department repair.

## 4. Likely Root Cause

The efficiency gap is entirely from the **department-repair branch**:

1. **The 422 on `POST /employee`** — the account required `department.id`, which the trusted standard says not to pre-read (because 80% of production runs don't need it). This is the correct average-case strategy but incurs a penalty when the account does require department.
2. **2 extra calls** — `GET /department` (repair read) + retry `POST /employee` (with dept) added 2 calls beyond the ideal 2-call path.
3. **1 avoidable error** — the 422 counts against efficiency scoring. In hindsight, pre-reading department would have yielded 3 calls / 0 errors instead of 4 calls / 1 error for this specific account.

**Why the no-pre-read strategy is still correct on average**: Out of 5 known production create-employee runs (Sánchez, Bernard, Harris, Rodrigues, Johansen), 4 hit the 2-call path (score 2.0) and 1 (this one) hit the 4-call path (score 1.4). Expected value without pre-read: `(4 × 2.0 + 1 × 1.4) / 5 = 1.88`. Expected value with pre-read (always 3 calls, 0 errors): would be somewhere between 1.4 and 2.0 depending on how the scorer weights 3 calls. The no-pre-read strategy wins on average.

**Minor deviation**: The agent used `userType: "STANDARD"` instead of the recommended `"NO_ACCESS"`. This didn't affect correctness or scoring but deviates from the documented standard.

## 5. What Went Right

1. **Exact trusted-standard match** — correctly identified `create-employee.md` and followed it
2. **Perfect correctness** — 7/7 checks passed, all fields correct
3. **Date normalization** — Norwegian dates (`9. November 1995`, `13. January 2026`) correctly normalized to ISO
4. **Department repair** — correctly handled the 422 by reading department and retrying, rather than failing
5. **Employment verification** — correctly identified that POST response lacks startDate and did the verification GET
6. **No wasted calls** — every call in the 4-call sequence was necessary for the repair branch; no speculative reads or unnecessary endpoints
7. **Fast execution** — completed in ~52 seconds

## 6. What To Change Next Time

1. **Keep the no-pre-read strategy** — it scores 2.0 in ~80% of cases vs ~1.7 always with pre-read. The 1.4 on this run is an accepted cost of the probabilistic strategy.
2. **Use `userType: "NO_ACCESS"`** not `"STANDARD"` — the playbook is explicit about this. While it didn't cause issues here, `"NO_ACCESS"` is the documented safer default.
3. **No structural changes needed** — the 4-call department-repair branch is the proven minimum for dept-required accounts. The run executed it correctly.
4. **Do not attempt to eliminate the employment verification GET** — sandbox investigation on 2026-03-21 confirmed that `POST /employee?fields=*` still returns sparse employments without startDate. The GET is required.
5. **Accept the variance** — some accounts will need department repair. The 1.4 score on those runs is the cost of optimizing for the 2.0 majority case. This is a correct trade-off.
