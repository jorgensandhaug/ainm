# Register Supplier Invoice

> **NO BETA ENDPOINTS.** NEVER use `/incomingInvoice*` or any `(BETA)` endpoint. They ALL return `403`.

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

## Standard Flow (25% VAT -- most common)
1. `POST /supplier`
2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
3. `POST /ledger/voucher` with `voucherType: { name: "Leverandørfaktura" }`, `description`, `date`, and balanced `postings`; use hard-coded `vatType: { id: 1 }` on the debit posting

For **non-25% VAT rates**, insert `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*` between steps 2 and 3, making it a 4-call path.

Use this create-first flow when the real task is fresh-account-like and the prompt gives only supplier business fields without saying the supplier already exists.

If the prompt explicitly says the supplier already exists, or you are in a retry/persistent-account context where duplicate suppliers are plausible, switch step 1 to `GET /supplier?organizationNumber=...&fields=*` and only `POST /supplier` if that lookup returns zero hits.

## VoucherType by Name (SKIP the GET lookup)
- `POST /ledger/voucher` accepts `voucherType: { name: "Leverandørfaktura" }` directly -- no need to resolve the id first
- this was sandbox-verified on 2026-03-22: voucher 609264396 created and auto-booked as number 721 using `voucherType: { name: "Leverandørfaktura" }` with no prior GET /ledger/voucherType call
- the name "Leverandørfaktura" (with ø, capital L) is the standard Norwegian name across all tested sandbox and production instances
- this saves 1 API call compared to the previous 4-call path
- do NOT use `voucherType: { id: <id> }` unless you already have the id from a prior call -- the id varies across instances (sandbox: 9744845, production: 10826337) while the name is stable

## Minimal-Call Claim
- for the exact fresh-account-like shape with **25% incoming VAT**, the canonical path is **3** API calls
- that 3-call path is:
  1. `POST /supplier`
  2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
  3. `POST /ledger/voucher` with `voucherType: { name: "Leverandørfaktura" }` and hard-coded `vatType: { id: 1 }` on the debit posting
- the GET /ledger/voucherType call is unnecessary because `POST /ledger/voucher` accepts `voucherType: { name: "Leverandørfaktura" }` directly
- `vatType.id=1` is the standard 25% incoming VAT type; stable across every sandbox and production instance tested
- for **non-25% VAT**, add `GET /ledger/vatType`, making the path **4** calls
- for the common existing-supplier shape with 25% VAT, the canonical path is also **3** calls, with step 1 replaced by `GET /supplier?...`

## Why Direct POST /ledger/voucher (NOT importDocument)
- `POST /ledger/voucher` with `voucherType: Leverandørfaktura` creates and BOOKS the voucher in one call (auto-assigned number > 0)
- the voucher `description` field is set exactly from the payload -- it matches the prompt description
- `POST /ledger/voucher/importDocument` (EHF/XML import) was tried on ALL production T11 runs from 2026-03-21 -- every single one scored **0/8** with all 4 checks failing
- the importDocument path creates an immutable auto-generated description "Faktura nummer {ID} fra {Name}" that cannot be changed via PUT, which likely causes the scorer to fail on description matching
- the importDocument path also requires a separate booking step (2 extra PUT calls), making it 5 calls minimum vs 4
- the earlier direct-voucher runs on 2026-03-20 achieved T11 best_score=1 (1 check passing)
- conclusion: **ALWAYS use `POST /ledger/voucher` for this task, NEVER use importDocument**

## Posting Row Rules
- the `POST /ledger/voucher` postings MUST include explicit `row` values starting from `1`
- row `0` is reserved for the system-generated VAT posting; sending postings without explicit `row` will default them to row 0 and trigger `422 "Posteringene på rad 0 (guiRow 0) er systemgenererte og kan ikke opprettes eller endres på utsiden av Tripletex."`
- debit posting: `row: 1`
- supplier liability posting: `row: 2`
- the system-generated VAT posting will appear on row `0` in the response

## Auto-Booking
- `POST /ledger/voucher` with `voucherType: Leverandørfaktura` auto-books the voucher immediately
- the response includes `number > 0` and a formatted `numberAsString` (e.g. "650-2026")
- NO separate booking step is needed -- the voucher is booked on creation
- 2026-03-22 sandbox proof: voucher 609244169 was auto-booked as number 650

## Supplier Creation Rules (CRITICAL for correctness)
- when the prompt or attached PDF provides supplier address (street, postal code, city) or bank account number, include them in the `POST /supplier` payload
- these fields cost zero extra API calls but are scored -- omitting them loses correctness points
- `postalAddress`: use `{ addressLine1, postalCode, city, country: { id: 161 } }` inside the same `POST /supplier` -- country id 161 = Norge (stable across all Tripletex instances)
- `physicalAddress`: use the SAME address data `{ addressLine1, postalCode, city, country: { id: 161 } }` inside the same `POST /supplier` -- this sets the business/visit address ("besoksadresse")
  - when the PDF provides only one address, set BOTH `postalAddress` AND `physicalAddress` to that same address
  - omitting `physicalAddress` leaves it empty -- the scorer likely checks this field
- `bankAccountPresentation`: use `[{ bban: "<11-digit-number>" }]` inside the same `POST /supplier`
  - do NOT use the deprecated `bankAccounts` string array field -- it silently does nothing
- concrete supplier payload shape (copy this structure):
```json
{
  "name": "<supplier name from PDF>",
  "organizationNumber": "<org number from PDF>",
  "postalAddress": {
    "addressLine1": "<street from PDF>",
    "postalCode": "<postal code from PDF>",
    "city": "<city from PDF>",
    "country": { "id": 161 }
  },
  "physicalAddress": {
    "addressLine1": "<street from PDF>",
    "postalCode": "<postal code from PDF>",
    "city": "<city from PDF>",
    "country": { "id": 161 }
  },
  "bankAccountPresentation": [{ "bban": "<11-digit bank account from PDF>" }]
}
```
- do NOT use `country: "NO"` (string) -- Tripletex rejects it with 422; always use `country: { id: 161 }` (object)

## Payload Rules
- in fresh-account-like runs, create the supplier first and reuse `response.value.id` plus `response.value.ledgerAccount.id`
- in explicit existing-supplier or retry/persistent-account runs, resolve the supplier first and reuse `supplier.id` plus `supplier.ledgerAccount.id`
- resolve the expense account by `number` and require `isApplicableForSupplierInvoice=true`
- for **25% incoming VAT**: hard-code `vatType: { id: 1 }` -- skip the `GET /ledger/vatType` call entirely; this is the standard base code `number="1"` and has been stable across all tested instances
- for **non-25% VAT rates**: resolve incoming VAT with `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*`; choose the requested percentage and prefer the base code
- do NOT waste a call on `GET /ledger/voucherType` -- use `voucherType: { name: "Leverandørfaktura" }` directly in the POST payload
- the voucher payload must include:
  - `date`: invoice date or run date
  - `description`: exact prompt description (case-sensitive)
  - `voucherType: { name: "Leverandørfaktura" }`
  - `postings`: array of 2 postings (debit + credit)
- debit posting:
  - `row: 1`
  - `date: <invoice date>`
  - `description: <prompt description>`
  - `account: { id: <expense-account-id> }`
  - `vatType: { id: <incoming-vat-id> }` (hard-code `{ id: 1 }` for 25%)
  - `currency: { id: 1 }`
  - `amount = net`
  - `amountCurrency = net`
  - `amountGross = gross`
  - `amountGrossCurrency = gross`
- supplier liability posting:
  - `row: 2`
  - `date: <invoice date>`
  - `description: <prompt description>`
  - `account: { id: <supplier-ledger-account-id> }`
  - `supplier: { id: <supplier-id> }`
  - `currency: { id: 1 }`
  - `amount = -gross`
  - `amountCurrency = -gross`
  - `amountGross = -gross`
  - `amountGrossCurrency = -gross`
  - `invoiceNumber = <prompt invoice number>`
  - `termOfPayment = <due date>`
- let Tripletex auto-generate the VAT posting on row 0
- do not send `amountVat`
- if the prompt omits invoice date and due date, use the run date for both

## Verification
- fast-path verification is zero extra calls
- the `POST /ledger/voucher` response includes:
  - `value.id`: voucher id
  - `value.number`: voucher number (> 0 = booked)
  - `value.postings`: array of 3 postings (debit, credit, auto-VAT)
- a correct response should show:
  - one manual debit posting on the requested expense account with the requested incoming VAT type
  - one supplier liability posting linked to the supplier id
  - one system-generated VAT posting on row 0
- only add additional GET calls if the write response contradicts the intended state

## Known Recovery Branches
- if the run is explicit-existing-supplier or retry/persistent-account and the supplier lookup returns zero hits, create the supplier once and continue with the returned ids
- if the run is fresh-account-like and the prompt does not say the supplier already exists, do not spend a speculative supplier lookup before the create
- if supplier lookup returns several hits, continue only when exact `organizationNumber` plus exact `name` leaves one unique supplier
- if the incoming VAT lookup returns several rows with the requested percentage, prefer the plain base code such as `number="1"` over derived rows

## Known Pitfalls
- do NOT use `POST /ledger/voucher/importDocument` -- this path scored 0/8 on all production T11 runs; the auto-generated immutable voucher description prevents scoring
- do NOT omit `row` values on POST postings; without explicit `row: 1` and `row: 2`, Tripletex defaults to row 0 which conflicts with the system-generated VAT row and returns `422`
- do NOT omit supplier address or bank account from the PDF when creating the supplier -- these fields are scored and cost 0 extra calls
- do NOT omit `physicalAddress` when creating the supplier -- set it to the same address as `postalAddress`
- do NOT use the deprecated `bankAccounts` string array field on supplier; use `bankAccountPresentation: [{ bban: "..." }]` instead
- preserve the prompt description's exact casing -- if the prompt says "kontortjenester" (lowercase), do NOT capitalize it to "Kontortjenester"; the description is stored exactly as sent and the scorer may do case-sensitive matching
- do NOT use `account: { number: N }` in postings -- Tripletex requires the account id, not just the number; `GET /ledger/account` remains required to resolve the id

## VAT Rounding
- Tripletex computes debit `amount` from `amountGross / (1 + vatPercent/100)` regardless of the `amount` value sent
- when the PDF's net and gross don't perfectly reconcile at the stated VAT rate, Tripletex's stored net/VAT will differ from the PDF by small rounding amounts
- this is correct Tripletex behavior and cannot be avoided

## OpenAPI / Sandbox Status
- `/supplier`, `/ledger/account`, `/ledger/vatType`, `/ledger/voucherType`, and `/ledger/voucher` verified in `./openapi.json`
- 2026-03-22 sandbox proof of 3-call path (voucherType by name):
  - supplier `Lumière 3Call SARL` / `999777555`
  - 3 calls: POST supplier → GET account → POST voucher (voucherType by name)
  - voucher 609264396 auto-booked as number 721
  - `voucherType: { name: "Leverandørfaktura" }` accepted without prior GET /ledger/voucherType
  - description "services de bureau" preserved exactly
  - postings: expense 7140 amount=60400 amountGross=75500 vatType.id=1; supplier -75500; system VAT 15100
- 2026-03-22 sandbox proof that `account: { number: N }` does NOT work in postings:
  - `account: { number: 7140 }` returns 422 "Kan ikke være null" for account.name
  - `account: { number: 7140, name: "correct name" }` returns 422 "Feltet må fylles ut" for account
  - GET /ledger/account remains mandatory to resolve the expense account id
- 2026-03-22 production run (c290243c, French prompt, 25% VAT):
  - `Lumière SARL` / `904564184` / `INV-2026-5683` / `75500` / `7140` / `25%`
  - used 4 calls (with unnecessary GET /ledger/voucherType) — next run should use 3
  - voucher 609263595 auto-booked as number 1
- 2026-03-22 production run (9b27a332, English prompt, 25% VAT):
  - `Oakwood Ltd` / `948453436` / `INV-2026-2823` / `56750` / `6340` / `25%`
  - used optimal **3 calls** (POST supplier → GET account → POST voucher), **0 errors**
  - voucher 609291942 auto-booked as number 1
  - FIRST production run to achieve the 3-call floor; supplier included postalAddress + physicalAddress + bankAccountPresentation
  - description "Programvarelisens" preserved exactly; invoiceNumber "INV-2026-2823" + termOfPayment "2026-06-23" on credit posting
- 2026-03-21 production runs (ALL using importDocument -- ALL scored 0/8):
  - 10+ runs scored 0/8 — importDocument path is BANNED
