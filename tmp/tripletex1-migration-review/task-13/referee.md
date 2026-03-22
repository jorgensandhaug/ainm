# Task 13 referee review

## Final verdict
- salvage
- final production leverage: 41
- confidence: 92
- rank note: This should sit below genuinely net-new score unlocks, but above cosmetic queue items, because the live travel-expense guidance is internally contradictory in a way that can steer runs back onto the stale per-diem path. The worthwhile part is a narrow Tripletex1 consistency repair, not a broad Tripletex2 import.

## Final claim rulings
- claim: AGENTS.md per-diem contradiction must be resolved in favor of the newer no-per-diem path
- ruling: keep
- final reasoning: The contradiction is real and score-relevant enough to preserve, but only as a narrowed Tripletex1 cleanup. Live `trusted-standards/register-travel-expense.md` and `task-playbooks/register-travel-expense.md` already say omit `perDiemCompensations` and set `isCompensationFromRates: false`, while `AGENTS.md` still tells agents to create per diems, use hardcoded rate types, and set `isCompensationFromRates: true`. That mismatch is worth fixing. The proposal overstates novelty and causality, though: current evidence does not isolate per-diem presence as the proven root cause, because the historical plateau also omitted `:createVouchers`. Also, the cleanup is incomplete unless it accounts for the older per-diem branch still present in `common-endpoints.md`.
- evidence: `tasks/tripletex/codex-environment/AGENTS.md:476-485`; `tasks/tripletex/codex-environment/trusted-standards/register-travel-expense.md:16-20,146-158,203-208`; `tasks/tripletex/codex-environment/task-playbooks/register-travel-expense.md:20-24,151-166,227-230`; `tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md:612-623`

- claim: Date computation from `tripDurationDays` should be imported as `returnDate=today`, `departureDate=today-(N-1)`
- ruling: reject
- final reasoning: This is sandbox-only and conflicts with live Tripletex1 guidance that the no-date/no-`departureFrom` family is not a proven exact-match path. Freezing one inference formula into trusted markdown would convert an unscored guess into production guidance. The specific formula is useful implementation residue inside T2, but not queue-worthy markdown guidance yet.
- evidence: `tasks/tripletex/codex-environment/AGENTS.md:332`; `tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md:622-623`; `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:85-104,164-167`; `tasks/tripletex2/src/tasks/task-13/RESEARCH.md:37-45`

- claim: Destination inference heuristic should be considered for porting
- ruling: reject
- final reasoning: This is brittle heuristic code, not production-backed guidance. It depends on hand-maintained token lists and language-specific exclusions, and nothing in the cited evidence ties it to score improvement. It should not be preserved in Tripletex1 markdown.
- evidence: `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:113-145`; `tasks/tripletex2/src/tasks/task-13/RESEARCH.md:37-45`

- claim: The VAT disagreement (`vatType: 0` vs category default) is worth carrying forward as an import candidate
- ruling: reject
- final reasoning: This is not a positive import. It is evidence that the T2 material is drifting and internally stale. Live Tripletex1 says use `costCategory.vatType.id` and fall back to `0` only on `VAT_NOT_REGISTERED`, while T2 v3 hardcodes `0` and even misstates that choice as being "per trusted standard". That is a warning sign, not guidance to port.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-travel-expense.md:154-158`; `tasks/tripletex/codex-environment/task-playbooks/register-travel-expense.md:161-166`; `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:253-263`; `tasks/tripletex2/src/tasks/task-13/RESEARCH.md:37-43`

- claim: `createVouchers` is the strongest untested hypothesis and should be elevated
- ruling: weaken
- final reasoning: The hypothesis is real and worth preserving only as emphasis. T1 already requires `deliver -> approve -> createVouchers` in both the trusted standard and playbook, so this is not a substantive import. The useful delta is to state more plainly that no production run has yet scored the `:createVouchers` branch. That point should stay clearly separated from the stronger and still unproven claim that removing per diems is already the proven fix.
- evidence: `tasks/tripletex2/src/tasks/task-13/RESEARCH.md:18-33,65-67`; `tasks/tripletex/codex-environment/trusted-standards/register-travel-expense.md:74-80,151-152,208`; `tasks/tripletex/codex-environment/task-playbooks/register-travel-expense.md:79-85,157-159`

## Queue-worthy delta
- Preserve only this: replace or drastically shrink the stale travel-expense block in `AGENTS.md` so it no longer contradicts the live trusted standard on per diems, and note that `:createVouchers` remains the strongest unscored step already required by the current trusted flow. If this cleanup is carried forward, it should also explicitly account for the older per-diem branch still present in `trusted-standards/common-endpoints.md`.

## Missed live contradictions / stale assumptions
- The proposal missed that `tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md:612-623` still documents the older multi-day per-diem/rate branch, so "fix AGENTS.md" alone does not fully restore live consistency.
- It underplayed how compromised the Tripletex2 source still is: `tasks/tripletex2/src/tasks/task-13/README.md:5` says follow the T1 trusted standard, but `tasks/tripletex2/src/tasks/task-13/task.ts:24-30,43-54,77-78` still requires `perDiemCompensations`, and `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:210-223,237-252` still performs rate lookup and POSTs per-diem rows.
- It treated the issue as a local AGENTS mismatch, but the deeper problem is duplicated detailed travel-expense rules across multiple live surfaces. That duplication is why this contradiction reappeared.

## Bottom line
- Low-to-medium priority in the final ranking. There is a real score-protective cleanup here, but it is mostly a Tripletex1 self-consistency repair plus slightly sharper wording around `:createVouchers`, not a strong net-new migration from Tripletex2.
