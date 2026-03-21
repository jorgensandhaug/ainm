# Codex Reflection Summary

## Task

Create employee Ingrid Johansen, born 9 November 1995, email ingrid.johansen@example.org, start date 13 January 2026. Norwegian-language prompt. Exact match for `create-employee` trusted standard.

## Reflection

**What went well:**
- Correctly identified the `create-employee` trusted standard as an exact match
- Read the trusted standard before writing the script (as required)
- Followed the documented reactive repair flow: try POST first, repair on 422
- Date normalization from Norwegian (`9. November 1995` → `1995-11-09`, `13. January 2026` → `2026-01-13`) was correct
- Employment verification GET confirmed `startDate: "2026-01-13"`
- Employee created successfully with all scored fields correct

**What went poorly:**
- Used `userType: "STANDARD"` instead of the recommended `"NO_ACCESS"` — while the write succeeded, this deviates from the documented safe default. The trusted standard payload example clearly shows `"NO_ACCESS"`, and production runs have consistently confirmed it works. Using `"STANDARD"` is not wrong but is unnecessary.

**No other mistakes.** The agent followed the standard correctly. The 422 on the initial POST was not a mistake — it is the documented expected branch when the account requires department.

## Call Efficiency

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `POST /employee` (no dept) | 422 | Initial create attempt per trusted standard |
| 2 | `GET /department?isInactive=false&count=1&fields=*` | 200 | Department repair |
| 3 | `POST /employee` (with dept) | 201 | Successful retry |
| 4 | `GET /employee/employment?employeeId=...&fields=*` | 200 | Verify startDate |

**Total: 4 calls, 1 error (422)**

**Was this minimal?** Yes, for the department-repair branch. The 4-call path is the minimum when the account requires department:
- Cannot skip call 1 (the standard says don't pre-read department)
- Cannot skip call 2 (need department ID for retry)
- Cannot skip call 3 (must create the employee)
- Cannot skip call 4 (POST response never includes startDate — confirmed again in sandbox with `fields=*`)

**Alternative: pre-read department.** If the agent had done `GET /department` before the first POST, the path would have been 3 calls, 0 errors. However, this loses 1 call on accounts that don't need department (4 out of 5 known production runs). Expected value analysis:
- No pre-read: 0.8 × 2 + 0.2 × 4 = 2.4 calls avg, 0.2 errors avg
- Pre-read: always 3 calls, 0 errors

The no-pre-read strategy is better on average and remains the correct standard.

**No wasted calls.** Every call was necessary for the branch taken.

## Root Causes

1. **`userType: "STANDARD"` deviation**: The agent likely used general knowledge of Tripletex user types rather than copying the exact value from the trusted standard's payload example. The trusted standard now explicitly says to always use `"NO_ACCESS"` unless login access is requested.

2. **422 on department**: Not a root cause failure — this is an expected reactive branch. The account required department, which ~20% of production runs do. The no-pre-read strategy is correct on average.

## Sandbox Verification

Tested in persistent sandbox (`kkpqfuj-amager.tripletex.dev`) on 2026-03-21:

1. **`POST /employee?fields=*`**: Returns sparse `employments` (id + url only). `fields=*` on POST does NOT expand nested employment objects. The employment verification GET cannot be eliminated this way.

2. **`GET /employee/{id}?fields=employments(*)`**: Returns full employment data including `startDate`. This is an equivalent alternative to `GET /employee/employment?employeeId=...&fields=*`. Both are 1 call — no savings, just an alternative path.

3. **Confirmed**: The department-repair branch minimum remains 4 calls; the fresh-account minimum remains 2 calls. No lower-call path exists for either branch.

## Playbook Changes

**Updated existing files** (no new files created):

1. **`./trusted-standards/create-employee.md`**:
   - Added 2026-03-21 production confirmation of the department-repair branch (Ingrid Johansen, 4 calls, 1 error)
   - Strengthened `userType` payload rule: always use `"NO_ACCESS"` unless prompt asks for login access
   - Added sandbox finding: `POST /employee?fields=*` does not expand employments
   - Added sandbox finding: `GET /employee/{id}?fields=employments(*)` is equivalent to employment endpoint
   - Documented production statistics: 4/5 runs need no dept repair, 1/5 need dept repair

2. **`./task-playbooks/create-employee.md`**:
   - Added same production confirmation data point
   - Added same sandbox verification findings
   - Added avoidable-mistake entry: do not use `userType: "STANDARD"` for create-only tasks

## Commit

```
e35d5266 tripletex playbook: create-employee — add 1st dept-repair production confirmation (28427a26, Ingrid Johansen, 4 calls 1 error), enforce NO_ACCESS default, document POST fields=* limitation
```

## Reusable Heuristics

1. **Always use `userType: "NO_ACCESS"`** for create-employee tasks unless the prompt explicitly requests login access. The trusted standard payload example is authoritative — copy the exact value, don't improvise.

2. **Do not pre-read department** for create-employee. The no-pre-read strategy saves 1 call on 80% of production runs (4/5 confirmed). The 422 on the remaining 20% costs 2 extra calls but the expected value is still better than pre-reading.

3. **`POST /employee?fields=*` does not expand employments.** The `fields` query parameter on POST does not change response depth. The employment verification GET is always needed for start-date-scored tasks.

4. **`GET /employee/{id}?fields=employments(*)` is equivalent** to `GET /employee/employment?employeeId=...&fields=*` — either can be used for the verification call with identical results.

5. **Department-repair branch minimum is 4 calls** (1 error). No lower path exists. The 422 is expected and acceptable — it is not a mistake or a preventable error.

6. **For Norwegian date normalization**: `9. November 1995` → `1995-11-09`, `13. January 2026` → `2026-01-13`. The month names in Norwegian prompts may use English month names (as in this case) or Norwegian ones (`januar`, `februar`, etc.). Always normalize to ISO.
