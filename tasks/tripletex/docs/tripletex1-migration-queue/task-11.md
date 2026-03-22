# Task 11 — Register Supplier Invoice (Text-Only)

**Status: `review-ready`**

## Snapshot
- Tripletex1 current best score: 1/4 (2/4 checks passed, per T2 RESEARCH.md)
- Priority: high — score gap = 3 points
- Target Tripletex1 surface: `trusted-standards/register-supplier-invoice.md`, `task-playbooks/register-supplier-invoice.md`, `AGENTS.md`
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-16/RESEARCH.md`
  - `tasks/tripletex2/src/tasks/task-16/README.md`
  - `tasks/tripletex2/src/tasks/task-16/task.ts`
  - `tasks/tripletex2/src/tasks/task-16/strategies/import-and-book-voucher-v2.ts`

## Task Identity Mapping

Tripletex2 task-16 maps to tx_task_id 11 (confirmed via `task.ts`: `REGISTER_SUPPLIER_INVOICE_TX_TASK_ID = "11"`). The T2 RESEARCH.md documents a 5-task circular shift in leaderboard numbering that previously caused confusion — this mapping is now corrected.

Note: AGENTS.md line 147 references "T11" in the supplier-invoice context — this aligns with the corrected mapping.

## Current Tripletex1 Coverage

The T1 surfaces for this task are **remarkably comprehensive**:

### Trusted standard (`register-supplier-invoice.md`) already covers:
- Full importDocument path (8-call flow: POST supplier → GET account → POST importDocument → GET supplierInvoice → PUT postings → PUT book → GET voucher → GET supplier)
- Two-step booking (PUT sendToLedger=false + PUT sendToLedger=true) — reason and 422 error documented
- EHF/UBL XML structure with all required elements
- `cac:PaymentMeans` with `PaymentID` for `kidOrReceiverReference` — sandbox-verified
- Supplier creation with `postalAddress`, `physicalAddress`, `bankAccountPresentation`
- `vatType.id=1` hardcode for 25% incoming VAT
- Non-idempotency of importDocument and duplicate SI entity risk
- Response shape pitfall (`.values` vs `.value`)
- Account 2400 optimization (from `POST /supplier` response `ledgerAccount.id`)
- Posting rules with exact amounts and field layout
- `voucherType: { name: "Leverandørfaktura" }` in booking step
- Verification GETs (supplierInvoice, voucher, supplier)
- Production history (0b6fe5b8 scored 1/8, d49da665 scored 0/8 from crash+duplicate)

### Playbook (`register-supplier-invoice.md`) already covers:
- Same 8-step flow with exact payload shapes
- XML template requirements
- All known pitfalls mirrored from trusted standard

### AGENTS.md already covers:
- importDocument mandate (direct POST /ledger/voucher = 0/8)
- T11 vs T20 disambiguation
- 4 writes + 4 GETs structure

### Assessment: T1 is MORE comprehensive than T2 on this task

T2's v2 strategy is actually *missing* several things T1 already has:
- No `cac:PaymentMeans` in the EHF XML template (T1 includes it — critical for `kidOrReceiverReference`)
- No supplier address/bank data in `POST /supplier` body (T1 includes `postalAddress`, `physicalAddress`, `bankAccountPresentation`)
- No `voucherType` in the booking PUT body (T1 includes `{ name: "Leverandørfaktura" }`)
- No verification GETs after writes (T1 includes 3 verification reads)

## Candidate Imports from Tripletex2

### Import 1: Duplicate-supplier error recovery pattern (409/422)
- **Insight:** T2's v2 strategy has explicit programmatic handling for duplicate-supplier creation errors — detects HTTP 409 or 422 with message containing "already exists" / "finnes allerede" / "duplicate", then falls back to `GET /supplier?organizationNumber=...` to resolve the existing supplier.
- **Why it seems new:** T1's trusted standard mentions the "explicit-existing-supplier" lookup-first path and the "fresh-account-like" create-first path, but does NOT specifically document the 409/422 error codes or the automatic recovery pattern from a failed POST /supplier.
- **Evidence:** `tasks/tripletex2/src/tasks/task-16/strategies/import-and-book-voucher-v2.ts` lines 279-307 — `createSupplierWithRecovery()` catches duplicate errors and falls back to lookup.
- **Confidence:** Medium. This is a defensive pattern, not a scoring-critical fix. Fresh production accounts typically have no existing suppliers, so this rarely triggers. But it prevents crashes in retry/persistent-account scenarios.

### Import 2: Score gap analysis context
- **Insight:** T2 RESEARCH.md provides the clearest analysis of the scoring gap:
  - Best score: 1/4 (raw 2/4 checks passed) — the 0b6fe5b8 run (importDocument, NOT booked)
  - Hypothesis: the booking step (sendToLedger=true) should unlock 1 more check (3/4)
  - Cross-task evidence from T20 (PDF variant): 8/10 with sendToLedger=true vs 7/10 without — the extra check is likely "voucher is booked"
  - Remaining 1/4 gap: likely the immutable voucher description ("Faktura nummer {ID} fra {Name}") fails a check
- **Why it seems new:** T1's trusted standard already has the booking step and mentions "adding booking step should unlock 1 more check", but the specific cross-task evidence from T20 (8/10 vs 7/10) and the analysis of the immutable description as the likely remaining blocker are not in T1.
- **Evidence:** `tasks/tripletex2/src/tasks/task-16/RESEARCH.md` lines 46-56.
- **Confidence:** Medium-high for the booking hypothesis (supported by cross-task evidence). Low-medium for the immutable description as the remaining blocker (speculative).

### Import 3: T2 v2 strategy gaps as negative evidence
- **Insight:** T2's v2 strategy is BEHIND T1's trusted standard in three specific ways. This is worth noting in T1 as validation that its current guidance should NOT be simplified:
  1. T2 v2 omits `PaymentMeans` from XML — T1 already includes it (line 89-90 of trusted standard). This omission would leave `kidOrReceiverReference` empty on the SI entity.
  2. T2 v2 omits supplier address/bank from POST /supplier — T1 already includes them. These fields are scored and cost 0 extra calls.
  3. T2 v2 omits `voucherType` from booking PUT — T1 already includes `{ name: "Leverandørfaktura" }`.
- **Why it seems new:** This isn't new guidance per se, but it validates that T1's existing guidance is correct and should be preserved as-is.
- **Evidence:** `tasks/tripletex2/src/tasks/task-16/strategies/import-and-book-voucher-v2.ts` — compare XML template (lines 511-624, no PaymentMeans), supplier creation (lines 285-292, only name + org), booking (lines 227-237, only version).
- **Confidence:** High that T1's approach is correct. The omissions in T2 are likely contributing to its low score.

## Proposed Markdown Deltas

### Trusted standard
- **Target file:** `trusted-standards/register-supplier-invoice.md`
- **Proposed addition:** In the "Known Recovery Branches" section, add a note about 409/422 duplicate-supplier error detection: "If `POST /supplier` fails with HTTP 409 or 422 containing 'already exists' / 'finnes allerede', fall back to `GET /supplier?organizationNumber=...&fields=*` and resolve the existing supplier; do not retry the POST."
- **Reason:** Defensive robustness. The current guidance covers the lookup-first vs create-first decision but not the automatic recovery from an unexpected duplicate.

### AGENTS.md
- No changes proposed. The existing T11 guidance is correct and comprehensive.

### Playbook
- **Target file:** `task-playbooks/register-supplier-invoice.md`
- **Proposed addition:** Same duplicate-supplier recovery note as trusted standard.
- **Reason:** Consistency with trusted standard.

## Risks / Caveats

- **Mapping ambiguity:** None — `REGISTER_SUPPLIER_INVOICE_TX_TASK_ID = "11"` is explicit in T2's `task.ts`.
- **Conflicting evidence:** T2's v2 strategy is less complete than T1's trusted standard. The T2 strategy has NOT been updated to include PaymentMeans, supplier address, or voucherType — so any T2 production scores may underperform T1's potential.
- **Not safe to port yet:** The import 1 (duplicate-supplier recovery) is safe to port. The import 2 (score analysis) is informational context, not actionable guidance.
- **Critical preservation note:** T1's trusted standard is the stronger artifact here. Any import from T2 should ADD to T1, not replace existing guidance.

## Recommendation

- **Adopt now:** Import 1 (duplicate-supplier 409/422 recovery pattern) — small, safe, defensive addition.
- **Hold:** Import 2 (score analysis context) — useful as background knowledge but not directly actionable as markdown guidance. The booking step is already in T1's flow.
- **No action needed:** Import 3 — T1 is already correct; this validates the status quo.

**Overall: T1 is ahead of T2 on this task.** The main value of this review is confirming that the existing T1 guidance is correct and should not be simplified or weakened. The only net-new import is the duplicate-supplier error recovery pattern, which is a minor robustness improvement.
