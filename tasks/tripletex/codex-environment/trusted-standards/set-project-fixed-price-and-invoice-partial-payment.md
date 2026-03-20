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
1. `GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*`
2. first try one decisive project-first resolver: `GET /project?name=...&count=50&fields=*,customer(*)`
3. if that read leaves one exact `project.name` hit whose nested `customer.organizationNumber` matches the prompt, reuse `project.id`, `customer.id`, and the existing `startDate`, and skip a separate `GET /customer`
4. otherwise, `GET /customer?organizationNumber=...&count=10&fields=*`
5. only if the customer does not already exist, `POST /customer` with `invoiceSendMethod: "MANUAL"` when the prompt gives no delivery details
6. `POST /project` if missing, otherwise `PUT /project/{id}`
7. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
8. `POST /order` with one project-linked milestone line
9. if this is likely the first outgoing invoice in a fresh-account run, `GET /ledger/account?isBankAccount=true&fields=*`
10. only if the chosen invoice account lacks `bankAccountNumber`, `PUT /ledger/account/{id}` once
11. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
12. stop

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
- if the prompt implies a normal taxable service and the filtered outgoing VAT result contains `25%`, use that `25%` row
- if the filtered outgoing VAT result only exposes `0%`, use that one valid row instead of guessing another VAT code
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
- if you intentionally skipped the fresh-account bank-account preflight and `PUT /order/{id}/:invoice` fails only with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - update the existing invoice account with `PUT /ledger/account/{id}` using a valid unique 11-digit `bankAccountNumber`
  - retry the same `PUT /order/{id}/:invoice?...` once
  - do not create a second order or project
- if the filtered outgoing VAT result has no row that matches the prompt's intended taxable behavior and only unsupported rows remain, treat the task as blocked instead of guessing a VAT code

## OpenAPI / Sandbox Status
- `/project`, `/order`, `/order/{id}/:invoice`, `/ledger/vatType`, and `/ledger/account` verified in `./openapi.json`
- persistent-sandbox re-verification on 2026-03-20 proved:
  - `PUT /project/{id}` updates `fixedprice` successfully
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` may expose only VAT code `6` (`0%`) in that account
  - `PUT /order/{id}/:invoice` can already prove totals and outstanding amount while still leaving nested project linkage sparse/null in the write response
- persistent-sandbox optimization re-verification on 2026-03-20 additionally proved:
  - `GET /project?name=<exact-name>&count=50&fields=*,customer(*)` can already return enough nested customer data to skip a separate `GET /customer` when the project already exists and the nested `customer.organizationNumber` matches
  - reusing that project read's `startDate` on `PUT /project/{id}` updated `fixedprice` successfully without changing the project's start date
  - `POST /order` plus `PUT /order/{id}/:invoice` preserved a percentage-derived decimal partial amount of `87662.5` exactly; do not round `25%` milestone amounts such as `350650 * 0.25`
  - omitting `orderLines[].vatType` on the same sandbox account also succeeded only because the filtered outgoing VAT list exposed a single `0%` row; do not generalize that as the trusted scored-run shortcut
- exact production reflection on 2026-03-20 proved two score-relevant optimizations for this task shape:
  - the later `GET /invoice/{id}` was not part of the minimum scored path
  - on a fresh account with missing company invoice bank account number, proactive `/ledger/account` preflight before the first invoice write would have saved one Tripletex call and avoided one `422`
