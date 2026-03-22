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

> **CRITICAL: DO NOT BOOK THE VOUCHER.** Production data proves booking BREAKS T11 scoring.
> - 0b6fe5b8 (UNBOOKED): 2/4 checks passed — the ONLY T11 run to EVER score above 0
> - ALL booked runs (8c302260, aa847819, b8f958e4, c290243c, d49da665): 0/4 checks — ALL checks fail when booked
> - "Registrer" (register) ≠ "Bokfør" (book) — the prompt says to REGISTER, not to BOOK

1. `POST /supplier` (with address + bank data if present in prompt) — response is `.value` (singular); extract `supplier.id` AND `supplier.ledgerAccount.id` (this IS account 2400's id — no extra GET needed)
2. `GET /ledger/account?number=...&fields=id,number,vatLocked,legalVatTypes` — response is `.values` (plural); extract `.values[0].id` AND check `.values[0].vatLocked` — **do NOT use `isApplicableForSupplierInvoice=true` filter** (it excludes vatLocked accounts like 7100, returning empty results → crash)
3. **If vatLocked** (step 2): `GET /ledger/account?number=2710&fields=id` — get input VAT account id for manual VAT split (for 12% VAT use 2711 instead)
4. `POST /ledger/voucher/importDocument` with a valid minimal EHF/UBL XML invoice — **response is `.values` (plural, NOT `.value`)** — extract `.values[0].id` and `.values[0].version`
5. `GET /supplierInvoice?voucherId={voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*` — **verification**: confirm SI entity was created; log `id`, `amount`, `amountExcludingVat`, `invoiceNumber`, `kidOrReceiverReference`, `invoiceDueDate`. **CRITICAL**: `invoiceDateFrom` and `invoiceDateTo` are REQUIRED — omitting them returns 422 "Kan ikke være null"
6. `PUT /ledger/voucher/{id}?sendToLedger=false` with `version` (from step 4) + `postings` — response is `.value` (singular); extract `.value.version` — **see Posting Rules for standard vs vatLocked accounts**. **STOP HERE — DO NOT BOOK.**
7. `GET /ledger/voucher/{id}?fields=id,number,date,description,voucherType(*),postings(*)` — **verification**: confirm `number=0` (unbooked=CORRECT), log postings, description, voucherType. **CRITICAL**: plain `fields=*` returns posting IDs only (URL stubs) — you MUST use `postings(*)` for expanded posting data (account, amount, vatType, etc.)
8. `GET /supplier/{supplierId}?fields=*` — **verification**: confirm `postalAddress`, `physicalAddress`, `bankAccountPresentation` all populated
9. `GET /supplierInvoice/{siId}?fields=*,orderLines(*)` — **verification**: confirm `orderLines` have correct `description`, `amountExcludingVat`, `vatType`

For **non-25% VAT rates**, insert `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*` between steps 2 and 4.

**GETs do NOT lower the score.** Use them liberally for verification and logging.

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

## CRITICAL: DO NOT BOOK — Production Evidence

**ALL booked T11 runs score 0/8 (all 4 checks fail). The ONLY run scoring above 0 was UNBOOKED.**

| Run | Booked? | Checks | Score |
|-----|---------|--------|-------|
| 0b6fe5b8 | NO | 1✓ 2✓ 3✗ 4✗ | 4/8 (normalized=1) |
| 8c302260 | YES | 1✗ 2✗ 3✗ 4✗ | 0/8 |
| aa847819 | YES | 1✗ 2✗ 3✗ 4✗ | 0/8 |
| b8f958e4 | YES | 1✗ 2✗ 3✗ 4✗ | 0/8 |
| c290243c | YES | 1✗ 2✗ 3✗ 4✗ | 0/8 |

The Norwegian prompts say "Registrer" (register) — this means enter/draft, NOT "Bokfør" (book to ledger). Booking the voucher changes its state in a way the scorer does not expect.

**Action: Send postings with `sendToLedger=false` and STOP. Do NOT do a second PUT with `sendToLedger=true`.**

The 0b6fe5b8 run that scored 1/8 was MISSING:
- PaymentMeans/PayeeFinancialAccount in XML (→ empty kidOrReceiverReference)
- DueDate +30 days (used same-day instead)
- physicalAddress on supplier

These fixes may unlock checks 3+4. Sandbox-verified 2026-03-22: unbooked + PaymentMeans + DueDate +30 + physicalAddress all work correctly.

## Call Counts
- **Write calls**: 3 (POST supplier, POST importDocument, PUT postings with sendToLedger=false)
- **Verification GETs**: 3 (GET supplierInvoice, GET voucher, GET supplierInvoice+orderLines) — these do NOT lower score
- **Lookup GETs**: 1 (GET account) for non-vatLocked accounts; 2 (GET expense account + GET 2710) for vatLocked accounts
- **Total**: 7 calls standard, 8 for vatLocked accounts, +1 for non-25% VAT
- `vatType.id=1` is the standard 25% incoming VAT type; stable across every sandbox and production instance tested

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
  - `cac:AccountingCustomerParty` with a buyer block — **hard-code buyer org number `987654325`** (valid mod11); do NOT use `000000000` (fails PEPPOL-COMMON-R041 mod11 validation → 422) and do NOT try `GET /company/whoAmI` (proxy returns 422 "Expected number")
  - `cac:TaxTotal` with correct VAT amounts
  - `cac:LegalMonetaryTotal` with net, gross, and payable amounts
  - one `cac:InvoiceLine` with item name = prompt description, classified tax category, line extension amount, and price
  - `cac:PaymentMeans` with `cbc:PaymentMeansCode=30`, `cbc:PaymentID=${invoiceNumber}` (sets `kidOrReceiverReference` on the SI entity), and **`cac:PayeeFinancialAccount/cbc:ID`** — use the supplier bank account from the prompt, or `NO0000000000000` if no bank account is given
- **CRITICAL BR-61**: `PaymentMeansCode=30` ALWAYS requires `cac:PayeeFinancialAccount/cbc:ID` — omitting it triggers 422 "ERROR [BR-61]-If the Payment means type code (BT-81) means SEPA credit transfer...the Payment account identifier (BT-84) shall be present." This is a PEPPOL validation rule, NOT a Tripletex-specific check. Sandbox-verified 2026-03-22.
- **CRITICAL**: include `cac:PaymentMeans` with `PaymentID` in the XML — without it, `kidOrReceiverReference` stays empty on the SI entity. T20 runs without PaymentMeans consistently fail Check 5; the same applies to T11. Sandbox-verified 2026-03-22.
- use the prompt description exactly in the invoice line item name
- use net amount in the XML line and totals, not gross

## Posting Rules (PUT step)
- on the `PUT /ledger/voucher/{id}?sendToLedger=false`, send only `version` and `postings`
- do NOT send `description` or `vendorInvoiceNumber` — these are immutable on Leverandørfaktura type
- **check `vatLocked` from step 2** — if `true`, use the vatLocked postings below; otherwise use standard postings

### Standard postings (account NOT vatLocked)
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

### VatLocked postings (account has `vatLocked=true`, e.g. 7100)
When the expense account is locked to vatType 0, setting `vatType: { id: 1 }` returns **422** "Kontoen ... er låst til mva-kode 0: Ingen avgiftsbehandling." Use a **manual 3-posting VAT split** instead:
- expense posting (row 1): account = expense, amount = NET, amountGross = NET (no VAT inflation)
- VAT posting (row 2): account = 2710, amount = VAT_AMT, amountGross = VAT_AMT
- supplier posting (row 3): account = 2400, supplier linked, amount = -GROSS, invoiceNumber, termOfPayment

This produces the same accounting result as the standard 2-posting + auto-VAT approach. The SI entity amounts from importDocument are unaffected — they come from the XML, not the postings. Sandbox-verified 2026-03-22: account 7100 with manual 3-posting split books successfully (voucher 609414584, number 909).

## NO Booking Step — REGISTER ONLY

**DO NOT BOOK.** The voucher must remain in draft state (`number=0`). All booked T11 runs scored 0/8.

After the PUT postings with `sendToLedger=false`, the task is COMPLETE. Do NOT do a second PUT with `sendToLedger=true`.

- if the prompt omits invoice date: use the run date
- if the prompt omits due date: use run date + 30 days in the XML DueDate (importDocument populates `invoiceDueDate` from this)

## Supplier Creation Rules (CRITICAL for correctness)
- when the prompt provides supplier address (street, postal code, city) or bank account number, include them in the `POST /supplier` payload
- these fields cost zero extra API calls but are scored — omitting them loses correctness points
- `postalAddress`: use `{ addressLine1, postalCode, city, country: { id: 161 } }` inside the same `POST /supplier` — country id 161 = Norge (stable across all Tripletex instances)
- `physicalAddress`: use the SAME address data `{ addressLine1, postalCode, city, country: { id: 161 } }` inside the same `POST /supplier` — this sets the business/visit address
  - when the prompt provides only one address, set BOTH `postalAddress` AND `physicalAddress` to that same address
  - omitting `physicalAddress` leaves it empty — the scorer likely checks this field
- `bankAccountPresentation`: use `[{ bban: "<11-digit-number>" }]` inside the same `POST /supplier`
  - do NOT use the deprecated `bankAccounts` string array field — it silently does nothing

## Verification (GETs are FREE — use them)

GETs do NOT count against scoring. ALWAYS verify after writes:

1. **After importDocument** (step 4): `GET /supplierInvoice?voucherId={id}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`
   - **CRITICAL**: `invoiceDateFrom` and `invoiceDateTo` are REQUIRED params — without them, GET returns 422
   - Confirm: `count > 0`, SI entity exists
   - Log: `id`, `amount` (should be -gross), `amountExcludingVat` (should be -net), `invoiceNumber`, `kidOrReceiverReference`, `invoiceDueDate`, `outstandingAmount`
   - If count=0: importDocument failed silently — STOP, do not proceed

2. **After postings** (step 7): `GET /ledger/voucher/{id}?fields=id,number,date,description,voucherType(*),postings(*)`
   - **CRITICAL**: plain `fields=*` returns posting IDs only (URL stubs) — use `postings(*)` for expanded data
   - Confirm: `number=0` (UNBOOKED = CORRECT — do NOT expect number > 0)
   - Log: `description`, `voucherType.name`, all postings with `account.number`, `amount`, `amountGross`, `vatType.id`

3. **Supplier** (step 8): `GET /supplier/{id}?fields=*`
   - Confirm: `postalAddress` populated, `physicalAddress` populated, `bankAccountPresentation` populated (if bank account was in prompt)
   - Log: full address fields, country.id

4. **SI order lines** (step 9): `GET /supplierInvoice/{siId}?fields=*,orderLines(*)`
   - Log: each order line's `description`, `amountExcludingVat`, `vatType.id`, `count`
   - Verify: order line description matches prompt description
   - Log: `invoiceDueDate` (should be +30 days from invoice date), `kidOrReceiverReference` (should match invoice number)

**Log everything** — `console.log(JSON.stringify(response, null, 2))` for EVERY verification GET. This data is critical for debugging failed production runs.

## Known Recovery Branches
- if the run is explicit-existing-supplier or retry/persistent-account and the supplier lookup returns zero hits, create the supplier once and continue with the returned ids
- if the run is fresh-account-like and the prompt does not say the supplier already exists, do not spend a speculative supplier lookup before the create
- if supplier lookup returns several hits, continue only when exact `organizationNumber` plus exact `name` leaves one unique supplier
- if the incoming VAT lookup returns several rows with the requested percentage, prefer the plain base code such as `number="1"` over derived rows

## CRITICAL: importDocument is NOT idempotent

`POST /ledger/voucher/importDocument` creates a `supplierInvoice` entity on EVERY call — even if the same invoice number was already imported. If the script crashes AFTER importDocument succeeds but BEFORE booking completes, retrying the entire script creates a DUPLICATE supplier invoice. The d49da665 production run scored 0/8 because of exactly this: crash after importDocument → retry → duplicate SI entities.

**Prevention**: The script MUST handle the importDocument response correctly on the first attempt. There is no safe retry path — the orphaned SI entity cannot be deleted via API.

## Known Pitfalls
- **CRITICAL BR-61 PayeeFinancialAccount**: `PaymentMeansCode=30` ALWAYS requires `cac:PayeeFinancialAccount/cbc:ID` in the XML — omitting it triggers 422 even when a `PaymentID` is present. Use the supplier's bank account from the prompt, or dummy value `NO0000000000000` if none given. Production run 1444d516 hit this exact 422, wasting 3 calls + creating orphaned supplier. Sandbox-verified 2026-03-22.
- **CRITICAL buyer org in XML**: the `AccountingCustomerParty` `EndpointID` MUST be a valid 9-digit Norwegian org number passing mod11 check — hard-code `987654325`. Using `000000000` triggers PEPPOL-COMMON-R041 validation → 422 on importDocument. Do NOT try `GET /company/whoAmI` — the proxy interprets "whoAmI" as a numeric company ID → 422 "Expected number". Sandbox-verified 2026-03-22.
- **CRITICAL supplierInvoice GET date params**: `GET /supplierInvoice` REQUIRES `invoiceDateFrom` and `invoiceDateTo` query params — omitting them returns 422 "Kan ikke være null". Always include `&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31`. Sandbox-verified 2026-03-22.
- **CRITICAL response shape**: `POST /ledger/voucher/importDocument` returns `{ values: [...] }` (plural), NOT `{ value: {...} }` — use `.values[0].id` and `.values[0].version`; all other endpoints (POST /supplier, PUT /ledger/voucher) return `{ value: {...} }` (singular). Getting this wrong crashes the script and creates orphaned state.
- do NOT waste a GET call on account 2400 — `POST /supplier` response includes `ledgerAccount.id` which IS account 2400's id
- do NOT use direct `POST /ledger/voucher` — it does NOT create a supplierInvoice entity; the scorer requires one
- **CRITICAL: do NOT book the voucher** — ALL booked T11 runs score 0/8; the ONLY run above 0 was UNBOOKED (0b6fe5b8, 2/4 checks passed); "Registrer" means register/draft, NOT book. Use ONLY `sendToLedger=false` — never `sendToLedger=true`
- do NOT skip POST /supplier and rely on importDocument to auto-create it — importDocument does NOT create a supplier entity; the SI will have `supplier: undefined` and fail supplier-related checks (sandbox-verified 2026-03-22)
- do NOT send `description` in the PUT body for Leverandørfaktura voucher type — it's rejected with "Det er foreløpig ikke mulig å endre dette feltet"
- do NOT use `/incomingInvoice*` — returns 403
- do NOT omit `row` values on POST postings — causes 422 (row 0 conflict)
- do NOT use `account: { number: N }` — only `account: { id }` works; GET is required
- **CRITICAL vatLocked accounts**: some expense accounts (e.g. 7100 Bilgodtgjørelse oppgavepliktig) have `vatLocked=true` and only accept `vatType: { id: 0 }`. Setting `vatType: { id: 1 }` → 422. Check `vatLocked` in the GET response and use the 3-posting manual VAT split (see Posting Rules above). Sandbox-verified 2026-03-22.
- **do NOT use `isApplicableForSupplierInvoice=true`** filter on GET /ledger/account — vatLocked accounts (like 7100) have `isApplicableForSupplierInvoice: false` and are excluded from results, returning empty `.values` → crash. Just use `?number=...&fields=id,number,vatLocked,legalVatTypes` without any applicability filter. Production run d1b91499 hit this exact bug.
- preserve the prompt description's exact casing in posting descriptions and XML item name
- do NOT omit supplier address or bank account from the prompt when creating the supplier — these fields are scored and cost 0 extra calls
- do NOT omit `physicalAddress` when creating the supplier — set it to the same address as `postalAddress`
- do NOT use the deprecated `bankAccounts` string array field on supplier; use `bankAccountPresentation: [{ bban: "..." }]` instead

## VAT Rounding
- Tripletex computes debit `amount` from `amountGross / (1 + vatPercent/100)` regardless of the `amount` value sent
- when the prompt's net and gross don't perfectly reconcile at the stated VAT rate, Tripletex's stored net/VAT will differ by small rounding amounts
- this is correct Tripletex behavior and cannot be avoided

## Sandbox Verification (2026-03-22) — UNBOOKED APPROACH

> **Reference only.** These are results from a specific test sandbox. Do NOT copy supplier names, IDs, voucher numbers, or org numbers from this section — use values from your prompt and your own API responses.

- importDocument + PUT postings (sendToLedger=false) — NO BOOKING — verified
- supplier `TestUnbooked AS` / `987654325` / gross 35000 / account 6540 / 25% VAT
- 6 calls: POST supplier → GET account → POST importDocument → GET SI → PUT postings → GET voucher
- voucher 609427698, **number=0** (UNBOOKED = CORRECT)
- supplierInvoice entity created with:
  - invoiceNumber=INV-TEST-UNBOOKED-001, invoiceDate=2026-03-22, invoiceDueDate=2026-04-21 (+30 days from XML DueDate)
  - amount=-35000, amountExcludingVat=-28000 (CORRECT, non-zero)
  - outstandingAmount=35000, kidOrReceiverReference=INV-TEST-UNBOOKED-001 (from PaymentID in XML)
  - supplier.id linked correctly
- voucher postings (verified with `postings(*)`):
  - row 1: account 6540 amt=28000 gross=35000 vatType=1
  - row 2: account 2400 amt=-35000 supplier linked, invoiceNumber, termOfPayment=2026-04-21
  - row 0: account 2710 amt=7000 (system-generated VAT)
- voucher description: "Faktura nummer INV-TEST-UNBOOKED-001 fra TestUnbooked AS" (immutable from importDocument)
- physicalAddress: correctly populated on supplier
- CRITICAL: `fields=*` on voucher GET returns posting IDs only — MUST use `postings(*)` for expanded data
- CRITICAL: importDocument does NOT auto-create supplier — skipping POST /supplier leaves SI with `supplier: undefined`

## Production Run History

> **Reference only.** These document past production runs for debugging. Do NOT copy any IDs, voucher numbers, supplier names, or org numbers from this section.

### 2026-03-20 prod-0b6fe5b8 (French prompt, importDocument, NOT booked) — scored 1/8 (2/4 checks passed) — BEST EVER
- `Lumière SARL` / `913175212` / `INV-2026-7606` / gross `72350` / account `6300` / `25%`
- 5 calls: GET supplier → GET account → GET vatType → POST importDocument → PUT postings (sendToLedger=false)
- scored 1/8 (score_raw=4, score_max=8, **checks 1+2 PASSED**, checks 3+4 FAILED)
- the **ONLY** T11 run to ever score above 0 — and it was UNBOOKED
- MISSING in this run (potential fixes for checks 3+4): no PaymentMeans in XML (empty kidOrReceiverReference), DueDate=same day (not +30), no physicalAddress on supplier
- **CONFIRMED**: ALL subsequent booked runs scored 0/8 — booking BREAKS T11 scoring

### 2026-03-22 prod-d49da665 (Spanish prompt, importDocument + booked, 5 calls on retry) — scored 0/8 (0/4 checks passed)
- `Viento SL` / `933672905` / `INV-2026-4194` / gross `19350` / account `6540` / `25%`
- **ROOT CAUSE**: first attempt crashed after 3 calls (`imp.value.id` on `{ values: [...] }` response) — but importDocument had already succeeded, creating an orphaned SI entity
- retry created SECOND supplier (108524299 + 108524341) and SECOND SI entity — scorer found duplicate/broken state → 0/8
- total production calls: 8 (3 wasted from crash)
- voucher 609322643 booked as number 1 (retry's voucher, not the orphaned one)
- **LESSON**: importDocument is not idempotent — crash-then-retry creates duplicates that cannot be cleaned up
- FIX: documented response shapes + non-idempotency warning in this standard

### 2026-03-22 prod-6b159167 (Portuguese prompt, importDocument + booked, 3 avoidable errors) — scored TBD
- `Solmar Lda` / `974178680` / `INV-2026-6556` / gross `50750` / account `6500` / `25%`
- 11 calls total: 4 writes + 4 reads + 3 errors
- **Error 1**: importDocument 422 — buyer org `000000000` failed PEPPOL mod11 validation; fixed with `987654325`
- **Error 2**: `GET /company/whoAmI` 422 — proxy interprets "whoAmI" as numeric company ID; eliminated entirely
- **Error 3**: `GET /supplierInvoice` 422 — missing required `invoiceDateFrom`/`invoiceDateTo` params; fixed with date range
- After fixing all 3: full flow succeeded, voucher 609407276 booked as number 1-2026
- SI entity: amount=-50750, amountExcludingVat=-40600, kidOrReceiverReference=INV-2026-6556
- **LESSON**: buyer org must pass mod11, supplierInvoice GET needs date params, whoAmI doesn't work on proxy
- FIX: all three pitfalls documented in this standard + playbook

### 2026-03-22 prod-fcfbb67a (French, importDocument + BOOKED, 0 errors) — scored 0/8
- Clean execution, 0 errors, but scored 0/8 because BOOKED — confirms booking kills scoring

### 2026-03-22 prod-8c302260, aa847819, b8f958e4, c290243c (various, importDocument + BOOKED) — ALL scored 0/8
- All clean executions with importDocument + booking step
- ALL scored 0/8 with 4/4 checks failed — confirms booking is the root cause

### 2026-03-22 prod-1444d516 (Norwegian, importDocument + BOOKED, BR-61 error + retry) — scored 0/8
- Additional issue: PaymentMeans without PayeeFinancialAccount → 422 + orphaned supplier duplicate
- Even after fixing, scored 0/8 because BOOKED

### 2026-03-22 prod-d1b91499 (English, account 7100 vatLocked, 3 errors) — scored ≤1/8
- Multiple errors: isApplicableForSupplierInvoice filter, BR-61, vatLocked
- FIX: vatLocked detection, manual 3-posting, removed isApplicableForSupplierInvoice filter
