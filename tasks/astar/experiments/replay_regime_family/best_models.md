# Best Models

## Broad-Set Leader

- `hazard_posterior_v15_k5_r3_l32_m70_q8 + regime_probe_v1`
- benchmark: `dev_hazard_v15_regime_probe_online50_v1`
- score: `82.8771`
- weighted KL: `0.064404`
- why it matters:
  - NEW BEST! +3.68 over prior leader v8 (79.19)
  - Original-coefficient particles avoid SVD truncation loss
  - Combined with v11's observation-frequency blending (t=20)
  - Massive gains on hardest rounds: ae78003a +12.83, f1dac9a9 +11.64

## Previous Broad Leader

- `hazard_posterior_v8_k5_r3_l32_m70_q8 + regime_probe_v1`
- benchmark: `dev_hazard_v8_k5_r3_l32_m70_q8_regime_probe_online50_v1`
- score: `79.1946`
- weighted KL: `0.081417`

## Current Ranked Frontier

| rank | model | benchmark | score | weighted KL | notes |
| --- | --- | --- | ---: | ---: | --- |
| 1 | `hazard_posterior_v15_k5_r3_l32_m70_q8` | `dev_hazard_v15_regime_probe_online50_v1` | 82.8771 | 0.06440 | NEW! original coeff + obs blend |
| 2 | `hazard_posterior_v11_k5_r3_l32_m70_q8_t200` | `dev_hazard_v11_t200_regime_probe_online50_v1` | 79.9438 | 0.07760 | obs blend only (reconstructed coeff) |
| 3 | `hazard_posterior_v8_k5_r3_l32_m70_q8` | `dev_hazard_v8_k5_r3_l32_m70_q8_regime_probe_online50_v1` | 79.1946 | 0.08142 | previous leader |
| 4 | `hazard_posterior_v7_k5_r3_l32_m70_q8` | `dev_hazard_v7_k5_r3_l32_m70_q8_regime_probe_online50_v1` | 78.6590 | 0.08382 | pre-class-weighting |

## Per-Round Analysis (v15 vs v8)

| round | v15 score | v8 score | delta | notes |
| --- | ---: | ---: | ---: | --- |
| 36e581f1 | 63.53 | 58.44 | +5.09 | worst round, still far behind |
| ae78003a | 80.89 | 68.06 | +12.83 | MASSIVE improvement |
| f1dac9a9 | 84.76 | 73.12 | +11.64 | MASSIVE improvement |
| fd3c92ff | 81.10 | 80.47 | +0.63 | small gain |
| 71451d74 | 86.59 | 85.82 | +0.77 | small gain |
| 76909e29 | 87.61 | 88.10 | -0.49 | small regression |
| c5cdf100 | 87.90 | 87.75 | +0.15 | neutral |
| 8e839974 | 90.64 | 91.80 | -1.16 | small regression |

Key insight: The biggest gains come from rounds where the SVD truncation was losing the most information about the regime. When using original coefficients, the teacher produces much more accurate predictions for these previously hard rounds.
