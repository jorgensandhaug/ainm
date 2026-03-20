# Historical Benchmark Round 4 Seed 0 historical_bucket_prior_v1

- round_id: `8e839974-b13b-407b-a5e7-fc749d877195`
- seed_index: `0`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.6722437500000013, 0.07697500000000007, 0.006021875000000002, 0.007090625000000009, 0.21829374999999962, 0.019375]`
- mean_ground_truth_entropy: `0.45210741165846485`
- mean_prediction_entropy: `0.6798945262919693`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6283848774687365, 0.11379487038067028, 0.01699909039691746, 0.013230254625577953, 0.1996002473222853, 0.027990659805811106]`
- residual_class_mass: `[-0.04385887253126475, 0.03681987038067021, 0.010977215396917456, 0.006139629625577943, -0.01869350267771433, 0.008615659805811107]`
- round_number: `4`
- score: `86.06824354307395`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.05000989161402875`

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
