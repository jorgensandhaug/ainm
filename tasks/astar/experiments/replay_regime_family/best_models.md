# Best Models

| rank | model | benchmark | mode | policy | mean score | mean weighted KL | why it matters |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | `hazard_posterior_v4_k5_r3_l32_m70` | `probe_hazard_v4_k5_r3_l32_m70_regime_probe_3rounds_seed0to1` | online_interactive | `regime_probe_v1` | 78.4806 | 0.08367 | current hard-slice frontier; adaptive regime-disambiguation policy plus stronger v4 shrinkage is the strongest result so far |
| 2 | `hazard_posterior_v3_k5_r3_l16_m50` | `probe_hazard_v3_k5_r3_l16_m50_regime_probe_3rounds_seed0to1` | online_interactive | `regime_probe_v1` | 78.1285 | 0.08523 | shows the adaptive policy is family-level, not just a v4 quirk |
| 3 | `hazard_posterior_v4` | `probe_hazard_v4_k5_r3_l16_m50_regime_probe_3rounds_seed0to1` | online_interactive | `regime_probe_v1` | 77.6423 | 0.08739 | first adaptive-policy v4 result; large jump over static exploration |
| 4 | `hazard_posterior_v3_k5_r3_l16_m50` | `probe_hazard_v3_k5_r3_l16_m50_coverage_3rounds_seed0to1` | online_interactive | `coverage` | 76.8128 | 0.09041 | old hard-slice frontier before the adaptive-policy change |
| 5 | `hazard_posterior_v4` | `probe_hazard_v4_k5_r3_l16_m50_exploration_3rounds_seed0to1` | online_interactive | `exploration_v2` | 76.7472 | 0.09100 | best static-policy v4 result; useful comparator showing how much `regime_probe` adds |

Current caution:
- the first full 8-round multi-seed promotion that finished, `dev_hazard_v3_k5_r3_l16_m50_coverage_online50_v1`, scored only `72.3675 / 0.11438`
- hard-slice wins are therefore not enough; current frontier status is provisional until the in-flight full `regime_probe` promotions finish
