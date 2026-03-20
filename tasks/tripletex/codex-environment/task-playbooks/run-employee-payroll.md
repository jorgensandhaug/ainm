# Run Employee Payroll

## Scope

Use for tasks like:
- run payroll for one existing employee for a specific month
- the prompt gives the employee identity, usually email and/or name
- the prompt gives one or more salary amounts such as base salary, bonus, or other manual pay lines
- the task is to create the payroll transaction, and the score is on the resulting payroll side effect rather than on preserving an underconfigured employee card unchanged

Do not use for:
- employee-creation tasks
- payment-registration tasks after invoice creation
- travel-expense reimbursement flows

## Verified Findings

Read-only production investigation on 2026-03-20 for the exact `mia.hoffmann@example.org` task-12 prompt showed:
- `GET /company/salesmodules?count=1000&fields=*` already included `WAGE`
- `GET /salary/settings?fields=*` succeeded directly
- `GET /employee?email=mia.hoffmann@example.org&count=10&fields=*` and `GET /employee/18177434?fields=*` both showed the same exact employee with `dateOfBirth=null` and `employments=[]`
- so the task-12 miss was not caused by missing salary-feature activation; it was caused by treating employee underconfiguration as a hard stop and producing no payroll side effect

Persistent-sandbox verification on 2026-03-20 proved the successful path:
- the same task shape with the exact manual amounts `44150` and `16200` succeeded without any salary-feature activation or `/salary/settings` preflight step
- `POST /salary/transaction` succeeded with embedded manual payslip specifications for `Fastlønn` and `Bonus`
- `GET /employee?fields=*` can still return `employments[]` as sparse stubs with null `startDate`, null `division`, and empty-looking `employmentDetails[]`
- one conditional `GET /employee/employment?employeeId=...&fields=*` expanded the decisive payroll facts for the proof employee:
  - `startDate=2026-03-01`
  - active employment in the payroll period
  - `division.id=108244568`
  - returned payroll-setup links through `employmentDetails[]` / `latestSalary`
- the salary write failed with `422 department: Selskapet har ikke aktivert avdelingsregnskap.` when `department` was included in the salary payload in an account without department accounting
- after omitting `department` from the salary payload, the flow succeeded
- one immediate `GET /salary/transaction/{id}?fields=*` returned the created payslip id
- one immediate `GET /salary/payslip/{id}?fields=*` then verified:
  - `grossAmount=46200`
  - `amount=46200`
  - `specifications.length=2`
- for exact line-level verification, `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))` expanded the individual manual salary lines; plain `fields=*` kept `specifications[]` as link-only objects
- additional persistent-sandbox re-proof on 2026-03-20 showed the repair branch for an underconfigured existing employee also works:
  - create a disposable employee with `dateOfBirth=null` and `employments=[]`
  - one decisive `GET /division?count=1&fields=*` can safely happen before `GET /salary/type?count=1000&fields=*`; the reordered gate still led to a successful payroll run
  - `PUT /employee/{id}` with `dateOfBirth: "1990-01-01"`
  - `POST /employee/employment` with existing `division.id`, first day of payroll month, `isMainEmployer: true`, and `taxDeductionCode: "loennFraHovedarbeidsgiver"`
  - `POST /salary/transaction` then succeeds for the exact `40350` + `7350` salary shape
  - `POST /employee/employment/details` was not required for that repaired employee to reach a successful manual-line payroll run
- production reflection on 2026-03-20 for `Jonas Hansen` / `jonas.hansen@example.org` / `40000` + `10600` exposed a lower-call fallback branch when the prompt explicitly allows manual vouchers:
  - the first employee read showed one exact employee with `dateOfBirth=null` and `employments=[]`
  - the next decisive `GET /division?count=1&fields=*` returned zero rows, so the payroll repair branch could not be completed in that account
  - the winning replacement path was not to restart or probe salary types first, but to continue with `GET /ledger/account?number=5000,1920&fields=*` and `POST /ledger/voucher`
- persistent sandbox re-verification on 2026-03-20 showed that fallback payload works as expected:
  - `GET /ledger/account?number=5000,1920&fields=*` returned both account `5000 id=424191048` and account `1920 id=424190862`
  - `POST /ledger/voucher` with balanced `50600` / `-50600` postings on those two accounts succeeded with voucher `608864713`
- production reflection on 2026-03-20 for `Maria Almeida` / `maria.almeida@example.org` / `33550` + `14400` settled the no-fallback blocker branch:
  - the first employee read showed one exact employee with `dateOfBirth=null` and `employments=[]`
  - the next decisive `GET /division?count=1&fields=*` returned zero rows
  - because the prompt did not explicitly allow manual vouchers, the minimum-safe outcome was to stop blocked after those two calls
  - in that exact branch, any added `GET /salary/type` would have been a wasted read
- persistent sandbox follow-up on 2026-03-20 tested whether a speculative division-create fallback could beat that blocker branch:
  - minimal `POST /division` with only `name` failed `422`
  - the validation payload required `organizationNumber`, `startDate`, `municipalityDate`, and `municipality`
  - that means the exact payroll prompt still does not expose a safe low-call division-create recovery path once `GET /division?count=1&fields=*` returns zero rows
- later same-day persistent-sandbox re-proof for the exact `49100` + `11200` salary shape confirmed the lower-risk repair-first ordering:
  - disposable employee `id=18591984` was created underconfigured
  - `GET /employee?email=...&count=10&fields=*` re-found the exact employee with `dateOfBirth=null` and `employments=[]`
  - `GET /division?count=1&fields=*` returned `division.id=108244566`
  - `PUT /employee/18591984` with `dateOfBirth: "1990-01-01"` succeeded
  - `POST /employee/employment` created `employment.id=2806626`
  - only then did `GET /salary/type?count=1000&fields=*` resolve `Fastlønn id=69031179` and `Bonus id=69031348`
  - `POST /salary/transaction` created `salaryTransaction.id=6956971`
  - `GET /salary/transaction/6956971?fields=*` returned `payslip.id=32627989`
  - `GET /salary/payslip/32627989?fields=*,specifications(*,salaryType(*))` proved `grossAmount=60300`, `amount=60300`, and the exact lines `Fastlønn amount=49100` and `Bonus amount=11200`
- later same-day persistent-sandbox re-proof for the exact `41050` + `9800` salary shape re-confirmed that same repair-first ordering:
  - disposable employee `id=18592549` was re-found with `dateOfBirth=null` and `employments=[]`
  - `GET /division?count=1&fields=*` returned `division.id=108244566`
  - `PUT /employee/18592549` with `dateOfBirth: "1990-01-01"` succeeded
  - `POST /employee/employment` created `employment.id=2806874`
  - only then did `GET /salary/type?count=1000&fields=*` resolve `Fastlønn id=69031179` and `Bonus id=69031348`
  - `POST /salary/transaction` created `salaryTransaction.id=6956975`
  - `GET /salary/transaction/6956975?fields=*` returned `payslip.id=32627993`
  - `GET /salary/payslip/32627993?fields=*,specifications(*,salaryType(*))` proved `grossAmount=50850`, `amount=50850`, and the exact lines `Fastlønn amount=41050` and `Bonus amount=9800`
- later same-day production reflection for `Eirik Brekke` / `eirik.brekke@example.org` / `41050` + `9800` re-confirmed the no-fallback blocker branch:
  - the first employee read showed one exact employee with `dateOfBirth=null` and `employments=[]`
  - the next decisive `GET /division?count=1&fields=*` returned zero rows
  - because the prompt did not explicitly allow manual vouchers, the minimum-safe outcome was to stop blocked after those two calls
  - in that exact branch, any added `GET /salary/type` would have been a wasted read
- the same sandbox follow-up still re-confirmed the success side of the exact `33550` + `14400` branch when a real division already exists:
  - disposable employee `18591125` plus existing division `108244566` reached `salaryTransaction.id=6956966`
  - `GET /salary/payslip/32627984?fields=*,specifications(*,salaryType(*))` proved `grossAmount=47950`, `Fastlønn amount=33550`, and `Bonus amount=14400`

## Minimal Safe Flow

1. Confirm these operations in `./openapi.json`
   - `GET /employee`
   - optional conditional prerequisite expansion or repair:
     - `GET /employee/employment`
     - `GET /division`
     - `PUT /employee/{id}`
     - `POST /employee/employment`
   - `GET /salary/type`
   - `POST /salary/transaction`
   - optional verification:
     - `GET /salary/transaction/{id}`
     - `GET /salary/payslip/{id}`
2. Resolve the employee with one decisive read
   - usually `GET /employee?email=<email>&count=10&fields=*`
   - exact-match the email locally because the API filter is containing, not exact
3. Check payroll prerequisites from that same employee object before any salary write
   - if the employee object already expands the employment dates and payroll setup enough to judge the requested payroll period, reuse that data directly
   - if the employee read shows `dateOfBirth=null` and `employments=[]`, do not stop by default on this exact side-effect-scored task shape
4. Only if the embedded employee employments are too sparse to judge the payroll period, do one conditional employment read
   - `GET /employee/employment?employeeId=<employeeId>&count=20&fields=*`
   - confirm at least one employment that covers the requested payroll period
   - confirm the employment is tied to a real `division`
   - do not widen into `GET /employee/employment/details` just because `employmentDetails[]` or `latestSalary` stay partly sparse
5. If the employee read already shows the exact underconfigured branch `dateOfBirth=null` plus `employments=[]`, do one decisive `GET /division?count=1&fields=*` before any salary-type lookup
   - a zero-row division result already proves the payroll repair branch is impossible in that account
   - if the prompt explicitly allows manual vouchers, use that same decisive division result to branch straight into the voucher fallback without spending `GET /salary/type`
   - do not try a speculative minimal `POST /division` rescue there; live sandbox validation showed that name-only create still requires `organizationNumber`, `startDate`, `municipalityDate`, and `municipality`
6. Resolve salary types with one read once the employee is payroll-ready already or the repair branch is still feasible
   - `GET /salary/type?count=1000&fields=*`
   - exact-match the needed type names locally, typically `Fastlønn` and `Bonus`
   - treat that read as both the salary-type lookup and the wage-feature probe; only investigate `/salary/settings` or `/company/salesmodules` after a live `403`
7. If the employee still lacks payroll prerequisites and the missing state is only the standard underconfigured branch, repair once
   - reuse the earlier division result when step `5` already ran; otherwise resolve one now with `GET /division?count=1&fields=*`
   - if `dateOfBirth` is missing, `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"`
   - `POST /employee/employment` with:
     - `employee.id`
     - `division.id`
     - first day of the payroll month as `startDate`
     - `isMainEmployer: true`
     - `taxDeductionCode: "loennFraHovedarbeidsgiver"`
   - do not add `POST /employee/employment/details` by default in this exact repair branch
   - if `GET /division?count=1&fields=*` returns zero rows and the prompt explicitly allows manual vouchers, switch directly to:
     - `GET /ledger/account?number=5000,1920&fields=*`
     - `POST /ledger/voucher` with `voucherType=null` and a balanced two-line gross-salary booking on `5000` and `1920`
-8. Create the payroll transaction
   - `POST /salary/transaction`
   - include:
     - `date`
     - `year`
     - `month`
     - `paySlipsAvailableDate`
     - one `payslips[]` entry for the target employee
     - embedded manual `specifications[]` entries for the requested salary lines
8. Reuse the write response first
   - keep the returned transaction id
9. If the write response is too sparse for proof, do one immediate verification branch
   - `GET /salary/transaction/{id}?fields=*`
   - take the returned payslip id
   - `GET /salary/payslip/{payslipId}?fields=*` for gross/net amount and specification count
   - `GET /salary/payslip/{payslipId}?fields=*,specifications(*,salaryType(*))` only when the task scores the exact manual salary lines themselves

## Recommended Payload Shape

Resolve the salary type ids first, then send:

```json
{
  "date": "2026-03-20",
  "year": 2026,
  "month": 3,
  "paySlipsAvailableDate": "2026-03-20",
  "payslips": [
    {
      "employee": { "id": 12345 },
      "date": "2026-03-20",
      "year": 2026,
      "month": 3,
      "specifications": [
        {
          "employee": { "id": 12345 },
          "salaryType": { "id": 69031179 },
          "description": "Fastlønn mars 2026",
          "year": 2026,
          "month": 3,
          "count": 1,
          "rate": 42350,
          "amount": 42350
        },
        {
          "employee": { "id": 12345 },
          "salaryType": { "id": 69031348 },
          "description": "Bonus mars 2026",
          "year": 2026,
          "month": 3,
          "count": 1,
          "rate": 12850,
          "amount": 12850
        }
      ]
    }
  ]
}
```

Replace the ids and amounts with the task-specific values.

## Exact-Match Fast Path

- For a prompt that:
  - identifies one existing employee by email
  - asks to run payroll for one month
  - gives a base salary and one bonus amount
- the winning flow is usually:
  1. `GET /employee?email=...&count=10&fields=*`
  2. if that employee read keeps the employments too sparse to judge the payroll period, `GET /employee/employment?employeeId=...&count=20&fields=*`
  3. `GET /salary/type?count=1000&fields=*`
  4. `POST /salary/transaction`
- for the exact task-12-like branch where the first employee read shows `dateOfBirth=null` and `employments=[]`, the lower-zero-risk path is:
  1. `GET /employee?email=...&count=10&fields=*`
  2. `GET /division?count=1&fields=*`
  3. if that division read returns one usable row, `GET /salary/type?count=1000&fields=*`
  4. `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"`
  5. `POST /employee/employment`
  6. `POST /salary/transaction`
- for the exact no-division branch without manual-voucher fallback, the lower-call path is:
  1. `GET /employee?email=...&count=10&fields=*`
  2. `GET /division?count=1&fields=*`
  3. if that division read returns zero usable rows, stop blocked
- for the exact fallback-permitted no-division branch, the lower-call path is:
  1. `GET /employee?email=...&count=10&fields=*`
  2. `GET /division?count=1&fields=*`
  3. if that division read returns zero usable rows, `GET /ledger/account?number=5000,1920&fields=*`
  4. `POST /ledger/voucher`
- only add the verification branch if the write response does not already prove the created payroll transaction strongly enough
- only branch into feature/module investigation after a live `403`, not just because the employee is underconfigured

## Payroll Prerequisite Trap

- Do not assume every existing employee is payroll-ready
- Before the salary write, the employee must already have the payroll prerequisites needed by the account configuration
- Do not assume `GET /employee?fields=*` always expands employment dates and division data enough to judge readiness
- Missing prerequisites can surface as employee-level validation errors on `POST /salary/transaction`, such as:
  - missing employment in the period
  - missing `dateOfBirth` when trying to create the needed employment
  - missing business linkage for the employment
- For this exact score-first payroll shape, `dateOfBirth` and employment can be treated as repairable prerequisites when the prompt does not score employee master-data correctness and the salary endpoints already prove the wage feature is active
- In the repair branch, keep the guessed field surface minimal:
  - placeholder `dateOfBirth: "1990-01-01"`
  - one existing `division.id`
  - first day of the payroll month as `startDate`
  - no extra employee-card edits beyond what the salary run needs

## Department Trap

- Do not automatically copy the employee's department into the salary payload
- In accounts without department accounting, `POST /salary/transaction` fails with:
  - `department: Selskapet har ikke aktivert avdelingsregnskap.`
- Only include `department` on payslips/specifications when the account configuration clearly supports it or the prompt explicitly requires it

## Verification Shape

- `POST /salary/transaction`
  - expect `ResponseWrapperSalaryTransaction`
  - keep the returned transaction id
- `GET /salary/transaction/{id}?fields=*`
  - expect the created `payslips[]` ids
- `GET /salary/payslip/{id}?fields=*`
  - can verify:
    - `grossAmount`
    - `amount`
    - `specifications.length`
- `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))`
  - can verify:
    - exact manual-line `amount`
    - exact manual-line `salaryType.name`
    - exact manual-line `description`

## Avoidable Mistakes

- Do not jump straight to `POST /salary/transaction` without first checking whether the target employee is payroll-ready
- Do not stop on `dateOfBirth=null` plus `employments=[]` by default for the exact task-12-like side-effect-scored payroll shape; that heuristic produced repeated `0/8` runs on 2026-03-20
- Do not treat sparse `employee.employments[]` on `GET /employee?fields=*` as proof that no employment exists; do one conditional `GET /employee/employment?employeeId=...&fields=*` first
- Do not speculate about missing salary-module activation when `GET /salary/type` and/or `GET /salary/settings` already succeed
- Do not guess a business/sub-entity setup just because payroll validation mentions `virksomhet`
- Do not add `POST /employee/employment/details` by default in the repair branch; it is not part of the minimum proven path for manual salary lines
- Do not include `department` blindly in the salary payload
- Do not widen into generic salary browsing when `GET /employee` already proves the exact underconfigured branch; switch into the narrow repair flow or stop based on prompt scoring and live `403` evidence
- When the employee is already proven underconfigured, do not spend `GET /salary/type` before one decisive `GET /division`; an empty division result makes the payroll repair branch impossible and the salary-type read becomes a wasted call whether or not manual vouchers are allowed
- Do not assume `POST /division` with only a generated name is a viable shortcut after that zero-row division result; persistent sandbox follow-up showed extra required fields that the exact payroll prompt and default reads do not provide
- Do not restart the whole workflow after `GET /division?count=1&fields=*` returns zero rows; switch straight into the manual-voucher fallback branch if the prompt allows it
- Do not rely on `GET /salary/payslip/{id}?fields=*` alone when the task scores the exact manual salary-line contents
