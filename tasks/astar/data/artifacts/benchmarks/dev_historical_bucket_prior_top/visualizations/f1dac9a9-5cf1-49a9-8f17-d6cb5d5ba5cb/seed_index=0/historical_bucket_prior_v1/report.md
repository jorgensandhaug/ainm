# Historical Benchmark Round 3 Seed 0 historical_bucket_prior_v1

- round_id: `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
- seed_index: `0`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.7430218750000003, 0.002034374999999993, 7.5e-05, 0.0005250000000000004, 0.2262187499999999, 0.028125]`
- mean_ground_truth_entropy: `0.06202963638818603`
- mean_prediction_entropy: `0.6468112084803884`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6380992236229581, 0.10381039118403507, 0.016303427667563396, 0.012773705478136454, 0.19275391328623206, 0.03625933876107198]`
- residual_class_mass: `[-0.10492265137704215, 0.10177601618403508, 0.016228427667563397, 0.012248705478136453, -0.03346483671376785, 0.008134338761071978]`
- round_number: `3`
- score: `42.6612937768511`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.28395938192370657`

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
