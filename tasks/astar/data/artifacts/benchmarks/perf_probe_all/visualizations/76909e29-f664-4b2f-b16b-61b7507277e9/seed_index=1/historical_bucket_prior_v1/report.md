# Historical Benchmark Round 2 Seed 1 historical_bucket_prior_v1

- round_id: `76909e29-f664-4b2f-b16b-61b7507277e9`
- seed_index: `1`
- argmax_agreement_rate: `0.98125`
- ground_truth_class_mass: `[0.610496875000001, 0.16696249999999993, 0.011549999999999998, 0.01569375000000001, 0.1709218749999997, 0.024375]`
- mean_ground_truth_entropy: `0.6915235615387553`
- mean_prediction_entropy: `0.6643597827988519`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6457752497836128, 0.10898231366693854, 0.014974248463912505, 0.012730715033554057, 0.18479253102112078, 0.03274494203085753]`
- residual_class_mass: `[0.03527837478361173, -0.05798018633306139, 0.003424248463912507, -0.0029630349664459526, 0.013870656021121086, 0.00836994203085753]`
- round_number: `2`
- score: `77.78729028277405`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.08373071070790657`

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
