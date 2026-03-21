# Codex Reflection Summary

## 1. Task

Register supplier invoice from Tindra AS (org.nr 983514650), invoice INV-2026-3624, 42100 kr gross (25% MVA), account 6540 (kontortjenester). Norwegian text-only prompt, no PDF attachment.

## 2. Reflection

**What went well:**
- Exact match to trusted standard `register-supplier-invoice.md` — identified immediately and executed without hesitation
- All 5 API calls succeeded on first try with 0 errors
- Correctly used `values[0]` for importDocument response (not `value`)
- Correctly used `row: 1` and `row: 2` on PUT postings
- Hard-coded `vatType: { id: 1 }` for 25% incoming VAT (no wasted GET /ledger/vatType)
- Two-step booking executed correctly (sendToLedger=false then sendToLedger=true)
- Description "kontortjenester" preserved with exact lowercase casing from prompt
- No unnecessary reads of AGENTS.md, openapi.json, or other playbooks — went straight to script after reading trusted standard

**What went poorly:**
- Nothing. This was a flawless execution.

**Mistakes:**
- None. All documented pitfalls were avoided.

## 3. Call Efficiency

**Verdict: OPTIMAL — minimum possible calls.**

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `POST /supplier` | 201 | Create Tindra AS, get supplier ID + ledger account ID |
| 2 | `GET /ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*` | 200 | Resolve expense account ID |
| 3 | `POST /ledger/voucher/importDocument` | 201 | Import EHF XML, create supplier invoice + voucher |
| 4 | `PUT /ledger/voucher/{id}?sendToLedger=false` | 200 | Set postings with correct VAT |
| 5 | `PUT /ledger/voucher/{id}?sendToLedger=true` | 200 | Book voucher (number=1) |

**Wasted calls:** 0

**Lower-call alternatives investigated:**
- Skipping GET /ledger/account: impossible — `account: { number: 6540 }` returns 422 in PUT postings; account ID is required and varies per instance
- Skipping POST /supplier (let importDocument auto-create): would save 1 call but then need GET /supplier to discover the ledger account ID, net savings = 0
- Combining steps 4+5 (postings + sendToLedger=true in one PUT): fails with 422 "Bilag uten posteringer kan ikke bli sendt til hovedbok"
- Hard-coding account IDs: impossible, they vary per Tripletex instance

**Conclusion:** 5 calls is the proven minimum for the fresh-account-like, 25% VAT supplier invoice shape.

## 4. Root Causes

No errors or issues to diagnose. The run followed the trusted standard exactly as documented, which has been refined across 8 consecutive production runs to eliminate all known pitfalls.

## 5. Sandbox Verification

**Sandbox re-proof with account 6540:**
- Supplier: `Sandbox Proof 6540 AS` / `987654325`
- 5-call path: POST supplier → GET account → POST importDocument → PUT sendToLedger=false → PUT sendToLedger=true
- Supplier `108429674`, voucher `609161063`, booked as number 438
- Postings confirmed: Row 1 debit 6540 amount=33680 amountGross=42100 vatType=1; Row 2 supplier -42100; Row 0 system VAT 8420
- This is the first sandbox proof with account 6540 specifically, confirming it works identically to 6300/6340/6500/7000

**Account name discovery:** Account 6540 is named "Inventar" in sandbox (not "Kontortjenester" as one might guess from the task description). This confirms account names vary per instance and cannot be hard-coded.

## 6. Playbook Changes

**Updated existing files (no new files created):**

1. `./trusted-standards/register-supplier-invoice.md` — added 8th production confirmation (Tindra AS / aa847819), documented first use of account 6540, updated accounts-confirmed list (6300, 6340, 6500, 6540, 7000), added sandbox re-proof note for account 6540

2. `./task-playbooks/register-supplier-invoice.md` — added production proof entry for Tindra AS / aa847819 with 5 calls 0 errors, documented 8th consecutive optimal run, updated accounts-confirmed list

No AGENTS.md changes needed — the trusted standard and playbook paths already exist in the tables.

## 7. Commit

```
180c0f91 tripletex playbook: register-supplier-invoice — add 8th production confirmation (aa847819, Norwegian prompt, Tindra AS / 983514650 / INV-2026-3624 / 42100 / 6540 / 25%, 5 calls 0 errors), first production use of account 6540 (Inventar), confirm standard works across all expense accounts (6300, 6340, 6500, 6540, 7000); sandbox re-proof with 6540 confirmed 5-call path remains optimal minimum
```

## 8. Reusable Heuristics

1. **5 calls is the proven minimum** for fresh-account-like supplier invoices with 25% VAT: POST supplier → GET account → POST importDocument → PUT sendToLedger=false → PUT sendToLedger=true. No further call reduction is possible.

2. **Account 6540 works identically to all other expense accounts** (6300, 6340, 6500, 7000). The standard is fully account-agnostic for any `isApplicableForSupplierInvoice=true` account.

3. **Account names vary per instance.** Account 6540 is "Inventar" in sandbox but the task description says "kontortjenester." Never assume account names match task descriptions — always resolve by number.

4. **Text-only prompts (no PDF) need no address or bank data** in the POST /supplier call. The supplier create is minimal: just `name` and `organizationNumber`. This still produces a correct scored result.

5. **Exact casing matters.** The prompt said "kontortjenester" (lowercase), and the script preserved it exactly. Prior runs lost points for capitalizing descriptions (e.g., "Kontortjenester" instead of "kontortjenester").

6. **The trusted standard is mature and battle-tested.** After 8 consecutive optimal 5-call runs across 5 different expense accounts, 5 languages, and both text-only and PDF prompts, the standard reliably produces perfect results with no wasted calls.
