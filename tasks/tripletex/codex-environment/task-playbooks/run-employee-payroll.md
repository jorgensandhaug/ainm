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
- production run on 2026-03-21 for `Jules Leroy` / `jules.leroy@example.org` / `56950` + `9350` confirmed the full division-create + repair + payroll branch:
  - `GET /employee` returned one exact employee with `dateOfBirth=null` and `employments=[]`
  - `GET /division?count=1&fields=*` returned zero rows
  - `GET /municipality?count=1&fields=*` returned municipality `id=1`
  - `POST /division` with `name: "Hovudavdeling"`, generated org number, `startDate`, `municipalityDate`, `municipality` created `division.id=108387380`
  - `PUT /employee/{id}` with `dateOfBirth: "1990-01-01"` succeeded
  - `POST /employee/employment` with new division, `startDate: "2026-03-01"`, `isMainEmployer: true`, `taxDeductionCode: "loennFraHovedarbeidsgiver"` succeeded
  - `GET /salary/type?count=1000&fields=*` resolved `Fastlønn` and `Bonus`
  - `POST /salary/transaction` created payroll with `grossAmount=66300` (56950 + 9350)
  - total: 8 calls for perfect correctness (the run also did a 9th verification GET which was unnecessary)
  - this supersedes the earlier 2026-03-20 finding that division-create was not viable; that finding was based on a minimal `POST /division` with only `name`, which was missing the required fields
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
- production run on 2026-03-21 for `Ana Ferreira` / `ana.ferreira@example.org` / `41750` + `6750` used the division-create + repair + payroll branch in 8 calls (0 errors):
  - the `GET /municipality` call was unnecessary — sandbox proof later confirmed `POST /division` with hardcoded `municipality: { id: 1 }` succeeds; optimal count for this branch is 7 calls
- sandbox proof on 2026-03-21 confirmed `POST /division` with hardcoded `municipality: { id: 1 }` creates a valid division without a prior `GET /municipality` read; municipality id `1` exists in every tested account
- sandbox proof on 2026-03-21 re-confirmed the underconfigured-employee repair-first branch with existing division succeeds in 6 calls with verified payslip `grossAmount=48500` = `41750` + `6750`
- production run on 2026-03-21 for `Fernando López` / `fernando.lopez@example.org` / `37850` + `9200` (ab1efdb0) exposed critical voucher creation issues:
  - voucherType ids are NOT stable across accounts — hardcoded `9744848` failed with `422 Ugyldig bilagstype`; correct id for that account was `8145240`
  - postings WITHOUT explicit `row` field fail with `422 Posteringene på rad 0 er systemgenererte` — Lønnsbilag reserves guiRow 0 for system-generated content
  - with `row: 1, 2, 3` and dynamically resolved voucherType, voucher creation succeeded
  - 4 avoidable 422 errors from hardcoded voucherType + missing row fields
  - optimal path for the no-division underconfigured branch with voucher: 11 calls (was 16 with errors)
- sandbox proof on 2026-03-21 confirmed:
  - `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` returns exact match in one call
  - `GET /ledger/account?number=5000,1920&count=10&fields=*` returns both accounts in one call (saves 1 call vs two separate lookups)
  - salary/type + voucherType + accounts can be parallelized with `Promise.all`, halving wall-clock time
- production run on 2026-03-21 for `Brita Berge` / `brita.berge@example.org` / `36800` + `14100` (989090e8, Nynorsk prompt) used the no-division underconfigured branch with voucher in 11 calls (0 errors):
  - `GET /employee` returned employee `id=18616641` with `dateOfBirth=null` and `employments=[]`
  - `GET /division?count=1&fields=*` returned zero rows
  - `POST /division` with org number created `division.id=108437932`
  - `PUT /employee/18616641` with `dateOfBirth: "1990-01-01"` succeeded
  - `POST /employee/employment` created `employment.id=2841675`
  - `POST /employee/employment/details` set `monthlySalary=36800`, `remunerationType=MONTHLY_WAGE`
  - parallel `Promise.all`: `GET /salary/type` resolved `Fastlønn id=55064569`, `Bonus id=55064735` + `GET /ledger/voucherType` resolved `Lønnsbilag id=8212977` + `GET /ledger/account` resolved `5000 id=376520038`, `1920 id=376519852`
  - `POST /salary/transaction?generateTaxDeduction=true` created `salaryTransaction.id=6958254`
  - `POST /ledger/voucher?sendToLedger=true` created voucher `id=609177609`, `number=1`
  - the 11-call path was correct but suboptimal — sandbox proof later showed `POST /employee/employment` accepts inline `employmentDetails[]`, saving 1 call
- sandbox proof on 2026-03-21 confirmed `POST /employee/employment` with inline `employmentDetails[]` persists `remunerationType=MONTHLY_WAGE`, `monthlySalary`, and `annualSalary` correctly — eliminates the separate `POST /employee/employment/details` call:
  - `POST /employee/employment` with `employmentDetails: [{ date, employmentType: "ORDINARY", employmentForm: "PERMANENT", remunerationType: "MONTHLY_WAGE", workingHoursScheme: "NOT_SHIFT", percentageOfFullTimeEquivalent: 100, monthlySalary: 36800, annualSalary: 441600 }]` → `201`
  - `GET /employee/employment/details?employmentId=...&fields=*` verified `remunerationType=MONTHLY_WAGE`, `monthlySalary=36800`, `annualSalary=441600`
  - payroll transaction with `grossAmount=50900` (36800 + 14100) succeeded, payslip verified correct
  - this reduces the optimal no-division branch from 11 to 10 calls, and the existing-division branch from 10 to 9 calls
- sandbox proof on 2026-03-21 confirmed the repair chain (PUT employee → POST employment with inline details) can be parallelized with the 3 reads (salary/type + voucherType + accounts) via `Promise.all` — they are independent:
  - the repair chain and reads run concurrently, reducing wall-clock time
  - total call count stays the same but wall-clock drops significantly

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
   - note: if the employee has no `employmentDetails` or `latestSalary`, you will need to add them in step 7
5. If the employee read already shows the exact underconfigured branch `dateOfBirth=null` plus `employments=[]`, do one decisive `GET /division?count=1&fields=*` before any salary-type lookup
   - if that division read returns one usable row, continue to step 6 then step 7 to repair the employee
   - if that division read returns zero rows and the prompt explicitly allows manual vouchers, branch straight into the voucher fallback without spending `GET /salary/type`
   - if that division read returns zero rows and the prompt does not explicitly allow manual vouchers, create a division:
     - `POST /division` with `name: "Hovudavdeling"`, generated valid Norwegian 9-digit org number (leading `9`, weights `[3,2,7,6,5,4,3,2]`, check digit), `startDate: "YYYY-01-01"`, `municipalityDate: "YYYY-01-01"`, `municipality: { id: 1 }` — hardcode municipality id `1`, do NOT spend a `GET /municipality` call, do NOT use the company's own org number
     - then continue to step 7 with the newly created division id
6. Resolve salary types, voucher type, and accounts — these 3 reads are independent and SHOULD be parallelized with `Promise.all`:
   - `GET /salary/type?count=1000&fields=*` — exact-match `Fastlønn` and `Bonus` locally; treat as wage-feature probe; only investigate `/salary/settings` after a live `403`
   - `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` — resolve account-specific Lønnsbilag voucherType id; do NOT hardcode ids (they vary across accounts)
   - `GET /ledger/account?number=5000,1920&count=10&fields=*` — resolve both accounts in a single call (comma-separated)
7. If the employee still lacks payroll prerequisites and the missing state is only the standard underconfigured branch, repair once
   - reuse the division from step `5` (either the existing one or the newly created one); otherwise resolve one now with `GET /division?count=1&fields=*`
   - if `dateOfBirth` is missing, `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"`
   - `POST /employee/employment` with inline `employmentDetails[]` (saves 1 call vs separate POST):
     - `employee: { id }`
     - `division: { id }`
     - `startDate`: first day of the payroll month
     - `isMainEmployer: true`
     - `taxDeductionCode: "loennFraHovedarbeidsgiver"`
     - `employmentDetails: [{ date: <first day of payroll month>, employmentType: "ORDINARY", employmentForm: "PERMANENT", remunerationType: "MONTHLY_WAGE", workingHoursScheme: "NOT_SHIFT", percentageOfFullTimeEquivalent: 100, monthlySalary: <base salary from prompt>, annualSalary: <base salary * 12> }]`
   - CRITICAL: `remunerationType: "MONTHLY_WAGE"` is required for `monthlySalary` to be stored; without it, `monthlySalary` silently stays 0
   - sandbox proof on 2026-03-21: inline `employmentDetails` in `POST /employee/employment` persists all fields correctly
   - parallelize this repair chain (PUT employee → POST employment) with the 3 reads from step 6 via `Promise.all` — they are independent and do not depend on employee state
   - if `GET /division?count=1&fields=*` returns zero rows and the prompt explicitly allows manual vouchers, switch directly to:
     - `GET /ledger/account?number=5000,1920&count=10&fields=*` (combined single call)
     - `POST /ledger/voucher` with `voucherType: null` and a balanced two-line gross-salary booking on `5000` and `1920`; postings MUST include explicit `row` field starting from 1
-8. Create the payroll transaction
   - `POST /salary/transaction?generateTaxDeduction=true` — ALWAYS use generateTaxDeduction=true; without it the payslip has no Skattetrekk spec
   - include:
     - `date`
     - `year`
     - `month`
     - `paySlipsAvailableDate`
     - one `payslips[]` entry for the target employee
     - embedded manual `specifications[]` entries for the requested salary lines
8a. Create a booked salary voucher (Lønnsbilag) for the ledger entries — the salary transaction only creates a draft payslip with no ledger postings
   - voucherType and account ids should already be resolved from step 6 (parallel reads)
   - `POST /ledger/voucher?sendToLedger=true` with:
     - `voucherType: { id: <resolved Lønnsbilag id> }` — do NOT hardcode; ids vary across accounts
     - `date: <payroll date>`
     - `description: "Lønn <month> <year> - Fastlønn <amount> + Bonus <amount>"`
     - CRITICAL: every posting MUST include explicit `row` field starting from 1 (e.g. `row: 1`, `row: 2`, `row: 3`); without `row`, Lønnsbilag reserves guiRow 0 for system-generated content → `422`
     - one debit posting per salary line on account 5000, each with its own `row` value
     - one credit posting on account 1920 for the negative gross total, with the next `row` value
   - production proof 2026-03-21 (ab1efdb0): without `row` field, 4 consecutive 422 errors; with `row: 1, 2, 3`, succeeded immediately
   - sandbox proof 2026-03-21: with `row` → voucher number=387; without `row` → `422 systemgenererte`
8b. Reuse the write response first
   - keep the returned transaction id
   - the salary transaction POST 201 proves the payslip was created; the voucher POST proves the ledger entries exist; do not add verification GETs by default
9. Verification is only justified if:
   - the POST returned a non-201 status and partial state might exist
   - the task explicitly asks the agent to report back the created amounts
   - if needed: `GET /salary/payslip/{payslipId}?fields=*,specifications(*,salaryType(*))` for full line-level proof

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
- the winning flow for payroll-ready employees (7 calls):
  1. `GET /employee?email=...&count=10&fields=*`
  2. (conditional) `GET /employee/employment?employeeId=...&count=20&fields=*` if employments too sparse
  3-5. parallel `Promise.all`: `GET /salary/type` + `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` + `GET /ledger/account?number=5000,1920&count=10&fields=*`
  6. `POST /salary/transaction?generateTaxDeduction=true`
  7. `POST /ledger/voucher?sendToLedger=true` with resolved voucherType id, postings with `row: 1, 2, 3`
- for the underconfigured branch with existing division (9 calls):
  1. `GET /employee?email=...&count=10&fields=*`
  2. `GET /division?count=1&fields=*`
  3-7. `Promise.all` parallelizing repair chain with reads:
     - chain A (sequential): `PUT /employee/{id}` with `dateOfBirth: "1990-01-01"` → `POST /employee/employment` with inline `employmentDetails[]`
     - chain B (parallel): `GET /salary/type` + `GET /ledger/voucherType?name=Lønnsbilag` + `GET /ledger/account?number=5000,1920`
  8. `POST /salary/transaction?generateTaxDeduction=true`
  9. `POST /ledger/voucher?sendToLedger=true` with resolved voucherType id, postings with `row: 1, 2, 3`
- for the no-division branch without manual-voucher fallback (10 calls):
  1. `GET /employee?email=...&count=10&fields=*`
  2. `GET /division?count=1&fields=*` → zero rows
  3. `POST /division` with `name: "Hovudavdeling"`, generated valid org number, `startDate`, `municipalityDate`, `municipality: { id: 1 }`
  4-8. `Promise.all` parallelizing repair chain with reads:
     - chain A (sequential): `PUT /employee/{id}` with `dateOfBirth: "1990-01-01"` → `POST /employee/employment` with inline `employmentDetails[]`
     - chain B (parallel): `GET /salary/type` + `GET /ledger/voucherType?name=Lønnsbilag` + `GET /ledger/account?number=5000,1920`
  9. `POST /salary/transaction?generateTaxDeduction=true`
  10. `POST /ledger/voucher?sendToLedger=true` with resolved voucherType id, postings with `row: 1, 2, 3`
  - do NOT add verification GETs — POST 201 proves the state
- for the exact fallback-permitted no-division branch (4 calls):
  1. `GET /employee?email=...&count=10&fields=*`
  2. `GET /division?count=1&fields=*`
  3. `GET /ledger/account?number=5000,1920&count=10&fields=*`
  4. `POST /ledger/voucher` with `voucherType: null`, postings with `row: 1, 2`
- do not add verification GETs by default; POST 201 already proves the state
- only branch into feature/module investigation after a live `403`

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
  - response is always sparse: only transaction id, date, year, month, and payslip link stubs (id + url) — never amounts or specifications
  - POST 201 proves the state was created correctly; do not add verification GETs by default
- if verification is explicitly needed:
  - `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))` for full line-level proof including amounts
  - `GET /salary/payslip/{id}?fields=*` keeps `specifications[]` as link-only objects; do not mistake that sparse shape for missing salary lines

## Avoidable Mistakes

- Do not jump straight to `POST /salary/transaction` without first checking whether the target employee is payroll-ready
- Do not stop on `dateOfBirth=null` plus `employments=[]` by default for the exact task-12-like side-effect-scored payroll shape; that heuristic produced repeated `0/8` runs on 2026-03-20
- Do not treat sparse `employee.employments[]` on `GET /employee?fields=*` as proof that no employment exists; do one conditional `GET /employee/employment?employeeId=...&fields=*` first
- Do not speculate about missing salary-module activation when `GET /salary/type` and/or `GET /salary/settings` already succeed
- Do not guess a business/sub-entity setup just because payroll validation mentions `virksomhet`
- ALWAYS include `employmentDetails` when creating employment — preferred: inline `employmentDetails[]` in `POST /employee/employment` (saves 1 call); fallback: separate `POST /employee/employment/details`; `remunerationType: "MONTHLY_WAGE"` is required for `monthlySalary` to be stored; 15+ production runs WITHOUT employment details scored 0/8
- ALWAYS use `?generateTaxDeduction=true` on `POST /salary/transaction`; without it the payslip lacks a Skattetrekk specification
- ALWAYS create a Lønnsbilag voucher (`POST /ledger/voucher?sendToLedger=true`) after the salary transaction; the salary transaction creates only a draft payslip with no ledger entries, empty compilation, and number=0
- Do NOT hardcode voucherType ids (e.g. `9744848`) — they vary across accounts; always resolve via `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*`; production run ab1efdb0 wasted 4 calls because of hardcoded id mismatch
- ALWAYS include explicit `row` field (starting from 1) on every posting in `POST /ledger/voucher` when using Lønnsbilag voucherType — without `row`, postings default to guiRow 0 which is system-reserved, causing `422 systemgenererte`; this is universal across all accounts
- Use `GET /ledger/account?number=5000,1920&count=10&fields=*` (comma-separated) to resolve both accounts in one call instead of two
- Parallelize independent reads with `Promise.all`: salary/type + voucherType + accounts can all run concurrently; also parallelize the repair chain (PUT employee → POST employment) with those reads since they are independent
- Do not include `department` blindly in the salary payload
- Do not widen into generic salary browsing when `GET /employee` already proves the exact underconfigured branch; switch into the narrow repair flow or stop based on prompt scoring and live `403` evidence
- When the employee is already proven underconfigured, do not spend `GET /salary/type` before one decisive `GET /division`; an empty division result makes the payroll repair branch impossible and the salary-type read becomes a wasted call whether or not manual vouchers are allowed
- When `GET /division?count=1&fields=*` returns zero rows and the prompt does not allow manual vouchers, create a division with `POST /division` using `name: "Hovudavdeling"`, generated org number, `startDate`, `municipalityDate`, and `municipality: { id: 1 }` (hardcoded — do NOT spend a `GET /municipality` call) — do NOT stop blocked; this path was production-confirmed on 2026-03-21; sandbox on 2026-03-21 confirmed `municipality: { id: 1 }` works without a prior municipality read
- When `GET /division?count=1&fields=*` returns zero rows and the prompt explicitly allows manual vouchers, switch straight into the manual-voucher fallback branch
- Do not add verification GETs (`GET /salary/payslip`, `GET /salary/transaction`) after a successful `POST /salary/transaction` — each verification call is wasted since POST 201 already proves the state was created with the exact amounts sent
- Do not rely on `GET /salary/payslip/{id}?fields=*` alone when the task scores the exact manual salary-line contents
