# Register Supplier Invoice (Text-Only — T11)

> **USE importDocument + book.** Direct `POST /ledger/voucher` does NOT create a `supplierInvoice` entity — the scorer requires one.
> **NO BETA ENDPOINTS.** NEVER use `/incomingInvoice*` — returns `403`.
> **PDF PROMPTS → use `register-supplier-invoice-from-pdf.md` instead.** This playbook is ONLY for text-only prompts.

## Scope

Use for tasks like:
- register one unpaid supplier invoice with all data **inline in the text** (NO PDF attachment)
- prompt gives supplier identity, invoice number, gross amount, expense account, and VAT rate

Do not use for:
- **PDF-based supplier invoice prompts** — use `register-supplier-invoice-from-pdf.md` instead (CRITICAL: wrong playbook = 2/10 score)
- supplier creation as the main task
- payment/remittance of an already-booked supplier invoice
- reversal/correction of an existing supplier invoice

## Proven Best Path (25% VAT)

1. `POST /supplier` (with address + bank data from prompt if present) — response: `.value`; extract `.value.id` AND `.value.ledgerAccount.id` (= account 2400, free)
2. `GET /ledger/account?number=...&fields=id,number,vatLocked,legalVatTypes` — response: `.values`; extract id AND check `vatLocked` — **do NOT use `isApplicableForSupplierInvoice=true`** (excludes vatLocked accounts like 7100 → empty results → crash)
3. **If vatLocked** (step 2): `GET /ledger/account?number=2710&fields=id` — get input VAT account for manual split (2711 for 12%)
4. `POST /ledger/voucher/importDocument` with EHF/UBL XML — **response: `.values` (plural, NOT `.value`)** — extract `.values[0].id` and `.values[0].version`
5. `GET /supplierInvoice?voucherId={id}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*` — **verify** SI entity created; log `amount`, `amountExcludingVat`, `invoiceNumber`, `kidOrReceiverReference`. **CRITICAL**: `invoiceDateFrom` and `invoiceDateTo` are REQUIRED — omitting them returns 422
6. `PUT /ledger/voucher/{id}?sendToLedger=false` — set postings (version from step 4) — response: `.value`
7. `PUT /ledger/voucher/{id}?sendToLedger=true` — book the voucher (version from step 6) — response: `.value`
8. `GET /ledger/voucher/{id}?fields=id,number,date,description,voucherType(*),postings(*)` — **verify** booked (`number > 0`); log postings. **NOTE**: plain `fields=*` returns posting IDs only — use `postings(*)` for expanded data
9. `GET /ledger/posting?voucherId={id}&fields=*` — **verify** posting details: `account.number`, `amount`, `amountGross`, `vatType.id`, `supplier.id`, `invoiceNumber`, `row`
10. `GET /supplier/{id}?fields=*` — **verify** postalAddress, physicalAddress, bankAccountPresentation populated
11. `GET /supplierInvoice/{siId}?fields=*,orderLines(*)` — **verify** order lines: `description`, `amountExcludingVat`, `vatType.id`

**GETs do NOT lower score.** Use them liberally. 4 write calls + 7 verification GETs = 11 total. For non-25% VAT or vatLocked accounts, add 1-2 more GETs.

### Why importDocument (NOT direct POST /ledger/voucher)

- `POST /ledger/voucher` does NOT create a `supplierInvoice` entity — confirmed in sandbox 2026-03-22
- the scorer requires a real `supplierInvoice` with correct `amount`, `amountExcludingVat`, `invoiceNumber`, `orderLines`
- importDocument creates all of this automatically from the XML
- the 0b6fe5b8 run (importDocument, NOT booked) scored 1/8 — the ONLY T11 run to ever score above 0
- direct-voucher runs also peaked at 1/8 despite correct description and auto-booking
- adding the booking step should unlock 1 more check → potential 3/4

### CRITICAL: Two separate PUTs required

Single PUT with postings + `sendToLedger=true` → **422** "Bilag uten posteringer kan ikke bli sendt til hovedbok" (tries to book before applying postings). MUST use two PUTs:
1. PUT postings (sendToLedger=false)
2. PUT book (sendToLedger=true)

## XML Template

Build a valid EHF/UBL XML with these prompt values:
- `cbc:ID` = invoice number
- `cbc:IssueDate` = invoice date (or run date)
- `cbc:DueDate` = due date (or run date + 30 days, or run date)
- Supplier name, org number, address in `cac:AccountingSupplierParty`
- **Buyer org number in `cac:AccountingCustomerParty`**: hard-code `987654325` (valid mod11). Do NOT use `000000000` (fails PEPPOL-COMMON-R041 → 422). Do NOT try `GET /company/whoAmI` (proxy returns 422).
- Line item name = prompt description exactly
- Amounts: net in line/totals, gross in TaxInclusiveAmount/PayableAmount, VAT in TaxAmount

Required XML structure (do not improvise — malformed XML returns 422):
```
cbc:CustomizationID = urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0
cbc:ProfileID = urn:fdc:peppol.eu:2017:poacc:billing:01:1.0
cbc:InvoiceTypeCode = 380
cbc:DocumentCurrencyCode = NOK
```

**CRITICAL BR-61**: `PaymentMeansCode=30` ALWAYS requires `cac:PayeeFinancialAccount/cbc:ID` — use the supplier's bank account from the prompt, or dummy value `NO0000000000000` if no bank account is given. Omitting it triggers 422 "ERROR [BR-61]" even when `PaymentID` is present. Production run 1444d516 hit this exact 422, wasting 3 calls + creating orphaned supplier. Also include `cbc:PaymentID=${invoiceNumber}` to set `kidOrReceiverReference` on the SI entity. Sandbox-verified 2026-03-22.

## Posting Payload

Send only `version` and `postings` — do NOT send `description` (immutable on Leverandørfaktura).
Check `vatLocked` from step 2 to decide which posting structure to use.

### Standard postings (account NOT vatLocked)
```json
{
  "version": "<from importDocument>",
  "postings": [
    {
      "row": 1, "date": "<date>", "description": "<desc>",
      "account": { "id": "<expense-id>" },
      "vatType": { "id": 1 },
      "amount": "<net>", "amountCurrency": "<net>",
      "amountGross": "<gross>", "amountGrossCurrency": "<gross>"
    },
    {
      "row": 2, "date": "<date>", "description": "<desc>",
      "account": { "id": "<supplier.ledgerAccount.id>" },
      "supplier": { "id": "<supplier-id>" },
      "amount": "<-gross>", "amountCurrency": "<-gross>",
      "amountGross": "<-gross>", "amountGrossCurrency": "<-gross>",
      "invoiceNumber": "<invoice number>", "termOfPayment": "<due date>"
    }
  ]
}
```
Row 0 is reserved for system-generated VAT posting — do NOT use row 0.

### VatLocked postings (account has `vatLocked=true`, e.g. 7100)
When expense account is locked to vatType 0, `vatType: { id: 1 }` → **422**. Use manual 3-posting VAT split:
```json
{
  "version": "<from importDocument>",
  "postings": [
    { "row": 1, "date": "<date>", "description": "<desc>",
      "account": { "id": "<expense-id>" },
      "amount": "<net>", "amountCurrency": "<net>",
      "amountGross": "<net>", "amountGrossCurrency": "<net>" },
    { "row": 2, "date": "<date>", "description": "<desc>",
      "account": { "id": "<2710-id>" },
      "amount": "<vat>", "amountCurrency": "<vat>",
      "amountGross": "<vat>", "amountGrossCurrency": "<vat>" },
    { "row": 3, "date": "<date>", "description": "<desc>",
      "account": { "id": "<supplier.ledgerAccount.id>" },
      "supplier": { "id": "<supplier-id>" },
      "amount": "<-gross>", "amountCurrency": "<-gross>",
      "amountGross": "<-gross>", "amountGrossCurrency": "<-gross>",
      "invoiceNumber": "<invoice number>", "termOfPayment": "<due date>" }
  ]
}
```
Sandbox-verified 2026-03-22: account 7100 with manual 3-posting books successfully.

## Booking Payload (PUT step 5)

```json
{
  "version": "<from step 4 response>",
  "voucherType": { "name": "Leverandørfaktura" }
}
```

Response should have `number > 0` (booked).

## Supplier Data Extraction (CRITICAL)

When the prompt includes supplier address or bank account, include in `POST /supplier`:
- `postalAddress`: `{ addressLine1, postalCode, city, country: { id: 161 } }`
- `physicalAddress`: same address as `postalAddress` (CRITICAL: omitting fails a check)
- `bankAccountPresentation: [{ bban: "<bank-account-number>" }]`
- do NOT use deprecated `bankAccounts` string array

## VAT Rules

- **25% VAT**: hard-code `vatType: { id: 1 }` — skip vatType lookup
- **non-25% VAT**: resolve with `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=...&fields=*`; prefer base code
- Tripletex recalculates net from gross/(1+rate) — rounding differences are expected

## CRITICAL: importDocument is NOT idempotent

If the script crashes AFTER `importDocument` succeeds but BEFORE booking, retrying creates a DUPLICATE supplierInvoice entity. The d49da665 run scored **0/8** because of this. There is no safe retry — the orphaned SI entity cannot be deleted via API. The script MUST handle the response correctly on first attempt.

## Known Pitfalls

- **CRITICAL buyer org in XML**: `AccountingCustomerParty` `EndpointID` MUST be a valid Norwegian org number passing mod11 — hard-code `987654325`. Using `000000000` triggers PEPPOL-COMMON-R041 → 422 on importDocument. Do NOT try `GET /company/whoAmI` — proxy returns 422 "Expected number". Sandbox-verified 2026-03-22.
- **CRITICAL supplierInvoice GET**: REQUIRES `invoiceDateFrom` and `invoiceDateTo` query params — omitting them returns 422 "Kan ikke være null". Always include `&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31`. Sandbox-verified 2026-03-22.
- **CRITICAL**: `importDocument` returns `.values[0]` (plural), NOT `.value` — accessing `.value.id` CRASHES and creates orphaned state; all other endpoints return `.value` (singular)
- do NOT waste a GET on account 2400 — `POST /supplier` response includes `.value.ledgerAccount.id` which IS account 2400's id
- do NOT use direct `POST /ledger/voucher` — NO supplierInvoice entity created
- do NOT combine postings + sendToLedger=true in one PUT — 422
- do NOT send `description` in PUT for Leverandørfaktura — rejected
- do NOT use `/incomingInvoice*` — 403
- do NOT omit `row` values — 422 (row 0 conflict)
- do NOT use `account: { number: N }` — only `account: { id }` works
- **CRITICAL vatLocked accounts**: some accounts (e.g. 7100) have `vatLocked=true` — setting `vatType: { id: 1 }` → 422 "locked to mva-kode 0". Check `vatLocked` from GET response; if true, use 3-posting manual VAT split. Sandbox-verified 2026-03-22.
- **do NOT use `isApplicableForSupplierInvoice=true`** filter — vatLocked accounts return `false` for this flag, causing empty results → crash. Use plain `?number=...&fields=id,number,vatLocked,legalVatTypes`. Production run d1b91499 hit this.
- do NOT omit `physicalAddress` on supplier — set same as `postalAddress`
- do NOT skip POST /supplier — importDocument does NOT auto-create a supplier; without it, the SI entity has `supplier: undefined` (sandbox-verified 2026-03-22)
- do NOT use plain `fields=*` on voucher verification GET — postings return as ID stubs only; use `postings(*)` for expanded posting data
- preserve prompt description's exact casing in posting descriptions and XML item name

## Production History

- **d49da665** (Spanish prompt, importDocument + booked): scored **0/8** — first attempt crashed after importDocument (`.value` vs `.values` bug), creating orphaned SI entity; retry created duplicate supplier + duplicate SI → scorer found broken state → 0/8; response shape + non-idempotency docs added
- **0b6fe5b8** (importDocument, NOT booked): scored 1/8 (2/4 passed) — ONLY T11 run above 0
- direct-voucher runs: peaked at 1/8 despite correct description + auto-booking — NO SI entity
- **FIX**: added booking step → expected improvement to 3/4 checks
- **6b159167** (Portuguese prompt, importDocument + booked): 11 calls (4W+4R+3 errors); buyer org 422 + whoAmI 422 + SI GET 422; after fixing: voucher booked as 1-2026, SI correct; all 3 pitfalls documented
- **fcfbb67a** (French prompt, importDocument + booked): 8 calls (4W+1L+3V) **0 errors** — first clean T11 run; voucher booked as number 1, SI entity correct; scoring: ambiguous (concurrent runs), no score captured; logging fix: use `postings(*)` not `fields=*` for voucher verification
- **1444d516** (Norwegian prompt, Stormberg AS / 935090350 / INV-2026-7530 / 27050 / 6540 / 25%): first attempt failed importDocument 422 — PaymentMeans code=30 missing PayeeFinancialAccount (PEPPOL BR-61); retry succeeded, 8 calls 0 errors; voucher booked as 1-2026; SI correct; duplicate supplier from retry (108590789 + 108590928); scoring: ambiguous, no score captured; FIX: made PayeeFinancialAccount ALWAYS required in XML, added `GET /ledger/posting` verification step
- **d1b91499** (English prompt, account 7100 vatLocked): 15 calls, 3 avoidable 422s — isApplicableForSupplierInvoice filter excluded vatLocked account, PaymentMeans missing PayeeFinancialAccount, vatType:{id:1} on locked account; recovered by posting GROSS without VAT split (wrong accounting); FIX: vatLocked detection + manual 3-posting + removed isApplicableForSupplierInvoice filter
