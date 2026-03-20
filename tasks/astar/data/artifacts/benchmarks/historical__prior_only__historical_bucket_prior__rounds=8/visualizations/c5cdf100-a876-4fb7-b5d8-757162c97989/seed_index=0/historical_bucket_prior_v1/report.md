# Historical Benchmark Round 8 Seed 0 historical_bucket_prior_v1

- round_id: `c5cdf100-a876-4fb7-b5d8-757162c97989`
- seed_index: `0`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.7261062499999988, 0.02820625000000002, 0.001512499999999996, 0.004965624999999936, 0.219209375, 0.02]`
- mean_ground_truth_entropy: `0.337411387393071`
- mean_prediction_entropy: `0.7166220245382583`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6273363280665365, 0.1276866489709546, 0.018637180101616833, 0.014073298027748366, 0.18366309399786812, 0.02860345083527335]`
- residual_class_mass: `[-0.09876992193346235, 0.09948039897095459, 0.017124680101616836, 0.009107673027748429, -0.03554628100213189, 0.008603450835273349]`
- round_number: `8`
- score: `66.89828162501111`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.133998968302863`

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
