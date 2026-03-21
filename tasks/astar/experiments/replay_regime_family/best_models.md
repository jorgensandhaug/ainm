# Best Models

| rank | model | benchmark | mode | policy | mean score | mean weighted KL | why it matters |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | `query_residual_v7` | `probe_query_residual_exploration_3rounds_seed0to1` | online_interactive | `exploration_v2` | 73.2181 | 0.10434 | best current-worktree low-noise result on the hard 3-round probe |
| 2 | `query_residual_v7` | `dev_query_residual_online50_v7` | online_interactive | `coverage` | 73.9505 | 0.10633 | strongest stored 8-round local artifact found on disk |
| 3 | `query_residual_v5` | `dev_query_residual_online50_v5` | online_interactive | `coverage` | 73.6979 | 0.10751 | near-frontier prior variant |
| 4 | `historical_bucket_prior_v1` | `dev_historical_bucket_online50` | online_interactive | `coverage` | 66.0226 | 0.14851 | best simple anchor baseline |
