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
- prompt may provide a STYRK occupation code (e.g., `4110`) — if present, resolve it via the occupation-code lookup described below
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
   - if the prompt includes a STYRK occupation code: `GET /employee/employment/occupationCode?nameNO=<occupation-name>&count=1&fields=id`
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
       - `occupationCode: { "id": <resolved-id> }` — include only when the prompt provides a STYRK code
3. if the prompt provides standard worktime hours per day: `POST /salary/settings/standardTime` with `{ "fromDate": <startDate>, "hoursPerDay": <prompt-hours> }`
4. stop after the successful writes

## STYRK Occupation Code Resolution
- Tripletex uses 7-digit occupation codes, not 4-digit STYRK group codes
- the `code` filter on `/employee/employment/occupationCode` is a substring-containing match, not a prefix match — searching `code=4110` returns unrelated codes containing "4110" anywhere, which is unreliable
- the reliable approach is to search by `nameNO` with the Norwegian name of the STYRK occupation group
- common STYRK-to-name mappings:
  - `4110` → `nameNO=kontormedarbeider` → KONTORMEDARBEIDER (id `2951`, code `4114105`)
- the occupation code id (`2951`) is reference data and is the same across sandbox and production accounts
- sandbox verification on 2026-03-21 confirmed: `GET /employee/employment/occupationCode?nameNO=kontormedarbeider&count=1&fields=id` returns `{ values: [{ id: 2951 }] }` and that this id persists correctly in nested `employmentDetails`
- for STYRK codes not yet mapped above, search `nameNO=<Norwegian-group-name>&count=1&fields=id` and use the first result

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

## Reuse From Read And Write Responses
- from `GET /division`:
  - one reusable `division.id` (if exists)
- from `POST /department`:
  - `department.id`
- from `GET /employee/employment/occupationCode`:
  - one reusable `occupationCode.id`
- from `POST /employee`:
  - employee id
  - employment id if later logic unexpectedly needs it
- from `POST /salary/settings/standardTime`:
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
- do not reuse the simple `create-employee` standard for this richer onboarding shape; that standard optimizes for employee-card creation, not a fully configured employment relationship
- do not spend `POST /employee/employment/details` as a separate default step here; nested `employmentDetails` in the employee create payload already persists
- do not search occupation codes by `code=<4-digit-STYRK>` — the `code` filter is a substring-containing match that returns wrong codes; always use `nameNO=<occupation-name>&count=1`
- do not pick the first result from a `code=4110` search — it will match codes like `3341103` (ADJUNKT) that contain "4110" as a substring, which is a completely different STYRK group
- the 2026-03-21 production run scored `0/0` correctness because it used the wrong occupation code (ADJUNKT instead of KONTORMEDARBEIDER) from an unreliable `code=4110` search and then timed out trying to fix it
- do not chase a speculative `2`-call shortcut through nested department creation; persistent sandbox returned `422 department.id: Feltet må fylles ut.`
- do not hardcode sandbox-only default state such as current `7.5` standard time into the production playbook

## OpenAPI / Sandbox Status
- `/division`, `/department`, `/employee`, `/employee/employment/occupationCode`, and `/salary/settings/standardTime` verified in `./openapi.json`
- persistent sandbox re-proof on 2026-03-21 confirmed the correct onboarding flow:
  - `GET /division?count=1&fields=id` → division id `108244566`
  - `GET /employee/employment/occupationCode?nameNO=kontormedarbeider&count=1&fields=id` → occupation code id `2951`
  - `POST /department` → department created
  - `POST /employee` with nested `employmentDetails` including `occupationCode: { id: 2951 }` → `201`, all employment details persisted
  - readback confirmed: `occupationCode.id=2951`, `percentageOfFullTimeEquivalent=80`, `annualSalary=530000`, `employmentForm=PERMANENT`
- persistent sandbox also confirmed that omitting `division` triggers `422 employments.division.id`
- production run on 2026-03-21 confirmed that fresh accounts can succeed without `division` (GET /division returned 0 rows, POST /employee succeeded without it)
