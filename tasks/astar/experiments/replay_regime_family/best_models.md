# Best Models

## Broad-Set Leader

- `hazard_posterior_v15_k5_r5_l32_m20_q2 + regime_probe_v1`
- score: `83.7975` / KL `0.061489`
- delta vs v8: **+4.60**
- delta vs query_residual baseline: **+9.85**

## m-Weight Sweep Results

| m | score | interpretation |
| --- | ---: | --- |
| m10 | 83.69 | too little predicted mean — starts hurting |
| **m20** | **83.80** | optimal — ~20% predicted mean weight |
| m30 | 83.79 | near-optimal |
| m40 | 83.74 | slightly too much predicted mean |
| m50 | 83.67 | |
| m70 | 83.44 | v8-era default — too much predicted mean |
| m90 | 82.90 | heavily over-relying on predicted mean |

## Full Configuration Space Results

| rank | config | score |
| --- | --- | ---: |
| 1 | r5 m20 q2 l32 | **83.80** |
| 2 | r5 m30 q2 l32 | 83.79 |
| 3 | r5 m40 q2 l32 | 83.74 |
| 4 | r5 m50 q2 l16 | 83.70 |
| 5 | r5 m10 q2 l32 | 83.69 |
| 6 | r5 m50 q2 l32 | 83.67 |
| 7 | r5 m70 q2 l16 | 83.49 |
| 8 | r5 m70 q2 l32 (default) | 83.44 |
| 9 | r4 m70 q4 l32 | 83.04 |
| 10 | v8 (reference) | 79.19 |

## Evaluation Protocol

Leave-one-round-out over 8 rounds with ground truth.
For each fold: train on 7 rounds, predict holdout round using
online queries (50 budget, 2 episode seeds for noise reduction).
Mean score across all 8 folds × 2 seeds.
