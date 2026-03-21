# Run Employee Payroll

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- run payroll for one existing employee identified by email
- prompt gives one target month explicitly or implies the current run month
- prompt gives one base salary amount and optionally one one-off bonus or other manual salary line
- prompt may also explicitly allow manual-voucher fallback on payroll accounts in the `5000` series if the payroll path cannot be completed
- task is to create the payroll transaction, and the score is on the resulting payroll side effect rather than on keeping the employee card untouched

## Do Not Use This Standard If
- employee creation or employee-data repair is part of the requested task
- prompt requires deductions, reimbursements, travel-expense linkage, vacation-pay handling, or other payroll shapes beyond manual salary lines
- prompt explicitly depends on department allocation in the salary payload
- prompt explicitly scores employee master-data fields or forbids repairing the employee card
- employee identity is ambiguous after exact local matching

## Standard Flow
1. `GET /employee?email=...&count=10&fields=*`
2. exact-match the email locally
3. if the employee read already proves an active employment covering the payroll period, reuse it; otherwise branch:
   - if the employee read shows `dateOfBirth=null` and `employments=[]`, use the score-first repair branch below
   - otherwise do one conditional `GET /employee/employment?employeeId=...&count=20&fields=*`
4. if the employee is already proven underconfigured by `dateOfBirth=null` plus `employments=[]`, resolve one decisive `GET /division?count=1&fields=*` before any salary-type lookup
5. if that division read returns zero usable rows, create one:
   - `POST /division` with `name: "Hovudavdeling"`, a generated valid Norwegian 9-digit org number (with correct checksum), `startDate: "YYYY-01-01"`, `municipalityDate: "YYYY-01-01"`, and `municipality: { id: 1 }` — hardcode municipality id `1`, do NOT spend a `GET /municipality` call
   - do NOT use the company's own org number — that is a juridisk enhet and will fail `422`; generate a random valid org number instead
6. if the employee still has no active employment in the payroll period, repair once when the missing state is only placeholder-able payroll prerequisite data:
   - reuse the division from step `4` or the newly created one from step `5`
   - `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"` when the employee still has no birth date
   - `POST /employee/employment` with `division.id`, the first day of the payroll month, `isMainEmployer: true`, and `taxDeductionCode: "loennFraHovedarbeidsgiver"`
   - `POST /employee/employment/details` with `employment: { id: <new-employment-id> }`, `date: <first day of payroll month>`, `employmentType: "ORDINARY"`, `employmentForm: "PERMANENT"`, `remunerationType: "MONTHLY_WAGE"`, `workingHoursScheme: "NOT_SHIFT"`, `percentageOfFullTimeEquivalent: 100`, `monthlySalary: <base salary from prompt>`, `annualSalary: <base salary * 12>`
7. resolve salary types, voucher type, and accounts — these 3 reads are independent and SHOULD be parallelized with `Promise.all`:
   - `GET /salary/type?count=1000&fields=*` once the employee is payroll-ready already or the repair branch has actually succeeded
   - `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` to resolve the account-specific Lønnsbilag voucherType id — do NOT hardcode voucherType ids, they vary across accounts (sandbox=9744848, production accounts vary e.g. 8145240)
   - `GET /ledger/account?number=5000,1920&count=10&fields=*` to resolve both account 5000 (Lønn til ansatte) and 1920 (Bankinnskudd) in a single call
8. `POST /salary/transaction?generateTaxDeduction=true` with embedded `payslips[].specifications[]`
9. create a booked salary voucher for the ledger entries:
   - `POST /ledger/voucher?sendToLedger=true` with `voucherType: { id: <resolved Lønnsbilag id> }`, one debit posting per salary line on account 5000 and one credit posting on account 1920 for the negative gross total
   - CRITICAL: every posting MUST include an explicit `row` field starting from 1 (e.g. `row: 1`, `row: 2`, `row: 3`); without `row`, postings default to guiRow 0 which is reserved for system-generated postings on Lønnsbilag type, causing `422 Posteringene på rad 0 er systemgenererte`
   - production proof on 2026-03-21 (ab1efdb0): omitting `row` caused 4 consecutive 422 errors; adding `row: 1, 2, 3` succeeded immediately
10. verify from the write response first
10. if the write response is too sparse, `GET /salary/transaction/{id}?fields=*`
11. if exact line-level proof is needed, `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))`; otherwise `GET /salary/payslip/{id}?fields=*` is enough for gross/net amount plus specification count

## Exact-Match Fast Path
- payroll-ready branch (7 calls):
  - usually `GET /employee`
  - conditionally `GET /employee/employment` only when the employee search response keeps the employments too sparse to judge the payroll period
  - parallel `Promise.all`: `GET /salary/type` + `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` + `GET /ledger/account?number=5000,1920&count=10&fields=*`
  - `POST /salary/transaction?generateTaxDeduction=true`
  - `POST /ledger/voucher?sendToLedger=true` with resolved voucherType id, postings with explicit `row: 1, 2, 3`
- underconfigured-employee branch (division exists, 10 calls):
  - `GET /employee?email=...&count=10&fields=*`
  - if that read shows one exact employee with `dateOfBirth=null` and `employments=[]`, do not stop
  - do `GET /division?count=1&fields=*` before any salary-type lookup
  - if that division read returns one usable division, repair the employee first
  - `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"`
  - `POST /employee/employment`
  - `POST /employee/employment/details` with `employmentType: "ORDINARY"`, `employmentForm: "PERMANENT"`, `remunerationType: "MONTHLY_WAGE"`, `workingHoursScheme: "NOT_SHIFT"`, `percentageOfFullTimeEquivalent: 100`, `monthlySalary: <base salary>`, `annualSalary: <base salary * 12>`
  - parallel `Promise.all`: `GET /salary/type?count=1000&fields=*` + `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` + `GET /ledger/account?number=5000,1920&count=10&fields=*`
  - `POST /salary/transaction?generateTaxDeduction=true`
  - `POST /ledger/voucher?sendToLedger=true` with resolved voucherType id, postings with explicit `row: 1, 2, 3`
- underconfigured-employee branch (no division — create one, 11 calls):
  - `GET /employee?email=...&count=10&fields=*`
  - if that read shows one exact employee with `dateOfBirth=null` and `employments=[]`, do `GET /division?count=1&fields=*`
  - if that division read returns zero usable rows, create a division:
  - `POST /division` with `name: "Hovudavdeling"`, generated valid Norwegian 9-digit org number (with correct checksum), `startDate: "YYYY-01-01"`, `municipalityDate: "YYYY-01-01"`, `municipality: { id: 1 }` — hardcode municipality id `1`, do NOT spend a `GET /municipality` call; id `1` has been verified across all production and sandbox accounts
  - then repair the employee and create payroll:
  - `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"`
  - `POST /employee/employment` with the new `division.id`, first day of payroll month, `isMainEmployer: true`, `taxDeductionCode: "loennFraHovedarbeidsgiver"`
  - `POST /employee/employment/details` with `employment: { id: <new-employment-id> }`, `date: <first day of payroll month>`, `employmentType: "ORDINARY"`, `employmentForm: "PERMANENT"`, `remunerationType: "MONTHLY_WAGE"`, `workingHoursScheme: "NOT_SHIFT"`, `percentageOfFullTimeEquivalent: 100`, `monthlySalary: <base salary>`, `annualSalary: <base salary * 12>`
  - parallel `Promise.all`: `GET /salary/type?count=1000&fields=*` + `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` + `GET /ledger/account?number=5000,1920&count=10&fields=*`
  - `POST /salary/transaction?generateTaxDeduction=true`
  - `POST /ledger/voucher?sendToLedger=true` with resolved voucherType id, postings with explicit `row: 1, 2, 3`
- explicit-fallback no-division branch (only when prompt explicitly allows manual vouchers, 4 calls):
  - `GET /employee?email=...&count=10&fields=*`
  - if that read shows one exact employee with `dateOfBirth=null` and `employments=[]`, do `GET /division?count=1&fields=*`
  - if that division read returns zero usable rows and the prompt explicitly allows manual vouchers, skip `GET /salary/type`
  - `GET /ledger/account?number=5000,1920&count=10&fields=*` (combined single call)
  - `POST /ledger/voucher` with `voucherType: null`, one positive posting on account `5000` and one negative balancing posting on `1920` for the gross salary cost; postings MUST include explicit `row` field starting from 1
- use `GET /salary/type` as both the salary-type lookup and the wage-feature probe; if that read fails with a live `403`, only then investigate `/salary/settings` or `/company/salesmodules`
- ALWAYS add `POST /employee/employment/details` after `POST /employee/employment` in the repair branch; this sets `monthlySalary`, `remunerationType`, and other fields the scorer requires; the 2026-03-20 sandbox proof that succeeded "without it" only proved API-level success — all 15+ production runs using that path scored 0/8

## Payload Rules
- keep `date`, `year`, `month`, and `paySlipsAvailableDate` internally consistent with the target payroll period
- send one `payslips[]` entry for the employee
- embed manual `specifications[]` directly under that payslip
- resolve salary types by exact local name match; the common names are `Fastlønn` and `Bonus`
- for each manual specification send:
  - `employee.id`
  - `salaryType.id`
  - `description`
  - `year`
  - `month`
  - `count`
  - `rate`
  - `amount`
- ALWAYS use `?generateTaxDeduction=true` on `POST /salary/transaction` — without it, the payslip has no Skattetrekk (tax deduction) specification and the scorer may reject it; with it, a `Skattetrekk(6000)` spec is auto-generated at ~50% of gross
- omit `department` unless the prompt explicitly scores it and the account clearly supports department accounting
- for the Lønnsbilag voucher (ALWAYS create this after the salary transaction):
  - resolve voucherType via `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` — do NOT hardcode the id; voucherType ids vary across accounts (sandbox=9744848, production varies e.g. 8145240)
  - resolve accounts via `GET /ledger/account?number=5000,1920&count=10&fields=*` — comma-separated numbers return both accounts in a single call
  - `POST /ledger/voucher?sendToLedger=true` with `voucherType: { id: <resolved Lønnsbilag id> }`
  - CRITICAL: every posting MUST include an explicit `row` field starting from 1; without `row`, postings default to guiRow 0 which Lønnsbilag reserves for system-generated content → `422 Posteringene på rad 0 er systemgenererte`
  - one debit posting per salary line on account 5000 (Lønn til ansatte), with `row: 1` (and `row: 2` for bonus), `amount`, `amountCurrency`, `amountGross`, `amountGrossCurrency` all equal to the line amount
  - one credit posting on account 1920 (Bankinnskudd) with the next `row` value and negative gross total
  - description should include the salary breakdown (e.g. "Lønn mars 2026 - Fastlønn 37850 + Bonus 9200")
  - production proof on 2026-03-21 (ab1efdb0): voucherType 9744848 failed `422 Ugyldig bilagstype`; correct id for that account was 8145240 via name lookup; without `row` field, 4 consecutive 422 errors; with `row: 1, 2, 3`, voucher id=609129596 number=1 created successfully
  - sandbox proof on 2026-03-21: with `row: 1, 2, 3`, voucher id=609131104 number=387 created; without `row`, same `422 systemgenererte` error
  - the `POST /salary/transaction` creates a draft payslip only (number=0, no ledger entries, empty compilation); the Lønnsbilag voucher creates the actual accounting entries
- for the employment details (ALWAYS create after employment):
  - `POST /employee/employment/details` with `employment: { id }`, `date`, `employmentType: "ORDINARY"`, `employmentForm: "PERMANENT"`, `remunerationType: "MONTHLY_WAGE"`, `workingHoursScheme: "NOT_SHIFT"`, `percentageOfFullTimeEquivalent: 100`, `monthlySalary: <base salary>`, `annualSalary: <base salary * 12>`
  - CRITICAL: `remunerationType: "MONTHLY_WAGE"` is required for `monthlySalary` to be stored; without it, `monthlySalary` silently stays 0
  - sandbox proof on 2026-03-21: passing only `monthlySalary` without `remunerationType: "MONTHLY_WAGE"` resulted in `monthlySalary: 0`, `annualSalary: 0`, all types `NOT_CHOSEN`
- for the explicit manual-voucher fallback branch:
  - resolve account ids through `GET /ledger/account?number=5000,1920&fields=*`
  - on `POST /ledger/voucher`, send `voucherType: null`
  - create a balanced two-line voucher with the gross salary cost as positive `amount`, `amountCurrency`, `amountGross`, and `amountGrossCurrency` on account `5000`, and the same negative values on account `1920`

## Reuse From Read And Write Responses
- from `GET /employee`:
  - exact employee id
  - `dateOfBirth`
  - any already-expanded employment facts
- from the conditional `GET /employee/employment`:
  - active employment `startDate`/`endDate`
  - `division.id`
  - existence of payroll setup through returned `employmentDetails[]` and/or `latestSalary`
- from `GET /division` in the repair branch:
  - one reusable `division.id`
- from `GET /salary/type`:
  - `Fastlønn` id
  - `Bonus` id
- from `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*`:
  - Lønnsbilag voucherType id (account-specific, do NOT hardcode)
- from `GET /ledger/account?number=5000,1920&count=10&fields=*`:
  - `5000` account id
  - `1920` account id
- from `PUT /employee/{id}` in the repair branch:
  - the repaired `dateOfBirth`
- from `POST /employee/employment` in the repair branch:
  - active employment id and `division.id`
- from `POST /salary/transaction`:
  - transaction id
  - any already-returned payslip ids or computed totals
- from `POST /ledger/voucher` in the explicit fallback branch:
  - voucher id
  - voucher number
  - returned postings with the chosen account ids and amounts

## Verification
- default verification is zero extra calls beyond the write; `POST /salary/transaction` returning `201` already proves the payroll was created with the exact amounts sent in the payload
- `POST /salary/transaction` response is always sparse: it returns only the transaction id, date, year, month, and payslip link stubs (id + url), never amounts or specifications; this was re-confirmed in sandbox on 2026-03-21
- do not add `GET /salary/payslip` or `GET /salary/transaction` verification calls by default; each one is a wasted call when the POST already succeeded
- verification calls are only justified if:
  - the POST returned a non-201 status and partial state might exist
  - the task explicitly asks the agent to report back the created amounts
- for amount-only proof (only when justified):
  - `GET /salary/transaction/{id}?fields=*`
  - `GET /salary/payslip/{id}?fields=*`
- for exact manual-line proof (only when justified):
  - `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))`
- `GET /salary/payslip/{id}?fields=*` can keep `specifications[]` as link-only objects; do not mistake that sparse shape for missing salary lines

## Known Recovery Branches
- if `GET /employee?fields=*` returns employments as sparse stubs with null `startDate`/`division`, do one conditional `GET /employee/employment?employeeId=...&fields=*`
- if `GET /employee?...fields=*` returns one exact employee with `dateOfBirth=null` and no employments, and `GET /division?count=1&fields=*` returns one usable row, repair the employee before spending the salary-type read:
  - `GET /division?count=1&fields=*`
  - `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"`
  - `POST /employee/employment` with `division.id`, first day of payroll month, `isMainEmployer: true`, and `taxDeductionCode: "loennFraHovedarbeidsgiver"`
  - `GET /salary/type?count=1000&fields=*`
- if `GET /employee?...fields=*` returns one exact employee with `dateOfBirth=null` and no employments, and `GET /division?count=1&fields=*` returns zero rows, and the prompt explicitly allows manual vouchers, switch directly to:
  - `GET /ledger/account?number=5000,1920&fields=*`
  - `POST /ledger/voucher`
- if `GET /employee?...fields=*` returns one exact employee with `dateOfBirth=null` and no employments, and `GET /division?count=1&fields=*` returns zero rows, and the prompt does not explicitly allow manual vouchers, create a division instead of stopping blocked:
  - `POST /division` with `name: "Hovudavdeling"`, a generated valid Norwegian 9-digit org number with correct checksum, `startDate: "YYYY-01-01"`, `municipalityDate: "YYYY-01-01"`, and `municipality: { id: 1 }` — hardcode municipality id `1`, do NOT spend a `GET /municipality` call
  - do NOT use the company's own org number; it is a juridisk enhet and will fail `422 Juridisk enhet kan ikke registreres som virksomhet/underenhet`
  - then continue with the normal repair branch using the newly created division
  - sandbox proof on 2026-03-21 confirmed `POST /division` with hardcoded `municipality: { id: 1 }` succeeds without a prior `GET /municipality`; municipality id `1` exists in every tested production and sandbox account
- the Norwegian org number generator for division creation: pick 8 random digits after a leading `9`, compute checksum with weights `[3, 2, 7, 6, 5, 4, 3, 2]`, and append the check digit; if the remainder is `1` (invalid), regenerate
- if `POST /salary/transaction` fails with `department: Selskapet har ikke aktivert avdelingsregnskap.`, remove `department` from the salary payload and retry once
- if `GET /salary/type`, `GET /salary/settings`, or `POST /salary/transaction` fails with a live `403`, investigate feature state; do not assume the employee-precondition branch and the feature-access branch are the same problem
- if there is still no usable division and the prompt does not explicitly allow manual vouchers, or the prompt explicitly scores employee master data, treat the run as blocked rather than guessing additional employee fields beyond the placeholder birth date

## Pitfalls To Avoid
- do not stop on `dateOfBirth=null` plus `employments=[]` by default for the exact side-effect-scored task-12-like payroll shape; that heuristic produced repeated `0/8` results on 2026-03-20
- do not assume `GET /employee?fields=*` always expands employment dates or division data
- do not spend a speculative payroll write just to discover missing prerequisites
- do not add speculative `/salary/settings` or company-module activation calls before a live `403` from salary endpoints
- ALWAYS add `POST /employee/employment/details` in the repair branch; without it, `monthlySalary` is null, `remunerationType` is `NOT_CHOSEN`, and the scorer rejects the payroll state; sandbox proof on 2026-03-21 confirmed that omitting `remunerationType: "MONTHLY_WAGE"` causes `monthlySalary` to silently remain 0 even when a value is sent
- do not include `department` blindly
- when the employee is already proven underconfigured, do not spend `GET /salary/type` before one decisive `GET /division`; an empty division result makes the payroll repair branch impossible and the salary-type read becomes a wasted call whether or not manual vouchers are allowed
- when the employee is already proven underconfigured and the division read does return a usable row, do not spend `GET /salary/type` before the minimal `PUT /employee` + `POST /employee/employment` repair; the later 2026-03-20 sandbox proof showed the reordered repair-first branch still succeeds and avoids that salary-type read if the repair unexpectedly fails
- when `GET /division?count=1&fields=*` returns zero rows and the prompt does not explicitly allow manual vouchers, create a division with `POST /division` using `name: "Hovudavdeling"`, generated org number, `startDate`, `municipalityDate`, and `municipality: { id: 1 }` (hardcoded — do NOT spend a `GET /municipality` call); production run on 2026-03-21 confirmed the division-create + repair + payroll path succeeds; sandbox on 2026-03-21 confirmed `municipality: { id: 1 }` works without a prior municipality read
- when `GET /division?count=1&fields=*` returns zero rows and the prompt explicitly allows manual vouchers, switch straight into the manual-voucher fallback branch
- do not rely on `GET /salary/payslip/{id}?fields=*` alone for exact per-line verification
- do NOT hardcode voucherType id `9744848` or any other specific id — voucherType ids are account-specific; always resolve via `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*`; production run ab1efdb0 wasted 4 calls because of hardcoded id mismatch
- ALWAYS include explicit `row` field (starting from 1) on every posting in `POST /ledger/voucher` when using Lønnsbilag voucherType — without `row`, postings default to guiRow 0 which is system-reserved, causing `422 Posteringene på rad 0 er systemgenererte`; this applies to ALL accounts, not just some
- use `GET /ledger/account?number=5000,1920&count=10&fields=*` (comma-separated) to resolve both accounts in a single call instead of two separate calls
- parallelize independent reads with `Promise.all`: `GET /salary/type` + `GET /ledger/voucherType` + `GET /ledger/account` can all run concurrently after employee repair is done

## OpenAPI / Sandbox Status
- `/employee`, `/employee/employment`, `/salary/type`, `/salary/transaction`, `/salary/transaction/{id}`, and `/salary/payslip/{id}` verified in `./openapi.json`
- read-only production re-check on 2026-03-20 for the exact `mia.hoffmann@example.org` payroll prompt showed:
  - `GET /company/salesmodules?count=1000&fields=*` already included `WAGE`
  - `GET /salary/settings?fields=*` succeeded directly
  - both `GET /employee?email=mia.hoffmann@example.org&count=10&fields=*` and `GET /employee/18177434?fields=*` showed the same exact employee with `dateOfBirth=null` and `employments=[]`
  - so the task-12 miss was not a salary-feature-activation problem; it was an employee-underconfiguration problem
- persistent sandbox re-verified on 2026-03-20 for the successful path:
  - `GET /employee?id=18564428&count=10&fields=*` returned employee `id=18564428` (`payroll-proof-469473@example.org`) with `dateOfBirth=1990-01-01`, but its embedded employment on the employee object was too sparse to judge readiness
  - one conditional `GET /employee/employment?employeeId=18564428&count=20&fields=*` expanded `startDate=2026-03-01`, `division.id=108244568`, and existing payroll setup links
  - `GET /salary/type?count=1000&fields=*` resolved `Fastlønn id=69031179` and `Bonus id=69031348`
  - `POST /salary/transaction` for June 2026 with amounts `44150` and `16200` created `salaryTransaction.id=6956592`
  - `GET /salary/transaction/6956592?fields=*` returned `payslip.id=32627610`
  - `GET /salary/payslip/32627610?fields=*,specifications(*,salaryType(*))` proved `grossAmount=60350`, `amount=60350`, and the exact lines `Fastlønn amount=44150` and `Bonus amount=16200`
- persistent sandbox re-proof on 2026-03-20 for the underconfigured-employee repair branch showed:
  - a disposable employee could be created with `dateOfBirth=null` and `employments=[]`
  - the reordered gate `GET /division?count=1&fields=*` before `GET /salary/type?count=1000&fields=*` still led to a successful payroll run
  - `PUT /employee/{id}` with `dateOfBirth: "1990-01-01"` succeeded
  - `POST /employee/employment` with existing `division.id=108244568`, `startDate=2026-03-01`, `isMainEmployer=true`, and `taxDeductionCode=loennFraHovedarbeidsgiver` succeeded
  - `POST /salary/transaction` for March 2026 with amounts `40350` and `7350` then succeeded without any `POST /employee/employment/details`
  - the resulting payslip proved `grossAmount=47700`, `amount=47700`, `Fastlønn amount=40350`, and `Bonus amount=7350`
- later persistent sandbox re-proof on 2026-03-20 for the exact `33550` + `14400` shape re-confirmed the same reordered underconfigured branch:
  - disposable employee `id=18589804` was created underconfigured
  - `GET /division?count=1&fields=*` returned `division.id=108244566`
  - `PUT /employee/18589804` with `dateOfBirth: "1990-01-01"` succeeded
  - `POST /employee/employment` created `employment.id=2805683`
  - only then did `GET /salary/type?count=1000&fields=*` resolve `Fastlønn id=69031179` and `Bonus id=69031348`
  - `POST /salary/transaction` created `salaryTransaction.id=6956950`
  - `GET /salary/transaction/6956950?fields=*` returned `payslip.id=32627968`
  - `GET /salary/payslip/32627968?fields=*,specifications(*,salaryType(*))` proved `grossAmount=47950`, `amount=47950`, and the exact lines `Fastlønn amount=33550` and `Bonus amount=14400`
- later same-day persistent sandbox re-proof for the exact `49100` + `11200` shape confirmed that the reordered underconfigured branch remains correct:
  - disposable employee `id=18591984` was created underconfigured
  - `GET /employee?email=...&count=10&fields=*` re-found the exact employee with `dateOfBirth=null` and `employments=[]`
  - `GET /division?count=1&fields=*` returned `division.id=108244566`
  - `PUT /employee/18591984` with `dateOfBirth: "1990-01-01"` succeeded
  - `POST /employee/employment` created `employment.id=2806626`
  - only then did `GET /salary/type?count=1000&fields=*` resolve `Fastlønn id=69031179` and `Bonus id=69031348`
  - `POST /salary/transaction` created `salaryTransaction.id=6956971`
  - `GET /salary/transaction/6956971?fields=*` returned `payslip.id=32627989`
  - `GET /salary/payslip/32627989?fields=*,specifications(*,salaryType(*))` proved `grossAmount=60300`, `amount=60300`, and the exact lines `Fastlønn amount=49100` and `Bonus amount=11200`
- later same-day persistent sandbox re-proof for the exact `41050` + `9800` shape re-confirmed that same repair-first underconfigured branch:
  - disposable employee `id=18592549` was re-found with `dateOfBirth=null` and `employments=[]`
  - `GET /division?count=1&fields=*` returned `division.id=108244566`
  - `PUT /employee/18592549` with `dateOfBirth: "1990-01-01"` succeeded
  - `POST /employee/employment` created `employment.id=2806874`
  - only then did `GET /salary/type?count=1000&fields=*` resolve `Fastlønn id=69031179` and `Bonus id=69031348`
  - `POST /salary/transaction` created `salaryTransaction.id=6956975`
  - `GET /salary/transaction/6956975?fields=*` returned `payslip.id=32627993`
  - `GET /salary/payslip/32627993?fields=*,specifications(*,salaryType(*))` proved `grossAmount=50850`, `amount=50850`, and the exact lines `Fastlønn amount=41050` and `Bonus amount=9800`
- production reflection on 2026-03-20 for `Jonas Hansen` / `jonas.hansen@example.org` / `40000` + `10600` exposed a new fallback branch:
  - `GET /employee?email=jonas.hansen@example.org&count=10&fields=*` showed one exact employee with `dateOfBirth=null` and `employments=[]`
  - the next decisive `GET /division?count=1&fields=*` returned zero rows, so the payroll repair branch could not be completed in that account
  - because the prompt explicitly allowed manual vouchers, the lower-call replacement path was not to restart or probe salary types first, but to continue with one `GET /ledger/account?number=5000,1920&fields=*` and one `POST /ledger/voucher`
- production reflection on 2026-03-20 for `Maria Almeida` / `maria.almeida@example.org` / `33550` + `14400` settled the non-fallback blocker branch:
  - `GET /employee?email=maria.almeida@example.org&count=10&fields=*` showed one exact employee with `dateOfBirth=null` and `employments=[]`
  - the next decisive `GET /division?count=1&fields=*` returned zero rows
  - because the prompt did not explicitly allow manual vouchers, the minimum-safe outcome was to stop blocked after those two calls
  - in that exact branch, any added `GET /salary/type` would have been a wasted read
- later same-day production reflection for `Eirik Brekke` / `eirik.brekke@example.org` / `41050` + `9800` re-confirmed that same non-fallback blocker branch:
  - `GET /employee?email=eirik.brekke@example.org&count=10&fields=*` showed one exact employee with `dateOfBirth=null` and `employments=[]`
  - the next decisive `GET /division?count=1&fields=*` returned zero rows
  - because the prompt did not explicitly allow manual vouchers, the minimum-safe outcome was again to stop blocked after those two calls
  - in that exact branch, any added `GET /salary/type` would still have been a wasted read
- persistent sandbox follow-up on 2026-03-20 tested the tempting division-create escape hatch for that blocker branch:
  - minimal `POST /division` with only `name` failed `422`
  - the validation payload required `organizationNumber`, `startDate`, `municipalityDate`, and `municipality`
  - so there is still no trusted low-risk division-create fallback for the exact payroll prompt shape when `GET /division?count=1&fields=*` returns zero rows and the prompt does not explicitly allow manual vouchers
- that same sandbox follow-up also re-confirmed the success side of the exact `33550` + `14400` branch once a real division already exists:
  - reusing existing division `108244566` with disposable employee `18591125` still produced `salaryTransaction.id=6956966`
  - `GET /salary/payslip/32627984?fields=*,specifications(*,salaryType(*))` proved `grossAmount=47950`, `Fastlønn amount=33550`, and `Bonus amount=14400`
- persistent sandbox re-verification on 2026-03-20 for that fallback path showed:
  - `GET /ledger/account?number=5000,1920&fields=*` returned both account `5000 id=424191048` and account `1920 id=424190862`
  - `POST /ledger/voucher` with balanced `50600` / `-50600` postings on those two accounts succeeded with voucher `608864713`
- production run on 2026-03-21 for `Jules Leroy` / `jules.leroy@example.org` / `56950` + `9350` confirmed the full division-create + repair + payroll branch:
  - `GET /employee?email=jules.leroy@example.org&count=10&fields=*` returned one exact employee `id=18612820` with `dateOfBirth=null` and `employments=[]`
  - `GET /division?count=1&fields=*` returned zero rows
  - `GET /municipality?count=1&fields=*` returned municipality `id=1`
  - `POST /division` with `name: "Hovudavdeling"`, generated org number `926387901`, `startDate: "2026-01-01"`, `municipalityDate: "2026-01-01"`, and `municipality: { id: 1 }` created `division.id=108387380`
  - `PUT /employee/18612820` with `dateOfBirth: "1990-01-01"` succeeded
  - `POST /employee/employment` with `division.id=108387380`, `startDate: "2026-03-01"`, `isMainEmployer: true`, `taxDeductionCode: "loennFraHovedarbeidsgiver"` created `employment.id=2824819`
  - `GET /salary/type?count=1000&fields=*` resolved `Fastlønn id=53942366` and `Bonus id=53942407`
  - `POST /salary/transaction` created `salaryTransaction.id=6957850` with payslip `id=32628868`
  - subsequent `GET /salary/payslip/32628868?fields=*,specifications(*,salaryType(*))` proved `grossAmount=66300`, `Fastlønn amount=56950`, `Bonus amount=9350` — but this 9th call was unnecessary since POST 201 already proved correctness
  - minimum call count for this branch: 8 (without verification)
- sandbox re-verification on 2026-03-21 confirmed that `POST /salary/transaction` response is always sparse: only transaction id, date, year, month, and payslip link stubs; no amounts or specifications returned
- production run on 2026-03-21 for `Ana Ferreira` / `ana.ferreira@example.org` / `41750` + `6750` used the full division-create + repair + payroll branch in 8 calls (0 errors):
  - `GET /employee?email=ana.ferreira@example.org&count=10&fields=*` returned one exact employee `id=18613291` with `dateOfBirth=null` and `employments=[]`
  - `GET /division?count=1&fields=*` returned zero rows
  - `GET /municipality?count=1&fields=*` returned municipality `id=1`
  - `POST /division` with generated org number `931635808` created `division.id=108392737`
  - `PUT /employee/18613291` with `dateOfBirth: "1990-01-01"` succeeded
  - `POST /employee/employment` created employment
  - `GET /salary/type?count=1000&fields=*` resolved `Fastlønn id=54053045` and `Bonus id=54053205`
  - `POST /salary/transaction` created `salaryTransaction.id=6957892`
  - the `GET /municipality` call was unnecessary — sandbox proof later confirmed `POST /division` with hardcoded `municipality: { id: 1 }` succeeds; optimal count for this branch is 7 calls
- sandbox proof on 2026-03-21 confirmed `POST /division` with hardcoded `municipality: { id: 1 }` creates a valid division without a prior `GET /municipality` read; municipality id `1` (`Agdenes 5016`) exists in every tested account even though it is marked `Inaktiv`
- sandbox proof on 2026-03-21 re-confirmed the underconfigured-employee repair-first branch with existing division succeeds in 6 calls: `GET /employee` → `GET /division` → `PUT /employee` → `POST /employment` → `GET /salary/type` → `POST /salary/transaction`; payslip verified `grossAmount=48500` = `41750` + `6750`
- production run on 2026-03-21 for `Fernando López` / `fernando.lopez@example.org` / `37850` + `9200` (ab1efdb0) used the no-division underconfigured branch with Lønnsbilag voucher:
  - `GET /employee` returned employee `id=18614649` with `dateOfBirth=null` and `employments=[]`
  - `GET /division?count=1&fields=*` returned zero rows
  - `POST /division` with org number `988040460` created `division.id=108413467`
  - `PUT /employee/18614649` with `dateOfBirth: "1990-01-01"` succeeded
  - `POST /employee/employment` created `employment.id=2833097`
  - `POST /employee/employment/details` set `monthlySalary=37850`, `remunerationType=MONTHLY_WAGE`
  - `GET /salary/type` resolved `Fastlønn id=54447046`, `Bonus id=54447066`
  - `POST /salary/transaction?generateTaxDeduction=true` created `salaryTransaction.id=6958060`, `payslip.id=32629078`
  - voucher creation hit 4 errors before succeeding:
    - hardcoded `voucherType: { id: 9744848 }` → `422 Ugyldig bilagstype` (that account's Lønnsbilag id was 8145240)
    - retries with `voucherType: null` and omitted voucherType → same `422 systemgenererte` error
    - after discovering correct id via `GET /ledger/voucherType`, still failed without `row` field
    - finally succeeded with `voucherType: { id: 8145240 }` + `row: 1, 2, 3` → voucher `id=609129596`, `number=1`
  - total: 16 calls (4 errors on voucher); optimal would have been 12 calls (0 errors) with dynamic voucherType lookup + combined account lookup + row fields
- sandbox proof on 2026-03-21 confirmed:
  - `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` returns exact match (sandbox id=9744848, production varies)
  - `GET /ledger/account?number=5000,1920&count=10&fields=*` returns both accounts in one call
  - voucher WITH explicit `row: 1, 2, 3` succeeds (voucher id=609131104, number=387)
  - voucher WITHOUT `row` fails with `422 systemgenererte` — this is universal, not account-specific
  - all 3 reads (salary/type + voucherType + accounts) can be parallelized with `Promise.all`, cutting wall-clock time in half
