# Task 29 referee review

## Final verdict
- salvage
- final production leverage: 26
- confidence: 91
- rank note: This should likely sit in the lower half of the queue. There is one clear operator-facing cleanup worth preserving, but the broader proposal does not add enough net-new production leverage to justify high priority.

## Final claim rulings
- claim: Fix the stale AGENTS voucher note.
- ruling: keep
- final reasoning: This is the one clearly safe, net-new, production-relevant import. `AGENTS.md` still says `No voucher needed (not scored)` for the task-29 lifecycle branch, while the live trusted standard and playbook both say the voucher is required for the current 4/11 path and for check 6. Leaving that contradiction in place can mislead operators into dropping the only addition that already moves the score from 2/11 to 4/11.
- evidence: `tasks/tripletex/codex-environment/AGENTS.md:315`; `tasks/tripletex/codex-environment/trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:22-26`; `tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:19-28`

- claim: Port sandbox-verified root causes for checks 3-7 as a new Tripletex1 import.
- ruling: weaken
- final reasoning: The proposal overstates novelty and overstates certainty. Live Tripletex1 already says PM assignability is effectively blocked, voucher alone does not create a `supplierInvoice`, `vendor` on `project/orderline` does not persist, and invoice-structure limits remain unresolved. What is missing is not a brand-new blocker package; it is cleaner reconciliation across surfaces. Do not add a hard `Structural Ceiling` section to the trusted standard. At most, lightly tighten the playbook with the current-tested-branch framing and reconcile contradictions first.
- evidence: `tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:34-40`; `tasks/tripletex/codex-environment/trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:22-26`; `tasks/tripletex/codex-environment/trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:349-360`; `tasks/tripletex/codex-environment/AGENTS.md:314-331`; `tasks/tripletex2/src/tasks/task-29/RESEARCH.md:57-106`

- claim: Add the XML `importDocument` supplier-invoice hypothesis as a concrete next step.
- ruling: reject
- final reasoning: This is not ready for live Tripletex1 guidance and is not meaningfully net-new. The playbook already notes the same uncertainty: voucher does not create `supplierInvoice`, XML import exists, and task-29-specific scorer unlock remains unproven. Porting it again would add speculation more than score leverage.
- evidence: `tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:34-40`; `tasks/tripletex2/src/tasks/task-29/RESEARCH.md:97-106`

- claim: Mention the v2 direct `POST /invoice` path as a hold item because it creates `projectInvoiceDetails`.
- ruling: reject
- final reasoning: This does not belong in live Tripletex1 guidance yet. Tripletex1 already has production-backed evidence that `POST /invoice` causes the wrong invoice and order state for this task family, while the v2 support is sandbox-only and explicitly not promoted. The queue file also mixes evidence timestamps by citing a packet created before the later v2 sandbox verification.
- evidence: `tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:30-32`; `tasks/tripletex2/src/tasks/task-29/RESEARCH.md:117-136`; `tasks/tripletex2/research/packets/task-29/task-29-packet-2026-03-22T02-11-59-946Z.json`; `tasks/tripletex2/src/tasks/task-29/strategies/full-project-lifecycle-v2.ts:183-198`

## Queue-worthy delta
- Replace the stale `No voucher needed (not scored)` sentence in the task-29 lifecycle paragraph of `AGENTS.md` so it aligns with the live trusted standard and playbook that already require the voucher for the current 4/11 path.

## Missed live contradictions / stale assumptions
- The proposal fixes the smaller voucher contradiction but misses the larger live inconsistency around `POST /project/orderline`: `AGENTS.md` still says orderline is mandatory for the project-cost check, while the playbook says orderline is included only as a safety hedge and has not contributed to any passing check so far.
- The proposed `Structural Ceiling` wording is too strong for the current evidence. The T2 research still keeps XML-import and invoice-structure branches open, so `known blockers on currently tested branches` is defensible; `structurally impossible` is not.
- The T2 evidence bundle is not fully clean enough to port as settled guidance: `RESEARCH.md` says voucher creation requires `supplier.id` on all postings, but `full-project-lifecycle-v2.ts` omits `supplier` on the debit posting.
- The v2 evidence chain is temporally mixed: the cited packet was created at `2026-03-22T02:11:59.946Z`, while the enhanced v2 sandbox verification in `RESEARCH.md` is dated `2026-03-22 09:04`.

## Bottom line
- Low priority. This task is worth preserving only as a narrow cleanup that removes the stale AGENTS voucher note; the broader proposal mostly repackages guidance Tripletex1 already has, places analysis on the wrong surface, and states still-active hypotheses too strongly to improve production score meaningfully.
