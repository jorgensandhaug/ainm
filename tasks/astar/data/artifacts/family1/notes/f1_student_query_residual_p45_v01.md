# f1_student_query_residual_p45_v01

- Parent: `query_residual_v7`
- Change:
  - training `budget_prefixes=(0, 5, 10, 20, 35, 45, 50)`
  - all other query-residual hyperparameters kept at default v7 values
- Hypothesis:
  - current online historical runs commonly execute `45` queries
  - adding an explicit `45` training prefix might tighten transcript-to-prediction calibration near real runtime behavior

## Smoke Result

- Benchmark: `tmp_f1_student_query_residual_p45_v01_probe3`
- Protocol:
  - online historical benchmark
  - coverage policy
  - budget `50`
  - episode seed `0`
  - held-out rounds:
    - `8e839974-b13b-407b-a5e7-fc749d877195`
    - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
    - `ae78003a-4efe-425a-881a-d16a39bca0ad`
- Aggregate:
  - mean_score `72.6319`
  - mean_weighted_kl `0.107047`
  - runtime `242.003s`

## Comparison vs baseline

- Baseline artifact: `tmp_query_residual_probe_3rounds_v7`
- Paired comparison artifact:
  - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual__candidate=f1_student_query_residual_p45_v01.json`
- Summary:
  - mean_score_delta `-0.4708`
  - mean_weighted_kl_delta `+0.002263`
  - win_rate `0.333`
  - loss_rate `0.667`
  - score_delta_ci95 `[-0.9060, 0.0765]`

## Conclusion

- Reject for now.
- The extra `45` prefix alone does not beat `query_residual_v7`.
- Runtime is also high enough that more query-residual hyperparameter sweeps should wait for performance work.
