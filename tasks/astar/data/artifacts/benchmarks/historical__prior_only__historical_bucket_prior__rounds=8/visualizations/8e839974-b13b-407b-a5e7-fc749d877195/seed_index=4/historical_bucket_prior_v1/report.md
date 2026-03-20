# Historical Benchmark Round 4 Seed 4 historical_bucket_prior_v1

- round_id: `8e839974-b13b-407b-a5e7-fc749d877195`
- seed_index: `4`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.6703656250000016, 0.08683124999999986, 0.005584374999999996, 0.008965625000000055, 0.21512812499999978, 0.013125]`
- mean_ground_truth_entropy: `0.5040508834761092`
- mean_prediction_entropy: `0.7055783371938577`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6278820533690063, 0.12246889495445928, 0.016836498152664303, 0.013635987536653097, 0.19707433580816172, 0.022102230179055025]`
- residual_class_mass: `[-0.042483571630995365, 0.035637644954459424, 0.011252123152664308, 0.004670362536653042, -0.01805378919183806, 0.008977230179055025]`
- round_number: `4`
- score: `86.65664226621445`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.04773883882986114`

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
