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
