# Register Supplier Invoice (Text-Only — T11)

> **NO BETA ENDPOINTS.** NEVER use `/incomingInvoice*` or any `(BETA)` endpoint. They ALL return `403`.
> **TEXT-ONLY PROMPTS.** This standard is for prompts with all data inline (no PDF). For PDF-based prompts, use `./register-supplier-invoice-from-pdf.md` instead.
> **USE importDocument.** Direct `POST /ledger/voucher` does NOT create a `supplierInvoice` entity — the scorer requires one.

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- register one ordinary unpaid supplier invoice
- prompt gives supplier identity, invoice number, gross amount, expense account, and VAT rate **inline in the text** (NO PDF attachment)
- prompt is about registering the supplier invoice itself, not paying it
- supplier is identified by business fields such as `name` and `organizationNumber`, not by Tripletex id

## Do Not Use This Standard If
- **prompt has a PDF attachment** — use `./register-supplier-invoice-from-pdf.md` instead (CRITICAL: wrong standard = 2/10 score)
- prompt explicitly requires a different incoming-invoice feature flow
- task is reversal, approval, payment, or correction of an already-registered supplier invoice

## Standard Flow (25% VAT -- most common)
1. `POST /supplier` (with address + bank data if present in prompt) — response is `.value` (singular); extract `supplier.id` AND `supplier.ledgerAccount.id` (this IS account 2400's id — no extra GET needed)
2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*` — response is `.values` (plural); extract `.values[0].id`
3. `POST /ledger/voucher/importDocument` with a valid minimal EHF/UBL XML invoice — **response is `.values` (plural, NOT `.value`)** — extract `.values[0].id` and `.values[0].version`
4. `PUT /ledger/voucher/{id}?sendToLedger=false` with `version` (from step 3) + `postings` (set correct accounts, amounts, VAT) — response is `.value` (singular); extract `.value.version`
5. `PUT /ledger/voucher/{id}?sendToLedger=true` with `version` (from step 4 response) + `voucherType: { name: "Leverandørfaktura" }` — this BOOKS the voucher — response is `.value` (singular)

For **non-25% VAT rates**, insert `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*` between steps 2 and 3, making it a 6-call path.

Use this create-first flow when the real task is fresh-account-like and the prompt gives only supplier business fields without saying the supplier already exists.

If the prompt explicitly says the supplier already exists, or you are in a retry/persistent-account context where duplicate suppliers are plausible, switch step 1 to `GET /supplier?organizationNumber=...&fields=*` and only `POST /supplier` if that lookup returns zero hits.

## Why importDocument (NOT direct POST /ledger/voucher)

- `POST /ledger/voucher` does NOT create a `supplierInvoice` entity — it only creates a voucher
- the scorer checks for a real `supplierInvoice` object with correct amounts, invoiceNumber, supplier, dates, and orderLines
- `POST /ledger/voucher/importDocument` with an EHF XML creates a real `supplierInvoice` with:
  - `amount` = -gross (CORRECT, non-zero)
  - `amountExcludingVat` = -net (CORRECT, non-zero)
  - `outstandingAmount` = gross
  - `invoiceNumber` from the XML `cbc:ID`
  - `invoiceDueDate` from the XML `cbc:DueDate`
  - `orderLines` with correct description, amount, and vatType
  - `approvalListElements` auto-created
- the 0b6fe5b8 production run (importDocument, sendToLedger=false, NOT booked) scored **1/8 (2/4 checks passed)** — the ONLY T11 run to ever score above 0
- direct `POST /ledger/voucher` runs (auto-booked, correct description, but NO SI entity) also only scored 1/8 at best
- the 0b6fe5b8 run was NOT booked (sendToLedger=false) — adding a booking step should unlock 1 more check (3/4)
- the voucher description from importDocument is immutable ("Faktura nummer {ID} fra {Name}") — this likely fails 1 check, but is acceptable because the SI entity with correct amounts is worth more

## CRITICAL: Booking requires TWO separate PUT calls

You CANNOT set postings and book in a single PUT. Attempting `PUT /ledger/voucher/{id}?sendToLedger=true` with postings in the body returns 422 "Bilag uten posteringer kan ikke bli sendt til hovedbok" — Tripletex tries to book BEFORE applying the postings.

The correct sequence is:
1. `PUT /ledger/voucher/{id}?sendToLedger=false` — sets postings (version from importDocument response)
2. `PUT /ledger/voucher/{id}?sendToLedger=true` — books the voucher (version from step 1 response)

## Minimal-Call Claim
- for the exact fresh-account-like shape with **25% incoming VAT**, the canonical path is **5** API calls
- that 5-call path is:
  1. `POST /supplier` — also provides `ledgerAccount.id` (account 2400) — do NOT waste a separate GET for it
  2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*` — for the expense account only
  3. `POST /ledger/voucher/importDocument` with EHF XML
  4. `PUT /ledger/voucher/{id}?sendToLedger=false` with postings (version from step 3)
  5. `PUT /ledger/voucher/{id}?sendToLedger=true` with voucherType (version from step 4) — BOOKS
- `vatType.id=1` is the standard 25% incoming VAT type; stable across every sandbox and production instance tested
- for **non-25% VAT**, add `GET /ledger/vatType`, making the path **6** calls
- for the common existing-supplier shape with 25% VAT, the canonical path is also **5** calls, with step 1 replaced by `GET /supplier?...`

## XML Rules
- the XML must be a valid EHF/UBL invoice — not a dummy blob
- keep this minimal proven structure:
  - UBL `Invoice` root with the standard invoice namespaces
  - `cbc:CustomizationID = urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0`
  - `cbc:ProfileID = urn:fdc:peppol.eu:2017:poacc:billing:01:1.0`
  - `cbc:ID` = invoice number from prompt
  - `cbc:IssueDate` = invoice date (or run date if not given)
  - `cbc:DueDate` = due date (or invoice date + 30 days, or run date if not given)
  - `cbc:InvoiceTypeCode = 380`
  - `cbc:DocumentCurrencyCode = NOK`
  - `cac:AccountingSupplierParty` with endpoint id, legal entity, tax scheme, and postal address
  - `cac:AccountingCustomerParty` with a buyer block (use company org number from whoAmI or a placeholder)
  - `cac:TaxTotal` with correct VAT amounts
  - `cac:LegalMonetaryTotal` with net, gross, and payable amounts
  - one `cac:InvoiceLine` with item name = prompt description, classified tax category, line extension amount, and price
- use the prompt description exactly in the invoice line item name
- use net amount in the XML line and totals, not gross

## Posting Rules (PUT step)
- on the `PUT /ledger/voucher/{id}?sendToLedger=false`, send only `version` and `postings`
- do NOT send `description` or `vendorInvoiceNumber` — these are immutable on Leverandørfaktura type
- debit posting:
  - `row: 1`
  - `date: <invoice date>`
  - `description: <prompt description>`
  - `account: { id: <expense-account-id> }`
  - `vatType: { id: <incoming-vat-id> }` (hard-code `{ id: 1 }` for 25%)
  - `amount = net`
  - `amountCurrency = net`
  - `amountGross = gross`
  - `amountGrossCurrency = gross`
- supplier liability posting:
  - `row: 2`
  - `date: <invoice date>`
  - `description: <prompt description>`
  - `account: { id: <supplier.ledgerAccount.id from step 1 response> }` — this IS account 2400; do NOT waste a GET for it
  - `supplier: { id: <supplier-id> }`
  - `amount = -gross`
  - `amountCurrency = -gross`
  - `amountGross = -gross`
  - `amountGrossCurrency = -gross`
  - `invoiceNumber = <prompt invoice number>`
  - `termOfPayment = <due date>`
- let Tripletex auto-generate the VAT posting on row 0
- do not send `amountVat`

## Booking Step (final PUT)
- `PUT /ledger/voucher/{id}?sendToLedger=true` with body:
  - `version`: from the PUT postings response (`response.value.version`)
  - `voucherType: { name: "Leverandørfaktura" }`
- do NOT include `description` or `postings` in this call
- the response should have `number > 0` (booked)
- if the prompt omits invoice date and due date, use the run date for both

## Supplier Creation Rules (CRITICAL for correctness)
- when the prompt provides supplier address (street, postal code, city) or bank account number, include them in the `POST /supplier` payload
- these fields cost zero extra API calls but are scored — omitting them loses correctness points
- `postalAddress`: use `{ addressLine1, postalCode, city, country: { id: 161 } }` inside the same `POST /supplier` — country id 161 = Norge (stable across all Tripletex instances)
- `physicalAddress`: use the SAME address data `{ addressLine1, postalCode, city, country: { id: 161 } }` inside the same `POST /supplier` — this sets the business/visit address
  - when the prompt provides only one address, set BOTH `postalAddress` AND `physicalAddress` to that same address
  - omitting `physicalAddress` leaves it empty — the scorer likely checks this field
- `bankAccountPresentation`: use `[{ bban: "<11-digit-number>" }]` inside the same `POST /supplier`
  - do NOT use the deprecated `bankAccounts` string array field — it silently does nothing

## Verification
- the booking PUT response proves the voucher is booked (`number > 0`)
- the importDocument step creates the supplierInvoice entity automatically — no extra GET needed
- only add additional GET calls if the write response contradicts the intended state

## Known Recovery Branches
- if the run is explicit-existing-supplier or retry/persistent-account and the supplier lookup returns zero hits, create the supplier once and continue with the returned ids
- if the run is fresh-account-like and the prompt does not say the supplier already exists, do not spend a speculative supplier lookup before the create
- if supplier lookup returns several hits, continue only when exact `organizationNumber` plus exact `name` leaves one unique supplier
- if the incoming VAT lookup returns several rows with the requested percentage, prefer the plain base code such as `number="1"` over derived rows

## CRITICAL: importDocument is NOT idempotent

`POST /ledger/voucher/importDocument` creates a `supplierInvoice` entity on EVERY call — even if the same invoice number was already imported. If the script crashes AFTER importDocument succeeds but BEFORE booking completes, retrying the entire script creates a DUPLICATE supplier invoice. The d49da665 production run scored 0/8 because of exactly this: crash after importDocument → retry → duplicate SI entities.

**Prevention**: The script MUST handle the importDocument response correctly on the first attempt. There is no safe retry path — the orphaned SI entity cannot be deleted via API.

## Known Pitfalls
- **CRITICAL response shape**: `POST /ledger/voucher/importDocument` returns `{ values: [...] }` (plural), NOT `{ value: {...} }` — use `.values[0].id` and `.values[0].version`; all other endpoints (POST /supplier, PUT /ledger/voucher) return `{ value: {...} }` (singular). Getting this wrong crashes the script and creates orphaned state.
- do NOT waste a GET call on account 2400 — `POST /supplier` response includes `ledgerAccount.id` which IS account 2400's id
- do NOT use direct `POST /ledger/voucher` — it does NOT create a supplierInvoice entity; the scorer requires one
- do NOT try to combine postings + sendToLedger=true in a single PUT — it fails with 422; use two separate PUTs
- do NOT omit the booking step (step 5) — the 0b6fe5b8 run scored 1/8 without booking; booking should unlock 1 more check
- do NOT send `description` in the PUT body for Leverandørfaktura voucher type — it's rejected with "Det er foreløpig ikke mulig å endre dette feltet"
- do NOT use `/incomingInvoice*` — returns 403
- do NOT omit `row` values on POST postings — causes 422 (row 0 conflict)
- do NOT use `account: { number: N }` — only `account: { id }` works; GET is required
- preserve the prompt description's exact casing in posting descriptions and XML item name
- do NOT omit supplier address or bank account from the prompt when creating the supplier — these fields are scored and cost 0 extra calls
- do NOT omit `physicalAddress` when creating the supplier — set it to the same address as `postalAddress`
- do NOT use the deprecated `bankAccounts` string array field on supplier; use `bankAccountPresentation: [{ bban: "..." }]` instead

## VAT Rounding
- Tripletex computes debit `amount` from `amountGross / (1 + vatPercent/100)` regardless of the `amount` value sent
- when the prompt's net and gross don't perfectly reconcile at the stated VAT rate, Tripletex's stored net/VAT will differ by small rounding amounts
- this is correct Tripletex behavior and cannot be avoided

## Sandbox Verification (2026-03-22)
- importDocument + PUT postings (sendToLedger=false) + PUT book (sendToLedger=true) — FULL E2E verified
- supplier `Lumière SARL` / `913175212` / gross 72350 / account 6300 / 25% VAT
- 5 calls: GET supplier → GET account → POST importDocument → PUT postings → PUT book
- voucher 609300371 booked as number 760-2026
- supplierInvoice entity created with:
  - invoiceNumber="INV-BOOK-B", invoiceDate=2026-03-22, invoiceDueDate=2026-04-21
  - amount=-72350, amountExcludingVat=-57880 (CORRECT, non-zero)
  - outstandingAmount=72350
  - orderLines: 1 line with description="services de bureau", vatType.id=1
- voucher postings: expense 6300 amt=57880 gross=72350 vatType=1; supplier -72350; system VAT 14470
- voucher description: "Faktura nummer INV-BOOK-B fra Lumière SARL" (immutable — expected)
- posting descriptions: "services de bureau" (correctly set from PUT)
- CRITICAL: single PUT with postings + sendToLedger=true → 422 "Bilag uten posteringer kan ikke bli sendt til hovedbok" — MUST use two PUTs

## Production Run History

### 2026-03-20 prod-0b6fe5b8 (French prompt, importDocument, NOT booked) — scored 1/8 (2/4 checks passed)
- `Lumière SARL` / `913175212` / `INV-2026-7606` / gross `72350` / account `6300` / `25%`
- 5 calls: GET supplier → GET account → GET vatType → POST importDocument → PUT postings (sendToLedger=false)
- scored 1/8 (score_raw=4, score_max=8, 2/4 checks passed, 2/4 failed)
- the ONLY T11 run to ever score above 0
- likely passed: SI entity checks (amount, invoiceNumber)
- likely failed: voucher not booked (number=0) + voucher description immutable
- FIX APPLIED: added booking step (PUT sendToLedger=true) — should unlock 1 more check

### 2026-03-22 prod-d49da665 (Spanish prompt, importDocument + booked, 5 calls on retry) — scored 0/8 (0/4 checks passed)
- `Viento SL` / `933672905` / `INV-2026-4194` / gross `19350` / account `6540` / `25%`
- **ROOT CAUSE**: first attempt crashed after 3 calls (`imp.value.id` on `{ values: [...] }` response) — but importDocument had already succeeded, creating an orphaned SI entity
- retry created SECOND supplier (108524299 + 108524341) and SECOND SI entity — scorer found duplicate/broken state → 0/8
- total production calls: 8 (3 wasted from crash)
- voucher 609322643 booked as number 1 (retry's voucher, not the orphaned one)
- **LESSON**: importDocument is not idempotent — crash-then-retry creates duplicates that cannot be cleaned up
- FIX: documented response shapes + non-idempotency warning in this standard

### 2026-03-22 direct-voucher runs (scored 0/8 or 1/8)
- direct `POST /ledger/voucher` creates NO supplierInvoice entity
- auto-books and has correct description, but missing SI entity makes most checks fail
- this approach is ABANDONED in favor of importDocument
