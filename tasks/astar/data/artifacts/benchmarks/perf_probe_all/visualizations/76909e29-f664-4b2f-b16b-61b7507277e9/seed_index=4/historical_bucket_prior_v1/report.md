# Historical Benchmark Round 2 Seed 4 historical_bucket_prior_v1

- round_id: `76909e29-f664-4b2f-b16b-61b7507277e9`
- seed_index: `4`
- argmax_agreement_rate: `0.980625`
- ground_truth_class_mass: `[0.6022062499999997, 0.1754625, 0.012428125000000003, 0.018134375000000022, 0.1748937499999996, 0.016875]`
- mean_ground_truth_entropy: `0.7253649598901686`
- mean_prediction_entropy: `0.6604555671230024`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6552252347319879, 0.10014239831256953, 0.014975780304947102, 0.013672055322474152, 0.1903208499016251, 0.025663681426397793]`
- residual_class_mass: `[0.053018984731988184, -0.07532010168743046, 0.002547655304947098, -0.00446231967752587, 0.015427099901625496, 0.008788681426397792]`
- round_number: `2`
- score: `74.69310088091208`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.09726081859993332`

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
