event-regime-posterior-audit f1_event_regime_posterior_knn_rates_law_resid1_stress_b50s4_v01

dataset: f1_synthetic_live_coverage_b50_s4_v2__cfg_5a44a494b751
policy_name: coverage
budget: 50
samples_per_round: 4
k_neighbors: 7
target_family: rates_law_resid1
summary_feature_variant: stress_v1
rounds: 8
episodes: 32
aggregation_mode: equal_round_mean_primary
baseline_mae: 1.932730
knn_mae: 2.044241
mae_gain: -0.111511
baseline_mse: 8.740157
knn_mse: 11.954219
mse_gain: -3.214062
standardized_baseline_mae: 1.244152
standardized_knn_mae: 1.117313
standardized_mae_gain: 0.126839
standardized_baseline_mse: 2.691201
standardized_knn_mse: 2.311642
standardized_mse_gain: 0.379558

per_target:
- birth_logit_rate: baseline_mae=1.053370 knn_mae=0.545305 baseline_mse=1.863972 knn_mse=0.773571
- collapse_logit_rate: baseline_mae=0.311133 knn_mae=0.262560 baseline_mse=0.136003 knn_mse=0.088080
- law_resid_1: baseline_mae=4.433687 knn_mae=5.324857 baseline_mse=24.220497 knn_mse=35.001006

round_targets:
- round=36e581f1-73f8-453f-ab98-cbe3052b701b birth_logit_rate=-5.108557 collapse_logit_rate=-2.779424 law_resid_1=-6.853227
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd birth_logit_rate=-5.077742 collapse_logit_rate=-2.768896 law_resid_1=3.200166
- round=76909e29-f664-4b2f-b16b-61b7507277e9 birth_logit_rate=-4.791287 collapse_logit_rate=-2.531727 law_resid_1=2.552976
- round=8e839974-b13b-407b-a5e7-fc749d877195 birth_logit_rate=-5.612119 collapse_logit_rate=-2.521813 law_resid_1=4.165840
- round=ae78003a-4efe-425a-881a-d16a39bca0ad birth_logit_rate=-4.393708 collapse_logit_rate=-2.249671 law_resid_1=-8.659607
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 birth_logit_rate=-6.632458 collapse_logit_rate=-2.081950 law_resid_1=2.980804
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb birth_logit_rate=-8.362418 collapse_logit_rate=-1.774941 law_resid_1=-4.926752
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b birth_logit_rate=-5.254034 collapse_logit_rate=-2.479651 law_resid_1=-2.130122

per_round:
- round=36e581f1-73f8-453f-ab98-cbe3052b701b episodes=4 baseline_mae=2.637323 knn_mae=2.906484 baseline_mse=15.848292 knn_mse=23.777910
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd episodes=4 baseline_mae=1.427364 knn_mae=0.972440 baseline_mse=3.618010 knn_mse=2.039438
- round=76909e29-f664-4b2f-b16b-61b7507277e9 episodes=4 baseline_mae=1.230410 knn_mae=1.884468 baseline_mse=2.504356 knn_mse=9.750862
- round=8e839974-b13b-407b-a5e7-fc749d877195 episodes=4 baseline_mae=1.451556 knn_mae=1.901992 baseline_mse=5.792125 knn_mse=10.160738
- round=ae78003a-4efe-425a-881a-d16a39bca0ad episodes=4 baseline_mae=3.423363 knn_mae=3.458435 baseline_mse=25.697473 knn_mse=30.244642
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 episodes=4 baseline_mae=1.486926 knn_mae=0.885102 baseline_mse=3.422143 knn_mse=0.950902
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb episodes=4 baseline_mae=2.911563 knn_mae=2.597413 baseline_mse=11.453856 knn_mse=10.490597
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b episodes=4 baseline_mae=0.893335 knn_mae=1.747593 baseline_mse=1.585002 knn_mse=8.218663
