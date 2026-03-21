I reread the rules carefully, and the most important correction is this:

The world is **not** “static geometry plus a few cell events.”
It is a **hierarchical stochastic multi-agent system on top of static terrain geometry**.

So the right ontology is:

1. **Static terrain geometry**: ocean, plains, empty land, forest patches, mountains, fjords, coastlines, barriers, basins, reachability.
2. **Dynamic site state** on each cell: whether the site is currently empty, settlement, port, ruin, forest, mountain, etc.
3. **Dynamic settlement state** on occupied sites: population, food, wealth, defense, port status, alive flag, owner structure, and maybe hidden tech/longship memory.
4. **Dynamic interaction geometry** between settlements: who can trade, who can raid, who pressures whom, how sea reach changes things, how faction frontiers are laid out.
5. **Round-level regime**: the latent behavioral law shared across all 5 seeds in a round.
6. **Stochastic shocks/noise**: yearly common shocks plus local randomness.

The official docs already imply this hierarchy: 5 seeds share one hidden behavioral parameter set per round, the world evolves for 50 yearly steps, the yearly phases are growth → conflict → trade → winter → environment, the map has 8 internal terrain codes collapsed to 6 scored classes, and settlements track rich state including population, food, wealth, defense, port status, tech level, longship ownership, and faction allegiance.

So yes: your instinct was right. Settlements are *far* more central than I originally made them sound. Static geometry matters, but it matters because it shapes what settlements can do.

---

# 1. The right mental picture

The best way to think about Astar Island is:

* **cells are sites**,
* **settlements are marked processes living on sites**,
* **round law controls how those marked processes evolve**,
* **terrain geometry constrains and channels the process**.

A settlement at ((x,y)) is not just “site occupied.” It is a marked object:

[
s_{i,t} = (x_i, y_i,; \text{population}, \text{food}, \text{wealth}, \text{defense}, \text{has_port}, \text{alive}, \text{owner structure}, h_{i,t})
]

where (h_{i,t}) is optional hidden memory for variables the replay may not expose, such as tech or longship state if those remain hidden. The docs explicitly say tech level and longship ownership are tracked internally, even though the active `/simulate` endpoint exposes only a subset of settlement marks.

So when we model the world, the true state is something like

[
X_t = (G,; C_t,; S_t,; H_t)
]

where:

* (G) = static geometry,
* (C_t) = current cell/site classes,
* (S_t) = current settlement table,
* (H_t) = hidden dynamic memory not fully observed.

That is the proper decomposition.

---

# 2. There are actually three “geometries,” not one

This is probably the cleanest conceptual fix.

## A. Static terrain geometry

This is what I previously called geometry too narrowly:

* coastline,
* ocean borders,
* fjords,
* mountain chains,
* forest patches,
* plains/empty land,
* connected components,
* barriers,
* bottlenecks,
* land and sea travel cost.

This part is static per map seed.

## B. Dynamic settlement geometry

At any year (t), settlements define a changing spatial arrangement:

* where live settlements exist,
* which sites are ruins,
* which sites are ports,
* how far apart powers are,
* where frontier zones are.

This is dynamic because the set of live occupied sites changes over time.

## C. Dynamic interaction geometry

This is the most important and the most overlooked layer.

Two settlements can be:

* close by land,
* close by sea,
* separated by mountains,
* separated by ownership,
* connected by coast/port structure,
* potentially in conflict,
* potentially in trade range.

This interaction geometry changes over time because:

* new ports create long-range sea edges,
* ownership changes redraw faction boundaries,
* settlements die and are reborn,
* hidden longship/tech state may change effective reach.

So the world is not a plain grid automaton. It is a **grid + dynamic graph** system.

That is why the best teacher model needs both:

* a local cell/site update module,
* and a settlement interaction graph module.

---

# 3. What the rules imply for modeling

The official phase descriptions are not just flavor text. They tell you what kinds of transition structure must exist.

## Growth implies

* settlement marks matter directly, especially population/food/wealth,
* local terrain support matters,
* nearby forests matter,
* prosperity gates founding/birth,
* coastal context gates port formation,
* hidden tech/longship may influence future growth indirectly.

### Observable signatures in replay

* food/population increases near supportive terrain,
* new sites founded near strong parent settlements,
* coastal prosperous settlements become ports more often.

## Conflict implies

* pairwise or multi-settlement interactions matter,
* not-war / war structure matters,
* low-food state may increase aggression,
* owner switches are meaningful outputs,
* local defense and wealth are not just decorations; they are transition drivers.

### Observable signatures in replay

* settlements with low food and exposed frontiers lose wealth/food/defense or flip owner,
* neighboring rival owners create unstable boundary sites,
* long-range pressure may appear from maritime actors.

## Trade implies

* ports create nonlocal positive interactions,
* same-owner or not-at-war structure matters,
* wealth/food growth can be relational, not purely local,
* hidden tech diffusion may create persistent latent improvement.

### Observable signatures

* pairs or networks of ports with compatible relations show synchronized gains,
* maritime clusters outperform isolated inland settlements,
* some prosperity spreads along connectivity rather than local adjacency.

## Winter implies

* there is likely a global or semi-global yearly shock component,
* food is a key vulnerability channel,
* collapse risk is not just local random noise.

### Observable signatures

* synchronized food drops across many settlements in the same year,
* collapse spikes after broad adverse years,
* already weakened settlements are selectively eliminated.

## Environment implies

* ruins have a life cycle,
* ruin-to-forest vs ruin-to-rebuild is a real branch,
* nearby thriving settlements change ruin fate,
* coastal ruins can specifically come back as ports.

### Observable signatures

* ruin lifetime distributions,
* reclaim to forest/plain when isolated,
* rebuild near strong nearby settlements,
* coastal ruins show distinct recovery patterns.

This phase logic is the reason a semimechanistic event-based model is so natural here.

---

# 4. What replay lets you observe directly vs only indirectly

This is critical.

Even with full yearly replay, you do **not** automatically observe the internal phase decomposition. If replay gives only year-boundary states (X_t) and (X_{t+1}), then you observe the net yearly effect, not the separate growth/conflict/trade/winter/environment substeps.

So we need to distinguish:

## Hard observable events

These can be read directly from replay transitions:

* new settlement appears,
* settlement disappears / collapses,
* ruin appears,
* ruin vanishes,
* site becomes port,
* owner changes,
* food/wealth/defense/population changes.

These are supervised labels.

## Soft latent subevents

These are *not* directly labeled in replay:

* trade interactions,
* raids,
* war state,
* longship activation,
* tech diffusion,
* exact winter severity parameter.

These have to be inferred indirectly from patterns in the hard observables.

That means the event-extractor layer should not pretend it can “extract trade events” with certainty. It should only extract:

* hard, directly observable state changes,
* plus maybe proxy signals for latent mechanisms.

This is a very important modeling discipline point.

---

# 5. What the event extractor should actually do

The event extractor should be a **measurement layer**. Its job is to convert raw trajectories into structured training tables.

It should produce at least four classes of outputs.

## A. Site transition records

For each cell/site (u) and year (t), record:

* site state at (t),
* site state at (t+1),
* static geometry around the site,
* nearby settlement context,
* whether a birth, collapse, reclaim, rebuild, portization, etc. happened.

This is for local/site-level hazards.

## B. Settlement survival/update records

For each live settlement-site at year (t), record:

* population,
* food,
* wealth,
* defense,
* has_port,
* alive,
* owner structure,
* local geometry,
* nearby supportive and hostile settlements,
* deltas to (t+1),
* hard event labels like collapse / owner switch / portization.

This is for settlement-level hazard and mark-update models.

## C. Pairwise interaction candidate records

For settlement pairs ((i,j)) that are plausibly connected by land or sea:

* geodesic land distance,
* geodesic sea distance,
* mixed reachability,
* shared owner or not,
* port status,
* relative strengths,
* subsequent changes in marks.

These do **not** give direct trade or raid labels, but they provide the data needed to model latent interaction kernels.

## D. Year-level shock records

For each round/year:

* aggregate settlement food deltas,
* aggregate collapse rate,
* aggregate wealth changes,
* dispersion/correlation patterns across settlements.

These are for detecting common yearly shocks such as winter severity.

So the event extractor is not one thing. It is a family of structured supervised tables.

---

# 6. What “fit” means at each stage

Now let’s go through the fitted stages again, but in this richer understanding.

## Stage 1 — Fit per-round effective summaries

For each round separately, fit compact models describing how that round behaves.

Example: collapse hazard for one round.

Create one row per settlement-year:

* inputs:

  * settlement marks,
  * local geometry,
  * dynamic context,
  * graph context,
  * maybe year-level shock proxies,
* target:

  * did this settlement collapse by next year? yes/no.

Then fit:
[
\Pr(\text{collapse}*{i,t+1}=1\mid X_t)=\sigma(\alpha_r + w_r^\top f*{i,t})
]

Here:

* (f_{i,t}) are constructed features,
* (\alpha_r, w_r) are the fitted parameters for round (r).

Do the same for:

* birth,
* portization,
* owner switch,
* rebuild,
* reclaim,
* and continuous deltas like (\Delta)food, (\Delta)wealth, (\Delta)population, (\Delta)defense.

The collection of all those fitted coefficients/statistics becomes the **round summary**:
[
\theta_r
]

### What data are used?

Only replay-derived supervised tables from that one round.

### Is this supervised?

Yes, mostly. The targets come directly from observed replay transitions.

### Why do this?

To compress each round’s dynamics into a comparable object.

### What does success look like?

Within-round held-out replay from the same round is predicted reasonably well.

That is the first major fitted stage.

---

## Stage 2 — Fit the cross-round low-dimensional regime model

Now you have one summary vector (\theta_r) per round.

Now fit:

[
\theta_r = \mu + \Lambda z_r + \epsilon_r
]

This is a factor model.

Here:

* (\mu) = average dynamic law across rounds,
* (\Lambda) = loading matrix,
* (z_r) = latent coordinates for round (r),
* (\epsilon_r) = leftover round-specific noise.

### Unknowns here

* (\mu),
* (\Lambda),
* (z_r) for each round,
* maybe residual covariance.

### What data are used?

The fitted summary vectors (\hat{\theta}_r), not raw replay.

### How do you fit it?

Start with PCA / PPCA / weighted factor analysis.
If needed, move to mixture-of-factor-analyzers.

### What is (\Lambda)?

A matrix whose columns are the dominant axes of round-to-round dynamic variation.

Each column tells you:
if the round moves positively on this latent axis, which hazards and drifts change, and how.

### Why is this useful?

Because it turns “one separate law per round” into:

* one global law,
* plus a tiny latent regime vector (z_r).

That is what makes live inference feasible.

### How do you verify it?

Leave-one-round-out reconstruction of (\theta_r).

This is probably the single most important scientific test in the whole family.

---

## Stage 3 — Fit the teacher world model

Now you use replay trajectories jointly across all rounds to fit the real dynamics model:

[
X_{t+1}\sim K_{\phi,z_r}(X_t,\xi_t)
]

This is the main joint fit.

### Inputs

* full replay states (X_t),
* static geometry features,
* round identifiers or initialized (z_r),
* maybe final tensors too.

### Outputs

* next-state distribution,
* event probabilities,
* continuous mark updates,
* via rollout, year-50 probability tensor.

### What is fitted?

* global shared parameters (\phi),
* round latent coordinates (z_r) or their embeddings,
* maybe hidden memory dynamics,
* stochastic noise structure.

### How should it be structured?

* local site module,
* settlement graph module,
* maybe global yearly shock module,
* low-rank round modulation.

### What should be supervised directly?

* one-step transitions,
* hard events,
* continuous mark deltas,
* year-50 tensor fit.

### How do you verify it?

Three levels:

1. one-step predictive loss,
2. rollout realism,
3. held-out round year-50 score.

This is where the big model finally appears.

---

## Stage 4 — Fit the student live-round posterior model

This is trained *after* the teacher is reasonably good.

The student solves:
[
q_\psi(z_r \mid M_r,D_r)
]

### Inputs

* synthetic live episodes:

  * initial maps (M_r),
  * a set (D_r) of synthetic year-50 windows sampled from historical rounds or teacher rollouts.

### Outputs

* posterior over (z_r),
* maybe direct final tensor head.

### What is fitted?

* student parameters (\psi).

### What are the targets?

Either:

* teacher posterior over (z_r),
* teacher-implied final tensor,
* true historical final tensor,
* or all of them together.

### Why separate this step?

Because the live-round information surface is very different from replay. It is sparse, partial, stochastic, and year-50 only. That deserves its own model.

### How do you verify it?

Held-out rounds, simulated as active rounds with the live budget.

---

## Stage 5 — Fit the query policy

Only after the teacher and student are working.

### Inputs

* current posterior state,
* candidate windows,
* teacher/student uncertainty.

### Output

* next query window.

### What is fitted?

Maybe nothing at first — start with analytic acquisition.
Then maybe a small learned policy network later.

### Training data

Synthetic online episodes on historical rounds.

### Objective

Expected reduction in final entropy-weighted KL loss, not generic exploration.

This is the last thing to optimize, not the first.

---

# 7. What is static geometry really for?

Static geometry is not there to replace settlement modeling. It is there to provide the fixed substrate on which settlement dynamics happen.

It enters almost every fitted step as conditioning information.

For example:

* birth hazard depends on whether a site is buildable, coastal, near forest, in the same basin as a strong settlement, or blocked by mountains.
* portization depends on coastal geometry and maritime reach.
* collapse depends partly on exposure to competition and support limitations.
* reclaim/rebuild depends on ruin location and neighboring strength.
* interaction graph weights depend on land/sea reachability and barriers.

So static geometry is not “the model.” It is the fixed conditioning context.

---

# 8. What is the most important thing to figure out first?

There are actually two “firsts”:

## First engineering first

Can we reliably build replay-derived site/settlement transition tables and event labels?

Without that, everything is hand-waving.

## First scientific first

Is cross-round variation in those fitted summaries low-rank?

Without that, the small-latent regime approach is on shaky ground.

So the actual order should be:

1. replay ingestion,
2. geometry features,
3. event extraction,
4. per-round fitted summaries (\theta_r),
5. cross-round factor fit (\mu,\Lambda,z_r),
6. then the big teacher.

That is the correct iteration order.

---

# 9. The full loop, now with the settlement nuance included

Here is the full refined loop.

### Loop 1 — Observe and extract

* parse replay,
* compute geometry,
* build site, settlement, pairwise, and year-level tables.

### Loop 2 — Summarize one round

* fit effective hazard/update summaries for each round.

### Loop 3 — Compare rounds

* fit low-rank cross-round structure,
* decide latent regime dimension.

### Loop 4 — Build rich dynamics

* fit teacher world model using the settlement-aware representation.

### Loop 5 — Simulate the live problem

* create synthetic active-round episodes,
* train student posterior.

### Loop 6 — Optimize the information path

* fit/tune query policy using teacher/student uncertainty and score-aware objectives.

### Loop 7 — Calibrate and ensemble

* combine strong models conservatively.

### Loop 8 — Diagnose failure

* ask where the error came from:

  * geometry layer?
  * event extraction?
  * regime manifold?
  * teacher dynamics?
  * student inference?
  * query policy?
  * calibration?

Then repeat.

That is the proper scientific/engineering loop.

---

# 10. The most important conceptual takeaway

The most important takeaway is:

**Do not treat Astar Island as a grid-only problem. Treat it as a site-and-settlement stochastic system embedded in terrain geometry.**

That single conceptual shift clarifies almost everything:

* why event extraction matters,
* why graph interactions matter,
* why static geometry is only substrate,
* why round summaries are about settlement dynamics,
* why the teacher should be a graph-cell hybrid,
* and why the student’s job is to infer a small round law from sparse terminal windows.

If you want, I can now make this even more concrete by giving:

1. a literal example of one settlement-year feature row,
2. one example round summary vector (\theta_r), and
3. one example of how the factor model (\theta_r = \mu + \Lambda z_r + \epsilon_r) would look numerically.

