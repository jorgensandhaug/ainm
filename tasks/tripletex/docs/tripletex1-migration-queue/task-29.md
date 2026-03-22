# Task 29 — Full Project Lifecycle (Budget, Hours, Cost, Invoice)

**Status: review-ready**

## Snapshot
- Tripletex1 current best score: 4/11 (checks 1,2,6 pass; checks 3,4,5,7 fail in all runs)
- Priority: 4 (focus band)
- Target Tripletex1 surface: `trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`, `task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md`, `AGENTS.md`
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-29/RESEARCH.md`
  - `tasks/tripletex2/src/tasks/task-29/strategies/full-project-lifecycle.ts` (v1)
  - `tasks/tripletex2/src/tasks/task-29/strategies/full-project-lifecycle-v2.ts` (v2)
  - `tasks/tripletex2/src/tasks/task-29/task.ts`
  - `tasks/tripletex2/research/packets/task-29/task-29-packet-2026-03-22T02-11-59-946Z.json`
  - `tasks/tripletex2/research/proofs/task-29/task-29-proof-input-fresh.json`

## Current Tripletex1 coverage

Tripletex1 has strong, detailed coverage of task 29 across three surfaces:

**Trusted standard** — contains a complete copy-paste script template covering all 7 steps (frontloaded reads, employees + project, activity + participants, timesheet + supplier + orderline, supplier cost voucher, order creation, order → invoice conversion). Includes diagnostic readback section, recovery section, and explicit "Do NOT" list.

**Playbook** — documents root causes of failure, the 4/11 best score, the 17+ production runs, the wrong invoice flow trap (`POST /invoice` → isApproved=false), and lists all known 422 causes.

**AGENTS.md** — has detailed inline guidance at ~lines 312-316 and 327-330 covering:
- `userType: "NO_ACCESS"` on employees, no `employments[]`
- PM assignability constraint (newly created employees not assignable)
- 13-call optimal path (6 sequential steps)
- `isFixedPrice+fixedprice`, `budgetHours`, `POST /project/orderline`, `adminAccess` as 4 mandatory fields
- Project must be on order root, not inside `orderLines[]`
- Batch operations for employees and participants

**Important gaps / contradictions:**
1. AGENTS.md line 314 states **"No voucher needed (not scored)"**, but AGENTS.md line 329 states **"For the full lifecycle task, BOTH orderline AND voucher are needed (orderline for costs, voucher for accounting)."** The trusted standard and playbook both treat the voucher as critical (check 6, worth 2 points). Line 314 is stale/wrong.
2. The playbook's "Checks 3,4,5,7 — still unsolved" section lists vague hypotheses but lacks the structured root-cause analysis that Tripletex2 has now completed via sandbox verification.

## Candidate imports from Tripletex2

### Import 1: Resolve the voucher contradiction in AGENTS.md
- **Insight:** AGENTS.md line 314 says "No voucher needed (not scored)" while line 329 says "BOTH orderline AND voucher are needed." Line 314 is stale — the voucher IS scored (check 6, worth 2 points) per the trusted standard and playbook. Without the voucher, score drops from 4/11 to 2/11.
- **Why it seems new:** This is an internal contradiction within T1, not new T2 knowledge. However, T2's production evidence (4 runs scoring 2/11 without voucher vs T1's 4/11 with voucher) confirms the voucher is the difference between 2/11 and 4/11.
- **Evidence:** T1 trusted standard (lines 175-209, voucher as Step 5); T1 playbook (section 1, "Missing supplier cost voucher, check 6, worth 2 points"); T2 RESEARCH.md (score 0.5455 = 2/11 for v1 without voucher). AGENTS.md line 329 explicitly says both are needed.
- **Confidence:** High — the contradiction is plainly visible. Line 314 should be updated to include the voucher.

### Import 2: Sandbox-verified root causes for checks 3-7
- **Insight:** Tripletex2 sandbox verification (2026-03-22) has pinpointed specific root causes for the 5 failing checks:
  1. **PM identity (likely check 3/4):** `NO_ACCESS` employees rejected as project manager with 422. `STANDARD` userType also rejected. Only the pre-existing company admin is assignable. This is a hard API constraint, not a UI convenience — the `assignableProjectManagers` filter reflects server-side enforcement.
  2. **Supplier invoice record (likely check 5/7):** `POST /ledger/voucher` does NOT create a `supplierInvoice` record. `GET /supplierInvoice` returns 0 results after voucher creation. Formal supplier invoices are only created through the XML import path (`POST /ledger/voucher/importDocument`).
  3. **Vendor on orderline (likely check 5):** `POST /project/orderline` with `vendor: { id }` returns 201 success BUT `vendor` reads back as `null`. The API accepts but does NOT persist the vendor field. Confirmed API limitation.
- **Why it seems new:** T1's playbook only says "Checks 3,4,5,7 — still unsolved" with vague hypotheses. T2 has confirmed these as structural API limitations via sandbox testing, which changes the guidance from "unsolved" to "structurally impossible with current approach."
- **Evidence:** `tasks/tripletex2/src/tasks/task-29/RESEARCH.md`, section "Sandbox Verification Results (2026-03-22)" — three distinct sandbox test results with specific error messages and readback verification.
- **Confidence:** High for the PM constraint (422 error message reproduced). High for vendor non-persistence (201 success but null readback). High for voucher-not-creating-supplier-invoice (GET /supplierInvoice returns 0).

### Import 3: XML import hypothesis for supplier invoice (untested)
- **Insight:** T2 identifies a specific hypothesis for potentially unlocking checks 5/7: use `POST /ledger/voucher/importDocument` with a minimal EHF/UBL XML invoice (similar to task-16's approach) to create a formal supplier invoice record, then `PUT /ledger/voucher/{id}` to set accounting postings with project linkage. This would cost ~2 extra calls but might create the supplier invoice record the evaluator checks.
- **Why it seems new:** T1 mentions importDocument tangentially in the playbook's hypothesis section but doesn't formulate it as a concrete, actionable next step with a call budget estimate.
- **Evidence:** T2 RESEARCH.md "Next Hypotheses" section, Hypothesis A. Cross-referenced with task-16 which already uses the importDocument path for supplier invoice registration. NOT sandbox-verified for task 29 specifically.
- **Confidence:** Medium — the hypothesis is well-reasoned and task-16 proves the XML import path works, but it has not been tested for task 29's specific requirements. Marked as "needs verification."

### Import 4: v2 strategy uses POST /invoice with inline orders for projectInvoiceDetails
- **Insight:** T2's v2 strategy uses `POST /invoice?sendToCustomer=false` with embedded `orders[]` (instead of `POST /order` → `PUT /order/:invoice`). The sandbox verification confirms this produces `projectInvoiceDetails` on the resulting invoice, which may be what check 7 evaluates.
- **Why it seems new:** T1 explicitly warns AGAINST `POST /invoice` because it produces `isApproved: false` and order `status: NOT_CHOSEN`. T2's v2 deliberately uses this path anyway to get `projectInvoiceDetails`.
- **Evidence:** T2 v2 strategy (lines 473-505); T2 RESEARCH.md enhanced v2 sandbox verification: "Invoice: amountExcludingVatCurrency: 250000, projectInvoiceDetails present ✓". However, v2 has NOT been production-tested — promotion was intentionally deferred.
- **Confidence:** Low-medium — sandbox-verified but DIRECTLY CONTRADICTS T1's production-proven guidance. The `isApproved=false` / `status=NOT_CHOSEN` problem identified by T1 may cause check failures that offset the `projectInvoiceDetails` gain. **Do not adopt without production confirmation.**

## Proposed markdown deltas

### AGENTS.md
- **Proposed change:** Update line 314 to remove "No voucher needed (not scored)" and replace with guidance that BOTH orderline AND voucher are needed (consistent with line 329 and the trusted standard). Suggested wording: "See the trusted standard for the 5 mandatory elements (isFixedPrice+fixedprice, budgetHours, POST /project/orderline, adminAccess, POST /ledger/voucher for check 6) and the CRITICAL invoice flow (POST /order → PUT /order/:invoice, NOT POST /invoice)."
- **Reason:** The current "No voucher needed" is factually wrong per T1's own trusted standard and playbook. The voucher is worth 2 raw points (the difference between 2/11 and 4/11).

### Trusted standard
- **Target file:** `trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`
- **Proposed addition:** Add a new section "## Structural Ceiling (Checks 3-7)" below the existing "Do NOT" section that documents the sandbox-verified root causes:
  ```
  ## Structural Ceiling (Checks 3-7)

  Checks 3-7 fail in ALL production runs (17+). Sandbox verification (2026-03-22)
  confirmed these are structural API limitations, not script bugs:

  1. PM identity: Only the pre-existing company admin is assignable as projectManager.
     NO_ACCESS and STANDARD userType employees are both rejected with 422. The
     assignableProjectManagers filter reflects server-side enforcement.

  2. Supplier invoice record: POST /ledger/voucher creates voucher/posting records
     only — it does NOT create a supplierInvoice entity. If the evaluator checks for
     a formal supplier invoice, this requires POST /ledger/voucher/importDocument
     with XML (like task-16). Not yet tested for this task.

  3. Vendor linkage on project orderline: POST /project/orderline accepts vendor but
     reads back as null. Confirmed API limitation — not a payload bug.
  ```
- **Reason:** Changes the guidance from "still unsolved" to "structurally impossible with current approach" with specific evidence. Prevents future debugging effort on dead-end paths.

### Playbook
- **Target file:** `task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md`
- **Proposed change:** Replace the "### 3. Checks 3,4,5,7 — still unsolved" section with structured root causes from T2's sandbox verification. Add the XML import hypothesis as a concrete next step.
- **Reason:** T1's current playbook says "still unsolved" with vague hypotheses. T2 has now confirmed the specific blockers via sandbox testing.

## Risks / caveats

- **Mapping ambiguity:** None — both systems use `tx_task_id: 29` and the task scope (customer + 2 employees + project + budget + hours + supplier cost + invoice) is identical.
- **Conflicting evidence (Import 4):** T2's v2 POST /invoice path directly contradicts T1's production-verified guidance. T1 proved POST /invoice → isApproved=false (bad). T2 claims it produces projectInvoiceDetails (good). These may both be true — the question is which matters more to the scorer. v2 has NOT been production-tested; promotion was explicitly deferred in T2. **Do not adopt the v2 invoice path without production confirmation.**
- **Weak evidence (Import 3):** The XML import hypothesis is logical but untested for task 29. Task-16 proves importDocument works for supplier invoices generally, but the specific project-linkage requirements for task 29 have not been verified.
- **Internal T1 contradiction (Import 1):** The voucher contradiction in AGENTS.md is a documentation bug, not a strategy question. Safe to fix immediately — the trusted standard and playbook already include the voucher as critical.

## Recommendation
- **Import 1 (AGENTS.md voucher fix):** Adopt now — this is a documentation bug, not a judgment call. The evidence is unanimous across 3 T1 surfaces.
- **Import 2 (Root cause analysis):** Adopt now — adds factual, sandbox-verified findings that prevent wasted debugging effort. Does not change any runtime behavior.
- **Import 3 (XML import hypothesis):** Hold — needs sandbox verification for task 29 specifically before adding to the trusted standard.
- **Import 4 (POST /invoice path):** Hold — contradicts production-proven T1 guidance. Needs production run results from T2's v2 before considering.
