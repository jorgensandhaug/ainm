# Register Supplier Invoice from PDF

> **NEVER use `/incomingInvoice*` or direct `POST /ledger/voucher`.** Use `importDocument` with EHF XML.

## Scope
- register one unpaid supplier invoice from an attached PDF (any language)
- PDF contains: supplier name, org number, address, bank account, invoice number, dates, amounts, expense account
- if prompt has all data inline (no PDF) → use `register-supplier-invoice.md` instead

## Proven Best Path (5 calls, 25% VAT)
1. `POST /supplier` — with postalAddress + physicalAddress + country:{id:161} + bankAccountPresentation → extract `supplierId` AND `ledgerAccount.id` (this is account 2400)
2. `GET /ledger/account?number=<expense-acct>&isApplicableForSupplierInvoice=true&fields=id,number` — expense account only; credit-side 2400 comes from step 1
3. `POST /ledger/voucher/importDocument` — EHF/UBL XML → response is `.values[0]` (NOT `.value`)
4. `PUT /ledger/voucher/{id}?sendToLedger=false` — set postings with vatType:{id:1}; credit account = `ledgerAccount.id` from step 1
5. `PUT /ledger/voucher/{id}?sendToLedger=true` — book with `{ version, voucherType: { name: "Leverandørfaktura" } }`

## Critical Rules
- **TIMEOUT**: After reading the trusted standard, IMMEDIATELY write the script and run it. Do NOT read additional files. 2 runs (4c255d98, de228487) scored 0% by timing out without ever executing a script.
- **PaymentMeans is REQUIRED in the EHF XML** — without it, `kidOrReceiverReference` on the SI entity stays empty and Check 5 fails. Add `<cac:PaymentMeans>` with `<cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>` and `<cac:PayeeFinancialAccount><cbc:ID>${bankAccount}</cbc:ID></cac:PayeeFinancialAccount>`. Check 5 had NEVER passed across 11 runs; this is the fix (sandbox-verified 2026-03-22).
- MUST set both `postalAddress` AND `physicalAddress` with `country: { id: 161 }` — all runs that omitted physicalAddress failed
- importDocument response is `.values[0]` — using `.value` crashes and creates orphaned SI entity
- Do NOT combine postings + sendToLedger=true in one PUT — 422
- Do NOT include postings in the booking step — only version + voucherType
- Use `account: { id }` not `account: { number }` — the GET call is mandatory
- Use `bankAccountPresentation: [{ bban }]` not deprecated `bankAccounts`
- Do NOT waste a separate GET for account 2400 — extract `ledgerAccount.id` from POST /supplier response

## Production Run History

| Run | Lang | Calls | Score | Checks Failed | Notes |
|---|---|---|---|---|---|
| 53cb0731 | EN | 5+ | 7/10 | 5,6 | No physicalAddress, not booked, no PaymentMeans |
| 9b2a1d22 | ? | ? | 7/10 | 5,6 | No physicalAddress, not booked, no PaymentMeans |
| aaf59452 | ES | ? | 7/10 | 5,6 | No physicalAddress, not booked, no PaymentMeans |
| dedc4bfe | FR | 5 | 8/10 | 5 | No physicalAddress, IS booked, no PaymentMeans |
| 80b7e1d2 | DE | ? | 8/10 | 5 | No physicalAddress, IS booked, no PaymentMeans |
| 61320c6d | NN | ? | 8/10 | 5 | No physicalAddress, IS booked, no PaymentMeans |
| 9b27a332 | EN | 3 | **2/10** | 2,3,4,5,6 | Direct voucher (WRONG approach) |
| 4c255d98 | PT | 0 | **0/10** | — | Agent timed out reading standard |
| de228487 | DE | 0 | **0/10** | — | Agent timed out reading standard |
| 7c4183ab | PT | 5 | 8/10 | 5 | Both addresses+country+booking, no PaymentMeans |
| 4c22beb6 | NB | 5 | 8/10 | 5 | Both addresses+country+booking, no PaymentMeans |

**ROOT CAUSE of persistent Check 5 failure**: Missing `<cac:PaymentMeans>` in the EHF XML leaves `kidOrReceiverReference` empty on the supplierInvoice entity. Check 5 has NEVER passed across 11 runs. Fix: add PaymentMeans with `PaymentID=${invoiceNumber}` and `PayeeFinancialAccount/ID=${bankAccount}`. Sandbox-verified 2026-03-22.

**Best path to 10/10:** importDocument (with PaymentMeans) + physicalAddress + country + booking = 5 calls. Extract `ledgerAccount.id` from POST /supplier response — do NOT waste a separate GET for account 2400.

## Sandbox-Verified Optimization Attempts (2026-03-22)
- Combined PUT (postings + sendToLedger=true in one call) → **422** ("Bilag uten posteringer kan ikke bli sendt til hovedbok"). Cannot reduce steps 4+5 to 1 call.
- `account: { number: 6300 }` without id → **422** ("postings.account.name: Kan ikke være null"). GET for expense account ID is mandatory.
- `account: { number: 6300, name: "Leie lokale" }` without id → **422** ("Feltet må fylles ut"). API strictly requires `account: { id }`.
- **5 calls is the proven minimum** for this task shape. No further reduction is possible.
