# Historical Benchmark Round 7 Seed 4 historical_bucket_prior_v1

- round_id: `36e581f1-73f8-453f-ab98-cbe3052b701b`
- seed_index: `4`
- argmax_agreement_rate: `0.908125`
- ground_truth_class_mass: `[0.6463875000000004, 0.1317218749999996, 0.009859374999999995, 0.009184375000000007, 0.18284687499999971, 0.02]`
- mean_ground_truth_entropy: `0.4061149433221536`
- mean_prediction_entropy: `0.689120960360489`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6419092560163479, 0.10762973369491308, 0.017453454989157072, 0.013107264582615298, 0.19132071024594027, 0.02857958047102806]`
- residual_class_mass: `[-0.004478243983652597, -0.024092141305086523, 0.0075940799891570775, 0.003922889582615292, 0.008473835245940559, 0.00857958047102806]`
- round_number: `7`
- score: `56.749063874602335`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.18884367512145145`

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
