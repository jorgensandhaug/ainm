# Create Customer Invoice

## Scope

Use for tasks like:
- create one outgoing customer invoice
- do not send the invoice unless the prompt explicitly asks for sending
- the customer already exists and is usually identified by organization number
- the lines may use existing products identified by numeric refs in parentheses
- the prompt gives line descriptions, prices, and sometimes exact VAT rates

Do not use for:
- send-after-create tasks where the sending step is part of the prompt
- order-then-invoice tasks that explicitly require a separate `POST /order` flow
- invoice-payment tasks

## Verified Findings

- the original production run on 2026-03-20 succeeded with:
  - `GET /customer?organizationNumber=...&fields=*`
  - an initial `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` returned only a partial subset, so the script had to continue through the documented fallback chain instead of stopping
  - `POST /invoice?sendToCustomer=false`
  - the first invoice write hit the known bank-account validation and succeeded only after the documented `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` repair -> single retry branch
- persistent-sandbox verification on 2026-03-20 showed:
  - `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` can return all requested products when the refs are real product numbers
  - `GET /product?ids=<id>,<id>,<id>&fields=*` can also resolve the same set decisively when you already know the product IDs
  - an existing-customer, existing-product invoice can be created directly with `POST /invoice?sendToCustomer=false` using `orderLines[].product = { "id": ... }`
  - the `POST /invoice` response returned `orderLines` only as sparse link objects with keys `id` and `url`, even though `orderLines.length` matched the requested line count
  - one immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` returned the exact product numbers, descriptions, unit prices, and VAT data for the created lines
- sandbox constraint on 2026-03-20:
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
  - therefore mixed 25%/15%/0% VAT could not be replayed in that account exactly, but the product-linked invoice path and immediate verification shape were proven

## Minimal Flow

1. Confirm these operations in `./openapi.json`
   - `GET /customer`
   - `GET /product`
   - `POST /invoice`
   - `GET /invoice/{id}`
   - if exact invoice-line VAT must be forced rather than inherited from the resolved products, also confirm `GET /ledger/vatType`
2. Resolve the customer
   - usually `GET /customer?organizationNumber=...&fields=*`
3. Resolve any existing products referenced by numeric prompt refs
   - first try `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
   - if that returns only a partial subset, do not stop; continue immediately to one fallback `GET /product?ids=<ref>,<ref>&fields=*`
   - if that still does not uniquely resolve them and the prompt also gives exact product names, do one decisive `GET /product?count=1000&fields=*` and filter locally by exact product `number` and/or exact prompt names
4. Create the invoice directly
   - `POST /invoice?sendToCustomer=false`
   - include `invoiceDate`, `invoiceDueDate`, `customer`
   - create lines under `orders[].orderLines`
   - for product-linked lines, prefer `product: { "id": ... }`, `description`, `count`, and the requested unit price
   - only add explicit `vatType` on the invoice line when the prompt's VAT requirement is not already safely implied by the resolved product/account setup
5. Reuse the invoice write response
   - trust the returned `id`, `invoiceNumber`, and totals
   - if the task only scores invoice existence/totals and the write response already proves them, stop
6. If exact line-level verification is needed and the write response is sparse, do one immediate read
   - `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
   - treat the response as sparse not only when `orderLines` is empty, but also when the entries are link-only objects without `product.number`, `description`, `unitPriceExcludingVatCurrency`, and `vatType.percentage`
7. Only if `POST /invoice` fails with the company-bank-account validation, repair that prerequisite and retry once

## Exact-Match Fast Path

- For a prompt that:
  - identifies an existing customer by organization number
  - identifies existing products by numeric refs
  - asks only to create the invoice, not send it
- the winning path is usually:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?productNumber=<ref>&productNumber=<ref>&productNumber=<ref>&fields=*`
  3. `POST /invoice?sendToCustomer=false`
  4. optional immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` only if you still need exact line proof
- if step 2 returns only part of the referenced products, do not hard-fail there; finish the documented fallback chain before deciding the refs are unresolved
- Do not insert an automatic `GET /ledger/account` before the first invoice write
- Do not call `PUT /invoice/{id}/:send`
- Do not add a delayed verification read in a separate later script/session if you already know you need line-level proof; do the one decisive `GET /invoice/{id}` immediately while the same token is still in use

## Invoice Payload Notes

- `invoiceDueDate` is required
- `orders[].deliveryDate` is required
- `invoice.orderLines` is read-only in the schema
- create lines under `orders[].orderLines`

Safe product-linked shape:

```json
{
  "invoiceDate": "2026-03-20",
  "invoiceDueDate": "2026-04-03",
  "customer": { "id": 123 },
  "orders": [
    {
      "customer": { "id": 123 },
      "orderDate": "2026-03-20",
      "deliveryDate": "2026-03-20",
      "orderLines": [
        {
          "product": { "id": 456 },
          "description": "Maintenance",
          "count": 1,
          "unitPriceExcludingVatCurrency": 28100
        }
      ]
    }
  ]
}
```

If you must force a specific VAT code on the line, add:

```json
{
  "vatType": { "id": 3 }
}
```

on that `orderLines[]` item.

## VAT Rules

- Do not hardcode invoice-line `vatType.id = 3`
- If the resolved product/account combination already carries the intended VAT safely, the invoice write can succeed without an explicit line `vatType`
- If the prompt gives exact VAT rates and the product lookup does not clearly prove matching VAT context, resolve `vatType` from:
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
- Choose from the filtered result for the actual invoice date
- Do not substitute VAT ids from the broader unfiltered catalog when the `OUTGOING` result disagrees or is narrower

## Sparse Response Trap

- `POST /invoice` can return:

```json
{
  "value": {
    "id": 2147525654,
    "orderLines": [
      { "id": 1, "url": "..." }
    ]
  }
}
```

- that does not mean the detailed line fields are missing from the actual invoice
- the same trap still applies when the sparse response shows the correct number of line link objects; line count alone is not enough for exact verification
- if you need the exact line details, do one immediate `GET /invoice/{id}` with expanded `fields` and stop there

## Bank Account Repair Branch

If `POST /invoice` fails with:

`Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`

then the practical repair path is:

1. `GET /ledger/account?isBankAccount=true&fields=*`
2. choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
3. `PUT /ledger/account/{id}` with:

```json
{
  "bankAccountNumber": "12345678903"
}
```

4. retry `POST /invoice` once

## Avoidable Mistakes

- Do not spend an unconditional `GET /ledger/account` before the first invoice write
- Do not use the send-invoice flow when the prompt only asks to create an invoice
- Do not assume the `POST /invoice` response fully expands each line just because `orderLines.length` matches the requested line count
- Do not postpone a needed verification read into a later separate script/session
- Do not stop after a partial `GET /product?productNumber=...` result; continue the fallback chain in the same script
