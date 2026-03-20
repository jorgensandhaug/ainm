# Historical Benchmark Round 2 Seed 2 historical_bucket_prior_v1

- round_id: `76909e29-f664-4b2f-b16b-61b7507277e9`
- seed_index: `2`
- argmax_agreement_rate: `0.979375`
- ground_truth_class_mass: `[0.6340812499999998, 0.1581343750000001, 0.013012499999999998, 0.01569375000000001, 0.1622031249999998, 0.016875]`
- mean_ground_truth_entropy: `0.6597427547752781`
- mean_prediction_entropy: `0.63177452854632`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6698490997987182, 0.09921171265957428, 0.01579804995206047, 0.012382798013193612, 0.17709028593477127, 0.02566805364168007]`
- residual_class_mass: `[0.03576784979871839, -0.05892266234042583, 0.002785549952060472, -0.0033109519868063982, 0.014887160934771465, 0.008793053641680069]`
- round_number: `2`
- score: `74.76719545456551`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.09693032021545676`

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
