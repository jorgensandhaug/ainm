# Next Steps

1. Treat `hazard_posterior_v7` as the current mainline family.
   - broad leader: `dev_hazard_v7_k5_r3_l32_m70_q8_regime_probe_online50_v1` => `78.6590` / `0.083821`
   - proxy leader: `proxy5_hazard_v7_k5_r3_l32_m70_q4_regime_probe_posterior_blend_seed0to1` => `77.2677` / `0.088458`
2. Finish the active `v8` score-aware class-weighted posterior test before changing teacher families again.
   - running:
     - `proxy5_hazard_v8_k5_r3_l32_m70_q8_regime_probe_seed0to1`
   - goal:
     - determine whether entropy-conditioned class weighting can beat the new `v7` broad/proxy anchors
3. Keep the 5-round proxy slice as the default fast selector for any further replay-regime work:
   - `71451d74-be9f-471f-aacd-a41f3b68a9cd`
   - `8e839974-b13b-407b-a5e7-fc749d877195`
   - `ae78003a-4efe-425a-881a-d16a39bca0ad`
   - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
4. For posterior-blend variants, bias future sweeps toward softer observation reweighting.
   - `q4` beat both `q8` and `q12` on proxy-5
   - do not spend immediate budget on larger `q` without another structural change
5. Do not return to `v5`/global-mixture teacher sweeps without a structural rewrite.
   - best finished proxy-5 result is still only `73.6657` / `0.109230`
   - if mixture is revisited, change the decoder/teacher coupling materially rather than sweeping nearby hyperparameters
6. Next likely post-`v8` axes if `v8` fails:
   - settlement-mark-aware observation encoding in the posterior student
   - stronger but still conservative posterior-aware policies built on the new `v7` posterior state
   - class-aware calibration/floors on the final tensor, matched to entropy-weighted KL
