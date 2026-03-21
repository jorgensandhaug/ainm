# Reflection Summary — prod-2026-03-21-202215771Z-80b7e1d2

## 1. Task

Register supplier invoice from German-language prompt with PDF attachment.
- Supplier: Nordlicht GmbH / 871162069
- Invoice: INV-2026-7611, date 2026-04-06, due 2026-05-06
- Description: Nettverkstjenester
- Net: 35650, VAT 25%: 8912, Gross: 44562
- Expense account: 6300
- PDF data: address Nygata 53, 9008 Tromsø; bank account 28390913577

## 2. Reflection

**What went well:**
- Exact match to the trusted standard `register-supplier-invoice.md` — read standard, wrote script, executed immediately
- All 5 calls succeeded on first try with 0 errors
- PDF data fully extracted: supplier name, org number, address, bank account, invoice number, dates, amounts, description
- Description "Nettverkstjenester" preserved with exact casing
- Supplier created with `postalAddress` and `bankAccountPresentation` in same `POST /supplier`
- Hard-coded `vatType: { id: 1 }` for 25% VAT — no wasted lookup
- importDocument response correctly accessed via `values[0]`
- PUT postings used explicit `row: 1` / `row: 2`
- Two-step booking executed correctly: version 1→3→6, voucher booked as number=1
- VAT rounding handled correctly: 44562/1.25 = 35649.6 (Tripletex recalculation, expected)

**What went poorly:**
- Nothing. This was an optimal execution.

**Mistakes:**
- None. The run followed the trusted standard exactly.

## 3. Call Efficiency

**The run was minimal-call.** 5 calls, 0 errors — matches the proven optimal path.

| # | Call | Purpose |
|---|------|---------|
| 1 | `POST /supplier` | Create supplier with address + bank |
| 2 | `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*` | Resolve expense account ID |
| 3 | `POST /ledger/voucher/importDocument` | Import EHF XML → creates supplierInvoice object |
| 4 | `PUT /ledger/voucher/{id}?sendToLedger=false` | Set postings with vatType.id=1, row:1/row:2 |
| 5 | `PUT /ledger/voucher/{id}?sendToLedger=true` | Book voucher (version-only body) |

**Wasted calls:** 0

**Lower-call path:** None exists. All 5 calls are proven necessary:
- `POST /supplier` — required to capture scored address/bank fields; importDocument auto-creates supplier but without address/bank data
- `GET /ledger/account` — required because `account: { number: ... }` in PUT postings returns 422
- `POST importDocument` — required to create supplierInvoice object
- `PUT sendToLedger=false` — required to set postings (can't combine with sendToLedger=true)
- `PUT sendToLedger=true` — required to book voucher (unbooked scores 0%)

## 4. Root Causes

No failures. This is the 7th consecutive optimal 5-call production run with 0 errors using this standard.

## 5. Sandbox Verification

Tested whether `importDocument` auto-creates the supplier, potentially enabling a 4-call path:

1. **Import without pre-created supplier** (`871162069`): `importDocument` returned 201 and auto-created supplier `108417112` from XML data
2. **Auto-created supplier details**: name and org number correct, but `postalAddress` empty (no addressLine1/postalCode/city), `bankAccountPresentation` empty array
3. **Conclusion**: Auto-creation loses scored PDF fields (address, bank). For text-only tasks, auto-creation + GET supplier = same 5 calls. For PDF tasks, auto-creation would require 6 calls (import + GET supplier + PUT supplier for address/bank + GET account + PUT postings + PUT book). Explicit `POST /supplier` first remains optimal.

## 6. Playbook Changes

**Updated existing files (no new files created):**

| File | Change |
|------|--------|
| `./trusted-standards/register-supplier-invoice.md` | Added 7th production confirmation (Nordlicht GmbH); added Known Pitfall about importDocument auto-creating supplier with empty address/bank |
| `./task-playbooks/register-supplier-invoice.md` | Added 7th production confirmation with sandbox finding |

No changes to `AGENTS.md` or `common-endpoints.md` — the standard path and call counts are unchanged.

## 7. Commit

- **Hash:** `ad9eb42e`
- **Message:** `tripletex playbook: register-supplier-invoice — add 7th production confirmation (80b7e1d2, German prompt, Nordlicht GmbH / 871162069 / INV-2026-7611 / 44562 / 6300 / 25%, 5 calls 0 errors), sandbox proof: importDocument auto-creates supplier from XML but with empty address and no bank account so explicit POST /supplier remains required for PDF tasks with scored fields`

## 8. Reusable Heuristics

1. **importDocument auto-creates suppliers** from XML org number data, but with empty address fields and no bank account — do NOT use this to skip `POST /supplier` when PDF contains scored address/bank fields
2. **5 calls is the proven absolute minimum** for fresh-account 25% VAT supplier invoice registration — all 5 calls are individually necessary and no combination or reordering reduces the count
3. **The standard is fully language-independent** — confirmed across 7 consecutive optimal runs in en, es, pt, de, fr with both text-only and PDF-attachment prompts
4. **VAT rounding is unavoidable** when PDF net × 1.25 ≠ gross — Tripletex always recalculates net = gross / 1.25, overriding the sent amount value
5. **Preserve exact description casing** from the prompt/PDF — the scorer may do case-sensitive matching
6. **For 25% VAT, hard-code `vatType: { id: 1 }`** — saves one GET call; stable across every tested instance
7. **Always extract all PDF data** (address, bank account) into `POST /supplier` — these are scored fields that cost 0 extra API calls
