hazard-glm-audit f1_collapse_glm_observed_audit_v01

event_type: collapse
feature_profile: observed
dataset: f1_collapse_riskset_nr8_v1
rounds: 9
rows: 8478769
aggregation_mode: equal_round_mean_primary
weighted_positive_rate: 0.077401
round_mean_baseline_log_loss: 0.294123
round_mean_glm_log_loss: 0.293948
round_mean_log_loss_gain: 0.000174
round_mean_baseline_brier: 0.078708
round_mean_glm_brier: 0.078660
round_mean_brier_gain: 0.000048
pooled_baseline_log_loss: 0.273039
pooled_glm_log_loss: 0.271575
pooled_log_loss_gain: 0.001464
pooled_baseline_brier: 0.071504
pooled_glm_brier: 0.071296
pooled_brier_gain: 0.000208

notes:
- evaluation is leave-one-round-out on the weighted sampled collapse risk set
- observed collapse feature set removes hidden settlement-state columns and keeps only structural context visible in replay frames and approximable in live-safe models
- primary aggregate is equal-round mean because round is the statistical unit
- pooled weighted metrics are secondary diagnostics over the held-out risk-set population
- all positives are kept; negatives are deterministically downsampled and inverse-probability weighted

coefficients_z_scored_feature_space:
- intercept: -2.498314
- coast: -0.080414
- settlement_proximity: -0.126943
- maritime_access: 0.060785
- frontier_score: 0.038015
- forest_density: 0.006379
- mountain_density: 0.013613
- settlement_neighbors: -0.090712
- port_neighbors: -0.066462
- ruin_neighbors: 0.095755
- forest_neighbors: -0.018768
- current_is_port: -0.075033

per_round:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 rows=130151 weight_sum=186653.9 prev=0.079457 baseline_ll=0.277472 glm_ll=0.277796 gain=-0.000324
- round=36e581f1-73f8-453f-ab98-cbe3052b701b rows=1339167 weight_sum=1939764.6 prev=0.058446 baseline_ll=0.226424 glm_ll=0.225080 gain=0.001344
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd rows=1227895 weight_sum=1778095.7 prev=0.059028 baseline_ll=0.227706 glm_ll=0.225806 gain=0.001900
- round=76909e29-f664-4b2f-b16b-61b7507277e9 rows=1456345 weight_sum=2094314.7 prev=0.073664 baseline_ll=0.263158 glm_ll=0.261664 gain=0.001494
- round=8e839974-b13b-407b-a5e7-fc749d877195 rows=852252 weight_sum=1225197.8 prev=0.074343 baseline_ll=0.264813 glm_ll=0.265181 gain=-0.000368
- round=ae78003a-4efe-425a-881a-d16a39bca0ad rows=1821859 weight_sum=2593317.0 prev=0.095378 baseline_ll=0.318360 glm_ll=0.314285 gain=0.004076
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 rows=393368 weight_sum=555908.3 prev=0.110864 baseline_ll=0.356078 glm_ll=0.356184 gain=-0.000106
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb rows=165726 weight_sum=230554.3 prev=0.144929 baseline_ll=0.440977 glm_ll=0.447561 gain=-0.006584
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b rows=1092006 weight_sum=1567679.0 prev=0.077297 baseline_ll=0.272118 glm_ll=0.271978 gain=0.000139
