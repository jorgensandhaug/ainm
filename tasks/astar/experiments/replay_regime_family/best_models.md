# Agent1 Final Report — Exhaustive Model Exploration

## Champion: `ffam_ensemble_v22` — Score: 87.73
- KL: 0.0446 | Policy: exploration_r3 | samples_per_round=6
- Total improvement: **+8.54 over starting v8 (79.19)**

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

## Complete Model Ranking (all broad-validated)
| # | Model | Score | Architecture |
| - | ----- | ----: | ----------- |
| 1 | ffam_ensemble_v22 | 87.73 | Agent7 ensemble (ported) |
| 2 | ffam_mode_v250 | 87.65 | Agent7 mode operator |
| 3 | ffam_mode_v245 | 87.59 | Agent7 mode operator |
| 4 | ffam_mode_v240 | 87.54 | Agent7 mode operator |
| 5 | ffam_mode_v186 | 87.36 | Agent7 mode operator |
| 6 | ffam_mode_v169 | 87.12 | Agent7 mode operator |
| 7 | ffam_mode_v261 | 86.82 | Agent1 custom config |
| 8 | ffam_mode_v260 | 85.05 | Agent1 custom config |
| 9 | v21 a55 (v15+v20 ensemble) | 84.06 | Agent1 linear+LightGBM |
| 10 | v15 r5 l1 m20 q1 | 83.95 | Agent1 original coeff |
| 11 | v20 (LightGBM) | 83.50 | Agent1 LightGBM teacher |
| 12 | v19 (prior-residual) | 83.27 | Agent1 Agent7-inspired |
| 13 | v22 (MLP student) | 82.89 | Agent1 MLP posterior |
| 14 | v17 (kNN cells) | 82.88 | Agent1 non-parametric |
| 15 | v16 r3 (no obs blend) | 82.30 | Agent1 ablation |
| 16 | v18 (pure likelihood) | 81.03 | Agent1 no-student |
| 17 | v11 t200 (obs blend only) | 79.94 | Agent1 observation blend |
| 18 | v8 (starting point) | 79.19 | Inherited baseline |

## Agent1 Original Innovations (79.19 → 84.06 = +4.87)
1. Original-coefficient particles (+3.1): bypass SVD truncation loss
2. SVD rank=5 (+0.9): capture more coefficient variance 
3. Observation-frequency blending (+0.6): direct evidence from viewport queries
4. Hyperparameter optimization m=20 q=1 l=1 (+0.27): trust particles, not predicted mean
5. LightGBM ensemble (+0.1): complementary nonlinear model

## Failed Approaches (documented for future reference)
- RFF nonlinear teacher (v10): 31.25 — catastrophic overfitting
- Enhanced v3 features: 76.03 — too many features for ridge
- Probability floor (v13): 75.02 — dilutes correct predictions
- Adaptive calibration (v12): 78.12 — hurts confident rounds
- Agent7 no-prior-blend: 83.58 — doesn't transfer to our architecture
- Agent7 MLP posterior: 82.89 — overfits with few training examples
- Prior-residual (v19): 83.27 — bucket prior as features doesn't help our model
- Custom ffam configs (v260/v261): 85.05/86.82 — Agent7's sweep was already optimal

## Cross-Agent Analysis
| Agent | Best Score | Architecture |
| ----- | ---------: | ----------- |
| Agent7 | 87.73 | ffam_mode ensemble (300+ variants) |
| Agent3 | ~85.31 | CatBoost cellwise |
| Agent1 (ours) | 84.06 (original) / 87.73 (with port) | hazard_posterior / ffam_mode |
| Agent4 | 83.06 | LightGBM evidence |
| Agent6 | ~79.6 | geometric mean ensemble |
| Agent5 | 77.35 | stacked QR + expansion kNN |
| Agent2 | ~74 | query_residual baseline |

## Convergence Evidence
- Agent7 declared "DEFINITIVE CONVERGENCE" after 300+ variants
- Our custom configs (v260/v261) both scored worse than Agent7's optimized settings
- The ensemble plateau at 87.72-87.73 is robust across different alpha/weight configs
- All per-round improvements have been extracted to near their limits
