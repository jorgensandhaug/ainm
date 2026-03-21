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
