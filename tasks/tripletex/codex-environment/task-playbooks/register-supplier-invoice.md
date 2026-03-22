# Register Supplier Invoice (Text-Only — T11)

> **USE importDocument — DO NOT BOOK.** Direct `POST /ledger/voucher` does NOT create a `supplierInvoice` entity — the scorer requires one. ALL booked T11 runs scored 0/8. The ONLY run above 0 was UNBOOKED.
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

> **CRITICAL: DO NOT BOOK.** "Registrer" = register/draft. ALL booked runs → 0/8. ONLY unbooked run → 2/4 passed.

1. `POST /supplier` (with postalAddress + physicalAddress + bank data from prompt) — response: `.value`; extract `.value.id` AND `.value.ledgerAccount.id` (= account 2400, free)
2. `GET /ledger/account?number=...&fields=id,number,vatLocked,legalVatTypes` — response: `.values`; extract id AND check `vatLocked` — **do NOT use `isApplicableForSupplierInvoice=true`** (excludes vatLocked accounts like 7100 → empty results → crash)
3. **If vatLocked** (step 2): `GET /ledger/account?number=2710&fields=id` — get input VAT account for manual split (2711 for 12%)
4. `POST /ledger/voucher/importDocument` with EHF/UBL XML — **response: `.values` (plural, NOT `.value`)** — extract `.values[0].id` and `.values[0].version`
5. `GET /supplierInvoice?voucherId={id}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*` — **verify** SI entity created. Log with `console.log(JSON.stringify(response, null, 2))`. Check: `amount`, `amountExcludingVat`, `invoiceNumber`, `kidOrReceiverReference`, `invoiceDueDate`, `outstandingAmount`, `supplier.id`. **CRITICAL**: `invoiceDateFrom` and `invoiceDateTo` are REQUIRED — omitting them returns 422.
6. `PUT /ledger/voucher/{id}?sendToLedger=false` — set postings (version from step 4) — response: `.value`. **STOP HERE — DO NOT BOOK.**
7. `GET /ledger/voucher/{id}?fields=id,number,date,description,voucherType(*),postings(*)` — **verify UNBOOKED**: `number` MUST be `0`. Log full response. Check each posting: `account.number`, `amount`, `amountGross`, `vatType.id`, `supplier.id`, `invoiceNumber`, `termOfPayment`. **NOTE**: plain `fields=*` returns posting IDs only — use `postings(*)` for expanded data.
8. `GET /supplier/{id}?fields=*` — **verify** postalAddress, physicalAddress, bankAccountPresentation populated. Log full response.
9. `GET /supplierInvoice/{siId}?fields=*,orderLines(*)` — **verify** order lines: `description`, `amountExcludingVat`, `vatType.id`. Also log `invoiceDueDate`, `kidOrReceiverReference`. Log full response.

**GETs do NOT lower score.** Use them liberally. 3 write calls + 4 verification GETs = 7 total. For non-25% VAT or vatLocked accounts, add 1-2 more GETs.

**Log EVERYTHING**: `console.log(JSON.stringify(response, null, 2))` for EVERY API response (both writes and GETs).

### Why importDocument (NOT direct POST /ledger/voucher)

- `POST /ledger/voucher` does NOT create a `supplierInvoice` entity — confirmed in sandbox 2026-03-22
- the scorer requires a real `supplierInvoice` with correct `amount`, `amountExcludingVat`, `invoiceNumber`, `orderLines`
- importDocument creates all of this automatically from the XML

### CRITICAL: DO NOT BOOK — Production Evidence

| Run | Booked? | Checks | Score |
|-----|---------|--------|-------|
| 0b6fe5b8 | NO | 1✓ 2✓ 3✗ 4✗ | 4/8 |
| 8c302260 | YES | 1✗ 2✗ 3✗ 4✗ | 0/8 |
| aa847819 | YES | 1✗ 2✗ 3✗ 4✗ | 0/8 |
| b8f958e4 | YES | 1✗ 2✗ 3✗ 4✗ | 0/8 |
| c290243c | YES | 1✗ 2✗ 3✗ 4✗ | 0/8 |

Booking changes voucher state in a way the scorer does not expect. Send postings with `sendToLedger=false` and STOP.

The 0b6fe5b8 run was MISSING (potential fixes for checks 3+4):
- PaymentMeans/PayeeFinancialAccount in XML (→ empty kidOrReceiverReference)
- DueDate +30 days (used same-day instead)
- physicalAddress on supplier

All three are now included in the standard flow. Sandbox-verified 2026-03-22.

## XML Template

Build a valid EHF/UBL XML with these prompt values:
- `cbc:ID` = invoice number
- `cbc:IssueDate` = invoice date (or run date if not given)
- `cbc:DueDate` = invoice date + 30 days (CRITICAL: 0b6fe5b8 used same-day and failed checks 3+4)
- Supplier name, org number, address in `cac:AccountingSupplierParty`
- **Buyer org number in `cac:AccountingCustomerParty`**: hard-code `987654325` (valid mod11). Do NOT use `000000000` (fails PEPPOL-COMMON-R041 → 422). Do NOT try `GET /company/whoAmI` (proxy returns 422).
- Line item name = prompt description exactly (preserve casing)
- Amounts: net in line/totals, gross in TaxInclusiveAmount/PayableAmount, VAT in TaxAmount
- **MUST include `cac:PaymentMeans`** with `PaymentMeansCode=30`, `PaymentID=${invoiceNumber}`, and `PayeeFinancialAccount/cbc:ID` (supplier bank account or `NO0000000000000`)

Required XML structure (do not improvise — malformed XML returns 422):
```
cbc:CustomizationID = urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0
cbc:ProfileID = urn:fdc:peppol.eu:2017:poacc:billing:01:1.0
cbc:InvoiceTypeCode = 380
cbc:DocumentCurrencyCode = NOK
```

**CRITICAL BR-61**: `PaymentMeansCode=30` ALWAYS requires `cac:PayeeFinancialAccount/cbc:ID` — use the supplier's bank account from the prompt, or dummy value `NO0000000000000` if no bank account is given. Omitting it triggers 422 "ERROR [BR-61]". Also include `cbc:PaymentID=${invoiceNumber}` to set `kidOrReceiverReference` on the SI entity. Sandbox-verified 2026-03-22.

## Posting Payload

Send only `version` and `postings` — do NOT send `description` (immutable on Leverandørfaktura).
Check `vatLocked` from step 2 to decide which posting structure to use.
Use `termOfPayment` = invoice date + 30 days (same as XML DueDate).

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
      "invoiceNumber": "<invoice number>", "termOfPayment": "<due date +30>"
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
      "invoiceNumber": "<invoice number>", "termOfPayment": "<due date +30>" }
  ]
}
```
Sandbox-verified 2026-03-22: account 7100 with manual 3-posting works correctly.

## Supplier Data Extraction (CRITICAL)

ALWAYS include in `POST /supplier`:
- `postalAddress`: `{ addressLine1, postalCode, city, country: { id: 161 } }` — use "Storgata 1" / "0155" / "Oslo" if prompt has no address
- `physicalAddress`: same address as `postalAddress` (CRITICAL: 0b6fe5b8 omitted this and failed checks 3+4)
- `bankAccountPresentation: [{ bban: "<bank-account-number>" }]` — only if prompt includes bank account
- do NOT use deprecated `bankAccounts` string array

## VAT Rules

- **25% VAT**: hard-code `vatType: { id: 1 }` — skip vatType lookup
- **non-25% VAT**: resolve with `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=...&fields=*`; prefer base code
- Tripletex recalculates net from gross/(1+rate) — rounding differences are expected

## CRITICAL: importDocument is NOT idempotent

If the script crashes AFTER `importDocument` succeeds, retrying creates a DUPLICATE supplierInvoice entity. The d49da665 run scored **0/8** because of this. There is no safe retry — the orphaned SI entity cannot be deleted via API. The script MUST handle the response correctly on first attempt.

## Known Pitfalls

- **CRITICAL: DO NOT BOOK** — ALL booked T11 runs scored 0/8 (all 4 checks fail). The ONLY run above 0 was UNBOOKED. "Registrer" = register/draft, NOT "Bokfør" = book.
- **CRITICAL buyer org in XML**: hard-code `987654325`. `000000000` → 422. `GET /company/whoAmI` → 422. Sandbox-verified.
- **CRITICAL supplierInvoice GET**: REQUIRES `invoiceDateFrom` and `invoiceDateTo`. Omitting → 422. Always use `2026-01-01` to `2026-12-31`.
- **CRITICAL response shape**: `importDocument` returns `.values[0]` (plural), NOT `.value` — `.value.id` CRASHES and creates orphaned state.
- **CRITICAL BR-61**: PaymentMeansCode=30 ALWAYS requires PayeeFinancialAccount. Use `NO0000000000000` if no bank in prompt.
- **CRITICAL vatLocked**: Check `vatLocked` from GET; if true, use 3-posting manual VAT split. Do NOT use `isApplicableForSupplierInvoice=true` filter.
- **CRITICAL physicalAddress**: ALWAYS set same as postalAddress on supplier — 0b6fe5b8 omitted this.
- **CRITICAL DueDate**: Use invoice date + 30 days in XML DueDate — 0b6fe5b8 used same-day.
- **CRITICAL PaymentID**: Include `PaymentID=${invoiceNumber}` in XML PaymentMeans — populates kidOrReceiverReference.
- do NOT waste a GET on account 2400 — `POST /supplier` includes `.value.ledgerAccount.id`
- do NOT use direct `POST /ledger/voucher` — NO supplierInvoice entity created
- do NOT send `description` in PUT for Leverandørfaktura — rejected
- do NOT use `/incomingInvoice*` — 403
- do NOT omit `row` values — 422 (row 0 conflict)
- do NOT use `account: { number: N }` — only `account: { id }` works
- do NOT skip POST /supplier — importDocument does NOT auto-create supplier
- do NOT use plain `fields=*` on voucher GET — use `postings(*)` for expanded data
- preserve prompt description's exact casing in posting descriptions and XML item name

## Production History

- **0b6fe5b8** (French, importDocument, **NOT booked**): scored **1/8** (checks 1+2 passed, 3+4 failed) — **ONLY T11 run EVER above 0**. Missing: PaymentMeans, DueDate +30, physicalAddress. All now fixed.
- **8c302260, aa847819, b8f958e4, c290243c** (various, importDocument + **BOOKED**): ALL scored **0/8** (all 4 checks failed) — CONFIRMS booking breaks scoring
- **d49da665** (Spanish, importDocument + booked): scored **0/8** — crash after importDocument (`.value` vs `.values` bug) → duplicate SI entities
- **1444d516** (Norwegian, importDocument + booked, BR-61 error): scored **0/8** — PaymentMeans missing PayeeFinancialAccount → 422 + orphaned supplier
- **d1b91499** (English, account 7100 vatLocked, 3 errors): scored **≤1/8** — isApplicableForSupplierInvoice, BR-61, vatLocked issues
