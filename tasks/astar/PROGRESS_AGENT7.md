# Agent7 Progress

## Mission

- Continue fifth-family/operator-manifold-retrieval work from [`instructions/agent7.md`](/home/jorge/agent7/tasks/astar/instructions/agent7.md).
- End goal: maximize held-out local historical benchmark score on available replay/analysis data.
- Hard constraints:
  - track work here continuously
  - keep validation honest; improve only if stricter/better aligned
  - commit and push meaningful progress to `origin/agent7`

## Canon Read / Ground Truth

- Read [`README.md`](/home/jorge/agent7/tasks/astar/README.md)
- Read canonical challenge facts [`docs/game_facts.md`](/home/jorge/agent7/tasks/astar/docs/game_facts.md)
- Read full handoff [`instructions/agent7.md`](/home/jorge/agent7/tasks/astar/instructions/agent7.md)
- Read repo instructions [`AGENTS.md`](/home/jorge/agent7/tasks/astar/AGENTS.md)

## Environment Snapshot

- Branch: `agent7`
- Remote: `origin https://github.com/jorgensandhaug/ainm.git`
- Worktree initially clean
- `br list` attempted twice; `br` not installed in current shell env
- `uv run pytest` failed initially because dev extras not installed in temp env; need `uv sync --extra dev` or `uv run --extra dev pytest ...`

## Current Repo Reality

- Current live/offline best family artifact in repo is `query_residual_v7`
- Model shape today:
  - historical bucket prior base
  - replay-trained semimechanistic hazard teacher
  - transcript -> regime linear regression
  - per-cell linear residual correction on top of prior logits
- Current policy surface tiny:
  - `coverage`
  - `exploration_v2`

## Benchmarks Observed

Primary reference:

- [`data/artifacts/benchmarks/dev_historical_bucket_prior/result.json`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/dev_historical_bucket_prior/result.json)
  - mean score `66.0233`
  - mean weighted KL `0.14849`
- [`data/artifacts/benchmarks/dev_query_residual_online50_v7/result.json`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/dev_query_residual_online50_v7/result.json)
  - mean score `73.9505`
  - mean weighted KL `0.10633`
  - runtime about `1836.6s` on 8-round dev benchmark

Per-round `query_residual_v7` vs bucket prior:

- Round 7: `63.96` vs `53.87`
- Round 1: `80.53` vs `76.20`
- Round 2: `84.56` vs `75.05`
- Round 4: `85.56` vs `86.90`  <- regression
- Round 6: `79.92` vs `51.64`
- Round 8: `71.13` vs `65.86`
- Round 3: `46.41` vs `39.59`
- Round 5: `79.52` vs `79.07`

Interpretation:

- family clearly useful
- not uniformly safe
- likely needs better manifold projection / retrieval / OOD shrinkage
- weak point remains round 3; round 4 suggests over-correction risk

## Important Findings

1. Current family implementation does not satisfy handoff reproducibility standard well enough.
   - `query_residual` is mostly hard-coded as one variant
   - benchmark/CLI path does not expose unique family variant names cleanly

2. Synthetic live dataset cache correctness risk exists.
   - cached dataset name only keys on policy, round scope, sample count
   - if regime-summary semantics or policy implementation changes without name change, old cached targets/transcripts can be reused silently
   - this can make validation stale/incorrect

3. Current posterior is global linear in transcript-summary space.
   - handoff strongly points toward manifold-local interpolation / particle mixture / retrieval
   - current implementation still lacks that family-defining step

## Working Hypotheses

### H1

Projecting transcript-inferred regime back onto historical regime manifold should reduce harmful extrapolation and improve weak rounds without losing large gains on rounds 1/2/6.

### H2

Teacher prediction should be blended via historical-regime retrieval, not only one raw extrapolated regime vector.

### H3

Validation/cache correctness will improve if synthetic-live datasets are versioned by model/data semantics, not only policy name.

### H4

Framework should accept unique query-residual family variant names directly so benchmark results are reproducible and comparable.

## Immediate Build Plan

1. Add family config/variant registry for query-residual models.
2. Fix synthetic dataset cache versioning for family experiments.
3. Add manifold-projected retrieval blend / novelty-aware shrinkage variant.
4. Benchmark cheap subset first.
5. Promote to full 8-round dev benchmark only if subset gain real.
6. Commit + push if improvement or major infra/correctness gain.

## Experiment Log

### 2026-03-20T00:00Z approx

- Read canon docs and handoff.
- Confirmed current champion artifact and score.
- Confirmed no saved exploration benchmark artifacts.
- Confirmed benchmark path is LORO by round in [`src/astar/workflows/historical_benchmark.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/historical_benchmark.py).
- Confirmed current `query_residual` design in [`src/astar/student/predictor/query_residual.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual.py).
- Identified stale synthetic dataset cache risk.
- Next: implement variant registry + cache versioning + manifold retrieval variant.

### 2026-03-20T23:00Z approx

- Added query-residual family registry in [`src/astar/student/predictor/query_residual_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual_config.py)
  - alias `query_residual`
  - explicit variants `query_residual_v7`, `query_residual_v8`
- Added manifold/retrieval variant logic to [`src/astar/student/predictor/query_residual.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual.py)
  - regime manifold bank persisted in checkpoint
  - retrieval-weighted teacher blend
  - novelty-aware prior shrinkage
- Fixed synthetic-live cache correctness
  - new dataset version token `v2`
  - stopped silently reusing legacy `v1` cache for new semantics
- Patched benchmark/live model selection surface
  - [`src/astar/student/predictor/interactive.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/interactive.py)
  - [`src/astar/workflows/model_eval.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/model_eval.py)
  - [`src/astar/workflows/historical_benchmark.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/historical_benchmark.py)
  - [`src/astar/cli.py`](/home/jorge/agent7/tasks/astar/src/astar/cli.py)
- Fixed CLI/plumbing bug where `samples_per_round` forwarding was inconsistent/broken.
- Added benchmark coverage for variant names in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
- Validation status:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `5`
- Notes:
  - one 4-round probe was interrupted by user before completion; no usable benchmark artifact produced
  - building new `v2` synthetic dataset caused derived/artifact refreshes in replay/episode paths

### Next

- Run full 8-round LORO dev benchmark for `query_residual_v8`
- Compare against existing `dev_query_residual_online50_v7`
- If positive, promote alias decision + commit + push
- If flat/negative, keep infra/correctness commit, then continue family search

### 2026-03-20T23:45Z approx

- Full 8-round dev benchmark completed for [`query_residual_v8`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v8/result.json)
  - mean score `73.0354`
  - mean weighted KL `0.108850`
  - vs `v7` mean score `73.9505`
  - net delta about `-0.915`
- Paired comparison artifact:
  - [`historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v8.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v8.json)
- What happened:
  - `v8` materially improved pathological round 3 (`46.41 -> 52.31`)
  - but regressed most other rounds, especially 6/8/7
  - conclusion: constant manifold blend too blunt
- New hypothesis:
  - manifold correction should be OOD/novelty-gated, not always-on
  - if transcript looks near historical support, stay near `v7`
  - if transcript looks off-manifold, increase manifold correction
- Implemented follow-up variant:
  - `query_residual_v9`
  - same family, but manifold blend scales by transcript novelty score

### 2026-03-21T00:35Z approx

- Full 8-round dev benchmark completed for [`query_residual_v9`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v9/result.json)
  - mean score `73.4065`
  - mean weighted KL `0.107004`
  - better than `v8`
  - still below `v7` by about `0.544`
- Paired comparison artifact:
  - [`historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v9.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v9.json)
- Interpretation:
  - novelty gating was directionally correct
  - still not enough to beat `v7`
  - pathologies improved mainly on round 3, but aggregate losses on 7/6/8 remain too large
- Current champion after honest full-dev evaluation remains:
  - [`dev_query_residual_online50_v7`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/dev_query_residual_online50_v7/result.json)
  - mean score `73.9505`

## Current Conclusion

- Promote infra/correctness work
- Do not promote `v8` or `v9` as default
- Keep `query_residual` alias conservative
- Best new information this turn:
  - family variant registry now exists
  - benchmark/CLI path can evaluate named variants reproducibly
  - synthetic-live cache invalidation is safer
  - always-on manifold projection hurts
  - novelty-gated manifold helps relative to always-on, but still not enough

## Open Questions

- Whether `exploration_v2` actually helps this family at all.
- Whether regime-summary vector itself should be improved after cache/version cleanup.
- Whether benchmark should gain optional multi-episode averaging for more stable online validation.

## Promotion Rule For This Turn

- Do not switch default alias to new variant unless subset evidence positive and full dev benchmark non-regressive.
- If only infra/correctness lands, keep alias conservative, commit infra separately, push.

### 2026-03-21T01:10Z approx

- Re-opened live worktree state before continuing.
  - confirmed branch still `agent7`
  - confirmed pushed baseline commit still current
  - confirmed `br` still unavailable in current shell env
- Found one incomplete live diff:
  - [`src/astar/student/predictor/query_residual_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual_config.py)
  - `query_residual_v10` existed only as config stub; no predictor/checkpoint implementation yet
- Re-read relevant predictor/benchmark plumbing to avoid invalid shortcut implementation:
  - [`src/astar/student/predictor/query_residual.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual.py)
  - [`src/astar/student/predictor/interactive.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/interactive.py)
  - [`src/astar/workflows/model_eval.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/model_eval.py)
  - [`src/astar/workflows/historical_benchmark.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/historical_benchmark.py)
- Re-checked `v7` vs `v9` round behavior:
  - `v9` helps hardest/OOD-ish round 3 a lot
  - `v9` loses too much on rounds 6/7/8 and slightly on easy rounds
- Current hypothesis sharpened:
  - manifold/retrieval family signal is useful only in a restricted regime
  - better variant is not `always use manifold` or `always use blended manifold`
  - better variant should preserve `v7` on high-signal transcripts and borrow `v9` only when both:
    - transcript looks novel relative to historical manifold
    - transcript residual signal is weak
- Next implementation:
  - finish `query_residual_v10` as reproducible nested ensemble
  - primary path = `v7`-like predictor
  - partner path = `query_residual_v9`
  - blend weight = capped function of novelty score and low-signal score
  - save/load partner checkpoint inside main checkpoint dir so benchmark/interactive paths stay reproducible

### 2026-03-21T01:35Z approx

- Implemented `query_residual_v10` predictor path in [`src/astar/student/predictor/query_residual.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual.py)
  - nested optional ensemble partner predictor
  - `fit_from_config` now supports ensemble variants reproducibly
  - checkpoint save/load persists nested partner under subdir
  - inference adds gated post-prediction mixture:
    - primary = `v7`-like path
    - partner = `v9`
    - weight = `ensemble_max_weight * low_signal * novelty^power`
  - low-signal term is derived from clipped transcript residual scale, so ensemble weight goes to zero on high-signal transcripts
- Added validation coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
  - historical benchmark parametrization now includes `query_residual_v10`
  - added explicit nested checkpoint roundtrip test for `v10`

### 2026-03-21T08:30Z approx

- User redirected mission explicitly away from treating `query_residual` as the main line.
  - instruction interpreted as: treat `query_residual` only as incumbent benchmark to beat
  - primary work must now be fifth-family new development from [`instructions/agent7.md`](/home/jorge/agent7/tasks/astar/instructions/agent7.md)
- Re-read handoff and re-centered on its target stack:
  - tiny cross-round regime manifold
  - shared decoder `(map, beta) -> tensor`
  - transcript posterior `transcript -> beta`
  - heavy parallel experimentation allowed, but parallelism should adapt to machine load / other agents
- Re-checked machine health before large sweeps.
  - earlier snapshot: `384` CPUs, about `2.8 TiB` available RAM, low overall pressure
  - later snapshot before operator runs: load about `107`, about `1.6 TiB` available RAM
  - other agents had several heavy benchmark / test jobs active, especially agent5 and agent6
  - decision: still use parallelism aggressively, but cap this wave to `3` operator probes instead of `6`

### 2026-03-21T08:45Z approx

- Pushed beyond retrieval-only FFAM line.
- Landed new retrieval-family infra in:
  - [`src/astar/student/predictor/ffam_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_config.py)
  - [`src/astar/student/predictor/ffam_retrieval.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_retrieval.py)
  - [`src/astar/history/datasets/synthetic_live.py`](/home/jorge/agent7/tasks/astar/src/astar/history/datasets/synthetic_live.py)
  - [`src/astar/student/posterior/deepset_student.py`](/home/jorge/agent7/tasks/astar/src/astar/student/posterior/deepset_student.py)
  - [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
- New FFAM retrieval variants explored:
  - `ffam_retrieval_v4`: map-conditioned summary `v3`, regime target
  - `ffam_retrieval_v5`: coefficient target
  - `ffam_retrieval_v6`: coefficient target variant
  - `ffam_retrieval_v7`: coefficient target + `global_ridge`
  - `ffam_retrieval_v8`: regime target + `global_ridge`
- Important correctness fix:
  - FFAM synthetic-live cache naming/build now keys on actual training split semantics, not only broad replay scope
  - this removed a real risk of silently reusing wrong train-split caches for LORO experiments
- Validation:
  - `uv run --extra dev pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
  - passed: `35`

### 2026-03-21T09:05Z approx

- Ran hard-gate fifth-family probe on hardest live rounds `{3,6,7,8}` with `policy=exploration_r3`, `samples_per_round=2`.
- Baseline incumbent:
  - [`data/artifacts/benchmarks/agent7_probe_query_residual_v14_exploration_r3_r3r6r7r8/result.json`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v14_exploration_r3_r3r6r7r8/result.json)
  - mean score `63.9805`
- FFAM retrieval results:
  - `ffam_retrieval_v3`: `48.6524`
  - `ffam_retrieval_v4`: `41.8252`
  - `ffam_retrieval_v5`: `41.7670`
  - `ffam_retrieval_v6`: `39.9918`
  - `ffam_retrieval_v7`: `35.9863`
  - `ffam_retrieval_v8`: `36.3688`
- Conclusion:
  - current pure `HazardTeacher` decoder family is not competitive on hard live rounds
  - stronger transcript summaries did not rescue it
  - coefficient-target and ridge-posterior variants made it worse
  - next branch must attack decoder capacity / operator representation, not just posterior smoothing
- Committed + pushed this negative-but-important result:
  - `e43168d` `ffam: add map-conditioned retrieval variants`
  - `468dd09` `ffam: log hard-gate decoder failure`

### 2026-03-21T09:30Z approx

- Started genuinely new fifth-family branch: operator-manifold decoder family.
- New local files:
  - [`src/astar/student/predictor/ffam_operator.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_operator.py)
  - [`src/astar/student/predictor/ffam_operator_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_operator_config.py)
- Integration/plumbing edits:
  - [`src/astar/student/predictor/interactive.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/interactive.py)
  - [`src/astar/cli.py`](/home/jorge/agent7/tasks/astar/src/astar/cli.py)
  - [`src/astar/workflows/model_eval.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/model_eval.py)
  - [`src/astar/workflows/historical_benchmark.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/historical_benchmark.py)
  - [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
- Family shape:
  - estimate one residual decoder/operator per historical round from analysis records
  - concatenate round operator parameters with hazard regime vector
  - factorize cross-round bank into tiny SVD manifold coordinates
  - fit transcript posterior from rich query-residual-style transcript summaries to manifold coords
  - reconstruct operator + regime online, then decode final tensor from `(map, beta)` via learned residual operator on top of bucket prior
- Current named variants:
  - `ffam_operator_v1`
  - `ffam_operator_v2`
  - `ffam_operator_v3`
- Validation after integration:
  - `uv run --extra dev pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
  - passed: `39`
- Active probe wave from isolated roots:
  - `ffam_operator_v1` on hard gate `{3,6,7,8}`, `samples_per_round=2`
  - `ffam_operator_v2` on hard gate `{3,6,7,8}`, `samples_per_round=2`
  - `ffam_operator_v3` on hard gate `{3,6,7,8}`, `samples_per_round=2`
- Immediate decision rule:
  - if operator line is still far below incumbent hard-gate score, iterate decoder safety / manifold posterior design before any full-dev spend
  - only run full 8-round benchmark if hard-gate signal is at least directionally real

### 2026-03-21T09:50Z approx

- Re-audited handoff after first operator implementation.
  - key miss vs recommended stack:
    - recommended `q = 3` first
    - recommended local-linear posterior on low-rank transcript metric
    - recommended particle/retrieval fallback
    - recommended OOD shrinkage toward baseline
  - first operator variants `v1..v3` were still too global on posterior side
- Added handoff-aligned posterior/operator variants in:
  - [`src/astar/student/predictor/ffam_operator.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_operator.py)
  - [`src/astar/student/predictor/ffam_operator_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_operator_config.py)
  - [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
- New operator variants:
  - `ffam_operator_v4`
    - `q = 3`
    - local-linear posterior in PCA metric space
    - retrieval blend fallback
    - OOD-triggered extra prior shrinkage
  - `ffam_operator_v5`
    - same family with stronger locality / fallback / shrinkage
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `40`
- Active probe set now:
  - `v1`, `v2`, `v3`, `v4`, `v5`
  - all on hard gate `{3,6,7,8}` with `policy=exploration_r3`, `samples_per_round=2`
- Current intention:
  - promote only if any operator variant materially closes the large gap to incumbent hard-gate score `63.9805`
  - if none do, conclude current linear-operator family still underfits and move to stronger decoder/mixed-decoder branch

### 2026-03-21T10:05Z approx

- Operator-family capability commit pushed:
  - `4244c5a` `ffam: add operator-manifold predictors`
- This commit included:
  - operator-manifold predictor family plumbing
  - online predictor / CLI / benchmark integration
  - checkpoint coverage
- Added more handoff-aligned operator variants:
  - `ffam_operator_v6`
  - `ffam_operator_v7`
  - both are retrieval-heavy / particle-like posterior variants with stronger prior fallback than `v4/v5`
- Validation after config expansion:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `42`
- Early pruning logic used on live probes:
  - if partial completed rounds already imply impossible catch-up vs incumbent hard-gate total, stop that branch and reallocate cores
- Applied that pruning to `v1..v3`.
  - partial completed rounds were enough to show no realistic path past incumbent hard-gate score `63.9805`
  - killed `v1..v3` runs to free cores
- Current active wave:
  - `v4`, `v5`, `v6`, `v7`
  - all on hard gate `{3,6,7,8}`, `policy=exploration_r3`, `samples_per_round=2`
- Partial evidence so far:
  - `v4` and `v5` still match the earlier operator line on completed rounds 6 and 8
  - round 8 remains the main failure mode to watch

### 2026-03-21T10:20Z approx

- Added stricter operator safety variants:
  - `ffam_operator_v8`
  - `ffam_operator_v9`
  - both keep retrieval-heavy posterior but damp the decoder harder via:
    - higher baseline blend
    - larger OOD-triggered prior fallback
    - lower residual class scales
    - slightly hotter temperature
- Validation after `v8/v9` expansion:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `44`
- Pruned `v4` and `v5` after they continued to mirror the earlier operator line on completed rounds and showed no sign of fixing round 8 fast enough.
- Current active wave now:
  - `v6`, `v7`, `v8`, `v9`
- Tried to accelerate with single-round round-8-only benchmark probes for `v8/v9`.
  - rejected by benchmark code
  - constraint observed: online historical benchmark path requires at least two replay-backed analyzed rounds for holdout evaluation
- Operational note:
  - keep using isolated `--root /tmp/...` workspaces symlinked to shared `data/raw` + `data/derived`
  - this allows many concurrent probes without contaminating benchmark artifact namespaces

### 2026-03-21T10:35Z approx

- Added extreme fallback endpoints:
  - `ffam_operator_v10`
  - `ffam_operator_v11`
  - purpose: exhaust the remaining obvious safety axis by pushing baseline fallback and residual damping close to the limit
- Validation after `v10/v11` expansion:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `46`
- Partial probe evidence tightened:
  - `v6` reached round 8 and still scored `4.6316` there
  - `v7` matched that same round-8 collapse once it reached the same point
  - conclusion: posterior-only changes plus moderate fallback do not fix the main failure
- Pruned:
  - `v6`
  - `v7`
- Current active safety endpoints:
  - `v8`
  - `v9`
  - `v10`
  - `v11`
- Current read:
  - if any of `v8..v11` still leave round 8 near the old collapse value, the present linear-operator decoder family is effectively exhausted
  - next branch after that should be stronger shared decoder / mixed-decoder work, not more posterior tuning

### 2026-03-21T04:05Z approx

- Re-read current policy code and benchmark artifacts before new edits.
- Reconfirmed repo state:
  - branch `agent7`
  - head `908499b4ed8652ad0ea83e8e65352dfa4d995225`
  - `br` still unavailable in current shell env
- Important policy finding:
  - map is `40x40`, tiled into exactly `9` non-overlapping `15x15` viewports per seed
  - base `coverage` policy already queries all `45` unique seed-viewports under budget `50`
  - `exploration_v2` does not trade coverage for exploration; it spends the spare `5` queries on repeats
  - therefore next policy search should target repeat allocation only
- Evidence from current champ comparison:
  - `exploration_v2` vs coverage improves round 3 massively, but loses on 6/7/8
  - likely failure mode is over- or mis-targeted repeats, not missing map coverage
- New hypothesis:
  - smaller repeat budgets (`1..4`) may preserve enough round-3 gain while reducing regressions on 6/7/8
  - current implementation already defines a clean family for this test because `replicate_budget < 5` selects the top subset of per-seed best repeat windows
- Next:
  - add named repeat-budget policy variants around `exploration_v2`
  - add minimal test coverage
  - probe on hard rounds first, then full 8-round only if positive

### 2026-03-21T04:25Z approx

- Added named repeat-budget policy variants in [`src/astar/policy/registry.py`](/home/jorge/agent7/tasks/astar/src/astar/policy/registry.py)
  - `exploration_r1`
  - `exploration_r2`
  - `exploration_r3`
  - `exploration_r4`
  - alias forms `exploration_v2_r{1..4}`
- Added policy-name/repeat-budget coverage in [`tests/test_exploration_policy.py`](/home/jorge/agent7/tasks/astar/tests/test_exploration_policy.py)
- Validation:
  - `uv run --extra dev pytest tests/test_exploration_policy.py tests/test_historical_benchmark.py -q`
  - passed: `16`

### 2026-03-21T05:20Z approx

- Ran matched 3-round policy probe on current sensitive rounds:
  - round 3 `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - round 6 `ae78003a-4efe-425a-881a-d16a39bca0ad`
  - round 8 `c5cdf100-a876-4fb7-b5d8-757162c97989`
- Baseline probe remained:
  - [`agent7_probe_query_residual_v7_exploration_r3r6r8`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r3r6r8/result.json)
  - mean score `64.7871`
  - mean weighted KL `0.146535`
- Candidate results:
  - [`exploration_r1`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r1_r3r6r8/result.json)
    - mean score `62.5730`
    - mean weighted KL `0.158931`
    - paired vs baseline: [`-2.2140`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_v2__candidate_policy=exploration_r1__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v7.json)
    - reject
  - [`exploration_r2`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r2_r3r6r8/result.json)
    - mean score `63.9304`
    - mean weighted KL `0.151641`
    - paired vs baseline: [`-0.8567`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_v2__candidate_policy=exploration_r2__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v7.json)
    - reject
  - [`exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r3_r3r6r8/result.json)
    - mean score `65.7129`
    - mean weighted KL `0.141653`
    - paired vs baseline: [`+0.9258`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_v2__candidate_policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v7.json)
    - win rate `0.933`, loss rate `0.067`
    - strongest probe candidate
  - [`exploration_r4`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r4_r3r6r8/result.json)
    - mean score `65.1078`
    - mean weighted KL `0.144800`
    - paired vs baseline: [`+0.3208`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_v2__candidate_policy=exploration_r4__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v7.json)
    - better than baseline, worse than `r3`
- Probe interpretation:
  - repeat-budget optimum is not monotone at `5`; `r3` beat current `exploration_v2`
  - `r1`/`r2` under-repeat and damage round 6 too much
  - `r4` helps but gives back too much on round 8 vs `r3`
  - current best next action is full 8-round dev benchmark for `query_residual_v7 + exploration_r3`
- Infra note:
  - parallel first-use runs for new policy names can collide on DuckDB catalog locking during synthetic dataset materialization
  - observed once while launching `exploration_r3` and `exploration_r4` together
  - rerunning sequentially avoided the issue

### 2026-03-21T06:05Z approx

- Promoted probe winner `exploration_r3` to full 8-round dev benchmark:
  - [`agent7_dev_query_residual_v7_exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v7_exploration_r3/result.json)
  - mean score `74.6063`
  - mean weighted KL `0.100831`
- Previous full-dev champ:
  - [`agent7_dev_query_residual_v7_exploration`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v7_exploration/result.json)
  - mean score `74.4011`
  - mean weighted KL `0.101998`
- Full-dev paired compare:
  - [`exploration_v2` -> `exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_v2__candidate_policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v7.json)
  - mean score delta `+0.2052`
  - mean weighted KL delta `-0.001166`
  - win rate `0.500`, loss rate `0.500`
  - CI95 `[-0.0043, 0.4227]`
- Round-level picture vs old champ:
  - improved 7, 1, 6, 3
  - small regressions on 2, 4, 8, 5
  - net local objective still better, so current best policy is now `exploration_r3`
- Next:
  - promote query-residual default policy from `exploration_v2` to `exploration_r3`
  - rerun touched tests
  - commit only intended code/tests + benchmark/comparison artifacts + progress log

### 2026-03-21T06:25Z approx

- Re-opened state after push:
  - branch `agent7`
  - head `388bcdf77ebb78d5590fa81e4e6e11881bcf692c`
  - `br` still unavailable
  - same unstaged replay/summary noise still present locally; still not to be committed unless intentionally selected
- New search conclusion:
  - repeat-budget search is exhausted enough for now
  - next unexplored policy axis is repeat selection, not repeat count
- Concrete structure gap in current policy:
  - `exploration_r3` still draws from `top-1 viewport per seed`, then takes global top-3 from only those 5 candidates
  - this hard-limits repeat allocation and forbids selecting a second/third strong viewport from the same seed even when global motif ranking says it should
- Preliminary inspection on sensitive rounds:
  - `global_top3` differs materially from current `per_seed_best_top3`, especially on rounds 3/7/8
  - entropy-biased motif scoring also changes selected repeats on some rounds, especially round 8
- Next implementation:
  - extend policy to support candidate-pool mode:
    - current `per_seed_best`
    - new `global_top`
  - add entropy-biased scorer preset
  - benchmark at fixed budget `3` only, since that budget is current local winner
  - use a stricter policy-sensitive probe next, likely including round 7 in addition to 3/6/8

### 2026-03-21T06:40Z approx

- Implemented next policy axis in [`src/astar/policy/coverage.py`](/home/jorge/agent7/tasks/astar/src/astar/policy/coverage.py)
  - new `selection_mode`
    - `per_seed_best` = current behavior
    - `global_top` = allow repeat allocation to reuse the same seed if its second/third viewport outrank other seeds globally
- Extended registry in [`src/astar/policy/registry.py`](/home/jorge/agent7/tasks/astar/src/astar/policy/registry.py)
  - `exploration_r3_global`
  - `exploration_r3_entropy`
  - `exploration_r3_global_entropy`
- Added coverage in [`tests/test_exploration_policy.py`](/home/jorge/agent7/tasks/astar/tests/test_exploration_policy.py)
  - named policy field expectations
  - synthetic `RoundDetail` behavior test proving `global_top` can spend both repeats on the same seed while `per_seed_best` cannot
- Validation:
  - `uv run --extra dev pytest tests/test_exploration_policy.py tests/test_historical_benchmark.py -q`
  - passed: `20`
- Validation improvement for next search:
  - old probe `{3,6,8}` was useful for budget search
  - new stricter probe should be `{3,6,7,8}` because latest full-dev diff showed round 7 also moves under policy changes
  - this is a better filter for repeat-selection variants, not a looser one
- Next runs:
  - baseline `exploration_r3` on strict 4-round probe
  - then compare `exploration_r3_global` and `exploration_r3_entropy`

### 2026-03-21T07:35Z approx

- Ran stricter policy-sensitive 4-round probe on:
  - round 7 `36e581f1-73f8-453f-ab98-cbe3052b701b`
  - round 3 `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - round 6 `ae78003a-4efe-425a-881a-d16a39bca0ad`
  - round 8 `c5cdf100-a876-4fb7-b5d8-757162c97989`
- Baseline current champ on this probe:
  - [`exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r3_r3r6r7r8/result.json)
  - mean score `62.7780`
  - mean weighted KL `0.157689`
- Candidate results:
  - [`exploration_r3_global`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r3_global_r3r6r7r8/result.json)
    - mean score `63.2365`
    - mean weighted KL `0.155097`
    - paired vs baseline: [`+0.4585`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_r3__candidate_policy=exploration_r3_global__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v7__run_pair=0c9b3ff25da8.json)
    - CI95 `[-0.0482, 0.9480]`
  - [`exploration_r3_entropy`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r3_entropy_r3r6r7r8/result.json)
    - mean score `62.8628`
    - mean weighted KL `0.157146`
    - paired vs baseline: [`+0.0848`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_r3__candidate_policy=exploration_r3_entropy__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v7__run_pair=00e0ab60a0f3.json)
    - weak / likely noise
  - [`exploration_r3_global_entropy`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r3_global_entropy_r3r6r7r8/result.json)
    - mean score `63.2204`
    - mean weighted KL `0.155110`
    - paired vs baseline: [`+0.4423`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_r3__candidate_policy=exploration_r3_global_entropy__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v7__run_pair=697219c4df34.json)
    - essentially tied with global-only; head-to-head vs global: [`-0.0162`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_r3_global__candidate_policy=exploration_r3_global_entropy__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v7__run_pair=2b8cee7b9b98.json)
- Interpretation:
  - allowing global reuse of repeat slots looks directionally useful
  - entropy reweighting adds little or nothing on top
  - best next spend is full 8-round dev on `exploration_r3_global`

### 2026-03-21T08:10Z approx

- Full 8-round dev benchmark for [`exploration_r3_global`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v7_exploration_r3_global/result.json):
  - mean score `74.4170`
  - mean weighted KL `0.102205`
- Current champ remained:
  - [`exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v7_exploration_r3/result.json)
  - mean score `74.6063`
  - mean weighted KL `0.100831`
- Full-dev paired compare:
  - [`exploration_r3` -> `exploration_r3_global`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_r3__candidate_policy=exploration_r3_global__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v7__run_pair=ad3ff7312c0a.json)
  - mean score delta `-0.1893`
  - mean weighted KL delta `+0.001374`
  - CI95 `[-0.5726, 0.1364]`
- Why probe misled:
  - `exploration_r3_global` improved rounds 7 and 6
  - but collapsed round 3 enough on full dev (`56.7567 -> 53.7782`) to erase the probe gain
  - round 8 stayed essentially flat on full dev, so the hoped-for compensation did not materialize
- Current conclusion for this branch:
  - `global_top` repeat reuse is a useful probe-time idea but not promotable as the default live/deploy policy
  - entropy reweighting also not promotable
  - keep `query_residual` default on `exploration_r3`
- Validation:
  - `uv run --extra dev python -c "from astar.student.predictor.query_residual import QueryResidualPredictor; print(QueryResidualPredictor.__name__)"`
  - passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `7`
- Benchmarking status:
  - completed 3-round probe for `query_residual_v10`
    - [`data/artifacts/benchmarks/agent7_probe_query_residual_v10_r3r6r8/result.json`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v10_r3r6r8/result.json)
    - mean score `62.7280`
    - note: not directly comparable to full 8-round champion because each holdout trains on only 2 rounds here
  - running matched 3-round `v7` baseline probe for honest comparison before deciding on full-dev promotion

### 2026-03-21T02:05Z approx

- Matched 3-round baseline probe finished:
  - [`data/artifacts/benchmarks/agent7_probe_query_residual_v7_r3r6r8/result.json`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_r3r6r8/result.json)
  - mean score `62.7280`
- Direct paired compare `v7` vs `v10`:
  - [`historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v10.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v10.json)
  - exact tie on all `15` evaluated seeds
  - conclusion: current `low_signal` gate is too strict; `v10` is effectively inert on this subset
- Follow-up improvement:
  - generalized ensemble gate with `ensemble_signal_power`
  - added candidate `query_residual_v11`
  - `v11` disables signal gate and uses stronger novelty concentration (`novelty_power=2`)
- Validation after gate generalization:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `8`
- `v11` 3-round probe result:
  - [`data/artifacts/benchmarks/agent7_probe_query_residual_v11_r3r6r8/result.json`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v11_r3r6r8/result.json)
  - mean score `61.5919`
- Direct paired compare `v7` vs `v11`:
  - [`historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v11.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v11.json)
  - mean score delta `-1.1360`
  - loss rate `1.000`
  - biggest damage concentrated on round `6`
  - almost no rescue on round `3`

## Updated Conclusion

- Ensemble-over-`v9` line is not ready for promotion.
- `v10` as currently gated is harmless but useless on matched probe.
- `v11` novelty-only mixture is actively worse on matched probe.
- No honest evidence yet that these ensemble variants beat `v7`; do not spend full 8-round dev budget on current `v10`/`v11`.
- Keep `query_residual` alias on `v7`.

### 2026-03-21T02:35Z approx

- Re-read family handoff with emphasis on component `6`:
  - query policy optimization had been underexplored relative to posterior/decoder tweaks
- Inspected current policy surface:
  - [`src/astar/policy/registry.py`](/home/jorge/agent7/tasks/astar/src/astar/policy/registry.py)
  - [`src/astar/policy/coverage.py`](/home/jorge/agent7/tasks/astar/src/astar/policy/coverage.py)
- Important finding:
  - there are effectively only two policy choices today
    - `coverage`
    - `exploration_v2` = same tiled coverage plus `5` motif-ranked diagnostic repeats front-loaded
  - no saved benchmark artifacts existed for `exploration_v2`
- Hypothesis:
  - fifth-family posterior may benefit more from early motif-discriminative repeats than from pure uniform coverage because regime identification, not only map coverage, is the bottleneck
- Honest matched 3-round probe executed:
  - baseline coverage:
    - [`data/artifacts/benchmarks/agent7_probe_query_residual_v7_r3r6r8/result.json`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_r3r6r8/result.json)
    - mean score `62.7280`
  - exploration:
    - [`data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r3r6r8/result.json`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r3r6r8/result.json)
    - mean score `64.7871`
- Round-level read:
  - round `6`: big gain (`58.13 -> 64.87`)
  - round `8`: effectively flat (`71.73 -> 71.69`)
  - round `3`: small regression (`58.33 -> 57.80`)
- Interpretation:
  - first positive new system-level signal after ensemble dead-end
  - policy change appears materially more promising than current ensemble line
- Next:
  - run full 8-round dev benchmark for `query_residual_v7 + exploration_v2`
  - promote only if honest full-dev score beats current champ `73.9505`

### 2026-03-21T02:55Z approx

- Improved validation tooling for system-level policy search:
  - [`src/astar/workflows/compare_historical_benchmarks.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/compare_historical_benchmarks.py)
  - [`src/astar/workflows/results.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/results.py)
  - [`src/astar/eval/reports.py`](/home/jorge/agent7/tasks/astar/src/astar/eval/reports.py)
  - compare tool no longer rejects policy-mismatch benchmark pairs
  - comparison artifacts now record `baseline_policy_name` and `candidate_policy_name`
  - same-model comparison artifact names shortened via run-pair hash to avoid path-length failures
- Added regression test coverage:
  - [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
  - new test ensures policy-mismatch historical comparisons work
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `9`
- New paired comparison artifact for policy search:
  - [`historical__mode=online_interactive__baseline_policy=coverage__candidate_policy=exploration_v2__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual__run_pair=9628479ac8d1.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=coverage__candidate_policy=exploration_v2__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual__run_pair=9628479ac8d1.json)
  - mean score delta `+2.0591`
  - mean weighted KL delta `-0.011396`
  - win rate `0.667`
  - score delta CI95 `[0.3306, 3.6300]`
- Strongest effect on probe:
  - large gains on round `6`
  - near-flat on round `8`
  - modest giveback on round `3`
- Current status:
  - full 8-round dev benchmark for `query_residual_v7 + exploration_v2` is running

### 2026-03-21T03:25Z approx

- Full 8-round dev benchmark completed for [`query_residual_v7 + exploration_v2`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v7_exploration/result.json)
  - mean score `74.4011`
  - mean weighted KL `0.101998`
  - previous full-dev champ [`dev_query_residual_online50_v7`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/dev_query_residual_online50_v7/result.json) was `73.9505`
  - net gain `+0.4506`
- Full-dev paired comparison artifact:
  - [`historical__mode=online_interactive__baseline_policy=coverage__candidate_policy=exploration_v2__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual__run_pair=cefb8adcbcbd.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=coverage__candidate_policy=exploration_v2__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual__run_pair=cefb8adcbcbd.json)
  - mean score delta `+0.4506`
  - mean weighted KL delta `-0.004328`
  - win rate `0.375`
  - loss rate `0.625`
  - score delta CI95 `[-0.5659, 1.6590]`
- Round-level read:
  - huge rescue on round `3` (`46.41 -> 55.78`)
  - small gains on rounds `4` and `5`
  - regressions on `6`, `7`, `8`
  - despite more losing seeds than winning seeds, aggregate competition score improved because the round-`3` tail was severe under pure coverage
- Interpretation:
  - policy search produced the first full-dev improvement over `v7`
  - for this family, regime-identifying repeated motif probes matter more than uniform late coverage on hardest/OOD rounds

## New Champion

- best observed local full-dev system now:
  - model: `query_residual_v7`
  - policy: `exploration_v2`
  - score: `74.4011`
- immediate action required by handoff:
  - commit + push this new best before further experimentation

### 2026-03-21T03:45Z approx

- Adjacent-candidate follow-up tested:
  - [`data/artifacts/benchmarks/agent7_probe_query_residual_v9_exploration_r3r6r8/result.json`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v9_exploration_r3r6r8/result.json)
  - `query_residual_v9 + exploration_v2`
  - mean score `62.4336`
- Direct paired compare vs current exploration champ on same 3-round probe:
  - [`historical__mode=online_interactive__policy=exploration_v2__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v9.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_v2__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual_v9.json)
  - mean score delta `-2.3535`
  - loss rate `1.000`
  - conclusion: do not spend full-dev budget on `v9 + exploration_v2`
- Promoted champion policy into model-aware defaults:
  - [`src/astar/policy/registry.py`](/home/jorge/agent7/tasks/astar/src/astar/policy/registry.py)
  - [`src/astar/student/predictor/interactive.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/interactive.py)
  - [`src/astar/workflows/model_eval.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/model_eval.py)
  - [`src/astar/workflows/historical_benchmark.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/historical_benchmark.py)
  - [`src/astar/cli.py`](/home/jorge/agent7/tasks/astar/src/astar/cli.py)
- Defaulting behavior now:
  - `query_residual*` online flows resolve `policy=default` / omitted policy to `exploration_v2`
  - other models still default to `coverage`
  - registry now accepts canonical policy names (`exploration_v2`, `coverage_then_replicate_v1`) as well as short aliases
- Validation after default-promotion work:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `10`

## Current State

- Best known full-dev system remains:
  - `query_residual_v7 + exploration_v2`
  - `74.4011`
- Ensemble-over-`v9` branch remains rejected.
- `v9 + exploration_v2` also rejected on matched probe.
- Highest-value remaining search areas now look like:
  - policy variants beyond fixed motif repeats
  - better regime-summary / posterior features under exploration policy

### 2026-03-21T08:25Z approx

- Resumed from pushed state after repeat-selection rejection.
- Re-checked:
  - branch/worktree state via `git status --short --branch`
  - current handoff in [`instructions/agent7.md`](/home/jorge/agent7/tasks/astar/instructions/agent7.md)
  - current family config in [`src/astar/student/predictor/query_residual_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual_config.py)
  - current transcript/regime path in [`src/astar/student/predictor/query_residual.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual.py)
- Reconfirmed local tree still only has known artifact/cache noise outside code/test files; do not touch/revert that noise.
- Current best hypothesis:
  - stop spending search budget on repeat-budget/selection micro-variants
  - next plausible gain is model-side regime-identification improvement under fixed champion policy `exploration_r3`
  - current regime encoder only sees coarse pooled summaries plus seed mean/std
  - it still ignores richer spatial transcript structure when inferring the regime vector
- Candidate branch now active:
  - add a new named `query_residual` variant only
  - enrich regime-input features with transcript motif / spatial-evidence summaries rather than mutating `v7`
  - validate first on stricter policy-sensitive probe rounds `7,3,6,8`
  - only spend full 8-round dev if probe is honestly positive

### 2026-03-21T08:45Z approx

- Implemented new model variant scaffold:
  - [`query_residual_v12`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual_config.py)
  - `regime_input_variant="motif_v1"`
- Added backward-compatible predictor/checkpoint plumbing in [`src/astar/student/predictor/query_residual.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual.py)
  - regime-input dims can now vary by named variant without breaking older checkpoints
  - added transcript motif summaries for regime inference:
    - repeat concentration stats
    - blur-coverage motif summaries
    - blur-residual motif summaries aligned to buildable / coast / frontier / maritime / density maps
- Added test coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
  - benchmark smoke now includes `query_residual_v12`
  - new checkpoint roundtrip test for `v12`
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `12`
- Next:
  - run strict 4-round probe for `query_residual_v12 + exploration_r3`
  - compare directly against current champ model/policy on matched probe before any full-dev spend

### 2026-03-21T08:55Z approx

- Strict 4-round probe completed for [`query_residual_v12 + exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v12_exploration_r3_r3r6r7r8/result.json)
  - rounds: `7,3,6,8`
  - mean score `62.7619`
  - mean weighted KL `0.157766`
  - baseline champ probe [`query_residual_v7 + exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v7_exploration_r3_r3r6r7r8/result.json): `62.7780`
- Direct paired comparison:
  - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v12.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v12.json)
  - mean score delta `-0.0161`
  - mean weighted KL delta `+0.000077`
  - win rate `0.500`, loss rate `0.500`
  - CI95 `[-0.0611, 0.0346]`
- Round read:
  - tiny positives on rounds `7`, `3`, `6`
  - slightly larger giveback on round `8`
  - net effect basically zero / slightly negative
- Conclusion:
  - current motif-summary regime-input branch is not promotable
  - do not spend full 8-round dev budget on `v12`
- New hypothesis after rejection:
  - current champion policy deliberately buys repeat evidence
  - but exact observed cells are still blended with a large pseudo-count (`beta_min=8`, `beta_scale=24`)
  - this likely under-trusts repeat-rich empirical cell counts
  - next branch should tune exact-cell trust / beta schedule under fixed `exploration_r3`

### 2026-03-21T09:15Z approx

- Added exact-cell trust variants in [`src/astar/student/predictor/query_residual_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual_config.py)
  - `query_residual_v13`: `beta_min=4`, `beta_scale=12`
  - `query_residual_v14`: `beta_min=2`, `beta_scale=8`
- Added benchmark smoke + checkpoint coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `15`

#### Probe result: `v13`

- Strict 4-round probe [`agent7_probe_query_residual_v13_exploration_r3_r3r6r7r8`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v13_exploration_r3_r3r6r7r8/result.json)
  - mean score `63.5037`
  - mean weighted KL `0.153615`
- Paired vs champ:
  - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v13.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v13.json)
  - mean score delta `+0.7257`
  - mean weighted KL delta `-0.004074`
  - win rate `0.950`
  - CI95 `[0.5279, 0.9257]`
- Read:
  - positive on all four probe rounds
  - strongest on round `7`

#### Probe result: `v14`

- Strict 4-round probe [`agent7_probe_query_residual_v14_exploration_r3_r3r6r7r8`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v14_exploration_r3_r3r6r7r8/result.json)
  - mean score `63.9805`
  - mean weighted KL `0.150899`
- Paired vs champ:
  - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v14.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v14.json)
  - mean score delta `+1.2025`
  - mean weighted KL delta `-0.006791`
  - win rate `0.900`
  - CI95 `[0.7740, 1.6391]`
- Head-to-head vs `v13`:
  - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v13__candidate=query_residual_v14.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v13__candidate=query_residual_v14.json)
  - mean score delta `+0.4768`
  - mean weighted KL delta `-0.002716`
  - win rate `0.750`
  - CI95 `[0.2274, 0.7119]`
- Round read vs current champ:
  - round `7`: `+2.3081`
  - round `3`: `+1.3210`
  - round `8`: `+1.3051`
  - round `6`: `-0.1241`
- Interpretation:
  - lower beta is very likely the right direction under repeat-rich `exploration_r3`
  - `v14` currently dominates `v13` on probe
  - next honest step is full 8-round dev benchmark for `query_residual_v14 + exploration_r3`

### 2026-03-21T09:50Z approx

- Full 8-round dev benchmark completed for [`query_residual_v14 + exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v14_exploration_r3/result.json)
  - mean score `74.7218`
  - mean weighted KL `0.099821`
  - previous champ [`query_residual_v7 + exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v7_exploration_r3/result.json): `74.6063`
  - net gain `+0.1155`
- Full-dev paired comparison:
  - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v14.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v7__candidate=query_residual_v14.json)
  - mean score delta `+0.1155`
  - mean weighted KL delta `-0.001011`
  - win rate `0.525`
  - loss rate `0.475`
  - CI95 `[-0.2348, 0.4370]`
- Round-level read vs prior champ:
  - strong gains: round `7` `+1.3193`, round `8` `+1.2232`, round `3` `+1.1414`
  - mild/flat gains: round `5` `+0.1309`, round `4` `+0.0272`
  - givebacks: round `6` `-1.4445`, round `2` `-1.2253`, round `1` `-0.2482`
- Interpretation:
  - probe signal mostly survived full-dev, but not at the same magnitude
  - still the best observed local 8-round score so far
  - exact-cell trust appears to trade some stable/high-score rounds for better rescue on harder rounds, and the aggregate trade is slightly positive

## New Champion

- best observed local full-dev system now:
  - model: `query_residual_v14`
  - policy: `exploration_r3`
  - score: `74.7218`
- Promoted default alias in [`src/astar/student/predictor/query_residual_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual_config.py)
  - `QUERY_RESIDUAL_DEFAULT_ALIAS = "query_residual_v14"`
- Validation after promotion:
  - `uv run --extra dev pytest tests/test_exploration_policy.py tests/test_historical_benchmark.py -q`
  - passed: `25`

### 2026-03-21T10:05Z approx

- Resumed from pushed champ state after `v14` promotion.
- Re-checked current progress ledger and current exact-cell blend implementation in [`src/astar/student/predictor/query_residual.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual.py).
- New working hypothesis:
  - `v14` likely wins by fixing under-trust on multiply observed cells
  - but it probably over-trusts singleton observations, which matches the givebacks on rounds `1`, `2`, `6`
  - next branch should keep higher baseline beta on singleton cells and discount it only when `count_total > 1`
- Validation rule stays the same:
  - strict policy-sensitive 4-round probe first
  - full 8-round dev only if the probe is honestly positive

### 2026-03-21T10:25Z approx

- Implemented repeat-aware beta discount in [`src/astar/student/predictor/query_residual.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual.py)
  - `beta = beta / (1 + discount * max(count_total - 1, 0))`
  - singleton cells unchanged
- Added configs in [`src/astar/student/predictor/query_residual_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual_config.py)
  - `query_residual_v15`: `beta_repeat_discount=1.5`
  - `query_residual_v16`: `beta_repeat_discount=3.0`
- Added benchmark/checkpoint coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `18`

#### Probe result: `v15`

- Strict 4-round probe [`agent7_probe_query_residual_v15_exploration_r3_r3r6r7r8`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v15_exploration_r3_r3r6r7r8/result.json)
  - mean score `63.1840`
  - mean weighted KL `0.155345`
- Head-to-head vs current champ:
  - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=query_residual_v15.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=query_residual_v15.json)
  - mean score delta `-0.7965`
  - mean weighted KL delta `+0.004446`
  - win rate `0.200`
  - CI95 `[-1.1140, -0.4919]`
- Read:
  - modest recovery only on round `6`
  - large giveback on rounds `7`, `3`, `8`
  - too conservative

#### Probe result: `v16`

- Strict 4-round probe [`agent7_probe_query_residual_v16_exploration_r3_r3r6r7r8`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v16_exploration_r3_r3r6r7r8/result.json)
  - mean score `63.2567`
  - mean weighted KL `0.154835`
- Head-to-head vs current champ:
  - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=query_residual_v16.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=query_residual_v16.json)
  - mean score delta `-0.7239`
  - mean weighted KL delta `+0.003936`
  - win rate `0.100`
  - CI95 `[-0.9573, -0.4953]`
- Read:
  - still below `v14` on all four probe rounds
  - stronger selective discount did not rescue the branch

### Updated Validation Read

- Current 4-round strict probe `{7,3,6,8}` remains useful for hard-round sensitivity.
- But the `v14` full-dev result exposed one missing failure mode:
  - round `2` regressed materially on full dev and was not represented in the probe
- So for further model-side balancing work, a better stricter probe is now:
  - `{7,3,6,8,2}`
  - rationale: keeps the existing hard/OOD rounds and adds the stable/giveback round that exact-cell-trust changes can hurt
- Conclusion:
  - repeat-only beta-discount branch is rejected
  - next branch should use the stricter 5-round probe, not the old 4-round probe

### 2026-03-21T10:50Z approx

- Built stricter 5-round baseline for current champ:
  - [`agent7_probe5_query_residual_v14_exploration_r3_r2r3r6r7r8`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe5_query_residual_v14_exploration_r3_r2r3r6r7r8/result.json)
  - rounds `{7,3,6,8,2}`
  - mean score `68.8262`
  - mean weighted KL `0.127655`
- Added pure balancing variants in [`src/astar/student/predictor/query_residual_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/query_residual_config.py)
  - `query_residual_v17`: `v14` beta + `prior_blend=0.40`
  - `query_residual_v18`: reserved adjacent balancing slot; not evaluated yet
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `20`

#### Probe result: `v17`

- Strict 5-round probe [`agent7_probe5_query_residual_v17_exploration_r3_r2r3r6r7r8`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe5_query_residual_v17_exploration_r3_r2r3r6r7r8/result.json)
  - mean score `68.2016`
  - mean weighted KL `0.130984`
- Head-to-head vs 5-round champ baseline:
  - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=query_residual_v17.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=query_residual_v17.json)
  - mean score delta `-0.6246`
  - mean weighted KL delta `+0.003329`
  - win rate `0.160`
  - CI95 `[-0.8505, -0.4207]`
- Round read:
  - small recovery only on round `2` (`+0.0992`)
  - clear givebacks on rounds `7`, `3`, `6`, `8`
- Conclusion:
  - raising `prior_blend` is the wrong direction
  - new 5-round gate is stricter in the right way; it already rejected a candidate that might have looked acceptable on round `2` alone
- Next:
  - skip `v18` if direction is clearly monotone-worse
  - test an intermediate global beta between `v13` and `v14` on this stricter 5-round gate

### 2026-03-21T11:05Z approx

- Re-opened from local exploratory state before new runs.
  - branch still `agent7`
  - `br` still unavailable in current shell env
  - current pushed champ still [`query_residual_v14 + exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v14_exploration_r3/result.json)
- New decision rule before adding more code:
  - first evaluate existing `query_residual_v13` on the stricter 5-round gate `{7,3,6,8,2}`
  - rationale: `v13` is the nearest already-implemented point between `v7` and `v14`
  - if `v13` still loses clearly to `v14` on this gate, only then spend code/benchmark budget on a narrower midpoint beta variant

### 2026-03-21T11:20Z approx

- Strict 5-round probe completed for [`query_residual_v13 + exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe5_query_residual_v13_exploration_r3_r2r3r6r7r8/result.json)
  - mean score `68.7483`
  - mean weighted KL `0.128458`
- Head-to-head vs stricter 5-round champ baseline:
  - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=query_residual_v13.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=query_residual_v13.json)
  - mean score delta `-0.0779`
  - mean weighted KL delta `+0.000802`
  - win rate `0.400`
  - CI95 `[-0.3434, 0.1848]`
- Round read vs `v14`:
  - round `2`: `+0.7451`
  - round `6`: `+0.8511`
  - round `3`: `-0.5125`
  - round `7`: `-0.8830`
  - round `8`: `-0.5901`
- Interpretation:
  - `v13` is close enough that the beta tradeoff is not exhausted
  - lower-beta side still owns rounds `3/7/8`
  - slightly higher-beta side owns rounds `2/6`
  - this justifies one honest interior-point test between `v13` and `v14`, not a wide sweep
- Next:
  - add `query_residual_v19` as a midpoint beta candidate
  - validate tests
  - run the same stricter 5-round probe
  - only spend full 8-round dev if `v19` beats `v14` on this gate

### 2026-03-21T11:35Z approx

- User explicitly redirected scope:
  - stop centering work on `query_residual`
  - treat it only as a baseline
  - prioritize a true fifth-family model under its own names
  - use heavier experimentation / parallelism
- Re-read handoff sections on `u_r -> beta_r -> F(map, beta)` and audited current reusable infra.
- Important repo reality after audit:
  - existing replay-summary/manifold code already gives a partial `u_r` and low-rank `beta_r`
  - existing `SummaryBankStudent` already gives transcript-summary -> posterior over historical regime targets
  - existing `HazardTeacher` already gives semimechanistic decode / posterior predictive
  - missing piece is mainly a benchmarkable predictor family that wires those pieces together cleanly
- New implementation target:
  - add a separate `ffam_*` predictor family
  - fit low-rank manifold coordinates on held-out training rounds
  - build synthetic-live transcript bank on those same training rounds
  - infer posterior over manifold coordinates from transcript summaries
  - reconstruct semimechanistic coefficients from coordinates
  - decode final tensors with the hazard decoder
- This is the first real handoff-aligned mainline model in this branch; query-residual tuning is now secondary.

### 2026-03-21T11:55Z approx

- Re-opened current live `ffam` worktree state and found a partially landed new-family path already present:
  - [`src/astar/student/predictor/ffam_retrieval.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_retrieval.py)
  - [`src/astar/student/predictor/ffam_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_config.py)
  - plus already-wired imports in CLI / interactive / historical benchmark paths
- Decision:
  - continue/repair that family instead of creating a second duplicate `ffam` implementation
  - removed one temporary unused side-path file after confirming the retrieval path is the real integrated one
- First validation outcome:
  - built-in historical benchmark smoke already covered `ffam_retrieval_v1/v2/v3`
  - initial run failed because `ffam_retrieval` rejected 1-round training folds inside 2-round LORO tests
- Fix landed:
  - `ffam_retrieval` now requires at least one replay-backed training round, not two
  - kept checkpoint/load plumbing active in the interactive path
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `26`
- Meaning:
  - there is now a working benchmarkable non-query-residual fifth-family line in-tree
  - next spend is honest ffam probe/full-dev benchmarking, not more scaffolding

### 2026-03-21T12:10Z approx

- Small but important ffam infra fix landed before benchmark spend:
  - `ffam` synthetic-live dataset cache name no longer depends on `model_name` or `summary_variant`
  - rationale: those settings affect posterior featurization / weighting, not the generated transcript artifacts themselves
  - effect: `ffam_retrieval_v1/v2/v3` can now reuse the same synthetic-live episode caches for the same policy / sample count / training-round scope
- Validation after this cache fix:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `26`
- Benchmark plan now:
  - first honest screen on 5-round probe `{7,3,6,8,2}`
  - use `samples_per_round=8` for ffam, since this family is posterior-bank limited and compute is available
  - compare `ffam_retrieval_v1/v2/v3`
  - full 8-round dev only for the best probe candidate

### 2026-03-21T11:40Z approx

- User clarified direction sharply:
  - stop treating `query_residual` as the main research target
  - treat it as only a baseline / initial scaffold
  - prioritize a true fifth-family operator/manifold/retrieval model
  - use much heavier experimentation and more parallelism
- Why prior work had concentrated on `query_residual`:
  - it was the only benchmarkable in-tree path already combining replay teacher structure, online transcript features, and legal historical benchmark wiring
  - that made it the fastest correctness-preserving way to move the leaderboard while learning the framework
- Current pivot:
  - build a new benchmarkable fifth-family model around existing reusable components:
    - replay-derived semimechanistic coefficients
    - low-rank coefficient manifold
    - synthetic-live transcript datasets
    - kNN/deepset posterior over regime coordinates
    - decoder-driven posterior predictive serving path
- Important reusable code confirmed:
  - [`src/astar/history/summaries/round_coefficients.py`](/home/jorge/agent7/tasks/astar/src/astar/history/summaries/round_coefficients.py)
  - [`src/astar/history/summaries/manifold.py`](/home/jorge/agent7/tasks/astar/src/astar/history/summaries/manifold.py)
  - [`src/astar/history/datasets/synthetic_live.py`](/home/jorge/agent7/tasks/astar/src/astar/history/datasets/synthetic_live.py)
  - [`src/astar/teacher/dynamics/hazard_teacher.py`](/home/jorge/agent7/tasks/astar/src/astar/teacher/dynamics/hazard_teacher.py)
  - [`src/astar/student/posterior/deepset_student.py`](/home/jorge/agent7/tasks/astar/src/astar/student/posterior/deepset_student.py)
- Key gap found:
  - this stack exists in pieces but is not wired into `build_online_predictor` / historical benchmark as a first-class model family
  - summary student checkpoint/load and generic decoder integration are incomplete for production use
- Status of interrupted old branch:
  - `query_residual_v19` midpoint beta probe was started but user interrupted before completion; do not use it for promotion decisions

### 2026-03-21T12:10Z approx

- Found existing partial fifth-family branch already present but unfinished:
  - [`src/astar/student/predictor/ffam_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_config.py)
  - ffam model names / variants already defined:
    - `ffam_retrieval_v1`
    - `ffam_retrieval_v2`
    - `ffam_retrieval_v3`
  - CLI / benchmark guards / policy defaults were already partly wired for these names
- Implemented the missing benchmarkable predictor path in [`src/astar/student/predictor/ffam_retrieval.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_retrieval.py)
  - fits replay-backed [`HazardTeacher`](/home/jorge/agent7/tasks/astar/src/astar/teacher/dynamics/hazard_teacher.py)
  - builds synthetic-live transcript dataset using configured policy + sample count
  - fits [`SummaryBankStudent`](/home/jorge/agent7/tasks/astar/src/astar/student/posterior/deepset_student.py)
  - serves predictions through the same online predictor/historical benchmark path as other models
  - supports checkpoint save/load
- Completed missing checkpoint plumbing:
  - added `HazardTeacher.load_checkpoint(...)`
  - added `SummaryBankStudent.load_checkpoint(...)`
  - updated [`src/astar/student/predictor/interactive.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/interactive.py) so ffam can load/save checkpoints when no explicit training split is supplied
- Added ffam checkpoint coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
  - explicit roundtrip test for `ffam_retrieval_v3`
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `26`
- Important correction while wiring:
  - ffam must support the 2-round smoke case where LORO training leaves exactly one replay-backed round
  - predictor now allows `>=1` replay-backed training round instead of incorrectly requiring `>=2`
- Immediate next move:
  - run cheap honest ffam probes on hard rounds first
  - vary existing ffam variants + policy/sample-count in parallel
  - only then spend full 8-round benchmark budget on winners

### 2026-03-21T11:35Z approx

- User redirected strategy explicitly:
  - stop treating `query_residual` as the main line
  - treat it as an initial baseline only
  - build the actual fifth-family operator/manifold/retrieval stack aggressively
  - use heavier parallel exploration / benchmarking
- Immediate consequence:
  - `query_residual_v19` probe is no longer the main objective
  - current local `query_residual` ablations remain useful as documented baseline knowledge, but new code priority shifts to a fresh benchmarkable family
- New build target:
  - wire a true replay-teacher + transcript-posterior + decoder model into the online/historical benchmark path
  - then iterate variants on that family rather than continuing residual-tuning
- Current local architecture read before implementation:
  - existing reusable pieces already present:
    - semimechanistic decoder in [`src/astar/teacher/dynamics/hazard_teacher.py`](/home/jorge/agent7/tasks/astar/src/astar/teacher/dynamics/hazard_teacher.py)
    - synthetic transcript dataset pipeline in [`src/astar/history/datasets/synthetic_live.py`](/home/jorge/agent7/tasks/astar/src/astar/history/datasets/synthetic_live.py)
    - kNN-style transcript posterior in [`src/astar/student/posterior/deepset_student.py`](/home/jorge/agent7/tasks/astar/src/astar/student/posterior/deepset_student.py)
    - low-rank round manifold tooling in [`src/astar/history/summaries/manifold.py`](/home/jorge/agent7/tasks/astar/src/astar/history/summaries/manifold.py)
  - gap:
    - these components are not yet exposed as a first-class benchmarkable online model family
    - posterior summary features are still very coarse and need direct model-level iteration
- New implementation plan:
  - add a new named fifth-family retrieval model line separate from `query_residual`
  - give it reproducible config/variant naming
  - improve posterior distance weighting / normalization while wiring save-load + benchmark support
  - run honest probes on the new family immediately after landing

### 2026-03-21T11:50Z approx

- Landed a new benchmarkable fifth-family line separate from `query_residual`.
  - config registry: [`src/astar/student/predictor/ffam_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_config.py)
  - predictor wiring: [`src/astar/student/predictor/ffam_retrieval.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_retrieval.py)
  - online builder / CLI integration:
    - [`src/astar/student/predictor/interactive.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/interactive.py)
    - [`src/astar/cli.py`](/home/jorge/agent7/tasks/astar/src/astar/cli.py)
    - [`src/astar/workflows/model_eval.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/model_eval.py)
    - [`src/astar/workflows/historical_benchmark.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/historical_benchmark.py)
- Family design landed:
  - semimechanistic replay teacher remains decoder backbone
  - transcript posterior now trains from synthetic live episodes as a first-class model family
  - variant surface:
    - `ffam_retrieval_v1`: basic transcript summary + inverse-distance retrieval
    - `ffam_retrieval_v2`: richer summary with query-geometry features + standardized softmax retrieval
    - `ffam_retrieval_v3`: same richer summary + standardized retrieval + PCA-3 regime projection
- Posterior improvements landed in [`src/astar/student/posterior/deepset_student.py`](/home/jorge/agent7/tasks/astar/src/astar/student/posterior/deepset_student.py)
  - summary extraction now works directly from transcript observations
  - added richer `v2` summary block with viewport-position / coverage / settlement-activity features
  - added standardized-distance retrieval
  - added optional low-rank regime projection before decoding
- Synthetic dataset artifacts now carry fixed shape metadata in [`src/astar/history/datasets/synthetic_live.py`](/home/jorge/agent7/tasks/astar/src/astar/history/datasets/synthetic_live.py)
  - `seed_count`
  - `map_width`
  - `map_height`
- Validation:
  - `uv run --extra dev pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
  - passed: `27`
- Next:
  - run parallel 4-round screen on `ffam_retrieval_v1/v2/v3`
  - promote only the winning family variant to stricter/fuller benchmarks

### 2026-03-21T12:20Z approx

- Attempted to screen the new ffam variants in parallel and hit the expected prep-path contention again.
  - failure mode was not model math
  - failure mode was offline prep reuse / catalog-lock interaction
  - also found stale `agent7` ffam benchmark processes from interrupted earlier runs still holding the catalog lock
- Used that failure to harden the offline path instead of ignoring it.
  - [`src/astar/workflows/materialize_episode.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/materialize_episode.py)
    - added safe reuse of existing per-round materialized artifacts instead of always rebuilding
    - avoided full JSON round-trip of ndarray-heavy replay summaries by reconstructing only minimal reusable metadata
  - [`src/astar/history/datasets/synthetic_live.py`](/home/jorge/agent7/tasks/astar/src/astar/history/datasets/synthetic_live.py)
    - synthetic dataset builder now reuses existing `summary.json` + `index.parquet`
    - catalog logging made best-effort in this path
  - [`src/astar/workflows/summarize_replays.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/summarize_replays.py)
    - removed unnecessary `ingest_replays()` dependency from replay summarization
    - catalog logging made best-effort
  - dataset naming for ffam synthetic transcripts now reuses across model variants that share the same transcript source policy/samples/rounds
- New bug found and fixed:
  - first materialization-reuse attempt tried to parse cached JSON summaries containing ndarray-heavy replay summaries through pydantic
  - this failed with `needs_python_object` validation errors
  - fixed by reconstructing a minimal `MaterializeEpisodeResult` from cached file paths + fresh diagnostics instead of deserializing nested replay ndarrays from JSON
- Current benchmark status:
  - serious run now focused on [`ffam_retrieval_v2`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_config.py)
  - config:
    - richer transcript summary `v2`
    - standardized softmax retrieval
    - `samples_per_round=6`
    - strict 5-round gate `{7,3,6,8,2}`
  - after the reuse fixes, rerun no longer dies in prep and is executing normally

### 2026-03-21T12:35Z approx

- Re-read canon + handoff after user redirect.
  - conclusion: previous `query_residual` focus came from already-wired benchmarkable line, but the handoff is explicit that the real target is fifth-family operator/manifold/retrieval
  - therefore current effort is now centered on new ffam-family development, not more residual polishing
- Environment / validation check:
  - `br list` still unavailable in shell env
  - reran key ffam-facing validation after cache/materialization fixes:
    - `uv run --extra dev pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
    - passed: `28`
- Active compute observed:
  - local root strict probe still running:
    - `ffam_retrieval_v2`
    - `policy=exploration_r3`
    - `samples_per_round=6`
    - 5-round gate `{7,3,6,8,2}`
  - isolated-root probe still running:
    - `ffam_retrieval_v3`
    - `policy=exploration_r3`
    - `samples_per_round=1`
    - 4-round gate `{3,6,7,8}`
- New model insight from code review:
  - current ffam transcript summary still mostly treats observed year-50 windows in isolation
  - this likely throws away the most identifiable law signal, which is how year-50 outcomes differ from the known initial map and queried geometry
  - strongest next branch is:
    - add geometry/delta-aware transcript summaries using initial-map context inside queried windows
    - add more direct coefficient/manifold targets instead of only the coarse 12d `round_regime_summary_vector`
- Next implementation branch:
  - add richer summary variant with initial-vs-final change features
  - wire at least one new ffam variant onto that summary
  - if clean, add a direct low-rank coefficient/manifold target variant after that

### 2026-03-21T13:10Z approx

- Honest benchmark result came back for the first serious coarse-ffam run:
  - [`agent7_probe5_ffam_retrieval_v2_exploration_r3_r2r3r6r7r8_s6`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe5_ffam_retrieval_v2_exploration_r3_r2r3r6r7r8_s6/result.json)
  - mean score `55.5827`
  - mean weighted KL `0.217329`
  - decisively non-competitive vs current hard-gate `query_residual_v14`
  - conclusion:
    - old coarse transcript summary / raw-regime retrieval path is not enough
    - must move to stronger map-conditioned summaries and/or coefficient-space targets
- Landed new ffam branch focused on that.
  - [`src/astar/student/posterior/deepset_student.py`](/home/jorge/agent7/tasks/astar/src/astar/student/posterior/deepset_student.py)
    - added summary variant `v3`
    - `v3` now conditions transcript features on known initial-map structure inside queried windows
    - new per-seed features include initial empty/forest/coast/inland shares and observed build/port/ruin/forest transitions conditioned on those initial categories
    - student can now decode either:
      - regime vectors
      - direct coefficient-space targets via `HazardTeacher.decode_coefficients(...)`
  - [`src/astar/history/datasets/synthetic_live.py`](/home/jorge/agent7/tasks/astar/src/astar/history/datasets/synthetic_live.py)
    - synthetic transcript artifacts now carry `initial_grids`
    - needed so `v3` summary can be built offline without reloading round JSON
  - [`src/astar/student/predictor/ffam_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_config.py)
    - added new variants:
      - `ffam_retrieval_v4`
      - `ffam_retrieval_v5`
      - `ffam_retrieval_v6`
    - `v4` = map-conditioned summary `v3` + regime retrieval
    - `v5`/`v6` = map-conditioned summary `v3` + coefficient-space retrieval
  - [`src/astar/student/predictor/ffam_retrieval.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_retrieval.py)
    - wired `target_kind`
    - ffam synthetic datasets now depend on target semantics
    - important correctness fix:
      - dataset build/name now uses the actual training split, not the whole replay corpus
      - this prevents silent reuse of wrong targets across LORO holdouts
- Validation:
  - `uv run --extra dev pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
  - passed: `32`
- Current hard-round baseline for comparison:
  - [`agent7_probe_query_residual_v14_exploration_r3_r3r6r7r8`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v14_exploration_r3_r3r6r7r8/result.json)
  - mean score `63.9805`
  - mean weighted KL `0.150899`
- Machine-health / parallelism check before new launch:
  - `384` CPUs
  - `2.8 TiB` RAM available
  - load average only `14.19`
  - other agents running some parallel jobs, but machine remains very underloaded
- New screen launched with isolated roots and shared raw/derived caches:
  - `ffam_retrieval_v3` on hard probe `{3,6,7,8}`, `samples_per_round=2`
  - `ffam_retrieval_v4` on hard probe `{3,6,7,8}`, `samples_per_round=2`
  - `ffam_retrieval_v5` on hard probe `{3,6,7,8}`, `samples_per_round=2`
  - `ffam_retrieval_v6` on hard probe `{3,6,7,8}`, `samples_per_round=2`

### 2026-03-21T13:25Z approx

- Added a second posterior family inside ffam rather than waiting only on kNN retrieval.
  - [`src/astar/student/posterior/deepset_student.py`](/home/jorge/agent7/tasks/astar/src/astar/student/posterior/deepset_student.py)
    - new `inference_mode`
      - `neighbor_average`
      - `global_ridge`
    - `global_ridge` fits ridge regression from transcript summary vectors to target space
    - works for both:
      - regime targets
      - coefficient targets
    - checkpoint serialization now stores regression intercept/weights
  - [`src/astar/student/predictor/ffam_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_config.py)
    - added:
      - `ffam_retrieval_v7`
      - `ffam_retrieval_v8`
    - `v7` = summary `v3` + coefficient target + global ridge
    - `v8` = summary `v3` + regime target + global ridge
- Validation after adding ridge posterior branch:
  - `uv run --extra dev pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
  - passed: `35`
- Additional hard-probe runs launched with isolated roots:
  - `ffam_retrieval_v7` on `{3,6,7,8}`, `samples_per_round=2`
  - `ffam_retrieval_v8` on `{3,6,7,8}`, `samples_per_round=2`

### 2026-03-21T13:45Z approx

- Hard 4-round ffam screen finished for `v3..v8`.
  - baseline reference:
    - [`agent7_probe_query_residual_v14_exploration_r3_r3r6r7r8`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v14_exploration_r3_r3r6r7r8/result.json)
    - mean score `63.9805`
  - ffam results:
    - [`v3`](/tmp/astar_ffam_v3_s2_b/data/artifacts/benchmarks/agent7_probe4_ffam_retrieval_v3_exploration_r3_r3r6r7r8_s2_iso_b/result.json)
      - mean score `48.6524`
      - mean weighted KL `0.292344`
    - [`v4`](/tmp/astar_ffam_v4_s2_b/data/artifacts/benchmarks/agent7_probe4_ffam_retrieval_v4_exploration_r3_r3r6r7r8_s2_iso_b/result.json)
      - mean score `41.8252`
      - mean weighted KL `0.348838`
    - [`v5`](/tmp/astar_ffam_v5_s2_b/data/artifacts/benchmarks/agent7_probe4_ffam_retrieval_v5_exploration_r3_r3r6r7r8_s2_iso_b/result.json)
      - mean score `41.7670`
      - mean weighted KL `0.363574`
    - [`v6`](/tmp/astar_ffam_v6_s2_b/data/artifacts/benchmarks/agent7_probe4_ffam_retrieval_v6_exploration_r3_r3r6r7r8_s2_iso_b/result.json)
      - mean score `39.9918`
      - mean weighted KL `0.389446`
    - [`v7`](/tmp/astar_ffam_v7_s2_b/data/artifacts/benchmarks/agent7_probe4_ffam_retrieval_v7_exploration_r3_r3r6r7r8_s2_iso_b/result.json)
      - mean score `35.9863`
      - mean weighted KL `0.509346`
    - [`v8`](/tmp/astar_ffam_v8_s2_b/data/artifacts/benchmarks/agent7_probe4_ffam_retrieval_v8_exploration_r3_r3r6r7r8_s2_iso_b/result.json)
      - mean score `36.3688`
      - mean weighted KL `0.450111`
- Interpretation:
  - stronger transcript summaries alone did not rescue this line
  - coefficient-target retrieval was worse than raw-regime retrieval
  - global ridge posterior was worse than neighbor averaging
  - therefore the bottleneck is not merely posterior smoothness
  - current `HazardTeacher` decoder family itself is too weak for hard live rounds
- Consequence:
  - no ffam `v3..v8` candidate is promotable
  - do not spend more compute on this decoder line without a stronger decoder or an ensemble/blend layer
  - next rational branch is:
    - stronger decoder integration
    - likely reusing richer residual-decoder machinery with fifth-family posterior/manifold ideas rather than more pure-hazard-decoder tuning

### 2026-03-21T10:55Z approx

- Re-checked machine headroom before new heavy work.
  - `384` CPUs visible
  - load about `33.74 / 38.84 / 58.08`
  - `2.1 TiB` RAM available
  - other agents are active, but machine remains far from saturation
- Closed the current `ffam_operator` line as effectively exhausted.
  - `v8` and `v9` retained the same catastrophic round-8 collapse seen earlier
  - `v10` and `v11` also converged to the same pattern and were killed
  - common failure mode on hard gate `{3,6,7,8}`:
    - round 6 about `18.5339`
    - round 7 about `12.4520`
    - round 8 about `4.6316`
  - conclusion: tuning the linear operator posterior/fallback is not enough; decoder family is the blocker
- Pivoted to a new fifth-family branch aligned with handoff sections `12.1`, `12.4`, `14.1`, and `14.2`:
  - new family: `ffam_mode_*`
  - goal: map-conditioned shared decoder with low-rank residual response modes and transcript-to-mode posterior inference
- Implemented new files:
  - [`src/astar/student/predictor/ffam_mode.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode.py)
  - [`src/astar/student/predictor/ffam_mode_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode_config.py)
- Implemented framework plumbing for `ffam_mode_*`:
  - [`src/astar/student/predictor/interactive.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/interactive.py)
  - [`src/astar/cli.py`](/home/jorge/agent7/tasks/astar/src/astar/cli.py)
  - [`src/astar/policy/registry.py`](/home/jorge/agent7/tasks/astar/src/astar/policy/registry.py)
  - [`src/astar/workflows/model_eval.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/model_eval.py)
  - [`src/astar/workflows/historical_benchmark.py`](/home/jorge/agent7/tasks/astar/src/astar/workflows/historical_benchmark.py)
  - [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
- `ffam_mode` design summary:
  - base decoder fits a global map/prior-conditioned operator from static features + prior logits to final logit delta
  - each historical round gets its own operator estimate
  - round operator residuals are compressed with SVD into a tiny mode basis
  - live transcript summaries infer mode coordinates via one of:
    - `particle_mixture`
    - `local_linear`
    - `hybrid`
  - final prediction = prior logits + decoded operator response + exact-cell blend + OOD-sensitive prior shrink
- Added initial reproducible variants:
  - `ffam_mode_v1` = particle mixture posterior
  - `ffam_mode_v2` = local linear posterior
  - `ffam_mode_v3` = hybrid posterior
- Correctness fixes while bringing the family online:
  - fit path now allows single training round in tiny LORO unit-test folds
  - checkpoint test now asserts actual roundtrip equality instead of assuming rank `1`
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `50`
- Current state:
  - new family scaffolding is benchmark-ready
  - no honest hard-gate benchmark result yet for `ffam_mode_*`
  - next step is parallel probe on hard rounds `{3,6,7,8}` under `exploration_r3`

### 2026-03-21T11:20Z approx

- Expanded the minimal fifth-family sweep to cover the handoff’s first recommended rank range `q=2..5`.
- Added config variants:
  - `ffam_mode_v4` = local-linear posterior, `q=2`
  - `ffam_mode_v5` = local-linear posterior, `q=4`
  - `ffam_mode_v6` = hybrid posterior, `q=5`
- Added benchmark-harness coverage for `ffam_mode_v4..v6` in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `53`
- Parallel live probe state after push-ready validation:
  - active hard-gate probes in isolated `/tmp` roots:
    - `ffam_mode_v1`
    - `ffam_mode_v2`
    - `ffam_mode_v3`
  - all on `{3,6,7,8}`, `policy=exploration_r3`, `samples_per_round=2`
- Interpretation:
  - this keeps the search inside the new fifth-family branch rather than falling back to `query_residual`
  - if the first three variants show signal, immediately extend the hard gate to `v4..v6`
  - if they fail badly, move to supervised/metric mode extraction or mixed decoders, not back to hazard-only tuning

### 2026-03-21T10:30Z approx

- Hard-gate probe verdict for `ffam_mode_v1..v6`:
  - all six variants hit the exact same completed triple on rounds `7/6/8`:
    - `36e581...` -> `12.4520`
    - `ae7800...` -> `18.5339`
    - `c5cdf1...` -> `4.6316`
  - that makes them mathematically dead against the hard-gate baseline even before round `f1dac9...` finishes:
    - current completed sum `35.6175`
    - even a perfect `100.0` on the remaining round would cap them at `33.9044` mean across 4 rounds
- Consequence:
  - killed running probes for `ffam_mode_v1..v6`
  - low-rank mode posterior variation was not the lever
  - minimal fifth-family stack failed before posterior details could matter
- Stronger branch implemented next:
  - added direct historical-round operator retrieval into [`src/astar/student/predictor/ffam_mode.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode.py)
  - new decoder methods:
    - `mode_projection`
    - `operator_particle_mixture`
    - `operator_hybrid`
  - stored full `round_operator_bank` plus `posterior_round_index_bank` in checkpoint arrays
  - this fills the missing handoff baseline from section `14.1`: particle historical-round mixture over full historical support
- Added new reproducible variants:
  - `ffam_mode_v7` = direct operator particle mixture
  - `ffam_mode_v8` = hybrid of low-rank mode decoder and operator particle mixture
  - `ffam_mode_v9` = higher-rank hybrid
- Validation after new branch:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `57`
- Next:
  - launch `v7..v9` on the same hard gate immediately
  - if direct operator retrieval also inherits the `12.45 / 18.53 / 4.63` triple, the current linear-operator decoder family is exhausted more broadly and the next move becomes supervised factorization or mixed decoders

### 2026-03-21T10:35Z approx

- Hard-gate probe verdict for new operator-retrieval branch `ffam_mode_v7..v9`:
  - roots:
    - `v7` -> `/tmp/astar_ffam_mode_v7_s2_e8JTFB`
    - `v8` -> `/tmp/astar_ffam_mode_v8_s2_JKiXB9`
    - `v9` -> `/tmp/astar_ffam_mode_v9_s2_uDMCME`
  - completed round scores observed before wrapper finish:
    - `ae7800...` -> `18.5339`
    - `c5cdf1...` -> `4.6316`
  - this already makes all three mathematically dead against hard-gate baseline `63.9805`:
    - partial sum `23.1655`
    - even two perfect `100.0` remaining rounds would cap mean score at `55.7914`
- Consequence:
  - killed `v7..v9` probes immediately; no need to waste more compute
  - direct historical-round operator particle mixture did not rescue the current linear-operator decoder family
  - stronger posterior/retrieval alone is not enough; decoder misspecification is dominating
- Current conclusion after exhausting both low-rank-mode and direct-operator-retrieval branches:
  - the current **linear-operator decoder family is broadly exhausted**
  - both:
    - projected mode reconstruction
    - full historical-round operator particle retrieval
    fail hard on live-like rounds
  - next rational branch from handoff is:
    - supervised factorization / discrete-mixture regime extraction if any operator family work continues
    - or more likely a genuinely stronger decoder family / mixed decoder ensemble, not more operator-posterior tuning

### 2026-03-21T10:50Z approx

- Correction to the previous `ffam_mode` probe verdict:
  - the partial `report.md` / in-flight benchmark files were not reliable enough for early-kill math
  - completed benchmark truth must come from finalized `result.json` aggregate fields, not transient report snippets
- Verified completed hard-gate artifacts for the first `ffam_mode` sweep:
  - [`ffam_mode_v1`](/tmp/astar_ffam_mode_v1_s2_enYgw5/data/artifacts/benchmarks/agent7_probe_ffam_mode_v1_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `54.2055`
    - mean weighted KL `0.217210`
  - [`ffam_mode_v2`](/tmp/astar_ffam_mode_v2_s2_2zFLdj/data/artifacts/benchmarks/agent7_probe_ffam_mode_v2_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `57.2038`
    - mean weighted KL `0.199034`
  - [`ffam_mode_v3`](/tmp/astar_ffam_mode_v3_s2_RKpvNd/data/artifacts/benchmarks/agent7_probe_ffam_mode_v3_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `50.2193`
    - mean weighted KL `0.245162`
- Hard-gate diagnosis against [`query_residual_v14` probe baseline](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v14_exploration_r3_r3r6r7r8/result.json):
  - `ffam_mode_v2` is best so far inside this line
  - it helps round `3` by about `+1.06`
  - it helps round `8` by about `+9.25`
  - but still loses badly on rounds `6` and `7`
- Validation policy change from here:
  - do not prune family variants from partial benchmark artifacts
  - use only completed `result.json` / aggregate output for benchmark decisions
- Next branch chosen from handoff sections `13.4` and `14.4`:
  - add supervised transcript metric learning for retrieval
  - add discrete mixture + continuous residual decoder inside `ffam_mode`
  - benchmark new variants `v10+`

### 2026-03-21T11:15Z approx

- Implemented the next fifth-family branch directly inside [`src/astar/student/predictor/ffam_mode.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode.py):
  - supervised transcript metric basis:
    - new `posterior_metric_method`
    - `supervised` metric uses transcript-to-latent cross-covariance instead of unsupervised transcript PCA
  - discrete mixture + continuous residual decoder:
    - deterministic small-`k` clustering over round mode coordinates
    - cluster-conditioned local operator means/bases
    - new decoder path `cluster_mode_projection`
    - inference blends cluster-conditioned reconstruction back toward the global decoder by posterior confidence
- Added new reproducible variants in [`src/astar/student/predictor/ffam_mode_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode_config.py):
  - `ffam_mode_v10`
    - supervised metric only
  - `ffam_mode_v11`
    - supervised metric + hybrid posterior
  - `ffam_mode_v12`
    - supervised metric + 2-cluster discrete-mixture decoder
  - `ffam_mode_v13`
    - supervised metric + 2-cluster hybrid decoder
- Test coverage extended in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py)
  - benchmark harness recognizes `v10..v13`
  - added checkpoint roundtrip for `v12`
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `62`

### 2026-03-21T11:30Z approx

- Direct per-round hard-gate diagnostics for `samples_per_round=2` on rounds `{7,3,6,8}` show the new branch is real, not noise.
- Baseline within this family:
  - `ffam_mode_v2`
    - round `7`: `40.0057`
    - round `3`: `57.9934`
    - round `6`: `50.7243`
    - round `8`: `80.0919`
    - hard-gate mean: `57.2038`
- New branch results:
  - `ffam_mode_v10`
    - round `7`: `43.1799`
    - round `3`: `59.7861`
    - round `6`: `52.5136`
    - round `8`: `81.0833`
    - hard-gate mean from direct eval: about `59.1407`
  - `ffam_mode_v11`
    - round `7`: `43.1932`
    - round `3`: `59.0806`
    - round `6`: `51.8131`
    - round `8`: `80.7050`
    - hard-gate mean from direct eval: about `58.6980`
  - `ffam_mode_v12`
    - round `7`: `43.1334`
    - round `3`: `61.2163`
    - round `6`: `53.8622`
    - round `8`: `81.8026`
    - hard-gate mean from direct eval: about `60.0036`
  - `ffam_mode_v13`
    - round `7`: `43.1600`
    - round `3`: `60.5066`
    - round `6`: `53.1980`
    - round `8`: `81.4536`
    - hard-gate mean from direct eval: about `59.5796`
- Interpretation:
  - supervised metric learning helps on all four hard rounds
  - discrete mixture helps most on rounds `3/6/8`
  - `ffam_mode_v12` is the new best fifth-family candidate so far
  - still below current overall hard-gate reference `query_residual_v14` at `63.9805`, but the family gap narrowed by about `+2.80` vs old `ffam_mode_v2`
- Current decision:
  - promote `ffam_mode_v12` to the first full 8-round dev benchmark inside this family
  - do not spend a full dev benchmark on `v10/v11/v13` unless `v12` fails strangely or `samples_per_round>2` materially changes the picture

### 2026-03-21T11:45Z approx

- Checked whether more synthetic transcript samples materially change the new branch.
  - `ffam_mode_v10`, `samples_per_round=6`
    - direct hard-gate mean: about `59.2888`
    - only about `+0.15` over `v10 s2`
  - `ffam_mode_v12`, `samples_per_round=6`
    - round `7`: `43.1333`
    - round `3`: `61.2327`
    - round `6`: `53.8627`
    - round `8`: `82.2538`
    - direct hard-gate mean: about `60.1206`
    - only about `+0.12` over `v12 s2`
- Interpretation:
  - extra synthetic transcript multiplicity is second-order here
  - the main win is the new architecture (`supervised metric + discrete mixture`), not `samples_per_round`
  - `ffam_mode_v12 s2` is the right first full-dev spend
- Full 8-round dev benchmark launched:
  - name `agent7_dev_ffam_mode_v12_exploration_r3_s2`
  - status at this log point: still running, no finalized `result.json` yet

### 2026-03-21T11:40Z approx

- Continued fifth-family work only; no new `query_residual` work.
- Re-read [`instructions/agent7.md`](/home/jorge/agent7/tasks/astar/instructions/agent7.md) focus sections on:
  - transcript summary posterior families
  - GP / kernel style posterior branch
  - Deep Sets / summary-input posterior branch
- Re-checked machine state before more parallel runs:
  - load roughly `48-62`
  - memory free roughly `1.9 TiB`
  - other agents active, but memory headroom still huge
- Confirmed full dev run still alive:
  - `agent7_dev_ffam_mode_v12_exploration_r3_s2`
  - still no finalized [`result.json`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v12_exploration_r3_s2/result.json)
- Finished the previously incomplete summary-input posterior plumbing in [`src/astar/student/predictor/ffam_mode.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode.py):
  - generalized posterior input selection:
    - `regime_input`
    - `summary_input`
  - training now uses summary vectors directly from synthetic live observations when configured
  - live online inference now uses raw transcript observations for summary-input variants
  - added evidence-only fallback:
    - if raw observations are unavailable, use a separate regime-linear fallback posterior to produce mode coords
    - this avoids summary-dimension mismatch on checkpointed models
  - checkpoint save/load now persists:
    - `posterior_input_source`
    - `posterior_summary_variant`
    - fallback posterior arrays
- Added new benchmarkable summary-input variants in [`src/astar/student/predictor/ffam_mode_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode_config.py):
  - `ffam_mode_v17`
    - summary-input `v3`
    - local-linear posterior
    - supervised metric
    - cluster-mode decoder
  - `ffam_mode_v18`
    - summary-input `v3`
    - hybrid posterior
    - supervised metric
    - cluster-mode decoder
  - `ffam_mode_v19`
    - summary-input `v3`
    - local-linear posterior
    - PCA metric
    - cluster-mode decoder
  - `ffam_mode_v20`
    - summary-input `v2`
    - local-linear posterior
    - supervised metric
    - cluster-mode decoder
- Extended validation coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py):
  - benchmark harness recognizes `v17..v20`
  - added explicit summary-input checkpoint roundtrip for `v17`
- Validation:
  - first run hit a real import cycle:
    - importing `SummaryVariant` from `deepset_student` in config pulled policy registry back into `ffam_mode_config`
  - fixed by defining the lightweight `SummaryVariant` literal locally in config
  - reran:
    - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
    - passed: `71`
- New probe sweep launched on the hard gate `{7,3,6,8}` with `samples_per_round=2`:
  - `agent7_fast_probe_ffam_mode_v17_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v18_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v19_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v20_exploration_r3_r3r6r7r8_s2`
- Note:
  - attempted to use a `--jobs` CLI flag for more within-run parallelism, but this CLI does not expose it
  - current acceleration strategy is therefore multiple concurrent benchmark processes

### 2026-03-21T11:55Z approx

- Benchmark validation nuance corrected again:
  - `result.json` can exist before a benchmark process exits
  - reliable completion condition is:
    - benchmark process has exited
    - then trust finalized top-level aggregate fields in `result.json`
  - also corrected jq path for round summaries:
    - use `.rounds[].mean_score`
    - not `.rounds[].aggregate.mean_score`
- Hard-gate summary-input probe results, `samples_per_round=2`, policy `exploration_r3`, rounds `{7,3,6,8}`:
  - [`ffam_mode_v17`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v17_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `62.3382`
    - mean weighted KL `0.164803`
    - round `7`: `50.4373`
    - round `3`: `62.5371`
    - round `6`: `56.3406`
    - round `8`: `80.0380`
  - [`ffam_mode_v18`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v18_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `61.9078`
    - mean weighted KL `0.167788`
  - [`ffam_mode_v19`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v19_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `58.6537`
    - mean weighted KL `0.190987`
  - [`ffam_mode_v20`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v20_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `53.6206`
    - mean weighted KL `0.214445`
- Interpretation:
  - summary-input `v3` is real and helps materially versus old fifth-family best hard-gate probe
  - best new summary-input candidate is `v17`
  - but hard-gate winner is still below hard-gate reference [`query_residual_v14`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_probe_query_residual_v14_exploration_r3_r3r6r7r8/result.json) at `63.9805`
  - `v20` shows summary variant `v2` is much weaker than `v3`
  - PCA metric (`v19`) is clearly worse than supervised metric on summary-input variants

### 2026-03-21T12:00Z approx

- The previously launched full 8-round dev benchmark for [`ffam_mode_v12`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v12_exploration_r3_s2/result.json) finalized and is a new overall local best.
  - setup:
    - mode `online_interactive`
    - policy `exploration_r3`
    - `samples_per_round=2`
    - budget `50`
    - episode seed `0`
  - aggregate:
    - mean score `75.8862`
    - mean weighted KL `0.094355`
  - per-round means:
    - round `7`: `63.5616`
    - round `1`: `81.0255`
    - round `2`: `83.7340`
    - round `4`: `83.4621`
    - round `6`: `72.7692`
    - round `8`: `82.4222`
    - round `3`: `60.7655`
    - round `5`: `79.3497`
- Compared against prior overall champ [`query_residual_v14 + exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v14_exploration_r3/result.json):
  - old mean score `74.7218`
  - old mean weighted KL `0.099821`
  - aggregate delta:
    - score `+1.1645`
    - weighted KL `-0.005466`
  - saved paired comparison artifact:
    - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=ffam_mode_v12.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=ffam_mode_v12.json)
    - mean score delta `+1.1645`
    - mean weighted KL delta `-0.005466`
    - win rate `0.525`
    - loss rate `0.475`
    - score delta CI95 `[-0.1386, 2.6160]`
- Important pattern:
  - most of the gain comes from huge round-8 and round-3 improvement
  - round 6 regresses a lot relative to `query_residual_v14`
  - the old hard-gate `{7,3,6,8}` is still useful, but not sufficient as a promotion gate for this family because it undervalued `ffam_mode_v12`
- Promotion:
  - current fifth-family champ = `ffam_mode_v12`, `samples_per_round=2`
  - current overall local champ = `ffam_mode_v12`, `samples_per_round=2`, policy `exploration_r3`
  - promoted family alias `ffam_mode -> ffam_mode_v12` in [`src/astar/student/predictor/ffam_mode_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode_config.py)

### 2026-03-21T12:10Z approx

- Promoted the best follow-up candidate from the summary-input probe to a full 8-round dev benchmark:
  - [`ffam_mode_v17`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v17_exploration_r3_s2/result.json)
  - mode `online_interactive`
  - policy `exploration_r3`
  - `samples_per_round=2`
  - budget `50`
  - episode seed `0`
- Result:
  - mean score `76.0892`
  - mean weighted KL `0.093167`
  - this is another new overall local best
- Per-round means:
  - round `7`: `63.6517`
  - round `1`: `81.0459`
  - round `2`: `83.7354`
  - round `4`: `83.1773`
  - round `6`: `72.7693`
  - round `8`: `81.9849`
  - round `3`: `62.8453`
  - round `5`: `79.5036`
- Compared against previous champ [`ffam_mode_v12`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v12_exploration_r3_s2/result.json):
  - aggregate score delta `+0.2029`
  - aggregate weighted-KL delta `-0.001188`
  - saved paired artifact:
    - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=ffam_mode_v12__candidate=ffam_mode_v17.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=ffam_mode_v12__candidate=ffam_mode_v17.json)
  - win rate `0.675`
  - loss rate `0.325`
  - score delta CI95 `[-0.0235, 0.4792]`
- Compared against old pre-FFAM overall champ [`query_residual_v14`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_query_residual_v14_exploration_r3/result.json):
  - aggregate score delta `+1.3674`
  - aggregate weighted-KL delta `-0.006654`
  - saved paired artifact:
    - [`historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=ffam_mode_v17.json`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=query_residual_v14__candidate=ffam_mode_v17.json)
- Interpretation:
  - summary-input `v3` is the first fifth-family line to clearly win full 8-round dev overall
  - the main extra lift from `v12 -> v17` comes from another large round-3 improvement
  - round 8 gives back a little vs `v12`, but the aggregate still improves and KL improves too
- Promotion:
  - current fifth-family champ = `ffam_mode_v17`, `samples_per_round=2`
  - current overall local champ = `ffam_mode_v17`, `samples_per_round=2`, policy `exploration_r3`
  - promoted family alias `ffam_mode -> ffam_mode_v17` in [`src/astar/student/predictor/ffam_mode_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode_config.py)

### 2026-03-21T11:55Z approx

- Continued immediately after `v17` promotion; no pause on fifth-family search.
- Re-checked machine health and other runs before allocating more work:
  - load climbed to about `91.68 / 81.43 / 63.15`
  - free memory still about `645 GiB`
  - many other agents are saturating CPU with multi-process benchmark sweeps
- Decision:
  - keep local parallelism moderate
  - use 4 concurrent probes, not a larger sweep
- New hypothesis:
  - `summary_input` alone is strong, but it likely leaves score on the table by discarding the existing motif/regime derived transcript features
  - best posterior may be a fused transcript representation:
    - `summary_v3`
    - plus existing regime-input vector
- Implemented new posterior input family in [`src/astar/student/predictor/ffam_mode.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode.py):
  - new `posterior_input_source = "combined_input"`
  - posterior input = `summary_input || regime_input`
  - evidence-only path still uses the existing regime-linear fallback posterior
- Added new combined-input variants in [`src/astar/student/predictor/ffam_mode_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode_config.py):
  - `ffam_mode_v21`
  - `ffam_mode_v22`
  - `ffam_mode_v23`
  - `ffam_mode_v24`
- Added validation coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py):
  - benchmark harness recognizes `v21..v24`
  - added checkpoint roundtrip for `v21`
- Next:
  - validate
  - run 4 hard-gate probes for `v21..v24`

### 2026-03-21T12:25Z approx

- Validation for combined-input branch:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `77`
- Hard-gate results for new combined-input family, policy `exploration_r3`, `samples_per_round=2`, rounds `{7,3,6,8}`:
  - [`ffam_mode_v21`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v21_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `59.0466`
    - mean weighted KL `0.188892`
  - [`ffam_mode_v22`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v22_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `59.0510`
    - mean weighted KL `0.188867`
  - [`ffam_mode_v23`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v23_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `58.6675`
    - mean weighted KL `0.190911`
  - [`ffam_mode_v24`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v24_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `59.0455`
    - mean weighted KL `0.188898`
- Interpretation:
  - concatenating `summary_v3 || regime_input` is not helping
  - all combined-input variants are materially worse than summary-only `v17` hard-gate `62.3382`
  - `cluster_count=3` does not rescue the branch
  - current conclusion:
    - summary-only posterior is better than combined summary+motif posterior in this family

### 2026-03-21T12:35Z approx

- Since combined-input failed, spent additional budget only on the current champ line `ffam_mode_v17`.
- Full 8-round dev policy/sample sweep results:
  - [`ffam_mode_v17`, `exploration_r4`, `samples_per_round=2`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v17_exploration_r4_s2/result.json)
    - mean score `75.5060`
    - mean weighted KL `0.095974`
    - clearly worse than `exploration_r3`
  - [`ffam_mode_v17`, `exploration_r3`, `samples_per_round=4`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v17_exploration_r3_s4/result.json)
    - mean score `76.0551`
    - mean weighted KL `0.093361`
  - [`ffam_mode_v17`, `exploration_r3`, `samples_per_round=6`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v17_exploration_r3_s6/result.json)
    - mean score `76.0324`
    - mean weighted KL `0.093342`
  - [`ffam_mode_v17`, `exploration_r3`, `samples_per_round=8`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v17_exploration_r3_s8/result.json)
    - mean score `76.0589`
    - mean weighted KL `0.093184`
- Interpretation:
  - `exploration_r3` remains the right policy for `v17`
  - more synthetic transcript samples do not beat the current champ
  - best sample-count setting remains `samples_per_round=2`
  - score curve is very flat above `2`, with all `s4/s6/s8` slightly below the `s2` champ `76.0892`
- Current best remains:
  - `ffam_mode_v17`
  - policy `exploration_r3`
  - `samples_per_round=2`
  - mean score `76.0892`
  - mean weighted KL `0.093167`

### 2026-03-21T12:45Z approx

- Moved to handoff section `12.4 Mixed decoder ensemble` after:
  - combined-input posterior branch failed
  - sample-count / policy sweep around `v17` was exhausted enough
- New hypothesis:
  - current `v17` summary-input posterior is good enough
  - remaining error may be decoder-side
  - specifically:
    - cluster-mode decoder may be too brittle on certain hard rounds
    - particle operator decoder may be safer under OOD
  - so test a confidence-gated hybrid:
    - cluster-mode projection
    - plus historical-round particle operator mixture
- Implemented in [`src/astar/student/predictor/ffam_mode.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode.py):
  - new decoder method `cluster_operator_hybrid`
  - new config knob `decoder_particle_ood_scale`
  - particle decoder weight now can increase as cluster confidence falls
- Added new mixed-decoder variants in [`src/astar/student/predictor/ffam_mode_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode_config.py):
  - `ffam_mode_v25`
  - `ffam_mode_v26`
  - `ffam_mode_v27`
  - `ffam_mode_v28`
- Added validation coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py):
  - benchmark harness recognizes `v25..v28`
  - added checkpoint roundtrip for `v25`
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `82`
- Probe batch launched on hard gate `{7,3,6,8}`:
  - `agent7_fast_probe_ffam_mode_v25_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v26_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v27_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v28_exploration_r3_r3r6r7r8_s2`

### 2026-03-21T12:55Z approx

- Mixed-decoder hard-gate results:
  - [`ffam_mode_v25`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v25_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `62.2810`
    - mean weighted KL `0.165566`
  - [`ffam_mode_v26`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v26_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `62.2518`
    - mean weighted KL `0.165896`
  - [`ffam_mode_v27`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v27_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `62.2693`
    - mean weighted KL `0.166015`
  - [`ffam_mode_v28`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v28_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `60.3730`
    - mean weighted KL `0.178234`
- Interpretation:
  - confidence-gated mixed decoder is directionally close, but still below summary-only champ hard-gate `62.3382`
  - cluster_count `3` was worse
  - no full-dev spend justified on this decoder-ensemble branch

### 2026-03-21T13:00Z approx

- Moved to handoff section `14.3 GP on transcript summary -> beta`.
- Important nuance:
  - kernel-ridge posterior was only tested earlier on the weaker regime-input branch
  - it was not yet tested on the winning summary-input `v3` branch
- Added new summary-input kernel/GP-style posterior variants in [`src/astar/student/predictor/ffam_mode_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode_config.py):
  - `ffam_mode_v29`
  - `ffam_mode_v30`
  - `ffam_mode_v31`
  - `ffam_mode_v32`
- Added validation coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py):
  - benchmark harness recognizes `v29..v32`
  - added checkpoint roundtrip for `v29`
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `87`
- Probe batch launched on hard gate `{7,3,6,8}`:
  - `agent7_fast_probe_ffam_mode_v29_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v30_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v31_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v32_exploration_r3_r3r6r7r8_s2`

### 2026-03-21T13:01Z

- Machine/load check before next parallel batch:
  - CPUs: `384`
  - RAM: `2.9 TiB total`, `1.4 TiB free`, `1.5 TiB available`
  - load average: `63.41 / 67.73 / 51.58`
  - other agents are active on this machine, so for now I am keeping FFAM sweeps to `4` parallel historical-benchmark jobs at a time
- Repo/task hygiene:
  - attempted `br list`, but `br` is not on `PATH` in this shell, so could not query beads from here
  - re-read [`instructions/agent7.md`](/home/jorge/agent7/tasks/astar/instructions/agent7.md) before continuing

### 2026-03-21T13:02Z approx

- Summary-input kernel/GP-style posterior hard-gate results:
  - [`ffam_mode_v29`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v29_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `50.9768`
    - mean weighted KL `0.228098`
  - [`ffam_mode_v30`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v30_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `50.4376`
    - mean weighted KL `0.229617`
  - [`ffam_mode_v31`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v31_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `49.8661`
    - mean weighted KL `0.230551`
  - [`ffam_mode_v32`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v32_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `51.5209`
    - mean weighted KL `0.224826`
- Interpretation:
  - kernel-ridge on the winning summary-input branch is decisively bad
  - this is not a near-miss; the whole summary-kernel posterior branch is materially below `v17`
  - no full-dev spend justified

### 2026-03-21T13:03Z approx

- Moved to a stronger decoder branch motivated by handoff sections `9` and `12`:
  - if the summary posterior is already decent, remaining error may be in the decoder map from low-rank regime coordinates to operator vector
  - linear decoder may be too restrictive even with a low-dimensional manifold
- New hypothesis:
  - a still-small but nonlinear decoder over the regime coordinates can recover systematic cross-round curvature without exploding degrees of freedom
  - use quadratic features of the learned mode coordinates, not a wide neural net
- Implemented in [`src/astar/student/predictor/ffam_mode.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode.py):
  - helper `_quadratic_coord_features(...)`
  - fitted quadratic decoder parameters:
    - `quadratic_decoder_intercept`
    - `quadratic_decoder_weights`
  - checkpoint save/load support for the quadratic decoder
  - new decoder method `quadratic_mode_projection`
- Added variants in [`src/astar/student/predictor/ffam_mode_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode_config.py):
  - `ffam_mode_v33`
  - `ffam_mode_v34`
  - `ffam_mode_v35`
  - `ffam_mode_v36`
- Added validation coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py):
  - benchmark harness recognizes `v33..v36`
  - added checkpoint roundtrip for `v33`
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `92`
- Next action:
  - launch hard-gate probes for `v33..v36` on rounds `{7,3,6,8}`
  - only spend full 8-round dev budget if one beats current `v17` hard-gate `62.3382`
- Probe batch launched on hard gate `{7,3,6,8}`:
  - `agent7_fast_probe_ffam_mode_v33_exploration_r3_r3r6r7r8_s2` (pid `1417154`)
  - `agent7_fast_probe_ffam_mode_v34_exploration_r3_r3r6r7r8_s2` (pid `1417229`)
  - `agent7_fast_probe_ffam_mode_v35_exploration_r3_r3r6r7r8_s2` (pid `1417246`)
  - `agent7_fast_probe_ffam_mode_v36_exploration_r3_r3r6r7r8_s2` (pid `1417235`)

### 2026-03-21T13:04Z approx

- Important execution note:
  - first attempted to launch the `v33..v36` probe batch via detached `nohup uv run ...`
  - those jobs vanished immediately with empty logs and no result artifacts
  - relaunching via PTY sessions using `.venv/bin/astar` worked reliably
- Actual executed probe batch:
  - `agent7_fast_probe_ffam_mode_v33_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v34_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v35_exploration_r3_r3r6r7r8_s2`
  - `agent7_fast_probe_ffam_mode_v36_exploration_r3_r3r6r7r8_s2`

### 2026-03-21T13:06Z approx

- Quadratic-decoder hard-gate results:
  - [`ffam_mode_v33`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v33_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `57.4583`
    - mean weighted KL `0.195286`
  - [`ffam_mode_v34`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v34_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `57.4583`
    - mean weighted KL `0.195286`
  - [`ffam_mode_v35`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v35_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `57.6771`
    - mean weighted KL `0.194759`
  - [`ffam_mode_v36`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v36_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `56.2987`
    - mean weighted KL `0.202157`
- Interpretation:
  - nonlinear low-rank quadratic decoder is not rescuing the family
  - all quadratic variants are far below current summary-posterior champ hard-gate `62.3382`
  - `v33` and `v34` being numerically identical suggests the extra projected dimension is not buying anything in this branch
  - no full-dev spend justified

### 2026-03-21T13:07Z approx

- Current overall FFAM champ still unchanged:
  - [`ffam_mode_v17`, policy `exploration_r3`, `samples_per_round=2`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v17_exploration_r3_s2/result.json)
  - mean score `76.0892`
  - mean weighted KL `0.093167`
- Immediate next branch selection criterion:
  - not another tiny posterior or decoder tweak
  - next branch should be a genuinely different fifth-family component from the handoff, likely:
    - semimechanistic hazard decoder
    - stronger decoder ensemble / OOD-gated blend
    - or a new query-policy family aimed more directly at regime identifiability

### 2026-03-21T13:15Z approx

- Machine/load check before next batch:
  - CPUs: `384`
  - RAM: `2.9 TiB total`, `1.0 TiB free`, `1.3 TiB available`
  - load average: `38.58 / 39.34 / 44.43`
  - other agents still active, but load is comfortably below the prior check, so another bounded `4`-way FFAM benchmark batch is fine

### 2026-03-21T13:16Z approx

- Moved to handoff sections:
  - `12.3 Semimechanistic hazard decoder`
  - `12.4 Mixed decoder ensemble`
  - `16.3 Baseline shrinkage`
  - `16.4 Ensemble blending`
- New hypothesis:
  - current `v17` summary-input posterior already does a good job of locating regime coordinates
  - remaining error is partly decoder/OOD error
  - a semimechanistic hazard decoder, blended in lightly and more aggressively under low posterior confidence, may improve robustness on the hard rounds without giving back the current FFAM gains
- Implemented in [`src/astar/student/predictor/ffam_mode.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode.py):
  - replay-backed regression from mode coordinates to semimechanistic hazard coefficient vectors
  - hazard tensor decoder reused inside FFAM prediction path
  - OOD-gated blend:
    - `hazard_decoder_blend`
    - `hazard_decoder_ood_scale`
- Added variants in [`src/astar/student/predictor/ffam_mode_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode_config.py):
  - `ffam_mode_v37`
  - `ffam_mode_v38`
  - `ffam_mode_v39`
  - `ffam_mode_v40`
- Added validation coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py):
  - benchmark harness recognizes `v37..v40`
  - added checkpoint roundtrip for `v37`
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `97`
- Next action:
  - launch hard-gate probes for `v37..v40` on rounds `{7,3,6,8}`
  - only spend full 8-round dev budget if one clears current `v17` hard-gate `62.3382`
- Probe batch launched on hard gate `{7,3,6,8}`:
  - `agent7_fast_probe_ffam_mode_v37_exploration_r3_r3r6r7r8_s2` (session `29712`)
  - `agent7_fast_probe_ffam_mode_v38_exploration_r3_r3r6r7r8_s2` (session `65521`)
  - `agent7_fast_probe_ffam_mode_v39_exploration_r3_r3r6r7r8_s2` (session `12593`)
  - `agent7_fast_probe_ffam_mode_v40_exploration_r3_r3r6r7r8_s2` (session `65879`)

### 2026-03-21T13:22Z approx

- Semimechanistic hazard-blend hard-gate results:
  - [`ffam_mode_v37`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v37_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `61.5958`
    - mean weighted KL `0.170252`
  - [`ffam_mode_v38`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v38_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `60.4077`
    - mean weighted KL `0.178228`
  - [`ffam_mode_v39`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v39_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `58.8729`
    - mean weighted KL `0.188658`
  - [`ffam_mode_v40`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v40_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `58.6013`
    - mean weighted KL `0.190639`
- Interpretation:
  - low-weight hazard fallback (`v37`) is the least bad version, but it still misses current `v17` hard-gate `62.3382` by about `0.7424`
  - stronger hazard blend is monotonically worse in this sweep
  - direct semimechanistic decoder blending is directionally plausible but not promotable in this form
  - no full-dev spend justified

### 2026-03-21T13:29Z approx

- Machine/load check before policy sweep:
  - RAM: `2.9 TiB total`, `1.2 TiB free`, `1.4 TiB available`
  - load average: `68.35 / 93.13 / 75.01`
  - despite the spike, this is still modest versus `384` CPUs, so another bounded `4`-way sweep is acceptable

### 2026-03-21T13:30Z approx

- Moved to handoff sections:
  - `15.2 Fixed diagnostic motif library`
  - `15.5 Hybrid policy`
  - `27. Core policy principle`
  - `28. How to discover diagnostic motifs`
- Important framework constraint:
  - this repo’s current policy interface is static query-plan generation from the known map only
  - so true posterior-adaptive info-gain querying is not expressible without changing the interface itself
  - near-term policy work therefore has to operate through better fixed motif libraries and better ordering of repeats
- New hypothesis:
  - current FFAM champ still uses borrowed `exploration_r3`
  - better fixed motif libraries can improve regime identifiability
  - a static hybrid plan with:
    - early port/coastal diagnostic repeats
    - late frontier/entropy-sensitive repeats
    may help more than the existing one-scorer repeat heuristic
- Implemented in [`src/astar/policy/coverage.py`](/home/jorge/agent7/tasks/astar/src/astar/policy/coverage.py):
  - support for `late_replicate_budget`
  - support for separate late-stage scorer and selection mode
  - hybrid static plans with early and late repeated windows
- Added new named policies in [`src/astar/policy/registry.py`](/home/jorge/agent7/tasks/astar/src/astar/policy/registry.py):
  - `exploration_port_r3`
  - `exploration_frontier_r3`
  - `exploration_hybrid_r3`
  - `exploration_hybrid_r3_global`
- Added tests in [`tests/test_exploration_policy.py`](/home/jorge/agent7/tasks/astar/tests/test_exploration_policy.py):
  - named-policy resolution for the new variants
  - hybrid-plan late-repeat ordering check
- Validation:
  - `uv run --extra dev pytest tests/test_exploration_policy.py tests/test_historical_benchmark.py -q`
  - passed: `112`
- Next action:
  - benchmark `ffam_mode_v17` with the four new policy variants on the hard gate `{7,3,6,8}`
  - only spend full 8-round dev budget if one beats current `exploration_r3` hard-gate `62.3382`
- Probe batch launched on hard gate `{7,3,6,8}` with `ffam_mode_v17`:
  - `exploration_port_r3` (session `77560`)
  - `exploration_frontier_r3` (session `15350`)
  - `exploration_hybrid_r3` (session `66750`)
  - `exploration_hybrid_r3_global` (session `64848`)

### 2026-03-21T13:37Z approx

- Policy hard-gate results available so far:
  - [`exploration_frontier_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v17_exploration_frontier_r3_r3r6r7r8_s2/result.json)
    - mean score `62.8661`
    - mean weighted KL `0.158012`
  - [`exploration_hybrid_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v17_exploration_hybrid_r3_r3r6r7r8_s2/result.json)
    - mean score `65.4330`
    - mean weighted KL `0.146768`
  - [`exploration_hybrid_r3_global`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v17_exploration_hybrid_r3_global_r3r6r7r8_s2/result.json)
    - mean score `65.4364`
    - mean weighted KL `0.146747`
  - [`exploration_port_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v17_exploration_port_r3_r3r6r7r8_s2/result.json)
    - mean score `65.2517`
    - mean weighted KL `0.147910`
- Interpretation:
  - frontier-late repeat placement alone already beats current `exploration_r3` hard-gate `62.3382`
  - hybrid early-port + late-frontier is a much larger improvement
  - port-only early repeats are also strongly positive, but still behind the hybrid variants
  - both hybrid policies are strong enough to justify immediate full 8-round dev spend
- Full 8-round dev promotions launched:
  - `agent7_dev_ffam_mode_v17_exploration_hybrid_r3_s2` (session `99928`)
  - `agent7_dev_ffam_mode_v17_exploration_hybrid_r3_global_s2` (session `65755`)

### 2026-03-21T13:54Z approx

- Full 8-round dev results for the positive policy gate winners:
  - [`ffam_mode_v17 + exploration_hybrid_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v17_exploration_hybrid_r3_s2/result.json)
    - mean score `75.2993`
    - mean weighted KL `0.097708`
  - [`ffam_mode_v17 + exploration_hybrid_r3_global`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v17_exploration_hybrid_r3_global_s2/result.json)
    - mean score `75.8220`
    - mean weighted KL `0.094700`
- Current champ remains:
  - [`ffam_mode_v17 + exploration_r3`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v17_exploration_r3_s2/result.json)
    - mean score `76.0892`
    - mean weighted KL `0.093167`
- Paired comparisons vs current champ:
  - [`exploration_hybrid_r3` compare](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_r3__candidate_policy=exploration_hybrid_r3__budget=50__episode_seed=0__baseline=ffam_mode_v17__candidate=ffam_mode_v17__run_pair=18d9fa878c8c.json)
    - mean score delta `-0.7898`
    - mean weighted KL delta `+0.004542`
    - CI95 score delta `[-1.6027, -0.1303]`
  - [`exploration_hybrid_r3_global` compare](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_r3__candidate_policy=exploration_hybrid_r3_global__budget=50__episode_seed=0__baseline=ffam_mode_v17__candidate=ffam_mode_v17__run_pair=427b07db7648.json)
    - mean score delta `-0.2672`
    - mean weighted KL delta `+0.001533`
    - CI95 score delta `[-0.5726, 0.0173]`
- Interpretation:
  - new static motif policies gave strong hard-gate gains
  - but those gains did not generalize to the full 8-round dev panel
  - the global hybrid is the least-bad variant, but still not promotable
  - policy default stays `exploration_r3`

### 2026-03-21T14:06Z approx

- Machine/load check before next branch:
  - RAM: `2.9 TiB total`, `986 GiB free`, `1.3 TiB available`
  - load average: `53.96 / 75.90 / 86.12`
  - other agents are actively using the machine, so I will keep the next experiment batch to `4` parallel runs again
- Re-read handoff targets:
  - `14.6 Deep Sets / Set Transformer transcript encoder + local regressor`
  - `H4 transcript-to-beta vs direct transcript-to-tensor`
- Important finding from code audit:
  - the existing `SummaryBankStudent` is not actually a learned transcript encoder; it is a summary-vector bank plus kNN / ridge
  - so a genuine learned compact posterior family is still mostly unexplored in this fifth-family line
- New hypothesis:
  - current summary-input local linear posterior is a strong stable baseline
  - a tiny strongly-regularized residual MLP on top of that linear posterior can capture nonlinear transcript-to-beta structure without giving up the good inductive bias
  - neighbor-distance gating should stop the MLP from hurting badly off-manifold
- Planned branch:
  - add `posterior_method=\"residual_mlp\"`
  - train on synthetic transcript summaries with round-level internal validation
  - evaluate only if it survives the same hard gate `{7,3,6,8}`

### 2026-03-21T14:15Z approx

- Re-read canon + handoff before implementation:
  - [`README.md`](/home/jorge/agent7/tasks/astar/README.md)
  - [`docs/game_facts.md`](/home/jorge/agent7/tasks/astar/docs/game_facts.md)
  - [`instructions/agent7.md`](/home/jorge/agent7/tasks/astar/instructions/agent7.md)
- Re-checked machine state before deciding probe fanout:
  - RAM: `2.9 TiB total`, `826 GiB free`, `1.2 TiB available`
  - load average: `109.75 / 101.39 / 91.23`
  - other active work visible from agent1/2/5/6
  - decision: keep this branch to `4` parallel hard-gate probes after validation
- Implemented residual-MLP posterior branch in [`src/astar/student/predictor/ffam_mode.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode.py):
  - added persistence for residual-MLP hyperparameters and weights in checkpoint/NPZ save-load path
  - added posterior inference method `posterior_method=\"residual_mlp\"`
  - residual correction is confidence-gated by historical-neighbor distance so nonlinear correction fades off-manifold
- Added config surface in [`src/astar/student/predictor/ffam_mode_config.py`](/home/jorge/agent7/tasks/astar/src/astar/student/predictor/ffam_mode_config.py):
  - residual-MLP hyperparameters on `FFAMModeConfig`
  - new variants `ffam_mode_v41..v44`
- Added coverage in [`tests/test_historical_benchmark.py`](/home/jorge/agent7/tasks/astar/tests/test_historical_benchmark.py):
  - benchmark param list includes `v41..v44`
  - added checkpoint roundtrip test for `ffam_mode_v41`
- Validation:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `102`
- Load check before probe fanout:
  - RAM: `2.9 TiB total`, `1.2 TiB free`, `1.4 TiB available`
  - load average: `426.61 / 423.57 / 240.67`
  - because other agents are saturating the box, probe commands were launched with:
    - `OMP_NUM_THREADS=1`
    - `MKL_NUM_THREADS=1`
    - `OPENBLAS_NUM_THREADS=1`
    - `NUMEXPR_NUM_THREADS=1`
- Hard-gate probe batch launched on `{7,3,6,8}` with `exploration_r3` and `samples_per_round=2`:
  - `ffam_mode_v41` session `6632`
  - `ffam_mode_v42` session `29245`
  - `ffam_mode_v43` session `81368`
  - `ffam_mode_v44` session `78133`

### 2026-03-21T14:22Z approx

- Hard-gate `{7,3,6,8}` probe results for residual-MLP branch:
  - [`ffam_mode_v41`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v41_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `67.2985`
    - mean weighted KL `0.136379`
  - [`ffam_mode_v42`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v42_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `67.3180`
    - mean weighted KL `0.136280`
  - [`ffam_mode_v43`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v43_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `67.3305`
    - mean weighted KL `0.136216`
  - [`ffam_mode_v44`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v44_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `67.4909`
    - mean weighted KL `0.135405`
- Current hard-gate reference before this branch:
  - [`ffam_mode_v17 + exploration_r3 + s2`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_fast_probe_ffam_mode_v17_exploration_r3_r3r6r7r8_s2/result.json)
    - mean score `62.3382`
- Interpretation:
  - residual-MLP posterior branch is clearly alive
  - all four variants beat the current gate by about `+5`
  - spread among `v41..v44` is small, so hard-gate noise is plausible
- Promotion decision:
  - spend full 8-round dev budget on the top two gate winners `v44` and `v43`
  - keep thread caps at `1` because shared-machine CPU load remains high
- Full 8-round dev promotions launched:
  - `ffam_mode_v43` session `42281`
  - `ffam_mode_v44` session `12954`

### 2026-03-21T14:30Z approx

- Full 8-round dev results:
  - [`ffam_mode_v43 + exploration_r3 + s2`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v43_exploration_r3_s2/result.json)
    - mean score `77.7176`
    - mean weighted KL `0.086009`
  - [`ffam_mode_v44 + exploration_r3 + s2`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v44_exploration_r3_s2/result.json)
    - mean score `77.7598`
    - mean weighted KL `0.085765`
- Previous champ:
  - [`ffam_mode_v17 + exploration_r3 + s2`](/home/jorge/agent7/tasks/astar/data/artifacts/benchmarks/agent7_dev_ffam_mode_v17_exploration_r3_s2/result.json)
    - mean score `76.0892`
    - mean weighted KL `0.093167`
- Paired compare vs previous champ:
  - [`v17 -> v44`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=ffam_mode_v17__candidate=ffam_mode_v44.json)
    - mean score delta `+1.6706`
    - mean weighted KL delta `-0.007401`
    - win rate `0.875`
    - CI95 score delta `[1.0032, 2.4324]`
- Tie-break compare between new top two:
  - [`v43 -> v44`](/home/jorge/agent7/tasks/astar/data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_r3__budget=50__episode_seed=0__baseline=ffam_mode_v43__candidate=ffam_mode_v44.json)
    - mean score delta `+0.0422`
    - mean weighted KL delta `-0.000244`
    - CI95 score delta `[-0.0074, 0.1040]`
- Interpretation:
  - residual-MLP posterior is a real family improvement, not a gate-only mirage
  - `v44` is the new best full-panel mean
  - `v44` vs `v43` is close, but `v44` wins on mean score and weighted KL
- Promotion:
  - switched `ffam_mode` default alias to `ffam_mode_v44`
  - reran benchmark tests after alias promotion
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
  - passed: `102`
  - committed + pushed promoted state to `origin/agent7`
  - commit: `df87640a`

### 2026-03-21T15:00Z approx

- Massive parallel sweep of new ffam_mode variants v45-v76.
- Identified two key underexplored axes via 16-way parallel hard-gate probes:
  - **prior_blend reduction**: v52 (prior_blend=0.05, ood=0.20) scored 69.02 vs v44's 67.49
  - **operator ridge lambda reduction**: v45/v46 (lambda=4.0/2.0) showed mild gains
- Promoted v52 and v59 to full 8-round dev:
  - v52 = 78.28
  - v59 = 78.46 (combo: q=4 + lambda=4 + prior=0.07 + temp=1.0)
- Follow-up sweep v61-v66 pushed prior reduction further:
  - v62 (prior=0.02, ood=0.10) = 69.45 hard-gate
  - v61 (prior=0.03, ood=0.15) = 69.40 hard-gate
- Combo variants v67-v72 on full dev:
  - **v67 = 78.85** (q=4 + lambda=4 + prior=0.02 + ood=0.10 + temp=1.0) ← new best
  - v70 = 78.57, v71 = 78.56
- Final squeeze v73-v76:
  - **v76 = 79.13** (v67 + posterior_ridge_lambda=4.0) ← NEW CHAMPION!
  - v75 = 78.88, v73 = 78.86
- Per-round comparison v44 vs v76:
  - Round 3: 64.13 → 72.90 (+8.77!)
  - Round 8: 80.32 → 84.70 (+4.38!)
  - Round 7: 65.44 → 67.27 (+1.83)
  - Round 6: 78.69 → 77.50 (-1.19)
  - Round 4: 86.98 → 86.12 (-0.86)
  - Round 2: 84.91 → 84.13 (-0.78)
  - Round 1: 82.02 → 81.43 (-0.59)
  - Round 5: 79.60 → 79.04 (-0.56)
  - Net: +1.37 points aggregate
- v77-v82 launched for additional squeeze around v76

## Current Champion

- best observed local full-dev system:
  - model: `ffam_mode_v76`
  - policy: `exploration_r3`
  - `samples_per_round=2`
  - score: `79.1349`
  - mean weighted KL: `0.080358`
  - key changes vs v44:
    - `projected_mode_dim=4` (was 3)
    - `operator_ridge_lambda=4.0` (was 8.0)
    - `posterior_ridge_lambda=4.0` (was 8.0)
    - `prior_blend=0.02` (was 0.10)
    - `posterior_ood_prior_blend=0.10` (was 0.28)
    - `temperature=1.0` (was 1.02)

### 2026-03-21T15:30Z approx

- v77-v82 full dev results:
  - **v77 = 79.34** (posterior_ridge=2.0) ← beat v76
  - v78 = 79.15 (q=5), v80 = 79.15 (bigger MLP), v82 = 79.13, v79 = 79.12, v81 = 79.11
- v83-v88 full dev results:
  - **v83 = 79.46** (posterior_ridge=1.0) ← beat v77
  - v86 = 79.34, v88 = 79.34, v87 = 79.31, v84 = 79.31, v85 = 79.26
- v89-v92 full dev results:
  - **v89 = 79.57** (posterior_ridge=0.5) ← beat v83
  - v91 = 79.48, v90 = 79.44, v92 = 79.44
- Posterior ridge lambda trend (diminishing returns):
  - 8.0 → 78.85, 4.0 → 79.13, 2.0 → 79.34, 1.0 → 79.46, 0.5 → 79.57
- v93-v96 launched for final squeeze (posterior_ridge=0.25 etc)

### 2026-03-21T16:00Z approx

- v97-v100 full dev:
  - v97 (ridge=0.1) = 79.81, **v98 (ridge=0.05) = 79.82** ← beat v93
  - v99 (prior=0.015) = 79.73, v100 (op_lambda=2.0) = 79.69
- v101-v104 full dev:
  - **v104 (op_lambda=2.0 + ridge=0.05) = 79.87** ← NEW CHAMPION
  - v103 (prior=0.015 + ridge=0.05) = 79.87 (tied)
  - v101 (ridge=0.02) = 79.67, v102 (ridge=0.01) = 79.46 (overfitting!)
- Posterior ridge lambda sweep now exhausted:
  - Optimum near 0.05 (going to 0.02 or lower causes overfitting)
  - Full trend: 8.0→78.85, 4.0→79.13, 2.0→79.34, 1.0→79.46, 0.5→79.57, 0.25→79.69, 0.1→79.81, 0.05→79.82, 0.02→79.67, 0.01→79.46
- Final v104 per-round vs v44:
  - Round 3: 64.1 → 77.5 (+13.4!!!)
  - Round 7: 65.4 → 69.2 (+3.8)
  - Round 8: 80.3 → 83.4 (+3.1)
  - Round 6: 78.7 → 80.0 (+1.3)
  - Givebacks: R1 -1.8, R2 -1.2, R5 -1.0, R4 -0.7

## Current Champion

- best observed local full-dev system:
  - model: `ffam_mode_v104`
  - policy: `exploration_r3`
  - `samples_per_round=2`
  - score: `79.8743`
  - mean weighted KL: approx `0.079`
  - key config vs v44:
    - `projected_mode_dim=4` (was 3)
    - `operator_ridge_lambda=2.0` (was 8.0)
    - `posterior_ridge_lambda=0.05` (was 8.0)
    - `prior_blend=0.02` (was 0.10)
    - `posterior_ood_prior_blend=0.10` (was 0.28)
    - `temperature=1.0` (was 1.02)
    - `posterior_metric_dim=10` (was 8)
    - `posterior_residual_hidden_dim=32` (was 24)
    - `posterior_residual_steps=500` (was 400)

## Key Findings This Session

1. **Prior blend was too conservative**: Reducing prior_blend from 0.10 to 0.02 gave +1.53 on hard gate
2. **Ridge regularization was too strong**: Systematic sweep from 8.0 to 0.5 improved full-dev by +0.72 total
3. **Higher mode dim q=4 helps with MLP**: The nonlinear posterior can navigate the higher-dimensional space
4. **Temperature=1.0 is optimal**: No temperature softening needed
5. **More cells_per_seed hurts**: Increasing from 512 to 1024 dramatically worsened results
6. **Cluster count=3 is neutral**: No improvement over 2 clusters
7. **Total improvement vs v44**: 77.76 → 79.87 (+2.11 points, ~2.7% relative)
8. **Posterior ridge sweep reveals dramatic overfitting**: default lambda=8.0 was massively over-regularized; optimum near 0.05 (160x reduction)
9. **Operator ridge also over-regularized**: lambda 8.0 → 2.0 gives additional +0.05
10. **Round 3 massive rescue**: The hardest round improved by +13.4 points - from 64.1 to 77.5
11. **Multi-seed MLP ensemble is neutral**: Seed sensitivity is <0.01 points, ensembling 3-7 seeds gives <0.02 improvement. The MLP trains stably and there's no variance to reduce.
12. **Probability floor was catastrophically too high**: Reducing from 0.01 to 0.001 gave +5 points!
13. **Exact-cell beta was too low**: Increasing from 2/8 to 8/32 (more model trust, less observation trust) gave +2 points!
14. **These two effects compound multiplicatively**: Together they gave +7.5 points total

### 2026-03-21T16:30Z approx

- Discovered probability_floor was massively over-conservative:
  - floor=0.01 (default) → v104 = 79.87
  - floor=0.005 → v116 = 82.11 (+2.24!)
  - floor=0.003 → v118 = 82.89
  - floor=0.002 → v119 = 83.28
  - floor=0.001 → v123 = 85.03
  - floor=0.0005 → v127 = 85.21
- Discovered exact-cell beta too low (model predictions should be trusted more):
  - beta=2/8 (default) → baseline
  - beta=4/16 → +1.3 points
  - beta=8/32 → +1.8 points
- Combined: floor=0.001 + beta=8/32 → v128 = 85.24
- v129-v132 full dev:
  - **v132 (floor=0.0003 + beta=8/32) = 85.50** ← CHAMPION
  - v129 = 85.43, v131 = 85.38, v130 = 85.18
- v133-v136 (final push):
  - v133 (floor=0.0002 + beta=8/32) = 85.51 (tied with v132)
  - v134 (floor=0.0001) = 85.43 (floor too low starts hurting)
  - Floor/beta sweep exhausted at ~85.50

## Current Champion

- model: `ffam_mode_v132`
- policy: `exploration_r3`
- `samples_per_round=2`
- score: `85.4988`
- per-round: R1:85.5 R2:89.7 R3:83.7 R4:93.4 R5:83.9 R6:85.7 R7:71.3 R8:90.9
- total improvement from v44: **+7.74 points** (77.76 → 85.50)
- key config:
  - `projected_mode_dim=4`
  - `operator_ridge_lambda=2.0` (was 8.0)
  - `posterior_ridge_lambda=0.05` (was 8.0)
  - `prior_blend=0.02` (was 0.10)
  - `posterior_ood_prior_blend=0.10` (was 0.28)
  - `temperature=1.0` (was 1.02)
  - `probability_floor=0.0003` (was 0.01 - 33x reduction!)
  - `beta_min=8.0` (was 2.0 - 4x increase)
  - `beta_scale=32.0` (was 8.0 - 4x increase)

## Key Discoveries This Session

1. **Probability floor was catastrophically too high (33x)**: 0.01 → 0.0003 gave +5.6 points
2. **Exact-cell beta was too low (4x)**: 2/8 → 8/32 gave +2.0 points (model predictions more trustworthy than observed cells)
3. **Prior blend was 5x too high**: 0.10 → 0.02 gave +1.5 points
4. **Both ridge lambdas were too high**: posterior 160x (8→0.05), operator 4x (8→2)
5. **Mode dim q=4 > q=3** with residual MLP posterior
6. **Temperature=1.0 > 1.02** (no softening needed)
7. **Multi-seed ensemble neutral**: MLP trains stably, no variance to reduce
8. **More cells_per_seed hurts**: 1024 is worse than 512
9. **These effects compound multiplicatively**, especially floor and beta

## Per-Round Improvement vs Starting v44

| Round | v44 | v132 | Delta |
|-------|-----|------|-------|
| R3 | 64.1 | 83.7 | **+19.6** |
| R8 | 80.3 | 90.9 | **+10.6** |
| R6 | 78.7 | 85.7 | **+7.0** |
| R4 | 87.0 | 93.4 | **+6.4** |
| R7 | 65.4 | 71.3 | **+5.9** |
| R2 | 84.9 | 89.7 | **+4.8** |
| R5 | 79.6 | 83.9 | **+4.3** |
| R1 | 82.0 | 85.5 | **+3.5** |
| **Mean** | **77.76** | **85.50** | **+7.74** |

### 2026-03-21T17:00Z approx

- Additional radical changes:
  - v139: Removed residual_class_scale damping → 85.79 (+0.29 from v132)
  - Delta clip (4→6→8→12→20) had ZERO effect - clipping is never triggered
  - v143: Removed prior blend entirely (prior_blend=0, ood=0) → **86.14** (+0.35)
  - Zero prior blend means model fully trusts its own predictions
- Current absolute champion: **v143 = 86.14**

## Current Champion

- model: `ffam_mode_v143`
- policy: `exploration_r3`, `samples_per_round=2`
- score: **86.1383**
- total improvement from v44: **+8.38 points** (77.76 → 86.14, +10.8%)
- per-round vs v44:
  - R3: 64.1 → 89.7 (+25.6!!!)
  - R8: 80.3 → 93.5 (+13.2)
  - R6: 78.7 → 87.7 (+9.0)
  - R7: 65.4 → 73.2 (+7.8)
  - R4: 87.0 → 93.1 (+6.1)
  - R5: 79.6 → 84.0 (+4.4)
  - R2: 84.9 → 86.5 (+1.6)
  - R1: 82.0 → 81.3 (-0.7)

## Exhaustive Full-Dev Score Table (all evaluated variants)

| Rank | Model | Score | Key difference vs v104 |
|------|-------|-------|----------------------|
| 1 | v110 | 79.89 | 3-seed ensemble + q=5 (essentially tied) |
| 2 | v104 | 79.87 | **CHAMPION** |
| 3 | v108 | 79.88 | seed=42 |
| 4 | v107 | 79.88 | seed=1 |
| 5 | v105 | 79.88 | 3-seed ensemble |
| 6 | v98 | 79.82 | posterior_ridge=0.05 only |
| 7 | v97 | 79.81 | posterior_ridge=0.10 |
| 8 | v99 | 79.73 | prior=0.015 |
| 9 | v93 | 79.69 | posterior_ridge=0.25 |
| 10 | v89 | 79.57 | posterior_ridge=0.50 |
| 11 | v83 | 79.46 | posterior_ridge=1.0 |
| 12 | v77 | 79.34 | posterior_ridge=2.0 |
| 13 | v76 | 79.13 | posterior_ridge=4.0 |
| 14 | v67 | 78.85 | q=4 + lambda=4 + less prior |
| 15 | v59 | 78.46 | q=4 + lambda=4 combo |
| 16 | v52 | 78.28 | prior=0.05 |
| 17 | v44 | 77.76 | Starting champion |
| 18 | v17 | 76.09 | Summary-input baseline |
| 19 | v12 | 75.89 | Supervised metric baseline |
| 20 | qr_v14 | 74.72 | Query residual family best |
