# Historical Benchmark Round 6 Seed 3 historical_bucket_prior_v1

- round_id: `ae78003a-4efe-425a-881a-d16a39bca0ad`
- seed_index: `3`
- argmax_agreement_rate: `0.941875`
- ground_truth_class_mass: `[0.5466906249999993, 0.21347187499999973, 0.012496874999999998, 0.028006249999999958, 0.17308437499999954, 0.02625]`
- mean_ground_truth_entropy: `0.8203566699366247`
- mean_prediction_entropy: `0.6316516836380563`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6293525407584751, 0.10083406640740694, 0.0135174600005614, 0.011645670420687669, 0.21014947648089963, 0.034500785931968286]`
- residual_class_mass: `[0.08266191575847581, -0.11263780859259279, 0.0010205850005614026, -0.01636057957931229, 0.03706510148090009, 0.008250785931968287]`
- round_number: `6`
- score: `53.204859605709245`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.21034014928010125`

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
