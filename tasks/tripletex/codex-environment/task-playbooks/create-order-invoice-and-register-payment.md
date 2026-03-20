# Create Order, Invoice, and Register Full Payment

## Scope

Use for tasks like:
- create an order for an existing customer
- use one or more existing products on the order
- convert that order into an invoice
- register full payment on the created invoice
- do not send the invoice unless the prompt explicitly asks for sending

Do not use for:
- create-only order tasks with no invoice/payment step
- invoice-send tasks where customer delivery/send method is the main concern
- update/delete/reverse flows on existing orders or invoices

Exact-match tasks should now prefer the trusted standard:
- `./trusted-standards/create-order-invoice-and-register-payment.md`

## Key Findings

- `POST /order` can create embedded `orderLines`, but the `201` response may still echo `orderLines=[]`
- do not treat an empty `response.value.orderLines` on `POST /order` as proof that line creation failed
- sandbox verification on 2026-03-20 showed:
  - `POST /order` with embedded `orderLines` returned `orderLines=[]` in `response.value`
  - `GET /order/{id}?fields=*,customer(*),orderLines(*)` on that same order returned the expected 2 order lines
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` on an order created that way succeeded directly
  - the invoice response returned `amountExcludingVatCurrency=20450` and `amountCurrencyOutstanding=20450`
  - `PUT /invoice/{id}/:payment?...` reduced the remaining outstanding amount to `0`
- additional production verification on 2026-03-20 showed:
  - `PUT /order/{id}/:invoice?...` can fail after a successful `POST /order` with `422` and validation message `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`
  - `GET /ledger/account?isBankAccount=true&fields=*`, then `PUT /ledger/account/{id}` on the existing invoice bank account `1920`, then retrying the same `PUT /order/{id}/:invoice` succeeded
  - therefore the recovery branch must resume from the already-created order; do not create a second order
- product lookup verification on 2026-03-20 showed:
  - `GET /product?productNumber=<a>&productNumber=<b>&fields=*` returned both target products
  - `GET /product?ids=<id-a>,<id-b>&fields=*` also returned both target products
  - therefore, for numeric product refs in the prompt, product-number lookup is a good first try and one fallback ID lookup is enough if needed
- additional production verification on 2026-03-20 showed two more traps:
  - prompt numeric refs in parentheses are not guaranteed to be Tripletex `productNumber` values or product IDs
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` can return the correct incoming payment type with `creditAccount=null`; in that account `Betalt til bank` with debit account `1920` was still the right payment type and successfully settled the invoice
- additional production verification on 2026-03-20 also showed the clean exact-match path:
  - one successful run completed with only 6 Tripletex API calls after local spec confirmation
  - `GET /customer?organizationNumber=...&fields=*`
  - `GET /product?productNumber=<a>&productNumber=<b>&fields=*` already returned both target products, so no fallback `/product?ids=...` read was needed
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `PUT /invoice/{id}/:payment?...`
  - the prompt line-price sum excluding VAT was `56350`, but the actual payment amount from the invoice response was `70437.5`; this confirmed again that payment must use the invoice outstanding amount, not the prompt ex-VAT total
- another production verification on 2026-03-20 confirmed the same exact-match path again:
  - `GET /customer?organizationNumber=911511053&fields=*`
  - `GET /product?productNumber=7579&productNumber=2292&fields=*`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `PUT /invoice/{id}/:payment?...`
  - the prompt line-price sum excluding VAT was `26450`, but the actual payment amount from the invoice response was `33062.5`; `Betalt til bank` again settled the invoice to `0`

## Minimal Flow

1. Confirm these operations in `./openapi.json`
   - `GET /customer`
   - `GET /product`
   - `POST /order`
   - `PUT /order/{id}/:invoice`
   - `GET /invoice/paymentType`
   - `PUT /invoice/{id}/:payment`
2. Resolve the customer
   - usually `GET /customer?organizationNumber=...&fields=*`
3. Resolve the products from prompt refs
   - first try `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
   - if that does not uniquely resolve the products, do one fallback `GET /product?ids=<ref>,<ref>&fields=*`
   - if both numeric lookups fail and the prompt also gives exact product names, do one final decisive fallback `GET /product?count=1000&fields=*` and filter locally by exact prompt names
4. Create the order with embedded lines
   - `POST /order`
   - send `customer`, `orderDate`, `deliveryDate`
   - embed `orderLines` with `product: { id }`, `description`, `count`, and the requested unit price
5. Convert the order into an invoice without sending it
   - `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
6. Only if that invoice write fails with the company-bank-account validation, repair that prerequisite and retry the same order once
   - `GET /ledger/account?isBankAccount=true&fields=*`
   - choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
   - `PUT /ledger/account/{id}` with a valid `bankAccountNumber`
   - retry `PUT /order/{id}/:invoice?...` on the same order
7. Reuse the invoice write response
   - use `amountCurrencyOutstanding` first, otherwise `amountOutstanding`
   - use invoice totals/lines in that response as verification where available
8. Resolve one usable incoming payment type
   - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
   - prefer a bank-style incoming payment type whose debit account is `19xx`
   - if available, prefer `isBankAccount=true` or `isInvoiceAccount=true` on that debit account
   - do not reject the candidate just because `creditAccount` is `null`
9. Register full payment
   - `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<outstanding>`
10. Verify from the payment write response
   - stop when remaining outstanding amount is `0`

## Exact-Match Fast Path

- For a prompt that already identifies:
  - the existing customer by organization number
  - the existing products by numeric refs
  - the order line prices
  - the need to invoice and fully pay immediately
- the winning path is usually 6 Tripletex API calls when the first product-number read succeeds:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
  3. if that misses, `GET /product?ids=<ref>,<ref>&fields=*`
  4. only if both numeric lookups miss and the prompt also gives exact product names, `GET /product?count=1000&fields=*` and filter locally by exact names
  5. `POST /order` with embedded `orderLines`
  6. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
  7. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  8. `PUT /invoice/{id}/:payment?...`
- Do not insert an automatic `GET /order/{id}` just because `POST /order` echoed empty `orderLines`
- Do not insert an automatic `GET /ledger/account` before the first invoice write
- If `PUT /order/{id}/:invoice` fails only because the company bank account number is missing, repair `/ledger/account` and retry the same order instead of creating a new one
- If the invoice response already proves the charged lines/totals and outstanding amount, that later write response is often enough

## Order Payload Notes

- Use the `Order` schema referenced by `POST /order`
- a safe embedded-line shape is:

```json
{
  "customer": { "id": 123 },
  "orderDate": "2026-03-20",
  "deliveryDate": "2026-03-20",
  "orderLines": [
    {
      "product": { "id": 456 },
      "description": "Training session",
      "count": 1,
      "unitPriceExcludingVatCurrency": 5700
    },
    {
      "product": { "id": 789 },
      "description": "Consulting hours",
      "count": 1,
      "unitPriceExcludingVatCurrency": 14750
    }
  ]
}
```

- if the account/product setup requires it, include a valid `vatType` on the order line
- when you already resolved products from `GET /product?fields=*`, reuse the returned product IDs directly

## Response Shape Trap

- `POST /order` may not be a reliable verifier for embedded line creation
- specifically, the write response can contain:

```json
{
  "value": {
    "id": 401954042,
    "orderLines": []
  }
}
```

- even though the order actually contains lines and can be invoiced immediately
- do not branch into a corrective rewrite just because that field is empty
- only add `GET /order/{id}?fields=*,orderLines(*)` if you truly need decisive pre-invoice verification

## Product Resolution Rules

- When the prompt names existing products with numeric refs in parentheses, try product-number resolution first
- Use:
  - `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
- If that first read already returns both target products, stop there and reuse those IDs directly
- If that does not uniquely resolve the products, do one fallback:
  - `GET /product?ids=<ref>,<ref>&fields=*`
- If both numeric reads fail and the prompt also gives exact product names, one final decisive fallback is allowed:
  - `GET /product?count=1000&fields=*`
  - filter locally by exact prompt names
- Do not spray multiple exploratory `/product` reads after that final fallback
- Reuse the resolved product objects for IDs and any needed VAT context

## Payment Rules

- Do not derive the payment amount from the prompt’s ex-VAT sum
- Use the outstanding amount from the just-created invoice response:
  - `amountCurrencyOutstanding` first
  - otherwise `amountOutstanding`
- This avoids VAT and currency mistakes
- For `GET /invoice/paymentType`, normalize account numbers before prefix checks
- Prefer a `19xx` debit account that is also flagged as `isBankAccount=true` or `isInvoiceAccount=true`
- Do not require a `15xx` `creditAccount`; the correct incoming payment type may return `creditAccount=null`

## Recovery Rule After Partial Success

- If `POST /order` succeeded but `PUT /order/{id}/:invoice` failed only because the company bank account number is missing:
  - do `GET /ledger/account?isBankAccount=true&fields=*`
  - update the existing invoice bank account with `PUT /ledger/account/{id}`
  - retry the same `PUT /order/{id}/:invoice?...`
  - do not restart from `POST /order`
- If `POST /order` and `PUT /order/{id}/:invoice` already succeeded but payment registration failed, do not start over with a new order
- Locate the existing unpaid invoice with one decisive read such as:
  - `GET /invoice?customerId=<id>&invoiceDateFrom=<date>&invoiceDateTo=<next-date>&count=1000&fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))`
- Filter locally by:
  - positive outstanding amount
  - exact ex-VAT total
  - exact prompt line descriptions or product refs
- Then finish with:
  - `GET /invoice/paymentType?...`
  - `PUT /invoice/{id}/:payment?...`
- This avoids duplicating orders/invoices after a late-step failure

## Verification Shape

- `POST /order`:
  - trust the returned `id`
  - do not over-trust `orderLines`
- `PUT /order/{id}/:invoice`:
  - expect `ResponseWrapperInvoice`
  - reuse `id`, `invoiceNumber`, invoice totals, and outstanding amount
- `PUT /invoice/{id}/:payment`:
  - expect `ResponseWrapperInvoice`
  - verify remaining outstanding amount is `0`

## If You Still Need To Probe

- First probe only the exact missing uncertainty
- Good examples:
  - `GET /order/{id}?fields=*,orderLines(*)` if you must confirm line creation before invoicing
  - `GET /product?ids=...&fields=*` if product-number lookup failed
- Avoid widening into generic invoice/order browsing when the created invoice or payment response already proves the next step
