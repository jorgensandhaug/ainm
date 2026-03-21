# Next Steps

1. Treat `hazard_posterior_v8` as the current mainline family.
   - completed broad leader: `dev_hazard_v8_k5_r3_l32_m70_q8_regime_probe_online50_v1` => `79.1946` / `0.081417`
   - completed proxy leader: `proxy5_hazard_v8_k5_r3_l32_m70_q8_regime_probe_seed0to1` => `78.4582` / `0.082918`
2. Do not broad-promote the first `v9` attention transcript encoder.
   - `u6`: `76.6165` / `0.091134`
   - `u10`: `76.2613` / `0.092625`
   - both are materially below `v8`
3. Next immediate sweep should stay inside the now-winning `v8` family:
   - observation-weight sweep under `regime_probe_v1`: `q4`, `q8`, `q12`
   - then, only if proxy improves, test `regime_probe_posterior_blend_v1` on the strongest `v8` setting
4. Keep the 5-round proxy slice as the default fast selector for any further replay-regime work:
   - `71451d74-be9f-471f-aacd-a41f3b68a9cd`
   - `8e839974-b13b-407b-a5e7-fc749d877195`
   - `ae78003a-4efe-425a-881a-d16a39bca0ad`
   - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
5. For posterior-blend variants, bias future sweeps toward softer observation reweighting.
   - `q4` beat both `q8` and `q12` on proxy-5
   - do not spend immediate budget on larger `q` without another structural change
6. Do not return to `v5`/global-mixture teacher sweeps without a structural rewrite.
   - best finished proxy-5 result is still only `73.6657` / `0.109230`
   - if mixture is revisited, change the decoder/teacher coupling materially rather than sweeping nearby hyperparameters
7. Next likely post-`v8` axes if the tuned `v8` sweep stalls:
   - settlement-mark-aware observation encoding beyond the current feature-stat summary
   - stronger but still conservative posterior-aware policies built on the new `v8`/`v9` posterior state
   - class-aware calibration/floors on the final tensor, matched to entropy-weighted KL
