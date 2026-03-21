# Deep Bug Report v2: StateSpace Models & Unresolved Issues

I have investigated the new `StateSpaceStudent` and `StateSpaceTeacher` implementations, as well as reviewed the modifications made by the other agent. While the previous agent successfully fixed the exact-observation overriding bug in `QueryResidualPredictor`, several other major issues were either introduced or left completely unresolved.

Here are the detailed findings:

### 1. CRITICAL: Missing Probability Floor in `StateSpaceStudent`
**Location:** `StateSpaceStudent.predict_seed` (`src/astar/student/posterior/state_space_student.py`)
**The Bug:**
Every other predictor in the codebase strictly applies `apply_probability_floor` to its final predictions. `StateSpaceStudent.predict_seed` bypasses this entirely:
```python
    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> np.ndarray:
        posterior = self.infer_regime(context)
        return self.teacher.posterior_predictive(
            context.round_context.seeds[seed_index],
            posterior,
            n_rollouts=self.decoder_rollouts,
        )
```
`StateSpaceTeacher.posterior_predictive` generates probability tensors purely by counting grid frequencies over `n_rollouts` (which defaults to numbers like 64). Any terminal event that does not occur in these finite rollouts receives a strict probability of `0.0`. 
**Why this is severe:** When this model's outputs are passed to `cellwise_kl_divergence` (during evaluation or distillation workflows), the `0.0` prediction against a positive ground truth mathematically forces `np.log(0)` leading to infinite divergences (`-inf` / `NaN` crashes in metrics logs). I explicitly verified this via script.

### 2. UNRESOLVED: Train/Serve Skew (Offline Evidence vs Live Data)
**Location:** `QueryResidualPredictor` & `SeedEvidenceBundle` (`src/astar/observe/evidence.py` and `src/astar/student/predictor/query_residual.py`)
**The Bug:**
The previous agent did *not* fix the data skew bug I discovered earlier. 
In `QueryResidualPredictor`:
- When running live/online (`_stats_from_observations`), the features use the fully calculated distributions: `owner_count, largest_owner_share, owner_hhi = _owner_summary(seed_observations)`
- When running from offline bundles (`_stats_from_seed_evidence`), these are hardcoded entirely:
  ```python
  owner_count=0.0,
  largest_owner_share=0.0,
  owner_hhi=0.0,
  ```
This introduces a severe mathematical shift in the features being fed to the linear model `self.coefficients` depending entirely on whether inference is live or batch.

### 3. ARCHITECTURAL RISK: `StateSpaceStudent` Calibrating with MAE instead of Cross-Entropy
**Location:** `StateSpaceStudent._select_terminal_mixture` (`src/astar/student/posterior/state_space_student.py`)
**Observation:**
When fitting the terminal mixture hyperparameters (`proposal_mass` and `bandwidth`), the student evaluates its calibration by calculating the Mean Absolute Error against the target probabilities:
```python
total += float(np.mean(np.abs(prediction - target)))
```
Because target probability grids are hyper-sparse (i.e. ~90% of cells are empty land with probability ~1.0, and rare events like ports are highly localized), L1 distance mathematically heavily discounts rare events. A model that rigidly outputs 0% for all rare events will score exceptionally well under MAE. Standard probabilistic calibration typically utilizes Cross-Entropy or KL-Divergence to heavily penalize confident blindness. 

### 4. UNRESOLVED: Heuristic Logit Shift Drowned out by Floors
**Location:** `LatentRegimePredictor.build_prediction_bundle` (`src/astar/student/predictor/heuristic.py`)
**Observation:** 
As noted previously, the codebase shifts logits using additive numbers:
```python
logits = np.log(np.maximum(base_prediction, 1e-6))
logits[..., 1] += regime.expansion * (1.1 * settlement_proximity + 0.7 * frontier_score)
```
A base probability of `1e-6` evaluates to `-13.8` in log space. Adding `+1.8` brings it to `-12.0`. After softmax, this remains infinitesimally close to 0%. The regime modifiers functionally cannot create new mass where the `base_prediction` assigned a near-zero floor; they only marginally perturb already-likely events.

---
*No files were modified during this investigation. Please advise if I should proceed with applying fixes.*
