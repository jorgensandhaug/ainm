# Open Questions

- Does exact observed-cell posterior updating help enough to justify keeping it in the family backbone?
- Should local evidence stay exact-only, or should it propagate to nearby cells via blurred residual features?
- Are `samples_per_round=8` variants consistently stronger than `samples_per_round=4` once corrected holdout is used?
- After corrected holdout ranking lands, which variant deserves full leave-one-round-out promotion first?
