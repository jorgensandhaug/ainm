# Replay EDA Findings

Date: 2026-03-21
Data: 9 rounds, 5 seeds each, 8 sampled runs per seed = 360 total runs.
Each run: 51 frames (year 0-50), 40x40 grid, ~30-60 initial settlements.

---

## 1. Terrain Stability Census

| Code | Name | Total Cells | Changed | Change Rate |
|------|------|------------|---------|-------------|
| 0 | empty | 0 | 0 | 0% |
| 1 | settlement | 16,096 | 15,394 | 95.6% |
| 2 | port | 696 | 666 | 95.7% |
| 3 | ruin | 0 | 0 | N/A (none at t=0) |
| 4 | forest | 122,272 | 33,329 | 27.3% |
| 5 | mountain | 11,248 | 0 | **0% (perfectly static)** |
| 10 | ocean | 75,368 | 0 | **0% (perfectly static)** |
| 11 | plains | 350,320 | 92,473 | 26.4% |

**Key takeaways:**
- Mountains and ocean are **absolutely immutable** -- confirmed across all 360 runs, zero exceptions.
- The built environment (settlements, ports) is extremely volatile: ~96% of initial settlements change by year 50.
- About 27% of forests and 26% of plains change -- mostly due to settlement expansion dynamics.
- No cells start as "empty" (code 0) or "ruin" (code 3) at t=0.

---

## 2. Full Transition Matrix

### All observed transitions (ranked by frequency):

| From | To | Count |
|------|----|-------|
| settlement | ruin | 144,157 |
| plains | settlement | 86,764 |
| ruin | settlement | 79,855 |
| ruin | plains | 59,382 |
| forest | settlement | 32,708 |
| ruin | forest | 28,217 |
| plains | ruin | 19,723 |
| forest | ruin | 7,397 |
| settlement | port | 6,678 |
| port | ruin | 4,885 |
| ruin | port | 2,100 |

### Conditional transition probabilities (given that a cell changed):

| From | Transitions To |
|------|----------------|
| **settlement** | port=0.044, ruin=0.956 |
| **port** | ruin=1.000 |
| **ruin** | settlement=0.471, port=0.012, forest=0.166, plains=0.350 |
| **forest** | settlement=0.816, ruin=0.184 |
| **plains** | settlement=0.815, ruin=0.185 |

**Key takeaways:**
- **Ports ONLY ever become ruins** -- 100% conditional probability. Ports never revert to settlements or anything else.
- **Settlements either upgrade to ports (4.4%) or collapse to ruins (95.6%)** -- no other transitions.
- **Ruins have three fates**: rebuilt as settlement (47.1%), revert to plains (35.0%), or reclaimed by forest (16.6%).
- **New forest ONLY comes from ruins** -- forests never appear spontaneously on plains or empty land.
- **Forest and plains both primarily become settlements** (~82%) or ruins (~18%) -- settlements can expand onto either.
- The transition graph has a clear cycle: plains/forest -> settlement -> ruin -> plains/forest/settlement.
- There are **no transitions involving ocean (10), mountain (5), or empty (0)** -- these are truly static substrate.

---

## 3. Temporal Dynamics

### Cell changes per run per step:

The world starts slow (~2.5 cell changes at step 0) and accelerates to ~53 changes by step 47.

### Clear 4-year birth cycle:

Massive settlement birth spikes occur at approximately 4-year intervals:
- Steps 2-3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47

At these spikes, births/run jump to 8-16 (vs baseline of 1-5). This strongly suggests the simulation has an internal growth timer with a ~4-year period for settlement founding.

### Collapse rate grows steadily:

| Year | Collapses/run |
|------|--------------|
| 0 | 2.5 |
| 10 | 3.2 |
| 20 | 7.0 |
| 30 | 8.8 |
| 40 | 13.6 |
| 50 | 16.7 |

Collapse rate roughly doubles every 15-20 years. This is likely because more settlements exist to collapse as the world grows.

### Population and food deltas:

- Mean population delta is always slightly positive (~0.05/year) -- slow growth on average.
- Mean food delta oscillates around 0 with slight positive bias -- food is roughly in equilibrium.
- The 4-year birth cycle is visible in food deltas too: birth years have lower mean food delta (resources diverted to founding).

### Owner flips:

Owner flips start at 0.71/run at step 0 and grow to ~0.6-0.7/run by late game. Conquest is present throughout but doesn't accelerate dramatically.

### Port gains:

Port gains accelerate over time: 0/run at step 0 to ~0.8/run by step 46. Port development is a late-game phenomenon.

---

## 4. Settlement Lifecycle

### Lifespan distribution:

| Lifespan (years) | Count | Share |
|-------------------|-------|-------|
| 1-4 | 107,961 | 49.5% |
| 5-9 | 40,026 | 18.3% |
| 10-19 | 36,249 | 16.6% |
| 20-29 | 21,237 | 9.7% |
| 30-39 | 9,308 | 4.3% |
| 40-49 | 2,640 | 1.2% |
| 50-51 (full game) | 798 | 0.4% |

- **Median lifespan: 5 years.** Most settlements are ephemeral.
- **Mean lifespan: 9.1 years.**
- Only 0.4% of all settlement-spans survive the entire game.
- The distribution is heavily right-skewed -- a few long-lived settlements, many short-lived ones.

### Settlement stats at collapse:

| Stat | Mean | Median |
|------|------|--------|
| Population | 0.84 | 0.50 |
| Food | 0.53 | 0.60 |
| Defense | 0.32 | 0.18 |

Settlements collapse when they're small (pop ~0.5-0.84) and low on food (~0.53). Defense at collapse is very low (0.32).

### Alive count trajectory:

| Year | Mean | Std | Min | Max |
|------|------|-----|-----|-----|
| 0 | 46.6 | 9.1 | 30 | 60 |
| 10 | 58.2 | 21.0 | 9 | 104 |
| 20 | 91.2 | 44.0 | 1 | 198 |
| 30 | 120.9 | 68.9 | 0 | 271 |
| 40 | 157.7 | 96.4 | 0 | 455 |
| 50 | 191.6 | 118.7 | 0 | 488 |

- On average, settlement count **quadruples** from ~47 to ~192 over 50 years.
- But variance is enormous: some runs end with 0 settlements, others with 488.
- Standard deviation exceeds the mean by year ~40 -- the distribution becomes very wide.

### Port count trajectory:

| Year | Mean | Std |
|------|------|-----|
| 0 | 1.9 | 1.3 |
| 10 | 1.9 | 1.4 |
| 20 | 3.8 | 2.6 |
| 30 | 6.2 | 4.4 |
| 40 | 9.4 | 6.9 |
| 50 | 12.7 | 9.2 |

Ports grow ~7x over the game, but much of the growth is in the second half.

### Birth distance from initial settlements:

- Mean: 2.45 Manhattan distance
- Median: 2.0
- Max: 12

New settlements are founded **very close** to existing ones -- almost always within 2-3 cells. Long-range colonization (distance 12) is rare.

---

## 5. Spatial Change Patterns

### Change rates by spatial context (initial -> terminal):

| Context | Total Cells | Changed | Rate |
|---------|------------|---------|------|
| Coastal land | 75,136 | 12,266 | 16.3% |
| Inland land | 425,496 | 93,053 | 21.9% |
| Near mountain (<3 cells) | 76,600 | 16,237 | 21.2% |
| Far from mountain | 412,784 | 89,082 | 21.6% |
| Near initial settlement (<4 cells) | 382,984 | 84,447 | 22.1% |
| Far from initial settlement | 101,552 | 9,514 | 9.4% |

**Key takeaways:**
- **Coastal land changes LESS than inland** (16.3% vs 21.9%). This is surprising given ports. Possible explanation: coastal cells have fewer land neighbors, so settlement expansion hits them less.
- **Mountain proximity has almost no effect** (21.2% vs 21.6%). Mountains don't inhibit or promote change in nearby cells.
- **Distance from initial settlements is the strongest spatial predictor**: 22.1% near vs 9.4% far. This makes sense -- settlement expansion radiates from initial positions.

### Per-cell change statistics:

- Mean changes per cell across 50 steps: 0.82
- Max changes for any single cell: 1.60 (averaged across runs)
- 90.2% of cells experience at least one change across all runs
- Note: this is pooled across all seeds. Individual seed results vary.

---

## 6. Stochastic Variance

Across 45 seed groups with >= 3 runs each:

### Terminal grid entropy:

| Metric | Value (bits/cell) |
|--------|-------------------|
| Mean | 0.543 |
| Std | 0.254 |
| Min | 0.057 |
| Max | 0.993 |

### Deterministic cells (entropy = 0):

| Metric | Fraction |
|--------|----------|
| Mean | 43.9% |
| Min | 16.3% |
| Max | 91.9% |

### Alive settlement count at year 50 (std across sim seeds):

| Metric | Value |
|--------|-------|
| Mean std | 34.5 |
| Max std | 68.0 |

**Key takeaways:**
- **Only ~44% of cells are deterministic** across stochastic runs. The majority of the map varies.
- Mean entropy of ~0.54 bits/cell is substantial -- this isn't a nearly-deterministic system.
- Some seeds are much more deterministic (92% fixed cells) than others (only 16% fixed) -- the hidden parameters dramatically affect stochastic spread.
- Alive count varies by std ~34 around a mean of ~192, so ~18% relative variation. This is why probability tensors matter.

---

## 7. Cross-Round Comparison

| Round | Runs | Cell Changes/Step | Alive@50 | Settlements@50 | Ports@50 | Ruins@50 | Forest@50 |
|-------|------|-------------------|----------|----------------|----------|----------|-----------|
| 2a341ace | 40 | 31.1 | 210.1 | 198.1 | 12.1 | 19.1 | 313.2 |
| 36e581f1 | 40 | 24.4 | 225.3 | 213.9 | 13.7 | 13.2 | 280.6 |
| 71451d74 | 40 | 24.0 | 243.4 | 223.6 | 19.9 | 19.0 | 298.0 |
| 76909e29 | 40 | 35.0 | 289.9 | 268.9 | 21.1 | 31.3 | 270.9 |
| 8e839974 | 40 | 21.9 | 147.5 | 137.4 | 10.1 | 17.2 | 327.9 |
| ae78003a | 40 | 53.5 | 381.8 | 359.0 | 24.6 | 43.7 | 255.7 |
| c5cdf100 | 40 | 14.6 | 37.9 | 36.3 | 1.6 | 6.0 | 352.4 |
| f1dac9a9 | 40 | 7.0 | 4.1 | 4.1 | 0.1 | 1.0 | 349.9 |
| fd3c92ff | 40 | 24.4 | 184.4 | 173.4 | 11.5 | 14.8 | 310.9 |

**Key takeaways:**
- **100x range in alive settlements at year 50**: from 4.1 (f1dac9a9) to 381.8 (ae78003a).
- This confirms the hidden round parameters create dramatically different regimes.
- **Inverse relationship between alive settlements and forest count**: high-expansion rounds destroy more forest.
- ae78003a is the most active round (53.5 cell changes/step) -- explosive expansion, 25 ports, 44 ruins.
- f1dac9a9 is near-total extinction (4.1 alive, 1 ruin) -- barely anything survives.
- c5cdf100 is also harsh (37.9 alive) -- heavy winter/conflict regime.
- The 5 regime dimensions (expansion, maritime, conflict, winter, reclamation) clearly manifest:
  - **Expansion**: ae78003a vs f1dac9a9
  - **Maritime**: ports@50 ranges 0.1 to 24.6
  - **Conflict**: owner flips vary, ruins indicate destruction
  - **Winter**: settlement survival rates vary dramatically
  - **Reclamation**: forest@50 vs ruins@50 ratio varies

---

## 8. Settlement Economics

### Stats over time (alive settlements):

| Year | Pop Mean | Pop Std | Food Mean | Wealth Mean | Defense Mean |
|------|----------|---------|-----------|-------------|--------------|
| 0 | 1.00 | 0.29 | 0.55 | 0.30 | 0.40 |
| 10 | 1.06 | 0.58 | 0.76 | 0.17 | 0.49 |
| 25 | 1.11 | 0.77 | 0.71 | 0.07 | 0.47 |
| 50 | 1.12 | 0.79 | 0.67 | 0.01 | 0.46 |

**Key takeaways:**
- **Population is remarkably stable** -- mean stays near 1.0 throughout, with growing variance.
- **Food starts low (0.55), peaks around year 10 (0.76), then slowly declines (0.67 by year 50).**
- **Wealth collapses to near-zero**: from 0.30 at start to 0.01 by year 50. Wealth is consumed/destroyed faster than produced.
- **Defense slowly increases**: from 0.40 to 0.46-0.49, suggesting conflict pressure selects for better-defended settlements.
- Population std grows from 0.29 to 0.79 -- increasing inequality in population sizes.

### Survivors vs. collapsing settlements (year 49):

| Group | N | Mean Pop | Mean Food |
|-------|---|----------|-----------|
| Survivors | 62,385 | 1.13 | 0.68 |
| Collapsed | 6,019 | 0.92 | 0.48 |

Collapsing settlements have 19% less population and 29% less food than survivors. Food deficit is the stronger signal.

### Wealth inequality:

- Gini coefficient at year 50: **mean 0.65, std 0.08**
- This is very high inequality (comparable to the most unequal human economies). A few settlements accumulate most of the wealth.

---

## 9. Faction/Owner Dynamics

| Metric | Value |
|--------|-------|
| Factions at start | 46.6 mean (one per settlement) |
| Factions at end | 18.8 mean |
| Faction elimination rate | ~60% of factions are eliminated |
| Largest faction share at year 50 | mean 18.6%, max 100% |
| Owner flips per run | mean 22.5, std 26.2, max 151 |

**Key takeaways:**
- Each settlement starts as its own faction (~47 factions at start).
- By year 50, **~60% of factions are eliminated** through conquest.
- The **largest faction controls ~19% on average** -- no single-faction domination in most runs.
- But the **max is 100%** -- total domination by one faction does occur in some runs.
- Owner flips average 22.5 per run with high variance (max 151) -- conquest is frequent but varies enormously by round regime.

---

## 10. Forest Dynamics

### Ruin transition outcomes:

| Outcome | Count | Share |
|---------|-------|-------|
| Ruin -> Settlement (rebuild) | 81,955 | 48.3% |
| Ruin -> Plains (decay) | 59,382 | 35.0% |
| Ruin -> Forest (reclamation) | 28,217 | 16.6% |

### Forest stability:

| Metric | Count | Rate |
|--------|-------|------|
| Forest stable (same next step) | 5,818,782 | 99.32% |
| Forest disappeared | 40,105 | 0.68% |

### New forest sources:

The **only** source of new forest is ruin reclamation. No forest ever appears from plains, empty, or any other terrain.

### Ruin -> Forest timing:

- Mean step: 30.7
- Earliest: step 1
- Latest: step 49

Forest reclamation is a late-game phenomenon on average, but can happen as early as step 1.

### Forest count trajectory:

| Year | Mean | Std |
|------|------|-----|
| 0 | 339.6 | 18.7 |
| 10 | 336.7 | 19.5 |
| 20 | 328.5 | 22.5 |
| 30 | 322.4 | 26.9 |
| 40 | 313.0 | 32.3 |
| 50 | 306.6 | 37.0 |

**Forest count monotonically decreases** on average -- the world slowly deforests as settlements expand. Net forest loss is ~33 cells (10%) over 50 years. But variance grows (std 18.7 -> 37.0), reflecting different round regimes.

---

## Summary of Actionable Insights for Modeling

1. **Mountains and ocean are perfectly deterministic** -- assign probability 1.0 to their class (with a tiny floor for safety).
2. **The 4-year birth cycle** is a simulator mechanic worth encoding -- births cluster at multiples of 4.
3. **Settlement expansion radiates from initial positions** with a characteristic distance of ~2-3 cells per founding event.
4. **Forest only comes from ruins** -- this constrains the forest prediction model. If a cell was never a ruin, it can never become forest (unless it started as forest).
5. **Wealth decays to zero** -- wealth is not informative at year 50; population and food matter more.
6. **The hidden round parameters create a ~100x range** in terminal settlement count. Regime inference is critical.
7. **~56% of the map is stochastic** -- purely geometric priors leave significant entropy on the table.
8. **Port development is a late-game phenomenon** -- port predictions should weight later evidence more.
9. **Collapse is predicted by low food (0.48 vs 0.68)** more than low population -- food is the leading indicator.
10. **Coastal cells change less than inland** -- counterintuitively, being on the coast is protective (fewer expansion paths).

---

## DEEP DIVE FINDINGS (from replay_eda_deep.py)

---

## A. Birth Cycle Periodicity (Confirmed)

Autocorrelation analysis confirms a **strict 4-year birth cycle** across all 9 rounds.

| Round | Birth Rate/step | Peak Autocorr Lag | Autocorr r |
|-------|----------------|-------------------|------------|
| 2a341ace | 6.93 | 4 | 0.741 |
| 36e581f1 | 7.28 | 4 | 0.537 |
| 71451d74 | 7.77 | 4 | 0.835 |
| 76909e29 | 10.05 | 4 | 0.717 |
| 8e839974 | 4.96 | 4 | 0.853 |
| ae78003a | 14.85 | 4 | 0.722 |
| c5cdf100 | 1.70 | 4 | 0.677 |
| f1dac9a9 | 0.32 | 4 | 0.385 |
| fd3c92ff | 5.87 | 4 | 0.793 |

**Every single round peaks at lag 4.** Autocorrelation ranges from r=0.385 (near-extinction round) to r=0.853. The birth cycle is a hard simulator mechanic, not an emergent property.

The pattern within each cycle is: near-zero births at step 0 and 1, then burst at step 2-3, then another burst at step 7, then regular 4-year spacing (11, 15, 19, 23, ...).

The first burst is at step 2 (not 4), suggesting the cycle starts from year 0 but there's a 2-year warmup before the first founding event.

---

## B. Per-Round Regime Fingerprint

Quantified the 5 regime dimensions from replay data:

| Round | Expansion | Maritime | Conflict% | Winter% | Reclaim |
|-------|-----------|----------|-----------|---------|---------|
| 2a341ace | 4.87 | 0.057 | 1.324 | 0.00 | 0.171 |
| 36e581f1 | 4.21 | 0.059 | 0.427 | 0.00 | 0.165 |
| 71451d74 | 6.20 | 0.083 | 0.458 | 0.00 | 0.172 |
| 76909e29 | 6.29 | 0.074 | 0.325 | 0.00 | 0.153 |
| 8e839974 | 3.14 | 0.070 | 0.064 | 0.00 | 0.188 |
| ae78003a | 8.10 | 0.064 | 0.071 | 0.00 | 0.145 |
| c5cdf100 | 0.84 | 0.045 | 0.489 | 0.00 | 0.207 |
| f1dac9a9 | 0.09 | 0.019 | 0.557 | 0.00 | 0.187 |
| fd3c92ff | 3.93 | 0.060 | 0.306 | 0.00 | 0.162 |

**Key observations:**
- **Expansion** ranges from 0.09x (near-extinction) to 8.1x (explosive growth) -- the dominant axis of variation.
- **Maritime** (port fraction) is relatively narrow (0.019-0.083) but still varies 4x.
- **Conflict** (owner flips per settlement-year) varies 20x: from 0.064% (peaceful) to 1.324% (warlike). Note 2a341ace is the most conflicted round.
- **Winter** shows 0.00 across all rounds with this metric -- the collapse mechanism doesn't cleanly separate from conflict collapses. Collapses come from food/conflict, not a distinct "winter" event.
- **Reclamation** (fraction of ruin transitions that become forest) is relatively stable (0.145-0.207), suggesting it's less regime-dependent and more a fixed simulator mechanic.

**Insight for modeling:** Expansion and Conflict are the two dominant regime axes. Maritime is secondary. Reclamation appears to be a near-constant. "Winter" as a distinct regime dimension may need reframing -- it's probably encoded in the collapse rate, which is already captured by inverse expansion.

---

## C. Settlement Survival Predictors (Year 10 -> 50)

Comparing year-10 stats of settlements that survive to year 50 vs those that die:

| Stat | Survived | Died | Diff | Cohen's d |
|------|----------|------|------|-----------|
| population | 1.071 | 1.057 | +0.014 | +0.024 |
| food | 0.771 | 0.758 | +0.013 | +0.060 |
| wealth | 0.183 | 0.169 | +0.014 | +0.090 |
| defense | 0.505 | 0.479 | +0.026 | +0.080 |
| has_port | 0.032 | 0.034 | -0.002 | -0.009 |
| coast | 0.081 | 0.075 | +0.006 | +0.021 |

**Key takeaway:** Individual settlement stats at year 10 are **very weak predictors** of survival to year 50. Cohen's d is below 0.1 for all features. This means:
- Settlement survival is **primarily driven by regime/environment**, not individual stats.
- You can't predict which specific settlements will survive from their year-10 snapshot.
- This validates the probabilistic approach: predicting marginals over the whole map is more tractable than predicting individual fates.

---

## D. Expansion Wavefront

Occupation rate by land-BFS distance from initial settlements at year 50:

| Distance | Land Cells | Occupied | Rate |
|----------|-----------|----------|------|
| 0 | 16,792 | 5,389 | 32.1% |
| 1 | 64,328 | 14,581 | 22.7% |
| 2 | 104,336 | 20,565 | 19.7% |
| 3 | 103,512 | 16,316 | 15.8% |
| 4 | 78,272 | 9,965 | 12.7% |
| 5 | 49,456 | 4,793 | 9.7% |
| 6 | 28,736 | 2,117 | 7.4% |
| 7 | 16,576 | 1,002 | 6.0% |
| 8 | 9,352 | 446 | 4.8% |
| 10 | 3,456 | 103 | 3.0% |
| 15 | 288 | 6 | 2.1% |

**Occupation drops exponentially with distance.** The wavefront decays roughly as exp(-0.22 * distance). Beyond distance 10, occupation rate is below 3%. This provides a strong spatial prior: cells far from any initial settlement have very low probability of becoming built.

---

## E. Stochastic Variance by Initial Terrain

Terminal entropy (bits) by what the cell started as:

| Initial Type | Cells | Mean Entropy | Nonzero Fraction |
|-------------|-------|--------------|-----------------|
| settlement | 2,012 | 1.252 | 99.0% |
| port | 87 | 1.275 | 98.9% |
| forest | 15,284 | 0.709 | 69.0% |
| mountain | 1,406 | 0.000 | 0.0% |
| ocean | 9,421 | 0.000 | 0.0% |
| plains | 43,790 | 0.585 | 63.3% |

**Key takeaways:**
- **Initial settlements/ports have the highest entropy** (~1.25 bits) -- they are the most unpredictable cells.
- **Forest has moderate entropy** (0.71 bits) with 69% of forest cells having nonzero variance.
- **Plains has moderate entropy** (0.58 bits) with 63% of cells varying.
- This suggests a natural hierarchy of prediction difficulty: settlement/port >> forest > plains >> mountain/ocean.

---

## F. Settlement Stat Trajectories by Outcome

Tracking settlements alive at year 5 that survive to 50 vs those that die before 50:

| Year | Survivors Pop | Survivors Food | Doomed Pop | Doomed Food |
|------|-------------|---------------|------------|-------------|
| 5 | 1.121 | 0.811 | 1.104 | 0.801 |
| 10 | 1.380 | 0.814 | 1.361 | 0.809 |
| 20 | 1.779 | 0.662 | 1.760 | 0.655 |
| 30 | 1.898 | 0.629 | 2.024 | 0.613 |
| 40 | 1.619 | 0.646 | 1.944 | 0.532 |
| 45 | 1.547 | 0.671 | 1.886 | 0.482 |

**Surprising finding:** Doomed settlements actually have **higher population** than survivors in the middle of the game (years 30-45). But they have **lower food**. This suggests a "grow too fast, starve" dynamic: settlements that overexpand population without adequate food production are the ones that collapse.

Survivors have a more conservative trajectory: their population peaks lower but food remains higher.

---

## G. Port Acquisition Predictors

Comparing year-10 stats of non-port settlements that later gain a port vs those that never do:

| Stat | Gained Port | Never Port | Cohen's d |
|------|-----------|-----------|-----------|
| population | 0.702 | 1.069 | -0.775 |
| food | 0.662 | 0.768 | -0.452 |
| wealth | 0.089 | 0.172 | -0.689 |
| defense | 0.294 | 0.492 | -0.748 |
| **coast** | **1.000** | **0.008** | **+15.490** |

**The single overwhelming predictor of port acquisition is being coastal** (d=15.5, essentially a hard rule). Port settlements must be adjacent to ocean.

Interestingly, future ports have **lower** population, food, wealth, and defense at year 10 compared to non-port settlements. This is because:
1. Ports are coastal, and coastal settlements start smaller.
2. Port acquisition happens to small settlements that survive on the coast.
3. Being a port is about location (coast), not about being big/strong.

---

## H. Ruin Fate Predictors

What determines whether a ruin becomes a settlement (rebuild), forest, or plains (decay)?

| Fate | Count | Nearby Alive | Nearby Forest | Nearby Settlement | Mean Step |
|------|-------|-------------|---------------|-------------------|-----------|
| rebuild | 81,955 | 3.81 | 1.59 | 1.44 | 32.7 |
| forest | 28,217 | 3.28 | 1.62 | 1.24 | 30.7 |
| decay | 59,382 | 3.34 | 1.61 | 1.26 | 30.7 |

**Rebuild has more nearby alive settlements** (3.81 vs 3.28-3.34) and more nearby built cells (1.44 vs 1.24-1.26). This confirms the game mechanic: "thriving nearby settlements may reclaim ruins and rebuild them."

Forest reclamation vs decay: nearby forest count is nearly identical (1.62 vs 1.61), so forest proximity doesn't determine the ruin->forest outcome. The difference may be driven by hidden parameters or more distant context.

The step timing is similar across fates (~30-33), so ruin fate is determined by spatial context more than temporal position.

---

## I. Initial->Final State Correlations

### Overall (mixing rounds):

| Initial | Final | r |
|---------|-------|---|
| init_alive | final_alive | +0.162 |
| init_forest | final_forest | +0.372 |

### Within-round correlations:

| Round | init_alive -> final_alive | init_forest -> final_forest |
|-------|--------------------------|---------------------------|
| 2a341ace | +0.358 | +0.574 |
| 71451d74 | +0.529 | +0.663 |
| f1dac9a9 | +0.393 | +0.897 |
| c5cdf100 | +0.231 | +0.788 |

**Forest count is the most predictable feature** from initial conditions (r up to 0.90). This makes sense: forest is mostly stable, and the initial forest count predicts the final count well.

**Alive settlement count is weakly predictable** within rounds (r = 0.16-0.53). The hidden parameters dominate, but the map layout (initial settlement positions, terrain) does matter.

Interestingly, some rounds show **negative** within-round correlation between initial and final alive counts. This could indicate that dense initial layouts lead to more conflict/collapse in certain regimes.

---

## J. Settlement Hazard Curve

Conditional death probability by settlement age:

| Age | At Risk | Died | Hazard Rate |
|-----|---------|------|-------------|
| 0 | 218,219 | 30,485 | 14.0% |
| 2 | 149,610 | 17,434 | 11.7% |
| 4 | 110,258 | 8,419 | 7.6% |
| 8 | 75,579 | 3,080 | 4.1% |
| 14 | 49,669 | 1,390 | 2.8% |
| 20 | 31,660 | 1,449 | 4.6% |
| 28 | 14,078 | 957 | 6.8% |
| 36 | 5,388 | 494 | 9.2% |
| 44 | 1,728 | 151 | 8.7% |
| 48 | 911 | 108 | 11.9% |

**The hazard curve is U-shaped (bathtub curve):**
1. **High early mortality** (14% at age 0) -- many settlements die young.
2. **Low hazard plateau** (2.8-4.1%) around ages 8-18 -- settlements that survive the first few years are relatively safe.
3. **Rising late-life hazard** (6.8-11.9%) after age 20 -- even long-lived settlements face increasing death risk.

This is a classic bathtub/Weibull pattern seen in reliability engineering. The early deaths are "infant mortality" (bad locations, bad initial conditions), the middle is stable operation, and the late rise is "wear-out" (growing competition, resource depletion).

**Modeling implication:** Settlement survival probability should be modeled as a bathtub-shaped hazard function, not a constant rate.

---

## Updated Actionable Insights for Modeling

11. **4-year birth cycle is a hard mechanic** -- births at steps 2, 3, 7, 11, 15, 19, ... with autocorrelation r>0.7 in most rounds.
12. **Expansion and Conflict are the two dominant regime axes** -- Maritime is secondary, Reclamation is near-constant.
13. **Individual settlement stats are weak survival predictors** (d<0.1) -- regime dominates individual fate.
14. **Expansion wavefront decays exponentially** with ~exp(-0.22*distance) from initial settlements.
15. **Ports require coastal location** (d=15.5) -- a nearly deterministic rule.
16. **Doomed settlements grow too fast then starve** -- high pop + low food = death.
17. **Forest count is the most predictable initial->final feature** (r up to 0.90 within rounds).
18. **Settlement hazard follows a bathtub curve** -- high infant mortality, low mid-life, rising late-life.
19. **Initial settlement/port cells have 2x the terminal entropy** of plains/forest -- they're the hardest to predict.

---

## WAVE 3 FINDINGS (from replay_eda_wave3.py)

---

## K. Map Generation Statistics

- **All maps are exactly 40x40** (1,600 cells).
- **No empty (code 0) or ruin (code 3) cells exist at t=0.**

### Terrain composition:

| Terrain | Mean Fraction | Std | Cells (of 1600) |
|---------|--------------|-----|-----------------|
| plains | 60.8% | 1.5% | ~973 |
| forest | 21.2% | 1.2% | ~340 |
| ocean | 13.1% | 1.2% | ~209 |
| settlement | 2.8% | 0.6% | ~45 |
| mountain | 2.0% | 0.6% | ~31 |
| port | 0.1% | 0.1% | ~2 |

The map is dominated by plains (61%) with substantial forest (21%) and ocean border (13%).

### Settlement spacing:

- Mean nearest-neighbor distance: 4.26 (Manhattan)
- **Minimum spacing: 3** -- settlements are never closer than 3 cells apart at initialization. This is a hard spacing constraint in the map generator.
- Max spacing: 12

### Mountain chains:

- 539 connected components across 45 seeds
- Mean chain size: 2.6 cells, median: 2
- Max chain: 15 cells
- Mostly tiny (47% are single cells, 37% are 2-4 cells)
- Mountains are described as "random walks" in the docs, confirmed here as short disconnected segments.

### Forest clusters:

- 7,951 connected components across 45 seeds
- Mean size: 1.9 cells, median: 1
- Max: 27 cells
- Forests are very fragmented -- mostly isolated cells or small patches. Not dense continuous blocks.

### Fjord depth:

- Mean: 9.3 cells of ocean penetration from map border
- Max: 25 cells -- fjords can reach deep into the interior
- Min: 2 -- every map has at least some inland ocean

---

## L. Cross-Seed Consistency Within Rounds

The 5 seeds within a round share hidden parameters but have different map layouts.

### Cross-seed coefficient of variation in alive@50:

| Round | Mean Alive@50 | Cross-Seed CV |
|-------|--------------|---------------|
| 76909e29 | 289.9 | 0.020 (very consistent) |
| 36e581f1 | 225.3 | 0.035 |
| ae78003a | 381.8 | 0.034 |
| 8e839974 | 147.5 | 0.046 |
| 71451d74 | 243.4 | 0.087 |
| fd3c92ff | 184.4 | 0.090 |
| 2a341ace | 210.1 | 0.174 |
| c5cdf100 | 37.9 | 0.312 (variable) |
| f1dac9a9 | 4.1 | 0.421 (very variable) |

**Key finding:** High-expansion rounds are very consistent across seeds (CV 2-5%). Low-expansion/harsh rounds are much more variable (CV 30-42%). When most settlements die, the outcome is very sensitive to the specific map layout. When expansion is strong, it overwhelms map-specific effects.

The terminal class distribution (empt/sett/port/ruin/fore/moun) is also very consistent across seeds for high-expansion rounds, confirming that the hidden parameters dominate the outcome.

---

## M. Settlement Founding Rules

### Where do new settlements appear?

| Previous terrain | Count | Share |
|-----------------|-------|-------|
| plains | 86,764 | 72.6% |
| forest | 32,708 | 27.4% |

**Settlements are ONLY founded on plains and forest** -- never on ocean, mountain, ruin, or other settlements. This is a hard game rule.

### Founding context:

- **86% of births have a same-owner neighbor** within 3 cells. Settlements are mostly founded by nearby same-faction settlements.
- **Mean nearby alive count: 3.72** -- births happen in populated neighborhoods.
- **5.5% of births have zero nearby alive settlements** -- rare "remote colonization" events.
- **Nearest parent stats at founding**: population=1.59, food=0.75. Parents are relatively prosperous (above-average pop, decent food).

### 3x3 terrain context:

- 99.7% of foundings have plains nearby (almost all of them)
- 86.3% have forest nearby
- 71.5% have existing settlement nearby
- 13.3% have ocean nearby
- 7.2% have mountain nearby

---

## N. Port & Trade Mechanics

### Port gain timing:

| Decade | Count | Share |
|--------|-------|-------|
| Steps 0-9 | 290 | 4.3% |
| Steps 10-19 | 916 | 13.7% |
| Steps 20-29 | 1,283 | 19.2% |
| Steps 30-39 | 1,869 | 28.0% |
| Steps 40-49 | 2,320 | 34.7% |

Port development is **heavily late-game**: 63% of port gains happen in the last 20 years. Mean step: 32.3.

### Pre-port settlement stats:

| Stat | Mean | Median |
|------|------|--------|
| Population | 0.878 | 0.721 |
| Food | 0.795 | 0.868 |
| Wealth | 0.038 | 0.017 |
| Defense | 0.378 | 0.291 |

Port development happens to **relatively small, food-rich** settlements. Population and defense are below average, but food is high. This suggests a food threshold for port development.

### Port survival:

- Mean survival after port gain: 11.8 years
- 52.5% survive 10+ years as a port
- Ports are moderately durable once acquired

---

## O. Population Carrying Capacity

### Total population over time:

| Year | Pop (mean±std) | Food (mean±std) |
|------|---------------|-----------------|
| 0 | 46.5 ± 9.5 | 25.9 ± 5.1 |
| 10 | 61.8 ± 20.8 | 44.4 ± 16.1 |
| 25 | 117.7 ± 67.4 | 75.2 ± 38.8 |
| 50 | 214.5 ± 140.6 | 128.3 ± 74.3 |

### Growth rate decelerates:

| Period | Mean Growth Rate |
|--------|-----------------|
| Year 0-5 | 1.063x |
| Year 5-10 | 1.239x |
| Year 10-15 | 1.221x |
| Year 20-25 | 1.147x |
| Year 30-35 | 1.106x |
| Year 40-45 | 1.080x |
| Year 45-50 | 1.068x |

Growth rate peaks at ~1.24x per 5 years (year 5-10) then decelerates toward ~1.07x. This suggests a **soft carrying capacity** -- the world doesn't hit a hard cap but growth slows as resources become scarcer.

### Food per capita:

| Year | Food/Pop |
|------|----------|
| 0 | 0.558 |
| 10 | 0.711 |
| 20 | 0.656 |
| 30 | 0.645 |
| 40 | 0.613 |
| 50 | 0.625 |

Food per capita peaks at year 10 (0.71) then slowly declines. The decline is mild -- the world doesn't starve, but per-capita food slowly drops as density increases.

---

## P. Conflict Deep Dive

### Attacker vs Defender stats at conquest:

| Stat | Attacker | Defender |
|------|----------|----------|
| Population | 1.219 | 0.609 |
| Food | 0.703 | 0.710 |
| Defense | 0.512 | 0.251 |

**Attackers have 2x the population and 2x the defense of defenders.** Food is roughly equal. Conquest is primarily determined by military superiority (population + defense), not resource advantage.

### Conquest distance:

- Mean: 3.11 Manhattan distance
- **78% of conquests happen at distance 1-4** -- conquest is very local.
- Max: 9 -- long-range conquest is rare but possible.
- The most common distance is 4 (31.6%), which matches the initial settlement spacing minimum.

---

## Q. Phase Timing

### Step classifications:

| Type | Count | Share |
|------|-------|-------|
| Mixed (births + collapses) | 11,791 | 65.5% |
| Pure collapse (no births) | 4,060 | 22.6% |
| Pure growth (no collapses) | 1,168 | 6.5% |
| Quiet (neither) | 981 | 5.5% |

**65% of steps have BOTH births and collapses** happening simultaneously. The 5 phases (growth, conflict, trade, winter, environment) all execute within a single step -- we see their combined effect.

**Zero position overlap between births and collapses** in the same step -- a cell never has both a birth and a collapse. This confirms the phases are sequential: earlier phases (growth/conflict) determine collapses, later phases (environment) can rebuild/found.

---

## R. Birth Ownership

- **80.8% of new settlements have the same owner as their nearest existing settlement.**
- 19.2% have a different owner -- these may be independent foundings or contested areas.
- This confirms settlement founding is primarily faction-based: your faction's nearby settlements are the "parents."

---

## S. Terrain Adjacency Patterns at T=0

Adjacency lift matrix (observed/expected, >1 = attracted):

| | settlement | port | forest | mountain | ocean | plains |
|---|------------|------|--------|----------|-------|--------|
| **mountain-mountain** | | | | **16.4x** | | |
| **ocean-ocean** | | | | | **5.7x** | |
| **port-ocean** | | | | | **3.4x** | |
| **settlement-ocean** | | | | | **0.08x** | |
| **mountain-ocean** | | | | | **0.11x** | |
| **forest-ocean** | | | | | **0.41x** | |

**Key patterns:**
- **Mountains are extremely self-adjacent** (lift 16.4x) -- they form chains/clusters, confirmed by the random-walk generation.
- **Ocean is highly self-adjacent** (lift 5.7x) -- contiguous ocean/fjord bodies.
- **Ports strongly attract ocean** (lift 3.4x) -- ports are placed on coastlines.
- **Settlements strongly repel ocean** (lift 0.08x) -- settlements avoid coastlines at initialization.
- **Mountains repel ocean** (lift 0.11x) -- mountains are placed inland.
- **Mountains repel ports** (lift 0.14x) -- ports and mountains don't co-occur.

---

## Further Actionable Insights

20. **Settlements only found on plains (73%) and forest (27%)** -- a hard rule. No founding on ocean, mountain, ruin, or other built terrain.
21. **Minimum initial settlement spacing is 3** -- a hard map generation constraint.
22. **86% of births are same-faction expansions** from nearby parent settlements.
23. **Port development requires high food** (0.80) and is purely coastal -- a food threshold + coast gate.
24. **Growth rate decelerates from 1.24x to 1.07x per 5 years** -- soft carrying capacity.
25. **Conquest is local (distance 3-4) and requires 2x population/defense advantage.**
26. **Harsh rounds are much more map-sensitive** (CV 30-42%) than expansive rounds (CV 2-5%) -- regime inference is most critical in low-expansion scenarios.
27. **Forest is very fragmented** at initialization (median cluster size 1) -- not dense blocks.
28. **Mountain chains are short** (median 2 cells) -- not continuous ranges.

---

## WAVE 4 FINDINGS (from replay_eda_wave4.py)

---

## T. Food Production vs Terrain Neighbors

Correlation between 3x3 terrain neighbor count and food delta:

| Terrain | Mean Count | Corr with Food Delta | Food Delta (has) | Food Delta (no) |
|---------|-----------|---------------------|-----------------|----------------|
| settlement | 2.44 | -0.066 | +0.048 | +0.002 |
| plains | 4.28 | +0.051 | +0.048 | +0.008 |
| forest | 1.58 | +0.040 | +0.050 | +0.036 |
| ocean | 0.33 | -0.013 | +0.041 | +0.048 |
| port | 0.12 | -0.066 | +0.016 | +0.051 |
| mountain | 0.12 | -0.003 | +0.047 | +0.047 |

**Key findings:**
- Correlations are all very weak (|r| < 0.07) -- terrain neighbors weakly affect food production.
- **Plains and forest neighbors are slightly beneficial** for food (positive correlation).
- **Settlement neighbors slightly hurt food production** (negative correlation) -- competition for resources.
- **Port neighbors correlate negatively with food** -- ports trade rather than produce food.
- Mountains have essentially zero effect on food.
- The game's food model is dominated by other factors (hidden parameters, settlement stats) rather than local terrain.

---

## U. RUIN DURATION -- CRITICAL DISCOVERY

**ALL ruins last exactly 1 step.** Out of 176,162 ruin episodes, 100.0% have duration 1.

This means:
- A cell becomes ruin code 3
- At the very next step, it transitions to something else (settlement rebuild, forest, or plains)
- **Ruins NEVER persist for more than a single timestep**

This is a fundamental simulator mechanic: ruins are **instantaneous waypoints**, not persistent terrain. When you see a ruin at year 50, it appeared that same year. When modeling terminal distributions, ruin probability should be modeled as the probability of a collapse happening on the very last step.

---

## V. Step 0 Immediate Collapses

At step 0->1, approximately 2.5 settlements collapse immediately.

| Group | N | Pop | Food | Defense |
|-------|---|-----|------|---------|
| Collapsed | 886 | 0.964 | 0.519 | 0.394 |
| Survived | 15,906 | 0.999 | 0.557 | 0.402 |

Step-0 collapses hit settlements with slightly lower food (0.52 vs 0.56) and population (0.96 vs 1.00). The differences are small but consistent -- the weakest settlements are culled immediately.

---

## W. Settlement Stat Distributions (Percentiles)

### Year 0:
| Stat | p5 | p25 | p50 | p75 | p95 |
|------|-----|-----|-----|-----|-----|
| population | 0.55 | 0.75 | 0.99 | 1.25 | 1.45 |
| food | 0.33 | 0.44 | 0.56 | 0.67 | 0.78 |
| wealth | 0.12 | 0.20 | 0.31 | 0.40 | 0.48 |
| defense | 0.22 | 0.30 | 0.40 | 0.50 | 0.58 |

All initial stats are uniformly distributed (roughly U[0.5, 1.5] for pop, U[0.3, 0.8] for food, etc.)

### Year 50:
| Stat | p5 | p25 | p50 | p75 | p95 |
|------|-----|-----|-----|-----|-----|
| population | 0.39 | 0.50 | 0.81 | 1.57 | 2.74 |
| food | 0.13 | 0.47 | 0.77 | 0.91 | 0.96 |
| wealth | 0.00 | 0.00 | 0.01 | 0.02 | 0.06 |
| defense | 0.14 | 0.20 | 0.32 | 0.75 | 1.00 |

By year 50:
- **Population becomes right-skewed**: many small settlements (p25=0.50) and some very large ones (p95=2.74).
- **Food concentrates**: food is bimodal, either high (p75=0.91) or very low (p5=0.13).
- **Wealth is crushed**: p95 is only 0.06 at year 50 vs 0.48 at year 0.
- **Defense becomes bimodal**: either low (p25=0.20) or at cap (p95=1.00). This suggests a "defended or not" binary.

---

## X. Longship & Tech Level

Neither `longship_count` nor `tech_level` are present in replay data. Out of 1,986,084 settlement observations, exactly zero have these fields populated. These stats may be internal simulator state that's only partially exposed in the live simulate API response.

---

## Y. Transition Rates by Time Period

| Transition | Y0-10 | Y10-20 | Y20-30 | Y30-40 | Y40-50 |
|------------|-------|--------|--------|--------|--------|
| plains->settlement | 8,135 | 14,426 | 16,346 | 22,490 | 25,367 |
| forest->settlement | 2,937 | 5,312 | 6,030 | 8,609 | 9,820 |
| settlement->ruin | 10,851 | 16,855 | 26,432 | 39,202 | 50,817 |
| ruin->settlement | 4,213 | 9,258 | 15,176 | 22,140 | 29,068 |
| ruin->plains | 5,808 | 7,970 | 10,752 | 15,112 | 19,740 |
| ruin->forest | 2,765 | 3,792 | 5,191 | 7,006 | 9,463 |
| settlement->port | 290 | 916 | 1,283 | 1,869 | 2,320 |
| port->ruin | 386 | 464 | 716 | 1,324 | 1,995 |

All transition types accelerate over time. The world gets more dynamic as it fills up. The settlement->ruin transition grows fastest (5x increase), reflecting increasing competition and collapse pressure in a more crowded world.

---

## Z. Where Is Entropy Concentrated?

### Entropy by distance from initial settlement:

| Distance | Mean Entropy | Nonzero Fraction |
|----------|-------------|-----------------|
| 0 | 1.25 bits | 99.0% |
| 1 | 0.83 | 82.0% |
| 2 | 0.73 | 73.3% |
| 3 | 0.59 | 62.1% |
| 5 | 0.34 | 39.3% |
| 7 | 0.17 | 22.5% |
| 10 | 0.04 | 5.6% |
| 13+ | 0.00 | 0.0% |

**Entropy drops monotonically with distance from initial settlements.** Beyond distance 13, cells are perfectly deterministic. This provides a clear spatial prior for prediction confidence.

### What happens to initial settlement cells at year 50:

| Terminal Class | Mean Probability |
|---------------|-----------------|
| empty | 45.8% |
| settlement | 28.5% |
| forest | 22.1% |
| ruin | 2.4% |
| port | 1.1% |
| mountain | 0.0% |

An initial settlement position has only a 28.5% chance of being a settlement at year 50. It's more likely to be empty (46%) or forest (22%). This means most initial settlements are destroyed and their locations may be reclaimed.

---

## BB. Cell-Level Consistency Across Stochastic Runs

| Mode Frequency | Fraction of Cells |
|---------------|------------------|
| >= 1.0 (deterministic) | 43.9% |
| >= 0.8 | 61.4% |
| >= 0.7 | 76.7% |
| >= 0.5 | 97.8% |

**97.8% of cells have a dominant outcome** (mode freq >= 50%). Only 2.2% of cells are truly 50-50 between outcomes.

| Initial Type | Mean Mode Frequency |
|-------------|-------------------|
| mountain | 1.000 |
| ocean | 1.000 |
| plains | 0.826 |
| forest | 0.785 |
| port | 0.596 |
| settlement | 0.577 |

Settlements and ports are the hardest to predict (mode freq ~58%), but even they have a meaningful dominant outcome.

---

## CC. What Predicts Whether a Cell Gets Built On?

For initially-plains/forest cells:

| Feature | Built | Unbuilt | Cohen's d |
|---------|-------|---------|-----------|
| dist_to_init_settlement | 2.76 | 3.61 | -0.47 |
| dist_to_ocean | 5.68 | 5.53 | +0.04 |
| local_forest_density | 0.23 | 0.23 | +0.04 |

**Distance to nearest initial settlement is the strongest predictor** (d=-0.47, moderate effect). Built cells are ~0.85 closer to initial settlements. Ocean distance and forest density have negligible effect.

---

## Critical New Insights

29. **RUINS LAST EXACTLY 1 STEP** -- this is a hard mechanic. Ruins are instantaneous transitions, not persistent states. Ruin probability at year 50 equals collapse probability at year 50.
30. **Entropy drops to zero at distance 13+** from initial settlements -- perfect spatial cutoff for "definitely static" cells.
31. **Initial settlement cells become empty 46% of the time** by year 50 -- they're more likely to be destroyed than to survive.
32. **Wealth is essentially eliminated by year 50** (p95=0.06) -- it's a transient early-game resource.
33. **Defense becomes bimodal** (either ~0.2 or ~1.0) by year 50 -- a "fortified or not" binary.
34. **Food weakly correlates with plains/forest neighbors** and negatively with settlement neighbors -- but all terrain-food correlations are very weak (|r|<0.07).
35. **Longship and tech level are not observable** in replay data -- these may be internal-only stats.
36. **All transition types accelerate** over the 50-year horizon -- the world becomes more dynamic, not less.

---

## WAVE 5 FINDINGS (from replay_eda_wave5.py)

---

## DD. Ruin Duration Grid-Level Verification

**CONFIRMED at grid level: zero ruin cells ever persist beyond 1 step.**

Out of 169,554 ruin cell-steps observed, exactly 0 persisted to the next step. 100% transitioned within one timestep. The 6,608 ruin cells observed at year 50 all appeared in the step 49->50 transition and had no subsequent step.

This is now verified both at the settlement tracking level (Analysis U) and at the raw grid level.

---

## EE. Settlement Stat Bounds

| Stat | Absolute Min | Absolute Max |
|------|-------------|-------------|
| population | 0.010 | 5.098 |
| food | 0.000 | **1.000** |
| wealth | 0.000 | 1.628 |
| defense | 0.001 | **1.000** |

**Hard caps discovered:**
- **Food is capped at exactly 1.0** -- this is a hard ceiling.
- **Defense is capped at exactly 1.0** -- this is a hard ceiling.
- Population and wealth have no hard cap (max observed: pop=5.1, wealth=1.6).
- Population minimum is 0.01 (not zero -- settlements are removed/collapsed before reaching zero pop).

---

## FF. Per-Round Stochastic Entropy

| Round | Mean Entropy | Deterministic Fraction | p95 Entropy |
|-------|-------------|----------------------|-------------|
| f1dac9a9 | 0.075 | 89.8% | 0.54 |
| c5cdf100 | 0.270 | 61.7% | 1.06 |
| 36e581f1 | 0.443 | 56.6% | 1.50 |
| fd3c92ff | 0.508 | 46.0% | 1.50 |
| 8e839974 | 0.535 | 38.3% | 1.41 |
| 71451d74 | 0.631 | 33.5% | 1.50 |
| 2a341ace | 0.675 | 29.2% | 1.50 |
| 76909e29 | 0.799 | 22.0% | 1.56 |
| ae78003a | 0.948 | 18.4% | 1.75 |

**Clear pattern:** High-expansion rounds have much higher entropy. ae78003a (most expansive) has mean entropy 0.95 with only 18% deterministic cells. f1dac9a9 (near-extinction) has 90% deterministic cells.

This means: in harsh rounds, most cells are predictable (they stay empty). In expansive rounds, uncertainty is much higher because settlements spread widely and stochastically.

---

## GG. Initial Port Behavior

- Only **17.8% of initial ports survive as ports** to year 50.
- **25.6% are still alive** (as port or settlement) at year 50.
- **74.4% of initial ports are destroyed** by year 50.
- Mean port lifespan: 16 years, median: 12.
- Initial ports are surprisingly fragile -- they survive only slightly better than average settlements.

---

## HH. Settlement Fate by Founding Terrain

| Founding Terrain | Births | 5-Year Survival |
|-----------------|--------|-----------------|
| Plains | 86,764 | 73.9% |
| Forest | 32,708 | 73.7% |

**Founding terrain has zero effect on survival.** Settlements on plains and forest survive at identical rates (73.9% vs 73.7%). The terrain at founding is irrelevant to future success.

---

## II. Terminal Class Distribution Conditioned on Initial Class

This is the **master lookup table** for base-rate prediction:

| Initial | empty | settlement | port | ruin | forest | mountain |
|---------|-------|-----------|------|------|--------|----------|
| **settlement** | 0.455 | 0.294 | 0.004 | 0.025 | 0.222 | 0.000 |
| **port** | 0.540 | 0.078 | 0.178 | 0.014 | 0.190 | 0.000 |
| **forest** | 0.081 | 0.130 | 0.009 | 0.014 | 0.766 | 0.000 |
| **mountain** | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 1.000 |
| **ocean** | 1.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| **plains** | 0.815 | 0.125 | 0.009 | 0.013 | 0.037 | 0.000 |

**Key insights:**
- **Mountains and ocean are perfectly deterministic** (as previously confirmed).
- **Forest stays forest 76.6%** of the time -- the most stable non-static terrain.
- **Plains stay empty 81.5%** -- most plains don't get built on.
- **Initial settlements become empty 45.5%** of the time -- not even half survive in some form.
- **Initial settlements become forest 22.2%** of the time -- surprisingly common (via settlement->ruin->forest path).
- **Initial ports become empty 54%** -- even less likely to persist than settlements.
- This table could directly serve as a base-rate prior (before regime adjustment).

---

## JJ. Collapse Clustering

| Metric | Value |
|--------|-------|
| Mean collapses per step | 8.29 |
| Std | 10.83 |
| Max | 123 |
| P(0 collapses) | 11.9% |
| P(>=5 collapses) | 50.8% |
| P(>=10 collapses) | 28.0% |
| P(>=20 collapses) | 11.1% |
| Lag-1 autocorrelation | 0.219 |

**Mass die-offs do happen:** max 123 collapses in a single step. The distribution is very right-skewed (mean 8.3, max 123).

**Positive lag-1 autocorrelation (0.22)**: collapses are weakly cascading -- a bad year makes the next year more likely to be bad too. This suggests collapse events can trigger chain reactions (e.g., losing neighbors destabilizes remaining settlements).

---

## KK. NEWBORN SETTLEMENT STATS -- CRITICAL DISCOVERY

Newborn settlements have **near-constant stats**:

| Stat | Mean | Std | p50 | Notes |
|------|------|-----|-----|-------|
| population | 0.487 | 0.034 | **0.500** | Nearly always exactly 0.5 |
| food | 0.182 | 0.088 | 0.182 | Variable |
| wealth | 0.031 | 0.033 | 0.018 | Very low |
| defense | 0.192 | 0.017 | **0.200** | Only 4 unique values: {0.112, 0.14, 0.16, 0.2} |

**Newborns start with pop=0.5 and defense=0.2 almost always.** These are hard-coded starting values in the simulator. Defense has exactly 4 unique values, suggesting it's quantized or formula-based.

Food at birth varies more (0.05-0.35 range) -- likely determined by local terrain/resources.

---

## LL. REBUILT SETTLEMENT STATS -- CRITICAL DISCOVERY

Rebuilt settlements (from ruins) have **exactly constant stats**:

| Stat | Value |
|------|-------|
| population | **exactly 0.400** (zero variance) |
| food | 0.135 ± 0.053 (range 0.00-0.20) |
| defense | **exactly 0.150** (zero variance) |

**Rebuilds always start at pop=0.4, defense=0.15.** These are hard simulator constants. Newborns (pop=0.5, def=0.2) start slightly stronger than rebuilds (pop=0.4, def=0.15).

**70.7% of rebuilds are by the same owner as the pre-collapse settlement.** The original faction reclaims its ruined territory 71% of the time.

---

## Final Actionable Insights (Wave 5)

37. **Food cap is 1.0, defense cap is 1.0** -- these are hard ceilings to encode in any stat model.
38. **High-expansion rounds have 5x more entropy** than low-expansion rounds (0.95 vs 0.08 bits/cell).
39. **Initial ports survive as ports only 18%** of the time -- very fragile.
40. **Founding terrain (plains vs forest) has zero effect** on settlement survival.
41. **The initial->terminal class table** (Analysis II) provides a ready-made unconditional prior for prediction.
42. **Newborns start at pop=0.5, def=0.2** and **rebuilds at pop=0.4, def=0.15** -- hard simulator constants.
43. **Collapses cascade weakly** (lag-1 autocorr=0.22) -- bad years beget bad years.
44. **Mass die-offs** of up to 123 settlements per step occur -- the tail is very heavy.

---

## WAVE 6 FINDINGS (from replay_eda_wave6.py)

---

## MM. Spatial Autocorrelation

Overall spatial autocorrelation: P(adjacent same class) = 0.535 vs random 0.491 (ratio 1.09x). Modest overall clustering.

**Per-class clustering lifts:**

| Class | Lift |
|-------|------|
| mountain | 17.3x |
| port | 7.7x |
| settlement | 2.3x |
| ruin | 2.1x |
| forest | 1.2x |
| empty | 1.05x |

Mountains and ports are **extremely spatially clustered**. Mountains because they form chains. Ports because they're on coastlines (clustered along ocean boundaries). Settlements cluster at 2.3x -- settlements breed more settlements nearby. Ruins cluster at 2.1x -- when one settlement collapses, its neighbors are more likely to collapse too (cascade effect). Forest and empty are weakly clustered.

---

## NN. 4-Year Cycle Sub-Structure

Events by step mod 4:

| Position | Births/step | Collapses | Cell Changes | Port Gains |
|----------|------------|-----------|-------------|------------|
| mod 0 | 4.92 | 8.84 | 25.5 | 0.318 |
| mod 1 | 4.82 | 8.52 | 24.7 | 0.380 |
| mod 2 | 4.22 | 7.54 | 21.9 | 0.440 |
| mod 3 | **12.88** | 8.19 | **32.9** | 0.350 |

**The birth burst happens at mod 3** (steps 3, 7, 11, 15, 19, ...). Births are 2.6x higher at mod 3 vs mod 2. Collapses are roughly uniform across the cycle -- they don't have a periodic structure.

Port gains are slightly higher at mod 2 (0.44 vs 0.32-0.38) -- ports may be acquired preferentially one step before the birth burst.

---

## OO. Edge/Border Effects

| Region | Total Cells | Changed | Rate |
|--------|------------|---------|------|
| Edge (3 cells from border) | 97,600 | 17,434 | 17.9% |
| Interior | 403,032 | 87,885 | 21.8% |

**Edge cells change 18% less** than interior cells (ratio 0.82x). This is partly because edges have more ocean (less room for expansion) and partly because initial settlements are placed away from edges.

**Only 11.6% of initial settlements are near edges**, despite edges being 27.8% of the map. The map generator places settlements preferentially in the interior.

---

## PP. Expansion Barriers

### Ocean as barrier:

| Connectivity | Build Rate |
|-------------|-----------|
| Same land component as settlements | 15.9% |
| Disconnected (across ocean) | 3.0% |

Cells on the **same connected land mass** as initial settlements are **5.4x more likely** to be built on. Ocean is a major expansion barrier, but not absolute -- disconnected land still gets a 3% build rate (likely from sea-reachable settlement founding).

### Mountain blocking:

| Context | Build Rate |
|---------|-----------|
| Behind mountain (relative to nearest settlement) | 8.8% |
| Not blocked | 15.7% |

Mountains reduce build probability by **1.8x**. Mountains are a moderate barrier but not a hard wall -- settlements can go around them.

---

## QQ. Settlement Density Limits -- CRITICAL

### Maximum density at year 50:

- Max density in any 5x5 window: **0.92** (absolute max) -- nearly full saturation.
- Mean max density: 0.47 (about half a 5x5 window filled).

### Minimum spacing between settlements at year 50:

| Distance | Fraction |
|----------|----------|
| 1 (adjacent!) | **69.7%** |
| 2 | 23.8% |
| 3 | 5.1% |
| 4 | 1.0% |

**CRITICAL DISCOVERY: Settlements CAN be adjacent (distance 1) at year 50.** 70% of settlements have a neighbor at distance 1. The initial spacing constraint of 3 does NOT apply to founded settlements -- only to the initial map generation. This means settlement density can be very high locally.

---

## RR. Cell Cycling

Number of terrain transitions per cell across 50 steps:

| Transitions | Share | Cumulative |
|-------------|-------|-----------|
| 0 | 75.4% | 75.4% |
| 1 | 5.7% | 81.0% |
| 2 | 4.7% | 85.7% |
| 3 | 6.3% | 92.0% |
| 4 | 2.1% | 94.1% |
| 5 | 2.4% | 96.5% |
| 6-10 | 3.1% | 99.6% |
| 11-24 | 0.4% | 100% |

**75% of cells never change.** But 25% do, and of those, many cycle multiple times. The max is 24 transitions (12 complete settlement->ruin->rebuild cycles in 50 years). The distribution at 3 transitions (6.3%) is notably higher than 2 (4.7%) -- this is because of the settlement->ruin->rebuild/decay pattern: a cell that gets a settlement, loses it to ruin, and has the ruin resolved = 3 transitions.

---

## SS. Faction Consolidation Curve

| Year | Mean Factions | Gini (faction size) |
|------|--------------|-------------------|
| 0 | 46.6 | 0.000 |
| 5 | 32.8 | 0.175 |
| 10 | 27.4 | 0.244 |
| 20 | 23.2 | 0.247 |
| 30 | 21.4 | 0.278 |
| 40 | 20.1 | 0.305 |
| 50 | 18.8 | 0.324 |

**Rapid early consolidation**: factions drop from 47 to 33 in the first 5 years (30% eliminated). Then consolidation slows -- only 33 to 19 over the remaining 45 years.

Faction size inequality (Gini) grows slowly from 0 to 0.32 -- moderate but not extreme inequality. The biggest faction controls ~19% on average (from Analysis 9), confirming no single hegemon typically emerges.

---

## TT. Per-Round Transition Probabilities -- CRITICAL FOR MODELING

### P(terminal | initial=settlement), per round:

| Round | empty | settlement | ruin | forest |
|-------|-------|-----------|------|--------|
| f1dac9a9 (harsh) | 0.667 | 0.022 | 0.006 | 0.304 |
| c5cdf100 (harsh) | 0.610 | 0.059 | 0.010 | 0.320 |
| 8e839974 (moderate) | 0.476 | 0.243 | 0.023 | 0.253 |
| ae78003a (expansive) | 0.355 | 0.451 | 0.034 | 0.160 |

The hidden parameters shift P(terminal|initial) dramatically:
- In harsh rounds, initial settlements become empty 67% of the time.
- In expansive rounds, they stay settlement 45% of the time.

### P(terminal | initial=forest), per round:

| Round | forest stays | settlement | empty |
|-------|-------------|-----------|-------|
| f1dac9a9 | **96.8%** | 0.3% | 2.8% |
| c5cdf100 | 90.1% | 2.6% | 6.8% |
| ae78003a | **53.6%** | 26.2% | 15.1% |

In harsh rounds, forest is nearly immutable (97%). In expansive rounds, only 54% of forest survives -- settlements aggressively clear forest.

### P(terminal | initial=plains), per round:

| Round | plains stays | settlement | forest |
|-------|-------------|-----------|--------|
| f1dac9a9 | **98.7%** | 0.2% | 1.0% |
| ae78003a | 63.2% | 25.4% | 6.4% |

Same pattern: plains are nearly static in harsh rounds but heavily built on in expansive rounds.

**This is the key table for regime-conditioned prediction.** If you can infer the regime, you can dramatically improve per-cell class probabilities.

---

## UU. Initial Settlement Stat Distributions -- CRITICAL

**All four initial stats are perfectly uniform:**

| Stat | Min | Max | Distribution |
|------|-----|-----|-------------|
| population | 0.500 | 1.500 | **U[0.5, 1.5]** |
| food | 0.301 | 0.800 | **U[0.3, 0.8]** |
| wealth | 0.100 | 0.500 | **U[0.1, 0.5]** |
| defense | 0.200 | 0.600 | **U[0.2, 0.6]** |

Verified by uniform test: observed mean and std match expected uniform distribution to 3+ decimal places. The map generator draws each stat independently from a uniform distribution with the exact bounds shown.

---

## Final Actionable Insights (Wave 6)

45. **Settlements CAN be adjacent (distance 1)** at year 50 -- the initial spacing constraint of 3 is only for map generation, not a simulation rule. 70% of year-50 settlements have a neighbor at distance 1.
46. **Ocean blocks expansion 5.4x** -- cells on disconnected land masses are rarely built on.
47. **Mountains reduce expansion 1.8x** -- a moderate but not hard barrier.
48. **The birth burst happens at step mod 3** (steps 3, 7, 11, 15, ...) -- precise cycle phase.
49. **75% of cells never change** -- but the 25% that do can cycle up to 24 times.
50. **Per-round P(terminal|initial) varies massively** -- from forest staying 97% to 54% depending on regime. This table IS the regime signal.
51. **Initial stats are exactly uniform**: pop~U[0.5,1.5], food~U[0.3,0.8], wealth~U[0.1,0.5], defense~U[0.2,0.6].
52. **Settlement spatial clustering is 2.3x** expected -- nearby cells are likely to share settlement status.
53. **Faction consolidation is front-loaded**: 30% of factions eliminated in 5 years, then slow decay.
54. **Edge cells change 18% less** and settlements are placed 2.4x more in the interior.

---

## WAVE 7 FINDINGS (from replay_eda_wave7.py)

---

## VV. Collapse Threshold Analysis -- CRITICAL

### Collapse rate by population:

| Population | Collapse Rate |
|-----------|--------------|
| 0.0-0.3 | **23.5%** |
| 0.3-0.5 | **18.8%** |
| 0.5-0.7 | 7.5% |
| 0.7-1.0 | 3.4% |
| 1.0-1.5 | **2.6% (minimum)** |
| 1.5-2.0 | 3.3% |
| 2.0-3.0 | 5.4% |
| 3.0+ | **11.0%** |

**U-shaped collapse curve in population!** Small settlements (pop<0.5) and very large settlements (pop>3.0) both have elevated collapse rates. The sweet spot is pop=1.0-1.5 (2.6% collapse rate). This matches the "grow too fast, starve" finding from earlier -- very large settlements overextend.

### Collapse rate by food:

| Food | Collapse Rate |
|------|--------------|
| 0.0-0.1 | **24.8%** |
| 0.1-0.2 | **17.2%** |
| 0.3-0.5 | 11.3% |
| 0.5-0.7 | 7.1% |
| 0.7-0.9 | 7.5% |
| 0.9-1.0 | **3.1%** |

**Strong monotonic relationship** -- high food = low collapse. Settlements at food cap (0.9-1.0) collapse at only 3.1%, vs 24.8% for starving settlements. Food is the single best predictor of collapse.

### Collapse rate by defense:

| Defense | Collapse Rate |
|---------|--------------|
| 0.0-0.1 | **30.2%** |
| 0.1-0.2 | **18.4%** |
| 0.2-0.3 | 6.3% |
| 0.3-0.5 | 2.9% |
| 0.5-0.7 | 2.6% |
| 0.7-0.9 | 2.8% |
| 0.9-1.0 | 5.2% |

Defense shows a sharp threshold at 0.2: below 0.2 collapse is 18-30%, above 0.2 it drops to 3-6%. The rise at defense=0.9-1.0 (5.2%) may be because high-defense settlements are targets of strong attackers.

### Combined food x defense:

| Condition | Collapse Rate |
|-----------|--------------|
| food<0.3 & defense<0.3 | **14.9%** |
| food≥0.5 & defense≥0.5 | **2.0%** |
| Ratio | **7.5x** |

Low food + low defense = 7.5x more likely to collapse than well-fed + well-defended. This is the strongest signal for modeling individual settlement fate.

---

## WW. Population Growth Dynamics

### Growth by current population:

| Population | Mean Pop Delta |
|-----------|---------------|
| 0.0-0.3 | -0.003 (shrinking!) |
| 0.3-0.5 | +0.011 |
| 0.5-1.0 | +0.040 to +0.072 |
| 1.0-1.5 | **+0.090** (peak) |
| 1.5-3.0 | +0.060 to +0.066 |
| 3.0+ | +0.058 |

Population growth peaks at pop=1.0-1.5. Very small settlements barely grow, very large ones grow slower than medium ones. This resembles logistic growth.

### Growth by food:

Growth is positive at all food levels, but increases with food up to 0.4-0.6, then plateaus. Having more food doesn't make settlements grow faster above ~0.6.

---

## XX. Food Delta Decomposition -- CRITICAL

### Food production is mean-reverting:

| Previous Food | Mean Food Delta |
|-------------|----------------|
| 0.0-0.1 | **+0.28** |
| 0.1-0.3 | +0.25 |
| 0.3-0.5 | +0.13 |
| 0.5-0.7 | +0.12 |
| 0.7-0.85 | +0.02 |
| 0.85-0.95 | **-0.03** |
| 0.95-1.0 | **-0.05** |

**Food is strongly mean-reverting toward ~0.7-0.8.** Low-food settlements gain food rapidly (+0.28/step when near 0). High-food settlements lose food (-0.05/step when near cap). The equilibrium point is around food=0.75-0.85.

### Food delta by population:

| Population | Mean Food Delta |
|-----------|----------------|
| 0.0-0.5 | **+0.16** |
| 0.5-1.0 | +0.08 |
| 1.0-1.5 | +0.004 |
| 1.5-2.0 | **-0.034** |
| 2.0-5.0 | **-0.042** |

**Large populations consume food.** Settlements with pop>1.5 have negative food deltas on average -- they eat more than they produce. This creates the "grow too fast, starve" dynamic.

### Ports actually hurt food production:

Port settlements have mean food delta **-0.007** vs non-port +0.050. Ports trade rather than farm -- they sacrifice food for wealth.

---

## YY. Port Development Preconditions -- CRITICAL

**100% of port gains are coastal.** Zero non-coastal port gains.

### Port gain rate by food level (coastal settlements):

| Food | Port Gain Rate |
|------|---------------|
| 0.0-0.2 | **0.10%** |
| 0.2-0.4 | 1.8% |
| 0.4-0.6 | 6.5% |
| 0.6-0.8 | **11.1%** |
| 0.8-1.0 | **11.1%** |

Port gain rate increases with food up to 0.6, then saturates at ~11%. There's a **soft food threshold around 0.4-0.6** for port development. Minimum food at port gain: 0.11 (very rare at low food, but possible).

### Port gain population: median=0.72, p5=0.47. Small coastal settlements can gain ports.

---

## ZZ. Defense Dynamics

- Defense trends upward on average (+0.021/step).
- **Defense increases at all levels** (frac positive > 68%) EXCEPT near cap (defense ≥0.8: only 23% have positive delta).
- **Nearby conflict reduces defense**: settlements near an owner flip have mean delta -0.005 vs +0.022 without conflict.
- Defense at cap (≥0.99) has mean delta -0.0005 -- it stays near cap but slowly erodes.

Defense grows passively over time -- it's not just from fighting but from natural improvement. This explains why defense becomes bimodal: settlements that survive long enough inevitably approach the cap.

---

## AAA. Wealth Dynamics

- Overall wealth delta: **-0.001/step** -- tiny but consistently negative.
- **Wealth decays faster at higher levels**: wealth 0.2-0.5 loses -0.005/step, wealth 0.5+ loses -0.016/step.
- **Ports are the only positive wealth source**: port settlements gain +0.0007/step vs non-port -0.001/step.
- Only **7.5% of non-port settlement-steps** have positive wealth gain vs 17.8% for ports.
- This explains the wealth collapse to near-zero: most settlements are non-port and slowly bleed wealth. Only ports can sustain it, and ports are rare.

---

## BBB. Founding Distance -- CRITICAL

Distance from same-owner parent to new settlement:

| Distance | Share |
|----------|-------|
| 1 | **47.0%** |
| 2 | 24.7% |
| 3 | 14.3% |
| 4 | 10.7% |
| 5 | 3.4% |
| 6+ | **0.0%** |

**CRITICAL: Maximum founding distance is 5 (or maybe 6 with extreme rarity).** Settlements can ONLY be founded within distance 5 of a same-owner settlement. There are essentially zero foundings at distance 6+ (only 2 out of 119,472).

### Parent stats at founding:

| Stat | Mean | p25 | p50 | p75 |
|------|------|-----|-----|-----|
| Population | 1.69 | 1.08 | 1.70 | 2.17 |
| Food | 0.75 | 0.69 | 0.81 | 0.89 |

Parents are relatively prosperous: high population (1.7 mean) and good food (0.75 mean). P5 parent food is 0.27, so it's rare but possible for low-food parents to found settlements.

---

## Final Actionable Insights (Wave 7)

55. **Collapse rate is U-shaped in population**: sweet spot at pop=1.0-1.5 (2.6%). Both small and very large settlements are vulnerable.
56. **Food is the strongest collapse predictor**: 24.8% at food<0.1 vs 3.1% at food>0.9.
57. **Low food + low defense = 7.5x more collapse** vs well-fed + defended.
58. **Food is mean-reverting toward ~0.7-0.8** -- strong corrective force pushes food to equilibrium.
59. **Large populations (>1.5) consume food** (negative food delta) -- creating the growth-then-starvation cycle.
60. **Ports hurt food production** but enable wealth gain -- a trade-off.
61. **Port development saturates at food≥0.6** with 11% per-step gain rate for coastal settlements.
62. **Maximum founding distance from same-owner parent is 5** -- a hard expansion range limit.
63. **47% of foundings are at distance 1** from parent -- very local expansion.
64. **Defense grows passively** (+0.02/step) and naturally reaches the cap=1.0 in long-lived settlements.
65. **Wealth decays at higher levels** and is only sustained by ports -- explaining near-zero terminal wealth.

---

## WAVE 8 FINDINGS (from replay_eda_wave8.py)

---

## CCC. Ruin Fate Detailed Analysis -- CRITICAL NEGATIVE RESULT

**Initial terrain does NOT determine ruin fate.** Cells that were initially forest become forest after ruin at the same rate (21.8%) as cells that were initially plains (22.0%). The features that differentiate ruin->forest from ruin->plains are nearly identical across all measured dimensions.

The only significant differentiator is **distance to nearest alive settlement**: rebuild happens closer (1.63) than forest/decay (2.11-2.14). But forest vs plains is nearly identical.

This means ruin->forest vs ruin->plains is likely controlled by:
- A **random probability** (the hidden round parameters may set the reclamation rate)
- Not by local context or initial terrain

This simplifies modeling: ruin fate can be modeled as a fixed probability split (rebuild:forest:decay = ~48:17:35) that shifts by regime.

---

## DDD. Step 0 Detailed Mechanics

At step 0->1:
- **Zero births** -- founding never happens at step 0.
- **2.5 collapses** -- some settlements die immediately.
- **Zero port gains** -- no ports are developed at step 0.
- **0.7 owner flips** -- conquest does happen at step 0.

All step-0 cell changes are: settlement->ruin (2.3/run) and port->ruin (0.1/run). No other transitions at step 0.

This confirms: step 0 runs conflict + winter (collapse/conquest) but NOT growth (no births, no port development).

---

## EEE. Founding Probability Model -- CRITICAL

Base founding rate: 6.0% per settlement per step.

### Founding rate by step mod 4:

| Mod | Rate |
|-----|------|
| 0 | 4.4% |
| 1 | 4.3% |
| 2 | 4.0% |
| 3 | **11.8%** |

**Founding rate triples at mod 3** (the birth burst step). The 4-year cycle is driven by a hard 3x multiplier on founding probability.

### Founding rate by parent population:

| Pop | Rate |
|-----|------|
| 0.0-0.5 | 2.9% |
| 0.5-1.0 | 2.4% |
| 1.0-1.5 | 3.9% |
| 1.5-2.0 | **14.6%** |
| 2.0-3.0 | **13.8%** |
| 3.0+ | **14.7%** |

**Sharp threshold at pop=1.5**: founding rate jumps from 3.9% to 14.6%. Settlements need pop>=1.5 to effectively reproduce. This is a **hard population threshold for founding**.

### Founding rate by parent food:

| Food | Rate |
|------|------|
| 0.0-0.3 | 2.5% |
| 0.3-0.5 | 4.5% |
| 0.5-0.7 | 5.8% |
| 0.7-0.9 | **9.7%** |
| 0.9-1.0 | 4.3% |

Peak founding at food 0.7-0.9 (not at max food). Settlements at food cap (0.9-1.0) found LESS than those at 0.7-0.9. Possible explanation: food is consumed during founding, so high-food settlements that are about to found may show slightly lower food.

### Parent settlement profile:

Parents have higher population (1.68 vs 1.08), higher defense (0.70 vs 0.45), and slightly higher food (0.75 vs 0.70) than non-parents. Population is the strongest differentiator.

---

## FFF. Per-Round Collapse Rate

| Round | Collapse Rate | Character |
|-------|--------------|-----------|
| 36e581f1 | 5.9% | Low collapse |
| 71451d74 | 5.9% | Low collapse |
| 76909e29 | 7.4% | Moderate |
| fd3c92ff | 7.6% | Moderate |
| 8e839974 | 7.4% | Moderate |
| 2a341ace | 8.3% | High conflict |
| ae78003a | 9.5% | High expansion |
| c5cdf100 | **11.1%** | Very harsh |
| f1dac9a9 | **14.5%** | Extreme |

Collapse rates range from 5.9% to 14.5% -- a 2.5x range across rounds. This is a direct measure of the hidden "harshness" parameter. Note ae78003a has high collapse (9.5%) but also high expansion -- both birth and death rates are elevated.

---

## GGG. Defense Gain Mechanics

Defense gain rate: 71.2% of settlement-steps have positive defense delta.

Settlements that gain defense vs those that don't:
- Defense gain happens to **lower-defense** settlements (0.38 vs 0.72) -- defense grows toward cap.
- Defense gain happens to **lower-population** settlements (0.92 vs 1.68) -- small settlements focus on defense.
- Defense gain happens at **higher food** (0.74 vs 0.64) -- food fuels defense building.

Defense growth is a **passive process** that happens to most settlements, especially small well-fed ones.

---

## HHH. Terminal State by Position

| Position | empty | settlement | port | ruin | forest | mountain |
|----------|-------|-----------|------|------|--------|----------|
| Corner | 0.858 | 0.027 | 0.013 | 0.003 | 0.098 | 0.001 |
| Edge | 0.772 | 0.062 | 0.021 | 0.007 | 0.134 | 0.004 |
| Center | 0.611 | 0.132 | 0.003 | 0.013 | 0.215 | 0.026 |

**Corners are mostly empty** (86%) -- very little settlement activity reaches corners.
**Edges have more ports** (2.1%) than center (0.3%) -- ports are coastal and coastlines run along edges.
**Center has the most settlement/forest/mountain activity** -- the interior is where the action is.

---

## Final Actionable Insights (Wave 8)

66. **Ruin fate (forest vs plains) is NOT determined by initial terrain or local context** -- it's likely a hidden round parameter that sets the reclamation probability.
67. **Step 0 has no births and no port gains** -- only collapses (2.5) and owner flips (0.7).
68. **Founding requires pop≥1.5** (rate jumps from 4% to 15%) -- a hard population threshold.
69. **Founding rate triples at step mod 3** (11.8% vs 4.0-4.4%) -- the 4-year cycle is a 3x multiplier.
70. **Peak founding food is 0.7-0.9** (9.7%), NOT at food cap -- suggesting food is consumed during founding.
71. **Collapse rate varies 2.5x across rounds** (5.9% to 14.5%) -- a direct hidden parameter signal.
72. **Defense grows passively in 71% of steps** -- it's a slow accumulation, not event-driven.
73. **Corners are 86% empty at year 50** -- position strongly predicts terminal class.

---

## WAVE 9 FINDINGS (from replay_eda_wave9.py)

---

## III. Per-Round Ruin Reclamation Rate

| Round | Rebuild | Forest | Plains |
|-------|---------|--------|--------|
| ae78003a (expansive) | **0.525** | 0.145 | 0.330 |
| fd3c92ff | 0.500 | 0.162 | 0.337 |
| 76909e29 | 0.496 | 0.153 | 0.351 |
| 2a341ace | 0.489 | 0.171 | 0.341 |
| 36e581f1 | 0.486 | 0.165 | 0.349 |
| 71451d74 | 0.483 | 0.172 | 0.344 |
| 8e839974 | 0.457 | 0.188 | 0.354 |
| f1dac9a9 (harsh) | **0.388** | 0.187 | **0.425** |
| c5cdf100 (harsh) | **0.385** | 0.207 | **0.408** |

**Ruin fate IS regime-dependent.** In expansive rounds, 53% of ruins are rebuilt. In harsh rounds, only 39% are rebuilt and 41-43% decay to plains. Forest reclamation varies 0.145-0.207 across rounds -- a 1.4x range.

The pattern: more expansion = more rebuilding (more nearby settlements), less expansion = more decay to plains. Forest reclamation is relatively stable at ~17% regardless of regime.

---

## JJJ. Founding Population Threshold (Fine-Grained) -- CRITICAL

| Population | Founding Rate (mod-3 steps) |
|-----------|---------------------------|
| 0.0-1.3 | ~5% (flat, no trend) |
| 1.3-1.4 | 5.0% |
| **1.4-1.5** | **16.1%** (3x jump!) |
| 1.5-1.6 | 22.9% |
| 1.6-1.7 | 26.4% |
| 1.7-1.8 | **29.2%** (peak) |
| 1.8-3.4 | 24-29% (plateau) |

**The founding threshold is precisely at pop=1.4-1.5.** Founding rate jumps from 5% to 16% between pop 1.3-1.4 and 1.4-1.5, then continues rising to ~28% at pop 1.7-1.8 where it plateaus.

This is likely a **hard threshold near 1.4-1.5** in the simulator code, where settlements become eligible to found new settlements.

---

## KKK. Food Production Terrain Model -- CRITICAL

### Marginal effect of each 4-neighbor type on food delta:

| Neighbor Type | 0 neighbors | 1 | 2 | 3 | 4 |
|-------------|------------|---|---|---|---|
| **Plains** | +0.020 | +0.040 | +0.050 | **+0.054** | +0.053 |
| **Forest** | +0.040 | +0.052 | +0.056 | +0.058 | +0.057 |
| **Ocean** | +0.048 | +0.043 | +0.037 | +0.033 | +0.010 |
| **Mountain** | +0.047 | +0.049 | +0.037 | +0.050 | -- |
| **Settlement** | **+0.055** | +0.052 | +0.031 | +0.002 | **-0.027** |

**Key findings:**
- **Plains and forest neighbors increase food production** -- each additional neighbor adds ~0.01 food.
- **Settlement neighbors DECREASE food** at high counts: 4 settlement neighbors = **negative** food delta (-0.027). Resource competition!
- **Ocean slightly decreases food** -- each ocean neighbor costs ~0.005 food (less farmable land).
- **Mountain has minimal effect**.
- The food production formula appears to be: base rate (~0.02) + bonus per plains/forest neighbor (~0.01 each) - penalty per settlement neighbor (~0.02 at high density).

---

## LLL. Settlement Interaction Range

### Conflict range:

| Distance | Share |
|----------|-------|
| 1-4 | **91.0%** |
| 5-7 | 8.9% |
| 8-9 | 0.2% |
| 10+ | **0.0%** |

**Maximum conflict range is 9 cells.** Zero owner flips at distance 10+. 91% of conquests happen at distance 1-4. The peak is at distance 4 (31.6%), matching the initial settlement spacing.

### Port-port trade effect:

Ports near other ports (dist≤8) have wealth delta +0.00057 vs isolated ports +0.00097. **Isolated ports actually gain MORE wealth** than clustered ports. This may mean trade doesn't require port proximity, or that clustered ports split the same trade value.

---

## MMM. Per-Round Founding Rate

| Round | Founding Rate |
|-------|--------------|
| ae78003a | **7.9%** |
| 76909e29 | 6.7% |
| 2a341ace | 6.2% |
| 71451d74 | 6.1% |
| fd3c92ff | 5.8% |
| 8e839974 | 5.5% |
| 36e581f1 | 5.4% |
| c5cdf100 | 4.4% |
| f1dac9a9 | **1.9%** |

Founding rate varies 4x across rounds (1.9% to 7.9%). This is a direct measure of the expansion parameter. The near-extinction round (f1dac9a9) has founding rate 1/4 of the most expansive.

---

## NNN. Rebuild Ownership

- **70.7% of rebuilds are by the original owner** (same as pre-collapse faction).
- **82.8% of rebuilds are by the nearest alive settlement's owner** -- proximity determines rebuild ownership.
- Since nearest≠original in some cases, proximity matters more than historical ownership.

---

## OOO. Alive Count Variance Trajectory

The coefficient of variation (CV) of alive settlement count within a seed:
- **Year 0: CV=0** (deterministic initial count).
- **Year 10: CV=0.05-0.20** -- moderate uncertainty.
- **Year 30: CV=0.08-0.40** -- significant spread.
- **Year 50: CV=0.09-0.34** -- wide but not always growing.

CV peaks around year 30-40 then can stabilize or decrease slightly. This suggests the system enters a quasi-steady state where variance stops growing -- consistent with a soft carrying capacity.

---

## Final Actionable Insights (Wave 9)

74. **Founding threshold is precisely at pop=1.4-1.5** -- founding rate jumps 3x (5% to 16%) at this threshold.
75. **Food production = base + plains/forest bonus - settlement penalty**: each plains/forest neighbor adds ~0.01, each settlement neighbor above 2 costs ~0.02.
76. **Maximum conflict range is 9 cells** -- zero conquests beyond this.
77. **Ruin fate varies by regime**: rebuild rate ranges from 39% (harsh) to 53% (expansive).
78. **Forest reclamation rate is near-constant at ~17%** across all rounds -- a fixed mechanic.
79. **Founding rate varies 4x** across rounds (1.9% to 7.9%) -- a direct regime parameter.
80. **Rebuild ownership is 83% nearest-alive** -- proximity dominates historical ownership.
81. **Stochastic CV of alive count peaks at ~30% by year 30-40** then stabilizes.

---

## WAVE 10 FINDINGS (from replay_eda_wave10.py)

---

## PPP. Sea Conquest (Longship Proxy)

| Connectivity | Flips | Share |
|-------------|-------|-------|
| Same land component | 8,039 | **99.3%** |
| Across sea | 56 | **0.7%** |

**99.3% of conquests happen on the same landmass.** Sea-based conquest is extremely rare (0.7%), despite longships being mentioned in the docs. Only 4.7% of attackers have ports.

This means for modeling: **conquest is essentially land-only**. Longship-based maritime conquest exists but is negligible.

---

## QQQ. Initial vs Founded Settlement Survival

| Type | Survived to Year 50 | Rate |
|------|---------------------|------|
| Initial settlements | 4,941/16,792 | **29.4%** |
| Founded settlements | 64,031/115,597 | **55.4%** |

**Founded settlements survive nearly 2x more** than initial settlements! This is counterintuitive but explained by:
1. Many founded settlements are created late in the game (so they haven't had time to die)
2. Founded settlements are placed in favorable locations (near prosperous parents)
3. Initial settlements face the full 50-year gauntlet from step 0

---

## RRR. Founding Patterns

| Settlement Neighbors (4-connected) | Share |
|-------------------------------------|-------|
| 0 neighbors | **45.9%** |
| 1 neighbor | 36.5% |
| 2 neighbors | 13.2% |
| 3 neighbors | 3.5% |
| 4 neighbors | 0.9% |

**46% of foundings happen on cells with NO adjacent settlements** -- settlements expand into empty land, not fill gaps. 37% have exactly 1 neighbor. Settlements rarely pack densely at founding -- the density comes later as the wavefront fills in.

---

## SSS. Food Production Regression -- CRITICAL

**Linear model explains 59% of food delta variance (R²=0.594):**

| Feature | Coefficient |
|---------|------------|
| intercept | **+0.354** |
| prev_food | **-0.408** |
| prev_pop | **-0.106** |
| n_plains | **+0.033** |
| n_forest | **+0.047** |
| n_settlement | **-0.010** |
| n_ocean | +0.004 |

**The reverse-engineered food formula:**
```
food_delta ≈ 0.35 - 0.41 * food - 0.11 * pop + 0.033 * plains + 0.047 * forest - 0.010 * settlements
```

Interpretation:
- **Strong mean-reversion**: -0.41 coefficient on prev_food. Food equilibrium is at ~0.35/(0.41) ≈ 0.85 for a settlement with no neighbors.
- **Population consumes food**: -0.11 per unit pop. A pop=2 settlement loses 0.22 food/step from consumption.
- **Forest provides more food than plains** (0.047 vs 0.033) -- 40% more productive per neighbor.
- **Settlement neighbors drain food** slightly (-0.01 per neighbor) -- competition.
- **Ocean barely matters** (+0.004).
- This 6-parameter model captures 59% of food dynamics -- a strong predictive signal.

---

## TTT. Terminal State by Coast Distance

| Distance from Coast | empty | settlement | port | forest |
|---------------------|-------|-----------|------|--------|
| 0 (ocean) | 1.000 | 0.000 | 0.000 | 0.000 |
| 1 (coastline) | 0.657 | 0.054 | **0.061** | 0.214 |
| 2 | 0.605 | 0.146 | 0.000 | 0.225 |
| 3-15 | ~0.59 | ~0.14 | 0.000 | ~0.22 |

**Ports ONLY appear at coast distance 1** -- exactly adjacent to ocean. Zero ports at distance 2+. This is a **hard geometric rule**: port requires ocean adjacency.

The settlement rate is remarkably flat (13-15%) from distance 2 through 15. Coast distance beyond 1 has almost no effect on terminal settlement probability. Only the immediate coastline (distance 1) has lower settlement density, offset by port probability.

---

## UUU. Cycle Phase Consistency

The birth cycle phase varies slightly by round:
- Most rounds have the dominant spike at mod 3 (steps 3, 7, 11, ...)
- Some rounds also show spikes at mod 0 or mod 1
- All rounds show near-zero births at steps 0, 1, and 4

The 4-year cycle is robust but not perfectly clean -- secondary spikes can appear at other phases, especially in high-activity rounds.

---

## Final Actionable Insights (Wave 10)

82. **Conquest is 99.3% land-based** -- sea conquest via longships is negligible.
83. **Founded settlements survive 2x more** (55%) than initial ones (29%) -- partly due to recency bias.
84. **46% of foundings have zero adjacent settlements** -- expansion into empty land, not gap-filling.
85. **Food formula reverse-engineered**: food_delta ≈ 0.35 - 0.41*food - 0.11*pop + 0.033*plains + 0.047*forest (R²=0.59).
86. **Forest provides 40% more food than plains** per neighbor (0.047 vs 0.033).
87. **Ports require exactly coast distance 1** -- a hard rule, zero ports at distance 2+.
88. **Settlement rate is flat (14%) from distance 2 to 15** from coast -- coast distance beyond 1 is irrelevant.

---

## WAVE 11 FINDINGS (from replay_eda_wave11.py)

---

## VVV. Population Growth Regression

R²=0.064 -- population growth is **very hard to predict** from current stats alone.

```
pop_delta ≈ -0.021 + 0.061*pop + 0.041*food + 0.033*defense - 0.016*pop*food - 0.014*pop²
```

Interpretation: population growth increases with pop, food, and defense, but has negative quadratic terms. Growth peaks at moderate population and slows at extremes. But R²=6% means most population dynamics are driven by stochastic/hidden factors, not observable stats.

---

## WWW. Defense Gain Regression

R²=0.361 -- defense dynamics are **moderately predictable**.

```
defense_delta ≈ -0.051 + 0.334*defense - 0.243*defense² + 0.047*pop - 0.059*defense*pop - 0.013*food
```

**Defense grows quadratically toward a cap**: +0.334*def - 0.243*def² = 0 at def≈1.37, meaning defense naturally converges toward ~1.0 cap. Population accelerates defense growth but the interaction term defense*pop is negative -- large settlements with high defense grow defense slower.

---

## XXX. Collapse Probability Model

R²=0.075 -- collapse prediction from observable stats is weak but non-trivial.

```
P(collapse) ≈ 0.15 - 0.01*pop - 0.05*food + 0.16*defense - 0.32*food*defense + 0.03*n_enemy - 0.002*n_friendly
```

**The food*defense interaction is the strongest collapse predictor** (coefficient -0.32). High food AND high defense together dramatically reduce collapse. But defense alone INCREASES collapse probability (+0.16) -- this counterintuitive result likely reflects that high-defense settlements are in conflict zones.

Enemy neighbors increase collapse (+0.033 per enemy within 3 cells). Friendly neighbors weakly protect (-0.002).

Calibration shows the model is reasonably well-calibrated: predicted 5% → actual 2.3%, predicted 20% → actual 18%.

---

## YYY. Port Loss Conditions

- **4.9% of port-steps result in port loss** -- ports are quite stable per-step.
- **99.3% of port losses → ruin** (0.7% → re-port, edge case).
- Port loss correlates with **low food** (0.494 vs 0.762 for kept ports). Food is the primary driver.
- Population and defense are similar for lost vs kept ports.
- Food below 0.5 is the danger zone for port survival.

---

## ZZZ. Per-Round Food Formula Coefficients -- CRITICAL

| Round | Intercept | food coeff | pop coeff | plains | forest | R² |
|-------|-----------|-----------|-----------|--------|--------|-----|
| ae78003a | +0.273 | -0.363 | -0.084 | **+0.042** | **+0.059** | 0.622 |
| 8e839974 | +0.495 | -0.551 | -0.112 | +0.025 | +0.036 | 0.631 |
| c5cdf100 | +0.521 | -0.578 | -0.136 | +0.028 | +0.041 | 0.669 |
| f1dac9a9 | +0.437 | -0.488 | -0.105 | +0.027 | +0.036 | 0.691 |

**The food formula coefficients VARY BY ROUND -- they are hidden parameters!**

Key variations:
- **Intercept** (base food production): ranges from 0.273 (ae78003a) to 0.521 (c5cdf100). Low intercept = less food.
- **food coefficient** (mean-reversion strength): ranges from -0.344 to -0.578. Stronger reversion in harsh rounds.
- **pop coefficient** (consumption rate): ranges from -0.084 to -0.136. Harsh rounds have higher consumption.
- **Plains and forest coefficients** vary ~2x: plains 0.025-0.042, forest 0.036-0.059.
- R² is consistently 0.56-0.69 across rounds, meaning the linear model captures similar fraction of variance in all regimes.

**This is a key insight for regime inference**: the food formula coefficients are the hidden parameters (or strongly correlated with them). If you can estimate these coefficients from early observations, you've effectively inferred the regime.

---

## AAAA. Founding Cell Choice

Chosen founding cells have **slightly fewer** plains and forest neighbors than unchosen alternatives:
- Plains: chosen=2.19 vs unchosen=2.41
- Forest: chosen=0.80 vs unchosen=0.87

This is a weak effect. The founding cell appears to be chosen roughly at random among eligible cells within range of the parent settlement, with a slight preference for cells with fewer farmable neighbors (perhaps preferring cells adjacent to settlements for defense?).

---

## Final Actionable Insights (Wave 11)

89. **Population growth is mostly stochastic** (R²=0.064) -- individual growth is unpredictable from stats alone.
90. **Defense converges toward cap=1.0 quadratically** (R²=0.36) -- a predictable mean-reverting process.
91. **food*defense interaction is the strongest collapse predictor** -- both high food AND defense needed for safety.
92. **Port loss is driven by low food** (0.49 vs 0.76) -- food is the port survival signal.
93. **THE FOOD FORMULA COEFFICIENTS ARE THE HIDDEN ROUND PARAMETERS** -- intercept, mean-reversion, consumption, and terrain bonuses all vary by round. Estimating these from early observations ≈ regime inference.
94. **Founding cell choice is roughly random** among eligible cells within range -- no strong site preference.

---

## WAVE 12 FINDINGS (from replay_eda_wave12.py)

---

## BBBB. Per-Seed Food Formula Consistency -- CONFIRMED

Cross-seed coefficient of variation within each round:

| Round | CV(intercept) | CV(food) | CV(pop) | CV(plains) | CV(forest) |
|-------|-------------|---------|---------|-----------|-----------|
| 2a341ace | 0.021 | 0.022 | 0.007 | 0.019 | 0.026 |
| 76909e29 | 0.018 | 0.015 | 0.021 | 0.036 | 0.025 |
| c5cdf100 | 0.012 | 0.016 | 0.033 | 0.044 | 0.037 |
| ae78003a | 0.042 | 0.038 | 0.029 | 0.036 | 0.034 |

**Cross-seed CV is 1-5% for all coefficients.** The food formula coefficients are essentially identical across all 5 seeds within a round, confirming they are shared hidden parameters. This is rock-solid evidence that the food model parameters ARE the hidden round parameters.

---

## CCCC. Early-Step Regime Estimation -- CRITICAL

Can the regime be estimated from just the first 10 steps?

| Round | Cosine Similarity (early vs full) |
|-------|----------------------------------|
| c5cdf100 | 0.9998 |
| 8e839974 | 0.9994 |
| 76909e29 | 0.9992 |
| 2a341ace | 0.9986 |
| 71451d74 | 0.9985 |
| f1dac9a9 | 0.9982 |
| fd3c92ff | 0.9967 |
| ae78003a | 0.9924 |
| 36e581f1 | 0.9898 |

**YES -- cosine similarity > 0.989 in ALL rounds.** The food formula estimated from just the first 10 steps nearly perfectly matches the full-game formula. The regime can be identified extremely early.

The coefficients are systematically higher in early steps (intercept and food-reversion are ~20% larger), suggesting early-game food dynamics are slightly stronger. But the relative ranking and direction of all coefficients is preserved.

**This is the key operational insight**: with just ~10 simulate queries revealing settlement food dynamics, you can estimate the hidden round parameters with high fidelity.

---

## DDDD. Regime -> Terminal State Correlations

| Regime Feature | Strongest Correlated Terminal Class |
|---------------|--------------------------------------|
| **founding_rate** | settlement r=**+0.929**, empty r=**-0.950** |
| food_forest | settlement r=+0.745, empty r=-0.714 |
| food_intercept | empty r=+0.694, forest r=**+0.812** |
| collapse_rate | port r=-0.649, settlement r=-0.619 |

**Founding rate is the single best predictor** of terminal state (r=0.93 for settlement, r=-0.95 for empty). This makes sense -- founding rate directly controls how many settlements fill the map.

**Food intercept strongly predicts forest fraction** (r=+0.812). Higher base food production → less starvation → fewer ruins → less forest reclamation → more original forest survives. Wait -- actually this is inverted: higher intercept means MORE food → MORE settlement survival → LESS empty → but this correlates positively with forest? Looking at the data, the high-intercept rounds (8e839974, c5cdf100, f1dac9a9) are the HARSH rounds -- they have high intercept but also high reversion and high pop cost. The intercept alone doesn't capture the regime.

---

## EEEE. Cell-Level Terminal Prediction

R²=0.027 from initial features alone -- **very weak** cell-level prediction without regime information. The most important feature is `dist_settlement` (coeff -0.025), confirming distance from initial settlements matters but is insufficient.

This confirms: **cell-level prediction requires regime inference**. Initial features alone explain only 2.7% of terminal variance.

---

## FFFF. Growth Curve Shapes

| Round | N0 | N50 | Growth Ratio | Character |
|-------|-----|-----|-------------|-----------|
| ae78003a | 48 | 382 | 8.0x | Explosive |
| 76909e29 | 48 | 290 | 6.0x | Strong |
| 71451d74 | 42 | 243 | 5.9x | Strong |
| 2a341ace | 44 | 210 | 4.8x | Moderate |
| 36e581f1 | 54 | 225 | 4.2x | Moderate |
| fd3c92ff | 48 | 184 | 3.8x | Moderate |
| 8e839974 | 48 | 148 | 3.1x | Slow |
| c5cdf100 | 46 | 38 | 0.8x | Declining |
| f1dac9a9 | 43 | 4 | 0.1x | Extinction |

Growth rates decelerate over time in all positive rounds (consistent with soft carrying capacity). The two harsh rounds (c5cdf100, f1dac9a9) have consistently negative growth rates throughout.

---

## Final Actionable Insights (Wave 12)

95. **Food formula coefficients have <5% cross-seed CV** -- confirmed as shared hidden parameters.
96. **Regime is estimable from first 10 steps** with cosine similarity >0.989 to full-game coefficients.
97. **Founding rate is the strongest regime-to-terminal predictor** (r=0.93 for settlement probability).
98. **Cell-level prediction is nearly impossible (R²=0.03) without regime inference** -- regime dominates.
99. **Growth follows decelerating curves** in positive rounds, consistent negative in harsh rounds.
100. **The food formula IS the regime**: 5 coefficients (intercept, food-reversion, pop-cost, plains-bonus, forest-bonus) fully characterize the hidden parameters.

---

## WAVE 13 FINDINGS (from replay_eda_wave13.py)

---

## GGGG. Per-Round Newborn Stats -- CRITICAL

**Newborn population is constant at ~0.49 across all rounds** (std 0.03-0.04). The pop=0.5 constant is NOT a hidden parameter -- it's a fixed simulator constant.

**Newborn defense is always from {0.112, 0.14, 0.16, 0.2}** -- exactly 4 discrete values across all rounds. This is likely determined by a formula (e.g., related to nearby settlement defense or terrain).

**BUT newborn food VARIES DRAMATICALLY by round:**

| Round | Mean Newborn Food | Std |
|-------|------------------|-----|
| f1dac9a9 (extinction) | **0.080** | 0.030 |
| ae78003a (explosive) | **0.110** | 0.079 |
| 2a341ace | 0.156 | 0.069 |
| 71451d74 | 0.175 | 0.071 |
| fd3c92ff | 0.209 | 0.080 |
| 36e581f1 | 0.210 | 0.072 |
| 76909e29 | 0.215 | 0.062 |
| c5cdf100 (harsh) | **0.272** | 0.039 |
| 8e839974 | **0.276** | 0.059 |

**Newborn food is a hidden parameter!** It ranges from 0.08 to 0.28 across rounds. Counterintuitively, the harshest rounds (f1dac9a9, ae78003a) have the LOWEST newborn food, while moderate rounds have higher. Low newborn food → new settlements start hungrier → higher infant mortality → fewer survive → less expansion.

Wait, ae78003a is the most expansive round but has the 2nd-lowest newborn food (0.11). This means high founding rate can overcome low starting food through sheer volume.

---

## HHHH. Conquest Probability Model -- CRITICAL

Base conquest rate for settlements with an enemy within 5 cells: **0.71%** per step.

### Key conquest predictors:

| Feature | Conquered | Not Conquered |
|---------|-----------|---------------|
| Defender pop | **0.61** | 1.12 |
| Defender defense | **0.25** | 0.47 |
| Enemy pop | 1.19 | 1.04 |
| Distance to enemy | **2.84** | 3.81 |
| Pop ratio (enemy/def) | **2.44** | 1.63 |
| Defense ratio (enemy/def) | **2.60** | 1.69 |

**Conquest requires the attacker to be ~2.5x stronger** in both population AND defense. The defender needs to be small (pop 0.61) and poorly defended (def 0.25).

### Conquest rate by pop ratio:

| Pop Ratio (enemy/defender) | Conquest Rate |
|---------------------------|--------------|
| < 0.5 | 0.10% |
| 0.5-1.0 | 0.80% |
| 1.0-1.5 | 1.01% |
| 2.0-3.0 | 1.07% |
| 3.0+ | 1.26% |

Conquest rate increases with pop ratio but plateaus above 1.0 -- having 3x more pop doesn't help much more than 1.5x. The biggest jump is from <0.5 (0.1%) to 0.5-1.0 (0.8%) -- attackers need at least half the defender's pop.

### Defense ratio shows similar pattern -- defense is equally important as population for conquest.

---

## IIII. Most Variable Cells

High-entropy (top 5%) cells by initial terrain:
- **Plains: 46%** -- most uncertain cells started as plains
- **Forest: 35%** -- substantial
- **Settlement: 18%** -- overrepresented (settlements are only 2.8% of cells but 18% of high-entropy)
- **Port: 1%**

High-entropy cells are at distance **2.0** from initial settlements. Low-entropy cells at distance **3.3**. The frontier zone (distance 2-3) is the most uncertain region -- cells right at the expansion boundary.

---

## KKKK. Forest Reclamation Rate -- NOT a Hidden Parameter

| Round | forest/(forest+plains) |
|-------|----------------------|
| 8e839974 | 0.347 |
| c5cdf100 | 0.337 |
| 2a341ace | 0.333 |
| 71451d74 | 0.334 |
| fd3c92ff | 0.325 |
| 36e581f1 | 0.322 |
| ae78003a | 0.306 |
| f1dac9a9 | 0.305 |
| 76909e29 | 0.303 |

**Forest reclamation rate varies only 0.303-0.347** (14% relative range) across rounds. Compare to founding rate which varies 4x and collapse rate which varies 2.5x. Forest reclamation is a near-constant mechanic: **~32% of non-rebuilt ruins become forest, ~68% become plains.** This is NOT significantly regime-dependent.

---

## LLLL. Newborn Food by Round (Confirmed Regime-Dependent)

This confirms finding GGGG with percentile detail:

| Round | Mean | p5 | p50 | p95 |
|-------|------|-----|-----|-----|
| f1dac9a9 | 0.080 | 0.043 | 0.081 | 0.089 |
| ae78003a | 0.110 | 0.024 | 0.079 | 0.272 |
| 8e839974 | 0.276 | 0.203 | 0.269 | 0.447 |
| c5cdf100 | 0.272 | 0.217 | 0.276 | 0.287 |

The distribution is very narrow in harsh rounds (f1dac9a9: std=0.030) and wider in moderate/expansive rounds (ae78003a: std=0.079). The harsh rounds give newborns barely enough food to survive.

---

## Final Actionable Insights (Wave 13)

101. **Newborn food is a hidden round parameter** ranging from 0.08 to 0.28 -- a 3.5x range.
102. **Newborn population (0.5) and defense ({0.112-0.2}) are NOT hidden parameters** -- fixed constants.
103. **Conquest requires ~2.5x attacker superiority** in pop and defense over the defender.
104. **Conquest rate is only 0.7% per step** for settlements with nearby enemies -- rare but impactful.
105. **The expansion frontier (distance 2-3 from initial settlements) is the most stochastically uncertain zone.**
106. **Forest reclamation rate is ~32% and NOT regime-dependent** (only 14% relative variation).
107. **The full set of hidden parameters** now identified: food formula coefficients (5), newborn food level (1), founding rate modifier, collapse rate modifier -- approximately 7-8 free parameters per round.
