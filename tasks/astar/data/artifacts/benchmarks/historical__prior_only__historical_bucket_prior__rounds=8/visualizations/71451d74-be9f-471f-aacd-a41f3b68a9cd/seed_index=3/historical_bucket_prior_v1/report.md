# Historical Benchmark Round 1 Seed 3 historical_bucket_prior_v1

- round_id: `71451d74-be9f-471f-aacd-a41f3b68a9cd`
- seed_index: `3`
- argmax_agreement_rate: `0.978125`
- ground_truth_class_mass: `[0.6183968749999998, 0.15842812500000006, 0.010359374999999999, 0.012475000000000019, 0.17971562499999963, 0.020625]`
- mean_ground_truth_entropy: `0.6389114973455206`
- mean_prediction_entropy: `0.6848801105657717`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6413997276572361, 0.11344010012962441, 0.013966491026385022, 0.013353761469024412, 0.18862632240847085, 0.029213597309258404]`
- residual_class_mass: `[0.023002852657236228, -0.04498802487037565, 0.003607116026385023, 0.0008787614690243927, 0.008910697408471224, 0.008588597309258404]`
- round_number: `1`
- score: `80.53606105074724`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.07215504616862901`

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
