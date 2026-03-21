# Best Models

| rank | model | benchmark | mode | policy | mean score | mean weighted KL | why it matters |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | `hazard_posterior_v3_k5_r3_l16_m50` | `probe_hazard_v3_k5_r3_l16_m50_coverage_3rounds_seed0to1` | online_interactive | `coverage` | 76.8128 | 0.09041 | current hard-slice frontier; stronger ridge plus higher predicted-latent weight improves over the initial v3 default |
| 2 | `hazard_posterior_v3` | `probe_hazard_v3_k5_r3_l8_m35_coverage_3rounds_seed0to1` | online_interactive | `coverage` | 76.6419 | 0.09128 | first distilled-posterior v3 result; already a large jump over raw v2 while running about 9.6x faster |
| 3 | `hazard_posterior_v2_k5_r3` | `probe_hazard_v2_k5_r3_coverage_3rounds_seed0to1` | online_interactive | `coverage` | 74.2658 | 0.10315 | first new-family result that beat the prior hard-slice frontier (`query_residual + exploration`) on both score and KL |
| 4 | `query_residual_v7` | `probe_query_residual_exploration_3rounds_seed0to1` | online_interactive | `exploration_v2` | 73.2181 | 0.10434 | previous current-worktree low-noise result on the hard 3-round probe |
| 5 | `historical_bucket_prior_v1` | `probe_bucket_coverage_3rounds_seed0to1` | online_interactive | `coverage` | 70.3257 | 0.12243 | strongest simple anchor on the matched hard 3-round multi-seed slice |
