# Historical Benchmark Round 5 Seed 3 historical_bucket_prior_v1

- round_id: `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
- seed_index: `3`
- argmax_agreement_rate: `0.98875`
- ground_truth_class_mass: `[0.6542906249999997, 0.10593437499999998, 0.008312499999999999, 0.012365624999999998, 0.19284687499999947, 0.02625]`
- mean_ground_truth_entropy: `0.4894973509652186`
- mean_prediction_entropy: `0.6782630643187387`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6364561976237809, 0.11077459988217797, 0.01661138989699752, 0.012840425701928249, 0.18881528796235889, 0.03450209893275482]`
- residual_class_mass: `[-0.017834427376218764, 0.0048402248821779875, 0.00829888989699752, 0.0004748007019282508, -0.004031587037640588, 0.00825209893275482]`
- round_number: `5`
- score: `80.72617577993468`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.07136910139941129`

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
