# Hypotheses

## Current Branches

- `v13` / `v14`: temporal summary + coefficient-residual head should beat regime-only ridge by predicting teacher coefficients directly
- `v15` / `v16`: spatial dynamic blending should beat global teacher weight by concentrating teacher trust on buildable/frontier/coastal cells
- `v17` / `v18`: confidence gating should reduce off-bank overtrust when live summaries are far from training summaries
- `v19` / `v20`: seed-adaptive teacher weighting should beat round-total weighting by rewarding informative seed coverage and penalizing repetitive windows
- `v21` / `v22`: exact local evidence posterior updates should improve observed-cell calibration because queried terminal samples directly estimate local marginals
- `v23` / `v24`: blurred local residual diffusion should improve nearby unobserved cells because query windows contain local spatial signal beyond the exact queried pixels
- `v25` / `v26`: geometry-gated blurred diffusion should beat ungated blur by preventing local evidence from leaking into implausible cells
- `v27` / `v28`: class-weighted geometry-gated diffusion should beat uniform diffusion by emphasizing built-class signal over empty/static spill
- `v29` / `v30`: quarter-scale multiscale temporal summaries should beat coarse half-split temporal summaries by preserving early/mid/late query-phase information
- `v31` / `v32`: quarter-scale multiscale temporal summaries may work better on the simpler global-blend backbone if the newer local-evidence stack is overfitting the corrected holdout
- `v33` / `v34`: multiscale temporal summaries may work better with spatial-dynamic blending than with global blending if phase information mostly matters on buildable/frontier cells
- `v35` / `v36`: coefficient-residual KNN likely overcorrects on far-off held-out rounds; shrink the residual toward the ridge base as neighbor distance grows
- `v37` / `v38`: test the same residual-distance shrink on the spatial-dynamic backbone

## Evaluation Rule

- fast gate: corrected targeted holdout on explicit held-out rounds
- promotion: corrected full leave-one-round-out benchmark
- never use the invalid two-round shortcut that trains only on the other held-out round
