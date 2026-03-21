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

## Open Questions

- Which benchmark/run currently best on local held-out rounds: `query_residual` vs `historical_bucket_prior`?
- Where exactly are experiment ledgers stored today, if at all?
- Is current validation strong enough for live performance selection, or should it be upgraded to better grouped/chronological round holdouts?
