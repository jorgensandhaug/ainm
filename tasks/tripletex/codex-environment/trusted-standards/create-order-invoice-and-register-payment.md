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
- the task explicitly requires sending the invoice — use `./trusted-standards/create-and-send-customer-invoice.md` instead
- the prompt gives only a service description (e.g. "Systemutvikling") without referencing existing products by number — use `./trusted-standards/create-and-send-customer-invoice.md` or `./trusted-standards/create-customer-invoice.md` instead; `POST /invoice` handles description-only order lines natively without needing a product

## Scoring Note
- **GET calls do not count against the efficiency score** — only writes (POST/PUT/DELETE) are scored
- use GETs liberally to gather information, verify state, and log important details
- the optimization target is minimizing write calls and errors, not total calls

## Standard Flow
1. `GET /customer?organizationNumber=...&fields=*` if the prompt identifies the customer by organization number; log customer id, name, organization number
2. `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)` using comma-separated prompt refs; verify that the returned count matches the expected count, and confirm each product name from the prompt as a secondary check; the expanded `vatType(*)` returns the VAT `percentage` needed to compute the exact invoice total; log each product's id, number, name, and vatType.percentage
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` — log the selected payment type id, description, and debit/credit account numbers
4. `GET /ledger/account?isBankAccount=true&fields=*` — proactive bank-account hedge; if the invoice bank account (`isInvoiceAccount=true`, usually number `1920`) lacks a `bankAccountNumber`, repair with `PUT /ledger/account/{id}` using `{ "bankAccountNumber": "12345678903" }` before the invoice write; skip the PUT if `bankAccountNumber` already exists; log account number, bankAccountNumber presence, and whether repair was needed
5. compute `paidAmount = Σ(unitPriceExcludingVat_i × count_i × (1 + vatType.percentage_i / 100))` from the resolved products; log the per-line breakdown and total
6. `POST /invoice?sendToCustomer=false&paymentTypeId=<id>&paidAmount=<computed total>` with body containing embedded `orders[]` with `orderLines` — **this is the only write call**
7. log from POST /invoice response: invoice id, invoiceNumber, amount, amountExcludingVat, amountOutstanding, amountCurrencyOutstanding, orders[0].id, orderLines count, isCharged, amountRoundoff
8. `GET /invoice/{id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))` — readback to verify and log full state: customer name/org linked correctly, each order line description + product name/number + unitPrice, amounts match prompt expectations
9. verify `amountCurrencyOutstanding=0` or `amountOutstanding=0`
10. stop

## Payload Rules
- on `POST /invoice`, send body:
  - `invoiceDate`
  - `invoiceDueDate`
  - `orders[]` containing one order with:
    - `customer: { "id": ... }`
    - `orderDate`
    - `deliveryDate`
    - `orderLines[]` with:
      - `product: { "id": ... }`
      - `description`
      - `count`
      - `unitPriceExcludingVatCurrency`
- `POST /invoice` creates the order and invoice in a single call; the `paymentTypeId` and `paidAmount` query parameters register full payment in the same write
- **paidAmount computation**: compute the exact invoice total including VAT from the resolved products: `paidAmount = Σ(unitPrice_i × count_i × (1 + vatType.percentage_i / 100))`; this requires `vatType(*)` in the product lookup fields; do NOT use `paidAmount=0.01` with `POST /invoice` — that only pays 0.01 (there is no `paymentTypeIdRestAmount` parameter on `POST /invoice`); do NOT overpay — overpaying creates negative outstanding
- preserve prompt product names/descriptions exactly when they are part of the scored state
- when resolving products from `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)`, verify the returned count matches the expected count; if any are missing, fall back to `GET /product?count=1000&fields=*,vatType(*)` and filter locally by the `number` response field
- do not rely on the `productNumber` field since it is often null/undefined in fresh accounts; `productNumber` is not even a valid field in ProductDTO's `fields` filter (returns 400)
- **CRITICAL type pitfall**: `product.number` is always a **string** in the API response (e.g. `"6247"`), never an integer; use `String(p.number) === String(promptRef)` or loose equality `p.number == promptRef` — strict `p.number === 6247` silently fails and wastes API calls on the retry
- **CRITICAL: always include bank-account recovery in the script from the first write** — writing the script without recovery and then re-running from scratch after a 422 doubles the API calls (the 2026-03-22 production run hit 11 calls instead of 6-7 because the initial script lacked recovery and had to restart all 3 reads + the failed POST)
- **recommended for fresh accounts**: use a proactive `GET /ledger/account?isBankAccount=true&fields=*` BEFORE the first `POST /invoice`; if the invoice bank account (usually `1920`) lacks a `bankAccountNumber`, repair it with `PUT /ledger/account/{id}` before proceeding — this avoids the 422 entirely and saves 1 call + 1 error vs the reactive recovery path (6 calls 0 errors vs 7 calls 1 error); when the bank account already has a number, the proactive check costs 1 extra call (5 total vs 4) but guarantees 0 errors
- the proactive hedge is the recommended default for this task shape because production always uses fresh accounts where bank-account status is unpredictable; 5 of 7 prior production runs did NOT need repair, but the 7th did — so the hedge is worth the tradeoff
- if you skip the proactive hedge and take the reactive path, the script MUST still include inline recovery logic for the `bankkontonummer` 422 to avoid the catastrophic script-restart waste
- **CRITICAL payment-type pitfall**: payment type objects from `GET /invoice/paymentType` do NOT have an `isIncoming` field; the returned keys are `id`, `version`, `url`, `description`, `displayName`, `debitAccount`, `creditAccount`, `vatType`, `sequence`, `customer`, `supplier`, `currencyId`, `currencyCode` — do NOT filter by `pt.isIncoming === true` as it will always find nothing and block the run; just use the first available payment type (any of them work for the invoice-and-payment write)

## Reuse From Write Response
- from `POST /invoice`:
  - `value.id` (invoice id)
  - `value.invoiceNumber`
  - `value.amountCurrencyOutstanding` or `value.amountOutstanding`
  - `value.orders[0].id` (order id)
  - invoice totals if needed for proof

## Verification
- **always do a readback GET after the invoice write** — GETs are free and the readback confirms full state
- `GET /invoice/{id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))` verifies:
  - customer is correctly linked (name, organizationNumber)
  - order exists with correct order lines
  - each order line has the correct product (name, number), description, count, unitPrice
  - amounts match expectations (amountExcludingVat = prompt ex-VAT total, amount = computed inc-VAT total)
  - amountOutstanding = 0
- log all key fields from the readback for debugging and scoring transparency

## Known Recovery Branches
- if `POST /invoice` fails only with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - update the existing invoice bank account with `PUT /ledger/account/{id}` using the minimal payload `{ "bankAccountNumber": "12345678903" }`
  - retry the same `POST /invoice?...` once with the same payload
- if `POST /invoice` succeeds but `amountOutstanding ≠ 0` (rounding edge case):
  - `PUT /invoice/{id}/:payment?paymentTypeId=<id>&paymentDate=<date>&paidAmount=<outstanding>&paidAmountCurrency=<outstanding>` to settle the remainder
  - this adds one extra call (5 total) only in the rounding edge case

## OpenAPI / Sandbox Status
- `POST /invoice`, `/invoice/paymentType`, and `/invoice/{id}/:payment` verified in `./openapi.json`
- `POST /invoice` accepts `paymentTypeId`, `paidAmount`, and `sendToCustomer` as query parameters; the request body accepts embedded `orders[]` with `orderLines[]` — the order and invoice are created in one call
- **GET calls are free** (do not count against efficiency score) — only writes (POST/PUT/DELETE) are scored
- the recommended exact-match path has **1 write call** (POST /invoice) plus free GETs for data gathering and verification:
  1. `GET /customer?organizationNumber=...&fields=*` (free)
  2. `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)` (free)
  3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` (free)
  4. `GET /ledger/account?isBankAccount=true&fields=*` (free) — proactive hedge; conditionally `PUT` to repair if `bankAccountNumber` is missing (this PUT is a write if needed)
  5. `POST /invoice?sendToCustomer=false&paymentTypeId=<id>&paidAmount=<computed total>` with embedded orders — **the only required write**
  6. `GET /invoice/{id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))` (free) — readback verification + logging
- the old 5-call path (`POST /order` + `PUT /order/:invoice`) had **2 writes**; the `POST /invoice` path has **1 write** — this is the primary efficiency gain
- the `paidAmount` must be the exact invoice total including VAT, computed as `Σ(unitPrice × count × (1 + vatType.percentage/100))` from the resolved products; `vatType(*)` on the product lookup provides the percentage
- do NOT use `paidAmount=0.01` with `POST /invoice` — unlike `PUT /order/:invoice`, `POST /invoice` has no `paymentTypeIdRestAmount` parameter, so it only pays the literal `paidAmount`; 0.01 leaves the rest outstanding
- do NOT overpay — setting `paidAmount` higher than the invoice total creates negative outstanding (a credit), not a cap at zero
- if the same run already holds a proven valid incoming `paymentTypeId` for the same company and currency, the path drops to 3 calls by skipping step 3
- the incoming `paymentTypeId` is account-specific; never hardcode it across environments
- the `/ledger/account` proactive hedge is now the recommended default for fresh accounts; it costs 1 extra call when bank acct exists (5 total) but saves 1 call + avoids 1 error when bank acct is missing (6 vs 7 calls, 0 vs 1 error); the 2026-03-22 production run proved the reactive path wastes calls catastrophically when the initial script lacks recovery
- sandbox verification on 2026-03-22 proved the 4-call path using `POST /invoice` with embedded orders:
  - `POST /invoice?sendToCustomer=false&paymentTypeId=<id>&paidAmount=<exact total>` with `orders[{customer,orderDate,deliveryDate,orderLines}]`
  - creates order + invoice + registers payment in one call
  - `paidAmount=<exact total>` settles the invoice: `amountOutstanding=0`, `amountCurrencyOutstanding=0`
  - readback confirmed: order exists with proper product-linked order lines
  - `paidAmount=0.01` only pays 0.01 on `POST /invoice` (no `paymentTypeIdRestAmount` param)
  - overpaying creates negative outstanding (credit), not a cap at zero
  - `vatType(*)` on product lookup provides the VAT percentage to compute exact total
  - tested with non-round prices (13450 + 14200) — no rounding issues
- production confirmations using the new `POST /invoice` path (4-call canonical):
  - 2026-03-22: Portuguese `Floresta Lda` / `919172657` — 3 products (4783/3343/4380), 3 VAT rates (25%/15%/0%), paidAmount=63032.50; **11 actual calls** (4 wasted from script restart + 7 with recovery); needed bank-account repair (GET ledger + PUT ledger + retry POST); root cause: initial script lacked recovery branch; **FIRST 3-product confirmation, FIRST POST /invoice production run, FIRST bank-account repair on this path**
  - 2026-03-22: Norwegian `Snøhetta AS` / `800082021` — 2 products (2797/5684), both 25% VAT, paidAmount=64562.50; **5 calls, 0 errors**; proactive hedge found bank account 1920 already configured (no PUT needed); 2nd POST /invoice production confirmation
  - 2026-03-22: English `Oakwood Ltd` / `932937204` — 2 products (3346/7273), both 25% VAT, paidAmount=47562.50; **6 calls (5 free GETs + 1 write), 0 errors**; proactive hedge found bank account already configured; readback confirmed correct product linkage (Data Advisory + Network Service), amountOutstanding=0; 3rd POST /invoice production confirmation
- prior production confirmations (all used the old 5-call path with `POST /order` + `PUT /order/:invoice`):
  - 2026-03-21: Portuguese `Solmar Lda` / `867069526` — 5 calls, 0 errors
  - 2026-03-21: English `Ridgepoint Ltd` / `997470311` — 5 calls, 0 errors
  - 2026-03-21: Nynorsk `Strandvik AS` / `911845016` — 6 calls (wasted 1 on nonexistent `pt.isIncoming`)
  - 2026-03-21: Portuguese `Cascata Lda` / `927161524` — 5 calls, 0 errors
  - 2026-03-21: Spanish `Río Verde SL` / `937237243` — 5 calls, 0 errors
  - 2026-03-22: French `Colline SARL` / `953795493` — 5 calls, 0 errors
- sandbox investigation on 2026-03-21 disproved three other call-reduction hypotheses:
  - inline `product: { number }`: orphaned lines, no product linkage
  - inline `customer: { organizationNumber }`: rejected 422
  - hardcoded `paymentTypeId=1`: rejected 422
  - `paymentTypeId` omission on any payment path: always rejected 422

## Product Lookup Strategy
- **primary**: `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)` — comma-separated `number` values use OR semantics and return all matching products in one call; `vatType(*)` expands the VAT type to include `percentage` needed for paidAmount computation
  - sandbox verification on 2026-03-21 confirmed: `number=7579,2292` returned both, `number=7579,2292,4366` returned all 3, partial matches (one exists, one doesn't) return found ones without error
  - if fewer products are returned than expected, fall back to `count=1000`
- **fallback**: `GET /product?count=1000&fields=*,vatType(*)` — returns all products, filter locally by `number` response field
  - reliable for fresh accounts with few products (typically 2-5 products)
- **CRITICAL**: do NOT use `number=X&number=Y` (repeated query params) — this uses non-OR semantics and only returns the first value
- **CRITICAL**: `productNumber` is not a valid field in ProductDTO's `fields` filter (returns 400); it exists only as a query parameter for filtering, and even then is unreliable across accounts
- the old 2-tier approach (`productNumber` first → `count=1000` fallback) was inconsistent and is superseded
- do NOT use `GET /product?ids=<ref>&fields=*` — prompt refs are small integers, never Tripletex internal IDs (84M+ range)
