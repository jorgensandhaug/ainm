## Agent1 Progress

### Session Continuation — Radical New Directions

- date: 2026-03-21 UTC (afternoon)
- resumed commit: `bfb7c857`
- branch: `agent1`

#### Critical Insight: Scoring Formula Analysis
- `score = 100 * exp(-3 * weighted_kl)`
- Current v8 best broad: `79.1946` / KL `0.081417`
- Current v8 worst round (36e581f1): `58.44` / KL `0.179`
- v8's minimum probability floor is `~0.0004` (from 0.98*model + 0.02*[0.84,0.05,0.02,0.02,0.05,0.02])
- Official docs recommend `0.01` floor!
- When model predicts 0.0004 for a class with 5% true probability: KL = 0.05*ln(0.05/0.0004) = 0.241 (ENORMOUS)
- With 0.01 floor: KL = 0.05*ln(0.05/0.01) = 0.080 (3x smaller)

#### New Models Implemented
1. **v10** — Nonlinear RFF teacher + enhanced v3 features (55 features)
   - RFF: `31.25` — catastrophic overfitting with 2 training rounds per fold
   - v10 linear (v3 features): `76.03` — WORSE than v8; 55 features too many for ridge
   - **Conclusion**: Linear teacher with 27 v2 features is the right structure

2. **v11** — Observation-frequency blending post-processing
   - Temperature=3: `72.45` — too aggressive, single obs too noisy
   - Temperature=10: `78.20` — nearly neutral
   - **Temperature=15: `79.28`** (+0.80 over v8)
   - **Temperature=20: `79.44`** (+0.96 over v8) ← BEST v11 config
   - Temperature=50: `79.39` (+0.91 over v8)
   - Proxy-5 t=10: `78.97` (vs v8 `78.46`, +0.51)
   - **Conclusion**: Very conservative observation blending helps modestly

3. **v12** — Adaptive calibration based on posterior uncertainty
   - Hard-3: `78.12` — slightly WORSE than v8
   - Temperature scaling hurts confident rounds more than it helps uncertain ones
   - **Conclusion**: Not independently viable, but may help combined

4. **v13** — Proper probability floor (0.01)
   - Floor sweep in progress: f5 (0.005), f10 (0.01), f20 (0.02), f30 (0.03)
   - Expected to disproportionately help worst rounds
   - **Still running**

5. **v14** — Combined v8 + v11(t=20) + v13(f=0.01) + v12(adaptive)
   - Expected to compound the best individual improvements
   - **Still running** on hard-3 and proxy-5

#### Key Findings
- The linear v2-features teacher is already well-suited to the data
- More features or nonlinear models overfit with limited training rounds (9 total)
- The biggest remaining gains come from CALIBRATION, not model expressiveness
- Observation blending with very high temperature (+0.96) is the first independently validated gain beyond v8
- Probability floor correction is theoretically critical (3x KL reduction on zero-floor errors)

### Session Continuation

- date: 2026-03-21 UTC
- resumed commit: `0885d868`
- branch: `agent1`
- remote tracking: `origin/agent1`
- `br` check at resume: unavailable (`command not found`)
- mandatory re-reads completed again before more work:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent1.md`
- live machine snapshot before new model work:
  - load avg: `17.92 / 33.79 / 42.25`
  - mem used: `959 GiB`
  - mem free: `1.9 TiB`
- other-agent activity visible:
  - agent6 full historical benchmark saturating >`100%` CPU
  - agent2 full benchmark active
  - agent3 running multiple targeted holdout jobs
  - enough memory/CPU headroom remains for more agent1 experimentation, but shared-machine contention is still real
- own long-running jobs confirmed alive:
  - `proxy5_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_seed0to1`
  - `proxy5_hazard_v3_k5_r3_l24_m60_regime_probe_posterior_blend_seed0to1`
  - `proxy5_hazard_v4_k5_r3_l16_m50_regime_probe_posterior_blend_seed0to1`
- broad posterior-blend status rechecked explicitly:
  - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1`: `76.7061`, KL `0.092236`
  - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_blend_online50_v1`: `76.2794`, KL `0.094765`
  - delta for v4 posterior-blend vs plain `regime_probe_v1`:
    - score: `-0.4268`
    - weighted KL: `+0.002529`
  - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_online50_v1`: `75.0492`, KL `0.100129`
  - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_online50_v1`: `75.0272`, KL `0.100043`
- conclusion from that recheck:
  - policy-side posterior modulation is now exhausted on broad validation for both v3 and v4
  - next gains need to come from the regime/teacher layer itself, matching the handoff’s unresolved low-rank-vs-mixture / block-structured question
- immediate objective of this session:
  - add replay-summary factorization support for v2 semimechanistic coefficients
  - use that to measure low-rank + clustered structure directly
  - implement a new discrete+continuous mixture-residual teacher / predictor family rather than more policy tweaks
- diagnostic launched for current v2 coefficient bank:
  - session `75458`
  - purpose: quantify low-rank reconstruction vs prototype+residual reconstruction on replay-backed rounds before finalizing teacher v3 design
- diagnostic result from the v2 coefficient bank across 9 replay-backed rounds:
  - singular-value mass by axis: `0.4562, 0.2259, 0.1910, 0.0564, 0.0315, 0.0181, 0.0129, 0.0080`
  - pure low-rank reconstruction RMSE:
    - rank 1: `0.9400`
    - rank 2: `0.7187`
    - rank 3: `0.4541`
    - rank 4: `0.3385`
  - prototype-only reconstruction RMSE:
    - `k=2`: `1.0096`
    - `k=3`: `0.8435`
    - `k=4`: `0.5428`
  - prototype + residual reconstruction RMSE:
    - `k=3 + residual_rank=1`: `0.3802`
    - `k=3 + residual_rank=2`: `0.2971`
    - `k=2 + residual_rank=2`: `0.2971`
  - interpretation:
    - coefficient variation is not well described by clustering alone
    - but a discrete+continuous regime is measurably better than continuous-only low rank at comparable latent size
    - this directly supports the handoff’s “mixture / block-structured + small continuous residual” direction
- new implementation completed from that diagnostic:
  - added `HazardTeacherV3`
    - discrete prototype mixture over round-coefficient space
    - continuous residual basis after subtracting prototype reconstruction
    - round regime vector is now `prototype_weights || residual_coords`
  - added `hazard_posterior_v5`
    - default family: `k=5`, `c=3`, `r=2`, `ridge=16`, `mix=50`
    - uses the existing refined observation-set student on the new v5 teacher latent
  - added synthetic-live cache-family namespacing
    - prevents cross-family cache aliasing when two teacher families share the same latent dimension
    - required for correct v5 benchmarking
- focused validation after the v5 patch:
  - `python3 -m compileall src/astar/teacher/dynamics/hazard_teacher_v3.py src/astar/student/predictor/hazard_posterior_v2.py src/astar/student/predictor/hazard_posterior_v5.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py tests/test_historical_benchmark.py`
  - `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
  - result: `18 passed`
- immediate next step after this log entry:
  - commit/push the v5 family immediately
  - launch proxy-5 sweeps on `regime_probe_v1` with the first compact mixture-residual anchors:
    - `hazard_posterior_v5_k5_c3_r1_l16_m50`
    - `hazard_posterior_v5_k5_c3_r2_l16_m50`
    - `hazard_posterior_v5_k5_c2_r2_l16_m50`
- commit/push completed immediately after the patch:
  - commit: `b81a4226`
  - pushed to `origin/agent1`
- machine snapshot before the first v5 sweep launch:
  - load avg: `24.10 / 29.80 / 35.90`
  - mem used: `1.0 TiB`
  - mem free: `1.8 TiB`
  - shared machine was busy, but well below memory pressure
- first v5 benchmark batch launched with `jobs=3` per run:
  - session `7728`: `proxy5_hazard_v5_k5_c3_r1_regime_probe_seed0to1`
  - session `68883`: `proxy5_hazard_v5_k5_c3_r2_regime_probe_seed0to1`
  - session `85355`: `proxy5_hazard_v5_k5_c2_r2_regime_probe_seed0to1`
  - session `59426`: `probe_hazard_v5_k5_c3_r1_regime_probe_3rounds_seed0to1`
  - session `72749`: `probe_hazard_v5_k5_c3_r2_regime_probe_3rounds_seed0to1`
  - session `12718`: `probe_hazard_v5_k5_c2_r2_regime_probe_3rounds_seed0to1`
- launch rationale:
  - proxy-5 is the current best cheap selector for broad behavior
  - hard-3 is still useful for faster early signal and continuity with the older frontier numbers
- validation tooling upgrade completed while the v5 runs were in flight:
  - `factorize-round-summaries` now supports `--summary-version v2`
  - manifold artifacts now record:
    - summary version
    - explained variance
    - reconstruction RMSE by retained rank
  - this turns the v2 low-rank diagnostic into a reproducible CLI artifact instead of an ad hoc script
- validation for that tooling patch:
  - `python3 -m compileall src/astar/history/summaries/manifold.py src/astar/workflows/factorize_round_summaries.py src/astar/cli_output.py src/astar/cli.py tests/test_history_manifold.py`
  - `uv run --with pytest python -m pytest tests/test_history_manifold.py -q`
  - result: `2 passed`
- first hard-3 v5 results completed:
  - `probe_hazard_v5_k5_c3_r1_regime_probe_3rounds_seed0to1`: `76.4959`, KL `0.092663`
  - `probe_hazard_v5_k5_c3_r2_regime_probe_3rounds_seed0to1`: `76.4959`, KL `0.092663`
  - `probe_hazard_v5_k5_c2_r2_regime_probe_3rounds_seed0to1`: `76.4959`, KL `0.092663`
- interpretation of the identical hard-3 result:
  - this slice trains on only 2 rounds per fold
  - the requested v5 configurations therefore collapse to the same effective teacher family after rank/prototype capping
  - hard-3 is not informative for selecting within v5; proxy-5 is the real selector for this family
- extra proxy-5 expansion launched after that realization:
  - session `20593`: `proxy5_hazard_v5_k5_c4_r1_regime_probe_seed0to1`
  - session `85699`: `proxy5_hazard_v5_k5_c3_r0_regime_probe_seed0to1`
- decisive proxy-5 v5 results:
  - `proxy5_hazard_v5_k5_c3_r1_regime_probe_seed0to1`: `70.0258`, KL `0.125563`
  - `proxy5_hazard_v5_k5_c3_r2_regime_probe_seed0to1`: `73.0027`, KL `0.111634`
  - `proxy5_hazard_v5_k5_c2_r2_regime_probe_seed0to1`: `69.6359`, KL `0.133558`
  - `proxy5_hazard_v5_k5_c4_r1_regime_probe_seed0to1`: `73.6657`, KL `0.109230`
- proxy-5 conclusion:
  - best finished v5 config is `k5 c4 r1`, but it is still far below the standing proxy frontier
  - current v5 best: `73.6657` / `0.109230`
  - standing proxy leader: `hazard_posterior_v3_k5_r3_l32_m70 + regime_probe_posterior_blend_v1` at `77.1302` / `0.089726`
  - therefore the first global mixture-residual teacher implementation is not competitive enough to broad-promote
- compute hygiene action:
  - terminated `proxy5_hazard_v5_k5_c3_r0_regime_probe_seed0to1` with `Ctrl-C`
  - reason: after the finished proxy-5 results above, the pure-mixture tail run was already dominated and not worth more shared-machine budget

### Session Continuation

- date: 2026-03-21 UTC
- resumed commit: `e8c71754`
- branch: `agent1`
- remote tracking: `origin/agent1`
- mandatory re-reads completed again before more work:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent1.md`
- live machine snapshot before the next model patch:
  - load avg: `55.54 / 57.52 / 51.85`
  - mem used: `1.5 TiB`
  - mem free: `1.2 TiB`
- other-agent activity visible:
  - agent5 running many concurrent student sweeps
  - agent6 still pushing full/probe historical benchmarks
  - agent2 and agent3 also active
  - conclusion: still enough headroom for more work, but avoid wasteful duplicate proxy jobs
- new interpretation after the v5 failure and handoff reread:
  - the replay coefficient bank still supports structured compression
  - but the first **global** mixture-residual latent was the wrong parameterization
  - handoff section `H3` points more specifically at **block-structured mechanism latent**
- immediate objective of this patch:
  - implement a new block-structured replay-regime teacher family
  - use independent low-rank coordinates per dynamic class/mechanism block instead of one dense global latent
  - benchmark that family on proxy-5 before any broader promotion
- new implementation completed:
  - added `HazardTeacherV4`
    - splits the terminal coefficient bank into dynamic-class blocks
    - learns independent low-rank coordinates per block
    - round regime vector is the concatenation of per-block coordinates
  - added `hazard_posterior_v6`
    - block-structured continuous latent family on top of the new teacher
    - separate synthetic-live cache namespace to avoid latent-family aliasing
- focused validation after the v6 patch:
  - `python3 -m compileall src/astar/teacher/dynamics/hazard_teacher_v4.py src/astar/student/predictor/hazard_posterior_v6.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py tests/test_historical_benchmark.py`
  - `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
  - result: `19 passed`
- immediate next step after validation:
  - commit/push the new v6 family
  - benchmark proxy-5 `regime_probe_v1` with:
    - `hazard_posterior_v6_k5_b1_l16_m50`
    - `hazard_posterior_v6_k5_b2_l16_m50`
    - `hazard_posterior_v6_k5_b2_l32_m70`
- commit/push completed immediately after the patch:
  - commit: `c6a23f2b`
  - pushed to `origin/agent1`
- proxy-5 v6 benchmark batch launched with `jobs=3` per run:
  - session `40298`: `proxy5_hazard_v6_k5_b1_l16_m50_regime_probe_seed0to1`
  - session `56481`: `proxy5_hazard_v6_k5_b2_l16_m50_regime_probe_seed0to1`
  - session `64961`: `proxy5_hazard_v6_k5_b2_l32_m70_regime_probe_seed0to1`
- launch rationale:
  - proxy-5 is the only selector currently trusted for family ranking
  - `b1` tests the compact 4-dim block latent
  - `b2` tests the 8-dim block latent
  - `b2 l32/m70` tests whether stronger posterior shrinkage matters more for the new structured latent

### Session Continuation

- date: 2026-03-21 UTC
- resumed commit: `e5b029db`
- branch: `agent1`
- remote tracking: `origin/agent1`
- `br` check at resume: unavailable (`command not found`)
- mandatory re-reads completed again before more work:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent1.md`
- live machine snapshot before this patch:
  - load avg: `25.60 / 46.70 / 61.51`
  - mem used: `1.1 TiB`
  - mem free: `1.7 TiB`
- other-agent activity visible:
  - agent5 still running broad `jobs=6` sweeps
  - agent7 still running multiple historical probes
  - agent3/agent6 also active
  - enough headroom remains, but shared-cache safety matters more than raw job count
- own broad in-flight promotions at resume:
  - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_online50_v1`
  - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_blend_online50_v1`
- broad completed results incorporated into selection logic:
  - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1`: `76.7061`, KL `0.092236`
  - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_online50_v1`: `75.0492`, KL `0.100129`
  - conclusion:
    - `regime_probe_v1` generalizes materially above old `query_residual_v7`
    - v4 is the stronger broad base family than v3 before posterior blending
- validation design refinement completed before this patch:
  - brute-force searched all 4/5/6-round subsets against completed broad runs
  - selected new proxy-5 slice preserving broad ranking/means much better than the old hard-3
  - proxy-5 rounds:
    - `71451d74-be9f-471f-aacd-a41f3b68a9cd`
    - `8e839974-b13b-407b-a5e7-fc749d877195`
    - `ae78003a-4efe-425a-881a-d16a39bca0ad`
    - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
    - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
  - proxy-5 fit quality vs full means across completed comparison models:
    - score RMSE about `0.55`
    - KL RMSE about `0.00256`
- proxy-5 posterior-blend results completed before this patch:
  - `hazard_posterior_v3_k5_r3_l32_m70 + regime_probe_posterior_blend_v1`: `77.1302`, KL `0.089726`
  - `hazard_posterior_v4_k5_r3_l24_m60 + regime_probe_posterior_blend_v1`: `75.9784`, KL `0.095898`
  - `hazard_posterior_v4_k5_r3_l32_m70 + regime_probe_posterior_blend_v1`: `76.4560`, KL `0.093084`
  - current proxy ordering among completed runs:
    - v3 `l32/m70`
    - v4 `l32/m70`
    - v4 `l24/m60`
- proxy-5 failures isolated before this patch:
  - `v3 l16/m50` failed with `EOFError` reading replay summary / cached synthetic dataset
  - `v3 l24/m60` failed with `zipfile.BadZipFile` reading evidence tensor
  - `v4 l16/m50` failed with parquet corruption reading synthetic dataset `index.parquet`
  - common cause:
    - concurrent builders are writing shared `npz` / `json` / `parquet` artifacts directly into final cache paths without atomic replace or locking
    - broad supercomputer use is therefore currently limited by infra correctness, not model ideas
- immediate objective of this patch:
  - harden shared materialization and synthetic-dataset cache paths for concurrent builders
  - add regression tests for corrupt cache rebuild / rematerialization
  - then relaunch the failed proxy-5 runs under the repaired cache path
- additive posterior broad promotions were explicitly killed before this patch:
  - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_online50_v1`
  - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_online50_v1`
  - reason: dominated by posterior-blend policy on the hard slice
- infra hardening implemented in this patch:
  - added atomic file helpers and file locks for shared cache/materialization paths
  - `npz` writes now use atomic temp-file replace
  - synthetic dataset episode `json`, `index.parquet`, and `summary.json` writes now use atomic replace
  - synthetic dataset builds now take a dataset-specific file lock and can reuse a now-valid cache after waiting
  - round materialization now takes a round-specific file lock
  - `load_round_learning_episode(...)` now self-heals one corrupt/missing round tensor set by rematerializing once
  - cached synthetic dataset loaders now treat corrupt parquet/json cache state as rebuildable cache miss
- focused validation after the infra patch:
  - `python3 -m compileall src/astar/infra/artifacts/atomic.py src/astar/infra/artifacts/store.py src/astar/history/datasets/synthetic_live.py src/astar/history/learning.py src/astar/workflows/materialize_episode.py src/astar/workflows/summarize_replays.py src/astar/student/predictor/hazard_posterior.py src/astar/student/predictor/hazard_posterior_v2.py src/astar/student/predictor/query_residual.py tests/test_episode_materialization.py tests/test_historical_benchmark.py`
  - `uv run --with pytest python -m pytest tests/test_episode_materialization.py tests/test_history_datasets.py tests/test_teacher_student.py tests/test_historical_benchmark.py -q`
  - result: `26 passed`
- new regression coverage added:
  - corrupt materialized round arrays trigger rematerialization and load successfully
  - corrupt `hazard_posterior_v2` synthetic dataset cache rebuilds successfully
- machine snapshot before relaunching failed proxy runs:
  - load avg: `36.74 / 40.34 / 48.23`
  - mem used: `1.1 TiB`
  - mem free: `1.7 TiB`
- broad blend promotions still in flight after validation:
  - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_online50_v1`
  - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_blend_online50_v1`
- failed proxy-5 runs relaunched after the fix with `--jobs 3` in persistent sessions:
  - session `68725`: `proxy5_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_seed0to1`
  - session `42725`: `proxy5_hazard_v3_k5_r3_l24_m60_regime_probe_posterior_blend_seed0to1`
  - session `49390`: `proxy5_hazard_v4_k5_r3_l16_m50_regime_probe_posterior_blend_seed0to1`
- broad-result update after relaunch/push:
  - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_online50_v1` finished
  - mean score: `75.0272`
  - weighted KL: `0.100043`
  - delta vs `dev_hazard_v3_k5_r3_l16_m50_regime_probe_online50_v1`:
    - score: `-0.0219`
    - weighted KL: `-0.000086`
  - conclusion:
    - on the broad 8-round set, posterior-blend is basically a wash for v3
    - the hard-slice posterior-blend gain does not transfer cleanly to broad promotion for v3
    - keep broad focus on v4 and on proxy-5 results from the relaunched missing configs

### Session Continuation

- date: 2026-03-21 UTC
- resumed commit: `55495d1`
- branch: `agent1`
- remote tracking: `origin/agent1`
- `br` check at resume: unavailable (`command not found`)
- mandatory re-reads completed again before more model work:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent1.md`
- machine snapshot before new launch:
  - load avg: `40.01 / 42.57 / 62.47`
  - mem used: `733 GiB`
  - mem free: `2.1 TiB`
- other-agent activity visible:
  - heavy agent4/agent5/agent2/agent3 historical runs active
  - enough headroom remains for more agent1 parallelism
- own in-flight run still active at resume:
  - `dev_hazard_v3_k5_r3_l16_m50_coverage_online50_v1`
  - no `result.json` yet
- new model development completed locally before next sweep:
  - added `ObservationSetRefinedStudent`
    - keeps v3 amortized ridge latent-mean prediction
    - switches posterior particles from regime-space nearest neighbors to transcript-summary nearest neighbors
    - keeps explicit `predicted_particle_weight` mixing
  - added new predictor family `hazard_posterior_v4`
  - wired v4 through predictor selection, historical benchmark online gating, CLI aliases, and tests
- validation:
  - `python3 -m compileall src/astar/student/posterior/deepset_student.py src/astar/student/predictor/hazard_posterior_v4.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
  - `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
  - result: `13 passed`
- immediate next step after this log entry:
  - run an expanded hard-slice v4 sweep over transcript-kNN / shrinkage configs using the Python workflow entrypoint
  - compare directly against current hard-slice best `hazard_posterior_v3_k5_r3_l16_m50 + coverage`
- first v4 sweep execution notes:
  - initial Python launcher attempt failed immediately on two non-model issues:
    - `WorkspacePaths` needs `from_root(...)`, not `repo_root=...`
    - `run_historical_benchmark(...)` takes `visualization_policy`, not `with_png`
  - exploration relaunch also needed a naming fix:
    - benchmark workflow expects policy token `exploration`
    - registry-normalized policy name remains `exploration_v2`
- first v4 hard-slice results completed on matched 3-round, 2-episode-seed benchmark:
  - `hazard_posterior_v4_k1_r3_l16_m50 + coverage`: `73.7773`, KL `0.103554`
  - `hazard_posterior_v4_k3_r3_l16_m50 + coverage`: `75.2911`, KL `0.096954`
  - `hazard_posterior_v4_k5_r3_l16_m50 + coverage`: `75.2911`, KL `0.096954`
  - `hazard_posterior_v4_k9_r4_l16_m50 + coverage`: `75.2911`, KL `0.096954`
  - `hazard_posterior_v4_k5_r3_l32_m70 + coverage`: `75.2906`, KL `0.096686`
  - `hazard_posterior_v4_k5_r3_l8_m30 + coverage`: `75.0404`, KL `0.098551`
  - `hazard_posterior_v4_k5_r3_l16_m50 + exploration`: `76.7472`, KL `0.090999`
  - `hazard_posterior_v4_k9_r4_l16_m50 + exploration`: `76.7472`, KL `0.090999`
- current interpretation from first v4 sweep:
  - transcript-summary neighbor refinement is real but does not yet beat current hard-slice best `hazard_posterior_v3_k5_r3_l16_m50 + coverage` (`76.8128`, KL `0.090407`)
  - gap to current best is tiny: `-0.0656` score, `+0.000592` KL for v4 exploration
  - policy matters much more for v4 than for earlier raw hazard families:
    - `exploration` beats matched v4 coverage by `+1.4561` score and `-0.005956` KL
  - `k>=3` is effectively a dead axis on this slice; `k=1` is too local
  - heavier ridge / predicted-mean weight marginally improves KL but not score under coverage
  - next targeted sweep should focus on:
    - exploration-only shrinkage tuning
    - denser synthetic transcript banks via larger `samples_per_round`, which should matter more for transcript-space kNN than it did for v3
- second targeted v4 sweep results:
  - `hazard_posterior_v4_k5_r3_l16_m50 + exploration, s4`: `75.4359`, KL `0.097188`
  - `hazard_posterior_v4_k5_r3_l16_m50 + exploration, s8`: `75.6882`, KL `0.095868`
  - `hazard_posterior_v4_k5_r3_l32_m70 + exploration, s4`: `75.3015`, KL `0.097756`
  - `hazard_posterior_v4_k5_r3_l32_m70 + exploration, s8`: `75.9030`, KL `0.094822`
  - `hazard_posterior_v4_k5_r3_l64_m85 + exploration, s4`: `75.1656`, KL `0.098376`
- conclusion from the dense-bank sweep:
  - transcript-space kNN does **not** want larger synthetic-live banks in the current formulation
  - both `s4` and `s8` regress badly vs the simple `s1` frontier (`76.7472`, KL `0.090999`)
  - `samples_per_round` is now a frozen/deprioritized axis for v4
- major gap discovered while analyzing policy code:
  - current `exploration` is only a static `CoverageThenReplicatePolicy`
  - it ignores belief state and predictor/posterior entirely
  - that violates the handoff’s intended “identify regime, not just cover map” direction
- new implementation after that finding:
  - added adaptive `RegimeProbePolicy` in `src/astar/policy/regime_probe.py`
    - uses motif-rich viewport prior
    - balances early queries across seeds
    - adaptively repeats windows with strong observed stochastic/activity signal
    - expands into nearby motif-rich windows around observed hotspots
  - wired adaptive policy through `build_interactive_policy(...)`
  - updated synthetic-live dataset generation so non-plan policies can declare `max_queries` instead of requiring a static query plan
  - added tests:
    - dynamic seed-balancing unit test
    - `hazard_posterior_v4 + regime_probe` historical benchmark smoke test
- validation after adaptive-policy implementation:
  - `python3 -m compileall src/astar/policy/regime_probe.py src/astar/policy/interactive.py src/astar/history/datasets/synthetic_live.py src/astar/policy/__init__.py tests/test_exploration_policy.py tests/test_historical_benchmark.py`
  - `uv run --with pytest python -m pytest tests/test_exploration_policy.py tests/test_historical_benchmark.py -q`
  - result: `16 passed`
- currently in flight after the adaptive-policy patch:
  - `probe_hazard_v4_k5_r3_l16_m50_regime_probe_3rounds_seed0to1`
  - `probe_hazard_v4_k5_r3_l32_m70_regime_probe_3rounds_seed0to1`
  - `probe_hazard_v3_k5_r3_l16_m50_regime_probe_3rounds_seed0to1`
  - `dev_hazard_v3_k5_r3_l16_m50_coverage_online50_v1`
  - `dev_hazard_v4_k5_r3_l16_m50_exploration_online50_v1`
- adaptive-policy probe results completed:
  - `hazard_posterior_v4_k5_r3_l16_m50 + regime_probe_v1`: `77.6423`, KL `0.087387`
  - `hazard_posterior_v3_k5_r3_l16_m50 + regime_probe_v1`: `78.1285`, KL `0.085231`
  - `hazard_posterior_v4_k5_r3_l32_m70 + regime_probe_v1`: `78.4806`, KL `0.083675`
- conclusion from the adaptive-policy probes:
  - adaptive querying is a bigger lever than any recent posterior/bank tweak
  - `regime_probe_v1` beats the old v3 hard-slice leader by `+1.6678` score and `-0.006733` KL with the best v4 config
  - `v4 l32/m70 + regime_probe_v1` is the new hard-slice frontier
- first full promotion result completed during this sweep:
  - `dev_hazard_v3_k5_r3_l16_m50_coverage_online50_v1`
  - full 8-round multi-seed score: `72.3675`
  - weighted KL: `0.114380`
  - implication: hard-slice-only model selection badly overstates generalization; broader promotion is mandatory
- new full promotions launched immediately after the adaptive-policy win:
  - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1`
  - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_online50_v1`
  - left older comparator running:
    - `dev_hazard_v4_k5_r3_l16_m50_exploration_online50_v1`
- quick “2 worst rounds” shortcut check was run and rejected as a validation design:
  - rounds: `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`, `36e581f1-73f8-453f-ab98-cbe3052b701b`
  - all tested models collapsed identically to `16.5721`, KL `0.815797`
  - tested:
    - `hazard_posterior_v4_k5_r3_l32_m70 + regime_probe_v1`
    - `hazard_posterior_v4_k5_r3_l16_m50 + exploration_v2`
    - `hazard_posterior_v3_k5_r3_l16_m50 + regime_probe_v1`
  - conclusion:
    - with only two rounds, leave-one-round-out means each holdout trains on a single round
    - this shortcut is too degenerate to guide family selection
    - keep using broader multi-round validation

### Session Continuation

- date: 2026-03-21 UTC
- resumed commit: `cbc6262`
- branch: `agent1`
- remote tracking: `origin/agent1`
- live machine snapshot before new work:
  - load avg: `120.12 / 102.48 / 73.92`
  - mem used: `1.2 TiB`
  - mem free: `1.7 TiB`
- other-agent activity confirmed:
  - many large agent5 hybrid sweeps active
  - agent4 already using `run-historical-benchmark --jobs 3`
  - agent7/agent2 also running live historical probes
- own active runs on resume:
  - `dev_hazard_v2_k5_r3_coverage_online50_v1`
  - `dev_hazard_v2_k5_r3_exploration_online50_v1`
- new objective:
  - add native `--jobs` support to historical benchmark on this branch
  - validate it
  - then relaunch heavier v2 exploration using controlled parallelism rather than extra top-level shells
- implementation/result:
  - added true round-parallel historical benchmark execution with `ProcessPoolExecutor`
  - exposed `jobs` through CLI, result artifacts, rendered reports, and catalog payloads
  - added focused regression coverage for `jobs=2`
  - initial fork-based pool passed but emitted multiprocessing deadlock warning in multithreaded parent
  - changed pool start method to `spawn`; warning cleared
  - validation:
    - `python3 -m compileall src/astar/workflows/historical_benchmark.py src/astar/cli.py src/astar/eval/reports.py tests/test_historical_benchmark.py`
    - `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
    - result: `11 passed in 32.01s`
- live machine snapshot after validation:
  - load avg: `96.01 / 96.21 / 77.93`
  - mem used: `979 GiB`
  - mem free: `1.9 TiB`
- current status after validation:
  - old full raw-v2 promotions still running and still have no `report.md`
  - next model step chosen from handoff: move beyond summary-space kNN into a learned student posterior / small-teacher continuation
- v3 implementation:
  - added `ObservationSetDistilledStudent`
    - ridge-regresses transcript summaries onto the low-rank regime manifold
    - forms posterior particles around the predicted latent using nearby regime-bank neighbors
  - added new predictor family `hazard_posterior_v3`
  - wired v3 through online predictor selection, CLI aliases, historical benchmark gating, and tests
  - discovered `spawn` pool breaks `run_historical_benchmark(..., jobs>1)` when called from `uv run python - <<'PY'`
  - fixed by selecting `fork` only for `<stdin>`/REPL-style entrypoints while keeping `spawn` for normal CLI/script execution
  - reran validation:
    - `python3 -m compileall src/astar/student/posterior/deepset_student.py src/astar/student/predictor/hazard_posterior_v3.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
    - `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
    - result: `12 passed`
- v3 hard-slice results completed on matched 3-round, 2-episode-seed benchmark:
  - `hazard_posterior_v3 + coverage`: `76.6419`, KL `0.091278`, runtime `101.79s`
  - `hazard_posterior_v3 + exploration_v2`: `75.1636`, KL `0.098387`, runtime `102.77s`
  - `hazard_posterior_v3_k9_r4 + coverage`: identical to default coverage
  - `hazard_posterior_v3_k9_r4 + exploration_v2`: identical to default exploration
  - delta vs prior raw-v2 best (`hazard_posterior_v2_k5_r3 + coverage`):
    - `+2.3761` score
    - `-0.011869` weighted KL
    - about `9.6x` faster wall-clock on the same slice (`101.79s` vs `974.46s`)
  - round deltas vs raw-v2 coverage:
    - `8e839974-b13b-407b-a5e7-fc749d877195`: `+4.8438`
    - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`: `-3.8355`
    - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `+6.1200`
- machine management update:
  - killed stale serial full-v2 promotions after v3 proved superior on the hard slice
  - post-kill snapshot: load `87.12`, mem used `727 GiB`, mem free `2.2 TiB`
- in-flight at time of this log update:
  - `probe_hazard_v3_k5_r3_l8_m35_coverage_3rounds_seed0to1_s4`
  - `probe_hazard_v3_k5_r3_l8_m35_exploration_3rounds_seed0to1_s4`
  - `probe_hazard_v3_k5_r3_l16_m20_coverage_3rounds_seed0to1`
  - `probe_hazard_v3_k5_r3_l16_m50_coverage_3rounds_seed0to1`
  - `dev_hazard_v3_k5_r3_l8_m35_coverage_online50_v1`
- later hard-slice posterior-shrinkage results:
  - `hazard_posterior_v3_k5_r3_l16_m20 + coverage`: `76.4455`, KL `0.092286`, runtime `94.01s`
  - `hazard_posterior_v3_k5_r3_l16_m50 + coverage`: `76.8128`, KL `0.090407`, runtime `96.84s`
  - conclusion:
    - stronger ridge + higher predicted-latent weight helps
    - `l16/m50` is the new hard-slice best so far
- promotion update:
  - killed stale full run `dev_hazard_v3_k5_r3_l8_m35_coverage_online50_v1`
  - relaunched full 8-round promotion as `dev_hazard_v3_k5_r3_l16_m50_coverage_online50_v1`
- later `samples-per-round=4` hard-slice results:
  - `hazard_posterior_v3_l8_m35 + coverage, s4`: `76.4107`, KL `0.092568`
  - `hazard_posterior_v3_l8_m35 + exploration_v2, s4`: `75.0621`, KL `0.098891`
  - conclusion:
    - more synthetic transcript samples do not beat the current `l16/m50` mainline on the hard slice
    - keep the full `l16/m50` promotion running; no need to switch to `s4`

### Session Continuation

- date: 2026-03-21 UTC
- resumed commit: `43c3671`
- branch: `agent1`
- remote tracking: `origin/agent1`
- worktree state at resume: clean
- `br` check at resume: unavailable (`command not found`)
- immediate objective: finish the first full 8-round `query_residual` + `exploration` benchmark on the repaired multi-seed-capable benchmark stack, then decide whether to expand validation or pivot
- note: no `dev_query_residual_exploration_online50_v1` artifact exists yet; prior promotion was interrupted before completion

### Pivot

- user overrode the previous “improve strongest implemented baseline first” direction
- new instruction priority: stop treating `query_residual` as mainline; push directly into the handoff’s new replay-regime family
- concrete pivot target:
  - take the existing hazard-teacher + posterior-student components that already exist in-tree
  - make them holdout-safe and benchmarkable in `online_interactive`
  - then run multiple parallel probes on that new family instead of spending more time polishing `query_residual`
- implementation gap identified at pivot:
  - `latent_regime` historical/online eval still routes to the older heuristic predictor
  - the actual hazard-teacher + summary-bank student stack is trained/tested in isolation but not wired into benchmark model selection

### Session

- date: 2026-03-20 UTC
- branch: `agent1`
- repo root: `/home/jorge/agent1`
- task cwd: `/home/jorge/agent1/tasks/astar`
- base branch state before this session: `78d89f9`
- current pushed commit before real-model continuation: `230a12f`

### Mandatory Reads Completed

- `AGENTS.md`
- `README.md`
- `docs/game_facts.md`
- `instructions/agent1.md`

### Current Environment Facts

- actual tracked repo is the real Astar codebase
- `git rev-parse --show-toplevel` => `/home/jorge/agent1`
- `br` unavailable in shell
- bare `python` unavailable in shell path; `python3` and `uv run` work
- benchmark artifacts and replay/analysis data already exist locally

### Current Model / Eval State Found

- supported historical eval models in code:
  - `geometry_prior`
  - `historical_bucket_prior`
  - `latent_regime`
  - `query_residual`
- holdout protocol in `run_historical_benchmark` is leave-one-round-out over analyzed rounds
- online-interactive eval currently uses one transcript realization per held-out round via single `episode_seed`
- current best stored 8-round online-interactive result found:
  - benchmark: `dev_query_residual_online50_v7`
  - model: `query_residual`
  - policy: `coverage`
  - mean score: `73.9505`
  - mean weighted KL: `0.10633`
- baseline stored 8-round online-interactive `historical_bucket_prior` result:
  - mean score: `66.0226`
  - mean weighted KL: `0.14851`
- largest round gains of `query_residual_v7` vs bucket baseline:
  - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `+28.276`
  - `36e581f1-73f8-453f-ab98-cbe3052b701b`: `+10.095`
  - `76909e29-f664-4b2f-b16b-61b7507277e9`: `+9.516`
- one round regression:
  - `8e839974-b13b-407b-a5e7-fc749d877195`: `-1.336`

### Key Inference

- strongest existing stack is already the replay-backed `query_residual` family, not the older bucket or latent-regime baselines
- biggest immediate gap vs handoff: eval still selects on single transcript seed; that is noisier than live expected performance
- biggest immediate modeling lever visible in current code: policy
  - handoff says regime ID > full coverage
  - code already has `exploration` policy
  - no stored benchmark using `exploration` found

### Action Log

1. read mandatory repo docs and full `instructions/agent1.md`
2. mapped repo root / task cwd / git branch / remote state
3. inspected benchmark and model-eval code paths
4. summarized stored benchmark results
5. identified current best local benchmark family: `query_residual`
6. identified likely next experiment axis: `coverage` vs `exploration`
7. identified validation weakness: single `episode_seed`
8. added central family docs:
   - `docs/replay_regime_family_findings.md`
   - `experiments/replay_regime_family/registry.csv`
   - `experiments/replay_regime_family/notes.md`
   - `experiments/replay_regime_family/best_models.md`
   - `experiments/replay_regime_family/failed_hypotheses.md`
   - `experiments/replay_regime_family/next_steps.md`
9. implemented multi-episode-seed support for historical online benchmarks
10. added focused test coverage for the new multi-episode path
11. compile check passed for changed Python files
12. direct `pytest` invocation was unavailable in the base env; verified via `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
13. targeted historical benchmark tests passed: `5 passed in 4.66s`
14. launched `query_residual` + `exploration` 3-round probe on the challenging round set used by stored `tmp_query_residual_probe_3rounds_v7`
15. removed mistaken `family1_dummy/` tracked artifacts introduced during early repo-root confusion
16. finished `query_residual` `exploration` single-seed probe on the matched 3-round set
17. result vs stored `coverage` on same rounds:
   - aggregate score delta: `+0.0319`
   - aggregate weighted-KL delta: `-0.000046`
   - round deltas:
     - `8e839974-b13b-407b-a5e7-fc749d877195`: `-0.8767`
     - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`: `+0.2242`
     - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `+0.7482`
18. confirmed new multi-seed benchmark path on real data:
   - command: `uv run astar run-historical-benchmark --model historical_bucket_prior --mode online_interactive --policy coverage --budget 4 --episode-seed 0 --episode-seed-count 2 --with-png none --name smoke_bucket_multi_episode_2rounds_seed0to1 ...`
   - result: success
   - reported `episode_seeds: 0,1`
   - reported `evaluated_seeds: 20`
19. launched `query_residual` `coverage` 3-round multi-seed probe (`episode_seed_count=2`) to get lower-noise policy comparison
20. discovered and fixed stale synthetic-dataset cache reuse:
   - legacy `synthetic_live_coverage_v1/index.parquet` can point at absolute episode paths from a different checkout
   - `_load_synthetic_dataset_ref()` now rejects stale episode paths and triggers rebuild in current worktree
21. optimized multi-seed historical benchmark runtime:
   - historical online benchmarks now reuse one trained predictor per held-out round across transcript seeds
   - avoids pointless refits for each `episode_seed`
22. validated stale-cache fix with targeted regression test
23. completed matched 3-round multi-seed policy comparison:
   - `coverage`, seeds `0,1`: mean score `71.7303`, weighted KL `0.111276`
   - `exploration`, seeds `0,1`: mean score `73.2181`, weighted KL `0.104341`
   - aggregate delta: `+1.4878` score, `-0.006935` weighted KL in favor of `exploration`
   - round deltas:
     - `8e839974-b13b-407b-a5e7-fc749d877195`: `+1.4616`
     - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`: `+0.7303`
     - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `+2.2714`
24. promoted `query_residual` + `exploration` to full 8-round benchmark `dev_query_residual_exploration_online50_v1` (running)
25. fixed benchmark timing accounting after predictor reuse so `evaluation_seconds` includes predictor-fit time again
26. reran focused tests after stale-cache + timing fixes: `6 passed in 5.78s`
27. pivoted from `query_residual`-first exploration to direct replay-regime-family development after user override
28. identified that the hazard-teacher + summary-bank posterior stack already existed but was not wired into historical online benchmarking
29. implemented a new holdout-safe online model family:
   - new predictor: `hazard_posterior_knn`
   - trains `HazardTeacher` on training rounds only
   - builds / reuses round-scoped synthetic live datasets for those training rounds only
   - fits `SummaryBankStudent` on those synthetic episodes
   - exposes config-specific model names such as `hazard_posterior_knn_v1__policy=...__samples=...__k=...`
30. added parallel-experiment-friendly CLI model aliases:
   - `hazard_posterior_knn`
   - `hazard_posterior_knn_k1`
   - `hazard_posterior_knn_k3`
   - `hazard_posterior_knn_k5`
   - `hazard_posterior_knn_k9`
31. updated historical benchmark metadata plumbing so the new synthetic-live-backed model family records `samples_per_round`
32. added focused historical benchmark smoke coverage for the new family
33. reran focused historical benchmark suite after the new model wiring: `7 passed in 7.28s`
34. attempted the first 8-way parallel real-data probe sweep on the new family
35. discovered an infra bottleneck that blocked parallel experimentation:
   - multiple jobs building/materializing datasets collided on `data/catalog.duckdb`
   - failure mode was DuckDB file-lock contention during auxiliary `CatalogDB.log_event(...)`
36. changed catalog logging to be best-effort under lock contention so telemetry cannot kill the main workload
37. reran focused historical benchmark suite after the catalog concurrency fix: `7 passed in 8.14s`
38. restarted the parallel hazard-posterior probe sweep after cache creation + catalog fix
39. completed the first real hazard-posterior grid on the matched hard 3-round, 2-episode-seed probe:
   - `k1 + exploration`: `51.8630`, KL `0.231672`
   - `k3 + coverage`: `55.6897`, KL `0.210982`
   - `k5 + coverage`: `56.5785`, KL `0.206602`
   - `k5 + exploration`: `56.6601`, KL `0.206195`
   - `k9 + coverage`: `56.5785`, KL `0.206602`
40. key finding from the first hazard-only sweep:
   - new semimechanistic family is real but currently far behind `query_residual` on this benchmark slice
   - failure is dominated by held-out round `ae78003a-4efe-425a-881a-d16a39bca0ad` (`35.9` mean score vs `73.6` for query-residual exploration on the same slice)
   - coverage vs exploration only weakly matters at this stage; decoder/calibration dominates
41. moved immediately to the handoff’s calibration/ensemble step instead of sweeping more hazard-only variants
42. implemented `hazard_posterior_blend` family:
   - blends the new hazard posterior predictor with `HistoricalBucketPriorPredictor`
   - config encoded in the resolved model name, including `k` and hazard weight `a`
   - initial CLI aliases added: `hazard_posterior_blend_a25_k5`, `hazard_posterior_blend_a35_k5`, `hazard_posterior_blend_a50_k5`
43. added focused historical benchmark smoke coverage for the blend family
44. reran focused historical benchmark suite after adding the blend family: `8 passed in 10.44s`
45. measured the actual bucket anchor on the same matched hard 3-round, 2-episode-seed slice:
   - `historical_bucket_prior + coverage`: `70.3257`, KL `0.122435`
46. completed the first blend sweep on the same slice with `policy=exploration`, `samples_per_round=2`, `k=5`:
   - `a=0.25`: `70.2024`, KL `0.122086`
   - `a=0.35`: `69.5894`, KL `0.124981`
   - `a=0.50`: `68.1605`, KL `0.132057`
47. key blend conclusion:
   - calibration/ensemble dramatically rescues the catastrophic `ae780...` failure compared with hazard-only
   - but even the best blend (`a=0.25`) still does **not** beat the bucket anchor on aggregate (`70.2024 < 70.3257`)
   - therefore current hazard component is still net-negative on this slice; the next gain must come from improving the semimechanistic teacher/posterior itself, not from more convex blending of the same v1 hazard model
48. re-read handoff + repo docs after user correction and re-anchored to the actual replay-regime family rather than `query_residual`
49. parallel code inspection from explorer agents confirmed:
    - raw replay frames already expose enough state for richer transition/event summaries
    - v1 bottleneck is structural: 3-head decoder + tiny lossy kNN summary
50. implemented v2 dataset plumbing:
    - `SyntheticEpisodeArtifact` now carries `map_width` / `map_height`
    - synthetic-live dataset builder can now store externally supplied regime vectors rather than only the old summary-vector labels
51. implemented `src/astar/history/summaries/round_coefficients_v2.py`
    - richer interacted static feature bank
    - replay-derived transition summary augmentation
    - score-weighted per-round multiclass terminal coefficient fitting against dynamic classes vs empty baseline
52. implemented `src/astar/teacher/dynamics/hazard_teacher_v2.py`
    - fits per-round coefficient rows
    - factorizes them with low-rank SVD manifold
    - decodes latent coordinates directly into final tensors
53. implemented a stronger transcript-set student in `src/astar/student/posterior/deepset_student.py`
    - observation-level set features
    - coverage moments
    - repeat-window variance
    - owner concentration and settlement-mark summaries
    - normalized kNN in transcript-feature space
54. implemented new predictor family in `src/astar/student/predictor/hazard_posterior_v2.py`
    - `hazard_posterior_v2`
    - `hazard_posterior_v2_blend`
55. wired new family through:
    - `interactive.py`
    - `historical_benchmark.py`
    - `cli.py`
56. added focused v2 historical benchmark smoke tests
57. fixed two v2 plumbing bugs found by test:
    - strict zip on frame transitions
    - one-element-short zero-observation transcript vector
58. reran focused benchmark suite after fixes:
    - `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
    - result: `10 passed in 18.32s`
59. checked machine-wide capacity before scaling parallelism:
    - memory available: ~`2.9 TiB`
    - cores: `384`
    - load near idle
    - no competing benchmark jobs found
60. launched the first hard-slice real-data v2 benchmark:
    - `hazard_posterior_v2_k5_r3`
    - policy `coverage`
    - matched hard 3-round multi-seed slice
    - currently still running while this log entry is written
61. inspected whole-machine activity before increasing sweep width:
    - other agents are active on the box
    - visible benchmark jobs included agent4 `gbx_transition_teacher_*` prior-only runs and agent2 `smh_coeffbank_*` online runs
    - despite that, system load and RAM headroom remained extremely loose
62. widened the live v2 sweep after the health check:
    - added `hazard_posterior_v2_k5_r3` with `policy=exploration`
    - added `hazard_posterior_v2_blend_a20_k5_r3` with `policy=exploration`
63. re-checked machine health after other agents scaled up:
    - load average rose to about `57`
    - memory in use rose to about `836 GiB`
    - free memory still about `2.1 TiB`
    - decision: keep current sweep width, no need to throttle existing jobs, but stop adding more until first results land
64. first completed real-data v2 result:
    - benchmark: `probe_hazard_v2_k5_r3_coverage_3rounds_seed0to1`
    - model: `hazard_posterior_v2_k5_r3`
    - policy: `coverage`
    - mean score: `74.2658`
    - weighted KL: `0.103147`
    - runtime: `974.458s`
65. first major v2 benchmark conclusion:
    - this beats prior hard-slice best `query_residual + exploration` (`73.2181`, KL `0.104341`)
    - this also beats the bucket anchor and every prior hazard-v1 result on the same slice
    - so the new regime-manifold / multiclass terminal decoder path is now a real improvement, not just architectural churn
66. additional matched hard-slice v2 results:
    - `hazard_posterior_v2_k5_r3 + exploration`: `74.1259`, KL `0.103718`
    - `hazard_posterior_v2_k9_r4 + exploration`: `74.1259`, KL `0.103718`
    - `hazard_posterior_v2_blend_a20_k5_r3 + exploration`: `71.0375`, KL `0.118206`
    - `hazard_posterior_v2_blend_a35_k5_r3 + exploration`: `71.3270`, KL `0.116462`
67. v2 sweep interpretation after those additional results:
    - raw v2 stays best
    - on this slice, `coverage` beats `exploration` by about `+0.1399` score and `-0.000571` KL
    - increasing to `k9/r4` did not improve over `k5/r3`
    - blending the strong raw v2 model back toward bucket is net-negative
68. promotion decision:
    - keep full 8-round raw promotions running:
      - `dev_hazard_v2_k5_r3_coverage_online50_v1`
      - `dev_hazard_v2_k5_r3_exploration_online50_v1`
    - kill full 8-round blend promotion because the matched hard-slice evidence says it is a waste of compute

### Working Hypotheses

- H1: `query_residual` + `exploration` policy should beat `query_residual` + `coverage` on online-interactive holdout because the predictor is regime-sensitive and exploration adds targeted repeats
- H2: multi-seed historical online eval will be a better model-selection signal than single-seed eval because live querying is stochastic
- H1 status update: supported
  - weak on single-seed (`+0.0319`)
  - strong on matched multi-seed (`+1.4878`)

### Planned Next Steps

1. finish in-flight `query_residual` `exploration` probe
2. compare against stored `coverage` result on matched rounds
3. run a smoke benchmark using new `--episode-seed-count` support
4. if exploration wins, promote to broader benchmark with unique run name

### Push Log

- pushed `230a12f` to `origin/agent1`
- pushed `37f9cac` to `origin/agent1`

### 2026-03-21 Continuation: Hazard v2 Pivot

- user correction accepted:
  - stop treating `query_residual` as the path
  - stop spending budget on hazard-v1 blend polishing
  - implement the actual replay-regime handoff more directly
  - use parallel exploration aggressively
- re-read:
  - `instructions/agent1.md`
  - local `README.md`
  - local `docs/game_facts.md`
- repo-note:
  - AGENTS first-read paths pointed at `/home/jorge/repos/ainm/...`
  - those paths do not exist in this checkout
  - used local repo copies instead

### v1 Postmortem

- hazard-v1 failure is structural, not tuning:
  - teacher only decodes 3 static heads: build / port / ruin
  - teacher latent target is ad hoc 12d replay summary, not a direct coefficient manifold
  - student is not a real set encoder; it is kNN on counts + class freqs + four means
- subagent findings confirmed raw replay frames already support richer transition heads:
  - collapse `{1,2}->{3}`
  - rebuild `3->{1,2}`
  - reclaim `3->4`
  - owner flips
  - year-to-year population / food / wealth / defense deltas
  - shared alive / port / ruin curves

### v2 Implementation Decision

- new mainline family to implement now:
  - score-weighted semimechanistic terminal decoder with richer static/interacted features
  - per-round coefficient fitting over dynamic terminal classes vs empty baseline
  - low-rank SVD manifold over fitted round coefficient vectors
  - synthetic-live episodes labeled by round manifold coordinates, not by v1 summary vector
  - transcript-set student with observation-level set features, pooled coverage stats, repeat-window stats, owner concentration, and settlement-mark summaries
- rationale:
  - direct coefficient manifold is a better latent target than the v1 replay summary
  - multiclass terminal decoder fixes the biggest teacher bottleneck
  - normalized set-summary kNN is a more faithful first student than the prior tiny summary vector

### Immediate Work In Flight

1. add `round_coefficients_v2.py`
2. add `hazard_teacher_v2.py`
3. extend synthetic-live artifacts to carry map size and externally supplied regime vectors
4. add v2 transcript-set student
5. wire new predictor family + benchmark/CLI registration
6. run focused tests
7. launch parallel historical probes on the hard 3-round multi-seed slice

### 2026-03-21 11:08:58 UTC: Posterior-Aware Query Policy Push

- re-read:
  - `instructions/agent1.md`
  - local `README.md`
  - local `docs/game_facts.md`
- checked machine health before widening more work:
  - load: about `22 / 30 / 41`
  - memory used: about `762 GiB`
  - memory free: about `2.1 TiB`
  - other agents active: agent2 / agent3 / agent7 visible
  - own full promotions still running in background:
    - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1`
    - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_online50_v1`
- handoff alignment:
  - current bottleneck is no longer teacher-only; query policy is still heuristic and mostly posterior-blind
  - next axis to explore is active querying from regime-posterior disagreement, not just motif/repeat heuristics
- implementation target:
  - add `regime_probe_posterior_v1`
  - use hazard `student.infer_regime(...)` online
  - convert posterior particles into per-seed terminal disagreement maps via teacher decoding
  - score windows with mutual-information-like disagreement + predictive entropy + motif/repeat structure
  - pass predictor into interactive-policy construction in historical/synthetic/live paths
  - add tests and benchmark this directly against `regime_probe_v1`
- completed implementation:
  - added `PosteriorDisagreementPolicy` in `src/astar/policy/regime_probe.py`
  - wired predictor-aware `build_interactive_policy(...)`
  - passed predictor into live/synthetic/historical interactive call sites
  - added fallback-policy test and historical-benchmark smoke for `regime_probe_posterior`
- focused validation:
  - `uv run --with pytest python -m pytest tests/test_exploration_policy.py tests/test_historical_benchmark.py -q`
  - result: `18 passed in 60.43s`
- post-test machine check:
  - load: about `64.7 / 41.6 / 41.7`
  - memory used: about `923 GiB`
  - memory free: about `1.9 TiB`
  - decision: keep new probes parallel, but cap at `jobs=3` each because multiple other agents are saturating workers too
- next launches queued:
  - `probe_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_3rounds_seed0to1`
  - `probe_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_3rounds_seed0to1`
  - `probe_hazard_v4_k5_r3_l16_m50_regime_probe_posterior_3rounds_seed0to1`
- launched:
  - hard-slice matched multi-seed probes:
    - `probe_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_3rounds_seed0to1`
    - `probe_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_3rounds_seed0to1`
    - `probe_hazard_v4_k5_r3_l16_m50_regime_probe_posterior_3rounds_seed0to1`
  - full promotion:
    - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_online50_v1`
- note:
  - CLI model-choice table still lags behind richer direct-Python model aliases
  - custom `v3/v4` configs beyond the baked CLI list must be launched through `run_historical_benchmark(...)` directly for now
- follow-up fix completed:
  - removed rigid research-model `argparse` whitelists from:
    - `run-historical-benchmark`
    - `run-synthetic-tournament`
    - `run-synthetic-benchmark`
    - `run-live-online`
    - `visualize-model-prediction`
  - rationale:
    - model resolution is already dynamic in predictor/model code
    - static CLI choices were blocking legitimate frontier configs and slowing iteration
  - parser smoke:
    - custom names like `hazard_posterior_v4_k5_r3_l32_m70` now parse cleanly across those commands
- first posterior-policy results:
  - `hazard_posterior_v3_k5_r3_l16_m50 + regime_probe_posterior_v1`:
    - hard 3-round slice: `77.3567 / 0.088722`
    - vs `regime_probe_v1`: worse by `-0.7718` score
    - vs `coverage`: still better by about `+0.5438`
  - `hazard_posterior_v4_k5_r3_l16_m50 + regime_probe_posterior_v1`:
    - hard 3-round slice: `77.7966 / 0.086753`
    - vs `regime_probe_v1`: better by `+0.1543`, KL `-0.000634`
  - `hazard_posterior_v4_k5_r3_l32_m70 + regime_probe_posterior_v1`:
    - hard 3-round slice: `78.5039 / 0.083587`
    - current best on this slice by a small margin over `regime_probe_v1`
    - gain is small: `+0.0233` score, KL `-0.000087`
- interpretation:
  - posterior maps help the stronger v4 teacher/student family
  - current additive posterior policy is too aggressive / unstable for v3
  - next immediate policy variant should use posterior only as a conservative multiplier on proven regime-probe heuristics
- implementing next:
  - `regime_probe_posterior_blend_v1`
- implemented:
  - `regime_probe_posterior_blend_v1`
  - predictor-aware posterior blend integrated into `build_interactive_policy(...)`
  - added fallback and historical-benchmark smoke coverage
- focused validation:
  - `uv run --with pytest python -m pytest tests/test_exploration_policy.py tests/test_historical_benchmark.py -q`
  - result: `20 passed in 48.87s`
- blend hard-slice results:
  - `hazard_posterior_v4_k5_r3_l32_m70 + regime_probe_posterior_blend_v1`:
    - `78.8435 / 0.082170`
    - delta vs `regime_probe_v1`: `+0.3629`, weighted KL `-0.001505`
  - `hazard_posterior_v3_k5_r3_l16_m50 + regime_probe_posterior_blend_v1`:
    - `78.9616 / 0.081747`
    - delta vs `regime_probe_v1`: `+0.8331`, weighted KL `-0.003483`
    - current overall hard-slice frontier
  - `hazard_posterior_v4_k5_r3_l16_m50 + regime_probe_posterior_blend_v1`:
    - `77.8513 / 0.086528`
    - delta vs `regime_probe_v1`: `+0.2090`, weighted KL `-0.000859`
- key interpretation:
  - conservative posterior modulation works far better than additive posterior scoring
  - gains are concentrated on `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
  - on `8e839...` and `ae780...`, posterior blend is nearly identical to `regime_probe_v1`
  - this strongly suggests the posterior signal is useful as a targeted correction, not a replacement for the heuristic policy
- launched full promotions:
  - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_online50_v1`
  - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_blend_online50_v1`
- push log:
  - pushed `d4732d2f` to `origin/agent1`
  - pushed `9db0b7aa` to `origin/agent1`
  - pushed `10bba395` to `origin/agent1`
### 2026-03-21 11:50 UTC: Broad Validation Signal + Better Fast Proxy

- machine check before widening again:
  - load: about `78 / 59 / 52`
  - memory used: about `1.6 TiB`
  - memory free: about `1.2 TiB`
  - decision: still enough headroom for more parallel sweeps; use `jobs=5` proxy runs rather than `jobs=6+` everywhere because many other agents are active
- completed broad observation-only promotions:
  - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1`:
    - `76.7061 / 0.092236`
    - materially above stored `query_residual_v7` broad baseline `73.9505 / 0.106326`
    - round weaknesses: `36e...`, `ae780...`, `f1da...`
  - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_online50_v1`:
    - `75.0492 / 0.100129`
    - above `query_residual_v7`, but clearly below the stronger v4 broad result
  - implication:
    - adaptive `regime_probe_v1` generalizes for real
    - v4 currently looks more robust than v3 on the full 8-round set
- validation refinement:
  - searched all 4/5/6-round subsets of the completed 8-round results from:
    - `query_residual_v7`
    - `v4 l32/m70 + regime_probe_v1`
    - `v3 l16/m50 + regime_probe_v1`
    - `v3 l16/m50 + coverage`
  - selected new fast proxy slice:
    - `71451d74-be9f-471f-aacd-a41f3b68a9cd`
    - `8e839974-b13b-407b-a5e7-fc749d877195`
    - `ae78003a-4efe-425a-881a-d16a39bca0ad`
    - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
    - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
  - reason:
    - preserves broad model ranking across the tested families
    - score RMSE vs full means about `0.55`
    - KL RMSE vs full means about `0.00256`
    - much safer fast selector than the old 3-round hard slice
- next:
  - run a parallel posterior-blend config sweep on this new 5-round proxy
- stopped dominated in-flight jobs to free workers:
  - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_online50_v1`
  - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_online50_v1`
  - reason: additive posterior policy already lost to posterior-blend on the hard slice
- launched proxy-5 sweep with `policy=regime_probe_posterior_blend`, `episode_seeds=[0,1]`, `jobs=5`:
  - `proxy5_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_seed0to1`
  - `proxy5_hazard_v3_k5_r3_l24_m60_regime_probe_posterior_blend_seed0to1`
  - `proxy5_hazard_v3_k5_r3_l32_m70_regime_probe_posterior_blend_seed0to1`
  - `proxy5_hazard_v4_k5_r3_l16_m50_regime_probe_posterior_blend_seed0to1`
  - `proxy5_hazard_v4_k5_r3_l24_m60_regime_probe_posterior_blend_seed0to1`
  - `proxy5_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_blend_seed0to1`

### 2026-03-21 13:32 UTC: Block-Latent Rejection + Particle-Refined Posterior Mainline

- resumed from pushed head:
  - `8ddd477e`
- canonical reread completed again this session:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent1.md`
- machine check before deciding next branch:
  - `13:20 UTC`: load about `83.8 / 56.0 / 49.1`
  - memory used about `1.8 TiB`
  - memory free about `918 GiB`
  - many other agents active; do not widen top-level job count aggressively
- in-flight block-latent `v6` proxy results:
  - completed:
    - `proxy5_hazard_v6_k5_b1_l16_m50_regime_probe_seed0to1`
    - result: `1.7899 / 1.571099`
    - runtime: `548.12s`
  - interpretation:
    - this is not a mild regression; current `v6` block-latent decoder collapses badly
    - predicted mass is heavily distorted toward forest / dynamic classes and misses settlement support
    - strong evidence the current `hazard_teacher_v4` block reconstruction is structurally broken for online prediction
  - action:
    - killed remaining `v6` proxy runs:
      - `proxy5_hazard_v6_k5_b2_l16_m50_regime_probe_seed0to1`
      - `proxy5_hazard_v6_k5_b2_l32_m70_regime_probe_seed0to1`
    - conclusion:
      - do not spend more sweep budget on `v6` as implemented
- pivot chosen from handoff Axis F:
  - move from more teacher-structure sweeps to `particle refinement on top of amortized posterior`
  - rationale:
    - current `regime_probe` / posterior policies still depend on a posterior inferred mostly from transcript summary regression + nearest neighbors
    - handoff explicitly calls for particle refinement as the next student-posterior axis
    - this is a real structural change, not another baseline sweep
- implemented new family:
  - new observation-likelihood refinement helpers in:
    - `src/astar/student/posterior/deepset_student.py`
  - new student:
    - `ObservationSetParticleRefinedStudent`
    - starts from the strong amortized+neighbor posterior
    - then reweights particles by pseudo-likelihood of observed query patches under `teacher.terminal_tensor(...)`
    - uses observed class-grid likelihood with floor clipping
  - new predictor family:
    - `src/astar/student/predictor/hazard_posterior_v7.py`
    - base teacher: `HazardTeacherV2` (same regime-manifold family as strong `v4`)
    - defaults intentionally centered on the broad-strong `v4` setting:
      - `k=5`
      - `rank=3`
      - `ridge=32`
      - `mix=70`
      - observation refinement weight `obs=8`
  - wiring updated:
    - `src/astar/student/predictor/interactive.py`
    - `src/astar/workflows/historical_benchmark.py`
    - `tests/test_historical_benchmark.py`
- focused validation:
  - compile:
    - `python3 -m compileall src/astar/student/posterior/deepset_student.py src/astar/student/predictor/hazard_posterior_v7.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py tests/test_historical_benchmark.py`
  - benchmark smoke:
    - `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
    - result: `20 passed in 99.13s`
- machine check after validation:
  - `13:31 UTC`: load about `58.2 / 78.9 / 71.9`
  - memory free about `947 GiB`
  - decision:
    - safe to run a controlled `3`-job proxy sweep on `v7`
- next immediate experiments:
  - launch proxy-5 sweep on:
    - `hazard_posterior_v7_k5_r3_l32_m70_q4`
    - `hazard_posterior_v7_k5_r3_l32_m70_q8`
    - `hazard_posterior_v7_k5_r3_l32_m70_q12`
  - initial policy:
    - `regime_probe_posterior_blend`
  - reason:
    - new posterior should help most where the policy can exploit posterior state conservatively
- launched:
  - `proxy5_hazard_v7_k5_r3_l32_m70_q4_regime_probe_posterior_blend_seed0to1`
    - session `67896`
  - `proxy5_hazard_v7_k5_r3_l32_m70_q8_regime_probe_posterior_blend_seed0to1`
    - session `24596`
  - `proxy5_hazard_v7_k5_r3_l32_m70_q12_regime_probe_posterior_blend_seed0to1`
    - session `24250`
- added control arm:
  - `proxy5_hazard_v7_k5_r3_l32_m70_q8_regime_probe_seed0to1`
    - session `80608`
  - rationale:
    - isolates model improvement from policy-specific posterior-blend gains
- parallel policy branch implemented while `v7` runs:
  - new direct posterior-information policy:
    - `regime_probe_information_v1`
  - files:
    - `src/astar/policy/regime_probe.py`
    - `src/astar/policy/interactive.py`
    - `tests/test_exploration_policy.py`
    - `tests/test_historical_benchmark.py`
  - design:
    - score candidate windows directly by posterior mutual-information proxy mass
      derived from per-cell Jensen-Shannon / disagreement under current particles
    - use only small motif/neighbor tie-breakers
    - keep a separate repeat rule rather than the older additive/blend heuristic
  - focused validation:
    - `python3 -m compileall src/astar/policy/regime_probe.py src/astar/policy/interactive.py tests/test_exploration_policy.py tests/test_historical_benchmark.py`
    - `uv run --with pytest python -m pytest tests/test_exploration_policy.py tests/test_historical_benchmark.py -q`
    - result: `26 passed in 126.27s`
- machine check before adding more top-level runs:
  - `13:41 UTC`: load about `60.3 / 63.8 / 65.6`
  - memory free about `873 GiB`
  - decision:
    - add `2` targeted proxy jobs only; do not widen further until first `v7` or policy result lands
- launched information-policy proxy runs:
  - `proxy5_hazard_v4_k5_r3_l32_m70_regime_probe_information_seed0to1`
    - session `37158`
  - `proxy5_hazard_v7_k5_r3_l32_m70_q8_regime_probe_information_seed0to1`
    - session `47026`
- first finished `v7` result:
  - `proxy5_hazard_v7_k5_r3_l32_m70_q8_regime_probe_seed0to1`
  - result: `76.9238 / 0.089809`
  - runtime: `591.999s`
  - comparison:
    - current proxy leader `v3 l32/m70 + regime_probe_posterior_blend`: `77.1302 / 0.089726`
    - delta: `-0.2064` score, `+0.000083` KL
  - interpretation:
    - first particle-refined posterior result is immediately near the proxy frontier
    - not enough to declare a new best, but strong enough to justify immediate broad promotion
- launched broad promotion:
  - `dev_hazard_v7_k5_r3_l32_m70_q8_regime_probe_online50_v1`
    - session `60357`
- machine health changed sharply after the extra sidecars:
  - `13:55 UTC`: load about `156 / 149 / 103`
  - memory free about `723 GiB`
  - many other agents plus heavy `ainm` validation jobs were saturating cores
  - action:
    - stopped low-priority information-policy sidecars
      - `proxy5_hazard_v4_k5_r3_l32_m70_regime_probe_information_seed0to1`
      - `proxy5_hazard_v7_k5_r3_l32_m70_q8_regime_probe_information_seed0to1`
- kept running:
    - `proxy5_hazard_v7_k5_r3_l32_m70_q4_regime_probe_posterior_blend_seed0to1`
    - `proxy5_hazard_v7_k5_r3_l32_m70_q8_regime_probe_posterior_blend_seed0to1`
    - `proxy5_hazard_v7_k5_r3_l32_m70_q12_regime_probe_posterior_blend_seed0to1`
    - `dev_hazard_v7_k5_r3_l32_m70_q8_regime_probe_online50_v1`

### Session Continuation

- date: 2026-03-21 UTC
- resumed commit: `eddde99e`
- branch: `agent1`
- remote tracking: `origin/agent1`
- `br` check at resume: unavailable (`command not found`)
- mandatory reread completed again before work:
  - `instructions/agent1.md`
- live machine snapshot at resume:
  - `14:00 UTC`: load about `120.7 / 108.0 / 96.8`
  - memory free about `817 GiB`
  - shared box was busy but still far below memory pressure
- stale-process cleanup completed before new model work:
  - previously killed info-policy PIDs were gone
  - found old orphaned agent1 benchmark workers:
    - `3303118`
    - `3303121`
    - `3303122`
    - `3303123`
    - `3303124`
    - `3303125`
  - killed them; they dropped to defunct immediately
  - post-cleanup machine snapshot:
    - `14:02 UTC`: load about `75.2 / 96.1 / 93.6`
    - memory free about `894 GiB`
- new model work this session:
  - implemented `hazard_posterior_v8`
    - same replay-regime `HazardTeacherV2` / synthetic-live path as `v7`
    - new posterior refinement axis only:
      - replay-derived entropy-conditioned class weights
      - weights applied inside particle observation likelihood reweighting
    - rationale:
      - benchmark score is entropy-weighted KL
      - first `v7` diagnostics showed concentrated empty-vs-forest KL failures
      - handoff explicitly calls for stronger posterior refinement before more giant teacher churn
  - files added/updated:
    - `src/astar/student/predictor/hazard_posterior_v8.py`
    - `src/astar/student/posterior/deepset_student.py`
    - `src/astar/student/predictor/interactive.py`
    - `src/astar/workflows/historical_benchmark.py`
    - `tests/test_historical_benchmark.py`
- focused validation after the `v8` patch:
  - `python3 -m compileall src/astar/student/posterior/deepset_student.py src/astar/student/predictor/hazard_posterior_v8.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py tests/test_historical_benchmark.py`
  - `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
  - result: `22 passed in 87.51s`
- all previously running `v7` jobs resolved while validation was running:
  - broad result:
    - `dev_hazard_v7_k5_r3_l32_m70_q8_regime_probe_online50_v1`
    - score: `78.6590`
    - weighted KL: `0.083821`
    - vs prior broad leader `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1`:
      - score delta: `+1.9529`
      - weighted KL delta: `-0.008415`
    - conclusion:
      - particle-refined posterior transfer is real on broad validation
      - `v7 + regime_probe_v1` is the new broad family leader by a large margin
  - proxy-5 posterior-blend sweep:
    - `proxy5_hazard_v7_k5_r3_l32_m70_q4_regime_probe_posterior_blend_seed0to1`
      - score: `77.2677`
      - weighted KL: `0.088458`
      - vs prior proxy leader `v3 l32/m70 + regime_probe_posterior_blend`:
        - score delta: `+0.1375`
        - weighted KL delta: `-0.001268`
      - conclusion:
        - new proxy leader
        - lighter observation reweighting is better than the older `q8/q12` settings under posterior-blend
    - `proxy5_hazard_v7_k5_r3_l32_m70_q8_regime_probe_posterior_blend_seed0to1`
      - score: `76.5759`
      - weighted KL: `0.091411`
    - `proxy5_hazard_v7_k5_r3_l32_m70_q12_regime_probe_posterior_blend_seed0to1`
      - score: `76.6016`
      - weighted KL: `0.091345`
    - comparison inside the `v7` posterior-blend sweep:
      - `q4` beat `q8` by `+0.6918` score and `-0.002953` weighted KL
      - `q4` beat `q12` by `+0.6661` score and `-0.002887` weighted KL
- machine state after validation and result collection:
  - `14:07 UTC`: load about `37.7 / 62.2 / 79.8`
  - memory free about `919 GiB`
  - then after polling/other-agent work:
    - `14:11 UTC`: load about `163.8 / 109.3 / 93.4`
    - memory free about `834 GiB`
    - machine has `384` logical CPUs, so one more reduced-width proxy run is acceptable
- next experiment launched immediately:
  - `proxy5_hazard_v8_k5_r3_l32_m70_q8_regime_probe_seed0to1`
    - session `73169`
    - `jobs=2`
  - rationale:
    - broad/proxy v7 results are now strong enough that the next justified axis is score-aware class-weighted posterior refinement
    - reduced job count respects the higher shared-machine load while still using the available box
- commit/push completed after logging the new `v7` frontier and `v8` implementation:
  - commit: `4222ae37`
  - pushed to `origin/agent1`
- post-launch machine check:
  - `14:15 UTC`: load about `720.7 / 292.0 / 159.1`
  - memory free about `900 GiB`
  - machine still has abundant memory, but total shared CPU contention spiked sharply
  - action:
    - keep the single reduced-width `v8` proxy alive
    - do not launch any more top-level jobs until this result lands or load drops materially

### Session Continuation

- date: 2026-03-21 UTC
- resumed commit: `43035d86`
- branch: `agent1`
- remote tracking: `origin/agent1`
- `br` check at resume: unavailable (`command not found`)
- mandatory rereads completed again before work:
  - full `instructions/agent1.md`
- live machine snapshot at resume:
  - `14:16 UTC`: load about `786.9 / 400.6 / 206.5`
  - memory free about `1.0 TiB`
  - external saturation was dominated by `ainm` validation plus other-agent sweeps, not agent1
- first action:
  - polled running `v8` proxy instead of widening immediately
  - while waiting, implemented the next handoff-aligned student-posterior axis:
    - `hazard_posterior_v9`
    - inducing-point attention transcript encoder on top of the strong `v7` teacher path
    - this is the cheap deterministic version of the handoff’s Set-Transformer / richer transcript-encoder axis
- new implementation completed:
  - files:
    - `src/astar/student/posterior/deepset_student.py`
    - `src/astar/student/predictor/hazard_posterior_v9.py`
    - `src/astar/student/predictor/interactive.py`
    - `src/astar/workflows/historical_benchmark.py`
    - `tests/test_historical_benchmark.py`
  - initial regression:
    - helper insertion accidentally split `_seed_transcript_vector`
    - broke all posterior-family historical-benchmark tests
  - fix:
    - restored the full transcript-summary path
    - reran validation successfully
- focused validation after the `v9` fix:
  - `python3 -m compileall src/astar/student/posterior/deepset_student.py src/astar/student/predictor/hazard_posterior_v9.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py tests/test_historical_benchmark.py`
  - `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
  - result: `23 passed in 77.53s`
- `v8` proxy result finished during this work:
  - `proxy5_hazard_v8_k5_r3_l32_m70_q8_regime_probe_seed0to1`
  - score: `78.4582`
  - weighted KL: `0.082918`
  - runtime: `585.419s`
  - comparisons:
    - vs prior proxy leader `proxy5_hazard_v7_k5_r3_l32_m70_q4_regime_probe_posterior_blend_seed0to1`
      - score delta: `+1.1905`
      - weighted KL delta: `-0.005541`
    - vs prior `v7 + regime_probe` control on same proxy:
      - score delta: `+1.5344`
      - weighted KL delta: `-0.006891`
  - conclusion:
    - replay-derived entropy-conditioned class weighting is a strong proxy improvement
    - `v8 + regime_probe_v1` is the new proxy leader
- machine state after `v8` finished:
  - `14:25 UTC`: load about `46.1 / 161.7 / 182.9`
  - memory free about `1.3 TiB`
  - interpretation:
    - 1-minute load had dropped enough to reopen controlled parallelism
    - memory remained abundant
- new experiment batch launched immediately:
  - broad promotion:
    - `dev_hazard_v8_k5_r3_l32_m70_q8_regime_probe_online50_v1`
    - session `44253`
    - `jobs=4`
  - new posterior-family proxy probes:
    - `proxy5_hazard_v9_k5_r3_l32_m70_q8_u6_regime_probe_seed0to1`
      - session `16776`
      - `jobs=2`
    - `proxy5_hazard_v9_k5_r3_l32_m70_q8_u10_regime_probe_seed0to1`
      - session `48876`
      - `jobs=2`
  - launch rationale:
    - `v8` earned immediate broad promotion by winning proxy strongly
    - `v9` should be tested as the next transcript-encoder axis while the machine has spare short-term CPU headroom
- machine check right after the launch batch:
  - `14:26 UTC`: load about `43.3 / 139.7 / 174.0`
  - memory free about `1.3 TiB`
  - agent1 active top-level runs: exactly `3`
  - total agent1 worker budget from this batch: `8` processes
  - decision:
    - acceptable under current headroom
    - do not widen further until one of these results lands
- the full batch resolved quickly:
  - broad promotion:
    - `dev_hazard_v8_k5_r3_l32_m70_q8_regime_probe_online50_v1`
    - score: `79.1946`
    - weighted KL: `0.081417`
    - vs prior broad leader `dev_hazard_v7_k5_r3_l32_m70_q8_regime_probe_online50_v1`:
      - score delta: `+0.5355`
      - weighted KL delta: `-0.002404`
    - conclusion:
      - `v8 + regime_probe_v1` is the new completed broad leader
      - class-aware particle likelihood transfer is real, not just proxy noise
  - `v9` inducing-attention proxy probes:
    - `proxy5_hazard_v9_k5_r3_l32_m70_q8_u6_regime_probe_seed0to1`
      - score: `76.6165`
      - weighted KL: `0.091134`
    - `proxy5_hazard_v9_k5_r3_l32_m70_q8_u10_regime_probe_seed0to1`
      - score: `76.2613`
      - weighted KL: `0.092625`
    - comparison vs current proxy leader `v8 q8 + regime_probe`:
      - `u6`: score delta `-1.8417`, weighted KL delta `+0.008216`
      - `u10`: score delta `-2.1969`, weighted KL delta `+0.009707`
    - conclusion:
      - the first inducing-point attention transcript encoder is decisively below `v8`
      - richer transcript pooling alone is not beating score-aware class-weighted likelihood refinement in the current family
- machine check after the batch finished:
  - `14:35 UTC`: load about `17.5 / 55.2 / 118.4`
  - memory free about `1.3 TiB`
  - no agent1 top-level benchmark jobs remained
  - interpretation:
    - plenty of immediate headroom for the next controlled sweep after this log/push
