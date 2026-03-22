# Register Supplier Invoice from PDF

> **NO BETA ENDPOINTS.** NEVER use `/incomingInvoice*` or any `(BETA)` endpoint. They ALL return `403`.
> **USE importDocument.** Direct `POST /ledger/voucher` scored 2/10 — it does NOT create the required `supplierInvoice` entity.

## Scope

Use for tasks like:
- register one unpaid supplier invoice from an attached PDF
- prompt says "see attached PDF" / "ver PDF adjunto" / "voir PDF ci-joint" / "siehe beigefügte PDF" / "sjå vedlagt PDF" / "ver PDF anexo"
- PDF contains: supplier name, org number, address, bank account, invoice number, dates, amounts, expense account

Do not use for:
- text-only supplier invoice prompts (all data inline, no PDF) — use `register-supplier-invoice.md` instead
- supplier creation as the main task
- payment/remittance of an already-booked supplier invoice

## Proven Best Path (5 calls, 25% VAT)

1. `POST /supplier` — with postalAddress + physicalAddress + country + bankAccountPresentation
2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
3. `POST /ledger/voucher/importDocument` — EHF/UBL XML invoice
4. `PUT /ledger/voucher/{id}?sendToLedger=false` — set postings with vatType: { id: 1 }
5. `PUT /ledger/voucher/{id}?sendToLedger=true` — book with `{ version, voucherType: { name: "Leverandørfaktura" } }`

For **non-25% VAT**, add `GET /ledger/vatType` between steps 2 and 3 (6 calls total).

## Why importDocument (NOT direct voucher)

Both T20 and T11 use `importDocument` — direct `POST /ledger/voucher` does NOT create a `supplierInvoice` entity.

| Approach | T20 score | T11 score | Why |
|---|---|---|---|
| importDocument | **7-8/10** | 1/8 | Creates real `supplierInvoice` entity; T11 description mismatch costs 1 check |
| Direct POST /ledger/voucher | **2/10** | best 1/8 | No `supplierInvoice` entity created |

**NEVER use direct `POST /ledger/voucher` for supplier invoice tasks.**

## Supplier Data Extraction (CRITICAL for Check 5)

Extract ALL fields from the PDF. Include `physicalAddress` = same as `postalAddress`:

```json
{
  "name": "<from PDF>",
  "organizationNumber": "<from PDF>",
  "postalAddress": {
    "addressLine1": "<street>",
    "postalCode": "<code>",
    "city": "<city>",
    "country": { "id": 161 }
  },
  "physicalAddress": {
    "addressLine1": "<street>",
    "postalCode": "<code>",
    "city": "<city>",
    "country": { "id": 161 }
  },
  "bankAccountPresentation": [{ "bban": "<bank account>" }]
}
```

- Omitting `physicalAddress` failed Check 5 in ALL 6 importDocument production runs
- `country: { id: 161 }` = Norge — MUST be on both addresses

## Known Pitfalls

- do NOT use direct `POST /ledger/voucher` — scored 2/10 because no supplierInvoice entity
- do NOT access importDocument response as `response.value` — it's `response.values[0]`
- do NOT omit `row: 1` / `row: 2` on postings — causes 422
- do NOT combine postings + sendToLedger=true in one PUT — fails
- do NOT omit the booking step (step 5) — fails Check 6
- do NOT omit `physicalAddress` on supplier — fails Check 5
- do NOT omit `country: { id: 161 }` on addresses
- do NOT use deprecated `bankAccounts` field — use `bankAccountPresentation`
- preserve exact casing of description from PDF
- do NOT omit `amountCurrency` / `amountGrossCurrency` on postings — causes 500

## Production Run History

| Run | Language | PDF | Calls | Errors | Score | Notes |
|---|---|---|---|---|---|---|
| 53cb0731 | English | en_01 | 5+ | ? | 7/10 | No physicalAddress, not booked |
| 9b2a1d22 | ? | ? | ? | ? | 7/10 | No physicalAddress, not booked |
| aaf59452 | Spanish | ? | ? | ? | 7/10 | No physicalAddress, not booked |
| dedc4bfe | French | fr_03 | 5 | 0 | 8/10 | No physicalAddress, IS booked |
| 80b7e1d2 | German | ? | ? | ? | 8/10 | No physicalAddress, IS booked |
| 61320c6d | Nynorsk | ? | ? | ? | 8/10 | No physicalAddress, IS booked |
| 9b27a332 | English | en_03 | 3 | 0 | **2/10** | Direct voucher (WRONG approach) |
| 4c255d98 | Portuguese | pt_07 | 0 | 0 | **0/10** | Agent read trusted standard but failed to execute any script |

**Best path to 10/10:** importDocument + physicalAddress + country + booking = all 6 checks should pass.

## Sandbox Verification (2026-03-22)

- supplier `Oakwood SBX T20` created with postalAddress + physicalAddress + country + bankAccountPresentation
- importDocument created voucher 609294111 + supplierInvoice 2147670828
- supplierInvoice: invoiceNumber="INV-2026-T20-SBX", amount=-56750, outstandingAmount=56750
- voucher booked as number 748-2026
- 5 API calls, 0 errors, all verifications pass
