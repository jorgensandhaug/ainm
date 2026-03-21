# Semimech Hazards Notes

## Scope

- Family owner: `agent2`
- Goal: beat existing `query_residual_v7` historical online benchmark while keeping evaluation round-held-out and reproducible.

## Session Facts

- Branch: `agent2`
- Start commit: `78d89f9977e756f86c1e750be7d1d81c5207f269`
- Canonical docs read:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent2.md`

## Current Baselines

- `historical_bucket_prior_v1`
  - artifact: `data/artifacts/benchmarks/agent2_baseline_historical_bucket_prior_20260320/`
  - mean score: `66.0233`
  - mean weighted KL: `0.148488`
- `query_residual_v7` 3-round repaired dev line
  - artifact: `data/artifacts/benchmarks/agent2_dev_query_residual_3rounds_coverage_20260320/`
  - mean score: `72.6319`
  - mean weighted KL: `0.107047`
- `query_residual_v7` 3-round exploration policy line
  - artifact: `data/artifacts/benchmarks/agent2_dev_query_residual_3rounds_exploration_20260320/`
  - mean score: `73.1346`
  - mean weighted KL: `0.104737`
  - note: policy-only improvement over repaired coverage baseline
- `query_residual_v7` full 8-round exploration line
  - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_8rounds_exploration_20260321/`
  - mean score: `74.4010`
  - mean weighted KL: `0.101998`
  - note: first promoted exploration-based full local winner
- `smh_resid_z12_h0_covbase_locgate_v001` full 8-round exploration line
  - artifact: `data/artifacts/benchmarks/agent2_full_smh_resid_locgate_8rounds_exploration_20260321/`
  - mean score: `74.4053`
  - mean weighted KL: `0.101981`
  - note: previous best before exact-local-residual sweep
- `query_residual_v9` full 8-round exploration line
  - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_8rounds_exploration_20260321/`
  - mean score: `74.4773`
  - mean weighted KL: `0.101601`
  - note: major win from adding exact local residual without entropy-stratified sampling
- `query_residual_v9_locgate_v001` full 8-round exploration line
  - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_locgate_8rounds_exploration_20260321/`
  - mean score: `74.4815`
  - mean weighted KL: `0.101584`
  - note: best single-model residual line before fixed blending
- `query_residual_v9_v10_blend025_v001` full 8-round exploration line
  - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_v10_blend025_8rounds_exploration_20260321/`
  - mean score: `74.5110`
  - mean weighted KL: `0.101290`
  - note: best fixed-blend line before adaptive follow-up
- `query_residual_v9_v10_builtfreqgatexwide_v001` full 8-round exploration line
  - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_v10_builtfreqgatexwide_8rounds_exploration_20260321/`
  - mean score: `74.6943`
  - mean weighted KL: `0.100390`
  - note: current best full local round-held-out result in this checkout
- Existing repo artifact to beat:
  - `data/artifacts/benchmarks/dev_query_residual_online50_v7/`
  - mean score: `73.9505`
  - mean weighted KL: `0.106326`

## Working View

- Current hazard teacher is not yet a real transition teacher.
- `query_residual_*` is now treated as a baseline/reference line, not the main family.
- Current standalone semimechanistic read:
  - first `smh_knn*` summary-bank student scaffold failed decisively
  - first `smh_coeffbank*` discrete round-law posterior line is plausibly alive
  - strongest immediate leverage is semimechanistic posterior structure + calibration/hybridization, not more summary-kNN tuning

## New Standalone Semimech Findings

- `smh_knn*` negative result:
  - the first summary-conditioned neighbor-retrieval student formulation is badly misspecified
  - 2-round screen scores were catastrophic (`3.5` to `4.7`, KL around `1.03` to `1.15`)
  - lesson: transcript-summary similarity is not a good posterior surrogate here
- `smh_coeffbank*` positive result:
  - treating each replay-backed historical round law as a discrete semimechanistic candidate and updating via patch likelihood is the first new family branch with real signal
  - 4-round dev score for `smh_coeffbank_z0_h0_covlike_calbase_v001`:
    - `57.1899 / 0.190069`
  - this is below `historical_bucket_prior` on mean score (`58.5892`) but much better on weighted KL (`0.231346` for historical bucket)
- `smh_coeffbank* + historical_bucket` hybrid result:
  - fixed blends are a major win and establish the first truly competitive new `smh_*` branch
  - 4-round dev sweep:
    - `hbblend25`: `62.9456 / 0.182315`
    - `hbblend40`: `64.3401 / 0.167346`
    - `hbblend50`: `64.7681 / 0.161315`
    - `hbblend60`: `64.7502 / 0.158263`
    - `hbadapt25`: `61.8146 / 0.185580`
  - score winner: `hbblend50`
  - KL winner: `hbblend60`
  - practical read:
    - fixed blending dominates the first adaptive blend on this family
    - the curve rises strongly through `50%` coeff-bank weight and then flattens
- Important validation lesson:
  - 2-round leave-one-round-out is invalid for coeff-bank model selection because each fold has only one candidate law
  - therefore dev selection for posterior-over-round-laws families needs at least `4` rounds
- Complementarity pattern on the 4-round dev slice:
  - coeff-bank is much better on prosperous `ae78003a...`
  - coeff-bank is also better on hard `f1dac9a9...`
  - historical bucket dominates `8e839974...` and `c5cdf100...`
  - implication: next branch should test semimechanistic + historical hybrids, starting with fixed and disagreement-adaptive blends
- Updated implication after the hybrid sweep:
  - the hybrid is now the mainline standalone `smh_*` branch
  - next question is broader round-held-out promotion, not whether complementarity exists

## Runtime / infra findings for this branch

- Best-effort DuckDB event logging was necessary because parallel completed benchmarks could fail only at final catalog write due to lock contention.
- Shared synthetic-live dataset scope + fold-keyed checkpointing are now essential for semimech iteration speed.
- Next runtime target:
  - cache round-scoped `historical_bucket_prior` fits just like coeff-bank fits so multiple hybrid sweeps can reuse the same fold models.
- That target is now complete:
  - repeated hybrid sweeps on the fixed 4-round slice are now around `66s` to `82s`
  - versus much slower initial coeff-bank-only runs before fold-cached bucket loading and candidate memoization

## Legacy query_residual line retained only as benchmark target

- Current strongest observed effect:
  - `exploration_v2` mainly wins by rescuing the hardest round `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - versus the old full coverage artifact, that round improved by `+9.3641` score and `-0.061395` weighted KL
  - several easier rounds regressed slightly, so the next model iteration should try to keep the hard-round gain while softening easy-round regressions
- Current model-iteration read:
  - localized teacher gating is only a tiny refinement on top of `query_residual_v7 + exploration_v2`
  - versus the promoted exploration baseline, `7/8` rounds are identical
  - only round `8e839974-b13b-407b-a5e7-fc749d877195` improves, by `+0.034415` score and `-0.000134219` weighted KL
- Exact-local-residual sweep read:
  - `query_residual_v8` wins on the hard 3-round pathology probe vs prior `smh`, but is still too aggressive overall
  - `query_residual_v10` wins that hard probe more strongly and materially improves weighted KL on full 8-round eval, but loses too much score on easier rounds (`ae78003a`, `76909e29`, `71451d74`)
  - `query_residual_v9` is the balanced winner:
    - vs prior `smh` full winner: `+0.071990` score, `-0.000380619` weighted KL
  - stacked local teacher gating on top of `v9` remains a tiny but real refinement:
    - vs `v9`: `+0.004244` score, `-0.000016549` weighted KL
    - only round `8e839974-b13b-407b-a5e7-fc749d877195` changes, by `+0.033953` score and `-0.000132395` weighted KL
  - one last regularized `v10` probe (`prior_blend=0.40`) failed badly:
    - full result: `73.9346 / 0.103787`
    - interpretation: stronger prior fallback erased too much of the hard-round gain and did not rescue the easy-round regressions enough
- Fixed-blend follow-up read:
  - `query_residual_v9_v10_blend025_v001` is the first real post-sweep gain beyond single-model residual tuning:
    - vs `v9_locgate`: `+0.029414` score, `-0.000294587` weighted KL
  - the win comes from partially importing `v10`'s strength on the harder complementary rounds:
    - `c5cdf100...`: `+0.686885` score, `-0.003278396` KL
    - `f1dac9a9...`: `+0.702416` score, `-0.004166179` KL
  - one lighter-weight bracketing probe `query_residual_v9_v10_blend020_v001` did not beat the `25%` blend:
    - full result: `74.5077 / 0.101335`
    - vs `blend025`: `-0.003219` score, `+0.000045829` weighted KL
    - interpretation: reducing the `ae78003a...` giveback was not enough to offset the smaller `c5cdf100...` / `f1dac9a9...` recovery
- Adaptive-blend follow-up read:
  - `query_residual_v9_v10_adaptive025_v001` beats the fixed `blend025` winner on full 8-round eval:
    - `74.5181 / 0.101208`
    - vs `blend025`: `+0.007162` score, `-0.000081729` weighted KL
  - the adaptive mechanism is real, but the wins are still concentrated:
    - positive deltas mainly from `c5cdf100...`, `f1dac9a9...`, and a smaller lift on `8e839974...`
    - main giveback remains `ae78003a...`
  - two cheap cached follow-ups did not beat the linear `25%` adaptive target:
    - `adaptive025sqrt`: full `74.5158 / 0.101245`
    - `adaptive020`: full `74.5164 / 0.101253`
  - the new fold-keyed holdout checkpoint caching is high-signal infrastructure:
    - first full adaptive run: about `3006s`
    - later cached full reruns: about `180s`
    - meaning: future local search over this blend family is now cheap without weakening the round-held-out protocol
- Built-frequency-gate follow-up read:
  - the decisive missing signal turned out to be round harshness visible in the legal year-50 transcript itself
  - simple observed built-frequency in the queried final maps separated the previously conflicting rounds very cleanly:
    - prosperous `ae78003a...`: about `0.2723`
    - intermediate `8e839974...`: about `0.1024`
    - harsh `c5cdf100...`: about `0.0295`
    - harshest `f1dac9a9...`: about `0.0035`
  - first built-frequency-gated variant `query_residual_v9_v10_builtfreqgate_v001` was a major real win:
    - full `74.6341 / 0.100659`
    - vs prior adaptive winner: `+0.1160` score, `-0.000548` weighted KL
    - it improved every round mean, with the biggest lifts on `ae78003a...`, `c5cdf100...`, and `f1dac9a9...`
  - widening the round-target spread kept helping:
    - `query_residual_v9_v10_builtfreqgatewide_v001`: `74.6677 / 0.100508`
    - `query_residual_v9_v10_builtfreqgatexwide_v001`: `74.6943 / 0.100390`
  - current best `xwide` result vs prior adaptive winner:
    - `+0.1761` score
    - `-0.000817` weighted KL
    - win rate `0.975`
  - stopping read for this axis:
    - the `xwide` variant already spans the full current round-target clip range `[0.05, 0.45]`
    - future gains likely need a new axis such as per-cell floor/cap changes or a learned round-target map, not just more spread on the same formula
