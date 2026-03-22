# Register Supplier Invoice from PDF

> **NEVER use `/incomingInvoice*` or direct `POST /ledger/voucher`.** Use `importDocument` with EHF XML.

## Scope
- register one unpaid supplier invoice from an attached PDF (any language)
- PDF contains: supplier name, org number, address, bank account, invoice number, dates, amounts, expense account
- if prompt has all data inline (no PDF) → use `register-supplier-invoice.md` instead

## Proven Best Path (4 writes + 1 required GET + free verification GETs, 25% VAT)
1. `POST /supplier` — with postalAddress + physicalAddress + country:{id:161} + bankAccountPresentation → extract `supplierId` AND `ledgerAccount.id` (this is account 2400)
2. `GET /ledger/account?number=<expense-acct>&isApplicableForSupplierInvoice=true&fields=id,number` — expense account only; credit-side 2400 comes from step 1 (free GET)
3. `POST /ledger/voucher/importDocument` — EHF/UBL XML with PaymentMeans → response is `.values[0]` (NOT `.value`). **Auto-generates both PDF attachment and XML ediDocument — do NOT upload PDF separately.**
4. `PUT /ledger/voucher/{id}?sendToLedger=false` — set postings with vatType:{id:1}; credit account = `ledgerAccount.id` from step 1
5. `PUT /ledger/voucher/{id}?sendToLedger=true` — book with `{ version, voucherType: { name: "Leverandørfaktura" } }`
6. Verification GETs (free): supplier, voucher, supplierInvoice (search by invoiceNumber), postings

## Critical Rules
- **TIMEOUT**: After reading the trusted standard, IMMEDIATELY write the script and run it. Do NOT read additional files. 2 runs scored 0% by timing out.
- **PaymentMeans is REQUIRED in the EHF XML** — without it, `kidOrReceiverReference` stays empty. PaymentMeans populates `kidOrReceiverReference` (confirmed by runs 210edee3 and f1cd6ae7). **However, Check 5 still fails at 8/10 even with PaymentMeans** — root cause unknown after 17+ runs.
- **Do NOT upload the original PDF** — `importDocument` auto-generates a PDF attachment from the EHF XML. Sandbox-verified 2026-03-22: voucher.attachment is already populated (mimeType=application/pdf) after importDocument alone. The `POST /attachment` wastes 1 write.
- MUST set both `postalAddress` AND `physicalAddress` with `country: { id: 161 }`
- importDocument response is `.values[0]` — using `.value` crashes and creates orphaned SI
- Do NOT combine postings + sendToLedger=true in one PUT — 422
- Use `account: { id }` not `account: { number }` — GET is mandatory
- Use `bankAccountPresentation: [{ bban }]` not deprecated `bankAccounts`
- Extract `ledgerAccount.id` from POST /supplier response — do NOT GET account 2400
- **Search supplierInvoice by `invoiceNumber`**, NOT `supplierId` — supplierId filter has timing lag

## Production Run History

| Run | Lang | Writes | Score | Checks Failed | Notes |
|---|---|---|---|---|---|
| 53cb0731 | EN | 4 | 7/10 | 5,6 | No physicalAddress, not booked, no PaymentMeans |
| 9b2a1d22 | ? | 4 | 7/10 | 5,6 | No physicalAddress, not booked, no PaymentMeans |
| aaf59452 | ES | 4 | 7/10 | 5,6 | No physicalAddress, not booked, no PaymentMeans |
| dedc4bfe | FR | 4 | 8/10 | 5 | No physicalAddress, IS booked, no PaymentMeans |
| 80b7e1d2 | DE | 4 | 8/10 | 5 | No physicalAddress, IS booked, no PaymentMeans |
| 61320c6d | NN | 4 | 8/10 | 5 | No physicalAddress, IS booked, no PaymentMeans |
| 9b27a332 | EN | 3 | **2/10** | 2,3,4,5,6 | Direct voucher (WRONG approach) |
| 4c255d98 | PT | 0 | **0/10** | — | Agent timed out reading standard |
| de228487 | DE | 0 | **0/10** | — | Agent timed out reading standard |
| 7c4183ab | PT | 4 | 8/10 | 5 | Both addresses+country+booking, no PaymentMeans |
| 4c22beb6 | NB | 4 | 8/10 | 5 | Both addresses+country+booking, no PaymentMeans |
| 210edee3 | NN | 5 | 8/10 | 5 | PaymentMeans included + PDF upload (+1 write); kidOrReceiverReference populated; Check 5 STILL failed |
| **f1cd6ae7** | **FR** | **4** | **8/10** | **5** | **Clean 4-write run: PaymentMeans + both addresses + no PDF upload; 0 errors; kidOrReceiverReference populated; Check 5 STILL failed** |

**Check 5 root cause: UNKNOWN.** PaymentMeans populates `kidOrReceiverReference` but does NOT fix Check 5. After 17+ production runs, Check 5 has never passed. Investigated and ruled out: approval (422 "Denne bilagstypen kan ikke attesteres"), PDF upload (no effect on score), all field variations on supplier/SI/voucher entities. The remaining 2 points at Check 5 may require a fundamentally different approach not yet identified.

**Current best: 8/10.** The proven 4-write flow achieves 8/10 reliably with 0 errors. Do NOT upload PDF separately (importDocument auto-generates it).

## Sandbox-Verified Fixes (2026-03-22)
- **PaymentMeans → kidOrReceiverReference = CONFIRMED**: `<cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>` populates `kidOrReceiverReference` on the SI entity. However, this does NOT fix Check 5 (confirmed by runs 210edee3 and f1cd6ae7 both scoring 8/10).
- **Approval NOT possible**: `PUT /supplierInvoice/{id}/:approve` returns 422 "Denne bilagstypen kan ikke attesteres" — this voucher type cannot be approved.
- **PDF attachment auto-generated by importDocument**: voucher.attachment is populated (mimeType=application/pdf, ~51KB auto-generated) after importDocument alone. The separate `POST /attachment` only replaces the auto-generated PDF with the original — no scoring benefit, wastes 1 write.
- **Verification GETs are FREE**: Add GET supplier, GET voucher, GET supplierInvoice (by invoiceNumber), GET postings after booking to confirm all fields.
- Combined PUT (postings + sendToLedger=true) → **422**. Cannot reduce steps 4+5 to 1.
- `account: { number }` without id → **422**. GET for expense account ID is mandatory.
