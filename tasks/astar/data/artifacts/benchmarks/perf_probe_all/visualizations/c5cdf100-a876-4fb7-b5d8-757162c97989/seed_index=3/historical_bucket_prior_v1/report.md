# Historical Benchmark Round 8 Seed 3 historical_bucket_prior_v1

- round_id: `c5cdf100-a876-4fb7-b5d8-757162c97989`
- seed_index: `3`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.7332937500000007, 0.019375000000000035, 0.000868749999999999, 0.0034812499999999583, 0.22673124999999902, 0.01625]`
- mean_ground_truth_entropy: `0.24068410874907087`
- mean_prediction_entropy: `0.6411351266614667`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6454195223738469, 0.10641130566373808, 0.016203464709076423, 0.01288521000941913, 0.19403457496401047, 0.02504592227990897]`
- residual_class_mass: `[-0.08787422762615382, 0.08703630566373805, 0.015334714709076424, 0.009403960009419171, -0.032696675035988554, 0.008795922279908969]`
- round_number: `8`
- score: `66.55792415681768`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.13569919250309712`

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
