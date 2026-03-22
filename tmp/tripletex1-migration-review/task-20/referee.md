# Task 20 referee review

## Final verdict
- salvage
- final production leverage: 15
- confidence: 96
- rank note: This should likely sit in the low tier of the queue. The proposal's headline import is stale and regressive against newer live T1 evidence, but there is one small AGENTS wording fix worth preserving.

## Final claim rulings

- claim: Re-add `POST /ledger/voucher/{id}/attachment` to the T20 flow because Check 5 is most likely the missing PDF upload.
- ruling: reject
- final reasoning: This is the proposal's main claim, and it does not survive comparison against the live Tripletex1 surfaces. Current `AGENTS.md`, the trusted standard, and the playbook all already say not to upload the PDF separately because `importDocument` auto-generates the PDF attachment. More importantly, the later production pair in the playbook cuts directly against the claim's leverage: run `210edee3` used PaymentMeans plus separate PDF upload and still scored 8/10, while `f1cd6ae7` used PaymentMeans plus both addresses without separate PDF upload and also scored 8/10. That does not prove PDF upload can never matter, but it is strong enough to reject porting this back into production guidance.
- evidence: `tasks/tripletex/codex-environment/AGENTS.md:149`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:12-22`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:10-21`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:45-50`; `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:103-118`

- claim: `AGENTS.md` should stop claiming that omitting `physicalAddress` is the Check 5 cause, while still requiring both addresses for T20.
- ruling: keep
- final reasoning: This is the one production-safe import. The live AGENTS wording is too strong: it asserts a causal link that later production history contradicts. The playbook records `7c4183ab` and `4c22beb6` as runs with both addresses, country, and booking, yet Check 5 still failed. The correct import is narrow: keep the instruction to send both `postalAddress` and `physicalAddress`, but remove the claim that missing `physicalAddress` is what Check 5 measures.
- evidence: `tasks/tripletex/codex-environment/AGENTS.md:497`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:43-48`; `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:46-55`

- claim: The trusted standard should be revised to say Check 5 may really be PDF attachment rather than PaymentMeans.
- ruling: reject
- final reasoning: This is mostly stale catch-up, not a useful net-new correction. The live trusted standard already says PaymentMeans is required to populate `kidOrReceiverReference` but does not fix Check 5, and the playbook already marks the root cause as unknown after later runs. Reopening the trusted standard around the PDF-upload hypothesis would weaken a surface that is already more current than the queue proposal.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:22`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:45`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:20-21`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:48-55`; `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:57-61`

- claim: Port the approximate check-by-check map and score weights into T1 guidance.
- ruling: reject
- final reasoning: The map is explicitly inferential, does not change agent behavior, and its most important check identity is tied to the rejected PDF-upload hypothesis. This is research-note material, not production-score leverage.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:71-87`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:48-50`

- claim: Port attachment-ordering flexibility and supplier-country auto-population as useful guidance.
- ruling: weaken
- final reasoning: These may be true as side observations, but they do not improve the frontier production path. Live T1 no longer recommends the attachment write at all, and explicit `country: { id: 161 }` is already the safer instruction. At most these belong in low-priority debugging notes, not in score-focused queue imports.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:89-99`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:22`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:41`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:21-22`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:55`

## Queue-worthy delta
- Remove the causal wording in `AGENTS.md` that says omitting `physicalAddress` causes Check 5 to fail; keep the instruction that T20 should still send both `postalAddress` and `physicalAddress` from the PDF.

## Missed live contradictions / stale assumptions
- The queue proposal reviews a stale baseline. It says the live trusted standard and playbook already contain a 6-write flow with separate PDF upload, but the live surfaces say the opposite: 4 writes, no separate PDF upload, because `importDocument` already creates the PDF attachment. Evidence: `tasks/tripletex/codex-environment/AGENTS.md:149`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:12-22`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:10-21`.
- The proposal privileges older Tripletex2 evidence over newer Tripletex1 evidence. The queue file leans on a 6-run T2 research base, while the live T1 playbook already records 17+ runs and includes the later falsification pair `210edee3` and `f1cd6ae7`. Evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:9-14`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:30-55`.
- The proposal overstates novelty around PaymentMeans. Live T1 already says PaymentMeans correctly populates `kidOrReceiverReference` but does not unlock Check 5, so that clarification is not a new import. Evidence: `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:45`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:20-21`.

## Bottom line
- Low priority. The proposal should not be imported as written because its main recommendation tries to revive a PDF-upload theory that current Tripletex1 guidance has already tested against newer evidence and moved away from. The only piece that deserves preservation is the narrow AGENTS wording fix that decouples `physicalAddress` from the Check 5 explanation.
