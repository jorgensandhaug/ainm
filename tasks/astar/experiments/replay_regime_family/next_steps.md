# Next Steps

1. Finish the in-flight full 8-round multi-seed `regime_probe_posterior_blend` promotions:
   - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_online50_v1`
   - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_blend_online50_v1`
2. Keep the older in-flight comparators running to contextualize the new broad results:
   - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_online50_v1`
   - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_online50_v1`
   - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1`
   - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_online50_v1`
   - `dev_hazard_v4_k5_r3_l16_m50_exploration_online50_v1`
3. Compare every finished broad result against the known full-round failure case:
   - `dev_hazard_v3_k5_r3_l16_m50_coverage_online50_v1` => `72.3675` / `0.114380`
   - use this to separate real generalization from hard-slice-only wins
4. If the blend policy survives full validation, center the next sweep around:
   - policy weights inside `regime_probe_posterior_blend`
   - nearby shrinkage/mix settings around `v3 l16/m50` and `v4 l32/m70`
5. Analyze query traces for the new gain on `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`:
   - which windows change relative to `regime_probe_v1`
   - whether the improvement comes from altered repeats or altered seed allocation
