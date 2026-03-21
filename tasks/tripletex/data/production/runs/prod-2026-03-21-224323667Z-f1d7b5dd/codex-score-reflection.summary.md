# Score-Aware Reflection: prod-2026-03-21-224323667Z-f1d7b5dd

## 1. Task Attribution

- **Prompt**: Create employee Charles Walker, born 21 Jan 1999, email charles.walker@example.org, start date 23 Dec 2026
- **Inference status**: ambiguous (2 candidates)
- **Likely task**: T01 (create employee, T1 tier, max score 2)
- **Evidence**: Leaderboard diff shows T01 gained 1 attempt with `last_attempt_after` at 22:44:13, closely matching our task completion at 22:44:11Z. T04 and T09 also changed but T04's timing (22:43:24) precedes our run, and T09 is a T2 task unlikely to match a simple employee-create prompt.
- **Our submission**: `e20c24b8` (queued 22:44:11.93) — still "processing" at capture time, so exact score is unknown.
- **Nearby completed submission** (likely not ours): `49d2cb9d` — scored 8/8 raw, normalized 1.4/2.0. If this was also a T01 create-employee run, it shows perfect correctness (8/8 checks) with a reduced efficiency bonus yielding 1.4 out of max 2.

## 2. Correctness Verdict

**Likely perfect correctness.** The 201 response confirmed all scored fields:
- `firstName: "Charles"`, `lastName: "Walker"` — exact match
- `dateOfBirth: "1999-01-21"` — correct ISO normalization of "21. January 1999"
- `email: "charles.walker@example.org"` — exact match
- `employments[0].startDate: "2026-12-23"` — correct ISO normalization of "23. December 2026"
- `userType` sent as `"NO_ACCESS"` (echoed as `null`, documented safe behavior)
- `department.id: 744739` — resolved via repair branch

No fields were missing or incorrect in the final Tripletex state. The `?fields=*,employments(*)` expansion confirmed all scored state in the write response itself.

## 3. Efficiency Verdict

**Not minimal-call.** The run used 3 calls + 1 error. The optimal path for this account (which required department) was 2 calls + 0 errors with department pre-reading:

| Path | Calls | Errors | Notes |
|------|-------|--------|-------|
| Actual (no pre-read) | 3 | 1 | POST 422 → GET /department → POST 201 |
| Optimal (pre-read dept) | 2 | 0 | GET /department → POST 201 |
| Savings | -1 call | -1 error | |

The 422 on the first POST was avoidable. The prior trusted standard recommended no pre-read based on a 43% department-required rate. This run brought the rate to 50%+ (5/9 = 56%), tipping the strategy past break-even.

T01 best score was already 2 (max). Our run's 3 calls + 1 error likely scored between 1.3–1.6 (similar to the 1.4 nearby submission), not improving the best. With the pre-read strategy (2 calls, 0 errors), the efficiency bonus would have been higher, potentially approaching 1.8–2.0.

## 4. Likely Root Cause

**Strategic, not mechanical.** The agent followed the trusted standard correctly — the issue was that the trusted standard itself was suboptimal at the current 50%+ department-required rate.

- The "no pre-read" strategy was designed when only 43% of production accounts required department. At that rate, the optimistic 1-call path on no-dept accounts outweighed the 3-call penalty on dept-required accounts.
- This run pushed the rate to 56%, past the documented 50% break-even. At 56%, pre-reading costs 2 calls always vs no-pre-read averaging 2.1 calls + 0.56 errors — pre-reading wins on both axes.
- The prior reflection already updated the trusted standard and playbook to recommend pre-reading department.

## 5. What Went Right

1. **Correct trusted-standard match**: Identified `create-employee.md` as the exact match and read it before writing any script.
2. **Correct flow execution**: Followed the department-repair branch exactly (POST 422 → GET /department → POST with dept → 201).
3. **Full field expansion**: Used `?fields=*,employments(*)` on the POST, avoiding a separate verification GET for `startDate`.
4. **Correct date normalization**: "21. January 1999" → `1999-01-21`, "23. December 2026" → `2026-12-23`.
5. **Correct `userType`**: Used `"NO_ACCESS"`, not `"STANDARD"`.
6. **No wasted calls**: Within the no-pre-read strategy, every call was necessary. No speculative reads, no verification GETs.
7. **Fast execution**: Task completed quickly, no time wasted on documentation re-reading.

## 6. What To Change Next Time

1. **Pre-read department** (already updated in trusted standard): Start with `GET /department?isInactive=false&count=1&fields=id`, then include `department: { id: ... }` on the POST. This eliminates the 422 repair branch entirely, saving 1 call and 1 error on 56%+ of accounts.

2. **New minimum call path**: `GET /department` (1 call) → `POST /employee?fields=*,employments(*)` with department (1 call) = **2 calls, 0 errors**.

3. **Do NOT pre-read division**: 0/9 production runs needed it. Keep as repair-only (adds 2 calls + 1 error when triggered).

4. **Use `fields=id`** on the department pre-read (not `fields=*`) to minimize response size. Sandbox-verified this works.

5. **Keep the `?fields=*,employments(*)` expansion** on every POST attempt. The `employments(*)` part is essential — without it, `startDate` is not returned.

6. **Expected score improvement**: With pre-read, the same Charles Walker run would have been 2 calls / 0 errors instead of 3 calls / 1 error, likely scoring ~1.7–2.0 instead of ~1.4 (estimated).
