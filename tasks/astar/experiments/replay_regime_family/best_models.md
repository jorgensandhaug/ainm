# Best Models

## Broad-Set Leader

- `hazard_posterior_v15_k5_r5_l32_m70_q8 + regime_probe_v1`
- benchmark: `dev_hazard_v15_r5_regime_probe_online50_v1`
- score: `83.1728`
- weighted KL: `0.063377`
- delta vs v8: **+3.98**

## Current Ranked Frontier (broad 8-round validation)

| rank | model | score | KL | delta vs v8 |
| --- | --- | ---: | ---: | ---: |
| 1 | v15 r5 q8 | **83.17** | 0.0634 | **+3.98** |
| 2 | v15 r4 q4 | 83.04 | 0.0640 | +3.84 |
| 3 | v15 r4 q8 | 82.97 | 0.0641 | +3.77 |
| 4 | v15 r4 q12 | 82.97 | 0.0641 | +3.77 |
| 5 | v15 r4 q2 | 82.94 | 0.0646 | +3.74 |
| 6 | v15 r3 q8 | 82.88 | 0.0644 | +3.68 |
| 7 | v16 r4 q8 (no obs blend) | 82.45 | 0.0667 | +3.25 |
| 8 | v16 r3 q8 (no obs blend) | 82.30 | 0.0671 | +3.11 |
| 9 | v11 t200 (obs blend only) | 79.94 | 0.0776 | +0.75 |
| 10 | v8 (reference) | 79.19 | 0.0814 | baseline |

## Key Innovation

The biggest single improvement (+3.0-3.5 points) comes from using
ORIGINAL per-round coefficients for training-round particles instead
of SVD-reconstructed ones. The rank-3 SVD loses ~13% of coefficient
variance; rank-5 captures ~97%.

## Axes Explored

- **SVD rank**: r3 < r4 < r5 (monotonically improves, testing r6)
- **Observation weight q**: q4 slightly better than q8 for r4; sweeping for r5
- **Observation blending**: +0.58 additional improvement (v15 vs v16)
- **Still running**: v15 r6, v15 r5 q4
