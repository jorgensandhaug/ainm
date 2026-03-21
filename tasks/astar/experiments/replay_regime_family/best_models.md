# Best Models

## Broad-Set Leader

- `hazard_posterior_v15_k5_r5_l32_m70_q4 + regime_probe_v1`
- benchmark: `dev_hazard_v15_r5_q4_regime_probe_online50_v1`
- score: `83.3626`
- weighted KL: `0.062804`
- delta vs v8: **+4.17**

## Full Broad Ranking

| rank | model | score | KL |
| --- | --- | ---: | ---: |
| 1 | v15 r5 q4 | 83.36 | 0.0628 |
| 2 | v15 r5 q8 | 83.17 | 0.0634 |
| 3 | v15 r4 q4 | 83.04 | 0.0640 |
| 4 | v15 r4 q8 | 82.97 | 0.0641 |
| 5 | v15 r3 q8 | 82.88 | 0.0644 |
| 6 | v16 r4 q8 (no obs blend) | 82.45 | 0.0667 |
| 7 | v16 r3 q8 (no obs blend) | 82.30 | 0.0671 |
| 8 | v11 t200 (obs blend only) | 79.94 | 0.0776 |
| 9 | v8 (reference) | 79.19 | 0.0814 |
