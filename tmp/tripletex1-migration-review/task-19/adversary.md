# Task 19 adversary review

## Verdict
- reject
- production leverage: 10
- confidence: 90
- total score: 27

## Claim-by-claim judgments

- claim: T2 v3 direct-POST department should not be imported into Tripletex1.
- judgment: keep
- why: This is the proposal's strongest call. The live shared onboarding surface already treats department search-first as mandatory because GETs are free and duplicate departments can cost points. Task 21 has production evidence that search-first fixes Check 10, so a task-19-local "fresh account" shortcut is not safe to port into the shared standard.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:47-52`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:57-67`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:17-21`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:89-97`; `tasks/tripletex2/src/tasks/task-19/RESEARCH.md:52-67`; `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:75-87`; `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:112-118`

- claim: T2's "Check 10 = standard worktime" hypothesis should not be imported.
- judgment: keep
- why: Also correct. T2 formed that theory from two early runs where standard worktime was omitted. Tripletex1 later recorded task-19 production history with `POST /employee/standardTime` present and Check 10 still failing, so this is stale frontier memory, not a live import.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:54-59`; `tasks/tripletex2/src/tasks/task-19/RESEARCH.md:35-43`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:62-63`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:19-21`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:89-97`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:164-166`

- claim: T2 normalization logic is not importable to Tripletex1 markdown.
- judgment: weaken
- why: The proposal is directionally right that a full code-level port would be noise. But the absolute dismissal is too strong. A few compact examples are markdown-portable if they ever prove useful, especially `0.8 -> 80`, `mailto:` / `<...>` email cleanup, and enum coercions like `Fastlonn -> MONTHLY_WAGE`. I do not think these are high-leverage enough to keep this task alive, but "none of this is importable" overstates the case.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:61-66`; `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:198-237`; `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:263-285`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:177-181`; `tasks/tripletex/codex-environment/AGENTS.md:400-402`

- claim: T2's STYRK 3313 and 3323 mapping corrections are not new.
- judgment: keep
- why: Correct but low leverage. Tripletex1 already contains the corrected mappings and the failed wrong mappings with production notes, so there is no migration delta here.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:68-73`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:196-209`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:38-49`

- claim: No imports are needed, so this task should advance as a hold/no-op queue item.
- judgment: reject
- why: This is where the proposal falls apart as migration-queue material. It proposes no markdown delta in AGENTS, no delta in the trusted standard, and no delta in the playbook. That makes it a status report about why T2 is behind, not a production-score-moving import proposal. The queue should not spend a task slot on a document whose output is "change nothing."
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:75-99`; `tasks/tripletex/docs/tripletex1-migration-queue/README.md:4-5`; `tasks/tripletex/docs/tripletex1-migration-queue/README.md:57-63`

- claim: "Gaps identified: None."
- judgment: weaken
- why: This is too strong. The live Tripletex1 surfaces still explicitly say task 19 Check 10 is unknown, and the latest task-19 branch with `employeeNumber` / `employmentId` applied is still not closed out with a scored result. The proposal can say T1 is ahead of T2 here; it cannot honestly say the frontier is closed.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:41-43`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:62-63`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:19-21`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:97`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:164-166`

## Missed problems in the proposal

- It is not really a migration proposal. It occupies a queue file while proposing zero live markdown changes.
- It overstates certainty with "Gaps identified: None" even though the missing 2 raw points for task 19 still sit in an unresolved Check 10 frontier.
- It frames the normalization import as completely non-portable, when the reality is narrower: not worth porting now, but not literally impossible to express in markdown.
- It leans on "T2 is behind T1" as if that alone justifies queue survival. It does not. Being correct that T2 is behind is not the same as identifying a useful import.
- It quietly extends the task-21 `employeeNumber` / `employmentId` hypothesis onto task 19 in the current-coverage summary, but the task-19 production record shown in the live playbook is not yet sufficient to treat that as settled score-moving guidance for this task.

## Minimal salvage set

- Keep the rejection of T2's direct-POST-department shortcut.
- Keep the rejection of T2's stale "Check 10 = standard worktime" theory.
- If a human insists on extracting one tiny residue, note only that a couple of normalization examples could be added later as low-priority guardrails, but this is documentation polish, not frontier score leverage.

## Bottom line

This proposal should not survive queue triage. Its substantive anti-import calls are mostly right, but the document produces no Tripletex1 markdown delta, overstates how closed task 19 really is, and does not identify any net-new scorer-backed import worth carrying forward.
