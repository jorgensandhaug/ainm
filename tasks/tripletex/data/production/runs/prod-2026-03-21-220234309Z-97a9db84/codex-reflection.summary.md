# Codex Reflection Summary

## Task
Onboard employee Lars Strand from a Norwegian offer letter (tilbudsbrev). Extract: name Lars Strand, DOB 1982-08-04, job title Salgssjef, department Regnskap, start date 2026-06-24, 100% position, annual salary 800000 kr, standard worktime 7.5 hours/day, permanent employment (Fast stilling). Create employee with full employment configuration and per-employee standard worktime.

## Reflection
**What went well:**
- Correctly identified this as an onboard-employee shape (not simple create-employee) — the task requires department, salary, occupation code, and standard worktime
- Read the trusted standard before writing the script (critical rule)
- Used hardcoded Salgssjef → occupation code id 4930 — saved 1 API call vs dynamic lookup
- Ran GET /division and POST /department in parallel — correct prerequisite resolution
- Used `POST /employee?fields=*,employments(*)` — eliminated the need for a verification GET
- Used `POST /employee/standardTime` (per-employee) not `/salary/settings/standardTime` (company-wide) — the earlier production run that used the wrong endpoint failed check 10
- Correctly omitted division from the employee payload when GET /division returned 0 rows (fresh account)
- Extracted all data correctly from the PDF attachment

**What went poorly:**
- Nothing. The run executed the optimal path with 0 errors.

## Call Efficiency
**The run was minimal-call.** 4 calls, 0 errors — this is the proven minimum for the hardcoded-occupation-code + standard-worktime onboard-employee shape.

| # | Call | Purpose | Result |
|---|------|---------|--------|
| 1 | `GET /division?count=1&fields=id` | Check for existing divisions | 200, 0 rows |
| 2 | `POST /department` | Create "Regnskap" department | 201, id=963553 |
| 3 | `POST /employee?fields=*,employments(*)` | Create employee with nested employment details | 201, id=18677558 |
| 4 | `POST /employee/standardTime` | Set per-employee 7.5h/day worktime | 201 |

**Wasted calls:** None.

**Lower-call path analysis:** No lower-call path exists for this shape:
- GET /division cannot be skipped — sandbox verification confirmed that accounts with divisions reject POST /employee without division.id (422 on `employments.division.id`)
- POST /department cannot be skipped — employee create requires `department.id`, and `department: { name: ... }` fails with 422
- POST /employee is the core write
- POST /employee/standardTime is required because the prompt specifies 7.5h/day worktime

## Root Causes
No errors or inefficiencies in this run. Previous Salgssjef run (11/14 score) failed because of:
1. Missing occupation code — job title "Salgssjef" from the offer letter was not resolved to occupation code id 4930
2. Wrong standard-time endpoint — used `/salary/settings/standardTime` (company-wide) instead of `/employee/standardTime` (per-employee)

Both issues were fixed in the trusted standard before this run, and this run confirms the fixes are correct.

## Sandbox Verification
1. **Full flow reproduction:** POST /department → POST /employee?fields=*,employments(*) (with division.id from sandbox) → POST /employee/standardTime — all succeeded
2. **Readback confirmed all fields:**
   - employmentType=ORDINARY, employmentForm=PERMANENT, remunerationType=MONTHLY_WAGE, workingHoursScheme=NOT_SHIFT
   - percentageOfFullTimeEquivalent=100, annualSalary=800000
   - occupationCode.id=4930, nameNO=SALGSSJEF, code=1233105
   - hoursPerDay=7.5, fromDate=2026-06-24
3. **Division requirement test:** POST /employee without division.id on sandbox → 422 on `employments.division.id` — confirms the GET /division pre-read is necessary for accounts that have divisions

## Playbook Changes
Updated existing files (no new files created):
- `./trusted-standards/onboard-employee.md` — added 12th production confirmation (twelfth run, Salgssjef, 4 calls 0 errors, sandbox readback verified)
- `./task-playbooks/onboard-employee.md` — added 12th production run entry to history

No flow changes needed — the standard was already optimal for this shape.

## Commit
- Hash: `168da575`
- Message: `tripletex playbook: onboard-employee — add 12th production confirmation (97a9db84, Lars Strand / Salgssjef / Regnskap / 1982-08-04 / 2026-06-24 / 100% / 800000 / 7.5h, 4 calls 0 errors); 2nd confirmation of optimal 4-call hardcoded-Salgssjef + standard-worktime path`

## Reusable Heuristics
1. **Hardcoded occupation codes save calls.** Salgssjef → id 4930 is now confirmed across 2 production runs. The mapping table in the trusted standard covers 9 job titles / STYRK codes — always check it before doing a dynamic lookup.
2. **GET /division pre-read is necessary.** Cannot skip it — sandbox accounts with divisions require division.id on employment. Fresh production accounts without divisions work without it. The pre-read handles both cases at a fixed cost of 1 call.
3. **`POST /employee?fields=*,employments(*)`** eliminates verification GETs. The `employments(*)` expansion is essential — without it, employments return sparse (id + url only, no startDate).
4. **`POST /employee/standardTime`** (per-employee) is the correct endpoint. `/salary/settings/standardTime` is company-wide and does not score correctly.
5. **Parallel prerequisite resolution** (GET /division + POST /department) saves wall-clock time without increasing call count.
6. **For this shape (hardcoded occ code + standard worktime), 4 calls is the proven floor.** 12 production runs total, 9 of the last 10 used 3-5 calls with 0 errors.
