query-residual-online-audit f1_query_residual_online_f1_student_query_residual_supportbase_v01_probe3_b50e0_v01

model: f1_student_query_residual_supportbase_v01
policy_name: coverage
budget: 50
episode_seed: 0
rounds: 3
evaluated_seed_count: 15
aggregation_mode: equal_round_mean_over_exact_online_episode
aggregate_regime_mae: 0.065954
aggregate_regime_mse: 0.009942
aggregate_raw_delta_rmse: 0.579580
aggregate_served_delta_rmse: 0.562548
aggregate_score: 72.570472
aggregate_weighted_kl: 0.107299

per_round:
- round=8e839974-b13b-407b-a5e7-fc749d877195 round_number=4 seed=0 queries=45 seeds=5 regime_mae=0.058176 raw_delta_rmse=0.708520 served_delta_rmse=0.636857 score=68.494594 weighted_kl=0.126206
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b round_number=5 seed=0 queries=45 seeds=5 regime_mae=0.035840 raw_delta_rmse=0.620381 served_delta_rmse=0.571626 score=76.159286 weighted_kl=0.091033
- round=ae78003a-4efe-425a-881a-d16a39bca0ad round_number=6 seed=0 queries=45 seeds=5 regime_mae=0.103844 raw_delta_rmse=0.409839 served_delta_rmse=0.479161 score=73.057537 weighted_kl=0.104658
