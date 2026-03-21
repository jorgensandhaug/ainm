event-regime-posterior-audit f1_event_regime_posterior_knn_rates_stress_b50s4_v01

dataset: f1_synthetic_live_coverage_b50_s4_v2
policy_name: coverage
budget: 50
samples_per_round: 4
k_neighbors: 7
target_family: rates
summary_feature_variant: stress_v1
rounds: 9
episodes: 36
aggregation_mode: equal_round_mean_primary
baseline_mae: 0.614106
knn_mae: 0.394337
mae_gain: 0.219769
baseline_mse: 0.876230
knn_mse: 0.398263
mse_gain: 0.477967
standardized_baseline_mae: 1.047355
standardized_knn_mae: 0.770769
standardized_mae_gain: 0.276586
standardized_baseline_mse: 2.545939
standardized_knn_mse: 1.339533
standardized_mse_gain: 1.206406

per_target:
- birth_logit_rate: baseline_mae=0.951700 knn_mae=0.536210 baseline_mse=1.634989 knn_mse=0.716550
- collapse_logit_rate: baseline_mae=0.276511 knn_mae=0.252464 baseline_mse=0.117471 knn_mse=0.079976

round_targets:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 birth_logit_rate=-5.168261 collapse_logit_rate=-2.449744
- round=36e581f1-73f8-453f-ab98-cbe3052b701b birth_logit_rate=-5.108557 collapse_logit_rate=-2.779424
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd birth_logit_rate=-5.077742 collapse_logit_rate=-2.768896
- round=76909e29-f664-4b2f-b16b-61b7507277e9 birth_logit_rate=-4.791287 collapse_logit_rate=-2.531727
- round=8e839974-b13b-407b-a5e7-fc749d877195 birth_logit_rate=-5.612119 collapse_logit_rate=-2.521813
- round=ae78003a-4efe-425a-881a-d16a39bca0ad birth_logit_rate=-4.393708 collapse_logit_rate=-2.249671
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 birth_logit_rate=-6.632458 collapse_logit_rate=-2.081950
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb birth_logit_rate=-8.362418 collapse_logit_rate=-1.774941
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b birth_logit_rate=-5.254034 collapse_logit_rate=-2.479651

per_round:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 episodes=4 baseline_mae=0.268507 knn_mae=0.196314 baseline_mse=0.119303 knn_mse=0.040811
- round=36e581f1-73f8-453f-ab98-cbe3052b701b episodes=4 baseline_mae=0.487535 knn_mae=0.160330 baseline_mse=0.241969 knn_mse=0.042020
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd episodes=4 baseline_mae=0.498947 knn_mae=0.235046 baseline_mse=0.256810 knn_mse=0.061663
- round=76909e29-f664-4b2f-b16b-61b7507277e9 episodes=4 baseline_mae=0.526670 knn_mae=0.226117 baseline_mse=0.424228 knn_mse=0.064605
- round=8e839974-b13b-407b-a5e7-fc749d877195 episodes=4 baseline_mae=0.072936 knn_mae=0.150329 baseline_mse=0.008845 knn_mse=0.031825
- round=ae78003a-4efe-425a-881a-d16a39bca0ad episodes=4 baseline_mae=0.765500 knn_mae=0.420218 baseline_mse=0.936042 knn_mse=0.186452
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 episodes=4 baseline_mae=0.761988 knn_mae=0.671439 baseline_mse=0.740190 knn_mse=0.562613
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb episodes=4 baseline_mae=1.907783 knn_mae=1.347852 baseline_mse=5.079310 knn_mse=2.574381
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b episodes=4 baseline_mae=0.237083 knn_mae=0.141390 baseline_mse=0.079374 knn_mse=0.019999
