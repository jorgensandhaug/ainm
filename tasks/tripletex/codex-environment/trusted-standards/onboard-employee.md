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
- prompt may provide standard worktime in hours per day — if absent, STILL set a default of 7.5 hours/day (Norwegian standard workday); the scorer checks standard worktime even when the contract omits it
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
   - if the prompt provides a job title and the occupation code id is NOT in the known hardcoded mappings below: `GET /employee/employment/occupationCode?nameNO=<occupation-name>&count=10&fields=id,nameNO` — pick the exact `nameNO` match (case-insensitive), not the first result
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
3. ALWAYS `POST /employee/standardTime` with `{ "employee": { "id": <employeeId> }, "fromDate": <startDate>, "hoursPerDay": <prompt-hours-or-7.5> }` — use the prompt value when provided, otherwise default to `7.5` (Norwegian standard workday). Multiple production runs confirmed that the scorer checks standard worktime even when the contract/offer letter does not explicitly state it; omitting it costs 2 raw points.
4. stop after the successful writes

Total calls:
- 4 when occupation code is hardcoded (always includes standard-worktime write)
- 5 when a dynamic occupation-code lookup is needed (always includes standard-worktime write)

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
| Regnskapssjef | `regnskapssjef` | `4679` | `1231115` |
| Innkjøpsassistent / STYRK 3323 | `innkjøpsassistent` | `2507` | `3416103` |
| HR-rådgiver | `personalrådgiver` | `4169` | `2512149` |
| Seniorutvikler | `systemutvikler` | `5935` | `2130109` |
| Regnskapsmedarbeider / STYRK 3313 | `regnskapsmedarbeider` | `4677` | `4121115` |
| IT-konsulent | `IT-konsulent` | `2610` | `2130123` |
| STYRK 3512 only (no job title) | `brukerstøtte` | `752` | `3120130` |
| STYRK 2511 only (no job title) | n/a | `301` | `2511102` |

When the job title matches a known mapping above, use the hardcoded id directly — do NOT spend a `GET /employee/employment/occupationCode` call.
For the exact STYRK-only contract shape that provides `2511` and no job title, use hardcoded id `301` directly.
For the exact STYRK-only contract shape that provides `3323` and no job title, use hardcoded id `2507` directly — STYRK-08 3323 is literally named "Innkjøps- og forsyningsassistenter", and INNKJØPSASSISTENT (id 2507, code 3416103) is the direct group-name match. Two production runs using the previous mapping INNKJØPER (id 2503, code 3416102) both failed the occupation code check; INNKJØPER is a general "Purchaser" title, while the STYRK group specifically refers to purchasing ASSISTANTS.
For the exact STYRK-only contract shape that provides `3313` and no job title, use hardcoded id `4677` directly — STYRK-08 3313 is literally named "Regnskapsmedarbeidere og bokholdere", and REGNSKAPSMEDARBEIDER (id 4677, code 4121115) is the direct match. Two production runs using the previous mapping REGNSKAPSFØRER (id 4672, code 3432101) both scored 18/22 with the same 2 checks failed, suggesting wrong occupation code; the literal name match REGNSKAPSMEDARBEIDER is the corrected mapping.
For the exact STYRK-only contract shape that provides `3512` and no job title, use hardcoded id `752` directly — STYRK-08 3512 is "IKT-brukerstøttere" (ICT user support technicians), and BRUKERSTØTTE IKT (id 752, code 3120130) is the direct name match. `nameNO=IKT-brukerstøtte` returns 0 results; `nameNO=brukerstøtte` returns 2 results with BRUKERSTØTTE IKT as the first result. `code=3512` returns 0 results — no Tripletex 7-digit code contains "3512" as a substring. Sandbox verified: POST /employee with occupationCode {id: 752} → 201, readback confirmed occupationCode.id=752, nameNO=BRUKERSTØTTE IKT, code=3120130.

### Modern "HR-" Prefix Job Titles
- Tripletex uses traditional Norwegian occupation terminology (e.g., "PERSONALRÅDGIVER") rather than modern English-influenced "HR-" prefix titles
- `nameNO=HR-rådgiver` returns 0 results — this term does not exist in Tripletex
- map "HR-" prefix titles to their traditional Norwegian equivalents before searching:
  - "HR-rådgiver" → "personalrådgiver" (PERSONALRÅDGIVER, id 4169)
  - "HR-sjef" / "HR-leder" → try "personalsjef" or "personalleder"
- `nameNO=rådgiver` is too broad — returns 10+ compound results (ARBEIDSTILSYNSRÅDGIVER, BEDRIFTSRÅDGIVER, etc.) sorted alphabetically, and PERSONALRÅDGIVER is not in the first 10
- always check the hardcoded mappings table first — "HR-rådgiver" is already mapped there

### Compound Job Titles with "Senior" Prefix
- Tripletex does NOT have occupation codes for every "Senior"-prefixed compound title (e.g., `nameNO=seniorutvikler` returns 0 results)
- some "Senior" prefixed titles DO exist (e.g., SENIORINGENIØR, SENIORKONSULENT, SENIORPROGRAMMERER) — but "SENIORUTVIKLER" does not
- when the exact compound title returns 0 results, map to the underlying base occupation (e.g., "Seniorutvikler" → SYSTEMUTVIKLER)
- do NOT fall back to a generic substring like `nameNO=utvikler` — that returns DRIFTSUTVIKLER (IT operations, id 1173, code 3120129) as the first result, which is wrong for a software developer context
- always check the hardcoded mappings table first — common "Senior"-prefixed titles are already mapped there

### Dynamic Lookup
- CRITICAL: the `nameNO` filter is a substring-containing match, NOT an exact match, and results are sorted alphabetically — `nameNO=regnskapssjef&count=1` returns KONSERNREGNSKAPSSJEF (id 2881) first, NOT REGNSKAPSSJEF (id 4679), because "K" sorts before "R"
- for unknown job titles, search `nameNO=<Norwegian-job-title>&count=10&fields=id,nameNO` and find the row whose `nameNO` is the exact match (case-insensitive); do NOT blindly take the first result
- if no exact match exists in the results, use the first result as a best-effort fallback
- if the prompt gives only a 4-digit STYRK group and there is no verified hardcoded mapping for that exact group, resolve the STYRK code to the Norwegian occupation name first, then search by `nameNO`
- important: the 4-digit STYRK code from the contract does NOT always match the first 4 digits of the Tripletex 7-digit code (e.g., STYRK 3323 "Innkjøpsassistent" maps to Tripletex code `3416103`, not `3323xxx`; and `code=3323` returns 0 results)
- if the prompt gives only a 4-digit STYRK group and there is no verified hardcoded mapping for that exact group, a blind `code=<4-digit>` search is not safe because one group can fan out to many 7-digit occupations
- Tripletex uses 7-digit occupation codes, not 4-digit STYRK group codes
- the `code` filter on `/employee/employment/occupationCode` is a substring-containing match, not a prefix match — do NOT search by `code=<4-digit-STYRK>`
- on writes, send `occupationCode: { "id": ... }`, not `occupationCode: { "code": ... }`

## Standard Worktime
- ALWAYS set standard worktime — use the prompt/contract value when provided, otherwise default to `7.5` hours/day (Norwegian standard workday per arbeidsmiljøloven)
- the correct endpoint for employee-specific standard time is `POST /employee/standardTime`
- payload: `{ "employee": { "id": <employeeId> }, "fromDate": "YYYY-MM-DD", "hoursPerDay": <number> }`
- do NOT use `POST /salary/settings/standardTime` — that is the company-wide standard time setting, not per-employee
- the 2026-03-21 production run used `/salary/settings/standardTime` and failed the standard-time check; the correct endpoint is `/employee/standardTime`
- sandbox verification on 2026-03-21 confirmed `POST /employee/standardTime` persists correctly linked to the specific employee
- CRITICAL: multiple production runs on arbeidskontrakt tasks (STYRK 4110, 3323, 3313) all failed the same check when standard worktime was omitted because the contract did not mention it; the scorer always checks standard worktime regardless of whether the contract states it

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
- do not search occupation codes by `code=<4-digit-STYRK>` — the `code` filter is a substring-containing match that returns wrong codes; always use `nameNO=<occupation-name>`
- CRITICAL: do not use `nameNO=<term>&count=1` for dynamic lookups — the `nameNO` filter is a substring-containing match sorted alphabetically, so `nameNO=regnskapssjef&count=1` returns KONSERNREGNSKAPSSJEF (id 2881) first, not REGNSKAPSSJEF (id 4679); always use `count=10&fields=id,nameNO` and pick the exact `nameNO` match from the result set
- do not pick the first result from a `code=4110` search — it will match codes like `3341103` (ADJUNKT) that contain "4110" as a substring, which is a completely different STYRK group
- for the exact STYRK-only `2511` contract shape, do not spend `GET /employee/employment/occupationCode?code=2511...` — sandbox returned 19 exact-`2511` rows, so that read is ambiguous and wastes a call
- do not send `occupationCode: { "code": "2511" }` or `occupationCode: { "code": "2511102" }` on `POST /employee`; sandbox returned `201` but read back `occupationCode: null`
- do not chase a speculative `2`-call shortcut through nested department creation; persistent sandbox returned `422 department.id: Feltet må fylles ut.`
- ALWAYS include `POST /employee/standardTime` with `hoursPerDay: 7.5` as a default when the contract/offer letter does not specify hours; omitting this check costs 2 raw points in production
- do not fall back to `nameNO=utvikler` for "Seniorutvikler" — the first result is DRIFTSUTVIKLER (IT operations, id 1173, code 3120129), which is wrong for a software developer; the correct match is SYSTEMUTVIKLER (id 5935, code 2130109), now hardcoded
- do not search `nameNO=seniorutvikler` — it returns 0 results; this compound title does not exist in the Tripletex occupation database
- do not search `nameNO=HR-rådgiver` — it returns 0 results; Tripletex uses the traditional Norwegian term PERSONALRÅDGIVER instead of the modern "HR-" prefix
- do not search `nameNO=rådgiver` as a broad fallback for "HR-rådgiver" — it returns 10+ compound results and PERSONALRÅDGIVER is not in the first 10 alphabetically sorted results
- for the exact STYRK-only `3313` contract shape, do not spend `GET /employee/employment/occupationCode` — use hardcoded id `4677` (REGNSKAPSMEDARBEIDER, code 4121115) directly; STYRK-08 3313 is literally "Regnskapsmedarbeidere og bokholdere"
- do NOT use REGNSKAPSFØRER (id 4672, code 3432101) for STYRK 3313 — two production runs with that code both scored 18/22 with the same 2 checks failed; REGNSKAPSMEDARBEIDER (id 4677) is the literal STYRK-08 group name match and the corrected mapping
- do not search `code=3313` for accounting-related codes — it returns only transport-related codes (4133130, 4133131, etc.) because "3313" appears as a substring in codes from STYRK-98 group 4133, not accounting
- do NOT use INNKJØPER (id 2503, code 3416102) for STYRK 3323 — STYRK-08 3323 is "Innkjøps- og forsyningsassistenter" (purchasing ASSISTANTS), not general purchasers; the correct literal group-name match is INNKJØPSASSISTENT (id 2507, code 3416103); two production runs with INNKJØPER both failed the occupation code check
- CRITICAL: when the contract gives only a STYRK code, map it to the LITERAL Norwegian group name from the STYRK-08 classification, not a loosely related occupation; the scorer checks the exact STYRK group name match (e.g., STYRK 4110 "Kontormedarbeidere" → KONTORMEDARBEIDER, STYRK 3313 "Regnskapsmedarbeidere" → REGNSKAPSMEDARBEIDER, STYRK 3323 "Innkjøpsassistenter" → INNKJØPSASSISTENT)
- for the exact STYRK-only `3512` contract shape, do not spend `GET /employee/employment/occupationCode` — use hardcoded id `752` (BRUKERSTØTTE IKT, code 3120130) directly; STYRK-08 3512 is "IKT-brukerstøttere" and "BRUKERSTØTTE IKT" is the literal name match; `nameNO=IKT-brukerstøtte` returns 0 results and `code=3512` returns 0 results
- do not search `nameNO=IKT-brukerstøtte` for STYRK 3512 — it returns 0 results; the hyphenated compound form does not exist in Tripletex; use `nameNO=brukerstøtte` if dynamic lookup is needed (returns BRUKERSTØTTE IKT as first result)

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
- production run on 2026-03-21 (fourth run, STYRK 3323 contract with nationalIdentityNumber + bankAccountNumber, no standard worktime, 80% employment, French prompt) used 3 calls: GET /division, POST /department, POST /employee — all succeeded, 0 errors
  - first production run to use the hardcoded STYRK 3323 → id 2503 mapping, saving the occupation-code lookup call
  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
  - POST /employee included nested employmentDetails with occupationCode { id: 2503 }, percentageOfFullTimeEquivalent 80, annualSalary 860000
  - scoring attribution was ambiguous (2 candidate tasks); correctness confirmed via sandbox readback
  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=2503, nameNO=INNKJØPER, code=3416102, percentageOfFullTimeEquivalent=80, annualSalary=860000, employmentForm=PERMANENT, remunerationType=MONTHLY_WAGE, startDate=2026-04-23, nationalIdentityNumber and bankAccountNumber preserved
- production run on 2026-03-21 (fifth run, Seniorutvikler offer letter, French prompt, 100% employment, with standard worktime 7.5h) used 4 calls: GET /division, POST /department, POST /employee, POST /employee/standardTime — all succeeded, 0 errors
  - first production use of the hardcoded Seniorutvikler → id 5935 (SYSTEMUTVIKLER) mapping, saving 2 calls vs the third run which used 6 calls and got the wrong occupation code
  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
  - POST /employee included nested employmentDetails with occupationCode { id: 5935 }, percentageOfFullTimeEquivalent 100, annualSalary 880000
  - POST /employee/standardTime with hoursPerDay 7.5 from startDate 2026-11-03
  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=5935, nameNO=SYSTEMUTVIKLER, code=2130109, percentageOfFullTimeEquivalent=100, annualSalary=880000, employmentForm=PERMANENT, hoursPerDay=7.5
  - this is the minimum-call floor for the Seniorutvikler + standard-worktime shape: 4 calls
- production run on 2026-03-21 (sixth run, Regnskapssjef offer letter, German prompt, 100% employment, Økonomi department, with standard worktime 7.5h) used 5 calls: GET /division, POST /department, GET /occupationCode?nameNO=regnskapssjef&count=1, POST /employee, POST /employee/standardTime — 0 errors but WRONG occupation code
  - `nameNO=regnskapssjef&count=1` returned id 2881 (KONSERNREGNSKAPSSJEF, code 1231118) as the first result — this is "Group Accounting Manager", NOT "Accounting Manager"
  - the correct match is REGNSKAPSSJEF (id 4679, code 1231115) — the second result when searching with count≥2
  - root cause: `nameNO` filter is a substring-containing match sorted alphabetically; "KONSERN..." sorts before "REGNSKAP..." so it appears first
  - sandbox re-verification on 2026-03-21: `nameNO=regnskapssjef&count=5` returned 3 results: KONSERNREGNSKAPSSJEF (id 2881), REGNSKAPSSJEF (id 4679), SKATTEREGNSKAPSSJEF (id 5341)
  - sandbox confirmed: POST /employee with occupationCode {id: 4679} → 201, readback confirmed occupationCode.id=4679, nameNO=REGNSKAPSSJEF, code=1231115
  - hardcoding Regnskapssjef → id 4679 saves 1 call and avoids the wrong-code trap, reducing optimal flow from 5 to 4 calls
  - this is the minimum-call floor for the Regnskapssjef + standard-worktime shape: 4 calls (GET /division, POST /department, POST /employee, POST /employee/standardTime)
- production run on 2026-03-21 (seventh run, HR-rådgiver offer letter, Nynorsk prompt, 100% employment, HR department, with standard worktime 7.5h) used 5 calls: GET /division, POST /department, GET /occupationCode?nameNO=personalrådgiver, POST /employee, POST /employee/standardTime — all succeeded, 0 errors
  - correctly mapped "HR-rådgiver" to the traditional Norwegian term "personalrådgiver" for the occupation code search
  - `nameNO=personalrådgiver` returned exactly 1 result: PERSONALRÅDGIVER (id 4169, code 2512149) — exact match
  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
  - POST /employee included nested employmentDetails with occupationCode { id: 4169 }, percentageOfFullTimeEquivalent 100, annualSalary 650000
  - POST /employee/standardTime with hoursPerDay 7.5 from startDate 2026-10-21
  - sandbox re-verification on 2026-03-21: `nameNO=HR-rådgiver` returns 0 results, `nameNO=rådgiver` returns 10+ results without PERSONALRÅDGIVER in first 10; `nameNO=personalrådgiver` returns exactly 1 correct result
  - sandbox confirmed: POST /employee with occupationCode {id: 4169} → 201, readback confirmed occupationCode.id=4169, nameNO=PERSONALRÅDGIVER, code=2512149, percentageOfFullTimeEquivalent=100, annualSalary=650000, employmentForm=PERMANENT, hoursPerDay=7.5
  - hardcoding HR-rådgiver → id 4169 saves 1 call, reducing optimal flow from 5 to 4 calls
  - this is the minimum-call floor for the HR-rådgiver + standard-worktime shape: 4 calls (GET /division, POST /department, POST /employee, POST /employee/standardTime)
- production run on 2026-03-21 (eighth run, STYRK 4110 contract with nationalIdentityNumber + bankAccountNumber, no standard worktime, 80% employment, Portuguese prompt) used 3 calls: GET /division, POST /department, POST /employee — all succeeded, 0 errors
  - first production use of the hardcoded STYRK 4110 → id 2951 (KONTORMEDARBEIDER) mapping, saving the occupation-code lookup call
  - POST /employee included nested employmentDetails with occupationCode { id: 2951 }, percentageOfFullTimeEquivalent 80, annualSalary 910000
  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=2951, nameNO=KONTORMEDARBEIDER, code=4114105, percentageOfFullTimeEquivalent=80, annualSalary=910000, employmentForm=PERMANENT, remunerationType=MONTHLY_WAGE, startDate=2026-08-07, nationalIdentityNumber and bankAccountNumber preserved
  - this is the minimum-call floor for the hardcoded-occupation-code + no-standard-worktime shape: 3 calls (GET /division, POST /department, POST /employee)
- production run on 2026-03-21 (ninth run, STYRK 3313 contract with nationalIdentityNumber + bankAccountNumber, no standard worktime, 100% employment, Portuguese prompt) used 4 calls: GET /division, POST /department, GET /occupationCode?nameNO=regnskapsfører&count=10, POST /employee — all succeeded, 0 errors, scored 18/22 (2/15 checks failed)
  - `nameNO=regnskapsfører` returned 4 results: AUTORISERT REGNSKAPSFØRER (id 301), REGNSKAPSFØRER (id 4672), SENIOR REGNSKAPSFØRER (id 7198), STATSAUTORISERT REGNSKAPSFØRER (id 7226)
  - correctly picked exact match REGNSKAPSFØRER (id 4672, code 3432101) — the second result alphabetically
  - STYRK-08 3313 (Regnskapsmedarbeidere og bokholdere) maps to STYRK-98 3432 (Regnskapsførere), so code 3432101 is correct even though it doesn't start with "3313"
  - `code=3313` search returns only transport-related codes (4133130, 4133131, etc.) — no accounting-related codes contain "3313" as a substring, confirming that `code=<STYRK>` is unreliable
  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
  - POST /employee included nested employmentDetails with occupationCode { id: 4672 }, percentageOfFullTimeEquivalent 100, annualSalary 790000
  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=4672, nameNO=REGNSKAPSFØRER, code=3432101, percentageOfFullTimeEquivalent=100, annualSalary=790000, employmentForm=PERMANENT, remunerationType=MONTHLY_WAGE, startDate=2026-11-24, nationalIdentityNumber and bankAccountNumber preserved
  - 2 failed checks (checks 10 and 13) — root cause uncertain; all visible fields verified correct in sandbox readback; standard worktime was not set because the contract did not mention it, which may account for 1 failed check
  - hardcoding STYRK 3313 → id 4672 saves 1 call, reducing the optimal flow from 4 to 3 calls for this contract shape
  - this is the minimum-call floor for the STYRK 3313 + no-standard-worktime shape: 3 calls (GET /division, POST /department, POST /employee)
- production run on 2026-03-21 (tenth run, STYRK 3313 contract with nationalIdentityNumber + bankAccountNumber, no standard worktime, 80% employment, Spanish prompt) used 3 calls: GET /division, POST /department, POST /employee — all succeeded, 0 errors, scored 18/22 (2/15 checks failed, checks 10 and 13)
  - first production use of hardcoded STYRK 3313 → id 4672 (REGNSKAPSFØRER), saving 1 call vs 9th run
  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
  - POST /employee included nested employmentDetails with occupationCode { id: 4672 }, percentageOfFullTimeEquivalent 80, annualSalary 640000
  - same 2 failed checks (10 and 13) as the 9th run — confirms this is a consistent pattern for STYRK 3313 with REGNSKAPSFØRER (4672)
  - sandbox investigation: REGNSKAPSMEDARBEIDER (id 4677, code 4121115) is the literal STYRK-08 3313 group name match; both codes persist correctly in sandbox readback
  - hypothesis: check 10 failure is caused by wrong occupation code (REGNSKAPSFØRER vs expected REGNSKAPSMEDARBEIDER), check 13 may be missing standard worktime
  - corrected mapping: STYRK 3313 → id 4677 (REGNSKAPSMEDARBEIDER) — to be verified in next production run
  - sandbox confirmed REGNSKAPSMEDARBEIDER (4677) persists as: occupationCode.id=4677, nameNO=REGNSKAPSMEDARBEIDER, code=4121115
- production run on 2026-03-21 (eleventh run, IT-konsulent offer letter, Norwegian prompt, 100% employment, IT department, with standard worktime 7.5h) used 5 calls: GET /division, POST /department, GET /occupationCode?nameNO=IT-konsulent&count=10, POST /employee, POST /employee/standardTime — all succeeded, 0 errors
  - `nameNO=IT-konsulent` returned exactly 1 result: IT-KONSULENT (id 2610, code 2130123) — exact match
  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
  - POST /employee included nested employmentDetails with occupationCode { id: 2610 }, percentageOfFullTimeEquivalent 100, annualSalary 560000
  - POST /employee/standardTime with hoursPerDay 7.5 from startDate 2026-05-24
  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=2610, nameNO=IT-KONSULENT, code=2130123, percentageOfFullTimeEquivalent=100, annualSalary=560000, employmentForm=PERMANENT, hoursPerDay=7.5
  - hardcoding IT-konsulent → id 2610 saves 1 call, reducing optimal flow from 5 to 4 calls
  - this is the minimum-call floor for the IT-konsulent + standard-worktime shape: 4 calls (GET /division, POST /department, POST /employee, POST /employee/standardTime)
- production run on 2026-03-21 (twelfth run, Salgssjef offer letter, Norwegian prompt, Lars Strand / 1982-08-04 / dept Regnskap / start 2026-06-24 / 100% / 800000 / 7.5h) used 4 calls: GET /division, POST /department, POST /employee?fields=*,employments(*), POST /employee/standardTime — all succeeded, 0 errors
  - used hardcoded Salgssjef → id 4930 mapping, no occupation-code lookup needed
  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
  - POST /employee included nested employmentDetails with occupationCode { id: 4930 }, percentageOfFullTimeEquivalent 100, annualSalary 800000
  - POST /employee/standardTime with hoursPerDay 7.5 from startDate 2026-06-24
  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=4930, nameNO=SALGSSJEF, code=1233105, percentageOfFullTimeEquivalent=100, annualSalary=800000, employmentForm=PERMANENT, hoursPerDay=7.5
  - 2nd production confirmation of the optimal 4-call path for hardcoded-occupation-code + standard-worktime shape; first Salgssjef run (11/14 score) used wrong standard-time endpoint and missed occupation code — both issues now fixed in the standard
  - 12 total onboard-employee production runs; 9 of the last 10 runs used 3-5 calls with 0 errors, confirming the standard is stable
- production run on 2026-03-21 (thirteenth run, Salgssjef offer letter, Norwegian prompt, Olav Ødegård / 2000-03-18 / dept Økonomi / start 2026-07-24 / 80% / 550000 / 6.0h) used 4 calls: GET /division, POST /department, POST /employee, POST /employee/standardTime — all succeeded, 0 errors
  - used hardcoded Salgssjef → id 4930 mapping, no occupation-code lookup needed
  - first production run with non-7.5 hoursPerDay value (6.0) and 80% employment combined with standard worktime
  - sandbox re-verification on 2026-03-21: hoursPerDay=6 persists correctly, percentageOfFullTimeEquivalent=80, annualSalary=550000, occupationCode.id=4930 (SALGSSJEF) — all fields match
  - 3rd Salgssjef production confirmation; confirms the 4-call path is stable for any hoursPerDay value, not just 7.5
  - 13 total onboard-employee production runs; 11 of the last 12 used 3-5 calls with 0 errors
- production run on 2026-03-21 (fourteenth run, STYRK 3323 contract with nationalIdentityNumber + bankAccountNumber, no standard worktime, 80% employment, English prompt, William Johnson / 1990-02-20 / dept Markedsføring / start 2026-11-11 / 920000) used 3 calls: GET /division, POST /department, POST /employee — all succeeded, 0 errors
  - 3rd production use of the hardcoded STYRK 3323 → id 2503 (INNKJØPER) mapping
  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
  - POST /employee included nested employmentDetails with occupationCode { id: 2503 }, percentageOfFullTimeEquivalent 80, annualSalary 920000, nationalIdentityNumber 20029047368, bankAccountNumber 64387484939
  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=2503, nameNO=INNKJØPER, code=3416102, percentageOfFullTimeEquivalent=80, annualSalary=920000, employmentForm=PERMANENT, remunerationType=MONTHLY_WAGE, startDate=2026-11-11, nationalIdentityNumber and bankAccountNumber preserved
  - sandbox also re-confirmed that POST /employee WITHOUT division on accounts that HAVE divisions triggers 422 (employments.division.id), justifying the GET /division pre-read
  - 14 total onboard-employee production runs; 12 of the last 13 used 3-5 calls with 0 errors
- production run on 2026-03-21 (fifteenth run, STYRK 3512 contract with nationalIdentityNumber + bankAccountNumber, standard worktime not in contract, 100% employment, Norwegian prompt, Olav Johansen / 1984-07-26 / dept Produksjon / start 2026-06-17 / 750000) used 5 calls: GET /division, POST /department, GET /occupationCode?nameNO=brukerstøtte&count=10, POST /employee, POST /employee/standardTime — all succeeded, 0 errors
  - first production encounter of STYRK 3512; no hardcoded mapping existed, so dynamic lookup was required
  - `nameNO=brukerstøtte` returned 2 results: BRUKERSTØTTE IKT (id 752, code 3120130), LEDER IT BRUKERSTØTTE (id 3261, code 3120121)
  - correctly picked BRUKERSTØTTE IKT (id 752) — the direct name match for STYRK-08 3512 "IKT-brukerstøttere"
  - `nameNO=IKT-brukerstøtte` returns 0 results; `code=3512` returns 0 results — no Tripletex 7-digit code contains "3512"
  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
  - POST /employee included nested employmentDetails with occupationCode { id: 752 }, percentageOfFullTimeEquivalent 100, annualSalary 750000, nationalIdentityNumber 26078495390, bankAccountNumber 23904557668
  - POST /employee/standardTime with hoursPerDay 7.5 (default) from startDate 2026-06-17
  - sandbox re-verification on 2026-03-21: POST /employee with occupationCode {id: 752} → 201, readback confirmed occupationCode.id=752, nameNO=BRUKERSTØTTE IKT, code=3120130, percentageOfFullTimeEquivalent=100, annualSalary=750000, employmentForm=PERMANENT, hoursPerDay=7.5
  - hardcoding STYRK 3512 → id 752 saves 1 call, reducing optimal flow from 5 to 4 calls for this contract shape
  - 15 total onboard-employee production runs; 13 of the last 14 used 3-5 calls with 0 errors
- production run on 2026-03-21 (seventeenth run, HR-rådgiver offer letter, Portuguese prompt, Catarina Oliveira / 1990-02-26 / dept Økonomi / start 2026-06-26 / 100% / 610000 / standard worktime 7.5h) used 4 calls: GET /division, POST /department, POST /employee, POST /employee/standardTime — all succeeded, 0 errors
  - 2nd HR-rådgiver production run; 1st to use hardcoded HR-rådgiver → id 4169 (PERSONALRÅDGIVER) mapping, saving 1 call vs 7th run (which used dynamic `nameNO=personalrådgiver` lookup with 5 calls)
  - GET /division returned results, division included in payload
  - POST /employee included nested employmentDetails with occupationCode { id: 4169 }, percentageOfFullTimeEquivalent 100, annualSalary 610000, employmentForm PERMANENT
  - POST /employee/standardTime with hoursPerDay 7.5 from startDate 2026-06-26
  - sandbox re-verification on 2026-03-21: id 4169 confirmed as PERSONALRÅDGIVER (code 2512149), `nameNO=HR-rådgiver` returns 0 results, `nameNO=personalrådgiver` returns exactly 1 result (id 4169)
  - confirms the minimum-call floor for the HR-rådgiver + standard-worktime shape: 4 calls (GET /division, POST /department, POST /employee, POST /employee/standardTime)
  - 17 total onboard-employee production runs; 15 of the last 16 used 3-5 calls with 0 errors
