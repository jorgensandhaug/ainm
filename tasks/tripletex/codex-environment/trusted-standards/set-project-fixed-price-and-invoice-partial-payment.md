# Set Project Fixed Price And Invoice Partial Payment

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## CRITICAL: Task Matching — This Standard, Not the Lifecycle Standard

- If the prompt gives a **project name + customer org + PM email + fixed price + milestone %**, this IS the correct standard
- Do NOT use `register-project-lifecycle-budget-hours-cost-and-invoice` for this task shape — that standard creates everything from scratch, but for this task the project/customer/PM ALREADY EXIST on fresh production accounts
- The 2026-03-21 production run `Brückentor GmbH / 800357314 / E-Commerce-Entwicklung / Felix Fischer / 292550 / 33%` scored **0.5/4** (3/4 checks failed) because the agent used the lifecycle standard instead of this one: it created a NEW customer, employee, and project instead of finding and updating the existing project — the scorer checked the original project which was never updated
- Language signals: German "Legen Sie einen Festpreis fest" = "set a fixed price" (update existing); "Projektleiter ist" = "the project leader is" (already assigned); these are UPDATE signals, not CREATE signals
- The same pattern applies across all prompt languages: nb "Sett en fastpris", pt "Defina um preço fixo", es "Establezca un precio fijo", fr "Fixez un prix forfaitaire", en "Set a fixed price" — all indicate updating an existing project

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
7. on the update-needed branch (step 6 required `PUT /project` or `POST /project`):
   - `PUT /project/{id}` (or `POST /project`) + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*` + `GET /ledger/account?isBankAccount=true&fields=*` (parallel, 3 calls)
   - if the invoice account (usually `1920`) has an empty `bankAccountNumber`, fix it with `PUT /ledger/account/{id}` using `bankAccountNumber: "12345678903"` before proceeding (0-1 calls)
   - on the skip-`PUT /project` branch (step 6 was skipped), do NOT add the proactive bank check; just `GET /ledger/vatType` alone
8. `POST /invoice?sendToCustomer=false` with root `invoiceDate`, explicit `invoiceDueDate`, root `customer: { id }`, and embedded `orders[]` containing `customer: { id }`, `project: { id }`, `orderDate`, `deliveryDate`, and one `orderLines[]` entry with the milestone amount
9. stop

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
- on `POST /invoice?sendToCustomer=false`, include:
  - root `invoiceDate`
  - root `invoiceDueDate` (omitting fails `422`)
  - root `customer: { "id": ... }`
  - embedded `orders: [{ customer: { "id": ... }, project: { "id": ... }, orderDate, deliveryDate, orderLines: [{ description, count: 1, unitPriceExcludingVatCurrency: <partial-amount>, vatType: { "id": ... } }] }]`
  - `orders[0].customer` must be explicitly set or the endpoint returns `422 orders.customer: Kan ikke være null.`
- for percentage-based milestone prompts:
  - compute the exact 2-decimal partial amount and send that amount directly; do not round milestone amounts to whole NOK
- compare returned `employee.email` exactly because the endpoint filter is containing
- compare returned `customer.organizationNumber` exactly and use prompt customer name only as a local tie-breaker when present
- for update-shaped prompts, also compare nested `project.projectManager.email` exactly when `projectManager(*)` is expanded on the project search
- if the prompt implies a normal taxable service and the filtered outgoing VAT result contains `25%`, use that `25%` row
- if the filtered outgoing VAT result only exposes `0%`, use that one valid row instead of guessing another VAT code
- if the exact update-first project read already proves project + customer + manager and also `fixedprice=<prompt-fixed-price>`, the canonical branch is `GET /ledger/vatType` -> `POST /invoice` in `3` total calls including the initial project read
- there is still no safe `2`-call shortcut on that skip-`PUT /project` branch:
  - the initial `GET /project` is what proves the exact existing project, linked customer, linked manager, and whether `PUT /project` can be skipped
  - the filtered `GET /ledger/vatType` is still required on taxable accounts; omitting `orderLines[].vatType` can silently create the wrong VAT result
- on the update-needed branch (where `PUT /project` is required), the canonical call count is `5` (configured bank) or `6` (missing bank), because `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account` are parallelized, followed by optional bank fix + `POST /invoice`
- do not use `POST /order` + `PUT /order/:invoice` (2 calls); `POST /invoice?sendToCustomer=false` with embedded `orders[]` replaces both in 1 call — sandbox-verified on 2026-03-21
- do not use `createOnAccount` on an order with no real order lines for this task shape

## Reuse From Write Response
- from `POST /project` or `PUT /project/{id}`:
  - `value.id`
  - `value.customer.id`
  - `value.projectManager.id`
  - `value.isFixedPrice`
  - `value.fixedprice`
- from `POST /invoice?sendToCustomer=false`:
  - `value.id`
  - `value.customer.id`
  - `value.amountExcludingVatCurrency`
  - `value.amountCurrencyOutstanding`
  - `value.projectInvoiceDetails`

## Verification
- default verification is zero extra calls after the successful invoice write
- stop after `POST /invoice` succeeds
- do not add a default `GET /invoice/{id}` just because the invoice write response keeps `orders[0].project` sparse or null
- only add `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)` when the prompt explicitly scores linked project fields that the write response omits or later workflow truly depends on them

## Known Recovery Branches
- if `POST /invoice` fails only with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`:
  - `GET /ledger/account?isBankAccount=true&fields=*` (if not already done in step 7)
  - update the existing invoice account with `PUT /ledger/account/{id}` using `bankAccountNumber: "12345678903"`
  - retry the same `POST /invoice` once
- for the exact update-needed project-first branch, the default is the proactive hedge (parallelized with `PUT /project` + `GET /ledger/vatType`):
  - proactive hedge branch (DEFAULT for update-needed): `5` calls when the invoice account is already configured, `6` calls when the company bank account is missing
  - production evidence from 2026-03-20 and 2026-03-21 shows 8/10 update-needed runs had missing bank accounts; at 80% missing rate, proactive hedge is clearly the better default
  - the `POST /invoice` replaces the old `POST /order` + `PUT /order/:invoice` 2-call path, saving 1 call on every branch
- for the exact skip-`PUT /project` branch, stay optimistic: do not add `/ledger/account`; production runs on that branch (`Fossekraft AS`, etc.) have never hit the bank-account issue, and adding it would waste a call on already-mature accounts
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
- exact production reflection on 2026-03-21 for `Elvdal AS` / `834214261` / `ERP-implementering` / `marit.kvamme@example.org` / `429500` / `33%` proved the proactive hedge default change:
  - the run used the optimistic update-needed path: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> failed `PUT /order/:invoice` (422 missing bank account) -> `GET /ledger/account` -> `PUT /ledger/account` -> retry `PUT /order/:invoice` for `8` total calls
  - the proactive hedge would have been `7` calls with zero 4xx errors: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` -> `PUT /ledger/account` -> `PUT /order/:invoice`
  - this is the third update-needed production run: 2/3 had missing bank accounts (this run + `Sjøbris AS`), confirming proactive hedge as the better default
  - the production account exposed outgoing VAT `25%` (id=3), and the successful invoice returned `amountExcludingVatCurrency=141735` and `amountCurrencyOutstanding=177168.75`
  - milestone arithmetic `429500 * 0.33 = 141735` is exact (no decimals) and was accepted directly
- persistent-sandbox verification on 2026-03-21 re-proved the proactive hedge path on existing configured-bank fixture:
  - the update-needed proactive hedge path completed in `6` measured calls: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank configured) -> `PUT /order/:invoice`
  - the sandbox exposed only outgoing VAT `0%` (id=6), and the invoice returned `amountExcludingVatCurrency=141735`
  - therefore the proactive hedge default is verified for both missing-bank (7 calls, production) and configured-bank (6 calls, sandbox) states
- exact production confirmation on 2026-03-21 for `Estrela Lda` / `922471126` / `Migração para nuvem` / `leonor.sousa@example.org` / `313650` / `50%` proved the update-needed proactive-hedge branch on a configured-bank account:
  - the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` found the project with `fixedprice=0` and `isFixedPrice=false`, but correct customer and manager already linked
  - the successful production path was `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank configured) -> `PUT /order/:invoice` for `6` total calls with `0` errors
  - the production account exposed outgoing VAT `25%` (id=3), and the invoice returned `amountExcludingVatCurrency=156825` and `amountCurrencyOutstanding=196031.25`
  - milestone arithmetic `313650 * 0.50 = 156825` is exact (no decimals) and was accepted directly
  - this is the 4th update-needed production run: 2/4 had missing bank accounts (`Sjøbris AS` + `Elvdal AS`), 2/4 had configured accounts (`Tindra AS` + this run); proactive hedge remains the default because at 50/50 it ties on expected calls and wins on errors
- persistent-sandbox verification on 2026-03-21 with current-task arithmetic `313650 * 0.50 = 156825` re-confirmed both branches on a fresh fixture:
  - the update-needed proactive hedge path completed in `6` measured calls: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank configured) -> `PUT /order/:invoice`
  - the skip-`PUT /project` branch completed in `4` measured calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - both proof invoices returned `amountExcludingVatCurrency=156825`; the sandbox exposed only outgoing VAT `0%` (id=6)
  - therefore the conditional `4/6`-call standard (skip-PUT vs update-needed proactive hedge) remains the minimum proven path for this task family on configured-bank accounts
- exact production confirmation on 2026-03-21 for `Stormberg AS` / `957353681` / `Skymigrering` / `magnus.haugen@example.org` / `178450` / `50%` proved the update-needed proactive-hedge branch on a missing-bank account:
  - the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` found the project with correct customer and manager already linked, but `fixedprice` needed update
  - the proactive hedge discovered invoice account `1920` with empty `bankAccountNumber` and fixed it before the invoice write
  - the successful production path was `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` total calls with `0` errors
  - the production account exposed outgoing VAT `25%` (id=3), and the invoice returned `amountExcludingVatCurrency=89225` and `amountCurrencyOutstanding=111531.25`
  - milestone arithmetic `178450 * 0.50 = 89225` is exact (no decimals) and was accepted directly
  - this is the 5th update-needed production run: 3/5 had missing bank accounts (`Sjøbris AS` + `Elvdal AS` + this run), 2/5 had configured accounts (`Tindra AS` + `Estrela Lda`); proactive hedge remains the clear default (60% missing rate means optimistic path would average 6.8 calls + 0.6 errors vs hedge at 6.6 calls + 0 errors)
- persistent-sandbox verification on 2026-03-21 with current-task arithmetic `178450 * 0.50 = 89225` re-confirmed both branches:
  - the update-needed proactive hedge path completed in `6` measured calls (bank was already configured from prior proof): `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank configured) -> `PUT /order/:invoice`
  - the skip-`PUT /project` branch completed in `4` measured calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - both proof invoices returned `amountExcludingVatCurrency=89225`; the sandbox exposed only outgoing VAT `0%` (id=6)
  - therefore the conditional `4/6/7`-call standard (skip-PUT / update-needed+configured / update-needed+missing) remains the minimum proven path for this task family
- exact 2nd production confirmation on 2026-03-21 for `Estrela Lda` / `922471126` / `Migração para nuvem` / `leonor.sousa@example.org` / `313650` / `50%` proved the update-needed proactive-hedge branch on a missing-bank account:
  - the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` found the project with `fixedprice=0` and `isFixedPrice=false`, but correct customer and manager already linked
  - the proactive hedge discovered invoice account `1920` with empty `bankAccountNumber` and fixed it before the invoice write
  - the successful production path was `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` total calls with `0` errors
  - the production account exposed outgoing VAT `25%` (id=3), and the invoice returned `amountExcludingVatCurrency=156825` and `amountCurrencyOutstanding=196031.25`
  - milestone arithmetic `313650 * 0.50 = 156825` is exact (no decimals) and was accepted directly
  - this is the 6th update-needed production run: 4/6 had missing bank accounts (`Sjøbris AS` + `Elvdal AS` + `Stormberg AS` + this run), 2/6 had configured accounts (`Tindra AS` + prior `Estrela Lda` run); proactive hedge is now clearly dominant (67% missing rate means optimistic would average 7.0 calls + 0.67 errors vs hedge at 6.67 calls + 0 errors)
  - notably, the same task (`Estrela Lda` / `922471126`) ran twice: first with bank configured (6 calls), then with bank missing (7 calls); this confirms that bank-account state varies between fresh production accounts even for identical task prompts
- persistent-sandbox verification on 2026-03-21 with current-task arithmetic `313650 * 0.50 = 156825` re-confirmed both branches:
  - the update-needed proactive hedge path completed in `6` measured calls (bank already configured from prior sandbox proof): `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank configured) -> `PUT /order/:invoice`
  - the skip-`PUT /project` branch completed in `4` measured calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - both proof invoices returned `amountExcludingVatCurrency=156825`; the sandbox exposed only outgoing VAT `0%` (id=6)
  - therefore the conditional `4/6/7`-call standard remains the minimum proven path for this task family
- exact production confirmation on 2026-03-21 for `Cascade SARL` / `813648164` / `Projet d'automatisation` / `hugo.bernard@example.org` / `326550` / `75%` proved the update-needed proactive-hedge branch on a missing-bank account:
  - the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` found the project with correct customer and PM already linked, but `fixedprice` needed update
  - the proactive hedge discovered invoice account `1920` with empty `bankAccountNumber` and fixed it before the invoice write
  - the successful production path was `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` total calls with `0` errors
  - the production account exposed outgoing VAT `25%` (id=3), and the invoice returned `amountExcludingVatCurrency=244912.5` and `amountCurrencyOutstanding=306140.63`
  - milestone arithmetic `326550 * 0.75 = 244912.5` — first production confirmation of the 75% milestone percentage; decimal amount accepted directly
  - this is the 7th update-needed production run: 5/7 had missing bank accounts (`Sjøbris AS` + `Elvdal AS` + `Stormberg AS` + `Estrela Lda` 2nd + this run), 2/7 had configured accounts (`Tindra AS` + `Estrela Lda` 1st); proactive hedge now at 71% missing rate (optimistic would average 7.14 calls + 0.71 errors vs hedge at 6.71 calls + 0 errors)
- persistent-sandbox verification on 2026-03-21 with current-task arithmetic `326550 * 0.75 = 244912.5` re-confirmed both branches:
  - the update-needed proactive hedge path completed in `6` measured calls (bank already configured from prior sandbox proof): `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank configured) -> `PUT /order/:invoice`
  - the skip-`PUT /project` branch completed in `4` measured calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - both proof invoices returned `amountExcludingVatCurrency=244912.5`; the sandbox exposed only outgoing VAT `0%` (id=6)
  - therefore the conditional `4/6/7`-call standard remains the minimum proven path for this task family
- exact production confirmation on 2026-03-21 for `Havbris AS` / `876325497` / `Nettbutikk-utvikling` / `ingrid.moe@example.org` / `363850` / `75%` proved the update-needed proactive-hedge branch on a missing-bank account:
  - the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` found the project with correct customer and PM already linked, but `fixedprice` needed update
  - the proactive hedge discovered invoice account `1920` with empty `bankAccountNumber` and fixed it before the invoice write
  - the successful production path was `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` total calls with `0` errors
  - the production account exposed outgoing VAT `25%` (id=3), and the invoice returned `amountExcludingVatCurrency=272887.5` and `amountCurrencyOutstanding=341109.38`
  - milestone arithmetic `363850 * 0.75 = 272887.5` — second production confirmation of the 75% milestone percentage; decimal amount accepted directly
  - this is the 8th update-needed production run: 6/8 had missing bank accounts (75%); proactive hedge averages 6.75 calls + 0 errors vs optimistic 7.25 + 0.75 errors
- persistent-sandbox verification on 2026-03-21 with current-task arithmetic `363850 * 0.75 = 272887.5` re-confirmed the update-needed proactive-hedge path:
  - the update-needed proactive hedge path completed in `6` measured calls (bank already configured from prior sandbox proof): `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank configured) -> `PUT /order/:invoice`
  - proof invoice returned `amountExcludingVatCurrency=272887.5`; the sandbox exposed only outgoing VAT `0%` (id=6)
  - therefore the conditional `4/6/7`-call standard remains the minimum proven path for this task family
- exact production confirmation on 2026-03-21 for `Solmar SL` / `866378843` / `Implementación ERP` / `maria.sanchez@example.org` / `457650` / `25%` proved the update-needed proactive-hedge branch on a missing-bank account:
  - the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` found the project with correct customer and PM already linked, but `fixedprice` needed update
  - the proactive hedge discovered invoice account `1920` with empty `bankAccountNumber` and fixed it before the invoice write
  - the successful production path was `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` total calls with `0` errors
  - the production account exposed outgoing VAT `25%` (id=3), and the invoice returned `amountExcludingVatCurrency=114412.5` and `amountCurrencyOutstanding=143015.63`
  - milestone arithmetic `457650 * 0.25 = 114412.5` — third production confirmation of the 25% milestone percentage; decimal amount accepted directly
  - this is the 9th update-needed production run: 7/9 had missing bank accounts (78%); proactive hedge averages 6.78 calls + 0 errors vs optimistic 7.33 + 0.78 errors
- persistent-sandbox verification on 2026-03-21 with current-task arithmetic `457650 * 0.25 = 114412.5` re-confirmed both branches:
  - the update-needed proactive hedge path completed in `6` measured calls (bank already configured from prior sandbox proof): `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank configured) -> `PUT /order/:invoice`
  - the skip-`PUT /project` branch completed in `4` measured calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - both proof invoices returned `amountExcludingVatCurrency=114412.5`; the sandbox exposed only outgoing VAT `0%` (id=6)
  - therefore the conditional `4/6/7`-call standard remains the minimum proven path for this task family
- exact production confirmation on 2026-03-21 for `Horizonte Lda` / `804639764` / `Melhoria de infraestrutura` / `sofia.ferreira@example.org` / `228150` / `50%` proved the update-needed proactive-hedge branch on a missing-bank account:
  - the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` found the project with `fixedprice=0` and `isFixedPrice=false`, but correct customer and PM already linked
  - the proactive hedge discovered invoice account `1920` with empty `bankAccountNumber` and fixed it before the invoice write
  - the successful production path was `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` total calls with `0` errors
  - the production account exposed outgoing VAT `25%` (id=3), and the invoice returned `amountExcludingVatCurrency=114075` and `amountCurrencyOutstanding=142593.75`
  - milestone arithmetic `228150 * 0.50 = 114075` is exact (no decimals) and was accepted directly
  - this is the 10th update-needed production run: 8/10 had missing bank accounts (80%); proactive hedge averages 6.8 calls + 0 errors vs optimistic 7.4 + 0.8 errors
- persistent-sandbox verification on 2026-03-21 with current-task arithmetic `228150 * 0.50 = 114075` re-confirmed both branches:
  - the update-needed proactive hedge path completed in `6` measured calls (bank already configured from prior sandbox proof): `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank configured) -> `PUT /order/:invoice`
  - the skip-`PUT /project` branch completed in `4` measured calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
  - both proof invoices returned `amountExcludingVatCurrency=114075`; the sandbox exposed only outgoing VAT `0%` (id=6)
  - therefore the conditional `4/6/7`-call standard remains the minimum proven path for this task family
- exact production confirmation on 2026-03-21 for `Brightstone Ltd` / `850116091` / `Infrastructure Upgrade` / `charlotte.walker@example.org` / `170500` / `33%` proved the update-needed proactive-hedge branch on a missing-bank account:
  - the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` found the project with `fixedprice=0` and `isFixedPrice=false`, PM already matched
  - the proactive hedge discovered invoice account `1920` with empty `bankAccountNumber` and fixed it before the invoice write
  - the successful production path was `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` (bank missing) -> `PUT /ledger/account` -> `PUT /order/:invoice` for `7` total calls with `0` errors
  - the production account exposed outgoing VAT `25%` (id=3), and the invoice returned `amountExcludingVatCurrency=56265` and `amountCurrencyOutstanding=70331.25`
  - milestone arithmetic `170500 * 0.33 = 56265` is exact (no decimals) and was accepted directly
  - this is the 11th update-needed production run: 9/11 had missing bank accounts (82%)
  - POST-RUN OPTIMIZATION: sandbox-verified on 2026-03-21 that `POST /invoice?sendToCustomer=false` with embedded `orders[]` replaces the 2-call `POST /order` + `PUT /order/:invoice` in 1 call
  - new call counts: skip-PUT = **3** (was 4), update-needed+configured = **5** (was 6), update-needed+missing = **6** (was 7)
- persistent-sandbox verification on 2026-03-21 for the `POST /invoice` optimization:
  - the update-needed path with `POST /invoice` completed in `5` measured calls: `GET /project` -> parallel(`PUT /project` + `GET /ledger/vatType` + `GET /ledger/account`) -> `POST /invoice`; returned `amountExcludingVatCurrency=81114` (`245800 * 0.33`) with `projectInvoiceDetails.length=1`
  - the skip-PUT path with `POST /invoice` completed in `3` measured calls: `GET /project` -> `GET /ledger/vatType` -> `POST /invoice`; returned `amountExcludingVatCurrency=56265` (`170500 * 0.33`) with `projectInvoiceDetails.length=1`
  - `POST /invoice` requires both root `invoiceDate` and root `invoiceDueDate` (omitting `invoiceDueDate` fails `422`)
  - `POST /invoice` requires `customer: { id }` in both the root payload and inside each `orders[]` entry (omitting `orders[0].customer` fails `422`)
  - therefore the new conditional `3/5/6`-call standard replaces the old `4/6/7`-call standard for this task family
- CRITICAL FAILURE on 2026-03-21 for `Brückentor GmbH` / `800357314` / `E-Commerce-Entwicklung` / `felix.fischer@example.org` / `292550` / `33%` (run c9831f7e):
  - the agent used the WRONG trusted standard (`register-project-lifecycle-budget-hours-cost-and-invoice` instead of this one)
  - it created a NEW customer, employee, and project from scratch instead of finding and updating the existing ones
  - the original pre-existing project was left with `fixedprice=0` and `isFixedPrice=false` — never updated
  - the invoice was linked to the new project, not the original one that the scorer checks
  - result: **0.5/4** (1/4 checks passed — only the customer org check passed; fixedprice, PM, and invoice checks all failed)
  - the run used 10 API calls with 0 errors, vs the optimal 5-6 calls with perfect correctness using this standard
  - root cause: the German prompt "Legen Sie einen Festpreis fest" was misinterpreted as "create a new project" instead of "update the existing project's fixed price"
  - LESSON: for this task family, the project/customer/PM ALWAYS exist on fresh production accounts; ALWAYS start with `GET /project?name=...` to find and update them
- same-session persistent-sandbox verification on 2026-03-21 (post-run c9831f7e reflection) re-confirmed the direct `POST /invoice` path:
  - update-needed path: `GET /project` -> parallel(`PUT /project` + `GET /ledger/vatType` + `GET /ledger/account`) -> `POST /invoice` = 5 measured calls; returned `amountExcludingVatCurrency=96541.5` (`292550 * 0.33`) with `projectInvoiceDetails.length=1`
  - skip-PUT path: `GET /project` -> `GET /ledger/vatType` -> `POST /invoice` = 3 measured calls; returned `amountExcludingVatCurrency=96541.5` with `projectInvoiceDetails.length=1`
  - both paths confirmed: direct `POST /invoice?sendToCustomer=false` replaces old `POST /order` + `PUT /order/:invoice` saving 1 call
  - 12th+ production confirmation of this task family overall; first run to use `POST /invoice` in production (albeit on wrong entities); first run to expose the critical task-matching error
- exact production confirmation on 2026-03-22 for `Rivière SARL` / `852968737` / `Projet d'automatisation` / `nathan.martin@example.org` / `170650` / `25%` proved the update-needed proactive-hedge branch on a missing-bank account with the `POST /invoice` optimization:
  - the initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` found the project with `fixedprice=0` and `isFixedPrice=false`, but correct customer and PM already linked (PM email matched exactly)
  - the proactive hedge discovered invoice account `1920` with empty `bankAccountNumber` and fixed it before the invoice write
  - the successful production path was `GET /project` -> parallel(`PUT /project` + `GET /ledger/vatType` + `GET /ledger/account`) -> `PUT /ledger/account` -> `POST /invoice` for `6` total calls with `0` errors
  - the production account exposed outgoing VAT `25%` (id=3), and the invoice returned `amountExcludingVatCurrency=42662.5` and `amountCurrencyOutstanding=53328.13`
  - milestone arithmetic `170650 * 0.25 = 42662.5` — fourth production confirmation of the 25% milestone percentage; decimal amount accepted directly
  - this is the first production run to successfully use `POST /invoice?sendToCustomer=false` with embedded `orders[]` on the correct entities (prior Brückentor run used POST /invoice but on wrong entities); confirms the 1-call saving over old `POST /order` + `PUT /order/:invoice` path holds in production
  - this is the 12th update-needed production run: 10/12 had missing bank accounts (83%); proactive hedge averages 5.83 calls + 0 errors vs optimistic would average 6.5 + 0.83 errors
- persistent-sandbox verification on 2026-03-22 with current-task arithmetic `170650 * 0.25 = 42662.5` re-confirmed both branches:
  - the update-needed proactive hedge path completed in `5` measured calls (bank already configured from prior sandbox proof): `GET /project` -> parallel(`PUT /project` + `GET /ledger/vatType` + `GET /ledger/account`) -> `POST /invoice`
  - the skip-`PUT /project` branch completed in `3` measured calls: `GET /project` -> `GET /ledger/vatType` -> `POST /invoice`
  - both proof invoices returned `amountExcludingVatCurrency=42662.5`; the sandbox exposed outgoing VAT `25%` (id=3)
  - therefore the conditional `3/5/6`-call standard remains the minimum proven path for this task family
