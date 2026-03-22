# Task 19 referee review

## Final verdict
- reject
- final production leverage: 8
- confidence: 92
- rank note: This should likely sit near the bottom of the queue. Its best insights are mostly confirmations that Tripletex1 is already ahead here, not scorer-moving imports for the live markdown.

## Final claim rulings
- claim: T2 v3's direct-POST department branch should not be imported into Tripletex1.
- ruling: keep
- final reasoning: This is the proposal's strongest call. The live shared onboarding guidance already treats department search-first as the safer shared rule, GETs are free in the T1 score model, and task 21 has production evidence that reuse-first can matter. T2's branch is a stale task-local call-count optimization built on the assumption that production accounts are always fresh.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:47-52`; `tasks/tripletex2/src/tasks/task-19/RESEARCH.md:52-67`; `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:75-87`; `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:112-115`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:57-63`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:17-21`; `tasks/tripletex/codex-environment/AGENTS.md:309-311`

- claim: T2's "Check 10 = standard worktime" hypothesis should not be imported.
- ruling: keep
- final reasoning: T2 formed this from two early task-19 runs where standard worktime was omitted. Later Tripletex1 production evidence already falsified the stronger version of that theory: task 19 still failed Check 10 after `POST /employee/standardTime` was included. The live docs are correct to leave task-19 Check 10 as UNKNOWN.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:54-59`; `tasks/tripletex2/src/tasks/task-19/RESEARCH.md:24-43`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:18-22`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:62-63`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:19-21`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:90-97`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:164-166`

- claim: T2 v3 normalization logic is not importable to Tripletex1 markdown.
- ruling: weaken
- final reasoning: The proposal is right that a full code-level port would be noise. But "not importable" is too absolute. A few compact examples are markdown-portable in principle, such as `0.8 -> 80`, stripping `mailto:` or angle brackets from email values, and coercions like `Fastlønn -> MONTHLY_WAGE` or `Dagtid -> NOT_SHIFT`. They still look like low-value polish rather than meaningful production leverage, especially because T1 already covers the high-signal parts.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:61-66`; `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:198-237`; `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:255-285`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:18-22`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:51-55`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:181`; `tasks/tripletex/codex-environment/AGENTS.md:400-402`

- claim: T2's STYRK 3313 and 3323 mapping corrections are already present in Tripletex1.
- ruling: keep
- final reasoning: Correct. The live standard and playbook already contain both corrected ids and the wrong mappings that failed in production, so there is no net-new migration delta here.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:68-73`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:196-206`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:38-49`

- claim: No imports are needed, so this task should survive as a hold / no-op queue item.
- ruling: reject
- final reasoning: This is the proposal's main failure. A migration-queue item that proposes no AGENTS delta, no trusted-standard delta, and no playbook delta is not improving Tripletex1's frontier markdown. The document is mostly a status report explaining why T2 is behind T1.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:75-99`; `tasks/tripletex/docs/tripletex1-migration-queue/README.md:4-5`; `tasks/tripletex/docs/tripletex1-migration-queue/README.md:57-63`

- claim: "Gaps identified: None."
- ruling: weaken
- final reasoning: T1 is ahead of T2 on this task, but the frontier is not closed. The live docs still explicitly mark task-19 Check 10 as unknown, and the newer task-19 branch that also applies `employeeNumber` / `employmentId` does not yet have a scored production outcome.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:41-43`; `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:62-63`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:19-21`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:97`; `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:164-166`

## Queue-worthy delta
- None queue-worthy. The only marginal residue is a low-priority wording tweak like `0.8 -> 80` or stripping `mailto:` / `<...>` around emails, and that is documentation polish rather than production score leverage.

## Missed live contradictions / stale assumptions
- The proposal says "Gaps identified: None," but the live trusted standard and playbook still record task-19 Check 10 as unresolved.
- The proposal treats Rule 5 as already applied to task 19 in the coverage summary, but the live task-19 production record with `employeeNumber="1"` and `employmentId="1"` is still unscored, so that branch is not yet closed for this task.

## Bottom line
- Low priority, bordering on negligible. Keep the anti-import conclusions mentally, but this queue entry should not advance because it does not identify a net-new, scorer-backed Tripletex1 markdown change.
