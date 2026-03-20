# Historical Benchmark Round 8 Seed 4 historical_bucket_prior_v1

- round_id: `c5cdf100-a876-4fb7-b5d8-757162c97989`
- seed_index: `4`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.7459218750000011, 0.01757187500000005, 0.0005187500000000003, 0.0027093749999999696, 0.21265312499999842, 0.020625]`
- mean_ground_truth_entropy: `0.22080723581177403`
- mean_prediction_entropy: `0.714876243420949`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6369708075632629, 0.12439780079605514, 0.01558437526341443, 0.015232117966255622, 0.17860354697098388, 0.029211351440023105]`
- residual_class_mass: `[-0.10895106743673821, 0.1068259257960551, 0.01506562526341443, 0.012522742966255652, -0.03404957802901454, 0.008586351440023104]`
- round_number: `8`
- score: `64.15759390680519`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.14794257486185564`

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
