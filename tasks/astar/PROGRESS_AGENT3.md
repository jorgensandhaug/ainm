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
297. Machine-wide health check before launching the gated exact-local-evidence wave:
   - snapshot before launch:
     - memory used: about `1.5 TiB`
     - memory available: about `1.4 TiB`
   - live family queue count from machine-wide process scan:
     - about `49` agent3 teacher-student benchmark processes / wrappers
   - decision:
     - still enough headroom for one more 4-model corrected-holdout wave at `jobs=1`
298. Thirteenth corrected-holdout outer wave launched from pushed commit `b87ab703`:
   - models:
     - `teacher_student_blend_v55`
     - `teacher_student_blend_v56`
     - `teacher_student_blend_v57`
     - `teacher_student_blend_v58`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - sessions:
     - `v55`: `95391`
     - `v56`: `52465`
     - `v57`: `69932`
     - `v58`: `7802`
   - launch policy:
     - `jobs=1`
     - outer model parallelism only
299. Read after item 298:
   - machine still has substantial shared headroom, but the family queue is now large enough that the next step should be to wait for finished signals before adding another full 4-model wave
   - active priority promotion runs are now:
     - `v51` full corrected LOO
     - `v52` full corrected LOO
     - `v45` full corrected LOO as the previous-family baseline
300. The first gated exact-local-evidence results landed quickly:
   - finished corrected-gate artifacts:
     - `teacher_student_blend_v55`
     - `teacher_student_blend_v56`
   - aggregate results:
     - `v55`: mean score `57.2510`, mean weighted KL `0.188449`
     - `v56`: mean score `57.2306`, mean weighted KL `0.188566`
301. Read from item 300:
   - seed-adaptive teacher weighting plus confidence gating is harmful on top of the exact-local-evidence `k=1` line
   - the failure is large enough that the branch is rejected immediately for the `samples=4` case
302. New hypothesis after item 301:
   - the exact-local-evidence posterior itself is now the dominant winning mechanism
   - next decisive test:
     - tune the empirical-Bayes shrinkage around the current winning setting instead of changing the teacher-blend logic again
303. Implemented exact-local-evidence beta-tuning variants:
   - new variants:
     - `teacher_student_blend_v59`
     - `teacher_student_blend_v60`
     - `teacher_student_blend_v61`
     - `teacher_student_blend_v62`
   - mapping:
     - `v59` = `v51` with more aggressive local evidence (`beta_min=2`, `beta_scale=8`)
     - `v60` = `v52` with more aggressive local evidence (`beta_min=2`, `beta_scale=8`)
     - `v61` = `v51` with more conservative local evidence (`beta_min=6`, `beta_scale=16`)
     - `v62` = `v52` with more conservative local evidence (`beta_min=6`, `beta_scale=16`)
304. Validation for item 303:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v60_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v62_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
305. Machine-wide health check before launching the beta-tuning wave:
   - snapshot before launch:
     - memory used: about `1.7 TiB`
     - memory available: about `1.2 TiB`
   - live family queue count from machine-wide process scan:
     - about `49` agent3 teacher-student benchmark processes / wrappers
   - decision:
     - one more 4-model `jobs=1` corrected-holdout wave still fit inside the shared-memory budget
306. Fourteenth corrected-holdout outer wave launched from pushed commit `f2b482ae`:
   - models:
     - `teacher_student_blend_v59`
     - `teacher_student_blend_v60`
     - `teacher_student_blend_v61`
     - `teacher_student_blend_v62`
   - held-out rounds:
     - `36e581f1-73f8-453f-ab98-cbe3052b701b`
     - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - sessions:
     - `v59`: `50680`
     - `v60`: `21539`
     - `v61`: `79641`
     - `v62`: `4233`
   - launch policy:
     - `jobs=1`
     - outer model parallelism only
307. Read after item 306:
   - exact-local-evidence shrinkage tuning is now the newest active branch
   - next launch beyond this should wait for either:
     - a finished `v53/v54/v57/v58/v59-v62` gate result, or
     - a finished full corrected LOO result from `v51` or `v52`
308. Machine-wide cleanup after item 307:
   - killed stale low-value runs for:
     - old weak corrected gates: `v21`, `v22`, `v23`, `v24`, `v26`, `v39`, `v40`, `v41`, `v42`, `v47`, `v48`, `v49`, `v50`, `v55`, `v56`
     - obsolete full baselines: `v13`, `v15`, `v45`
   - effect:
     - machine memory dropped to about `867 GiB` used and about `2.1 TiB` available
309. The beta-tuning results landed immediately after the cleanup:
   - finished corrected-gate artifacts:
     - `teacher_student_blend_v59`
     - `teacher_student_blend_v60`
     - `teacher_student_blend_v61`
     - `teacher_student_blend_v62`
   - aggregate results:
     - `v59`: mean score `65.4649`, mean weighted KL `0.141802`
     - `v60`: mean score `65.4188`, mean weighted KL `0.142051`
     - `v61`: mean score `64.5530`, mean weighted KL `0.146440`
     - `v62`: mean score `64.5082`, mean weighted KL `0.146682`
310. Read from item 309:
   - more aggressive exact-local-evidence shrinkage improved again
   - current finished corrected-gate leader is now `teacher_student_blend_v59`
   - conservative shrinkage (`v61/v62`) moved backward, so the tuning direction is clear
311. Promotion decision after item 309:
   - `v59` and `v60` are promoted immediately to full corrected LOO
312. Sixth and seventh promotion benchmarks launched:
   - commands:
     - `uv run astar run-historical-benchmark --model teacher_student_blend_v59 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_teacher_student_blend_v59_full_corrected --jobs 4`
     - `uv run astar run-historical-benchmark --model teacher_student_blend_v60 --mode online_interactive --policy coverage --budget 50 --with-png none --name agent3_dev_teacher_student_blend_v60_full_corrected --jobs 4`
   - sessions:
     - `v59` full: `8217`
     - `v60` full: `76974`
313. New hypothesis after item 310:
   - the exact-local-evidence win is still moving toward lower beta
   - next decisive test:
     - push shrinkage lower than `v59/v60` rather than changing the overall architecture
314. Implemented more-aggressive exact-local-evidence variants:
   - new variants:
     - `teacher_student_blend_v63`
     - `teacher_student_blend_v64`
     - `teacher_student_blend_v65`
     - `teacher_student_blend_v66`
   - mapping:
     - `v63` = global backbone with `beta_min=1`, `beta_scale=4`
     - `v64` = spatial backbone with `beta_min=1`, `beta_scale=4`
     - `v65` = global backbone with `beta_min=0`, `beta_scale=2`
     - `v66` = spatial backbone with `beta_min=0`, `beta_scale=2`
315. Validation for item 314:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v64_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v66_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
316. More-aggressive exact-local-evidence results landed:
   - finished corrected-gate artifacts:
     - `teacher_student_blend_v63`
     - `teacher_student_blend_v64`
     - `teacher_student_blend_v65`
     - `teacher_student_blend_v66`
   - aggregate results:
     - `v63`: mean score `63.9776`, mean weighted KL `0.149871`
     - `v64`: mean score `63.9308`, mean weighted KL `0.150145`
     - `v65`: mean score `52.7031`, mean weighted KL `0.219189`
     - `v66`: mean score `52.6574`, mean weighted KL `0.219560`
317. Read from item 316:
   - pushing beta below `v59/v60` helped relative to `v51/v52`, but overshot the optimum
   - `v63/v64` are clearly behind `v59/v60`
   - the near-count-dominated extreme (`v65/v66`) is catastrophic and should not be revisited
318. New hypothesis after item 317:
   - the win is not from globally lower beta alone
   - queried cells with more direct observations should shrink less than lightly observed cells
   - next probe:
     - keep the strong `v59/v60` beta schedule, but make prior pseudocount shrink with local observed-count total
319. Implemented count-adaptive exact-local-evidence variants:
   - new variants:
     - `teacher_student_blend_v67`
     - `teacher_student_blend_v68`
     - `teacher_student_blend_v69`
     - `teacher_student_blend_v70`
   - mapping:
     - `v67` = `v59` backbone + count-adaptive local evidence, `count_pivot=4`
     - `v68` = `v60` backbone + count-adaptive local evidence, `count_pivot=4`
     - `v69` = `v59` backbone + count-adaptive local evidence, `count_pivot=8`
     - `v70` = `v60` backbone + count-adaptive local evidence, `count_pivot=8`
   - implementation detail:
     - exact-local-evidence beta is now scaled by `sqrt(count_pivot / (count_pivot + count_total))` when a variant enables count adaptation
320. Validation for item 319:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_exact_local_evidence_count_pivot_reduces_prior_shrinkage tests/test_historical_benchmark.py::test_teacher_student_blend_v68_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v70_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `4 passed`
321. Machine/queue state before launching item 319:
   - no full corrected LOO artifact has landed yet for `v51`, `v52`, `v59`, or `v60`
   - machine snapshot:
     - about `1.2 TiB` used
     - about `1.7 TiB` available
   - unified exec slots are crowded, so next launches should move to detached `tmux` sessions instead of more long-lived unified exec sessions
322. Count-adaptive corrected-gate wave launched from pushed commit `4020cb32`:
   - `tmux` sessions:
     - `agent3_v67_gate`
     - `agent3_v68_gate`
     - `agent3_v69_gate`
     - `agent3_v70_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v67 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v67_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v68 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v68_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v69 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v69_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v70 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v70_targeted_holdout_2rounds_corrected --jobs 1`
323. Post-launch check for item 322:
   - live PIDs:
     - `v67`: `956129`, `956135`
     - `v68`: `956134`, `956141`
     - `v69`: `956140`, `956148`
     - `v70`: `956146`, `956153`
   - machine snapshot remained healthy:
     - about `1.2 TiB` used
     - about `1.7 TiB` available
324. Count-adaptive exact-local-evidence results landed:
   - finished corrected-gate artifacts:
     - `teacher_student_blend_v67`
     - `teacher_student_blend_v68`
     - `teacher_student_blend_v69`
     - `teacher_student_blend_v70`
   - aggregate results:
     - `v67`: mean score `65.3996`, mean weighted KL `0.142170`
     - `v68`: mean score `65.3540`, mean weighted KL `0.142420`
     - `v69`: mean score `65.4438`, mean weighted KL `0.141927`
     - `v70`: mean score `65.3980`, mean weighted KL `0.142176`
325. Read from item 324:
   - count-adaptive local evidence is effectively neutral on top of `v59/v60`
   - `v69` came back very close, but still below `v59`
   - the next likely bottleneck is no longer queried-cell posterior shrinkage
   - the remaining error should mostly be how strongly and where the summary-bank student overrides the base prior on unobserved cells
326. New hypothesis after item 325:
   - seed-adaptive student mixing may still help on the `v59/v60` backbone if the confidence gate is removed
   - the earlier `v55-v58` failure may have been dominated by the confidence gate, not by seed-adaptive weighting itself
   - next probe:
     - add seed-adaptive weighting without confidence gating, with and without the near-neutral count-adaptive local-evidence tweak
327. Implemented seed-adaptive/no-confidence exact-local-evidence variants:
   - new variants:
     - `teacher_student_blend_v71`
     - `teacher_student_blend_v72`
     - `teacher_student_blend_v73`
     - `teacher_student_blend_v74`
   - mapping:
     - `v71` = `v59` backbone + `teacher_weight_mode=seed_adaptive`
     - `v72` = `v60` backbone + `teacher_weight_mode=seed_adaptive`
     - `v73` = `v69` backbone + `teacher_weight_mode=seed_adaptive`
     - `v74` = `v70` backbone + `teacher_weight_mode=seed_adaptive`
   - all four explicitly keep `use_confidence_gate=False`
328. Validation for item 327:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v72_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v74_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
329. Machine-wide check before launching item 327:
   - about `1.1 TiB` used
   - about `1.8 TiB` available
   - other agents still have multiple `22-49 GiB` workers live, but there is ample headroom for a 4-job corrected-gate wave
330. Seed-adaptive/no-confidence corrected-gate wave launched from pushed commit `2a4d3796`:
   - `tmux` sessions:
     - `agent3_v71_gate`
     - `agent3_v72_gate`
     - `agent3_v73_gate`
     - `agent3_v74_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v71 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v71_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v72 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v72_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v73 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v73_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v74 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v74_targeted_holdout_2rounds_corrected --jobs 1`
331. Post-launch check for item 330:
   - live PIDs:
     - `v71`: `1197306`, `1197312`
     - `v72`: `1197311`, `1197316`
     - `v73`: `1197318`, `1197324`
     - `v74`: `1197323`, `1197330`
   - machine snapshot improved further:
     - about `1.0 TiB` used
     - about `1.9 TiB` available
332. Parallel hypothesis after item 325:
   - exact-local-evidence now handles queried-cell calibration well enough that the next easy win may be the global student/base mixing cap on unobserved cells
   - if the student is still underweighted, higher caps should help; if the student is still overfitting, lower caps should help
333. Implemented student-mix-cap exact-local-evidence variants:
   - new variants:
     - `teacher_student_blend_v75`
     - `teacher_student_blend_v76`
     - `teacher_student_blend_v77`
     - `teacher_student_blend_v78`
   - mapping:
     - `v75` = `v59` backbone with higher student cap (`teacher_weight_max=0.84`)
     - `v76` = `v60` backbone with higher student cap (`teacher_weight_max=0.88`)
     - `v77` = `v59` backbone with lower student cap (`teacher_weight_max=0.58`)
     - `v78` = `v60` backbone with lower student cap (`teacher_weight_max=0.60`)
334. Validation for item 333:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v76_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v78_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
335. Machine-wide check before launching item 333:
   - about `898 GiB` used
   - about `2.0 TiB` available
   - agent3 still had only the 4 pending full LOO runs plus the `v71-v74` corrected wave active
336. Mix-cap corrected-gate wave launched from pushed commit `e001f590`:
   - `tmux` sessions:
     - `agent3_v75_gate`
     - `agent3_v76_gate`
     - `agent3_v77_gate`
     - `agent3_v78_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v75 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v75_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v76 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v76_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v77 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v77_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v78 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v78_targeted_holdout_2rounds_corrected --jobs 1`
337. Post-launch check for item 336:
   - live PIDs:
     - `v75`: `1541993`, `1541998`
     - `v76`: `1541999`, `1542165`
     - `v77`: `1542542`, `1542811`
     - `v78`: `1542810`, `1542817`
   - machine stayed very healthy:
     - about `891 GiB` used
     - about `2.0 TiB` available
338. Seed-adaptive/no-confidence results landed:
   - finished corrected-gate artifacts:
     - `teacher_student_blend_v71`
     - `teacher_student_blend_v72`
     - `teacher_student_blend_v73`
     - `teacher_student_blend_v74`
   - aggregate results:
     - `v71`: mean score `65.4319`, mean weighted KL `0.141890`
     - `v72`: mean score `65.3842`, mean weighted KL `0.142140`
     - `v73`: mean score `65.4119`, mean weighted KL `0.142007`
     - `v74`: mean score `65.3647`, mean weighted KL `0.142256`
339. Mix-cap results landed:
   - finished corrected-gate artifacts:
     - `teacher_student_blend_v75`
     - `teacher_student_blend_v76`
     - `teacher_student_blend_v77`
     - `teacher_student_blend_v78`
   - aggregate results:
     - `v75`: mean score `64.8669`, mean weighted KL `0.145147`
     - `v76`: mean score `64.7782`, mean weighted KL `0.145682`
     - `v77`: mean score `64.9334`, mean weighted KL `0.144266`
     - `v78`: mean score `64.8554`, mean weighted KL `0.144655`
340. Read from items 338-339:
   - seed-adaptive mixing without confidence gate is nearly neutral, but still does not beat `v59`
   - count-adaptive local evidence stays neutral even when paired with seed-adaptive mixing
   - moving the total student cap up or down hurts more noticeably than changing teacher-weight mode
   - the best remaining easy axis is likely not the asymptotic mix cap, but the rate at which the model ramps into student trust as query count grows
341. New hypothesis after item 340:
   - `v59/v60` may have the right max student influence but the wrong query-count pacing
   - next probe:
     - tune `query_count_scale` on the exact-local-evidence winning line while keeping the cap fixed
     - test both faster and slower ramping into student trust
342. Implemented query-count-pacing exact-local-evidence variants:
   - new variants:
     - `teacher_student_blend_v79`
     - `teacher_student_blend_v80`
     - `teacher_student_blend_v81`
     - `teacher_student_blend_v82`
   - mapping:
     - `v79` = `v59` backbone with slower student ramp (`query_count_scale=14`)
     - `v80` = `v60` backbone with slower student ramp (`query_count_scale=14`)
     - `v81` = `v59` backbone with faster student ramp (`query_count_scale=7`)
     - `v82` = `v60` backbone with faster student ramp (`query_count_scale=7`)
343. Validation for item 342:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v80_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v82_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
344. Full corrected LOO poll before item 342 launch:
   - no full artifact has landed yet for `v51`, `v52`, `v59`, or `v60`
   - machine snapshot:
     - about `783 GiB` used
     - about `2.1 TiB` available
345. Cleanup before launching item 342:
   - terminated stale finished or low-value corrected-gate processes for:
     - `v53`, `v54`, `v57`, `v58`
     - `v71`, `v72`, `v73`, `v74`
     - `v75`, `v76`, `v77`, `v78`
   - also removed old `tmux` gate sessions for those variants
346. Query-count-pacing corrected-gate wave launched from pushed commit `e938808d`:
   - `tmux` sessions:
     - `agent3_v79_gate`
     - `agent3_v80_gate`
     - `agent3_v81_gate`
     - `agent3_v82_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v79 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v79_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v80 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v80_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v81 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v81_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v82 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v82_targeted_holdout_2rounds_corrected --jobs 1`
347. Post-launch check for item 346:
   - live PIDs:
     - `v79`: `1986995`, `1987001`
     - `v80`: `1987000`, `1987006`
     - `v81`: `1987007`, `1987013`
     - `v82`: `1987012`, `1987019`
   - machine snapshot improved again:
     - about `758 GiB` used
     - about `2.2 TiB` available
348. Query-count-pacing results landed:
   - finished corrected-gate artifacts:
     - `teacher_student_blend_v79`
     - `teacher_student_blend_v80`
     - `teacher_student_blend_v81`
     - `teacher_student_blend_v82`
   - aggregate results:
     - `v79`: mean score `65.4649`, mean weighted KL `0.141802`
     - `v80`: mean score `65.4188`, mean weighted KL `0.142051`
     - `v81`: mean score `65.4649`, mean weighted KL `0.141802`
     - `v82`: mean score `65.4188`, mean weighted KL `0.142051`
349. Read from item 348:
   - query-count-scale is fully inert on these held-out rounds
   - both slower and faster ramping exactly reproduced `v59/v60`
   - the query-count scalar is saturated here, so more scalar pacing work is low value
350. New hypothesis after item 349:
   - exact local evidence already corrects observed cells, so the next gain may come from changing where the student is allowed to override the base prior, not by changing a global scalar
   - next probe:
     - keep full student strength on unobserved cells
     - attenuate or zero student blending on observed cells that already have direct evidence
351. Implemented observed-aware exact-local-evidence variants:
   - new variants:
     - `teacher_student_blend_v83`
     - `teacher_student_blend_v84`
     - `teacher_student_blend_v85`
     - `teacher_student_blend_v86`
   - mapping:
     - `v83` = `v59` backbone with observed-cell blend attenuation `0.25`
     - `v84` = `v60` backbone with observed-cell blend attenuation `0.25`
     - `v85` = `v59` backbone with observed-cell student blend removed entirely
     - `v86` = `v60` backbone with observed-cell student blend removed entirely
352. Validation for item 351:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v84_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v86_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
353. Cleanup before launching item 351:
   - terminated finished query-count-pacing corrected-gate processes for:
     - `v79`, `v80`, `v81`, `v82`
   - removed old `tmux` gate sessions for those variants
354. Observed-aware corrected-gate wave launched from pushed commit `1651701a`:
   - `tmux` sessions:
     - `agent3_v83_gate`
     - `agent3_v84_gate`
     - `agent3_v85_gate`
     - `agent3_v86_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v83 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v83_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v84 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v84_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v85 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v85_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v86 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v86_targeted_holdout_2rounds_corrected --jobs 1`
355. Post-launch check for item 354:
   - live PIDs:
     - `v83`: `2800523`, `2800529`
     - `v84`: `2800528`, `2800533`
     - `v85`: `2800535`, `2800540`
     - `v86`: `2800541`, `2800547`
   - machine remained healthy:
     - about `929 GiB` used
     - about `2.0 TiB` available
356. Parallel hypothesis after item 350:
   - if observed-aware damping helps, the real win may be not just removing student mass from observed cells, but reallocating that mass toward unobserved cells where the student is still needed
357. Implemented observed-aware reallocation variants:
   - new variants:
     - `teacher_student_blend_v87`
     - `teacher_student_blend_v88`
     - `teacher_student_blend_v89`
     - `teacher_student_blend_v90`
   - mapping:
     - `v87` = `v83` branch + unobserved-cell boost `1.15`
     - `v88` = `v84` branch + unobserved-cell boost `1.15`
     - `v89` = `v85` branch + unobserved-cell boost `1.20`
     - `v90` = `v86` branch + unobserved-cell boost `1.20`
358. Validation for item 357:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v88_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v90_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
359. Machine-wide check before launching item 357:
   - about `1.1 TiB` used
   - about `1.7 TiB` available
   - current agent3 queue still fit comfortably inside shared-machine headroom
360. Observed-aware reallocation wave launched from pushed commit `adc288c5`:
   - `tmux` sessions:
     - `agent3_v87_gate`
     - `agent3_v88_gate`
     - `agent3_v89_gate`
     - `agent3_v90_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v87 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v87_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v88 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v88_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v89 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v89_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v90 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v90_targeted_holdout_2rounds_corrected --jobs 1`
361. Post-launch check for item 360:
   - live PIDs:
     - `v87`: `2922745`, `2922749`
     - `v88`: `2922751`, `2922756`
     - `v89`: `2922757`, `2922764`
     - `v90`: `2922762`, `2922769`
   - machine remained healthy:
     - about `1.1 TiB` used
     - about `1.7 TiB` available
362. Observed-aware damping and reallocation results landed:
   - finished corrected-gate artifacts:
     - `teacher_student_blend_v83`
     - `teacher_student_blend_v84`
     - `teacher_student_blend_v85`
     - `teacher_student_blend_v86`
     - `teacher_student_blend_v87`
     - `teacher_student_blend_v88`
     - `teacher_student_blend_v89`
     - `teacher_student_blend_v90`
   - aggregate results:
     - `v83`: mean score `59.3547`, mean weighted KL `0.175017`
     - `v84`: mean score `59.3362`, mean weighted KL `0.175121`
     - `v85`: mean score `55.5297`, mean weighted KL `0.198768`
     - `v86`: mean score `55.5297`, mean weighted KL `0.198768`
     - `v87`: mean score `59.3547`, mean weighted KL `0.175017`
     - `v88`: mean score `59.3362`, mean weighted KL `0.175121`
     - `v89`: mean score `55.5297`, mean weighted KL `0.198768`
     - `v90`: mean score `55.5297`, mean weighted KL `0.198768`
363. Read from item 362:
   - observed-aware damping is catastrophically bad
   - reallocating extra student mass to unobserved cells is completely inert once observed damping is active
   - so the student must remain strong on observed cells; direct evidence does not make that branch redundant
364. New hypothesis after item 363:
   - if observed cells are that important, the next opposite test is to boost observed-cell student blending above baseline instead of damping it
365. Implemented observed-cell boost variants:
   - new variants:
     - `teacher_student_blend_v91`
     - `teacher_student_blend_v92`
     - `teacher_student_blend_v93`
     - `teacher_student_blend_v94`
   - mapping:
     - `v91` = `v59` backbone with observed-cell blend boost `1.15`
     - `v92` = `v60` backbone with observed-cell blend boost `1.15`
     - `v93` = `v59` backbone with observed-cell blend boost `1.30`
     - `v94` = `v60` backbone with observed-cell blend boost `1.30`
366. Validation for item 365:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v92_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v94_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
367. Machine-wide check before launching item 365:
   - about `998 GiB` used
   - about `1.8 TiB` available
   - shared-machine RAM headroom was still ample even with `v87-v90` plus the 4 full LOO runs active
368. Observed-cell boost wave launched from pushed commit `080e49fe`:
   - `tmux` sessions:
     - `agent3_v91_gate`
     - `agent3_v92_gate`
     - `agent3_v93_gate`
     - `agent3_v94_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v91 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v91_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v92 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v92_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v93 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v93_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v94 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v94_targeted_holdout_2rounds_corrected --jobs 1`
369. Post-launch check for item 368:
   - live PIDs:
     - `v91`: `3191871`, `3191877`
     - `v92`: `3191876`, `3191880`
     - `v93`: `3191883`, `3191888`
     - `v94`: `3191889`, `3191895`
   - machine remained healthy:
     - about `1.0 TiB` used
     - about `1.8 TiB` available
370. Parallel hypothesis after item 363:
   - exact local evidence may change the optimal residual-neighbor count because observed cells are fixed locally and unobserved cells might now benefit from smoother residual transfer
371. Implemented exact-local-evidence neighbor-count variants:
   - new variants:
     - `teacher_student_blend_v95`
     - `teacher_student_blend_v96`
     - `teacher_student_blend_v97`
     - `teacher_student_blend_v98`
   - mapping:
     - `v95` = `v59` branch with `k_neighbors=3`
     - `v96` = `v60` branch with `k_neighbors=3`
     - `v97` = `v59` branch with `k_neighbors=5`
     - `v98` = `v60` branch with `k_neighbors=5`
372. Validation for item 371:
   - focused command:
     - `uv run pytest tests/test_historical_benchmark.py::test_teacher_student_blend_v96_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v98_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_run_targeted_holdout_benchmark_uses_all_other_rounds_for_training -q`
   - result:
     - `3 passed`
373. Machine-wide check before launching item 371:
   - about `1.0 TiB` used
   - about `1.8 TiB` available
   - enough shared-machine headroom remained for another 4-run corrected-gate wave
374. Exact-evidence neighbor-count wave launched from pushed commit `88f4ecc0`:
   - `tmux` sessions:
     - `agent3_v95_gate`
     - `agent3_v96_gate`
     - `agent3_v97_gate`
     - `agent3_v98_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v95 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v95_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v96 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v96_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v97 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v97_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v98 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v98_targeted_holdout_2rounds_corrected --jobs 1`
375. Post-launch check for item 374:
   - live PIDs:
     - `v95`: `3476720`, `3476726`
     - `v96`: `3476725`, `3476731`
     - `v97`: `3476732`, `3476738`
     - `v98`: `3476737`, `3476744`
   - machine remained healthy:
     - about `1.1 TiB` used
     - about `1.7 TiB` available
376. Exact-local-evidence neighbor-count results landed:
   - finished corrected-gate artifacts:
     - `teacher_student_blend_v95`
     - `teacher_student_blend_v96`
     - `teacher_student_blend_v97`
     - `teacher_student_blend_v98`
   - aggregate results:
     - `v95`: mean score `65.4518`, mean weighted KL `0.141873`
     - `v96`: mean score `65.4052`, mean weighted KL `0.142126`
     - `v97`: mean score `65.4555`, mean weighted KL `0.141854`
     - `v98`: mean score `65.4088`, mean weighted KL `0.142107`
377. Read from item 376:
   - smoother `k=3/5` single-student branches are nearly neutral even after exact local evidence
   - `v97` got very close to `v59` but still lost by about `0.0094` score
   - this points to a more structural failure: far-unobserved cells may want smoother residual transfer while queried / near-queried cells still want the sharp `k=1` expert
378. New hypothesis after item 377:
   - a true two-expert student should beat all single-student branches by routing observed / near-observed cells to the sharp `k=1` expert and farther unobserved cells to a smoother secondary expert
379. Implemented dual-student coverage-distance routing variants:
   - new variants:
     - `teacher_student_blend_v99`
     - `teacher_student_blend_v100`
     - `teacher_student_blend_v101`
     - `teacher_student_blend_v102`
   - architecture change:
     - `SummaryBankRoundPredictor` can now load a secondary `SummaryBankStudent`
     - teacher predictions can now be composed from two separately fitted students before the base/teacher blend
     - routing uses per-seed coverage distance: queried cells stay on the primary expert, and farther unobserved cells ramp toward the secondary expert
     - secondary checkpoints now persist under the model cache directory in `secondary/summary_bank_student.json`
   - mapping:
     - `v99` = `v59` backbone + secondary `k=5` expert + distance scale `2.0`
     - `v100` = `v60` backbone + secondary `k=5` expert + distance scale `2.0`
     - `v101` = `v59` backbone + secondary `k=7` expert + distance scale `3.0`
     - `v102` = `v60` backbone + secondary `k=7` expert + distance scale `3.0`
380. Validation for item 379:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_secondary_student_weight_map_prefers_smoother_far_from_observed tests/test_teacher_student.py::test_summary_bank_variant_with_secondary_student_saves_secondary_checkpoint tests/test_historical_benchmark.py::test_teacher_student_blend_v100_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v102_online_historical_benchmark_defaults_to_samples_4 -q`
   - result:
     - `4 passed`
381. Machine-wide check before launching item 379:
   - about `1.0 TiB` used
   - about `1.9 TiB` available
   - no lingering `agent3_` `tmux` gate sessions were active, so the new wave could reuse clean detached session names
382. Dual-student corrected-gate wave launched from pushed commit `b6452a5c`:
   - `tmux` sessions:
     - `agent3_v99_gate`
     - `agent3_v100_gate`
     - `agent3_v101_gate`
     - `agent3_v102_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v99 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v99_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v100 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v100_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v101 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v101_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v102 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v102_targeted_holdout_2rounds_corrected --jobs 1`
383. Post-launch check for item 382:
   - `tmux` sessions confirmed:
     - `agent3_v99_gate`
     - `agent3_v100_gate`
     - `agent3_v101_gate`
     - `agent3_v102_gate`
   - live launcher / worker PIDs:
     - `v99`: `978548`, `978554`
     - `v100`: `978553`, `978558`
     - `v101`: `978560`, `978564`
     - `v102`: `978565`, `978569`
   - machine remained healthy:
     - about `1.0 TiB` used
     - about `1.9 TiB` available
384. Parallel hypothesis after item 379:
   - if dual-student routing helps only a little with a smoother temporal backup, the real missing signal may be encoder diversity rather than neighbor-count diversity
385. Implemented dual-student encoder-diversity variants:
   - new variants:
     - `teacher_student_blend_v103`
     - `teacher_student_blend_v104`
     - `teacher_student_blend_v105`
     - `teacher_student_blend_v106`
   - mapping:
     - `v103` = `v59` backbone + semantic `k=5` secondary expert + distance scale `2.0`
     - `v104` = `v60` backbone + semantic `k=5` secondary expert + distance scale `2.0`
     - `v105` = `v59` backbone + spatial `k=5` secondary expert + distance scale `2.0`
     - `v106` = `v60` backbone + spatial `k=5` secondary expert + distance scale `2.0`
   - architecture extension:
     - `SummaryBankVariantSpec` now supports `secondary_summary_encoder`
     - secondary checkpoints can now encode a different summary family from the primary student while reusing the same teacher/base caches
386. Validation for item 385:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_variant_with_secondary_student_can_use_distinct_encoder tests/test_historical_benchmark.py::test_teacher_student_blend_v104_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v106_online_historical_benchmark_defaults_to_samples_4 -q`
   - result:
     - `3 passed`
387. Machine-wide check before launching item 385:
   - about `1.2 TiB` used
   - about `1.8 TiB` available
   - with `v99-v102` plus 4 full LOO runs live, shared-machine RAM headroom still remained comfortably above `1.5 TiB`
388. Encoder-diverse dual-student corrected-gate wave launched from pushed commit `5c3e20ff`:
   - `tmux` sessions:
     - `agent3_v103_gate`
     - `agent3_v104_gate`
     - `agent3_v105_gate`
     - `agent3_v106_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v103 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v103_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v104 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v104_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v105 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v105_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v106 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v106_targeted_holdout_2rounds_corrected --jobs 1`
389. Post-launch check for item 388:
   - `tmux` sessions confirmed:
     - `agent3_v103_gate`
     - `agent3_v104_gate`
     - `agent3_v105_gate`
     - `agent3_v106_gate`
   - live launcher / worker PIDs:
     - `v103`: `1386602`, `1386607`
     - `v104`: `1386608`, `1386613`
     - `v105`: `1386614`, `1386618`
     - `v106`: `1386619`, `1386623`
   - machine remained healthy:
     - about `1.2 TiB` used
     - about `1.7 TiB` available
390. Dual-student routing results landed:
   - finished corrected-gate artifacts:
     - `teacher_student_blend_v99`
     - `teacher_student_blend_v100`
     - `teacher_student_blend_v101`
     - `teacher_student_blend_v102`
     - `teacher_student_blend_v103`
     - `teacher_student_blend_v104`
     - `teacher_student_blend_v105`
     - `teacher_student_blend_v106`
   - aggregate results:
     - `v99`: mean score `65.4649`, mean weighted KL `0.141802`
     - `v100`: mean score `65.4188`, mean weighted KL `0.142051`
     - `v101`: mean score `65.4649`, mean weighted KL `0.141802`
     - `v102`: mean score `65.4188`, mean weighted KL `0.142051`
     - `v103`: mean score `65.4649`, mean weighted KL `0.141802`
     - `v104`: mean score `65.4188`, mean weighted KL `0.142051`
     - `v105`: mean score `65.4649`, mean weighted KL `0.141802`
     - `v106`: mean score `65.4188`, mean weighted KL `0.142051`
391. Read from item 390:
   - binary observed/unobserved routing is completely saturated on this corrected gate
   - coverage-distance routing adds no headroom once the coverage policy has effectively touched almost the entire map
   - encoder diversity also stays inert under that binary router, so the next router must depend on observation count intensity rather than coverage reach
392. Resource cleanup after item 390:
   - killed stale finished gate processes for `v101-v106`
   - killed dominated old full LOO runs for `v51`, `v52`, and `v60`
   - kept `v59` full LOO alive as the only remaining anchor full run
393. New hypothesis after item 391:
   - the right cellwise router is observation-count driven: unobserved and lightly seen cells go to a backup expert, while heavily revisited cells stay on the sharp primary expert
394. Implemented observation-count-routed dual-student variants:
   - new variants:
     - `teacher_student_blend_v107`
     - `teacher_student_blend_v108`
     - `teacher_student_blend_v109`
     - `teacher_student_blend_v110`
   - mapping:
     - `v107` = `v59` backbone + temporal `k=5` secondary expert + observation-count route scale `3.0`
     - `v108` = `v60` backbone + temporal `k=5` secondary expert + observation-count route scale `3.0`
     - `v109` = `v59` backbone + semantic `k=5` secondary expert + observation-count route scale `3.0`
     - `v110` = `v60` backbone + semantic `k=5` secondary expert + observation-count route scale `3.0`
   - architecture extension:
     - added secondary route modes
     - `coverage_distance` stays available
     - `observation_count` now routes by per-cell observed sample count instead of binary coverage
395. Validation for item 394:
   - focused command:
     - `uv run pytest tests/test_teacher_student.py::test_summary_bank_secondary_student_weight_map_prefers_smoother_far_from_observed tests/test_teacher_student.py::test_summary_bank_secondary_student_count_route_prefers_smoother_low_count_cells tests/test_historical_benchmark.py::test_teacher_student_blend_v108_online_historical_benchmark_defaults_to_samples_4 tests/test_historical_benchmark.py::test_teacher_student_blend_v110_online_historical_benchmark_defaults_to_samples_4 -q`
   - result:
     - `4 passed`
396. Machine-wide check before launching item 394:
   - about `1.5 TiB` used
   - about `1.4 TiB` available
   - only `v59` full LOO remained alive from the old promotion queue
397. Observation-count-routed corrected-gate wave launched from pushed commit `8710b9ce`:
   - `tmux` sessions:
     - `agent3_v107_gate`
     - `agent3_v108_gate`
     - `agent3_v109_gate`
     - `agent3_v110_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v107 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v107_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v108 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v108_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v109 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v109_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model teacher_student_blend_v110 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_teacher_student_blend_v110_targeted_holdout_2rounds_corrected --jobs 1`
398. Post-launch check for item 397:
   - `tmux` sessions confirmed:
     - `agent3_v107_gate`
     - `agent3_v108_gate`
     - `agent3_v109_gate`
     - `agent3_v110_gate`
   - live launcher / worker PIDs:
     - `v107`: `2133176`, `2133181`
     - `v108`: `2133182`, `2133185`
     - `v109`: `2134031`, `2134086`
     - `v110`: `2134087`, `2134093`
   - machine remained healthy:
     - about `1.7 TiB` used
     - about `1.2 TiB` available
399. Corrected-gate results landed for the observation-count-routed wave:
   - artifacts:
     - `data/artifacts/benchmarks/agent3_teacher_student_blend_v107_targeted_holdout_2rounds_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_teacher_student_blend_v108_targeted_holdout_2rounds_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_teacher_student_blend_v109_targeted_holdout_2rounds_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_teacher_student_blend_v110_targeted_holdout_2rounds_corrected/result.json`
   - aggregate results:
     - `v107`: mean score `65.4595`, mean weighted KL `0.141831`
     - `v108`: mean score `65.4131`, mean weighted KL `0.142083`
     - `v109`: mean score `64.9455`, mean weighted KL `0.144493`
     - `v110`: mean score `64.9147`, mean weighted KL `0.144665`
400. Read from item 399:
   - observation-count routing is slightly more informative than binary coverage routing, but still not enough to beat the `v59` anchor
   - temporal secondary expert nearly ties the anchor, semantic secondary expert is clearly worse
   - router-only changes look exhausted; next branch must alter cellwise probabilities directly rather than only switching experts
401. New radical hypothesis after item 400:
   - the missing headroom may be in local map-space refinement, not only round-level latent inference
   - build a new `evidence_field_blend` family that starts from the strongest summary-bank base model and then adds local blurred empirical evidence fields directly into per-cell logits
   - expected win mode:
     - propagate observed built-class evidence into nearby plausible cells
     - strengthen ports/ruins differently from generic settlement mass
     - help lightly seen or unseen cells without damping already well-observed cells
402. Implemented the new `evidence_field_blend` family:
   - new file:
     - `src/astar/student/predictor/evidence_field.py`
   - new reproducible model names:
     - `evidence_field_blend`
     - `evidence_field_blend_v1`
     - `evidence_field_blend_v2`
     - `evidence_field_blend_v3`
     - `evidence_field_blend_v4`
     - `evidence_field_blend_v5`
     - `evidence_field_blend_v6`
   - family structure:
     - base predictor is `teacher_student_blend_v59` or `teacher_student_blend_v60`
     - local evidence field uses blurred observed class counts
     - field is gated by low local support and nearby evidence support
     - class-specific logit deltas are applied for settlement / port / ruin / forest / empty
     - all variants fix `samples_per_round=4`
403. Reproducibility and framework wiring fixes for item 402:
   - `interactive.py` now resolves evidence-field model names through the standard online predictor path
   - `historical_benchmark.py` and `targeted_holdout_benchmark.py` now resolve evidence-field sample-count defaults and model suffixes correctly
   - `model_eval.py` now imports the evidence-field spec resolver and records evidence-field sample-count defaults correctly in benchmark seed results
   - `cli.py` no longer hardcodes stale giant model lists for online-capable models; it now uses centralized dynamic choice sets, which also exposes evidence-field variants through:
     - `visualize-model-prediction`
     - `run-synthetic-tournament`
     - `run-synthetic-benchmark`
     - `run-historical-benchmark`
     - `run-live-online`
404. Focused validation for the new family and CLI wiring:
   - command:
     - `uv run pytest tests/test_cli.py tests/test_teacher_student.py::test_evidence_field_local_refinement_spreads_built_signal_to_neighbors tests/test_historical_benchmark.py::test_evidence_field_blend_v2_online_historical_benchmark_defaults_to_samples_4 -q`
   - result:
     - `4 passed`
   - new regression coverage:
     - CLI accepts evidence-field models for historical and live commands
     - local evidence-field refinement increases nearby built-class mass
     - evidence-field historical benchmark defaults to `samples_per_round=4`
405. Fresh machine-wide check before the first evidence-field launch wave:
   - about `1.6 TiB` used
   - about `1.3 TiB` available
   - large active loads from other agents are still present, especially multiple `20-26 GiB` workers on `agent1`
   - only one heavy agent3 long run is still alive:
     - `agent3_dev_teacher_student_blend_v59_full_corrected`
406. Committed and pushed the evidence-field family wiring:
   - commit:
     - `342e1b6d`
   - message:
     - `agent3: add evidence-field blend family`
407. First evidence-field corrected-gate sweep launched from commit `342e1b6d`:
   - pre-launch memory gate:
     - `available_gib=1418`
   - `tmux` sessions:
     - `agent3_evidence_v1_gate`
     - `agent3_evidence_v2_gate`
     - `agent3_evidence_v3_gate`
     - `agent3_evidence_v4_gate`
     - `agent3_evidence_v5_gate`
     - `agent3_evidence_v6_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model evidence_field_blend_v1 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_evidence_field_blend_v1_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model evidence_field_blend_v2 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_evidence_field_blend_v2_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model evidence_field_blend_v3 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_evidence_field_blend_v3_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model evidence_field_blend_v4 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_evidence_field_blend_v4_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model evidence_field_blend_v5 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_evidence_field_blend_v5_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model evidence_field_blend_v6 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_evidence_field_blend_v6_targeted_holdout_2rounds_corrected --jobs 1`
408. First evidence-field corrected-gate results landed quickly and failed:
   - artifacts:
     - `data/artifacts/benchmarks/agent3_evidence_field_blend_v1_targeted_holdout_2rounds_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_evidence_field_blend_v2_targeted_holdout_2rounds_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_evidence_field_blend_v3_targeted_holdout_2rounds_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_evidence_field_blend_v4_targeted_holdout_2rounds_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_evidence_field_blend_v5_targeted_holdout_2rounds_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_evidence_field_blend_v6_targeted_holdout_2rounds_corrected/result.json`
   - aggregate results:
     - `v1`: mean score `63.7792`, mean weighted KL `0.150194`
     - `v2`: mean score `63.7479`, mean weighted KL `0.150357`
     - `v3`: mean score `63.9939`, mean weighted KL `0.149053`
     - `v4`: mean score `63.9620`, mean weighted KL `0.149216`
     - `v5`: mean score `63.7051`, mean weighted KL `0.150590`
     - `v6`: mean score `63.6746`, mean weighted KL `0.150751`
409. Read from item 408:
   - direct blurred class-count fields are not enough
   - best count-field variant `v3` is still far below the current gate anchor `v59` (`65.4649`)
   - the next local-field branch should use richer live evidence than endpoint class counts alone
410. New hypothesis after item 409:
   - use raw live settlement states directly:
     - settlement positions
     - population
     - food
     - wealth
     - defense
     - port status
     - alive state
   - convert those observations into local thriving / port / collapse fields around the observed settlement coordinates, then refine the base summary-bank logits with those fields
411. Implemented settlement-state local-field variants inside the evidence-field family:
   - new variants:
     - `evidence_field_blend_v7`
     - `evidence_field_blend_v8`
     - `evidence_field_blend_v9`
     - `evidence_field_blend_v10`
   - structure:
     - `v7/v8`: state-field only on top of `v59/v60`
     - `v9/v10`: state-field plus a lighter version of the old count field on top of `v59/v60`
   - implementation details:
     - added normalized settlement-state scoring for thriving / collapse
     - added local Gaussian state fields centered at observed settlement coordinates
     - added support gate from observed local count total so strong local evidence does not overwrite already well-observed cells too aggressively
412. Focused validation for item 411:
   - command:
     - `uv run pytest tests/test_teacher_student.py::test_evidence_field_settlement_state_refinement_uses_live_settlement_stats tests/test_historical_benchmark.py::test_evidence_field_blend_v8_online_historical_benchmark_defaults_to_samples_4 -q`
   - result:
     - `2 passed`
   - extra check:
     - `uv run python -m py_compile src/astar/student/predictor/evidence_field.py tests/test_teacher_student.py tests/test_historical_benchmark.py`
413. Committed and pushed the settlement-state evidence-field branch:
   - commit:
     - `85a216d3`
   - message:
     - `agent3: add settlement-state evidence fields`
414. Settlement-state corrected-gate wave launched from commit `85a216d3`:
   - pre-launch memory gate:
     - `available_gib=1826`
   - old `v1-v6` `tmux` sessions were killed before relaunch
   - new `tmux` sessions:
     - `agent3_evidence_v7_gate`
     - `agent3_evidence_v8_gate`
     - `agent3_evidence_v9_gate`
     - `agent3_evidence_v10_gate`
415. Settlement-state corrected-gate results landed and also failed:
   - artifacts:
     - `data/artifacts/benchmarks/agent3_evidence_field_blend_v7_targeted_holdout_2rounds_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_evidence_field_blend_v8_targeted_holdout_2rounds_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_evidence_field_blend_v9_targeted_holdout_2rounds_corrected/result.json`
     - `data/artifacts/benchmarks/agent3_evidence_field_blend_v10_targeted_holdout_2rounds_corrected/result.json`
   - aggregate results:
     - `v7`: mean score `63.4523`, mean weighted KL `0.151868`
     - `v8`: mean score `63.4226`, mean weighted KL `0.152021`
     - `v9`: mean score `63.8063`, mean weighted KL `0.149983`
     - `v10`: mean score `63.7749`, mean weighted KL `0.150139`
416. Read from item 415:
   - raw local settlement-state fields improve slightly over the naive count-field branch only when mixed lightly with the count field (`v9/v10`), but they are still far below `v59`
   - direct local coordinate painting looks too noisy / too query-sample-specific under this corrected holdout
417. New hypothesis after item 416:
   - use the richer settlement-state evidence globally instead of locally:
     - mean population
     - mean food
     - mean wealth
     - mean defense
     - alive fraction
     - port fraction
     - owner fragmentation
   - turn those seed-level statistics into feature-map logit shifts over buildable / coastal / frontier structure, optionally mixed with a very light count field
418. Implemented global-state feature-map evidence-field variants:
   - new variants:
     - `evidence_field_blend_v11`
     - `evidence_field_blend_v12`
     - `evidence_field_blend_v13`
     - `evidence_field_blend_v14`
   - mapping:
     - `v11/v12`: global-state feature maps only on top of `v59/v60`
     - `v13/v14`: global-state feature maps + light count field on top of `v59/v60`
419. Focused validation for item 418:
   - command:
     - `uv run pytest tests/test_teacher_student.py::test_evidence_field_global_state_refinement_uses_seed_level_state_summary tests/test_historical_benchmark.py::test_evidence_field_blend_v12_online_historical_benchmark_defaults_to_samples_4 -q`
   - result:
     - `2 passed`
   - extra check:
     - `uv run python -m py_compile src/astar/student/predictor/evidence_field.py tests/test_teacher_student.py tests/test_historical_benchmark.py`
420. Committed and pushed the global-state evidence-field branch:
   - commit:
     - `c8de0c45`
   - message:
     - `agent3: add global-state evidence fields`
421. Global-state corrected-gate wave launched from commit `c8de0c45`:
   - pre-launch memory gate:
     - `available_gib=1785`
   - old `v7-v10` `tmux` sessions were killed before relaunch
   - new `tmux` sessions:
     - `agent3_evidence_v11_gate`
     - `agent3_evidence_v12_gate`
     - `agent3_evidence_v13_gate`
     - `agent3_evidence_v14_gate`
   - commands:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model evidence_field_blend_v11 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_evidence_field_blend_v11_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model evidence_field_blend_v12 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_evidence_field_blend_v12_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model evidence_field_blend_v13 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_evidence_field_blend_v13_targeted_holdout_2rounds_corrected --jobs 1`
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model evidence_field_blend_v14 --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_evidence_field_blend_v14_targeted_holdout_2rounds_corrected --jobs 1`
422. Short first poll after item 421:
   - `v11-v14` were still pending
   - no result artifact had landed yet at the first poll
423. Global-state corrected-gate results landed and failed hard:
   - aggregate results:
     - `v11`: mean score `59.2561`, mean weighted KL `0.174820`
     - `v12`: mean score `59.1783`, mean weighted KL `0.175261`
     - `v13`: mean score `56.9547`, mean weighted KL `0.188653`
     - `v14`: mean score `56.8772`, mean weighted KL `0.189131`
424. Read from item 423:
   - global state-feature maps are worse than both local-field branches
   - the whole evidence-field family is now clearly dominated and was stopped
   - next branch should stop painting heuristic fields entirely and instead retrieve terminal tensors directly from replay-backed synthetic transcript memory
425. New radical hypothesis after item 424:
   - use replay-backed synthetic live episodes as a direct nearest-neighbor memory bank
   - compute compact per-seed transcript vectors from:
     - pooled observed class frequencies
     - seed observed class frequencies
     - seed/global settlement-state summaries
     - simple geometry summary scalars
   - retrieve nearest historical synthetic transcripts and average their terminal target tensors directly
   - blend that direct memory prediction with the strong `teacher_student_blend` base model instead of fitting another residual/field heuristic
426. Implemented the new `transcript_memory` family:
   - new file:
     - `src/astar/student/predictor/transcript_memory.py`
   - reproducible models:
     - `transcript_memory`
     - `transcript_memory_v1`
     - `transcript_memory_v2`
     - `transcript_memory_v3`
     - `transcript_memory_v4`
     - `transcript_memory_v5`
     - `transcript_memory_v6`
   - variant mapping:
     - `v1/v2`: base `v59/v60`, samples `8`, `k=5`, blend `0.35`
     - `v3/v4`: base `v59/v60`, samples `16`, `k=5`, blend `0.35`
     - `v5/v6`: base `v59/v60`, samples `16`, `k=3`, blend `0.50`
427. Framework wiring for item 426:
   - `interactive.py` supports transcript-memory models online
   - `historical_benchmark.py`, `targeted_holdout_benchmark.py`, and `model_eval.py` resolve transcript-memory sample defaults and artifacts correctly
   - `cli.py` exposes transcript-memory models through the centralized online model-choice set
428. Validation for item 426:
   - command:
     - `uv run pytest tests/test_cli.py::test_cli_accepts_transcript_memory_historical_benchmark_model tests/test_teacher_student.py::test_transcript_memory_seed_vector_reflects_observed_class_counts tests/test_historical_benchmark.py::test_transcript_memory_v2_online_historical_benchmark_defaults_to_samples_8 -q`
   - result:
     - `3 passed`
   - extra checks:
     - `uv run python -m py_compile src/astar/student/predictor/transcript_memory.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/workflows/targeted_holdout_benchmark.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_cli.py tests/test_historical_benchmark.py tests/test_teacher_student.py`
   - robustness fix during validation:
     - transcript-memory target loading now falls back to raw analysis JSON when derived analysis `.npz` tensors are absent in small test workspaces
429. Git checkpoint created + pushed for the new transcript-retrieval branch:
   - commit:
     - `46331340`
   - message:
     - `agent3: add transcript memory retrieval family`
430. Launch state for item 426:
   - machine headroom before launch:
     - available memory about `1861 GiB`
   - corrected targeted-holdout gate sessions started:
     - `agent3_tmemory_v1_gate`
     - `agent3_tmemory_v2_gate`
     - `agent3_tmemory_v3_gate`
     - `agent3_tmemory_v4_gate`
     - `agent3_tmemory_v5_gate`
     - `agent3_tmemory_v6_gate`
   - command family:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model transcript_memory_vX --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_transcript_memory_vX_targeted_holdout_2rounds_corrected --jobs 1`
431. New hypothesis branch started without waiting for item 430:
   - family:
     - `transcript_residual_memory`
   - hypothesis:
     - direct transcript-target averaging may be too blunt because it overwrites the strong `v59/v60` base everywhere
     - nearest-neighbor transcript retrieval should work better as a correction memory: retrieve deltas between target tensors and base predictions at similar transcript states, then add only those local deltas back to the current base prediction
   - objective:
     - keep global calibration/structure from the strong base model while transferring sharper local corrections from replay-backed nearest transcripts
432. Implemented + validated `transcript_residual_memory`:
   - new file:
     - `src/astar/student/predictor/transcript_residual_memory.py`
   - reproducible models:
     - `transcript_residual_memory`
     - `transcript_residual_memory_v1`
     - `transcript_residual_memory_v2`
     - `transcript_residual_memory_v3`
     - `transcript_residual_memory_v4`
     - `transcript_residual_memory_v5`
     - `transcript_residual_memory_v6`
     - `transcript_residual_memory_v7`
     - `transcript_residual_memory_v8`
   - variant mapping:
     - `v1/v2`: base `v59/v60`, samples `8`, `k=5`, correction scale `0.75`
     - `v3/v4`: base `v59/v60`, samples `8`, `k=5`, correction scale `1.00`
     - `v5/v6`: base `v59/v60`, samples `16`, `k=3`, correction scale `1.00`
     - `v7/v8`: base `v59/v60`, samples `16`, `k=3`, correction scale `1.25`
   - framework wiring:
     - `interactive.py`, `historical_benchmark.py`, `targeted_holdout_benchmark.py`, `model_eval.py`, and `cli.py`
   - validation command:
     - `uv run python -m py_compile src/astar/student/predictor/transcript_residual_memory.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/workflows/targeted_holdout_benchmark.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_cli.py tests/test_historical_benchmark.py tests/test_teacher_student.py && uv run pytest tests/test_cli.py::test_cli_accepts_transcript_residual_memory_historical_benchmark_model tests/test_teacher_student.py::test_transcript_residual_memory_blend_with_residual_shifts_mass tests/test_historical_benchmark.py::test_transcript_residual_memory_v2_online_historical_benchmark_defaults_to_samples_8 -q`
   - validation result:
     - `3 passed`
433. Git checkpoint created + pushed for item 432:
   - commit:
     - `689d01a1`
   - message:
     - `agent3: add transcript residual memory family`
434. Launch state for item 432:
   - machine headroom before launch:
     - available memory about `2.0 TiB`
   - corrected targeted-holdout gate sessions started:
     - `agent3_tresid_v1_gate`
     - `agent3_tresid_v2_gate`
     - `agent3_tresid_v3_gate`
     - `agent3_tresid_v4_gate`
     - `agent3_tresid_v5_gate`
     - `agent3_tresid_v6_gate`
     - `agent3_tresid_v7_gate`
     - `agent3_tresid_v8_gate`
   - command family:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model transcript_residual_memory_vX --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_transcript_residual_memory_vX_targeted_holdout_2rounds_corrected --jobs 1`
435. New hypothesis branch started while items 430 and 434 cache/build:
   - family:
     - `transcript_sequence_residual_memory`
   - hypothesis:
     - both `transcript_memory` and `transcript_residual_memory` still compress the transcript to order-agnostic bag statistics
     - round law may depend on which windows were queried early vs late and on the actual local patch content trajectory
     - nearest-neighbor residual retrieval should improve if the retrieval key includes an ordered query-token tape: viewport path, patch class histogram, and live settlement summary for the last few per-seed queries
   - objective:
     - test transcript-order sensitivity directly instead of only better bagging
436. Implemented + validated `transcript_sequence_residual_memory`:
   - new file:
     - `src/astar/student/predictor/transcript_sequence_residual_memory.py`
   - reproducible models:
     - `transcript_sequence_residual_memory`
     - `transcript_sequence_residual_memory_v1`
     - `transcript_sequence_residual_memory_v2`
     - `transcript_sequence_residual_memory_v3`
     - `transcript_sequence_residual_memory_v4`
     - `transcript_sequence_residual_memory_v5`
     - `transcript_sequence_residual_memory_v6`
     - `transcript_sequence_residual_memory_v7`
     - `transcript_sequence_residual_memory_v8`
   - variant mapping:
     - `v1/v2`: base `v59/v60`, samples `8`, last `4` queries, `k=5`, correction scale `0.75`
     - `v3/v4`: base `v59/v60`, samples `8`, last `8` queries, `k=5`, correction scale `0.75`
     - `v5/v6`: base `v59/v60`, samples `16`, last `4` queries, `k=3`, correction scale `1.00`
     - `v7/v8`: base `v59/v60`, samples `16`, last `8` queries, `k=3`, correction scale `1.00`
   - framework wiring:
     - `interactive.py`, `historical_benchmark.py`, `targeted_holdout_benchmark.py`, `model_eval.py`, and `cli.py`
   - representation:
     - retrieval key is the bag-summary vector plus ordered per-query tokens containing viewport path, collapsed 6-class patch frequencies, and live settlement summary
   - validation command:
     - `uv run python -m py_compile src/astar/student/predictor/transcript_sequence_residual_memory.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/workflows/targeted_holdout_benchmark.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_cli.py tests/test_historical_benchmark.py tests/test_teacher_student.py && uv run pytest tests/test_cli.py::test_cli_accepts_transcript_sequence_residual_memory_historical_benchmark_model tests/test_teacher_student.py::test_transcript_sequence_query_token_vector_is_order_sensitive tests/test_historical_benchmark.py::test_transcript_sequence_residual_memory_v2_online_historical_benchmark_defaults_to_samples_8 -q`
   - validation result:
     - `3 passed`
   - bug fixed during validation:
     - query-token patch histograms must collapse raw internal terrain codes to the scored 6-class space before frequency encoding
437. New hypothesis branch started while transcript-memory, transcript-residual-memory, and transcript-sequence-residual-memory gates all build/cache:
   - family:
     - `transcript_sequence_factor_residual`
   - hypothesis:
     - nearest-neighbor memory may still be too brittle/noisy on sparse held-out rounds
     - instead of retrieving a single local memory neighborhood, fit a global low-rank residual operator from ordered transcript features to terminal residual tensors
     - factorizing residual tensors should let transcript features predict only a small number of shared residual modes, which may generalize better than raw kNN copying
   - objective:
     - test a proper parametric transcript-to-residual model, still anchored on strong `v59/v60`, using sequence-aware transcript features rather than bag summaries
438. Implemented + validated `transcript_sequence_factor_residual`:
   - new file:
     - `src/astar/student/predictor/transcript_sequence_factor_residual.py`
   - reproducible models:
     - `transcript_sequence_factor_residual`
     - `transcript_sequence_factor_residual_v1`
     - `transcript_sequence_factor_residual_v2`
     - `transcript_sequence_factor_residual_v3`
     - `transcript_sequence_factor_residual_v4`
   - variant mapping:
     - `v1/v2`: base `v59/v60`, samples `8`, last `4` queries, factor rank `8`, ridge `1.0`, correction scale `0.75`
     - `v3/v4`: base `v59/v60`, samples `16`, last `8` queries, factor rank `16`, ridge `2.0`, correction scale `1.00`
   - model form:
     - ordered transcript sequence vector -> ridge regression -> low-rank residual coefficients -> reconstructed residual tensor -> add to base `v59/v60`
   - framework wiring:
     - `interactive.py`, `historical_benchmark.py`, `targeted_holdout_benchmark.py`, `model_eval.py`, and `cli.py`
   - validation command:
     - `uv run python -m py_compile src/astar/student/predictor/transcript_sequence_factor_residual.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/workflows/targeted_holdout_benchmark.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_cli.py tests/test_historical_benchmark.py tests/test_teacher_student.py && uv run pytest tests/test_cli.py::test_cli_accepts_transcript_sequence_factor_residual_historical_benchmark_model tests/test_teacher_student.py::test_transcript_sequence_factor_residual_ridge_weights_fit_targets tests/test_historical_benchmark.py::test_transcript_sequence_factor_residual_v2_online_historical_benchmark_defaults_to_samples_8 -q`
   - validation result:
     - `3 passed`
439. Git checkpoints created + pushed for the new sequence-aware families:
   - commit:
     - `d16c8e12`
   - message:
     - `agent3: add transcript sequence residual memory family`
   - commit:
     - `9f6291a6`
   - message:
     - `agent3: add transcript sequence factor residual family`
440. Launch state for the sequence-aware families:
   - machine headroom before latest launch:
     - available memory about `2.0 TiB`
   - corrected targeted-holdout gate sessions started for `transcript_sequence_residual_memory`:
     - `agent3_tseq_v1_gate`
     - `agent3_tseq_v2_gate`
     - `agent3_tseq_v3_gate`
     - `agent3_tseq_v4_gate`
     - `agent3_tseq_v5_gate`
     - `agent3_tseq_v6_gate`
     - `agent3_tseq_v7_gate`
     - `agent3_tseq_v8_gate`
   - corrected targeted-holdout gate sessions started for `transcript_sequence_factor_residual`:
     - `agent3_tfactor_v1_gate`
     - `agent3_tfactor_v2_gate`
     - `agent3_tfactor_v3_gate`
     - `agent3_tfactor_v4_gate`
   - launch policy:
     - all new gates use `jobs=1`
     - factor-residual family limited to `4` variants live at once because transcript-memory, transcript-residual-memory, and transcript-sequence-residual-memory waves are already running on the shared machine
441. New hypothesis branch started while all prior radical families still build/cache:
   - family:
     - `round_transcript_residual_memory`
   - hypothesis:
     - per-seed transcript retrieval may miss the shared within-round law that ties all five seeds together
     - retrieve a whole-round residual bundle using the concatenated ordered transcript state of every seed, then apply the matched bundle back to each seed prediction jointly
   - objective:
     - explicitly model cross-seed round coupling rather than only pooled scalar context
442. Implemented + validated `round_transcript_residual_memory`:
   - new file:
     - `src/astar/student/predictor/round_transcript_residual_memory.py`
   - reproducible models:
     - `round_transcript_residual_memory`
     - `round_transcript_residual_memory_v1`
     - `round_transcript_residual_memory_v2`
     - `round_transcript_residual_memory_v3`
     - `round_transcript_residual_memory_v4`
   - variant mapping:
     - `v1/v2`: base `v59/v60`, samples `8`, last `4` queries, `k=5`, correction scale `0.75`
     - `v3/v4`: base `v59/v60`, samples `16`, last `8` queries, `k=3`, correction scale `1.00`
   - model form:
     - concatenate ordered transcript-state vectors across all seeds, add pooled mean/std summary, retrieve nearest whole-round residual bundles, then apply matched per-seed residuals jointly
   - framework wiring:
     - `interactive.py`, `historical_benchmark.py`, `targeted_holdout_benchmark.py`, `model_eval.py`, and `cli.py`
   - validation command:
     - `uv run python -m py_compile src/astar/student/predictor/round_transcript_residual_memory.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/workflows/targeted_holdout_benchmark.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_cli.py tests/test_historical_benchmark.py tests/test_teacher_student.py && uv run pytest tests/test_cli.py::test_cli_accepts_round_transcript_residual_memory_historical_benchmark_model tests/test_teacher_student.py::test_round_transcript_residual_memory_round_vector_includes_cross_seed_state tests/test_historical_benchmark.py::test_round_transcript_residual_memory_v2_online_historical_benchmark_defaults_to_samples_8 -q`
   - validation result:
     - `3 passed`
443. Git checkpoint created + pushed for item 442:
   - commit:
     - `e5aa94ef`
   - message:
     - `agent3: add round transcript residual memory family`
444. Launch state for `round_transcript_residual_memory`:
   - machine headroom before launch:
     - available memory about `1.7 TiB`
   - corrected targeted-holdout gate sessions started:
     - `agent3_tround_v1_gate`
     - `agent3_tround_v2_gate`
     - `agent3_tround_v3_gate`
     - `agent3_tround_v4_gate`
   - command family:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model round_transcript_residual_memory_vX --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_round_transcript_residual_memory_vX_targeted_holdout_2rounds_corrected --jobs 1`
   - launch policy:
     - only `4` variants live
     - `jobs=1` each
     - kept conservative because the shared machine already has transcript-memory, transcript-residual-memory, transcript-sequence-residual-memory, and transcript-sequence-factor-residual waves active
445. New hypothesis branch started while all current radical families still build/cache:
   - family:
     - `round_transcript_factor_residual`
   - hypothesis:
     - whole-round nearest-neighbor retrieval may still be too brittle and variance-heavy
     - fit a parametric low-rank operator from whole-round ordered transcript state to a joint residual bundle across all seeds
     - this keeps the cross-seed coupling idea from item 441, but replaces bundle copying with shared residual modes
   - objective:
     - test whether a compact round-level residual manifold generalizes better than round-level memory lookup
446. Implemented + validated `round_transcript_factor_residual`:
   - new file:
     - `src/astar/student/predictor/round_transcript_factor_residual.py`
   - reproducible models:
     - `round_transcript_factor_residual`
     - `round_transcript_factor_residual_v1`
     - `round_transcript_factor_residual_v2`
     - `round_transcript_factor_residual_v3`
     - `round_transcript_factor_residual_v4`
   - variant mapping:
     - `v1/v2`: base `v59/v60`, samples `8`, last `4` queries, factor rank `12`, ridge `1.0`, correction scale `0.75`
     - `v3/v4`: base `v59/v60`, samples `16`, last `8` queries, factor rank `24`, ridge `2.0`, correction scale `1.00`
   - model form:
     - whole-round ordered transcript state -> ridge regression -> low-rank joint residual coefficients -> reconstructed residual bundle across all seeds
   - framework wiring:
     - `interactive.py`, `historical_benchmark.py`, `targeted_holdout_benchmark.py`, `model_eval.py`, and `cli.py`
   - validation command:
     - `uv run python -m py_compile src/astar/student/predictor/round_transcript_factor_residual.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/workflows/targeted_holdout_benchmark.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_cli.py tests/test_historical_benchmark.py tests/test_teacher_student.py && uv run pytest tests/test_cli.py::test_cli_accepts_round_transcript_factor_residual_historical_benchmark_model tests/test_teacher_student.py::test_round_transcript_factor_residual_ridge_reconstruction_sane tests/test_historical_benchmark.py::test_round_transcript_factor_residual_v2_online_historical_benchmark_defaults_to_samples_8 -q`
   - validation result:
     - `3 passed`
447. Git checkpoint created + pushed for item 446:
   - commit:
     - `86ec6c6e`
   - message:
     - `agent3: add round transcript factor residual family`
448. Launch state for `round_transcript_factor_residual`:
   - machine headroom before launch:
     - available memory about `1.5 TiB`
   - corrected targeted-holdout gate sessions started:
     - `agent3_troundfactor_v1_gate`
     - `agent3_troundfactor_v2_gate`
     - `agent3_troundfactor_v3_gate`
     - `agent3_troundfactor_v4_gate`
   - command family:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model round_transcript_factor_residual_vX --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_round_transcript_factor_residual_vX_targeted_holdout_2rounds_corrected --jobs 1`
   - launch policy:
     - only `4` variants live
     - `jobs=1` each
     - no further wave stacked after this one because shared-machine headroom fell to about `1.5 TiB`
449. New hypothesis branch started while all earlier radical families still build/cache:
   - family:
     - `round_transcript_prototype_residual`
   - hypothesis:
     - whole-round factor regression may wash out sharp discrete regime structure
     - cluster whole-round transcript states into a small set of latent prototypes and store average residual bundles per prototype
     - soft assignment over prototypes should capture discrete round laws better than continuous low-rank extrapolation
   - objective:
     - test a discrete latent round-regime model over whole-round ordered transcripts
450. Implemented + validated `round_transcript_prototype_residual`:
   - new file:
     - `src/astar/student/predictor/round_transcript_prototype_residual.py`
   - reproducible models:
     - `round_transcript_prototype_residual`
     - `round_transcript_prototype_residual_v1`
     - `round_transcript_prototype_residual_v2`
     - `round_transcript_prototype_residual_v3`
     - `round_transcript_prototype_residual_v4`
   - variant mapping:
     - `v1/v2`: base `v59/v60`, samples `8`, last `4` queries, `8` prototypes, correction scale `0.75`
     - `v3/v4`: base `v59/v60`, samples `16`, last `8` queries, `12` prototypes, correction scale `1.00`
   - model form:
     - whole-round ordered transcript state -> soft assignment over discrete prototype centers -> average residual bundle over prototypes -> apply jointly across seeds
   - framework wiring:
     - `interactive.py`, `historical_benchmark.py`, `targeted_holdout_benchmark.py`, `model_eval.py`, and `cli.py`
   - validation command:
     - `uv run python -m py_compile src/astar/student/predictor/round_transcript_prototype_residual.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/workflows/targeted_holdout_benchmark.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_cli.py tests/test_historical_benchmark.py tests/test_teacher_student.py && uv run pytest tests/test_cli.py::test_cli_accepts_round_transcript_prototype_residual_historical_benchmark_model tests/test_teacher_student.py::test_round_transcript_prototype_residual_kmeans_returns_centers tests/test_historical_benchmark.py::test_round_transcript_prototype_residual_v2_online_historical_benchmark_defaults_to_samples_8 -q`
   - validation result:
     - `3 passed`
451. Git checkpoint created + pushed for item 450:
   - commit:
     - `bf60ce35`
   - message:
     - `agent3: add round transcript prototype residual family`
452. Launch state for `round_transcript_prototype_residual`:
   - machine headroom before launch:
     - available memory about `1.6 TiB`
   - corrected targeted-holdout gate sessions started:
     - `agent3_troundproto_v1_gate`
     - `agent3_troundproto_v2_gate`
     - `agent3_troundproto_v3_gate`
     - `agent3_troundproto_v4_gate`
   - command family:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model round_transcript_prototype_residual_vX --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_round_transcript_prototype_residual_vX_targeted_holdout_2rounds_corrected --jobs 1`
   - launch policy:
     - only `4` variants live
     - `jobs=1` each
     - no additional wave stacked after this launch
453. New hypothesis branch started while all transcript-based families still build/cache:
   - family:
     - `round_heatmap_factor_residual`
   - hypothesis:
     - ordered transcript encoders may still be overfitting query order and underusing the spatial observation pattern itself
     - whole-round coverage maps and observed-class count tensors may provide a cleaner state representation for round-law inference
     - low-rank regression from spatial evidence heatmaps to joint residual bundles could generalize better than transcript-sequence families
   - objective:
     - test a spatial evidence-state model, not a transcript-state model
454. Implemented + validated `round_heatmap_factor_residual`:
   - new file:
     - `src/astar/student/predictor/round_heatmap_factor_residual.py`
   - reproducible models:
     - `round_heatmap_factor_residual`
     - `round_heatmap_factor_residual_v1`
     - `round_heatmap_factor_residual_v2`
     - `round_heatmap_factor_residual_v3`
     - `round_heatmap_factor_residual_v4`
   - variant mapping:
     - `v1/v2`: base `v59/v60`, samples `8`, rank `12`, ridge `1.0`, correction scale `0.75`
     - `v3/v4`: base `v59/v60`, samples `16`, rank `24`, ridge `2.0`, correction scale `1.00`
   - model form:
     - whole-round spatial evidence heatmap vector -> ridge -> low-rank joint residual bundle -> apply jointly across all seeds on top of base `v59/v60`
   - feature content:
     - per-seed normalized coverage maps
     - square-root normalized observed count-mass maps
     - per-cell observed class-frequency tensors
     - global observed class frequencies and structural summary stats
   - framework wiring:
     - `interactive.py`, `historical_benchmark.py`, `targeted_holdout_benchmark.py`, `model_eval.py`, and `cli.py`
   - validation command:
     - `uv run python -m py_compile src/astar/student/predictor/round_heatmap_factor_residual.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/workflows/targeted_holdout_benchmark.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_cli.py tests/test_historical_benchmark.py tests/test_teacher_student.py && uv run pytest tests/test_cli.py::test_cli_accepts_round_heatmap_factor_residual_historical_benchmark_model tests/test_teacher_student.py::test_round_heatmap_factor_residual_vector_has_spatial_content tests/test_historical_benchmark.py::test_round_heatmap_factor_residual_v2_online_historical_benchmark_defaults_to_samples_8 -q`
   - validation result:
     - `3 passed`
455. Git checkpoint created + pushed for item 454:
   - commit:
     - `4669acd8`
   - message:
     - `agent3: add round heatmap factor residual family`
456. Launch state for `round_heatmap_factor_residual`:
   - machine headroom before launch:
     - available memory about `1.4 TiB`
   - corrected targeted-holdout gate sessions started:
     - `agent3_rheat_v1_gate`
     - `agent3_rheat_v2_gate`
     - `agent3_rheat_v3_gate`
     - `agent3_rheat_v4_gate`
   - command family:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model round_heatmap_factor_residual_vX --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_round_heatmap_factor_residual_vX_targeted_holdout_2rounds_corrected --jobs 1`
   - launch policy:
     - only `4` variants live
     - `jobs=1` each
     - no extra wave stacked on top because the shared box still has large non-agent3 memory load
457. New hypothesis branch started while transcript + heatmap waves run:
   - family:
     - `round_heatmap_residual_memory`
   - hypothesis:
     - whole-round spatial evidence may still be a good state representation, but the linear low-rank map in `round_heatmap_factor_residual` may be too restrictive
     - nearest-neighbor residual transfer over heatmap state could capture discrete round regimes without relying on transcript order
     - if transcript-memory branches failed mainly because the ordered state was noisy, a heatmap-state memory should recover the nonparametric benefit with cleaner retrieval geometry
   - objective:
     - test nonlinear whole-round spatial-state retrieval on top of base `v59/v60`
458. Implemented + validated `round_heatmap_residual_memory`:
   - new file:
     - `src/astar/student/predictor/round_heatmap_residual_memory.py`
   - reproducible models:
     - `round_heatmap_residual_memory`
     - `round_heatmap_residual_memory_v1`
     - `round_heatmap_residual_memory_v2`
     - `round_heatmap_residual_memory_v3`
     - `round_heatmap_residual_memory_v4`
   - variant mapping:
     - `v1/v2`: base `v59/v60`, samples `8`, `k=5`, correction scale `0.75`, distance scale `2.0`
     - `v3/v4`: base `v59/v60`, samples `16`, `k=3`, correction scale `1.00`, distance scale `1.5`
   - model form:
     - whole-round spatial evidence heatmap vector -> normalized kNN retrieval over residual bundles -> apply jointly across all seeds on top of base `v59/v60`
   - framework wiring:
     - `interactive.py`, `historical_benchmark.py`, `targeted_holdout_benchmark.py`, `model_eval.py`, and `cli.py`
   - validation command:
     - `uv run python -m py_compile src/astar/student/predictor/round_heatmap_residual_memory.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/workflows/targeted_holdout_benchmark.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_cli.py tests/test_historical_benchmark.py tests/test_teacher_student.py && uv run pytest tests/test_cli.py::test_cli_accepts_round_heatmap_residual_memory_historical_benchmark_model tests/test_teacher_student.py::test_round_heatmap_residual_memory_variant_alias_resolves tests/test_historical_benchmark.py::test_round_heatmap_residual_memory_v2_online_historical_benchmark_defaults_to_samples_8 -q`
   - validation result:
     - `3 passed`
459. Git checkpoint created + pushed for item 458:
   - commit:
     - `d3f71e94`
   - message:
     - `agent3: add round heatmap residual memory family`
460. Launch state for `round_heatmap_residual_memory`:
   - machine headroom before launch:
     - available memory about `1.6 TiB`
   - corrected targeted-holdout gate sessions started:
     - `agent3_rheatmem_v1_gate`
     - `agent3_rheatmem_v2_gate`
     - `agent3_rheatmem_v3_gate`
     - `agent3_rheatmem_v4_gate`
   - command family:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model round_heatmap_residual_memory_vX --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_round_heatmap_residual_memory_vX_targeted_holdout_2rounds_corrected --jobs 1`
   - launch policy:
     - only `4` variants live in this new wave
     - `jobs=1` each
     - no further stacking on top of this launch in the same step
461. New hypothesis branch started while heatmap factor + memory waves run:
   - family:
     - `round_heatmap_prototype_residual`
   - hypothesis:
     - the heatmap-state line may still want discrete latent regimes instead of either linear regression or raw nearest-neighbor copying
     - soft assignment over a small set of heatmap-state prototypes could preserve regime discreteness while smoothing away single-replay noise
     - if whole-round spatial law is clustered, prototype residual bundles should beat both factor and pure memory on held-out rounds
   - objective:
     - test discrete latent heatmap-state regimes on top of base `v59/v60`
462. Implemented + validated `round_heatmap_prototype_residual`:
   - new file:
     - `src/astar/student/predictor/round_heatmap_prototype_residual.py`
   - reproducible models:
     - `round_heatmap_prototype_residual`
     - `round_heatmap_prototype_residual_v1`
     - `round_heatmap_prototype_residual_v2`
     - `round_heatmap_prototype_residual_v3`
     - `round_heatmap_prototype_residual_v4`
   - variant mapping:
     - `v1/v2`: base `v59/v60`, samples `8`, `8` prototypes, distance scale `2.0`, correction scale `0.75`
     - `v3/v4`: base `v59/v60`, samples `16`, `12` prototypes, distance scale `1.5`, correction scale `1.00`
   - model form:
     - whole-round spatial evidence heatmap vector -> normalized prototype soft assignment -> prototype residual bundle -> apply jointly across all seeds on top of base `v59/v60`
   - framework wiring:
     - `interactive.py`, `historical_benchmark.py`, `targeted_holdout_benchmark.py`, `model_eval.py`, and `cli.py`
   - validation command:
     - `uv run python -m py_compile src/astar/student/predictor/round_heatmap_prototype_residual.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/workflows/targeted_holdout_benchmark.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_cli.py tests/test_historical_benchmark.py tests/test_teacher_student.py && uv run pytest tests/test_cli.py::test_cli_accepts_round_heatmap_prototype_residual_historical_benchmark_model tests/test_teacher_student.py::test_round_heatmap_prototype_residual_kmeans_returns_centers tests/test_historical_benchmark.py::test_round_heatmap_prototype_residual_v2_online_historical_benchmark_defaults_to_samples_8 -q`
   - validation result:
     - `3 passed`
463. Git checkpoint created + pushed for item 462:
   - commit:
     - `e0c4f538`
   - message:
     - `agent3: add round heatmap prototype residual family`
464. Launch state for `round_heatmap_prototype_residual`:
   - machine headroom before launch:
     - available memory about `1.3 TiB`
   - corrected targeted-holdout gate sessions started:
     - `agent3_rheatproto_v1_gate`
     - `agent3_rheatproto_v2_gate`
     - `agent3_rheatproto_v3_gate`
     - `agent3_rheatproto_v4_gate`
   - command family:
     - `uv run python scripts/run_targeted_holdout_benchmark.py --model round_heatmap_prototype_residual_vX --held-out-round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --held-out-round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent3_round_heatmap_prototype_residual_vX_targeted_holdout_2rounds_corrected --jobs 1`
   - launch policy:
     - only `4` variants live in this new wave
     - `jobs=1` each
     - stopped there because shared-box memory tightened versus the prior check


## Open Questions

- Which benchmark/run currently best on local held-out rounds: `query_residual` vs `historical_bucket_prior`?
- Where exactly are experiment ledgers stored today, if at all?
- Is current validation strong enough for live performance selection, or should it be upgraded to better grouped/chronological round holdouts?
