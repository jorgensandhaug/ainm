# Task 17 — Register Customer Invoice Payment

Status: `review-ready`

## Snapshot
- Tripletex1 current best score: **2.0 / 2.0 (100% max)** under contest tx_task_id 07 (see mapping mismatch below)
- Priority: **LOW** — correctness already perfect; no live Tripletex1 guidance change can improve score
- Target Tripletex1 surface: `trusted-standards/register-customer-invoice-payment.md`, `task-playbooks/register-customer-invoice-payment.md`, possibly `AGENTS.md` score-analysis references
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-17/task.ts` (task spec + input schema)
  - `tasks/tripletex2/src/tasks/task-17/RESEARCH.md` (research memory)
  - `tasks/tripletex2/src/tasks/task-17/strategies/register-payment.ts` (active strategy `17.register-payment.v1`)
  - `tasks/tripletex2/research/task-queue.json` (lines 74-91, queue entry)
  - `tasks/tripletex2/research/verifications/task-17/verify-17-17.register-payment.v1-2026-03-22T02-22-26-228Z.json` (verification report)
  - `tasks/tripletex2/research/proofs/task-17/verify-direct.ts` (manual sandbox proof)
  - `tasks/tripletex2/research/legacy/trusted-standards/register-customer-invoice-payment.md` (legacy snapshot)
  - `tasks/tripletex2/research/legacy/task-playbooks/register-customer-invoice-payment.md` (legacy snapshot)
  - `tasks/tripletex2/docs/legacy-task-id-bridge.md` (bridge documentation)
  - `tasks/tripletex/sandbox-investigation/83-score-analysis.md` (production scoring)

## Current Tripletex1 coverage

The live Tripletex1 guidance for this task is **exceptionally thorough**:

### Trusted standard (`trusted-standards/register-customer-invoice-payment.md`, 218 lines)
- Complete 3-call flow: `GET /invoice` -> `GET /invoice/paymentType` -> `PUT /invoice/{id}/:payment`
- Extensive API shape notes covering all known pitfalls (field expansion, query-vs-body params, invalid filter params, date requirements)
- Payment amount rule: use live outstanding, not prompt ex-VAT — confirmed across 18 production runs and multiple sandbox proofs
- Payment type selection heuristic with debit account 19xx, isBankAccount/isInvoiceAccount preferences, creditAccount-null tolerance, name-null tolerance
- Same-run paymentTypeId caching vs cross-run caching prohibition
- Foreign-currency exclusion criterion added since legacy version
- GETs-are-free verification section added since legacy version
- Common pitfalls section (5 items, each production-proven)
- Sandbox duplicate noise handling documented with reasoning

### Playbook (`task-playbooks/register-customer-invoice-payment.md`, 138 lines)
- Mirrors the trusted standard content with payment amount rules, payment type rules, canonical call count, and "If You Still Need to Probe" section
- Same 18+ production confirmations documented inline

### AGENTS.md
- Routing entry at line 131: "Register full payment on customer invoice" -> `./trusted-standards/register-customer-invoice-payment.md`
- No contradictions found in AGENTS.md for this task

### Important gaps / contradictions
- **None in the core guidance.** Both trusted standard and playbook align with each other and with the Tripletex2 strategy implementation.
- The score analysis (`83-score-analysis.md`, line 27) labels "T17" as "custom-dimension" with 3.50/4 and 0.50 gap. **This label is incorrect** — see Import 1 below.

## Candidate imports from Tripletex2

### Import 1 — txTaskId mapping mismatch (OPERATIONAL)

- **Insight**: Contest tx_task_id 17 actually corresponds to "Create free accounting dimension and book voucher" (internal task 07), not "Register customer invoice payment". Conversely, contest tx_task_id 07 corresponds to our payment task (internal task 17).
- **Why it seems new**: The score analysis in `83-score-analysis.md` labels "T17" as "custom-dimension" (3.50/4, gap 0.50, all checks pass), which is correct for the contest task but wrong for our internal task. The actual payment task runs under contest tx_task_id 07 and already scores **2.0/2.0** (100% max, 7/7 raw, 2/2 checks).
- **Evidence**:
  - `tasks/tripletex2/src/tasks/task-17/task.ts:9` — `REGISTER_CUSTOMER_INVOICE_PAYMENT_TX_TASK_ID = "07"`
  - `tasks/tripletex2/src/tasks/task-17/RESEARCH.md:30-42` — All 5 runs attributed to tx_task_id 17 have dimension/voucher prompts (Portuguese, Norwegian, French, German); all 4 runs with payment prompts get attributed to tx_task_id 07
  - `tasks/tripletex2/research/task-queue.json:75` — Queue entry still has `"txTaskId": "17"` (stale, contradicts task.ts)
  - Production run evidence: `prod-2026-03-21-214645584Z-483c9eaf` (payment for "Skylagring" 14200kr, score 2.0/2.0) attributed to tx_task_id 07
- **Confidence**: **HIGH** — multiple independent evidence sources converge; the Tripletex2 task.ts has already been updated to use txTaskId "07"
- **Impact on Tripletex1**: This means:
  - The payment task is **already at max score** — no Tripletex1 guidance change can improve it further
  - The 0.50 "gap" shown for "T17" in the score analysis is actually from the dimension/voucher task, not the payment task
  - Any future triage referencing "T17 custom-dimension" should understand this is task 07's gap, not task 17's

### Import 2 — Explicit evidence field enumeration in invoice matching

- **Insight**: The Tripletex2 strategy's `extractEvidence()` function (register-payment.ts:354-381) searches a broader set of fields than the trusted standard's text explicitly enumerates. It checks: `comment`, `invoiceComment`, `deliveryComment`, `yourReference`, `ourReference`, `reference` at invoice level, plus `description`, `displayName`, `productName` on order lines and nested order order-lines.
- **Why it seems new**: The trusted standard's Minimal Flow step 3 says "prompt text match in `orderLines[].description`, `orderLines[].displayName`, `orders[].orderLines[].description`, `orders[].invoiceComment`, or nearby invoice text fields" — the "nearby invoice text fields" is vague. The strategy code is explicit about which fields to search.
- **Evidence**: `tasks/tripletex2/src/tasks/task-17/strategies/register-payment.ts:354-381` (extractEvidence function)
- **Confidence**: **LOW-MEDIUM** — the strategy code is correct, but no production evidence shows a case where the extra fields (`comment`, `deliveryComment`, `yourReference`, `ourReference`, `reference`, `productName`) were the deciding match factor. In all 18+ production confirmations, `orderLines[].description` was sufficient.
- **Net improvement**: Marginal at best. The trusted standard's "nearby invoice text fields" phrasing already gives the LLM latitude to check these. Making it explicit could prevent an edge case but could also add cognitive load without a proven benefit.

### Import 3 — Tripletex2 extraction schema field descriptions

- **Insight**: The `task.ts` (lines 41-56) provides field-level descriptions and extraction notes. Key note: "Treat amountExcludingVatNok as a locate key only; runtime must pay the live outstanding amount from the invoice object."
- **Why it seems new**: This extraction-schema framing is specific to the Tripletex2 deterministic pipeline's classifier-to-strategy handoff. Not directly applicable to Tripletex1's LLM-driven approach.
- **Evidence**: `tasks/tripletex2/src/tasks/task-17/task.ts:41-61`
- **Confidence**: **N/A** — the insight itself is correct, but the trusted standard already covers this at length in its "Payment Amount Rules" section and through 18+ production proofs. This is not net-new for Tripletex1.

## Proposed markdown deltas

### AGENTS.md
- **No change proposed.** The routing entry at line 131 is correct. No contradictions found.

### Trusted standard (`register-customer-invoice-payment.md`)
- **No change proposed.** The live trusted standard (218 lines) is the most thoroughly production-proven document in the Tripletex1 surface. It already incorporates all meaningful insights from Tripletex2 research including the foreign-currency exclusion, GETs-are-free verification, 5 pitfall items, and 18+ production confirmations.

### Playbook (`register-customer-invoice-payment.md`)
- **No change proposed.** Mirrors the trusted standard and is already comprehensive.

### Score analysis note (informational, not a live-surface change)
- The score analysis's "T17 custom-dimension" row (line 27 of `83-score-analysis.md`) is misleading. If the score analysis is ever refreshed, it should reflect that contest tx_task_id 17 = internal task 07 (dimension/voucher, 0.50 efficiency gap) and contest tx_task_id 07 = internal task 17 (payment, 0.0 gap, already at max).

## Risks / caveats

### Mapping ambiguity
- The `research/task-queue.json` entry for task 17 (line 75) still has `"txTaskId": "17"`, contradicting `task.ts:9` which has `"07"`. The queue entry also shows `bestKnownScore: 3.5` which is from the wrong contest task. The Tripletex2 `task.ts` is authoritative; the queue entry is stale.
- The Tripletex1 score analysis (`83-score-analysis.md`) uses "T17 custom-dimension" which bakes in the wrong mapping. This is an informational document, not a live surface, so it does not affect runtime behavior, but it could mislead future triage.

### Conflicting evidence
- None. The Tripletex2 strategy implementation (`register-payment.ts`) is a faithful deterministic codification of the Tripletex1 trusted standard. No contradictions found between the two.

### Not safe to port yet
- **Nothing to port.** The Tripletex1 guidance is already at or ahead of the Tripletex2 evidence base for this task. The live trusted standard has more production confirmations documented inline than any other task in the queue.

### Automated verification gap
- The Tripletex2 automated verifier (`verify-17-17.register-payment.v1-2026-03-22T02-22-26-228Z.json`) failed at sandbox reset due to cross-task employee leftovers from task-06 verification (3 employee neutralization failures: Validering feilet, RevisionException). This is irrelevant to task 17's correctness — the manual sandbox proof passed (2 invoices settled to 0 outstanding).

## Recommendation

**Hold — no action needed.**

Task 17 (Register customer invoice payment) is the strongest-performing task in the system. The Tripletex1 guidance is production-proven across 18+ runs, sandbox-verified multiple times, and already incorporates every meaningful finding from Tripletex2 research. The actual contest task scores 2.0/2.0 (100% max).

The only actionable finding is the txTaskId mapping mismatch (Import 1), which is **operational metadata**, not a Tripletex1 guidance change. It should be noted when next refreshing the score analysis or triage priorities, but it does not warrant editing any live Tripletex1 surface.

This task should be deprioritized below all other queue items. Any human review time is better spent on tasks 13, 23, 29, or 30 where guidance improvements can actually move production scores.
