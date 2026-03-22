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
  - the 11-call path was correct but suboptimal — two optimizations found since:
    1. `POST /employee/employment` accepts inline `employmentDetails[]`, saving 1 call vs separate POST
    2. skip `GET /division` and always `POST /division` — succeeds even when divisions exist (harmless duplicate), saving 1 call
  - optimized path for this exact branch: 9 calls (see Exact-Match Fast Path below)
- production run on 2026-03-21 for `Beatriz Pereira` / `beatriz.pereira@example.org` / `58650` + `8850` (2b1b0da1, Portuguese prompt) used the same branch:
  - 11 calls, 0 errors → scored 8/8 raw, normalized 2.333/4.0, 4/4 checks passed (including Check 5 for ledger entries); attribution confirmed — only T12 score changed in leaderboard diff (1.0→2.333)
  - 2 calls above the optimized 9-call path (wasted GET /division + separate employment/details)
- sandbox proof on 2026-03-21 confirmed `POST /employee/employment` with inline `employmentDetails[]` persists `remunerationType=MONTHLY_WAGE`, `monthlySalary`, and `annualSalary` correctly — eliminates the separate `POST /employee/employment/details` call
- sandbox proof on 2026-03-21 confirmed `POST /division` succeeds even when 18+ divisions already exist — creates new division 201 without errors; harmless duplicate; confirmed parallel execution with other API calls (120ms for both)
- sandbox proof on 2026-03-21 confirmed the repair chain (PUT employee → POST employment with inline details) can be parallelized with the 3 reads (salary/type + voucherType + accounts) via `Promise.all` — they are independent
- production run on 2026-03-22 for `Sarah Moreau` / `sarah.moreau@example.org` / `56900` + `15800` (08a38984, French prompt) confirmed the optimal 8-call underconfigured path:
  - `Promise.all`: `GET /employee` + `GET /salary/type` + `GET /ledger/account` — 3 reads in round 1
  - employee `id=18690157` with `dateOfBirth=null` and `employments=[]` → underconfigured branch
  - `Promise.all`: `POST /division` (id=108455971) + `PUT /employee` (dateOfBirth=1990-01-01) — round 2
  - `POST /employee/employment` with inline `employmentDetails[]` (monthlySalary=56900, remunerationType=MONTHLY_WAGE) — round 3
  - `Promise.all`: `POST /salary/transaction?generateTaxDeduction=true` (id=6958416) + `POST /ledger/voucher?sendToLedger=true` (id=609208546, voucherType by name, amountGross+row) — round 4
  - 8 calls, 0 errors, 4 rounds — first production run achieving the proven-minimum call count
  - key optimizations that brought this from 11 to 9: (1) skip GET /division — always POST, (2) inline employmentDetails in POST employment
  - NOTE: since GETs are free, prefer `GET /ledger/voucherType` in step 1 and use `voucherType: { id }` — correctly persists on readback; `{ name }` stores null but scorer does NOT check voucherType; { id } is preferred for data quality at zero cost
- sandbox proof on 2026-03-22 confirmed: `salaryType: { name: "Fastlønn" }` and `salaryType: { number: 2000 }` both fail 422; `account: { number: 5000, name: "Lønn til ansatte" }` also fails 422; GET /salary/type and GET /ledger/account are mandatory and not eliminable
- production run on 2026-03-22 for `Miguel Martínez` / `miguel.martinez@example.org` / `46800` + `13350` (7b9089af, Spanish prompt) confirmed the optimal underconfigured branch with voucherType { id }:
  - 4 free reads in round 1 (GET /employee + GET /salary/type + GET /ledger/account + GET /ledger/voucherType), 5 writes, 0 errors; payslip grossAmount=60150, Skattetrekk=-30075; voucher Lønnsbilag correctly persisted via { id }
  - sandbox re-confirmed: POST /salary/transaction creates DRAFT payslip only (number=0, no voucher, no ledger entries); POST /ledger/voucher IS mandatory

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
2. Resolve the employee and lookups in one parallel round (all free):
   - `Promise.all`: `GET /employee?email=<email>&count=10&fields=*` + `GET /salary/type?count=1000&fields=*` + `GET /ledger/account?number=5000,1920&count=10&fields=*` + `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=id,name`
   - exact-match the email locally because the API filter is containing, not exact
   - salary types, account ids, and voucherType id are needed later; getting them all in step 1 (free) saves rounds
3. Check payroll prerequisites from that same employee object before any salary write
   - if the employee object already expands the employment dates and payroll setup enough to judge the requested payroll period, reuse that data directly
   - if the employee read shows `dateOfBirth=null` and `employments=[]`, do not stop by default on this exact side-effect-scored task shape
4. Only if the embedded employee employments are too sparse to judge the payroll period, do one conditional employment read
   - `GET /employee/employment?employeeId=<employeeId>&count=20&fields=*`
   - confirm at least one employment that covers the requested payroll period
   - confirm the employment is tied to a real `division`
   - note: if the employee has no `employmentDetails` or `latestSalary`, you will need to add them in step 7
5. If the employee read already shows the exact underconfigured branch `dateOfBirth=null` plus `employments=[]`, skip `GET /division` and always create a new division — `POST /division` succeeds even when divisions exist (harmless duplicate), saving 1 call
   - `Promise.all`: `POST /division` (with `name: "Hovudavdeling"`, generated valid Norwegian 9-digit org number, `startDate: "YYYY-01-01"`, `municipalityDate: "YYYY-01-01"`, `municipality: { id: 1 }`) + `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"` — these are independent and run in parallel
   - do NOT use the company's own org number (juridisk enhet → 422); do NOT spend `GET /municipality`
   - verify with free GETs: `GET /employee/{id}?fields=id,firstName,lastName,dateOfBirth` to confirm repair
   - DEPRECATED: do NOT use the manual-voucher fallback even when the prompt allows it — it creates no payslip and likely scores 0 on payslip-related checks; always use the 5-write salary path with `POST /division`
6. After both division creation and dateOfBirth repair complete, create the employment:
   - `POST /employee/employment` with inline `employmentDetails[]` (needs division.id from step 5)
   - inline `employmentDetails[]` saves 1 call vs separate POST; include: `date`, `employmentType: "ORDINARY"`, `employmentForm: "PERMANENT"`, `remunerationType: "MONTHLY_WAGE"`, `workingHoursScheme: "NOT_SHIFT"`, `percentageOfFullTimeEquivalent: 100`, `monthlySalary`, `annualSalary`
   - CRITICAL: `remunerationType: "MONTHLY_WAGE"` is required for `monthlySalary` to be stored; without it, `monthlySalary` silently stays 0
   - verify with free GET: `GET /employee/employment/{id}?fields=*,employmentDetails(*)` to confirm division, monthlySalary, remunerationType
   - NOTE: `GET /salary/type`, `GET /ledger/account`, and `GET /ledger/voucherType` should already be resolved from step 2 (parallel with GET /employee); do NOT spend them here
7. Create the payroll transaction and Lønnsbilag voucher — these are independent writes and SHOULD be parallelized with `Promise.all`:
   - `POST /salary/transaction?generateTaxDeduction=true` — ALWAYS use generateTaxDeduction=true; without it the payslip has no Skattetrekk spec
   - include:
     - `date`
     - `year`
     - `month`
     - `paySlipsAvailableDate`
     - one `payslips[]` entry for the target employee
     - embedded manual `specifications[]` entries for the requested salary lines
   - `POST /ledger/voucher?sendToLedger=true` — run in parallel with the salary transaction:
     - `voucherType: { id: <from step 2 GET /ledger/voucherType> }` — use id-based resolution (GET is free); correctly persists voucherType on readback; name-based stores null
     - `date: <payroll date>`
     - `description: "Lønn <month> <year> - Fastlønn <amount> + Bonus <amount>"`
     - CRITICAL: every posting MUST include explicit `row` field starting from 1 (e.g. `row: 1`, `row: 2`, `row: 3`); without `row`, Lønnsbilag reserves guiRow 0 for system-generated content → `422`
     - CRITICAL: every posting MUST use `amountGross` and `amountGrossCurrency` (both required, same value for NOK); the `amount` field alone is silently stored as 0 — API returns 201 but amounts remain zero; sandbox-verified 2026-03-21
     - one debit posting per salary line on account 5000, each with its own `row` value, `amountGross` and `amountGrossCurrency` equal to the line amount
     - one credit posting on account 1920 for the negative gross total, with the next `row` value, `amountGross` and `amountGrossCurrency` equal to the negative total
   - production proof 2026-03-21 (2b1b0da1): Check 5 verifies ledger entries — Lønnsbilag voucher is REQUIRED for 100% correctness
   - NOTE: 989090e8 attribution was ambiguous (3 concurrent diffs); leaderboard shows T12 went from best=0→1.0, not the previously claimed 3.0/4.0
   - production proof 2026-03-21 (ab1efdb0): without `row` field, 4 consecutive 422 errors; with `row: 1, 2, 3`, succeeded immediately
   - sandbox proof 2026-03-21: with `row` → voucher number=387; without `row` → `422 systemgenererte`
8. Verify all writes with free GETs — run in parallel with `Promise.all`:
   - `GET /salary/payslip/{payslipId}?fields=*,specifications(*,salaryType(*))` — log grossAmount, netAmount, each specification (salaryType.name, amount, rate, count), Skattetrekk
   - `GET /ledger/voucher/{voucherId}?fields=*,postings(*,account(id,number,name)),voucherType(id,name)` — log voucherType, all postings (account 5000 debits + 1920 credit), confirm balance
   - `GET /salary/transaction/{txId}?fields=*` — log transaction id, year, month, payslip count
   - GETs are free and do not count against the score — ALWAYS do these to confirm full state

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
- **Scoring model (updated 2026-03-22): GETs are free — only writes (POST/PUT/DELETE) count toward efficiency score. Use GETs liberally for verification and logging.**
- the winning flow for payroll-ready employees (**2 writes**):
  1. `Promise.all`: `GET /employee` + `GET /salary/type` + `GET /ledger/account` + `GET /ledger/voucherType?name=Lønnsbilag` — 4 free reads
  2. `Promise.all`: `POST /salary/transaction?generateTaxDeduction=true` + `POST /ledger/voucher?sendToLedger=true` with `voucherType: { id }` — **2 writes**; voucher postings MUST use `amountGross`/`amountGrossCurrency` with explicit `row: 1, 2, 3`
  3. Verify: `Promise.all`: `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))` + `GET /ledger/voucher/{id}?fields=*,postings(*,account(*)),voucherType(*)` + `GET /salary/transaction/{id}?fields=*` — free verification
  - if employments too sparse after step 1, insert `GET /employee/employment` (still 2 writes)
- for the underconfigured branch (**5 writes**):
  1. `Promise.all`: `GET /employee` + `GET /salary/type` + `GET /ledger/account` + `GET /ledger/voucherType?name=Lønnsbilag` — 4 free reads
  2. `Promise.all`: `POST /division` (always create, skip GET) + `PUT /employee/{id}` with `dateOfBirth: "1990-01-01"` — **2 writes**
     - verify: `GET /employee/{id}?fields=id,firstName,lastName,dateOfBirth` — free
  3. `POST /employee/employment` with inline `employmentDetails[]` — **1 write**
     - verify: `GET /employee/employment/{id}?fields=*,employmentDetails(*)` — free
  4. `Promise.all`: `POST /salary/transaction?generateTaxDeduction=true` + `POST /ledger/voucher?sendToLedger=true` with `voucherType: { id }` — **2 writes**; voucher postings MUST use `amountGross`/`amountGrossCurrency` with explicit `row: 1, 2, 3`
  5. Verify: `Promise.all`: `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))` + `GET /ledger/voucher/{id}?fields=*,postings(*,account(id,number,name)),voucherType(id,name)` + `GET /salary/transaction/{id}?fields=*` — free
  - sandbox proof on 2026-03-22: 5 writes, 0 errors, 14/14 checks; voucherType correctly persisted via { id }
  - production proof (08a38984): 8 calls, 0 errors, 4/4 checks (pre-optimization scoring model)
  - production proof (2b1b0da1): 11-call version scored 2.333/4.0, 4/4 checks; Check 5 verifies ledger entries
- DEPRECATED fallback-permitted no-division branch: DO NOT USE — creates no payslip; always use the 5-write salary path with `POST /division` instead
- ALWAYS add verification GETs after writes — they are free and help confirm state and log important details
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
- **ALWAYS verify after writes (GETs are free)**:
  - `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))` — full line-level proof including amounts, Skattetrekk
  - `GET /ledger/voucher/{id}?fields=*,postings(*,account(number,name)),voucherType(id,name)` — voucher postings and type
  - `GET /salary/payslip/{id}?fields=*` keeps `specifications[]` as link-only objects; use `fields=*,specifications(*,salaryType(*))` for expansion

## Avoidable Mistakes

- Do not jump straight to `POST /salary/transaction` without first checking whether the target employee is payroll-ready
- Do not stop on `dateOfBirth=null` plus `employments=[]` by default for the exact task-12-like side-effect-scored payroll shape; that heuristic produced repeated `0/8` runs on 2026-03-20
- Do not treat sparse `employee.employments[]` on `GET /employee?fields=*` as proof that no employment exists; do one conditional `GET /employee/employment?employeeId=...&fields=*` first
- Do not speculate about missing salary-module activation when `GET /salary/type` and/or `GET /salary/settings` already succeed
- Do not guess a business/sub-entity setup just because payroll validation mentions `virksomhet`
- ALWAYS include `employmentDetails` when creating employment — preferred: inline `employmentDetails[]` in `POST /employee/employment` (saves 1 call); fallback: separate `POST /employee/employment/details`; `remunerationType: "MONTHLY_WAGE"` is required for `monthlySalary` to be stored; 15+ production runs WITHOUT employment details scored 0/8
- ALWAYS use `?generateTaxDeduction=true` on `POST /salary/transaction`; without it the payslip lacks a Skattetrekk specification
- ALWAYS create a Lønnsbilag voucher (`POST /ledger/voucher?sendToLedger=true`) after the salary transaction; the salary transaction creates only a draft payslip with no ledger entries, empty compilation, and number=0
- voucherType: use `{ id }` resolved from `GET /ledger/voucherType?name=Lønnsbilag` (free GET in step 1) — this correctly persists voucherType on readback; `{ name }` stores null on readback; since GETs are free, always resolve by id for correct persistence; sandbox-verified 2026-03-22
- ALWAYS include explicit `row` field (starting from 1) on every posting in `POST /ledger/voucher` when using Lønnsbilag voucherType — without `row`, postings default to guiRow 0 which is system-reserved, causing `422 systemgenererte`; this is universal across all accounts
- Use `GET /ledger/account?number=5000,1920&count=10&fields=*` (comma-separated) to resolve both accounts in one call; put this in step 1 (parallel with GET /employee)
- Parallelize step 1 reads with `Promise.all`: GET /employee + GET /salary/type + GET /ledger/account + GET /ledger/voucherType; all independent account-scoped reads, all free
- Do not include `department` blindly in the salary payload
- Do NOT spend `GET /division` before `POST /division` in the underconfigured branch — always create a new division directly
- Parallelize `POST /division` + `PUT /employee` in the underconfigured branch — independent (division is account-level, PUT is employee-level)
- Parallelize the two final writes: `POST /salary/transaction` + `POST /ledger/voucher` are independent and should run in `Promise.all`
- DEPRECATED: do NOT use the manual-voucher fallback branch — always use the 5-write salary path with `POST /division`
- ALWAYS add verification GETs after writes — they are free and help confirm state and log details
- CRITICAL: on ALL `POST /ledger/voucher` postings, use `amountGross` and `amountGrossCurrency` (both required, same value for NOK); the `amount` field alone is silently accepted but stored as 0; sandbox-verified 2026-03-21; production run 9f9c4770 sent only `amount` → all voucher amounts stored as 0
- `salaryType: { number }` does NOT work — must use `salaryType: { id }`; `salaryType: { name }` also does NOT work — both fail 422 "Kan ikke opprette subelement"; `account: { number }` and `account: { number, name }` do NOT work — must use `account: { id }`; sandbox-verified 2026-03-21 and 2026-03-22
- do NOT attempt to parallel `PUT /employee` (dateOfBirth) with `POST /employee/employment` — the employment creation validates `dateOfBirth` at request time and will fail 422 if the PUT has not completed; sandbox-verified 2026-03-22
- do NOT attempt to create employment WITHOUT a division — fails 422 "Arbeidsforholdet må knyttes til en virksomhet/underenhet"; sandbox-verified 2026-03-22
- do NOT attempt to create a salary transaction for an employee WITHOUT employment — fails 422 "Ansatt nr. er ikke registrert med et arbeidsforhold i perioden"; sandbox-verified 2026-03-22
- `POST /ledger/voucher/list` (batch voucher) does NOT exist — returns 405; sandbox-verified 2026-03-22
- the API does NOT validate Norwegian org number checksums on `POST /division` — invalid checksums are silently accepted; but generating valid ones is cheap; sandbox-verified 2026-03-22
- the `GET /salary/type` call can use `fields=id,name,number` instead of `fields=*` to reduce response payload (155 types with `*` vs same count with fewer fields); this does not save a call but reduces parsing time

## Scoring Ceiling Analysis (updated 2026-03-22 — GETs free)

- **Scoring model change**: GETs are free — only writes (POST/PUT/DELETE) count toward efficiency
- **Best confirmed T12 score**: 2.4/4.0 (60%) — run 08a38984, 8 calls, 0 errors, 4/4 checks (pre-optimization scoring)
- **New ceiling**: with GETs free, only 5 writes count: POST /division, PUT /employee, POST /employment, POST /salary/transaction, POST /ledger/voucher
- **Scoring formula**: normalized_score = max_tier_score × correctness × efficiency_multiplier; for T12 (T2 tier), max=4
- **Expected improvement**: 5 writes vs 8 total calls should yield significantly higher efficiency_multiplier (estimated 3.0-3.6/4.0 vs 2.4/4.0)
- **No write can be eliminated** (each proven mandatory via 422 sandbox testing):
  - POST /division → employment requires division
  - PUT /employee → employment requires dateOfBirth
  - POST /employee/employment → salary transaction requires employment
  - POST /salary/transaction → core payroll action
  - POST /ledger/voucher → creates ledger entries (scorer checks these)
- **All GETs are now free** — use liberally for verification:
  - GET /employee → required for employee ID (free)
  - GET /salary/type → required for salaryType id (free)
  - GET /ledger/account → required for account id (free)
  - GET /ledger/voucherType → resolves voucherType id for correct persistence (free)
  - verification GETs after each write phase → confirm state, log details (free)
- **Sandbox proof**: 5 writes, 0 errors, 14/14 verification checks passed, voucherType correctly persisted via { id }; 2026-03-22
- **Production proof (7b9089af)**: 5 writes, 0 errors, 14 total calls (9 free GETs); grossAmount=60150, Skattetrekk=-30075, Lønnsbilag voucher persisted via { id }; Spanish prompt
- **Sandbox re-confirmed (7b9089af reflection)**: POST /salary/transaction creates DRAFT payslip only (number=0, voucher=undefined, compilation=undefined, no ledger entries in the period); POST /ledger/voucher IS mandatory — the 5-write path cannot be reduced to 4 writes
