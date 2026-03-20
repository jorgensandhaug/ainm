# Register Travel Expense

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- register one new travel expense for one existing employee identified by email
- prompt provides the travel title/purpose, cost lines, and one or more per-diem allowances
- no attachment, approval, delivery, mileage, accommodation allowance, project linking, update, or delete flow

## Do Not Use This Standard If
- task needs mileage allowance, accommodation allowance, or attachments
- task needs approval, delivery, reinvoicing, or project linkage
- employee identity is ambiguous or the employee must be created first
- prompt is not a create-only travel-expense registration task

## Standard Flow
1. `GET /employee?email=...&count=10&fields=*`
2. `GET /travelExpense/costCategory?count=1000&fields=*`
3. `GET /travelExpense/paymentType?count=1000&fields=*`
4. `POST /travelExpense` with embedded `costs[]` and `perDiemCompensations[]`
5. verify top-level travel-expense fields from the write response
6. `GET /travelExpense/cost?travelExpenseId=...&count=20&fields=*`
7. `GET /travelExpense/perDiemCompensation?travelExpenseId=...&count=20&fields=*`
8. stop

## Payload Rules
- resolve one exact employee by exact email match; prefer `allowInformationRegistration=true` when multiple exact-email matches exist
- filter cost categories locally on `showOnTravelExpenses=true`
- prefer exact category-description matches for prompt costs such as `Fly` and `Taxi`
- resolve one active travel payment type from `showOnTravelExpenses=true`; in sandbox the ordinary reimbursement type was `Privat utlegg`
- when any per diem compensation is present, set `travelDetails.isCompensationFromRates=true`
- embed `perDiemCompensations[]` directly on the `POST /travelExpense` payload
- embed `costs[]` directly on the same `POST /travelExpense` payload
- for each embedded cost in NOK, send both `amountCurrencyIncVat` and `amountNOKInclVAT`
- preserve prompt text exactly in `title` and `costs[].comments`

## Reuse From Write Response
- `travelExpense.id`
- top-level `title`
- linked `employee.id`
- `travelDetails` fields
- embedded child ids if present, but expect them to be sparse

## Verification
- verify top-level travel-expense fields directly from the `POST /travelExpense` response
- do not rely on `GET /travelExpense/{id}?fields=*` alone for exact child verification; `costs[]` and `perDiemCompensations[]` can still be link-only `id`/`url`
- verify exact cost lines from `GET /travelExpense/cost?travelExpenseId=...&fields=*`
- verify exact per-diem rows from `GET /travelExpense/perDiemCompensation?travelExpenseId=...&fields=*`

## Known Recovery Branches
- if `POST /travelExpense` fails on `costs.amountCurrencyIncVat`, add `amountCurrencyIncVat` on every embedded cost row
- if `POST /travelExpense` fails with `Kun kostnader kan registreres uten kompensasjon etter satser.`, set `travelDetails.isCompensationFromRates=true`

## OpenAPI / Sandbox Status
- `/travelExpense`, `/travelExpense/cost`, `/travelExpense/perDiemCompensation`, `/travelExpense/costCategory`, and `/travelExpense/paymentType` verified in `./openapi.json`
- persistent sandbox re-verified on 2026-03-20:
  - one `POST /travelExpense` created the parent expense plus embedded costs and per-diem rows
  - the write response returned top-level fields plus child arrays as sparse `id`/`url`
  - `GET /travelExpense/cost?...` and `GET /travelExpense/perDiemCompensation?...` returned the exact child values needed for final verification
