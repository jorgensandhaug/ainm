## Concise proposal summary

Task 29 proposes porting four things from Tripletex2 into Tripletex1 docs for the full project-lifecycle task: fix the stale AGENTS voucher note, replace vague failure notes with sandbox-root-cause analysis, document an XML `importDocument` hypothesis for supplier invoices, and mention the v2 `POST /invoice` path only as a hold item. The intent is to improve operator guidance, not runtime code.

## Candidate findings

1. `Medium strength` The AGENTS voucher contradiction is real and worth fixing.
Evidence: [T1 AGENTS line 315] says "No voucher needed (not scored)" while the trusted standard and playbook both say the voucher is required for check 6 and the current 4/11 path. This is the safest part of the proposal and is the clearest operator-facing cleanup.

2. `Medium strength` The proposal is appropriately cautious about the XML-import and direct-`POST /invoice` branches.
Evidence: it does not recommend adopting either branch now. That matches live uncertainty: the playbook still treats supplier-invoice creation as unproven for T29, and T2 RESEARCH explicitly says v2 promotion was deferred pending production confirmation.

3. `High weakness` The proposal materially overstates how much is net-new.
Evidence: the live T1 playbook already contains most of the claimed "Import 2" content: PM assignability is already called "confirmed unfixable", voucher-alone not creating `supplierInvoice` is already documented, and invoice-structure limits are already listed. The trusted standard already logs `projectInvoiceDetails`, `project/orderline` vendor readback, and `supplierInvoice` emptiness in diagnostics. The only clearly net-new item is the narrow AGENTS contradiction cleanup, not the broader root-cause package.

4. `High weakness` The proposal fixes the wrong contradiction and misses the larger live inconsistency that affects operator behavior.
Evidence: it focuses on AGENTS line 315, but does not resolve AGENTS lines 329-330, which say `POST /project/orderline` is mandatory and that both orderline and voucher are needed. That conflicts with the live playbook, which says orderline is not contributing to any passing check and could be dropped, and with the trusted standard emphasis that the voucher is what the scorer checks. If this migration is meant to reduce score-losing confusion, missing the orderline contradiction is a major miss.

5. `High weakness` The proposed "Structural Ceiling" wording overclaims beyond the evidence and would prematurely freeze live exploration.
Evidence: the proposal shifts from "still unsolved" to "structurally impossible with current approach." That is too strong. T2 RESEARCH still keeps multiple active hypotheses open, including project-budget and invoice-structure investigation, and keeps v2 as a challenger rather than closing the task. The evidence supports "known blockers with current tested branches," not a hard ceiling claim suitable for trusted guidance.

6. `Medium weakness` The proposal puts the new analysis on the wrong surface.
Evidence: the trusted standard is explicitly an execution surface that says "use directly" and provides a copy-paste script. Adding a large "Structural Ceiling" section there would mix dead-end analysis into the exact-match runbook. For this family, the right homes are the playbook and AGENTS. The trusted standard should stay optimized for fast, low-friction execution.

7. `Medium weakness` The evidence chain for the v2-related claims is temporally mixed and weaker than the proposal implies.
Evidence: the cited packet was created at `2026-03-22T02:11:59.946Z`, but the cited RESEARCH section says the enhanced v2 sandbox verification happened at `2026-03-22 09:04`. So the packet cannot support the later v2 claims. If the proposal wants to rely on v2 evidence, it should say that the packet is pre-v2 and that the support comes from RESEARCH plus the strategy file, not from the packet.

8. `High weakness` The Tripletex2 source set is internally inconsistent on voucher details, and the proposal does not reconcile that before treating the evidence as production-portable.
Evidence: T2 RESEARCH says voucher creation requires `supplier.id` on all postings, but the v2 strategy code does not put `supplier` on the debit posting. That means the supporting source bundle is not internally clean. A migration proposal should call out and resolve source inconsistencies before elevating them into T1 docs as settled fact.

## Net-new call

Mostly not net-new.

The only clearly net-new, ready-to-port item is the AGENTS cleanup that removes the stale "no voucher needed" guidance. Most of the broader root-cause analysis is already present in the live T1 playbook and trusted standard, just distributed unevenly and with unresolved contradictions.

## Evidence strong enough for production-porting now?

Not for the proposal as written.

Evidence is strong enough for a narrow doc-hygiene patch:
- align AGENTS with the existing voucher-required guidance
- optionally tighten the playbook wording around PM assignability and supplier-invoice uncertainty

Evidence is not strong enough to:
- declare a hard structural ceiling in the trusted standard
- port the v2 `POST /invoice` idea into live guidance
- treat the XML import route as a likely T29 scorer unlock without task-specific verification

## Overall judgment

- Production score leverage score: `32/100`
- Confidence: `87/100`
- Provisional one-line recommendation: `hold`

Reasoning: the proposal probably improves documentation consistency a little, but it is unlikely to move the cutting-edge production score much on its own. Its highest-value safe change is small, while its broader claims are either already in T1, placed on the wrong surface, or stated too strongly for the current evidence.

## Best insight in this task

Fix the stale AGENTS voucher guidance and make all T1 surfaces consistently say that the voucher is required for the current 4/11 path; that is the single safest, highest-value import here.

## Score

Total self-score: `60`
