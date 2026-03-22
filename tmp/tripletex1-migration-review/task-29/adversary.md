# Task 29 adversary review

## Verdict
- salvage
- production leverage: 24
- confidence: 89
- total score: 72

## Claim-by-claim judgments
- claim: Fix the stale AGENTS voucher note.
- judgment: keep
- why: This is the one clearly safe, net-helpful import. `AGENTS.md` still says "No voucher needed (not scored)" in the task-29 lifecycle paragraph, but the live trusted standard and playbook both treat the voucher as required for the current 4/11 path. This is a real operator-facing contradiction.
- evidence: `tasks/tripletex/codex-environment/AGENTS.md:315`; `tasks/tripletex/codex-environment/trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:24`; `tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:19-22`.

- claim: Port sandbox-verified root causes for checks 3-7 as a new Tripletex1 import.
- judgment: weaken
- why: Most of this is already live in Tripletex1. The playbook already says PM identity is confirmed unfixable, voucher-alone does not create a `supplierInvoice`, and `projectInvoiceDetails` is read-only. The trusted standard already logs `projectInvoiceDetails`, `vendor` readback on `project/orderline`, and empty `supplierInvoice` results. The proposal overstates novelty and then puts the new material on the wrong surface by adding a large "Structural Ceiling" section to the trusted standard.
- evidence: `tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:34-40`; `tasks/tripletex/codex-environment/trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:282`; `tasks/tripletex/codex-environment/trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:349-360`; `tasks/tripletex2/src/tasks/task-29/RESEARCH.md:69-89`.

- claim: Add the XML `importDocument` supplier-invoice hypothesis as a concrete next step.
- judgment: reject
- why: This is not ready for production-porting and it is not meaningfully net-new. The live playbook already documents the same uncertainty: `importDocument` works in production generally, did not create an SI entity in sandbox for task 29, and remains unproven as a scorer unlock here. Porting it again into live T1 guidance does not materially improve production score.
- evidence: `tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:37`; `tasks/tripletex2/src/tasks/task-29/RESEARCH.md:89`; `tasks/tripletex2/src/tasks/task-29/RESEARCH.md:97-106`.

- claim: Mention the v2 direct `POST /invoice` path as a hold item because it creates `projectInvoiceDetails`.
- judgment: reject
- why: This does not belong in live T1 guidance yet. T1 already has production-backed evidence that `POST /invoice` causes the wrong invoice/order state, while the T2 support here is sandbox-only and explicitly not promoted. The proposal also cites a packet created at `2026-03-22T02:11:59.946Z` for evidence that RESEARCH says came later at `2026-03-22 09:04`, so the evidence chain is temporally mixed.
- evidence: `tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:31-32`; `tasks/tripletex2/src/tasks/task-29/RESEARCH.md:117-136`; `tasks/tripletex2/research/packets/task-29/task-29-packet-2026-03-22T02-11-59-946Z.json:1-24`; `tasks/tripletex2/src/tasks/task-29/strategies/full-project-lifecycle-v2.ts:183-185`.

## Missed problems in the proposal
- It fixes the smaller AGENTS contradiction but misses the bigger one: `AGENTS.md` still says `POST /project/orderline` is mandatory and that both orderline and voucher are needed, while the live playbook says orderline is not contributing to any passing check and is only kept as a safety hedge.
- It frames the T2 findings too strongly. The evidence supports "known blockers on current tested branches," not "structurally impossible with current approach" language for a trusted standard.
- It overstates net-newness. PM assignability, empty `supplierInvoice` after voucher, and read-only invoice structure are already in the live playbook; vendor-null and `supplierInvoice` emptiness are already logged in the live trusted standard diagnostics.
- It treats the T2 bundle as cleaner than it is. RESEARCH says voucher creation requires `supplier.id` on all postings, but the v2 strategy's debit posting omits `supplier`, so the source set is not yet clean enough to elevate as settled guidance.
- It is slightly sloppy on its own citations: the stale AGENTS voucher sentence is on line 315 in the current file, not line 314.

## Minimal salvage set
- Fix `tasks/tripletex/codex-environment/AGENTS.md` task-29 lifecycle paragraph so it no longer says "No voucher needed (not scored)".
- If humans touch task-29 docs beyond that, reconcile the orderline guidance across `AGENTS.md`, the playbook, and the trusted standard before adding any new blocker-analysis prose.
- Keep the XML-import and direct-`POST /invoice` branches out of live T1 runtime guidance until task-29-specific production evidence exists.

## Bottom line
This proposal should survive triage only as a narrow cleanup, not as written. The voucher-note fix is worth carrying forward, but the broader package overclaims novelty, misses the more important live contradiction about orderlines, and tries to freeze still-active hypotheses into trusted guidance without production-proof leverage.
