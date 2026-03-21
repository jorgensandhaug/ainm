# PROGRESS_AGENT3

## Mission

- Max local test/benchmark score.
- Follow `README.md`, `docs/game_facts.md`, `instructions/agent3/generic-iteration-protocol-agent3.md`.
- Keep all high-level progress here; point to detailed artifacts/code when needed.

## Initial Context

- Date: `2026-03-20` UTC.
- Branch: `agent3`.
- Remote: `origin https://github.com/jorgensandhaug/ainm.git`.
- `instructions/agent3/specific-handoff-information.md` exists but is empty.
- `br` unavailable in current shell (`br: command not found`), so task tracking there currently blocked.

## Canon Read

- Read `README.md`.
- Read `docs/game_facts.md`.
- Read `instructions/agent3/generic-iteration-protocol-agent3.md`.
- Confirmed `docs/game_facts.md` is canonical for challenge facts.

## Early Repo Findings

- Live-exposed predictors in README: `geometry_prior`, `historical_bucket_prior`, `latent_regime`.
- CLI/model eval also exposes `query_residual`; code suggests this is current strongest online-interactive family worth pushing.
- Historical benchmark workflow already supports:
  - `prior_only`
  - `online_interactive`
- Existing benchmark artifacts indicate substantial prior work on `query_residual` and `historical_bucket_prior`.
- Model naming is not yet fully version-explicit at CLI surface; internal implementations use:
  - `geometry_prior_v1`
  - `historical_bucket_prior_v1`
  - `latent_regime_v1`
  - `query_residual_v7`

## Immediate Protocol Gaps / Notes

- Mandatory generic-handoff step `br list` attempted, but command missing.
- Mandatory specific handoff doc provided no content.
- Need to run fresh no-change baseline benchmark in this workspace before changes.
- Need to inspect benchmark/model resolution plumbing before edits.

## Current Work Log

### 2026-03-20

1. Read repo canon and handoff docs.
2. Checked git branch/remotes.
3. Confirmed `specific-handoff-information.md` empty.
4. Located benchmark workflow + model registry points:
   - `src/astar/student/predictor/interactive.py`
   - `src/astar/workflows/model_eval.py`
   - `src/astar/workflows/historical_benchmark.py`
   - `src/astar/student/predictor/query_residual.py`
5. Next:
   - inspect current best benchmark artifacts,
   - run fresh baseline benchmark,
   - inspect `query_residual` design,
   - formulate smallest score-improving hypothesis.
6. Fresh full baseline attempt exposed env/path bug:
   - synthetic dataset index stored absolute `episode_path` values from `/home/jorge/repos/ainm/tasks/astar/...`
   - current worktree is `/home/jorge/agent3/tasks/astar`
   - result: `run-historical-benchmark --model query_residual ...` failed before model eval.
7. Fixed synthetic dataset portability:
   - `src/astar/history/datasets/synthetic_live.py`
   - added episode-path remapping for relocated worktrees
   - new datasets now store workspace-relative `episode_path`
   - added relocation regression test
8. Validation after env fix:
   - `uv sync --extra dev`
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py -q`
   - result: `9 passed`
9. Main model diagnosis from existing artifacts:
   - `query_residual_v7` best visible full-run mean score ≈ `73.95`
   - weak rounds:
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb` score ≈ `46.41`
     - `36e581f1-73f8-453f-ab98-cbe3052b701b` score ≈ `63.96`
   - failure modes differ:
     - `36e...`: underpredicts settlement/port buildout
     - `f1da...`: still overpredicts dynamic classes on near-static round
10. New hypothesis:
   - current `query_residual` regression is missing direct exact local observed-class residual features
   - training cell selection overfocuses on top-entropy cells, underteaching background calibration
   - adding exact local residual features + stratified entropy-band training cells should improve both active and near-static round calibration
11. Implemented new named variant:
   - `query_residual_v8`
   - benchmarkable by name through CLI/framework
   - `v8` changes:
     - exact local residual channels exposed to regression
     - stratified entropy-band training cell selection
     - explicit named variant wiring in CLI / builder / benchmark path
     - added sample-data benchmark test for `query_residual_v8`
12. In progress:
   - full local `query_residual` baseline rerunning after path fix
   - next immediate step: small-round `query_residual_v8` probe, then full benchmark if promising
13. Second validation bug found while probing:
   - `_ensure_synthetic_dataset()` reused legacy `synthetic_live_coverage_v1` whenever `samples_per_round == 1`
   - that legacy dataset only covered 6 rounds, missing at least:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `c5cdf100-a876-4fb7-b5d8-757162c97989`
   - effect: `query_residual` training/eval could silently use incomplete synthetic transcript data
   - fixed by checking round coverage before cache reuse and rebuilding scoped datasets when needed
   - added regression test for incomplete legacy-cache rebuild behavior
14. Important implication:
   - old `query_residual` benchmark numbers in repo may be underestimating properly trained `v7`
   - must rerun clean baselines after this fix before trusting family comparisons
15. Focused pathology probe run on 2 hard rounds with corrected synthetic coverage:
   - artifacts:
     - `data/artifacts/benchmarks/agent3_query_residual_v7_probe_2rounds_pathologies/result.json`
     - `data/artifacts/benchmarks/agent3_query_residual_v8_probe_2rounds_pathologies/result.json`
   - rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - `v7` mean score `21.9453`, mean weighted KL `0.521659`
   - `v8` mean score `23.8479`, mean weighted KL `0.510152`
   - split:
     - `v8` materially helped `f1dac9...`
     - `v8` worsened `36e581...`
   - conclusion: `v8` not yet clearly dominant; needs representative holdout comparison, not just pathology probe
16. New pipeline blocker found while resuming holdout eval:
   - `build_online_predictor()` lost `samples_per_round` in actual runtime signature
   - surrounding CLI/eval paths already pass it
   - effect: focused tests fail with `TypeError`
17. Current fix in progress:
   - restoring `samples_per_round` threading in `src/astar/student/predictor/interactive.py`
   - also isolating query-residual checkpoints by `samples_per_round` so different synthetic-training regimes cannot silently share a checkpoint
18. `samples_per_round` blocker fixed:
   - `src/astar/student/predictor/interactive.py` now accepts/forwards `samples_per_round`
   - query-residual live checkpoints now include `__samples=<n>` in path, preventing cross-regime checkpoint collisions
19. Validation after builder/checkpoint fix:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py -q`
   - result: `10 passed`
   - `uv run pytest tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `4 passed`
20. Current benchmark work:
   - running representative targeted holdout eval on pathology rounds `36e581...` and `f1dac9...`
   - setup: train on other 7 replay-backed/analyzed rounds, evaluate `query_residual_v7` vs `query_residual_v8`, `mode=online_interactive`, `policy=coverage`, `budget=50`, `samples_per_round=1`
   - output target: `data/artifacts/benchmarks/agent3_query_residual_targeted_holdout_2rounds_7train/result.json`
21. New next-step ablation added while long holdout eval runs:
   - `query_residual_v9`
   - hypothesis: `v8` may be hurting active rounds mainly because entropy-stratified training-cell selection diluted dynamic-cell focus; keep the old top-entropy selection and isolate only the exact-local-residual feature addition
   - implementation:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - sample benchmark test added in `tests/test_historical_benchmark.py`
22. Iteration-speed improvement added:
   - query-residual now has scope-aware checkpoint caching for trained predictors
   - cache key dimensions:
     - model name
     - policy
     - `samples_per_round`
     - training round scope token
   - intended effect:
     - repeated historical benchmark / targeted holdout reruns reuse identical trained fold models
     - full LOO iteration on `query_residual` family should get substantially faster after first pass on a given variant/scope
23. Validation after `v9` + fold-cache wiring:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `15 passed`
24. Representative targeted holdout result completed:
   - artifact: `data/artifacts/benchmarks/agent3_query_residual_targeted_holdout_2rounds_7train/result.json`
   - setup:
     - held-out rounds:
       - `36e581f1-73f8-453f-ab98-cbe3052b701b`
       - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
     - train on other 7 rounds
     - `mode=online_interactive`
     - `policy=coverage`
     - `budget=50`
     - `samples_per_round=1`
   - result:
     - `query_residual_v7`: mean score `59.5285`, mean weighted KL `0.174259`
     - `query_residual_v8`: mean score `60.7316`, mean weighted KL `0.166721`
   - per-round:
     - `36e581...`
       - `v7`: score `64.4914`, KL `0.146308`
       - `v8`: score `63.4354`, KL `0.151821`
     - `f1dac9...`
       - `v7`: score `54.5655`, KL `0.202210`
       - `v8`: score `58.0278`, KL `0.181621`
   - interpretation:
     - earlier 2-round pathology probe understated `v8`
     - under representative 7-round training, `v8` gains on the barren/static failure case are larger than its regression on `36e581...`
     - `v8` is now the leading branch among tested named variants, but `36e581...` remains open
25. `query_residual_v9` targeted holdout result:
   - artifact: `data/artifacts/benchmarks/agent3_query_residual_v9_targeted_holdout_2rounds_7train/result.json`
   - setup matched item 24, but model=`query_residual_v9`
   - result:
     - mean score `59.6772`
     - mean weighted KL `0.173412`
   - per-round:
     - `36e581...`: score `64.6296`, KL `0.145594`
     - `f1dac9...`: score `54.7249`, KL `0.201229`
   - comparison:
     - vs `v7`: tiny gain (`+0.1488` mean score)
     - vs `v8`: clear loss (`-1.0543` mean score)
   - conclusion:
     - exact-local-residual alone is not enough
     - the entropy-stratified training-cell selection used in `v8` appears to be a real contributor to the static-round gain
26. Next step started:
   - run corrected full leave-one-round-out historical benchmark for `query_residual_v8`
   - objective: establish best current full local score under fixed synthetic-coverage + sample-aware checkpoint regime
27. Git checkpoint created + pushed:
   - commit: `afe153b`
   - message: `query_residual: fix fold pipeline and add v9 ablation`
   - pushed to remote branch `origin/agent3`
28. New follow-up branch prepared while full `v8` benchmark runs:
   - `query_residual_v10`
   - hypothesis:
     - `v8` wins mainly because entropy stratification helps barren/static rounds
     - `v9` shows exact-local-residual alone is insufficient
     - therefore try a top-heavy stratified selector to preserve most dynamic-cell focus while still teaching low-entropy calibration
   - implementation:
     - selection strategy `top_heavy_stratified_entropy`
     - intended mix: roughly `75%` high-entropy, `15%` mid-entropy, remainder low-entropy
     - model wiring added in:
       - `src/astar/student/predictor/query_residual.py`
       - `src/astar/cli.py`
       - `tests/test_historical_benchmark.py`
29. Validation after `v10` wiring:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `16 passed`
30. `query_residual_v10` targeted holdout result:
   - artifact: `data/artifacts/benchmarks/agent3_query_residual_v10_targeted_holdout_2rounds_7train/result.json`
   - same setup as items 24-25
   - result:
     - mean score `60.7303`
     - mean weighted KL `0.166877`
   - per-round:
     - `36e581...`: score `63.9362`, KL `0.149196`
     - `f1dac9...`: score `57.5244`, KL `0.184559`
   - comparison:
     - vs `v8`: essentially tied but slightly worse overall (`-0.0013` mean score)
     - vs `v8`, `36e581...` improves modestly, but `f1dac9...` loses more
   - conclusion:
     - top-heavy stratification does not beat `v8`
     - `query_residual_v8` remains best branch among tested named variants
31. Corrected full leave-one-round-out benchmark complete for `query_residual_v8`:
   - artifact: `data/artifacts/benchmarks/agent3_dev_query_residual_v8_full_corrected/result.json`
   - command:
     - `uv run astar run-historical-benchmark --model query_residual_v8 --mode online_interactive --policy coverage --samples-per-round 1 --budget 50 --with-png none --name agent3_dev_query_residual_v8_full_corrected`
   - result:
     - mean score `74.3226`
     - mean weighted KL `0.101556`
     - rounds `8`
     - evaluated seeds `40`
     - total runtime `1568.289s`
     - round mean score range `58.0278..85.4184`
   - notable:
     - this is the best fully revalidated full-run score produced in this workspace during this session
     - worst round remains `f1dac9...`, but `v8` still materially improved it relative to targeted `v7`
32. Next control started:
   - corrected full leave-one-round-out benchmark for `query_residual_v7`
   - reason:
     - old repo-visible `v7` full score (`73.9505`) predates the synthetic-coverage/cache fix
     - need apples-to-apples `v7` vs `v8` under the corrected pipeline before declaring `v8` final winner
33. Additional git checkpoint created + pushed:
   - commit: `6dbe7e8`
   - message: `query_residual: validate v8 full benchmark and add v10 probe`
   - pushed to remote branch `origin/agent3`
34. `query_residual_v7` full corrected control status at end of this turn:
   - benchmark command was started but not completed in-turn
   - partial progress preserved via fold checkpoints:
     - `data/artifacts/models/query_residual_v7__policy=coverage__samples=1__rounds=n=7__sha1=c74dbf0a20/checkpoint.json`
     - `data/artifacts/models/query_residual_v7__policy=coverage__samples=1__rounds=n=7__sha1=88a5ef803c/checkpoint.json`
     - `data/artifacts/models/query_residual_v7__policy=coverage__samples=1__rounds=n=7__sha1=81af6b89d1/checkpoint.json`
   - run was intentionally stopped after caching `3/8` folds to avoid leaving an orphan long-running process at turn end
   - rerunning the same benchmark command should reuse those completed fold checkpoints
35. Corrected full leave-one-round-out benchmark complete for `query_residual_v7`:
   - artifact: `data/artifacts/benchmarks/agent3_dev_query_residual_v7_full_corrected/result.json`
   - command:
     - `uv run astar run-historical-benchmark --model query_residual_v7 --mode online_interactive --policy coverage --samples-per-round 1 --budget 50 --with-png none --name agent3_dev_query_residual_v7_full_corrected`
   - result:
     - mean score `74.2553`
     - mean weighted KL `0.102772`
     - rounds `8`
     - evaluated seeds `40`
     - total runtime `1076.540s` on resumed cached-fold run
     - round mean score range `54.5655..84.8249`
36. Apples-to-apples conclusion after corrected full runs:
   - `query_residual_v8` beats corrected `query_residual_v7`
   - delta:
     - score `+0.0673`
     - weighted KL `-0.001216`
   - interpretation:
     - the gain is small but real on full local held-out rounds
     - `v8` remains current best verified model family variant in this workspace
     - biggest remaining weakness still concentrated on:
       - `f1dac9...`
       - `36e581...`
37. Next hypothesis:
   - current model naming still hides important training-regime choices behind CLI flags (`samples_per_round`, training transcript policy)
   - next improvement should make those choices explicit in named variants and test whether more synthetic transcript diversity helps the two remaining weak rounds without harming the rest
38. Immediate next experiment:
   - hold architecture fixed at `query_residual_v8`
   - change only training transcript diversity: `samples_per_round=2`
   - first test on the representative 2-round/7-train holdout before deciding whether to formalize it as a new named variant
   - rationale:
     - weakest rounds likely need better transcript-conditioned calibration, not necessarily another feature block
     - doubling synthetic episodes per round is the smallest high-signal data-regime change still untested in this workspace
39. `query_residual_v8` samples-2 targeted holdout status at end of this turn:
   - probe command was started for the same 2-round/7-train holdout with:
     - model `query_residual_v8`
     - `samples_per_round=2`
     - `policy=coverage`
   - expensive first-pass groundwork completed:
     - full synthetic dataset built at:
       - `data/artifacts/datasets/query_residual_synthetic_live__policy=coverage__samples=2__rounds=n=8__sha1=ea07400de1/`
     - first held-out fold checkpoint built at:
       - `data/artifacts/models/query_residual_v8__policy=coverage__samples=2__rounds=n=7__sha1=c74dbf0a20/checkpoint.json`
   - run was intentionally stopped after caching that groundwork to avoid leaving another orphan long-running process at turn end
   - rerunning the same samples-2 holdout probe should now skip dataset build and reuse the completed first fold

### 2026-03-21

40. Re-read repo canon + handoff at turn start:
   - `README.md`
   - `docs/game_facts.md`
   - `instructions/agent3/generic-iteration-protocol-agent3.md`
   - `PROGRESS_AGENT3.md`
   - `br list` retried and still unavailable in this shell (`br: command not found`)
41. Rechecked current workspace/runtime state:
   - no active long-running `query_residual` benchmark/eval processes were present
   - branch still `agent3`
   - latest pushed commit at turn start: `649ff39`
42. Important discovery from existing artifacts:
   - the previously “partial” samples-2 targeted holdout had actually finished and written:
     - `data/artifacts/benchmarks/agent3_query_residual_v8_samples2_targeted_holdout_2rounds_7train/result.json`
   - result:
     - `query_residual_v8`, `samples_per_round=2`
     - mean score `60.9581`
     - mean weighted KL `0.165517`
   - per-round:
     - `36e581...`: score `63.8284`, KL `0.149753`
     - `f1dac9...`: score `58.0878`, KL `0.181280`
   - comparison vs `query_residual_v8` samples-1 targeted holdout:
     - score `+0.2265`
     - weighted KL `-0.001204`
     - improves both hard held-out rounds slightly
43. Updated hypothesis after item 42:
   - extra synthetic transcript diversity is plausibly helping generalization, not just trading one hard round against the other
   - next code step should make this regime reproducible by model name instead of hiding it behind `--samples-per-round`
44. Immediate next action from current state:
   - formalize a new named `query_residual` variant for the samples-2 regime
   - then run full corrected leave-one-round-out benchmark for that named variant
45. Implemented named samples-2 variant:
   - new model name: `query_residual_v11`
   - semantics:
     - same architecture as `query_residual_v8`
     - same stratified-entropy cell selection
     - same exact-local-residual features
     - fixed `samples_per_round=2`
   - rationale:
     - makes the improving samples-2 regime benchmarkable by model name alone
     - removes dependence on hidden CLI flags for reproducibility of this branch
46. Variant-resolution plumbing upgraded:
   - added explicit query-residual named-variant spec resolution in:
     - `src/astar/student/predictor/query_residual.py`
   - interactive query-residual commands now allow `--samples-per-round` to default to `None`, letting fixed-by-name variants supply their own effective regime:
     - `src/astar/student/predictor/interactive.py`
     - `src/astar/workflows/model_eval.py`
     - `src/astar/workflows/historical_benchmark.py`
     - `src/astar/cli.py`
   - benchmark metadata and run naming now record the effective sample count, not just the raw CLI arg
47. Validation after `query_residual_v11` + effective-sample resolution:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `17 passed`
   - added regression coverage in:
     - `tests/test_historical_benchmark.py`
   - key new assertion:
     - `query_residual_v11` resolves to `samples_per_round=2` with no explicit CLI flag
48. Full corrected leave-one-round-out benchmark complete for `query_residual_v11`:
   - artifact:
     - `data/artifacts/benchmarks/agent3_dev_query_residual_v11_full_corrected/result.json`
   - command:
     - `uv run astar run-historical-benchmark --model query_residual_v11 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_query_residual_v11_full_corrected`
   - result:
     - mean score `74.6870`
     - mean weighted KL `0.099885`
     - rounds `8`
     - evaluated seeds `40`
     - total runtime `1795.405s`
     - round mean score range `58.0878..85.5003`
49. Current best verified local model updated:
   - `query_residual_v11` is new best full corrected run in this workspace
   - comparison vs previous best `query_residual_v8`:
     - score `+0.3644`
     - weighted KL `-0.001671`
   - official-round-weighted mean score also improved:
     - `v8`: `73.9945`
     - `v11`: `74.3921`
     - delta: `+0.3976`
50. Per-round delta vs `query_residual_v8` full corrected:
   - improves `7/8` held-out rounds
   - biggest gain:
     - `c5cdf100-a876-4fb7-b5d8-757162c97989`: `+1.7512` score, `-0.008071` KL
   - hard rounds still improved, but modestly:
     - `36e581...`: `+0.3930`
     - `f1dac9...`: `+0.0600`
   - only loss:
     - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`: `-0.0832`
51. Paired full-run comparison vs `v8`:
   - command:
     - `uv run astar compare-historical-benchmarks --baseline data/artifacts/benchmarks/agent3_dev_query_residual_v8_full_corrected/result.json --candidate data/artifacts/benchmarks/agent3_dev_query_residual_v11_full_corrected/result.json --bootstrap-samples 200`
   - result:
     - mean score delta `+0.3644`
     - mean weighted KL delta `-0.001671`
     - seed win rate `0.800`
     - seed loss rate `0.200`
     - bootstrap `95%` CI for score delta: `[0.2078, 0.5388]`
   - comparison artifact:
     - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual_v8__candidate=query_residual_v11.json`
52. Next hypothesis from the new best state:
   - extra transcript diversity clearly helped `v8`
   - next most plausible remaining nearby branch is to test whether the near-tied `v10` also benefits from `samples_per_round=2`
   - that is a cheaper targeted follow-up than another full new family rewrite
53. `query_residual_v10` samples-2 targeted holdout result:
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v10_samples2_targeted_holdout_2rounds_7train/result.json`
   - setup:
     - same representative held-out rounds as earlier targeted probes
     - model `query_residual_v10`
     - `samples_per_round=2`
     - `policy=coverage`
     - `budget=50`
   - result:
     - mean score `60.8660`
     - mean weighted KL `0.166175`
   - per-round:
     - `36e581...`: score `64.2292`, KL `0.147661`
     - `f1dac9...`: score `57.5029`, KL `0.184688`
54. Interpretation of item 53:
   - `v10` also improves with extra transcript diversity relative to its samples-1 targeted result
   - but it still does not beat the samples-2 `v11` / `v8` branch on the same targeted holdout
   - comparison on the representative 2-round/7-train holdout:
     - `v11`/`v8` samples-2: `60.9581`
     - `v10` samples-2: `60.8660`
   - conclusion:
     - current lead remains the `v11` branch
     - top-heavy stratification still looks slightly inferior to the plain stratified selector once transcript diversity is increased
55. Re-read repo canon + handoff again at new turn start:
   - `README.md`
   - `docs/game_facts.md`
   - `instructions/agent3/generic-iteration-protocol-agent3.md`
   - `PROGRESS_AGENT3.md`
   - `br list` retried and still unavailable in this shell (`br: command not found`)
56. Validation upgrade hypothesis:
   - current historical benchmark output is missing several signals already useful for model selection in this workspace
   - specifically, official round weighting, round-to-round variance, and worst-round summary should be first-class benchmark fields rather than ad-hoc manual calculations
   - this should improve selection discipline without changing model behavior
57. Implemented validation/reporting upgrade for historical benchmarks:
   - added native benchmark fields for:
     - official weighted mean score
     - official weighted mean weighted-KL
     - round mean score std
     - round mean weighted-KL std
     - worst-round id / number / weight / score / KL
     - per-round stored weight
   - wiring updated in:
     - `src/astar/workflows/results.py`
     - `src/astar/workflows/historical_benchmark.py`
     - `src/astar/cli_output.py`
     - `src/astar/eval/reports.py`
     - `tests/test_historical_benchmark.py`
58. Validation after benchmark-metric upgrade:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `17 passed`
59. Next model-family hypothesis from current evidence:
   - `samples_per_round=2` helped the lead branch on both representative hard rounds and on full corrected LOO
   - the next most plausible incremental win is a fixed-name `samples_per_round=3` variant on the same `v11` architecture
   - that should be tested first on the representative 2-round/7-train holdout before spending another full LOO run
60. Implemented next fixed-name regime probe:
   - new model name: `query_residual_v12`
   - semantics:
     - same architecture as `query_residual_v11`
     - fixed `samples_per_round=3`
   - wiring updated in:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - `tests/test_historical_benchmark.py`
61. Validation after `query_residual_v12` wiring:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `18 passed`
   - key new assertion:
     - `query_residual_v12` resolves to `samples_per_round=3` with no explicit CLI flag
62. Immediate next experiment:
   - evaluate `query_residual_v12` on the representative 2-round/7-train holdout
   - only if that beats `v11`/samples-2 should it earn a full corrected LOO run
63. `query_residual_v12` targeted holdout status at end of this turn:
   - probe was started on the same representative 2-round/7-train holdout with:
     - model `query_residual_v12`
     - fixed `samples_per_round=3`
     - `policy=coverage`
     - `budget=50`
   - expensive groundwork now cached:
     - samples-3 synthetic dataset directory exists at:
       - `data/artifacts/datasets/query_residual_synthetic_live__policy=coverage__samples=3__rounds=n=8__sha1=ea07400de1/`
     - first held-out fold checkpoint exists at:
       - `data/artifacts/models/query_residual_v12__policy=coverage__samples=3__rounds=n=7__sha1=c74dbf0a20/checkpoint.json`
   - run was intentionally interrupted after the first checkpoint landed, to avoid leaving an orphan long-running process at turn end
   - rerunning the same `v12` targeted holdout probe should skip dataset build and reuse that first fold
64. Current post-`v11` branch state:
   - best verified full corrected local model remains `query_residual_v11`
   - validation output is now stronger than when `v11` was first benchmarked, but `v11` itself has not yet been rerun under the upgraded reporting schema
65. `query_residual_v12` targeted holdout result:
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v12_targeted_holdout_2rounds_7train/result.json`
   - setup:
     - same representative 2-round/7-train holdout
     - model `query_residual_v12`
     - fixed `samples_per_round=3`
     - `policy=coverage`
     - `budget=50`
   - result:
     - mean score `60.6939`
     - mean weighted KL `0.166922`
   - per-round:
     - `36e581...`: score `63.3508`, KL `0.152266`
     - `f1dac9...`: score `58.0371`, KL `0.181579`
66. Interpretation of item 65:
   - increasing transcript diversity from `2 -> 3` did not continue the gain trend on the representative holdout
   - comparison:
     - `v11` / samples-2: `60.9581`
     - `v10` / samples-2: `60.8660`
     - `v12` / samples-3: `60.6939`
   - conclusion:
     - `v12` is rejected
     - current best branch remains `query_residual_v11`
67. Next clean-up / validation step:
   - rerun full corrected LOO for `query_residual_v11` once under the upgraded benchmark-reporting schema
   - objective:
     - preserve the same best-model score
     - regenerate its benchmark artifact/report with official weighted mean, round std, and worst-round summary baked in
68. Full corrected `query_residual_v11` rerun complete under upgraded reporting schema:
   - artifact:
     - `data/artifacts/benchmarks/agent3_dev_query_residual_v11_full_corrected_metrics/result.json`
   - command:
     - `uv run astar run-historical-benchmark --model query_residual_v11 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_query_residual_v11_full_corrected_metrics`
   - result:
     - mean score `74.6870`
     - mean weighted KL `0.099885`
     - official weighted mean score `74.3921`
     - official weighted mean weighted-KL `0.101119`
     - round mean score std `8.8320`
     - round mean weighted-KL std `0.041624`
     - worst round:
       - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
       - mean score `58.0878`
       - mean weighted KL `0.181280`
     - runtime `176.262s`
69. Interpretation of item 68:
   - cached-fold rerun reproduced the exact same best `v11` score, so the validation/reporting upgrade did not perturb model behavior
   - benchmark artifact for the current lead model now includes the stronger native selection metrics
70. New hypothesis after rejecting `v12`:
   - the next likely mismatch is not transcript diversity but training-prefix alignment
   - current query-residual training uses transcript prefixes `(0, 5, 10, 20, 35, 50)`, but benchmark/live scoring only cares about the final post-query prediction
   - because the `coverage` policy is query-plan based and does not depend on predictor outputs, training on early sparse prefixes may dilute final-budget fit without helping the evaluated behavior
71. Implemented late-prefix branch:
   - new model name: `query_residual_v13`
   - semantics:
     - same architecture as `query_residual_v11`
     - fixed `samples_per_round=2`
     - fixed training `budget_prefixes=(20, 35, 50)`
   - wiring updated in:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - `tests/test_historical_benchmark.py`
72. Validation after `query_residual_v13` wiring:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `19 passed`
   - next:
     - evaluate `query_residual_v13` on the representative 2-round/7-train holdout
73. Turn-start context refresh completed before further iteration:
   - reread:
     - `README.md`
     - `docs/game_facts.md`
     - `instructions/agent3/generic-iteration-protocol-agent3.md`
   - `instructions/agent3/specific-handoff-information.md` is currently empty (`0` bytes)
   - attempted `br list` per repo instructions, but `br` is not installed in this environment (`command not found`)
74. `query_residual_v13` targeted holdout status during this turn:
   - representative 2-round/7-train probe is running for:
     - model `query_residual_v13`
     - `policy=coverage`
     - `budget=50`
     - held-out rounds:
       - `36e581f1-73f8-453f-ab98-cbe3052b701b`
       - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - process is confirmed active rather than wedged:
     - worker pid `1836151`
     - observed CPU during probe: `243%`
   - cached fold checkpoint already exists at:
     - `data/artifacts/models/query_residual_v13__policy=coverage__samples=2__rounds=n=7__sha1=c74dbf0a20/checkpoint.json`
75. Next likely hypothesis if `v13` fails:
   - current code uses prefix selection only; all retained prefixes contribute equally to both:
     - regime linear fit
     - residual ridge fit
   - because live / benchmark scoring only uses the final post-query prediction, a better aligned ablation is likely:
     - keep all default prefixes for coverage of sparse-transcript regimes
     - weight later prefixes more heavily instead of deleting early ones outright
   - intended direction:
     - add a new fixed-name branch that applies budget-dependent prefix weights in both fitting stages
     - use representative 2-round/7-train holdout first, then full corrected LOO only if it wins cleanly
76. `query_residual_v13` targeted holdout result:
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v13_targeted_holdout_2rounds_7train/result.json`
   - setup:
     - same representative 2-round/7-train holdout
     - model `query_residual_v13`
     - fixed `samples_per_round=2`
     - fixed training `budget_prefixes=(20, 35, 50)`
     - `policy=coverage`
     - `budget=50`
   - result:
     - mean score `60.8438`
     - mean weighted KL `0.165869`
   - per-round:
     - `36e581...`: score `62.1955`, KL `0.158415`
     - `f1dac9...`: score `59.4920`, KL `0.173323`
77. Interpretation of item 76:
   - `v13` loses to current lead `v11` / `v8` samples-2 holdout result `60.9581`
   - but the loss is structured rather than random:
     - versus `v11`, `v13` hurts `36e581...` by about `-1.6328`
     - versus `v11`, `v13` helps worst round `f1dac9...` by about `+1.4042`
   - conclusion:
     - hard deletion of early prefixes is too aggressive
     - the underlying alignment idea still looks alive
     - next branch should keep early prefixes with reduced weight, not remove them
78. New hypothesis after `v13`:
   - later-prefix emphasis seems directionally useful for the worst round, but deleting early prefixes removes too much robustness on other rounds
   - better ablation:
     - keep default prefixes `(0, 5, 10, 20, 35, 50)`
     - assign budget-dependent prefix weights during fitting
     - apply the same prefix weights to:
       - regime linear regression
       - residual ridge regression
   - first test:
     - use a moderate linear schedule with floor `0.25`
     - weights become approximately:
       - `0 -> 0.25`
       - `5 -> 0.325`
       - `10 -> 0.40`
       - `20 -> 0.55`
       - `35 -> 0.775`
       - `50 -> 1.0`
79. Implemented weighted-prefix branch:
   - new model name: `query_residual_v14`
   - semantics:
     - same architecture as `query_residual_v11`
     - fixed `samples_per_round=2`
     - default training prefixes remain `(0, 5, 10, 20, 35, 50)`
     - training rows now receive budget-dependent weights with:
       - `prefix_weight_floor=0.25`
       - `prefix_weight_power=1.0`
   - implementation details:
     - generalized query-residual checkpoint/spec/model config to carry prefix-weight parameters
     - upgraded regime linear fit helper to support weighted least squares
     - residual ridge fit now multiplies existing entropy row weights by the prefix weight
   - wiring updated in:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - `tests/test_historical_benchmark.py`
80. Validation after `query_residual_v14` wiring:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `20 passed`
81. Immediate next experiment:
   - evaluate `query_residual_v14` on the representative 2-round/7-train holdout
   - promotion rule unchanged:
     - only run full corrected LOO if `v14` beats the current targeted leader `60.9581`
82. `query_residual_v14` targeted holdout result:
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v14_targeted_holdout_2rounds_7train/result.json`
   - setup:
     - same representative 2-round/7-train holdout
     - model `query_residual_v14`
     - fixed `samples_per_round=2`
     - training prefixes `(0, 5, 10, 20, 35, 50)`
     - linear prefix weights with floor `0.25`
     - `policy=coverage`
     - `budget=50`
   - result:
     - mean score `60.7540`
     - mean weighted KL `0.166515`
   - per-round:
     - `36e581...`: score `63.1168`, KL `0.153500`
     - `f1dac9...`: score `58.3911`, KL `0.179529`
83. Interpretation of item 82:
   - `v14` loses to:
     - `v11` / `v8` samples-2: `60.9581`
     - `v13`: `60.8438`
   - compared with `v13`, moderate prefix weighting did partly recover `36e581...`:
     - `62.1955 -> 63.1168`
   - but it also gave back most of the `f1dac9...` gain:
     - `59.4920 -> 58.3911`
   - conclusion:
     - this prefix-weighting family appears to trace a tradeoff curve rather than dominate `v11`
     - full corrected LOO is not justified for `v14`
     - next hypothesis should move to a different control surface, not another nearby prefix-weight interpolation
84. New hypothesis after rejecting `v14`:
   - query residual already consumes teacher priors inside the learned design tensor
   - current inference also applies an extra fixed `teacher_blend=0.12` on unobserved cells after the learned correction
   - that fixed blend may be double-counting teacher information and may hurt rounds where inferred-regime teacher priors are biased
   - decisive ablation:
     - keep the teacher-derived features
     - remove only the final heuristic teacher blend
85. Implemented teacher-blend ablation branch:
   - new model name: `query_residual_v15`
   - semantics:
     - same architecture as `query_residual_v11`
     - fixed `samples_per_round=2`
     - same stratified entropy cell selection
     - same exact local residual features
     - fixed `teacher_blend=0.0`
   - wiring updated in:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - `tests/test_historical_benchmark.py`
86. Validation after `query_residual_v15` wiring:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `21 passed`
87. `query_residual_v15` targeted holdout result:
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v15_targeted_holdout_2rounds_7train/result.json`
   - setup:
     - same representative 2-round/7-train holdout
     - model `query_residual_v15`
     - fixed `samples_per_round=2`
     - fixed `teacher_blend=0.0`
     - `policy=coverage`
     - `budget=50`
   - result:
     - mean score `60.9581`
     - mean weighted KL `0.165517`
   - per-round:
     - `36e581...`: score `63.8284`, KL `0.149753`
     - `f1dac9...`: score `58.0878`, KL `0.181280`
88. Interpretation of item 87:
   - `v15` exactly matches the current targeted leader `v11` / `v8` samples-2 on this proxy
   - implication:
     - the explicit final `teacher_blend` heuristic appears effectively inert under this regime
     - removing it does not buy score, but it also does not damage score
   - next branch should target a different anchor:
     - `prior_blend`
     - delta scaling
     - exact-cell blend strength
89. New hypothesis after `v15`:
   - the dominant remaining heuristic anchor appears to be `prior_blend`
   - with current settings, even strong transcript signal still leaves a large fraction of the historical prior in the final tensor
   - because `samples_per_round=2` improved robustness already, a modest reduction in prior anchoring may let transcript-driven corrections matter more without destabilizing the model
90. Implemented lower-prior-anchor branch:
   - new model name: `query_residual_v16`
   - semantics:
     - same architecture as `query_residual_v11`
     - fixed `samples_per_round=2`
     - same stratified entropy cell selection
     - same exact local residual features
     - fixed `prior_blend=0.25`
   - wiring updated in:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - `tests/test_historical_benchmark.py`
91. Validation after `query_residual_v16` wiring:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `22 passed`
92. `query_residual_v16` targeted holdout result:
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v16_targeted_holdout_2rounds_7train/result.json`
   - setup:
     - same representative 2-round/7-train holdout
     - model `query_residual_v16`
     - fixed `samples_per_round=2`
     - fixed `prior_blend=0.25`
     - `policy=coverage`
     - `budget=50`
   - result:
     - mean score `62.9365`
     - mean weighted KL `0.154614`
   - per-round:
     - `36e581...`: score `64.7919`, KL `0.144745`
     - `f1dac9...`: score `61.0810`, KL `0.164483`
93. Interpretation of item 92:
   - `v16` is a clear proxy winner
   - gain versus current targeted leader `v11` / `v8` samples-2:
     - score `+1.9784`
     - weighted KL `-0.010903`
   - importantly, unlike `v13` / `v14`, `v16` improves both representative rounds at once
   - promotion decision:
     - run full corrected LOO for `query_residual_v16` immediately
94. Full corrected `query_residual_v16` LOO benchmark complete:
   - artifact:
     - `data/artifacts/benchmarks/agent3_dev_query_residual_v16_full_corrected/result.json`
   - command:
     - `uv run astar run-historical-benchmark --model query_residual_v16 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_query_residual_v16_full_corrected`
   - result:
     - mean score `75.4866`
     - mean weighted KL `0.095799`
     - official weighted mean score `75.2037`
     - official weighted mean weighted-KL `0.097000`
     - round mean score std `7.9781`
     - round mean weighted-KL std `0.036871`
     - worst round:
       - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
       - mean score `61.0810`
       - mean weighted KL `0.164483`
     - runtime `1415.439s`
95. Interpretation of item 94:
   - `query_residual_v16` is the new best verified full local model here
   - versus prior best `query_residual_v11` full corrected metrics:
     - mean score `74.6870 -> 75.4866` (`+0.7996`)
     - mean weighted KL `0.099885 -> 0.095799` (`-0.004086`)
     - official weighted mean score `74.3921 -> 75.2037` (`+0.8116`)
     - official weighted mean weighted-KL `0.101119 -> 0.097000` (`-0.004119`)
   - worst-round robustness also improved materially:
     - worst round remained `f1dac9...`
     - worst-round score improved `58.0878 -> 61.0810`
96. Paired historical comparison vs prior best:
   - artifact:
     - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual_v11__candidate=query_residual_v16.json`
   - report:
     - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual_v11__candidate=query_residual_v16.md`
   - result:
     - mean score delta `+0.7996`
     - mean weighted KL delta `-0.004085`
     - win rate `0.800`
     - loss rate `0.200`
     - tie rate `0.000`
     - score-delta CI95 `[0.5134, 1.1407]`
97. Immediate next exploration after the `v16` full win:
   - the prior-blend family is now clearly live
   - next decisive question:
     - was `0.25` near-optimal, or were we still too conservative?
   - smallest useful continuation:
     - test a stronger de-anchoring step before touching other knobs
98. Implemented stronger prior-deanchor branch:
   - new model name: `query_residual_v17`
   - semantics:
     - same architecture as `query_residual_v16`
     - fixed `samples_per_round=2`
     - fixed `prior_blend=0.15`
   - wiring updated in:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - `tests/test_historical_benchmark.py`
99. Validation after `query_residual_v17` wiring:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `23 passed`
100. `query_residual_v17` targeted holdout result:
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v17_targeted_holdout_2rounds_7train/result.json`
   - setup:
     - same representative 2-round/7-train holdout
     - model `query_residual_v17`
     - fixed `samples_per_round=2`
     - fixed `prior_blend=0.15`
     - `policy=coverage`
     - `budget=50`
   - result:
     - mean score `64.8429`
     - mean weighted KL `0.144519`
   - per-round:
     - `36e581...`: score `65.6134`, KL `0.140534`
     - `f1dac9...`: score `64.0725`, KL `0.148504`
101. Interpretation of item 100:
   - stronger de-anchoring continued the gain trend rather than reversing it
   - versus `v16` targeted:
     - score `+1.9064`
     - weighted KL `-0.010095`
   - versus prior best proxy `v11` / `v8` samples-2:
     - score `+3.8848`
     - weighted KL `-0.020998`
   - importantly, `v17` again improves both representative rounds simultaneously
   - promotion decision:
     - run full corrected LOO for `query_residual_v17` immediately
102. `query_residual_v17` full corrected LOO status at end of this turn:
   - initial full run command launched:
     - `uv run astar run-historical-benchmark --model query_residual_v17 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_query_residual_v17_full_corrected`
   - first pass was intentionally interrupted to avoid leaving an orphan long-running process at turn end
   - cached fold checkpoints completed before resume:
     - `data/artifacts/models/query_residual_v17__policy=coverage__samples=2__rounds=n=7__sha1=c74dbf0a20/checkpoint.json`
     - `data/artifacts/models/query_residual_v17__policy=coverage__samples=2__rounds=n=7__sha1=a3c8be00a0/checkpoint.json`
     - `data/artifacts/models/query_residual_v17__policy=coverage__samples=2__rounds=n=7__sha1=88a5ef803c/checkpoint.json`
     - `data/artifacts/models/query_residual_v17__policy=coverage__samples=2__rounds=n=7__sha1=81af6b89d1/checkpoint.json`
     - `data/artifacts/models/query_residual_v17__policy=coverage__samples=2__rounds=n=7__sha1=7bc2d3ff56/checkpoint.json`
     - `data/artifacts/models/query_residual_v17__policy=coverage__samples=2__rounds=n=7__sha1=ecfd58da91/checkpoint.json`
   - rerunning the exact same command resumed from those cached folds rather than restart from zero
103. Full corrected `query_residual_v17` LOO benchmark complete:
   - artifact:
     - `data/artifacts/benchmarks/agent3_dev_query_residual_v17_full_corrected/result.json`
   - result:
     - mean score `76.1526`
     - mean weighted KL `0.092429`
     - official weighted mean score `75.8777`
     - official weighted mean weighted-KL `0.093612`
     - round mean score std `7.1450`
     - round mean weighted-KL std `0.032463`
     - worst round:
       - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
       - mean score `64.0725`
       - mean weighted KL `0.148504`
     - resumed runtime `569.558s`
104. Interpretation of item 103:
   - `query_residual_v17` is the new best verified full local model here
   - versus prior full leader `query_residual_v16`:
     - mean score `75.4866 -> 76.1526` (`+0.6659`)
     - mean weighted KL `0.095799 -> 0.092429` (`-0.003370`)
     - official weighted mean score `75.2037 -> 75.8777` (`+0.6740`)
     - official weighted mean weighted-KL `0.097000 -> 0.093612` (`-0.003388`)
   - worst-round robustness improved again:
     - worst round remained `f1dac9...`
     - worst-round score improved `61.0810 -> 64.0725`
105. Paired historical comparison vs prior full leader:
   - artifact:
     - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual_v16__candidate=query_residual_v17.json`
   - report:
     - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual_v16__candidate=query_residual_v17.md`
   - result:
     - mean score delta `+0.6659`
     - mean weighted KL delta `-0.003370`
     - win rate `0.750`
     - loss rate `0.250`
     - tie rate `0.000`
     - score-delta CI95 `[0.3818, 1.0002]`
106. Current verified leaderboard after this turn:
   - best fully verified model:
     - `query_residual_v17`
   - previous best:
     - `query_residual_v16`
   - both improvements came from continuing the prior-blend de-anchoring sweep:
     - `0.35 -> 0.25 -> 0.15`
107. Immediate next continuation after the `v17` full win:
   - the prior-blend sweep is still monotone across the verified points
   - next decisive probe:
     - test whether the gains continue down to near-zero prior anchoring, or whether they reverse
108. Implemented near-zero prior-anchor probe:
   - new model name: `query_residual_v18`
   - semantics:
     - same architecture as `query_residual_v17`
     - fixed `samples_per_round=2`
     - fixed `prior_blend=0.05`
   - wiring updated in:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - `tests/test_historical_benchmark.py`
109. Validation after `query_residual_v18` wiring:
   - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result: `24 passed`
110. `query_residual_v18` targeted holdout result:
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v18_targeted_holdout_2rounds_7train/result.json`
   - setup:
     - same representative 2-round/7-train holdout
     - model `query_residual_v18`
     - fixed `samples_per_round=2`
     - fixed `prior_blend=0.05`
     - `policy=coverage`
     - `budget=50`
   - result:
     - mean score `66.6604`
     - mean weighted KL `0.135264`
   - per-round:
     - `36e581...`: score `66.2954`, KL `0.137078`
     - `f1dac9...`: score `67.0255`, KL `0.133450`
111. Interpretation of item 110:
   - the prior-blend sweep remains strongly monotone through `0.05`
   - versus `v17` targeted:
     - score `+1.8175`
     - weighted KL `-0.009255`
   - versus current verified full leader `v17` targeted:
     - both representative hard rounds improved again
   - promotion decision:
     - run full corrected LOO for `query_residual_v18`
112. `query_residual_v18` full corrected LOO status at end of this turn:
   - full run command launched:
     - `uv run astar run-historical-benchmark --model query_residual_v18 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_query_residual_v18_full_corrected`
   - run was intentionally interrupted to avoid leaving an orphan long-running process at turn end
   - cached fold checkpoints already completed for `3/8` held-out folds:
     - `data/artifacts/models/query_residual_v18__policy=coverage__samples=2__rounds=n=7__sha1=c74dbf0a20/checkpoint.json`
     - `data/artifacts/models/query_residual_v18__policy=coverage__samples=2__rounds=n=7__sha1=a3c8be00a0/checkpoint.json`
     - `data/artifacts/models/query_residual_v18__policy=coverage__samples=2__rounds=n=7__sha1=88a5ef803c/checkpoint.json`
   - rerunning the exact same command should resume from those cached folds rather than restart from zero
113. Current verified leaderboard after this turn:
   - best fully verified model:
     - `query_residual_v17`
   - strongest unverified next branch:
     - `query_residual_v18`
     - targeted holdout score `66.6604` vs verified leader targeted `64.8429`
     - full corrected LOO still pending completion
114. Start-of-turn protocol refresh for this continuation:
   - reread `README.md`
   - reread canonical challenge facts in `docs/game_facts.md`
   - reread `instructions/agent3/generic-iteration-protocol-agent3.md`
   - confirmed `instructions/agent3/specific-handoff-information.md` is still empty
   - attempted `br list` per repo instructions; `br` is not installed / not on `PATH` in this environment
115. `query_residual_v18` full corrected LOO resumed this turn from cached state:
   - resumed command:
     - `uv run astar run-historical-benchmark --model query_residual_v18 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_query_residual_v18_full_corrected`
   - benchmark process confirmed live and CPU-active after resume
   - cached completed fold checkpoints currently present:
     - `data/artifacts/models/query_residual_v18__policy=coverage__samples=2__rounds=n=7__sha1=c74dbf0a20/checkpoint.json`
     - `data/artifacts/models/query_residual_v18__policy=coverage__samples=2__rounds=n=7__sha1=a3c8be00a0/checkpoint.json`
     - `data/artifacts/models/query_residual_v18__policy=coverage__samples=2__rounds=n=7__sha1=88a5ef803c/checkpoint.json`
     - `data/artifacts/models/query_residual_v18__policy=coverage__samples=2__rounds=n=7__sha1=81af6b89d1/checkpoint.json`
   - final benchmark artifact still absent at this logging point:
     - `data/artifacts/benchmarks/agent3_dev_query_residual_v18_full_corrected/result.json`
116. While `query_residual_v18` full corrected LOO was still running, I started the next minimal ablation in the same family:
   - hypothesis:
     - the prior-blend sweep has remained monotone across:
       - verified full results `0.35 -> 0.25 -> 0.15`
       - targeted result `0.05`
     - so the next decisive test is whether removing the post-residual prior pullback entirely helps again
   - new planned model:
     - `query_residual_v19`
     - fixed `samples_per_round=2`
     - fixed `prior_blend=0.0`
117. Implemented `query_residual_v19` reproducibly by model name:
   - wiring updated in:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - `tests/test_historical_benchmark.py`
118. Minimal validation for `query_residual_v19` wiring:
   - command:
     - `uv run pytest tests/test_historical_benchmark.py::test_query_residual_v19_online_historical_benchmark_defaults_to_samples_2 -q`
   - result:
     - `1 passed`
119. Full validation after `query_residual_v19` wiring:
   - command:
     - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result:
     - `25 passed`
120. Full corrected `query_residual_v18` LOO benchmark complete:
   - artifact:
     - `data/artifacts/benchmarks/agent3_dev_query_residual_v18_full_corrected/result.json`
   - result:
     - mean score `76.6820`
     - mean weighted KL `0.089763`
     - official weighted mean score `76.4110`
     - official weighted mean weighted-KL `0.090944`
     - round mean score std `6.3492`
     - round mean weighted-KL std `0.028465`
     - worst round:
       - `36e581f1-73f8-453f-ab98-cbe3052b701b`
       - mean score `66.2954`
       - mean weighted KL `0.137078`
     - total runtime `1162.501s`
121. Interpretation of item 120:
   - `query_residual_v18` is the new best verified full local model here
   - versus prior verified leader `query_residual_v17`:
     - mean score `76.1526 -> 76.6820` (`+0.5294`)
     - mean weighted KL `0.092429 -> 0.089763` (`-0.002666`)
     - official weighted mean score `75.8777 -> 76.4110` (`+0.5333`)
     - official weighted mean weighted-KL `0.093612 -> 0.090944` (`-0.002668`)
     - round score std improved `7.1450 -> 6.3492`
   - floor robustness improved again:
     - old worst round `f1dac9...` at `64.0725`
     - new worst round `36e581...` at `66.2954`
122. Paired historical comparison vs prior verified leader:
   - artifact:
     - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual_v17__candidate=query_residual_v18.json`
   - report:
     - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual_v17__candidate=query_residual_v18.md`
   - result:
     - mean score delta `+0.5294`
     - mean weighted KL delta `-0.002666`
     - win rate `0.575`
     - loss rate `0.425`
     - tie rate `0.000`
     - score-delta CI95 `[0.2458, 0.8678]`
123. Exact same representative 2-round/7-train holdout rerun for the zero-anchor probe:
   - implementation path:
     - ad hoc local script using `astar.workflows.model_eval.evaluate_model_on_round`
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v19_targeted_holdout_2rounds_7train/result.json`
   - setup:
     - held out `36e581...` and `f1dac9...`
     - train on the other 7 replay-backed/analyzed rounds for each held-out round
     - model `query_residual_v19`
     - fixed `samples_per_round=2`
     - fixed `prior_blend=0.0`
     - `mode=online_interactive`
     - `policy=coverage`
     - `budget=50`
   - result:
     - mean score `67.5270`
     - mean weighted KL `0.130977`
   - per-round:
     - `36e581...`: score `66.5848`, KL `0.135623`
     - `f1dac9...`: score `68.4692`, KL `0.126332`
124. Interpretation of item 123:
   - the prior-blend sweep remains monotone through `0.0` on the representative hard holdout
   - versus `query_residual_v18` targeted:
     - mean score `+0.8665`
     - mean weighted KL `-0.004287`
   - both held-out hard rounds improved again
   - promotion decision:
     - run full corrected LOO for `query_residual_v19`
125. Current leaderboard after this continuation:
   - best fully verified model:
     - `query_residual_v18`
   - strongest unverified next branch:
     - `query_residual_v19`
     - targeted holdout mean score `67.5270` vs verified leader targeted `66.6604`
126. `query_residual_v19` full corrected LOO launched immediately after the targeted promotion:
   - command:
     - `uv run astar run-historical-benchmark --model query_residual_v19 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_query_residual_v19_full_corrected`
   - run is reusing fold checkpoints already created by the targeted 2-round gate
   - cached fold checkpoints already present at launch logging point:
     - `data/artifacts/models/query_residual_v19__policy=coverage__samples=2__rounds=n=7__sha1=c74dbf0a20/checkpoint.json`
     - `data/artifacts/models/query_residual_v19__policy=coverage__samples=2__rounds=n=7__sha1=a3c8be00a0/checkpoint.json`
   - final artifact still absent at this logging point:
     - `data/artifacts/benchmarks/agent3_dev_query_residual_v19_full_corrected/result.json`
127. Full corrected `query_residual_v19` LOO benchmark complete:
   - artifact:
     - `data/artifacts/benchmarks/agent3_dev_query_residual_v19_full_corrected/result.json`
   - result:
     - mean score `76.8934`
     - mean weighted KL `0.088699`
     - official weighted mean score `76.6227`
     - official weighted mean weighted-KL `0.089883`
     - round mean score std `5.9747`
     - round mean weighted-KL std `0.026655`
     - worst round:
       - `36e581f1-73f8-453f-ab98-cbe3052b701b`
       - mean score `66.5848`
       - mean weighted KL `0.135623`
     - total runtime `1362.353s`
128. Interpretation of item 127:
   - `query_residual_v19` is the new best verified full local model here
   - versus prior verified leader `query_residual_v18`:
     - mean score `76.6820 -> 76.8934` (`+0.2114`)
     - mean weighted KL `0.089763 -> 0.088699` (`-0.001065`)
     - official weighted mean score `76.4110 -> 76.6227` (`+0.2117`)
     - official weighted mean weighted-KL `0.090944 -> 0.089883` (`-0.001061`)
     - round score std improved `6.3492 -> 5.9747`
   - floor robustness improved again:
     - worst-round score `66.2954 -> 66.5848`
     - worst-round KL `0.137078 -> 0.135623`
129. Paired historical comparison vs prior verified leader:
   - artifact:
     - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual_v18__candidate=query_residual_v19.json`
   - report:
     - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual_v18__candidate=query_residual_v19.md`
   - result:
     - mean score delta `+0.2114`
     - mean weighted KL delta `-0.001065`
     - win rate `0.475`
     - loss rate `0.525`
     - tie rate `0.000`
     - score-delta CI95 `[0.0713, 0.3832]`
130. Current leaderboard after this continuation:
   - best fully verified model:
     - `query_residual_v19`
   - previous best:
     - `query_residual_v18`
   - the prior-blend sweep remained monotone across every tested point in this family:
     - `0.35 -> 0.25 -> 0.15 -> 0.05 -> 0.0`
131. Next obvious post-`v19` hypothesis:
   - with `prior_blend` already at its lower bound, the next remaining heuristic anchor is `teacher_blend`
   - earlier `query_residual_v15` showed that removing `teacher_blend` was effectively inert under the older higher-prior regime
   - decisive follow-up:
     - test whether `teacher_blend=0.0` becomes helpful only after the prior anchor is fully removed
132. Implemented `query_residual_v20`:
   - semantics:
     - same architecture as `query_residual_v19`
     - fixed `samples_per_round=2`
     - fixed `prior_blend=0.0`
     - fixed `teacher_blend=0.0`
   - wiring updated in:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - `tests/test_historical_benchmark.py`
133. Validation after `query_residual_v20` wiring:
   - minimal command:
     - `uv run pytest tests/test_historical_benchmark.py::test_query_residual_v20_online_historical_benchmark_defaults_to_samples_2 -q`
   - result:
     - `1 passed`
   - full command:
     - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result:
     - `26 passed`
134. Representative 2-round/7-train holdout result for `query_residual_v20`:
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v20_targeted_holdout_2rounds_7train/result.json`
   - result:
     - mean score `67.5270`
     - mean weighted KL `0.130977`
   - per-round:
     - `36e581...`: score `66.5848`, KL `0.135623`
     - `f1dac9...`: score `68.4692`, KL `0.126332`
135. Interpretation of item 134:
   - `query_residual_v20` is an exact targeted tie with `query_residual_v19` to every reported metric in this probe
   - conclusion:
     - `teacher_blend` remains operationally inert in this family even after driving `prior_blend` to `0.0`
     - do not promote `query_residual_v20`
     - keep `query_residual_v19` as best verified model and current serving candidate
136. Next post-`v20` hypothesis:
   - the remaining conservative local anchor is the exact-cell pseudocount blend
   - current exact-cell shrinkage:
     - `beta_min=8`
     - `beta_scale=24`
   - that is strong smoothing against directly observed cells, so a moderate reduction may let legal exact observations matter more without destabilizing the whole tensor
137. Implemented `query_residual_v21`:
   - semantics:
     - same architecture as `query_residual_v19`
     - fixed `samples_per_round=2`
     - fixed `prior_blend=0.0`
     - reduced exact-cell shrinkage:
       - `beta_min=4.0`
       - `beta_scale=12.0`
   - plumbing change:
     - named query-residual variants now carry `beta_min` / `beta_scale` explicitly, so this variant is reproducible by model name
   - wiring updated in:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - `tests/test_historical_benchmark.py`
138. Validation after `query_residual_v21` wiring:
   - minimal command:
     - `uv run pytest tests/test_historical_benchmark.py::test_query_residual_v21_online_historical_benchmark_defaults_to_samples_2 -q`
   - result:
     - `1 passed`
   - full command:
     - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result:
     - `27 passed`
139. Representative 2-round/7-train holdout result for `query_residual_v21`:
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v21_targeted_holdout_2rounds_7train/result.json`
   - result:
     - mean score `67.9598`
     - mean weighted KL `0.128841`
   - per-round:
     - `36e581...`: score `67.0394`, KL `0.133360`
     - `f1dac9...`: score `68.8802`, KL `0.124323`
140. Interpretation of item 139:
   - `query_residual_v21` is a clear targeted improvement over `query_residual_v19`
   - delta versus current verified leader targeted:
     - mean score `+0.4328`
     - mean weighted KL `-0.002136`
   - both held-out hard rounds improved
   - promotion decision:
     - run full corrected LOO for `query_residual_v21`
141. `query_residual_v21` full corrected LOO launched immediately after promotion:
   - command:
     - `uv run astar run-historical-benchmark --model query_residual_v21 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_query_residual_v21_full_corrected`
   - run is reusing fold checkpoints already created by the targeted 2-round gate
   - cached fold checkpoints already present at launch logging point:
     - `data/artifacts/models/query_residual_v21__policy=coverage__samples=2__rounds=n=7__sha1=c74dbf0a20/checkpoint.json`
     - `data/artifacts/models/query_residual_v21__policy=coverage__samples=2__rounds=n=7__sha1=a3c8be00a0/checkpoint.json`
   - final artifact still absent at this logging point:
     - `data/artifacts/benchmarks/agent3_dev_query_residual_v21_full_corrected/result.json`
142. `query_residual_v21` full corrected LOO status at end of this continuation:
   - run was intentionally stopped cleanly to avoid leaving an orphan long process at turn end
   - no active `query_residual_v21` full benchmark process remains after the stop
   - cached completed fold checkpoints now present for `4/8` held-out folds:
     - `data/artifacts/models/query_residual_v21__policy=coverage__samples=2__rounds=n=7__sha1=c74dbf0a20/checkpoint.json`
     - `data/artifacts/models/query_residual_v21__policy=coverage__samples=2__rounds=n=7__sha1=a3c8be00a0/checkpoint.json`
     - `data/artifacts/models/query_residual_v21__policy=coverage__samples=2__rounds=n=7__sha1=88a5ef803c/checkpoint.json`
     - `data/artifacts/models/query_residual_v21__policy=coverage__samples=2__rounds=n=7__sha1=81af6b89d1/checkpoint.json`
   - final artifact still absent:
     - `data/artifacts/benchmarks/agent3_dev_query_residual_v21_full_corrected/result.json`
   - rerunning the exact same command should resume from those cached folds rather than restart from zero

## Open Questions

- Which benchmark/run currently best on local held-out rounds: `query_residual` vs `historical_bucket_prior`?
- Where exactly are experiment ledgers stored today, if at all?
- Is current validation strong enough for live performance selection, or should it be upgraded to better grouped/chronological round holdouts?
