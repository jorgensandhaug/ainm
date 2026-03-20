# Historical Benchmark Round 2 Seed 0 historical_bucket_prior_v1

- round_id: `76909e29-f664-4b2f-b16b-61b7507277e9`
- seed_index: `0`
- argmax_agreement_rate: `0.978125`
- ground_truth_class_mass: `[0.598325, 0.178146875, 0.0090625, 0.016215625000000046, 0.17949999999999938, 0.01875]`
- mean_ground_truth_entropy: `0.6835663852182375`
- mean_prediction_entropy: `0.6265225779237164`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6552978272264123, 0.09246090952389693, 0.013781693502073705, 0.013058137457766811, 0.19798534623418426, 0.0274160860556694]`
- residual_class_mass: `[0.05697282722641228, -0.08568596547610308, 0.0047191935020737055, -0.0031574875422332345, 0.01848534623418488, 0.0086660860556694]`
- round_number: `2`
- score: `73.05810770876512`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.10463835515534231`

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
