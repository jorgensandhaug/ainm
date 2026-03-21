# Agent 1 Progress Log (Continuation on agent2 branch)

## Mission

Radically improve benchmark scores beyond the current best of 78.38 (GLMM latent z2 + exploration).

## Current State (2026-03-21T16:20Z)

- Branch: `agent2`
- Best model: `smh_glmmlatent_z2_h0_covbase_calnone_v001` + exploration
  - Full 8-round score: **78.38 / 0.087** weighted KL
- Machine: 384 cores, 3TB RAM, 341GB disk

## Key Insight: Missing Neighborhood Features

The current GLMM model treats each cell **independently** - it uses 16 static geometry features + time features, but has **ZERO dynamic features about what neighboring cells are doing**. This is the fundamental gap because:

- Settlement expansion requires nearby settlements (spatial contagion)
- Port development requires coastal + settlement neighbor
- Raids come from nearby hostile settlements
- Ruin reclamation requires nearby thriving settlements
- All game mechanics are inherently spatial/neighborhood-dependent

## Implementation: Neighborhood-Enriched GLMM

### Changes made:

1. **`cell_transition.py`**: Added `include_neighborhood_features` flag
   - Computes 1-ring neighbor class composition per cell per timestep
   - 6 new features: `nbr_empty_frac`, `nbr_settlement_frac`, `nbr_port_frac`, `nbr_ruin_frac`, `nbr_occupied_frac`, `nbr_forest_frac`
   - Accumulated per (step, y, x, current_class) across replay runs

2. **`smh_glmm.py`**: Full neighborhood feature support
   - `_nbr_feature_stack_from_probs()`: Computes neighborhood features from probability tensor during rollout
   - Modified training to include neighborhood features in design matrix
   - Modified rollout to recompute neighborhood features after each step
   - All checkpoint classes updated for backward compatibility

3. **New models registered**:
   - `smh_glmmlatent_z2_h0_covnbr_calnone_v001` - z2 latent + all 6 nbr features
   - `smh_glmmlatent_z4_h0_covnbr_calnone_v001` - z4 latent + all 6 nbr features
   - `smh_glmmlatent_z2_h0_covnbr3_calnone_v001` - z2 latent + 3 key nbr features

4. **Tests**: 2 passed for new models

## Experiment Log

### Benchmarks Launched

(Recording as they complete)

## Next Steps

1. Run dev benchmarks on new neighborhood models
2. If positive, run full 8-round promotion benchmarks
3. Implement direct terminal predictor (skip rollout)
4. Add interaction features (coast x settlement_nearby, etc.)
5. Explore ensemble of GLMM + direct terminal
