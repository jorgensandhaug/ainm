# Best Models

## Current Leader

- `hazard_posterior_v15_k5_r5_l1_m20_q1 + regime_probe_v1`
- score: `83.9502` / KL `0.060961`
- delta vs v8: **+4.76**

## Configuration Sweep Summary

| rank | config | score |
| --- | --- | ---: |
| 1 | r5 l1 m20 q1 | **83.95** |
| 2 | r5 m20 q1 (l32) | 83.89 |
| 3 | r5 l1 m20 q2 | 83.84 |
| 4 | r5 l4 m20 q2 | 83.84 |
| 5 | r5 m20 q2 (l32) | 83.80 |
| 6 | r5 m30 q2 | 83.79 |
| 7 | r5 m40 q2 | 83.74 |
| 8 | v8 (reference) | 79.19 |

## Cross-Agent Intelligence Applied
- Agent7's calibration (no prior blend): does NOT transfer (-0.26)
- Agent7's low ridge insight: DOES transfer (+0.04)
- Agent3's CatBoost approach: not yet tested
