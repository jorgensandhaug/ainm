query-residual-online-audit f1_query_residual_online_query_residual_probe3_b50e0_v01

model: query_residual_v7
policy_name: coverage
budget: 50
episode_seed: 0
rounds: 3
evaluated_seed_count: 15
aggregation_mode: equal_round_mean_over_exact_online_episode
aggregate_regime_mae: 0.065954
aggregate_regime_mse: 0.009942
aggregate_raw_delta_rmse: 0.580351
aggregate_served_delta_rmse: 0.563237
aggregate_score: 72.546489
aggregate_weighted_kl: 0.107407

per_round:
- round=8e839974-b13b-407b-a5e7-fc749d877195 round_number=4 seed=0 queries=45 seeds=5 regime_mae=0.058176 raw_delta_rmse=0.709560 served_delta_rmse=0.637447 score=68.505695 weighted_kl=0.126152
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b round_number=5 seed=0 queries=45 seeds=5 regime_mae=0.035840 raw_delta_rmse=0.620567 served_delta_rmse=0.571522 score=76.156749 weighted_kl=0.091044
- round=ae78003a-4efe-425a-881a-d16a39bca0ad round_number=6 seed=0 queries=45 seeds=5 regime_mae=0.103844 raw_delta_rmse=0.410927 served_delta_rmse=0.480741 score=72.977022 weighted_kl=0.105025
