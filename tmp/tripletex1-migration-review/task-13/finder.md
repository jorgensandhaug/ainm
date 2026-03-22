# Task 13 Finder Review

## Concise proposal summary

The proposal argues that Tripletex1 should import or emphasize five things for travel-expense handling:
- align `AGENTS.md` with the newer no-per-diem guidance already present in the trusted standard and playbook
- emphasize `createVouchers` as the strongest remaining unscored hypothesis
- optionally adopt Tripletex2's concrete duration-only date formula
- leave `vatType` unresolved pending scoring
- avoid porting the destination heuristic for now

## Explicit call: is this actually net-new?

Mostly no.

The highest-value action here is a Tripletex1 internal consistency repair, not a genuine Tripletex2 import:
- Tripletex1 trusted standard already says omit `perDiemCompensations`, set `isCompensationFromRates: false`, and run `deliver -> approve -> createVouchers`.
- Tripletex1 playbook already mirrors that guidance.
- Tripletex2 `README.md` explicitly says this task should follow the Tripletex1 trusted standard.

So the proposal's main practical effect is "make `AGENTS.md` stop contradicting current T1 guidance", which is valuable, but not meaningfully net-new.

## Explicit call: is the evidence strong enough for production-porting now?

No, not as a migration/porting proposal.

The evidence is strong enough for one narrow action now:
- fix the stale `AGENTS.md` travel-expense block so it no longer instructs agents to create per-diems

The evidence is not strong enough to production-port the T2-derived date formula, destination heuristic, or any stronger causal claim that "per-diem presence is proven to be the root cause."

## Candidate findings

### Strengths

1. `[medium]` The proposal correctly identifies a real and important contradiction inside Tripletex1.
   Evidence:
   - `tasks/tripletex/codex-environment/trusted-standards/register-travel-expense.md:16-18,146-158` says omit `perDiemCompensations` and set `isCompensationFromRates: false`.
   - `tasks/tripletex/codex-environment/task-playbooks/register-travel-expense.md:16-18,145-156` says the same.
   - `tasks/tripletex/codex-environment/AGENTS.md:476-485` still instructs agents to create per-diems, use hardcoded rate types, and set `isCompensationFromRates: true`.
   Why it matters:
   - This contradiction is plausibly score-relevant because the broad agent surface can steer runs back onto the stale per-diem path.

2. `[medium]` The proposal correctly highlights `createVouchers` as the strongest unscored remaining hypothesis.
   Evidence:
   - `tasks/tripletex2/src/tasks/task-13/RESEARCH.md:18-33` says all 22 production runs omitted `PUT /travelExpense/:createVouchers`, approve alone did not help, and voucher creation has never been production-scored.
   Why it matters:
   - This is the clearest remaining missing lifecycle step with concrete downstream state change (`voucher != null`, `isCompleted=true`, ledger postings exist).

### Weaknesses

3. `[high]` The proposal overstates itself as a T2-to-T1 migration when the core recommendation already exists in live T1 docs.
   Evidence:
   - T1 trusted standard and playbook already contain the no-per-diem rule and full voucher lifecycle.
   - `tasks/tripletex2/src/tasks/task-13/README.md:1-4` says the intended solve path should follow the T1 trusted standard.
   Why it matters:
   - This lowers migration leverage. The queue item mostly proposes syncing T1 with itself, not importing a proven T2 improvement.

4. `[high]` The proposal does not grapple with the fact that the live T2 task surface still encodes the old per-diem model.
   Evidence:
   - `tasks/tripletex2/src/tasks/task-13/task.ts:43-54,77-78` still makes `perDiemCompensations` a required input and describes manual per-diem rows.
   - `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:171-173,218-223,240-252` still fetches `/travelExpense/rate`, sets `isCompensationFromRates` from per-diem presence, and POSTs `perDiemCompensations`.
   - `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense.ts:166-182,272-337` shows the same older model in v1.
   Why it matters:
   - If the upstream source still models the task around per-diems, then T2 is weak evidence for porting the no-per-diem branch into T1. The proposal should have treated this as a major credibility problem.

5. `[high]` The proposal repeats an overconfident causal claim: current evidence does not isolate "per-diem presence" as the proven root cause.
   Evidence:
   - T1 trusted standard says all 24 historical runs included per-diems and scored 4.5/8.
   - T2 research says all 22 historical runs also omitted `createVouchers`, and that omission is the strongest unscored hypothesis.
   - There is still no cited production run for:
     - no per-diems + no `createVouchers`
     - per-diems + `createVouchers`
     - no per-diems + `createVouchers`
   Why it matters:
   - The contradiction in `AGENTS.md` is real, but choosing the no-per-diem branch as a proven root-cause fix is stronger than the evidence. The plateau is confounded.

6. `[medium]` The proposal is too permissive on importing the T2 date formula.
   Evidence:
   - `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:85-104` computes `returnDate=today` and `departureDate=today-(N-1)`.
   - `tasks/tripletex/codex-environment/AGENTS.md:332` explicitly says multi-day prompts without explicit dates and `departureFrom` are not a proven exact-match family, because multiple inferred date/city combinations were accepted by the API and none are scorer-proven.
   - `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:164-167` itself frames incorrect dates as a hypothesis, not a demonstrated fix.
   Why it matters:
   - Porting a concrete formula into trusted guidance risks freezing an unvalidated guess into production docs.

7. `[medium]` The proposal understates how stale and internally inconsistent the T2 VAT evidence is.
   Evidence:
   - T1 trusted standard says use `costCategory.vatType.id` and fall back to `0` only on `VAT_NOT_REGISTERED`.
   - T2 v3 hardcodes `vatType: { id: 0 }` on all costs at `create-and-deliver-travel-expense-v3.ts:253-263`.
   - T2 research claims `vatType: { id: 0 }` is "per trusted standard" at `RESEARCH.md:37-44`, which is simply not true relative to the live T1 standard.
   - T2 v1 used `category.vatType?.id ?? 0`, which is a third position.
   Why it matters:
   - This is not just an unresolved import candidate; it is evidence that the supposed upstream material is drifting and should be treated cautiously.

8. `[medium]` The proposal fixes the current contradiction, but not the structural cause: duplicated detailed travel-expense rules in `AGENTS.md` and the trusted standard.
   Evidence:
   - The contradiction exists precisely because both surfaces carry parallel detailed instructions.
   Why it matters:
   - Replacing the stale AGENTS block with a new detailed AGENTS block may solve today's mismatch and recreate tomorrow's. A higher-leverage move would be to reduce AGENTS to a short pointer plus only the non-obvious deltas that truly belong there.

9. `[low]` The destination heuristic is correctly held back, but its presence as a candidate import still adds little value.
   Evidence:
   - `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts:113-145` is plain token heuristic code, not scorer-backed guidance.
   Why it matters:
   - This is implementation residue, not a production-proven markdown insight.

## Overall assessment

- Net-new: `mostly no`
- Evidence strong enough for production-porting now: `no`
- Production score leverage: `43/100`
- Confidence: `89/100`
- Provisional recommendation: `hold`

Rationale:
- The only immediately compelling action is to remove the stale per-diem instructions from `AGENTS.md`.
- That action should be treated as a T1 consistency cleanup, not as validation that T2 discovered a production-proven import.
- The rest of the proposal mixes one real documentation bug with several unproven or internally inconsistent T2-derived ideas.

## Best insight in this task

The single highest-value action is not a T2 import at all: remove the stale per-diem instructions from `AGENTS.md` so Tripletex1 stops contradicting its own trusted standard on the travel-expense path.

## Score

Total finder score: `56`
