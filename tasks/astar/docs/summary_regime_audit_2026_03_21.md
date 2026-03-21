# Summary & Regime System Audit — 2026-03-21

## Scope

Full trace of the summary pipeline (what it takes as input, how it works, how it's trained) and the regime regression (what consumes the summaries and how). Includes bug analysis against the current working-tree state.

---

## Part 1: The Summary System

### High-Level Architecture

The summary system takes replay data from historical rounds and distills each round into a fixed-length numerical vector describing "how that round's dynamics behave." There are several distinct summary representations:

1. **Semimechanistic Coefficients** — spatial logistic regression per round
2. **Regime Summary Vector** — 12-element hand-crafted behavioral fingerprint
3. **Event Summary** — 26-element event-rate vector
4. **Dynamic Law Summary** — fitted regression models evaluated on canonical probes
5. **Behavioral Fingerprint** — probe-based summary with bootstrap uncertainty

---

### 1. Semimechanistic Coefficients (`round_coefficients.py`)

**Input**: A `RoundEpisode` containing per-seed data: initial world state (grid + settlements) and replay runs (frame-by-frame simulation snapshots).

**What it does**: For each round, fits three ridge logistic regressions predicting per-cell terminal probabilities:

| Model | Target |
|-------|--------|
| `build` | P(settlement or port or ruin) |
| `port` | P(port) |
| `ruin` | P(ruin) |

**Feature set**: 23 static spatial features per cell:
```
buildable, land, coast, coast_distance_steps_log1p, coast_distance_unreachable,
land_distance_to_settlement_steps_log1p, land_distance_to_settlement_unreachable,
sea_distance_to_port_steps_log1p, sea_distance_to_port_unreachable,
settlement_basin_gap_steps_log1p, settlement_basin_gap_unreachable,
coast_distance_decay_4, land_distance_to_settlement_decay_4,
sea_distance_to_port_decay_4, settlement_basin_gap_decay_4,
forest_density, mountain_density, coastal_exposure, maritime_access,
frontier_score, settlement_proximity, initial_forest, initial_mountain, initial_ocean
```

**Training**: Supervised closed-form ridge regression in logit space (`_fit_ridge_logit`, line 59):
1. Transform targets: `logit(p) = log(p / (1-p))`, clipped to `[1e-4, 1-1e-4]`
2. Design matrix: `[1 | features]` (intercept column prepended)
3. Penalty: `αI` with zero penalty on intercept, α = 0.01
4. Solve: `(X'X + αI)⁻¹ X'y` via pseudoinverse

**Output**: `RoundSemimechanisticCoefficients` with 3 intercepts + 3×23 coefficients = 72 numbers, flattened by `combined_vector()`. Plus a 12-element `regime_vector`.

---

### 2. Regime Summary Vector (`round_coefficients.py:152-199`)

A hand-crafted 12-dimensional behavioral fingerprint. **Not trained** — deterministic function of replay data.

**The 12 elements**:
```
[0]  mean build hit rate on buildable cells
[1]  mean build hit rate on coastal cells
[2]  mean build hit rate on inland cells
[3]  mean port hit rate on buildable cells
[4]  mean ruin hit rate on buildable cells
[5]  mean owner flip count on buildable cells
[6]  mean terminal settlement probability
[7]  mean terminal port probability
[8]  mean terminal ruin probability
[9]  mean survival curve value (average alive settlements over time)
[10] mean port curve value (average ports over time)
[11] mean ruin curve value (average ruin tiles over time)
```

Averaged across seeds via `round_regime_summary_vector()`.

---

### 3. Event Summary (`event_summary.py`)

**Input**: `ReplayEventTableBundle` — polars DataFrames of cell-level and settlement-level events.

**Output**: 26-element vector per seed (the `EVENT_SUMMARY_NAMES`), all rates per frame or per settlement:
```
cell_events_per_frame, build_events_per_frame, port_created_events_per_frame,
ruin_created_events_per_frame, rebuild_events_per_frame, ruin_to_forest_events_per_frame,
cleared_events_per_frame, births_per_frame, settlement_rebuilds_per_frame,
collapses_per_frame, collapse_to_ruin_per_frame, port_gains_per_frame,
port_losses_per_frame, owner_flips_per_frame, stat_changes_per_frame,
changed_settlement_share, mean_population_delta, mean_food_delta,
mean_wealth_delta, mean_defense_delta, mean_abs_population_delta,
mean_abs_food_delta, mean_abs_wealth_delta, mean_abs_defense_delta,
matched_ruin_created_events_per_frame, site_ruin_created_events_per_frame
```

Aggregated to round level by stacking and averaging.

---

### 4. Dynamic Law Summary (`dynamic_law.py`)

**Concept**: For each round, fit many small regression models (one per outcome: birth, collapse, port gain, population delta, etc.) against spatial/settlement features. Build a shared **probe library** of canonical feature vectors across all rounds. Evaluate each round's fitted models on the probes.

The summary is: "given these canonical situations, what does this round's dynamics predict?"

**The probe summary** (`RoundDynamicLawFit.probe_summary()`, line 703) evaluates each fitted head on the shared probe matrix and concatenates predictions + year-shock statistics. Produces a vector with dimensions like:
```
site_binary::site_ruin_created::probe_0, ...,
settlement_binary::collapse::probe_0, ...,
settlement_linear::population_delta::probe_0, ...,
pairwise_binary::dst_owner_flip_next::probe_0, ...,
year_shock::collapse_rate, year_shock::mean_food_delta, ...
```

---

### 5. Behavioral Fingerprint (`behavioral_fingerprint.py`, `behavioral_fingerprint_core.py`)

Similar to the dynamic law but with different target variables and bootstrap-averaged estimates. The "core" selection (`behavioral_fingerprint_core.py`) filters to stable probe blocks:
```
site_binary::, live_binary::, live_linear::, ruin_binary::,
pairwise_binary::, pairwise_linear::, owner_linear::
```

Supports multiple summary profiles (`core_v1`, `core_plus_year_shock_v1`, `full_v1`).

---

### The Summarization Pipeline

`summarize_round_replays()` (`summarize_replays.py`) orchestrates:

1. Load raw replay JSON files per seed
2. In parallel (ProcessPoolExecutor), for each seed:
   - Parse replay runs, compute aggregates, extract events, build measurements
   - Save .npz and .parquet artifacts
3. Aggregate seed summaries into round-level summaries
4. Write `round_summary.json` and `report.md`

---

### Factorization (dimensionality reduction across rounds)

`factorize_round_summaries()` takes any summary type and performs PCA/SVD:

1. Stack per-round vectors into matrix `(n_rounds × features)`
2. Center (subtract mean), optionally scale by `column_scale`
3. SVD: `U, Σ, Vᵀ`
4. Keep top-k components (default `max_rank=3`)
5. Output: basis, coordinates, explained variance ratios

Leave-one-out evaluation measures reconstruction quality per held-out round.

---

## Part 2: The Regime Regression

### High-Level View

Once per-round summary vectors exist, the system builds a mapping from "regime description" to "terminal prediction coefficients." The core idea: if you can figure out what kind of regime you're in (from limited observations), you can predict the terminal map by applying the corresponding coefficients to spatial features.

---

### HazardTeacher (`hazard_teacher.py`)

**Training** (`fit()`, line 204):

1. Fit semimechanistic coefficients per round → `coefficient_bank` `(n_rounds × 72)`
2. Fit dynamic law or behavioral fingerprint summaries per round → `regime_bank` `(n_rounds × regime_dim)`
3. Learn linear map: `regime → coefficients` via ridge regression:
   ```
   coefficient_vector = regime_intercept + regime @ regime_weights
   ```

The teacher currently defaults to `summary_backend="behavioral_fingerprint_core"`, which:
- Estimates behavioral fingerprint per round
- Selects core features
- Centers, scales, factorizes via PCA
- Uses the PCA coordinates as the regime bank

**Prediction** (`terminal_tensor()`, line 553ff):

1. `coefficient_vector = regime_intercept + regime @ regime_weights`
2. Split into build/port/ruin (intercept + 23 coefficients each)
3. Per cell: `score = intercept + coef · features` → sigmoid → probabilities
4. Condition: `P(ruin) = P(built) × sigmoid(ruin_score)`, etc.
5. Hard masks (ocean → empty, mountain → mountain), normalize

---

### QueryResidualPredictor (`query_residual.py`)

The online inference pipeline. During a game, no replay data is available — only observations from queries.

**Training** (`fit_from_workspace()`, line 1018ff):

1. Build base prior (HistoricalBucketPriorPredictor)
2. Train HazardTeacher with `behavioral_fingerprint_core` backend
3. Generate synthetic episodes (simulate query policies, record observations)
4. **Regime regression** (line 1150-1160): learn `observation_features → regime_vector`
   - Input: `_regime_input_vector(derived)` — global summary + per-seed mean/std
   - Target: `teacher.encode_round()` output (behavioral fingerprint core PCA coordinates)
   - Method: Ridge regression
5. **Residual correction** (line 1162-1197): weighted ridge regression
   - Features: static + prior logits + teacher logits + global/seed summary + regime + local evidence + interactions
   - Target: `log(ground_truth) - log(prior)` per cell per class

**Inference** (`_predict_from_derived()`, line 1308ff):

1. Compute derived features from observations
2. Predict regime: `regime = intercept + input @ weights`, clipped to `[-0.25, 1.25]`
3. Get teacher prediction conditioned on regime
4. Build feature tensor, apply residual correction
5. Blend with prior, apply temperature/calibration

---

### SummaryBankStudent (`summary_bank.py`)

Non-parametric alternative (rewritten from old `deepset_student.py`):

- **Training**: Build bank of `(summary_vector, regime_vector)` pairs from synthetic episodes. Summary vectors now use structured `build_transcript_summary_vector()` from `transcript_set.py`.
- **Inference**: KNN lookup in bank, weighted by inverse L2 distance → weighted mixture of regime vectors → `teacher.posterior_predictive()`

---

### Full Pipeline Diagram

```
Raw Replays
    ↓
Summarize (per-seed aggregates, events, measurements)
    ↓
┌────────────────────┬─────────────────────────┬──────────────┐
│ Semimechanistic    │ Dynamic Law /           │ Event        │
│ Coefficients (72)  │ Behavioral Fingerprint  │ Summary (26) │
│ = "terminal map"   │ = "how dynamics work"   │ = "event     │
│                    │                         │   rates"     │
└────────┬───────────┴───────────┬─────────────┴──────────────┘
         │   TARGET              │   INPUT (regime_bank)
         └──── Ridge Regression ─┘
              (HazardTeacher.fit)
                    ↓
          regime_intercept + regime_weights
          "regime → coefficients" linear map
                    ↓
     ┌──────────────┴──────────────┐
     │ At inference time:          │
     │ 1. Observe partial data     │
     │ 2. Predict regime from obs  │
     │ 3. Map regime → coefficients│
     │ 4. Apply to spatial features│
     │ 5. Get terminal predictions │
     └─────────────────────────────┘
```

Everything is supervised via closed-form ridge regression — no gradient descent, no neural networks. The targets come from replay simulations.

---

## Part 3: Bugs and Issues (current working-tree state)

### BUG 1 — Curve Fix Uncommitted

**Status**: Fixed in working tree, not committed.

**File**: `round_coefficients.py:166-187`

The old code used terminal probabilities as duplicates for positions 9-11 of the regime summary vector. The fix computes actual survival/port/ruin time-series curve means.

**Remaining fragility**: `float(np.mean(survival_curves))` on a `list[list[float]]` will crash with numpy 2.x if replay runs have different frame counts (currently all 51 frames — safe but unguarded).

---

### BUG 2 — Regime Clip `[-0.25, 1.25]` vs PCA Coordinates (ACTIVE)

**Status**: Still present. **This is the critical bug.**

**Files**: `query_residual.py:1167` and `query_residual.py:1374`

```python
predicted_regime = np.clip(predicted_regime, -0.25, 1.25)
```

`fit_from_workspace()` constructs the teacher with `summary_backend="behavioral_fingerprint_core"`. The teacher's `encode_round()` returns PCA coordinates. Actual coordinate ranges from existing manifold data:

| Dimension | Min | Max |
|---|---|---|
| dim 0 | -11.67 | +12.67 |
| dim 1 | -3.03 | +6.50 |
| dim 2 | -2.12 | +2.21 |

The clip at `[-0.25, 1.25]` would squash all variation, making the regime vector near-constant. The teacher's `terminal_tensor()` would always return approximately `intercept` (average coefficients). The regime channel would be dead.

**Why it hasn't manifested yet**: The v2 synthetic datasets (with behavioral_fingerprint_core regime encoder) are empty — just directory stubs. Existing trained models all use legacy 12-element regime vectors (values in [0, ~0.43]) which fit within the clip. The bug will trigger when QueryResidualPredictor is next trained end-to-end.

---

### BUG 3 — Dead `pass` in `_coefficients_from_regime`

**Status**: Still present. Harmless in practice (dead code).

**File**: `hazard_teacher.py:552-553`

```python
if regime_array.shape[0] == self.regime_bank.shape[1]:
    pass  # falls through to matmul that would crash on shape mismatch
```

In the current pipeline, `regime_bank.shape[1] == regime_weights.shape[0]` always holds, so this branch is unreachable. If triggered externally, it would produce a numpy shape error instead of a clear message.

---

### ISSUE 4 — KNN Distance Without Standardization (Minor)

**Status**: Partially addressed by new `transcript_set.py` features.

**File**: `summary_bank.py:214`

The `SummaryBankStudent` was rewritten. Summary vectors now come from `build_transcript_summary_vector()` which uses structured window-based features with explicit normalization (query fractions, population/food/wealth/defense scaled by constants). Much better than the old raw-concat approach.

The KNN distance is still raw L2 without standardization, but the feature set is now more uniformly scaled. Minor design concern, not a major bug.

---

### ISSUE 5 — Stale Cached Synthetic Datasets

**Status**: Still present.

Existing synthetic datasets in `data/artifacts/datasets/` contain old 12-element regime vectors computed with the buggy duplicate-terminal-probability code. The dataset caching mechanism (`_ensure_synthetic_dataset`) matches by name. After committing the `round_coefficients.py` fix, these would silently serve stale regime vectors. They need manual deletion or name-bumping to force regeneration.

---

### Summary Table

| Issue | Severity | Status |
|---|---|---|
| Curve fix uncommitted | Medium | Fixed in working tree, needs commit |
| `np.mean` ragged-list fragility | Low | Latent, not triggered today |
| Clip `[-0.25, 1.25]` vs PCA coords | **High** | Active — will destroy regime signal on next full training |
| `pass` fallthrough in `_coefficients_from_regime` | Negligible | Dead code |
| KNN without standardization | Low | Improved by transcript_set rewrite |
| Stale cached synthetic datasets | Medium | Need deletion after curve fix |
