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
2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*` — response: `.values`; for expense account only
3. `POST /ledger/voucher/importDocument` with EHF/UBL XML — **response: `.values` (plural, NOT `.value`)** — extract `.values[0].id` and `.values[0].version`
4. `PUT /ledger/voucher/{id}?sendToLedger=false` — set postings (version from step 3) — response: `.value`
5. `PUT /ledger/voucher/{id}?sendToLedger=true` — book the voucher (version from step 4) — response: `.value`

**5 calls** total. For non-25% VAT, add `GET /ledger/vatType` → **6 calls**.

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
- Line item name = prompt description exactly
- Amounts: net in line/totals, gross in TaxInclusiveAmount/PayableAmount, VAT in TaxAmount

Required XML structure (do not improvise — malformed XML returns 422):
```
cbc:CustomizationID = urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0
cbc:ProfileID = urn:fdc:peppol.eu:2017:poacc:billing:01:1.0
cbc:InvoiceTypeCode = 380
cbc:DocumentCurrencyCode = NOK
```

**CRITICAL**: Include `cac:PaymentMeans` with `cbc:PaymentMeansCode=30`, `cbc:PaymentID=${invoiceNumber}`, and `cac:PayeeFinancialAccount/cbc:ID=${bankAccount}` (if bank account is in prompt). Without this, `kidOrReceiverReference` on the SI entity stays empty — this was the root cause of persistent Check 5 failure on T20 (sandbox-verified 2026-03-22).

## Posting Payload (PUT step 4)

Send only `version` and `postings` — do NOT send `description` (immutable on Leverandørfaktura).

```json
{
  "version": "<from importDocument response .values[0].version>",
  "postings": [
    {
      "row": 1,
      "date": "<invoice date>",
      "description": "<prompt description>",
      "account": { "id": "<expense-account-id>" },
      "vatType": { "id": 1 },
      "amount": "<net>",
      "amountCurrency": "<net>",
      "amountGross": "<gross>",
      "amountGrossCurrency": "<gross>"
    },
    {
      "row": 2,
      "date": "<invoice date>",
      "description": "<prompt description>",
      "account": { "id": "<supplier.ledgerAccount.id from step 1 POST response>" },
      "supplier": { "id": "<supplier.id>" },
      "amount": "<-gross>",
      "amountCurrency": "<-gross>",
      "amountGross": "<-gross>",
      "amountGrossCurrency": "<-gross>",
      "invoiceNumber": "<prompt invoice number>",
      "termOfPayment": "<due date>"
    }
  ]
}
```

Row 0 is reserved for the system-generated VAT posting — do NOT use row 0.

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

- **CRITICAL**: `importDocument` returns `.values[0]` (plural), NOT `.value` — accessing `.value.id` CRASHES and creates orphaned state; all other endpoints return `.value` (singular)
- do NOT waste a GET on account 2400 — `POST /supplier` response includes `.value.ledgerAccount.id` which IS account 2400's id
- do NOT use direct `POST /ledger/voucher` — NO supplierInvoice entity created
- do NOT combine postings + sendToLedger=true in one PUT — 422
- do NOT send `description` in PUT for Leverandørfaktura — rejected
- do NOT use `/incomingInvoice*` — 403
- do NOT omit `row` values — 422 (row 0 conflict)
- do NOT use `account: { number: N }` — only `account: { id }` works
- do NOT omit `physicalAddress` on supplier — set same as `postalAddress`
- preserve prompt description's exact casing in posting descriptions and XML item name

## Production History

- **d49da665** (Spanish prompt, importDocument + booked): scored **0/8** — first attempt crashed after importDocument (`.value` vs `.values` bug), creating orphaned SI entity; retry created duplicate supplier + duplicate SI → scorer found broken state → 0/8; response shape + non-idempotency docs added
- **0b6fe5b8** (importDocument, NOT booked): scored 1/8 (2/4 passed) — ONLY T11 run above 0
- direct-voucher runs: peaked at 1/8 despite correct description + auto-booking — NO SI entity
- **FIX**: added booking step → expected improvement to 3/4 checks
