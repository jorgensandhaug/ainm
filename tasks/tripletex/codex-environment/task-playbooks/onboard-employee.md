# Onboard Employee

## Scope

Use for tasks like:
- onboard one new employee from an offer letter, employment contract, or prompt
- create the employee card
- attach one named department
- set up one employment with percentage and annual salary
- optionally resolve a STYRK occupation code
- optionally configure standard worktime in hours per day

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
  - `percentageOfFullTimeEquivalent=80`
  - `annualSalary=530000`
  - `occupationCode.id=2951` (KONTORMEDARBEIDER, STYRK 4110)
- `POST /employee` still returned `employments[]` only as link objects, but that was enough to prove the employment row existed
- `POST /salary/settings/standardTime` persisted `hoursPerDay=7.5`
- the speculative shortcut `department: { "name": ... }` inside `POST /employee` failed with `422 department.id`
- the persistent sandbox required one usable `division.id` on the employee create path
- fresh production accounts may have zero divisions and accept the employee without one

STYRK occupation code lookup on 2026-03-21 showed:
- the `code` filter on `/employee/employment/occupationCode` is a substring-containing match, NOT a prefix/exact match
- searching `code=4110` returns 140 unrelated codes that happen to contain "4110" anywhere in their 7-digit code
- the first result from `code=4110` is ADJUNKT (code 3341103, id 9) — a completely wrong STYRK group
- the reliable lookup is `nameNO=kontormedarbeider&count=1&fields=id` which returns id 2951 (KONTORMEDARBEIDER, code 4114105)
- this id is reference data and is the same across sandbox and production

Production scoring feedback on 2026-03-21 for the employment-contract onboarding run:
- the run scored `0/0` correctness and timed out
- root cause: used wrong occupation code (ADJUNKT id=9 instead of KONTORMEDARBEIDER id=2951) from unreliable `code=4110` search
- the agent spent 4 extra API calls trying to find and fix the wrong code, exhausting the 300s budget

## Minimal Safe Flow

1. Resolve prerequisites in parallel (steps can run concurrently):
   - `GET /division?count=1&fields=id`
   - `POST /department` with the prompt department name
   - if STYRK code provided: `GET /employee/employment/occupationCode?nameNO=<occupation-name>&count=1&fields=id`
2. Create the employee with all employment configuration in one write:
   - `POST /employee`
   - include `department.id` from step 1
   - include `division.id` from step 1 only if the read returned results
   - include nested `employmentDetails[]` with `occupationCode: { id: ... }` if resolved
   - include `nationalIdentityNumber` and `bankAccountNumber` if provided by prompt
3. If prompt provides standard worktime hours per day:
   - `POST /salary/settings/standardTime`
4. Stop after the successful writes

Total calls: 3-5 depending on whether STYRK code and standard worktime are present.

## STYRK Code Resolution

Known mappings (4-digit STYRK → `nameNO` search term):
- `4110` → `kontormedarbeider`

For unknown STYRK codes, search by the Norwegian name of the STYRK occupation group.

**Critical pitfall**: Do NOT search by `code=<4-digit-STYRK>`. The API filter is substring-containing, not prefix. `code=4110` returns codes like `3341103` (ADJUNKT) that happen to contain "4110" as a substring. This caused the 2026-03-21 production failure.

## Recommended Payload Shape

```json
{
  "firstName": "Liv",
  "lastName": "Aasen",
  "dateOfBirth": "1985-07-24",
  "nationalIdentityNumber": "24078559566",
  "email": "liv.aasen@example.org",
  "bankAccountNumber": "30392987718",
  "userType": "NO_ACCESS",
  "department": { "id": 12345 },
  "employments": [
    {
      "startDate": "2026-12-10",
      "division": { "id": 67890 },
      "employmentDetails": [
        {
          "date": "2026-12-10",
          "employmentType": "ORDINARY",
          "employmentForm": "PERMANENT",
          "remunerationType": "MONTHLY_WAGE",
          "workingHoursScheme": "NOT_SHIFT",
          "percentageOfFullTimeEquivalent": 80,
          "annualSalary": 530000,
          "occupationCode": { "id": 2951 }
        }
      ]
    }
  ]
}
```

If standard worktime is provided, write it separately:

```json
{
  "fromDate": "2026-12-10",
  "hoursPerDay": 7.5
}
```

## Avoidable Mistakes

- Do not search occupation codes by `code=<4-digit>` — use `nameNO=<name>&count=1` instead
- Do not assume the simple `create-employee` standard covers onboarding prompts with salary/worktime configuration
- Do not spend a default `POST /employee/employment/details` when nested `employmentDetails` already fits the chosen create payload
- Do not add a discovery `GET /department`; create the department directly when the prompt gives the exact name
- Do not hardcode sandbox-only default state such as current `7.5` standard time into the production playbook
- Do not omit `division.id` when `GET /division` returns results — the persistent sandbox requires it
- Do not include `division.id` when `GET /division` returns zero rows — fresh accounts work without it
