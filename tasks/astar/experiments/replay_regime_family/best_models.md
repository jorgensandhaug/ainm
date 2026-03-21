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

- `hazard_posterior_v7_k5_r3_l32_m70_q4 + regime_probe_posterior_blend_v1`
- benchmark: `proxy5_hazard_v7_k5_r3_l32_m70_q4_regime_probe_posterior_blend_seed0to1`
- score: `77.2677`
- weighted KL: `0.088458`
- why it matters:
  - current best finished fast-selector result
  - beats prior proxy leader `v3 l32/m70 + regime_probe_posterior_blend_v1` by `+0.1375` score and `-0.001268` weighted KL

## Current Ranked Frontier

| rank | model | benchmark | mode | policy | mean score | mean weighted KL | why it matters |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | `hazard_posterior_v7_k5_r3_l32_m70_q8` | `dev_hazard_v7_k5_r3_l32_m70_q8_regime_probe_online50_v1` | online_interactive | `regime_probe_v1` | 78.6590 | 0.08382 | strongest completed broad validation; current mainline |
| 2 | `hazard_posterior_v7_k5_r3_l32_m70_q4` | `proxy5_hazard_v7_k5_r3_l32_m70_q4_regime_probe_posterior_blend_seed0to1` | online_interactive | `regime_probe_posterior_blend_v1` | 77.2677 | 0.08846 | best finished proxy result; softer observation reweighting improves posterior-blend |
| 3 | `hazard_posterior_v7_k5_r3_l32_m70_q8` | `proxy5_hazard_v7_k5_r3_l32_m70_q8_regime_probe_seed0to1` | online_interactive | `regime_probe_v1` | 76.9238 | 0.08981 | first near-frontier v7 result that justified broad promotion |
| 4 | `hazard_posterior_v4_k5_r3_l32_m70` | `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1` | online_interactive | `regime_probe_v1` | 76.7061 | 0.09224 | previous broad leader; still the best completed non-v7 broad comparator |
| 5 | `hazard_posterior_v3_k5_r3_l16_m50` | `probe_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_3rounds_seed0to1` | online_interactive | `regime_probe_posterior_blend_v1` | 78.9616 | 0.08175 | strongest old hard-slice frontier, but not trusted over the broader selectors |

Current caution:

- the old 3-round hard slice is still useful for discovery, but it is no longer the decisive selector
- `v3 + regime_probe_posterior_blend_v1` stayed a hard-slice win and failed to produce a meaningful broad gain
- current active challenge is not to find another hard-slice spike, but to beat the new `v7` broad leader on proxy-5 and then on the full 8-round set
