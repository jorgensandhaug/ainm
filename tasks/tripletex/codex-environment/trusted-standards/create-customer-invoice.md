# Create Customer Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one outgoing invoice
- do not send it
- customer already exists or is resolvable in one decisive read
- products either already exist or lines are directly creatable from prompt
- prompt is a standard customer-invoice create, not payment or reversal

## Do Not Use This Standard If
- prompt requires sending after create
- prompt requires a custom multi-order workflow
- task is a correction/reversal/payment flow

## Standard Flow
1. resolve customer with one decisive `GET /customer?...&fields=*` if needed
2. resolve existing products only if prompt clearly references existing products
3. if exact invoice VAT must be forced, resolve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*`
4. `POST /invoice?sendToCustomer=false`
5. only if line-level proof is still needed and write response is sparse, do one immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
6. stop

## Payload Rules
- include:
  - `invoiceDate`
  - `invoiceDueDate`
  - `customer: { "id": ... }`
  - lines under `orders[].orderLines`
- do not create lines under read-only `invoice.orderLines`
- for product-linked lines, prefer `product: { "id": ... }`
- do not send unless prompt explicitly asks
- do not hardcode output VAT code `3`

## Reuse From Write Response
- `value.id`
- `value.invoiceNumber`
- totals from invoice write response
- sparse line objects still prove line count, not full line details

## Verification
- default verification is zero extra calls if invoice totals/existence are enough
- use one immediate expanded `GET /invoice/{id}` only when exact scored line details still need proof

## Known Recovery Branches
- if invoice creation fails with missing company bank account:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - update existing invoice account with `PUT /ledger/account/{id}`
  - retry invoice write once
- if product numeric refs partially resolve, follow documented product fallback chain instead of stopping

## OpenAPI / Sandbox Status
- `/invoice`, `/ledger/account`, and related invoice family endpoints verified in `./openapi.json`
- flow and bank-account repair proven in sandbox/playbooks
