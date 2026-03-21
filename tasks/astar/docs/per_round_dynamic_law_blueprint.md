# Per-Round Dynamic Law Blueprint

This doc defines the next offline phase after replay measurement extraction.

The goal is not "train a bigger model".

The goal is:

1. fit trustworthy per-round dynamic-law summaries from replay-backed measurement tables
2. validate them on held-out replay runs within round
3. compress them across rounds into a small manifold
4. only then decide what teacher/student changes are justified

This is the scientific bottleneck between the replay event layer and any new world model.

## Why This Phase Is Hard

Three things are easy to get wrong here:

1. sample space
   - different events live on different denominators
   - `birth` is not a "settlement row" event
   - `collapse` is not a "site opportunity" event
2. imbalance
   - many targets are extremely sparse
   - naive uniform row sampling destroys rare-event heads
3. time dependence
   - the simulator evolves over 50 yearly steps
   - hazards are not stationary over time

If we get those three wrong, cross-round factorization will look noisy or fake-low-rank for the wrong reasons.

## Current Repo Truth

The repo now has the right raw ingredients:

- replay-derived measurement tables in [measurements.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/measurements.py)
- replay event tables in [events.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/events.py)
- first dynamic-law fitter in [dynamic_law.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/dynamic_law.py)
- same-round heldout validator in [dynamic_law_validation.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/dynamic_law_validation.py)
- round factorization entrypoint in [dynamic_law_manifold.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/dynamic_law_manifold.py)
- workflow wrapper in [evaluate_dynamic_law_summary.py](/home/jorge/ainm/tasks/astar/src/astar/workflows/evaluate_dynamic_law_summary.py)

Infra status is now good enough to move back to science:

- fresh `summarize-replays` on heavy real round: about `3:59.55`, about `17.9GB RSS`
- cached `summarize-replays --reuse-existing`: about `1.60s`
- `materialize-episode`: about `5.42s`

## Current Dynamic-Law V0 Problems

Before trusting the current dynamic-law fit, these issues must be treated as real model-design issues, not noise:

1. `birth` and `rebuild` are currently fit from settlement rows.
   - wrong denominator
   - correct denominator is site-opportunity rows
2. `_sample_frame()` does uniform row sampling.
   - wrong for rare events
   - positives can vanish or become badly miscalibrated
3. step / year is not currently in the per-step feature matrices.
   - this collapses early/mid/late dynamics together
4. raw coefficients are not the right object for cross-round comparison.
   - probe responses on a fixed library are better than raw coefficients
5. owner/macro heads are useful, but should be treated as auxiliary summaries until they prove stable.

These are the first things to fix before any new teacher model work.

## Correct Family Decomposition

Use different row families for different targets.

| Family | Row source | Correct denominator | Primary targets | Status |
| --- | --- | --- | --- | --- |
| site opportunity | `site_opportunities` | non-live buildable / ruin sites | `birth`, `rebuild`, `site_ruin_created`, `rebuild_port`, `ruin_to_forest`, `ruin_to_empty` | core |
| live settlement | `settlement_measurements` filtered to live or present settlements | settlement positions | `collapse`, `collapse_to_ruin`, `port_gain`, `port_loss`, `owner_flip`, resource deltas | core |
| ruin lifecycle | `ruin_transitions` | ruin cells only | `remain_ruin`, `rebuild_settlement`, `rebuild_port`, `reclaim_forest`, `fade_empty` | core |
| pairwise interaction | `pairwise_candidates` | selected source-destination settlement pairs | `dst_owner_flip_next`, `dst_collapse_next`, `dst_port_gain_next`, optional destination deltas | core but secondary |
| yearly shock | `year_shocks` | one row per run-step | aggregate counts / rates | core summary axis |
| owner-year | `owner_years` | one row per owner-step | owner aggregate deltas | auxiliary |
| macro trajectory | `macro_trajectories` | one row per run-step | macro aggregate deltas | auxiliary |

Important consequence:

- `birth` and `rebuild` should move from settlement heads to site heads
- `collapse` and `owner_flip` should stay settlement-side
- ruin persistence / reclaim should stay ruin-side

## Inputs Per Family

### Keep

Keep the current geometry/context features already exposed by [measurements.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/measurements.py):

- buildable
- coast
- coast distance
- land distance to settlement
- sea distance to port
- basin gap
- forest density
- mountain density
- settlement proximity
- maritime access
- frontier score
- nearby live / same-owner / other-owner / port / ruin counts

Keep current settlement marks:

- population
- food
- wealth
- defense
- has_port
- alive
- owner known / owner changed

Keep current pairwise features:

- same owner
- source/destination port flags
- maritime pair
- land / sea distance
- source/destination marks

### Add Immediately

Add explicit time features to all per-step families:

- `year_frac = step / 49`
- `remaining_year_frac = 1 - year_frac`
- `year_frac_sq`
- one small bucket basis:
  - early
  - mid
  - late
  - endgame

Time basis is mandatory.

Without it, the fit blends early expansion and late collapse into one coefficient vector.

### Do Not Add

Do not add:

- raw `owner_id` as numeric feature
- `replay_run_id` as feature
- future-only information
- round ID as feature inside per-round fits
- giant learned embeddings at this phase

## Fitting Strategy

### Model Class

Use tiny regularized models first.

Default:

- binary targets: ridge logistic
- continuous targets: ridge linear

Do not jump to trees or neural nets until the ridge baseline is clearly bottlenecked.

Reason:

- this phase is for stable round fingerprints, not maximum one-step accuracy
- the number of independent rounds is small
- interpretability matters here

### Sampling Strategy

Current uniform row sampling should be replaced.

Correct v1 policy:

1. keep all positive rows for the target
2. sample negatives separately for that target
3. stratify negative sampling by:
   - `replay_run_id`
   - coarse time bucket
   - a small state bucket relevant to the family

Recommended state buckets:

- site: `prev_ruin`, `coast`, `nearby_live>0`
- settlement: `prev_has_port`, `coast`, `frontier`
- ruin: `coast`, `nearby_live>0`
- pairwise: `same_owner`, `maritime_pair`

Recommended starting negative ratios:

- site heads: up to `10:1`
- settlement binary heads: up to `5:1`
- ruin heads: up to `5:1`
- pairwise heads: up to `10:1`

Important:

- if negatives are downsampled, the logistic intercept is biased
- either correct the intercept after fitting using the true base rate, or store explicit sample/base rates and never interpret intercepts directly

For v1, intercept correction is preferred.

### Row Caps

Do not use one global cap for every family.

Use per-family caps after target-aware sampling.

Suggested starting budgets:

- site family: `200k`
- settlement family: `200k`
- ruin family: `200k`
- pairwise family: `300k`
- owner/macro/year-shock: use all rows unless profiling says otherwise

These are not sacred.

The important thing is:

- positives all kept
- negatives stratified
- fit-time budgets chosen per family, not one blanket `25k`

### Standardization

Standardize numeric features per family before ridge fitting.

Store:

- feature mean
- feature std
- target prevalence
- sample counts

These are part of the round summary, not optional debug info.

## What The Round Summary Should Be

The round summary should not be "raw coefficients only".

Raw coefficients are unstable because:

- feature scaling matters
- prevalence matters
- different heads have different sample spaces

The right round summary object is:

1. fitted per-family heads
2. evaluated on a fixed probe library
3. plus a small set of aggregate year-shock statistics

This matches the current [probe library approach in dynamic_law.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/dynamic_law.py), and that is the correct direction.

### Probe Principle

Cross-round factorization should run on:

- "how this round behaves on canonical scenarios"

not on:

- "what coefficient happened to be attached to feature 17"

So:

- keep probe-response summaries
- expand probe families if needed
- do not regress back to raw coefficient PCA

## Validation Design

### Same-Round Validation

This is the gating validation.

Split by `replay_run_id`, not by row.

Default:

- train on most replay runs from that round
- evaluate on held-out replay runs from that round
- reuse the same run-level split across all families

Why:

- rows inside one replay run are highly dependent
- row-level random splits massively overstate quality

### Metrics

Binary heads:

- Brier score
- calibration curve
- base-rate baseline comparison

Continuous heads:

- RMSE
- MAE if tail-heavy

Aggregate:

- year-shock MAE
- probe-summary stability across bootstrap holdouts

### Acceptance Criteria For Moving On

Before factorizing across rounds, require:

1. same-round heldout beats base-rate baseline on most core heads
2. calibration is not pathological
3. zero-event heads do not crash and are explicitly reported
4. top unstable summaries are understandable, not random garbage

If those fail, do not move to manifold work yet.

## Human Verification Surface

Every dynamic-law run should emit artifacts a human can inspect fast.

Required outputs:

- markdown summary
- json summary
- per-head sample counts and positive rates
- per-head coefficient tables
- per-head top features by magnitude
- per-head heldout metrics
- per-head calibration PNG
- per-head prevalence-by-step PNG
- probe-response heatmap PNG
- round-vs-round probe summary heatmap
- rank-vs-reconstruction plot for factorization

Required raw-example audits:

- top false positives and false negatives for at least one site head
- top false positives and false negatives for at least one settlement head
- raw row dumps for sampled examples with their source replay ids

The rule is:

- no summary metric without example rows
- no example rows without a rerun command

## Cross-Round Compression

After per-round fits are stable:

1. fit each round independently
2. build one shared probe library
3. summarize each round by probe responses + year-shock vector
4. factorize those summaries
5. evaluate leave-one-round-out reconstruction

Important:

- round is the independent unit
- leave-one-round-out matters more than within-round fit at this stage

What we want:

- leading dimensions that correspond to coherent axes:
  - expansion
  - maritime
  - conflict
  - winter severity
  - reclamation / ruin persistence

What we do not want:

- axes that are obviously just noise from rare heads or unstable sampling

## Immediate Code Changes Before Trusting Dynamic Law

This is the concrete next implementation sequence.

### Step 1. Correct The Sample Spaces

In [dynamic_law.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/dynamic_law.py):

- move `birth` and `rebuild` from settlement binary heads to site binary heads
- keep settlement binary heads for:
  - `collapse`
  - `collapse_to_ruin`
  - `port_gain`
  - `port_loss`
  - `owner_flip`

### Step 2. Add Time Basis

Add step-derived time basis columns to:

- site
- settlement
- ruin
- pairwise
- owner
- macro
- year shock if useful

### Step 3. Replace Uniform Sampling

Replace `_sample_frame()` with family-aware, target-aware sampling.

Minimum acceptable v1:

- keep all positives
- stratified negative subsample
- explicit sample-rate metadata

### Step 4. Strengthen Validation Reports

Extend [dynamic_law_validation.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/dynamic_law_validation.py) and [evaluate_dynamic_law_summary.py](/home/jorge/ainm/tasks/astar/src/astar/workflows/evaluate_dynamic_law_summary.py) to emit:

- per-head sample counts
- positive rates
- calibration
- top unstable summaries
- probe heatmaps

### Step 5. Only Then Factorize

Use:

- [factorize_round_summaries.py](/home/jorge/ainm/tasks/astar/src/astar/workflows/factorize_round_summaries.py)
- summary kind `dynamic_law`

Do not start teacher rewiring before this stage is clean.

## Commands To Use Now

Existing commands:

```bash
uv run astar summarize-replays --round-id <round-id>
uv run astar materialize-episode --round-id <round-id>
uv run astar evaluate-dynamic-law-summary --profile dev --round-id <round-id>
uv run astar factorize-round-summaries --summary-kind dynamic_law --max-rank 8
```

What those commands should tell us:

- `summarize-replays`
  - replay tables and summaries are materialized correctly
- `evaluate-dynamic-law-summary`
  - same-round heldout quality and stability
- `factorize-round-summaries`
  - whether cross-round variation is actually low-rank

## What Not To Do Yet

Do not do these yet:

- giant neural per-round models
- teacher rewrite
- student rewrite
- live predictor rewiring
- giant regime latent

If the dynamic-law phase is weak, every downstream model built on top of it will be weak in a harder-to-debug way.

## Decision Rule

If dynamic-law summaries become:

- stable on held-out replay runs
- interpretable by head and by probe
- low-rank across rounds

then the next phase is justified:

- teacher conditioned on a small round manifold

If not:

- stay here
- fix sample spaces
- fix time basis
- fix probe definitions
- fix instability

That is the correct point to be stubborn.
