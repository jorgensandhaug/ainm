# Dynamic Law Summary Validation

- profile: smoke
- rounds: 1
- holdout_runs: 1
- bootstrap_samples: 0
- rng_seed: 0
- site_max_rows: 8000
- settlement_max_rows: 8000
- pairwise_max_rows: 16000
- elapsed_seconds: 11.551
- mean_site_binary_brier: 1.6395733906003873e-06
- mean_settlement_binary_brier: 0.031239537788848953
- mean_settlement_linear_rmse: 0.06329528217961487
- mean_pairwise_binary_brier: 0.013664014419898958
- mean_pairwise_linear_rmse: 0.05953322059951118
- mean_ruin_binary_brier: 0.1172088836383995
- mean_owner_linear_rmse: 0.3776640388050369
- mean_macro_linear_rmse: 4.836191329907902
- mean_year_shock_mae: 7.525011280836415
- mean_probe_std: None

## Round 2 76909e29-f664-4b2f-b16b-61b7507277e9

- replay_seeds: 5
- replay_runs: 955
- holdout_runs: 1
- bootstrap_samples: 0
- probe_std_mean: None
- probe_std_max: None
- site_binary_brier: 0.000002, improvement=-0.000000
- settlement_binary_brier: 0.031240, improvement=-0.006109
- settlement_linear_rmse: 0.063295, improvement=0.010730
- pairwise_binary_brier: 0.013664, improvement=0.000497
- pairwise_linear_rmse: 0.059533, improvement=0.012431
- ruin_binary_brier: 0.117209, improvement=0.004021
- owner_linear_rmse: 0.377664, improvement=0.019268
- macro_linear_rmse: 4.836191, improvement=0.674128
- year_shock_mae: 7.525011
