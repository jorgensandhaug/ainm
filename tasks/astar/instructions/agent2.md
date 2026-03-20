
# Handoff Document: Semimechanistic / Hazard-State-Space Program for Astar Island

## Status / intent

This document is a full handoff for an implementation-and-iteration agent working inside the existing Astar framework.

The target family is the **semimechanistic, hazard/state-space, graph-aware world-model family** for Astar Island. This is not a single model. It is a structured research program that should be pursued aggressively and systematically until the family is genuinely exhausted.

This document is split into two parts:

1. **Reusable operational instructions** that should remain valid even if the same agent later explores a different model family.
2. **Family-specific scientific and implementation instructions** for the semimechanistic hazard/state-space approach.

The agent must read this whole document carefully. It must also read `docs/game_facts.md` before implementing anything. If that file contradicts this handoff, trust `docs/game_facts.md` plus the actual codebase and framework behavior over this document.

---

# Part A — Reusable instructions for any long-running model-family exploration agent

## A1. Mission

Your mission is to improve historical benchmark score **reliably and reproducibly** using the existing framework, not to produce pretty code in isolation and not to pursue uncontrolled one-off experiments.

You are not allowed to stop after a few obvious variants. You should assume that there are many layers of improvement available: data preprocessing, target definition, model structure, calibration, query selection, inference, caching, runtime optimization, ensembling, and bug fixes. You must keep iterating until the family looks genuinely exhausted.

You must be resourceful, empirical, disciplined, and skeptical of your own assumptions.

## A2. First actions before any modeling work

Before writing or modifying model code, do all of the following:

1. Read `docs/game_facts.md` in full.
2. Inspect the relevant parts of the framework:
   - model registration / model loading
   - offline training entry points
   - online query / policy interfaces
   - historical benchmark interface
   - any caching / data storage utilities
   - any artifact or logging conventions already in the repo
3. Run at least one existing baseline end-to-end using:
   ```bash
   uv run astar run-historical-benchmark --model <EXISTING_MODEL_NAME>
   ```
   This is not optional. You need to understand runtime, outputs, metrics, and failure modes before introducing a new family.
4. Confirm how model names are registered and how benchmark outputs are stored.

Do not guess framework conventions if you can inspect them.

## A3. Non-negotiable experiment discipline

Every meaningful experiment must be:
- uniquely named,
- reproducible,
- logged,
- benchmarked,
- and associated with a git commit.

Each concrete model/setting must have its own model name. Never hide major changes behind the same model name.

### Required model naming pattern

Use a short stable family prefix and then encode the important structural choices in the name.

Recommended prefix for this family:
- `smh` = semimechanistic hazard family

Recommended name pattern:
```text
smh_<transition_family>_<round_latent>_<memory>_<policy>_<calibration>_vNNN
```

Examples:
- `smh_gam_z4_h0_covinfo_calbase_v001`
- `smh_gam_z4_h2_repdiag_caltemp_v002`
- `smh_gbdt_z6_h2_eigscore_caldir_v003`
- `smh_gnn_z6mix_h2_pfilt_caldir_v004`

Every model name must map to exactly one reproducible implementation/config.

## A4. Required experiment registry

Create and maintain an experiment registry inside the repo for this family, e.g.
```text
experiments/semimech_hazards/registry.csv
experiments/semimech_hazards/notes.md
experiments/semimech_hazards/best_models.md
```

Each row in the registry must contain at least:
- timestamp
- model_name
- commit_sha
- branch
- train/holdout split description
- data version / replay sample version
- key model choices
- latent dimension
- hidden-memory choice
- online inference method
- query policy method
- calibration method
- benchmark score(s)
- runtime
- notes / observed failure modes

This registry is a first-class artifact. Keep it accurate.

## A5. Backtesting protocol

The historical benchmark must be treated as the arbiter. Use:
```bash
uv run astar run-historical-benchmark --model <ITS_MODEL_NAME_CURRENT_ITERATION>
```

But do not run the full expensive benchmark blindly for every tiny change. Use a tiered evaluation protocol:

### Tier 1: smoke tests
- unit tests
- replay parsing sanity checks
- one-round or tiny-split fast checks
- runtime profiling

### Tier 2: development benchmark
- a fixed small set of held-out rounds
- cheap enough to run often
- used to reject bad ideas quickly

### Tier 3: serious benchmark
- larger rotating holdout set
- leave-one-round-out or grouped holdout
- used before promoting a model

### Tier 4: full family checkpoint benchmark
- broader benchmark sweep
- used for major milestones and best-model claims

The **holdout unit must be the round**, not trajectories, not maps, not years. Random trajectory splits leak the regime and make the evaluation nearly meaningless.

## A6. Git discipline (mandatory)

You must commit frequently and push to the remote branch frequently.

At minimum, commit and push when:
- a new model skeleton is added,
- a parser / feature cache / dataset layer becomes correct,
- a model obtains a new family-best benchmark score,
- a strong negative result is learned that changes the research direction,
- a bug is fixed that changes prior results,
- an experiment registry or notes summary is meaningfully updated.

Each commit message must clearly describe the change and include the model names touched.

Do **not** let lots of uncommitted work accumulate.

## A7. Performance discipline (mandatory)

This family will only be competitive if the code is fast enough to iterate.

Write performant code by default.

### Requirements
- cache all static map features,
- cache replay-derived transition tables,
- use columnar formats (e.g. parquet) for heavy intermediate data,
- avoid Python loops over cells or settlement pairs when vectorization / sparse ops are possible,
- precompute sparse interaction graphs and distance kernels,
- use batching for rollout / inference where possible,
- do not recompute expensive geometry on every training step,
- profile early,
- optimize data loading,
- optimize serialization,
- keep the model cheap enough that many experiments can be run.

A slower but slightly fancier model can easily lose in practice because it blocks iteration.

## A8. Coding standards

You must:
- follow existing framework conventions,
- write clean, testable, modular code,
- keep configs separate from logic,
- isolate experiment-specific configuration,
- add comments where the statistical intent is non-obvious,
- write assertions for important invariants,
- add sanity-check scripts or tests for data extraction.

Where possible, make modules swappable:
- event extractor
- geometry feature builder
- round-level latent discovery
- teacher transition model
- student posterior model
- calibration module
- query policy

## A9. How to think scientifically

For every major modeling choice, ask:
1. What hypothesis about the world does this encode?
2. What evidence from replay or benchmark would falsify it?
3. What is the cheapest experiment that tests it?
4. If it fails, what does that imply structurally?

Do not just add capacity because a number did not improve. Diagnose why.

## A10. What “do not stop until this family is exhausted” means

It means:
- explore the full ladder from simple to rich models,
- test multiple latent structures,
- test multiple event sets,
- test multiple geometry choices,
- test memory/no-memory,
- test multiple online inference methods,
- test multiple calibration methods,
- test multiple query policies,
- test ensembling and hybridization,
- and keep rigorous notes of all of it.

It does **not** mean flailing randomly. It means organized exhaustive exploration.

---

# Part B — Family-specific handoff: semimechanistic hazard / state-space program

## B1. Executive thesis

### Best-fit model class

Given approximately **5,000 realized replay paths** spread over about **30 historical rounds** and **5 seeds per round**, the best-fit primary family is:

> **A hierarchical semimechanistic multi-state state-space model with competing risks, continuous settlement-mark dynamics, graph-based influence fields, latent annual common shocks, and very low-dimensional round random effects.**

This is the best fit because of the sample geometry:

- There are only ~30 independent round laws.
- There are ~150 round-seed map contexts.
- There are ~5,000 paths × 50 annual transitions = ~250,000 annual path transitions.
- At the cell or settlement level, there are vastly more local transition observations still, though highly correlated.

Therefore:
- the **within-round transition law** can be reasonably rich,
- the **cross-round regime manifold** must stay very small,
- the **online posterior model** must be smaller still.

### Core slogan

**Rich teacher, tiny regime manifold, disciplined student.**

## B2. What this family is trying to do

The end goal is not to recover the simulator source code. The end goal is to build a world model good enough that:

1. Offline, from replay, it captures the family of yearly transitions well.
2. Offline, from repeated rollouts, it produces accurate year-50 tensors.
3. Online, from only 50 final-window queries in a new round, it can infer the current round regime and output a calibrated final tensor.

Formally, the family aims to learn:
\[
X_{t+1}\sim K_{\phi,z_r}(X_t,\xi_t),
\]
with round regime \(z_r\), global parameters \(\phi\), and stochastic noise \(\xi_t\).

Then:
\[
F_\phi(M,z_r)=\text{year-50 predictive tensor},
\]
and online:
\[
p(z_r\mid M_r,D_r)\propto p(z_r)\prod_i p(Y_i\mid M_r,A_i,z_r),
\]
followed by
\[
\hat P_r = \int F_\phi(M_r,z)\,p(z\mid M_r,D_r)\,dz.
\]

That is the conceptual target.

## B3. Why this family is probably the right primary family

### B3.1. Why not a pure direct terminal predictor?
Because replay gives you transition information. Ignoring transitions wastes the strongest data source.

### B3.2. Why not a giant generic neural world model?
Because the number of independent regimes (~30 rounds) is small. A giant abstract model can fit transitions but overfit regime variation.

### B3.3. Why not exact simulator reverse engineering as the mainline?
Because it is brittle, high-effort, and may be unnecessary. It should be a side investigation, not the main program.

### B3.4. Why the semimechanistic family wins
Because it uses:
- real state structure,
- real event semantics,
- real topology,
- real statistical regularization,
- and keeps the round variation low-rank.

This matches both the game and the data budget.

---

# Part C — The world/state representation to use

## C1. Recommended state factorization

Represent the annual state as:
\[
X_t = (B,\;C_t,\;\mathcal S_t,\;H_t,\;\Omega_t).
\]

### \(B\): static substrate
- terrain map
- coast mask
- ocean / land / mountain structure
- forest distribution
- fjord / inlet structure
- land graph
- sea graph
- mixed land-sea graph
- geodesic distances
- chokepoint / bottleneck scores
- basin / reachability summaries

### \(C_t\): cell-level visible classes at year \(t\)
- empty/open aggregate
- settlement
- port
- ruin
- forest
- mountain
(and any richer internal cell encoding you keep before projecting to final classes)

### \(\mathcal S_t\): settlement object table at year \(t\)
Per settlement/cell:
- position
- population
- food
- wealth
- defense
- has_port
- alive
- owner_id
- plus any derived quantities (local graph degree, domain size, etc.)

### \(H_t\): hidden memory / omitted internal state
This is where tech, longship ownership, or unresolved within-year effects live if replay does not expose them directly.

Keep \(H_t\) **small**.

### \(\Omega_t\): annual common shocks
At minimum:
- winter severity
Potentially also:
- global conflict intensity multiplier
- global trade intensity multiplier
- other annual latent volatility terms

## C2. Important nuance: cell-centric identity beats settlement-id fantasy

Do **not** assume replay gives persistent settlement IDs. If IDs are not explicit, the stable object is the **cell/coordinate plus state**, not an abstract immortal settlement entity.

Many transitions are easiest to model cell-centrically:
- a buildable empty cell becomes settled,
- a settled cell becomes port,
- a live cell becomes ruin,
- a ruin is rebuilt or reclaimed.

This is good. Use it.

## C3. Important nuance: owner_id is a partition label, not a number

Never feed raw owner IDs as numeric features.

Use:
- same-owner indicators,
- owner domain sizes,
- owner frontier structure,
- owner switch events,
- number of nearby allied/enemy settlements,
- owner partition graph statistics.

---

# Part D — The event ontology

## D1. Core discrete events per cell/year

At the annual level, define mutually exclusive event types such as:

- `none`
- `found_settlement`
- `portify`
- `collapse_to_ruin`
- `owner_switch_without_collapse`
- `rebuild_to_settlement`
- `rebuild_to_port`
- `reclaim_to_forest`
- `reclaim_to_open`

Depending on data sparsity, some events may need to be merged initially.

## D2. Continuous mark updates for occupied cells

For live settlements/ports:
- population delta
- food delta
- wealth delta
- defense delta

Potential additional toggles:
- survival
- port retention/loss
- owner switch
- any derived latent-state update

## D3. Important nuance: annual effective transitions, not guaranteed microevent truth

Even with yearly replay, you usually do **not** observe the exact sequence of within-year microevents unless replay exposes sub-phase states.

So this family should model **effective annual transitions**. Do not overclaim to have identified the literal raid/trade/growth event log.

---

# Part E — Influence-field formulation (critical)

## E1. Why influence fields are the right abstraction

Raw all-pairs interactions are too noisy and data-hungry.
Purely local convolutions miss ports, trade, raids, and geography-mediated long-range effects.

The correct middle ground is **influence fields** built on the mixed land/sea graph.

## E2. Minimum influence fields to implement

### 1. Colonization / founding pressure
Pressure from nearby thriving settlements to found a new settlement.

### 2. Maritime trade support
Support from accessible allied / non-warring ports through sea connectivity.

### 3. Raid pressure
Enemy pressure through land and/or sea reachability.

### 4. Rebuild support
Pressure from nearby thriving settlements to rebuild ruins.

### 5. Frontier tension
Competition pressure where multiple influence basins meet.

### 6. Resource support
Local forest adjacency and local capacity/support features.

## E3. Prototype equations

For a cell \(u\),
\[
I^{\text{birth}}_u
=
\sum_i \kappa^{L}_{\text{birth}}(d^L(u,i);z_r)\,\psi_{\text{birth}}(s_{i,t}),
\]

For a settlement \(i\),
\[
I^{\text{trade}}_i
=
\sum_j \kappa^{S}_{\text{trade}}(d^S(i,j);z_r)\,\mathbf 1[o_i=o_j]\mathbf 1[p_i=p_j=1]\,\psi_{\text{trade}}(s_{j,t}),
\]

\[
I^{\text{raid}}_i
=
\sum_j
\left[
\kappa^L_{\text{raid}}(d^L(i,j);z_r)
+
\mathbf 1[p_j=1]\kappa^S_{\text{raid}}(d^S(i,j);z_r)
\right]
\mathbf 1[o_i\neq o_j]\psi_{\text{raid}}(s_{j,t}).
\]

These do not need to be the exact final formulas, but this is the right structural idea.

## E4. Why geometry is non-negotiable

Distances must be graph/geodesic, not plain Euclidean:
- mountains block,
- coasts enable ports,
- sea routes matter,
- fjords change reachability,
- forests support adjacent settlements.

If a model ignores this and works directly on raw coordinates, it will leave real score on the table.

---

# Part F — Hazard / transition functional forms

## F1. Competing-risks discrete transitions

For each relevant cell/year:
\[
\Pr(E_{u,t}=e\mid X_t,z_r)
=
\frac{\exp(\eta_e(u,t;X_t,z_r))}
{\sum_{e'}\exp(\eta_{e'}(u,t;X_t,z_r))}.
\]

Use event-specific linear predictors built from:
- local state,
- influence fields,
- geometry features,
- common shocks,
- round latent modulation.

## F2. Continuous mark updates

For each live settlement:
\[
m_{i,t+1}
=
m_{i,t}
+
\mu_\phi(x_{i,t},z_r,\Omega_t)
+
\Sigma_\phi(x_{i,t},z_r,\Omega_t)^{1/2}\epsilon_{i,t}.
\]

Do not assume Gaussian by default.
Test Student-\(t\), mixture, or other heavy-tailed forms.

## F3. Recommended function classes to exhaust in order

### Level 1
GLMM / multinomial logistic mixed models with strong regularization

### Level 2
GAM / shape-constrained additive models

### Level 3
Gradient-boosted hazard models (XGBoost / LightGBM style if compatible)

### Level 4
Small monotone MLP hazard heads

### Level 5
Graph-aware hazard modules with message passing over settlement graph

Do **not** jump to Level 5 before Levels 1–3 have been fully explored and diagnosed.

## F4. Constraints to encode whenever justified

Encode hard or near-hard constraints when they are clearly true:
- portification only on coastal / eligible cells,
- mountains static,
- non-buildable cells cannot found settlements,
- owner labels permutation-invariant,
- reclaim events only from ruins,
- etc.

Also consider monotonic or sign constraints where plausible:
- collapse risk should often decrease with food/defense,
- portification should often increase with coastality / maritime support,
- reclaim risk should often increase with ruin age absent nearby rebuild support,
- etc.

Use such constraints as regularization, not dogma.

---

# Part G — The round regime \(z_r\): how to think about it properly

## G1. What \(z_r\) is

\(z_r\) is **not** assumed to be the literal simulator parameter vector.

\(z_r\) is a **low-dimensional coordinate system for round-to-round variation in the effective transition law**.

This is the correct abstraction.

## G2. What \(z_r\) should not be

- not a giant arbitrary embedding,
- not a free vector appended everywhere,
- not a thing guessed from intuition and frozen forever,
- not raw code parameters unless proven.

## G3. Best representation hypothesis

Use:
- a small continuous latent \(u_r \in \mathbb R^d\),
- possibly plus a tiny discrete regime index \(m_r\).

So:
\[
z_r=(m_r,u_r).
\]

Recommended initial scale:
- \(d\) around 4–8,
- \(m_r\) maybe absent at first, then add 2–4 discrete mixture components if evidence suggests clustering.

## G4. How \(z_r\) should enter the model

Prefer low-rank modulation:
\[
\eta_{e,r}(x) = f_e(x) + g_e(x)^\top z_r + a_{e,r,t},
\]
or
\[
\theta_{e,r} = \theta_{e,0} + L_e z_r.
\]

This ensures:
- the baseline dynamics are shared,
- the regime only tweaks them along a few directions.

This is the single most important regularization in the family.

---

# Part H — Most important hypotheses to test first

## H1. Is the visible replay state approximately Markov?

This is one of the most important questions.

### Test
Compare predictive performance of:
- \(p(X_{t+1}\mid X_t)\)
versus
- \(p(X_{t+1}\mid X_t,X_{t-1})\).

Also check residual autocorrelation in mark updates.

### Interpretation
- If \(X_t\) is sufficient: simpler model.
- If not: add small hidden memory \(H_t\).

## H2. Is round-to-round variation low-dimensional in semimechanistic coordinates?

This is arguably the most important *cross-round* question.

### Test
Fit round-specific hazards/summaries first. Then:
- perform PCA/factor analysis on per-round parameter vectors,
- check how many dimensions explain predictive variation,
- evaluate leave-one-round-out generalization as latent dimension increases.

### Interpretation
- If low-rank: great, proceed with tiny regime manifold.
- If not: expand only slightly and inspect which event families break low-rank assumptions.

## H3. Are annual common shocks required?

### Test
Fit models with and without year-level random effects / shared shocks.
Look for synchronized unexplained food/collapse moves within a year.

### Interpretation
- If yes: retain \(\Omega_t\).
- If no: simplify.

## H4. Do graph/geodesic influence fields beat local-only geometry?

### Test
Compare:
- local-only models,
- Euclidean-distance models,
- graph/geodesic influence-field models.

### Interpretation
If geodesic fields matter materially, keep them central.

## H5. Do ports / trade / raids need explicit long-range terms?

### Test
Ablate pairwise maritime/interaction features and measure damage to:
- one-step fit,
- year-50 tensor fit,
- holdout benchmark.

## H6. Does the family need discrete regime modes in addition to continuous \(z_r\)?

### Test
Cluster round-specific effective laws / parameter vectors.
Compare continuous-only latent vs discrete+continuous.

## H7. Do we need terminal calibration even after fitting transitions?

### Test
Compare:
- one-step-only teacher,
- one-step + rollout loss,
- one-step + rollout + terminal weighted-KL calibration.

The answer is almost certainly yes, but verify quantitatively.

---

# Part I — The single most important thing to figure out first

There are two answers: one implementation answer and one scientific answer.

## I1. Most important implementation priority

Build a **trustworthy replay-to-transition dataset**.

Without this, nothing else is real.

That means:
- replay parser,
- state sanity checks,
- cell/settlement transition extraction,
- geometry cache,
- event labeling,
- round/seed/path indexing,
- efficient storage,
- reproducible sample generation.

## I2. Most important scientific question after instrumentation

Determine whether a **low-dimensional semimechanistic description of cross-round variation** actually exists.

Operationally:
1. fit round-specific effective transition summaries,
2. compress them,
3. measure out-of-round predictive sufficiency.

If this fails badly, the family needs rethinking or a richer hybrid.
If this works, the family is very likely viable.

---

# Part J — Full research / iteration loop

This is the core loop you should follow repeatedly.

## J1. Loop skeleton

1. **Hypothesize**
   - e.g. visible state is Markov
   - round variation is low-rank
   - winter needs a common shock
   - graph fields matter
   - hidden memory improves things

2. **Operationalize**
   - define features, labels, metrics
   - define the smallest model that tests this hypothesis

3. **Implement**
   - write the cleanest minimal code to test it
   - integrate with framework
   - name model uniquely

4. **Verify locally**
   - sanity tests
   - data assertions
   - fast benchmark

5. **Benchmark properly**
   - round-held-out benchmark
   - compare against nearest previous relevant model

6. **Diagnose**
   - inspect score deltas
   - inspect event-specific errors
   - inspect calibration
   - inspect runtime

7. **Decide**
   - keep
   - kill
   - merge into stronger model
   - reformulate

8. **Record**
   - update registry
   - commit
   - push
   - note lessons

9. **Iterate**

This loop is the job.

## J2. The end goal

The end goal is a production-quality system with:

1. a strong **teacher** world model in this family,
2. a fast **student** online posterior model,
3. a strong **query policy** tuned to the actual score,
4. excellent caching/runtime,
5. and a documented evidence trail proving why the chosen structure works.

More concretely, the end goal system should do this:

### Offline
- parse replays,
- fit semimechanistic teacher,
- generate rollouts,
- fit terminal decoder / calibration,
- train student on synthetic active-round episodes,
- train/validate query policy,
- benchmark on held-out historical rounds.

### Online
- initialize regime prior,
- choose a sequence of 50 queries,
- update posterior over \(z_r\) after each query,
- produce posterior predictive tensor,
- submit.

That is the full loop.

---

# Part K — Detailed phased plan

## Phase 0 — Facts, instrumentation, reproducibility

### Goals
- read `docs/game_facts.md`
- inspect framework interfaces
- establish experiment registry
- run baseline benchmark
- set up caching directories
- create model-family folder structure

### Deliverables
- baseline score recorded
- registry created
- notes file created
- reproducible benchmark command confirmed

## Phase 1 — Replay ingestion and transition schema

### Goals
Build the replay parser and transition-table builder.

### Required outputs
- per-path per-year state records
- per-year cell transition records
- per-year settlement transition records
- path metadata (round, seed, path index, year)
- cached parquet outputs

### Sanity checks
- positions align between grid and settlement table
- event counts are non-negative and plausible
- path lengths are correct
- class changes are valid
- no impossible transitions due to parser bugs

### Deliverables
- parser module
- tests / sanity scripts
- cached transition dataset

## Phase 2 — Static geometry engine

### Goals
Build static feature cache for every map seed.

### Minimum features
- coast mask
- buildable mask
- mountain barrier features
- forest adjacency
- land geodesics
- sea geodesics
- mixed graph distances
- fjord / inlet / choke features
- nearest settlement distance fields
- settlement influence-basin tie metrics

### Deliverables
- cached geometry features
- validation plots/tables
- unit-tested graph/distance code

## Phase 3 — Event labeling and descriptive science

### Goals
Turn raw transitions into event ontology and learn what the simulator empirically looks like.

### Analyses to run
- event frequencies by year
- event frequencies by terrain motif
- survival / collapse curves
- ruin lifetime distributions
- owner-switch statistics
- portification rates
- food/wealth/defense change distributions
- synchronized year shocks
- per-round summary dashboards

### Deliverables
- summary notebook / report
- event label definitions frozen (or versioned)

## Phase 4 — Round-specific effective law fitting

### Goals
For each historical round, fit separate semimechanistic models.

### Start simple
- GLMM or GAM hazards
- continuous mark regressions
- annual shock terms
- no hidden memory at first

### Why
This stage is for science: understand each round as an effective law.

### Deliverables
- per-round fitted coefficients / summary functions
- round diagnostics
- early answer to low-rank question

## Phase 5 — Regime manifold discovery

### Goals
Compress round-specific effective laws into a small latent manifold.

### Methods to try
- PCA
- factor analysis
- reduced-rank regression
- probabilistic PCA
- small discrete mixture + PCA inside component
- tiny autoencoder only if linear methods fail

### Questions
- how many latent dimensions?
- is there clustering into regime types?
- which event families vary most?

### Deliverables
- candidate \(z_r\) representations
- evidence for latent dimension
- evidence for or against discrete modes

## Phase 6 — Minimal hierarchical semimechanistic teacher (v1)

### Goals
Build the first joint model:
- shared base hazards,
- low-rank round modulation,
- annual common shock,
- optional rollout simulator,
- terminal tensor estimator.

### Start with
- no hidden memory,
- no fancy neural components,
- robust regularization,
- score-aligned terminal calibration.

### Deliverables
- first teacher model
- first historical benchmark result for family

## Phase 7 — Online inference and synthetic live episodes

### Goals
Turn historical rounds into synthetic active-round tasks.

### Procedure
For a historical round:
- use some replay paths to estimate “true” terminal tensor,
- use separate replay paths as stochastic query draws,
- simulate the online interface,
- train the student or likelihood surrogate.

### Inference methods to test
- direct amortized posterior network \(q(z\mid M,D)\)
- MAP over \(z\) with surrogate likelihood
- particle filter / SMC over \(z\)
- hybrid student-proposal + particle refinement

### Deliverables
- online posterior model
- offline query simulation environment
- held-out live-style benchmark

## Phase 8 — Query policy

### Goals
Move beyond naive coverage.

### Candidate policies
1. static coverage baseline
2. entropy-map weighted coverage
3. diagnostic-window replication
4. expected information gain about \(z_r\)
5. expected reduction in terminal weighted-KL risk
6. learned policy trained on synthetic historical episodes

### Important insight
Because online queries are fresh stochastic year-50 samples, repeated queries to the same window can be highly informative if the window is diagnostic of \(z_r\).

### Deliverables
- policy comparison table
- chosen default policy

## Phase 9 — Family refinements

### Refinements to exhaust
- hidden memory \(H_t\)
- boosted-tree hazard surfaces
- monotone neural hazard heads
- graph message-passing hazard modules
- discrete+continuous regime mixture
- latent pairwise event EM
- residual neural correction layer on top of semimechanistic teacher
- improved calibration
- ensemble combinations

## Phase 10 — Production hardening

### Goals
- make best models fast
- clean configs
- stable caching
- reproducible benchmark runs
- polished registry and notes

---

# Part L — Concrete subfamilies that must be exhausted

Explore in roughly this order.

## L1. `smh_glmm_*`
Classical mixed-effects multinomial/logistic hazards plus linear mark dynamics.
Purpose: strongest simple baseline and scientific interpretability.

## L2. `smh_gam_*`
Shape-constrained or smooth additive hazards.
Purpose: capture nonlinearities with strong regularization.

## L3. `smh_gbdt_*`
Boosted-tree hazard surfaces with structured inputs.
Purpose: stronger nonlinear fit while still not too high variance.

## L4. `smh_gam_mem_*` / `smh_gbdt_mem_*`
Add small hidden memory.
Purpose: test Markov sufficiency failure.

## L5. `smh_nn_*`
Small monotone / shallow neural hazard heads.
Purpose: flexible function class while preserving structure.

## L6. `smh_gnn_*`
Graph-aware hazard modules over settlement graph.
Purpose: richer trade/raid modeling when simpler graph features plateau.

## L7. `smh_mix_*`
Discrete+continuous regime mixture variants.
Purpose: capture regime clustering.

## L8. `smh_resid_*`
Semimechanistic teacher + neural residual correction.
Purpose: final performance push without abandoning structure.

Every one of these should be represented in the registry and benchmarked fairly.

---

# Part M — Online inference options to exhaust

## M1. Direct amortized posterior network
Input: initial maps + query transcript
Output: \(q(z\mid M,D)\)

Pros:
- fast online
- easy to deploy

Cons:
- may overfit historical query distribution

## M2. MAP / Laplace over \(z\)
Use teacher or surrogate patch likelihood and optimize \(z\).

Pros:
- simple
- interpretable

Cons:
- may under-represent posterior uncertainty

## M3. Particle filter / SMC over \(z\)
Maintain particles in round-latent space and update sequentially.

Pros:
- natural for sequential queries
- uncertainty-aware

Cons:
- heavier online compute

## M4. Hybrid
Use amortized student to propose posterior; refine with MAP or particles.

This hybrid is likely the best eventual choice.

---

# Part N — Query policy options to exhaust

## N1. Coverage-only baseline
Tile the map or approximate weighted coverage.

This is a baseline, not likely the final answer.

## N2. Entropy-aware coverage
Use prior entropy maps from teacher to prioritize high-uncertainty regions.

## N3. Diagnostic replication
Find windows most diagnostic of regime differences and sample them repeatedly.

## N4. Information gain in \(z_r\)
Use approximate posterior predictive patch laws.

## N5. Risk-reduction policy
Directly approximate expected reduction in final weighted-KL loss.

## N6. Learned policy
Train on synthetic active-round episodes from historical replay.

This policy ladder must be explored in order, not jumped over chaotically.

---

# Part O — Evaluation metrics beyond final benchmark

The historical benchmark score is primary, but not sufficient for debugging.

Track all of these:

## O1. One-step transition metrics
- event NLL
- mark-update NLL / RMSE
- calibration for event probabilities
- rare-event performance

## O2. Multi-step rollout metrics
- k-step NLL
- summary-stat drift
- event-rate drift
- owner-domain evolution realism
- collapse/rebuild timing realism

## O3. Terminal metrics
- weighted KL
- unweighted KL
- per-class Brier/log loss
- entropy calibration
- score decomposition by cell type / entropy bands

## O4. Online inference metrics
- posterior concentration quality
- improvement per query
- sensitivity to repeated windows
- query efficiency curves

## O5. Runtime metrics
- training time
- benchmark time
- online inference time
- rollout speed
- memory usage

---

# Part P — Specific diagnostics to verify hypotheses

## P1. Markov sufficiency diagnostic
Fit:
- Model A: \(X_t \to X_{t+1}\)
- Model B: \((X_{t-1},X_t) \to X_{t+1}\)

If B materially wins, visible state is not sufficient.

## P2. Common-shock diagnostic
Inspect within-year residual correlation across distant settlements.
If strong, add / strengthen \(\Omega_t\).

## P3. Geometry diagnostic
Compare local-only vs geodesic-field models on holdout rounds.

## P4. Round-manifold diagnostic
After fitting round-specific laws:
- scree plot of variance explained
- holdout-round reconstruction vs latent dimension
- clustering stability

## P5. Port/coast invariant diagnostic
Verify no model leakage is violating obvious game structure.

## P6. Owner-label diagnostic
Randomly relabel owner IDs within trajectories and ensure model outputs remain unchanged except for label-invariant summaries.

## P7. Rare-event diagnostic
Track collapse, rebuild, reclaim, owner-switch calibration separately.
Rare events will dominate perceived realism and may affect score disproportionately in dynamic cells.

---

# Part Q — Performance engineering notes specific to this family

## Q1. Data layout
Store replay-derived data in at least two forms:
1. path-level yearly states
2. flattened transition tables

Use cached parquet with partitioning by:
- round
- seed
- path
- year (if useful)

## Q2. Static feature cache
Precompute static geometry once per historical map seed and once per live map seed.

## Q3. Interaction sparsification
Do not do dense all-pairs settlement interactions.
Use sparse candidate edges based on:
- land/sea reach thresholds
- top-k nearest relevant neighbors
- graph neighborhoods

## Q4. Rollout speed
Teacher rollout must be vectorized and batched.
If rollouts are too slow, distill:
- terminal decoder \(F(M,z)\)
- patch likelihood surrogate \(G(M,A,z)\)

## Q5. Avoid repeated heavy Monte Carlo during development
Use cheap approximations for dev loops; reserve heavier MC for promotion benchmarks.

---

# Part R — Concrete implementation skeleton / pseudocode

## R1. Data modules

```python
# replay parsing
parse_replay(round_id) -> list[PathStateSequence]

# static geometry
build_static_features(initial_map) -> StaticFeatureBundle

# transition extraction
extract_transitions(path_sequence, static_features) -> TransitionTable

# event labels
label_events(transition_table) -> EventTable
```

## R2. Round-specific fitting

```python
for round_id in historical_rounds:
    data_r = load_event_tables(round_id)
    beta_r = fit_round_specific_semimech_model(data_r, regularization=...)
    save_round_summary(round_id, beta_r, diagnostics_r)
```

## R3. Regime discovery

```python
B = stack_round_summaries(all_beta_r)
z_model = fit_low_rank_round_manifold(B)  # PCA / FA / mixture / etc.
z_r = z_model.encode(B)
save_round_latents(z_r)
```

## R4. Joint teacher

```python
teacher = SemimechTeacher(
    static_feature_spec=...,
    event_heads=...,
    mark_update_heads=...,
    latent_dim=d,
    latent_memory_dim=h,
    common_shock_spec=...,
)

teacher.fit(
    replay_transition_dataset,
    round_latents_init=z_r,
    terminal_tensor_targets=historical_ground_truth_tensors,
)
```

## R5. Synthetic active-round episodes

```python
for round_id in historical_rounds:
    gt_tensor = estimate_ground_truth_from_reserved_replays(round_id)
    query_draw_pool = reserved_query_replays(round_id)
    for episode in range(num_episodes):
        D = simulate_query_session(query_draw_pool, policy_or_sampler=...)
        yield (initial_maps[round_id], D, gt_tensor)
```

## R6. Student / online posterior

```python
student = OnlineRegimeInferenceModel(...)
student.fit(synthetic_active_round_dataset, teacher_targets=...)
```

## R7. Query policy

```python
policy = QueryPolicy(...)
policy.fit(
    teacher_or_true_env=historical_episode_env,
    objective="final_weighted_kl_improvement",
)
```

## R8. Live round logic

```python
def run_live_round(initial_maps):
    posterior = student.initialize_prior(initial_maps)
    transcript = []
    for t in range(query_budget):
        action = policy.select(initial_maps, transcript, posterior)
        obs = query_env.simulate(action)  # actual live call online
        transcript.append((action, obs))
        posterior = student.update(initial_maps, transcript, posterior)
    pred_tensor = student.posterior_predictive(initial_maps, posterior)
    return pred_tensor
```

---

# Part S — Strong opinions / defaults

These are my current defaults unless evidence disproves them.

1. **Use a semimechanistic teacher as the mainline family.**
2. **Do not begin with a giant generic world model.**
3. **Do not begin with exact rule induction as the mainline.**
4. **Treat the visible replay state as possibly non-Markov until tested.**
5. **Always include annual common-shock terms early.**
6. **Use graph/geodesic influence fields, not Euclidean-only features.**
7. **Use low-rank round modulation.**
8. **Do not let latent dimension grow casually.**
9. **Keep owner handling permutation-invariant.**
10. **Calibrate the terminal tensor explicitly.**
11. **Evaluate by holdout rounds only.**
12. **Maintain the experiment registry religiously.**

---

# Part T — Initial experiment sequence (strongly recommended)

Run this sequence in order before wandering.

## T1. `smh_glmm_z0_h0_covbase_calnone_v001`
Pure pooled semimechanistic GLMM, no round latent, no hidden memory.
Purpose: baseline structure check.

## T2. `smh_glmm_z0_h0_covbase_calterm_v002`
Add terminal calibration.
Purpose: quantify terminal alignment benefit.

## T3. `smh_glmm_z0_h1_covbase_calterm_v003`
Add tiny hidden memory.
Purpose: Markov sufficiency test.

## T4. `smh_glmm_roundfit_probe_v004`
Fit per-round separate models and export coefficient summaries.
Purpose: regime manifold discovery.

## T5. `smh_glmm_z4_h1_covbase_calterm_v005`
Joint low-rank round latent.
Purpose: first real family model.

## T6. `smh_gam_z4_h1_covbase_calterm_v006`
Nonlinear but structured hazard surfaces.
Purpose: likely first genuinely competitive model.

## T7. `smh_gam_z4_h1_diagrep_calterm_v007`
Add diagnostic-replication query policy in synthetic live setting.

## T8. `smh_gbdt_z4_h1_diagrep_calterm_v008`
Test tree-based hazards.

## T9. `smh_gam_z6mix_h1_diagrep_caldir_v009`
Discrete+continuous regime mixture.

## T10. `smh_nn_z6mix_h1_diagrep_caldir_v010`
Small neural hazard heads if simpler families plateau.

Only after exhausting this ladder should you go significantly more complex.

---

# Part U — What to do when results are confusing

If a model’s one-step fit is great but benchmark is weak:
- inspect rollout drift,
- inspect terminal calibration,
- inspect rare-event underestimation,
- inspect common-shock misspecification.

If holdout-round performance is unstable:
- latent dimension may be too large,
- regime model may be leaking round identity,
- round-specific fitting may be too unconstrained.

If neural variants beat classical models in-sample but fail on holdout:
- too much flexibility in round modulation,
- insufficient structural constraints,
- student or teacher overfitting historical query distribution.

If repeated-window policies do not help:
- patch likelihood surrogate may be weak,
- diagnostic windows may be poorly chosen,
- prior teacher already too uncertain or too flat.

Always diagnose by comparing neighboring models in the family, not in isolation.

---

# Part V — Final decision rule for this family

This family is successful if it achieves all of the following:

1. It clearly outperforms simple direct baselines on holdout rounds.
2. It yields interpretable evidence that round variation is being captured in a small number of directions.
3. It supports an online posterior and query policy that improve final score under realistic live constraints.
4. It remains fast enough to iterate.
5. It produces a stable best-model line that can be reproduced by model name and commit.

If those are true, keep pushing the family hard.

If the family fails **after**:
- event ontology is good,
- geometry is good,
- common shocks are modeled,
- hidden memory is tested,
- round low-rank structure is tested,
- query policy is tuned,
- and multiple function classes are exhausted,

then and only then consider shifting primary focus to a different family.

---

# Part W — Short summary for the implementation agent

If you only remember ten things, remember these:

1. Read `docs/game_facts.md` first.
2. Use holdout rounds, not random splits.
3. Build a reliable replay-to-transition dataset before anything else.
4. The key asymmetry is: many transitions, few independent rounds.
5. Therefore: rich transition law, tiny round latent.
6. Start with semimechanistic competing-risks + mark dynamics + geodesic influence fields.
7. Test visible-state Markovity and round low-rank structure first.
8. Keep an experiment registry and unique model names.
9. Commit and push constantly.
10. Never assume the family is exhausted until you have systematically killed every major branch listed above.

---

# Part X — Final instruction

Proceed aggressively but scientifically.

Your job is not merely to code a model. Your job is to discover the strongest semimechanistic program for this problem family, prove it with rigorous holdout-round benchmarks, document everything, and make the best versions clean, fast, reproducible, and easy to rerun by name.

Do not stop early.

