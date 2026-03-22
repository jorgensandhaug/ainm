# Task 20 — Register Supplier Invoice from PDF

Status: `review-ready`

## Snapshot
- Tripletex1 current best score: 8/10 (Check 5 always fails; two runs scored 0/10 from timeout)
- Priority: high — Check 5 is the only remaining blocker to 10/10
- Target Tripletex1 surface: `AGENTS.md` (lines 149, 496), `trusted-standards/register-supplier-invoice-from-pdf.md` (minor)
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-20/RESEARCH.md` (deep check analysis with 6-run evidence base)
  - `tasks/tripletex2/src/tasks/task-20/strategies/register-supplier-invoice-pdf-v2.ts` (v2 strategy with booking step)
  - `tasks/tripletex2/src/tasks/task-20/strategies/register-supplier-invoice-pdf.ts` (v1 strategy)
  - `tasks/tripletex2/src/tasks/task-20/task.ts` (task definition and input schema)
  - `tasks/tripletex2/research/packets/task-20/task-20-packet-2026-03-22T02-50-35-950Z.json` (research packet)

## Current Tripletex1 coverage

### What the trusted standard already gets right
The trusted standard (`register-supplier-invoice-from-pdf.md`) is the strongest surface. It already contains:
- Full 6-write flow: POST supplier → GET account → POST importDocument → POST attachment → PUT postings → PUT book
- PaymentMeans requirement in EHF XML with full template (sandbox-verified 2026-03-22)
- PDF attachment upload via `POST /ledger/voucher/{voucherId}/attachment`
- Both `postalAddress` AND `physicalAddress` with `country: { id: 161 }`
- `bankAccountPresentation` instead of deprecated `bankAccounts`
- `.values[0]` vs `.value` response shape
- `importDocument` non-idempotency warning
- Verification GETs (free, do not count against score)
- Full production run history with 11 runs

### What the playbook already gets right
The playbook (`register-supplier-invoice-from-pdf.md`) correctly mirrors the trusted standard's flow, critical rules, and production history.

### Important gaps and stale guidance in AGENTS.md

**1. T20 flow is missing the PDF attachment step (line 149)**

AGENTS.md line 149:
```
T20 flow: POST supplier (with physicalAddress+postalAddress) → GET account → POST importDocument
→ GET supplierInvoice (verify) → PUT postings → PUT book → GET voucher (verify) → GET supplier (verify).
4 writes + 4 GETs.
```

This lists 4 writes but omits the PDF attachment upload (`POST /ledger/voucher/{id}/attachment`). The trusted standard and playbook both include it as a required step. The correct count is **5 writes + 3-4 GETs** (or 6 writes if vatType GET is needed for non-25%).

**2. AGENTS.md incorrectly attributes Check 5 failure to `physicalAddress` (line 496)**

AGENTS.md line 496:
```
EXCEPTION: for supplier-invoice tasks with a PDF attachment, ALWAYS set BOTH postalAddress AND
physicalAddress to the same address from the PDF — omitting physicalAddress causes Check 5 to fail
(confirmed across all 9 production runs for task 20).
```

This claim is **provably wrong** based on Tripletex1's own production run data. Playbook runs `7c4183ab` and `4c22beb6` both have "Both addresses+country+booking" and STILL fail Check 5. Setting physicalAddress is necessary for correctness but is NOT what Check 5 checks.

**3. Trusted standard attributes Check 5 to PaymentMeans — plausible but unproven**

The trusted standard says: "PaymentMeans is REQUIRED in the EHF XML — without it, `kidOrReceiverReference` stays empty and Check 5 fails."

This is plausible but not proven. All runs that fail Check 5 are missing BOTH PaymentMeans AND PDF attachment. No production run has ever tested one without the other, so the two causes are confounded.

## Candidate imports from Tripletex2

### Import 1 — Check 5 is most likely PDF attachment, not physicalAddress
- Insight: Tripletex2 RESEARCH.md identifies Check 5 as "PDF attachment present on voucher" with HIGH confidence. Their reasoning: (a) Check 5 fails in ALL 6 analyzed runs, (b) none of those runs upload the PDF attachment, (c) task 20 is specifically "Register supplier invoice **with PDF attachment**" — the PDF is the unique differentiator from task 11, (d) all runs have correct supplier data including correct addresses, amounts, VAT, and expense account.
- Why it seems new: Tripletex1's AGENTS.md wrongly blames physicalAddress (disproven by runs 7c4183ab/4c22beb6). The trusted standard blames PaymentMeans/kidOrReceiverReference. T2 provides a third, more compelling hypothesis based on task identity logic.
- Evidence: `tasks/tripletex2/src/tasks/task-20/RESEARCH.md` — "Check 5 Identity: PDF Attachment on Voucher" section. Cross-validated with Tripletex1's own playbook data: runs 7c4183ab and 4c22beb6 have physicalAddress but still fail Check 5, eliminating physicalAddress as the cause.
- Confidence: **MEDIUM-HIGH** — The T2 hypothesis is the strongest of the three, but remains unproven in isolation because no production run has tested PaymentMeans-present + PDF-absent or vice versa. Since the trusted standard already applies both fixes, the practical impact is correct even if the labeling is wrong. The first production run with both PaymentMeans and PDF attachment will settle this.

### Import 2 — Check-by-check scoring breakdown with approximate weights
- Insight: T2 RESEARCH.md provides a systematic 6-check map:

| Check | Points | What it checks | Status |
|-------|--------|---------------|--------|
| 1 | ~2 | Supplier exists with correct identity | PASS |
| 2 | ~1 | Voucher/invoice created with correct amounts | PASS |
| 3 | ~1 | Correct expense account used | PASS |
| 4 | ~2 | Correct VAT type/amount | PASS |
| 5 | **~2** | **PDF attachment on voucher** (T2 hypothesis) | ALWAYS FAIL |
| 6 | ~2 | Voucher is booked (number > 0) | PASS (since booking step added) |

  Scoring math: Check 5 costs 2 points (10-8=2), Check 6 costs ~1 point from 7→8 transition in different run pairs.

- Why it seems new: Neither the trusted standard nor the playbook contain a per-check breakdown. The playbook lists which checks failed per run but doesn't map check numbers to meanings or weights.
- Evidence: `tasks/tripletex2/src/tasks/task-20/RESEARCH.md` — "Check Analysis" and "Likely Check Map" sections, derived from 6 production runs.
- Confidence: **MEDIUM** — Point weights are approximate (inferred from score transitions, not from scorer source code). Check meanings for 1-4 are inferred from passing runs. Check 5 identity is debated (see Import 1). Check 6 identity is HIGH confidence (7→8 transition exactly corresponds to adding booking step).

### Import 3 — Attachment ordering is flexible (before or after booking)
- Insight: Sandbox-verified (2026-03-22) that PDF attachment upload works both before and after booking. Attachment upload does NOT change the voucher version, so the booking step can use the version from the postings PUT regardless of attachment ordering.
- Why it seems new: The trusted standard shows attachment as step 4 (between importDocument and postings), but doesn't state whether attachment after booking also works. Knowing both orderings work gives the production agent flexibility and reduces risk of version conflicts.
- Evidence: `tasks/tripletex2/src/tasks/task-20/RESEARCH.md` — "Ordering: Attachment vs Booking" section. Both orderings verified in sandbox with all 201/200 responses.
- Confidence: **HIGH** — Sandbox-verified by T2 on 2026-03-22 with explicit tests of both orderings.

### Import 4 — Country auto-population on supplier
- Insight: `POST /supplier` with `postalAddress: { addressLine1, postalCode, city }` (NO country) auto-populates `country: { id: 161 }` (Norway). Including it explicitly is correct and safer, but not strictly required. String format `country: "NO"` fails with "Request mapping failed" — country MUST be `{ id: number }`.
- Why it seems new: The trusted standard mandates country without mentioning auto-population. Not a change recommendation, but useful context for debugging address-related failures.
- Evidence: `tasks/tripletex2/src/tasks/task-20/RESEARCH.md` — "Country Field Test" section with three sandbox test cases.
- Confidence: **HIGH** — Sandbox-verified by T2 on 2026-03-22.

## Proposed markdown deltas

### AGENTS.md

#### Delta 1: Fix T20 flow to include attachment step
- Line 149 currently: `T20 flow: POST supplier (with physicalAddress+postalAddress) → GET account → POST importDocument → GET supplierInvoice (verify) → PUT postings → PUT book → GET voucher (verify) → GET supplier (verify). 4 writes + 4 GETs.`
- Proposed replacement: `T20 flow: POST supplier (with physicalAddress+postalAddress+bankAccountPresentation) → GET account → POST importDocument (with PaymentMeans in XML) → PUT postings → PUT book → POST /ledger/voucher/{id}/attachment (PDF) → GET supplierInvoice (verify) → GET voucher (verify) → GET supplier (verify). 5 writes + 3 GETs.`
- Reason: The current flow omits the PDF attachment upload, which is the defining differentiator of T20 vs T11 and is the most likely Check 5 target. The trusted standard and playbook both include it. Also adds `bankAccountPresentation` and PaymentMeans callouts for consistency.

#### Delta 2: Correct Check 5 attribution
- Line 496 currently: `omitting physicalAddress causes Check 5 to fail (confirmed across all 9 production runs for task 20)`
- Proposed replacement: `for T20 (PDF supplier invoice), ALWAYS set BOTH postalAddress AND physicalAddress to the same address from the PDF, AND upload the original PDF via POST /ledger/voucher/{id}/attachment. Check 5 most likely checks for the PDF attachment (the task's unique differentiator from T11), not physicalAddress — production runs 7c4183ab and 4c22beb6 have both addresses but still fail Check 5 because neither uploads the PDF.`
- Reason: The physicalAddress attribution is disproven by Tripletex1's own production data. The fix is to correct the causal claim while preserving the physicalAddress instruction (it's still needed for other scoring reasons).

### Trusted standard
- Target file: `trusted-standards/register-supplier-invoice-from-pdf.md`
- Proposed addition: Add a brief note in the "Sandbox-Verified Fixes" section acknowledging that Check 5 may check PDF attachment presence rather than (or in addition to) PaymentMeans/kidOrReceiverReference. Both fixes are already in the standard, so this is a labeling clarification, not a flow change.
- Reason: The trusted standard says "Check 5 has NEVER passed across 11 T20 production runs that omitted [PaymentMeans]" — but those same runs also omitted the PDF attachment. Noting the confound prevents future misdiagnosis if one fix is accidentally dropped.

### Playbook
- Target file: `task-playbooks/register-supplier-invoice-from-pdf.md`
- Proposed addition: No structural changes needed. Optionally add the check map from Import 2 for reference.
- Reason: The playbook's flow and critical rules are already correct and complete.

## Risks / caveats

- **Check 5 identity is still unproven in isolation**: PaymentMeans and PDF attachment are confounded across all production runs. The first run with the current trusted standard (which has both) will implicitly test the combined fix but won't isolate which fix unlocks Check 5. To isolate: run once with PaymentMeans but no PDF attachment, or vice versa. This is low priority because the standard already applies both.
- **T2 strategies lag behind T1 standards**: The Tripletex2 v2 strategy (`register-supplier-invoice-pdf-v2.ts`) still omits PaymentMeans from the XML and supplier address/bank fields from POST /supplier. These are gaps in T2, not T1, but they mean T2's normalized score (2.4/6) doesn't reflect the full potential of the insights already documented in T1's trusted standard.
- **No mapping ambiguity**: Task identity is clear. Tripletex1 task "Register supplier invoice from PDF" = Tripletex2 task 20 = `tx_task_id 20`. Both systems agree on the flow shape and the importDocument-based approach.
- **Check weight approximations**: The check map point values are inferred from score transitions across different runs, not from scorer source. Actual weights may differ.

## Recommendation
- **Adopt now** for Delta 1 (AGENTS.md T20 flow fix) and Delta 2 (Check 5 attribution correction) — both are backed by Tripletex1's own production data and correct provably wrong guidance.
- **Hold** for the check map (Import 2) — useful context but approximate; consider adding to the playbook as a reference section after the first 10/10 production run confirms the overall fix package.
- The attachment ordering insight (Import 3) and country auto-population (Import 4) are informational — no action needed since the standard already works with its current ordering and explicit country.
