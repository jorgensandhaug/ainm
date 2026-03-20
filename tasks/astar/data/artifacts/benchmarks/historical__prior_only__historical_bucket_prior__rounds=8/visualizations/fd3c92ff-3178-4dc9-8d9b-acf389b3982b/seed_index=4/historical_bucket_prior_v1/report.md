# Historical Benchmark Round 5 Seed 4 historical_bucket_prior_v1

- round_id: `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
- seed_index: `4`
- argmax_agreement_rate: `0.989375`
- ground_truth_class_mass: `[0.6524093749999996, 0.10528750000000013, 0.007043749999999998, 0.012190625000000024, 0.19806874999999963, 0.025]`
- mean_ground_truth_entropy: `0.4788706260641596`
- mean_prediction_entropy: `0.6818690108788136`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6326311285553412, 0.11151772010871555, 0.016288015889050794, 0.012717197271285334, 0.193513217163767, 0.03333272101183917]`
- residual_class_mass: `[-0.01977824644465842, 0.00623022010871542, 0.009244265889050796, 0.0005265722712853096, -0.00455553283623264, 0.00833272101183917]`
- round_number: `5`
- score: `81.84236195412265`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.06679173470972773`

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
