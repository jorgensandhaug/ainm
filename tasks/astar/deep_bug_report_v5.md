# Deep Bug Report v5: Missing Commits & Final Verifications

I have completed a rigorous final audit. **The other agent's fixes are entirely missing from the active branch (`jorge`).** My `git pull` from `origin/jorge` did not bring down any fixes for `QueryResidualPredictor` or the `StateSpace` models. If the agent fixed them, they pushed to an isolated branch or failed to commit. Therefore, physically, the codebase still contains the bugs.

To respect your prompt, I meticulously re-evaluated my previous findings to see if any were "features, not bugs." I have retracted one hallucinated detail, but I can definitively confirm the rest are **severe mathematical flaws** that must be fixed.

Here is the exact truth of the codebase on `HEAD`:

### 1. BUG: Missing Probability Floor (`StateSpaceStudent.predict_seed`)
**Status: STILL ACTIVE AND FATAL.** 
The code returns `self.teacher.posterior_predictive(...)` nakedly. Because this is derived from Monte Carlo counts, rare events will get a strict `0.0` probability. Downstream, `cellwise_kl_divergence` evaluates `np.log(safe_q)`. When `q=0.0`, `safe_q=1.0`, meaning `np.log(safe_q)=0.0`. The `score.py` file manually overrides this: `np.where(infinite_cells, np.inf, cellwise)`. A single unrolled cell with `0.0` prediction against a positive ground truth mathematically forces the entire evaluation score to `0.0`. 
*Fix:* Wrap the return statement in `apply_probability_floor(..., self.probability_floor)`.

### 2. BUG: Train/Serve Skew (`QueryResidualPredictor`)
**Status: STILL ACTIVE.** 
`_stats_from_seed_evidence` permanently hardcodes `owner_count=0.0` while live training dynamically computes it. This structurally corrupts offline validation because the residual coefficients are multiplied against a completely different feature scale.

### 3. BUG: MAE Calibration (`StateSpaceStudent._select_terminal_mixture`)
**Status: STILL ACTIVE.** 
Optimizing terminal probability mixtures via Mean Absolute Error (`np.mean(np.abs(prediction - target))`) is mathematically incorrect for highly sparse spatial targets. Because ~90% of the map is empty land (100% vs 100%), L1 distance heavily rewards a model that just conservatively outputs 0% for all rare features to minimize false-positive penalties. It must be optimized via KL Divergence.

### 4. BUG: Heuristic Logits vs Floors (`LatentRegimePredictor`)
**Status: STILL ACTIVE.** 
The baseline probabilities are floored to `1e-6`, which maps to `-13.8` in log-space. The regime modifiers add scalars like `+1.8`. Adding `1.8` to `-13.8` results in `-12.0`, which perfectly softmaxes back to `0.0`. The heuristic logic physically cannot rescue probabilities from the floor.

### 5. BUG: StateSpace Simulation Spawning Inland Ports
**Status: REFINED AND STILL ACTIVE.** 
I previously claimed this affected three pathways. *Correction:* `birth` (new settlements) are strictly born with `has_port=False` and do not break the rules. 
*However*, `port_gain_probability` (live settlements gaining ports) and `rebuild_port_weight` (ruins becoming ports) **still completely lack `coast` masking**. Because logistic regression never outputs absolute `0.0`, the simulation RNG can and will spawn ports deep inland over 50 steps.
*Fix:* `port_gain_probability` and `rebuild_port_weight` MUST be multiplied by `feature_vector["coast"]` before running `rng.random()`.

---
*No code was changed. Please review this with the implementation agent and ensure they push their fixes to the `jorge` branch.*
