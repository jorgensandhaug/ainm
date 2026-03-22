# PROGRESS_AGENT5

## Objective

- Max local test-data score.
- Keep validation strict or improve it without degrading live relevance.
- Track all meaningful work here.
- Commit + push meaningful improvements to branch `agent5`.

## Repo Canon Read

- Read `README.md`.
- Read `docs/game_facts.md`.
- Read full `instructions/agent5.md`.

## Early Environment Facts

- CWD: `/home/jorge/agent5/tasks/astar`
- Branch: `agent5`
- Remote: `origin https://github.com/jorgensandhaug/ainm.git`
- Worktree initially appeared clean from `git status --short`.
- `br` command missing in current shell env (`/bin/bash: br: command not found`); need verify alternate invocation if task tracking required.
- AGENTS doc points at `/home/jorge/repos/ainm/tasks/astar/...` for canon docs, but actual usable canon files exist in current repo at `README.md` and `docs/game_facts.md`.

## Framework Map

- CLI entry: `src/astar/cli.py`
- Historical benchmark: `src/astar/workflows/historical_benchmark.py`
- Predictor registry: `src/astar/student/predictor/interactive.py`
- Artifact layout: `src/astar/infra/artifacts/paths.py`
- Current interactive predictors:
  - `geometry_prior`
  - `historical_bucket_prior`
  - `latent_regime`
  - `query_residual`
- Historical benchmark modes:
  - `prior_only`
  - `online_interactive`

## Existing Local Artifacts Noted

- 8-round historical benchmark outputs already present in `data/artifacts/benchmarks/`
- Existing model checkpoints:
  - `data/artifacts/models/historical_bucket_prior_v1/checkpoint.json`
  - `data/artifacts/models/hazard_teacher_v1/checkpoint.json`
  - `data/artifacts/models/summary_bank_student_v1/...`
- Replay manifold artifacts exist:
  - `data/artifacts/replays/manifold/round_regime_manifold_v1.{json,npz}`
- Synthetic/teacher datasets already materialized under `data/artifacts/datasets/`

## Existing Baseline Findings

- Best visible existing benchmark report inspected:
  - `data/artifacts/benchmarks/dev_query_residual_online50_v7/report.md`
- Reported metric:
  - mean score `73.9505`
  - mean weighted KL `0.106326`
  - rounds `8`
  - seeds `40`
- Weakest inspected round in that report:
  - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - round mean score `46.4143`
- v7 vs v5 comparison already present:
  - mean score delta `+0.2525`
  - mean weighted KL delta `-0.001154`
  - gain uneven by round

## Immediate Hypotheses

- Current best path is likely `query_residual`, not exposed teacher/student stack alone.
- Need identify what makes `f1dac...` hard.
- Need fresh reproducible baseline run in current workspace before edits.
- Validation may be improvable through stronger split protocol / targeted diagnostics, but must remain held-out-round faithful.

## Work Log

### 2026-03-21T11:05:00Z

- Re-read current workspace state before more model work:
  - full `instructions/agent5.md`
  - `README.md`
  - `docs/game_facts.md`
  - current grey-box predictor stack in `src/astar/student/predictor/`
- Re-checked machine health / competing load:
  - load about `31.5 / 37.9 / 46.4` on `384` cores
  - RAM about `2.0 TiB free`, `2.1 TiB available`
  - other large jobs still active from `agent1` and `agent2`
  - conclusion:
    - plenty of room for more heavy experiments
    - still avoid wasting cycles on already-rejected repeat-policy branches
- Current branch triage after code review:
  - already implemented:
    - global low-rank hazard teacher
    - direct regime ridge / knn
    - coefficient knn
    - crude prototype mixture
    - gated hybrid
    - direct joint tensor head
  - handoff-aligned gap still missing in current code:
    - stronger teacher parameterization than one monolithic coefficient manifold
    - especially phase/head-factored teacher branch (`H7` / `H8` flavor)
- New implementation decision:
  - build a **phase/head-factored hazard predictor**
  - idea:
    - split semimechanistic round-law coefficients into separate `build`, `port`, `ruin` heads
    - factorize each head independently instead of one shared monolithic low-rank manifold
    - train transcript-to-head-coordinates maps on legal synthetic prefixes only
    - decode through the existing `HazardTeacher`
  - reason:
    - closer to handoff than another raw residual tweak
    - lower-risk than the already-rejected crude discrete prototype mixture
    - may recover head-specific variation that the global rank-3 manifold is compressing away
- Next:
  - implement `greybox_hazard_phasefactored`
  - integrate registry / benchmark / CLI / tests
  - run hard-slice probes first

### 2026-03-21T11:12:00Z

- Implemented new handoff-aligned grey-box branch:
  - `greybox_hazard_phasefactored`
  - file:
    - `src/astar/student/predictor/greybox_hazard_phasefactored.py`
- Core design:
  - keep the existing semimechanistic `HazardTeacher` decoder
  - split round-law coefficients into separate `build`, `port`, `ruin` heads
  - factorize each head independently instead of one monolithic coefficient manifold
  - fit transcript-to-coordinate ridge maps for each head from legal synthetic prefixes only
  - infer headwise coefficient vectors online, concatenate, decode through `HazardTeacher`
  - keep same safety pieces:
    - historical bucket prior blend
    - exact observed-cell correction
    - probability floor
- Why this branch exists:
  - directly targets handoff gap around stronger teacher parameterization (`H7` / `H8` flavor)
  - more structured than current monolithic low-rank coefficient model
  - lower-risk than the already-rejected crude discrete prototype mixture
- Integrated into framework:
  - predictor registry / live builder
  - historical model-eval path
  - historical benchmark transcript-model allowlist
  - CLI model choices:
    - visualize-model-prediction
    - synthetic tournament
    - synthetic benchmark
    - historical benchmark
    - live online
  - historical benchmark smoke test matrix
- Validation:
  - `uv run python -m py_compile src/astar/student/predictor/greybox_hazard_phasefactored.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
    - `17 passed in 45.65s`
- Official benchmarks launched:
  - `agent5_phasefactored_coverage_online50_v01`
    - model `greybox_hazard_phasefactored`
    - policy `coverage`
    - `samples_per_round=4`
    - `budget=50`
    - `episode_seed=0`
    - `jobs=6`
    - session `44392`
  - `agent5_phasefactored_explorationr3_online50_v01`
    - model `greybox_hazard_phasefactored`
    - policy `exploration_r3`
    - `samples_per_round=4`
    - `budget=50`
    - `episode_seed=0`
    - `jobs=6`
    - session `31518`

### 2026-03-21T11:20:00Z

- Full official phase-factored benchmark results harvested:
  - `agent5_phasefactored_coverage_online50_v01`
    - mean score `66.7372`
    - mean weighted KL `0.143396`
  - `agent5_phasefactored_explorationr3_online50_v01`
    - mean score `67.8866`
    - mean weighted KL `0.136765`
- Interpretation:
  - current pure phase/head-factored branch is **not** competitive as a standalone lead
  - `exploration_r3` is better than `coverage` for this branch, but still far below the current lead `75.1931`
  - failure is concentrated on `f1dac...` and also large losses on `71451...`, `ae7800...`, `fd3c92...`
  - however:
    - phase-factored branch remains unusually strong on `c5cdf...`
    - `c5cdf...` round mean under `exploration_r3` = `79.2568`
    - this suggests possible value as a **small-weight expert** rather than a standalone model
- Per-round comparison vs current lead `agent5_hybrid_lowrank_queryres_explorationr3_online50_v03w35`:
  - phase-factored is much worse on most rounds
  - only clear strong relative win is `c5cdf...`
  - conclusion:
    - do not promote pure `greybox_hazard_phasefactored`
    - next best experiment is a convex hybrid with `query_residual`
- New sweep launched to test exactly that:
  - command:
    - `uv run python scripts/agent5_hybrid_sweep.py --policy exploration_r3 --budget 50 --episode-seed 0 --lowrank-model greybox_hazard_phasefactored --lowrank-samples-per-round 4 --residual-model query_residual --residual-samples-per-round 1 --weight 0.0 --weight 0.05 --weight 0.10 --weight 0.15 --weight 0.20 --weight 0.25 --weight 0.30 --max-workers 8`
  - stdout log:
    - `data/artifacts/benchmarks/agent5_phasefactored_queryres_explorationr3_sweep_v01.log`
  - session:
    - `1549`

### 2026-03-21T11:35:00Z

- Phase-factored + `query_residual` hybrid sweeps finished.

- Trusted hard-slice probe, full 8-round training universe, eval rounds `{36e581..., c5cdf..., f1dac...}`:
  - command:
    - `uv run python scripts/agent5_hybrid_sweep.py --policy exploration_r3 --budget 50 --episode-seed 0 --lowrank-model greybox_hazard_phasefactored --lowrank-samples-per-round 4 --residual-model query_residual --residual-samples-per-round 1 --eval-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --eval-round-id c5cdf100-a876-4fb7-b5d8-757162c97989 --eval-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --weight 0.0 --weight 0.05 --weight 0.10 --weight 0.15 --weight 0.20 --weight 0.25 --weight 0.30 --max-workers 3`
  - log:
    - `data/artifacts/benchmarks/agent5_phasefactored_queryres_explorationr3_probe3_v01.log`
  - result summary:
    - `weight=0.00`: mean score `62.8756`, mean weighted KL `0.155907`
    - `weight=0.05`: mean score `63.0792`, mean weighted KL `0.155107`
    - `weight=0.10`: mean score `63.2540`, mean weighted KL `0.154501`
    - `weight=0.15`: mean score `63.4004`, mean weighted KL `0.154084`
    - `weight=0.20`: mean score `63.5182`, mean weighted KL `0.153856`
    - `weight=0.25`: mean score `63.6071`, mean weighted KL `0.153817`
    - `weight=0.30`: mean score `63.6667`, mean weighted KL `0.153969`
  - interpretation:
    - phase weight helps `36e581...` and `c5cdf...`
    - but steadily hurts `f1dac...`
    - net gain on this slice is tiny and nowhere near a lead signal

- Full 8-round sweep, policy `exploration_r3`:
  - command:
    - `uv run python scripts/agent5_hybrid_sweep.py --policy exploration_r3 --budget 50 --episode-seed 0 --lowrank-model greybox_hazard_phasefactored --lowrank-samples-per-round 4 --residual-model query_residual --residual-samples-per-round 1 --weight 0.0 --weight 0.05 --weight 0.10 --weight 0.15 --weight 0.20 --weight 0.25 --weight 0.30 --max-workers 8`
  - log:
    - `data/artifacts/benchmarks/agent5_phasefactored_queryres_explorationr3_sweep_v01.log`
  - result summary:
    - `weight=0.00`: mean score `74.6063`, mean weighted KL `0.100831`
    - `weight=0.05`: mean score `74.6640`, mean weighted KL `0.100621`
    - `weight=0.10`: mean score `74.6836`, mean weighted KL `0.100597`
    - `weight=0.15`: mean score `74.6655`, mean weighted KL `0.100756`
    - `weight=0.20`: mean score `74.6100`, mean weighted KL `0.101098`
    - `weight=0.25`: mean score `74.5172`, mean weighted KL `0.101623`
    - `weight=0.30`: mean score `74.3867`, mean weighted KL `0.102333`
  - best:
    - `weight=0.10`
    - mean score `74.6836`
    - mean weighted KL `0.100597`
- Full-sweep interpretation:
  - small phase weight can improve pure `query_residual`
  - but even the best fixed blend stays clearly below the current official lead:
    - `74.6836` vs `75.1931` for `greybox_hybrid_lowrank_queryres` with `exploration_r3`
  - conclusion:
    - reject fixed `phasefactored + query_residual` hybrid as a lead candidate
    - keep phase-factored branch only as an experimental diagnostic branch for now

### 2026-03-21T11:50:00Z

- Re-read handoff again around:
  - Phase 6 regime manifold
  - `H6` discrete mixture over regime families
  - `H9` direct online head / robust student ideas
- Re-checked current machine state before allocating more jobs:
  - load about `48.3 / 54.2 / 49.7` on `384` cores
  - RAM about `1.5 TiB free`, `1.6 TiB available`
  - still enough headroom for several more official benchmarks in parallel
- Re-checked live competing runs:
  - heavy `agent2` full-8 coeffbank benchmark
  - several `agent3` teacher-student full/targeted runs
  - `agent6` test-heavy summary/event work
  - `agent7` `ffam_mode_v17`
- `greybox_hazard_bayesfamily` hard-slice sweep status:
  - sweep process still active and consuming about `600%` CPU
  - only first `6 / 18` task results emitted so far
  - partial rescued configs already materially better than default:
    - `anchor=0.35 scale=0.10`:
      - `36e581...`: `61.4980`
      - `c5cdf...`: `79.3179`
      - `f1dac...`: `59.6974`
      - partial mean `66.8378`
    - `anchor=0.35 scale=0.30`:
      - `36e581...`: `59.7980`
      - `c5cdf...`: `79.6556`
      - `f1dac...`: `60.0263`
      - partial mean `66.4933`
- Decision from those partial results:
  - current default `greybox_hazard_bayesfamily_v01` is too aggressive
  - promote explicit conservative named variants for official benchmarking:
    - `greybox_hazard_bayesfamily_anchor35_scale10_v02`
    - `greybox_hazard_bayesfamily_anchor35_scale30_v03`
  - reason:
    - handoff wants explicit family members with distinct names
    - easier to benchmark cleanly than ad hoc one-off script configs
- Integration / validation for the named variants:
  - wired builder / offline eval / historical benchmark / CLI / smoke tests
  - new supported model names:
    - `greybox_hazard_bayesfamily_anchor35_scale10_v02`
    - `greybox_hazard_bayesfamily_anchor35_scale30_v03`
  - `uv run python -m py_compile src/astar/student/predictor/greybox_hazard_bayesfamily.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
    - `20 passed in 69.66s`
- Official full 8-round benchmarks launched in parallel:
  - `agent5_bayesfamily_anchor35_scale10_explorationr3_online50_v02`
    - model `greybox_hazard_bayesfamily_anchor35_scale10_v02`
    - policy `exploration_r3`
    - `samples_per_round=4`
    - `budget=50`
    - `episode_seed=0`
    - `jobs=6`
    - session `70489`
  - `agent5_bayesfamily_anchor35_scale30_explorationr3_online50_v03`
    - model `greybox_hazard_bayesfamily_anchor35_scale30_v03`
    - policy `exploration_r3`
    - `samples_per_round=4`
    - `budget=50`
    - `episode_seed=0`
    - `jobs=6`
    - session `92964`
  - `agent5_bayesfamily_anchor35_scale10_coverage_online50_v02`
    - model `greybox_hazard_bayesfamily_anchor35_scale10_v02`
    - policy `coverage`
    - `samples_per_round=4`
    - `budget=50`
    - `episode_seed=0`
    - `jobs=6`
    - session `47565`
  - `agent5_bayesfamily_anchor35_scale30_coverage_online50_v03`
    - model `greybox_hazard_bayesfamily_anchor35_scale30_v03`
    - policy `coverage`
    - `samples_per_round=4`
    - `budget=50`
    - `episode_seed=0`
    - `jobs=6`
    - session `28082`
- Current additional signal from the still-running hard-slice sweep:
  - `anchor=0.55 scale=0.10` now also has all three rounds:
    - `36e581...`: `62.6492`
    - `c5cdf...`: `79.1066`
    - `f1dac...`: `59.5000`
    - mean `67.0853`
  - implication:
    - if the launched `anchor=0.35` full-8 runs underperform, the next immediate branch should be an explicit `anchor=0.55 scale=0.10` variant

### 2026-03-21T12:06:00Z

- Full official 8-round bayesfamily results harvested for the first conservative variants:
  - `agent5_bayesfamily_anchor35_scale10_explorationr3_online50_v02`
    - mean score `73.1711`
    - mean weighted KL `0.106471`
  - `agent5_bayesfamily_anchor35_scale30_explorationr3_online50_v03`
    - mean score `73.0319`
    - mean weighted KL `0.107299`
  - `agent5_bayesfamily_anchor35_scale10_coverage_online50_v02`
    - mean score `74.0909`
    - mean weighted KL `0.102028`
  - `agent5_bayesfamily_anchor35_scale30_coverage_online50_v03`
    - mean score `74.1359`
    - mean weighted KL `0.101826`
- Interpretation:
  - for this family, `coverage` clearly beats `exploration_r3`
  - `anchor35_scale30` is slightly best among the tested official variants
  - still below current overall lead:
    - `74.1359` vs `75.1931`
  - biggest persistent drag remains `f1dac...`
  - `36e581...` also still unstable under stronger likelihood settings
- Updated hard-slice sweep now fully complete:
  - `anchor=0.35 scale=0.10` -> mean `66.8378`
  - `anchor=0.35 scale=0.30` -> mean `66.4933`
  - `anchor=0.35 scale=0.60` -> mean `66.4970`
  - `anchor=0.55 scale=0.10` -> mean `67.0853`
  - `anchor=0.55 scale=0.30` -> mean `66.4888`
  - `anchor=0.55 scale=0.60` -> mean `66.4969`
- Decision from combined evidence:
  - promote explicit next family member:
    - `greybox_hazard_bayesfamily_anchor55_scale10_v04`
  - rationale:
    - best hard-slice result
    - most likely path to move the full-8 bayesfamily branch upward
    - test with `coverage` first priority, `exploration_r3` second priority
- `v04` integration / validation:
  - added explicit model name:
    - `greybox_hazard_bayesfamily_anchor55_scale10_v04`
  - `uv run python -m py_compile src/astar/student/predictor/greybox_hazard_bayesfamily.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
    - `21 passed in 59.72s`
- Official full 8-round `v04` benchmarks launched:
  - `agent5_bayesfamily_anchor55_scale10_coverage_online50_v04`
    - model `greybox_hazard_bayesfamily_anchor55_scale10_v04`
    - policy `coverage`
    - `samples_per_round=4`
    - `budget=50`
    - `episode_seed=0`
    - `jobs=6`
    - session `91464`
  - `agent5_bayesfamily_anchor55_scale10_explorationr3_online50_v04`
    - model `greybox_hazard_bayesfamily_anchor55_scale10_v04`
    - policy `exploration_r3`
    - `samples_per_round=4`
    - `budget=50`
    - `episode_seed=0`
    - `jobs=6`
    - session `64264`

### 2026-03-21T12:10:00Z

- Re-checked current machine state before another new branch:
  - load about `71.7 / 82.0 / 74.9` on `384` cores
  - RAM about `1.2 TiB free`, `1.3 TiB available`
  - still ample headroom for another moderate parallel experiment family
- Other current notable jobs:
  - `agent2` full-8 coeffbank variant
  - several `agent6` summary-rate decoder probes
  - several `agent7` `ffam_mode` policy/sample sweeps
- New branch decision:
  - stop only doing explicit round-expert mixtures
  - implement a closer handoff Phase-6 model:
    - `greybox_hazard_clusteredmanifold_v01`
  - intended form:
    - small discrete regime family
    - within-family low-rank coordinate
    - transcript-conditioned family weighting + family-specific coordinate regression
  - this is directly targeting the suggested form:
    - `beta_r ≈ beta_0 + B_{m_r} u_r`
  - reason:
    - more structured than `greybox_hazard_bayesfamily`
    - less brittle than pure round-expert lookup
    - closer to the handoff's requested discrete+continuous regime model
- Integration / validation:
  - added new model:
    - `greybox_hazard_clusteredmanifold_v01`
  - `uv run python -m py_compile src/astar/student/predictor/greybox_hazard_clusteredmanifold.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
    - `22 passed in 90.92s`
- Initial official hard-slice probes launched:
  - `agent5_clusteredmanifold_coverage_probe3_v01`
    - policy `coverage`
    - rounds `{36e581..., c5cdf..., f1dac...}`
    - `samples_per_round=4`
    - `budget=50`
    - `jobs=3`
    - session `35007`
  - `agent5_clusteredmanifold_explorationr3_probe3_v01`
    - policy `exploration_r3`
    - rounds `{36e581..., c5cdf..., f1dac...}`
    - `samples_per_round=4`
    - `budget=50`
    - `jobs=3`
    - session `7062`

### 2026-03-21T12:21:00Z

- Results harvested:
  - `agent5_bayesfamily_anchor55_scale10_coverage_online50_v04`
    - mean score `74.0576`
    - mean weighted KL `0.102201`
    - rejected:
      - slightly worse than `anchor35_scale30_v03` coverage (`74.1359`)
  - `agent5_clusteredmanifold_coverage_probe3_v01`
    - mean score `42.4426`
    - mean weighted KL `0.387751`
  - `agent5_clusteredmanifold_explorationr3_probe3_v01`
    - mean score `42.7460`
    - mean weighted KL `0.382320`
- Interpretation:
  - pure clustered-manifold family decomposition is catastrophically wrong on `36e581...`
  - but it is still very strong on `c5cdf...`
  - that strongly suggests:
    - the family decomposition itself may be useful
    - the failure is the pure transcript-feature cluster weighting
    - next fix should be Bayesian evidence reweighting over clustered experts
- New immediate branch:
  - `greybox_hazard_clusteredbayes_v01`
  - idea:
    - reuse clustered-manifold family experts
    - use transcript-conditioned family logits only as prior
    - reweight families with exact observed-cell likelihoods
  - reason:
    - directly attacks the observed clustered-manifold failure mode
    - still matches the handoff's discrete+continuous regime-family agenda

### 2026-03-21T12:32:00Z

- Remaining `v04` official result harvested:
  - `agent5_bayesfamily_anchor55_scale10_explorationr3_online50_v04`
    - mean score `73.2356`
    - mean weighted KL `0.106057`
- Combined `v04` read:
  - `coverage`:
    - `74.0576`
  - `exploration_r3`:
    - `73.2356`
  - conclusion:
    - `anchor55_scale10_v04` rejected
    - still below `anchor35_scale30_v03` coverage (`74.1359`)

- Important validation correction for clustered-family models:
  - the official 3-round benchmark under-trained them because each held-out fit only saw the other `2` rounds
  - ran fair custom hard-slice probes with the full 8-round training universe instead

- Fair custom hard-slice results, `coverage`, full 8-round training universe:
  - `greybox_hazard_clusteredmanifold_v01`
    - `36e581...`: `58.0311`
    - `c5cdf...`: `79.2943`
    - `f1dac...`: `49.7446`
    - mean `62.3567`
    - weighted KL `0.164068`
    - log:
      - `data/artifacts/benchmarks/agent5_clusteredmanifold_coverage_probe3_full8train_v01.log`
  - `greybox_hazard_clusteredbayes_v01`
    - identical results:
      - mean `62.3567`
      - weighted KL `0.164068`
    - log:
      - `data/artifacts/benchmarks/agent5_clusteredbayes_coverage_probe3_full8train_v01.log`
- Interpretation:
  - clustered family decomposition is real enough to help `c5cdf...`
  - but still much too weak on `36e581...` and `f1dac...`
  - Bayes reweighting over clustered experts provided no measurable rescue
  - conclusion:
    - reject pure clustered-manifold and clustered-bayes as lead candidates
    - do not scale these branches to full 8 official benchmarks
    - next useful pivots are no longer more cluster-family tweaking:
      - stronger event-structured teacher branch (`H8`)
      - or a materially better direct student / tensor head branch (`H9`)

### 2026-03-21T11:32:00Z

- Re-read handoff hypotheses again, especially:
  - `H6`: small discrete mixture over regime families helps
  - `H8`: event-structured supervision helps
- Re-checked machine health / other agent runs before new branch:
  - load about `46.7 / 49.4 / 46.3` on `384` cores
  - RAM about `1.9 TiB free`, `2.0 TiB available`
  - other active heavy runs include:
    - `agent2` full 8-round coeffbank benchmark
    - several `agent6` summary-rate / law-residual probes
    - `agent7` `ffam_mode_v12`
    - many `agent1` high-memory python workers
  - conclusion:
    - still huge safe headroom
    - okay to run several more heavy probes in parallel
- New branch decision from evidence:
  - current `greybox_hazard_mixture_v01` failed mainly because it regressed transcript features directly to prototype weights
  - stronger H6 test is:
    - discrete family experts from historical round laws
    - online posterior weights updated directly from legal observed-cell likelihood
    - anchored by the continuous low-rank expert for robustness
- Next implementation:
  - `greybox_hazard_bayesfamily`
  - idea:
    - keep a bank of per-round semimechanistic law experts
    - add low-rank continuous anchor expert
    - score exact observed query outcomes under each expert
    - entropy-weight those observation likelihoods so dynamic cells dominate
    - posterior-average expert predictions, then apply exact observed-cell correction
  - reason:
    - much closer to handoff H6 than the earlier crude centroid-regression prototype
    - uses legal online evidence directly instead of asking transcript features alone to identify cluster id

### 2026-03-21T11:40:00Z

- Implemented new H6-aligned branch:
  - `greybox_hazard_bayesfamily`
  - file:
    - `src/astar/student/predictor/greybox_hazard_bayesfamily.py`
- Core design:
  - continuous anchor expert:
    - existing `GreyboxHazardLowRankPredictor`
  - discrete family experts:
    - one semimechanistic coefficient vector per historical training round
  - online inference:
    - compute raw pre-conditioning predictions for all experts
    - score legal observed query outcomes under each expert
    - entropy-weight evidence so dynamic cells matter more than static ones
    - posterior-average expert predictions
    - only then apply exact observed-cell correction + probability floor
- Why this differs from failed `greybox_hazard_mixture_v01`:
  - no transcript-feature regression to cluster ids
  - evidence update is direct likelihood over observed outcomes
  - includes a strong continuous anchor for robustness
- Integrated:
  - predictor registry / live builder
  - model-eval
  - historical benchmark transcript-model allowlist
  - CLI model choices
  - historical benchmark smoke matrix
- Validation:
  - `uv run python -m py_compile src/astar/student/predictor/greybox_hazard_bayesfamily.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
    - `18 passed in 75.21s`
- Launched experiments:
  - official 3-round default benchmark, `coverage`
    - `agent5_bayesfamily_coverage_probe3_v01`
    - session `45082`
  - official 3-round default benchmark, `exploration_r3`
    - `agent5_bayesfamily_explorationr3_probe3_v01`
    - session `66859`
  - trusted hard-slice hyperparameter sweep, `exploration_r3`
    - varying:
      - `global_anchor_weight in {0.35, 0.55}`
      - `likelihood_scale in {0.10, 0.30, 0.60}`
    - eval rounds:
      - `36e581...`
      - `c5cdf...`
      - `f1dac...`
    - full 8-round training universe per held-out round
    - log:
      - `data/artifacts/benchmarks/agent5_bayesfamily_explorationr3_probe3_sweep_v01.log`
    - session `22352`

### 2026-03-21T11:42:00Z

- Default official 3-round probes for `greybox_hazard_bayesfamily` finished:
  - `agent5_bayesfamily_coverage_probe3_v01`
    - mean score `55.2406`
    - mean weighted KL `0.251578`
  - `agent5_bayesfamily_explorationr3_probe3_v01`
    - mean score `55.4411`
    - mean weighted KL `0.249443`
- Per-round pattern under `exploration_r3`:
  - `36e581...`: `20.2235`
  - `c5cdf...`: `80.5319`
  - `f1dac...`: `65.5677`
- Interpretation:
  - family is directionally interesting on `c5cdf...` and decent on `f1dac...`
  - but catastrophic on `36e581...`
  - current default is nowhere near viable
  - only reason to keep spending time here is if the sweep shows that conservative anchor/likelihood settings can rescue `36e581...` substantially

### 2026-03-20T00:00:00Z

- Started.
- Read canon docs + handoff.
- Mapped benchmark/model/artifact seams.
- Identified current strongest visible benchmark and likely target model family.
- Next:
  - verify task tracker access if possible
  - run fresh historical baseline
  - inspect hard-round behavior
  - decide minimal high-value model/validation changes

### 2026-03-20T23:00:00Z

- `br` verified unavailable in both `bash` and `zsh`; continuing with local file tracking here.
- Found critical local-validation bug:
  - `query_residual` failed in this checkout because synthetic-live dataset indices stored absolute `episode_path` values from another workspace root (`/home/jorge/repos/ainm/...`).
- Found second dataset bug:
  - legacy `synthetic_live_coverage_v1` only covers 6 rounds, but `query_residual` would still silently reuse it for 8-round training scope.
  - missing rounds: `36e581f1-73f8-453f-ab98-cbe3052b701b`, `c5cdf100-a876-4fb7-b5d8-757162c97989`.
- Implemented fixes:
  - synthetic-live artifact loader now resolves moved/stale paths against current workspace
  - synthetic-live dataset builder now writes portable relative `episode_path` values
  - `query_residual` now rejects incomplete cached/legacy synthetic datasets and rebuilds a scope-matching dataset instead
  - `SummaryBankStudent` updated to use same path-resolution behavior
- Added tests:
  - synthetic dataset writes portable relative episode paths
  - synthetic artifact loader resolves moved-workspace paths
  - historical benchmark with `query_residual` succeeds even if incomplete legacy `synthetic_live_coverage_v1` exists
- Verified:
  - `uv run --extra dev pytest tests/test_history_datasets.py -q` -> `4 passed`
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `5 passed`
- Notes:
  - full hard-round probe on held-out `f1dac...` triggered first-time build of the 8-round scoped synthetic dataset and was too slow for inline iteration; aborted after confirming this path now builds a richer scoped dataset instead of reusing stale legacy data.
  - sandbox blocked cleanup of the partial generated dataset dir via `rm -rf`; left uncommitted unless later intentionally kept.
- Immediate next:
  - commit + push this portability/validation fix
  - build scoped synthetic dataset intentionally
  - rerun targeted hard-round probes
  - test whether richer scoped dataset alone improves `query_residual`

### 2026-03-21T00:00:00Z

- Portability fix committed + pushed to `origin/agent5`.
- Added second validation/pipeline improvement:
  - `build_synthetic_live_dataset()` now skips `materialize_round_episode()` when required per-seed feature/evidence/replay-summary artifacts already exist.
  - reason: dataset rebuilds were wasting ~36.5s/round on rematerialization even when cached artifacts were already present.
- Verified rematerialization hotspot on `c5cdf...`:
  - `build_round_episode`: ~8.99s
  - `materialize_round_episode`: ~36.50s
  - `load_round_learning_episode`: ~0.04s
  - `run_online_episode`: ~0.02s
- Added test proving repeat synthetic dataset builds reuse existing materialized round artifacts instead of rewriting them.
- Re-verified tests after this change:
  - `uv run --extra dev pytest tests/test_history_datasets.py -q` -> `5 passed`
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `5 passed`
- Explicitly built full scoped 8-round synthetic transcript dataset:
  - `query_residual_synthetic_live__policy=coverage__samples=1__rounds=n=8__sha1=ea07400de1`
  - `row_count=8`
  - `round_count=8`
  - `total_query_count=360`
  - wall time `318.768s`
- Full-corpus held-out round probes with default `query_residual` + `coverage` + 7 training rounds:
  - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`: `54.5655`
    - old benchmark report: `46.4143`
    - delta: `+8.1512`
  - `c5cdf100-a876-4fb7-b5d8-757162c97989`: `67.0175`
    - old benchmark report: `71.1327`
    - delta: `-4.1152`
  - `36e581f1-73f8-453f-ab98-cbe3052b701b`: `64.4914`
    - old benchmark report: `63.9633`
    - delta: `+0.5281`
- Interpretation:
  - richer full-corpus transcript training clearly helps the hardest known round (`f1dac...`).
  - it hurts `c5cdf...`, so the effect is not uniformly positive.
  - across the 3 probed rounds, net round-score delta is still positive (`+4.5641` total; about `+0.57` if spread over the 8-round mean), but this is not enough evidence to freeze defaults yet.
- First actual model ablation after infra fixes:
  - `query_residual` with `ridge_lambda=16` on held-out `c5cdf...`
  - result: `67.1045` vs `67.0175` default
  - conclusion: only trivial recovery; `c5cdf...` regression is not mainly a weak-ridge problem.
- Current best next hypotheses:
  - richer transcript diversity (`samples_per_round > 1`) may help more than stronger ridge.
  - policy-conditioned transcript generation (`exploration` / repeat-aware) still needs probing.
  - may need smarter training-round selection or mixture logic rather than “always all 7 rounds”.

### 2026-03-21T01:00:00Z

- Verified replay diversity ceiling for current local test corpus:
  - most rounds have `58` replay runs per seed
  - `71451d74-be9f-471f-aacd-a41f3b68a9cd` has one seed with `59`
  - implication: `samples_per_round > 1` is real extra transcript diversity, not duplicate rollout noise.
- Finished full scoped 8-round `samples_per_round=4` coverage dataset build:
  - `query_residual_synthetic_live__policy=coverage__samples=4__rounds=n=8__sha1=ea07400de1`
  - `row_count=32`
  - `round_count=8`
  - `total_query_count=1440`
  - wall time `327.370s`
- Next immediate step:
  - run same held-out probes (`f1dac...`, `c5cdf...`, `36e581...`) with `samples_per_round=4`
  - compare directly against current `samples=1` scoped-dataset results

### 2026-03-21T07:00:00Z

- User clarified direction:
  - stop spending iteration budget mainly on `query_residual`
  - build genuinely new grey-box teacher/student model family members
  - use much more parallel experimentation / hardware
- Why `query_residual` happened first:
  - handoff explicitly required adapting to existing framework, running working end-to-end baselines, validating on held-out rounds, and continuing from current state.
  - that established trustworthy validation + fixed real local bugs, but it was only baseline/infra work.
- Parallel codebase recon done:
  - teacher/regime stack map
  - student/posterior stack map
  - conclusion: easiest benchmarkable new family is teacher/student online inference, not more residual tweaking.
- Implemented new benchmarkable grey-box predictors:
  - `greybox_regime_ridge_v01`
  - `greybox_regime_knn_v01`
- Design:
  - train `HazardTeacher` on held-in replay rounds
  - train transcript-to-regime posterior on legal synthetic transcripts from held-in rounds
  - transcript features reuse rich regime-oriented residual summaries rather than crude frequency counts
  - decode via hazard teacher
  - blend with historical bucket prior
  - enforce exact observed-cell evidence with count-based exact-cell blending
- Framework integration added:
  - online predictor registry
  - historical eval path
  - CLI model choices for synthetic / historical / live runs
  - held-out benchmark smoke tests for both new models
- Verification:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `7 passed`
  - `uv run --extra dev pytest tests/test_history_datasets.py -q` -> `5 passed`
- Immediate next:
  - run real held-out probes on local full corpus for both grey-box models
  - compare against `query_residual` and existing `latent_regime`
  - if promising, scale transcript sample count upward and run larger parallel ablations

### 2026-03-21T08:00:00Z

- New grey-box probe results on full local corpus, `policy=coverage`, `samples_per_round=4`, held-out rounds `{f1dac..., c5cdf..., 36e581...}`:

- `greybox_regime_knn_v01`
  - `f1dac...`: `51.2754`
  - `c5cdf...`: `77.1572`
  - `36e581...`: `45.8848`
  - interpretation:
    - strong on `c5cdf...`
    - too unstable; rejected as current lead

- `greybox_regime_ridge_v01`
  - default `prior_blend=0.25`
  - `f1dac...`: `53.5571`
  - `c5cdf...`: `78.7253`
  - `36e581...`: `49.7357`
  - interpretation:
    - strong new family signal
    - massive gain on `c5cdf...`
    - still too weak on `36e581...`

- Ridge prior-blend sweep:
  - `f1dac...`
    - best near `prior_blend=0.25` (`53.5571`)
  - `c5cdf...`
    - best near `prior_blend=0.35` (`79.1772`)
  - `36e581...`
    - monotonically improved up to `prior_blend=0.55` (`53.8911`)
  - Interpretation:
    - constant global blend is not enough
    - likely decoder generalization / confidence mismatch remains

### 2026-03-21T09:00:00Z

- Implemented third new grey-box family member:
  - `greybox_hazard_lowrank_v01`
- Design:
  - fit semimechanistic replay coefficients per held-in round
  - factorize them into low-rank round coordinates
  - learn transcript-to-coordinate regression on legal synthetic transcripts
  - decode reconstructed coefficient vector through `HazardTeacher`
  - blend with historical bucket prior + exact observed-cell evidence
- 3-round held-out probes, `policy=coverage`, `samples_per_round=4`, default `prior_blend=0.35`:
  - `f1dac...`: `57.3516`
  - `c5cdf...`: `78.5253`
  - `36e581...`: `64.6992`

### 2026-03-21T10:25:44Z

- Re-read full handoff plus canon docs again before continuing:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent5.md`
- Reconfirmed handoff intent:
  - `query_residual` was only baseline/infra bootstrap
  - main target remains grey-box teacher/student/policy family
  - highest-priority missing branches still include better teacher parameterization, direct student head, and stronger policy/validation protocols
- Machine-health snapshot before launching more work:
  - host `c4d-monster-01.c.ai-nm26osl-1706.internal`
  - RAM `2.9TiB total`, `2.0TiB available`
  - load averages `48.96 / 58.73 / 62.44` on `384` cores
  - plenty of safe headroom for more parallel experiments
- Checked competing machine usage:
  - other agents currently running several heavy teacher/student sweeps
  - notable large-memory jobs from `agent1` and `agent3`
  - still enough headroom that `4-16` worker historical benchmarks remain safe
- `br list` checked again and still unavailable in current env (`command not found`).
- Current local tree is dirty mainly from:
  - benchmark/dataset/replay artifact generation
  - unfinished local hook-up for `greybox_hybrid_lowrank_coefficientknn`
- Two full 8-round benchmarks still running from prior turn and need harvest before selecting next lead:
  - session `4989`: `greybox_hybrid_lowrank_queryres`, `policy=exploration_r3`, default weight `0.35`
  - session `11477`: `greybox_hybrid_lowrank_queryres_w45`, `policy=exploration_r3`, weight `0.45`
- Current working decision:
  - treat official historical benchmark as canonical selector
  - avoid more pure `query_residual` tuning
  - focus next on actual new grey-box family branches beyond current monolithic low-rank hazard decoder

### 2026-03-21T10:50:00Z

- Implemented new direct-head branch from handoff H9 / Phase 8:
  - `greybox_student_joint`
  - file: `src/astar/student/predictor/greybox_student_joint.py`
- Core design:
  - base predictor = `GreyboxHazardLowRankPredictor` with prior-heavier blend (`prior_blend=0.55`)
  - train legal transcript encoder on synthetic live episodes from held-in rounds only
  - target = round-shared delta-logit tensor between lowrank base prediction and historical ground truth
  - compress delta tensors with low-rank basis
  - regress transcript features -> residual-basis coordinates
  - inference = lowrank base + direct tensor correction + exact observed-cell re-imposition
- Reasoning:
  - this is not another pure residual-only baseline
  - it is the missing “joint student / direct tensor head” branch from the handoff
  - hypothesis: transcript evidence can explain low-dimensional cross-seed correction patterns the lowrank teacher misses
- Framework integration added:
  - online predictor registry
  - historical eval path
  - CLI model choices
  - historical benchmark smoke coverage in tests
- Verification:
  - `uv run python -m py_compile src/astar/student/predictor/greybox_student_joint.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/cli.py src/astar/workflows/historical_benchmark.py tests/test_historical_benchmark.py`
    - passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
    - `16 passed in 49.59s`
- New targeted held-out probes launched with full 7-round training and 3 held-out rounds `{36e581..., c5cdf..., f1dac...}`:
  - `agent5_student_joint_probe3_default`
    - config: `samples=4`, `rank=6`, `ridge=8.0`, `correction_blend=0.85`, `correction_scale=0.75`
  - `agent5_student_joint_probe3_aggressive`
    - config: `samples=4`, `rank=8`, `ridge=6.0`, `correction_blend=1.0`, `correction_scale=1.0`
  - `agent5_student_joint_probe3_conservative`
    - config: `samples=4`, `rank=4`, `ridge=12.0`, `correction_blend=0.65`, `correction_scale=0.55`
- Probe outputs are set to write `result.json` under `data/artifacts/benchmarks/<name>/`.
- Commit/push checkpoint:
  - local commit: `f399d0bc` `[astar] add greybox joint student predictor`
  - pushed to `origin/agent5` via clean worktree as remote commit `b23848c5`

### 2026-03-21T10:55:00Z

- Harvested previously launched full 8-round `exploration_r3` historical benchmarks:
  - `agent5_hybrid_lowrank_queryres_explorationr3_online50_v03w35`
    - model `greybox_hybrid_lowrank_queryres`
    - policy `exploration_r3`
    - `samples=4`, `budget=50`, `episode_seed=0`
    - mean score `75.1931`
    - mean weighted KL `0.097798`
  - `agent5_hybrid_lowrank_queryres_w45_explorationr3_online50_v01`
    - model `greybox_hybrid_lowrank_queryres_w45`
    - policy `exploration_r3`
    - `samples=4`, `budget=50`, `episode_seed=0`
    - mean score `75.1356`
    - mean weighted KL `0.098000`
- Interpretation:
  - `exploration_r3` is now the best validated result in this branch so far.
  - New local lead:
    - `75.1931` vs prior coverage lead `74.9421`
    - delta `+0.2510`
  - `w35` remains slightly better than `w45` under `exploration_r3`.
  - immediate consequence: no need to keep exploring `coverage` vs `exploration_r3` for this exact hybrid family unless new model families change the posterior/query interaction materially.

### 2026-03-21T11:00:00Z

- Found prior already-materialized joint-student probe artifact:
  - `data/artifacts/benchmarks/agent5_student_joint_coverage_probe3_v01/`
- Result:
  - model `greybox_student_joint`
  - policy `coverage`
  - rounds `{36e581..., c5cdf..., f1dac...}`
  - mean score `37.9554`
  - mean weighted KL `0.395407`
  - per-round:
    - `36e581...`: `16.7019`
    - `c5cdf...`: `73.4436`
    - `f1dac...`: `23.7208`
- Interpretation:
  - naive/default joint direct-head branch is catastrophically overcorrecting.
  - only reason to continue this branch is if heavily shrunken correction variants recover most of the lowrank base and add a small gain.
  - ongoing custom ablations are therefore correctly focused on smaller correction strengths.

### 2026-03-21T10:45:00Z

- Implemented new direct student branch aligned with handoff Phase 8 / H9:
  - model family entry: `greybox_student_joint`
  - internal name: `greybox_student_joint_v01`
- Design:
  - fit existing `greybox_hazard_lowrank` predictor as teacher-backed base
  - build legal synthetic transcript prefixes from held-in rounds only
  - for each prefix, compute low-rank base prediction for the whole round
  - supervise a low-rank direct tensor head on the round-shared logit correction between base prediction and true final tensors
  - infer correction from transcript regime features + inferred low-rank coords + prediction summary stats
  - apply correction to the full 5-seed prediction tensor, then reapply exact observed-cell blending and probability floor
- Why this branch matters:
  - this is not another pure residual baseline
  - it directly targets the handoff requirement of a legal online student with both latent/teacher structure and a direct tensor head
  - correction is round-shared across all seeds, exploiting the shared hidden round parameters more explicitly than cellwise-only residual fitting
- Integrated:
  - predictor registry / online path
  - historical eval path
  - CLI choices
  - historical benchmark allowlist
  - smoke coverage in `tests/test_historical_benchmark.py`
- Verification:
  - `uv run python -m py_compile ...` for touched files passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` passed with `16 passed in 54.58s`
- In-flight evaluation:
  - 3-round held-out probe running:
    - benchmark `agent5_student_joint_coverage_probe3_v01`
    - rounds `{36e581..., c5cdf..., f1dac...}`
    - `policy=coverage`
    - `samples_per_round=4`
    - `budget=50`
    - session `19824`

### 2026-03-21T10:55:00Z

- Harvested prior in-flight full 8-round `exploration_r3` historical benchmarks:
  - `agent5_hybrid_lowrank_queryres_explorationr3_online50_v03w35`
    - model `greybox_hybrid_lowrank_queryres`
    - mean score `75.1931115`
    - mean weighted KL `0.09779810`
  - `agent5_hybrid_lowrank_queryres_w45_explorationr3_online50_v01`
    - model `greybox_hybrid_lowrank_queryres_w45`
    - mean score `75.1355846`
    - mean weighted KL `0.09799999`
- Interpretation:
  - both beat previous official coverage lead `74.9420879`
  - default low-rank weight `0.35` remains best of the two
  - current best visible official full-8 result in this workspace is now `exploration_r3 + greybox_hybrid_lowrank_queryres_v03`
- First direct-joint-student probe result:
  - benchmark `agent5_student_joint_coverage_probe3_v01`
  - mean score `37.9554`
  - mean weighted KL `0.395407`
  - per-round:
    - `36e581...`: `16.7019`
    - `c5cdf...`: `73.4436`
    - `f1dac...`: `23.7208`
- Conclusion from first joint-student default:
  - branch is directionally interesting only on `c5cdf...`
  - default correction head is far too aggressive and catastrophically degrades `36e581...` and `f1dac...`
  - do not promote this default
  - immediate next action: conservative shrinkage ablations (`lower rank`, `lower correction_scale`, `lower correction_blend`)

### 2026-03-21T11:10:00Z

- Implemented new belief-adaptive policy branch:
  - `adaptive_rN`
  - current implementation: full coverage first, then spend remaining repeat budget on already-observed windows that look most stochastic from the transcript itself
  - repeat scoring uses:
    - motif prior
    - observed dynamic mass (`settlement + port + ruin`)
    - empirical repeat entropy across observed final-state samples
    - settlement density
    - mild repeat-count penalty
- Generalized synthetic transcript dataset planning so non-static policies are valid:
  - if a policy does not expose a static query plan, synthetic dataset generation now uses the competition cap (`50`) as an upper bound and relies on `run_online_episode()` to stop when the policy returns `None`
  - this preserves existing static-plan behavior and makes adaptive policies compatible with transcript dataset generation
- Re-verified after adaptive-policy compatibility change:
  - `uv run --extra dev pytest tests/test_history_datasets.py -q` -> `5 passed`
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `16 passed`
- Conservative joint-student shrinkage probes in progress:
  - variant A: `residual_rank=2`, `correction_scale=0.15`, `correction_blend=0.15`
  - variant B: `residual_rank=3`, `correction_scale=0.25`, `correction_blend=0.25`
- Partial results so far on the 3-round hard slice:
  - `36e581...`
    - A: `66.4656`
    - B: `66.4064`
    - both fix the catastrophic default and edge above current coverage-hybrid score on this round
  - `c5cdf...`
    - A: `77.8781`
    - B: `77.9704`
    - both remain strong, though still below the best low-rank-only `c5cdf...` result
- Still pending at time of this log:
  - `f1dac...` for both conservative joint-student variants
  - 3-round `coverage_r5` probe for the current lead model
  - 3-round `adaptive_r5` probe for the current lead model

### 2026-03-21T11:20:00Z

- Conservative joint-student shrinkage probes finished on the hard 3-round slice:
  - variant A:
    - `residual_rank=2`
    - `correction_scale=0.15`
    - `correction_blend=0.15`
    - scores:
      - `36e581...`: `66.4656`
      - `c5cdf...`: `77.8781`
      - `f1dac...`: `56.2760`
    - 3-round mean score `66.8733`
    - mean weighted KL `0.137175`
  - variant B:
    - `residual_rank=3`
    - `correction_scale=0.25`
    - `correction_blend=0.25`
    - scores:
      - `36e581...`: `66.4064`
      - `c5cdf...`: `77.9704`
      - `f1dac...`: `56.8562`
    - 3-round mean score `67.0777`
    - mean weighted KL `0.135992`
- Interpretation:
  - both conservative variants are far better than the catastrophic default joint head
  - variant B is the better rescue
  - still not close to current overall lead family, but now a legitimate grey-box student branch rather than a broken one
  - next code action: promote joint-student defaults to the conservative variant-B settings
- New policy probes on same hard 3-round slice using current lead model `greybox_hybrid_lowrank_queryres`:
  - `coverage_r5`
    - `36e581...`: `41.7249`
    - `c5cdf...`: `78.8648`
    - `f1dac...`: `63.9311`
    - 3-round mean score `61.5070`
    - mean weighted KL `0.174096`
  - `adaptive_r5`
    - `36e581...`: `42.9482`
    - `c5cdf...`: `78.9227`
    - `f1dac...`: `63.7007`
    - 3-round mean score `61.8572`
    - mean weighted KL `0.171264`
- Policy interpretation:
  - both repeat-after-coverage policies are badly harmful on `36e581...`
  - `adaptive_r5` is slightly better than static `coverage_r5`, but both are well below current `coverage` / `exploration_r3` baselines on this slice
  - keep adaptive policy as exploratory infra, but do not promote it

### 2026-03-21T10:00:00Z

- Added round-level parallelism to `run_historical_benchmark` behind an explicit `max_workers` argument.
- CLI now accepts `--jobs` / `--max-workers` and forwards to historical benchmark.
- Validation behavior is unchanged by default:
  - `max_workers=None` keeps the old serial path
  - `max_workers>1` parallelizes held-out rounds with `ProcessPoolExecutor`
- Added regression test proving parallel and serial outputs match on sample data.
- Verified:
  - `uv run python -m py_compile src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `14 passed in 29.55s`

### 2026-03-21T10:00:00Z

- Added new coefficient-fingerprint posterior branch:
  - `greybox_coefficient_knn_v01`
  - trains a kNN posterior over replay/live transcript feature vectors
  - targets actual per-round coefficient fingerprints from the semimechanistic teacher manifold
  - decodes through `HazardTeacher`, then applies prior blend + exact-cell evidence blend
- Wiring added:
  - online predictor registry
  - historical benchmark eval path
  - CLI model choices
  - benchmark smoke test matrix
- Validation:
  - `uv run python -m py_compile src/astar/student/predictor/greybox_coefficient_knn.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q -k coefficient_knn` -> `1 passed`
- Notes:
  - first attempt used synthetic dataset materialization and hit DuckDB/catalog contention under parallel benchmark workers
  - refactored branch to use replay-run transcript proxies directly, removing the catalog write path
  - real 3-round probe is running now:
    - `agent5_coefficient_knn_probe3`
    - `coverage`, `samples_per_round=4`, `budget=50`, `jobs=1`
- Interpretation:
  - first genuinely strong cross-round grey-box model
  - much better balance than ridge/knn
  - worth full-corpus validation + blend sweeps

- Full 8-round held-out evaluation, `greybox_hazard_lowrank_v01`, `prior_blend=0.35`:
  - `36e581...`: `64.6992`
  - `71451d...`: `69.9241`
  - `76909e...`: `75.8642`
  - `8e8399...`: `81.0221`
  - `ae7800...`: `75.5373`
  - `c5cdf...`: `78.5253`
  - `f1dac...`: `57.3516`
  - `fd3c92...`: `66.5113`
  - mean round score `71.179393`
  - mean round weighted KL `0.115481`

- Low-rank prior-blend sweep on representative held-out rounds:
  - `f1dac...`
    - `0.35`: `57.3516`
    - `0.45`: `56.0437`
    - `0.55`: `54.2762`
    - `0.65`: `52.1114`
    - `0.75`: `49.6517`
  - `c5cdf...`
    - `0.35`: `78.5253`
    - `0.45`: `78.1557`
    - `0.55`: `77.2615`
    - `0.65`: `75.8803`
    - `0.75`: `74.0655`
  - `71451d...`
    - `0.35`: `69.9241`
    - `0.45`: `71.6980`
    - `0.55`: `73.2280`
    - `0.65`: `74.5468`
    - `0.75`: `75.6192`
  - `76909e...`
    - `0.35`: `75.8642`
    - `0.45`: `76.7368`
    - `0.55`: `77.3242`
    - `0.65`: `77.6497`
    - `0.75`: `77.6723`
  - `fd3c92...`
    - `0.35`: `66.5113`
    - `0.45`: `69.6132`
    - `0.55`: `72.2452`
    - `0.65`: `74.5054`
    - `0.75`: `76.4645`
- Interpretation:
  - higher prior helps easier rounds substantially
  - but it damages `f1dac...` and `c5cdf...`
  - constant prior blend alone cannot dominate everywhere

- Full 8-round rerun, `greybox_hazard_lowrank_v01`, `prior_blend=0.55`:
  - `36e581...`: `65.8168`
  - `71451d...`: `73.2280`
  - `76909e...`: `77.3242`
  - `8e8399...`: `84.9902`
  - `ae7800...`: `74.7563`
  - `c5cdf...`: `77.2615`
  - `f1dac...`: `54.2762`
  - `fd3c92...`: `72.2452`
  - mean round score `72.487302`
  - mean round weighted KL `0.109967`
- Interpretation:
  - clear gain over low-rank default
  - still not enough to beat visible old best benchmark report

- Built first hybrid model:
  - `greybox_hybrid_lowrank_queryres_v01`
  - blend `0.25 * lowrank(prior_blend=0.55) + 0.75 * query_residual(samples=1)`
  - rationale:
    - low-rank is much stronger on several easier rounds
    - `query_residual` still protects some hard/off-manifold cases
    - fixed blend already looked promising in ad hoc probes

- 5-round hybrid probe:
  - `36e581...`: `65.8363`
  - `71451d...`: `79.8373`
  - `c5cdf...`: `70.2865`
  - `f1dac...`: `55.4568`
  - `fd3c92...`: `78.8574`

- Full 8-round held-out hybrid evaluation:
  - `36e581...`: `65.836291`
  - `71451d...`: `79.837298`
  - `76909e...`: `83.512497`
  - `8e8399...`: `86.048940`
  - `ae7800...`: `79.104778`
  - `c5cdf...`: `70.286534`
  - `f1dac...`: `55.456790`
  - `fd3c92...`: `78.857417`
  - mean round score `74.867568`
  - mean round weighted KL `0.099605`
- Interpretation:
  - current best result in this session
  - beats visible old report mean `73.9505` by about `+0.9171`
  - next priority was productizing this ad hoc hybrid through normal registry / CLI / benchmark path

### 2026-03-21T10:00:00Z

- Re-read family-specific handoff sections in `instructions/agent5.md`.
- Main implications re-confirmed:
  - keep pushing teacher + tiny round regime + fast student
  - benchmark-trained query policy matters
  - once low-rank plateaus, discrete mixture and smarter online adaptation are first-class next branches

- Machine health / concurrency read:
  - early check:
    - `Mem available ~= 2.9 TiB`
    - `cores = 384`
    - only one significant competing `astar` run visible
  - later during our experiment burst:
    - `Mem available ~= 2.4 TiB`
    - load average about `45.9`
    - still large headroom
  - other active agents visibly running:
    - `hazard_posterior_*`
    - `ffam_retrieval_*`
    - `teacher_student_blend_*`
  - operating choice:
    - keep several long probes live, but not spam dozens of redundant full-benchmark jobs into an already busy machine

- Productized current best fixed hybrid through normal framework path:
  - registry / model-eval / CLI / historical-benchmark integration for:
    - `greybox_hybrid_lowrank_queryres`
  - fixed missing `QueryResidualPredictor` import bug in hybrid implementation
  - verification:
    - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `9 passed`
    - `uv run --extra dev pytest tests/test_history_datasets.py -q` -> `5 passed`
    - `uv run --extra dev pytest tests/test_teacher_student.py -q` -> `4 passed`

- Added fast experiment harness:
  - `scripts/agent5_hybrid_sweep.py`
  - purpose:
    - sweep lowrank/query-residual blend weights cheaply
    - separate `lowrank_samples_per_round` vs `residual_samples_per_round`
    - reuse one recorded transcript belief per held-out round
    - stream per-round results with flushing

- Opened policy search space without changing benchmark API:
  - `build_named_policy()` now parses:
    - `coverage`
    - `exploration`
    - `coverage_rN`
    - `exploration_rN`
  - new test:
    - `uv run --extra dev pytest tests/test_exploration_policy.py -q` -> `2 passed`

- New predictor-family branches added to codebase:
  - `greybox_gated_hybrid_v01`
    - transcript-dependent gate over:
      - `greybox_hazard_lowrank_v01`
      - `query_residual`
    - gate inputs:
      - transcript regime features
      - expert disagreement features
    - gate target:
      - best lowrank blend weight over synthetic legal transcripts on held-in rounds
  - `greybox_hazard_mixture_v01`
    - discrete regime mixture over clustered semimechanistic coefficient prototypes
    - motivated directly by handoff’s “low-rank or richer discrete-mixture regime model” branch

- Integrated new predictors into benchmark path:
  - registry / model-eval / CLI / historical benchmark / smoke tests now include:
    - `greybox_hazard_mixture`
    - `greybox_gated_hybrid`
  - verification:
    - `uv run --extra dev pytest tests/test_historical_benchmark.py -q -k greybox_regime_online_historical_benchmark_runs` -> `6 passed, 5 deselected`

- Parallel experiment program launched:
  - full 8-round fixed-weight sweeps:
    - `coverage`
    - `exploration`
  - short 4-round flushed policy probes:
    - `coverage`
    - `exploration`
    - `exploration_r3`
    - `exploration_r8`
  - direct 4-round standard-path probes:
    - `greybox_gated_hybrid`
    - `greybox_hazard_mixture`

- Partial result already informative on first 2 completed rounds of short policy probes:
  - held-out `36e581...`
    - `coverage`
      - best among tested weights so far at `lowrank_weight=0.45`
      - score `61.0651`
    - `exploration`
      - best among tested weights so far at `lowrank_weight=0.25`
      - score `60.2697`
    - interpretation:
      - `coverage` beats default `exploration`
      - this round wants materially more low-rank mass than the old fixed `0.25`
  - held-out `71451d...`
    - `coverage`
      - best among tested weights so far at `lowrank_weight=0.00`
      - score `76.3894`
    - `exploration`
      - best among tested weights so far at `lowrank_weight=0.00`
      - score `75.8661`
    - interpretation:
      - `coverage` again beats default `exploration`
      - this round wants essentially pure residual, opposite of `36e581...`

- Current scientific conclusion from partial probes:
  - policy:
    - default `exploration` does not currently look superior to `coverage`
    - richer `exploration_rN` variants still under test
  - inference:
    - fixed blend weight is clearly wrong
    - evidence already strongly favors transcript-dependent gating as the next highest-value branch
    - discrete hazard mixture remains worth testing because low-rank vs residual disagreement appears regime-structured, not random

### 2026-03-21T11:00:00Z

- Found and fixed a serious sweep-harness validation bug:
  - earlier `scripts/agent5_hybrid_sweep.py` was accidentally sweeping against `greybox_hazard_lowrank` default `prior_blend=0.35`
  - but the actual current best hybrid uses low-rank `prior_blend=0.55`
  - harness now instantiates the tuned low-rank expert directly with configurable `--lowrank-prior-blend`
  - consequence:
    - earlier sweep numbers remain useful for broad direction only
    - corrected sweeps are the ones to trust for model selection

- Sweep harness validation against standard benchmark path:
  - 2-round coverage subset `{36e581..., 71451...}`
  - corrected sweep at `lowrank_weight=0.25`:
    - mean score `67.267978`
    - mean weighted KL `0.132953`
  - direct standard benchmark for `greybox_hybrid_lowrank_queryres` on same subset:
    - mean score `67.26797838955613`
    - mean weighted KL `0.1329526785429317`
  - interpretation:
    - sweep harness is now validated for this family/config
    - can use it confidently for rapid model selection before spending more full-benchmark wall time

- Corrected 4-round sweep with tuned low-rank expert, held-out rounds `{36e581..., 71451..., c5cdf..., f1dac...}`:

- `coverage`
  - tested weights: `0.00, 0.15, 0.25, 0.35, 0.45, 0.55`
  - best:
    - `lowrank_weight=0.35`
    - mean score `68.305538`
    - mean weighted KL `0.130043`
  - interpretation:
    - coverage alone only wants a mild retune over the current fixed `0.25`

- `exploration_r3`
  - tested weights: `0.00, 0.15, 0.25, 0.35, 0.45, 0.55`
  - best:
    - `lowrank_weight=0.45`
    - mean score `69.886928`
    - mean weighted KL `0.122225`
  - interpretation:
    - materially better than corrected `coverage`
    - delta vs best corrected `coverage`: about `+1.5814` score and `-0.007818` weighted KL
    - current strongest post-fix direction is:
      - policy `exploration_r3`
      - hybrid low-rank weight `0.45`
      - low-rank prior blend `0.55`
      - residual samples `1`

- Branch triage from direct benchmark probes:
  - `greybox_gated_hybrid` on 2-round coverage subset `{36e581..., 71451...}`:
    - mean score `66.881302`
    - mean weighted KL `0.134754`
    - worse than fixed hybrid baseline on same subset (`67.267978`, `0.132953`)
    - conclusion:
      - first gating implementation is not production-ready
  - `greybox_hazard_mixture` on 4-round coverage subset `{36e581..., 71451..., c5cdf..., f1dac...}`:
    - mean score `47.513991`
    - mean weighted KL `0.277624`
    - catastrophic on `36e581...`, `71451...`, `f1dac...`
    - conclusion:
      - discrete hazard-mixture branch is currently rejected

- Productized new explicit fixed-hybrid model variant:
  - `greybox_hybrid_lowrank_queryres_w45`
  - rationale:
    - handoff requires distinct model names for materially distinct configs
    - corrected sweep selected `lowrank_weight=0.45` as current best on the 4-round probe

- Live long-running jobs now:
  - standard 4-round benchmarks still running for:
    - `greybox_hybrid_lowrank_queryres` with `policy=exploration_r3`
    - `greybox_hybrid_lowrank_queryres_w45` with `policy=exploration_r3`
  - full 8-round corrected sweep running for:
    - `policy=exploration_r3`
    - weights `{0.25, 0.45, 0.55}`

### 2026-03-21T09:20:00Z

- Re-read full grey-box handoff again, especially:
  - tiny regime manifold / maybe discrete mixture
  - direct student head / joint student
  - posterior-aware repeated-query policy
- Machine-health snapshot before scaling parallelism:
  - `Mem`: `2.9 TiB total`, `28 GiB used`, effectively all free at launch
  - later under broad multi-agent load: `494 GiB used`, `2.4 TiB available`
  - `nproc`: `384`
  - load around `48` on `384` cores while many other agents were already benchmarking
  - implication:
    - still enormous headroom
    - safe to run multiple heavy experiments in parallel
    - need monitor RAM because other agents are active, but no need to throttle hard yet

- Active machine observations:
  - multiple other agents are running serious benchmark jobs on the same host
  - examples seen in `ps`:
    - `agent1` hazard-posterior exploration benchmarks
    - `agent2` coeffbank variants
    - `agent6` summary/roundlaw decoder probes
    - `agent7` ffam retrieval exploration probes
  - decision:
    - keep parallelism moderate-high rather than maxing all cores blindly

- Added new-family experiment harness:
  - `scripts/agent5_hybrid_sweep.py`
  - purpose:
    - fit `greybox_hazard_lowrank` + `query_residual` once per held-out round
    - reuse one transcript and both expert bundles to score many convex blend weights cheaply
    - much better iteration path than re-running a full registered benchmark for every weight

- Added new-family model branches aligned with handoff:
  - `greybox_gated_hybrid_v01`
    - transcript-dependent gate over `{greybox_hazard_lowrank, query_residual}`
    - gate features:
      - transcript regime features
      - expert-disagreement features
    - gate target:
      - best convex low-rank weight per held-in synthetic transcript prefix under weighted KL
  - `greybox_hazard_mixture_v01`
    - discrete regime-mixture decoder over per-round semimechanistic coefficient fingerprints
    - clusters historical round fingerprints into a tiny set of prototypes
    - infers soft mixture weights from transcript features
    - directly tests handoff hypothesis `H6` (small discrete mixture over regime families helps)

- Quick viability checks:
  - `uv run python -m py_compile scripts/agent5_hybrid_sweep.py src/astar/student/predictor/greybox_gated_hybrid.py src/astar/student/predictor/greybox_hazard_mixture.py` passed
  - `greybox_hazard_mixture_v01` 3-round fit smoke succeeded:
    - `clusters=3`
    - `training_example_count=72`
    - `coefficient_prototypes.shape=(3, 51)`

- Parallel experiments launched:
  - standard-path full 8-round registered benchmark for `greybox_hybrid_lowrank_queryres`
  - 3-round `exploration` policy probe for the same hybrid
  - full fixed-weight hybrid sweep with `scripts/agent5_hybrid_sweep.py`
  - 3-round held-out probe for `greybox_gated_hybrid_v01`
  - 3-round held-out probe for `greybox_hazard_mixture_v01`
- Status:
  - runs in flight
  - waiting on numeric results before deciding which new branch to wire into registry/tests next

- First new-branch result back:
  - `greybox_hazard_mixture_v01` 3-round held-out probe, `cluster_count=2`, `policy=coverage`, `samples_per_round=4`
  - round scores:
    - `36e581...`: `11.5467`
    - `c5cdf...`: `81.3993`
    - `f1dac...`: `39.8258`
  - mean score: `44.2572`
  - mean weighted KL: `0.366848`
- Conclusion:
  - this first simple discrete-mixture prototype is not viable
  - confirms that a naive tiny-discrete regime family can be extremely unstable even when one round is excellent
  - reject current `greybox_hazard_mixture_v01` as a benchmark candidate

- Trusted hybrid reweighting probe:
  - used new `scripts/agent5_hybrid_sweep.py --eval-round-id ...`
  - crucially:
    - evaluated only `{36e581..., c5cdf..., f1dac...}`
    - but trained each held-out round on the full 8-round corpus minus that held-out round
    - this is much more trustworthy than the earlier tiny 3-round-only training split

- Coverage policy, full-training trusted probe:
  - `36e581...`
    - `0.00`: `64.4914`
    - `0.25`: `65.8363`
    - `0.45`: `66.4555`
    - `0.55`: `66.6075`
    - `0.65`: `66.6487`
  - `c5cdf...`
    - `0.00`: `67.0175`
    - `0.25`: `70.2865`
    - `0.45`: `72.6394`
    - `0.55`: `73.7078`
    - `0.65`: `74.6911`
  - `f1dac...`
    - `0.00`: `54.5655`
    - `0.25`: `55.4568`
    - `0.45`: `55.7925`
    - `0.55`: `55.8119`
    - `0.65`: `55.7180`
  - aggregate:
    - `0.00`: `62.0248`
    - `0.25`: `63.8599`
    - `0.45`: `64.9625`
    - `0.55`: `65.3757`
    - `0.65`: `65.6859`
    - best weighted KL also at `0.65`: `0.142659`
- Interpretation:
  - old hybrid weight `0.25` is clearly too conservative
  - heavier low-rank weight keeps helping on two of the three trusted rounds and only slightly softens `f1dac...`
  - promoted new lead config:
    - `greybox_hybrid_lowrank_queryres_v02`
    - `lowrank_weight=0.65`
    - low-rank component still uses `prior_blend=0.55`

- Exploration policy, full-training trusted probe on same 3 rounds:
  - aggregate:
    - `0.00`: `62.5658`
    - `0.25`: `64.0308`
    - `0.45`: `64.8471`
    - `0.55`: `65.1229`
    - `0.65`: `65.3011`
  - best at `0.65`, but still below coverage at the same weight (`65.3011` vs `65.6859`)
- Interpretation:
  - `exploration` is competitive, not dominant
  - current evidence says `coverage + heavier low-rank blend` is still the better lead

- Gated hybrid status:
  - partial 3-round probe showed:
    - `36e581...`: `16.9708`
    - `c5cdf...`: `81.6963`
  - run manually interrupted before final third round once it was clear the gate was extremely unstable on at least one trusted round
- Current conclusion:
  - keep `greybox_gated_hybrid_v01` as an experimental branch only
  - do not promote it ahead of fixed-weight hybrid v02 without much stronger evidence

- Validation / policy support checks:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `12 passed`
  - `uv run --extra dev pytest tests/test_exploration_policy.py -q` -> `2 passed`
  - `uv run --extra dev pytest tests/test_teacher_student.py -q` -> `4 passed`

- Branch checkpoint:
  - committed teacher/student checkpoint-load support
  - pushed safely to remote via clean detached worktree
  - remote branch head now:
    - `origin/agent5` -> `a27b90c`
  - pushed commit:
    - `a27b90c [astar] add teacher/student checkpoint loading`

### 2026-03-21T09:55:00Z

- Re-read canon + handoff again in current workspace:
  - `README.md`
  - `docs/game_facts.md`
  - full `instructions/agent5.md`
- Re-confirmed handoff gap vs current implementation:
  - current grey-box family already has:
    - semimechanistic round fingerprints
    - low-rank manifold
    - simple fixed/gated/mixture hybrids
  - still missing stronger handoff-aligned branches:
    - richer transcript-conditioned posterior over round-law fingerprints
    - stronger student-side direct online adaptation
    - faster official held-out benchmark throughput

- Current machine-health / concurrency snapshot:
  - host: `c4d-monster-01.c.ai-nm26osl-1706.internal`
  - time: `2026-03-21T09:55:07Z`
  - memory:
    - total `2.9 TiB`
    - used `704 GiB`
    - available `2.2 TiB`
  - cpu:
    - `384` cores
    - load average about `65.6 / 94.6 / 92.5`
  - competing jobs visible:
    - many `agent3` teacher-student blend probes
    - `agent7` ffam operator probes
    - others likely active but not saturating the box
  - implication:
    - still huge headroom
    - safe to run moderate-high parallelism
    - but avoid wasting memory on stale solved sweeps

- Found stale long-running agent5 sweeps still alive from earlier session state:
  - `scripts/agent5_hybrid_sweep.py --policy coverage ...`
  - `scripts/agent5_hybrid_sweep.py --policy exploration ...`
  - older exploration-only sweep
  - one inline `python3 -` helper process
- Action:
  - terminated those stale agent5 sweep processes to recover memory / cpu for new experiments

- Full 8-round corrected hybrid sweep result to trust over the earlier 3-round probe:
  - policy `coverage`
  - low-rank expert:
    - `greybox_hazard_lowrank_v01`
    - `prior_blend=0.55`
    - `samples_per_round=4`
  - residual expert:
    - `query_residual_v7`
    - `samples_per_round=1`
  - sweep weights:
    - `0.00`: mean score `74.255312`, mean weighted KL `0.102772`
    - `0.15`: mean score `74.993794`, mean weighted KL `0.098964`
    - `0.25`: mean score `75.278994`, mean weighted KL `0.097415`
    - `0.35`: mean score `75.396483`, mean weighted KL `0.096656`
    - `0.45`: mean score `75.339954`, mean weighted KL `0.096711`
    - `0.55`: mean score `75.099362`, mean weighted KL `0.097628`
    - `0.65`: mean score `74.660350`, mean weighted KL `0.099481`
  - conclusion:
    - full-8 held-out leader is **not** current `v02` weight `0.65`
    - best fixed hybrid from the full benchmark is `coverage + lowrank_weight=0.35`

- Full 8-round corrected hybrid sweep, policy `exploration`:
  - `0.00`: mean score `74.401100`, mean weighted KL `0.101998`
  - `0.15`: mean score `74.999452`, mean weighted KL `0.098962`
  - `0.25`: mean score `75.172187`, mean weighted KL `0.097995`
  - `0.35`: mean score `75.166993`, mean weighted KL `0.097856`
  - `0.45`: mean score `74.981435`, mean weighted KL `0.098559`
  - `0.55`: mean score `74.609260`, mean weighted KL `0.100143`
  - `0.65`: mean score `74.040016`, mean weighted KL `0.102672`
  - conclusion:
    - `exploration` is competitive but still below `coverage`
    - best exploration fixed hybrid is `lowrank_weight=0.25`
    - current fixed-weight lead remains coverage at `0.35`

- Immediate next branches chosen:
  - validation/process:
    - parallelize official historical benchmark over held-out rounds
    - objective: same results, much faster iteration on this machine
  - new model family work:
    - implement transcript-conditioned posterior over semimechanistic round-law fingerprints / coefficient vectors
    - rationale:
      - closer to handoff’s “tiny discrete regime + low-rank residual” than current crude cluster mixture
      - should exploit the small-round / many-transcript asymmetry directly
  - housekeeping:
    - once code is in, revisit `greybox_hybrid_lowrank_queryres` versioning/defaults so the registered lead reflects full-8 evidence rather than the narrower 3-round probe

### 2026-03-21T10:20:00Z

- Validation/throughput improvement completed:
  - `run_historical_benchmark()` now supports explicit held-out-round parallelism via `max_workers`
  - CLI exposes:
    - `--jobs`
    - `--max-workers`
  - design choice:
    - default stays serial when `max_workers=None`
    - no silent benchmark-behavior change
    - parallelism only affects throughput, not metric semantics
- Verification:
  - serial-vs-parallel historical benchmark equivalence test added
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `14 passed`
  - `uv run python -m py_compile src/astar/student/predictor/greybox_coefficient_knn.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/workflows/historical_benchmark.py src/astar/cli.py` passed
- Branch state:
  - local branch head now:
    - `305bb922 [astar] parallelize historical benchmark rounds`

- Implemented new experimental grey-box branch:
  - `greybox_coefficient_knn_v01`
- Intended idea:
  - infer transcript-conditioned posterior directly over semimechanistic coefficient vectors
  - decode through `HazardTeacher`
  - keep same online-safe prediction path:
    - historical bucket prior blend
    - exact observed-cell correction
    - probability floor
- Important correction made during implementation:
  - first draft tried to use full-map replay frames as pseudo transcripts
  - rejected/fixed immediately because that would leak non-legal information
  - final current implementation trains only from legal synthetic transcript episodes via `_load_training_rows()` / `load_synthetic_episode()`

- Early screen for the coefficient-knn idea:
  - no-code prototype using full 7-round training and trusted held-out `36e581...`
  - tested:
    - `k in {8,16,32}`
    - `prior_blend in {0.35,0.45}`
    - small coefficient-mean shrinkage variants
  - best observed on `36e581...`:
    - `k=16`
    - `shrink=0.00`
    - `prior_blend=0.45`
    - score `58.877493`
    - weighted KL `0.176808`
- Interpretation:
  - this is far below:
    - `greybox_hazard_lowrank_v01` on same round (`64.6992`)
    - current hybrid lead on same round (`66.4555` to `66.6487` depending on weight in trusted/full probes)
  - even before finishing the other held-out rounds, this effectively rules `greybox_coefficient_knn_v01` out as a near-term lead candidate
  - kept as an experimental branch only unless later evidence shows a much stronger variant

- Resource-management action:
  - terminated the longer coefficient-knn prototype after the negative first-round screen
  - reason:
    - not worth burning more compute on a branch already dominated by existing low-rank / hybrid leads

- Current lead unchanged:
  - best validated fixed hybrid remains:
    - policy `coverage`
    - low-rank weight `0.35`
    - low-rank prior blend `0.55`
  - next highest-value model work is still:
    - better online adaptation / student posterior than fixed coefficient knn
    - likely something closer to discrete+continuous regime inference or better hybrid gating that does not collapse on `36e581...`

### 2026-03-21T10:30:00Z

- Experimental branch checkpoint committed + pushed:
  - local commit:
    - `3a1f7159 [astar] add experimental coefficient knn predictor`
  - remote equivalent on `origin/agent5`:
    - `e67144d8`
- Branch contents:
  - legal-only `greybox_coefficient_knn_v01`
  - registry/eval integration
  - kept in tree as explicit experimental branch, not lead

- Promoted hybrid lead code to explicit new internal version:
  - local commit:
    - `d1118448 [astar] promote hybrid lowrank queryres v03`
  - remote equivalent on `origin/agent5`:
    - `f430efd7`
  - change:
    - `greybox_hybrid_lowrank_queryres_v03`
    - `lowrank_weight=0.35`

- Re-verified after `v03` promotion:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `15 passed in 46.29s`

- Official full 8-round benchmark for the promoted lead:
  - command path:
    - `run_historical_benchmark(... model_name='greybox_hybrid_lowrank_queryres', mode='online_interactive', policy_name='coverage', samples_per_round=4, budget=50, episode_seed=0, max_workers=8, benchmark_name='agent5_hybrid_lowrank_queryres_online50_v03')`
  - artifact:
    - `data/artifacts/benchmarks/agent5_hybrid_lowrank_queryres_online50_v03/result.json`
  - report summary:
    - mean score `74.942088`
    - mean weighted KL `0.099138`
    - total runtime `417.087s`
    - summed eval runtime `3146.226s`
  - round means:
    - `36e581...`: `66.1974`
    - `71451d...`: `79.3881`
    - `76909e...`: `83.1980`
    - `8e8399...`: `86.3316`
    - `ae7800...`: `78.8787`
    - `c5cdf...`: `71.4961`
    - `f1dac...`: `55.6710`
    - `fd3c92...`: `78.3757`

- Interpretation:
  - official benchmark still beats the visible old report:
    - `74.9421` vs `73.9505`
    - delta about `+0.9916`
  - also edges the earlier fixed hybrid session result:
    - `74.9421` vs `74.8676`
    - delta about `+0.0745`
  - but it is lower than the earlier sweep estimate (`75.3965`)
    - gap about `-0.4544`
  - conclusion:
    - sweep harness remains useful for search/ranking candidate regions
    - official historical benchmark remains the canonical model-selection metric
    - current practical lead is still `greybox_hybrid_lowrank_queryres_v03`, but with less margin than the sweep had suggested

### 2026-03-21T12:35:00Z

- Re-read `instructions/agent5.md` again with focus on the next unexhausted branch:
  - Phase 8 legal online student
  - Phase 9 query policy implications
  - hypotheses `H8`, `H9`, `H10`
- Current read from the handoff:
  - `H6` cluster-family work now looks exhausted / rejected here
  - the biggest remaining mismatch between handoff and current code is:
    - preferred repeat-aware set-style student encoder
    - explicit direct tensor head beyond posterior-only inference
- Current code audit:
  - `greybox_student_joint_v02` is only:
    - transcript-summary features
    - linear ridge map
    - low-rank residual basis
  - it is **not** really a repeat-aware set encoder
  - `src/astar/student/posterior/deepset_student.py` is also not a real deepset stack:
    - it is a small summary-vector kNN bank
- Machine / shared-box check before launching more work:
  - `uptime`:
    - load about `34.1 / 39.5 / 46.3` on `384` cores
  - `free -h`:
    - RAM about `1.8 TiB free`, `1.9 TiB available`
  - notable active jobs:
    - `agent6` summary-rate decoder runs
    - `agent2` coeffbank full-8 coverage run
    - `agent7` `ffam_mode_v17` exploration sweeps
    - `agent3` transcript-memory targeted holdout runs
  - conclusion:
    - large headroom still available
    - safe to run several heavy local probes in parallel after implementation
- New implementation decision:
  - pivot to a stronger **repeat-aware direct student head**
  - target model family:
    - `greybox_student_joint_repeataware_*`
  - design goal:
    - keep the strong low-rank grey-box teacher path
    - add an explicit direct tensor correction head trained on legal synthetic transcripts
    - encode transcript windows in an order-invariant / repeat-aware way rather than only coarse aggregate stats
    - allow nonlinear memory retrieval rather than only one global ridge map
- Expected immediate work:
  - implement repeat-aware transcript feature encoder
  - implement a direct residual-memory / local-neighbor student head
  - wire model into registry / benchmark / tests
  - run hard-slice sweeps first

### 2026-03-21T12:58:00Z

- Implemented new Phase-8/9-aligned branch:
  - `greybox_student_joint_repeataware`
  - file:
    - `src/astar/student/predictor/greybox_student_joint_repeataware.py`
- Core model design:
  - keep `greybox_hazard_lowrank` as the structural grey-box backbone
  - add a **repeat-aware direct tensor head**
  - training targets stay:
    - final tensor logit residuals vs corrected low-rank baseline
  - encoder additions vs old `greybox_student_joint_v02`:
    - exact-count / repeated-cell summary features
    - repeated-window-group features from legal transcript windows
    - nonlinear memory bank over transcript feature vectors
  - prediction head:
    - global ridge coordinates
    - plus kNN memory coordinates
    - blended before decoding residual low-rank tensor correction
- Important implementation choices:
  - repeat-aware features compare observed window statistics against the **uncorrected** low-rank structural prediction
    - reason:
      - if compared only against the exact-cell-corrected baseline, observed-window residual signal would collapse toward zero
  - final output still preserves:
    - low-rank grey-box base
    - exact observed-cell correction
    - probability floor
- New sweep harness added:
  - `scripts/agent5_student_joint_repeataware_sweep.py`
  - validation protocol:
    - strict held-out-round evaluation
    - training universe = all selected rounds except the held-out round
    - allows cheaper targeted probes on the hard slice without the misleading 3-round-only training trap
- Registry / framework integration completed:
  - `src/astar/student/predictor/interactive.py`
  - `src/astar/workflows/model_eval.py`
  - `src/astar/workflows/historical_benchmark.py`
  - `src/astar/cli.py`
  - `tests/test_historical_benchmark.py`
- Validation:
  - `uv run python -m py_compile src/astar/student/predictor/greybox_student_joint_repeataware.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - first pytest run caught a real bug:
    - zero-feature fallback width for empty window-group features was wrong
    - fixed immediately
  - re-verify:
    - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
    - `24 passed in 73.98s`
- Resource-management action:
  - identified stale orphaned local jobs:
    - PIDs `2257190..2257194`
    - old `agent5_bayesfamily_anchor55_full8_sweep_v01` workers
  - killed them to free CPU before new sweeps
- Machine state right before new batch:
  - load about `24.3 / 29.8 / 38.1` on `384` cores
  - RAM about `1.9 TiB free`, `2.0 TiB available`
  - notable other-agent work now includes transcript-memory / sequence-memory targeted probes from `agent3`
- Single-config strict sanity probe completed:
  - command:
    - `uv run python scripts/agent5_student_joint_repeataware_sweep.py --policy coverage --budget 50 --episode-seed 0 --eval-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --samples-per-round 4 --residual-rank 4 --ridge-lambda 12 --k-neighbors 24 --memory-weight 0.45 --correction-blend 0.35 --correction-scale 0.40 --max-workers 1`
  - result:
    - `36e581...` score `66.446831`
    - weighted KL `0.136366`
    - runtime `456.469s`
  - interpretation:
    - close to the old conservative `greybox_student_joint` on `36e581...`
    - good enough to justify a wider hard-slice batch
    - not yet evidence of a lead
- First strict hard-slice batch launched with BLAS thread caps:
  - eval rounds:
    - `36e581...`
    - `c5cdf...`
    - `f1dac...`
  - logs / sessions:
    - coverage, `rank=4 k=24 mw=0.00 blend=0.35 scale=0.40`
      - log `data/artifacts/benchmarks/agent5_student_joint_repeataware_probe3_cov_r4_k24_mw000_b35_s40_v01.log`
      - session `12032`
    - coverage, `rank=4 k=16 mw=0.25 blend=0.35 scale=0.40`
      - log `data/artifacts/benchmarks/agent5_student_joint_repeataware_probe3_cov_r4_k16_mw025_b35_s40_v01.log`
      - session `81998`
    - coverage, `rank=4 k=24 mw=0.45 blend=0.35 scale=0.40`
      - log `data/artifacts/benchmarks/agent5_student_joint_repeataware_probe3_cov_r4_k24_mw045_b35_s40_v01.log`
      - session `75171`
    - coverage, `rank=6 k=24 mw=0.45 blend=0.35 scale=0.40`
      - log `data/artifacts/benchmarks/agent5_student_joint_repeataware_probe3_cov_r6_k24_mw045_b35_s40_v01.log`
      - session `6608`
    - exploration_r3, `rank=4 k=24 mw=0.00 blend=0.35 scale=0.40`
      - log `data/artifacts/benchmarks/agent5_student_joint_repeataware_probe3_explr3_r4_k24_mw000_b35_s40_v01.log`
      - session `19574`
    - exploration_r3, `rank=4 k=16 mw=0.25 blend=0.35 scale=0.40`
      - log `data/artifacts/benchmarks/agent5_student_joint_repeataware_probe3_explr3_r4_k16_mw025_b35_s40_v01.log`
      - session `70209`
    - exploration_r3, `rank=4 k=24 mw=0.45 blend=0.35 scale=0.40`
      - log `data/artifacts/benchmarks/agent5_student_joint_repeataware_probe3_explr3_r4_k24_mw045_b35_s40_v01.log`
      - session `89996`
    - exploration_r3, `rank=6 k=24 mw=0.45 blend=0.35 scale=0.40`
      - log `data/artifacts/benchmarks/agent5_student_joint_repeataware_probe3_explr3_r6_k24_mw045_b35_s40_v01.log`
      - session `50699`

### 2026-03-21T13:06:00Z

- First strict 8-config hard-slice batch finished.
- Coverage results:
  - `rank=4 k=24 mw=0.00`
    - mean `67.246478`
    - KL `0.134897`
  - `rank=4 k=16 mw=0.25`
    - mean `67.410715`
    - KL `0.134065`
  - `rank=4 k=24 mw=0.45`
    - mean `67.474243`
    - KL `0.133753`
  - `rank=6 k=24 mw=0.45`
    - mean `67.483458`
    - KL `0.133713`
- Exploration_r3 results:
  - `rank=4 k=24 mw=0.00`
    - mean `67.535734`
    - KL `0.133288`
  - `rank=4 k=16 mw=0.25`
    - mean `67.774937`
    - KL `0.132050`
  - `rank=4 k=24 mw=0.45`
    - mean `67.905572`
    - KL `0.131372`
  - `rank=6 k=24 mw=0.45`
    - mean `67.917127`
    - KL `0.131326`
- Per-round shape of the best hard-slice config:
  - policy `exploration_r3`
  - `rank=6 k=24 mw=0.45 blend=0.35 scale=0.40`
  - results:
    - `36e581...` `66.933536`
    - `c5cdf...` `78.032411`
    - `f1dac...` `58.785433`
- Interpretation:
  - repeat-aware memory helps consistently:
    - `mw=0.45` > `mw=0.25` > `mw=0.00`
  - `exploration_r3` dominates `coverage` for this branch
  - `rank=6` gives a small but real edge over `rank=4`
  - this branch beats the previous `greybox_student_joint` hard-slice best here:
    - old best mean `67.0777`
    - new best mean `67.9171`
    - delta about `+0.8394`
  - enough signal to justify official full-8 evaluation
- Promoted defaults for the branch:
  - `greybox_student_joint_repeataware_v02`
  - changed default `residual_rank` from `4` to `6`
- Re-validation after default promotion:
  - `uv run python -m py_compile src/astar/student/predictor/greybox_student_joint_repeataware.py`
    - passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
    - `24 passed in 105.67s`

### 2026-03-21T13:36:00Z

- Official full-8 benchmark finished for the promoted default:
  - command:
    - `uv run astar run-historical-benchmark --model greybox_student_joint_repeataware --mode online_interactive --policy exploration_r3 --samples-per-round 4 --budget 50 --episode-seed 0 --with-png none --jobs 8 --name agent5_student_joint_repeataware_explorationr3_online50_v02`
  - artifact dir:
    - `data/artifacts/benchmarks/agent5_student_joint_repeataware_explorationr3_online50_v02/`
  - report:
    - `data/artifacts/benchmarks/agent5_student_joint_repeataware_explorationr3_online50_v02/report.md`
  - summary:
    - mean score `73.0190`
    - mean weighted KL `0.107172`
    - total runtime `485.449s`
    - eval runtime `3812.939s`
- Official full-8 interpretation:
  - this branch is **well below** the current overall lead:
    - `73.0190` vs `75.1931`
    - gap about `-2.1741`
  - biggest persistent weakness remains `f1dac...`
    - round mean `58.7854`
  - also weak on `ae7800...` and `fd3c92...`
  - conclusion:
    - hard-slice gains did not translate enough to full 8-round robustness
    - `greybox_student_joint_repeataware_v02` is not a promotion candidate over the current lead
- Exploration_r3 refinement batch around the best hard-slice point:
  - `rank=6 k=24 mw=0.65 scale=0.40`
    - mean `68.046558`
    - KL `0.130674`
  - `rank=6 k=48 mw=0.45 scale=0.40`
    - mean `67.779001`
    - KL `0.132065`
  - `rank=6 k=24 mw=0.45 scale=0.50`
    - mean `67.966977`
    - KL `0.130998`
  - `rank=6 k=24 mw=0.65 scale=0.50`
    - mean `68.149171`
    - KL `0.130078`
- Refinement interpretation:
  - stronger correction scale helps:
    - `scale=0.50` > `scale=0.40`
  - more memory weight still helps on the hard slice:
    - `mw=0.65` > `mw=0.45`
  - larger neighbor count hurts:
    - `k=48` < `k=24`
  - new best hard-slice point for this family:
    - policy `exploration_r3`
    - `rank=6 k=24 mw=0.65 blend=0.35 scale=0.50`
    - mean `68.149171`
    - KL `0.130078`
- However:
  - that gain over the already-tested default is only about `+0.2320` on the hard slice
  - given the official full-8 gap to lead is about `2.17`, this does **not** justify another immediate official full-8 rerun ahead of trying a more different branch
- Current state:
  - repeat-aware joint student branch is a real improvement over old `greybox_student_joint`
  - but still rejected as the global lead family here
  - current overall lead remains:
    - `greybox_hybrid_lowrank_queryres`
    - `policy=exploration_r3`
    - mean `75.1931`

### 2026-03-21T13:58:00Z

- Re-read handoff around Phases 8-10 and concrete hypotheses `H8-H10`.
- Important correction to direction:
  - the handoff does **not** say to keep spending most effort on `query_residual`
  - it explicitly says:
    - H9: direct/joint student head is useful only if it wins held-out rounds
    - H10: repeated diagnostic queries vs simple coverage under a strong student is a first-class branch
- Given current evidence:
  - repeat-aware joint student improved but still landed only `73.0190`
  - more local tuning there looks lower EV than a new H10 branch
- Machine / cluster state checked before launching more work:
  - load avg about `113 / 139 / 101`
  - memory:
    - `2.9 TiB` total
    - `1.8 TiB` used
    - `732 GiB` free
    - `1.1 TiB` available
  - major active workloads seen:
    - huge `ainm` behavioral fingerprint / replay EDA jobs
    - agent6 benchmark on `f1_summary_rate_residual_lawbank_collapse_portsplit_teacher_dyn_v01`
    - agent2 full `smh_coeffbank...`
    - agent7 `ffam_mode_v17` exploration-hybrid policies
    - agent3 targeted holdout sweeps
- Parallelism read:
  - plenty of RAM headroom remains
  - CPU is busy, so I should avoid wasteful giant fan-out until the next branch compiles and passes tests
- New branch selected:
  - predictor-aware H10 policy learning
  - goal:
    - build a policy that uses current model predictions plus observed transcript disagreement to decide whether to keep covering or repeat a diagnostic window
  - key compatibility constraint:
    - `policy_name` is also used inside synthetic dataset generation / student checkpoint fitting
    - so the policy implementation must still work when no predictor object is available
    - therefore the design must support:
      - predictor-aware mode during online benchmark
      - deterministic heuristic fallback during synthetic episode generation / CLI paths

### 2026-03-21T14:10:00Z

- Implemented new predictor-aware H10 policy family:
  - file:
    - `src/astar/policy/predictive_repeat.py`
  - new policy names:
    - `postinfo_rN`
    - `scoregain_rN`
- Design:
  - unseen-window ranking:
    - motif score
    - current predicted window entropy
    - predicted dynamic-class mass
  - repeat-window ranking:
    - same predictive uncertainty
    - empirical-vs-predicted local discrepancy on repeated windows
    - empirical local entropy from repeated observations
    - light settlement-density term
    - explicit repeat penalty
  - `postinfo_*`:
    - more conservative / uncertainty-led
  - `scoregain_*`:
    - more aggressive / discrepancy-led
- Critical compatibility rule satisfied:
  - policy works in two modes:
    - predictor-aware runtime mode
    - no-predictor heuristic fallback mode
- Runtime plumbing added:
  - `src/astar/policy/interactive.py`
    - `build_interactive_policy(..., predictor=None)`
  - `src/astar/workflows/model_eval.py`
    - online historical benchmark now passes the built predictor into the policy
  - `src/astar/cli.py`
    - `run-synthetic-tournament`
    - `run-synthetic-benchmark`
    - `run-live-online`
    - all now reuse one built predictor and pass it into the policy
- Important validation improvement:
  - existing historical benchmark couples:
    - predictor training policy
    - evaluation policy
  - for H10 that is the wrong scientific comparison because policy changes should be tested under an identical student stack
  - added dedicated fixed-stack sweep harness:
    - `scripts/agent5_policy_eval_sweep.py`
  - it:
    - trains / loads predictor using one fixed `fit_policy`
    - sweeps only `eval_policy`
    - reports score / KL / executed query counts by held-out round
  - this is a stricter and more correct H10 validation protocol
- Validation after implementation:
  - `uv run python -m py_compile src/astar/policy/predictive_repeat.py src/astar/policy/interactive.py src/astar/workflows/model_eval.py scripts/agent5_policy_eval_sweep.py tests/test_online_episode.py tests/test_history_datasets.py tests/test_historical_benchmark.py`
    - passed
  - `uv run --extra dev pytest tests/test_online_episode.py tests/test_history_datasets.py tests/test_historical_benchmark.py -q`
    - `33 passed`
  - `uv run python -m py_compile src/astar/cli.py src/astar/workflows/synthetic_benchmark.py src/astar/workflows/synthetic_tournament.py src/astar/workflows/live_online.py`
    - passed
  - `uv run --extra dev pytest tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
    - `3 passed`
- Next immediate work:
  - run fixed-stack hard-slice policy sweeps on strong nontrivial predictors
  - start with:
    - `greybox_student_joint_repeataware`
    - `greybox_hazard_lowrank`
  - compare:
    - `coverage`
    - `exploration_r3`
    - `adaptive_r5`
    - `postinfo_r3`
    - `postinfo_r5`
    - `scoregain_r3`
    - `scoregain_r5`

### 2026-03-21T14:13:00Z

- Launched first fixed-stack H10 sweep batch on hard slice `{36e581..., c5cdf..., f1dac...}`.
- Common protocol:
  - budget `50`
  - episode seed `0`
  - eval policies:
    - `coverage`
    - `exploration_r3`
    - `adaptive_r5`
    - `postinfo_r3`
    - `postinfo_r5`
    - `scoregain_r3`
    - `scoregain_r5`
  - script:
    - `scripts/agent5_policy_eval_sweep.py`
- Jobs:
  - model `greybox_student_joint_repeataware`, fit-policy `exploration_r3`
    - log `data/artifacts/benchmarks/agent5_policyeval_studentjoint_repeataware_fitexplr3_probe3_v01.log`
    - session `52278`
  - model `greybox_student_joint_repeataware`, fit-policy `coverage`
    - log `data/artifacts/benchmarks/agent5_policyeval_studentjoint_repeataware_fitcoverage_probe3_v01.log`
    - session `30149`
  - model `greybox_hazard_lowrank`, fit-policy `exploration_r3`
    - log `data/artifacts/benchmarks/agent5_policyeval_hazardlowrank_fitexplr3_probe3_v01.log`
    - session `43360`
- Added one more because shared load stayed low after launch:
  - model `greybox_hazard_lowrank`, fit-policy `coverage`
    - log `data/artifacts/benchmarks/agent5_policyeval_hazardlowrank_fitcoverage_probe3_v01.log`
    - session `35124`
- Parallelism choice:
  - each sweep uses `--max-workers 3`
  - total extra concurrency kept moderate because the shared box already has heavy global CPU load

### 2026-03-21T14:17:00Z

- Verified the new fixed-stack sweep harness itself with a fast foreground smoke:
  - command:
    - `uv run python scripts/agent5_policy_eval_sweep.py --model historical_bucket_prior --fit-policy coverage --eval-policy coverage --eval-policy postinfo_r3 --eval-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --samples-per-round 1 --budget 4 --episode-seed 0 --max-workers 1`
  - result:
    - `coverage`: score `53.868069`, KL `0.206495`
    - `postinfo_r3`: score `53.868069`, KL `0.206495`
  - interpretation:
    - expected and good
    - for a predictor that ignores transcript evidence, changing eval policy should not move the score
    - this confirms the harness is measuring policy effects rather than accidentally changing predictor training/config

### 2026-03-21T14:24:00Z

- Committed implementation checkpoint:
  - local commit:
    - `e992715d` `[astar] add predictor-aware H10 policy sweep`
- Pushed to remote `origin/agent5`.
- Because local `agent5` history had diverged from remote-sha equivalents, direct push was rejected.
- Safe push procedure used:
  - fetched `origin/agent5`
  - created temporary worktree at `/tmp/agent5_push_h10_61TZyr`
  - cherry-picked the new H10 commit on top of remote tip
  - resolved one cherry-pick conflict in `src/astar/cli.py`
  - pushed detached-head result back to `origin/agent5`
- Remote push result:
  - remote advanced from `eb2f8129` to `aba6e521`
  - this is the pushed remote equivalent of the local H10 implementation commit

### 2026-03-21T14:26:00Z

- Added a faster directional scout while the 3-round batches run:
  - model `greybox_hazard_lowrank`
  - fit-policy `exploration_r3`
  - eval round `f1dac...` only
  - eval policies:
    - `coverage`
    - `postinfo_r5`
    - `scoregain_r5`
  - log:
    - `data/artifacts/benchmarks/agent5_policyeval_hazardlowrank_fitexplr3_f1quick_v01.log`
  - session:
    - `24149`
  - purpose:
    - get earlier read on whether the new H10 policies help or hurt the hardest round before the larger sweep finishes

### 2026-03-21T14:34:00Z

- First real H10 win landed from the fast scout:
  - log:
    - `data/artifacts/benchmarks/agent5_policyeval_hazardlowrank_fitexplr3_f1quick_v01.log`
  - protocol:
    - model `greybox_hazard_lowrank`
    - fixed fit-policy `exploration_r3`
    - held-out round `f1dac...`
    - eval policies:
      - `coverage`
      - `postinfo_r5`
      - `scoregain_r5`
  - result:
    - `coverage`
      - executed queries `45`
      - score `54.823086`
      - KL `0.200507`
    - `postinfo_r5`
      - executed queries `50`
      - score `56.561333`
      - KL `0.190155`
      - delta vs coverage `+1.738247`
    - `scoregain_r5`
      - executed queries `50`
      - score `57.059999`
      - KL `0.187208`
      - delta vs coverage `+2.236913`
- Interpretation:
  - this is exactly the kind of evidence H10 was asking for
  - on the hardest round, predictor-aware repeated diagnostics appear materially better than plain coverage under a fixed nontrivial predictor stack
  - `scoregain_r5` is currently the lead policy variant among the new family
- Immediate follow-up:
  - launched second fast scout to check for collateral damage on a stronger round:
    - model `greybox_hazard_lowrank`
    - fit-policy `exploration_r3`
    - held-out round `c5cdf...`
    - eval policies:
      - `coverage`
      - `postinfo_r5`
      - `scoregain_r5`
    - log:
      - `data/artifacts/benchmarks/agent5_policyeval_hazardlowrank_fitexplr3_c5quick_v01.log`
    - session:
      - `41645`

### 2026-03-21T14:41:00Z

- Full 3-round hazard-lowrank sweeps finished.
- Fixed fit-policy `exploration_r3`:
  - log:
    - `data/artifacts/benchmarks/agent5_policyeval_hazardlowrank_fitexplr3_probe3_v01.log`
  - ranking:
    - `exploration_r3` `67.597100`
    - `scoregain_r5` `66.994710`
    - `adaptive_r5` `66.750926`
    - `postinfo_r5` `66.665429`
    - `coverage` `66.361502`
  - read:
    - new H10 variants beat plain `coverage`
    - but they still lose to existing `exploration_r3`
- Fixed fit-policy `coverage`:
  - log:
    - `data/artifacts/benchmarks/agent5_policyeval_hazardlowrank_fitcoverage_probe3_v01.log`
  - ranking:
    - `adaptive_r5` `67.024982`
    - `exploration_r3` `66.972997`
    - `coverage` `66.858707`
    - `scoregain_r5` `66.819979`
    - `postinfo_r3` `66.794100`
  - read:
    - again, the new H10 variants are competitive but not winning
- Important corrected interpretation:
  - the earlier `f1dac` scout was only a win vs `coverage`
  - against the stronger existing repeated-diagnostic baseline `exploration_r3`, the first H10 variants are still behind
- Therefore current next move is not to promote `scoregain_r5` as-is.
- New hypothesis from the evidence:
  - the failure mode is likely **not enough early repeats**
  - `exploration_r3` may still win because it probes repeated diagnostics earlier
- Implemented new variants in response:
  - `postinfo_probe_rN`
  - `scoregain_probe_rN`
  - change:
    - allow repeat scoring immediately after the first diagnostic hits instead of waiting
    - slightly stronger repeat bias / discrepancy emphasis
- Validation after adding probe variants:
  - `uv run python -m py_compile src/astar/policy/predictive_repeat.py src/astar/policy/interactive.py`
    - passed
  - `uv run --extra dev pytest tests/test_online_episode.py -q`
    - `2 passed`
- Actions:
  - killed redundant `c5quick` scout after the full 3-round hazard log already supplied that row
  - launched new decisive scout:
    - model `greybox_hazard_lowrank`
    - fit-policy `exploration_r3`
    - held-out round `f1dac...`
    - eval policies:
      - `exploration_r3`
      - `scoregain_r5`
      - `scoregain_probe_r5`
      - `postinfo_probe_r5`
    - log:
      - `data/artifacts/benchmarks/agent5_policyeval_hazardlowrank_fitexplr3_f1probe_v01.log`
    - session:
      - `56022`

### 2026-03-21T14:45:00Z

- Both 3-round `greybox_student_joint_repeataware` fixed-stack sweeps finished.
- Fit-policy `exploration_r3`:
  - log:
    - `data/artifacts/benchmarks/agent5_policyeval_studentjoint_repeataware_fitexplr3_probe3_v01.log`
  - ranking:
    - `exploration_r3` `67.917127`
    - `postinfo_r3` `67.784857`
    - `adaptive_r5` `67.627767`
    - `scoregain_r3` `67.540597`
    - `scoregain_r5` `67.379483`
    - `postinfo_r5` `67.247199`
    - `coverage` `67.236816`
  - read:
    - first H10 variants are competitive
    - but still not beating `exploration_r3`
    - closest is `postinfo_r3`, gap about `-0.1323`
- Fit-policy `coverage`:
  - log:
    - `data/artifacts/benchmarks/agent5_policyeval_studentjoint_repeataware_fitcoverage_probe3_v01.log`
  - ranking:
    - `adaptive_r5` `67.833378`
    - `exploration_r3` `67.532316`
    - `coverage` `67.483458`
    - `scoregain_r3` `67.306240`
    - `postinfo_r3` `67.213218`
    - `postinfo_r5` `66.732298`
    - `scoregain_r5` `66.653172`
  - read:
    - existing repeat policies still dominate
    - new H10 variants not yet ready for promotion on this stronger student either
- Combined current evidence:
  - predictor-aware H10 family has real signal
  - but the first implementation is mostly improving over plain `coverage`, not over the best existing repeated-diagnostic baselines
  - likely missing piece:
    - earlier repeated probes / more exploration-like front-loading
- This is why the current live scout is now focused on:
  - `scoregain_probe_r5`
  - `postinfo_probe_r5`
  - versus `exploration_r3` on `f1dac...`

### 2026-03-21T14:53:00Z

- `f1probe` scout finished:
  - log:
    - `data/artifacts/benchmarks/agent5_policyeval_hazardlowrank_fitexplr3_f1probe_v01.log`
  - protocol:
    - model `greybox_hazard_lowrank`
    - fixed fit-policy `exploration_r3`
    - held-out round `f1dac...`
    - eval policies:
      - `exploration_r3`
      - `scoregain_r5`
      - `scoregain_probe_r5`
      - `postinfo_probe_r5`
  - result:
    - `exploration_r3`
      - score `59.045095`
      - KL `0.175777`
    - `scoregain_r5`
      - score `57.059999`
      - KL `0.187208`
    - `scoregain_probe_r5`
      - score `57.764627`
      - KL `0.183111`
    - `postinfo_probe_r5`
      - score `56.437174`
      - KL `0.190915`
- Interpretation:
  - early repeats do help:
    - `scoregain_probe_r5` > `scoregain_r5`
    - delta about `+0.7046`
  - but the gap to `exploration_r3` on `f1dac...` is still large:
    - about `-1.2805`
  - so this probe-first correction moves in the right direction but is **not enough**
- Practical conclusion:
  - H10 current branch is scientifically useful and nontrivial
  - but still rejected as a promotion candidate over the best existing repeat baselines
  - especially:
    - `exploration_r3` remains stronger than all tested new H10 variants under the fixed stacks tested here
- Current best findings from this H10 cycle:
  - on `greybox_hazard_lowrank`:
    - fixed fit-policy `exploration_r3`
    - best eval policy remains `exploration_r3`
    - mean `67.597100`
  - on `greybox_student_joint_repeataware`:
    - fixed fit-policy `exploration_r3`
    - best eval policy remains `exploration_r3`
    - mean `67.917127`
  - closest new challenger:
    - `postinfo_r3` on `greybox_student_joint_repeataware` with fit-policy `exploration_r3`
    - mean `67.784857`
    - still below by about `-0.1323`
- Next pivot implication:
  - stop spending more cycles on minor H10 policy tweaks for now
  - if returning later, it should be with a more radical policy-learning setup, not another small heuristic retune

### 2026-03-21T15:05:00Z

- **RADICAL NEW DIRECTION: Cell-level kNN + Observation-Validated Ensemble**
- Re-read full handoff and analyzed the fundamental limitations of current approach:
  - Current hazard teacher compresses each round to only 51 logistic regression coefficients
  - This loses enormous per-cell spatial information from the replays
  - The low-rank manifold further compresses to ~3 dimensions
  - Ground truth terminal probs are 40×40×6 = 9600 values per seed
- Implemented three new fundamentally different predictors:

#### 1. `greybox_cellknn_v01` — Cell-level kNN with full replay terminal probs
- file: `src/astar/student/predictor/greybox_cellknn.py`
- Uses per-cell terminal probability maps from replays directly (40×40×6 per seed)
- Matches cells via feature-space similarity using 13 spatial features
- Round identification via cell-level multinomial likelihood weighting
- Spatial propagation from observed to unobserved cells via Gaussian smoothing
- Uses batched numpy distance computation (no scipy needed)

#### 2. `greybox_roundmatch_v01` — Round-weighted terminal probability transfer
- file: `src/astar/student/predictor/greybox_roundmatch.py`
- Bayesian posterior over training rounds from observed cell likelihoods
- Map fingerprint similarity for cross-seed matching
- Direct weighted average of full-resolution terminal prob maps

#### 3. `greybox_obsval_ensemble_v01` — Observation-validated ensemble
- file: `src/astar/student/predictor/greybox_obsval_ensemble.py`
- Runs both cellknn and hybrid_lowrank_queryres
- Per-cell weighting based on which model's predictions better match actual observations
- Sigmoid gating with spatial smoothing of the observation match score
- Designed to capture: cellknn's strength on unusual rounds + hybrid's strength on typical rounds

- All three integrated into:
  - predictor registry / online path
  - historical benchmark transcript-model allowlist
  - model_eval historical eval path
  - CLI model choices
  - test smoke matrix

- Validation:
  - `uv run python -m py_compile` — all passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q -k "greybox_cellknn or greybox_roundmatch or greybox_obsval_ensemble"` — 3 passed

- Initial 3-round hard-slice results:

| Model | 36e581 | c5cdf | f1dac | Mean |
|-------|--------|-------|-------|------|
| **existing best** | ~66 | ~78 | ~57 | ~67 |
| `greybox_cellknn_v01` | 43.28 | 71.93 | **76.59** | 63.93 |
| `greybox_roundmatch_v01` | 35.45 | ~46 | ~42 | 41.07 |

- **KEY FINDING**: cellknn gets **76.59 on f1dac** (the hardest round), which is +19.6 points better than the existing best (~57)
- cellknn is catastrophic on 36e581 (43.28 vs ~66), meaning it loses on typical rounds
- roundmatch is rejected — map differences between rounds make direct position-level transfer broken

- Launched parallel benchmarks:
  - `agent5_obsval_ensemble_coverage_probe3_v01` — ensemble with coverage policy
  - `agent5_obsval_ensemble_explr3_probe3_v01` — ensemble with exploration_r3 policy
  - `agent5_cellknn_coverage_full8_v01` — full 8-round cellknn evaluation

### 2026-03-21T15:25:00Z

- Full 8-round cellknn results (pooled version):
  - mean score `63.50`
  - f1dac score `57.09` — **collapsed from 76.59 in 3-round probe to 57 in full 8**
  - root cause: with 7 training rounds, cells from dissimilar rounds dilute the kNN signal
  - confirmed: cellknn with 2 training rounds → 76.59 on f1dac; with 7 → 57.09

- Observation-validated ensemble results:
  - `coverage`: mean `65.58` — too much cellknn weight on 36e581
  - `exploration_r3`: mean `67.20` — same problem
  - rejected: observation-match weighting is too noisy to discriminate models

- Implemented `greybox_cellknn_perround_v01`:
  - file: `src/astar/student/predictor/greybox_cellknn_perround.py`
  - fixes: builds SEPARATE kNN per training round, averages with round posterior weights
  - result: mean `71.90` (explr3), f1dac `64.82` — better but still below existing best
  - also fixed bug: round weights now computed from kNN predictions, not raw position-level terminal probs

- **KEY RESULT — Stacked QR+CellKNN predictor:**
  - file: `src/astar/student/predictor/greybox_stacked_v01.py`
  - design: blends query_residual and cellknn_perround in logit space with configurable weight
  - `stacked_explr3_full8_v01` (weight=0.50):
    - mean score `75.12` — **essentially tied with existing best 75.19**
    - f1dac `66.95` — **+9.55 points vs existing best's 57.40**
    - 36e581 `64.20` — -2.0 vs existing
    - trades small losses on easy rounds for massive f1dac gain

- Comparison table (exploration_r3, full 8 rounds):

  | Model | Mean | f1dac | 36e581 | Best round |
  |-------|------|-------|--------|------------|
  | existing best | 75.19 | 57.40 | 66.20 | 86.17 |
  | stacked w50 | 75.12 | **66.95** | 64.20 | 83.13 |

- Current weight sweep running:
  - `greybox_stacked_w15` (weight=0.15)
  - `greybox_stacked_w25` (weight=0.25)
  - `greybox_stacked_w35` (weight=0.35)
  - purpose: find optimal blend weight that preserves easy-round strength while keeping f1dac improvement

### 2026-03-21T15:45:00Z

- Fixed round weight computation bug in cellknn_perround
- Result: cellknn_perround_v2 unchanged at 71.90 (round weighting wasn't the main issue)
- Stacked weight sweep could not run via CLI (CLI uses fixed choice list, not prefix matching)
- Added prefix matching for model names in interactive/model_eval/historical_benchmark
- Running prior-only weight sweep via Python for weights {0.0, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60}

- **Critical insight about f1dac**:
  - Ground truth shows settlement prob = 0.002 (nearly zero)
  - Compare: 36e581 has settlement prob = 0.131
  - f1dac is an extremely hostile regime where virtually all settlements die
  - The hazard teacher can't model "everything dies" because it focuses on WHERE things happen
  - CellKNN naturally captures this because most training cells are empty/forest too

- **Current best result summary** (full 8-round, exploration_r3):

  | Model | Mean | f1dac | 36e581 | Range |
  |-------|------|-------|--------|-------|
  | hybrid_lowrank_queryres (CURRENT BEST) | **75.19** | 57.40 | **66.20** | 57-86 |
  | stacked QR+CellKNN w50 | **75.12** | **66.95** | 64.20 | 64-83 |
  | cellknn_perround | 71.90 | 64.82 | 60.57 | 60-79 |
  | cellknn pooled | 63.50 | 57.09 | 56.87 | 57-73 |

- The stacked model is the most promising direction because:
  - Nearly tied on mean (75.12 vs 75.19)
  - Dramatically better on hardest round (+9.55 on f1dac)
  - Much tighter round-to-round spread (64-83 vs 57-86)
  - Lower overall risk

### 2026-03-21T16:40:00Z

- **NEW BEST MODEL FOUND**

- Full 8-round weight sweep for stacked QR+CellKNN with exploration_r3:

  | Weight | Mean Score | f1dac | 36e581 |
  |--------|-----------|-------|--------|
  | 0% (pure QR) | 75.19 | 57.40 | 66.20 |
  | **15%** | **75.80** | 61.70 | 65.53 |
  | **25%** | **75.77** | 63.26 | 65.45 |
  | 35% | 75.44 | 64.63 | 65.10 |
  | 50% | 75.12 | 66.95 | 64.20 |

- **New overall lead: `greybox_stacked_w15` at 75.80 (vs 75.19 existing best)**
  - Delta: **+0.61 points** over previous best
  - f1dac improvement: **+4.30 points** (57.40 → 61.70)
  - Improvement on 4 of 8 rounds
  - Best individual round: 85.37 (8e8399)
  - Worst individual round: 61.70 (f1dac, improved from 57.40)

- Per-round comparison vs old best:

  | Round | Old Best | New Best (w15) | Delta |
  |-------|---------|---------------|-------|
  | 36e581 | 66.20 | 65.53 | -0.67 |
  | 71451d | 79.39 | 81.11 | +1.72 |
  | 76909e | 83.20 | 83.07 | -0.13 |
  | 8e8399 | 86.17 | 85.37 | -0.80 |
  | ae7800 | 78.88 | 76.55 | -2.33 |
  | c5cdf | 71.50 | 73.59 | +2.09 |
  | f1dac | 57.40 | 61.70 | +4.30 |
  | fd3c92 | 78.38 | 79.47 | +1.09 |
  | **Mean** | **75.19** | **75.80** | **+0.61** |

- Model architecture:
  - query_residual provides parametric base prediction with rich features
  - cellknn_perround provides non-parametric prediction from full replay terminal probability maps
  - blended in logit space with 15% cellknn weight
  - exact-cell blending re-applied after blend

### 2026-03-21T16:55:00Z

- **OPTIMAL WEIGHT FOUND: w=20% → 75.82 (+0.63 over previous best)**

- Complete weight sweep (exploration_r3, full 8 rounds):

  | Weight | Mean Score | f1dac | 36e581 |
  |--------|-----------|-------|--------|
  | 0% (pure QR) | 75.19 | 57.40 | 66.20 |
  | 10% | 75.69 | 60.85 | 65.46 |
  | 15% | 75.80 | 61.70 | 65.53 |
  | **20%** | **75.82** | **62.51** | 65.52 |
  | 25% | 75.77 | 63.26 | 65.45 |
  | 35% | 75.44 | 64.63 | 65.10 |
  | 50% | 75.12 | 66.95 | 64.20 |

- Interpretation:
  - Optimal cellknn weight is 20% — strong diminishing returns above this
  - The curve is very flat around 15-25%, so the model is robust to weight choice
  - Coverage policy scored 75.54 at w15 — exploration_r3 remains the better policy
  - f1dac improvement of +5.11 (57.40 → 62.51) is the primary driver

- New per-round comparison vs old best:

  | Round | Old Best | New Best (w20) | Delta |
  |-------|---------|---------------|-------|
  | 36e581 | 66.20 | 65.52 | -0.68 |
  | 71451d | 79.39 | 81.00 | +1.61 |
  | 76909e | 83.20 | 82.80 | -0.40 |
  | 8e8399 | 86.17 | 85.35 | -0.82 |
  | ae7800 | 78.88 | 75.80 | -3.08 |
  | c5cdf | 71.50 | 74.42 | +2.92 |
  | f1dac | 57.40 | 62.51 | **+5.11** |
  | fd3c92 | 78.38 | 79.18 | +0.80 |
  | **Mean** | **75.19** | **75.82** | **+0.63** |

### 2026-03-21T17:15:00Z

- **NEW ABSOLUTE BEST: stacked w20 spr4 → 76.06 (+0.87 over old best)**

- `greybox_stacked_w20`, policy `exploration_r3`, `samples_per_round=4`:
  - mean score: **76.0640**
  - f1dac: **63.93** (+6.53 over old best 57.40)
  - 36e581: **67.41** (+1.21 over old best 66.20, now BETTER than old best!)

- Full per-round comparison (new best vs old best):

  | Round | Old Best | **New Best (w20 spr4)** | Delta |
  |-------|---------|------------------------|-------|
  | 36e581 | 66.20 | **67.41** | **+1.21** |
  | 71451d | 79.39 | 80.79 | +1.40 |
  | 76909e | 83.20 | 82.76 | -0.44 |
  | 8e8399 | 86.17 | 85.28 | -0.89 |
  | ae7800 | 78.88 | 75.03 | -3.85 |
  | c5cdf | 71.50 | **74.24** | **+2.74** |
  | f1dac | 57.40 | **63.93** | **+6.53** |
  | fd3c92 | 78.38 | 79.08 | +0.70 |
  | **Mean** | **75.19** | **76.06** | **+0.87** |

- The model wins on 5 of 8 rounds and loses only on easy rounds
- The largest loss is ae7800 (-3.85) which needs investigation
- The largest gain is f1dac (+6.53) which was the hardest round

### 2026-03-21T18:00:00Z

- spr4 weight refinement results:

  | Weight | spr1 Mean | spr4 Mean | spr4 f1dac | spr4 36e581 |
  |--------|----------|----------|-----------|------------|
  | 10% | 75.69 | 75.95 | 62.52 | 67.59 |
  | 15% | 75.80 | 76.05 | 63.25 | 67.54 |
  | **20%** | 75.82 | **76.06** | **63.93** | **67.41** |
  | 25% | 75.77 | — | — | — |

- spr4 consistently helps over spr1 (about +0.2 points)
- Optimal weight remains around 15-20% with very flat profile
- Coverage policy with w15: 75.54 (below exploration_r3's 76.05)

- Attempted triple-stack (QR + lowrank + cellknn) but API complexity prevented clean implementation
  - The lowrank hazard predictor is already embedded in QR as a feature
  - Adding it as a third expert didn't provide easy path to improvement

## Overall Experiment Leaderboard

| Rank | Model | Policy | spr | Mean | f1dac | Range |
|------|-------|--------|-----|------|-------|-------|
| **1** | **stacked_w20 (QR+CellKNN)** | **explr3** | **4** | **76.06** | **63.93** | 63.9-85.3 |
| 2 | stacked_w15 (QR+CellKNN) | explr3 | 4 | 76.05 | 63.25 | 63.2-85.4 |
| 3 | stacked_w20 (QR+CellKNN) | explr3 | 1 | 75.82 | 62.51 | 62.5-85.4 |
| 4 | stacked_w15 (QR+CellKNN) | explr3 | 1 | 75.80 | 61.70 | 61.7-85.4 |
| 5 | hybrid_lowrank_queryres (OLD BEST) | explr3 | 4 | 75.19 | 57.40 | 57.4-86.2 |
| 6 | stacked_w15 (QR+CellKNN) | coverage | 1 | 75.54 | 60.19 | — |
| 7 | hybrid_lowrank_queryres | coverage | 4 | 74.94 | 55.67 | — |

### 2026-03-21T18:40:00Z

- **BREAKTHROUGH: Expansion-conditioned predictor dominates on extreme rounds**
  - Pure expansion-conditioned: f1dac = **75.92** (+18.5 over old best!)
  - c5cdf = **79.89** (+8.4 over old best!)
  - But overall mean only 73.79 (weaker on moderate rounds)

- **NEW ABSOLUTE BEST: Stacked QR + Expansion-Conditioned w35 → 77.35**
  - Full weight sweep found optimal at 35% expansion weight
  - Mean: 77.35 (vs 75.19 old best, **+2.16 points**)
  - f1dac: 68.85 (+11.45 over old best's 57.40)
  - c5cdf: 79.10 (+7.60 over old best's 71.50)
  - 36e581: 68.24 (+2.04 over old best's 66.20)

- Full weight sweep (stacked expansion, explr3, spr4):

  | Weight | Mean Score | f1dac | 36e581 |
  |--------|-----------|-------|--------|
  | 10% | 76.40 | 63.48 | 67.94 |
  | 15% | 76.75 | 64.68 | 68.11 |
  | 25% | 77.20 | 66.89 | 68.28 |
  | 30% | 77.31 | 67.90 | 68.29 |
  | **35%** | **77.35** | **68.85** | **68.24** |
  | 40% | 77.32 | 69.73 | 68.16 |
  | 45% | 77.22 | 70.55 | 68.02 |
  | 50% | 77.06 | 71.31 | 67.84 |

- Architecture: 65% query_residual + 35% expansion-conditioned in logit space

## Overall Experiment Leaderboard (Updated)

| Rank | Model | Policy | spr | Mean | f1dac | Range |
|------|-------|--------|-----|------|-------|-------|
| **1** | **stacked_expansion w35** | **explr3** | **4** | **77.35** | **68.85** | 68.2-84.8 |
| 2 | stacked_expansion w30 | explr3 | 4 | 77.31 | 67.90 | 67.9-84.8 |
| 3 | stacked_expansion w25 | explr3 | 4 | 77.20 | 66.89 | 66.9-85.0 |
| 4 | stacked w20 (QR+CellKNN) | explr3 | 4 | 76.06 | 63.93 | 63.9-85.3 |
| 5 | hybrid_lowrank_queryres (OLD BEST) | explr3 | 4 | 75.19 | 57.40 | 57.4-86.2 |

### 2026-03-21T20:45:00Z

- **Experiments that DIDN'T improve over 77.35:**
  - Adaptive-weight stacked: 76.95 (adaptive weighting too aggressive on extreme rounds)
  - Multi-regime 7D conditioning: 76.98 (curse of dimensionality with 7 rounds)
  - Enriched cell features (19 dims): 77.33 (extra features add noise for kNN)

- **Key finding: the 1D expansion rate is the optimal regime conditioning variable**
  - More dimensions (7D) hurts due to curse of dimensionality
  - Adaptive weighting hurts because the weight adjustment is unreliable with few training rounds
  - Richer cell features (19 vs 13) make no difference

### 2026-03-21T21:30:00Z

- **MASSIVE BREAKTHROUGH: Calibration fix from Agent4 review → 80.24 (+5.05!)**

- Applied Agent4's calibration parameters to QR:
  - `temperature`: 1.15 → 1.0 (no softening, +2.44 points alone)
  - `prior_blend`: 0.35 → 0.0 (trust learned corrections fully, +2.18 points)
  - `beta_min`: 8.0 → 6.0 (lower exact-cell shrinkage)

- **NEW ABSOLUTE BEST: Pure QR recalibrated → 80.24**

  | Round | Old Best (77.35) | **New Best (80.24)** | Delta |
  |-------|---------|-------------------|-------|
  | 36e581 | 68.24 | **69.47** | +1.23 |
  | 71451d | 80.66 | **82.56** | +1.90 |
  | 76909e | 81.86 | **85.65** | +3.79 |
  | 8e8399 | 84.78 | **86.74** | +1.96 |
  | ae7800 | 75.57 | **81.18** | +5.61 |
  | c5cdf | 79.10 | 78.50 | -0.60 |
  | f1dac | 68.85 | **78.12** | +9.27 |
  | fd3c92 | 79.76 | 79.73 | -0.03 |
  | **Mean** | **77.35** | **80.24** | **+2.89** |

- The calibration fix alone improved f1dac from 68.85 to 78.12 (+9.27!)
- The expansion stacking now HURTS with proper calibration (80.01 < 80.24)
- This means the expansion-conditioned model was compensating for QR's miscalibration

- Agent1 comparison: their best model `hazard_posterior_v15` scores 83.89
  - They use particle-refined posterior, entropy-weighted class reweighting
  - Key: using original round coefficients instead of SVD reconstruction
  - Policy: regime_probe_v1 instead of exploration_r3

- **Current absolute best model: `query_residual` recalibrated (t=1.0, p=0.0, b=6/24) at 80.37**
  - Optimal settings: exploration_r3 policy, samples_per_round=2
  - Coverage policy is WORSE (79.50) despite Agent4's finding
  - spr1 (79.83) < spr2 (80.37) > spr4 (80.24)

- Cross-agent review key findings:
  - Agent1 achieves **83.89** with hazard_posterior_v15 + regime_probe_v1 policy
  - Agent4 achieves **79.65** with recalibrated QR + coverage
  - Agent3 found prior_blend=0.0 monotonically improves from 0.35→0.0
  - Agent2 reached 78.40 with GLMM z2 model (different architecture)
  - Agent6 confirmed hazard teacher is at its ceiling
  - Agent7 found exploration_r3 is optimal repeat policy
  - Agent1's regime_probe_v1 policy: 78.59 with our QR (WORSE than exploration_r3 80.37)
    - Policy designed for hazard_posterior model, doesn't transfer well
  - teacher_blend=0.0: neutral (same score as 0.12)
  - Stacking with expansion-conditioned HURTS with proper calibration (80.01 < 80.37)

### Final Best Model Configuration

```
Model: query_residual_v7 (recalibrated)
Parameters:
  temperature: 1.0       (was 1.15, Agent4 finding)
  prior_blend: 0.0       (was 0.35, Agents 3&4 finding)
  beta_min: 6.0          (was 8.0, Agent4 finding)
  beta_scale: 24.0       (unchanged)
  teacher_blend: 0.0     (was 0.12, Agent3 finding)
  ridge_lambda: 8.0      (unchanged)
  signal_scale: 0.12     (unchanged)
  min_delta_scale: 0.4   (unchanged)
  cells_per_seed: 256    (unchanged)
Policy: exploration_r3
samples_per_round: 2
episode_seed: 0
budget: 50
Score: 80.37
```

### 2026-03-22T00:30:00Z — v15 Port Attempt

- Attempted full port of Agent1's hazard_posterior_v15 model (83.89)
- Copied all required files and fixed 4 compatibility issues
- **BLOCKED**: regime vector dimension mismatch (12 vs 5) between v1/v2 teachers
- Would need complete dataset rebuild — abandoned for time reasons
- **NEW BEST: cells_per_seed=512 → 80.56** (+0.19 over 256 default)
  - cells_per_seed sweep: 256→80.37, 512→**80.56**, 1024→79.95
  - Optimal is ~512 cells per seed for training the ridge

- **Final best: QR recalibrated at 80.56** (+5.37 over original 75.19)
  - temperature=1.0, prior_blend=0.0, beta_min=6.0, teacher_blend=0.0
  - cells_per_seed=512, samples_per_round=2, exploration_r3 policy
  - Or tristack e30_c05/e30_c10 at 77.39 (marginal improvement)
  - Architecture: 65% QR + 35% expansion-conditioned kNN in logit space
  - Uses 1D expansion rate for regime conditioning
  - 13 cell features for kNN matching
  - exploration_r3 policy, 4 samples per round

### 2026-03-21T19:00:00Z

- **Three-way tristack** (QR + expansion + cellknn) implemented and benchmarked
- Results:

  | Config | Mean | f1dac |
  |--------|------|-------|
  | tristack e25_c10 | 77.37 | 68.53 |
  | **tristack e30_c05** | **77.39** | 68.73 |
  | tristack e30_c10 | 77.39 | 69.45 |
  | tristack e35_c05 | 77.38 | 69.63 |

- The tristack provides marginal improvement over 2-way (+0.04)
- More configs running: e35_c10, e25_c15, e20_c15
- Fine expansion weight tuning failed (CLI missing those weight choices)
- Current absolute best: **tristack e30_c05/e30_c10 at 77.39** or **stacked_expansion w35 at 77.35**
- Complete tristack results:

  | Config | Mean | f1dac |
  |--------|------|-------|
  | e20_c15 | 77.29 | 68.27 |
  | e25_c10 | 77.37 | 68.53 |
  | e25_c15 | 77.34 | 69.21 |
  | **e30_c05** | **77.39** | 68.73 |
  | **e30_c10** | **77.39** | 69.45 |
  | e35_c05 | 77.38 | 69.63 |
  | e35_c10 | 77.34 | 70.31 |

- The tristack provides marginal improvement (+0.04) over 2-way stacked expansion
- CellKNN adds minimal extra value on top of expansion-conditioned
- The primary driver of all improvement is the expansion-rate conditioning

---

## Detailed Explanation of Current Best Model

> **One-time special documentation requested by the user.**

### Model Name: `greybox_stacked_expansion_w35` (Score: 77.35) or `greybox_tristack_e30_c05` (Score: 77.39)

### Architecture Overview

The best model is a **logit-space ensemble** of two (or three) fundamentally different prediction approaches. Each approach has complementary strengths:

```
Final prediction = softmax(
    (1 - w_exp - w_cknn) * logit(QR_prediction) +
    w_exp * logit(expansion_prediction) +
    w_cknn * logit(cellknn_prediction)      # only in tristack
)
```

### Component 1: Query Residual (QR) — `query_residual_v7` [65-70% weight]

**What it does:** Parametric ridge regression that maps per-cell features to logit corrections on the prior prediction.

**Input:** For each cell (y, x) in the 40×40 grid:
- **Static features (25 dims):** terrain one-hot (6), settlement/port indicators (2), buildable/land/coast/coast_distance/land_distance/sea_distance (6), forest/mountain density (2), basin_gap/frontier/proximity/exposure/access (5), terrain neighborhood histogram (6)
- **Prior logits (6):** log-probabilities from the historical bucket prior
- **Teacher logits (6):** hazard teacher predictions (semimechanistic logistic regression on build/port/ruin events)
- **Global summary (55 dims):** query count, observed cell fraction, pooled class residuals by zone (coastal/inland/buildable/near/mid/far), mean settlement stats (population/food/wealth/defense/owners)
- **Seed summary (45 dims):** per-seed version of the global summary
- **Regime summary (12 dims):** build/port/ruin hit rates, terminal class masses
- **Local evidence (15 dims):** observed count, blurred residuals at two scales, blurred coverage
- **Interaction features (34 dims):** regime × spatial, global residual × spatial

**Target:** Logit delta between ground truth and prior, at entropy-weighted selected cells.

**Training:** Weighted ridge regression (∼8000 cell-samples from ∼48 synthetic transcript prefixes across 7 training rounds × multiple budget levels).

**Why this model:** Ridge regression is fast, stable, and generalizes well through its many interaction features. It captures the smooth per-cell correction pattern given transcript evidence. The hazard teacher provides a structural prior based on semimechanistic event rates (build/port/ruin), while the rich feature set allows the ridge to learn nuanced spatial corrections.

**Why it's not enough alone:** It uses 51 compressed coefficients for the hazard teacher (massive information loss from full replay data) and can't represent extreme regimes well (like f1dac where settlement probability is 0.002).

### Component 2: Expansion-Conditioned Cell kNN [30-35% weight]

**What it does:** Non-parametric cell-level k-nearest-neighbor prediction using full-resolution terminal probability maps from replay data, conditioned on the estimated settlement expansion rate.

**Input:**
- **Cell features (13 dims):** buildable, ocean, mountain, forest, coast, land, land_distance, settlement_map, port_map, forest_density, mountain_density, settlement_density, settlement_proximity
- **Expansion rate (1 dim, weighted ×2.0):** the estimated settlement expansion rate of the current round, computed from observed settlement density in query viewports

**Training data bank:** For each of the 7 training rounds × 5 seeds:
- Full ground truth terminal probability tensor (40×40×6) from organizer Monte Carlo
- Cell features (40×40×13)
- Round expansion rate (scalar) from replay survival curves

**Prediction algorithm:**
1. Estimate expansion rate from observations: `(observed_settlement_cells / observed_total_cells) × map_area / initial_settlements`
2. For each test cell, build augmented feature vector: `[normalized_spatial_features, expansion_rate × 2.0]`
3. Find k=24 nearest training cells in augmented feature space
4. Weighted average (1/distance) of neighbors' terminal probabilities
5. Apply spatial smoothing of observation residuals (σ=2.0 Gaussian kernel)
6. Apply exact-cell Bayesian blending at observed cells

**Why the expansion rate matters:** Settlement expansion rate ranges from -0.9x (f1dac, everything dies) to 6.7x (ae7800, explosive growth). This is the PRIMARY axis of variation between rounds. By including it in the kNN feature space, cells are matched against training cells from rounds with SIMILAR dynamics, which is much more informative than matching purely on spatial features.

**Why it's not enough alone:** Mean score 73.79. It's non-parametric and can't extrapolate beyond training rounds. It's excellent on extreme regimes (f1dac: 75.92, c5cdf: 79.89) but worse on moderate/complex rounds where QR's richer feature set helps more.

### Component 3 (Tristack only): CellKNN Per-Round [5-10% weight]

**What it does:** Same as expansion-conditioned but builds SEPARATE kNN predictors per training round, then weights by Bayesian round posterior.

**Difference from expansion-conditioned:** Instead of mixing all training cells with expansion-rate weighting, it keeps cells from each round completely separate and predicts independently, then averages with round weights. This avoids cross-round dilution.

**Why included:** Provides marginal additional diversity (+0.04 points). The per-round separation captures subtleties that the expansion-rate dimension alone might miss.

### Blending Mechanism

The blend happens in **logit space** (log-probability space), which ensures the combined prediction is properly normalized and preserves the relative ordering of class probabilities better than probability-space blending.

```python
blended_logits = (1 - w) * log(QR_pred) + w * log(expansion_pred)
blended_probs = softmax(blended_logits)
```

After blending, **exact-cell Bayesian blending** re-applies at observed cells:
```python
beta = beta_min + beta_scale * (1 - entropy / ln(6))
final = (beta * blended + observed_counts) / (beta + total_counts)
```

This ensures directly observed cells are corrected toward their empirical frequency, with lower beta (more observation trust) for high-entropy cells.

### Key Parameters and Why

| Parameter | Value | Why |
|-----------|-------|-----|
| `expansion_weight` | 0.35 | Optimal from sweep over [0.10, ..., 0.50]. Higher values trust expansion more on extreme rounds but hurt moderate rounds. |
| `k_neighbors` | 24 | Balances between too-selective (noisy) and too-broad (diluted). With ∼8000 training cells per round, k=24 captures about 0.3% of each round's cells. |
| `expansion_weight` (in feature space) | 2.0 | Scaling factor that controls how much the expansion rate dimension matters vs spatial features. Higher = more regime-sensitive, lower = more spatially-driven. |
| `spatial_sigma` | 2.0 | Gaussian smoothing radius for propagating observation residuals to nearby unobserved cells. |
| `observation_beta_min` | 3.0 | Minimum Bayesian prior strength for exact-cell blending. Lower = trust observations more. |
| `prior_blend` | 0.15 | How much of the historical bucket prior to mix in. Low because the kNN+QR already captures most signal. |
| `ridge_lambda` | 8.0 | Ridge penalty for QR regression. Prevents overfitting to the ∼8000 cell-samples. |
| `temperature` | 1.15 | QR output temperature. Slightly above 1.0 for calibration (KL scoring punishes overconfidence). |
| `policy` | `exploration_r3` | Query policy that covers the map but also repeats 3 viewports for variance estimation. Better than pure coverage. |
| `samples_per_round` | 4 | Number of synthetic transcript episodes per training round. More = richer ridge training data. |

### Why This Architecture Works

The fundamental insight is that Astar Island prediction has two complementary challenges:

1. **Smooth spatial interpolation**: Given observed cells and initial features, predict nearby unobserved cells. QR is best at this because its rich per-cell features capture local spatial structure.

2. **Regime identification**: The hidden round parameters create dramatically different dynamics (from total collapse to explosive growth). The expansion-conditioned kNN is best at this because it uses full-resolution terminal probability maps and directly conditions on the most informative latent variable.

Neither model alone can do both well. The logit-space blend at 35% expansion weight captures the best of both: QR's spatial generalization + expansion's regime sensitivity.

---

## Key Technical Achievements

1. **Cell-level kNN predictor** (`greybox_cellknn_v01`, `greybox_cellknn_perround_v01`)
   - Uses full replay terminal probability maps (40×40×6) instead of compressed 51-d coefficients
   - Matches cells by spatial feature similarity across rounds
   - Per-round variant avoids cross-round dilution

2. **Stacked QR+CellKNN** (`greybox_stacked_v01`)
   - Logit-space blend of query_residual (parametric) and cellknn (non-parametric)
   - 20% cellknn weight optimal
   - Combines QR's generalization ability with cellknn's full-resolution cell matching

3. **Discovery of f1dac regime**: settlement survival prob = 0.002
   - Existing models failed because hazard teacher can't represent "everything dies"
   - CellKNN naturally captures this because most training cells end up empty

4. **Observation-validated ensemble** (rejected: observation weighting too noisy)
5. **Round-matching predictor** (rejected: cross-map position comparison broken)

## Files Created/Modified

### New model files:
- `src/astar/student/predictor/greybox_cellknn.py`
- `src/astar/student/predictor/greybox_cellknn_perround.py`
- `src/astar/student/predictor/greybox_stacked_v01.py`
- `src/astar/student/predictor/greybox_roundmatch.py`
- `src/astar/student/predictor/greybox_obsval_ensemble.py`

### Utility scripts:
- `scripts/agent5_newmodel_sweep.py`

### Framework modifications:
- `src/astar/student/predictor/interactive.py` — model registry
- `src/astar/workflows/model_eval.py` — eval path + prefix matching
- `src/astar/workflows/historical_benchmark.py` — transcript model list
- `src/astar/cli.py` — model choices
- `tests/test_historical_benchmark.py` — smoke test matrix
