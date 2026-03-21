# Best Models

| rank | model | benchmark | mode | policy | mean score | mean weighted KL | why it matters |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | `hazard_posterior_v3` | `probe_hazard_v3_k5_r3_l8_m35_coverage_3rounds_seed0to1` | online_interactive | `coverage` | 76.6419 | 0.09128 | current hard-slice frontier; distilled posterior materially improves both score and KL over raw v2 while running about 9.6x faster |
| 2 | `hazard_posterior_v2_k5_r3` | `probe_hazard_v2_k5_r3_coverage_3rounds_seed0to1` | online_interactive | `coverage` | 74.2658 | 0.10315 | first new-family result that beat the prior hard-slice frontier (`query_residual + exploration`) on both score and KL |
| 3 | `query_residual_v7` | `probe_query_residual_exploration_3rounds_seed0to1` | online_interactive | `exploration_v2` | 73.2181 | 0.10434 | previous current-worktree low-noise result on the hard 3-round probe |
| 4 | `query_residual_v7` | `dev_query_residual_online50_v7` | online_interactive | `coverage` | 73.9505 | 0.10633 | strongest stored 8-round local artifact found on disk before the new v3 promotion finishes |
| 5 | `historical_bucket_prior_v1` | `probe_bucket_coverage_3rounds_seed0to1` | online_interactive | `coverage` | 70.3257 | 0.12243 | strongest simple anchor on the matched hard 3-round multi-seed slice |
