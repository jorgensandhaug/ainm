event-regime-posterior-audit f1_event_regime_posterior_knn_birth_collapse_portsplit_b50s4_v01

dataset: f1_synthetic_live_coverage_b50_s4_v2
policy_name: coverage
budget: 50
samples_per_round: 4
k_neighbors: 7
target_family: birth_collapse_portsplit
rounds: 9
episodes: 36
aggregation_mode: equal_round_mean_primary
baseline_mae: 0.413231
knn_mae: 0.310941
mae_gain: 0.102290
baseline_mse: 0.441062
knn_mse: 0.230271
mse_gain: 0.210790
standardized_baseline_mae: 1.012163
standardized_knn_mae: 0.834076
standardized_mae_gain: 0.178087
standardized_baseline_mse: 2.038628
standardized_knn_mse: 1.287696
standardized_mse_gain: 0.750931

per_target:
- birth_logit_rate: baseline_mae=0.951700 knn_mae=0.519261 baseline_mse=1.634989 knn_mse=0.768721
- collapse_logit_rate: baseline_mae=0.276511 knn_mae=0.283525 baseline_mse=0.117471 knn_mse=0.094565
- collapse_logit_port: baseline_mae=0.418060 knn_mae=0.359047 baseline_mse=0.309417 knn_mse=0.173777
- collapse_logit_nonport: baseline_mae=0.270584 knn_mae=0.280287 baseline_mse=0.112265 knn_mse=0.092390
- collapse_pos_port_share_logit: baseline_mae=0.149302 knn_mae=0.112585 baseline_mse=0.031165 knn_mse=0.021903

round_targets:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 birth_logit_rate=-5.168261 collapse_logit_rate=-2.449744 collapse_logit_port=-2.736994 collapse_logit_nonport=-2.436552 collapse_pos_port_share_logit=-3.234343
- round=36e581f1-73f8-453f-ab98-cbe3052b701b birth_logit_rate=-5.108557 collapse_logit_rate=-2.779424 collapse_logit_port=-2.975503 collapse_logit_nonport=-2.770273 collapse_pos_port_share_logit=-3.168877
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd birth_logit_rate=-5.077742 collapse_logit_rate=-2.768896 collapse_logit_port=-3.427606 collapse_logit_nonport=-2.737578 collapse_pos_port_share_logit=-3.409083
- round=76909e29-f664-4b2f-b16b-61b7507277e9 birth_logit_rate=-4.791287 collapse_logit_rate=-2.531727 collapse_logit_port=-3.263354 collapse_logit_nonport=-2.500654 collapse_pos_port_share_logit=-3.562432
- round=8e839974-b13b-407b-a5e7-fc749d877195 birth_logit_rate=-5.612119 collapse_logit_rate=-2.521813 collapse_logit_port=-2.834669 collapse_logit_nonport=-2.505670 collapse_pos_port_share_logit=-3.132805
- round=ae78003a-4efe-425a-881a-d16a39bca0ad birth_logit_rate=-4.393708 collapse_logit_rate=-2.249671 collapse_logit_port=-2.846465 collapse_logit_nonport=-2.226278 collapse_pos_port_share_logit=-3.564021
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 birth_logit_rate=-6.632458 collapse_logit_rate=-2.081950 collapse_logit_port=-2.096711 collapse_logit_nonport=-2.081311 collapse_pos_port_share_logit=-3.147308
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb birth_logit_rate=-8.362418 collapse_logit_rate=-1.774941 collapse_logit_port=-1.765021 collapse_logit_nonport=-1.775296 collapse_pos_port_share_logit=-3.325222
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b birth_logit_rate=-5.254034 collapse_logit_rate=-2.479651 collapse_logit_port=-2.866578 collapse_logit_nonport=-2.462053 collapse_pos_port_share_logit=-3.298896

per_round:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 episodes=4 baseline_mae=0.141082 knn_mae=0.217163 baseline_mse=0.050092 knn_mse=0.054324
- round=36e581f1-73f8-453f-ab98-cbe3052b701b episodes=4 baseline_mae=0.363177 knn_mae=0.212899 baseline_mse=0.151256 knn_mse=0.052761
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd episodes=4 baseline_mae=0.450000 knn_mae=0.193341 baseline_mse=0.249621 knn_mse=0.046680
- round=76909e29-f664-4b2f-b16b-61b7507277e9 episodes=4 baseline_mae=0.405328 knn_mae=0.241091 baseline_mse=0.253169 knn_mse=0.063315
- round=8e839974-b13b-407b-a5e7-fc749d877195 episodes=4 baseline_mae=0.114230 knn_mae=0.277517 baseline_mse=0.017031 knn_mse=0.117060
- round=ae78003a-4efe-425a-881a-d16a39bca0ad episodes=4 baseline_mae=0.418641 knn_mae=0.361384 baseline_mse=0.398682 knn_mse=0.155988
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 episodes=4 baseline_mae=0.560385 knn_mae=0.296580 baseline_mse=0.437495 knn_mse=0.118666
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb episodes=4 baseline_mae=1.126356 knn_mae=0.879040 baseline_mse=2.375973 knn_mse=1.440757
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b episodes=4 baseline_mae=0.139884 knn_mae=0.119455 baseline_mse=0.036235 knn_mse=0.022889
