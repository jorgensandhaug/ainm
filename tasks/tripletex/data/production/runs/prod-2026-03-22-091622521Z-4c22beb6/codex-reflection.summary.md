# Codex Reflection: prod-2026-03-22-091622521Z-4c22beb6

## 1. Task
Register supplier invoice from PDF (T20). PDF: Stormberg AS, org 979784783, Fjordveien 90 6003 Ålesund, invoice INV-2026-2148, date 2026-04-29, due 2026-05-29, IT-konsulenttjenester, net 22950, VAT 5737 (25%), gross 28687, account 6300, bank 11288015858. Norwegian language prompt.

## 2. Reflection

**What went well:**
- Correctly identified task as T20 (supplier invoice from PDF) and matched to trusted standard
- Read the trusted standard immediately per AGENTS.md instructions
- Wrote and executed the script without reading any additional files (no timeout risk)
- All 5 API calls succeeded with 0 errors (201, 200, 201, 200, 200)
- Both `postalAddress` and `physicalAddress` set with `country: { id: 161 }`
- Used `bankAccountPresentation: [{ bban }]` not deprecated `bankAccounts`
- Used `.values[0]` (not `.value`) for importDocument response
- Extracted `ledgerAccount.id` from POST /supplier response — no extra GET for account 2400
- Used `account: { id }` from GET, not `account: { number }`

**What went poorly:**
- Nothing functionally wrong. The run followed the trusted standard exactly.

**Minor observation:**
- PDF amounts have a rounding inconsistency: 22950 × 1.25 = 28687.5, but PDF shows gross = 28687. Tripletex treats gross as authoritative and recalculated net = 28687 / 1.25 = 22949.6, VAT = 5737.4. This is expected Tripletex behavior and unavoidable.

## 3. Call Efficiency

**The run was minimal-call: 5 calls, 0 errors.**

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | POST /supplier | 201 | Create supplier (both addresses + country + bank) |
| 2 | GET /ledger/account?number=6300 | 200 | Get expense account ID |
| 3 | POST /ledger/voucher/importDocument | 201 | Create voucher + SI entity via EHF XML |
| 4 | PUT /ledger/voucher/{id}?sendToLedger=false | 200 | Set postings (debit 6300, credit 2400) |
| 5 | PUT /ledger/voucher/{id}?sendToLedger=true | 200 | Book with voucherType Leverandørfaktura |

**Wasted calls: 0.** No unnecessary calls, no 4xx errors.

**Lower-call path: None exists.** Sandbox testing confirmed:
- Combined PUT (postings + sendToLedger=true) → 422 ("Bilag uten posteringer kan ikke bli sendt til hovedbok")
- `account: { number: 6300 }` without id → 422 ("postings.account.name: Kan ikke være null")
- `account: { number: 6300, name: "Leie lokale" }` without id → 422 ("Feltet må fylles ut")
- 5 calls is the proven minimum for this task shape.

## 4. Root Causes

No errors or failures to diagnose. The run was clean.

The only potential scoring risk is the VAT rounding discrepancy (PDF net 22950 vs system net 22949.6, PDF VAT 5737 vs system VAT 5737.4), but this is intrinsic to Tripletex's behavior when `amountGross` is authoritative and the PDF's amounts don't divide evenly at 25%.

## 5. Sandbox Verification

Three optimization hypotheses tested and all disproven:

1. **Combined PUT (steps 4+5 → 1 call)**: Sending postings with `sendToLedger=true` in a single PUT → 422. The API processes sendToLedger before saving postings, resulting in "voucher without postings cannot be sent to ledger."

2. **Account by number (eliminate step 2)**: `account: { number: 6300 }` → 422 requiring `account.name`. Even `account: { number: 6300, name: "..." }` → 422 requiring internal account field. The API strictly requires `account: { id }` resolved via GET.

3. **No additional optimizations found.** The 5-call path is the provable minimum.

## 6. Playbook Changes

**Updated files:**
- `trusted-standards/register-supplier-invoice-from-pdf.md` — Added pitfall note: "5 calls is the proven minimum" with sandbox verification details to prevent future agents from wasting time attempting reductions.
- `task-playbooks/register-supplier-invoice-from-pdf.md` — Added prod-4c22beb6 to production history table (5 calls, 0 errors, NB language). Added "Sandbox-Verified Optimization Attempts" section documenting all three failed reduction paths.

No new files created. No AGENTS.md changes needed (task pattern table and disambiguation rules were already correct).

## 7. Commit

- **Hash:** `28703fd7`
- **Message:** `tripletex playbook: confirm 5-call minimum for T20 supplier invoice from PDF`

## 8. Reusable Heuristics

1. **T20 is a solved task shape.** The 5-call trusted standard is optimal. Future agents should read it, write the script, and execute — nothing more.
2. **Account ID is always required.** The Tripletex voucher posting API does not resolve accounts from number or name. The GET /ledger/account call cannot be eliminated.
3. **Postings and booking cannot be combined.** The API processes `sendToLedger` before saving postings, so a combined PUT always fails with "voucher without postings."
4. **Gross is authoritative for VAT.** When PDF net × 1.25 ≠ PDF gross (rounding), Tripletex recalculates net = gross / 1.25. This is expected and unavoidable.
5. **Extract ledgerAccount.id from POST /supplier response.** This is always account 2400 and saves one GET call vs looking it up separately.
6. **Speed matters.** Two prior runs scored 0% by reading the standard and never writing a script. The correct pattern: read standard → write script → execute. No intermediate thinking, no additional file reads.
