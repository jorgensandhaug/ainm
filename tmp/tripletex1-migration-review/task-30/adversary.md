# Task 30 adversary review

## Verdict
- salvage
- production leverage: 58
- confidence: 87
- total score: 44

## Claim-by-claim judgments

- claim: Register each asset via `POST /asset` or `POST /asset/list` so `yearEnd.tangibleFixedAssets` is populated, because manual depreciation vouchers alone likely cannot pass checks 4+5.
- judgment: weaken
- why: The sandbox evidence is enough to justify a scored experiment, not a trusted-standard rewrite. The proposal jumps from "this populates `tangibleFixedAssets`" to "this likely fixes checks 4+5" without production proof. Repo-local production reflection already points in a different direction: checks 1-3 and 6 passed while the prepaid reversal was singled out as the likely problem. This is also not a clean Tripletex2 import; the current T2 task surface still says asset account numbers identify assets but are not used in voucher postings.
- evidence:
  - `tasks/tripletex/docs/tripletex1-migration-queue/task-30.md`: admits the asset-register package was never production-tested.
  - `tasks/tripletex/data/production/runs/prod-2026-03-21-195120731Z-f672a798/codex-score-reflection.summary.md`: argues checks 4+5 are most likely tied to the prepaid reversal, not depreciation or tax.
  - `tasks/tripletex2/src/tasks/task-30/task.ts`: says asset account numbers are identifiers and "are not used in voucher postings."
  - `tasks/tripletex2/src/tasks/task-30/RESEARCH.md`: still frames the frontier around tax-account behavior, not asset-register state.

- claim: Activate `FIXED_ASSETS_REGISTER` before `POST /asset`; otherwise `/asset` returns 403.
- judgment: weaken
- why: This looks true as an API prerequisite, but only if the team chooses to test the asset-register branch. It has almost no standalone score value. Promoting it into the canonical flow now would mean endorsing the whole unproven asset theory stack.
- evidence:
  - `tasks/tripletex/sandbox-investigation/178-task30-activate-modules.ts`: shows `POST /company/salesmodules { name: "FIXED_ASSETS_REGISTER" }` before asset creation.
  - `tasks/tripletex/docs/tripletex1-migration-queue/task-30.md`: ties this step directly to the untested asset-register hypothesis, not to a production-confirmed fix.

- claim: Depreciation vouchers should include `posting.asset: { id: assetId }` so the scorer can associate vouchers with registered assets.
- judgment: reject
- why: This is the weakest part of the asset package. It is accepted by the API, but the proposal gives no evidence that the scorer needs it. The payload is also not stabilized: the surrounding asset-body conventions drift across the cited scripts, which is exactly the sort of ambiguity that should stay out of a trusted standard.
- evidence:
  - `tasks/tripletex/sandbox-investigation/180-task30-full-e2e-with-assets.ts`: only proves the API accepts `posting.asset`.
  - `tasks/tripletex/sandbox-investigation/178-task30-activate-modules.ts`: creates assets with `depreciationAccount: { id: 1209 }`.
  - `tasks/tripletex/sandbox-investigation/187-task30-asset-register.ts`: creates assets with `depreciationAccount: { id: 6010 }`.
  - `tasks/tripletex/sandbox-investigation/191-task30-asset-depreciation-deep.ts`: also uses `depreciationAccount: { id: 6010 }`.

- claim: The live docs are factually wrong that account `8700` exists in the default chart; it may need creation, while `8300` is the native tax-cost account.
- judgment: keep
- why: This is the clean, low-risk import. The live Tripletex1 docs still say `8700` exists by default, and repo-local evidence shows that assumption is unsafe. The proposal overreaches only when it tries to combine this factual correction with the larger asset-register rewrite.
- evidence:
  - `tasks/tripletex/codex-environment/trusted-standards/simplified-year-end-closing.md`: currently says `8700` exists in the default chart.
  - `tasks/tripletex/codex-environment/task-playbooks/simplified-year-end-closing.md`: repeats the same existence claim.
  - `tasks/tripletex/sandbox-investigation/182-task30-prompt-accounts-test.ts`: explicitly warns that `8700` may not exist.
  - `tasks/tripletex/docs/tripletex1-migration-queue/task-30.md`: correctly notes production runs batch-created `8700`.

- claim: Always post the tax voucher even when `taxAmount == 0`.
- judgment: reject
- why: This is speculative evaluator-guessing with no scored evidence. The only concrete repo evidence is that Tripletex accepts a zero voucher, not that the scorer wants one. It also conflicts with the current trusted standard and ordinary accounting expectations.
- evidence:
  - `tasks/tripletex/docs/tripletex1-migration-queue/task-30.md`: marks this as speculative and untested.
  - `tasks/tripletex/sandbox-investigation/170-task30-zero-tax-voucher.ts`: only tests API acceptance.
  - `tasks/tripletex2/src/tasks/task-30/strategies/simplified-annual-closing-v2.ts`: keeps it as a draft hypothesis, not a proved frontier.

- claim: Replace integer tax rounding with `r2(...)`.
- judgment: reject
- why: The measured differences are tiny, the current failures are larger and elsewhere, and even the proposal itself says Norwegian convention favors whole-kroner tax amounts. This is not production-score leverage.
- evidence:
  - `tasks/tripletex/docs/tripletex1-migration-queue/task-30.md`: lists this as low-confidence and theoretical.
  - `tasks/tripletex2/src/tasks/task-30/strategies/simplified-annual-closing-v3.ts`: this is still only a draft hypothesis layered on top of the already-unconfirmed 8300/2500 branch.

## Missed problems in the proposal

- live contradictions it missed
  - The live Tripletex1 standard and playbook were already updated on 2026-03-22 to revert from `8300/2500` back to prompt-specified `8700/2920` after `prod-80e639a8` failed identically. The queue proposal barely treats that live-state reversal as a first-class constraint.
  - `AGENTS.md` already carries task-30 guidance that the open production hypothesis is year-end module activation, not asset-register integration. The proposal frames the current gap too narrowly.

- stale assumptions
  - It treats the asset-register branch as if the payload were stable enough for canonical markdown, but the cited scripts disagree on `depreciationAccount` semantics.
  - It treats "all 14 runs only post ledger vouchers" as the key omission while underplaying the already-documented prepaid-reversal uncertainty from scored production reflections.
  - It treats this as a Tripletex2 import, but the active T2 runtime and research memory still center a different theory set.

- things framed too strongly
  - "PRIMARY HYPOTHESIS" and "adopt now" are too strong for a sandbox-only branch that has not been scored once in production.
  - "No mapping ambiguity" is too strong when the actual write payload for assets is still drifting.
  - "Checks 4+5 likely verify `yearEnd.tangibleFixedAssets`" is asserted without reconciling the contrary production reflection.

## Minimal salvage set

- Correct the factual claim that `8700` exists by default; document that it may need creation before use.
- Preserve the narrow note that asset `lifetime` should be documented in months if the asset-register branch is ever tested.
- If humans want the next experiment queued, add a non-canonical playbook note that the full asset-register package is a high-upside production test candidate, not the trusted default.

## Bottom line

This proposal should survive triage only in trimmed form. Keep the `8700` existence correction, but hold the asset-register rewrite out of the trusted standard until one scored production run proves it moves checks 4+5 better than the existing prepaid-reversal hypothesis.
