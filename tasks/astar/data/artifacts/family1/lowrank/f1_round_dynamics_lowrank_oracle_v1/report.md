round-dynamics-lowrank-audit f1_round_dynamics_lowrank_oracle_v1

scope: round_semimechanistic_terminal_logits
projection_mode: oracle_holdout_projection
rounds: 9
coefficient_dim: 51
regime_dim: 12
max_rank: 5
singular_values: [14.815493062564144, 8.752458709193345, 3.7519021121869316, 2.549420275097517, 2.478390054881032, 1.6235769146980492, 1.1891311311410644, 0.3419633275632985, 7.707292506247451e-15]
explained_variance_ratio: [0.6712706385771354, 0.23427479893000858, 0.04304953161877121, 0.019876884004486114, 0.018784720953911534]
cumulative_explained_variance_ratio: [0.6712706385771354, 0.905545437507144, 0.9485949691259152, 0.9684718531304013, 0.9872565740843128]
mean_baseline_log_loss: 0.181454
oracle_full_log_loss: 0.143772
mean_baseline_brier: 0.008829
oracle_full_brier: 0.003650
cross_round_low_rank: unlikely

notes:
- leave-one-round-out over fitted semimechanistic terminal-law coefficient vectors
- low-rank reconstructions use oracle projection of each held-out coefficient vector onto the training basis
- this tests compressibility of cross-round dynamics, not live-time identifiability of the latent regime

rank_metrics:
- rank=1 ll=0.184262 gain_vs_mean=-0.002807 gap_to_oracle=0.040489 capture=-0.0745 cum_evr=0.6761
- rank=2 ll=0.167039 gain_vs_mean=0.014415 gap_to_oracle=0.023267 capture=0.3825 cum_evr=0.9075
- rank=3 ll=0.161234 gain_vs_mean=0.020220 gap_to_oracle=0.017462 capture=0.5366 cum_evr=0.9528
- rank=4 ll=0.161344 gain_vs_mean=0.020110 gap_to_oracle=0.017572 capture=0.5337 cum_evr=0.9753
- rank=5 ll=0.160643 gain_vs_mean=0.020811 gap_to_oracle=0.016871 capture=0.5523 cum_evr=0.9911

per_round:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 n=8000 mean_ll=0.191936 oracle_ll=0.212561 rank1_ll=0.192816
- round=36e581f1-73f8-453f-ab98-cbe3052b701b n=8000 mean_ll=0.168097 oracle_ll=0.165386 rank1_ll=0.375212
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd n=8000 mean_ll=0.207234 oracle_ll=0.169626 rank1_ll=0.195749
- round=76909e29-f664-4b2f-b16b-61b7507277e9 n=8000 mean_ll=0.287901 oracle_ll=0.193002 rank1_ll=0.210109
- round=8e839974-b13b-407b-a5e7-fc749d877195 n=8000 mean_ll=0.131744 oracle_ll=0.119821 rank1_ll=0.124340
- round=ae78003a-4efe-425a-881a-d16a39bca0ad n=8000 mean_ll=0.385425 oracle_ll=0.227959 rank1_ll=0.282365
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 n=8000 mean_ll=0.053115 oracle_ll=0.049638 rank1_ll=0.053359
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb n=8000 mean_ll=0.037918 oracle_ll=0.008476 rank1_ll=0.034150
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b n=8000 mean_ll=0.169720 oracle_ll=0.147482 rank1_ll=0.190254
