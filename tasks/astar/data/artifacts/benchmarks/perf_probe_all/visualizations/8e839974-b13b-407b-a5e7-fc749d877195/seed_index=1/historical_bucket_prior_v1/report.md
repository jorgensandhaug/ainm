# Historical Benchmark Round 4 Seed 1 historical_bucket_prior_v1

- round_id: `8e839974-b13b-407b-a5e7-fc749d877195`
- seed_index: `1`
- argmax_agreement_rate: `1.0`
- ground_truth_class_mass: `[0.6734062500000014, 0.08969374999999963, 0.004843749999999997, 0.009343750000000029, 0.20458749999999992, 0.018125]`
- mean_ground_truth_entropy: `0.513574097163743`
- mean_prediction_entropy: `0.6952807875662116`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6350117632111416, 0.12072039129693661, 0.01562872919153796, 0.01362648883378431, 0.18819689744407125, 0.026815730022528288]`
- residual_class_mass: `[-0.038394486788859816, 0.031026641296936983, 0.010784979191537963, 0.004282738833784281, -0.01639060255592867, 0.008690730022528289]`
- round_number: `4`
- score: `87.05668887179864`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.0462035611008621`

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
