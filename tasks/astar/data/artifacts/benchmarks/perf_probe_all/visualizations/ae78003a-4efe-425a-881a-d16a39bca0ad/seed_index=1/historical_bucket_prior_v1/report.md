# Historical Benchmark Round 6 Seed 1 historical_bucket_prior_v1

- round_id: `ae78003a-4efe-425a-881a-d16a39bca0ad`
- seed_index: `1`
- argmax_agreement_rate: `0.93`
- ground_truth_class_mass: `[0.5473343749999995, 0.21605000000000008, 0.014059375000000011, 0.027843750000000028, 0.16783749999999986, 0.026875]`
- mean_ground_truth_entropy: `0.7860640421408108`
- mean_prediction_entropy: `0.6023813337008674`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6474358435892256, 0.08484158464062885, 0.013675091513466946, 0.010607013484525887, 0.2083751589376176, 0.03506530783453331]`
- residual_class_mass: `[0.10010146858922608, -0.13120841535937122, -0.0003842834865330647, -0.01723673651547414, 0.04053765893761774, 0.008190307834533308]`
- round_number: `6`
- score: `48.77699386420238`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.23930380716647232`

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
