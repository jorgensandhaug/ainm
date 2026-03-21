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
- `v39` / `v40`: all finished `samples=8` branches are weaker than their `samples=4` siblings; test `samples=2` on the strongest temporal backbones
- `v41` / `v42`: continue that direction to `samples=1` to test whether lower within-round synthetic variance helps held-out-round generalization
- `v43` / `v44`: residual KNN may still be over-smoothing across mismatched rounds; test `k=3` on the strongest temporal backbones
- `v45` / `v46`: push the same idea to `k=1` to test whether a single nearest replay regime is better than a blended residual
- `v47` / `v48`: if `k=1` is better because cross-round residual blending is the main overfit source, combine it with `samples=2` to cut synthetic within-round variance at the same time
- `v49` / `v50`: push the same combined branch to `samples=1` to test whether the strongest line is simply nearest-neighbor residuals plus minimal synthetic duplication
- `v51` / `v52`: exact observed-cell posterior updates may help much more on the new `k=1` line than they did on older branches, because the global prior is now stronger and local evidence only needs to correct queried cells
- `v53` / `v54`: if that exact-local-evidence gain is real, stack it with the lower-sample `k=1` line instead of only testing it at `samples=4`
- `v55` / `v56`: exact observed-cell updates solved queried-cell calibration, but unobserved cells may still benefit from seed-adaptive teacher weighting and confidence gating on the same `k=1` backbone
- `v57` / `v58`: test that same gated teacher-blend idea on the lower-sample exact-local-evidence line instead of assuming the `samples=4` optimum transfers
- `v59` / `v60`: exact-local-evidence is now the clear winning mechanism, so tune its empirical-Bayes shrinkage more aggressively toward observed counts
- `v61` / `v62`: test the opposite direction too, in case the current posterior update is already slightly overreacting and needs stronger prior retention
- `v63` / `v64`: `v59/v60` say the win keeps moving toward more aggressive local evidence, so test a stronger step in that same direction
- `v65` / `v66`: also test an extreme near-count-dominated posterior in case the best regime is to trust observed-cell evidence almost completely
- `v67` / `v68`: keep the winning `v59/v60` beta schedule, but reduce prior pseudocount when a queried cell has many direct observations
- `v69` / `v70`: test a gentler version of the same count-adaptive exact-local-evidence idea
- `v71` / `v72`: test seed-adaptive student mixing on the winning exact-local-evidence line, but without the confidence gate that likely caused `v55-v58` to fail
- `v73` / `v74`: see whether the near-neutral count-adaptive local-evidence tweak becomes useful once paired with seed-adaptive mixing and no confidence gate
- `v75` / `v76`: test whether the summary-bank student is now underweighted on unobserved cells once exact-local-evidence fixes queried cells
- `v77` / `v78`: test the opposite direction too, in case the remaining error is still student overfit rather than underweighting

## Evaluation Rule

- fast gate: corrected targeted holdout on explicit held-out rounds
- promotion: corrected full leave-one-round-out benchmark
- never use the invalid two-round shortcut that trains only on the other held-out round
