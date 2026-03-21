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
2. `GET /product?count=1000&fields=*` and filter locally by the `number` response field matching the prompt refs, and by exact product name from the prompt as a secondary check
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
4. `POST /order` with embedded `orderLines`
5. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<id>&paidAmount=<seed>&paymentTypeIdRestAmount=<same-id>`
6. verify `amountCurrencyOutstanding=0` or `amountOutstanding=0` from the invoice write response
7. stop

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
- when resolving products from `GET /product?count=1000&fields=*`, match by the `number` response field against the prompt refs; do not rely on the `productNumber` field since it is often null/undefined in fresh accounts
- do not insert an automatic `GET /order/{id}` just because `POST /order` can echo `orderLines=[]`
- the canonical exact-match path does not include an automatic `GET /ledger/account` preflight
- if this is likely the first outgoing invoice in a fresh-account run and you intentionally choose the hedge against the missing-company-bank-account `422`, use one proactive `GET /ledger/account?isBankAccount=true&fields=*` before the first invoice write
- if you take that hedge and the chosen invoice account already has a `bankAccountNumber`, skip the repair and continue with the same invoice write
- for the combined invoice-and-payment write, use one valid incoming `paymentTypeId`, a minimal positive `paidAmount` seed, and the same id as `paymentTypeIdRestAmount`
- `paidAmount=0` is not a valid shortcut here; live validation treats it as missing
- for ordinary NOK runs, `paidAmount=0.01` is a proven safe seed that lets Tripletex calculate the remaining full payment automatically

## Reuse From Write Response
- from `POST /order`:
  - `value.id`
- from `PUT /order/{id}/:invoice`:
  - `value.id`
  - `value.invoiceNumber`
  - `value.amountCurrencyOutstanding` or `value.amountOutstanding`
  - invoice totals if needed for proof

## Verification
- default verification is zero extra calls after the combined invoice write
- trust the invoice write response when it proves remaining outstanding amount is `0`
- do not add a follow-up `GET /invoice/{id}` unless the task explicitly scores expanded linked fields that the write response omits

## Known Recovery Branches
- if `PUT /order/{id}/:invoice` fails only with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - update the existing invoice bank account with `PUT /ledger/account/{id}` using the minimal payload `{ "bankAccountNumber": "12345678903" }`
  - retry the same `PUT /order/{id}/:invoice?...` once
  - do not create a second order
- if the combined invoice-and-payment write rejects the seed-payment shape for an unexpected account-specific reason after the invoice already exists:
  - resume from the existing unpaid invoice instead of rebuilding the order
  - `GET /invoice/paymentType?...` only if the same run does not already hold a proven valid incoming payment type
  - `PUT /invoice/{id}/:payment?...` with the actual outstanding amount from the invoice object

## OpenAPI / Sandbox Status
- `/order`, `/order/{id}/:invoice`, `/invoice/paymentType`, and `/invoice/{id}/:payment` verified in `./openapi.json`
- the canonical exact-match path is 5 Tripletex API calls:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?count=1000&fields=*`
  3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  4. `POST /order` with embedded `orderLines`
  5. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<id>&paidAmount=0.01&paymentTypeIdRestAmount=<same-id>`
- if the same run already holds a proven valid incoming `paymentTypeId` for the same company and currency, the path drops to 4 calls by skipping step 3
- the incoming `paymentTypeId` is account-specific; never hardcode it across environments
- `paidAmount=0.01` is the proven seed for NOK runs; Tripletex calculates the remaining full payment automatically
- the invoice write returns `amountCurrencyOutstanding=0` directly when payment settles; no extra `PUT /invoice/{id}/:payment` call is needed
- the prompt ex-VAT total can differ from the payment amount because payment uses the invoice outstanding balance (which includes VAT)
- the `/ledger/account` bank-account hedge must stay conditional, not canonical; on accounts where the company bank account is already configured, it would waste a sixth call

## Why count=1000 Is the Default Product Lookup
- the old 2-tier approach (`productNumber` first → `count=1000` fallback) was inconsistent:
  - `productNumber` query param sometimes resolves products whose ref is stored under `number`, sometimes doesn't
  - in production on 2026-03-21, `productNumber=1851&productNumber=5065` found only 5065, missed 1851 — both had their ref under `number`
  - earlier production run on 2026-03-21 for `Luna SL` also had `productNumber=5271` miss — wasting 2 extra calls (one `ids` fallback + one `count=1000`)
- `count=1000` always resolves all products in a single call for fresh accounts with few products
- scored runs use fresh accounts that typically have 2-5 products, well within the count=1000 limit
- sandbox verification on 2026-03-21 confirmed the 5-call path with `count=1000` as default product lookup:
  - `GET /customer?organizationNumber=864062245&fields=*`
  - `GET /product?count=1000&fields=*` → resolved all products by `number` field filter
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false&paymentTypeId=32813748&paidAmount=0.01&paymentTypeIdRestAmount=32813748`
  - invoice outstanding=0 from write response, total 5 calls
- `number` multi-value query uses non-OR semantics (only first value returned), so `number=X&number=Y` cannot replace `count=1000`
- `productNumber` and `number` cross-param uses AND semantics, so combining them does not work
- do NOT use `GET /product?ids=<ref>&fields=*` as a fallback — prompt refs are small integers, never Tripletex internal IDs (84M+ range)
