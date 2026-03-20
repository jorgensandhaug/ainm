# Historical Benchmark Round 1 Seed 2 historical_bucket_prior_v1

- round_id: `71451d74-be9f-471f-aacd-a41f3b68a9cd`
- seed_index: `2`
- argmax_agreement_rate: `0.97875`
- ground_truth_class_mass: `[0.6329874999999991, 0.13326562500000005, 0.012940624999999997, 0.01102500000000006, 0.196031249999999, 0.01375]`
- mean_ground_truth_entropy: `0.5404277842102572`
- mean_prediction_entropy: `0.6120829528454894`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6545214607220121, 0.09202397888842385, 0.013880525289235146, 0.012069246198167015, 0.20478722108792588, 0.022717567814237585]`
- residual_class_mass: `[0.021533960722012968, -0.0412416461115762, 0.0009399002892351484, 0.0010442461981669537, 0.00875597108792689, 0.008967567814237585]`
- round_number: `1`
- score: `75.96815066313192`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.09161866791939138`

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
