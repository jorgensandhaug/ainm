# Task 21 Finder Review

## Concise proposal summary

The proposal argues that Tripletex1 should import nothing from Tripletex2 for task 21. Its core claim is that T1 already surpassed T2 on the only score-moving question, because T1 production data disproves T2's main `remunerationType = NOT_CHOSEN` hypothesis, while the rest of T2's material is either duplicated or only informational.

## Candidate findings

### 1. Strength — correctly rejects the highest-risk import (`NOT_CHOSEN` as the Check 5 fix)
**Impact:** High (+10)

This is the proposal's strongest point and the main reason it should not be discarded outright. T2 still frames `NOT_CHOSEN` as the task-21 fix in `tasks/tripletex2/src/tasks/task-21/RESEARCH.md:42-54` and in the active strategy summary/hypothesis in `tasks/tripletex2/src/tasks/task-21/strategies/onboard-employee-offer-letter.ts:47-57`. T1 production evidence says that is wrong: `tasks/tripletex/data/production/runs/prod-2026-03-22-025848551Z-fd3075b7/codex-score-reflection.summary.md:17-24` shows a run with `NOT_CHOSEN` still scoring `12/14`, and the later T1 run matrix in `tasks/tripletex/data/production/runs/prod-2026-03-22-095436000Z-42b9ad7f/codex-trace.readable.md:260-269` distinguishes `fd3075b7` (`remType=NOT_CHOSEN`) from `0c8aec74` (`empType/whScheme=NOT_CHOSEN`). On the main production-score question, the proposal is directionally right.

### 2. Weakness — "Contradictions: None internal to T1" is false
**Impact:** High (+10)

The proposal overstates T1's internal coherence in `tasks/tripletex/docs/tripletex1-migration-queue/task-21.md:56-58`. T1's own playbook maps task-21 Check 10 to department reuse in `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:17-21` and `:89-90`, but later maps task-21 Check 10 to standard worktime in `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:99-112`. The trusted standard also states that department search-first fixed Check 10 in `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:57-63`. That is a real contradiction in the live T1 surfaces, and it matters because the proposal's "no changes proposed" recommendation relies on claiming T1 is already fully settled.

### 3. Weakness — the proposal leans on muddled evidence hygiene around the falsification run
**Impact:** Medium (+5)

The proposal repeatedly cites `prod-fd3075b7` as the key NOT_CHOSEN falsification run in `tasks/tripletex/docs/tripletex1-migration-queue/task-21.md:45` and `:67`, which is defensible. But it also says T1 has no internal contradictions, while the live T1 playbook still labels `0c8aec74` as the "NOT_CHOSEN test" in its production history table at `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:140-150`, and separately says `fd3075b7` used `NOT_CHOSEN` at `:25`. The primary production sources do resolve this split: `fd3075b7` tested `remunerationType=NOT_CHOSEN`, while `0c8aec74` tested `employmentType/workingHoursScheme=NOT_CHOSEN` (`prod-2026-03-22-042905443Z-0c8aec74/codex-score-reflection.summary.md:50-57`). The conclusion survives, but the proposal should have acknowledged and cleaned up the citation mess instead of declaring there were no contradictions.

### 4. Weakness — "Gaps: None significant" is too strong given T1 still hard-codes an unproven Rule 5
**Impact:** Medium (+5)

The proposal says T1 has "exhaustively analyzed Check 5" and that gaps are insignificant in `tasks/tripletex/docs/tripletex1-migration-queue/task-21.md:52-56`. That overreaches. T1 currently presents `employeeNumber` / `employmentId` as a must-do fix in the trusted standard at `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:38-44`, while the playbook still describes it as a new hypothesis awaiting task-21 production confirmation at `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:76-87`. That means the evidence is strong enough to reject T2's main import, but not strong enough to certify T1 as complete or contradiction-free.

### 5. Strength — correctly identifies the occupation-code import as non-new
**Impact:** Medium (+5)

The proposal is right that T2's six tilbudsbrev job-title mappings are already present in T1. Compare `tasks/tripletex/docs/tripletex1-migration-queue/task-21.md:76-81` with the existing T1 tables in `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:183-200` and `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:27-42`. There is no score leverage in re-porting those mappings.

### 6. Strength — the only actually net-new material is correctly treated as low leverage
**Impact:** Low (+1)

The decoded tilbudsbrev field inventory in T2 `RESEARCH.md` is genuinely a small net-new reference point, and the contamination audit is new history. But neither looks score-moving for T1 right now. The proposal handles that distinction reasonably in `tasks/tripletex/docs/tripletex1-migration-queue/task-21.md:69-75` and `:83-88`: these are informative, not production-porting wins.

## Explicit call: is the proposal actually net-new?

Materially net-new for Tripletex1 production score: **No**.

Marginally net-new in documentation terms: **Yes**, but only for the decoded tilbudsbrev field list and the T2 contamination narrative. Those are reference additions, not clear score levers.

## Explicit call: is the evidence strong enough for production-porting now?

**No.**

There is enough evidence to say "do not port T2's `NOT_CHOSEN` idea into T1." There is not enough evidence to justify the stronger claim that T1 needs no cleanup or that its task-21 reasoning is contradiction-free. The proposal's recommendation is mostly right, but its confidence is too high.

## Production score leverage score

**12/100**

This proposal mostly preserves the status quo and avoids a bad import. That has some defensive value, but it does not add a likely score-improving move for T1.

## Confidence

**85/100**

Confidence is fairly high because the main conclusion is backed by primary production evidence, but not maximal because the live T1 docs themselves are internally inconsistent on task-21 check attribution.

## Provisional one-line recommendation

**hold**

## Score

**36 points**

## Best insight in this task

Do **not** port T2's `remunerationType = NOT_CHOSEN` hypothesis into T1; the highest-value insight here is that T1 production already falsified it, so the only safe import is "reject that import."
