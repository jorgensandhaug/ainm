# Historical Benchmark Round 8 Seed 2 historical_bucket_prior_v1

- round_id: `c5cdf100-a876-4fb7-b5d8-757162c97989`
- seed_index: `2`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.7272749999999983, 0.030050000000000052, 0.0007749999999999994, 0.005199999999999954, 0.21732499999999988, 0.019375]`
- mean_ground_truth_entropy: `0.3301406692762592`
- mean_prediction_entropy: `0.7075492875662054`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6310507194807484, 0.1284998044411536, 0.015693970169852564, 0.014142656551356481, 0.1825793102367579, 0.0280335391201302]`
- residual_class_mass: `[-0.09622428051924992, 0.09844980444115356, 0.014918970169852564, 0.008942656551356527, -0.034745689763241966, 0.0086585391201302]`
- round_number: `8`
- score: `67.96039212111222`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.12874837310667123`

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
