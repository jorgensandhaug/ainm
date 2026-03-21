# Onboard Employee

## Scope

Use for tasks like:
- onboard one new employee from an offer letter, employment contract, or prompt
- create the employee card
- attach one named department
- set up one employment with percentage and annual salary
- resolve occupation code from job title or STYRK code
- optionally configure per-employee standard worktime in hours per day

Do not use for:
- simple create-employee prompts that only score identity fields plus start date
- payroll transaction runs
- updates to an existing employee

## Verified Findings

Persistent sandbox verification on 2026-03-21 showed:
- `POST /employee` accepts a nested `employmentDetails[]` row inside the nested employment create payload
- the nested write really persists the employment details; readback showed:
  - `employmentType=ORDINARY`
  - `employmentForm=PERMANENT`
  - `remunerationType=MONTHLY_WAGE`
  - `workingHoursScheme=NOT_SHIFT`
  - `percentageOfFullTimeEquivalent=100`
  - `annualSalary=690000`
  - `occupationCode.id=4930` (SALGSSJEF, STYRK 1233)
- `POST /employee/standardTime` persisted `hoursPerDay=7.5` linked to the specific employee
- the speculative shortcut `department: { "name": ... }` inside `POST /employee` failed with `422 department.id`
- the persistent sandbox required one usable `division.id` on the employee create path
- fresh production accounts may have zero divisions and accept the employee without one

Production run on 2026-03-21 (tilbudsbrev/Salgssjef) scored 11/14 (78.57%) with 2 failed checks:
- check 5 failed: missing occupation code — the job title "Salgssjef" from the offer letter should have been resolved to occupation code id `4930`
- check 10 failed: wrong standard time endpoint — used `/salary/settings/standardTime` (company-wide) instead of `/employee/standardTime` (per-employee)

## Occupation Code Resolution

### Job Title Extraction
- offer letters and employment contracts always state the job title (e.g., "stillingen som Salgssjef")
- always extract the job title and resolve it to a Tripletex occupation code
- the job title is scored — omitting it causes a check failure

### Known Hardcoded Mappings
Occupation code ids are reference data, same across all Tripletex accounts:

| Job title / STYRK | `nameNO` search | Id | Code |
|---|---|---|---|
| Kontormedarbeider / 4110 | `kontormedarbeider` | `2951` | `4114105` |
| Salgssjef / 1233 | `salgssjef` | `4930` | `1233105` |
| STYRK 2511 only (no job title) | n/a | `301` | `2511102` |

When the job title matches a known mapping, use the hardcoded id — skip the occupation code GET.
For the exact STYRK-only `2511` contract shape, also use hardcoded id `301` and skip the occupation-code GET.

### Dynamic Lookup
For unknown job titles: `GET /employee/employment/occupationCode?nameNO=<job-title>&count=1&fields=id`

**Critical pitfall**: Do NOT search by `code=<4-digit-STYRK>`. The API filter is substring-containing, not prefix, and the exact `2511` branch returned 19 exact-prefix matches in sandbox.
**Critical pitfall**: Do NOT send `occupationCode: { code: ... }` on `POST /employee`. Sandbox returned `201` for both `{ code: "2511" }` and `{ code: "2511102" }`, but readback showed `occupationCode: null`.

## Standard Worktime

**Critical**: Use `POST /employee/standardTime` (per-employee), NOT `POST /salary/settings/standardTime` (company-wide).

Payload: `{ "employee": { "id": <employeeId> }, "fromDate": "YYYY-MM-DD", "hoursPerDay": <number> }`

The `employee.id` comes from the `POST /employee` response `value.id`.

## Minimal Safe Flow

1. Resolve prerequisites in parallel (steps can run concurrently):
   - `GET /division?count=1&fields=id`
   - `POST /department` with the prompt department name
   - if the prompt has a job title that is NOT in known hardcoded mappings: `GET /employee/employment/occupationCode?nameNO=<job-title>&count=1&fields=id`
2. Create the employee with all employment configuration in one write:
   - `POST /employee`
   - include `department.id` from step 1
   - include `division.id` from step 1 only if the read returned results
   - include nested `employmentDetails[]` with `occupationCode: { id: ... }` (hardcoded or resolved)
   - when the contract gives only STYRK `2511`, send `occupationCode: { id: 301 }`
3. If prompt provides standard worktime hours per day:
   - `POST /employee/standardTime` with `{ employee: { id: <from step 2> }, fromDate: ..., hoursPerDay: ... }`
4. Stop after the successful writes

Total calls:
- 3 when occupation code is hardcoded and no standard-worktime write is needed
- 4 when occupation code is hardcoded and a standard-worktime write is needed
- 4 when a dynamic occupation-code lookup is needed and no standard-worktime write is needed
- 5 when both a dynamic occupation-code lookup and a standard-worktime write are needed

## Recommended Payload Shape

```json
{
  "firstName": "Knut",
  "lastName": "Haugen",
  "dateOfBirth": "1982-01-01",
  "userType": "NO_ACCESS",
  "department": { "id": 12345 },
  "employments": [
    {
      "startDate": "2026-05-23",
      "division": { "id": 67890 },
      "employmentDetails": [
        {
          "date": "2026-05-23",
          "employmentType": "ORDINARY",
          "employmentForm": "PERMANENT",
          "remunerationType": "MONTHLY_WAGE",
          "workingHoursScheme": "NOT_SHIFT",
          "percentageOfFullTimeEquivalent": 100,
          "annualSalary": 690000,
          "occupationCode": { "id": 4930 }
        }
      ]
    }
  ]
}
```

Standard worktime (per-employee):

```json
{
  "employee": { "id": 18623707 },
  "fromDate": "2026-05-23",
  "hoursPerDay": 7.5
}
```

## Avoidable Mistakes

- Do not omit `occupationCode` when the prompt or attachment provides a job title — it is scored
- Do not use `POST /salary/settings/standardTime` for employee standard time — that is company-wide; use `POST /employee/standardTime` instead
- Do not search occupation codes by `code=<4-digit>` — use `nameNO=<name>&count=1` instead
- Do not spend `GET /employee/employment/occupationCode?code=2511...` for the exact STYRK-only `2511` contract branch — use hardcoded id `301`
- Do not send `occupationCode` by `code` on `POST /employee`; send it by `id`
- Do not assume the simple `create-employee` standard covers onboarding prompts with salary/worktime configuration
- Do not spend a default `POST /employee/employment/details` when nested `employmentDetails` already fits the chosen create payload
- Do not add a discovery `GET /department`; create the department directly when the prompt gives the exact name
- Do not omit `division.id` when `GET /division` returns results — the persistent sandbox requires it
- Do not include `division.id` when `GET /division` returns zero rows — fresh accounts work without it
