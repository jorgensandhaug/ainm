# Task 30 referee review

## Final verdict
- salvage
- final production leverage: 63
- confidence: 88
- rank note: This should likely sit below production-backed queue items and below tasks whose main import is already stabilized in live Tripletex2. It stays above negligible-priority cleanup because the asset-register branch is still a plausible next scored experiment, but not a canonical import yet.

## Final claim rulings
- claim: Register each asset via `POST /asset` / `POST /asset/list` because missing asset-register state is the likely reason checks 4+5 fail.
- ruling: weaken
- final reasoning: This is genuinely net-new versus live Tripletex1 and could matter, but the proposal jumps from sandbox state-shape evidence to a production-scoring conclusion too quickly. Repo-local production reflection still points at the prepaid reversal as the live leading failure theory, and current Tripletex2 task/runtime surfaces do not treat asset-register state as established doctrine. This belongs in a "next production experiment" lane, not as a trusted-standard rewrite.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-30.md`; `tasks/tripletex/data/production/runs/prod-2026-03-21-195120731Z-f672a798/codex-score-reflection.summary.md`; `tasks/tripletex2/src/tasks/task-30/task.ts`; `tasks/tripletex2/src/tasks/task-30/RESEARCH.md`; `tasks/tripletex/sandbox-investigation/179-task30-asset-depreciation-flow.ts`; `tasks/tripletex/sandbox-investigation/187-task30-asset-register.ts`

- claim: Add `FIXED_ASSETS_REGISTER` activation before any asset creation.
- ruling: weaken
- final reasoning: As an API prerequisite, this looks real. But it only has score value if the asset-register branch itself is correct, and that branch is not production-proven. Preserve it only as part of an experimental note, not as current canonical flow.
- evidence: `tasks/tripletex/sandbox-investigation/177-task30-activate-asset-module.ts`; `tasks/tripletex/sandbox-investigation/178-task30-activate-modules.ts`; `tasks/tripletex/docs/tripletex1-migration-queue/task-30.md`

- claim: Link depreciation vouchers to assets with `posting.asset: { id: assetId }`.
- ruling: reject
- final reasoning: The evidence only shows API acceptance, not scorer relevance. The surrounding asset payload is also still unstable across the cited scripts, especially on `depreciationAccount`, which is not good enough for trusted-standard guidance.
- evidence: `tasks/tripletex/sandbox-investigation/180-task30-full-e2e-with-assets.ts`; `tasks/tripletex/sandbox-investigation/178-task30-activate-modules.ts`; `tasks/tripletex/sandbox-investigation/187-task30-asset-register.ts`; `tasks/tripletex/sandbox-investigation/191-task30-asset-depreciation-deep.ts`

- claim: The live docs are stale in saying account `8700` exists in the default chart; it may need creation, while `8300` is the native Tripletex tax-cost account.
- ruling: keep
- final reasoning: This is the cleanest import in the proposal. It corrects a live factual error without requiring any speculative scoring theory. It should be preserved independently from the asset-register package.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/simplified-year-end-closing.md`; `tasks/tripletex/codex-environment/task-playbooks/simplified-year-end-closing.md`; `tasks/tripletex/sandbox-investigation/182-task30-prompt-accounts-test.ts`; `tasks/tripletex/docs/tripletex1-migration-queue/task-30.md`

- claim: Always post the tax voucher even when `taxAmount == 0`.
- ruling: reject
- final reasoning: This is evaluator-guessing without production evidence. The repo only shows that Tripletex accepts a zero voucher, not that the scorer rewards it.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-30.md`; `tasks/tripletex/sandbox-investigation/170-task30-zero-tax-voucher.ts`; `tasks/tripletex2/src/tasks/task-30/strategies/simplified-annual-closing-v2.ts`

- claim: Replace integer tax rounding with `r2(...)`.
- ruling: reject
- final reasoning: The measured differences are tiny, the current failures are elsewhere, and even the proposal's own evidence leans toward whole-kroner tax rounding. This is not meaningful production leverage.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-30.md`; `tasks/tripletex2/src/tasks/task-30/strategies/simplified-annual-closing-v3.ts`

## Queue-worthy delta
- Correct the live task-30 docs so they no longer claim account `8700` exists in the default chart; document that it may need creation before use.

## Missed live contradictions / stale assumptions
- The proposal does not reconcile the current live production reflection that checks 4+5 most likely map to the prepaid reversal path, not necessarily missing asset-register state: `tasks/tripletex/data/production/runs/prod-2026-03-21-195120731Z-f672a798/codex-score-reflection.summary.md`.
- The proposal treats the asset-register package as import-ready even though live Tripletex2 still frames task 30 around tax-account behavior and says prompt asset account numbers are identifiers rather than voucher-driving fields: `tasks/tripletex2/src/tasks/task-30/task.ts`; `tasks/tripletex2/src/tasks/task-30/RESEARCH.md`.
- The proposal understates payload drift inside its own supporting sandbox scripts: `depreciationAccount` is `1209` in some scripts and `6010` in others, which is too unstable for trusted-standard markdown.
- The live Tripletex1 surface already centers `YEAR_END_REPORTING_AS` activation as the primary open production hypothesis, so the queue doc's "important gaps" framing is too narrow: `tasks/tripletex/codex-environment/AGENTS.md`; `tasks/tripletex/codex-environment/trusted-standards/simplified-year-end-closing.md`.

## Bottom line
This task deserves low-to-medium priority in the final ranking. Preserve the `8700` factual correction, but keep the asset-register branch out of canonical Tripletex1 guidance until at least one scored production run shows it beats the current prepaid-reversal and module-activation hypotheses.
