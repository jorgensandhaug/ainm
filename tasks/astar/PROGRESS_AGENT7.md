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
