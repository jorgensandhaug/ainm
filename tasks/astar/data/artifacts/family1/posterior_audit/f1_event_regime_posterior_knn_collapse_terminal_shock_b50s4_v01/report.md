event-regime-posterior-audit f1_event_regime_posterior_knn_collapse_terminal_shock_b50s4_v01

dataset: f1_synthetic_live_coverage_b50_s4_v2
policy_name: coverage
budget: 50
samples_per_round: 4
k_neighbors: 7
target_family: collapse_terminal_shock
summary_feature_variant: basic
rounds: 8
episodes: 32
aggregation_mode: equal_round_mean_primary
baseline_mae: 0.266278
knn_mae: 0.173729
mae_gain: 0.092549
baseline_mse: 0.384364
knn_mse: 0.178749
mse_gain: 0.205615
standardized_baseline_mae: 1.056946
standardized_knn_mae: 0.782003
standardized_mae_gain: 0.274943
standardized_baseline_mse: 2.073391
standardized_knn_mse: 1.210615
standardized_mse_gain: 0.862775

per_target:
- collapse_logit_rate: baseline_mae=0.311133 knn_mae=0.289262 baseline_mse=0.136003 knn_mse=0.099033
- collapse_port_gap_logit: baseline_mae=0.276869 knn_mae=0.219303 baseline_mse=0.101093 knn_mse=0.061084
- collapse_food_gap_z: baseline_mae=0.146210 knn_mae=0.134979 baseline_mse=0.029149 knn_mse=0.028096
- collapse_defense_gap_z: baseline_mae=0.170322 knn_mae=0.165385 baseline_mse=0.037880 knn_mse=0.045503
- collapse_timing_skew: baseline_mae=1.359763 knn_mae=0.687809 baseline_mse=3.143405 knn_mse=1.372307
- ruin_buildable_mean: baseline_mae=0.007574 knn_mae=0.005950 baseline_mse=0.000110 knn_mse=0.000054
- ruin_coast_mean: baseline_mae=0.005642 knn_mae=0.004844 baseline_mse=0.000060 knn_mse=0.000033
- port_coast_mean: baseline_mae=0.039040 knn_mae=0.019397 baseline_mse=0.002237 knn_mse=0.000467
- live_buildable_mean: baseline_mae=0.079945 knn_mae=0.036629 baseline_mse=0.009344 knn_mse=0.002165

round_targets:
- round=36e581f1-73f8-453f-ab98-cbe3052b701b collapse_logit_rate=-2.779424 collapse_port_gap_logit=0.205230 collapse_food_gap_z=-0.755567 collapse_defense_gap_z=-0.180295 collapse_timing_skew=-1.950802 ruin_buildable_mean=0.011337 ruin_coast_mean=0.007164 port_coast_mean=0.065151 live_buildable_mean=0.164849
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd collapse_logit_rate=-2.768896 collapse_port_gap_logit=0.690029 collapse_food_gap_z=-0.560917 collapse_defense_gap_z=-0.526392 collapse_timing_skew=-2.592923 ruin_buildable_mean=0.012791 ruin_coast_mean=0.008580 port_coast_mean=0.096754 live_buildable_mean=0.178244
- round=76909e29-f664-4b2f-b16b-61b7507277e9 collapse_logit_rate=-2.531727 collapse_port_gap_logit=0.762701 collapse_food_gap_z=-0.463111 collapse_defense_gap_z=-0.686171 collapse_timing_skew=-2.418483 ruin_buildable_mean=0.019313 ruin_coast_mean=0.013559 port_coast_mean=0.095034 live_buildable_mean=0.213512
- round=8e839974-b13b-407b-a5e7-fc749d877195 collapse_logit_rate=-2.521813 collapse_port_gap_logit=0.329000 collapse_food_gap_z=-0.594881 collapse_defense_gap_z=-0.401989 collapse_timing_skew=-1.432309 ruin_buildable_mean=0.009571 ruin_coast_mean=0.007230 port_coast_mean=0.041284 live_buildable_mean=0.101869
- round=ae78003a-4efe-425a-881a-d16a39bca0ad collapse_logit_rate=-2.249671 collapse_port_gap_logit=0.620187 collapse_food_gap_z=-0.526740 collapse_defense_gap_z=-0.576159 collapse_timing_skew=-2.904697 ruin_buildable_mean=0.032734 ruin_coast_mean=0.023836 port_coast_mean=0.126010 live_buildable_mean=0.269625
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 collapse_logit_rate=-2.081950 collapse_port_gap_logit=0.015400 collapse_food_gap_z=-0.742619 collapse_defense_gap_z=-0.237101 collapse_timing_skew=-0.189090 ruin_buildable_mean=0.004393 ruin_coast_mean=0.002655 port_coast_mean=0.006611 live_buildable_mean=0.027155
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb collapse_logit_rate=-1.774941 collapse_port_gap_logit=-0.010275 collapse_food_gap_z=-0.959100 collapse_defense_gap_z=-0.243897 collapse_timing_skew=2.138021 ruin_buildable_mean=0.000613 ruin_coast_mean=0.000232 port_coast_mean=0.000382 live_buildable_mean=0.002812
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b collapse_logit_rate=-2.479651 collapse_port_gap_logit=0.404525 collapse_food_gap_z=-0.711834 collapse_defense_gap_z=-0.337164 collapse_timing_skew=-1.890670 ruin_buildable_mean=0.013590 ruin_coast_mean=0.009719 port_coast_mean=0.061394 live_buildable_mean=0.139648

per_round:
- round=36e581f1-73f8-453f-ab98-cbe3052b701b episodes=4 baseline_mae=0.183227 knn_mae=0.157437 baseline_mse=0.076798 knn_mse=0.049967
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd episodes=4 baseline_mae=0.276736 knn_mae=0.082767 baseline_mse=0.243218 knn_mse=0.022959
- round=76909e29-f664-4b2f-b16b-61b7507277e9 episodes=4 baseline_mae=0.271924 knn_mae=0.162871 baseline_mse=0.192074 knn_mse=0.046095
- round=8e839974-b13b-407b-a5e7-fc749d877195 episodes=4 baseline_mae=0.042210 knn_mae=0.166698 baseline_mse=0.003595 knn_mse=0.075201
- round=ae78003a-4efe-425a-881a-d16a39bca0ad episodes=4 baseline_mae=0.309571 knn_mae=0.122604 baseline_mse=0.348693 knn_mse=0.037489
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 episodes=4 baseline_mae=0.293873 knn_mae=0.120479 baseline_mse=0.255018 knn_mse=0.035558
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb episodes=4 baseline_mae=0.662921 knn_mae=0.480414 baseline_mse=1.919363 knn_mse=1.145097
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b episodes=4 baseline_mae=0.089759 knn_mae=0.096559 baseline_mse=0.036156 knn_mse=0.017626
