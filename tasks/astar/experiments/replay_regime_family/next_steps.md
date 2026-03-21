# Next Steps

1. Finish the in-flight full 8-round multi-seed `regime_probe_posterior_blend` promotions:
   - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_posterior_blend_online50_v1`
   - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_posterior_blend_online50_v1`
2. Compare every finished broad result against:
   - `dev_hazard_v3_k5_r3_l16_m50_coverage_online50_v1` => `72.3675` / `0.114380`
   - `dev_query_residual_online50_v7` => `73.9505` / `0.106326`
   - use this to separate real generalization from hard-slice-only wins
3. Use the new 5-round broad-proxy slice as the default fast selector for the next sweep phase:
   - `71451d74-be9f-471f-aacd-a41f3b68a9cd`
   - `8e839974-b13b-407b-a5e7-fc749d877195`
   - `ae78003a-4efe-425a-881a-d16a39bca0ad`
   - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
4. On that proxy slice, sweep nearby posterior-blend configs around:
   - v3: `l16/m50`, `l24/m60`, `l32/m70`
   - v4: `l16/m50`, `l24/m60`, `l32/m70`
5. Analyze query traces for the new gain on `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`:
   - which windows change relative to `regime_probe_v1`
   - whether the improvement comes from altered repeats or altered seed allocation
