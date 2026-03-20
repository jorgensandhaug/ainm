## 1. Task

Reflect on the failed production run for the Portuguese travel-expense prompt, prove the correct Tripletex path in persistent sandbox only, update the reusable Tripletex docs/playbooks, commit those doc changes, and save this summary.

## 2. Reflection

What went well:
- The original run narrowed quickly to the relevant `travelExpense` endpoints and child schemas.
- The production write sequence had no Tripletex `4xx`; the failure was a local verification mistake after a successful `POST /travelExpense/perDiemCompensation`.
- Sandbox follow-up proved a better parent-write shape: one embedded `POST /travelExpense` can create the parent, both cost lines, and the per-diem row.

What went poorly:
- I used an incorrect URL builder first, which dropped `/v2` when given leading-slash paths. That was avoidable local breakage.
- I assumed sparse write responses would include enough linked child data for direct verification. They did not.
- I split the production flow into parent create plus child creates before proving whether one embedded parent write was supported.
- I had no travel-expense trusted standard or playbook to prevent guesswork on `amountCurrencyIncVat`, `isCompensationFromRates`, and child verification shape.

What the correct approach should have been:
- `GET /employee?email=...&fields=*`
- `GET /travelExpense/costCategory?count=1000&fields=*`
- `GET /travelExpense/paymentType?count=1000&fields=*`
- `POST /travelExpense` with embedded `costs[]` and `perDiemCompensations[]`, `travelDetails.isCompensationFromRates=true`, and both `amountCurrencyIncVat` plus `amountNOKInclVAT` on each cost
- Verify parent fields from the write response
- Verify exact nested rows from `GET /travelExpense/cost?travelExpenseId=...&fields=*` and `GET /travelExpense/perDiemCompensation?travelExpenseId=...&fields=*`

## 3. Root Causes

- No existing travel-expense standard/playbook. I had to infer too much from schemas alone.
- Wrong assumption: `amountNOKInclVAT` alone would satisfy embedded cost validation. Sandbox proved `costs[].amountCurrencyIncVat` is also required.
- Wrong assumption: per-diem rows could be embedded while `travelDetails.isCompensationFromRates=false`. Sandbox returned `422` with `Kun kostnader kan registreres uten kompensasjon etter satser.`
- Wrong assumption: `POST /travelExpense` or `GET /travelExpense/{id}?fields=*` would expand `costs[]` and `perDiemCompensations[]`. Both stayed link-only `id`/`url`.
- Local coding error: the first URL helper reset the request path and dropped the `/v2` prefix.

## 4. Sandbox Verification

Persistent sandbox credentials were used exclusively for follow-up API work.

Observed lookup state:
- Employee used for proof: `18478235` (`codex.verify.1773957815637@example.org`)
- Travel payment type: `32813706` `Privat utlegg`
- Travel cost categories: `32813722` `Fly`, `32813737` `Taxi`

Failed probes that established the real constraints:
- `POST /travelExpense` with embedded costs but without `amountCurrencyIncVat` returned `422` on `costs[0].amountCurrencyIncVat`.
- `POST /travelExpense` with embedded per diem and `travelDetails.isCompensationFromRates=false` returned `422` on `perDiemCompensations` with `Kun kostnader kan registreres uten kompensasjon etter satser.`

Successful proof path:
- `POST /travelExpense` succeeded with:
  - `travelDetails.isCompensationFromRates=true`
  - embedded per diem `{ "location": "Bergen", "count": 2, "rate": 800, "amount": 1600 }`
  - embedded flight cost with `amountCurrencyIncVat=5200`, `amountNOKInclVAT=5200`
  - embedded taxi cost with `amountCurrencyIncVat=350`, `amountNOKInclVAT=350`
- Proven object ids from the successful proof run:
  - travel expense `11143536`
  - per diem `1590417`
  - flight cost `20249949`
  - taxi cost `20249950`

Verification shape that actually worked:
- Parent write response proved top-level fields and returned child arrays only as `id`/`url`
- `GET /travelExpense/cost?travelExpenseId=11143536&count=20&fields=*` returned exact cost comments, amounts, and linked ids
- `GET /travelExpense/perDiemCompensation?travelExpenseId=11143536&count=20&fields=*` returned exact `location`, `count`, `rate`, and `amount`

## 5. Playbook Changes

Created new reusable docs:
- `trusted-standards/register-travel-expense.md`
- `task-playbooks/register-travel-expense.md`

Updated existing docs:
- `trusted-standards/common-endpoints.md`
- `AGENTS.md`

What changed:
- Added a trusted standard for exact-match travel-expense registration tasks
- Added a detailed travel-expense playbook with the two sandbox-verified `422` traps and the winning payload
- Extended common endpoints to include travel-expense child/lookup endpoints
- Added AGENTS guidance for:
  - embedded travel-expense fast path
  - required `amountCurrencyIncVat`
  - required `travelDetails.isCompensationFromRates=true` when per diem is present
  - child verification via `/travelExpense/cost` and `/travelExpense/perDiemCompensation`

## 6. Commit

- Commit hash: `57755260cce2cff88cedde2f856fba2c7fac50a2`
- Commit message: `tripletex playbook: add travel expense standard`

## 7. Reusable Heuristics

- For travel-expense create tasks, prefer one embedded `POST /travelExpense` over separate child writes when the prompt is a standard cost-plus-per-diem registration.
- In embedded travel costs, send both company-currency and payment-currency gross fields when the schema exposes both; do not assume NOK-only amount fields are sufficient.
- If a travel-expense prompt includes per diem, default `travelDetails.isCompensationFromRates=true` unless a verified standard says otherwise.
- Do not trust `fields=*` to expand nested travel-expense children. Verify exact child rows from the dedicated child search endpoints.
- Treat sparse write responses as a response-shape question first, not proof that the write failed.
