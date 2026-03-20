# Historical Benchmark Round 1 Seed 4 historical_bucket_prior_v1

- round_id: `71451d74-be9f-471f-aacd-a41f3b68a9cd`
- seed_index: `4`
- argmax_agreement_rate: `0.9725`
- ground_truth_class_mass: `[0.6372343749999998, 0.1294968750000002, 0.013928125, 0.009475000000000016, 0.19299062499999922, 0.016875]`
- mean_ground_truth_entropy: `0.5009418826260312`
- mean_prediction_entropy: `0.5766907892935198`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6622135762931741, 0.08241233875448793, 0.013937537239878712, 0.011695916989293318, 0.20407552830530126, 0.02566510241786674]`
- residual_class_mass: `[0.024979201293174325, -0.04708453624551227, 9.412239878712689e-06, 0.0022209169892933017, 0.01108490330530204, 0.008790102417866739]`
- round_number: `1`
- score: `72.24074143347529`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.10838867115215292`

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
