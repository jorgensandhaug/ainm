# Historical Benchmark Round 3 Seed 1 historical_bucket_prior_v1

- round_id: `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
- seed_index: `1`
- argmax_agreement_rate: `0.990625`
- ground_truth_class_mass: `[0.7719843750000002, 0.003106249999999983, 5e-05, 0.0006250000000000004, 0.21235937499999985, 0.011875]`
- mean_ground_truth_entropy: `0.08864379116476247`
- mean_prediction_entropy: `0.8086099367672698`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.614903388755967, 0.1564448557132851, 0.018652760163680865, 0.01873817827898947, 0.17031679431314675, 0.02094402277493065]`
- residual_class_mass: `[-0.15708098624403322, 0.15333860571328511, 0.018602760163680863, 0.01811317827898947, -0.0420425806868531, 0.00906902277493065]`
- round_number: `3`
- score: `37.41792750373734`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.327673417132338`

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
