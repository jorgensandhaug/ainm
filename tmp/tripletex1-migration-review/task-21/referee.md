# Task 21 referee review

## Final verdict
- salvage
- final production leverage: 16
- confidence: 90
- rank note: This should sit in the low-priority part of the queue. Its only real production value is defensive: block a bad T2 import and preserve a small amount of queue-local caution, not unlock a new scoring gain.

## Final claim rulings
- claim: Reject importing T2's `remunerationType = NOT_CHOSEN` hypothesis for task 21 Check 5.
- ruling: keep
- final reasoning: This is the strongest and most score-relevant part of the proposal. T2 still claims task 21 Check 5 is fixed by `NOT_CHOSEN`, but T1 production already falsified that. A task-21 production run using `NOT_CHOSEN` still scored `12/14` with Check 5 failed, and later T1 evidence explicitly treats the hypothesis as disproven.
- evidence: `tasks/tripletex2/src/tasks/task-21/RESEARCH.md:42-55`; `tasks/tripletex2/src/tasks/task-21/strategies/onboard-employee-offer-letter.ts:57-60`; `tasks/tripletex/data/production/runs/prod-2026-03-22-025848551Z-fd3075b7/codex-score-reflection.summary.md:17-24`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:13-17`

- claim: T2's decoded tilbudsbrev field inventory is only marginally useful and not score-moving.
- ruling: keep
- final reasoning: The field inventory is mildly net-new as reference material, but it does not materially change the operating behavior that already matters for T1 scoring. T1 already encodes the important consequences: use `MONTHLY_WAGE`, omit absent email/NIN/bank fields when not present, and always set standard worktime.
- evidence: `tasks/tripletex2/src/tasks/task-21/RESEARCH.md:27-40`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:13-22`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:51-55`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:86-94`

- claim: T2's occupation-code mappings are already present in T1.
- ruling: keep
- final reasoning: The import is not new. The same tilbudsbrev job-title mappings already exist in both the live trusted standard and playbook, so porting them again would not improve production score.
- evidence: `tasks/tripletex2/src/tasks/task-21/RESEARCH.md:88-97`; `tasks/tripletex2/src/tasks/task-21/task.ts:55-66`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:183-200`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:27-42`

- claim: T2's task-identity contamination audit does not justify a Tripletex1 markdown change.
- ruling: keep
- final reasoning: This is useful queue-local hygiene, not a live T1 runtime improvement. The contamination was inside T2; the live T1 surfaces already describe task 21 correctly, so there is no production leverage in porting that history into runtime guidance.
- evidence: `tasks/tripletex2/src/tasks/task-21/RESEARCH.md:5-14`; `tasks/tripletex2/src/tasks/task-21/RESEARCH.md:56-87`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:6-10`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:5-8`

- claim: No live T1 changes are needed because T1 coverage is comprehensive, has no significant gaps, and has no internal contradictions.
- ruling: reject
- final reasoning: This is the proposal's main overreach. The conclusion "do not import T2's task-21 fix" survives, but the live T1 docs are not contradiction-free. The playbook attributes task-21 Check 10 to department reuse in one section, then later maps task-21 Check 10 to standard worktime. The trusted standard also upgrades `employeeNumber` / `employmentId` from an unconfirmed task-21 hypothesis into imperative "always set" language, while the playbook still treats it as awaiting production confirmation. That is enough to block a clean hold.
- evidence: `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:17-21`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:99-113`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:38-45`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:76-87`; `tasks/tripletex/data/production/runs/prod-2026-03-22-095150570Z-cce321cd/codex-score-reflection.summary.md:12-18`

- claim: T2 is behind T1 across every dimension.
- ruling: weaken
- final reasoning: T1 is clearly ahead on the important production question for this task, because it has already falsified T2's main Check 5 theory and already contains the reused occupation mappings. But "every dimension" is inflated. Some of the proposal's support points are cross-task or not meaningful for task 21 specifically, and T1 itself still has unresolved wording and attribution issues.
- evidence: `tasks/tripletex2/src/tasks/task-21/RESEARCH.md:42-55`; `tasks/tripletex/data/production/runs/prod-2026-03-22-025848551Z-fd3075b7/codex-score-reflection.summary.md:17-24`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:17-21`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:99-113`

## Queue-worthy delta
- Preserve only this: do not port T2's `remunerationType = NOT_CHOSEN` task-21 recommendation into Tripletex1. At most, keep the tilbudsbrev field inventory as low-priority reference material, not as a scoring import.

## Missed live contradictions / stale assumptions
- The live playbook contradicts itself on task-21 Check 10: early sections tie the task-21 fix to department reuse, while the guessed task-21 check map later says Check 10 is standard worktime. See `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:17-21` versus `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:99-113`.
- The live T1 surfaces overstate Rule 5 certainty. The trusted standard says always set `employeeNumber` and `employmentId` as if this is the fix, but the playbook still describes it as a new hypothesis awaiting task-21 production confirmation. See `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:38-45` versus `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:76-87`.
- The proposal's "no changes proposed" stance implicitly assumes T1 task-21 wording is settled after the `payrollTaxMunicipalityId` falsification, but the live docs still carry unresolved attribution and certainty drift.

## Bottom line
This task deserves low priority in the final ranking. The proposal is worth salvaging only because it correctly blocks a harmful T2 import, but it does not deliver a new production-scoring win and it overstates how settled the current T1 task-21 guidance really is.
