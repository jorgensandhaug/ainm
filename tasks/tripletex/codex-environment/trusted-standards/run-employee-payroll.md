# Run Employee Payroll

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- run payroll for one existing employee identified by email
- prompt gives one target month explicitly or implies the current run month
- prompt gives one base salary amount and optionally one one-off bonus or other manual salary line
- task is to create the payroll transaction, not to create or repair the employee

## Do Not Use This Standard If
- employee creation or employee-data repair is part of the requested task
- prompt requires deductions, reimbursements, travel-expense linkage, vacation-pay handling, or other payroll shapes beyond manual salary lines
- prompt explicitly depends on department allocation in the salary payload
- employee identity is ambiguous after exact local matching

## Standard Flow
1. `GET /employee?email=...&count=10&fields=*`
2. exact-match the email locally
3. if `dateOfBirth` is missing, stop and treat the run as blocked
4. if the employee read already proves an active employment covering the payroll period, reuse it; otherwise do one conditional `GET /employee/employment?employeeId=...&count=20&fields=*`
5. if there is still no active employment in the payroll period, or no decisive division-backed employment and the prompt gives no repair data, stop and treat the run as blocked
6. `GET /salary/type?count=1000&fields=*`
7. `POST /salary/transaction` with embedded `payslips[].specifications[]`
8. verify from the write response first
9. if the write response is too sparse, `GET /salary/transaction/{id}?fields=*`
10. if exact line-level proof is needed, `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))`; otherwise `GET /salary/payslip/{id}?fields=*` is enough for gross/net amount plus specification count

## Exact-Match Fast Path
- blocked path:
  - one decisive `GET /employee?email=...&count=10&fields=*`
  - if the exact employee match already shows missing `dateOfBirth`, stop immediately
- successful path:
  - usually `GET /employee`
  - conditionally `GET /employee/employment` only when the employee search response keeps the employments too sparse to judge the payroll period
  - `GET /salary/type?count=1000&fields=*`
  - `POST /salary/transaction`
- do not spend a salary-type lookup after the employee read already proves the run is blocked
- do not spend `GET /employee/employment/details` just because `employmentDetails[]` or `latestSalary` stay sparse; the trusted decisive check is active employment plus division-backed payroll setup

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

## Reuse From Read And Write Responses
- from `GET /employee`:
  - exact employee id
  - `dateOfBirth`
  - any already-expanded employment facts
- from the conditional `GET /employee/employment`:
  - active employment `startDate`/`endDate`
  - `division.id`
  - existence of payroll setup through returned `employmentDetails[]` and/or `latestSalary`
- from `GET /salary/type`:
  - `Fastlønn` id
  - `Bonus` id
- from `POST /salary/transaction`:
  - transaction id
  - any already-returned payslip ids or computed totals

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
- if `POST /salary/transaction` fails with `department: Selskapet har ikke aktivert avdelingsregnskap.`, remove `department` from the salary payload and retry once
- if the employee read or employment read proves missing payroll prerequisites and the prompt does not provide repair data, stop; do not invent `dateOfBirth`, employment setup, or business linkage

## Pitfalls To Avoid
- do not call `GET /salary/type` before confirming the employee is payroll-ready
- do not assume `GET /employee?fields=*` always expands employment dates or division data
- do not spend a speculative payroll write just to discover missing prerequisites
- do not include `department` blindly
- do not rely on `GET /salary/payslip/{id}?fields=*` alone for exact per-line verification

## OpenAPI / Sandbox Status
- `/employee`, `/employee/employment`, `/salary/type`, `/salary/transaction`, `/salary/transaction/{id}`, and `/salary/payslip/{id}` verified in `./openapi.json`
- production re-verified on 2026-03-20 for the exact `joao.santos@example.org` payroll prompt:
  - one decisive `GET /employee?email=joao.santos@example.org&count=10&fields=*` returned the exact employee match with `dateOfBirth=null`
  - that single read was sufficient to treat the run as blocked and avoid all later payroll calls
- persistent sandbox re-verified on 2026-03-20 for the successful path:
  - `GET /employee?count=1000&fields=*` returned employee `id=18564428` with `dateOfBirth=1990-01-01`, but its embedded employment on the employee object was too sparse to judge readiness
  - one conditional `GET /employee/employment?employeeId=18564428&count=20&fields=*` expanded `startDate=2026-03-01`, `division.id=108244568`, and existing payroll setup links
  - `GET /salary/type?count=1000&fields=*` resolved `Fastlønn id=69031179` and `Bonus id=69031348`
  - `POST /salary/transaction` for April 2026 with amounts `40350` and `5850` created `salaryTransaction.id=6956534`
  - `GET /salary/transaction/6956534?fields=*` returned `payslip.id=32627552`
  - `GET /salary/payslip/32627552?fields=*` proved `grossAmount=46200`, `amount=46200`, and `specifications.length=2`
  - `GET /salary/payslip/32627552?fields=*,specifications(*,salaryType(*))` proved the exact lines `Fastlønn amount=40350` and `Bonus amount=5850`
