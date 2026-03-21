query-residual-fit-audit f1_query_residual_fit_query_residual_probe3_b50s2_v01

model: query_residual_v7
dataset: f1_query_residual_fit_probe3_b50_s2_v01
policy_name: coverage
budget: 50
samples_per_round: 2
rounds: 3
episodes: 6
evaluated_seed_count: 30
aggregation_mode: equal_round_mean_over_episode_mean
aggregate_regime_mae: 0.066033
aggregate_regime_mse: 0.009956
aggregate_raw_delta_rmse: 0.581314
aggregate_served_delta_rmse: 0.563757
aggregate_score: 72.519350
aggregate_weighted_kl: 0.107541

per_round:
- round=8e839974-b13b-407b-a5e7-fc749d877195 round_number=4 episodes=2 seeds=10 mean_queries=45.00 regime_mae=0.058262 raw_delta_rmse=0.709505 served_delta_rmse=0.637315 score=68.485476 weighted_kl=0.126246
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b round_number=5 episodes=2 seeds=10 mean_queries=45.00 regime_mae=0.035987 raw_delta_rmse=0.620607 served_delta_rmse=0.569482 score=76.252343 weighted_kl=0.090626
- round=ae78003a-4efe-425a-881a-d16a39bca0ad round_number=6 episodes=2 seeds=10 mean_queries=45.00 regime_mae=0.103849 raw_delta_rmse=0.413831 served_delta_rmse=0.484474 score=72.820231 weighted_kl=0.105750
