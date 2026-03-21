Yes. This is exactly the part that needs to be thought through much more deeply.

The phrase “per-round effective summary” can sound like one little vector of coefficients. That is **not** the right picture. A per-round effective summary should be a **structured behavioral fingerprint** of the round law. It should summarize, in a comparable way across rounds, how that round tends to generate births, ports, collapse, owner switches, rebuilds, reclaim, resource drift, interaction effects, and global shocks. That is the right level of abstraction because a round shares one hidden behavioral law across all 5 seeds, the yearly process is structured into growth → conflict → trade → winter → environment, and settlements carry rich internal state that matters dynamically, not just occupancy.

So the right answer to “what is the full set of things we need to implement?” is:

You need to implement a **full summary system**, not one summary model.

And the correct summary system has five layers:

1. **measurement tables** built from replay,
2. **event and drift models** fit per round,
3. **interaction and shock summaries** fit per round,
4. **probe-based behavioral fingerprints** generated from those fits,
5. **uncertainty estimates** for every summary component.

That is the real thing we need.

---

# 1. What a per-round summary is supposed to do

A good per-round summary must do four things at once.

First, it must capture the **shared law of the round**, not just map-specific quirks. Since one round uses one hidden behavioral parameter set across its 5 seeds, we want summaries that describe what is common across those seeds after conditioning on geometry.

Second, it must capture the parts of the law that actually matter for year-50 outcomes:

* who survives,
* who expands,
* who becomes a port,
* who collapses,
* what ruins do,
* how strong trade-like or conflict-like interactions are,
* how strong common shocks are.

Third, it must be **comparable across rounds**. That is why I pushed so hard on common feature units and probe-based outputs rather than naive raw coefficients.

Fourth, it must come with **uncertainty**, because some round-level fitted effects will be noisy. We do not just want a point summary (\theta_r); we want confidence in (\theta_r).

So a per-round summary is really a bundle:
[
\theta_r = \big(
\theta_r^{\text{birth}},
\theta_r^{\text{collapse}},
\theta_r^{\text{port}},
\theta_r^{\text{ruin}},
\theta_r^{\text{drift}},
\theta_r^{\text{pair}},
\theta_r^{\text{owner}},
\theta_r^{\text{shock}},
\theta_r^{\text{macro}},
\theta_r^{\text{terminal}}
\big)
]

and in practice each block should itself be represented through standardized probe responses plus confidence estimates.

---

# 2. The full set of raw tables you need to build first

Before you can fit any round summary, you need the replay-to-table layer. This is the real foundation.

## A. Static cell geometry table

One row per cell, per map seed.

Columns should include at least:

* cell coordinates,
* terrain type,
* coastal indicator,
* ocean adjacency,
* forest adjacency counts,
* mountain adjacency counts,
* land-connected component ID,
* basin size / accessible land mass,
* land distance to nearest initial settlement,
* sea distance to nearest coast/port-capable site,
* mixed reachability scores,
* chokepoint / bottleneck score,
* fjord-depth or maritime penetration score,
* local terrain composition in 1, 2, 3-step neighborhoods.

This table is not fitted. It is deterministic preprocessing.

Purpose:
this gives you the static substrate on which all dynamic summaries are conditioned.

## B. Site opportunity transition table

One row per **candidate site-year**.

This is for sites that could become:

* settlement,
* port,
* ruin recovery target,
* reclaimed forest/plain.

Columns should include:

* static geometry features from the cell table,
* current site class at (t),
* nearby live settlement summary,
* nearby port summary,
* nearby ruin summary,
* owner frontier pressure summary,
* local density summaries,
* reachable strong-settlement summaries.

Targets:

* birth/founding by (t+1),
* ruin-to-rebuild by (t+1),
* ruin-to-forest by (t+1),
* ruin-to-empty/plains by (t+1),
* possibly port restoration by (t+1).

This is where you model **opportunity hazards**.

## C. Live settlement transition table

One row per live settlement-year.

Columns should include:

* x, y,
* population, food, wealth, defense,
* has_port,
* alive,
* owner-derived relational features,
* local static geometry,
* nearby allied/enemy settlement stats,
* reachable port stats,
* frontier exposure,
* isolation / centrality scores,
* previous-year deltas if you want a memory-augmented summary,
* maybe year-level shock proxy.

Targets:

* survive vs collapse by (t+1),
* portization by (t+1),
* owner switch by (t+1),
* (\Delta)population,
* (\Delta)food,
* (\Delta)wealth,
* (\Delta)defense.

This is probably the single most important table in the whole system, because year-50 outcomes are heavily mediated by settlement survival and mark drift.

## D. Ruin transition table

One row per ruin-year.

This deserves its own table, not just site opportunity, because ruin dynamics are special in the rules: nearby thriving settlements may reclaim and rebuild ruins, coastal ruins can be restored as ports, otherwise ruins may be overtaken by forest or fade back to plains.

Columns should include:

* ruin age proxy,
* coastal status,
* nearby allied strength,
* nearby enemy strength,
* basin accessibility,
* forest pressure,
* local density.

Targets:

* remain ruin,
* rebuild as settlement,
* rebuild as port,
* reclaim to forest,
* fade to class-0 land.

This table is crucial because ruin dynamics are one of the key sources of entropy at year 50.

## E. Pairwise interaction table

One row per plausible settlement pair ((i,j,t)).

This is not for all pairs naively. It should be sparse: nearby by land, nearby by sea, or top-k reachable pairs.

Columns should include:

* same owner vs different owner,
* both ports / one port / no ports,
* land distance,
* sea distance,
* mixed reachability,
* relative population, food, wealth, defense,
* frontier status,
* whether pair sits across a chokepoint or fjord,
* local neighborhood asymmetry.

Targets are trickier because trade and raid are not explicitly labeled. So this table is mainly for **latent interaction summaries**. Good derived pseudo-targets include:

* whether (i)’s marks improve while (j)’s also improve,
* whether (i) deteriorates while (j) improves,
* whether (j) collapses soon after exposure to (i),
* whether owner switch aligns with hostile exposure.

This table is for estimating interaction kernels, not direct supervised “trade yes/no” labels.

## F. Faction / owner table

One row per owner-year.

Because owner IDs are relational labels, not numeric features, you need faction-level summaries:

* number of settlements in faction,
* number of ports,
* total population / food / wealth / defense,
* frontier length,
* number of neighboring rival factions,
* maritime vs inland distribution,
* owner fragmentation / cohesion.

Targets:

* faction growth/decline,
* fragmentation,
* conquest rate,
* switching inflow/outflow.

This table is important because owner structure affects conflict and likely trade eligibility.

## G. Year-shock table

One row per (round, map, path, year).

Columns should include:

* mean and variance of settlement food deltas,
* mean and variance of wealth deltas,
* collapse count,
* birth count,
* portization count,
* ruin transitions,
* cross-settlement synchronization metrics,
* maybe spatial clustering metrics.

This is the table for modeling **common yearly shocks**, especially winter-like broad negative events.

## H. Macro trajectory table

One row per (round, map, path), optionally by year slice.

Summaries include:

* total live settlements over time,
* total ports over time,
* total ruins over time,
* owner count over time,
* total population / food / wealth / defense over time,
* occupation radius,
* maritime-vs-inland share,
* entropy-relevant counts like uncertain frontier sites.

This table is useful both for diagnostics and for building coarse round summaries.

## I. Terminal response table

One row per (round, seed, cell) or aggregated variants, built from analysis ground truth.

Columns:

* initial geometry features,
* year-50 ground-truth class probabilities,
* entropy at the cell,
* built probability, port probability, ruin probability, etc.

This is not about replay transitions. It connects the dynamic summaries back to the actual competition target. The analysis endpoint provides the ground-truth year-50 tensor, and the score is entropy-weighted KL on that tensor.

That is the raw table layer. This is already a big system.

---

# 3. The full set of fitted summary models we need

Now that we have the right tables, what do we fit for each round?

The key is: **do not fit one giant monolithic round summary model.** Fit a battery of smaller, interpretable effective submodels.

## 3.1 Birth / founding summary

Fit on the site opportunity table.

Target:

* whether a non-live, buildable site becomes a settlement by next year.

Inputs:

* local geometry,
* distance to nearest strong allied settlement,
* basin capacity,
* nearby forests,
* frontier exposure,
* maritime accessibility,
* nearby ruin context.

Outputs for the summary:

* fitted birth hazard surface,
* predicted birth probabilities on canonical probe sites.

Why important?
Because year-50 settlement mass depends heavily on whether prosperous areas keep founding new sites.

## 3.2 Portization summary

Fit mostly on the live settlement table.

Target:

* whether a live coastal settlement gains port status by next year.

Inputs:

* has_port now,
* coastal geometry,
* population / food / wealth / defense,
* maritime centrality,
* nearby ports,
* likely latent prosperity signals.

Outputs:

* fitted portization hazard,
* predicted portization on canonical coastal settlement probes.

Why important?
Ports create long-range edges in the interaction graph and are disproportionately influential.

## 3.3 Collapse / survival summary

Fit on the live settlement table.

Targets:

* survival vs collapse,
* maybe collapse-to-ruin vs direct disappearance if distinguishable.

Inputs:

* population,
* food,
* wealth,
* defense,
* has_port,
* nearby allies / enemies,
* frontier exposure,
* maritime vs inland position,
* local support,
* year-shock proxy.

Outputs:

* collapse hazard surface,
* survival surface,
* probe predictions on weak/strong/inland/coastal/frontier examples.

This is one of the highest-value summaries because ruin mass at year 50 is score-relevant and collapse changes the whole future path.

## 3.4 Owner-switch / conquest summary

Fit on the live settlement table and maybe faction table.

Target:

* whether owner changes by next year,
* maybe distribution over new owner.

Inputs:

* frontier exposure,
* hostile neighborhood,
* relative defense,
* relative wealth/food stress,
* sea/land access,
* local ownership pattern.

Outputs:

* owner-switch hazard,
* owner-switch intensity on frontier probes.

This matters because the mechanics explicitly say conquered settlements can sometimes switch faction allegiance.

## 3.5 Continuous mark-drift summary

Fit on live settlement transitions.

Targets:

* (\Delta)population,
* (\Delta)food,
* (\Delta)wealth,
* (\Delta)defense.

Inputs:

* current marks,
* geometry,
* local and graph context,
* owner context,
* year-shock context.

Outputs:

* expected drift surfaces,
* maybe conditional variance surfaces,
* probe predictions for canonical settlement states.

This is crucial because the hidden regime often manifests first as differences in drift, before it manifests as visible event differences.

## 3.6 Ruin fate summary

Fit on the ruin table.

Target:

* remain ruin,
* rebuild as settlement,
* rebuild as port,
* reclaim to forest,
* fade to class-0 land.

Inputs:

* ruin context,
* coastal status,
* nearby thriving allied settlements,
* nearby enemies,
* forest pressure,
* basin accessibility.

Outputs:

* ruin lifetime / fate surface,
* probe predictions on canonical ruins.

This is one of the most important summaries because ruin dynamics are a major source of final uncertainty.

## 3.7 Pairwise interaction summary

Fit on the pairwise table.

Here you are not fitting explicit “trade” or “raid” labels, because replay probably does not expose them. You are fitting an **effective pairwise influence model**.

Possible targets:

* joint positive deltas,
* asymmetric deterioration,
* delayed collapse risk,
* owner-switch risk,
* changes in relative wealth/food.

Inputs:

* same/different owner,
* land and sea distances,
* port status,
* relative marks,
* chokepoints,
* frontier structure.

Outputs:

* positive interaction kernel,
* negative interaction kernel,
* maybe separate same-owner and different-owner kernels.

This gives you the interaction law without pretending you observed the simulator’s literal internal event flags.

## 3.8 Faction/frontier summary

Fit on faction/owner and maybe settlement tables.

Targets:

* faction growth/decline,
* frontier turnover,
* fragmentation,
* conquest rates.

Outputs:

* how aggressively frontiers move in this round,
* whether factions tend to consolidate or fragment,
* how owner structure shapes local hazards.

This is useful because owner dynamics are often more stable and interpretable at faction level than at settlement level.

## 3.9 Common yearly shock summary

Fit on the year-shock table.

This is the place to capture winter-like or other common-shock effects.

Targets are not conventional labels here. This is more like fitting:

* factor models on yearly deltas,
* shock variance,
* shock loading by settlement type,
* auto-correlation or dependence structure if any.

Outputs:

* magnitude of common negative/positive yearly shocks,
* differential sensitivity by geography or settlement type.

This can be fit with latent factor models, covariance decompositions, or simple shock regressions.

## 3.10 Macro trajectory summary

Fit on the macro trajectory table.

Outputs:

* average live-settlement trajectory,
* average ruin trajectory,
* average port trajectory,
* timing of expansion vs collapse,
* maritime share trajectory,
* owner count trajectory.

This is not detailed enough to drive the full model, but it is an important coarse fingerprint.

## 3.11 Terminal-response summary

Fit using the analysis tensors.

This summary answers:

* given the replay-implied round law, what does the year-50 probability field tend to look like?
* which dynamic summaries best explain final entropy hotspots?

Outputs:

* mappings from dynamic summary blocks to terminal uncertainty patterns,
* probe predictions for final site fates.

This is the bridge from dynamics to the actual score.

---

# 4. Raw coefficients are not enough — we need probe-based summaries

This is the deepest design point here.

If you just store raw coefficients from all those per-round fitted submodels, the summary becomes brittle:

* coefficients depend on feature parameterization,
* they are hard to compare across model families,
* they behave badly under scaling choices.

So the best practice is:

**fit the submodels, but define the per-round summary (\theta_r) in terms of predicted behavior on a fixed library of canonical probes.**

That means we need to implement a **probe library**.

## 4.1 Site probes

Examples:

* interior open site near strong allied settlement,
* coastal open site near strong allied settlement,
* isolated inland site,
* forest-adjacent site,
* chokepoint site,
* fjord-mouth site,
* frontier site near hostile owner.

Evaluate on each round:

* birth hazard,
* future port probability if born,
* future ruin probability.

## 4.2 Settlement probes

Examples:

* low-food weak inland settlement,
* high-food high-wealth coastal non-port,
* existing port with strong wealth,
* isolated inland settlement,
* exposed frontier settlement,
* strong defended settlement near enemies,
* settlement near reclaimable ruins.

Evaluate:

* collapse hazard,
* portization hazard,
* owner-switch hazard,
* expected (\Delta)population,
* expected (\Delta)food,
* expected (\Delta)wealth,
* expected (\Delta)defense.

## 4.3 Ruin probes

Examples:

* coastal ruin near strong allied settlement,
* inland ruin near weak allied settlement,
* isolated ruin far from all live settlements,
* forest-surrounded ruin.

Evaluate:

* rebuild hazard,
* reclaim-to-forest hazard,
* fade hazard,
* port restoration hazard.

## 4.4 Pair probes

Examples:

* same-owner port pair at sea distance 2/4/8/12,
* rival non-port pair at land distance 1/2/4,
* strong coastal aggressor vs weak inland defender,
* rich-richer port pair,
* frontier rival pair across chokepoint.

Evaluate:

* positive interaction score,
* negative interaction score,
* delayed collapse contribution,
* owner-switch pressure.

## 4.5 Owner/faction probes

Examples:

* small fragmented owner on wide frontier,
* large maritime owner with many ports,
* inland owner trapped by mountains,
* coastal owner controlling fjord mouth.

Evaluate:

* expected growth,
* fragmentation tendency,
* conquest tendency.

## 4.6 Year-shock probes

Examples:

* effect of one shock factor on weak inland settlements,
* effect on rich ports,
* effect on frontier settlements,
* effect on ruin rebuild chances.

These probe outputs, concatenated together, are a much more stable (\theta_r) than raw coefficients.

That is the single best way to make summaries comparable across rounds.

---

# 5. We also need uncertainty for every summary component

A round summary should not be:
[
\theta_r
]
only.

It should be:
[
(\hat{\theta}_r,; \widehat{\Sigma}_r)
]

where (\widehat{\Sigma}_r) is an uncertainty estimate.

Why?
Because:

* some rounds may have rare events,
* some probes may be poorly estimated,
* some fitted submodels may be unstable.

How to get this?
Bootstrap across replay paths within round.
Or fit Bayesian/regularized models with posterior uncertainty approximations.

This is very important for the next cross-round factor fit, because you want to weight reliable summary components more heavily than noisy ones.

---

# 6. The full set of things to implement, concretely

If you ask “what is the full implementation set?” this is the checklist.

## Foundation layer

1. Replay parser
2. Static geometry feature engine
3. Settlement graph construction utilities
4. Feature transform / scaling utilities (global, not round-local)
5. Event extraction engine

## Table layer

6. Site opportunity table builder
7. Live settlement transition table builder
8. Ruin transition table builder
9. Pairwise interaction table builder
10. Faction/owner table builder
11. Year-shock table builder
12. Macro trajectory table builder
13. Terminal response / final tensor joiner

## Per-round fit layer

14. Birth summary fitter
15. Portization summary fitter
16. Collapse/survival summary fitter
17. Owner-switch summary fitter
18. Continuous drift fitter
19. Ruin-fate summary fitter
20. Pairwise interaction summary fitter
21. Faction/frontier summary fitter
22. Common shock summary fitter
23. Macro trajectory summary fitter
24. Terminal-response summary fitter

## Probe layer

25. Canonical probe library definition
26. Probe evaluator for every fitted submodel
27. Per-round probe response vector builder
28. Bootstrap uncertainty over probe responses

## Cross-round layer

29. Summary vector store ((\hat{\theta}_r,\widehat{\Sigma}_r))
30. Low-rank / factor / mixture-of-factors fitter
31. Cross-round diagnostics and reconstruction metrics

## Downstream use layer

32. Summary-conditioned baseline simulator
33. Teacher world-model initialization from summaries
34. Student posterior synthetic-episode generator
35. Query-policy diagnostic utilities

That is the true implementation surface.

---

# 7. What is most important to implement first?

Not all of it at once.

The highest-priority subset is:

1. static geometry feature engine
2. event extraction
3. live settlement transition table
4. ruin transition table
5. site opportunity table
6. collapse / birth / port / ruin-fate / drift summary fitters
7. probe library
8. probe-based (\theta_r) builder
9. cross-round low-rank diagnostics

That is the minimum viable serious summary system.

Why these first?
Because they capture the dominant year-50 mechanisms:

* whether settlements appear,
* whether they survive,
* whether they become ports,
* what ruins do,
* how marks drift.

Pairwise interaction and faction/frontier summaries are the next layer after that.

---

# 8. How we know this whole summary system is working

There are several tests, and we need all of them.

## Test 1: Within-round predictive checks

Each submodel should predict held-out replay transitions from the same round.

If it cannot, it is not summarizing that round well.

## Test 2: Probe stability

Bootstrap the round’s replay paths. Do the probe responses remain stable?
If not, the summary is too noisy.

## Test 3: Cross-round low-rankness

Do the (\theta_r) probe vectors live on a small manifold across rounds?
If yes, the regime-latent approach is validated.

## Test 4: Downstream usefulness

If you plug (\theta_r) into a simple baseline simulator or terminal predictor, does held-out historical benchmark score improve?

This is the most important external validation. A beautiful summary that does not help prediction is not useful.

---

# 9. The deepest design principle here

The deepest principle is:

**A per-round effective summary should describe behavior, not implementation.**

That means:

* not raw source-code parameter guesses,
* not just raw coefficients,
* not just raw macro counts,
* but a structured, uncertainty-aware set of predicted responses on a common library of canonical situations.

That is what makes the summary scientifically meaningful, statistically comparable, and useful downstream.

---

# 10. My final recommendation on the “full set”

If I had to compress the whole answer to one line:

**Implement the summary system as a bundle of per-round fitted submodels over site, settlement, ruin, pairwise, faction, and yearly-shock tables, and export each round as a probe-based behavioral fingerprint with uncertainty.**

That is the full thing.

If you want, I can next make this fully concrete by drafting:

* the exact schema for each table,
* the exact list of recommended features for each table,
* and the first version of the canonical probe library.

