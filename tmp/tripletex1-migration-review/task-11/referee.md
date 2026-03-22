# Task 11 referee review

## Final verdict
- salvage
- final production leverage: 17
- confidence: 93
- rank note: This should likely sit in the lower half of the queue. It preserves one real defensive delta, but it is not a meaningful leaderboard unlock and the proposal misses a more important live contradiction in `AGENTS.md`.

## Final claim rulings
- claim: T1 is already correct and comprehensive enough that `AGENTS.md` needs no changes.
- ruling: reject
- final reasoning: The T11 trusted standard and playbook are strong, but the live top-level agent surface is not internally settled. `AGENTS.md` explicitly mandates `importDocument` for T11, then later recommends a lower-call direct `POST /ledger/voucher` path and says not to use `importDocument`. On a production-score axis, that contradiction is more consequential than the proposal's small duplicate-supplier addition, so "no AGENTS changes" is not defensible.
- evidence: `tasks/tripletex/codex-environment/AGENTS.md:147`; `tasks/tripletex/codex-environment/AGENTS.md:148`; `tasks/tripletex/codex-environment/AGENTS.md:382`

- claim: Import the duplicate-supplier `409` / duplicate-shaped `422` recovery note into the trusted standard and playbook.
- ruling: keep
- final reasoning: This is the only clearly net-new operational detail. Live T1 already says to switch to lookup-first when the supplier explicitly exists or the run is retry/persistent, but it does not spell out the create-first recovery branch after a failed `POST /supplier`. That is a safe additive robustness note. Its score leverage is still modest because real production accounts are documented as fresh by default, so the duplicate branch is usually not the frontier path.
- evidence: `tasks/tripletex2/src/tasks/task-16/strategies/import-and-book-voucher-v2.ts:279`; `tasks/tripletex2/src/tasks/task-16/strategies/import-and-book-voucher-v2.ts:301`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:40`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:42`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:186`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:190`

- claim: Import the T2 score-gap analysis, especially the booking hypothesis and immutable-description blocker framing.
- ruling: reject
- final reasoning: This is not materially net-new guidance. Live T1 already documents the two operational conclusions that matter: booking likely unlocks one more check, and the immutable importDocument description is the likely remaining blocker. T2's version adds context, but it does not add a new runnable markdown delta.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:56`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:59`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md:40`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md:42`; `tasks/tripletex2/src/tasks/task-16/RESEARCH.md:46`; `tasks/tripletex2/src/tasks/task-16/RESEARCH.md:49`

- claim: T2 v2's omissions are useful negative evidence showing T1 should be preserved as-is.
- ruling: weaken
- final reasoning: The direction is right, but the proposal does not surface the strongest negative evidence. The T2 XML hardcodes buyer org `999999999`, while live T1 explicitly standardizes on mod11-valid buyer org `987654325` and documents invalid buyer org as direct `422` territory. That is stronger production-relevant evidence than the proposal's softer comparison points. T2's own README also says the intended deterministic path should follow the live T1 trusted standard, which reduces the novelty of this "T1 is ahead" framing.
- evidence: `tasks/tripletex2/src/tasks/task-16/strategies/import-and-book-voucher-v2.ts:565`; `tasks/tripletex2/src/tasks/task-16/strategies/import-and-book-voucher-v2.ts:582`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:88`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:200`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md:57`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md:157`; `tasks/tripletex2/src/tasks/task-16/README.md:5`

- claim: T1 is simply more comprehensive than T2 on this task.
- ruling: weaken
- final reasoning: That is true for the T11 trusted standard and playbook, but too broad for the full live surface. `AGENTS.md` still contains contradictory T11 guidance, so the proposal should not present the entire T1 runtime as uniformly settled.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:23`; `tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md:217`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md:19`; `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md:183`; `tasks/tripletex/codex-environment/AGENTS.md:147`; `tasks/tripletex/codex-environment/AGENTS.md:382`

## Queue-worthy delta
- Preserve one narrow addition only: in the T11 trusted standard and playbook, add an explicit create-first recovery branch that if `POST /supplier` fails with duplicate-like `409` or duplicate-shaped `422`, the runtime should resolve the supplier by `GET /supplier?organizationNumber=...&fields=*` and continue with the existing supplier instead of retrying the create.

## Missed live contradictions / stale assumptions
- The proposal misses a real live contradiction in `tasks/tripletex/codex-environment/AGENTS.md`: one section mandates `importDocument` for T11, while a later section recommends direct `POST /ledger/voucher` and explicitly says not to use `importDocument`.
- The proposal understates the strongest T2 regression signal: `import-and-book-voucher-v2.ts` hardcodes buyer org `999999999`, directly conflicting with live T1's mod11-valid buyer-org rule.
- The proposal names target surfaces imprecisely as `trusted-standards/...`, `task-playbooks/...`, and `AGENTS.md` rather than the actual live paths under `tasks/tripletex/codex-environment/`, which is avoidable migration sloppiness.

## Bottom line
This is a low-priority salvage, not an adoptable migration. The only thing worth porting is a small duplicate-supplier recovery note for retry or persistent-account cases; everything else is already in live T1, weakened by missed contradictions, or too non-actionable to matter for production score.
