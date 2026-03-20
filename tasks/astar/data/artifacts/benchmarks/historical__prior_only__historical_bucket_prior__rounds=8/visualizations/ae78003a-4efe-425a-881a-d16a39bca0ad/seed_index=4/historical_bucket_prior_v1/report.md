# Historical Benchmark Round 6 Seed 4 historical_bucket_prior_v1

- round_id: `ae78003a-4efe-425a-881a-d16a39bca0ad`
- seed_index: `4`
- argmax_agreement_rate: `0.925625`
- ground_truth_class_mass: `[0.5457500000000002, 0.23408749999999984, 0.013725000000000005, 0.030178124999999948, 0.15125937499999992, 0.025]`
- mean_ground_truth_entropy: `0.838349515530724`
- mean_prediction_entropy: `0.6112632723952014`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6673238752086954, 0.08739155603477712, 0.013625047727824604, 0.0106464274661927, 0.18768812203139937, 0.03332497153111145]`
- residual_class_mass: `[0.12157387520869523, -0.14669594396522273, -9.995227217540065e-05, -0.01953169753380725, 0.03642874703139945, 0.008324971531111447]`
- round_number: `6`
- score: `48.60329654926219`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.24049294238342572`

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
