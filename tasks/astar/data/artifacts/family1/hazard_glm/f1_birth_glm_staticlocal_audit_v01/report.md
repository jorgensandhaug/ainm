birth-hazard-glm-audit f1_birth_glm_staticlocal_audit_v01

dataset: f1_birth_riskset_nr8_v1
rounds: 9
rows: 6789262
aggregation_mode: equal_round_mean_primary
weighted_positive_rate: 0.005238
round_mean_baseline_log_loss: 0.033968
round_mean_glm_log_loss: 0.031907
round_mean_log_loss_gain: 0.002060
round_mean_baseline_brier: 0.005384
round_mean_glm_brier: 0.005367
round_mean_brier_gain: 0.000017
pooled_baseline_log_loss: 0.033098
pooled_glm_log_loss: 0.030880
pooled_log_loss_gain: 0.002218
pooled_baseline_brier: 0.005214
pooled_glm_brier: 0.005194
pooled_brier_gain: 0.000020

notes:
- evaluation is leave-one-round-out on the weighted sampled birth risk set
- primary aggregate is equal-round mean because round is the statistical unit
- pooled weighted metrics are secondary diagnostics over the held-out risk-set population
- all positives are kept; negatives are deterministically downsampled and inverse-probability weighted

coefficients_z_scored_feature_space:
- intercept: -5.542076
- coast: 0.017109
- settlement_proximity: 0.216365
- maritime_access: -0.008346
- frontier_score: -0.007072
- forest_density: -0.006613
- mountain_density: 0.042140
- settlement_neighbors: 0.523637
- port_neighbors: 0.109900
- ruin_neighbors: 0.088632
- forest_neighbors: 0.020096
- current_is_forest: 0.011303

per_round:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 rows=96368 weight_sum=2026590.4 prev=0.005662 baseline_ll=0.034959 glm_ll=0.034428 gain=0.000531
- round=36e581f1-73f8-453f-ab98-cbe3052b701b rows=833184 weight_sum=17400245.7 prev=0.006008 baseline_ll=0.036793 glm_ll=0.031188 gain=0.005605
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd rows=842136 weight_sum=17521701.0 prev=0.006195 baseline_ll=0.037782 glm_ll=0.036854 gain=0.000928
- round=76909e29-f664-4b2f-b16b-61b7507277e9 rows=852436 weight_sum=17043721.3 prev=0.008233 baseline_ll=0.048706 glm_ll=0.048426 gain=0.000280
- round=8e839974-b13b-407b-a5e7-fc749d877195 rows=818204 weight_sum=17937254.8 prev=0.003640 baseline_ll=0.024422 glm_ll=0.023769 gain=0.000653
- round=ae78003a-4efe-425a-881a-d16a39bca0ad rows=894833 weight_sum=16627010.4 prev=0.012204 baseline_ll=0.070706 glm_ll=0.067525 gain=0.003181
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 rows=811748 weight_sum=18709090.4 prev=0.001315 baseline_ll=0.012601 glm_ll=0.011096 gain=0.001505
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb rows=805396 weight_sum=19016851.7 prev=0.000233 baseline_ll=0.007210 glm_ll=0.004822 gain=0.002388
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b rows=834957 weight_sum=17724203.7 prev=0.005199 baseline_ll=0.032530 glm_ll=0.029057 gain=0.003473
