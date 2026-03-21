# Deep Bug Report v3: StateSpace Validations & Unresolved Skew

I have completed another exhaustive audit of the codebase, focusing on the newly introduced `StateSpace` models and verifying the status of the previously reported bugs.

### Summary of Fixes:
- **FIXED:** The `_exact_cell_blend` logic in `QueryResidualPredictor._postprocess_prediction` was correctly moved to the end of the blend chain. Exact observations from the query budget now cleanly override all priors with 100% mathematical certainty. Excellent fix!

### Existing Unresolved Issues:

**1. CRITICAL: Missing Probability Floor in `StateSpaceStudent` / `SummaryBankStudent`**
The `apply_probability_floor` logic remains completely missing from `StateSpaceStudent.predict_seed` (and `SummaryBankStudent`). The `StateSpaceTeacher` directly generates its terminal probabilities via MC rollouts (`n_rollouts=64` etc). This means if a cell does not spawn a settlement during the finite 64 runs, its output probability is exactly `0.0`. During offline evaluation, if the ground-truth has a settlement on that cell, `cellwise_kl_divergence` evaluates `np.log(0.0)` which mathematically causes `-inf`/`NaN` crashes across the entire metric pipeline. 
*Fix needed:* `return apply_probability_floor(self.teacher.posterior_predictive(...), self.probability_floor)`

**2. CRITICAL: Train/Serve Skew (Offline Evidence vs Live Data)**
In `src/astar/student/predictor/query_residual.py`, `_stats_from_seed_evidence` still blindly hardcodes `owner_count=0.0`, `largest_owner_share=0.0`, and `owner_hhi=0.0`. However, `_stats_from_observations` correctly computes these values dynamically. This means `QueryResidualPredictor` receives entirely different feature vector distributions depending on whether it is running in batch mode vs online mode.

**3. ARCHITECTURAL: `StateSpaceStudent` MAE Calibration**
In `StateSpaceStudent._select_terminal_mixture`, the model selects its bandwidth and proposal mass hyperparameters using Mean Absolute Error (`np.mean(np.abs(prediction - target))`). Because target matrices are highly sparse (~90% zeros representing empty land), L1 distance mathematically heavily penalizes false positives but barely registers false negatives on rare events (like ports). Models typically calibrate on Cross-Entropy to penalize blindness.

**4. MATHEMATICAL: Heuristic Logit Shifts vs Floors**
`LatentRegimePredictor` (`src/astar/student/predictor/heuristic.py`) attempts to inject regime heuristics by adding scalars (e.g., `+1.8`) directly to `logits` initialized from floored base predictions (like `np.log(1e-6)` which is `-13.8`). Adding `1.8` brings the logit to `-12.0`, which mathematically evaporates upon softmax.

### NEW FINDING: Physical Simulation Violations

**5. BUG: `StateSpaceTeacher` Spawns Inland Ports**
In `StateSpaceTeacher._simulate_step` (`src/astar/teacher/dynamics/state_space_teacher.py`), the model handles `port_gain` transitions strictly via logistic regression probabilities:
```python
port_gain_probability = ... self._predict_binary_scalar(..., "port_gain", ...)
```
And for ruin rebuilding:
```python
rebuild_port_weight = ... self._predict_binary_scalar(..., "rebuild_port", ...)
```
Because linear/logistic models merely shrink coefficients based on features rather than strictly enforcing zeros, `port_gain_probability` can evaluate to a small positive fraction (e.g. 0.001) even if the `coast` feature is `0.0`. Since there are hundreds of cells over 50 steps, this mathematically results in the stochastic simulation legally spawning ports on deep inland tiles.
*Verification:* I confirmed this empirically via a script (`test_inland_ports.py`) that forces a rollout with a high regime multiplier—it actively spawned a port on a cell with `coast < 0.5`. 
*Fix needed:* `port_gain_probability` and `rebuild_port_weight` must be mathematically masked (multiplied by `bundle.feature("coast")`) before the `rng.random()` check.

---
*I have purposefully not committed any code changes, adhering strictly to my mandate to research and report.*
