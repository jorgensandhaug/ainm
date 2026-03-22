# Task 21 adversary review

## Verdict
- salvage
- production leverage: 18
- confidence: 89
- total score: 31

## Claim-by-claim judgments

- claim: Reject importing T2's `remunerationType = NOT_CHOSEN` hypothesis for task 21 Check 5.
- judgment: keep
- why: This is the strongest part of the proposal. T2 still treats `NOT_CHOSEN` as the fix, but T1 production already falsified it. The proposal is right to block that import.
- evidence: `tasks/tripletex2/src/tasks/task-21/RESEARCH.md` says task 21 remunerationType should be `NOT_CHOSEN` and frames Check 5 as confirmed. `tasks/tripletex/data/production/runs/prod-2026-03-22-025848551Z-fd3075b7/codex-score-reflection.summary.md` shows a task-21 production run using `NOT_CHOSEN` still scoring `12/14` with Check 5 failed. `tasks/tripletex/data/production/runs/prod-2026-03-22-042905443Z-0c8aec74/codex-score-reflection.summary.md` also lists remunerationType as disproven.

- claim: T2's decoded tilbudsbrev field inventory is only marginally useful and not score-moving.
- judgment: keep
- why: The field list is genuinely net-new reference material, but the live T1 standard already captures the operational consequences that matter for scoring: no lønnstype field, no email/NIN/bank in tilbudsbrev, and extraction from the PDF attachment. This is documentation niceness, not a production lever.
- evidence: `tasks/tripletex2/src/tasks/task-21/RESEARCH.md` enumerates the tilbudsbrev fields. `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md` already instructs the agent what to extract and what to omit for this task family.

- claim: T2's occupation-code mappings are already present in T1.
- judgment: keep
- why: The proposal is correct that this import is not new. Re-porting the same six mappings would add no leverage.
- evidence: The six offer-letter mappings in `tasks/tripletex2/src/tasks/task-21/RESEARCH.md` and `tasks/tripletex2/src/tasks/task-21/task.ts` already appear in `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md` and `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md`.

- claim: T2's task-identity contamination audit does not justify a Tripletex1 markdown change.
- judgment: keep
- why: This is useful queue-local caution, but it is not a live T1 runtime improvement. The proposal is right not to turn T2's internal contamination history into a T1 prompt edit.
- evidence: `tasks/tripletex2/src/tasks/task-21/RESEARCH.md` documents the prior mis-mapping to correct-ledger-errors. The live T1 surfaces already describe task 21 as onboarding from tilbudsbrev; there is no sign the contamination propagated into `tasks/tripletex/codex-environment/`.

- claim: No live T1 changes are needed because T1 coverage is comprehensive, has no significant gaps, and has no internal contradictions.
- judgment: reject
- why: This is the proposal's main overreach. The core "do not import T2's fix" conclusion survives, but the live T1 surfaces are not clean enough to support a high-confidence "nothing to do" claim. The playbook still gives conflicting attributions for Check 10, and the trusted standard/playbook elevate `employeeNumber`/`employmentId` from sandbox-backed hypothesis to near-mandatory fix before any task-21 production confirmation.
- evidence: The proposal itself says "Gaps: None significant" and "Contradictions: None internal to T1" in `tasks/tripletex/docs/tripletex1-migration-queue/task-21.md`. But `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:19` says task-21 Check 10 is department reuse, while `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:112` maps task-21 Check 10 to standard worktime. `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:38-44` says to always set `employeeNumber` and `employmentId` as "the last viable hypothesis", while `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:76-87` still describes that same idea as testing, not confirmed production fact.

- claim: T2 is behind T1 across every dimension.
- judgment: weaken
- why: T1 is ahead on the only important production question here, but "every dimension" is inflated. Some of the proposal's proof points are cross-task or irrelevant to task 21 specifically. For example, task-19 payroll-tax evidence does not make T2 weaker on task-21 imports, and "lacks email extraction" is not a meaningful task-21 defect because the offer-letter shape explicitly lacks email.
- evidence: `tasks/tripletex2/src/tasks/task-21/task.ts` and `tasks/tripletex2/src/tasks/task-21/RESEARCH.md` both explicitly say tilbudsbrev does not contain email/NIN/bank. The proposal's broader "T2 is behind T1" framing in `tasks/tripletex/docs/tripletex1-migration-queue/task-21.md` leans on task-19 carryover and on T1's unproven Rule 5 hypothesis.

## Missed problems in the proposal

- live contradictions it missed
- The live T1 playbook assigns task-21 Check 10 two different meanings: department reuse in the quick-reference section and standard worktime in the guessed check map. That directly undercuts the proposal's "no internal contradictions" claim.
- The live T1 guidance is not aligned on Rule 5 certainty. The trusted standard uses imperative language for `employeeNumber` / `employmentId`, but the playbook still treats it as an awaiting-production-confirmation hypothesis.

- stale assumptions
- "Check mapping: 10 checks fully mapped with weights" is too strong when one of those mappings is internally inconsistent inside the live playbook.
- "No changes proposed" is argued as if the only question were whether T2 has a better fix. That skips the separate question of whether T1's own task-21 wording now needs cleanup because new evidence changed its certainty level.

- things framed too strongly
- "T1 has exhaustively analyzed Check 5" overshoots. T1 has eliminated several hypotheses, but its current Rule 5 remains sandbox-backed only.
- "T1 is ahead across every dimension" overstates the case. The production-falsification win is real; the broader superiority claim is not needed and is not fully supported.

## Minimal salvage set

- Keep the rejection of T2's `NOT_CHOSEN` import. That is the only high-stakes decision here.
- Keep the conclusion that T2's occupation mappings are not new.
- Keep the conclusion that T2's contamination audit belongs in queue review history, not live T1 runtime markdown.
- Weaken all language claiming T1 is contradiction-free or complete. The safe triage position is "do not import T2's task-21 ideas now, but do not treat live T1 task-21 guidance as settled either."

## Bottom line

This proposal should survive triage only in a narrowed form: its defensive core is right, because T2's main task-21 import is already falsified by production. What should not survive is the stronger story that T1 is already fully coherent and needs no cleanup; the live onboarding docs still contain unresolved task-21 attribution and confidence problems, so this is a salvage, not a clean hold.
