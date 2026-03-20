# Historical Benchmark Round 5 Seed 1 historical_bucket_prior_v1

- round_id: `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
- seed_index: `1`
- argmax_agreement_rate: `0.96875`
- ground_truth_class_mass: `[0.661812500000001, 0.1071593749999999, 0.007534375000000001, 0.009965625000000027, 0.19540312499999954, 0.018125]`
- mean_ground_truth_entropy: `0.43123275714827713`
- mean_prediction_entropy: `0.636656984471415`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6468829892720693, 0.09992837292737743, 0.015037702041047455, 0.012141515521719064, 0.1991614840470491, 0.026847936190735302]`
- residual_class_mass: `[-0.014929510727931694, -0.007231002072622478, 0.007503327041047454, 0.0021758905217190375, 0.0037583590470495476, 0.008722936190735303]`
- round_number: `5`
- score: `76.13784317924701`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.09087492082466818`

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
