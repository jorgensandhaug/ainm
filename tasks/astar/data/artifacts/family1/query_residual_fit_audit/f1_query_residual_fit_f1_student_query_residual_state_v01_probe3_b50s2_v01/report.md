query-residual-fit-audit f1_query_residual_fit_f1_student_query_residual_state_v01_probe3_b50s2_v01

model: f1_student_query_residual_state_v01
dataset: f1_query_residual_fit_probe3_b50_s2_v01
policy_name: coverage
budget: 50
samples_per_round: 2
rounds: 3
episodes: 6
evaluated_seed_count: 30
aggregation_mode: equal_round_mean_over_episode_mean
aggregate_regime_mae: 0.066319
aggregate_regime_mse: 0.010029
aggregate_raw_delta_rmse: 0.593276
aggregate_served_delta_rmse: 0.572677
aggregate_score: 72.190724
aggregate_weighted_kl: 0.109060

per_round:
- round=8e839974-b13b-407b-a5e7-fc749d877195 round_number=4 episodes=2 seeds=10 mean_queries=45.00 regime_mae=0.059015 raw_delta_rmse=0.726494 served_delta_rmse=0.646930 score=68.400151 weighted_kl=0.126660
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b round_number=5 episodes=2 seeds=10 mean_queries=45.00 regime_mae=0.035957 raw_delta_rmse=0.622234 served_delta_rmse=0.569112 score=76.243399 weighted_kl=0.090664
- round=ae78003a-4efe-425a-881a-d16a39bca0ad round_number=6 episodes=2 seeds=10 mean_queries=45.00 regime_mae=0.103984 raw_delta_rmse=0.431100 served_delta_rmse=0.501988 score=71.928620 weighted_kl=0.109857
