event-regime-posterior-audit f1_event_regime_posterior_knn_b20s2_audit_v04

dataset: f1_synthetic_live_coverage_b20_s2_v4
policy_name: coverage
budget: 20
samples_per_round: 2
k_neighbors: 5
rounds: 9
episodes: 18
aggregation_mode: equal_round_mean_primary
baseline_mae: 0.614106
knn_mae: 0.371333
mae_gain: 0.242772
baseline_mse: 0.876230
knn_mse: 0.453991
mse_gain: 0.422239

per_target:
- birth_logit_rate: baseline_mae=0.951700 knn_mae=0.522521 baseline_mse=1.634989 knn_mse=0.832391
- collapse_logit_rate: baseline_mae=0.276511 knn_mae=0.220145 baseline_mse=0.117471 knn_mse=0.075591

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
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 episodes=2 baseline_mae=0.268507 knn_mae=0.129158 baseline_mse=0.119303 knn_mse=0.019606
- round=36e581f1-73f8-453f-ab98-cbe3052b701b episodes=2 baseline_mae=0.487535 knn_mae=0.146061 baseline_mse=0.241969 knn_mse=0.040359
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd episodes=2 baseline_mae=0.498947 knn_mae=0.107307 baseline_mse=0.256810 knn_mse=0.016008
- round=76909e29-f664-4b2f-b16b-61b7507277e9 episodes=2 baseline_mae=0.526670 knn_mae=0.238466 baseline_mse=0.424228 knn_mse=0.080598
- round=8e839974-b13b-407b-a5e7-fc749d877195 episodes=2 baseline_mae=0.072936 knn_mae=0.264358 baseline_mse=0.008845 knn_mse=0.132339
- round=ae78003a-4efe-425a-881a-d16a39bca0ad episodes=2 baseline_mae=0.765500 knn_mae=0.460644 baseline_mse=0.936042 knn_mse=0.230797
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 episodes=2 baseline_mae=0.761988 knn_mae=0.382847 baseline_mse=0.740190 knn_mse=0.166189
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb episodes=2 baseline_mae=1.907783 knn_mae=1.563828 baseline_mse=5.079310 knn_mse=3.396745
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b episodes=2 baseline_mae=0.237083 knn_mae=0.049331 baseline_mse=0.079374 knn_mse=0.003277
