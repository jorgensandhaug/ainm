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

## Minimal Safe Flow

1. Confirm these operations in `./openapi.json`
   - `GET /employee`
   - `GET /customer`
   - optional `POST /customer`
   - `GET /project`
   - `POST /project` or `PUT /project/{id}`
   - `GET /ledger/vatType`
   - `POST /order`
   - `PUT /order/{id}/:invoice`
2. First try a project-first resolver for update-shaped prompts
   - `GET /project?name=<project-name>&count=50&fields=*,customer(*),projectManager(*)`
   - if that one read already leaves one exact `project.name` hit whose nested `customer.organizationNumber` matches the prompt, reuse `project.id`, `customer.id`, and the returned `startDate`
   - if the same expanded row also shows nested `projectManager.email=<prompt-email>`, reuse `projectManager.id` too and skip a separate `GET /employee`
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
   - if the project-first read already found the exact project, `PUT /project/{id}` directly
   - otherwise, if the customer is now known but the project is still unresolved, create it with `POST /project`
7. Set the project fixed-price fields
   - `startDate`
   - `customer: { "id": ... }`
   - `projectManager: { "id": ... }`
   - `isFixedPrice: true`
   - `fixedprice: <full-fixed-price>`
   - `invoiceOnAccountVatHigh: false`
   - for `PUT /project/{id}` on an existing project, reuse the `startDate` returned by the project search unless the prompt explicitly asks to change it
8. Resolve a valid outgoing VAT type for the invoice date
   - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
   - choose from the filtered response, not from a hardcoded VAT code
   - if the prompt implies a normal taxable service and the filtered result includes `25%`, use that `25%` row
   - if the filtered result only exposes `0%`, use that one valid row rather than guessing another VAT code
   - even if omitting `vatType` happens to work in a sandbox that only exposes one `0%` row, do not treat that as the scored-run fast path
9. Create an order linked to the project with one real partial-billing line
   - `POST /order`
   - include:
     - `customer`
     - `project`
     - `orderDate`
     - `deliveryDate`
     - one embedded `orderLines[]` entry for the partial amount
   - for percentage-derived milestones, send the exact 2-decimal amount; do not round values like `350650 * 0.25 = 87662.5`
10. Invoice the order without sending it
   - `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
11. Only if the invoice write fails with the company-bank-account validation, or earlier calls in the same run already proved that prerequisite is missing, repair that prerequisite and retry the same order once
   - `GET /ledger/account?isBankAccount=true&fields=*`
   - choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
   - `PUT /ledger/account/{id}` with a valid unique 11-digit `bankAccountNumber`
   - retry `PUT /order/{id}/:invoice?...` on the same order
12. Verify from the write response first
   - reuse the invoice totals from `response.value`
13. For scored runs, stop after the successful invoice write unless the prompt explicitly requires linked-field proof
14. Only for explicit linked-field verification or post-run research, do one decisive read
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

Order create for the partial billing:

```json
{
  "customer": { "id": 12345 },
  "project": { "id": 54321 },
  "orderDate": "2026-03-20",
  "deliveryDate": "2026-03-20",
  "invoiceOnAccountVatHigh": false,
  "orderLines": [
    {
      "description": "Partial billing 75% of fixed price",
      "count": 1,
      "unitPriceExcludingVatCurrency": 281175,
      "vatType": { "id": 6 }
    }
  ]
}
```

In real tasks, replace VAT id `6` with the VAT type actually returned by the filtered `GET /ledger/vatType` call for the invoice date.

## Exact-Match Fast Path

- For a prompt that gives:
  - customer organization number and name
  - project name
  - project manager email
  - full fixed price
  - partial-billing percentage or amount
- the lower-call fresh-account flow is usually:
 - the lower-call exact-match flow is usually:
  1. `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)`
  2. if that read already proves the exact project, nested customer match, and nested manager email match, `PUT /project/{id}` directly using the returned `customer.id`, `projectManager.id`, and `startDate`
  3. otherwise do one conditional `GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*`
  4. if the project-first read did not already prove the customer, `GET /customer?organizationNumber=...&count=10&fields=*`
  5. optional `POST /customer` with `invoiceSendMethod: "MANUAL"` if missing
  6. `POST /project` if missing, otherwise `PUT /project/{id}`
  7. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`
  8. `POST /order` with one embedded partial-billing line
  9. `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`
- only add `/ledger/account` between steps 8 and 9 when earlier evidence in the same run already proves the company invoice bank account is missing
- if the project-first read already finds the exact project and exact existing manager, this shape saves two API calls versus always doing customer-first plus employee-first lookup while still keeping the exact same write path
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
- `POST /order`
  - trust the returned `id`
  - do not over-trust `response.value.orderLines`
- `PUT /order/{id}/:invoice`
  - expect `ResponseWrapperInvoice`
  - verify:
    - `id`
    - `customer.id`
    - `amountExcludingVatCurrency`
    - `amountCurrencyOutstanding`
- optional `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)`
  - use this one read only when the prompt explicitly requires linked-field proof or for post-run research
  - it can prove:
    - `orders[0].project.id`
    - one real invoiced order line exists

## Avoidable Mistakes

- Do not assume `createOnAccount` lets you invoice a line-less order for this task shape
- Do not trust `POST /order` returning `orderLines=[]` as proof that the embedded line was ignored
- Do not hardcode VAT code `3`; the filtered account-specific outgoing VAT list may only expose another code such as `6`
- Do not blindly choose the highest outgoing VAT percentage when the filtered result already shows the account only allows `0%` on the invoice date
- Do not rely on `invoice.projectInvoiceDetails` for verification; it can be `null` even when the invoice is correctly linked to the project through `orders[0].project`
- Do not round percentage-derived milestone amounts to whole NOK; Tripletex accepted `87662.5` directly for a `25%` milestone on `350650`
- Do not invent customer email or address fields when the prompt does not provide them; `invoiceSendMethod: "MANUAL"` is the safer customer-create default for this unsent-invoice flow
- Do not restart from `POST /project` or `POST /order` after an invoice-only company-bank-account failure; repair `/ledger/account` and retry the same order
- Do not add a scored-run `GET /invoice/{id}` only because `orders[0].project` is sparse or null in the invoice write response; that follow-up read is for explicit linked-field proof, not the default fast path
- Do not spend a separate `GET /customer` before `PUT /project/{id}` when one decisive `GET /project?name=...&count=50&fields=*,customer(*)` already proved the exact project and linked customer
- Do not insert a default `GET /ledger/account?isBankAccount=true&fields=*` between `POST /order` and `PUT /order/{id}/:invoice` just because the account is fresh; the 2026-03-20 `Tindra AS` production run lost the efficiency point on that exact wasted preflight when account `1920` already had a valid `bankAccountNumber`
