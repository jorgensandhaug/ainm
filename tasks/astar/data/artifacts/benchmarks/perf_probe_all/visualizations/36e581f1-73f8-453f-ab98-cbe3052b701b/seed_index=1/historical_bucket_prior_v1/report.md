# Historical Benchmark Round 7 Seed 1 historical_bucket_prior_v1

- round_id: `36e581f1-73f8-453f-ab98-cbe3052b701b`
- seed_index: `1`
- argmax_agreement_rate: `0.895625`
- ground_truth_class_mass: `[0.6626687500000003, 0.14093124999999967, 0.009040625000000002, 0.010731250000000025, 0.15725312499999972, 0.019375]`
- mean_ground_truth_entropy: `0.41736986747650334`
- mean_prediction_entropy: `0.6956333871638131`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6581923112423476, 0.11075230293545445, 0.01641938229055712, 0.013165745030532137, 0.17344073795937962, 0.028029520541730742]`
- residual_class_mass: `[-0.00447643875765269, -0.030178947064545228, 0.007378757290557118, 0.0024344950305321116, 0.0161876129593799, 0.008654520541730742]`
- round_number: `7`
- score: `53.13438552950246`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.21078196851898967`

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
