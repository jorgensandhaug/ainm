# Task 20 adversary review

## Verdict
- reject
- production leverage: 12
- confidence: 95
- total score: 28

## Claim-by-claim judgments

### Claim 1
- claim: Re-add `POST /ledger/voucher/{id}/attachment` to the T20 flow because Check 5 is most likely the missing PDF upload.
- judgment: reject
- why: This is built on a stale reading of live T1. Current `AGENTS.md`, the trusted standard, and the playbook all already say not to upload the PDF separately. Newer T1 evidence also cuts directly against the claim: run `210edee3` used PaymentMeans plus PDF upload and still scored 8/10, while run `f1cd6ae7` used PaymentMeans plus both addresses with no PDF upload and also scored 8/10. That is not proof that PDF can never matter, but it is strong enough to reject porting "upload the PDF" back into production guidance.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:18-22`, `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:105-108`, `tasks/tripletex/codex-environment/AGENTS.md:149`, `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:12-22`, `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:10-21`, `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:45-50`
- impact scored: 20

### Claim 2
- claim: `AGENTS.md` should stop claiming that omitting `physicalAddress` is the Check 5 cause.
- judgment: keep
- why: This is the one strong production-safe correction. The instruction to send both addresses should stay, but the causal statement is too strong and is contradicted by later runs where both addresses were present and Check 5 still failed.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:46-55`, `tasks/tripletex/codex-environment/AGENTS.md:497`, `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:43-48`

### Claim 3
- claim: The trusted standard needs a clarification that Check 5 may really be PDF attachment rather than PaymentMeans.
- judgment: reject
- why: This is mostly stale catch-up, not a net-new import. The live trusted standard already says PaymentMeans populates `kidOrReceiverReference` but does not fix Check 5, and it already records that PDF upload adds no scoring value. Reopening the standard around a PDF hypothesis would weaken a surface that is already more current than the queue proposal.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:57-61`, `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:115-118`, `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:22`, `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:45`, `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:173-174`, `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:48-55`
- impact scored: 4

### Claim 4
- claim: Port the approximate check-by-check score map into T1 guidance.
- judgment: reject
- why: The map is explicitly inferential and does not change agent behavior. More importantly, its headline Check 5 mapping is tied to the rejected PDF-upload hypothesis. This is research-note material, not production-score leverage.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:71-87`, `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:48-50`
- impact scored: 2

### Claim 5
- claim: Port attachment-ordering flexibility and country auto-population as useful guidance.
- judgment: weaken
- why: These may be true as side observations, but they do not improve the frontier production path. Live T1 no longer recommends the attachment write at all, and explicit country is already the safer guidance. These are debugging notes at best.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-20.md:89-99`, `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:22`, `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md:41`, `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:21-22`, `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice-from-pdf.md:55`
- impact scored: 2

## Missed problems in the proposal
- It reviews a stale T1 baseline. The proposal says the live trusted standard and playbook already contain a 6-write flow with separate PDF upload, but live T1 says the opposite: 4 writes, no separate PDF upload.
- It overstates novelty. The live standard already says PaymentMeans is required for `kidOrReceiverReference` but does not fix Check 5, and the live playbook already marks Check 5 root cause as unknown.
- It leans on older, weaker T2 evidence against newer T1 evidence. The queue item is sourced from a 6-run T2 research base, while live T1 already records 17+ runs and later falsification data.
- It misses the decisive later pair of runs for its own hypothesis. `210edee3` and `f1cd6ae7` already test the "with PDF upload" versus "without PDF upload" branch under otherwise stronger conditions, and both remain 8/10.
- It frames Delta 1 as an "adopt now" production change even though the live surfaces already converged on "do not upload PDF separately" and label that path as proven best.

## Minimal salvage set
- Update `AGENTS.md` so it still requires both `postalAddress` and `physicalAddress` for T20, but removes the causal claim that missing `physicalAddress` is what Check 5 measures.
- Do not re-add a separate attachment write.
- Do not edit the trusted standard or playbook to revive the PDF-attachment hypothesis without new production evidence.

## Bottom line
- This proposal should not survive queue triage in its current form. Its main import tries to resurrect an older PDF-upload theory that live Tripletex1 has already tested against newer evidence and moved away from; the only worthwhile carry-forward is the narrow wording fix that decouples `physicalAddress` from the Check 5 explanation.
