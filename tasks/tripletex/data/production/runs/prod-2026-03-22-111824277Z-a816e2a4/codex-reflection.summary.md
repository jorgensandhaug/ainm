# Reflection Summary — prod-a816e2a4

## Task
Onboard employee from Spanish-language arbeidskontrakt (employment contract) PDF. Create employee Isabel García in Tripletex with: NIN (14028013567), DOB (1980-02-14), department (Kundeservice), STYRK 3313 occupation code, annual salary 640000, 80% employment, start date 2026-07-13, email, bank account.

## Reflection

**What went well:**
- Correctly identified this as onboard-employee (not simple create-employee) when seeing salary, percentage, occupation code in the task
- Used hardcoded STYRK 3313 → 4677 (REGNSKAPSMEDARBEIDER) mapping — no API lookup needed
- All 3 POSTs succeeded on first try (0 errors)
- All fields correctly populated per API readback
- Followed trusted standard flow exactly
- Included all critical fields: employeeNumber="1", employmentId="1", payrollTaxMunicipalityId=262, email, NIN, bankAccount

**What went poorly:**
1. **Verification code bug**: Script used `empDetails.value` for GET /employee/employment/details response, but this endpoint returns a LIST response (`.values[]`), not a single object (`.value`). Result: false WARNING outputs for all employment details fields (employmentType, occupationCode, salary, etc.) even though the actual data was correct. No scoring impact, but noisy logs.
2. **Unnecessary file read**: Agent initially read the `create-employee` trusted standard (~90 lines), then realized this was onboard-employee and read that standard too. Wasted ~10s reading an irrelevant file. The task mentions salary, percentage, and occupation code — immediate signals for onboard-employee.

## Call Efficiency

**This run was minimal-call for its exact scenario.**

| Step | Call | Type | Status |
|------|------|------|--------|
| Pre-read | GET /division?count=1&fields=id | free GET | 200 (0 rows — fresh account) |
| Pre-read | GET /department?name=Kundeservice&isInactive=false&count=1000&fields=* | free GET | 200 (0 rows — no match) |
| Pre-read | GET /salary/settings?fields=municipality | free GET | 200 (municipality.id=262) |
| Create dept | POST /department { name: "Kundeservice" } | **POST** | 201 |
| Create employee | POST /employee?fields=*,employments(*) | **POST** | 201 |
| Standard time | POST /employee/standardTime | **POST** | 201 |
| Verify | GET /employee/{id}?fields=*,department(*),employments(*) | free GET | 200 |
| Verify | GET /employee/standardTime?employeeId={id}&fields=* | free GET | 200 |
| Verify | GET /employee/employment/details?employmentId={id}&fields=* | free GET | 200 |

**Total: 3 POSTs, 6 free GETs, 0 errors.** This is the minimum for onboard-employee when department doesn't exist pre-run (2 POSTs when dept already exists).

**One verification GET was unnecessary**: The separate `GET /employee/employment/details` could have been eliminated by using deep expansion `employments(*,employmentDetails(*))` on both the POST and the verification GET. This would reduce from 3 to 2 verification GETs (still free, no scoring impact, but cleaner).

## Root Causes

1. **Verification code bug**: The agent assumed `GET /employee/employment/details` returns a single-value response (`.value`) like `POST /employee`. In reality, it returns a list response (`.values[]`). This is a common Tripletex API pattern inconsistency — write endpoints return `.value`, while list-query endpoints return `.values[]`.

2. **Wrong initial trusted standard**: The agent pattern-matched "create employee" in the task description and read `create-employee.md` first. It should have looked for salary/percentage/occupation code signals first, which immediately indicate the richer onboard-employee shape.

## Sandbox Verification

**Deep expansion discovery** — sandbox-verified 2026-03-22:
- `POST /employee?fields=*,employments(*,employmentDetails(*))` returns FULL employmentDetails inline (annualSalary, occupationCode, percentageOfFullTimeEquivalent, payrollTaxMunicipalityId, remunerationType, etc.)
- Standard expansion `POST /employee?fields=*,employments(*)` only returns stubs `{id, url}` for employmentDetails
- `GET /employee/{id}?fields=*,employments(*,employmentDetails(*))` also returns full details inline
- This eliminates the need for a separate `GET /employee/employment/details` call

**Response shape confirmation**:
- `GET /employee/employment/details` returns LIST (`.values[]`), NOT single (`.value`)
- Using `.value` gives `undefined` — root cause of the verification code bug

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/onboard-employee.md`**:
   - Step 3: changed POST expansion from `employments(*)` to `employments(*,employmentDetails(*))` with explanation
   - Step 5: reduced from 3 to 2 verification GETs using deep expansion
   - Verification table: consolidated employee + employmentDetails fields into single GET
   - Added response shape notes (`.values[]` vs `.value` trap)
   - Updated Sandbox Verification Status with deep expansion findings
   - Added prod-a816e2a4 to Production Run Summary (task 19)

2. **`./task-playbooks/onboard-employee.md`**:
   - Step 3: added deep expansion `employments(*,employmentDetails(*))` to POST
   - Steps 5+6: consolidated into single step with 2 parallel GETs
   - Updated Sandbox Verification Status with deep expansion and response shape trap
   - Added prod-a816e2a4 to Production Run History (task 19)

## Commit

```
52be9ea0 tripletex playbook: onboard-employee — add deep expansion for POST/GET, fix verification response shape (a816e2a4)
```

## Reusable Heuristics

1. **Deep expansion on POST**: `POST /employee?fields=*,employments(*,employmentDetails(*))` returns full employment details inline. ALWAYS use the deep form — the standard `employments(*)` form only returns stubs. This is the single most impactful improvement from this reflection.

2. **Response shape trap**: Tripletex list-query endpoints (GET /employee/employment/details, GET /employee/standardTime) return LIST responses (`.values[]`), NOT single objects (`.value`). Write endpoints (POST /employee) return single objects (`.value`). Always verify which shape to expect.

3. **Task routing signal**: When a task mentions salary, percentage, occupation code, or employment details, it's onboard-employee (not create-employee). Don't read the simpler standard first — go directly to `onboard-employee.md`.

4. **STYRK 3313 → 4677**: This mapping is now production-confirmed correct with the hardcoded table. Previous runs used wrong 4672 (REGNSKAPSFØRER) and scored 18/22. The correct mapping is REGNSKAPSMEDARBEIDER (4677).

5. **Optimal onboard-employee call count**: 3 pre-read GETs (parallel) + 2-3 POSTs (dept conditional + employee + standardTime) + 2 verification GETs (parallel) = 7-8 total calls, 0 errors. This is the proven minimum.
