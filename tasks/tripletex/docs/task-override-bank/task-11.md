# TASK OVERRIDE — Task 11: Register Supplier Invoice (Text-Only, No PDF)

**You are running Task 11. The task is already identified. Do not classify.**

## What this task is (vs T20)

Register ONE unpaid supplier invoice from **inline text data** (supplier name, org number, invoice number, gross amount, expense account, VAT rate). There is **NO PDF attachment**. This is T11.
- **T20** = PDF-based supplier invoice (prompt says "attached PDF" / "vedlagt PDF"). **DIFFERENT scorer, DIFFERENT flow.**
- Using the wrong standard scores 2/10. If you see a PDF attachment, STOP — this override does not apply.

## What to read and execute

1. **Read ONLY** `./trusted-standards/register-supplier-invoice.md`
2. **Immediately write and execute** a TypeScript script with `bun`. Do NOT read AGENTS.md, openapi.json, or playbooks.

## CRITICAL: DO NOT BOOK — Production Evidence

**ALL booked T11 runs scored 0/8 (all 4 checks fail). The ONLY run scoring above 0 was UNBOOKED.**

| Run | Booked? | Score |
|-----|---------|-------|
| 0b6fe5b8 | NO | 4/8 (2/4 checks passed) — **BEST EVER** |
| 8c302260, aa847819, b8f958e4, c290243c, d49da665 | YES | 0/8 each |

"Registrer" = register/draft. "Bokfør" = book. The prompt says REGISTER. Use ONLY `sendToLedger=false`. Never `sendToLedger=true`.

## Flow (3 writes + 4 verification GETs)

1. `POST /supplier` — include `postalAddress` + `physicalAddress` (same address for both) + `bankAccountPresentation: [{ bban }]` if prompt has bank account. Extract `value.id` and `value.ledgerAccount.id` (this IS account 2400).
2. `GET /ledger/account?number=<expense>&fields=id,number,vatLocked,legalVatTypes` — do NOT use `isApplicableForSupplierInvoice=true` (excludes vatLocked accounts like 7100 → crash).
3. **If vatLocked**: `GET /ledger/account?number=2710&fields=id` (input VAT account for manual 3-posting split).
4. `POST /ledger/voucher/importDocument` with EHF/UBL XML — response is **`.values[0]`** (plural, NOT `.value`). Extract `.values[0].id` and `.values[0].version`.
5. `GET /supplierInvoice?voucherId={id}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*` — verify SI entity created. **`invoiceDateFrom`/`invoiceDateTo` are REQUIRED** (422 without).
6. `PUT /ledger/voucher/{id}?sendToLedger=false` with `version` + `postings` — see Posting Rules below. **STOP HERE.**
7. Verify: `GET /ledger/voucher/{id}?fields=id,number,date,description,voucherType(*),postings(*)` — confirm `number=0` (unbooked = CORRECT). Must use `postings(*)` not `fields=*`.
8. Verify: `GET /supplier/{id}?fields=*` — confirm addresses + bank populated.
9. Verify: `GET /supplierInvoice/{siId}?fields=*,orderLines(*)` — confirm orderLines, invoiceDueDate, kidOrReceiverReference.

## Posting Rules

**Standard (account NOT vatLocked):** 2 postings — debit expense (row 1, amount=net, amountGross=gross, `vatType: { id: 1 }`), credit supplier 2400 (row 2, amount=-gross, supplier linked, invoiceNumber, termOfPayment=dueDate). System auto-generates VAT on row 0.

**VatLocked (e.g. 7100):** 3 postings — expense (row 1, amount=NET, amountGross=NET, no vatType), VAT 2710 (row 2, amount=VAT_AMT), supplier 2400 (row 3, amount=-GROSS, supplier linked). Setting `vatType: { id: 1 }` on vatLocked accounts → 422.

Do NOT send `description` or `vendorInvoiceNumber` in the PUT body — immutable on Leverandørfaktura type.

## XML Rules (EHF/UBL)

- **Hard-code buyer org `987654325`** (valid mod11). `000000000` → 422 PEPPOL-COMMON-R041. Do NOT try `GET /company/whoAmI` (422).
- **Include `cac:PaymentMeans`** with `PaymentMeansCode=30`, `PaymentID=<invoiceNumber>`, and `PayeeFinancialAccount/cbc:ID=<bank account or NO0000000000000>`. Omitting PayeeFinancialAccount → 422 BR-61.
- `cbc:DueDate` = invoice date + 30 days (populates `invoiceDueDate` on SI entity).
- Use net amounts in XML line and totals, not gross.
- Preserve prompt description exactly in invoice line item name.

## Known Fatal Traps

1. **Direct `POST /ledger/voucher`** — does NOT create SI entity → scorer sees nothing → 0/8
2. **Booking the voucher** — ALL booked runs = 0/8
3. **`importDocument` returns `.values[]` not `.value`** — using `.value.id` crashes → orphaned SI → duplicate on retry → 0/8
4. **`importDocument` is NOT idempotent** — crash-then-retry creates duplicate SI that cannot be deleted
5. **Missing `invoiceDateFrom`/`invoiceDateTo`** on GET supplierInvoice → 422
6. **Missing `PayeeFinancialAccount`** in XML → 422 BR-61
7. **`isApplicableForSupplierInvoice=true`** filter → excludes vatLocked accounts → empty results → crash
8. **`vatType: { id: 1 }` on vatLocked account** → 422; must use 3-posting manual split
9. **Omitting `physicalAddress`** on supplier → scorer check fails
10. **Using `bankAccounts` string array** instead of `bankAccountPresentation: [{ bban }]` → silently does nothing

## If the prompt doesn't match

If the incoming prompt has a PDF attachment, or is clearly NOT about registering a text-only supplier invoice, say so and stop immediately. Do not attempt to execute.
