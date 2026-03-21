# Set Project Fixed Price And Invoice Partial Payment

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- set or update one project's fixed price
- link or keep that project on one customer identified by `organizationNumber`
- set or keep one project manager identified by `email`
- create one unsent milestone invoice for a percentage or amount of that fixed price
- prompt does not ask to send the invoice

## Do Not Use This Standard If
- the task is hour-based project invoicing rather than fixed-price partial billing
- the task requires sending the invoice
- the task is mainly a create-project task with no invoice
- the prompt is too ambiguous to resolve the customer or manager decisively

## Standard Flow
1. first try one decisive update-first resolver: `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)`
2. if that read leaves one exact `project.name` hit whose nested `customer.organizationNumber` matches the prompt:
   - reuse `project.id`, `customer.id`, and the existing `startDate`
   - if nested `projectManager.email` also matches the prompt, reuse `projectManager.id` and skip a separate `GET /employee`
   - otherwise resolve the manager with `GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*`
   - if the same expanded row also already shows `fixedprice=<prompt-fixed-price>` and the manager already matches, skip `PUT /project/{id}` entirely and continue from VAT lookup
3. if the project-first read did not already prove the exact project and customer, resolve the customer with `GET /customer?organizationNumber=...&count=10&fields=*`
4. only if the customer does not already exist, `POST /customer` with `invoiceSendMethod: "MANUAL"` when the prompt gives no delivery details
5. if the project-first read did not already prove the correct project manager, resolve the manager with `GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*`
6. if the project is missing, `POST /project`; if the project exists but the current row does not already prove the target fixed-price + manager state, `PUT /project/{id}`; otherwise skip the project write
7. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
8. `POST /order` with one project-linked milestone line
9. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
10. stop

## Payload Rules
- on `POST /project` or `PUT /project/{id}`, include:
  - `name`
  - `startDate`
  - `customer: { "id": ... }`
  - `projectManager: { "id": ... }`
  - `isFixedPrice: true`
  - `fixedprice: <full-fixed-price>`
  - `invoiceOnAccountVatHigh: false`
- on `PUT /project/{id}` for an existing project where the prompt does not ask to change the start date:
  - reuse the existing `startDate` returned by the project search instead of overwriting it with the run date
- on `POST /order`, include:
  - `customer: { "id": ... }`
  - `project: { "id": ... }`
  - `orderDate`
  - `deliveryDate`
  - one embedded `orderLines[]` entry with:
    - `description`
    - `count: 1`
    - `unitPriceExcludingVatCurrency: <partial-amount>`
    - `vatType: { "id": ... }`
- for percentage-based milestone prompts:
  - compute the exact 2-decimal partial amount and send that amount directly; do not round milestone amounts to whole NOK
- compare returned `employee.email` exactly because the endpoint filter is containing
- compare returned `customer.organizationNumber` exactly and use prompt customer name only as a local tie-breaker when present
- for update-shaped prompts, also compare nested `project.projectManager.email` exactly when `projectManager(*)` is expanded on the project search
- if the prompt implies a normal taxable service and the filtered outgoing VAT result contains `25%`, use that `25%` row
- if the filtered outgoing VAT result only exposes `0%`, use that one valid row instead of guessing another VAT code
- if the exact update-first project read already proves project + customer + manager and also `fixedprice=<prompt-fixed-price>`, the canonical branch is `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` in `4` total calls including the initial project read
- there is still no safe `3`-call shortcut on that skip-`PUT /project` branch:
  - the initial `GET /project` is what proves the exact existing project, linked customer, linked manager, and whether `PUT /project` can be skipped
  - the filtered `GET /ledger/vatType` is still required on taxable accounts; omitting `orderLines[].vatType` can silently create the wrong VAT result
- only use the `5`-call branch with `PUT /project` when that initial project row proves the right project but not yet the target fixed price and manager state; do not insert a default `/ledger/account` preflight between `POST /order` and `PUT /order/:invoice`
- do not use `createOnAccount` on an order with no real order lines for this task shape

## Reuse From Write Response
- from `POST /project` or `PUT /project/{id}`:
  - `value.id`
  - `value.customer.id`
  - `value.projectManager.id`
  - `value.isFixedPrice`
  - `value.fixedprice`
- from `POST /order`:
  - `value.id`
- from `PUT /order/{id}/:invoice`:
  - `value.id`
  - `value.customer.id`
  - `value.amountExcludingVatCurrency`
  - `value.amountCurrencyOutstanding`

## Verification
- default verification is zero extra calls after the successful invoice write
- stop after `PUT /order/{id}/:invoice` succeeds
- do not add a default `GET /invoice/{id}` just because the invoice write response keeps `orders[0].project` sparse or null
- only add `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)` when the prompt explicitly scores linked project fields that the write response omits or later workflow truly depends on them

## Known Recovery Branches
- if `PUT /order/{id}/:invoice` fails only with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - update the existing invoice account with `PUT /ledger/account/{id}` using a valid unique 11-digit `bankAccountNumber`
  - retry the same `PUT /order/{id}/:invoice?...` once
  - do not create a second order or project
- for the exact update-needed project-first branch, the hedge tradeoff is now explicit:
  - optimistic branch: `5` calls when the invoice account is already configured, `8` calls when the company bank account is missing and the run has to recover after the failed invoice write
  - proactive hedge branch: `6` calls when the invoice account is already configured, `7` calls when the company bank account is missing
- because same-day production proved both states for this exact task family, there is still no universal winner; only take that proactive `/ledger/account` read when the run evidence makes a missing company bank account more likely than an already-configured invoice account
- if the filtered outgoing VAT result has no row that matches the prompt's intended taxable behavior and only unsupported rows remain, treat the task as blocked instead of guessing a VAT code

## OpenAPI / Sandbox Status
- `/project`, `/order`, `/order/{id}/:invoice`, `/ledger/vatType`, and `/ledger/account` verified in `./openapi.json`
- persistent-sandbox re-verification on 2026-03-20 proved:
  - `PUT /project/{id}` updates `fixedprice` successfully
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` may expose only VAT code `6` (`0%`) in that account
  - `PUT /order/{id}/:invoice` can already prove totals and outstanding amount while still leaving nested project linkage sparse/null in the write response
- persistent-sandbox optimization re-verification on 2026-03-20 additionally proved:
  - `GET /project?name=<exact-name>&count=50&fields=*,customer(*),projectManager(*)` can already return enough nested customer and manager data to skip separate `GET /customer` and `GET /employee` calls when the project already exists, the nested `customer.organizationNumber` matches, and the nested `projectManager.email` matches
  - that exact update-first branch completed successfully in `5` calls after fixture setup: project read, project update, VAT read, order create, invoice write
  - reusing that project read's `startDate` on `PUT /project/{id}` updated `fixedprice` successfully without changing the project's start date
  - `POST /order` plus `PUT /order/{id}/:invoice` preserved a percentage-derived decimal partial amount of `87662.5` exactly; do not round `25%` milestone amounts such as `350650 * 0.25`
  - omitting `orderLines[].vatType` on the same sandbox account also succeeded only because the filtered outgoing VAT list exposed a single `0%` row; do not generalize that as the trusted scored-run shortcut
- exact production reflection on 2026-03-20 proved two score-relevant optimizations for this task shape:
  - the later `GET /invoice/{id}` was not part of the minimum scored path
  - on a fresh account with missing company invoice bank account number, proactive `/ledger/account` preflight before the first invoice write would have saved one Tripletex call and avoided one `422`
- exact production reflection on 2026-03-20 for `Tindra AS` / `870827946` / `Nettbutikk-utvikling` / `kristian.nilsen@example.org` / `181650` / `50%` plus persistent-sandbox proof on the same date established the opposite branch for already-configured accounts:
  - the production run finished correctly but scored `3.33/4` because it inserted a proactive `GET /ledger/account?isBankAccount=true&fields=*` before the invoice write
  - that proactive read showed invoice account `1920` already had a valid `bankAccountNumber`
  - persistent sandbox then re-proved the same update-first task shape succeeds in `5` measured calls without `/ledger/account` when the invoice account is already configured
  - therefore the default exact-match path stays optimistic `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`, with `/ledger/account` reserved for the specific missing-bank-account branch or for runs that already proved that prerequisite is missing
- persistent-sandbox re-proof on 2026-03-20 for the same prompt shape as `Estrella SL` / `816896770` / `Desarrollo e-commerce` / `375250` / `33%` confirmed the amount and call-count behavior still hold:
  - after fixture setup, the measured proof path again stayed at `5` calls: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - `375250 * 0.33` was accepted directly as `123832.5` on the milestone line; do not coerce that amount to whole NOK or unnecessary two-decimal string formatting
  - that sandbox account still exposed only the filtered outgoing `0%` VAT row (`id=6`), and the invoice write still returned `amountExcludingVatCurrency=123832.5` plus `amountCurrencyOutstanding=123832.5`
- post-run scoring on 2026-03-20 for `Soleil SARL` / `931336738` / `Mise à niveau infrastructure` / `nathan.thomas@example.org` / `125550` / `25%` showed that the production solution was still one call above the true minimum even after removing `/ledger/account`
  - the remaining likely waste was `PUT /project`, because the scored result was `8/8` correctness but only `3.5/4` efficiency
  - that production account exposed outgoing VAT `25%`, and the successful invoice write proved `amountExcludingVatCurrency=31387.5` with `amountCurrencyOutstanding=39234.38`; verify the milestone amount against the excluding-VAT field, not the VAT-inclusive outstanding balance
- persistent-sandbox analog re-proof on 2026-03-20 with the same fixed-price / `25%` milestone arithmetic (`125550 * 0.25 = 31387.5`) proved the missing lower-call branch after fixture setup:
  - when the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` already proved the exact project, nested customer, nested manager email, and `fixedprice=125550`, the measured winning path was only `4` calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - that sandbox still exposed only outgoing VAT `0%`, so the analog invoice returned `amountExcludingVatCurrency=31387.5` and `amountCurrencyOutstanding=31387.5`
  - therefore the new canonical exact-match branch is conditional: skip `PUT /project` whenever the first project read already proves the target project state, and use the older `5`-call branch only when a project mutation is still required
- exact production confirmation on 2026-03-20 for `Fossekraft AS` / `907433498` / `Automatiseringsprosjekt` / `solveig.eide@example.org` / `430750` / `50%` proved that the same skip-`PUT /project` branch is also the true minimum on a taxable account:
  - the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` already proved the exact project, nested customer, nested manager email, and `fixedprice=430750`
  - the successful production path was `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` for `4` total calls, with no `GET /customer`, no `GET /employee`, and no `PUT /project`
  - that production account exposed outgoing VAT `25%`, and the invoice write returned `amountExcludingVatCurrency=215375` plus `amountCurrencyOutstanding=269218.75`
  - this also closes the remaining shortcut question for the skip-`PUT` branch: there is still no realistic `3`-call path, because removing the VAT read risks the wrong tax result and removing the initial project read removes the proof that skipping `PUT /project` is safe
- later production reflection on 2026-03-20 for `Sjøbris AS` / `825338756` / `Automatiseringsprosjekt` / `knut.kvamme@example.org` / `316000` / `50%`, plus a same-day persistent-sandbox analog proof, sharpened the remaining bank-account heuristic on the update-needed branch:
  - the production run used the exact project-first update branch and the first invoice write failed with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`
  - the successful production path became `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> failed `PUT /order/:invoice` -> `GET /ledger/account` -> `PUT /ledger/account/{id}` -> retry `PUT /order/:invoice` for `8` total calls
  - the same-day persistent sandbox still had invoice account `1920` with `bankAccountNumber=12345678903`, and an analog proof run measured the configured-account update branch at `5` calls plus the already-known skip-`PUT` branch at `4` calls
  - therefore the remaining decision is not a new canonical path but an explicit tradeoff for the update-needed branch: optimistic path `5/8`, proactive hedge `6/7`; choose from run evidence about whether the company invoice bank account is likely missing
- a same-session persistent-sandbox analog on 2026-03-20 with current-task arithmetic `498050 * 0.50 = 249025` re-confirmed that no lower-call shortcut has appeared since those earlier proofs:
  - after fixture setup, the skip-`PUT /project` branch again measured exactly `4` calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - after fixture setup, the update-needed branch again measured exactly `5` calls: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - the sandbox still exposed only outgoing `0%` VAT on that date, and both proof invoices returned `amountExcludingVatCurrency=249025`
  - therefore the existing conditional `4/5`-call standard remains the minimum proven public path for this task family when bank-account repair is not needed
- exact production reflection on 2026-03-20 for `Windkraft GmbH` / `886395582` / `Datensicherheit` / `maximilian.wagner@example.org` / `473250` / `25%` added one more same-day floor check:
  - the run finished with full correctness (`4/4` checks passed) but only `2.96` normalized score, so it still sat above the minimum-call floor for this task family
  - the invoice write proved taxable-account arithmetic `amountExcludingVatCurrency=118312.5` and `amountCurrencyOutstanding=147890.63`
  - because the run trace did not preserve the exact HTTP branch, the safe corrective rule is still branch discipline rather than a new endpoint guess: after the initial expanded `GET /project`, spend `GET /employee` only when `projectManager.email` does not already match, and spend `PUT /project` only when that same row does not already prove `fixedprice=<prompt-fixed-price>`
- a same-session persistent-sandbox analog with current-task arithmetic `473250 * 0.25 = 118312.5` re-proved those same floors on fixture `Datensicherheit Reflection 2498866c`:
  - after fixture setup, the update-needed branch again measured exactly `5` calls: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - after the same fixture had already been updated to the target fixed price, the skip-`PUT /project` branch again measured exactly `4` calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - both proof invoices returned `amountExcludingVatCurrency=118312.5`, so no extra normalization, verification read, or manager re-lookup belongs in the canonical path once the expanded project row already proves the target state
