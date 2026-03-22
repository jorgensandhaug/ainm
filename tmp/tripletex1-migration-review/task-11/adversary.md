# Task 11 adversary review

## Verdict
- salvage
- production leverage: 14
- confidence: 92
- total score: 27

## Claim-by-claim judgments
- claim: T1 is already correct and comprehensive enough that `AGENTS.md` needs no changes.
- judgment: reject
- why: The trusted standard and playbook are strong, but `AGENTS.md` is not internally consistent on T11. One live section says both T11 and T20 must use `importDocument`; another later section recommends a 3-call direct `POST /ledger/voucher` path and explicitly says not to use `importDocument`. Calling AGENTS "correct and comprehensive" while leaving that contradiction untouched is not defensible, and that contradiction is more production-relevant than the proposal's minor duplicate-supplier addition.
- evidence: `tasks/tripletex/codex-environment/AGENTS.md:147-150`; `tasks/tripletex/codex-environment/AGENTS.md:381-383`

- claim: Import the duplicate-supplier `409`/duplicate-shaped `422` recovery note into the trusted standard and playbook.
- judgment: keep
- why: This is the only clearly net-new operational detail. T1 already tells the operator to go lookup-first when the supplier explicitly exists or when retry/persistent-account conditions make duplicates plausible, but it does not explicitly document the create-first recovery branch after a failed `POST /supplier`. That is worth carrying forward as a small defensive note, not as a score-moving migration.
- evidence: `tasks/tripletex2/src/tasks/task-16/strategies/import-and-book-voucher-v2.ts:279-307`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:40-42`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:186-190`

- claim: Import the T2 score-gap analysis, especially the booked-vs-unbooked hypothesis and immutable-description blocker framing.
- judgment: reject
- why: This is not materially net-new guidance. T1 already documents both actionable conclusions: booking likely unlocks one more check, and the immutable importDocument description is the likely remaining blocker. T2 RESEARCH also admits the booked-vs-unbooked evidence is cross-task from T20 rather than direct T11 proof, so it is background context, not a markdown delta.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:56-59`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md:40-42`; `tasks/tripletex2/src/tasks/task-16/RESEARCH.md:25-27`; `tasks/tripletex2/src/tasks/task-16/RESEARCH.md:46-49`

- claim: T2 v2's omissions are useful negative evidence showing T1 should be preserved as-is.
- judgment: weaken
- why: The direction is right, but the proposal misses the strongest negative evidence. The T2 XML hardcodes buyer org `999999999`, while live T1 explicitly warns the buyer org must be a valid mod11 number and standardizes on `987654325`. That invalid buyer id is stronger production evidence than "missing verification GETs" and more likely to hard-fail `importDocument`. Also, T2's own README says the intended deterministic path should follow T1's trusted standard, which weakens any novelty framing.
- evidence: `tasks/tripletex2/src/tasks/task-16/strategies/import-and-book-voucher-v2.ts:563-583`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:87-94`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:198-200`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md:52-57`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md:157-158`; `tasks/tripletex2/src/tasks/task-16/README.md:5`

- claim: T1 is simply "more comprehensive than T2" on this task.
- judgment: weaken
- why: That is true for the trusted standard and playbook, but too broad as written. The live T1 surface still includes contradictory top-level AGENTS guidance for T11. The proposal should have said "the T11 trusted standard and playbook are ahead of T2, but AGENTS still has a live contradiction" instead of presenting T1 as uniformly settled.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:23-217`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md:19-183`; `tasks/tripletex/codex-environment/AGENTS.md:147-150`; `tasks/tripletex/codex-environment/AGENTS.md:381-383`

## Missed problems in the proposal
- It misses a live contradiction in `AGENTS.md`: the file simultaneously mandates `importDocument` for T11 and later recommends direct `POST /ledger/voucher` for the same task shape.
- It misses the strongest T2 regression signal: buyer org `999999999` in the XML, which conflicts with T1's mod11-valid buyer-org rule and is direct `422` territory.
- It frames T2 as a source of candidate improvements even though `tasks/tripletex2/src/tasks/task-16/README.md:5` already says the intended deterministic path should follow T1's trusted standard.
- It uses stale target-path framing (`trusted-standards/...`, `task-playbooks/...`, `AGENTS.md`) instead of naming the actual live surfaces under `tasks/tripletex/codex-environment/`, which is avoidable execution sloppiness in a migration queue doc.
- It overstates the duplicate-supplier branch as if it were production-score leverage. On fresh accounts, T1 already prefers create-first; the recovery note is robustness, not a leaderboard unlock.

## Minimal salvage set
- Keep one narrow addition in the T11 trusted standard and playbook: if create-first `POST /supplier` fails with duplicate-like `409` or duplicate-shaped `422`, resolve by `GET /supplier?organizationNumber=...&fields=*` and continue with the existing supplier instead of retrying the write.
- Drop the score-gap-analysis import entirely.
- Drop the "no AGENTS changes" conclusion; at minimum, explicitly flag the live AGENTS contradiction instead of calling that surface comprehensive.

## Bottom line
- This proposal should survive only as a trimmed, low-priority salvage. The only real import is a small duplicate-supplier recovery branch. Everything else is either already in T1, too speculative to port, or weakened by the proposal's failure to surface the live `AGENTS.md` contradiction and the stronger T2 regression around the invalid buyer org.
