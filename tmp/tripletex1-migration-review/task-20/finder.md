# Task 20 Critique

## Concise proposal summary
The proposal argues that Tripletex1 should import Tripletex2's task-20 hypothesis that Check 5 is most likely the missing PDF upload, update `AGENTS.md` to add `POST /ledger/voucher/{id}/attachment` back into the T20 flow, and soften or replace current T1 claims that Check 5 is about `physicalAddress` or `PaymentMeans`.

## Strengths
- It correctly notices that the causal wording in `tasks/tripletex/codex-environment/AGENTS.md:497` is too strong: runs `7c4183ab` and `4c22beb6` show that `physicalAddress` is not sufficient to make Check 5 pass.
- It correctly observes that the Tripletex2 task-20 strategies are behind current Tripletex1 guidance: `register-supplier-invoice-pdf-v2.ts` still uploads the PDF and still omits supplier address/bank data and `PaymentMeans`.
- It is appropriately explicit about uncertainty in the attachment-vs-PaymentMeans hypothesis instead of claiming proof.

## Candidate findings

### 1. High — the proposal is reviewing a stale baseline and repeatedly describes live T1 incorrectly
`task-20.md` says the trusted standard already uses a "Full 6-write flow" with `POST attachment` and that the playbook mirrors that flow (`tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:18-31`). That is no longer true in the live T1 surfaces. The live trusted standard says the proven flow is 4 writes + 1 required GET and explicitly says "`importDocument` auto-generates BOTH a PDF attachment and an XML ediDocument ... do NOT upload the PDF separately" (`tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:12-23`). The live playbook says the same (`tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:10-21`). This is a major review-integrity problem: the proposal's core delta is built on a no-longer-live state.

### 2. High — Delta 1 would regress T1 guidance by re-introducing a write that live T1 has already ruled out
The proposal's main recommendation is to change `AGENTS.md` so T20 again uploads the original PDF (`task-20.md:103-113`). Live T1 evidence points the other way. The trusted standard now documents that separate PDF upload is wasted and cites run `210edee3` as having no scoring impact (`trusted-standards/register-supplier-invoice-from-pdf.md:22`). The playbook is even clearer: `210edee3` used PaymentMeans + PDF upload and still scored 8/10, while `f1cd6ae7` used PaymentMeans + both addresses + no PDF upload and also scored 8/10 (`task-playbooks/register-supplier-invoice-from-pdf.md:42-54`). That does not prove PDF upload can never matter, but it is strong enough to reject "adopt now" for re-adding the step to production guidance.

### 3. High — the proposal privileges weaker, older T2 evidence over stronger, newer T1 evidence
The imported hypothesis comes from a T2 research file built on 6 production runs and an older packet snapshot (`task-20.md:9-14`, `tasks/tripletex2/src/tasks/task-20/RESEARCH.md`). But live T1 has already advanced beyond that evidence base: the playbook now includes 17+ T20 runs and explicitly records later falsification data around both PaymentMeans and PDF upload (`task-playbooks/register-supplier-invoice-from-pdf.md:42-54`). The T2 strategy code is also not frontier-quality evidence here: v2 still creates the supplier with only `{ name, organizationNumber }` and its XML still omits `PaymentMeans` (`tasks/tripletex2/src/tasks/task-20/strategies/register-supplier-invoice-pdf-v2.ts:321-344`, `tasks/tripletex2/src/tasks/task-20/strategies/register-supplier-invoice-pdf-v2.ts:629-735`). This makes T2 useful as historical context, not as something to port straight into live T1.

### 4. Medium — the proposal misstates the current T1 PaymentMeans position, so its "minor clarification" is mostly not net-new
`task-20.md` says the trusted standard currently attributes Check 5 to PaymentMeans and implies T1 still needs a clarification (`task-20.md:57-61`, `115-118`). The live standard already says the opposite: PaymentMeans is required to populate `kidOrReceiverReference`, but "Check 5 still fails at 8/10 even WITH PaymentMeans" and "the root cause of Check 5 is NOT kidOrReceiverReference" (`trusted-standards/register-supplier-invoice-from-pdf.md:45`). The live playbook says the same and labels Check 5 root cause `UNKNOWN` (`task-playbooks/register-supplier-invoice-from-pdf.md:20-21`, `48-54`). So this proposal is not adding a new clarification to the main T1 surfaces; it is largely catching up to them.

### 5. Medium — one partial import is valid: AGENTS should stop claiming that omitting `physicalAddress` is the Check 5 cause
This is the proposal's strongest point. `AGENTS.md` still says omitting `physicalAddress` causes Check 5 to fail (`tasks/tripletex/codex-environment/AGENTS.md:497`), but the live playbook records `7c4183ab` and `4c22beb6` as runs with both addresses + country + booking that still failed Check 5 (`task-playbooks/register-supplier-invoice-from-pdf.md:43-46`). That means the causal claim should be narrowed. The safe change is: keep the instruction to set both addresses, but remove the claim that this is what Check 5 measures.

### 6. Low — the check-map and attachment-ordering imports are low leverage for production
The approximate check weights and check meanings (`task-20.md:71-87`) are explicitly inferential and do not unlock any concrete production action. The attachment-ordering note (`task-20.md:89-93`) is similarly low leverage because live T1 no longer recommends the attachment write at all. These are fine research notes, but they are not reasons to modify production-facing markdown.

## Net-new call
Mostly not net-new.

The only materially useful net-new item is the narrower AGENTS correction: stop claiming `physicalAddress` omission is the Check 5 cause. The proposal's headline import, "re-add PDF upload to the T20 flow," is not net-new in a good way; it revives an older hypothesis that live T1 has already tested against newer evidence and moved away from.

## Is the evidence strong enough for production-porting now?
No.

The strongest live evidence cuts against the proposal's main port:
- live `AGENTS.md` already says "Do NOT upload PDF separately" (`AGENTS.md:149`)
- live trusted standard documents attachment upload as no-benefit (`trusted-standards/register-supplier-invoice-from-pdf.md:22`)
- live playbook records both "with PDF upload" and "without PDF upload" PaymentMeans runs as the same 8/10 outcome (`task-playbooks/register-supplier-invoice-from-pdf.md:45-46`)

That leaves one production-safe port candidate only: revise the AGENTS wording around `physicalAddress` causality.

## Production score leverage score
12/100

Reason: the proposal does not identify a production-ready fix for the remaining 2-point T20 gap. Its main recommended delta is likely regressive. The salvageable part is documentation hygiene around `physicalAddress`, which has some value for future diagnosis but little direct score leverage.

## Confidence
93/100

The critique is high-confidence because the main conflicts are direct contradictions against the current live T1 markdown surfaces, not inference. The only meaningful uncertainty is whether some future document-upload experiment could still matter for Check 5; that uncertainty argues for sandbox investigation, not for porting this proposal now.

## Provisional one-line recommendation
reject

## Best insight in this task
The single best insight is that `AGENTS.md` should stop claiming `physicalAddress` omission is the Check 5 cause; keep the address requirement, but decouple it from the Check 5 explanation.

## Finder score
- High-impact findings: 3 × 10 = 30
- Medium-impact findings: 2 × 5 = 10
- Low-impact findings: 1 × 1 = 1
- Total: 41
