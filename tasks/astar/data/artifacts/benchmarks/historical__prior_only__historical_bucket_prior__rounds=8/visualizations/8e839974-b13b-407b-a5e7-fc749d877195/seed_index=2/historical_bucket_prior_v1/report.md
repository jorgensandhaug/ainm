# Historical Benchmark Round 4 Seed 2 historical_bucket_prior_v1

- round_id: `8e839974-b13b-407b-a5e7-fc749d877195`
- seed_index: `2`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.687456250000001, 0.07490937500000003, 0.005768749999999998, 0.00753124999999999, 0.19370937499999952, 0.030625]`
- mean_ground_truth_entropy: `0.432343771439782`
- mean_prediction_entropy: `0.6320714739280673`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6518229671196909, 0.1001866897042824, 0.016590212661595164, 0.012503656782589743, 0.18027687376545018, 0.03861959996639242]`
- residual_class_mass: `[-0.03563328288031009, 0.025277314704282378, 0.010821462661595166, 0.004972406782589753, -0.013432501234549338, 0.007994599966392422]`
- round_number: `4`
- score: `87.29586961846468`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.04528901225502497`

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
