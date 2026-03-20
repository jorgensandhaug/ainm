# Historical Benchmark Round 1 Seed 1 historical_bucket_prior_v1

- round_id: `71451d74-be9f-471f-aacd-a41f3b68a9cd`
- seed_index: `1`
- argmax_agreement_rate: `0.98125`
- ground_truth_class_mass: `[0.6231437499999987, 0.14702187499999986, 0.012756249999999998, 0.012937500000000038, 0.1716406249999998, 0.0325]`
- mean_ground_truth_entropy: `0.6021174556819477`
- mean_prediction_entropy: `0.6498711772643007`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.647774644088601, 0.10308245606699948, 0.01405620179539412, 0.012832457117711686, 0.18191504595478483, 0.04033919497650922]`
- residual_class_mass: `[0.024630894088602306, -0.04393941893300038, 0.001299951795394121, -0.00010504288228835139, 0.010274420954785035, 0.007839194976509221]`
- round_number: `1`
- score: `77.0163503001251`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.08705081503853979`

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
