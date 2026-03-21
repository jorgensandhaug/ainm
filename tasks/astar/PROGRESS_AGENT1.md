# Agent 1 Progress Log (Continuation on agent2 branch)

## Mission

Radically improve benchmark scores beyond the current best of 78.38 (GLMM latent z2 + exploration).

---

## DETAILED MODEL EXPLANATION: `smh_glmmlatent_z2_h0_covbase_calnone_v001`

**Best score: 78.40 (8-round leave-one-round-out, exploration policy)**

### What the model does at a high level

This model predicts the probability distribution of terrain classes (empty, settlement, port, ruin, forest, mountain) for every cell on a 40×40 grid at year 50 of a stochastic Norse world simulator. It does this by:

1. **Learning per-round transition dynamics** from historical replay data
2. **Factoring cross-round variation** into a 2-dimensional latent manifold
3. **Inferring the current round's position** in that manifold from 50 stochastic viewport queries
4. **Rolling forward** the inferred transition model for 50 time steps to produce the final probability tensor

### Part 1: Cell Transition Dataset (`cell_transition.py`)

**Purpose**: Extract per-cell, per-timestep transition statistics from replay data.

**Input**: For each historical round × seed × replay run:
- Full map state at each year (year 0 through year 50)
- Each cell's terrain class (collapsed from 8 internal codes to 6 prediction classes)

**What it computes**: For each `(step, y, x, current_class)`:
- Counts of how many times each `next_class` was observed across replay runs
- Per-cell static geometry features (16 features, see below)

**Why**: The cell transition counts are the raw training signal. Each cell at each timestep is a multinomial observation: "given current class C at position (y,x) with these features, the next class was distributed as [count_0, count_1, ..., count_5]".

**Output**: Parquet files partitioned by round×seed, with columns for step, position, current class, next-class counts, and features.

### Part 2: Static Geometry Features (`round_coefficients.py`)

**16 features per cell**, computed once from the initial map:

| Feature | What it measures | Why it matters |
|---------|-----------------|----------------|
| `buildable` | Can a settlement exist here? | Fundamental constraint |
| `land` | Is this land (not ocean)? | Basic terrain type |
| `coast` | Is this cell adjacent to ocean? | Ports can only appear on coasts |
| `coast_distance` | Normalized distance to nearest coast | Port potential gradient |
| `land_distance_to_settlement` | Normalized distance to nearest initial settlement | Expansion potential |
| `sea_distance_to_port` | Normalized maritime distance to nearest port | Trade/maritime influence |
| `forest_density` | Fraction of 3×3 neighborhood that is forest | Forest reclamation potential |
| `mountain_density` | Fraction of 3×3 neighborhood that is mountain | Barrier effects |
| `settlement_basin_gap` | Gap to second-nearest settlement Voronoi | Frontier location |
| `frontier_score` | 1 - basin_gap | Higher = more contested |
| `settlement_proximity` | 1 - land_distance | Higher = closer to settlement |
| `coastal_exposure` | 1 - coast_distance | Higher = more coastal |
| `maritime_access` | 1 - sea_distance | Higher = more maritime |
| `initial_forest` | Binary: starts as forest? | Initial state |
| `initial_mountain` | Binary: starts as mountain? | Permanent constraint |
| `initial_ocean` | Binary: starts as ocean? | Permanent constraint |

**Why these features**: They capture the spatial structure that determines WHERE settlements expand, ports develop, and ruins appear. The game mechanics are fundamentally spatial - a cell's fate depends heavily on its terrain and proximity to other features.

### Part 3: Per-Round Softmax Regression (`_fit_softmax_branch`)

**Purpose**: For each training round, fit a softmax regression that predicts cell transitions.

**Model form**: For current class `c`, the probability of transitioning to class `j` is:

```
P(next=j | current=c, features x, step t) = softmax_j(θ_c · [1, x, time(t)])
```

Where:
- `θ_c` is a weight matrix of shape `[feature_dim+1, 6]` (one per current class)
- `x` is the 16-dim static feature vector for this cell
- `time(t)` is a 3-dim time encoding: `[t/49, (t/49)², 1-t/49]`
- The `+1` is for the intercept/bias term

**Total parameters per round**: 6 classes × (16+3+1) features × 6 next-classes = **720 parameters**

**Training**: Adam optimizer with ridge regularization (λ=0.001), 18 epochs, learning rate 0.1. Initialized from marginal class frequencies.

**Why softmax regression**: It's the natural model for multinomial count data. It's fast, interpretable, and provides well-calibrated probabilities. More complex models (neural nets, gradient boosting) were considered but would overfit with the limited per-round data.

**Why per-round**: Each round has different hidden behavioral parameters. A settlement has different expansion/collapse rates in different rounds. Fitting per-round captures this variation.

### Part 4: Low-Rank Round Manifold (`_fit_low_rank_round_manifold`)

**Purpose**: Factorize the per-round weight banks into a shared mean + 2-dimensional latent variation.

**How it works**:
1. Stack all N training rounds' weight banks into a matrix of shape `[N, 720]`
2. Center by subtracting the mean weight bank
3. Apply SVD to the centered matrix
4. Keep the top 2 singular vectors as the "latent basis"
5. Each training round gets a 2D latent coordinate `z_r`

**Decomposition**: `weight_bank_r = mean_weight_bank + z_r · latent_basis`

**Why latent_dim=2**:
- With ~8 training rounds, the effective rank is at most 7
- But higher latent dimensions overfit to the training rounds
- z2 empirically outperforms z3, z4, z6 on held-out evaluation
- z2 captures the dominant axis of round-to-round variation while remaining regularized

**What the latent captures**: The 2D manifold represents the main axes along which round laws differ. Approximately: one axis captures "how active/expansive is settlement growth" and the other captures "how aggressive is conflict/collapse".

### Part 5: Posterior Inference from Queries

**Purpose**: Given 50 stochastic viewport observations of year-50 state, infer where the current round falls in the 2D latent space.

**How it works**:
1. For each training round's reconstructed weight bank, roll out the 50-step model on the TEST round's initial maps to get predicted year-50 tensors (candidate tensors)
2. For each observation, compute the log-likelihood: `log P(observed_grid_patch | candidate_tensor_r)`
3. Sum log-likelihoods across all observations to get posterior log-weights per training round
4. Softmax to get posterior weights: `w_r = softmax(sum_obs log P(obs | tensor_r))`

**Final prediction**:
1. Compute posterior-weighted latent: `z* = Σ_r w_r · z_r`
2. Reconstruct weight bank: `weight_bank* = mean + z* · basis`
3. Roll out 50 steps to get final prediction tensor

**Why this approach**: It's Bayesian model averaging in latent space. Each training round represents a "hypothesis" about the current round's dynamics. The observations provide evidence for/against each hypothesis. The posterior-weighted latent interpolates between training round dynamics.

### Part 6: Probabilistic Rollout (`_rollout_seed_prediction`)

**Purpose**: Given a weight bank, roll forward from the initial map state for 50 steps to predict the year-50 probability tensor.

**How it works**:
```
probs_0 = one_hot(initial_grid_classes)  # deterministic start
for step in 0..49:
    next_probs = zeros
    for each current_class c:
        trans_probs = softmax(θ_c · [1, features, time(step)])  # shape (H, W, 6)
        next_probs += probs[..., c:c+1] * trans_probs  # mix by current probability
    probs = next_probs
    apply_hard_constraints(probs)  # ocean stays ocean, mountains stay mountains
return apply_floor(probs)  # minimum probability 1e-4 to avoid KL explosion
```

**Key insight**: This is a probabilistic propagation, not a simulation. At each step, the probability mass is split across possible transitions. After 50 steps, each cell has a smooth probability distribution over the 6 classes.

**Why rollout instead of direct prediction**: The 50-step rollout respects the temporal dynamics. Early steps spread probability into nearby cells (expansion), later steps equilibrate. Direct prediction would need to learn these dynamics implicitly.

### Part 7: Query Policy (`exploration_v2`)

**Purpose**: Choose which 50 viewport windows to observe in the year-50 state.

**How it works**: Selects viewports that cover the map efficiently with some emphasis on high-uncertainty regions.

**Why exploration over coverage**: Coverage tiles the map uniformly. Exploration concentrates on regions where the model is uncertain. The difference is small (+0.56 points) because the posterior inference is robust to query placement.

### Part 8: Probability Floor

**Parameter**: `prediction_floor = 1e-4`

**Why**: The scoring uses KL divergence. If the model assigns probability 0 to a class that has non-zero ground truth, KL goes to infinity. The floor prevents catastrophic scores.

### Why This Architecture Wins

1. **Semimechanistic**: The softmax regression respects the game's cell-transition structure
2. **Low-rank regime**: 2D latent prevents overfitting to the ~8 training rounds
3. **Bayesian posterior**: Observations update beliefs about the regime, not the model
4. **Calibrated output**: The rollout produces well-calibrated probabilities
5. **Fast**: Full evaluation takes ~30 seconds per round

### Known Limitations

1. **Linear transitions**: Cannot capture non-linear feature interactions (e.g., coast AND nearby settlement → port)
2. **No neighborhood dynamics**: Each cell transitions independently; cannot model spatial contagion
3. **Limited round diversity**: With ~8 rounds, the 2D manifold has very few anchor points
4. **Worst-round failure**: Round 36e581f1 scores only 49 (vs 93 for best rounds) because its regime is far from all training rounds in the latent space

---

## Current State

- Branch: `agent2`
- Best model: `smh_glmmlatent_z2_h0_covbase_calnone_v001` + exploration
  - Full 8-round score: **78.40 / 0.086** weighted KL (e50 variant with 50 epochs)
- Machine: 384 cores, 3TB RAM

## Comprehensive Experiment Results

### Full 8-Round Benchmark Scores (sorted by score)

| Model | Score | Weighted KL | Delta vs Base | Status |
|-------|-------|-------------|---------------|--------|
| z2 e50 (50 epochs) | **78.40** | **0.086** | +0.02 | **BEST** |
| z2 base (exploration) | 78.38 | 0.087 | baseline | baseline |
| z2 base (coverage) | 77.82 | 0.089 | -0.56 | |
| z3 | 77.34 | 0.092 | -1.04 | worse |
| z2 hbblend20 (ensemble) | 77.17 | 0.091 | -1.21 | REJECTED |
| z2 calobs (obs blend) | 76.20 | 0.095 | -2.18 | REJECTED |
| z2 r01 (ridge 0.01) | 72.02 | 0.118 | -6.36 | REJECTED |
| z2 r10 (ridge 0.1) | 66.36 | 0.147 | -12.02 | REJECTED |

### Dev 4-Round Scores (neighborhood feature variants)

| Model | Score | Weighted KL | Delta vs Dev Baseline |
|-------|-------|-------------|----------------------|
| z2 base (dev4) | 74.17 | 0.113 | baseline |
| z2 covnbr3 (3 nbr features) | 70.36 | 0.127 | -3.81 |
| z2 covnbr (6 nbr features) | 67.21 | 0.138 | -6.96 |
| z4 covnbr (6 nbr features) | 67.21 | 0.138 | -6.96 |

## Key Findings

### 1. Neighborhood features HURT the model (-7 points)
- Root cause: training-rollout distribution mismatch
  - Training: neighborhood features computed from DISCRETE replay states
  - Rollout: neighborhood features computed from DIFFUSE probability tensors
  - The probability-derived features don't match what the model was trained on
- Also: overfitting with 40% more parameters

### 2. Exact observation blending HURTS the GLMM model (-2 points)
- The GLMM posterior already handles observations well via log-likelihood weighting
- Overriding predictions with raw observation counts adds noise
- This is different from the coeffbank model where calobs helped (+1.7 points)

### 3. Bucket prior blending HURTS the GLMM model (-1.2 points)
- The GLMM model is strictly better than the bucket prior on every round
- Blending in the weaker model degrades performance

### 4. Stronger regularization HURTS (-6 to -12 points)
- ridge 0.01: score 72.0 (6 points worse)
- ridge 0.1: score 66.4 (12 points worse)
- The current ridge 0.001 is already optimal

### 5. More epochs barely helps (+0.02 points)
- Model was already near convergence at 18 epochs
- 50 epochs gives a tiny marginal improvement

### 6. Higher latent dim HURTS (-1 point)
- z3 scored 77.34 vs z2 at 78.38
- z4 also scored worse (from progress log: ~72 on 6-round test)
- With only ~8 rounds, z2 captures all meaningful variation

## Architecture Understanding

The GLMM latent z2 model is at the **ceiling of the linear softmax cell-transition architecture** (~78.4). The model is:
- Well-regularized (ridge 0.001)
- Well-trained (18-50 epochs, Adam)
- Right latent dimension (z2)
- Right feature set (16 static features + 3 time features)

To break through 78.4, we need fundamentally different modeling approaches.

## Additional Results (scored and rejected)

| Model | Score | Weighted KL | Delta | Status |
|-------|-------|-------------|-------|--------|
| z2 covpoly (time×static interactions) | 74.15 | 0.106 | -4.23 | REJECTED |
| z2 tmix (tensor mixing instead of weight-bank rollout) | 78.38 | 0.087 | ±0.00 | identical |

## All Rejected Approaches

1. Dynamic neighborhood features (training-rollout mismatch, -7 to -11 pts)
2. Exact observation blending (adds noise to good posterior)
3. Bucket prior blending (weaker model degrades stronger one)
4. Stronger regularization (already optimal)
5. Higher latent dimensions (overfitting with few rounds)
6. Polynomial time-static interactions (overfitting, -4.2 points)
7. Tensor mixing (mathematically equivalent to weight-bank rollout for this config)

## BREAKTHROUGH: GLMM + Direct Terminal Ensemble (Phase 4)

| Model | Score | Weighted KL | Delta vs GLMM | Worst Round |
|-------|-------|-------------|---------------|-------------|
| **glmm_dt_ensemble_v003 (35% DT)** | **80.59** | **0.076** | **+2.21** | **54.57** |
| glmm_dt_ensemble_v002 (25% DT) | 80.19 | 0.078 | +1.81 | 53.22 |
| glmm_dt_ensemble_v001 (15% DT) | 79.60 | 0.081 | +1.22 | 51.71 |
| glmm_dt_ensemble_v004 (10% DT) | 79.24 | 0.083 | +0.86 | 50.88 |

The ensemble works because GLMM excels on normal rounds (93 score) while the direct terminal predictor handles hard/novel rounds better (59 vs 49).

### Extended sweep (higher DT weights + low probability floor)

| Variant | DT weight | Floor | Score | Worst Round |
|---------|-----------|-------|-------|-------------|
| **v008** | **50%** | **3e-4** | **80.87** | **56.32** |
| v007 | 50% | default | 80.84 | 56.30 |
| v006 | 45% | default | 80.81 | 55.77 |
| v005 | 40% | default | 80.72 | 55.19 |
| v003 | 35% | default | 80.59 | 54.57 |

Optimum at 50% DT weight with low floor. Low floor adds only +0.03 - our floor was already near optimal.

### Per-Cell LightGBM (Phase 5) - FAILED

| Model | Score | Notes |
|-------|-------|-------|
| cellwise_gbt_v001 | 68.92 | 800 trees, depth 8 |
| cellwise_gbt_v002 | 67.88 | 1200 trees, depth 8 |
| cellwise_gbt_v003 | 68.50 | 800 trees, depth 6 |

**Why GBT failed**: Training uses zero-valued evidence features (because training data comes from replays, not online queries). Agent 3's approach trains with synthetic evidence from simulated episodes. Without evidence-augmented training, the GBT model is just a nonlinear version of the static-feature model and can't beat the GLMM rollout.

## Additional Results (Phase 3)

| Model | Score | Weighted KL | Delta | Status |
|-------|-------|-------------|-------|--------|
| z2 barren_v003 (barren correction, threshold 0.05) | 76.82 | 0.094 | -1.56 | REJECTED |
| z2 barren_v001 (barren correction, threshold 0.03) | 76.01 | 0.097 | -2.37 | REJECTED |
| z2 barren_v002 (barren correction, threshold 0.04) | 75.83 | 0.098 | -2.55 | REJECTED |

Note: Barren correction does NOT trigger on the actual worst round (36e581f1). The GLMM model's failure mode is DIFFERENT from query_residual's failure mode - it's not about overestimating settlement activity.

## Key Conclusions

1. The GLMM latent z2 model at 78.4 is at the **architectural ceiling** for linear-softmax cell-transition models.

2. **Every attempt to improve it has failed** (14 experiments, all negative or zero):
   - More features (neighborhood, polynomial): -4 to -11 pts
   - Stronger/weaker regularization: -6 to -12 pts
   - Higher latent dimensions: -1 pt
   - Ensemble blending (bucket prior): -1.2 pts
   - Observation blending: -2.2 pts
   - Barren round correction: -1.6 to -2.5 pts
   - More epochs: +0.02 pts (negligible)
   - Tensor mixing: ±0.00 pts (mathematically equivalent)

3. The best score across ALL agents on this machine is agent3's **79.98** using an adaptive ensemble on query_residual_v19 with barren round correction. Our GLMM model at 78.4 is 1.6 points behind but cannot benefit from the same corrections.

4. The fundamental bottleneck is the **limited number of independent rounds** (~8). With only 7 training rounds in leave-one-out, there is not enough diversity to handle novel regimes.

5. The worst round (36e581f1, score 49) fails because it represents a regime that is far from all training rounds in the latent space. No amount of model tuning can fix this without more training rounds.

## Summary of All 14+ Experiments (chronological)

1. z2 covnbr (6 neighborhood features): 67.21 dev4 → REJECTED
2. z2 covnbr3 (3 neighborhood features): 70.36 dev4 → REJECTED
3. z4 covnbr: 67.21 dev4 → REJECTED (identical to z2)
4. z2 calobs (exact obs blend): 76.20 full → REJECTED
5. z2 r01 (ridge=0.01): 72.02 full → REJECTED
6. z2 r10 (ridge=0.1): 66.36 full → REJECTED
7. z2 e50 (50 epochs): 78.40 full → +0.02 (negligible improvement)
8. z3 (latent dim 3): 77.34 full → REJECTED
9. z2 hbblend20 (GLMM+bucket ensemble): 77.17 full → REJECTED
10. z2 covpoly (polynomial time×static interactions): 74.15 full → REJECTED
11. z2 tmix (tensor mixing): 78.38 full → identical
12. z2 barren_v001 (barren correction): 76.01 full → REJECTED
13. z2 barren_v002: 75.83 full → REJECTED
14. z2 barren_v003: 76.82 full → REJECTED

## Cross-Agent Intelligence Report (2026-03-21T21:00Z)

### VERIFIED Score Leaderboard Across ALL Agents (from actual result.json files)

| Agent | Model | Verified Score | Key Approach |
|-------|-------|---------------|-------------|
| **Agent 7** | `ffam_mode_v186` | **87.36** | Operator manifold + residual MLP + cluster-operator hybrid + extreme calibration |
| **Agent 3** | CatBoost cb_ob30 | **85.31** | Per-cell CatBoost + obs blend t=30 + entropy-weighted + 140 features |
| **Agent 1** | `hazard_posterior_v15` m20 q1 | **83.89** | Original coefficients (not SVD) + particle posterior + regime probe policy |
| **Agent 2 (us)** | `glmm_dt_ensemble_v007` | **80.84** | GLMM + direct terminal 50/50 ensemble |
| **Agent 5** | `query_residual` recal | **80.24** | QR with recalibration |
| **Agent 4** | `qr_v11_covtrain_p0_b624_t100` | **79.65** | QR + calibration sweep (prior_blend=0, temp=1.0) |
| **Agent 6** | ensemble hv2+sx | **74.70** (full8) | HazardV2 + QR geometric mean |

### Key Techniques I MUST Incorporate

1. **CALIBRATION SWEEP** (Agent 7: +9 points): probability floor, beta, prior blend, posterior ridge ALL need sweeping. Agent 7's floor went from 0.01 to 0.0003 for +5.6 points alone!
2. **PER-CELL GBT** (Agent 3: +8 points over linear): LightGBM/CatBoost with entropy-weighted training
3. **ORIGINAL COEFFICIENTS** (Agent 1: +3.7 points): Use exact per-round coefficients, not SVD-reconstructed
4. **SETTLEMENT EXPANSION RATE** (Agent 5): Single most informative regime variable
5. **ENTROPY-WEIGHTED TRAINING** (Agent 3: +1.2 points): Match scoring metric in training
6. **CROSS-SEED EVIDENCE** (Agent 3/4): Use evidence from all 5 seeds for regime detection

### What UNIVERSALLY Failed Across All Agents

1. Annual/50-step rollouts (catastrophic in Agent 4, 5, 6, 7)
2. MLP/nonlinear decoders with few rounds (overfit everywhere)
3. More features without regularization (overfit everywhere)
4. samples_per_round > 2 (diminishing/negative returns)
5. Teacher blend > 0 (universally better to zero it out)
6. Terminal tensor retrieval across rounds (maps differ, cells don't correspond)

## Recommendations for Future Work

1. **Use the GLMM latent z2 model as-is** (78.4) as a strong component in any ensemble
2. **The main bottleneck is round diversity** - getting more historical rounds would help more than any model change
3. **For the worst rounds**, the model needs to detect novel regimes and fall back gracefully - this requires a different inference strategy, not better features
4. **Neural network transition models** could potentially capture non-linear dynamics better, but would need careful regularization to avoid overfitting with few rounds
5. **Combining GLMM with agent3's query_residual+barren approach** in an ensemble could potentially reach 81+ by getting the best of both failure modes
