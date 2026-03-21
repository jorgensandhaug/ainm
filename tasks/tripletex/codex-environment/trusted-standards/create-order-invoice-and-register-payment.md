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

## Standard Flow
1. `GET /customer?organizationNumber=...&fields=*` if the prompt identifies the customer by organization number
2. `GET /product?number=<ref1>,<ref2>&fields=*` using comma-separated prompt refs; verify that the returned count matches the expected count, and confirm each product name from the prompt as a secondary check
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
- when resolving products from `GET /product?number=<ref1>,<ref2>&fields=*`, verify the returned count matches the expected count; if any are missing, fall back to `GET /product?count=1000&fields=*` and filter locally by the `number` response field
- do not rely on the `productNumber` field since it is often null/undefined in fresh accounts; `productNumber` is not even a valid field in ProductDTO's `fields` filter (returns 400)
- **CRITICAL type pitfall**: `product.number` is always a **string** in the API response (e.g. `"6247"`), never an integer; use `String(p.number) === String(promptRef)` or loose equality `p.number == promptRef` — strict `p.number === 6247` silently fails and wastes API calls on the retry
- do not insert an automatic `GET /order/{id}` just because `POST /order` can echo `orderLines=[]`
- the canonical exact-match path does not include an automatic `GET /ledger/account` preflight
- if this is likely the first outgoing invoice in a fresh-account run and you intentionally choose the hedge against the missing-company-bank-account `422`, use one proactive `GET /ledger/account?isBankAccount=true&fields=*` before the first invoice write
- if you take that hedge and the chosen invoice account already has a `bankAccountNumber`, skip the repair and continue with the same invoice write
- **CRITICAL payment-type pitfall**: payment type objects from `GET /invoice/paymentType` do NOT have an `isIncoming` field; the returned keys are `id`, `version`, `url`, `description`, `displayName`, `debitAccount`, `creditAccount`, `vatType`, `sequence`, `customer`, `supplier`, `currencyId`, `currencyCode` — do NOT filter by `pt.isIncoming === true` as it will always find nothing and block the run; just use the first available payment type (any of them work for the combined invoice-and-payment write)
- for the combined invoice-and-payment write, use one valid `paymentTypeId`, a minimal positive `paidAmount` seed, and the same id as `paymentTypeIdRestAmount`
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
  2. `GET /product?number=<ref1>,<ref2>&fields=*`
  3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  4. `POST /order` with embedded `orderLines`
  5. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<id>&paidAmount=0.01&paymentTypeIdRestAmount=<same-id>`
- if the same run already holds a proven valid incoming `paymentTypeId` for the same company and currency, the path drops to 4 calls by skipping step 3
- the incoming `paymentTypeId` is account-specific; never hardcode it across environments
- `paidAmount=0.01` is the proven seed for NOK runs; Tripletex calculates the remaining full payment automatically
- the invoice write returns `amountCurrencyOutstanding=0` directly when payment settles; no extra `PUT /invoice/{id}/:payment` call is needed
- the prompt ex-VAT total can differ from the payment amount because payment uses the invoice outstanding balance (which includes VAT)
- the `/ledger/account` bank-account hedge must stay conditional, not canonical; on accounts where the company bank account is already configured, it would waste a sixth call
- production confirmation on 2026-03-21 for Portuguese prompt `Solmar Lda` / `867069526` / `Sessão de formação (4466)` / `Licença de software (3717)` / prices `35600` + `3250`:
  - used `count=1000` product lookup (pre-comma-separated era), 5 calls, 0 errors, outstanding=0
- production confirmation on 2026-03-21 for English prompt `Ridgepoint Ltd` / `997470311` / `Maintenance (6293)` + `Software License (5849)` / prices `21700` + `2250`:
  - used comma-separated `number=6293,5849` product lookup, `String(p.number)` comparison, `paidAmount=0.01` seed
  - 5 calls, 0 errors, outstanding=0 — 2nd confirmation of the comma-separated product lookup path on this task shape
- production confirmation on 2026-03-21 for Nynorsk prompt `Strandvik AS` / `911845016` / `Skylagring (7865)` + `Datarådgjeving (3949)` / prices `38500` + `18500`:
  - used comma-separated `number=7865,3949` product lookup, `String(p.number)` comparison, `paidAmount=0.01` seed
  - **wasted 1 extra call** (6 total instead of 5): first script correctly fetched customer, products, and paymentTypes but then filtered by nonexistent `pt.isIncoming === true` and aborted; debug script re-fetched paymentTypes; second script reused hardcoded IDs for order+invoice
  - the fix: payment type objects have no `isIncoming` field — just use `pts[0]` (the first available payment type)
  - sandbox re-verified on 2026-03-21 that both "Kontant" and "Betalt til bank" work as `paymentTypeId` for the combined invoice-and-payment write
  - confirms the canonical 5-call path would have succeeded if the agent had not filtered by a nonexistent field

## Product Lookup Strategy
- **primary**: `GET /product?number=<ref1>,<ref2>&fields=*` — comma-separated `number` values use OR semantics and return all matching products in one call
  - sandbox verification on 2026-03-21 confirmed: `number=7579,2292` returned both, `number=7579,2292,4366` returned all 3, partial matches (one exists, one doesn't) return found ones without error
  - if fewer products are returned than expected, fall back to `count=1000`
- **fallback**: `GET /product?count=1000&fields=*` — returns all products, filter locally by `number` response field
  - reliable for fresh accounts with few products (typically 2-5 products)
- **CRITICAL**: do NOT use `number=X&number=Y` (repeated query params) — this uses non-OR semantics and only returns the first value
- **CRITICAL**: `productNumber` is not a valid field in ProductDTO's `fields` filter (returns 400); it exists only as a query parameter for filtering, and even then is unreliable across accounts
- the old 2-tier approach (`productNumber` first → `count=1000` fallback) was inconsistent and is superseded
- do NOT use `GET /product?ids=<ref>&fields=*` — prompt refs are small integers, never Tripletex internal IDs (84M+ range)
