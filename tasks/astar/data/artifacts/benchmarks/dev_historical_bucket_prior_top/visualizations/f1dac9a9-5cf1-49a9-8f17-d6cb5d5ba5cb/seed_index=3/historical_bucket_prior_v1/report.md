# Historical Benchmark Round 3 Seed 3 historical_bucket_prior_v1

- round_id: `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
- seed_index: `3`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.7493999999999988, 0.0023656249999999906, 3.749999999999999e-05, 0.0005031250000000004, 0.22519374999999994, 0.0225]`
- mean_ground_truth_entropy: `0.061765997890443035`
- mean_prediction_entropy: `0.633140956060609`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6446844158243197, 0.10208229057915305, 0.015726574143412497, 0.012838266591179013, 0.19370002684195659, 0.0309684260199758]`
- residual_class_mass: `[-0.10471558417567917, 0.09971666557915305, 0.015689074143412498, 0.012335141591179013, -0.03149372315804336, 0.0084684260199758]`
- round_number: `3`
- score: `41.74653264483976`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.2911845961877013`

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
