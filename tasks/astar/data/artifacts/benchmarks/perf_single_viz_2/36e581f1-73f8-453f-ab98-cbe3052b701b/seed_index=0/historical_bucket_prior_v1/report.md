# Model Prediction Round 7 Seed 0 historical_bucket_prior_v1

- round_id: `36e581f1-73f8-453f-ab98-cbe3052b701b`
- seed_index: `0`
- argmax_agreement_rate: `0.8925`
- ground_truth_class_mass: `[0.6570999999999998, 0.1309906249999998, 0.008953125000000001, 0.008475, 0.17198124999999956, 0.0225]`
- mean_ground_truth_entropy: `0.35544029787751563`
- mean_prediction_entropy: `0.6701184437301699`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6499374818094809, 0.10377766937876715, 0.016574933674772155, 0.012916614625447076, 0.1858128940090114, 0.030980406502523955]`
- residual_class_mass: `[-0.0071625181905189406, -0.02721295562123266, 0.007621808674772154, 0.004441614625447076, 0.013831644009011851, 0.008480406502523956]`
- round_number: `7`
- score: `50.88968270593375`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.2251699934356301`

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
