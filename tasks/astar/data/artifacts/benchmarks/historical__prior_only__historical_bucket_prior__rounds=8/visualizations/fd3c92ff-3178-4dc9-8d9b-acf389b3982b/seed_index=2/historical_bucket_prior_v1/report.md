# Historical Benchmark Round 5 Seed 2 historical_bucket_prior_v1

- round_id: `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
- seed_index: `2`
- argmax_agreement_rate: `0.980625`
- ground_truth_class_mass: `[0.6434968749999997, 0.11920000000000001, 0.008115625000000005, 0.011940625000000031, 0.19849687499999916, 0.01875]`
- mean_ground_truth_entropy: `0.5153972522020946`
- mean_prediction_entropy: `0.6958010450246617`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6304126630825864, 0.11553753217969395, 0.016922376055709377, 0.013011412932514052, 0.196668187506591, 0.027447828242904048]`
- residual_class_mass: `[-0.01308421191741338, -0.0036624678203060618, 0.008806751055709373, 0.001070787932514021, -0.0018286874934081432, 0.008697828242904049]`
- round_number: `5`
- score: `80.76842546076716`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.0711946902778349`

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
