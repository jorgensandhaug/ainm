# Onboard Employee

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- onboard one new employee from a prompt, offer letter, or employment contract
- prompt provides employee identity fields such as name and birth date
- prompt provides one department name to attach
- prompt provides one employment start date
- prompt provides one employment percentage and one annual salary
- prompt or attachment may provide a job title (e.g., "Salgssjef") or a STYRK occupation code (e.g., `4110`) — if present, resolve it to a Tripletex occupation code id
- prompt may provide standard worktime in hours per day — if absent, skip the standard-worktime write
- prompt may provide `nationalIdentityNumber` (personnummer) and/or `bankAccountNumber` — include them directly on the employee payload
- task is about employee master-data onboarding, not payroll transaction creation

## Do Not Use This Standard If
- task only asks to create a simple employee card with start date and no salary/worktime setup
- task requires repairing or updating an existing employee instead of creating a new one
- prompt materially depends on payroll transactions, payslips, deductions, or leave flows

## Standard Flow
1. Resolve prerequisites in parallel:
   - `GET /division?count=1&fields=id`
   - `POST /department` with the prompt department name
   - if the prompt provides a job title and the occupation code id is NOT in the known hardcoded mappings below: `GET /employee/employment/occupationCode?nameNO=<occupation-name>&count=1&fields=id`
2. `POST /employee` with:
   - prompt identity fields (including `nationalIdentityNumber` and `bankAccountNumber` when provided)
   - explicit `userType: "NO_ACCESS"`
   - `department.id` from step `1`
   - one nested `employment` row containing:
     - `startDate`
     - `division.id` from step `1` — include only if the division read returned at least one row; fresh production accounts may have zero divisions and accept the employee without one
     - one nested `employmentDetails` row containing:
       - `date` set to the same start date
       - `employmentType`
       - `employmentForm`
       - `remunerationType`
       - `workingHoursScheme`
       - `percentageOfFullTimeEquivalent`
       - `annualSalary`
       - `occupationCode: { "id": <resolved-or-hardcoded-id> }` — include when the prompt provides a job title or STYRK code
3. if the prompt provides standard worktime hours per day: `POST /employee/standardTime` with `{ "employee": { "id": <employeeId> }, "fromDate": <startDate>, "hoursPerDay": <prompt-hours> }`
4. stop after the successful writes

Total calls:
- 3 when occupation code is hardcoded and no standard-worktime write is needed
- 4 when occupation code is hardcoded and a standard-worktime write is needed
- 4 when a dynamic occupation-code lookup is needed and no standard-worktime write is needed
- 5 when both a dynamic occupation-code lookup and a standard-worktime write are needed

## Occupation Code Resolution

### Job Title Extraction
- offer letters and employment contracts typically state the job title (e.g., "stillingen som Salgssjef")
- always extract the job title and resolve it to a Tripletex occupation code
- the job title is scored as `occupationCode` in the employment details — omitting it causes a check failure

### Known Hardcoded Mappings (verified sandbox + production)
These occupation code ids are reference data and are the same across all Tripletex accounts:

| Job title / STYRK | `nameNO` search term | Occupation code id | Full code |
|---|---|---|---|
| Kontormedarbeider / STYRK 4110 | `kontormedarbeider` | `2951` | `4114105` |
| Salgssjef / STYRK 1233 | `salgssjef` | `4930` | `1233105` |
| Innkjøper / STYRK 3323 | `innkjøper` | `2503` | `3416102` |
| Seniorutvikler | `systemutvikler` | `5935` | `2130109` |
| STYRK 2511 only (no job title) | n/a | `301` | `2511102` |

When the job title matches a known mapping above, use the hardcoded id directly — do NOT spend a `GET /employee/employment/occupationCode` call.
For the exact STYRK-only contract shape that provides `2511` and no job title, use hardcoded id `301` directly.
For the exact STYRK-only contract shape that provides `3323` and no job title, use hardcoded id `2503` directly.

### Compound Job Titles with "Senior" Prefix
- Tripletex does NOT have occupation codes for every "Senior"-prefixed compound title (e.g., `nameNO=seniorutvikler` returns 0 results)
- some "Senior" prefixed titles DO exist (e.g., SENIORINGENIØR, SENIORKONSULENT, SENIORPROGRAMMERER) — but "SENIORUTVIKLER" does not
- when the exact compound title returns 0 results, map to the underlying base occupation (e.g., "Seniorutvikler" → SYSTEMUTVIKLER)
- do NOT fall back to a generic substring like `nameNO=utvikler` — that returns DRIFTSUTVIKLER (IT operations, id 1173, code 3120129) as the first result, which is wrong for a software developer context
- always check the hardcoded mappings table first — common "Senior"-prefixed titles are already mapped there

### Dynamic Lookup
- for unknown job titles, search `nameNO=<Norwegian-job-title>&count=1&fields=id` and use the first result
- if the prompt gives only a 4-digit STYRK group and there is no verified hardcoded mapping for that exact group, resolve the STYRK code to the Norwegian occupation name first, then search by `nameNO`
- important: the 4-digit STYRK code from the contract does NOT always match the first 4 digits of the Tripletex 7-digit code (e.g., STYRK 3323 "Innkjøper" maps to Tripletex code `3416102`, not `3323xxx`; and `code=3323` returns 0 results)
- if the prompt gives only a 4-digit STYRK group and there is no verified hardcoded mapping for that exact group, a blind `code=<4-digit>` search is not safe because one group can fan out to many 7-digit occupations
- Tripletex uses 7-digit occupation codes, not 4-digit STYRK group codes
- the `code` filter on `/employee/employment/occupationCode` is a substring-containing match, not a prefix match — do NOT search by `code=<4-digit-STYRK>`
- on writes, send `occupationCode: { "id": ... }`, not `occupationCode: { "code": ... }`

## Standard Worktime
- the correct endpoint for employee-specific standard time is `POST /employee/standardTime`
- payload: `{ "employee": { "id": <employeeId> }, "fromDate": "YYYY-MM-DD", "hoursPerDay": <number> }`
- do NOT use `POST /salary/settings/standardTime` — that is the company-wide standard time setting, not per-employee
- the 2026-03-21 production run used `/salary/settings/standardTime` and failed the standard-time check; the correct endpoint is `/employee/standardTime`
- sandbox verification on 2026-03-21 confirmed `POST /employee/standardTime` persists correctly linked to the specific employee

## Division Handling
- always pre-read `GET /division?count=1&fields=id` to check for existing divisions
- if the read returns at least one row, include `division: { "id": <returned-id> }` in the employment
- if the read returns zero rows (common on fresh production accounts), omit `division` from the employment — `POST /employee` can succeed without it on accounts that have no division requirement
- do not attempt `POST /division` as a repair branch; sandbox showed that is not safe
- this strategy avoids both the `422 employments.division.id` error on accounts that require it and the wasted call on accounts that do not

## Payload Rules
- preserve prompt names exactly
- normalize dates to ISO `YYYY-MM-DD`
- use `employmentType: "ORDINARY"` for ordinary employment unless the prompt clearly states otherwise
- map permanent employment wording such as `Fast stilling` to `employmentForm: "PERMANENT"`
- map monthly salary wording such as `Fastlønn (månedlig)` to `remunerationType: "MONTHLY_WAGE"`
- use `workingHoursScheme: "NOT_SHIFT"` for ordinary day-work prompts that only specify daily hours and do not describe shift work
- send `percentageOfFullTimeEquivalent` as the percentage value itself, e.g. `80`, not `0.8`
- do not try the speculative shortcut `department: { "name": ... }` inside `POST /employee`; the employee write requires `department.id`

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

## Reuse From Read And Write Responses
- from `GET /division`:
  - one reusable `division.id` (if exists)
- from `POST /department`:
  - `department.id`
- from `POST /employee`:
  - `employee.id` — needed for the `POST /employee/standardTime` call
  - employment id if later logic unexpectedly needs it
- from `POST /employee/standardTime`:
  - created standard-time row if later logic unexpectedly needs it

## Verification
- zero extra verification calls in scored runs once all writes succeed
- persistent sandbox verification on 2026-03-21 confirmed that the nested `employmentDetails` row is really persisted on the employment:
  - `GET /employee/employment/details?employmentId=...&fields=*` returned the exact persisted `employmentType`, `employmentForm`, `remunerationType`, `workingHoursScheme`, `percentageOfFullTimeEquivalent`, `annualSalary`, and `occupationCode.id`
- do not spend a production verification `GET` just to prove the nested write; that would overpay calls once this exact standard already matches

## Known Recovery Branches
- if `POST /employee` fails with `422` on `employments.division.id` and the pre-read returned zero divisions, stop blocked; do not guess a new division create
- if `POST /employee` fails only on `department.id`, the department create/write reuse is wrong; fix that specific payload rather than widening into extra discovery reads

## Pitfalls To Avoid
- do not omit `occupationCode` when the prompt or attachment provides a job title — the job title maps to a STYRK occupation code and is scored
- do not use `POST /salary/settings/standardTime` for employee-specific standard time — use `POST /employee/standardTime` instead; the salary/settings endpoint is company-wide
- do not reuse the simple `create-employee` standard for this richer onboarding shape; that standard optimizes for employee-card creation, not a fully configured employment relationship
- do not spend `POST /employee/employment/details` as a separate default step here; nested `employmentDetails` in the employee create payload already persists
- do not search occupation codes by `code=<4-digit-STYRK>` — the `code` filter is a substring-containing match that returns wrong codes; always use `nameNO=<occupation-name>&count=1`
- do not pick the first result from a `code=4110` search — it will match codes like `3341103` (ADJUNKT) that contain "4110" as a substring, which is a completely different STYRK group
- for the exact STYRK-only `2511` contract shape, do not spend `GET /employee/employment/occupationCode?code=2511...` — sandbox returned 19 exact-`2511` rows, so that read is ambiguous and wastes a call
- do not send `occupationCode: { "code": "2511" }` or `occupationCode: { "code": "2511102" }` on `POST /employee`; sandbox returned `201` but read back `occupationCode: null`
- do not chase a speculative `2`-call shortcut through nested department creation; persistent sandbox returned `422 department.id: Feltet må fylles ut.`
- do not hardcode sandbox-only default state such as current `7.5` standard time into the production playbook
- do not fall back to `nameNO=utvikler` for "Seniorutvikler" — the first result is DRIFTSUTVIKLER (IT operations, id 1173, code 3120129), which is wrong for a software developer; the correct match is SYSTEMUTVIKLER (id 5935, code 2130109), now hardcoded
- do not search `nameNO=seniorutvikler` — it returns 0 results; this compound title does not exist in the Tripletex occupation database

## OpenAPI / Sandbox Status
- `/division`, `/department`, `/employee`, `/employee/employment/occupationCode`, `/employee/standardTime` verified in `./openapi.json`
- persistent sandbox verification on 2026-03-21 confirmed the correct onboarding flow with 4 calls:
  - `GET /division?count=1&fields=id` → division id `108244566`
  - `POST /department` → department created
  - `POST /employee` with nested `employmentDetails` including `occupationCode: { id: 4930 }` (SALGSSJEF, hardcoded) → `201`, all employment details persisted
  - `POST /employee/standardTime` with `{ employee: { id: ... }, fromDate: "2026-05-23", hoursPerDay: 7.5 }` → `201`, per-employee standard time persisted
  - readback confirmed: `occupationCode.id=4930`, `percentageOfFullTimeEquivalent=100`, `annualSalary=690000`, `employmentForm=PERMANENT`, `hoursPerDay=7.5`
- persistent sandbox verification on 2026-03-21 also confirmed the exact STYRK-only `2511` contract branch:
  - `GET /division?count=1&fields=*` → division id `108244566`
  - `POST /department` → department created
  - `POST /employee` with real `nationalIdentityNumber`, real `bankAccountNumber`, and nested `occupationCode: { id: 301 }` → `201`
  - `GET /employee/employment/details?employmentId=...&fields=*,occupationCode(*)` read back `occupationCode.id=301`, `occupationCode.code=2511102`, `percentageOfFullTimeEquivalent=100`, and `annualSalary=820000`
- the same sandbox follow-up proved that `occupationCode` writes by `code` are unsafe:
  - `POST /employee` with nested `occupationCode: { code: "2511" }` returned `201` but read back `occupationCode: null`
  - `POST /employee` with nested `occupationCode: { code: "2511102" }` returned `201` but read back `occupationCode: null`
  - `GET /employee/employment/occupationCode?code=2511&count=1000&fields=*` returned 19 exact-`2511` rows, so that resolver is ambiguous for this task shape
- persistent sandbox also confirmed that omitting `division` triggers `422 employments.division.id`
- production run on 2026-03-21 confirmed that fresh accounts can succeed without `division` (GET /division returned 0 rows, POST /employee succeeded without it)
- production run on 2026-03-21 scored 11/14 (78.57%) with 2 failed checks because: (1) missing occupation code for job title "Salgssjef", (2) used wrong standard time endpoint `/salary/settings/standardTime` instead of `/employee/standardTime`
- production run on 2026-03-21 (second run, STYRK 3323 contract) used 4 calls: GET /division, POST /department, GET /occupationCode?nameNO=innkjøper, POST /employee — all succeeded, 0 errors
  - `nameNO=innkjøper` returned id `2503` (INNKJØPER, code `3416102`) as the first result
  - `code=3323` returned 0 results — confirming that STYRK 3323 does NOT appear as a substring in any Tripletex 7-digit occupation code
  - sandbox readback confirmed: `occupationCode.id=2503`, `occupationCode.code=3416102`, `nameNO=INNKJØPER`, `annualSalary=970000`, `percentageOfFullTimeEquivalent=100`, `employmentForm=PERMANENT`
  - hardcoding STYRK 3323 → id 2503 saves 1 call, reducing the optimal flow from 4 to 3 calls for this contract shape
- production run on 2026-03-21 (third run, Seniorutvikler offer letter) used 6 calls: GET /division, GET /occupationCode?nameNO=seniorutvikler (0 results), POST /department, GET /occupationCode?nameNO=utvikler (wrong: DRIFTSUTVIKLER id 1173), POST /employee, POST /employee/standardTime — 1 wasted call on failed search, 1 call returned wrong occupation code
  - `nameNO=seniorutvikler` returned 0 results — compound title does not exist in Tripletex
  - fallback `nameNO=utvikler` returned id 1173 (DRIFTSUTVIKLER, code 3120129) — IT operations, wrong for software developer
  - correct mapping: SYSTEMUTVIKLER (id 5935, code 2130109) verified in sandbox readback
  - sandbox verification on 2026-03-21: POST /employee with occupationCode {id: 5935} → 201, readback confirmed occupationCode.id=5935, nameNO=SYSTEMUTVIKLER, code=2130109
  - hardcoding Seniorutvikler → id 5935 saves 1 call and avoids the wrong-code trap, reducing optimal flow to 4 calls
