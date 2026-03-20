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
5. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
6. `POST /order` with embedded `orderLines`
7. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<id>&paidAmount=<seed>&paymentTypeIdRestAmount=<same-id>`
8. verify `amountCurrencyOutstanding=0` or `amountOutstanding=0` from the invoice write response
9. stop

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
- when resolving `GET /product?productNumber=...&fields=*`, normalize both `number` and `productNumber` from the response; some accounts return the matched key under `number`
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
- if the first product-number lookup only partially resolves:
  - try one fallback `GET /product?ids=...&fields=*`
  - only then consider one final `GET /product?count=1000&fields=*` name-filter fallback
  - do not let a name-only match from the first product-number read count as resolution for a missing numeric ref
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
- exact downstream fast path re-proven on 2026-03-20 in production and sandbox
- when the first `GET /product?productNumber=...` already resolves every product and no same-run `paymentTypeId` is cached yet, the exact-match path is usually 5 Tripletex API calls:
  - `GET /customer`
  - `GET /product`
  - `GET /invoice/paymentType`
  - `POST /order`
  - `PUT /order/{id}/:invoice` with `paymentTypeId`, a minimal positive `paidAmount`, and `paymentTypeIdRestAmount`
- if the same run already holds a proven valid incoming `paymentTypeId` for the same company and currency, the path drops to 4 calls:
  - `GET /customer`
  - `GET /product`
  - `POST /order`
  - `PUT /order/{id}/:invoice` with the combined prepayment parameters
- re-verified earlier on 2026-03-20 in persistent sandbox for customer `864062245` with product refs `6749` and `3048`; before the combined-prepayment improvement was proven, the downstream split-tail path completed in 6 calls, selected payment type `32813748` (`Betalt til bank` / debit account `1920`), and settled the invoice to outstanding `0`
- further persistent-sandbox verification on 2026-03-20 with customer `975687821` and product refs `4366` / `3402` proved the lower-call replacement path:
  - `GET /customer?organizationNumber=975687821&fields=*`
  - `GET /product?productNumber=4366&productNumber=3402&fields=*`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false&paymentTypeId=32813748&paidAmount=0.01&paymentTypeIdRestAmount=32813748`
  - the invoice write returned `amountCurrencyOutstanding=0` directly, so the extra `PUT /invoice/{id}/:payment` call was unnecessary
- same-day production re-verification on 2026-03-20 for the exact Norwegian prompt `Vestfjord AS` / `970769994` / `Nettverksteneste (3237)` / `Analyserapport (4609)` / prices `13450` + `14200` also finished on the plain 5-call path with no `/ledger/account` repair branch:
  - `GET /customer?organizationNumber=970769994&fields=*`
  - `GET /product?productNumber=3237&productNumber=4609&fields=*`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false&paymentTypeId=<resolved>&paidAmount=0.01&paymentTypeIdRestAmount=<same-id>`
  - the invoice write returned outstanding `0`, so no extra payment or verification call was needed
- same-day production re-verification on 2026-03-20 for the exact German prompt `Waldstein GmbH` / `975687821` / `Netzwerkdienst (4366)` / `Beratungsstunden (3402)` completed in the same 5-call path with payment type `36030207` and no `/ledger/account` repair branch
- that paired production+sandbox proof confirms the flow is stable but the incoming `paymentTypeId` is still account-specific; do not hardcode the earlier sandbox id `32813748` into production or another environment
- the same sandbox proof also showed that `GET /product?productNumber=...&fields=*` can return the matched product ref under `number` instead of `productNumber`; resolvers must normalize both
- additional production re-verification on 2026-03-20 for customer `989093630` with product refs `5981` and `6784` had earlier completed in the same 6-call split-tail path with no `/ledger/account` hedge, and the created invoice outstanding was `63000` even though the prompt ex-VAT sum was `50400`
- production re-verification on 2026-03-20 again showed that the prompt ex-VAT total can differ from the payment amount because payment must use the created invoice outstanding balance
- production reflection on 2026-03-20 also showed that when the first outgoing order invoice in the account would otherwise hit the missing-company-bank-account validation, a proactive `/ledger/account` preflight would have saved one Tripletex call and avoided the `422`
- later production reflection on 2026-03-20 also showed the opposite risk: turning that `/ledger/account` hedge into a default step would spend a sixth call on accounts where the plain 5-call exact path already works, so the hedge must stay conditional rather than canonical
