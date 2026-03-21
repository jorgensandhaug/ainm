# Register Supplier Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- register one ordinary unpaid supplier invoice
- prompt gives supplier identity, invoice number, gross amount, expense account, and VAT rate
- prompt is about registering the supplier invoice itself, not paying it
- supplier is identified by business fields such as `name` and `organizationNumber`, not by Tripletex id

## Do Not Use This Standard If
- prompt explicitly requires a different incoming-invoice feature flow
- task is reversal, approval, payment, or correction of an already-registered supplier invoice
- task comes with a real source document that must itself be preserved or uploaded exactly as given

Do not treat `/incomingInvoice*` as the alternative public branch for this repo.
- those endpoints are beta-only here and should be treated as unavailable in scored runs
- the 2026-03-21 reflection re-check again returned `403 You do not have permission to access this feature.` on `/incomingInvoice/search`

## Standard Flow
1. `POST /supplier`
2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*`
4. `POST /ledger/voucher/importDocument` with a valid minimal EHF/UBL XML invoice carrying the prompt values
5. `PUT /ledger/voucher/{id}?sendToLedger=false` with a partial body containing only `version` and `postings`

Use this create-first flow when the real task is fresh-account-like and the prompt gives only supplier business fields without saying the supplier already exists.

If the prompt explicitly says the supplier already exists, or you are in a retry/persistent-account context where duplicate suppliers are plausible, switch step 1 to `GET /supplier?organizationNumber=...&fields=*` and only `POST /supplier` if that lookup returns zero hits.

## Minimal-Call Claim
- for the exact fresh-account-like shape where the prompt does not say the supplier already exists, the canonical path is `5` API calls
- that `5`-call path is:
  1. `POST /supplier`
  2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
  3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*`
  4. `POST /ledger/voucher/importDocument`
  5. `PUT /ledger/voucher/{id}?sendToLedger=false`
- for the common existing-supplier shape, the canonical path is also `5` calls, but with the first step replaced by `GET /supplier?...`
- the old lookup-first zero-hit branch is `6` calls total and is now dominated for fresh-account-like prompts that do not say the supplier already exists
- 2026-03-20 production for `Océan SARL` / `853705209` / `INV-2026-4914` / `56300` / `6500` / `25%` took that older zero-hit branch and therefore wasted one initial supplier lookup before creating the supplier anyway

## Why This Standard Exists
- direct `POST /ledger/voucher` can create a balanced voucher but not a real `supplierInvoice` object
- that voucher-only path scored `0/8` in production-like supplier-invoice tasks
- a valid EHF/XML import creates the `supplierInvoice` object first
- a partial `PUT /ledger/voucher/{id}` on that imported voucher can then add the correct accounting postings with correct VAT

## Critical Response Shape Rules
- `POST /ledger/voucher/importDocument` returns a **list wrapper** `{ values: [{ id, version, ... }] }`, NOT `{ value: { id } }`
- extract the voucher from `response.values[0].id` and `response.values[0].version`
- using `response.value.id` will crash and force an expensive recovery path to re-discover the voucher id
- 2026-03-21 production run for `Bølgekraft AS` / `861306178` / `INV-2026-3019` / `81812` / `6300` / `25%` wasted 4 calls (3 recovery GETs + 1 failed PUT) because of this wrong assumption
- 2026-03-21 sandbox re-proof confirmed: import returns `{ "fullResultSize": 0, "from": 0, "count": 1, "values": [{ "id": 608906382, "version": 1, ... }] }`

## Posting Row Rules
- the `PUT /ledger/voucher/{id}` postings MUST include explicit `row` values starting from `1`
- row `0` is reserved for the system-generated VAT posting; sending postings without explicit `row` will default them to row 0 and trigger `422 "Posteringene på rad 0 (guiRow 0) er systemgenererte og kan ikke opprettes eller endres på utsiden av Tripletex."`
- debit posting: `row: 1`
- supplier liability posting: `row: 2`
- the system-generated VAT posting will appear on row `0` in the response
- a failed 422 PUT does not bump the voucher version, so if you already have the version from the import response you can retry without re-reading

## Payload Rules
- in fresh-account-like runs, create the supplier first and reuse `response.value.id` plus `response.value.ledgerAccount.id`
- in explicit existing-supplier or retry/persistent-account runs, resolve the supplier first and reuse `supplier.id` plus `supplier.ledgerAccount.id`
- resolve the expense account by `number` and require `isApplicableForSupplierInvoice=true`
- resolve incoming VAT on the actual invoice date; choose the requested percentage and prefer base code `number="1"` when present for ordinary `25%`
- import a valid EHF/UBL invoice; do not use arbitrary XML or PDF as the trusted fast path
- in the XML, carry the exact prompt-scored values for:
  - supplier name
  - supplier organization number
  - invoice number
  - invoice date
  - due date
  - line description
  - net amount
  - gross amount
  - VAT percentage
- on the later `PUT /ledger/voucher/{id}`, send only:
  - `version`
  - `postings`
- do not send `description`, `vendorInvoiceNumber`, or other immutable imported header fields in that `PUT`
- debit posting:
  - `row: 1`
  - `account: { "id": <expense-account-id> }`
  - `description: <prompt description>`
  - `vatType: { "id": <incoming-vat-id> }`
  - `amount = net`
  - `amountCurrency = net`
  - `amountGross = gross`
  - `amountGrossCurrency = gross`
- supplier liability posting:
  - `row: 2`
  - `account: { "id": <supplier-ledger-account-id> }`
  - `supplier: { "id": <supplier-id> }`
  - `description: <prompt description>`
  - `amount = -gross`
  - `amountCurrency = -gross`
  - `amountGross = -gross`
  - `amountGrossCurrency = -gross`
  - `invoiceNumber = <prompt invoice number>`
  - `termOfPayment = <due date>`
- let Tripletex auto-generate the VAT posting
- do not send `amountVat`
- do not default `sendToLedger=true`; the trusted sandbox proof is with `sendToLedger=false`
- if the prompt omits invoice date and due date, use the run date for XML issue/due dates and supplier-posting `termOfPayment`

## XML Rules
- the XML must be a valid-enough EHF/UBL invoice, not a dummy blob
- keep this minimal proven structure:
  - UBL `Invoice` root with the standard invoice namespaces
  - `cbc:CustomizationID = urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0`
  - `cbc:ProfileID = urn:fdc:peppol.eu:2017:poacc:billing:01:1.0`
  - `cbc:InvoiceTypeCode = 380`
  - `cbc:DocumentCurrencyCode = NOK`
  - `cac:AccountingSupplierParty` with endpoint id, legal entity, tax scheme, and postal address
  - `cac:AccountingCustomerParty` with a stable buyer block; do not omit it just because the supplier is the scored entity
  - `cac:TaxTotal`
  - `cac:LegalMonetaryTotal`
  - one `cac:InvoiceLine` with item name, classified tax category, line extension amount, and price
- use the prompt description exactly in the invoice line item name
- use net amount in the XML line and totals, not gross
- earlier malformed/minimalized XML attempts failed with `422 Unable to identify document format`; do not improvise the structure

## Verification
- fast-path verification is zero extra calls
- trust the two writes together:
  - import creates the supplier invoice object family
  - voucher update response proves the final postings and VAT split
- a correct write response should show:
  - one manual debit posting on the requested expense account with requested incoming VAT type
  - one supplier liability posting linked to the supplier id
  - one system-generated VAT posting
- only add `GET /supplierInvoice?...` or `GET /ledger/voucher/{id}?fields=*` if the live write response contradicts the intended state or omits a scored field unexpectedly

## Known Recovery Branches
- if the run is explicit-existing-supplier or retry/persistent-account and the supplier lookup returns zero hits, create the supplier once and continue with the returned ids
- if the run is fresh-account-like and the prompt does not say the supplier already exists, do not spend a speculative supplier lookup before the create
- if supplier lookup returns several hits, continue only when exact `organizationNumber` plus exact `name` leaves one unique supplier
- if the incoming VAT lookup returns several rows with the requested percentage, prefer the plain base code such as `number="1"` over derived rows
- if the imported-voucher `PUT` returns validation that `description` or `vendorInvoiceNumber` cannot be changed, remove those fields from the `PUT`; they belong in the import, not the update
- if a one-line debit-only voucher update succeeds, that is not yet correct for taxable supplier invoices; use the balanced two-line update with currency amounts and explicit debit `vatType`
- if the two-line update omits currency amounts, sandbox proof showed `500`; keep `amountCurrency` and `amountGrossCurrency` on both rows
- if the importDocument response is accessed as `response.value.id` and crashes, the voucher was still created; recover with `GET /ledger/voucher?dateFrom=...&dateTo=...&fields=*` using a range that spans at least one day beyond the invoice date (dateTo is exclusive), then continue with the PUT using the discovered id and version

## Known Pitfalls
- do NOT access the importDocument response as `response.value`; it is `response.values[0]` — this mistake alone cost 4 extra calls in the 2026-03-21 production run
- do NOT omit `row` values on PUT postings; without explicit `row: 1` and `row: 2`, Tripletex defaults to row 0 which conflicts with the system-generated VAT row and returns `422`
- if you must search for the voucher after a lost import response, `GET /ledger/voucher` requires both `dateFrom` and `dateTo`, and `dateTo` is exclusive (same date for both returns `422`); use `dateTo` = invoice date + 1 day
- the XML org number in `EndpointID` and `CompanyID` must pass PEPPOL mod11 validation; random 9-digit numbers will fail `422`

## OpenAPI / Sandbox Status
- `/supplier`, `/ledger/account`, `/ledger/vatType`, `/ledger/voucher/importDocument`, and `/ledger/voucher/{id}` verified in `./openapi.json`
- later-payment caveat on this exact imported object family:
  - persistent sandbox on 2026-03-21 returned `422 Cannot add payment to unregistered voucher` on imported supplier invoice `2147547151` through `POST /supplierInvoice/{id}/:addPayment`
  - that same invoice later read back with booked voucher number `100`, so later supplier payment is still not a proven public continuation of this create-only standard
  - do not let this create standard imply that `/supplierInvoice/{id}/:addPayment` is automatically safe on invoices produced by this branch
- 2026-03-20 sandbox proof:
  - exact original task values for `Elvdal AS` / `889157917` / `INV-2026-8662` / `39750` / `6500` / `25%`
  - imported voucher `608856087`
  - supplier invoice `2147547151`
  - final voucher update created:
    - expense posting `6500`, `vatType.id=1`, `amount=31800`, `amountGross=39750`
    - supplier posting `-39750` linked to supplier id
    - system VAT posting `7950`
- 2026-03-20 persistent-sandbox re-proof for the French office-services shape:
  - supplier `Lumière SARL` / `913175212`
  - invoice number `INV-SANDBOX-7606-1774045461190`
  - description `services de bureau`
  - gross `72350`
  - net `57880`
  - VAT `25%`
  - expense account `6300`
  - supplier lookup returned zero hits, so the run used the `6`-call create branch
  - imported voucher `608864697`
  - final voucher update returned:
    - expense row on `6300` with `vatType.id=1`, `amount=57880`, `amountGross=72350`
    - supplier row `-72350` linked to the created supplier id
    - system VAT row `14470`
- 2026-03-20 persistent-sandbox re-proof for this session's exact amount/account shape:
  - supplier `Minimal Proof Supplier 007945 AS` / `910079457`
  - invoice number `INV-SANDBOX-MIN-007945`
  - description `kontortjenester`
  - gross `61600`
  - net `49280`
  - VAT `25%`
  - expense account `6340`
  - path used exactly `5` calls:
    1. `POST /supplier`
    2. `GET /ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*`
    3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*`
    4. `POST /ledger/voucher/importDocument`
    5. `PUT /ledger/voucher/{id}?sendToLedger=false`
  - created supplier `108283334`
  - voucher `608865450`
  - final voucher update returned:
    - expense row on `6340` with `vatType.id=1`, `amount=49280`, `amountGross=61600`
    - supplier row `-61600` linked to the created supplier id
    - system VAT row `12320`
- 2026-03-20 persistent-sandbox re-proof for the exact fresh-account-like French office-services shape showed the lower-call branch:
  - supplier `Océan Reflection SARL 321000010` / `321000010`
  - invoice number `INV-SANDBOX-4914-321000010`
  - description `services de bureau`
  - gross `56300`
  - net `45040`
  - VAT `25%`
  - expense account `6500`
  - path used exactly `5` calls:
    1. `POST /supplier`
    2. `GET /ledger/account?number=6500&isApplicableForSupplierInvoice=true&fields=*`
    3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*`
    4. `POST /ledger/voucher/importDocument`
    5. `PUT /ledger/voucher/{id}?sendToLedger=false`
  - created supplier `108282959`
  - imported voucher `608865065`
  - final voucher update returned:
    - expense row on `6500` with `vatType.id=1`, `amount=45040`, `amountGross=56300`
    - supplier row `-56300` linked to the created supplier id
    - system VAT row `11260`
- 2026-03-21 production run for `Bølgekraft AS` / `861306178` / `INV-2026-3019` / `81812` / `6300` / `25%`:
  - used 9 calls instead of optimal 5 due to two bugs:
    1. accessed importDocument response as `response.value.id` instead of `response.values[0].id`, crashing before capturing voucher id
    2. omitted `row` values on PUT postings, triggering `422` on system-generated row 0
  - recovery path: 2 failed voucher searches (missing dateFrom/dateTo, then dateTo exclusive), 1 successful broad-range search, 1 failed PUT without rows, 1 successful PUT with rows
  - final state was correct: expense row 6300 `vatType.id=1` `amount=65449.6` `amountGross=81812`, supplier row `-81812`, system VAT row `16362.4`
- 2026-03-21 persistent-sandbox re-proof confirmed both bugs and correct fix:
  - importDocument returns `{ values: [{ id: 608906382, version: 1 }] }` (list wrapper, NOT single-value wrapper)
  - PUT without row values fails with `422` "Posteringene på rad 0 (guiRow 0) er systemgenererte..."
  - PUT with `row: 1` and `row: 2` succeeds on first try
  - failed 422 PUT does not bump voucher version
  - corrected 5-call path: POST supplier, GET account, GET vatType, POST importDocument (extract `values[0]`), PUT voucher with explicit `row: 1`/`row: 2`
