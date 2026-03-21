event-regime-posterior-audit f1_event_regime_posterior_knn_collapse_timing_stress_feat_b50s4_v01

dataset: f1_synthetic_live_coverage_b50_s4_v2
policy_name: coverage
budget: 50
samples_per_round: 4
k_neighbors: 7
target_family: collapse_timing_stress
summary_feature_variant: stress_v1
rounds: 9
episodes: 36
aggregation_mode: equal_round_mean_primary
baseline_mae: 0.871813
knn_mae: 0.508420
mae_gain: 0.363393
baseline_mse: 4.870875
knn_mse: 2.254177
mse_gain: 2.616699
standardized_baseline_mae: 1.053447
standardized_knn_mae: 0.895097
standardized_mae_gain: 0.158350
standardized_baseline_mse: 2.468672
standardized_knn_mse: 1.828390
standardized_mse_gain: 0.640282

per_target:
- collapse_logit_rate: baseline_mae=0.276511 knn_mae=0.252464 baseline_mse=0.117471 knn_mse=0.079976
- collapse_mean_year: baseline_mae=4.496890 knn_mae=2.334828 baseline_mse=36.585243 knn_mse=16.724311
- collapse_std_year: baseline_mae=0.715078 knn_mae=0.557553 baseline_mse=0.837888 knn_mse=0.582673
- collapse_early_share_logit: baseline_mae=0.676783 knn_mae=0.341707 baseline_mse=0.753232 knn_mse=0.276479
- collapse_late_share_logit: baseline_mae=0.584745 knn_mae=0.324065 baseline_mse=0.646949 knn_mse=0.333250
- collapse_food_before_mean: baseline_mae=0.047181 knn_mae=0.069717 baseline_mse=0.003120 knn_mse=0.005990
- collapse_defense_before_mean: baseline_mae=0.063232 knn_mae=0.062776 baseline_mse=0.005966 knn_mse=0.006861
- collapse_population_before_mean: baseline_mae=0.114082 knn_mae=0.124248 baseline_mse=0.017135 knn_mse=0.023875

round_targets:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 collapse_logit_rate=-2.449744 collapse_mean_year=32.341514 collapse_std_year=12.587343 collapse_early_share_logit=-2.014139 collapse_late_share_logit=0.069207 collapse_food_before_mean=0.532515 collapse_defense_before_mean=0.372898 collapse_population_before_mean=0.949120
- round=36e581f1-73f8-453f-ab98-cbe3052b701b collapse_logit_rate=-2.779424 collapse_mean_year=31.595270 collapse_std_year=12.547548 collapse_early_share_logit=-2.045499 collapse_late_share_logit=-0.094697 collapse_food_before_mean=0.472932 collapse_defense_before_mean=0.470654 collapse_population_before_mean=0.987080
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd collapse_logit_rate=-2.768896 collapse_mean_year=33.725843 collapse_std_year=12.067087 collapse_early_share_logit=-2.353752 collapse_late_share_logit=0.239172 collapse_food_before_mean=0.597511 collapse_defense_before_mean=0.255427 collapse_population_before_mean=0.712859
- round=76909e29-f664-4b2f-b16b-61b7507277e9 collapse_logit_rate=-2.531727 collapse_mean_year=33.362230 collapse_std_year=12.229335 collapse_early_share_logit=-2.248651 collapse_late_share_logit=0.169832 collapse_food_before_mean=0.593447 collapse_defense_before_mean=0.269428 collapse_population_before_mean=0.661312
- round=8e839974-b13b-407b-a5e7-fc749d877195 collapse_logit_rate=-2.521813 collapse_mean_year=30.142109 collapse_std_year=13.582475 collapse_early_share_logit=-1.612828 collapse_late_share_logit=-0.180518 collapse_food_before_mean=0.608968 collapse_defense_before_mean=0.335107 collapse_population_before_mean=0.810394
- round=ae78003a-4efe-425a-881a-d16a39bca0ad collapse_logit_rate=-2.249671 collapse_mean_year=34.495094 collapse_std_year=11.397664 collapse_early_share_logit=-2.604093 collapse_late_share_logit=0.300604 collapse_food_before_mean=0.477402 collapse_defense_before_mean=0.284561 collapse_population_before_mean=0.860040
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 collapse_logit_rate=-2.081950 collapse_mean_year=25.291433 collapse_std_year=14.304897 collapse_early_share_logit=-0.960487 collapse_late_share_logit=-0.771396 collapse_food_before_mean=0.537410 collapse_defense_before_mean=0.386504 collapse_population_before_mean=1.009058
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb collapse_logit_rate=-1.774941 collapse_mean_year=16.499850 collapse_std_year=12.239963 collapse_early_share_logit=0.033283 collapse_late_share_logit=-2.104739 collapse_food_before_mean=0.488450 collapse_defense_before_mean=0.327417 collapse_population_before_mean=0.950483
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b collapse_logit_rate=-2.479651 collapse_mean_year=31.551450 collapse_std_year=12.937567 collapse_early_share_logit=-1.935323 collapse_late_share_logit=-0.044653 collapse_food_before_mean=0.525739 collapse_defense_before_mean=0.250531 collapse_population_before_mean=0.798673

per_round:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 episodes=4 baseline_mae=0.465010 knn_mae=0.103573 baseline_mse=0.983036 knn_mse=0.021152
- round=36e581f1-73f8-453f-ab98-cbe3052b701b episodes=4 baseline_mae=0.420852 knn_mae=0.218980 baseline_mse=0.509569 knn_mse=0.109276
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd episodes=4 baseline_mae=0.869255 knn_mae=0.209836 baseline_mse=2.507619 knn_mse=0.117524
- round=76909e29-f664-4b2f-b16b-61b7507277e9 episodes=4 baseline_mae=0.742132 knn_mae=0.359814 baseline_mse=2.016391 knn_mse=0.307302
- round=8e839974-b13b-407b-a5e7-fc749d877195 episodes=4 baseline_mae=0.232108 knn_mae=0.276112 baseline_mse=0.153788 knn_mse=0.169124
- round=ae78003a-4efe-425a-881a-d16a39bca0ad episodes=4 baseline_mae=1.061020 knn_mae=0.392399 baseline_mse=3.777448 knn_mse=0.310473
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 episodes=4 baseline_mae=1.134776 knn_mae=0.929822 baseline_mse=3.934235 knn_mse=2.975220
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb episodes=4 baseline_mae=2.558275 knn_mae=2.030437 baseline_mse=29.490254 knn_mse=16.273017
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b episodes=4 baseline_mae=0.362886 knn_mae=0.054804 baseline_mse=0.465540 knn_mse=0.004503
