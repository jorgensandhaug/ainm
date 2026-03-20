# Create Customer Invoice Credit Note

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one full credit note that nullifies one existing outgoing customer invoice
- prompt identifies the invoice strongly enough to find it in one decisive read
- task is a full reversal, not a partial credit or manual ledger correction
- task does not require sending the credit note

## Do Not Use This Standard If
- task is a partial credit-note flow
- prompt already gives the exact invoice id and the one-write path is available
- prompt is too ambiguous to identify one invoice safely
- task is actually payment reversal rather than invoice crediting
- task explicitly requires sending the credit note

## Standard Flow
1. `GET /invoice?...&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` to identify the exact original invoice
2. `PUT /invoice/{id}/:createCreditNote?date=<date>&sendToCustomer=false`
3. verify from the credit-note write response
4. stop

## Payload Rules
- locate the invoice by prompt facts such as:
  - `customer.organizationNumber`
  - exact ex-VAT amount
  - exact service/line description
- filter out:
  - `isCreditNote=true`
  - `isCredited=true`
- for the create-credit-note write:
  - always send `date`
  - default to `sendToCustomer=false` unless the prompt explicitly requires sending
- do not create a manual negative invoice
- do not reverse a voucher unless the task is explicitly about payment reversal

## Reuse From Write Response
- credit note id from `value.id`
- credit note number from `value.invoiceNumber`
- original invoice linkage from `value.creditedInvoice`
- `value.isCreditNote`

## Verification
- default verification is zero extra calls after the credit-note write
- trust the write response when it proves:
  - `isCreditNote=true`
  - `creditedInvoice=<original invoice id>`

## Known Recovery Branches
- if the invoice locate step is ambiguous, add one extra targeted resolver such as `GET /customer?organizationNumber=...&fields=*`
- if the prompt already gives the exact invoice id, skip the locate read and go straight to `PUT /invoice/{id}/:createCreditNote`

## OpenAPI / Sandbox Status
- `/invoice` and `/invoice/{id}/:createCreditNote` verified in `./openapi.json`
- re-verified on 2026-03-20 in persistent sandbox:
  - one decisive `GET /invoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2027-01-01&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` uniquely located the target invoice by organization number, exact ex-VAT amount, and exact line description
  - `PUT /invoice/{id}/:createCreditNote?date=2026-03-20&sendToCustomer=false` returned the created credit note with `isCreditNote=true` and `creditedInvoice=<original id>`
