# Best Models

| rank | model | benchmark | mode | policy | mean score | mean weighted KL | why it matters |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | `hazard_posterior_v3_k5_r3_l16_m50` | `probe_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_3rounds_seed0to1` | online_interactive | `regime_probe_posterior_blend_v1` | 78.9616 | 0.08175 | current hard-slice frontier; conservative posterior-aware querying fixes the additive-policy instability and produces the biggest jump on `fd3c...` |
| 2 | `hazard_posterior_v4_k5_r3_l32_m70` | `probe_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_blend_3rounds_seed0to1` | online_interactive | `regime_probe_posterior_blend_v1` | 78.8435 | 0.08217 | strongest v4 result so far; posterior-aware blend improves the prior v4 frontier without hurting the other two hard rounds materially |
| 3 | `hazard_posterior_v4_k5_r3_l32_m70` | `probe_hazard_v4_k5_r3_l32_m70_regime_probe_3rounds_seed0to1` | online_interactive | `regime_probe_v1` | 78.4806 | 0.08367 | previous hard-slice frontier; still the best observation-only adaptive policy result |
| 4 | `hazard_posterior_v3_k5_r3_l16_m50` | `probe_hazard_v3_k5_r3_l16_m50_regime_probe_3rounds_seed0to1` | online_interactive | `regime_probe_v1` | 78.1285 | 0.08523 | best non-posterior v3 result; useful comparator showing how much the new posterior-blend policy adds |
| 5 | `hazard_posterior_v4` | `probe_hazard_v4_k5_r3_l16_m50_regime_probe_posterior_blend_3rounds_seed0to1` | online_interactive | `regime_probe_posterior_blend_v1` | 77.8513 | 0.08653 | confirms the posterior-blend gain is not just the stronger-shrinkage v4 config |

Current caution:
- the first full 8-round multi-seed promotion that finished, `dev_hazard_v3_k5_r3_l16_m50_coverage_online50_v1`, scored only `72.3675 / 0.11438`
- hard-slice wins are therefore not enough; current frontier status is provisional until the in-flight full `regime_probe_posterior_blend` promotions finish

Current broad-set leader already completed:
- `hazard_posterior_v4_k5_r3_l32_m70 + regime_probe_v1`
- benchmark: `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1`
- score: `76.7061`
- weighted KL: `0.092236`

Broad-set caution update:
- `hazard_posterior_v3_k5_r3_l16_m50 + regime_probe_posterior_blend_v1`
- benchmark: `dev_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_online50_v1`
- score: `75.0272`
- weighted KL: `0.100043`
- vs `v3 + regime_probe_v1`: score `-0.0219`, weighted KL `-0.000086`
- implication: the hard-slice posterior-blend win does not materially transfer on the broad set for v3
