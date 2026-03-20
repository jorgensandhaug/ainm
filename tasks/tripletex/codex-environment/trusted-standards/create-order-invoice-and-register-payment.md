# Create Order, Invoice, and Register Full Payment

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one order for an existing customer
- use one or more existing products already identified in the prompt
- convert that new order into an invoice immediately
- register full payment on that created invoice immediately
- do not send the invoice unless the prompt explicitly asks for it

## Do Not Use This Standard If
- the task also requires creating the customer or products first
- the task is project-fixed-price, on-account, subscription, reversal, or partial-payment specific
- the prompt is too ambiguous to identify the existing customer or products decisively
- the task explicitly requires sending the invoice

## Standard Flow
1. `GET /customer?organizationNumber=...&fields=*` if the prompt identifies the customer by organization number
2. `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
3. only if that first product read does not resolve every product, do one fallback `GET /product?ids=<ref>,<ref>&fields=*`
4. only if both numeric reads miss and the prompt also gives exact product names, do one final decisive `GET /product?count=1000&fields=*` and filter locally
5. `POST /order` with embedded `orderLines`
6. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
7. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
8. `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<outstanding>`
9. verify `amountCurrencyOutstanding=0` or `amountOutstanding=0` from the payment write response
10. stop

## Payload Rules
- on `POST /order`, send:
  - `customer: { "id": ... }`
  - `orderDate`
  - `deliveryDate`
  - `orderLines[]` with:
    - `product: { "id": ... }`
    - `description`
    - `count`
    - `unitPriceExcludingVatCurrency`
- preserve prompt product names/descriptions exactly when they are part of the scored state
- do not derive the payment amount from the prompt line-price sum; use the invoice write response outstanding amount
- do not insert an automatic `GET /order/{id}` just because `POST /order` can echo `orderLines=[]`
- do not insert an automatic `GET /ledger/account` before the first invoice attempt

## Reuse From Write Response
- from `POST /order`:
  - `value.id`
- from `PUT /order/{id}/:invoice`:
  - `value.id`
  - `value.invoiceNumber`
  - `value.amountCurrencyOutstanding` or `value.amountOutstanding`
  - invoice totals if needed for proof
- from `PUT /invoice/{id}/:payment`:
  - final outstanding amount

## Verification
- default verification is zero extra calls after the payment write
- trust the payment write response when it proves remaining outstanding amount is `0`
- do not add a follow-up `GET /invoice/{id}` unless the task explicitly scores expanded linked fields that the write response omits

## Known Recovery Branches
- if the first product-number lookup only partially resolves:
  - try one fallback `GET /product?ids=...&fields=*`
  - only then consider one final `GET /product?count=1000&fields=*` name-filter fallback
  - do not let a name-only match from the first product-number read count as resolution for a missing numeric ref
- if `PUT /order/{id}/:invoice` fails only with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - update the existing invoice bank account with `PUT /ledger/account/{id}` using a valid unique 11-digit `bankAccountNumber`
  - retry the same `PUT /order/{id}/:invoice?...` once
  - do not create a second order
- if payment registration fails after order and invoice already exist:
  - resume from the existing unpaid invoice instead of rebuilding the order

## OpenAPI / Sandbox Status
- `/order`, `/order/{id}/:invoice`, `/invoice/paymentType`, and `/invoice/{id}/:payment` verified in `./openapi.json`
- exact downstream fast path re-proven on 2026-03-20 in production and sandbox
- when the first `GET /product?productNumber=...` already resolves every product, the exact-match path is usually 6 Tripletex API calls:
  - `GET /customer`
  - `GET /product`
  - `POST /order`
  - `PUT /order/{id}/:invoice`
  - `GET /invoice/paymentType`
  - `PUT /invoice/{id}/:payment`
- re-verified on 2026-03-20 in persistent sandbox for customer `864062245` with product refs `6749` and `3048`; once those exact entities existed, the downstream exact-match path again completed in 6 calls, selected payment type `32813748` (`Betalt til bank` / debit account `1920`), and settled the invoice to outstanding `0`
- production re-verification on 2026-03-20 again showed that the prompt ex-VAT total can differ from the payment amount because payment must use the created invoice outstanding balance
