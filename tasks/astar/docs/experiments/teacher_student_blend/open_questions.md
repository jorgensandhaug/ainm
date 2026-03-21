# Open Questions

- Does exact observed-cell posterior updating help enough to justify keeping it in the family backbone?
- Should local evidence stay exact-only, or should it propagate to nearby cells via blurred residual features?
- If blurred local evidence helps, what blur radius / strength is best?
- Does geometry gating beat plain blurred diffusion on corrected held-out rounds?
- Does class-weighted diffusion beat uniform geometry-gated diffusion?
- Does quarter-scale multiscale temporal summarization beat the current first-half/second-half split?
- Is multiscale temporal summarization only useful on the simpler pre-local-evidence backbone?
- If multiscale helps, is it stronger with global blend or spatial-dynamic blend?
- Does shrinking KNN residual corrections by bank distance improve held-out-round generalization?
- Is the main win here simply lower `samples_per_round`, rather than more model complexity?
- Is `k_neighbors=5` still too smooth, and does smaller `k` beat it on unseen rounds?
- Does the slight `k=1` gain stack with lower `samples_per_round`, or are those two probes attacking the same failure mode?
- Does exact observed-cell posterior correction become useful again once it is ported onto the stronger `k=1` backbone?
- After exact-local-evidence fixes observed cells, does seed-adaptive/confidence-gated teacher weighting still improve the unobserved-cell blend?
- Is the winning exact-local-evidence branch under-shrunk or over-shrunk relative to the current `beta_min=4`, `beta_scale=12` setting?
- Are `samples_per_round=8` variants consistently stronger than `samples_per_round=4` once corrected holdout is used?
- After corrected holdout ranking lands, which variant deserves full leave-one-round-out promotion first?
