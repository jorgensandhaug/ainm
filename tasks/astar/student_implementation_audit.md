# Student Model Implementation Audit Report

This report details the findings from an exhaustive deep dive into the student model implementation (`src/astar/student/`). The goal is to surface potential logical bugs, mathematical inconsistencies, and areas of architectural risk. 

Please review these findings carefully. Some may be intentional design choices (e.g., regularization techniques) rather than explicit bugs, but they warrant deep reflection to ensure they align with the intended probabilistic behavior.

---

## 1. Unmasked Prior Blending Overriding Exact Observations
**Location:** `QueryResidualPredictor._predict_from_derived` (`src/astar/student/predictor/query_residual.py`)

**Observation:**
The core logic for merging live query observations into the prediction relies on `_exact_cell_blend`. After exact counts are factored in, the code performs two additional global blends: `teacher_blend` and `effective_prior_blend`.

For the `teacher_blend`, the code explicitly prevents the teacher from overriding exactly observed cells by masking out the weight:
```python
teacher_weight = np.where(
    np.sum(exact_counts, axis=-1, keepdims=True) > 0.0,
    0.0,  # <-- 0.0 weight if observed
    self.teacher_blend,
)
prediction = ((1.0 - teacher_weight) * prediction) + (teacher_weight * teacher_prior)
```
However, the `effective_prior_blend` immediately following it **lacks any masking**:
```python
if effective_prior_blend > 0.0:
    prediction = ((1.0 - effective_prior_blend) * prediction) + (effective_prior_blend * prior)
```

**Why this matters:**
Because `effective_prior_blend` evaluates globally (often between 0.35 and 0.75), it systematically injects the un-informed prior back into strictly observed cells. 
* If a query observes a cell as a `port` with 100% confidence, but the prior expected it to be `empty` (90%), the final prediction mathematically forces the probability of `port` down to ~65%, wasting the query budget's exactness.
* **To reflect on:** Is this an intentional temporal regularization mechanism (e.g., reflecting that an early query observation might drift by round end), or is it a bug that is accidentally discarding hard evidence?

---

## 2. Train/Serve Skew: Offline vs. Online Evidence Features
**Location:** `QueryResidualPredictor` & `SeedEvidenceBundle` (`src/astar/observe/evidence.py`)

**Observation:**
The `QueryResidualPredictor` derives statistical features differently depending on the inference context:
1. **Online/Live:** (`_stats_from_observations`)
   Extracts rich owner statistics: `owner_count, largest_owner_share, owner_hhi = _owner_summary(...)`
2. **Offline/Batch:** (`_stats_from_seed_evidence`)
   When building predictions from an existing `RoundEvidenceBundle` (e.g., during evaluation or offline training), it hardcodes these to zero:
   ```python
   owner_count=0.0,
   largest_owner_share=0.0,
   owner_hhi=0.0,
   ```

**Why this matters:**
The `SeedEvidenceBundle` schema currently lacks fields for `owner_count`, `largest_owner_share`, and `mean_hhi`. If `QueryResidualPredictor` is evaluated, distilled, or retrained using offline evidence artifacts, it will see feature vectors populated with `0.0` for owner metrics. In live online deployment, it will see the real calculated distributions.
* **To reflect on:** Does the offline evaluation or training pipeline for `QueryResidualPredictor` rely on `_stats_from_seed_evidence`? If so, this train-serve feature skew needs to be patched by expanding the `SeedEvidenceBundle` schema.

---

## 3. Heuristic Logit Shifting vs. Heavy Floors
**Location:** `LatentRegimePredictor.build_prediction_bundle` (`src/astar/student/predictor/heuristic.py`)

**Observation:**
When applying latent regime multipliers to base predictions, the logic shifts probabilities in log space:
```python
logits = np.log(np.maximum(base_prediction, 1e-6))
logits[..., 1] += regime.expansion * (1.1 * settlement_proximity + 0.7 * frontier_score)
# ...
shifted = logits - np.max(logits, axis=-1, keepdims=True)
probabilities = np.exp(shifted)
```

**Why this matters:**
The `base_prediction` often contains heavily floored values. A probability of `1e-6` maps to approximately `-13.8` in log space. A dominant class (e.g., `0.9`) maps to approximately `-0.1`.
The additive heuristic bumps being applied are relatively small (e.g., `+0.5`, `+1.4`). 
* If the base prediction for a port is floored at `-13.8`, a `+1.4` bump brings it to `-12.4`. After softmax, this remains infinitesimally small and does not alter the argmax or heavily shift the distribution.
* **To reflect on:** Were the magnitudes of these heuristic weights tuned with the `log(1e-6)` scale in mind? If the goal is for the regime to forcibly override the prior in specific regions, these additive scalars might be mathematically insufficient to "rescue" a class from the probability floor. 

---

## 4. Architectural Note: Exact Cell Beta Blending
**Location:** `QueryResidualPredictor._exact_cell_blend` (`src/astar/student/predictor/query_residual.py`)

**Observation:**
The formula used to blend queries is:
```python
blended = (beta * prediction + exact_counts) / np.maximum(beta + count_total, 1e-6)
```
Where `beta` scales between `beta_min` (default 8.0) and `beta_min + beta_scale` based on the prior's entropy.

**Why this matters:**
If `beta` is 8.0, it requires `exact_counts` to reach 8 just to achieve a 50/50 blend with the prior. If the query policy only visits a cell 1-2 times, the exact observation will barely budge the prior prediction. 
* **To reflect on:** Is a base `beta` of 8.0 intentionally highly conservative regarding single-query observations, or should the model trust a single direct observation of a cell more aggressively?

