# Best Models

## Broad-Set Leader

- `hazard_posterior_v15_k5_r5_l32_m70_q2 + regime_probe_v1`
- score: `83.4413` / KL `0.062609`
- delta vs v8: **+4.25**

## Full Broad Ranking

| rank | model | score | KL |
| --- | --- | ---: | ---: |
| 1 | v15 r5 q2 | **83.44** | 0.0626 |
| 2 | v15 r5 q4 | 83.36 | 0.0628 |
| 3 | v15 r6 q8 | 83.31 | 0.0629 |
| 4 | v15 r5 q6 | 83.21 | 0.0633 |
| 5 | v15 r5 q8 | 83.17 | 0.0634 |
| 6 | v15 r4 q4 | 83.04 | 0.0640 |
| 7 | v15 r4 q8 | 82.97 | 0.0641 |
| 8 | v15 r3 q8 | 82.88 | 0.0644 |
| 9 | v16 r4 q8 (no obs blend) | 82.45 | 0.0667 |
| 10 | v8 (reference) | 79.19 | 0.0814 |

## Key Axes

- **Rank**: r5 > r4 > r3, r6 comparable to r5 (diminishing returns)
- **Obs weight q**: q2 > q4 > q6 > q8 (lighter reweighting better with original coefficients)
- **Obs blending**: +0.5-0.7 points consistently (v15 vs v16)
- **Still sweeping**: r5 q1
