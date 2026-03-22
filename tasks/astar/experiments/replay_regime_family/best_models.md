# Agent1 Final Report — Best Models

## Champion: `ffam_ensemble_v22` (ported from Agent7)
- **Score: 87.73** / KL 0.0446
- Total improvement: **+8.54** over starting v8 (79.19)
- Policy: exploration_r3, samples_per_round=6

## Per-Round Scores

| Round | Score |
| --- | ---: |
| 36e581f1 | 72.72 |
| fd3c92ff | 84.97 |
| 71451d74 | 87.74 |
| f1dac9a9 | 88.41 |
| ae78003a | 88.46 |
| 76909e29 | 92.17 |
| 8e839974 | 93.59 |
| c5cdf100 | 93.81 |

## Full Model Ranking

| Rank | Model | Score | Source |
| --- | --- | ---: | --- |
| 1 | ffam_ensemble_v22 | 87.73 | Agent7 (ported) |
| 2 | ffam_mode_v250 | 87.65 | Agent7 config |
| 3 | ffam_mode_v245 | 87.59 | Agent7 config |
| 4 | ffam_mode_v240 | 87.54 | Agent7 config |
| 5 | ffam_mode_v186 | 87.36 | Agent7 config |
| 6 | ffam_mode_v169 | 87.12 | Agent7 config |
| 7 | v21 (v15+v20 ensemble) | 84.06 | Agent1 original |
| 8 | v15 r5 l1 m20 q1 | 83.95 | Agent1 original |
| 9 | v20 (LightGBM) | 83.50 | Agent1 original |
| 10 | v8 (starting point) | 79.19 | Inherited |

## Agent1 Original Innovations (79.19 → 84.06 = +4.87)
1. **Original-coefficient particles** (+3.1): bypass SVD truncation
2. **SVD rank=5** (+0.9): capture more coefficient variance
3. **Observation-frequency blending** (+0.6): direct evidence use
4. **Hyperparameter optimization** (+0.4): m=20, q=1, l=1
5. **LightGBM ensemble** (+0.1): complementary nonlinear model

## Ported Architecture (84.06 → 87.73 = +3.67)
Agent7's ffam_mode/ensemble architecture: mode operator with residual MLP
posterior, cluster-operator hybrid decoder, supervised metric learning,
exploration_r3 policy. 300+ variants explored by Agent7.

## Failed Approaches (13 variants, all <84.06)
v10 (RFF), v12 (adaptive calibration), v13 (probability floor),
v17 (kNN cells), v18 (pure likelihood), v19 (prior-residual),
v22 (MLP student), enhanced features, various calibration schemes.
