# Historical Benchmark Round 6 Seed 2 historical_bucket_prior_v1

- round_id: `ae78003a-4efe-425a-881a-d16a39bca0ad`
- seed_index: `2`
- argmax_agreement_rate: `0.93875`
- ground_truth_class_mass: `[0.572378125, 0.20220625000000034, 0.019393749999999998, 0.027478125000000006, 0.1591687500000002, 0.019375]`
- mean_ground_truth_entropy: `0.8069427190990688`
- mean_prediction_entropy: `0.6456641563598126`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6507139412628401, 0.10236604845848035, 0.015661613128250176, 0.01182579347324762, 0.19141450146321998, 0.028018102213962125]`
- residual_class_mass: `[0.07833581626284014, -0.09984020154151999, -0.003732136871749822, -0.015652331526752387, 0.032245751463219785, 0.008643102213962126]`
- round_number: `6`
- score: `54.893175288424935`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.1999270522953978`

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
