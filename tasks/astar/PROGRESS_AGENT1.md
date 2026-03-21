# Agent 1 Progress Log (Continuation on agent2 branch)

## Mission

Radically improve benchmark scores beyond the current best of 78.38 (GLMM latent z2 + exploration).

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

## Key Conclusion

The GLMM latent z2 model at 78.4 is at the **architectural ceiling** for linear-softmax cell-transition models with low-rank round manifolds. Every attempt to make the model richer (more features, interactions, regularization changes, ensemble blending) has either hurt or had zero effect.

To break through, we need a fundamentally different approach:
- Non-linear transition model (neural network)
- Direct terminal prediction (skip rollout)
- Much richer replay-derived features
- Or a completely different model family
