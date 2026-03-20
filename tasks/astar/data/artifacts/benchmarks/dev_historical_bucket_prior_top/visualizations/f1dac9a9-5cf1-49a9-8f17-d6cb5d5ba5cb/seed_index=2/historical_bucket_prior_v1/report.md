# Historical Benchmark Round 3 Seed 2 historical_bucket_prior_v1

- round_id: `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
- seed_index: `2`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.7647875, 0.0022343749999999903, 5.3125e-05, 0.0005000000000000003, 0.21492499999999992, 0.0175]`
- mean_ground_truth_entropy: `0.06668768998495639`
- mean_prediction_entropy: `0.6557617628455753`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6514885942695401, 0.10777012580005974, 0.016987256267707772, 0.013055562854249279, 0.18444513821727596, 0.026253322591164637]`
- residual_class_mass: `[-0.11329890573045986, 0.10553575080005974, 0.01693413126770777, 0.012555562854249278, -0.030479861782723966, 0.008753322591164635]`
- round_number: `3`
- score: `40.57056048043877`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.3007091645733376`

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
