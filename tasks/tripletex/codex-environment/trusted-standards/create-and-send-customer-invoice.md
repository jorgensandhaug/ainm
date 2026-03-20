# Create And Send Customer Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one outgoing invoice
- send it as part of the same minimal flow
- invoice has one or more simple direct order lines
- prompt gives the customer identity directly or the customer is resolvable in one decisive read
- prompt does not require a specific send channel override such as a forced email address

## Do Not Use This Standard If
- prompt requires a specific send channel that is not already safely implied by known customer data
- prompt requires an existing-product lookup-heavy flow
- task is payment, reversal, or correction

## Standard Flow
1. if the prompt shape and account context imply a fresh-account new customer, create the customer directly; otherwise resolve the customer in one decisive `GET /customer?...&fields=*`
2. if creating a new customer and the prompt gives no email or postal address, `POST /customer` with:
   - `name`
   - `organizationNumber`
   - `invoiceSendMethod: "MANUAL"`
3. resolve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
4. `POST /invoice` and let the default `sendToCustomer=true` handle the send in the same write
5. only if that invoice write fails with missing company bank account:
   - `GET /ledger/account?isBankAccount=true&fields=*`
   - `PUT /ledger/account/{id}` with a checksum-valid unique 11-digit `bankAccountNumber`
   - retry the same `POST /invoice` once
6. stop

## Payload Rules
- include:
  - `invoiceDate`
  - `invoiceDueDate`
  - `customer: { "id": ... }`
  - `orders[].customer`
  - `orders[].orderDate`
  - `orders[].deliveryDate`
  - `orders[].orderLines`
- create lines under `orders[].orderLines`, not `invoice.orderLines`
- do not hardcode output VAT code `3`
- if creating the customer with no delivery/contact details, prefer `invoiceSendMethod: "MANUAL"` and let the invoice create do the send attempt

## Reuse From Write Response
- `customer.value.id`
- `invoice.value.id`
- `invoice.value.invoiceNumber`
- totals from the invoice write response

## Verification
- default verification is zero extra calls
- treat a successful `POST /invoice` with default `sendToCustomer=true` as the winning send path for this task shape
- do not add an automatic follow-up `PUT /invoice/{id}/:send`

## Known Recovery Branches
- if invoice creation fails with missing company bank account:
  - repair the existing invoice bank account and retry the same invoice write once
- if the prompt explicitly identifies an already-existing customer, use one decisive customer read instead of blind customer create

## Known Pitfalls
- do not spend `GET /customer` first on the normal fresh-account new-customer variant
- do not branch into `PUT /invoice/{id}/:send?sendType=MANUAL` as the default path; sandbox reproduced `500` on 2026-03-20 while the same task shape succeeded through `POST /invoice` with default send behavior
- do not assume sparse `postalAddress` or `physicalAddress` links on the customer prove that `PAPER` send is available; sandbox returned `422 Faktura kan ikke sendes via PAPER`
- do not assume organization number alone proves EHF sendability; production returned `422 Faktura kan ikke sendes via EHF`

## OpenAPI / Sandbox Status
- `/customer`, `/invoice`, `/ledger/vatType`, and `/ledger/account` verified in `./openapi.json`
- minimal create-and-send path re-verified in persistent sandbox on 2026-03-20:
  - `POST /customer` with `invoiceSendMethod: "MANUAL"` succeeded
  - `POST /invoice` with default `sendToCustomer=true` succeeded for the same customer
  - explicit later `PUT /invoice/{id}/:send?sendType=MANUAL` reproduced `500`
  - explicit later `PUT /invoice/{id}/:send?sendType=PAPER` reproduced `422`
