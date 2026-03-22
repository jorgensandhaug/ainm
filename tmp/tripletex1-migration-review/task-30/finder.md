# Task 30 Finder Review

## Concise proposal summary
The proposal argues that Task 30's stuck `6/10` plateau is most likely caused by missing fixed-asset-register state, not tax-account choice. It recommends porting a new canonical flow into Tripletex1 that activates `FIXED_ASSETS_REGISTER`, registers each asset via `POST /asset`, links depreciation vouchers back to those asset ids, and keeps a smaller factual correction around account `8700`.

## Candidate findings

### 1. High-impact weakness: the "adopt now" recommendation outruns the evidence
The core import package is still a sandbox-only hypothesis. The queue doc itself admits none of the asset-register changes have been production-tested (`task-30.md:171-178`). That is not strong enough to replace the live trusted standard's canonical flow. The upside is real, but the evidence threshold here is "run this as the next experiment," not "promote into the main standard now."

### 2. High-impact weakness: the proposal does not reconcile contrary production-derived evidence about checks 4+5
There is already repo-local production reflection arguing checks 4+5 look prepaid-related, not asset-register-related: the three depreciation vouchers and tax voucher passed while the prepaid reversal was isolated as the likely failure source (`prod-2026-03-21-195120731Z-f672a798/codex-score-reflection.summary.md:39-57`). The queue doc never addresses that competing explanation before concluding checks 4+5 "likely verify `yearEnd.tangibleFixedAssets`" (`task-30.md:47`). That makes the recommendation materially overconfident.

### 3. High-impact weakness: Delta 2 hardcodes an asset payload that the cited evidence does not stabilize
The proposal specifies `depreciationAccount: { id: <depCostAcctId> }` (`task-30.md:121`). But the cited scripts disagree on what that field should be:
- `178-task30-activate-modules.ts` uses `1209` (`178-task30-activate-modules.ts:90-97`)
- `180-task30-full-e2e-with-assets.ts` uses `1209` (`180-task30-full-e2e-with-assets.ts:83-92`)
- `187-task30-asset-register.ts` uses `6010` (`187-task30-asset-register.ts:88-96`)
- `191-task30-asset-depreciation-deep.ts` uses `6010` (`191-task30-asset-depreciation-deep.ts:33-42`)

That is exactly the kind of payload ambiguity that should block a trusted-standard rewrite.

### 4. Medium-impact weakness: this is only partially a Tripletex2 import
Relative to live Tripletex1 markdown, the asset-register idea is net-new. Relative to the queue's stated mission of importing Tripletex2 frontier knowledge, it is not a clean import. The current Tripletex2 task surface still says asset account numbers are only identifiers and "are not used in voucher postings" (`tasks/tripletex2/src/tasks/task-30/task.ts:62-64`), and the research memory still frames the frontier as the 8300/2500 tax-account theory (`tasks/tripletex2/src/tasks/task-30/RESEARCH.md:25-33`). So the proposal is mostly importing new local sandbox lore, not established T2 runtime doctrine.

### 5. Medium-impact weakness: the proposal should split "safe factual fix" from "high-upside experiment"
The `8700` existence correction is a factual cleanup and can stand on its own. The asset-register package is speculative and high-cost. Bundling them into one "apply all 5 deltas" recommendation (`task-30.md:178`) is a bad review shape because it forces a reviewer to either accept or reject unlike-risk items together.

### 6. Medium-impact weakness: the proposal understates current live-state drift
The live trusted standard already has more than the queue summary implies:
- it already includes Phase 0 module activation and year-end diagnostics (`trusted-standards/simplified-year-end-closing.md:109-122`)
- it already documents the 14-run tax-account reversal and explicitly moved back to `8700/2920` (`trusted-standards/simplified-year-end-closing.md:48-69`)

The proposal mentions some of this, but not as a first-class source-drift problem. A reviewer needs that called out explicitly because otherwise the "current gap" framing looks cleaner than it is.

### 7. Medium-impact strength: `8700` non-existence looks like a real, safe correction
The live docs still claim `8700` exists in the default chart (`trusted-standards/simplified-year-end-closing.md:61-75`, `task-playbooks/simplified-year-end-closing.md:43-55`). The investigation script explicitly warns that `8700` may be absent (`182-task30-prompt-accounts-test.ts:86-89`), and older production reflections also batch-created it. This is the cleanest candidate import in the proposal.

### 8. Low-impact strength: "lifetime is in months" is worth preserving
The queue doc is right to call out the months-vs-years ambiguity and to prefer explicit months in markdown (`task-30.md:173`). The scripts themselves also drift between raw years and `* 12`, so this clarification is useful even if the rest of the asset-register package is held.

### 9. Low-impact strength: `FIXED_ASSETS_REGISTER` activation is credible as an experiment prerequisite
If the team decides to test the asset-register theory, the module activation step is well-supported. `178-task30-activate-modules.ts` and related scripts are enough to justify this as an experimental prerequisite. The problem is not the step itself; the problem is promoting the entire theory stack before scoring it.

### 10. Low-impact weakness: Imports 5 and 6 are too weak for migration priority
The zero-tax-voucher idea is still explicitly speculative in both the queue doc and T2 v2 (`task-30.md:77-82`, `simplified-annual-closing-v2.ts:96-113`). The only concrete repo evidence is that Tripletex accepts a zero voucher (`170-task30-zero-tax-voucher.ts:20-37`), not that the scorer wants one. The tax-rounding variant is even weaker. These should stay out of the port discussion.

## Explicit call: is the proposal actually net-new?
Partially.

Net-new versus live Tripletex1:
- Yes: asset-register registration, `FIXED_ASSETS_REGISTER` activation, and voucher asset-linkage are new to the live task-30 markdown.
- Yes: the `8700 exists by default` claim looks stale and correctable.

Not cleanly net-new in the queue's intended "import from Tripletex2" sense:
- No: the main asset-register theory is not established in current Tripletex2 task runtime/research surfaces. It is mostly a new local sandbox hypothesis layered on top of them.

## Explicit call: is the evidence strong enough for production-porting now?
No.

It is strong enough to justify:
- a targeted production experiment
- a playbook note or "next hypothesis" section
- possibly a separate tiny factual fix for `8700`

It is not strong enough to justify:
- replacing the trusted standard's canonical flow
- declaring the asset-register package "adopt now"

## Production score leverage score
72/100

Reason: if the asset-register hypothesis is right, it could unlock both missing checks at once. The upside is high. The certainty is not.

## Confidence
83/100

## Provisional one-line recommendation
needs verification

## Suggested review posture
- Adopt separately: the `8700` existence correction.
- Hold in trusted standard: asset registration, asset-linked vouchers, and `FIXED_ASSETS_REGISTER` as canonical flow.
- Add experimentally if desired: a short playbook note that the next scored run should test the full asset-register package against the current 6/10 baseline.

## Best insight in this task
The single highest-value import is the hypothesis that Task 30 may require fixed assets to exist in Tripletex's asset register, not just as manual depreciation vouchers.

## Self-score
- High-impact findings: 3 x 10 = 30
- Medium-impact findings: 4 x 5 = 20
- Low-impact findings: 3 x 1 = 3
- Total = 53
