# Historical Benchmark Round 8 Seed 1 historical_bucket_prior_v1

- round_id: `c5cdf100-a876-4fb7-b5d8-757162c97989`
- seed_index: `1`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.7479125000000021, 0.015553125000000025, 0.000856249999999998, 0.002287499999999975, 0.2227656249999989, 0.010625]`
- mean_ground_truth_entropy: `0.21969027061567267`
- mean_prediction_entropy: `0.6534358042449766`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6533709559924945, 0.10869388541886288, 0.017175760444697593, 0.01288486103770194, 0.1881007580305268, 0.019773779075716463]`
- residual_class_mass: `[-0.09454154400750758, 0.09314076041886285, 0.016319510444697594, 0.010597361037701964, -0.0346648669694721, 0.009148779075716462]`
- round_number: `8`
- score: `63.7373967565819`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.15013290647677968`

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
