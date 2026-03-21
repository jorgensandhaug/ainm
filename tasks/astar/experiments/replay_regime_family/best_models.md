# Best Models

## Broad-Set Leader

- `hazard_posterior_v15_k5_r5_l32_m70_q2 + regime_probe_v1`
- score: `83.4413` / KL `0.062609`
- delta vs v8: **+4.25**
- delta vs query_residual baseline: **+9.49**

## Full Broad Ranking

| rank | model | score | KL | delta |
| --- | --- | ---: | ---: | ---: |
| 1 | v15 r5 q2 | **83.44** | 0.0626 | +4.25 |
| 2 | v15 r5 q4 | 83.36 | 0.0628 | +4.17 |
| 3 | v15 r6 q8 | 83.31 | 0.0629 | +4.11 |
| 4 | v15 r5 q1 | 83.27 | 0.0633 | +4.07 |
| 5 | v15 r5 q6 | 83.21 | 0.0633 | +4.02 |
| 6 | v15 r5 q8 | 83.17 | 0.0634 | +3.98 |
| 7 | v15 r4 q4 | 83.04 | 0.0640 | +3.84 |
| 8 | v15 r4 q8 | 82.97 | 0.0641 | +3.77 |
| 9 | v15 r3 q8 | 82.88 | 0.0644 | +3.68 |
| 10 | v16 r4 q8 (no obs blend) | 82.45 | 0.0667 | +3.25 |
| 11 | v16 r3 q8 (no obs blend) | 82.30 | 0.0671 | +3.11 |
| 12 | v11 t200 (obs blend only) | 79.94 | 0.0776 | +0.75 |
| 13 | v8 (previous leader) | 79.19 | 0.0814 | 0.00 |
| 14 | query_residual_v7 (baseline) | 73.95 | 0.1063 | -5.24 |

## Key Innovations (This Session)

### 1. Original-Coefficient Particles (+3.11 alone)
The SVD rank-3 reconstruction loses ~13% of coefficient variance. Using
original per-round coefficients for training-round particles eliminates
this reconstruction loss. This is the single biggest improvement, giving
+3.11 points even without observation blending.

### 2. Higher SVD Rank (+0.87 on top of original coefficients)
Moving from rank=3 to rank=5 improves by ~0.9 points because the student's
regime prediction (which uses the SVD basis for dimensionality reduction)
becomes more accurate with more retained components.

### 3. Observation-Frequency Blending (+0.58)
Very conservative blending of model predictions with direct observation
frequencies (temperature=20). Each viewport observation provides a direct
sample from the year-50 distribution. Even with only 1-3 observations per
cell, this mild blend helps.

### 4. Lower Observation Weight (+0.27)
With more accurate teacher predictions from original coefficients, the
observation-likelihood reweighting should be lighter. q=2 outperforms q=8.

## Optimal Configuration
- **SVD rank**: r=5 (diminishing returns at r=6)
- **Observation weight**: q=2 (lighter is better with accurate teacher)
- **K neighbors**: k=5 (standard)
- **Ridge alpha**: l=32 (standard)
- **Mean weight**: m=70 (standard)
- **Obs blend temperature**: t=20 (standard from v11)
