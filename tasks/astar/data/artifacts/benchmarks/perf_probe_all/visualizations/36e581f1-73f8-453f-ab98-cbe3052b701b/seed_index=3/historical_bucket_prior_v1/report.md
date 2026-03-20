# Historical Benchmark Round 7 Seed 3 historical_bucket_prior_v1

- round_id: `36e581f1-73f8-453f-ab98-cbe3052b701b`
- seed_index: `3`
- argmax_agreement_rate: `0.895`
- ground_truth_class_mass: `[0.6677937500000002, 0.13155312499999977, 0.007662500000000001, 0.00934375000000001, 0.17114687499999967, 0.0125]`
- mean_ground_truth_entropy: `0.3873142729513437`
- mean_prediction_entropy: `0.6883686469017953`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.649732110556622, 0.10913196934965111, 0.016067696740389256, 0.01311016703393706, 0.19042891550137586, 0.021529140818026746]`
- residual_class_mass: `[-0.01806163944337824, -0.022421155650348662, 0.008405196740389255, 0.0037664170339370504, 0.01928204050137619, 0.009029140818026745]`
- round_number: `7`
- score: `52.44778601045035`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.21511735448919753`

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
