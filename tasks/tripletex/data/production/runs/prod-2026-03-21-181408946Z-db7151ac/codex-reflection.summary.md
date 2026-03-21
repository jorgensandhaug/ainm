# Codex Reflection Summary — prod-2026-03-21-181408946Z-db7151ac

## 1. Task

Register supplier invoice INV-2026-9075 from Brightstone Ltd (org no. 890932991) for 59800 NOK including VAT. Expense account 6300, 25% input VAT. Text-only prompt (no PDF attachment).

## 2. Reflection

**What went well:**
- Correctly identified this as an exact trusted-standard match for `register-supplier-invoice`
- Used the optimal 4-call path for 25% VAT, fresh-account, no-PDF
- Hard-coded `vatType: { id: 1 }`, avoiding unnecessary `GET /ledger/vatType`
- Correctly accessed importDocument response via `values[0]` (not `value`)
- Used explicit `row: 1` and `row: 2` on PUT postings
- All 4 calls succeeded with 0 errors
- Final state correct: expense 6300, vatType.id=1, amount=47840, amountGross=59800; supplier -59800; system VAT 11960

**What went poorly:**
- Nothing. The run was mechanically perfect.

**This is the first production confirmation of the 4-call path.** Previous production runs used 5+ calls (either including unnecessary `GET /ledger/vatType` for 25% VAT, or hitting bugs like `response.value` instead of `response.values[0]`).

## 3. Call Efficiency

**The run was minimal-call.** 4 API calls used, 0 errors.

| # | Call | Purpose | Status |
|---|------|---------|--------|
| 1 | `POST /supplier` | Create Brightstone Ltd | 201 |
| 2 | `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*` | Resolve expense account ID | 200 |
| 3 | `POST /ledger/voucher/importDocument` | Import EHF XML → create supplier invoice | 201 |
| 4 | `PUT /ledger/voucher/609080159?sendToLedger=false` | Set postings with vatType.id=1 | 200 |

**Wasted calls:** None.

**Lower-call path investigation:** Tested whether `GET /ledger/account` could be skipped by passing `account: { number: 6300 }` in the PUT. Sandbox confirmed this returns `422` requiring `account.name`. The 4-call path is the true minimum for this task shape.

**Next agent should follow this exact 4-call path** for fresh-account, 25% VAT, no-PDF supplier invoice tasks:
1. `POST /supplier`
2. `GET /ledger/account?number=<N>&isApplicableForSupplierInvoice=true&fields=*`
3. `POST /ledger/voucher/importDocument`
4. `PUT /ledger/voucher/{id}?sendToLedger=false` with hard-coded `vatType: { id: 1 }`

## 4. Root Causes

No mistakes to diagnose. The run followed the trusted standard exactly and achieved optimal execution.

The key decisions that made this run optimal:
- **Reading only the matching trusted standard** — did not waste time on AGENTS.md, openapi.json, or multiple playbook files
- **Hard-coding vatType.id=1** — saved 1 API call vs the older 5-call path
- **Accessing importDocument response correctly** — `values[0]`, not `value`
- **Using explicit row values** — `row: 1` and `row: 2`, not defaulting to row 0

## 5. Sandbox Verification

Tested in persistent sandbox (`kkpqfuj-amager.tripletex.dev`) whether a 3-call path is possible:

- Created supplier `Sandbox 3Call V2 Ltd` / `987654325` (supplier `108391947`)
- Imported XML invoice (voucher `609081982`)
- Attempted PUT with `account: { number: 6300 }` → **422** `"postings.account.name: Kan ikke være null."`
- Retried with `account: { id: <from GET> }` → **200** success

**Conclusion:** `account: { number: ... }` does NOT work in PUT postings for any account number (confirmed for both 6300 and 6340). The `GET /ledger/account` call is structurally required. **4 calls is the proven minimum.**

## 6. Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/register-supplier-invoice.md`** — added production proof for Brightstone Ltd 4-call run (first production confirmation); added sandbox re-proof that `account: { number: 6300 }` rejection applies to all accounts
- **`./task-playbooks/register-supplier-invoice.md`** — added "Production Proof — 4-call Path" section documenting the Brightstone Ltd run

No AGENTS.md table changes needed (file names unchanged).

## 7. Commit

- **Hash:** `727ce93f`
- **Message:** `tripletex playbook: register-supplier-invoice — add first 4-call production proof from db7151ac Brightstone Ltd run`
- **Files changed:** `trusted-standards/register-supplier-invoice.md`, `task-playbooks/register-supplier-invoice.md`

## 8. Reusable Heuristics

1. **For 25% incoming VAT, always hard-code `vatType: { id: 1 }`** — saves 1 call vs the older `GET /ledger/vatType` path. This is now production-proven across multiple runs.
2. **The 4-call path is the true minimum for fresh-account, 25% VAT supplier invoices** — `GET /ledger/account` cannot be skipped because `account: { number: N }` fails with 422 in PUT postings.
3. **Read only the matching trusted standard for exact-match tasks** — do not waste time on AGENTS.md, openapi.json, or multiple playbooks. This run completed in well under 300s by going straight to the trusted standard.
4. **Always access importDocument response via `values[0]`** — this is a list wrapper, not a single-value wrapper.
5. **Always use explicit `row: 1` and `row: 2`** on PUT postings — row 0 is system-reserved.
6. **For text-only prompts (no PDF), the supplier POST only needs `name` and `organizationNumber`** — no address or bank fields to extract.
7. **The production run confirms the sandbox-proven path is production-stable** — vatType.id=1 hard-coding, values[0] access, and explicit row values all work identically in production and sandbox.
