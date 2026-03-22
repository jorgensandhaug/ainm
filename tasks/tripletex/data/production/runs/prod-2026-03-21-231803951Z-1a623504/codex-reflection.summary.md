# Codex Reflection Summary

## 1. Task

Register supplier invoice INV-2026-1443 from Montaña SL (org. nr 831519975) for 50050 NOK incl. 25% VAT. Expense account 6300. Spanish-language text-only prompt (no PDF attachment).

## 2. Reflection

**What went well:**
- Correctly identified this as the `register-supplier-invoice` trusted standard (not receipt/expense voucher)
- Read the trusted standard before writing the script
- Hard-coded `vatType: { id: 1 }` for 25% VAT (saving 1 call vs GET /ledger/vatType)
- Correctly accessed importDocument response via `values[0]` (not `value`)
- Used explicit `row: 1` and `row: 2` on postings
- Two-step booking executed correctly (sendToLedger=false then sendToLedger=true)
- Description "servicios de oficina" preserved with exact casing from Spanish prompt
- Correct VAT calculation: 50050/1.25 = 40040 net, 10010 VAT (exact division, no rounding issues)
- Used buyer EndpointID `123456785` (avoiding PEPPOL-COMMON-R041 error)
- Included buyer PostalAddress in XML (avoiding BR-10 error)
- Did not manually set Content-Type on FormData (avoiding 415 error)

**What went poorly:**
- Nothing. The run was mechanically flawless.

**Mistakes:**
- None.

## 3. Call Efficiency

**Run was minimal-call: YES**

5 calls, 0 errors — matches the canonical minimum for the fresh-account-like 25% VAT shape:

| # | Call | Status |
|---|------|--------|
| 1 | `POST /supplier` | 201 |
| 2 | `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*` | 200 |
| 3 | `POST /ledger/voucher/importDocument` | 201 |
| 4 | `PUT /ledger/voucher/{id}?sendToLedger=false` | 200 |
| 5 | `PUT /ledger/voucher/{id}?sendToLedger=true` | 200 |

**Wasted calls:** 0

**Lower-call path:** None exists. 5 calls is the proven minimum. Sandbox investigation confirmed:
- importDocument returns empty postings array, so GET /ledger/account cannot be skipped
- Single PUT with postings + sendToLedger=true fails with 422 ("Bilag uten posteringer kan ikke bli sendt til hovedbok"), so two-step booking is mandatory
- `account: { number: ... }` does not work in PUT postings (422), so account ID resolution via GET remains required

## 4. Root Causes

No issues to diagnose. The run executed the canonical 5-call trusted standard path without error.

## 5. Sandbox Verification

**Sandbox test:** Created supplier `108460351`, imported voucher `609214497`, verified:
- `importDocument` returns `{ values: [{ id, version, postings: [] }] }` — empty postings, no account IDs to extract
- Single PUT with postings + sendToLedger=true → 422 (still fails, as documented)
- Two-step booking: PUT sendToLedger=false (version→3), PUT sendToLedger=true (version→6, number=558) — works correctly
- **Conclusion:** 5 calls is the true minimum; no 4-call shortcut exists

## 6. Playbook Changes

**Updated existing files (no new files created):**
- `./trusted-standards/register-supplier-invoice.md` — added production confirmation for Montaña SL run + sandbox re-proof note about empty import postings
- `./task-playbooks/register-supplier-invoice.md` — added production confirmation for Montaña SL run + sandbox re-proof note

**No AGENTS.md changes needed** — references to the trusted standard and playbook were already correct.

## 7. Commit

- **Hash:** `1724ac54`
- **Message:** `tripletex playbook: register-supplier-invoice — add production confirmation (1a623504, Spanish prompt, Montaña SL / 831519975 / INV-2026-1443 / 50050 / 6300 / 25%, 5 calls 0 errors); sandbox re-proof confirmed importDocument returns empty postings (GET /ledger/account still required) and single PUT with postings+sendToLedger=true still fails; 5 calls remains the true minimum`

## 8. Reusable Heuristics

1. **5 calls is the proven absolute minimum** for fresh-account-like 25% VAT supplier invoices. Do not attempt to reduce further — importDocument returns empty postings, single PUT with postings+booking fails, and account: { number } is rejected.
2. **Read the trusted standard, then execute immediately.** This run matched the trusted standard exactly and completed in 5 calls, 0 errors by following it without detours.
3. **Preserve prompt description casing exactly.** Spanish "servicios de oficina" was preserved as-is, not capitalized.
4. **Hard-code vatType: { id: 1 } for 25% VAT.** This saves 1 API call vs GET /ledger/vatType and is stable across all tested instances.
5. **The two-step booking pattern is mandatory.** PUT sendToLedger=false (postings), then PUT sendToLedger=true (version only). This cannot be combined into one call.
6. **Languages confirmed working across consecutive optimal runs:** en, es, pt, de, fr, nb, nn — the standard is fully language-independent.
7. **Expense accounts confirmed working:** 6300, 6340, 6500, 6540, 6590, 7000, 7140 — the standard works for all tested expense accounts.
