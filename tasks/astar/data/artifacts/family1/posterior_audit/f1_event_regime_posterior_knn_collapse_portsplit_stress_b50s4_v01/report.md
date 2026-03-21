event-regime-posterior-audit f1_event_regime_posterior_knn_collapse_portsplit_stress_b50s4_v01

dataset: f1_synthetic_live_coverage_b50_s4_v2
policy_name: coverage
budget: 50
samples_per_round: 4
k_neighbors: 7
target_family: collapse_portsplit
summary_feature_variant: stress_v1
rounds: 9
episodes: 36
aggregation_mode: equal_round_mean_primary
baseline_mae: 0.278614
knn_mae: 0.242017
mae_gain: 0.036598
baseline_mse: 0.142580
knn_mse: 0.085301
mse_gain: 0.057278
standardized_baseline_mae: 0.994317
standardized_knn_mae: 0.839170
standardized_mae_gain: 0.155147
standardized_baseline_mse: 1.735929
standardized_knn_mse: 1.058578
standardized_mse_gain: 0.677351

per_target:
- collapse_logit_rate: baseline_mae=0.276511 knn_mae=0.252464 baseline_mse=0.117471 knn_mse=0.079976
- collapse_logit_port: baseline_mae=0.418060 knn_mae=0.340484 baseline_mse=0.309417 knn_mse=0.157928
- collapse_logit_nonport: baseline_mae=0.270584 knn_mae=0.251640 baseline_mse=0.112265 knn_mse=0.078285
- collapse_pos_port_share_logit: baseline_mae=0.149302 knn_mae=0.123479 baseline_mse=0.031165 knn_mse=0.025015

round_targets:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 collapse_logit_rate=-2.449744 collapse_logit_port=-2.736994 collapse_logit_nonport=-2.436552 collapse_pos_port_share_logit=-3.234343
- round=36e581f1-73f8-453f-ab98-cbe3052b701b collapse_logit_rate=-2.779424 collapse_logit_port=-2.975503 collapse_logit_nonport=-2.770273 collapse_pos_port_share_logit=-3.168877
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd collapse_logit_rate=-2.768896 collapse_logit_port=-3.427606 collapse_logit_nonport=-2.737578 collapse_pos_port_share_logit=-3.409083
- round=76909e29-f664-4b2f-b16b-61b7507277e9 collapse_logit_rate=-2.531727 collapse_logit_port=-3.263354 collapse_logit_nonport=-2.500654 collapse_pos_port_share_logit=-3.562432
- round=8e839974-b13b-407b-a5e7-fc749d877195 collapse_logit_rate=-2.521813 collapse_logit_port=-2.834669 collapse_logit_nonport=-2.505670 collapse_pos_port_share_logit=-3.132805
- round=ae78003a-4efe-425a-881a-d16a39bca0ad collapse_logit_rate=-2.249671 collapse_logit_port=-2.846465 collapse_logit_nonport=-2.226278 collapse_pos_port_share_logit=-3.564021
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 collapse_logit_rate=-2.081950 collapse_logit_port=-2.096711 collapse_logit_nonport=-2.081311 collapse_pos_port_share_logit=-3.147308
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb collapse_logit_rate=-1.774941 collapse_logit_port=-1.765021 collapse_logit_nonport=-1.775296 collapse_pos_port_share_logit=-3.325222
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b collapse_logit_rate=-2.479651 collapse_logit_port=-2.866578 collapse_logit_nonport=-2.462053 collapse_pos_port_share_logit=-3.298896

per_round:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 episodes=4 baseline_mae=0.054908 knn_mae=0.220340 baseline_mse=0.003620 knn_mse=0.057676
- round=36e581f1-73f8-453f-ab98-cbe3052b701b episodes=4 baseline_mae=0.315735 knn_mae=0.196583 baseline_mse=0.112632 knn_mse=0.051573
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd episodes=4 baseline_mae=0.415597 knn_mae=0.237614 baseline_mse=0.225704 knn_mse=0.065848
- round=76909e29-f664-4b2f-b16b-61b7507277e9 episodes=4 baseline_mae=0.279192 knn_mae=0.248491 baseline_mse=0.109493 knn_mse=0.078328
- round=8e839974-b13b-407b-a5e7-fc749d877195 episodes=4 baseline_mae=0.139398 knn_mae=0.071881 baseline_mse=0.021242 knn_mse=0.008202
- round=ae78003a-4efe-425a-881a-d16a39bca0ad episodes=4 baseline_mae=0.184013 knn_mae=0.274077 baseline_mse=0.037887 knn_mse=0.087889
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 episodes=4 baseline_mae=0.410120 knn_mae=0.357753 baseline_mse=0.209632 knn_mse=0.177633
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb episodes=4 baseline_mae=0.631034 knn_mae=0.435090 baseline_mse=0.555598 knn_mse=0.218854
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b episodes=4 baseline_mae=0.077533 knn_mae=0.136320 baseline_mse=0.007409 knn_mse=0.021707
