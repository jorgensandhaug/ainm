# Task 13 adversary review

## Verdict
- salvage
- production leverage: 38
- confidence: 91
- total score: 63

## Claim-by-claim judgments

- claim: AGENTS.md per-diem contradiction must be resolved in favor of the newer no-per-diem path
- judgment: weaken
- why: The contradiction is real, but the proposal overstates both novelty and certainty. This is mostly a Tripletex1 self-consistency repair, not a proven Tripletex2 import. It also misses that `common-endpoints.md` still carries the older multi-day per-diem branch, so "fix AGENTS" is incomplete.
- evidence: `tasks/tripletex/codex-environment/AGENTS.md:476-485` still instructs per-diem creation and `isCompensationFromRates: true`; `tasks/tripletex/codex-environment/trusted-standards/register-travel-expense.md:16-20` and `tasks/tripletex/codex-environment/task-playbooks/register-travel-expense.md:20-24` say omit per diems and set `isCompensationFromRates: false`; `tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md:612-623` still documents the per-diem/rate branch.

- claim: Import Tripletex2's duration-only date formula (`returnDate=today`, `departureDate=today-(N-1)`)
- judgment: reject
- why: This is sandbox-only and directly collides with live Tripletex1 guidance that the underspecified no-date/no-departureFrom family is not a proven exact-match path. Freezing one formula into trusted markdown would turn an unproven guess into production guidance.
- evidence: `tasks/tripletex/codex-environment/AGENTS.md:332` says neither fallback date inference is scorer-proven; `tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md:622-623` says the API accepts multiple inferred variants and does not reveal which is scorer-correct; `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:85-103` implements the formula; `tasks/tripletex2/src/tasks/task-13/RESEARCH.md:37-44` only claims sandbox success.

- claim: Import the destination inference heuristic from v3
- judgment: reject
- why: This is implementation residue, not production-backed markdown guidance. The heuristic is brittle, English/Norwegian-token-specific, and not shown to improve score.
- evidence: `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:115-145` is a token heuristic with hand-maintained exclusion lists; no production result in `tasks/tripletex2/src/tasks/task-13/RESEARCH.md` ties it to score gains.

- claim: Surface the VAT disagreement (`vatType: 0` vs category default) as an import candidate
- judgment: reject
- why: This is not a positive import. It is evidence that the supposed upstream material is drifting. The proposal is too gentle about that. T2 says "`0` per trusted standard" while live Tripletex1 says the opposite.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-travel-expense.md:154-158` says use `costCategory.vatType.id`, fallback to `0` only on `VAT_NOT_REGISTERED`; `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:253-263` hardcodes `vatType: { id: 0 }`; `tasks/tripletex2/src/tasks/task-13/RESEARCH.md:37-43` incorrectly describes that as "per trusted standard."

- claim: createVouchers is the strongest untested hypothesis and should be elevated
- judgment: weaken
- why: The evidence for createVouchers being high-leverage is real, but Tripletex1 already includes that step in both the trusted standard and playbook. The useful part is emphasis, not a substantive import. The proposal also fails to separate "createVouchers is unscored and promising" from the stronger claim that the no-per-diem branch is already proven.
- evidence: `tasks/tripletex2/src/tasks/task-13/RESEARCH.md:18-33` shows all 22 production runs omitted `:createVouchers`; `tasks/tripletex/codex-environment/trusted-standards/register-travel-expense.md:151-152` and `tasks/tripletex/codex-environment/task-playbooks/register-travel-expense.md:157-159` already require `deliver -> approve -> createVouchers`.

## Missed problems in the proposal

- It misses a live contradiction outside `AGENTS.md`: `tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md:612-623` still documents the multi-day per-diem branch, rate lookup, and minimal create+deliver path for this family.
- It underplays how compromised the Tripletex2 source is. `tasks/tripletex2/src/tasks/task-13/README.md:5` says the task should follow the Tripletex1 trusted standard, but `tasks/tripletex2/src/tasks/task-13/task.ts:24-54,77-78` still requires `perDiemCompensations`, and `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:210-252,360-380` still fetches rates and posts per-diem rows.
- It frames "per-diem presence is the root cause" too strongly. Current evidence is confounded because the historical plateau also omitted `:createVouchers`; there is still no cited production proof isolating per diems from lifecycle completion.
- It treats duplicated detailed rules across `AGENTS.md`, the trusted standard, the playbook, and `common-endpoints.md` as a local patch problem rather than the structural reason these contradictions keep reappearing.

## Minimal salvage set

- Repair live T1 consistency on the travel-expense path, but frame it as a Tripletex1 cleanup, not a validated T2 import.
- Remove or drastically shrink the stale detailed per-diem block in `AGENTS.md` so it points to the trusted standard instead of re-specifying contradictory travel-expense mechanics.
- Align `common-endpoints.md` with the current trusted travel-expense standard, or explicitly scope its per-diem branch away from task 13.
- If any wording is carried forward, keep only the narrow statement that `:createVouchers` remains the strongest unscored hypothesis and is already mandatory in the current trusted flow.

## Bottom line

This proposal should not survive queue triage unchanged. The only worthwhile part is a narrow Tripletex1 consistency cleanup across live surfaces; the supposed Tripletex2 imports are mostly unproven, internally inconsistent, or already present in Tripletex1. Salvage the cleanup, drop the stronger causal and date-formula claims.
