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

- reflection on the successful production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=827304212`, products `6744`, `2584`, `3739`, names `Webdesign`, `Programvarelisens`, `Opplæring`, VAT `25%` / `15%` / `0%`) showed:
  - the API path itself was already minimal and correct: `GET /customer?organizationNumber=...&fields=*` -> `GET /product?productNumber=6744&productNumber=2584&productNumber=3739&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
  - the only mistake happened after the successful write: local verification miscomputed the gross total as `61145` instead of the correct `60745`
  - because the invoice write had already succeeded, that arithmetic bug should have been treated as a local reflection issue, not as a reason to retry or create another invoice
- the production run for this exact task on 2026-03-20 stopped on the first call:
  - `GET /customer?organizationNumber=919172657&fields=*` returned `403 {"error":"Invalid or expired token"}`
  - that was a credential block, not an invoice-flow failure, so no further production API calls were justified
- follow-up reflection on the successful production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=925760838`, product labels `(3644)`, `(4934)`, `(8806)`, names `Maintenance`, `Licence logicielle`, `Service réseau`) showed:
  - the run succeeded, but it spent two extra product-resolution reads before a later `GET /product?count=1000&fields=*` settled the products
  - because the prompt already gave exact product names, the lower-call resolver for that exact shape should have been one decisive catalog read with local exact filtering by product `number` and/or exact product `name`, not `GET /product?productNumber=...` followed by `GET /product?ids=...`
  - the same run also hit the known missing-company-bank-account validation on the first invoice write, so the realistic minimal successful production path for that account state was seven API calls: `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
- reflection on the successful production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=909722500`, product lines `Analysis Report (9796)`, `Maintenance (2145)`, `System Development (5995)`, VAT `25%` / `15%` / `0%`) showed:
  - the run reached the correct final invoice state, but it was not minimal-call
  - one speculative `GET /product?productNumber=9796&productNumber=2145&productNumber=5995&fields=*` was wasted before a broader `GET /product?count=1000&fields=*` settled the products by exact-name filtering
  - the same run also hit the known missing-company-bank-account validation on the first invoice write, so the realistic minimal successful production path for that exact account state was seven API calls: `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
- reflection on the production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=851635874`, product labels `(2934)`, `(8699)`, `(1355)`, names `Analyserapport`, `Datarådgivning`, `Nettverkstjeneste`, VAT `25%` / `15%` / `0%`) showed:
  - correctness was fine, but the run lost the efficiency point because it used a speculative `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*` before a later broader catalog read settled the products
  - the script then aborted on that partial resolver result and restarted the whole flow, which duplicated the already-successful customer read; that control-flow mistake is exactly the kind of avoidable non-minimal behavior that should stay inside one in-script callback/fallback branch instead
  - the lower-call replacement for that exact task shape is `GET /customer?organizationNumber=851635874&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
- the original production run on 2026-03-20 succeeded with:
  - `GET /customer?organizationNumber=...&fields=*`
  - an initial `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` returned only a partial subset, so the script had to continue through the documented fallback chain instead of stopping
  - `POST /invoice?sendToCustomer=false`
  - the first invoice write hit the known bank-account validation and succeeded only after the documented `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` repair -> single retry branch
- persistent-sandbox verification on 2026-03-20 showed:
  - `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` can return all requested products when the refs are real product numbers
  - `GET /product?ids=<id>,<id>,<id>&fields=*` can also resolve the same set decisively when you already know the product IDs
  - `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` can still return each product `vatType` only as a sparse link object (`id`/`url`), not with `percentage`
  - therefore product search alone does not always prove explicit prompt VAT percentages; when exact VAT matters, one filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` may still be required before the invoice write
  - an existing-customer, existing-product invoice can be created directly with `POST /invoice?sendToCustomer=false` using `orderLines[].product = { "id": ... }`
  - the `POST /invoice` response returned `orderLines` only as sparse link objects with keys `id` and `url`, even though `orderLines.length` matched the requested line count and the response still included decisive totals
  - one immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` returned the exact product numbers, descriptions, unit prices, and VAT data for the created lines
  - a clean existing-customer plus existing-product proof path was re-proven in exactly four calls when the product VAT was already known from setup and exact line readback was still desired: `GET /customer` -> `GET /product` -> `POST /invoice?sendToCustomer=false` -> immediate `GET /invoice/{id}`
- persistent-sandbox verification on 2026-03-20 with the exact identifiers from this task shape (`customer.organizationNumber=827304212`, products `6744`, `2584`, `3739`) showed:
  - `GET /customer?organizationNumber=827304212&fields=*` resolved the customer in one call
  - `GET /product?productNumber=6744&productNumber=2584&productNumber=3739&fields=*` resolved all three exact-number products in one call and again returned each product `vatType` only as an `id`/`url` link
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` exposed only VAT code `6` (`0%`) in that sandbox account, so the exact mixed `25%` / `15%` / `0%` task could not be replayed there
  - after sandbox-only setup of exact-number analog products, the same four-call proof path (`GET /customer` -> `GET /product?productNumber=...` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false`) succeeded and returned a sparse-write-response invoice with `amountExcludingVatCurrency=52600`, `amountCurrency=52600`, and three link-only `orderLines`
- additional persistent-sandbox post-run verification on 2026-03-20 with the exact identifiers from this task shape (`customer.organizationNumber=919172657`, products `4783`, `3343`, `4380`) showed:
  - after sandbox setup, `GET /customer?organizationNumber=919172657&fields=*` resolved the customer in one call
  - `GET /product?productNumber=4783&productNumber=3343&productNumber=4380&fields=*` resolved all three products in one call and again returned each product `vatType` only as an `id`/`url` link
  - `POST /invoice?sendToCustomer=false` returned sparse `orderLines` but also returned decisive totals (`amountExcludingVatCurrency=54700`, `amountCurrency=54700`) for the create-only 0% proof invoice
  - the follow-up `GET /invoice/{id}` was useful for documentation proof, but was not required for the minimum create-only path because the payload had already fixed the line fields and the write response totals already proved the financial outcome
- sandbox constraint on 2026-03-20:
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
  - additional spot checks on 2022-03-20, 2023-03-20, 2024-03-20, 2025-03-20, and 2026-03-19 still returned only VAT code `6`
  - therefore exact mixed `25%` / `15%` / `0%` VAT could not be replayed in that sandbox account, but the product-linked invoice path, sparse write-response trap, and lower-call no-extra-read create path were proven
- persistent-sandbox follow-up on 2026-03-20 with a disposable analog for this exact prompt shape proved the lower-call product resolver directly:
  - setup used products with the exact prompt names but intentionally different stored product numbers, so the parenthetical refs were not usable Tripletex lookup keys
  - after setup, the proof path itself was exactly four calls: `GET /customer?organizationNumber=925760838&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
  - the proof invoice succeeded with `amountExcludingVatCurrency=33950` and `amountCurrency=33950`
  - because that sandbox account still exposed only `0%` outgoing VAT, the analog proved the product-resolution and create-only-path lesson, but not the mixed `25%` / `15%` / `0%` VAT combination itself
- persistent-sandbox follow-up on 2026-03-20 with a prompt-like analog for the `909722500` Oakwood task shape showed:
  - setup used analog customer `organizationNumber=909722502` and products whose exact names preserved the same line structure while the stored product numbers intentionally differed from prompt-like refs `9796`, `2145`, and `5995`
  - after setup, the proof path itself was exactly four calls: `GET /customer?organizationNumber=909722502&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
  - the proof invoice succeeded with `amountExcludingVatCurrency=47450` and `amountCurrency=47450`
  - because the sandbox still exposed only `0%` outgoing VAT, the analog proved the product-resolution and create-only-path lesson for this task shape, but not the exact mixed `25%` / `15%` / `0%` VAT combination itself
- persistent-sandbox follow-up on 2026-03-20 with a disposable analog for the `851635874` task shape proved the callback/fallback lesson directly:
  - setup used an analog customer `organizationNumber=851635875` and exact-name products whose stored product numbers were intentionally different from prompt-like refs `2934`, `8699`, and `1355`
  - after setup, the winning proof path itself was exactly four calls: `GET /customer?organizationNumber=851635875&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
  - that proof invoice succeeded with `amountExcludingVatCurrency=53050` and `amountCurrency=53050`
  - because the sandbox still exposed only `0%` outgoing VAT, this analog proved the product-resolution and single-script callback/fallback lesson, but not the exact mixed `25%` / `15%` / `0%` VAT combination itself

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
   - if the prompt clearly gives exact product numbers, start with one decisive `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
   - if the prompt also gives exact product names and the numeric refs are not explicitly guaranteed Tripletex product numbers, start instead with one decisive `GET /product?count=1000&fields=*` and filter locally by exact product `number` and/or exact product `name`
   - only if the first resolver is ambiguous, truncated for the account, or the prompt lacks exact product names, continue to the next resolver
   - only if those earlier reads still do not uniquely resolve them, use one fallback `GET /product?ids=<ref>,<ref>&fields=*`
   - do not let a partial first resolver terminate the script and force a full rerun; keep the broader catalog fallback in the same script/callback chain so the customer read is not duplicated
4. If the prompt gives exact VAT rates, inspect how much VAT detail the product read actually returned
   - if each resolved product already proves the needed VAT safely, keep the fast path and skip `/ledger/vatType`
   - if the product read leaves `vatType` sparse as only `id`/`url`, do one filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
   - use that filtered VAT list either to confirm the resolved product `vatType.id` matches the prompt percentage or, if needed, to force the line with explicit `vatType: { "id": ... }`
5. Create the invoice directly
   - `POST /invoice?sendToCustomer=false`
   - include `invoiceDate`, `invoiceDueDate`, `customer`
   - create lines under `orders[].orderLines`
   - for product-linked lines, prefer `product: { "id": ... }`, `description`, `count`, and the requested unit price
   - if the filtered outgoing VAT lookup returns a valid id for the prompt percentage, prefer sending explicit line `vatType: { "id": ... }` so the write payload itself fixes the scored VAT field
6. Reuse the invoice write response
   - trust the returned `id`, `invoiceNumber`, and totals
   - if the payload already fixed `product`, `description`, `count`, `unitPriceExcludingVatCurrency`, and any needed explicit line `vatType`, and the write response already proves the totals, stop
7. If exact line-level verification is needed and the write response is sparse, do one immediate read
   - `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
   - treat the response as sparse not only when `orderLines` is empty, but also when the entries are link-only objects without `product.number`, `description`, `unitPriceExcludingVatCurrency`, and `vatType.percentage`
   - do not add this read merely because the write response kept `orderLines` sparse if the write response totals already prove the intended create-only financial outcome
8. Only if `POST /invoice` fails with the company-bank-account validation, repair that prerequisite and retry once

## Exact-Match Fast Path

- For a prompt that:
  - identifies an existing customer by organization number
  - identifies existing products by exact product numbers
  - asks only to create the invoice, not send it
  - gives explicit VAT percentages that must be respected
- the winning path is usually:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
  4. `POST /invoice?sendToCustomer=false`
  - stop there if the write response totals match the intended line prices and VAT mix
- For a prompt that:
  - identifies an existing customer by organization number
  - identifies existing products by exact names plus ambiguous numeric refs in parentheses
  - asks only to create the invoice, not send it
  - does not force an extra VAT confirmation step beyond what the product read already proves
- the winning path is usually:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?count=1000&fields=*` and local exact filtering by product `number` and/or `name`
  3. `POST /invoice?sendToCustomer=false`
  4. optional immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` only if you still need exact line proof
- For the explicit-VAT variant where `GET /product?fields=*` leaves `vatType` sparse as only `id`/`url`, the safer verified path is usually five calls:
  - the lower-call winning path is usually four calls:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?count=1000&fields=*` and local exact filtering by product `number` and/or `name`
  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
  4. `POST /invoice?sendToCustomer=false`
  - stop there if the write response totals match the intended line prices and VAT mix
  - add a fifth immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` only when exact readback-only line proof is still needed
- For the explicit-VAT variant where `GET /product?fields=*` leaves `vatType` sparse as only `id`/`url`, the documented proof path can still be five calls:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?count=1000&fields=*` and local exact filtering by product `number` and/or `name`
  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
  4. `POST /invoice?sendToCustomer=false`
  5. immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
- if the catalog read is ambiguous or step 2 still does not uniquely settle the products, then use the documented numeric fallback chain before deciding the refs are unresolved
- if a speculative first product resolver misses one line, do not restart from `GET /customer`; continue in the same script and reuse already-known ids/results
- Do not insert an automatic `GET /ledger/account` before the first invoice write
- Do not call `PUT /invoice/{id}/:send`
- Do not add a delayed verification read in a separate later script/session if you already know you need line-level proof; do the one decisive `GET /invoice/{id}` immediately while the same token is still in use
- Do not treat sparse `orderLines` in the write response as an automatic reason to spend `GET /invoice/{id}`; first check whether the write response totals already prove the outcome

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
- `GET /product?fields=*` may still expose `vatType` only as `id`/`url`; that alone does not prove the percentage on an explicit-VAT prompt
- If the prompt gives exact VAT rates and the product lookup does not clearly prove matching VAT context, resolve `vatType` from:
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
- Choose from the filtered result for the actual invoice date
- If the resolved product `vatType.id` already maps to the prompt percentage in that filtered result, you can keep the lower-call write shape and omit explicit line `vatType`
- Do not substitute VAT ids from the broader unfiltered catalog when the `OUTGOING` result disagrees or is narrower

## Credential Trap

- If the first attempted API call returns `403` with body `{"error":"Invalid or expired token"}`, stop immediately
- Do not spend follow-up calls on `/product`, `/invoice`, or alternate auth variations
- That response means the run is blocked by unusable credentials, not by uncertainty about the invoice flow

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
- if the write payload already fixed the scored line fields and the write response totals already prove the intended VAT outcome, the minimal create-only path stops without that extra read

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
- Do not assume `GET /product?fields=*` fully expands `vatType.percentage`; it may return only `id`/`url`
- Do not replace a clear exact-product-number prompt with a broad catalog read; use `GET /product?productNumber=...` first and only broaden if that direct resolver is incomplete or ambiguous
- Do not treat inline numeric refs such as `Analysis Report (9796)` as proven `productNumber` search keys when the prompt never explicitly says those numbers are the stored Tripletex product numbers; if exact names are present, one decisive catalog read is often the lower-call path
- Do not spend both numeric product resolver reads when the prompt already gives exact names and one decisive catalog read would settle the products
- Do not let a partial product-resolver miss abort the script and trigger a second full run; the broader resolver belongs in the same in-script callback/fallback path
- Do not postpone a needed verification read into a later separate script/session
- Do not stop after a partial or ambiguous product resolver result; continue the documented fallback chain in the same script
- Do not keep probing after a first-call `403 {"error":"Invalid or expired token"}`
- Do not spend `GET /invoice/{id}` by reflex after every successful create-only invoice write; reuse the payload plus write-response totals first
- Do not let a local arithmetic/assertion bug after a successful invoice write trigger a retry; re-check the VAT math first
