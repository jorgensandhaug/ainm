# Historical Benchmark Round 3 Seed 4 historical_bucket_prior_v1

- round_id: `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
- seed_index: `4`
- argmax_agreement_rate: `0.99375`
- ground_truth_class_mass: `[0.7640062500000002, 0.0018874999999999923, 3.75e-05, 0.0004343750000000003, 0.21863437499999994, 0.015]`
- mean_ground_truth_entropy: `0.06145382066689442`
- mean_prediction_entropy: `0.7876487689077197`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6149174738117763, 0.14874364800678969, 0.017305838456318744, 0.01804124525795593, 0.17713258105628288, 0.02385921341087649]`
- residual_class_mass: `[-0.14908877618822391, 0.1468561480067897, 0.017268338456318744, 0.017606870257955928, -0.04150179394371706, 0.00885921341087649]`
- round_number: `3`
- score: `35.570182734123264`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.34455415424357966`

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
