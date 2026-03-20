# Historical Benchmark Round 1 Seed 0 historical_bucket_prior_v1

- round_id: `71451d74-be9f-471f-aacd-a41f3b68a9cd`
- seed_index: `0`
- argmax_agreement_rate: `0.9825`
- ground_truth_class_mass: `[0.6401999999999995, 0.130078125, 0.01041875, 0.00849375000000001, 0.1876843749999993, 0.023125]`
- mean_ground_truth_entropy: `0.4868273611935529`
- mean_prediction_entropy: `0.5786527202144094`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6635799179914962, 0.08315058052505458, 0.013818497745544146, 0.011678745454560794, 0.19621507563460178, 0.03155718264874351]`
- residual_class_mass: `[0.023379917991496635, -0.046927544474945404, 0.003399747745544147, 0.0031849954545607843, 0.008530700634602484, 0.008432182648743514]`
- round_number: `1`
- score: `75.24210123114135`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.09481975163218412`

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
