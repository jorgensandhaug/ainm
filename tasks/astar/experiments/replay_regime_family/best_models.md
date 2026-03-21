# Best Models

| rank | model | benchmark | mode | policy | mean score | mean weighted KL | why it matters |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | `query_residual_v7` | `probe_query_residual_exploration_3rounds_seed0to1` | online_interactive | `exploration_v2` | 73.2181 | 0.10434 | best current-worktree low-noise result on the hard 3-round probe |
| 2 | `query_residual_v7` | `dev_query_residual_online50_v7` | online_interactive | `coverage` | 73.9505 | 0.10633 | strongest stored 8-round local artifact found on disk |
| 3 | `query_residual_v5` | `dev_query_residual_online50_v5` | online_interactive | `coverage` | 73.6979 | 0.10751 | near-frontier prior variant |
| 4 | `historical_bucket_prior_v1` | `probe_bucket_coverage_3rounds_seed0to1` | online_interactive | `coverage` | 70.3257 | 0.12243 | strongest simple anchor on the matched hard 3-round multi-seed slice |
| 5 | `hazard_posterior_blend_v1` | `probe_hazard_blend_a25_k5_exploration_3rounds_seed0to1` | online_interactive | `exploration_v2` | 70.2024 | 0.12209 | best new semimechanistic family variant so far; nearly recovers bucket but still not additive |
