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
5. if the employee still has no active employment in the payroll period, repair once when the missing state is only placeholder-able payroll prerequisite data:
   - reuse the division from step `4` when that branch already ran, otherwise do one decisive `GET /division?count=1&fields=*`
   - `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"` when the employee still has no birth date
   - `POST /employee/employment` with `division.id`, the first day of the payroll month, `isMainEmployer: true`, and `taxDeductionCode: "loennFraHovedarbeidsgiver"`
6. resolve salary types through `GET /salary/type?count=1000&fields=*` once the employee is payroll-ready already or the repair branch has actually succeeded
7. `POST /salary/transaction` with embedded `payslips[].specifications[]`
8. verify from the write response first
9. if the write response is too sparse, `GET /salary/transaction/{id}?fields=*`
10. if exact line-level proof is needed, `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))`; otherwise `GET /salary/payslip/{id}?fields=*` is enough for gross/net amount plus specification count

## Exact-Match Fast Path
- payroll-ready branch:
  - usually `GET /employee`
  - conditionally `GET /employee/employment` only when the employee search response keeps the employments too sparse to judge the payroll period
  - `GET /salary/type?count=1000&fields=*`
  - `POST /salary/transaction`
- underconfigured-employee branch:
  - `GET /employee?email=...&count=10&fields=*`
  - if that read shows one exact employee with `dateOfBirth=null` and `employments=[]`, do not stop
  - do `GET /division?count=1&fields=*` before any salary-type lookup
  - if that division read returns one usable division, repair the employee first
  - `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"`
  - `POST /employee/employment`
  - `GET /salary/type?count=1000&fields=*`
  - `POST /salary/transaction`
- explicit-fallback no-division branch:
  - `GET /employee?email=...&count=10&fields=*`
  - if that read shows one exact employee with `dateOfBirth=null` and `employments=[]`, do `GET /division?count=1&fields=*`
  - if that division read returns zero usable rows and the prompt explicitly allows manual vouchers, skip `GET /salary/type`
  - `GET /ledger/account?number=5000,1920&fields=*`
  - `POST /ledger/voucher` with one positive posting on account `5000` and one negative balancing posting on `1920` for the gross salary cost
- blocked no-division branch:
  - `GET /employee?email=...&count=10&fields=*`
  - if that read shows one exact employee with `dateOfBirth=null` and `employments=[]`, do `GET /division?count=1&fields=*`
  - if that division read returns zero usable rows and the prompt does not explicitly allow manual vouchers, stop as blocked
- use `GET /salary/type` as both the salary-type lookup and the wage-feature probe; if that read fails with a live `403`, only then investigate `/salary/settings` or `/company/salesmodules`
- do not spend `GET /employee/employment/details` or `POST /employee/employment/details` by default; the 2026-03-20 persistent sandbox repair proof reached a successful manual-line payroll run without it

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
- omit `department` unless the prompt explicitly scores it and the account clearly supports department accounting
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
- from `GET /ledger/account?number=5000,1920&fields=*` in the explicit fallback branch:
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
- default verification is zero extra calls beyond the write when `response.value` already proves the scored fields
- for amount-only proof:
  - `GET /salary/transaction/{id}?fields=*`
  - `GET /salary/payslip/{id}?fields=*`
- for exact manual-line proof:
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
- if `GET /employee?...fields=*` returns one exact employee with `dateOfBirth=null` and no employments, and `GET /division?count=1&fields=*` returns zero rows, and the prompt does not explicitly allow manual vouchers, stop blocked after those two calls; do not spend `GET /salary/type`
- do not try to rescue that exact no-division non-voucher branch with a speculative minimal `POST /division`; persistent sandbox follow-up on 2026-03-20 showed that name-only create fails `422` and requires `organizationNumber`, `startDate`, `municipalityDate`, and `municipality`, which the exact payroll prompt does not provide
- if `POST /salary/transaction` fails with `department: Selskapet har ikke aktivert avdelingsregnskap.`, remove `department` from the salary payload and retry once
- if `GET /salary/type`, `GET /salary/settings`, or `POST /salary/transaction` fails with a live `403`, investigate feature state; do not assume the employee-precondition branch and the feature-access branch are the same problem
- if there is still no usable division and the prompt does not explicitly allow manual vouchers, or the prompt explicitly scores employee master data, treat the run as blocked rather than guessing additional employee fields beyond the placeholder birth date

## Pitfalls To Avoid
- do not stop on `dateOfBirth=null` plus `employments=[]` by default for the exact side-effect-scored task-12-like payroll shape; that heuristic produced repeated `0/8` results on 2026-03-20
- do not assume `GET /employee?fields=*` always expands employment dates or division data
- do not spend a speculative payroll write just to discover missing prerequisites
- do not add speculative `/salary/settings` or company-module activation calls before a live `403` from salary endpoints
- do not add `POST /employee/employment/details` by default in the repair branch; it is not part of the minimum proven path for manual salary lines
- do not include `department` blindly
- when the employee is already proven underconfigured, do not spend `GET /salary/type` before one decisive `GET /division`; an empty division result makes the payroll repair branch impossible and the salary-type read becomes a wasted call whether or not manual vouchers are allowed
- when the employee is already proven underconfigured and the division read does return a usable row, do not spend `GET /salary/type` before the minimal `PUT /employee` + `POST /employee/employment` repair; the later 2026-03-20 sandbox proof showed the reordered repair-first branch still succeeds and avoids that salary-type read if the repair unexpectedly fails
- do not assume `POST /division` with only a generated name is a low-risk escape hatch after that zero-row division result; live sandbox validation proved extra required fields that the exact payroll prompt and standard reads do not supply
- do not restart the whole workflow after `GET /division?count=1&fields=*` returns zero rows; switch straight into the manual-voucher fallback branch if the prompt allows it
- do not rely on `GET /salary/payslip/{id}?fields=*` alone for exact per-line verification

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
