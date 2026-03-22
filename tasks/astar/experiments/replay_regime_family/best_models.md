# Best Models — Agent1 Final Report

## Champion: `hazard_posterior_v21_a55 + regime_probe_v1`
- **Score: 84.06** / KL 0.0606
- Delta vs original v8: **+4.87**
- Delta vs query_residual baseline: **+10.11**

## Architecture: v15 linear + v20 LightGBM geometric mean ensemble

### How it works:
1. **v15 component** (linear, original coefficients): Per-round ridge regression from 27 spatial features to terminal class log-odds, with original per-round coefficients (no SVD truncation), r=5, m=20, q=1
2. **v20 component** (LightGBM): Per-round LightGBM models from spatial+prior features to terminal class log-odds, capturing nonlinear interactions
3. **Ensemble**: Geometric mean in probability space with alpha=0.55 (55% v15, 45% v20)
4. **Observation blending**: Conservative t=20 blending of direct observation frequencies
5. **Policy**: regime_probe_v1 (motif-based adaptive querying)

## Per-Round Scores (v21 a55)
| Round | Score |
| --- | ---: |
| 36e581f1 | 66.42 |
| ae78003a | 81.09 |
| fd3c92ff | 82.92 |
| f1dac9a9 | 85.40 |
| 71451d74 | 86.11 |
| 76909e29 | 89.75 |
| c5cdf100 | 90.39 |
| 8e839974 | 90.35 |

## Complete Experiment Summary (80+ experiments)

### Architectural variants tested:
| Version | Approach | Score | Notes |
| --- | --- | ---: | --- |
| **v21** | Linear+LightGBM ensemble | **84.06** | BEST |
| v15 | Linear, original coefficients | 83.95 | Best standalone |
| v20 | LightGBM teacher | 83.50 | Better on hard rounds |
| v19 | Prior-residual coefficients | 83.27 | Agent7-inspired |
| v22 | MLP student posterior | 82.89 | Overfits |
| v17 | kNN cell predictor | 82.88 | Non-parametric |
| v16 | Orig coeff, no obs blend | 82.30 | Obs blend helps |
| v18 | Pure likelihood matching | 81.03 | Student is valuable |
| v11 | Obs blend only (no orig coeff) | 79.94 | Obs blend validated |
| v8 | Previous best | 79.19 | Baseline |
| v12 | Adaptive calibration | 78.12 | Temperature hurts |
| v10 linear | Enhanced v3 features | 76.03 | Too many features |
| v13 | Probability floor | 75.02 | Hurts everywhere |
| v10 RFF | Nonlinear teacher | 31.25 | Catastrophic overfit |

### Key scientific findings:
1. SVD truncation was the main bottleneck (+3.1 points from using original coefficients)
2. Higher SVD rank helps regime identification (+0.9 at rank=5)
3. Conservative observation blending helps (+0.6)
4. Lower predicted-mean weight trusts accurate particles more (+0.4)
5. LightGBM captures complementary nonlinear patterns (+0.1 in ensemble)
6. More features/nonlinearity in the teacher HURTS with limited training data
7. Probability floors and temperature scaling HURT (wrong inductive bias)
8. The student posterior adds real value (removing it costs 2.8 points)

### Cross-agent intelligence:
- Agent7: 87.36 (fundamentally different architecture, not transferable piecemeal)
- Agent3: ~85.31 (CatBoost, partially transferred via LightGBM ensemble)
- Agent4: 83.06 (LightGBM evidence, similar idea to our v20)
- Agent6: ~79.6 (geometric mean ensemble, similar concept to v21)
- Agent5: 77.35 (stacked QR + expansion kNN)
