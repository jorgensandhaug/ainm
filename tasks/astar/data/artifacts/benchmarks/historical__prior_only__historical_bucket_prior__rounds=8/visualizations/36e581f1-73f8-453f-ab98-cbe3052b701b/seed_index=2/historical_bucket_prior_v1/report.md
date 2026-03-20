# Historical Benchmark Round 7 Seed 2 historical_bucket_prior_v1

- round_id: `36e581f1-73f8-453f-ab98-cbe3052b701b`
- seed_index: `2`
- argmax_agreement_rate: `0.909375`
- ground_truth_class_mass: `[0.6515437500000005, 0.12557812499999998, 0.007253124999999999, 0.010662500000000017, 0.1905874999999997, 0.014375]`
- mean_ground_truth_entropy: `0.39210682214613657`
- mean_prediction_entropy: `0.6928396704371705`
- mode: `prior_only`
- model_name: `historical_bucket_prior_v1`
- predicted_class_mass: `[0.6375477027992973, 0.11060867010135322, 0.015781199018458227, 0.013376161158318776, 0.1993852391655901, 0.023301027756982538]`
- residual_class_mass: `[-0.013996047200703243, -0.014969454898646761, 0.008528074018458228, 0.0027136611583187583, 0.008797739165590401, 0.008926027756982537]`
- round_number: `7`
- score: `56.119427024477844`
- training_analyzed_seed_count: `35`
- training_cell_count: `56000`
- training_round_count: `7`
- weighted_kl: `0.19256271354450094`

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
