# Best Models

## Broad-Set Leader

- `hazard_posterior_v7_k5_r3_l32_m70_q8 + regime_probe_v1`
- benchmark: `dev_hazard_v7_k5_r3_l32_m70_q8_regime_probe_online50_v1`
- score: `78.6590`
- weighted KL: `0.083821`
- why it matters:
  - first particle-refined posterior family that clearly transfers on the full 8-round multi-seed validation
  - beats prior broad leader `v4 l32/m70 + regime_probe_v1` by `+1.9529` score and `-0.008415` weighted KL

## Proxy Leader

- `hazard_posterior_v8_k5_r3_l32_m70_q8 + regime_probe_v1`
- benchmark: `proxy5_hazard_v8_k5_r3_l32_m70_q8_regime_probe_seed0to1`
- score: `78.4582`
- weighted KL: `0.082918`
- why it matters:
  - current best finished fast-selector result by a large margin
  - beats prior proxy leader `v7 q4 + regime_probe_posterior_blend_v1` by `+1.1905` score and `-0.005541` weighted KL

## Current Ranked Frontier

| rank | model | benchmark | mode | policy | mean score | mean weighted KL | why it matters |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | `hazard_posterior_v7_k5_r3_l32_m70_q8` | `dev_hazard_v7_k5_r3_l32_m70_q8_regime_probe_online50_v1` | online_interactive | `regime_probe_v1` | 78.6590 | 0.08382 | strongest completed broad validation; current mainline |
| 2 | `hazard_posterior_v8_k5_r3_l32_m70_q8` | `proxy5_hazard_v8_k5_r3_l32_m70_q8_regime_probe_seed0to1` | online_interactive | `regime_probe_v1` | 78.4582 | 0.08292 | new proxy leader; class-aware particle likelihood is a large win |
| 3 | `hazard_posterior_v7_k5_r3_l32_m70_q4` | `proxy5_hazard_v7_k5_r3_l32_m70_q4_regime_probe_posterior_blend_seed0to1` | online_interactive | `regime_probe_posterior_blend_v1` | 77.2677 | 0.08846 | best finished posterior-blend proxy result; softer observation reweighting helps |
| 4 | `hazard_posterior_v7_k5_r3_l32_m70_q8` | `proxy5_hazard_v7_k5_r3_l32_m70_q8_regime_probe_seed0to1` | online_interactive | `regime_probe_v1` | 76.9238 | 0.08981 | first near-frontier v7 result that justified broad promotion |
| 5 | `hazard_posterior_v4_k5_r3_l32_m70` | `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1` | online_interactive | `regime_probe_v1` | 76.7061 | 0.09224 | previous broad leader; still the best completed non-v7/v8 broad comparator |

Current caution:

- the old 3-round hard slice is still useful for discovery, but it is no longer the decisive selector
- `v3 + regime_probe_posterior_blend_v1` stayed a hard-slice win and failed to produce a meaningful broad gain
- current active challenge is not to find another hard-slice spike, but to see whether the new `v8` proxy jump survives the full 8-round set and whether `v9` can beat it
