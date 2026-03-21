# Set Project Fixed Price and Invoice Partial Payment

## Scope

Use for tasks like:
- set or update a fixed price on a project
- create the project if it does not already exist
- link the project to a customer identified by organization number and/or name
- set an existing employee as project manager, identified by email and/or name
- invoice the customer for a fraction of the fixed price as a partial billing
- create the invoice but do not send it unless the prompt explicitly asks for sending

Do not use for:
- pure create-project tasks with no invoice step
- invoice-send tasks where delivery method is the main goal
- full-payment registration tasks after the invoice is created

## Verified Findings

Persistent-sandbox verification on 2026-03-20 showed:
- `PUT /order/{id}/:invoice?...createOnAccount=WITHOUT_VAT&amountOnAccount=...` on an order with no order lines failed with `422` and validation message `Fakturaen inneholder ingen ordrelinjer.`
- `POST /order` with embedded `orderLines` still echoed `orderLines=[]` in `response.value`, but the later invoice succeeded, and one decisive `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)` confirmed the created order line and the linked project
- production verification on 2026-03-20 showed an additional invoice-stage failure mode:
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` failed with `422` and validation message `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`
  - `GET /ledger/account?isBankAccount=true&fields=*`, then `PUT /ledger/account/{id}` on the existing invoice bank account `1920`, then retrying the same `PUT /order/{id}/:invoice` succeeded
  - therefore this branch should resume from the already-created order, not restart from `POST /project` or `POST /order`
- creating the customer with `invoiceSendMethod: "MANUAL"` worked without inventing email or address fields when the prompt did not provide them
- `POST /project` succeeded with:
  - `startDate`
  - `customer: { id }`
  - `projectManager: { id }`
  - `isFixedPrice: true`
  - `fixedprice`
  - `invoiceOnAccountVatHigh: false`
- the project write response already proved `isFixedPrice=true`, `fixedprice=<amount>`, `customer.id`, and `projectManager.id`
- the sandbox account only exposed one valid filtered outgoing VAT type on the invoice date:
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
  - returned VAT code `6` with `percentage=0`
- invoicing a real project-linked order line for `281175` succeeded directly and produced an invoice with:
  - `amountExcludingVatCurrency=281175`
  - `amountCurrency=281175`
  - `orders[0].project.id=<projectId>` on the verification read
- additional persistent-sandbox verification on 2026-03-20 showed:
  - `POST /project` followed by `PUT /project/{id}` successfully updated a fixed-price project from `170400` to `170500`
  - `POST /order` with one project-linked partial-billing line for `56265` succeeded
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` then succeeded and one decisive `GET /invoice/{id}?fields=*,customer(*),orders(*,project(*,customer(*),projectManager(*)),orderLines(*)),orderLines(*)` proved:
    - `amountExcludingVatCurrency=56265`
    - `orders[0].project.fixedprice=170500`
    - `orders[0].project.projectManager.email=<resolved-assignable-project-manager-email>`
  - in that current sandbox state, invoice account `1920` already had `bankAccountNumber=12345678903`, so the company-bank-account validation did not reproduce there
  - therefore, for this task shape the `/ledger/account` branch must stay conditional on the first invoice write failing, not part of the default fast path
- `invoice.projectInvoiceDetails` was `null` in this working flow, so do not rely on that collection to prove the project link
- persistent-sandbox re-verification on 2026-03-20 for the update branch showed:
  - `PUT /project/{id}` updated `fixedprice` to `428550` and kept `isFixedPrice=true`
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` still returned only VAT code `6` (`0%`) in that account
  - the successful `PUT /order/{id}/:invoice` write response already proved `id`, `customer.id`, `amountExcludingVatCurrency`, and `amountCurrencyOutstanding`, but `orders[0].project` stayed `null`
  - one follow-up `GET /invoice/{id}` then proved `orders[0].project.id`, `orders[0].project.fixedprice=428550`, and one real order line
- exact production reflection on 2026-03-20 showed that for the same task shape on a fresh account, taking the optimistic first `PUT /order/{id}/:invoice` caused one avoidable extra Tripletex call and a `422`; the lower-call replacement for that exact state was:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - `PUT /ledger/account/{id}` on the existing invoice account because `bankAccountNumber` was missing
  - one successful `PUT /order/{id}/:invoice?...`
- persistent-sandbox optimization re-verification on 2026-03-20 for the update branch showed:
  - `GET /project?name=<exact-name>&count=50&fields=*,customer(*),projectManager(*)` returned one exact project hit with nested `customer.organizationNumber`, `customer.id`, `projectManager.email`, `projectManager.id`, and the existing `startDate`
  - that one project-first read was enough to skip both a separate `GET /customer` and a separate `GET /employee` before `PUT /project/{id}` when the existing manager already matched the prompt
  - reusing the returned `startDate` on `PUT /project/{id}` updated `fixedprice` to `350650` without changing the project start date
  - `POST /order` then accepted a percentage-derived decimal line amount of `87662.5` for the `25%` milestone without rounding
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` succeeded directly in persistent sandbox without any `/ledger/account` preflight because that sandbox company already had a valid invoice bank account
  - omitting `orderLines[].vatType` on the same sandbox account also succeeded only because `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` exposed a single valid `0%` row; that omission is still not a trusted scored-run shortcut
- exact production reflection on 2026-03-20 for `Tindra AS` / `870827946` / `Nettbutikk-utvikling` / `kristian.nilsen@example.org` / `181650` / `50%`, followed by sandbox re-proof on the same date, showed the concrete efficiency miss:
  - the production run finished with perfect correctness but only `3.33/4` because it inserted `GET /ledger/account?isBankAccount=true&fields=*` before the invoice write
  - that read returned invoice account `1920` with `bankAccountNumber=12345678903`, so the later invoice write already had the prerequisite it needed
  - a new persistent-sandbox proof run for the same shape then measured `5` calls after fixture setup with no `/ledger/account` step: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - therefore this task shape should keep `/ledger/account` out of the default exact-match path unless earlier evidence already shows the bank-account prerequisite is missing
- persistent-sandbox re-proof on 2026-03-20 for the same prompt shape as `Estrella SL` / `816896770` / `Desarrollo e-commerce` / `375250` / `33%` showed:
  - after fixture setup, the update-first proof path again completed in `5` measured calls with no `/ledger/account` preflight
  - the percentage-derived amount `123832.5` (`375250 * 0.33`) was accepted directly on `orderLines[].unitPriceExcludingVatCurrency`
  - the sandbox still exposed only filtered outgoing VAT code `6` (`0%`), yet the invoice write still proved `amountExcludingVatCurrency=123832.5` and `amountCurrencyOutstanding=123832.5`
- post-run scoring on 2026-03-20 for `Soleil SARL` / `931336738` / `Mise à niveau infrastructure` / `nathan.thomas@example.org` / `125550` / `25%` showed:
  - the production run was correct (`8/8`) but still one call above the true minimum (`3.5/4` efficiency), so one write had been unnecessary
  - the remaining likely waste was `PUT /project`, because the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` already proved the exact project, nested customer, and nested manager email
  - that production account exposed outgoing VAT `25%`, so the successful invoice write returned `amountExcludingVatCurrency=31387.5` and `amountCurrencyOutstanding=39234.38`; the milestone amount check belongs on the excluding-VAT field
- persistent-sandbox analog re-proof on 2026-03-20 with the same `125550 * 25% = 31387.5` arithmetic showed the missing optimization:
  - after fixture setup, when the first `GET /project` already also proved `fixedprice=125550`, the measured winning path was only `4` calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - that sandbox still exposed only outgoing VAT `0%`, so the analog invoice returned `amountExcludingVatCurrency=31387.5` and `amountCurrencyOutstanding=31387.5`
  - therefore the shorter branch is to skip `PUT /project` whenever the initial project read already proves the target fixed-price + manager state, and keep the older `5`-call branch only for real project mutations
- exact production confirmation on 2026-03-20 for `Fossekraft AS` / `907433498` / `Automatiseringsprosjekt` / `solveig.eide@example.org` / `430750` / `50%`, plus a same-day persistent-sandbox analog proof on existing fixture `Estrella SL` / `816896770` / `Desarrollo e-commerce` / `375250` / `33%`, closed the last efficiency question on the skip-`PUT` branch:
  - the production run succeeded in exactly `4` calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - there were no separate `GET /customer` or `GET /employee` calls, because the initial project row already proved the exact customer and manager
  - the production account exposed outgoing VAT `25%`, and the invoice write returned `amountExcludingVatCurrency=215375` and `amountCurrencyOutstanding=269218.75`
  - the persistent sandbox analog on existing fixture `401969688` re-proved the same skip-`PUT` structure in `4` calls, returning `amountExcludingVatCurrency=123832.5`
  - therefore the skip-`PUT` branch is now fully settled: it is minimal at `4` calls, and there is still no safe `3`-call shortcut because dropping the initial project read removes the proof that skipping `PUT /project` is valid, while dropping the VAT read risks a wrong VAT result
- later production reflection on 2026-03-20 for `Sjøbris AS` / `825338756` / `Automatiseringsprosjekt` / `knut.kvamme@example.org` / `316000` / `50%`, plus a same-day persistent-sandbox analog proof, exposed the remaining branch tradeoff:
  - the exact project-first update branch was correct, but the first `PUT /order/{id}/:invoice?...` hit `422 Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`
  - the successful production path became `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> failed `PUT /order/:invoice` -> `GET /ledger/account` -> `PUT /ledger/account/{id}` -> retry `PUT /order/:invoice` for `8` calls
  - the same-day persistent sandbox still had invoice account `1920` with `bankAccountNumber=12345678903`, and an analog proof measured the update-needed configured-account branch at `5` calls and the skip-`PUT` branch at `4`
  - therefore the remaining judgment call on the update-needed branch is: optimistic path `5` if configured / `8` if missing, proactive hedge `6` if configured / `7` if missing
- a same-session persistent-sandbox analog on 2026-03-20 with current-task arithmetic `498050 * 50% = 249025` re-confirmed that the conditional floor did not move:
  - after fixture setup, the skip-`PUT /project` branch again measured `4` calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - after fixture setup, the update-needed branch again measured `5` calls: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - both proof invoices returned `amountExcludingVatCurrency=249025`, so no extra arithmetic-normalization or verification read belongs in the standard scored path
- exact production reflection on 2026-03-20 for `Windkraft GmbH` / `886395582` / `Datensicherheit` / `maximilian.wagner@example.org` / `473250` / `25%` showed one more branch-discipline miss:
  - the run still finished with full correctness (`4/4` checks passed) but only `2.96` normalized score, so at least one unnecessary call remained versus the task ceiling
  - the successful invoice on that taxable account returned `amountExcludingVatCurrency=118312.5` and `amountCurrencyOutstanding=147890.63`
  - the run trace did not capture the exact HTTP branch, so the safe fix is to tighten the existing resolver rule rather than invent a new shortcut: once `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` already proves the exact customer and manager, do not pay a reflex `GET /employee`; once that same row also proves `fixedprice=<prompt-fixed-price>`, do not pay a reflex `PUT /project`
- a same-session persistent-sandbox analog with the same arithmetic `473250 * 25% = 118312.5` re-proved the floor on fixture `Datensicherheit Reflection 2498866c`:
  - after fixture setup, the update-needed branch again measured exactly `5` calls: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - after the fixture already held the target fixed price, the skip-`PUT /project` branch again measured exactly `4` calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - both proof invoices returned `amountExcludingVatCurrency=118312.5`, so no follow-up verification read or manager re-resolution belongs in the minimum scored path once the project-first read already proves the state
- exact production reflection on 2026-03-21 for `Elvdal AS` / `834214261` / `ERP-implementering` / `marit.kvamme@example.org` / `429500` / `33%` resolved the bank-account strategy for the update-needed branch:
  - the run used the optimistic update-needed path and hit `422` on the first `PUT /order/:invoice` due to missing bank account; total: `8` calls including a `422` error
  - the proactive hedge would have been `7` calls with zero errors
  - combined with `Sjøbris AS` (also `422` on optimistic) versus `Tindra AS` (proactive hedge wasted 1 call on configured account), production evidence now shows 2/3 update-needed runs had missing bank accounts
  - the optimistic failure is double-penalized (extra call + `422` error), so the proactive hedge is strictly better in expectation
  - the default for the update-needed branch is now PROACTIVE HEDGE: always `GET /ledger/account` between `POST /order` and `PUT /order/:invoice`
  - the milestone arithmetic `429500 * 0.33 = 141735` was exact (no decimals) and accepted directly
  - the production account exposed outgoing VAT `25%` (id=3), and the invoice returned `amountExcludingVatCurrency=141735` and `amountCurrencyOutstanding=177168.75`
- persistent-sandbox verification on 2026-03-21 re-confirmed the proactive hedge path with a configured bank account measured `6` calls for the update-needed branch
- exact production confirmation on 2026-03-21 for `Estrela Lda` / `922471126` / `Migração para nuvem` / `leonor.sousa@example.org` / `313650` / `50%` proved the update-needed proactive-hedge branch on a configured-bank account:
  - the project existed with `fixedprice=0`, `isFixedPrice=false`, but correct customer and manager already linked
  - the successful production path was `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank configured) -> `PUT /order/:invoice` for `6` calls, `0` errors
  - the production account exposed outgoing VAT `25%` (id=3), and the invoice returned `amountExcludingVatCurrency=156825` and `amountCurrencyOutstanding=196031.25`
  - this is the 4th update-needed run: 2/4 had missing bank accounts; proactive hedge remains the default (tied on expected calls at 50/50, wins on errors)
- persistent-sandbox verification on 2026-03-21 with `313650 * 0.50 = 156825` re-confirmed both branches:
  - update-needed proactive hedge: `6` calls; skip-PUT: `4` calls; both returned `amountExcludingVatCurrency=156825`
- exact production confirmation on 2026-03-21 for `Stormberg AS` / `957353681` / `Skymigrering` / `magnus.haugen@example.org` / `178450` / `50%`:
  - update-needed + missing bank account: proactive hedge discovered empty `bankAccountNumber` on account `1920` and fixed it pre-emptively
  - production path: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` calls, `0` errors
  - invoice: `amountExcludingVatCurrency=89225`, `amountCurrencyOutstanding=111531.25`, outgoing VAT `25%` (id=3)
  - this is the 5th update-needed run: 3/5 had missing bank accounts (60%); proactive hedge now clearly better in expectation (6.6 calls + 0 errors vs optimistic 6.8 + 0.6 errors)
- exact 2nd production confirmation on 2026-03-21 for `Estrela Lda` / `922471126` / `Migração para nuvem` / `leonor.sousa@example.org` / `313650` / `50%` proved the update-needed proactive-hedge branch on a missing-bank account:
  - the project existed with `fixedprice=0`, `isFixedPrice=false`, but correct customer and manager already linked
  - the proactive hedge discovered invoice account `1920` with empty `bankAccountNumber` and fixed it pre-emptively
  - production path: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` calls, `0` errors
  - invoice: `amountExcludingVatCurrency=156825`, `amountCurrencyOutstanding=196031.25`, outgoing VAT `25%` (id=3)
  - this is the 6th update-needed run: 4/6 had missing bank accounts (67%); proactive hedge even more clearly the default (6.67 calls + 0 errors vs optimistic 7.0 + 0.67 errors)
  - notably, the same task ran twice on different fresh accounts: 1st with bank configured (6 calls), 2nd with bank missing (7 calls) — bank-account state varies per fresh account even for identical prompts
- exact production confirmation on 2026-03-21 for `Cascade SARL` / `813648164` / `Projet d'automatisation` / `hugo.bernard@example.org` / `326550` / `75%`:
  - update-needed + missing bank account: proactive hedge discovered empty `bankAccountNumber` on account `1920` and fixed it pre-emptively
  - production path: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` calls, `0` errors
  - invoice: `amountExcludingVatCurrency=244912.5`, `amountCurrencyOutstanding=306140.63`, outgoing VAT `25%` (id=3)
  - first production confirmation of 75% milestone: `326550 * 0.75 = 244912.5` accepted directly as decimal
  - this is the 7th update-needed run: 5/7 had missing bank accounts (71%); proactive hedge averages 6.71 calls + 0 errors vs optimistic 7.14 + 0.71 errors
- exact production confirmation on 2026-03-21 for `Havbris AS` / `876325497` / `Nettbutikk-utvikling` / `ingrid.moe@example.org` / `363850` / `75%`:
  - update-needed + missing bank account: proactive hedge discovered empty `bankAccountNumber` on account `1920` and fixed it pre-emptively
  - production path: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` calls, `0` errors
  - invoice: `amountExcludingVatCurrency=272887.5`, `amountCurrencyOutstanding=341109.38`, outgoing VAT `25%` (id=3)
  - second production confirmation of 75% milestone: `363850 * 0.75 = 272887.5` accepted directly as decimal
  - this is the 8th update-needed run: 6/8 had missing bank accounts (75%); proactive hedge averages 6.75 calls + 0 errors vs optimistic 7.25 + 0.75 errors
- exact production confirmation on 2026-03-21 for `Solmar SL` / `866378843` / `Implementación ERP` / `maria.sanchez@example.org` / `457650` / `25%`:
  - update-needed + missing bank account: proactive hedge discovered empty `bankAccountNumber` on account `1920` and fixed it pre-emptively
  - production path: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` calls, `0` errors
  - invoice: `amountExcludingVatCurrency=114412.5`, `amountCurrencyOutstanding=143015.63`, outgoing VAT `25%` (id=3)
  - third production confirmation of 25% milestone: `457650 * 0.25 = 114412.5` accepted directly as decimal
  - this is the 9th update-needed run: 7/9 had missing bank accounts (78%); proactive hedge averages 6.78 calls + 0 errors vs optimistic 7.33 + 0.78 errors
- exact production confirmation on 2026-03-21 for `Horizonte Lda` / `804639764` / `Melhoria de infraestrutura` / `sofia.ferreira@example.org` / `228150` / `50%`:
  - update-needed + missing bank account: proactive hedge discovered empty `bankAccountNumber` on account `1920` and fixed it pre-emptively
  - production path: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` calls, `0` errors
  - invoice: `amountExcludingVatCurrency=114075`, `amountCurrencyOutstanding=142593.75`, outgoing VAT `25%` (id=3)
  - milestone arithmetic `228150 * 0.50 = 114075` is exact (no decimals) and was accepted directly
  - this is the 10th update-needed run: 8/10 had missing bank accounts (80%); proactive hedge averages 6.8 calls + 0 errors vs optimistic 7.4 + 0.8 errors

## Minimal Safe Flow

1. Confirm these operations in `./openapi.json`
   - `GET /employee`
   - `GET /customer`
   - optional `POST /customer`
   - `GET /project`
   - `POST /project` or `PUT /project/{id}`
   - `GET /ledger/vatType`
   - `POST /invoice`
2. First try a project-first resolver for update-shaped prompts
   - `GET /project?name=<project-name>&count=50&fields=*,customer(*),projectManager(*)`
   - if that one read already leaves one exact `project.name` hit whose nested `customer.organizationNumber` matches the prompt, reuse `project.id`, `customer.id`, and the returned `startDate`
   - if the same expanded row also shows nested `projectManager.email=<prompt-email>`, reuse `projectManager.id` too and skip a separate `GET /employee`
   - if that same row also already shows `fixedprice=<prompt-fixed-price>` and the manager already matches, skip the project write entirely and continue from the VAT lookup
   - in that exact hit case, skip a separate `GET /customer`
3. Resolve the customer only if the project-first read did not already prove it
   - usually `GET /customer?organizationNumber=...&count=10&fields=*`
   - if the prompt also gives the customer name, exact-match that locally too
4. Create the customer only if it does not already exist
   - if the prompt does not give invoice delivery details, prefer:
   - `invoiceSendMethod: "MANUAL"`
5. Resolve the project manager only if the project-first read did not already prove the correct existing manager
   - `GET /employee?email=<email>&assignableProjectManagers=true&count=10&fields=*`
   - exact-match the email locally because the API filter is containing, not exact
6. Resolve or update the project
   - if the project-first read already found the exact project and already proves the target fixed-price + manager state, skip the project write
   - otherwise, if the project-first read already found the exact project, `PUT /project/{id}` directly
   - otherwise, if the customer is now known but the project is still unresolved, create it with `POST /project`
7. Set the project fixed-price fields
   - `startDate`
   - `customer: { "id": ... }`
   - `projectManager: { "id": ... }`
   - `isFixedPrice: true`
   - `fixedprice: <full-fixed-price>`
   - `invoiceOnAccountVatHigh: false`
   - for `PUT /project/{id}` on an existing project, reuse the `startDate` returned by the project search unless the prompt explicitly asks to change it
8. On the update-needed branch (step 6 required `PUT /project`):
   - run `PUT /project/{id}` + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*` + `GET /ledger/account?isBankAccount=true&fields=*` in parallel (3 calls)
   - if the invoice account (usually `1920`) has an empty `bankAccountNumber`, fix it with `PUT /ledger/account/{id}` using `bankAccountNumber: "12345678903"` (0-1 calls)
   - on the skip-`PUT /project` branch: just `GET /ledger/vatType` alone; do NOT add proactive bank check
9. Create the invoice directly with `POST /invoice?sendToCustomer=false`
   - include root `invoiceDate`, root `invoiceDueDate`, root `customer: { id }`
   - include embedded `orders: [{ customer: { id }, project: { id }, orderDate, deliveryDate, orderLines: [{ description, count: 1, unitPriceExcludingVatCurrency: <partial-amount>, vatType: { id } }] }]`
   - for percentage-derived milestones, send the exact 2-decimal amount; do not round values like `350650 * 0.25 = 87662.5`
   - this replaces the old 2-call `POST /order` + `PUT /order/:invoice` path, saving 1 call on every branch
10. If the invoice write fails with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`, repair and retry once
   - `GET /ledger/account?isBankAccount=true&fields=*` (if not already done)
   - `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"`
   - retry the same `POST /invoice` once
10.5. Bank-account strategy summary:
   - update-needed branch: proactive hedge is the DEFAULT; `5` calls when configured, `6` when missing, `0` errors either way
   - skip-`PUT /project` branch: optimistic is the DEFAULT; `3` calls, bank-account issues have never occurred on this branch in production
11. Verify from the write response first
   - reuse the invoice totals from `response.value`
12. For scored runs, stop after the successful invoice write unless the prompt explicitly requires linked-field proof
13. Only for explicit linked-field verification or post-run research, do one decisive read
   - `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)`

## Recommended Shapes

Project create/update:

```json
{
  "name": "Datasikkerhet",
  "startDate": "2026-03-20",
  "customer": { "id": 12345 },
  "projectManager": { "id": 67890 },
  "isFixedPrice": true,
  "fixedprice": 374900,
  "invoiceOnAccountVatHigh": false
}
```

Direct invoice for the partial billing (replaces old POST /order + PUT /order/:invoice):

```json
POST /invoice?sendToCustomer=false
{
  "invoiceDate": "2026-03-21",
  "invoiceDueDate": "2026-03-21",
  "customer": { "id": 12345 },
  "orders": [{
    "customer": { "id": 12345 },
    "project": { "id": 54321 },
    "orderDate": "2026-03-21",
    "deliveryDate": "2026-03-21",
    "orderLines": [{
      "description": "Milestone payment – 33% of fixed price",
      "count": 1,
      "unitPriceExcludingVatCurrency": 56265,
      "vatType": { "id": 3 }
    }]
  }]
}
```

In real tasks, replace VAT id `3` with the VAT type actually returned by the filtered `GET /ledger/vatType` call for the invoice date.

## Exact-Match Fast Path

- For a prompt that gives:
  - customer organization number and name
  - project name
  - project manager email
  - full fixed price
  - partial-billing percentage or amount
- the lower-call exact-match flow is usually:
  1. `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)`
  2. if that read already proves the exact project, nested customer match, nested manager email match, and `fixedprice=<prompt-fixed-price>`, skip the project write and go straight to:
     `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` -> `POST /invoice?sendToCustomer=false`
  3. otherwise do one conditional `GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*`
  4. if the project-first read did not already prove the customer, `GET /customer?organizationNumber=...&count=10&fields=*`
  5. optional `POST /customer` with `invoiceSendMethod: "MANUAL"` if missing
  6. `PUT /project/{id}` (or `POST /project`) + `GET /ledger/vatType` + `GET /ledger/account` (parallel, 3 calls)
  7. if bank account missing: `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` (0-1 calls)
  8. `POST /invoice?sendToCustomer=false` with embedded `orders[]`
- on the update-needed branch, `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account` are parallelized; this is the default since production evidence (9/11 missing bank accounts, 82%) makes the proactive hedge clearly better
- on the exact skip-`PUT /project` branch, do not chase a fictional `2`-call shortcut; the initial project read and the filtered VAT read are both still required for perfect correctness
- canonical call counts: skip-PUT = **3**, update-needed+configured = **5**, update-needed+missing = **6**
- do not add a default `GET /invoice/{id}` on the scored run just because the write response leaves `orders[0].project` sparse or null

## Verification Shape

- `POST /project` or `PUT /project/{id}`
  - expect `ResponseWrapperProject`
  - verify:
    - `name`
    - `customer.id`
    - `projectManager.id`
    - `isFixedPrice`
    - `fixedprice`
- `POST /invoice?sendToCustomer=false`
  - expect `ResponseWrapperInvoice`
  - verify:
    - `id`
    - `customer.id`
    - `amountExcludingVatCurrency`
    - `amountCurrencyOutstanding`
    - `projectInvoiceDetails`
- optional `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)`
  - use this one read only when the prompt explicitly requires linked-field proof or for post-run research
  - it can prove:
    - `orders[0].project.id`
    - one real invoiced order line exists

## Avoidable Mistakes

- **CRITICAL: Do not use the lifecycle standard (`register-project-lifecycle-budget-hours-cost-and-invoice`) for this task shape** — the 2026-03-21 run for `Brückentor GmbH / E-Commerce-Entwicklung / 292550 / 33%` scored **0.5/4** because the agent created everything from scratch instead of finding and updating the existing project; for this task shape, the project/customer/PM ALREADY EXIST — always start with `GET /project?name=...`
- Do not use the old 2-call `POST /order` + `PUT /order/:invoice` path; `POST /invoice?sendToCustomer=false` with embedded `orders[]` replaces both in 1 call — sandbox-verified 2026-03-21
- Do not hardcode VAT code `3`; the filtered account-specific outgoing VAT list may only expose another code such as `6`
- Do not blindly choose the highest outgoing VAT percentage when the filtered result already shows the account only allows `0%` on the invoice date
- Do not round percentage-derived milestone amounts to whole NOK; Tripletex accepted `87662.5` directly for a `25%` milestone on `350650`
- Do not invent customer email or address fields when the prompt does not provide them; `invoiceSendMethod: "MANUAL"` is the safer customer-create default for this unsent-invoice flow
- Do not restart from `POST /project` after an invoice-only company-bank-account failure; repair `/ledger/account` and retry the same `POST /invoice`
- Do not add a scored-run `GET /invoice/{id}` only because the invoice write response leaves some fields sparse; that follow-up read is for explicit linked-field proof, not the default fast path
- Do not spend a separate `GET /customer` before `PUT /project/{id}` when one decisive `GET /project?name=...&count=50&fields=*,customer(*)` already proved the exact project and linked customer
- On the update-needed branch, parallelize `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account`; production evidence (9/11 update-needed runs had missing bank accounts, 82%) makes the proactive hedge clearly the better default; only the skip-`PUT /project` branch should remain optimistic
- Do not blindly `PUT /project/{id}` after a successful `GET /project` just because the prompt says "set fixed price"; if that same project row already proves the target `fixedprice`, linked customer, and matching manager, the shorter winning branch is to skip the project write and invoice the milestone directly
- Do not keep a generic fallback `GET /employee` in the hot path after `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)`; if that expanded project row already proves the matching manager email, the extra employee lookup is pure waste
- Do not try to collapse the skip-`PUT /project` branch to `2` calls by omitting either `GET /project` or `GET /ledger/vatType`; the first call is what proves the exact existing project state, and the second call is what keeps taxable accounts from silently getting the wrong VAT result
- Do not assert the prompt-derived milestone amount against `amountCurrencyOutstanding` on taxable accounts; the correct check field is `amountExcludingVatCurrency`
- Do not omit `invoiceDueDate` from `POST /invoice` — it fails `422`; do not omit `customer` from `orders[0]` — it also fails `422`
