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
143. New-turn preflight before resuming `query_residual_v21`:
   - reread:
     - `README.md`
     - `docs/game_facts.md`
     - `instructions/agent3/generic-iteration-protocol-agent3.md`
     - `instructions/agent3/specific-handoff-information.md`
   - result:
     - protocol unchanged
     - `specific-handoff-information.md` is empty
   - environment checks:
     - `br` unavailable in this env: `/bin/bash: br: command not found`
     - no active `query_residual_v21` benchmark process
     - final artifact still absent:
       - `data/artifacts/benchmarks/agent3_dev_query_residual_v21_full_corrected/result.json`
     - named-model wiring for `query_residual_v21` still present in:
       - `src/astar/student/predictor/query_residual.py`
       - `src/astar/cli.py`
       - `tests/test_historical_benchmark.py`
   - next action:
     - rerun the exact cached full corrected LOO command for `query_residual_v21`
144. Resumed `query_residual_v21` full corrected LOO:
   - command:
     - `uv run astar run-historical-benchmark --model query_residual_v21 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_query_residual_v21_full_corrected`
   - resumed cleanly from prior cache state
   - observed progress during this continuation:
     - fold checkpoints advanced from `4/8` to `5/8`, then `6/8`, then `7/8`, then full completion
145. Full corrected LOO result for `query_residual_v21`:
   - artifact:
     - `data/artifacts/benchmarks/agent3_dev_query_residual_v21_full_corrected/result.json`
   - result:
     - mean score `76.6799`
     - mean weighted KL `0.089491`
     - official weighted mean score `76.4346`
     - official weighted mean weighted-KL `0.090568`
     - round mean score std `5.6012`
     - round mean weighted-KL std `0.024961`
     - worst round:
       - `36e581f1-73f8-453f-ab98-cbe3052b701b`
       - score `67.0394`
       - KL `0.133360`
146. Interpretation of item 145:
   - `query_residual_v21` improved the two hardest rounds enough to win the old representative 2-round gate, but it did not generalize to full LOO
   - delta versus `query_residual_v19` full:
     - mean score `-0.2135`
     - mean weighted KL `+0.000793`
     - official weighted mean score `-0.1881`
     - official weighted mean weighted-KL `+0.000685`
   - paired comparison artifact:
     - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual_v19__candidate=query_residual_v21.json`
   - paired comparison result:
     - win rate `0.425`
     - loss rate `0.575`
     - score-delta CI95 `[-0.4171, -0.0159]`
   - round-level diagnosis:
     - gains:
       - `36e581...` `+0.4546`
       - `f1dac9...` `+0.4110`
       - `c5cdf1...` `+0.2850`
       - `fd3c92...` `+0.0473`
     - losses:
       - `71451d...` `-0.4009`
       - `76909e...` `-1.1698`
       - `8e8399...` `-0.1341`
       - `ae7800...` `-1.2006`
   - conclusion:
     - the `beta_min=4`, `beta_scale=12` shrinkage cut is too aggressive
     - do not promote `query_residual_v21`
     - keep `query_residual_v19` as best verified model
147. Next post-`v21` hypothesis:
   - exact-cell shrinkage is still promising because the hardest rounds improved, but the `v21` step overshot
   - decisive next test:
     - interpolate between `v19` and `v21` with a milder shrinkage reduction rather than switching families
148. Implemented `query_residual_v22`:
   - semantics:
     - same architecture as `query_residual_v19`
     - fixed `samples_per_round=2`
     - fixed `prior_blend=0.0`
     - interpolated exact-cell shrinkage:
       - `beta_min=6.0`
       - `beta_scale=18.0`
   - wiring updated in:
     - `src/astar/student/predictor/query_residual.py`
     - `src/astar/cli.py`
     - `tests/test_historical_benchmark.py`
149. Validation after `query_residual_v22` wiring:
   - minimal command:
     - `uv run pytest tests/test_historical_benchmark.py::test_query_residual_v22_online_historical_benchmark_defaults_to_samples_2 -q`
   - result:
     - `1 passed`
   - full command:
     - `uv run pytest tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_online_episode.py tests/test_synthetic_benchmark.py tests/test_synthetic_tournament.py tests/test_compare_synthetic_benchmarks.py -q`
   - result:
     - `28 passed`
150. Invalid quick probe discovered and rejected for `query_residual_v22`:
   - I initially ran:
     - `uv run astar run-historical-benchmark --model query_residual_v22 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_query_residual_v22_targeted_holdout_2rounds_7train --round-id 36e581... --round-id f1dac9...`
   - result artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v22_targeted_holdout_2rounds_7train/result.json`
   - why invalid:
     - that CLI path trains only on the explicitly selected rounds minus the held-out round
     - with two selected rounds, it is a 1-train protocol, not the intended “train on all other historical rounds” probe
   - observed score was catastrophically low, but it is not comparable to prior targeted-holdout artifacts and must not be used for selection
151. Validation-process correction:
   - the longstanding artifact label `targeted_holdout_2rounds_7train` is internally inconsistent with the current round universe
   - evidence:
     - historical artifacts list only `8` total round ids
     - holding out `2` of those implies `6` training rounds, not `7`
     - the old artifacts also store `training_round_count=7`, so that metadata is inconsistent
   - correction adopted going forward:
     - use explicit held-out rounds plus “all other available replay-backed analyzed rounds” as training
     - store corrected results under `*_targeted_holdout_2rounds_7train_corrected` for continuity, but interpret them as the corrected all-other-rounds gate
152. Corrected targeted holdout controls rerun under the current repo state:
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - training set:
     - all other currently discoverable replay-backed analyzed rounds
   - artifacts:
     - `data/artifacts/benchmarks/agent3_query_residual_v19_targeted_holdout_2rounds_7train_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_query_residual_v21_targeted_holdout_2rounds_7train_corrected/result.json`
   - results:
     - `query_residual_v19`: mean score `66.9258`, mean weighted KL `0.134304`
     - `query_residual_v21`: mean score `67.4214`, mean weighted KL `0.131788`
   - interpretation:
     - ranking matches the earlier qualitative story (`v21 > v19`) even though absolute values differ from the older artifact
153. Corrected targeted holdout result for `query_residual_v22`:
   - artifact:
     - `data/artifacts/benchmarks/agent3_query_residual_v22_targeted_holdout_2rounds_7train_corrected/result.json`
   - result:
     - mean score `67.1409`
     - mean weighted KL `0.133213`
   - per-round:
     - `36e581...`: score `64.2118`, KL `0.147749`
     - `f1dac9...`: score `70.0700`, KL `0.118677`
   - comparison on corrected gate:
     - versus `query_residual_v19`:
       - score `+0.2150`
       - KL `-0.001091`
     - versus `query_residual_v21`:
       - score `-0.2806`
       - KL `+0.001425`
154. Interpretation of item 153:
   - the interpolated shrinkage step recovered part of the hard-round win without matching the overly aggressive `v21`
   - because `v21` failed full LOO and `v22` is the milder interpolation that still beats `v19` on the corrected targeted gate, `v22` is promoted to full corrected LOO
155. Strategy pivot after explicit user override:
   - stop treating `query_residual` as the main research target
   - new objective:
     - develop genuinely new non-`query_residual` model families and explore them aggressively in parallel
   - reason for the earlier focus:
     - inherited handoff state and checkpoint momentum were entirely on the `query_residual` family
   - that instruction is now superseded by the user
156. New-family codebase scan result:
   - strongest existing non-`query_residual` base is still `historical_bucket_prior`
   - existing replay-backed teacher/student stack was present but not exposed in live/interactive benchmarking:
     - `HazardTeacher`
     - `SummaryBankStudent`
   - shortest high-upside new family:
     - blend replay-student teacher output with `historical_bucket_prior` rather than using raw teacher output alone
157. Implemented new non-`query_residual` family:
   - model names:
     - `teacher_student_blend`
     - `teacher_student_blend_v1`
     - `teacher_student_blend_v2`
   - architecture:
     - base tensor:
       - `HistoricalBucketPriorPredictor`
     - online evidence posterior:
       - `SummaryBankStudent`
     - replay decoder:
       - `HazardTeacher.posterior_predictive()`
     - serving rule:
       - query-count-weighted blend of teacher/student posterior tensor with the historical bucket prior
   - current named variants:
     - `teacher_student_blend_v1`
       - `samples_per_round=4`
       - `k_neighbors=7`
       - `teacher_weight_max=0.4`
       - `query_count_scale=20`
     - `teacher_student_blend_v2`
       - `samples_per_round=8`
       - `k_neighbors=11`
       - `teacher_weight_max=0.4`
       - `query_count_scale=20`
158. New-family implementation details:
   - added checkpoint loading for replay teacher:
     - `src/astar/teacher/dynamics/hazard_teacher.py`
   - added checkpoint loading + remapped-path tolerance for saved summary-bank checkpoints:
     - `src/astar/student/posterior/deepset_student.py`
   - added scoped train/load/cache path for teacher-student blend predictors:
     - `src/astar/student/predictor/summary_bank.py`
   - wired new family into live/online predictor factory:
     - `src/astar/student/predictor/interactive.py`
   - wired new family into historical/prior benchmark resolution and sample-count reporting:
     - `src/astar/workflows/model_eval.py`
     - `src/astar/workflows/historical_benchmark.py`
   - exposed new model names through CLI:
     - `src/astar/cli.py`
   - added online historical benchmark smoke coverage:
     - `tests/test_historical_benchmark.py`
159. Validation after new-family wiring:
   - focused smoke:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v1_online_historical_benchmark_defaults_to_samples_4 -q`
   - result:
     - `1 passed`
   - broader:
     - `uv run pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
   - result:
     - `24 passed`
160. Infrastructure state relevant to the new parallel exploration phase:
   - workspace now also has a concurrent improvement adding `--jobs` to `run-historical-benchmark`
   - that makes full held-out evaluation of new families much cheaper on available hardware
161. Immediate next action after item 160:
   - launch full 8-round online-interactive historical benchmarks for:
     - `teacher_student_blend_v1`
     - `teacher_student_blend_v2`
   - use `--jobs 8` with BLAS thread caps to exploit hardware without oversubscription
162. Repo/protocol refresh at restart of the new-family push:
   - re-read:
     - `README.md`
     - `docs/game_facts.md`
     - `instructions/agent3/generic-iteration-protocol-agent3.md`
   - `instructions/agent3/specific-handoff-information.md` is empty
   - `br list` is unavailable in this workspace (`br: command not found`), so experiment tracking remains in this file plus benchmark artifacts
163. Sanity audit of the new `teacher_student_blend` family before large runs:
   - current serving stack:
     - base prior: `HistoricalBucketPriorPredictor`
     - online posterior: `SummaryBankStudent`
     - replay decoder: `HazardTeacher.posterior_predictive()`
   - current student summary is intentionally simple:
     - per-seed query count
     - per-seed observed class frequencies
     - mean settlement stats
   - immediate concern:
     - this summary discards viewport geometry / spatial coverage structure and is probably too lossy for strong round-regime retrieval
164. Parallel-expansion plan from item 163:
   - launch real full historical benchmarks for `teacher_student_blend_v1` and `teacher_student_blend_v2`
   - while those run, inspect synthetic artifact + evidence schemas and upgrade the student representation toward spatially richer query summaries
165. New hypothesis for the `teacher_student_blend` family:
   - current failure mode is likely not “teacher/student concept is bad”
   - likely issue:
     - the student retrieval geometry is too weak
   - evidence:
     - current `SummaryBankStudent` uses raw Euclidean kNN over only:
       - per-seed query count
       - global observed class frequencies
       - mean settlement stats
     - it discards:
       - spatial coverage layout
       - repeated-window structure
       - local class composition
   - intervention:
     - add versioned summary encoders
     - add feature normalization
     - add a spatial pooled evidence encoder for new named variants only
166. Implemented richer summary-bank internals without mutating `teacher_student_blend_v1/v2`:
   - `SummaryBankStudent` now supports:
     - `summary_encoder`
     - `normalize_summary`
     - saved `feature_mean` / `feature_scale`
   - added encoder variants:
     - `summary_v1`
     - `summary_spatial_v2`
   - `summary_spatial_v2` adds:
     - repeated-window features
     - observed coverage fraction
     - pooled coverage intensity map
     - pooled observed-count map
     - pooled local class-frequency maps for dynamic classes
167. Added new named model variants built on item 166:
   - `teacher_student_blend_v3`
     - `samples_per_round=4`
     - `k_neighbors=5`
     - `teacher_weight_max=0.50`
     - `query_count_scale=15`
     - `summary_encoder=summary_spatial_v2`
     - `normalize_summary=true`
   - `teacher_student_blend_v4`
     - `samples_per_round=8`
     - `k_neighbors=7`
     - `teacher_weight_max=0.55`
     - `query_count_scale=15`
     - `summary_encoder=summary_spatial_v2`
     - `normalize_summary=true`
168. Reproducibility / correctness fixes for the new family:
   - summary-bank model checkpoints are now keyed by the actual replay-backed round scope even when `round_ids` was omitted
   - cached synthetic datasets are now checked against the requested round-id set before reuse
   - historical benchmark now raises a clear error if `teacher_student_blend*` is asked to do holdout eval with fewer than `2` replay-backed analyzed rounds
169. Parallel benchmarking infrastructure fix discovered from the first `teacher_student_blend_v2` full run:
   - failure mode:
     - DuckDB catalog writer lock contention under `run-historical-benchmark --jobs 8` plus parallel top-level runs
   - fix:
     - serialize catalog writes with a filesystem lock in `src/astar/infra/catalog/db.py`
     - also lengthened DuckDB connect retry schedule
   - explicit smoke validation:
     - `64` concurrent process writes into a scratch catalog completed successfully
170. Validation after items 166-169:
   - `uv run pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
   - result:
     - `26 passed`
   - added coverage:
     - `teacher_student_blend_v4` default-sample historical benchmark smoke
     - spatial-encoder checkpoint roundtrip smoke
171. Next hypothesis after the spatial encoder:
   - pooled spatial maps may still be too generic / too high-dimensional for only `8` historical rounds
   - stronger compact alternative:
     - summarize evidence on the same semantic masks the hazard teacher/regime uses:
       - buildable
       - coast
       - inland
       - frontier
       - maritime-access
   - add settlement-structure features:
     - mean settlement count
     - alive fraction
     - port fraction
     - owner-count / concentration summaries
172. Implemented semantic evidence path:
   - `SeedEvidenceBundle` now also stores:
     - `mean_settlement_count`
     - `alive_fraction`
     - `port_fraction`
     - `owner_count`
     - `largest_owner_share`
     - `owner_hhi`
   - added summary encoder:
     - `summary_semantic_v3`
   - encoder content:
     - base global evidence summary
     - repeated-window / global coverage features
     - settlement-structure features
     - mask-conditioned observed frequency summaries on:
       - buildable
       - coast
       - inland
       - frontier
       - maritime
173. New semantic model variants added on top of item 172:
   - `teacher_student_blend_v5`
     - `samples_per_round=4`
     - `k_neighbors=5`
     - `teacher_weight_max=0.55`
     - `summary_encoder=summary_semantic_v3`
     - `normalize_summary=true`
   - `teacher_student_blend_v6`
     - `samples_per_round=8`
     - `k_neighbors=7`
     - `teacher_weight_max=0.60`
     - `summary_encoder=summary_semantic_v3`
     - `normalize_summary=true`
   - validation:
     - `uv run pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
     - result:
       - `28 passed`
     - added coverage:
     - semantic-encoder checkpoint roundtrip smoke
      - `teacher_student_blend_v6` default-sample historical benchmark smoke
174. Next hypothesis after the semantic kNN branch:
   - even compact semantic summaries may still be a poor fit for pure nearest-neighbor retrieval
   - stronger alternative:
     - learn a direct ridge map from live semantic evidence summary to round regime vector
   - rationale:
     - should interpolate across rounds instead of snapping to nearest stored transcripts
     - likely better with only a handful of replay-backed rounds
175. Implemented ridge-head summary-bank path:
   - `SummaryBankStudent` now supports:
     - `inference_head=knn`
     - `inference_head=ridge`
     - `ridge_alpha`
     - saved/loadable regime intercept + regime weights
   - `ridge` head outputs a deterministic regime posterior mean from the summary vector
176. New ridge-semantic model variants:
   - `teacher_student_blend_v7`
     - `samples_per_round=4`
     - `summary_encoder=summary_semantic_v3`
     - `inference_head=ridge`
     - `ridge_alpha=2.0`
     - `teacher_weight_max=0.60`
   - `teacher_student_blend_v8`
     - `samples_per_round=8`
     - `summary_encoder=summary_semantic_v3`
     - `inference_head=ridge`
     - `ridge_alpha=2.0`
     - `teacher_weight_max=0.65`
177. Validation after item 175-176:
   - `uv run pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
   - result:
     - `30 passed`
   - added coverage:
     - semantic-ridge checkpoint roundtrip smoke
     - `teacher_student_blend_v8` default-sample historical benchmark smoke
178. Next hypothesis after the semantic-ridge branch:
   - collapsing the whole transcript to one summary may still discard informative trajectory shape
   - test whether early-vs-late evidence evolution matters by explicitly encoding:
     - full transcript summary
     - first-half summary
     - second-half summary
     - second-minus-first delta
179. Implemented temporal summary encoder:
   - added `summary_temporal_v4`
   - inputs:
     - full semantic summary
     - first-half semantic summary
     - second-half semantic summary
     - half-to-half delta
   - this uses raw ordered observations from `LiveInferenceContext`, not only the collapsed evidence bundle
180. New temporal-ridge variants:
   - `teacher_student_blend_v9`
     - `samples_per_round=4`
     - `summary_encoder=summary_temporal_v4`
     - `inference_head=ridge`
     - `teacher_weight_max=0.65`
     - `query_count_scale=12`
   - `teacher_student_blend_v10`
     - `samples_per_round=8`
     - `summary_encoder=summary_temporal_v4`
     - `inference_head=ridge`
     - `teacher_weight_max=0.70`
     - `query_count_scale=12`
181. Validation after item 178-180:
   - `uv run pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
   - result:
     - `32 passed`
   - added coverage:
     - temporal-ridge checkpoint roundtrip smoke
     - `teacher_student_blend_v10` default-sample historical benchmark smoke
182. Benchmark wave launched after items 165-181:
   - full corrected LOO in flight for:
     - `teacher_student_blend_v1`
     - `teacher_student_blend_v3`
     - `teacher_student_blend_v4`
     - `teacher_student_blend_v5`
     - `teacher_student_blend_v6`
     - `teacher_student_blend_v7`
     - `teacher_student_blend_v8`
     - `teacher_student_blend_v9`
     - `teacher_student_blend_v10`
   - corrected 2-round explicit holdout gates in flight for:
     - `teacher_student_blend_v4`
     - `teacher_student_blend_v5`
     - `teacher_student_blend_v6`
     - `teacher_student_blend_v7`
     - `teacher_student_blend_v8`
     - `teacher_student_blend_v9`
     - `teacher_student_blend_v10`
   - held-out rounds for the corrected targeted gate:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - training set for that gate:
     - all other currently analyzed historical rounds
183. Next hypothesis after the temporal-ridge branch:
   - predicting the regime vector may still be an unnecessary bottleneck because the hazard teacher itself maps regime -> coefficient vector linearly
   - test a more direct student:
     - live evidence summary -> teacher coefficient vector -> terminal tensor decode
184. Implemented coefficient-head summary-bank path:
   - `HazardTeacher` now exposes public coefficient decode:
     - `terminal_tensor_from_coefficients(...)`
   - `SummaryBankStudent` now supports:
     - `inference_head=coefficient_ridge`
   - for this head:
     - training target is the teacher coefficient vector for the round
     - prediction decodes terminal probabilities directly from predicted coefficients
185. New temporal coefficient-ridge variants:
   - `teacher_student_blend_v11`
     - `samples_per_round=4`
     - `summary_encoder=summary_temporal_v4`
     - `inference_head=coefficient_ridge`
     - `teacher_weight_max=0.70`
   - `teacher_student_blend_v12`
     - `samples_per_round=8`
     - `summary_encoder=summary_temporal_v4`
     - `inference_head=coefficient_ridge`
     - `teacher_weight_max=0.75`
186. Validation after item 183-185:
   - `uv run pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
   - result:
     - `34 passed`
   - added coverage:
     - temporal coefficient-head checkpoint roundtrip smoke
     - `teacher_student_blend_v12` default-sample historical benchmark smoke
187. Additional benchmark expansion after item 186:
   - corrected 2-round explicit holdout gates launched for:
     - `teacher_student_blend_v11`
     - `teacher_student_blend_v12`
   - full corrected LOO launched for:
     - `teacher_student_blend_v11`
     - `teacher_student_blend_v12`
188. Current active new-family benchmark sweep now covers:
   - full corrected LOO:
     - `teacher_student_blend_v1`
     - `teacher_student_blend_v3`
     - `teacher_student_blend_v4`
     - `teacher_student_blend_v5`
     - `teacher_student_blend_v6`
     - `teacher_student_blend_v7`
     - `teacher_student_blend_v8`
     - `teacher_student_blend_v9`
     - `teacher_student_blend_v10`
     - `teacher_student_blend_v11`
     - `teacher_student_blend_v12`
   - corrected 2-round holdout:
     - `teacher_student_blend_v4`
     - `teacher_student_blend_v5`
     - `teacher_student_blend_v6`
     - `teacher_student_blend_v7`
     - `teacher_student_blend_v8`
     - `teacher_student_blend_v9`
     - `teacher_student_blend_v10`
     - `teacher_student_blend_v11`
     - `teacher_student_blend_v12`
189. Status at end of this iteration burst:
   - no new-family benchmark artifact has finished yet under the enlarged sweep
   - latest pushed source commit after the coefficient-head branch:
     - `814b63e`
   - latest pushed ledger-only checkpoint after recording the sweep:
     - pending immediate push from current worktree
190. Re-read required docs before continuing:
   - `README.md`
   - `docs/game_facts.md`
   - `instructions/agent3/generic-iteration-protocol-agent3.md`
   - `instructions/agent3/specific-handoff-information.md`
   - result:
     - specific handoff file is still empty
     - generic protocol still implies continuing the assigned new-family search, not returning to `query_residual`
191. Current next-hypothesis batch before more edits:
   - current summary-bank family is still too shallow:
     - hand-built summary vector
     - global linear or local `kNN` head
     - one scalar round-level teacher/base blend weight
   - next two tests to implement:
     - hybrid local+global student head:
       - linear coefficient prediction plus nearest-neighbor residual correction
     - spatially gated blend:
       - concentrate teacher blend weight on buildable / frontier / observed cells instead of one uniform scalar
192. Implemented hybrid coefficient-residual student head:
   - added new summary-bank inference head:
     - `coefficient_residual_knn`
   - fit path:
     - global ridge prediction of teacher coefficient vector
     - nearest-neighbor residual correction in coefficient space
   - checkpoint path now persists coefficient target bank so the residual head is reproducible from model name alone
193. Implemented spatial dynamic blend mode in `SummaryBankRoundPredictor`:
   - kept old `global` scalar blend as baseline path
   - new `spatial_dynamic` path scales teacher weight per cell using:
     - buildable mask
     - frontier score
     - coast flag
     - maritime access
     - whether the cell has been directly observed by queries
   - hypothesis:
     - teacher mass should concentrate on dynamic / high-entropy land instead of being diluted uniformly over the whole map
194. Added new named variants for the new branch:
   - global blend + coefficient residual:
     - `teacher_student_blend_v13`
     - `teacher_student_blend_v14`
   - spatial dynamic blend + coefficient residual:
     - `teacher_student_blend_v15`
     - `teacher_student_blend_v16`
   - all four are reproducible by model name alone and wired into CLI choices / benchmark resolution
195. Validation expansion for the new branch:
   - added temporal coefficient-residual checkpoint roundtrip coverage
   - added historical benchmark smoke for `teacher_student_blend_v16`
   - focused validation command launched:
     - `uv run pytest tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
196. Validation result for item 195:
   - result:
     - `36 passed`
   - latest pushed source commit after the residual / spatial branch:
     - `d4b4e01`
197. New benchmark expansion after item 196:
   - full corrected LOO launched for:
     - `teacher_student_blend_v13`
     - `teacher_student_blend_v14`
     - `teacher_student_blend_v15`
     - `teacher_student_blend_v16`
   - launch shape:
     - mode: `online_interactive`
     - policy: `coverage`
     - budget: `50`
     - `jobs=12` per run
     - artifact roots:
     - `data/artifacts/benchmarks/agent3_dev_teacher_student_blend_v13_full/`
     - `data/artifacts/benchmarks/agent3_dev_teacher_student_blend_v14_full/`
     - `data/artifacts/benchmarks/agent3_dev_teacher_student_blend_v15_full/`
     - `data/artifacts/benchmarks/agent3_dev_teacher_student_blend_v16_full/`
198. Post-OOM process correction:
   - re-read the handoff and adopted an explicit machine-wide launch rule:
     - check `free -h`
     - check top RSS processes
     - check all active `astar` / `pytest` / related python jobs
     - choose concurrency from global headroom, not per-run intuition
   - current clean-state check before resuming:
     - available memory: about `2.9 TiB`
     - active `astar` / `pytest` jobs: none
199. Validation-process upgrade after item 198:
   - added a proper corrected targeted-holdout workflow:
     - `src/astar/workflows/targeted_holdout_benchmark.py`
   - semantics:
     - evaluate only the explicit held-out rounds
     - train on all other discoverable rounds
     - for `online_interactive`, training pool is restricted to replay-backed rounds so metadata stays correct
   - this replaces ad hoc / invalid two-round CLI shortcuts for fast local gating
200. Validation for the targeted-holdout workflow:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training tests/test_historical_benchmark.py::test_teacher_student_blend_v16_online_historical_benchmark_defaults_to_samples_8 tests/test_teacher_student.py::test_summary_bank_student_temporal_coefficient_residual_checkpoint_roundtrip -q`
   - result:
     - `3 passed`
201. Corrected targeted-holdout sweep for the new residual branch:
   - launched for:
     - `teacher_student_blend_v13`
     - `teacher_student_blend_v14`
     - `teacher_student_blend_v15`
     - `teacher_student_blend_v16`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - training pool:
     - all other replay-backed analyzed rounds
   - launch correction:
     - `jobs=2` inside an inline `python - <<'PY'` entrypoint fails under multiprocessing spawn because `__main__` becomes `<stdin>`
     - reran with `jobs=1` inside each model and kept only outer model parallelism
202. Machine-wide health at item 201 relaunch:
   - other agents had already started large jobs again
   - snapshot after relaunch:
     - memory used: about `410 GiB`
     - memory available: about `2.5 TiB`
   - my four corrected holdout runs were each about `7.7-8.2 GiB` RSS
   - decision:
     - do not add more concurrent benchmark processes until the current gate finishes
203. Next hypothesis after item 201:
   - even spatial dynamic blending can still overtrust the teacher when the live evidence summary is far from the training summary bank
   - implemented confidence-gated teacher blending:
     - student now stores a typical nearest-neighbor summary distance scale
     - predictor can downweight teacher blend when the current summary is out-of-bank
   - new variants:
     - `teacher_student_blend_v17`
     - `teacher_student_blend_v18`
   - focused validation:
     - initial run exposed one numpy bug:
       - `np.median(..., dtype=...)` invalid
     - fixed immediately
     - rerun result:
       - `3 passed`
204. Monitoring update while item 201 gate continues:
   - no `teacher_student_blend_v13..v16` artifact has finished yet
   - machine-wide memory snapshot after more agents ramped up:
     - memory used: about `459 GiB`
     - memory available: about `2.5 TiB`
   - my four active corrected holdout runs had grown to about `19.8-29.6 GiB` RSS each
   - decision still holds:
     - do not add more benchmark processes until the current gate lands a ranking
205. Next model hypothesis after item 204:
   - current teacher blend still keys off round-total query count
   - that ignores which seed actually received informative coverage
   - test a seed-adaptive teacher weight:
     - increase blend when a seed has more direct evidence / buildable coverage
     - decrease blend when a seed has sparse or repetitive evidence
206. Implemented seed-adaptive teacher weighting:
   - new teacher-weight mode:
     - `seed_adaptive`
   - evidence signal now combines:
     - per-seed query count
     - buildable-cell coverage fraction
     - repeated-window penalty
   - new variants:
     - `teacher_student_blend_v19`
     - `teacher_student_blend_v20`
   - both sit on top of:
     - temporal summary encoder
     - coefficient-residual head
     - spatial dynamic blending
     - confidence gating
207. Validation for item 206:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v20_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training tests/test_teacher_student.py::test_summary_bank_student_temporal_coefficient_residual_checkpoint_roundtrip -q`
   - result:
     - `3 passed`
208. Launch-path hardening after item 201:
   - added real file-backed targeted holdout launcher:
     - `scripts/run_targeted_holdout_benchmark.py`
   - reason:
     - avoid multiprocessing spawn failure from inline `python - <<'PY'`
     - future corrected holdout runs can now use file-backed `__main__`
   - smoke:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --help`
     - passed
209. Repo/task startup hygiene note:
   - attempted required `br list`
   - result:
     - `br: command not found`
   - continued without beads because the tool is unavailable in this environment
210. Machine-wide health check before next outer wave:
   - snapshot:
     - memory used: about `621 GiB`
     - memory available: about `2.3 TiB`
   - active first-wave agent3 runs:
     - `teacher_student_blend_v13`
     - `teacher_student_blend_v14`
     - `teacher_student_blend_v15`
     - `teacher_student_blend_v16`
   - decision:
     - enough headroom remained for another outer wave with `jobs=1` per model
211. Second corrected-holdout outer wave launched:
   - file-backed launcher used:
     - `scripts/run_targeted_holdout_benchmark.py`
   - models:
     - `teacher_student_blend_v17`
     - `teacher_student_blend_v18`
     - `teacher_student_blend_v19`
     - `teacher_student_blend_v20`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - launch policy:
     - `jobs=1` inside each model
     - outer model parallelism only
212. New hypothesis after item 211:
   - current `teacher_student_blend` uses the query transcript only through a global / seed summary bank
   - it still does not inject exact observed per-cell terminal frequencies into the final tensor
   - test whether a local empirical-Bayes posterior update on observed cells improves calibration and score without changing the family backbone
213. Implemented exact local evidence posterior variants:
   - added observed-cell posterior correction on top of the blended base/teacher prediction:
     - posterior uses observed class counts at queried cells
     - shrinkage stays tied to local prior entropy via `beta_min` / `beta_scale`
   - new variants:
     - `teacher_student_blend_v21`
     - `teacher_student_blend_v22`
   - both keep:
     - temporal summary encoder
     - coefficient-residual head
     - spatial dynamic blending
     - confidence gate
     - seed-adaptive teacher weighting
214. Validation for item 213:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_exact_local_evidence_posterior_uses_observed_counts tests/test_teacher_student.py::test_summary_bank_student_temporal_coefficient_residual_checkpoint_roundtrip tests/test_historical_benchmark.py::test_teacher_student_blend_v22_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `4 passed`
215. Machine-wide health check before local-evidence gate launch:
   - snapshot:
     - memory used: about `875 GiB`
     - memory available: about `2.1 TiB`
   - other agents remain active with many `15-58 GiB` workers
   - decision:
     - safe to add only two more outer runs
     - keep `jobs=1`
216. Third corrected-holdout outer wave launched:
   - file-backed launcher:
     - `scripts/run_targeted_holdout_benchmark.py`
   - models:
     - `teacher_student_blend_v21`
     - `teacher_student_blend_v22`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - launch policy:
     - `jobs=1` inside each model
     - outer model parallelism only
217. Family-doc scaffold created for the active post-pivot branch:
   - added:
     - `docs/experiments/teacher_student_blend/README.md`
     - `docs/experiments/teacher_student_blend/hypotheses.md`
     - `docs/experiments/teacher_student_blend/best_models.md`
     - `docs/experiments/teacher_student_blend/open_questions.md`
   - purpose:
     - satisfy the reusable handoff protocol
     - keep family-level notes separate from the timestamped execution ledger
218. Repo/task startup hygiene repeated this turn:
   - re-read `instructions/agent3/generic-iteration-protocol-agent3.md`
   - re-ran required `br list`
   - result:
     - `br: command not found`
219. Machine-wide health before the next branch this turn:
   - snapshot:
     - memory used: about `1.3 TiB`
     - memory available: about `1.6 TiB`
   - other agents are now much heavier than earlier:
     - several `agent5` workers at roughly `24-65 GiB`
     - multiple `agent1` and other-agent benchmark jobs still live
   - my active corrected holdouts:
     - `teacher_student_blend_v13` through `v22`
   - decision:
     - still enough headroom for a narrow next branch only
     - keep `jobs=1`
220. New hypothesis after item 219:
   - exact observed-cell posterior updates fix only the cells directly seen by queries
   - the transcript should also contain local spatial signal for nearby unobserved cells
   - test a blurred local residual update:
     - diffuse empirical residuals from observed cells into nearby unobserved cells
     - preserve exact observed-cell correction separately
221. Implemented blurred local evidence variants:
   - added local Gaussian-blur residual update on top of the existing blended prediction
   - update acts only on unobserved cells
   - exact observed-cell posterior correction remains as the final step
   - new variants:
     - `teacher_student_blend_v23`
     - `teacher_student_blend_v24`
222. Validation for item 221:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_local_blur_evidence_updates_neighboring_unobserved_cells tests/test_teacher_student.py::test_summary_bank_exact_local_evidence_posterior_uses_observed_counts tests/test_teacher_student.py::test_summary_bank_student_temporal_coefficient_residual_checkpoint_roundtrip tests/test_historical_benchmark.py::test_teacher_student_blend_v24_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `5 passed`
223. Machine-wide health before blurred-local gate launch:
   - snapshot:
     - memory used: about `951 GiB`
     - memory available: about `2.0 TiB`
   - despite other-agent heavy sweeps, this left enough headroom for two more outer runs
   - decision:
     - launch only `v23` and `v24`
     - keep `jobs=1`
224. Fourth corrected-holdout outer wave launched:
   - file-backed launcher:
     - `scripts/run_targeted_holdout_benchmark.py`
   - models:
     - `teacher_student_blend_v23`
     - `teacher_student_blend_v24`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - launch policy:
     - `jobs=1` inside each model
     - outer model parallelism only
225. Iteration-speed hypothesis after item 224:
   - `teacher_student_blend` still refit the same base prior and hazard teacher once per model variant
   - that wastes compute because those components depend only on the training round scope, not on the student head variant
   - goal:
     - share base-prior and hazard-teacher checkpoints across variants with the same round scope
226. Implemented shared-cache refactor for summary-bank variants:
   - shared checkpoint names now key only on training round scope for:
     - base prior
     - hazard teacher
   - model-specific checkpoints now only own the student state
227. Bug exposed and fixed during item 226:
   - `HazardTeacher.load_checkpoint()` previously discarded `coefficient_bank`
   - that was harmless for online prediction but broke reusing a saved teacher for fitting coefficient-head students
   - fixed by persisting and restoring:
     - `regime_bank`
     - `coefficient_bank`
228. Validation for items 226-227:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_variants_share_base_prior_and_teacher_cache tests/test_teacher_student.py::test_summary_bank_local_blur_evidence_updates_neighboring_unobserved_cells tests/test_teacher_student.py::test_summary_bank_student_temporal_coefficient_residual_checkpoint_roundtrip tests/test_historical_benchmark.py::test_teacher_student_blend_v24_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `5 passed`
229. New hypothesis after item 228:
   - blurred local evidence is useful, but unconstrained diffusion can still leak signal into geometrically implausible cells
   - test geometry-gated blur:
     - allow diffusion only on land with stronger weight on buildable/frontier/coastal/maritime cells
230. Implemented geometry-gated blur variants:
   - new variants:
     - `teacher_student_blend_v25`
     - `teacher_student_blend_v26`
   - they keep:
     - temporal summary encoder
     - coefficient-residual student head
     - seed-adaptive teacher weighting
     - confidence gate
     - exact observed-cell posterior update
     - blurred local residual diffusion
   - added a direct unit test that a zeroed spatial gate suppresses the blur update entirely
231. Validation for item 230:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_local_blur_evidence_respects_spatial_gate tests/test_teacher_student.py::test_summary_bank_variants_share_base_prior_and_teacher_cache tests/test_teacher_student.py::test_summary_bank_local_blur_evidence_updates_neighboring_unobserved_cells tests/test_historical_benchmark.py::test_teacher_student_blend_v26_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `5 passed`
232. New hypothesis after item 231:
   - even geometry-gated blur may overpropagate the dominant empty class
   - test class-weighted diffusion:
     - emphasize settlement / port / ruin signal
     - suppress empty and mountain spill
233. Implemented class-weighted blur variants:
   - new variants:
     - `teacher_student_blend_v27`
     - `teacher_student_blend_v28`
   - class weights for blurred local diffusion:
     - empty `0.25`
     - settlement `1.0`
     - port `1.25`
     - ruin `1.0`
     - forest `0.5`
     - mountain `0.0`
   - added direct unit test that zero class-scale suppresses the blur update entirely
234. Validation for item 233:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_local_blur_evidence_respects_class_scale tests/test_teacher_student.py::test_summary_bank_local_blur_evidence_respects_spatial_gate tests/test_teacher_student.py::test_summary_bank_variants_share_base_prior_and_teacher_cache tests/test_historical_benchmark.py::test_teacher_student_blend_v28_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `5 passed`
235. Machine-wide health before extending the queue again:
   - snapshot:
     - memory used: about `985 GiB`
     - memory available: about `1.9 TiB`
   - observed active corrected-holdout processes on this branch:
     - `teacher_student_blend_v17`
     - `teacher_student_blend_v18`
     - `teacher_student_blend_v19`
     - `teacher_student_blend_v20`
     - `teacher_student_blend_v21`
     - `teacher_student_blend_v22`
     - `teacher_student_blend_v23`
     - `teacher_student_blend_v24`
     - `teacher_student_blend_v25`
     - `teacher_student_blend_v26`
   - decision:
     - headroom remained large enough for one more narrow outer wave
     - keep `jobs=1`
236. Fifth corrected-holdout outer wave launched:
   - file-backed launcher:
     - `scripts/run_targeted_holdout_benchmark.py`
   - models:
     - `teacher_student_blend_v27`
     - `teacher_student_blend_v28`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - launch policy:
     - `jobs=1` inside each model
     - outer model parallelism only
237. Re-read iteration protocol + repo facts before continuing:
   - confirmed again:
     - grouped-by-round evaluation remains mandatory
     - corrected targeted holdout stays the fast gate
     - full leave-one-round-out stays the promotion benchmark
     - machine-wide memory checks must include other agents, not only this branch
   - `br list` is still unavailable in this environment:
     - `/bin/bash: line 1: br: command not found`
238. Shared-machine health check before new development:
   - snapshot:
     - memory used: about `1.1 TiB`
     - memory available: about `1.8 TiB`
   - biggest competing workers observed:
     - agent5 hybrid sweeps at about `50-76 GiB` RSS
     - agent1 hazard probes at about `34-39 GiB` RSS
   - active corrected-holdout queue on this branch still includes:
     - `teacher_student_blend_v17`
     - `teacher_student_blend_v18`
     - `teacher_student_blend_v19`
     - `teacher_student_blend_v20`
     - `teacher_student_blend_v21`
     - `teacher_student_blend_v22`
     - `teacher_student_blend_v23`
     - `teacher_student_blend_v24`
     - `teacher_student_blend_v26`
   - decision:
     - keep all new launches at `jobs=1`
     - only add a small outer wave after source is validated and pushed
239. New hypothesis after item 238:
   - the current temporal summary encoder only retains full / first-half / second-half aggregates
   - that may wash out query-phase information because coverage policies tend to shift from exploration to exploitation within the round
   - test quarter-scale multiscale temporal summaries while keeping the current strongest local-evidence backbone fixed
240. Implemented multiscale temporal variants:
   - new summary encoder:
     - `summary_temporal_multiscale_v5`
   - new variants:
     - `teacher_student_blend_v29`
     - `teacher_student_blend_v30`
   - both keep the current `v27` / `v28` backbone:
     - coefficient-residual head
     - spatial-dynamic teacher blending
     - confidence gate
     - seed-adaptive teacher weighting
     - exact local evidence posterior
     - geometry-gated class-weighted blurred diffusion
   - fixed an encoder bug while wiring this:
     - zero-observation multiscale summaries now preserve the correct `6 x semantic_dim` layout instead of dropping one block
241. Validation for item 240:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_student_temporal_multiscale_residual_checkpoint_roundtrip tests/test_teacher_student.py::test_summary_temporal_multiscale_encoder_zero_observation_shape tests/test_historical_benchmark.py::test_teacher_student_blend_v30_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `4 passed`
242. Corrected-holdout results that landed while item 240 was validating:
   - finished:
     - `teacher_student_blend_v13`: mean score `61.3244`, mean weighted KL `0.163762`
     - `teacher_student_blend_v14`: mean score `59.9971`, mean weighted KL `0.170906`
     - `teacher_student_blend_v15`: mean score `61.2680`, mean weighted KL `0.164093`
     - `teacher_student_blend_v16`: mean score `59.9179`, mean weighted KL `0.171375`
     - `teacher_student_blend_v25`: mean score `57.3173`, mean weighted KL `0.188013`
     - `teacher_student_blend_v27`: mean score `57.3173`, mean weighted KL `0.188013`
     - `teacher_student_blend_v28`: mean score `57.2599`, mean weighted KL `0.188463`
   - immediate read:
     - the local-evidence blur branch is materially worse on this corrected gate
     - among finished runs so far, simpler coefficient-residual variants `v13` / `v15` are stronger
243. New hypothesis after item 242:
   - multiscale temporal summaries may still help
   - but they should be tested on the stronger simpler backbone instead of on the clearly underperforming local-evidence blur branch
   - next branch:
     - `v31` / `v32` = `v13` / `v14` backbone + `summary_temporal_multiscale_v5`
244. Implemented simpler-backbone multiscale variants:
   - new variants:
     - `teacher_student_blend_v31`
     - `teacher_student_blend_v32`
   - architecture:
     - global teacher blend
     - coefficient-residual head
     - normalized multiscale temporal summary
     - no confidence gate
     - no local evidence correction
245. Validation for item 244:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_student_temporal_multiscale_residual_checkpoint_roundtrip tests/test_teacher_student.py::test_summary_temporal_multiscale_encoder_zero_observation_shape tests/test_historical_benchmark.py::test_teacher_student_blend_v30_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_teacher_student_blend_v32_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `5 passed`
246. Machine-wide health check before launching item 244:
   - snapshot:
     - memory used: about `762 GiB`
     - memory available: about `2.2 TiB`
   - largest competing workers still belonged to other agents:
     - agent5 hybrid sweeps at about `57-75 GiB` RSS
   - active corrected-holdout workers on this branch before the new wave:
     - `teacher_student_blend_v17`
     - `teacher_student_blend_v18`
     - `teacher_student_blend_v19`
     - `teacher_student_blend_v20`
     - `teacher_student_blend_v21`
     - `teacher_student_blend_v22`
     - `teacher_student_blend_v23`
     - `teacher_student_blend_v24`
     - `teacher_student_blend_v26`
   - decision:
     - headroom was large enough for one more narrow outer wave
     - keep `jobs=1` inside every new run
247. Sixth corrected-holdout outer wave launched from pushed commit `52d2fcc`:
   - models:
     - `teacher_student_blend_v31`
     - `teacher_student_blend_v32`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - launcher:
     - `scripts/run_targeted_holdout_benchmark.py`
   - sessions:
     - `v31`: `73788`
     - `v32`: `3076`
   - launch policy:
     - `jobs=1`
     - outer model parallelism only
248. New sibling hypothesis after item 247:
   - if multiscale temporal summaries help, they may interact with spatial-dynamic blending rather than only with global blending
   - next branch:
     - `v33` / `v34` = `v15` / `v16` backbone + `summary_temporal_multiscale_v5`
249. Implemented spatial-dynamic multiscale variants:
   - new variants:
     - `teacher_student_blend_v33`
     - `teacher_student_blend_v34`
   - architecture:
     - spatial-dynamic teacher blend
     - coefficient-residual head
     - normalized multiscale temporal summary
     - no confidence gate
     - no local evidence correction
250. Validation for item 249:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_student_temporal_multiscale_residual_checkpoint_roundtrip tests/test_teacher_student.py::test_summary_temporal_multiscale_encoder_zero_observation_shape tests/test_historical_benchmark.py::test_teacher_student_blend_v32_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_teacher_student_blend_v34_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `5 passed`
251. Machine-wide health check before launching item 249:
   - snapshot:
     - memory used: about `637 GiB`
     - memory available: about `2.3 TiB`
   - branch-active corrected-holdout workers already live:
     - `teacher_student_blend_v17`
     - `teacher_student_blend_v18`
     - `teacher_student_blend_v19`
     - `teacher_student_blend_v20`
     - `teacher_student_blend_v21`
     - `teacher_student_blend_v22`
     - `teacher_student_blend_v23`
     - `teacher_student_blend_v24`
     - `teacher_student_blend_v26`
     - `teacher_student_blend_v31`
     - `teacher_student_blend_v32`
   - decision:
     - still enough headroom for one more narrow outer wave
     - keep `jobs=1`
252. Seventh corrected-holdout outer wave launched from pushed commit `0086768`:
   - models:
     - `teacher_student_blend_v33`
     - `teacher_student_blend_v34`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - launcher:
     - `scripts/run_targeted_holdout_benchmark.py`
   - sessions:
     - `v33`: `97057`
     - `v34`: `85241`
   - launch policy:
     - `jobs=1`
     - outer model parallelism only
253. Corrected-holdout results that landed after items 247 and 252:
   - `teacher_student_blend_v31`: mean score `59.9922`, mean weighted KL `0.171838`
   - `teacher_student_blend_v32`: mean score `58.9782`, mean weighted KL `0.178274`
   - `teacher_student_blend_v33`: mean score `59.8833`, mean weighted KL `0.172501`
   - `teacher_student_blend_v34`: mean score `58.7956`, mean weighted KL `0.179503`
   - interpretation:
     - multiscale temporal summaries lost on both global and spatial-dynamic backbones
     - the simpler `summary_temporal_v4` encoder remains stronger than the quarter-scale multiscale variant on this corrected gate
254. New hypothesis after item 253:
   - the best finished branch remains coefficient-residual KNN on the simpler backbones
   - likely failure mode on unseen rounds:
     - the ridge base is useful
     - the KNN residual overcorrects when the live summary is far from the training bank
   - decisive test:
     - shrink residual magnitude by a distance-based confidence factor before adding it back to the ridge base
255. Implemented residual-distance shrink variants:
   - student checkpoint/model now persist:
     - `residual_confidence_power`
   - coefficient-residual prediction now shrinks residual correction by:
     - `1 / (1 + weighted_neighbor_distance / neighbor_distance_scale)` raised to `residual_confidence_power`
   - new variants:
     - `teacher_student_blend_v35`
     - `teacher_student_blend_v36`
     - `teacher_student_blend_v37`
     - `teacher_student_blend_v38`
   - branch mapping:
     - `v35` / `v36` = `v13` / `v14` + residual-distance shrink
     - `v37` / `v38` = `v15` / `v16` + residual-distance shrink
256. Validation for item 255:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_student_temporal_multiscale_residual_checkpoint_roundtrip tests/test_teacher_student.py::test_summary_bank_residual_confidence_shrinks_far_neighbor_residual tests/test_historical_benchmark.py::test_teacher_student_blend_v36_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_teacher_student_blend_v38_online_historical_benchmark_defaults_to_samples_8 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `5 passed`
257. Machine-wide health check before launching item 255:
   - snapshot:
     - memory used: about `719 GiB`
     - memory available: about `2.2 TiB`
   - largest workers remained manageable relative to box size:
     - branch-local corrected-holdout jobs were about `27-36 GiB` RSS each
     - several agent1 workers were about `19-31 GiB` RSS
   - decision:
     - safe to add a larger outer wave
     - keep every new run at `jobs=1`
258. Eighth corrected-holdout outer wave launched from pushed commit `48e9ad9`:
   - models:
     - `teacher_student_blend_v35`
     - `teacher_student_blend_v36`
     - `teacher_student_blend_v37`
     - `teacher_student_blend_v38`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - launcher:
     - `scripts/run_targeted_holdout_benchmark.py`
   - sessions:
     - `v35`: `9637`
     - `v36`: `60994`
     - `v37`: `58851`
     - `v38`: `9329`
   - launch policy:
     - `jobs=1`
     - outer model parallelism only
259. Corrected-holdout results for item 258 landed quickly:
   - `teacher_student_blend_v35`: mean score `61.3164`, mean weighted KL `0.163808`
   - `teacher_student_blend_v36`: mean score `59.9978`, mean weighted KL `0.170902`
   - `teacher_student_blend_v37`: mean score `61.2600`, mean weighted KL `0.164138`
   - `teacher_student_blend_v38`: mean score `59.9185`, mean weighted KL `0.171371`
   - interpretation:
     - residual-distance shrink is nearly neutral
     - `v35` / `v37` tie the current leaders closely but do not beat them
     - `samples=8` remains weak even with the shrink
260. New hypothesis after item 259:
   - across every finished paired comparison so far, `samples=8` loses to `samples=4`
   - that suggests the dominant problem may be synthetic within-round noise / duplication, not model capacity
   - decisive next test:
     - push `samples_per_round` lower on the strong backbones instead of adding more architecture
261. Implemented lower-sample strong-backbone variants:
   - new variants:
     - `teacher_student_blend_v39`
     - `teacher_student_blend_v40`
     - `teacher_student_blend_v41`
     - `teacher_student_blend_v42`
   - mapping:
     - `v39` = `v13` backbone with `samples_per_round=2`
     - `v40` = `v15` backbone with `samples_per_round=2`
     - `v41` = `v13` backbone with `samples_per_round=1`
     - `v42` = `v15` backbone with `samples_per_round=1`
262. Validation for item 261:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v40_online_historical_benchmark_defaults_to_samples_2 tests/test_historical_benchmark.py::test_teacher_student_blend_v42_online_historical_benchmark_defaults_to_samples_1 tests/test_teacher_student.py::test_summary_bank_residual_confidence_shrinks_far_neighbor_residual tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `4 passed`
263. Machine-wide health check before the next expansion:
   - snapshot:
     - memory used: about `720 GiB`
     - memory available: about `2.2 TiB`
   - branch-local corrected-holdout jobs remained about `31-37 GiB` RSS each
   - decision:
     - safe to add four more targeted gates
     - also safe to start one full corrected LOO on the current leader
264. Ninth corrected-holdout outer wave launched from pushed commit `c7874239`:
   - models:
     - `teacher_student_blend_v39`
     - `teacher_student_blend_v40`
     - `teacher_student_blend_v41`
     - `teacher_student_blend_v42`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - launcher:
     - `scripts/run_targeted_holdout_benchmark.py`
   - sessions:
     - `v39`: `26893`
     - `v40`: `88818`
     - `v41`: `63576`
     - `v42`: `75836`
   - launch policy:
     - `jobs=1`
     - outer model parallelism only
265. Promotion benchmark launched in parallel from pushed commit `c7874239`:
   - command:
     - `uv run astar run-historical-benchmark --model teacher_student_blend_v13 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_teacher_student_blend_v13_full_corrected --jobs 4`
   - session:
     - `60249`
   - reason:
     - `v13` is still current best finished corrected-gate model
     - full corrected LOO is now worth running while new low-sample gates evaluate
266. No low-sample result landed yet, so next parallel branch chosen from remaining strong failure mode:
   - current best branch still uses residual KNN with `k_neighbors=5`
   - likely issue:
     - residual bank may still be over-smoothing across mismatched rounds
   - next decisive test:
     - reduce neighbor count while keeping the strong temporal backbone fixed
267. Implemented lower-`k` strong-backbone variants:
   - new variants:
     - `teacher_student_blend_v43`
     - `teacher_student_blend_v44`
     - `teacher_student_blend_v45`
     - `teacher_student_blend_v46`
   - mapping:
     - `v43` = `v13` backbone with `k=3`
     - `v44` = `v15` backbone with `k=3`
     - `v45` = `v13` backbone with `k=1`
     - `v46` = `v15` backbone with `k=1`
268. Validation for item 267:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v44_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v46_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
269. Machine-wide health check before launching item 267:
   - snapshot:
     - memory used: about `833 GiB`
     - memory available: about `2.1 TiB`
   - branch-local full LOO jobs spawned several medium workers, but overall headroom remained large
   - decision:
     - safe to launch one more 4-model targeted wave
     - also safe to start full corrected LOO for `v15`
270. Tenth corrected-holdout outer wave launched from pushed commit `3fbd409d`:
   - models:
     - `teacher_student_blend_v43`
     - `teacher_student_blend_v44`
     - `teacher_student_blend_v45`
     - `teacher_student_blend_v46`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - sessions:
     - `v43`: `87506`
     - `v44`: `1808`
     - `v45`: `36097`
     - `v46`: `48047`
   - launch policy:
     - `jobs=1`
     - outer model parallelism only
271. Second promotion benchmark launched in parallel from pushed commit `3fbd409d`:
   - command:
     - `uv run astar run-historical-benchmark --model teacher_student_blend_v15 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_teacher_student_blend_v15_full_corrected --jobs 4`
   - session:
     - `36881`
   - reason:
     - `v15` remains the only other finished corrected-gate branch close enough to `v13` to merit full LOO
272. Polled the tenth corrected-holdout wave after the sessions ended:
   - finished corrected-gate artifacts landed for:
     - `teacher_student_blend_v43`
     - `teacher_student_blend_v44`
     - `teacher_student_blend_v45`
     - `teacher_student_blend_v46`
   - aggregate results:
     - `v43`: mean score `61.3197`, mean weighted KL `0.163789`
     - `v44`: mean score `61.2635`, mean weighted KL `0.164118`
     - `v45`: mean score `61.3370`, mean weighted KL `0.163687`
     - `v46`: mean score `61.2813`, mean weighted KL `0.164013`
273. Read from item 272:
   - lowering `k` helped slightly on both strong backbones
   - current finished corrected-gate leader is now `teacher_student_blend_v45`
   - margin over prior gate leader `v13` is tiny but positive:
     - score delta: `+0.0126`
     - weighted-KL delta: `-0.000075`
274. A later machine-wide process check corrected an earlier misread:
   - `v39-v42` were still alive as OS processes
   - the full promotion runs for `v13` and `v15` were also still alive as OS processes
   - the earlier “dead run” read was wrong because I checked old session IDs as if they were PIDs
   - correct live-state read must use machine-wide process inspection, not session IDs alone
275. New hypothesis after item 273:
   - the small gain from `k=1` suggests cross-round residual averaging is hurting more than helping
   - if that is true, combining `k=1` with lower `samples_per_round` should stack two anti-noise changes:
     - less residual smoothing across mismatched rounds
     - less synthetic within-round duplication noise
276. Implemented the combined low-`k`, low-sample branch:
   - new variants:
     - `teacher_student_blend_v47`
     - `teacher_student_blend_v48`
     - `teacher_student_blend_v49`
     - `teacher_student_blend_v50`
   - mapping:
     - `v47` = `v45` backbone with `samples_per_round=2`
     - `v48` = `v46` backbone with `samples_per_round=2`
     - `v49` = `v45` backbone with `samples_per_round=1`
     - `v50` = `v46` backbone with `samples_per_round=1`
277. Validation for item 276:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v48_online_historical_benchmark_defaults_to_samples_2 tests/test_historical_benchmark.py::test_teacher_student_blend_v50_online_historical_benchmark_defaults_to_samples_1 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
278. Machine-wide health check before expanding the active queue again:
   - snapshot before launch:
     - memory used: about `795 GiB`
     - memory available: about `2.1 TiB`
   - active branch-local jobs already confirmed live:
     - corrected holdouts: `v21`, `v22`, `v23`, `v24`, `v26`, `v39`, `v40`, `v41`, `v42`
     - full corrected LOO: `v13`, `v15`
   - decision:
     - enough headroom remained for one more full LOO plus one more 4-model corrected-gate wave
279. An attempted detached `nohup` / `setsid` launch pattern did not persist reliably on this host:
   - returned shell PIDs disappeared immediately
   - output logs stayed empty
   - correction:
     - continue using the normal long-running session-backed launcher, which is empirically what keeps the earlier jobs alive here
280. Eleventh corrected-holdout outer wave launched from pushed commit `f2b647b9`:
   - models:
     - `teacher_student_blend_v47`
     - `teacher_student_blend_v48`
     - `teacher_student_blend_v49`
     - `teacher_student_blend_v50`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - sessions:
     - `v47`: `83626`
     - `v48`: `55369`
     - `v49`: `41243`
     - `v50`: `33661`
   - launch policy:
     - `jobs=1`
     - outer model parallelism only
281. Third promotion benchmark launched in parallel from pushed commit `f2b647b9`:
   - command:
     - `uv run astar run-historical-benchmark --model teacher_student_blend_v45 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_teacher_student_blend_v45_full_corrected --jobs 4`
   - session:
     - `80497`
   - reason:
     - `v45` is now the strongest finished corrected-gate model
282. Post-launch machine-wide health check:
   - snapshot after launch:
     - memory used: about `995 GiB`
     - memory available: about `1.9 TiB`
   - active new branch-local jobs confirmed live:
     - corrected holdouts: `v47`, `v48`, `v49`, `v50`
     - full corrected LOO: `v45`
   - total family queue still remained well below the machine-wide memory ceiling
283. New hypothesis while the queue from item 282 ran:
   - exact observed-cell posterior correction may be more useful on the new `k=1` backbone than on the older gated branches
   - reason:
     - the current global / spatial prior is already stronger
     - local evidence only needs to repair queried cells rather than compensate for a weaker backbone
284. Implemented exact-local-evidence variants on top of the `k=1` line:
   - new variants:
     - `teacher_student_blend_v51`
     - `teacher_student_blend_v52`
     - `teacher_student_blend_v53`
     - `teacher_student_blend_v54`
   - mapping:
     - `v51` = `v45` backbone + exact local evidence
     - `v52` = `v46` backbone + exact local evidence
     - `v53` = `v47` backbone + exact local evidence
     - `v54` = `v48` backbone + exact local evidence
   - exact-local-evidence settings:
     - `local_evidence_beta_min=4.0`
     - `local_evidence_beta_scale=12.0`
285. Validation for item 284:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v52_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v54_online_historical_benchmark_defaults_to_samples_2 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
286. Machine-wide health check before adding the exact-local-evidence wave:
   - snapshot before launch:
     - memory used: about `1.2 TiB`
     - memory available: about `1.7 TiB`
   - live family queue count from machine-wide process scan:
     - about `33` agent3 teacher-student benchmark processes / wrappers
   - decision:
     - still enough headroom for one more 4-model corrected-gate wave at `jobs=1`
287. Twelfth corrected-holdout outer wave launched from pushed commit `1f9318a8`:
   - models:
     - `teacher_student_blend_v51`
     - `teacher_student_blend_v52`
     - `teacher_student_blend_v53`
     - `teacher_student_blend_v54`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - sessions:
     - `v51`: `44814`
     - `v52`: `36837`
     - `v53`: `3001`
     - `v54`: `57005`
   - launch policy:
     - `jobs=1`
     - outer model parallelism only
288. Post-launch machine-wide health check for item 287:
   - snapshot after launch:
     - memory used: about `1.2 TiB`
     - memory available: about `1.7 TiB`
   - active new exact-local-evidence jobs confirmed live:
     - `v51`
     - `v52`
     - `v53`
     - `v54`
289. The first exact-local-evidence results landed quickly:
   - finished corrected-gate artifacts:
     - `teacher_student_blend_v51`
     - `teacher_student_blend_v52`
   - aggregate results:
     - `v51`: mean score `65.0719`, mean weighted KL `0.143762`
     - `v52`: mean score `65.0268`, mean weighted KL `0.144004`
290. Read from item 289:
   - exact observed-cell posterior correction is a major win on the strong `k=1` backbone
   - both rounds improved strongly versus the prior leader `v45`:
     - round `36e581f1...`: `58.0931 -> 62.1941` for `v51`
     - round `f1dac9a9...`: `64.5809 -> 67.9496` for `v51`
   - current finished corrected-gate leader is now `teacher_student_blend_v51`
   - margin over prior gate leader `v45`:
     - score delta: `+3.7349`
     - weighted-KL delta: `-0.019925`
291. Promotion decision after item 289:
   - `v51` and `v52` are both far enough ahead of the prior family line to justify immediate full corrected LOO
292. Fourth and fifth promotion benchmarks launched from pushed commit `45ce0d4a`:
   - commands:
     - `uv run astar run-historical-benchmark --model teacher_student_blend_v51 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_teacher_student_blend_v51_full_corrected --jobs 4`
     - `uv run astar run-historical-benchmark --model teacher_student_blend_v52 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_teacher_student_blend_v52_full_corrected --jobs 4`
   - sessions:
     - `v51` full: `31564`
     - `v52` full: `57607`
293. Machine-wide health check after item 292:
   - snapshot:
     - memory used: about `1.1 TiB`
     - memory available: about `1.8 TiB`
   - decision:
     - enough headroom remained to keep branching off the exact-local-evidence family without stopping the live queue
294. New hypothesis after item 290:
   - exact-local-evidence fixed queried-cell calibration, but the unobserved-cell teacher blend is still using the simple round-total weighting path from `v45/v46`
   - next decisive test:
     - port seed-adaptive teacher weighting plus confidence gating onto the winning exact-local-evidence `k=1` line
295. Implemented gated exact-local-evidence variants:
   - new variants:
     - `teacher_student_blend_v55`
     - `teacher_student_blend_v56`
     - `teacher_student_blend_v57`
     - `teacher_student_blend_v58`
   - mapping:
     - `v55` = `v51` + confidence gate + seed-adaptive teacher weighting
     - `v56` = `v52` + confidence gate + seed-adaptive teacher weighting
     - `v57` = `v53` + confidence gate + seed-adaptive teacher weighting
     - `v58` = `v54` + confidence gate + seed-adaptive teacher weighting
296. Validation for item 295:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v56_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v58_online_historical_benchmark_defaults_to_samples_2 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`


## Open Questions

- Which benchmark/run currently best on local held-out rounds: `query_residual` vs `historical_bucket_prior`?
- Where exactly are experiment ledgers stored today, if at all?
- Is current validation strong enough for live performance selection, or should it be upgraded to better grouped/chronological round holdouts?
