# Codex Reflection Summary

## 1. Task

Register supplier invoice for **Colline SARL** (org 938165742), invoice INV-2026-8953, 32650 NOK TTC (gross), expense account 7300, 25% VAT. French-language text-only prompt (no PDF). Description: "services de bureau".

## 2. Reflection

**What went well:**
- Matched the trusted standard exactly and read it before writing the script
- Executed the proven 5-call path with 0 errors on the first attempt
- Hard-coded `vatType: { id: 1 }` for 25% VAT (no unnecessary GET /ledger/vatType)
- Correctly accessed importDocument response via `values[0]` (not `value`)
- Used explicit `row: 1` and `row: 2` on PUT postings
- Two-step booking: sendToLedger=false then sendToLedger=true with version-only
- Preserved description "services de bureau" with exact casing
- Used `123456785` as buyer EndpointID in XML
- Did not set Content-Type header on FormData

**What went poorly:** Nothing — optimal execution.

**Mistakes:** None.

## 3. Call Efficiency

**Minimal-call: YES** — 5 calls, 0 errors. This is the proven minimum for fresh-account 25% VAT supplier invoices.

| # | Call | Purpose |
|---|------|---------|
| 1 | `POST /supplier` | Create supplier, get id + ledgerAccount.id |
| 2 | `GET /ledger/account?number=7300&isApplicableForSupplierInvoice=true&fields=*` | Resolve expense account id |
| 3 | `POST /ledger/voucher/importDocument` | Import EHF XML → creates supplierInvoice object |
| 4 | `PUT /ledger/voucher/{id}?sendToLedger=false` | Set postings with vatType:{id:1} |
| 5 | `PUT /ledger/voucher/{id}?sendToLedger=true` | Book voucher (version-only body) |

**Wasted calls:** 0.

**Lower-call path:** None exists. The 5-call path is the proven minimum:
- POST /supplier cannot be skipped (importDocument auto-creates supplier with empty data)
- GET /ledger/account cannot be skipped (account:{number} rejected in PUT postings)
- POST importDocument is required for supplierInvoice object creation
- PUT sendToLedger=false is required (combining postings + sendToLedger=true fails)
- PUT sendToLedger=true is required (without it, voucher stays unbooked → 0% score)

## 4. Root Causes

No failures in this run. The trusted standard was followed exactly and all documented pitfalls were avoided.

## 5. Sandbox Verification

- **Account 7300** exists in sandbox as "Salgskostnad" (id 424191171, `isApplicableForSupplierInvoice=true`)
- Full 5-call path with account 7300 completed successfully: supplier 108462463, voucher 609217636, booked (number=561)
- Postings correct: expense row 26120 net / 32650 gross / vatType=1, supplier row -32650, system VAT row 6530
- This is the first sandbox proof for account 7300; confirms it works identically to all previously tested accounts

## 6. Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/register-supplier-invoice.md`** — added production confirmation for Colline SARL (b8f958e4), account 7300 as first production use, sandbox re-proof for account 7300, updated accounts list to include 7300
- **`./task-playbooks/register-supplier-invoice.md`** — added matching production confirmation entry with same data

Accounts now confirmed across production runs: 6300, 6340, 6500, 6540, 6590, 7000, 7140, 7300.

No AGENTS.md changes needed — no new task shapes, endpoint rules, or structural changes.

## 7. Commit

- **Hash:** `3edaefd3`
- **Message:** `tripletex playbook: register-supplier-invoice — add 14th production confirmation (b8f958e4, French prompt, Colline SARL / 938165742 / INV-2026-8953 / 32650 / 7300 / 25%, 5 calls 0 errors); first production use of expense account 7300 (Salgskostnad); sandbox-verified on 2026-03-22; accounts confirmed across production runs: 6300, 6340, 6500, 6540, 6590, 7000, 7140, 7300`

## 8. Reusable Heuristics

1. **Account 7300 (Salgskostnad) works identically** to all other expense accounts in the supplier invoice flow — no special handling needed
2. **8 distinct expense accounts now production-proven**: 6300, 6340, 6500, 6540, 6590, 7000, 7140, 7300 — all work the same way with `isApplicableForSupplierInvoice=true`
3. **French text-only prompts** follow the exact same 5-call path as all other languages — the standard is fully language-independent across en, es, pt, de, fr, nb, nn
4. **32650 / 1.25 = 26120 is exact** (no rounding) — when gross is divisible by 1.25, VAT math is clean; this is the common case
5. **14 consecutive production runs** now confirm the 5-call path (excluding 2 suboptimal runs that had XML template bugs since fixed) — the standard is highly stable
