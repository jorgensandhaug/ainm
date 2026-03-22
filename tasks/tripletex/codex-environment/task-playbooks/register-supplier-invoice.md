# Register Supplier Invoice

> **NO BETA ENDPOINTS.** NEVER use `/incomingInvoice*` or any `(BETA)` endpoint. They ALL return `403`.
> **DO NOT use importDocument.** Use direct `POST /ledger/voucher` with `voucherType: Leverandorfaktura`.

## Scope

Use for tasks like:
- register one unpaid supplier invoice
- prompt gives supplier identity, invoice number, gross amount, expense account, and VAT rate
- prompt expects a real supplier-invoice state

Do not use for:
- supplier creation as the main task
- payment/remittance of an already-booked supplier invoice
- reversal/correction of an existing supplier invoice

## Proven Best Path

The current best path for **25% incoming VAT** (most common) is:
1. `POST /supplier` (with address + bank data from PDF if present)
2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
3. `GET /ledger/voucherType?name=Leverandorfaktura&fields=*`
4. `POST /ledger/voucher` with `voucherType`, `description`, `date`, and balanced `postings`; use hard-coded `vatType: { id: 1 }` on the debit posting

This is **4 calls** total. The voucher is auto-booked (number > 0) on creation.

For **non-25% VAT rates**, insert `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*` between steps 2 and 3, making it **5 calls**.

If the prompt says the supplier already exists, switch step 1 to `GET /supplier?organizationNumber=...&fields=*` and only `POST /supplier` if that lookup returns zero hits.

## Why Direct POST /ledger/voucher (NOT importDocument)

- `POST /ledger/voucher` creates and BOOKS the voucher in one call
- the `description` field matches the prompt exactly (case-sensitive)
- `POST /ledger/voucher/importDocument` scored **0/8 on ALL production T11 runs** (10+ runs, all 4 checks failing)
- importDocument creates an immutable auto-generated description "Faktura nummer {ID} fra {Name}" that cannot be changed via PUT — this breaks scorer description matching
- importDocument also needs 2 extra PUT calls (postings + booking), totaling 5 calls minimum vs 4
- the direct-voucher runs from 2026-03-20 achieved T11 best_score=1
- **NEVER use importDocument for this task**

## Voucher Payload Shape

```json
{
  "date": "<invoice date or run date>",
  "description": "<exact prompt description, case-preserved>",
  "voucherType": { "id": "<voucherType-id from step 3>" },
  "postings": [
    {
      "row": 1,
      "date": "<invoice date>",
      "description": "<prompt description>",
      "account": { "id": "<expense-account-id>" },
      "vatType": { "id": 1 },
      "currency": { "id": 1 },
      "amount": "<net>",
      "amountCurrency": "<net>",
      "amountGross": "<gross>",
      "amountGrossCurrency": "<gross>"
    },
    {
      "row": 2,
      "date": "<invoice date>",
      "description": "<prompt description>",
      "account": { "id": "<supplier.ledgerAccount.id>" },
      "supplier": { "id": "<supplier.id>" },
      "currency": { "id": 1 },
      "amount": "<-gross>",
      "amountCurrency": "<-gross>",
      "amountGross": "<-gross>",
      "amountGrossCurrency": "<-gross>",
      "invoiceNumber": "<prompt invoice number>",
      "termOfPayment": "<due date or run date>"
    }
  ]
}
```

- Row 0 is reserved for the system-generated VAT posting — do NOT use row 0
- The response should have 3 postings (debit, credit, auto-VAT) and `number > 0` (booked)

## Supplier Data Extraction (CRITICAL)

When the prompt includes an attached PDF invoice, extract ALL supplier data:
- `name` and `organizationNumber` (always present)
- `postalAddress` with `{ addressLine1, postalCode, city, country: { id: 161 } }` (if address on PDF)
- `physicalAddress` — set to the SAME address as `postalAddress` (CRITICAL: omitting this fails Check 5)
- `bankAccountPresentation: [{ bban: "<bank-account-number>" }]` (if bank account on PDF)
- do NOT use deprecated `bankAccounts` string array — it silently does nothing

Include all fields in the same `POST /supplier` — zero extra API calls.

## Known Pitfalls

- do NOT use `POST /ledger/voucher/importDocument` — all production runs scored 0/8
- do NOT use `/incomingInvoice*` — returns 403
- do NOT omit `row` values on postings — causes 422 (row 0 conflict)
- do NOT use `account: { number: N }` — only `account: { id }` works; GET is required
- do NOT capitalize the prompt description — preserve exact casing
- do NOT omit `physicalAddress` on supplier — set same as `postalAddress`
- do NOT omit `currency: { id: 1 }` or `amountCurrency`/`amountGrossCurrency` — causes 500

## VAT Rules

- **25% VAT**: hard-code `vatType: { id: 1 }` — skip vatType lookup
- **non-25% VAT**: resolve with `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=...&fields=*`; prefer base code
- Tripletex recalculates net from gross/1.25 regardless of sent `amount` — rounding differences are expected

## What Failed And Why (historical)

### importDocument path (scored 0/8 on ALL production runs)
- creates immutable description "Faktura nummer {ID} fra {Name}" — scorer can't match
- needs 5 calls minimum (vs 4 for direct voucher)
- needs separate booking step (2 extra PUTs)
- was the standard from 2026-03-21 but ALL 10+ runs scored 0/8

### direct POST /ledger/voucher without proper postings
- earlier 2026-03-20 runs had issues with missing supplier data (address, bank)
- 3 of 6 early attempts scored 0, 1 scored best=1

### POST /incomingInvoice
- beta-only, returns 403 — never use

### balanced voucher without debit vatType
- Tripletex flattens to gross with vatType.id=0 — explicit debit vatType required

### voucher update without currency amounts
- produces 500 — keep amountCurrency and amountGrossCurrency on both rows
