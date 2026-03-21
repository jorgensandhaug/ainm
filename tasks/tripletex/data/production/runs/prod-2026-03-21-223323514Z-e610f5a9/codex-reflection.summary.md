# Codex Reflection Summary

## 1. Task

Register supplier invoice INV-2026-5787 from Luz do Sol Lda (org 945810149), gross 35950 NOK including 25% VAT, expense account 6590. Portuguese-language text-only prompt (no PDF).

## 2. Reflection

**What went well:**
- Clean execution: 5 API calls, 0 errors — matches the canonical minimum
- Correctly identified as exact trusted-standard match for 25% VAT fresh-supplier invoice
- Read the trusted standard before writing the script
- Correctly computed net=28760, VAT=7190 from gross=35950
- Used hard-coded `vatType: { id: 1 }` to skip the `GET /ledger/vatType` call
- Preserved Portuguese description "serviços de escritório" with exact casing
- Used `123456785` as buyer EndpointID (not `000000000`)
- Used `response.values[0]` for importDocument response (not `response.value`)
- Used explicit `row: 1` and `row: 2` on PUT postings
- Two-step booking: sendToLedger=false then sendToLedger=true with only `{ version }`

**What went poorly:**
- Nothing — this was a clean optimal run

**Mistakes:**
- None

## 3. Call Efficiency

**The run was minimal-call.** 5 calls, 0 errors — matches the canonical 5-call floor for fresh-account 25% VAT supplier invoices.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `POST /supplier` | 201 | Create supplier |
| 2 | `GET /ledger/account?number=6590&isApplicableForSupplierInvoice=true&fields=*` | 200 | Resolve expense account ID |
| 3 | `POST /ledger/voucher/importDocument` | 201 | Import EHF XML → creates supplierInvoice object |
| 4 | `PUT /ledger/voucher/{id}?sendToLedger=false` | 200 | Set correct postings with VAT |
| 5 | `PUT /ledger/voucher/{id}?sendToLedger=true` | 200 | Book the voucher |

**Wasted calls:** 0

**Can the 5-call path be reduced to 4?**
- `account: { number: 6590 }` in PUT postings → 422 (requires `name` field too) — cannot skip GET /ledger/account
- Combined postings + sendToLedger=true in single PUT → 422 ("Bilag uten posteringer kan ikke bli sendt til hovedbok") — cannot merge steps 4+5
- **Conclusion: 5 calls is the proven floor for this task shape**

## 4. Root Causes

No failures in this run. The optimal path was followed exactly.

## 5. Sandbox Verification

Two optimization hypotheses tested against the persistent sandbox:

1. **Skip GET /ledger/account by using `account: { number: 6590 }`:**
   - Result: `422 "postings.account.name — Kan ikke være null."`
   - Only `account: { id }` works in PUT postings — the GET is required

2. **Combine postings + booking in single PUT with sendToLedger=true:**
   - Result: `422 "Bilag uten posteringer kan ikke bli sendt til hovedbok."`
   - Tripletex clears existing postings before applying new ones, creating a transient empty state
   - The two-step booking (sendToLedger=false then sendToLedger=true) remains the only working path

Both results confirm the 5-call floor is correct and cannot be reduced further.

## 6. Playbook Changes

Updated existing files (no new files created):

- **`./task-playbooks/register-supplier-invoice.md`**:
  - Added 9th production confirmation (e610f5a9, Portuguese prompt, Luz do Sol Lda / 945810149 / 35950 / 6590 / 25%)
  - Aligned buyer EndpointID template from `999999999` to `123456785` for consistency with trusted standard
  - Added sandbox re-proof that `account: { number }` returns 422
  - Added account 6590 to confirmed accounts list (now: 6300, 6340, 6500, 6540, 6590, 7000, 7140)

- **`./trusted-standards/register-supplier-invoice.md`**:
  - Enhanced combined-PUT pitfall entry with exact error message and 2026-03-21 sandbox re-proof confirmation

## 7. Commit

- **Hash:** `f0dcdc19`
- **Message:** `tripletex playbook: register-supplier-invoice — add 9th production confirmation (e610f5a9, Portuguese prompt, Luz do Sol Lda / 945810149 / INV-2026-5787 / 35950 / 6590 / 25%, 5 calls 0 errors); align buyer EndpointID template from 999999999 to 123456785 for consistency with trusted standard; add sandbox re-proof that account:{number} returns 422 and combined postings+sendToLedger=true still fails 422; add 6590 to confirmed accounts list`

## 8. Reusable Heuristics

1. **5-call floor is proven and cannot be reduced** for fresh-account 25% VAT supplier invoices: POST supplier → GET account → POST importDocument → PUT sendToLedger=false → PUT sendToLedger=true
2. **`account: { number }` does NOT work** in PUT voucher postings — only `account: { id }` is accepted; the GET /ledger/account step cannot be skipped
3. **Combined postings + sendToLedger=true always fails** — Tripletex clears postings before re-applying, creating a transient empty state that triggers 422; two-step booking is mandatory
4. **Buyer EndpointID `123456785`** is the safer constant — both `123456785` and `999999999` work, but `123456785` is what the trusted standard specifies and all recent production runs use
5. **Preserve prompt description casing exactly** — "serviços de escritório" must not be capitalized or ASCII-normalized
6. **Hard-code `vatType: { id: 1 }`** for 25% incoming VAT — stable across all tested instances, saves 1 call vs GET /ledger/vatType
7. **Language independence confirmed** — standard works identically for en, es, pt, de, fr, nb, nn prompts
8. **Account independence confirmed** — standard works for accounts 6300, 6340, 6500, 6540, 6590, 7000, 7140 with no account-specific behavior
