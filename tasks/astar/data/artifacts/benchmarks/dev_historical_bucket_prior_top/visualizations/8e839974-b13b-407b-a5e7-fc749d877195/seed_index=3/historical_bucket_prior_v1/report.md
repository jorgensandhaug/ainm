# Historical Benchmark Round 4 Seed 3 historical_bucket_prior_v1

- round_id: `8e839974-b13b-407b-a5e7-fc749d877195`
- seed_index: `3`
- argmax_agreement_rate: `0.99875`
- ground_truth_class_mass: `[0.685390625000001, 0.07398437500000016, 0.00601875, 0.007540625000000002, 0.19706562499999958, 0.03]`
- mean_ground_truth_entropy: `0.4249757650273672`
- mean_prediction_entropy: `0.6331575856928059`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6490975236943782, 0.09953320489311267, 0.017181308964765562, 0.012502956165691706, 0.18365656285198872, 0.03802844343006197]`
- residual_class_mass: `[-0.0362931013056228, 0.02554882989311251, 0.011162558964765562, 0.004962331165691704, -0.013409062148010853, 0.008028443430061968]`
- round_number: `4`
- score: `87.41880108600213`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.044819937020039884`

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
