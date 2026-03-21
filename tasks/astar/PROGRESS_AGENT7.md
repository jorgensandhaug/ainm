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
