# Next Steps

1. Do not broad-promote `hazard_posterior_v5` in its current form.
   - best finished proxy-5 result is only `73.6657` / `0.109230` (`k5 c4 r1`)
   - current proxy leader remains `77.1302` / `0.089726`
2. Keep the 5-round proxy slice as the default fast selector for any further replay-regime work:
   - `71451d74-be9f-471f-aacd-a41f3b68a9cd`
   - `8e839974-b13b-407b-a5e7-fc749d877195`
   - `ae78003a-4efe-425a-881a-d16a39bca0ad`
   - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
   - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
3. If mixture structure is revisited, change the structure materially rather than sweeping more v5 hyperparameters:
   - block-structured mechanism latents instead of one global prototype mixture
   - prototype-specific decoders or residual blocks instead of one shared linear decoder
   - teacher/decoder calibration matched to the mixture, not just the old refined student on a new latent
4. Finish/compare any still-in-flight broad or proxy results from older strong families against:
   - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1` => `76.7061` / `0.092236`
   - `proxy5_hazard_v3_k5_r3_l32_m70_regime_probe_posterior_blend_seed0to1` => `77.1302` / `0.089726`
5. Analyze why the coefficient-bank mixture signal does not transfer online:
   - does the student fail to infer the mixture weights?
   - does the decoder wash out prototype differences at year 50?
   - are prototype gains concentrated in coefficient directions that the KL scorer barely weights?
6. Finish the active `v7` sweep before committing to the next family pivot:
   - finished so far:
     - `hazard_posterior_v7_k5_r3_l32_m70_q8 + regime_probe_v1` => `76.9238` / `0.089809`
   - still running:
     - `q4/q8/q12 + regime_probe_posterior_blend`
     - `q8 + regime_probe_information`
     - `v4 l32/m70 + regime_probe_information`
     - full promotion `dev_hazard_v7_k5_r3_l32_m70_q8_regime_probe_online50_v1`
7. If `v7` broad promotion holds up, next scale-up should focus on:
   - settlement-mark-aware observation refinement, not more raw teacher sweeps
   - more principled posterior-information query policies if the new information policy beats `regime_probe_v1`
