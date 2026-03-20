# Historical Benchmark Round 2 Seed 3 historical_bucket_prior_v1

- round_id: `76909e29-f664-4b2f-b16b-61b7507277e9`
- seed_index: `3`
- argmax_agreement_rate: `0.980625`
- ground_truth_class_mass: `[0.63801875, 0.1641687500000002, 0.016690625000000004, 0.01617500000000003, 0.15557187499999992, 0.009375]`
- mean_ground_truth_entropy: `0.6992039205143857`
- mean_prediction_entropy: `0.6541114553873623`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6800306522650094, 0.10254241631525686, 0.01744168333636351, 0.012451980184567722, 0.1689625517859543, 0.018570716112845494]`
- residual_class_mass: `[0.04201190226500939, -0.06162633368474334, 0.0007510583363635054, -0.0037230198154323078, 0.013390676785954375, 0.009195716112845495]`
- round_number: `2`
- score: `74.93500654006611`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.09618300920487156`

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
