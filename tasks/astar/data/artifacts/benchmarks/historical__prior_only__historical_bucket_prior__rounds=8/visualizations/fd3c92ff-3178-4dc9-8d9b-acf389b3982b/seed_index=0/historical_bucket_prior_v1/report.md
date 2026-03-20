# Historical Benchmark Round 5 Seed 0 historical_bucket_prior_v1

- round_id: `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
- seed_index: `0`
- argmax_agreement_rate: `0.975625`
- ground_truth_class_mass: `[0.6675906250000003, 0.11830937499999981, 0.00748125, 0.01130312500000001, 0.1790656249999995, 0.01625]`
- mean_ground_truth_entropy: `0.4939309593677595`
- mean_prediction_entropy: `0.7223590719229327`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6428270832591569, 0.1203591975983959, 0.015959630349890418, 0.015082155501741013, 0.18068154959991045, 0.025090383690906264]`
- residual_class_mass: `[-0.024763541740843387, 0.0020498225983960894, 0.008478380349890418, 0.003779030501741004, 0.001615924599910945, 0.008840383690906263]`
- round_number: `5`
- score: `75.90009663710467`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.09191740945706083`

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
