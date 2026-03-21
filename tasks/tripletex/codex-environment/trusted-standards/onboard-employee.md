# Onboard Employee

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- onboard one new employee from a prompt or attachment
- prompt provides employee identity fields such as name and birth date
- prompt provides one department name to attach
- prompt provides one employment start date
- prompt provides one employment percentage and one annual salary
- prompt provides one standard worktime in hours per day
- task is about employee master-data onboarding, not payroll transaction creation

## Do Not Use This Standard If
- task only asks to create a simple employee card with start date and no salary/worktime setup
- task requires occupation-code resolution from an explicit profession-code prompt
- task requires repairing or updating an existing employee instead of creating a new one
- prompt materially depends on payroll transactions, payslips, deductions, or leave flows

## Standard Flow
1. `GET /division?count=1&fields=*`
2. `POST /department` with the prompt department name
3. `POST /employee` with:
   - prompt identity fields
   - explicit `userType: "NO_ACCESS"`
   - `department.id` from step `2`
   - one nested `employment` row containing:
     - `startDate`
     - `division.id` from step `1`
     - one nested `employmentDetails` row containing:
       - `employmentType`
       - `employmentForm`
       - `remunerationType`
       - `workingHoursScheme`
       - `percentageOfFullTimeEquivalent`
       - `annualSalary`
4. `POST /salary/settings/standardTime` with `{ "fromDate": <startDate>, "hoursPerDay": <prompt-hours> }`
5. stop after the successful writes

## Payload Rules
- preserve prompt names exactly
- normalize dates to ISO `YYYY-MM-DD`
- use `employmentType: "ORDINARY"` for ordinary offer-letter employment unless the prompt clearly states a different employment type
- map permanent employment wording such as `Fast stilling` to `employmentForm: "PERMANENT"`
- use `remunerationType: "MONTHLY_WAGE"` when the prompt gives annual salary rather than hourly wage
- use `workingHoursScheme: "NOT_SHIFT"` for ordinary day-work prompts that only specify daily hours and do not describe shift work
- send `percentageOfFullTimeEquivalent` as the percentage value itself, e.g. `100`, not `1`
- do not try the speculative shortcut `department: { "name": ... }` inside `POST /employee`; the employee write requires `department.id`

## Reuse From Read And Write Responses
- from `GET /division`:
  - one reusable `division.id`
- from `POST /department`:
  - `department.id`
- from `POST /employee`:
  - employee id
  - employment id if later logic unexpectedly needs it
- from `POST /salary/settings/standardTime`:
  - created standard-time row if later logic unexpectedly needs it

## Verification
- zero extra verification calls in scored runs once all three writes succeed
- persistent sandbox verification on 2026-03-21 confirmed that the nested `employmentDetails` row is really persisted on the employment:
  - `GET /employee/employment?employeeId=...&fields=*` returned the created employment with a linked `employmentDetails[]`
  - `GET /employee/employment/details?employmentId=...&fields=*` returned the exact persisted `employmentType`, `employmentForm`, `remunerationType`, `workingHoursScheme`, `percentageOfFullTimeEquivalent`, and `annualSalary`
- do not spend a production `GET /employee/employment/details` just to prove the nested write; that would overpay calls once this exact standard already matches

## Known Recovery Branches
- if `GET /division?count=1&fields=*` returns zero usable rows, stop blocked for this exact task shape rather than guessing a new division create; sandbox validation on 2026-03-20 already showed minimal `POST /division` is not a safe repair branch
- if `POST /employee` fails only on `department.id`, the department create/write reuse is wrong; fix that specific payload rather than widening into extra discovery reads

## Pitfalls To Avoid
- do not reuse the simple `create-employee` standard for this richer onboarding shape; that standard optimizes for employee-card creation, not a fully configured employment relationship
- do not spend `POST /employee/employment/details` as a separate default step here
- the better use of that call budget is the up-front decisive `GET /division`, because omitting `division.id` can leave the onboarding employment relation incomplete even when the employee write itself succeeds
- do not assume the persistent sandbox's default `7.5` current standard time means the production account already matches; the task explicitly scores standard worktime, so keep the write unless same-run evidence already proves the exact value
- do not chase a speculative `2`-call shortcut through nested department creation; 2026-03-21 persistent sandbox re-proof returned `422 department.id: Feltet må fylles ut.`

## OpenAPI / Sandbox Status
- `/division`, `/department`, `/employee`, and `/salary/settings/standardTime` verified in `./openapi.json`
- persistent sandbox re-proof on 2026-03-21 confirmed the lower-call create branch for this exact onboarding shape:
  - `GET /division?count=1&fields=*`
  - `POST /department`
  - `POST /employee` with nested `employmentDetails`
  - `POST /salary/settings/standardTime`
- that same sandbox proof also confirmed:
  - `POST /employee` returned an employment id directly
  - nested `employmentDetails` persisted without a separate `POST /employee/employment/details`
  - speculative `POST /employee` with `department: { "name": ... }` failed `422 department.id`
- production scoring feedback on 2026-03-21 for the analogous offer-letter onboarding run was `11/14`, which strongly suggests that the omitted up-front `division.id` mattered more than the extra separate `POST /employee/employment/details`
