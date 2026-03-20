# Historical Benchmark Round 6 Seed 0 historical_bucket_prior_v1

- round_id: `ae78003a-4efe-425a-881a-d16a39bca0ad`
- seed_index: `0`
- argmax_agreement_rate: `0.940625`
- ground_truth_class_mass: `[0.5741874999999997, 0.2129406250000001, 0.01307812500000001, 0.026256249999999984, 0.16228749999999978, 0.01125]`
- mean_ground_truth_entropy: `0.7894469981680904`
- mean_prediction_entropy: `0.6003391746358949`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6698565376500651, 0.09305672944741984, 0.013179502910329065, 0.011367072281633932, 0.1921780855459763, 0.020362072164575074]`
- residual_class_mass: `[0.0956690376500654, -0.11988389555258026, 0.00010137791032905491, -0.014889177718366052, 0.02989058554597651, 0.009112072164575075]`
- round_number: `6`
- score: `52.721173993902745`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.21338434252288696`

## Figures

- initial_map: `initial_map.png`
  Collapsed initial terrain and starting settlements.
- classwise_comparison: `classwise_comparison.png`
  Per-class probability heatmaps, left source against right source.
- prediction_atlas: `prediction_atlas.png`
  All class probability maps for historical_bucket_prior_v1.
- ground_truth_atlas: `ground_truth_atlas.png`
  All class probability maps for ground truth.
- residual_atlas: `residual_atlas.png`
  Signed probability residuals per class.
- entropy_comparison: `entropy_comparison.png`
  Uncertainty maps for both tensors.
- kl_divergence: `kl_divergence.png`
  Per-cell KL divergence from ground truth to the left tensor.
- terrain_bucket_count: `terrain_bucket_count.png`
  Number of historical cells in the matching terrain-only bucket.
- structural_bucket_count: `structural_bucket_count.png`
  Number of historical cells in the matching structural bucket.
- full_bucket_count: `full_bucket_count.png`
  Number of historical cells in the full feature bucket.
- support_level: `support_level.png`
  Deepest non-empty historical bucket used by the hierarchical prior.
