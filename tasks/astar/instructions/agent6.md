# Handoff Document: Family 1 — Program-Synthesis / Symbolic / Neuro-Symbolic Reverse Engineering for Astar Island

## Purpose of this document

This is a handoff to an implementation/iteration agent operating **inside an existing framework** that already has data loading, offline training, online query-policy plumbing, and historical benchmark support. Your mission is to **exhaust this entire family of approaches**: symbolic reverse engineering, probabilistic program sketches, semimechanistic hazard programs, hidden-state symbolic models, and neuro-symbolic teacher→student variants that still belong to this same family.

You are not being asked to build one model and stop. You are being asked to run a disciplined scientific/modeling program until the family is exhausted.

This document has two layers:

1. **Generic operating instructions** that should transfer to other model families.
2. **Family-specific instructions** for the symbolic / program-synthesis family.

Read both. The generic section is non-negotiable. The family-specific section contains the actual math, modeling strategy, implementation priorities, experiments, gates, and iteration loop.

---

# Part I — Generic Instructions For Any Iteration Agent

## 1. Mission and success criterion

Your job is to improve historical-benchmark performance and robustness **within this family** of approaches. You are not optimizing elegance. You are not optimizing interpretability as an end in itself. You are not optimizing source-code recovery for philosophical satisfaction. You are optimizing the competition target through a disciplined research program.

You must not stop after a few attempts. You must keep iterating until you have exhausted the meaningful frontier of this family:
- major model variants,
- ablations,
- latent-state options,
- training objectives,
- calibration methods,
- query-posterior interfaces,
- feature libraries,
- performance bottlenecks,
- backtest protocols,
- ensemble variants.

If something fails, preserve what was learned and move to the next variant. Do not loop blindly. Maintain a memory of everything tried.

## 2. Mandatory first reads

Before writing or modifying code, you **must**:

1. Read `docs/game_facts.md` in full.
2. Read this handoff in full.
3. Inspect the existing framework conventions for:
   - model registration,
   - benchmark execution,
   - config/style patterns,
   - serialization/caching,
   - logging,
   - git branch conventions if present.

If `docs/game_facts.md` disagrees with this handoff, do not ignore either source. Resolve the discrepancy explicitly:
- trust hard repository facts over memory,
- note the discrepancy in your experiment log,
- and, where possible, write a small empirical verification test.

## 3. Backtest discipline

The backtest entry point already exists:

```bash
uv run astar run-historical-benchmark --model <MODEL_NAME>
```

Use it constantly.

Historical benchmarking should be treated as **leave-one-round-out or repeated holdout over rounds**, not random splits over replay trajectories. The independent statistical unit is the **round**, not the replay trajectory. This is essential.

You should maintain at least three benchmark tiers:

- **Smoke tier**: tiny/few-round subset, very fast, used for basic breakage checks.
- **Dev tier**: moderate repeated holdout, used for iteration decisions.
- **Full tier**: broader repeated holdout, used before declaring anything genuinely better.

Every serious model change must eventually pass the full tier.

## 4. Experiment tracking is mandatory

Because this is a large family with many interacting components, you must maintain a rigorous experiment registry. Do not rely on memory.

At a minimum, maintain a machine-readable registry (CSV/JSONL/YAML/SQLite — pick one and stick to it) with one row per model iteration. Each row should contain:

- `model_name`
- `family_name`
- `parent_model_name`
- `timestamp`
- `git_commit_sha`
- `git_branch`
- `status` (`planned`, `running`, `finished`, `failed`, `superseded`)
- `stage` (e.g. `gate_markov`, `hazard_glm`, `dsl_gp`, `teacher_distill`, `query_policy`)
- `short_description`
- `full_notes_path`
- `benchmark_tier`
- `holdout_rounds`
- `training_rounds`
- `aggregate_score`
- `per_round_scores`
- `runtime`
- `memory_notes`
- `major_assumptions`
- `what_changed`
- `why_it_might_help`
- `result_summary`
- `next_action`

Also create a human-readable per-model note file for any nontrivial model.

## 5. Model names must be immutable and reproducible

Every benchmarkable model must have a unique model name. Re-running:

```bash
uv run astar run-historical-benchmark --model <MODEL_NAME>
```

must reproduce the same model definition/config/code path for that iteration.

Do **not** overload the same model name with changing behavior.

Recommended naming pattern:

```text
f1_<stage>_<core>_<variant>_vNN
```

Examples:
- `f1_gate_markov_histlag_v01`
- `f1_event_glm_birthcollapse_v03`
- `f1_roundcoef_lowrank_svd_v02`
- `f1_teacher_greybox_gnn_v05`
- `f1_student_posterior_setenc_v04`
- `f1_queryinfo_diagwindows_v02`

Treat the name as a versioned contract.

## 6. Commit and push discipline

This is non-negotiable.

You must commit **frequently** and push to the remote branch **frequently**.

At minimum, commit and push when:

- a new model is runnable,
- a new benchmark result is obtained,
- a new best score is achieved,
- a major new dataset/cache/preprocessing artifact is added,
- a major assumption is verified or falsified,
- a large refactor lands,
- a new diagnostic or evaluation harness is added.

Commit messages should be informative, for example:

```text
[f1] add markov sufficiency audit with history ablations
[f1] implement event ledger extraction and cache
[f1] add birth/port/collapse hazard GLM baseline
[f1] best dev score: f1_event_glm_birthcollapse_v03 = 74.21
[f1] add low-rank cross-round coefficient audit
```

Push after every significant commit. Do not accumulate local-only progress.

## 7. Code quality and performance requirements

Write clean, testable, performant code that follows the existing framework’s patterns.

You must assume that iteration speed is itself a first-class objective. Slow code kills research. Therefore:

- Precompute aggressively when the same quantities are reused.
- Cache replay parsing, geometry features, event ledgers, and pairwise features.
- Avoid Python loops in inner training/inference paths when vectorization is feasible.
- Use batched operations and sparse data structures where appropriate.
- Parallelize across rounds/replays where framework conventions allow.
- Keep memory usage under control; use memory-mapped or chunked formats for large replay-derived artifacts.
- Separate slow offline preprocessing from fast benchmark-time inference.
- Add profiling before major optimization work.
- Preserve a fast fallback path.

The model family is large; if you do not build it for fast iteration, you will not explore enough of the space.

## 8. Scientific discipline

You are not allowed to “just try stuff” without preserving the logic.

For every experiment, explicitly state:

1. What hypothesis is being tested?
2. Why might it improve the benchmark?
3. What is the failure criterion?
4. What is learned if it fails?
5. What is the next branch if it succeeds?

Always compare against the strongest appropriate baseline. Never declare success because an experiment beats an outdated weak model.

## 9. Use the family boundary intelligently

You are expected to exhaust this family, but that does **not** mean the family must remain dogmatically pure.

Allowed within-family aids include:
- neural teachers used for symbolic discovery or denoising,
- neural proposal distributions,
- differentiable inner-loop fitting,
- latent graph inference used as an auxiliary proposal mechanism,
- ensembles with semimechanistic baselines,
- student models trained on teacher-generated episodes.

The **end product** must still sit within the spirit of this family: symbolic / programmatic / semimechanistic / neuro-symbolic world-modeling with low-dimensional round variation and online inverse inference.

## 10. Failure mode to avoid

Do not drift into one of these traps:

- giant generic end-to-end black-box models,
- no experiment memory,
- no holdout-by-round evaluation,
- no performance engineering,
- repeated silent model mutations under the same model name,
- overfitting to a few rounds and mistaking it for progress,
- spending days on elegant code without benchmark movement,
- spending days on benchmark hacking without scientific diagnostics.

---

# Part II — Family-Specific Instructions: Program-Synthesis / Symbolic / Neuro-Symbolic Reverse Engineering

## 11. Family objective

The goal of this family is **not** to recover literal hidden source code. The goal is to recover a **semantically equivalent stochastic program** or a close predictive-state approximation: a simulator-like model whose yearly transition law and year-50 induced marginals are close enough to the real simulator that it is optimal or near-optimal for the benchmark.

The competition score depends on the year-50 per-cell probability tensor under entropy-weighted KL. Therefore the family is judged by:

1. path realism on historical replay,
2. year-50 tensor fidelity,
3. online inferability of the round regime from 50 live terminal-window queries,
4. speed and robustness of the resulting pipeline.

## 12. Facts and assumptions the agent must internalize

### 12.1 Officially documented structure

From the game/problem documentation (and repository facts, which you must re-read):
- The world is a grid, default 40×40.
- There are 5 seeds per round.
- A round has hidden parameters shared across the 5 seeds.
- The simulator evolves for 50 yearly steps.
- The yearly conceptual order is: growth → conflict → trade → winter → environment.
- Active-round `/simulate` gives year-50 stochastic viewports only.
- The score is entropy-weighted KL on the final per-cell 6-class probability tensor.
- Settlements track population, food, wealth, defense, port status, allegiance, and internally also tech level / longship ownership.

### 12.2 User-verified replay facts (treat as strong but still verify in code)

You have been told the following by the user and should **verify them empirically inside the repo/framework**:

- Historical replay can generate **as many stochastic replays as desired** for completed rounds.
- Replay exposes **year-by-year full-map states**.
- Replay exposes **full settlement tables each year**, including at least:
  - `x, y`
  - `population`
  - `food`
  - `wealth`
  - `defense`
  - `has_port`
  - `alive`
  - `owner_id`
- Current live rounds still only allow the official sparse terminal-window query interface.

### 12.3 Critical unknowns to verify immediately

You must explicitly verify the following rather than assume them forever:

1. Does replay expose **tech level**?
2. Does replay expose **longship ownership**?
3. Does replay expose any **sub-phase** states inside a year, or only yearly boundaries?
4. Are replay trajectories reproducible under explicit replay seeds?
5. Are owner IDs stable across a replay, across replays of the same round, and across seeds?
6. Is the yearly process approximately Markov in the observed state?
7. Is cross-round variation low-rank enough to support a tiny regime latent?

These verifications are part of the family roadmap. They are not optional.

## 13. The deepest conceptual asymmetry

This family is dominated by one asymmetry:

- **Within a historical round**: effectively unlimited stochastic replay.
- **Across historical rounds**: limited number of distinct round laws.

Therefore:
- within-round law estimation can be rich and data-hungry,
- cross-round variation must be modeled extremely parsimoniously.

This should determine everything:
- model class,
- latent dimension,
- validation protocol,
- feature engineering,
- symbolic syntax complexity,
- benchmark interpretation.

The independent unit for generalization is the **round**, not the trajectory.

## 14. What this family should ultimately produce

The family should aim to produce the following stack.

### 14.1 Teacher world model

A stochastic yearly transition model

```math
X_{t+1} \sim S_{\phi,z_r}(X_t, \xi_t)
```

where:
- `X_t` is the full world state at year `t`,
- `\phi` are global shared parameters,
- `z_r` is the small round-specific regime latent,
- `\xi_t` is stochastic innovation.

### 14.2 Fast terminal decoder

A fast approximation to the year-50 predictive tensor

```math
F_\phi(M, z) \approx P(\text{year-50 tensor} \mid M, z)
```

so online inference does not require expensive rollout every time.

### 14.3 Online posterior model

A model of the live-round regime posterior

```math
q_\psi(z \mid M, D)
```

where `D` is the transcript of up to 50 active-round terminal-window queries.

### 14.4 Optional query policy model

A model that selects diagnostic windows to reduce posterior uncertainty in score-relevant cells.

This can be added later. Do not start with it.

---

# Part III — The Two Gating Audits (Most Important First)

## 15. Gate 1: Markov sufficiency audit (the most important thing to figure out first)

This is the first and most important thing.

You must determine whether the observed replay state is close enough to Markov-sufficient that direct symbolic one-step modeling is realistic.

### 15.1 Why this matters

If the observed yearly replay state is nearly Markov-sufficient, then family one can be pursued in a strong form: explicit stochastic program modeling of yearly transitions.

If not, then family one is still viable, but only as a **partially observed symbolic state-space model** with hidden memory. That is a qualitatively different project.

### 15.2 What to test

Compare predictive performance for the same transition targets under the following conditioning sets:

```math
p(X_{t+1} \mid X_t)
```

vs

```math
p(X_{t+1} \mid X_t, X_{t-1})
```

vs

```math
p(X_{t+1} \mid X_t, h_t)
```

where `h_t` is a short learned history state.

Do this both for:
- full next-state prediction,
- and separately for event-specific prediction:
  - birth
  - portization
  - collapse
  - rebuild
  - reclaim
  - owner switch
  - population delta
  - food delta
  - wealth delta
  - defense delta

### 15.3 What counts as evidence against Markov sufficiency

If adding short history or a tiny hidden memory materially improves held-out-round transition prediction, then the observed state is not sufficient and the direct explicit family must be extended to include hidden state.

Material improvement means not tiny within-round gains, but robust held-out-round gains across the metrics that matter.

### 15.4 Deliverables for Gate 1

Implement a dedicated audit module that outputs:
- held-out-round predictive metrics for `X_t` vs `X_t,X_{t-1}` vs learned-memory variants,
- event-wise gains,
- plots/tables of where history matters most,
- a final conclusion file:
  - `markov_sufficiency = likely / uncertain / unlikely`
  - with evidence.

Gate 1 must be completed before serious symbolic synthesis.

## 16. Gate 2: Low-rank cross-round dynamics audit

This is the second most important thing.

### 16.1 Why this matters

Live rounds only give 50 terminal-window queries. That means the current round can only support inference in a **small regime space**. If cross-round dynamic variation is not low-rank or compressible, then family one cannot plausibly be the mainline winning approach.

### 16.2 What to do

For each historical round, fit a rich **per-round effective law** (not yet a shared global symbolic program). This can be semimechanistic or partially neural.

Call the fitted per-round coefficients / summaries `β_r`.

Then test whether:

```math
\beta_r \approx \beta_0 + B z_r
```

for a small-dimensional `z_r`.

Use:
- SVD / PCA / factor analysis / probabilistic PCA,
- round-level held-out reconstruction,
- round-level held-out predictive performance,
- singular value decay,
- reconstruction vs latent dimension curves.

### 16.3 What counts as success

If a small latent dimension (e.g. low single digits or maybe low teens) captures most predictive variation across rounds, then family one remains a strong contender.

If you need a large latent dimension to reconstruct held-out rounds, the family should be downgraded to a component inside a broader grey-box model, not a pure symbolic mainline.

### 16.4 Deliverables for Gate 2

Implement a `round_dynamics_lowrank_audit` that outputs:
- per-round fitted law objects or coefficient vectors,
- singular value plots,
- held-out-round reconstruction curves,
- predictive performance vs latent dimension,
- final conclusion file:
  - `cross_round_low_rank = likely / uncertain / unlikely`
  - with evidence.

Do not skip this. It determines whether the rest is worth scaling.

---

# Part IV — Family-Specific Research Roadmap

## 17. Phase 0: Data canonization and replay science infrastructure

Build the foundation first.

### 17.1 Replay ingestion

Implement a high-performance replay ingestion layer that can:
- iterate over rounds, seeds, replay draws, and years,
- store/retrieve full grid state per year,
- store/retrieve full settlement tables per year,
- preserve replay seed or stochastic draw identifiers if available,
- allow deterministic reruns if replay seeding is supported.

### 17.2 Canonical state representation

Define a canonical yearly state object:
- static map substrate,
- dynamic grid layer,
- settlement table,
- settlement graph / interaction graph views,
- owner partition representation.

Important: owner IDs are labels, not numbers. Build canonical/invariant partition features. Never let raw integer owner IDs be treated as ordinal signals.

### 17.3 Geometry feature caches

Precompute static geometry per map:
- coast mask,
- ocean adjacency,
- forest adjacency counts,
- mountain barriers,
- land connected components,
- sea/fjord connectivity,
- land geodesics,
- sea geodesics,
- mixed land–sea reachability,
- chokepoint/bottleneck features,
- coastal centrality,
- candidate port sites.

Store them in reusable caches.

### 17.4 Settlement tracking

Implement or verify identity tracking of settlements across years:
- same cell persistence,
- port conversion,
- collapse and rebuild,
- ownership change,
- death/rebirth distinctions.

This must be correct; otherwise event labeling will be corrupted.

## 18. Phase 1: Event ledger extraction

This is the decisive preprocessing step.

From replay trajectories, derive a clean event ledger for every yearly transition.

### 18.1 Event vocabulary

At minimum, extract:
- birth / founding of settlement,
- settlement → port conversion,
- settlement/port → ruin collapse,
- ruin → settlement rebuild,
- ruin → forest reclaim,
- ruin → open/empty reclaim if visible,
- owner switch,
- population delta,
- food delta,
- wealth delta,
- defense delta,
- total owner/domain summary changes.

### 18.2 Latent/ambiguous event candidates

Also derive candidate labels or proxies for:
- probable raid interactions,
- probable trade interactions,
- winter-like common shocks,
- rebuild sponsorship by nearby settlements.

Treat these as **latent or inferred events**, not guaranteed ground truth.

### 18.3 Event-ledger schema

Build a columnar event table with typed keys:
- round_id,
- seed_idx,
- replay_id,
- year_t,
- event_type,
- subject_id or cell,
- target_id or target cell if relevant,
- before-state summaries,
- after-state summaries,
- static geometry features,
- candidate graph features,
- outcome label,
- confidence if inferred.

This ledger will drive most of the early symbolic work.

## 19. Phase 2: Invariant and impossibility discovery

Before fitting any laws, learn the hard constraints.

Examples to test and encode:
- mountains static,
- ports only on coastal settlements,
- impossible terrain transitions,
- impossible direct jumps,
- reclaim support restrictions,
- owner-switch support restrictions,
- map-support restrictions on settlement birth.

Implement a test suite that empirically scans historical replay for violations.

The output should be a set of hard constraints to bake into the DSL and the event models.

## 20. Phase 3: Local law discovery (module-level)

Now begin actual law discovery, but locally.

### 20.1 Start with easier subproblems

Recommended order:
1. continuous deltas (food, wealth, defense, population),
2. collapse hazard,
3. portization hazard,
4. birth / founding hazard,
5. rebuild/reclaim hazards,
6. owner-switch hazard,
7. probable raid/trade modules.

### 20.2 Candidate model classes for each subproblem

For each event or delta, try a ladder of model classes:

1. sparse linear / GLM / logistic / Poisson / NB,
2. GAM / monotone additive model,
3. tree / boosted tree,
4. sparse library regression (SINDy-style),
5. symbolic regression on denoised targets,
6. constrained DSL search,
7. semineural residual on top of symbolic/GLM core.

### 20.3 Evaluation protocol

Always evaluate on held-out rounds.

Metrics should include:
- one-step log-loss for event hazards,
- Brier score / calibration for event probabilities,
- RMSE / MAE for continuous deltas,
- cross-round robustness,
- simplicity/description length,
- interpretability if ties are close.

### 20.4 What success looks like

The goal is not perfect fit. The goal is to find the **simplest** sub-law that survives held-out-round evaluation and captures the dominant structure.

## 21. Phase 4: Interaction topology discovery

The difficult mechanisms are the long-range ones.

Trade and raid are not just local convolutions. They likely live on sparse interaction graphs induced by settlements and geography.

### 21.1 Competing topologies to test

Test:
- purely local spatial neighborhoods,
- land-geodesic neighbor graphs,
- sea-geodesic graphs,
- mixed land–sea graphs,
- nearest-k settlement graphs,
- owner-boundary graphs,
- coast-centrality-enhanced graphs,
- learned residual graph proposals.

### 21.2 What to predict with topology tests

Evaluate topology choice on:
- owner switch,
- defense/wealth shocks,
- food changes,
- port survival/creation,
- coordinated prosperity or collapse,
- inferred trade/raid proxy accuracy.

### 21.3 Use of NRI-style machinery

Neural relational inference or graph-discovery tools may be used as **proposal generators** or residual graph learners, but they should not replace strong geography priors. The geometry already provides a strong sparse candidate graph. Keep the graph-learning problem constrained.

## 22. Phase 5: Hidden-memory / latent-state extension if Gate 1 fails

If the Markov audit shows visible replay state is not sufficient, extend the symbolic family minimally.

### 22.1 Minimal hidden-state candidates

Try the smallest useful hidden-state augmentations first:
- per-settlement latent tech scalar,
- per-settlement latent naval/longship scalar,
- owner-level latent strength,
- global yearly shock variable,
- short-lived stress/raid residue variable.

### 22.2 Modeling principle

Do **not** jump straight to a giant RNN latent state.

Use the smallest hidden memory that materially improves held-out-round prediction and rollout realism.

### 22.3 Validation

Any hidden-state extension must earn its complexity by improving:
- one-step fit,
- multi-step rollout stability,
- year-50 tensor fidelity,
- held-out-round performance.

## 23. Phase 6: Per-round effective law fitting

At this stage, fit a rich one-round model for each historical round using abundant replay.

This is not yet the shared family model. This is a **round science** phase.

### 23.1 Outputs of this phase

For each round `r`, estimate:
- event-law coefficients,
- continuous-delta law coefficients,
- graph/topology preferences,
- hidden-memory settings if needed,
- global shock summaries,
- any other effective law summaries.

Collect all of these into a per-round parameter object `β_r`.

### 23.2 Use rich models here if useful

Within-round estimation can afford richer models because replay is abundant.

Allowed here:
- grey-box GNNs,
- semimechanistic state-space models,
- richer hazard models,
- teacher models used only to estimate smoother round summaries.

The point is to estimate each round’s law accurately enough to study **how** it differs from other rounds.

## 24. Phase 7: Cross-round compression into the regime manifold

Only after the per-round law objects exist do you define the round latent `z_r`.

### 24.1 Core parameterization

Start with:

```math
\beta_r \approx \beta_0 + B z_r
```

Potential extensions:
- discrete mixture component + continuous latent,
- phase-wise sub-latents,
- sparsity constraints on which coefficients vary by round.

### 24.2 What to measure

- singular value decay,
- held-out-round law reconstruction,
- held-out-round year-50 tensor reconstruction,
- latent dimension vs performance,
- robustness of latent interpretation.

### 24.3 Criteria

Prefer the smallest latent that preserves held-out-round predictive power.

If several parameter blocks do not need to vary by round, lock them globally.

## 25. Phase 8: Typed DSL design and symbolic distillation

Only now build the symbolic DSL in earnest.

### 25.1 DSL design principles

The DSL should be:
- typed,
- sparse,
- domain-constrained,
- expressive enough for event hazards and continuous update formulas,
- compatible with stochastic outputs.

### 25.2 DSL primitives

Include primitives for:
- Boolean predicates: coastal, buildable, ruin, alive, friendly, enemy, etc.
- Numeric features: resource values, defense, counts, distances, centralities.
- Aggregations: sum, mean, max, min, count, nearest-k, softmax-weighted sums.
- Thresholded logic / if-then-else.
- Simple algebra and interactions.
- Graph aggregations over land/sea/mixed neighborhoods.
- Stochastic distributions: Bernoulli, categorical, Gaussian/Beta/NB, etc.

### 25.3 Symbolic distillation workflow

Use a teacher→symbolic distillation pipeline:
1. Fit teacher / smooth target.
2. Run symbolic search on module targets.
3. Compare symbolic candidate vs teacher vs simple baseline.
4. Accept symbolic law only if it survives held-out-round evaluation.

### 25.4 Search methods to include

Exhaust the family by trying:
- sparse library regression,
- symbolic regression on smooth module targets,
- constrained GP over typed DSL,
- MDL-penalized candidate selection,
- differentiable coefficient fitting inside fixed symbolic sketches,
- hybrid symbolic + residual variants.

## 26. Phase 9: Assemble the full stochastic program

Now build the full annual program skeleton.

### 26.1 Program sketch

The conceptual skeleton should respect the documented yearly order:

```math
S_{t+1} = \mathcal E_{z_r} \circ \mathcal W_{z_r} \circ \mathcal T_{z_r} \circ \mathcal C_{z_r} \circ \mathcal G_{z_r}(S_t)
```

But remember: without sub-phase replay, this factorization is a bias, not guaranteed truth. Only split modules when the data justify the split.

### 26.2 Two possible assembly targets

Target A: mostly symbolic stochastic simulator.

Target B: neuro-symbolic simulator with symbolic modules plus small learned residuals where needed.

You must try both.

### 26.3 Validation levels

Validate at three levels:
1. one-step transitions,
2. multi-step rollouts,
3. year-50 tensor.

A model that looks good on one-step transitions but drifts over 50 steps is not acceptable.

## 27. Phase 10: Posterior predictive checks and falsification

You must implement serious model criticism.

For any assembled candidate program, simulate many historical replays and compare with real replay using discrepancy functions such as:
- event counts,
- survival curves,
- ruin lifetime distributions,
- port fractions,
- owner domain size distributions,
- owner switch rates,
- expansion front speed,
- spatial correlation lengths,
- yearly resource distributions,
- terminal entropy maps,
- final tensor match.

This is how you falsify hypotheses and refine the family.

## 28. Phase 11: Online inverse inference for live rounds

Only after the world model is sufficiently stable offline should you build the live inference layer.

### 28.1 Posterior target

The live target is:

```math
p(z_r \mid M_r, D_r)
```

where `D_r` is the set of up to 50 stochastic year-50 viewport observations from the active round.

### 28.2 Routes to implement

Implement both:

1. **Likelihood-like route**
   - using symbolic simulator / fast patch likelihood approximations,
   - potentially via Monte Carlo or density-ratio estimators.

2. **Amortized route**
   - train a student on synthetic active-round episodes generated from historical replay or the teacher simulator,
   - output either posterior over `z_r` or final tensor directly.

### 28.3 Output

Final prediction should be the posterior predictive tensor:

```math
\hat P_r = \mathbb E_{z\sim p(z\mid M_r,D_r)}[F_\phi(M_r,z)]
```

## 29. Phase 12: Query policy within this family

Do not start here, but do not forget it.

With a strong offline world model, the live-query problem is not “cover the map.” The map is already known. The live-query problem is “reduce uncertainty in the current round regime and in the score-relevant high-entropy cells.”

### 29.1 Query objective

Approximate the value of a query as expected reduction in final score risk, or expected information gain about `z_r` weighted by score-relevant cells.

### 29.2 Policy stages

Likely policy structure:
- early diagnostic windows,
- mid-stage replication on informative windows,
- late-stage refinement on score-sensitive frontier windows.

### 29.3 Important note

Because active-round queries are fresh stochastic year-50 samples, repeated identical windows are statistically meaningful. They estimate the local terminal patch law. Do not assume repetition is wasteful.

---

# Part V — Concrete Experiment Program

## 30. Ordered experiment plan (do this in sequence)

This is the operational order.

### Step 0 — Setup
- Read `docs/game_facts.md`.
- Inspect framework conventions.
- Create experiment registry infrastructure.
- Create naming convention utilities if missing.
- Create family-specific notes directory.

### Step 1 — Replay ingestion and canonical state
- Implement replay loaders.
- Canonicalize settlement tracking and owner partition handling.
- Cache geometry features.
- Verify replay assumptions.

### Step 2 — Event ledger
- Build event extraction.
- Validate manually on a few rounds.
- Cache event tables.

### Step 3 — Gate 1 (Markov sufficiency)
- Run history ablations.
- Produce report.
- Decide: direct symbolic vs hidden-state symbolic.

### Step 4 — Gate 2 (low-rank cross-round variation)
- Fit per-round effective laws.
- Run low-rank audit.
- Produce report.
- Decide: is tiny `z_r` plausible?

### Step 5 — Earliest strong baseline within this family
- Implement semimechanistic event-hazard baseline.
- Add cross-round low-rank coefficient model.
- Benchmark.
- This is likely the first serious benchmarkable family model.

### Step 6 — Symbolic module search
- Target easiest modules first.
- Distill from richer teacher if helpful.
- Benchmark module replacements one by one.

### Step 7 — Assemble neuro-symbolic teacher
- Build annual program skeleton.
- Insert symbolic modules + residuals.
- Train on replay and year-50 tensors.
- Benchmark terminal decoder accuracy and rollout realism.

### Step 8 — Online student inference
- Generate synthetic active-round episodes.
- Train posterior/student model.
- Benchmark live-style historical performance.

### Step 9 — Query policy
- Use teacher/simulator for offline policy optimization.
- Benchmark policy variants.

### Step 10 — Ensembles and calibration
- Combine strongest symbolic, semimechanistic, and teacher/student variants.
- Calibrate aggressively because the score punishes overconfidence.
- Benchmark.

Do not skip directly from Step 2 to Step 8. That would throw away the main advantage of this family.

---

# Part VI — Benchmarking and comparison rules inside this family

## 31. Every major experiment must answer these questions

For each candidate model/variant, record:

1. Does it improve one-step transition fit?
2. Does it improve multi-step rollout realism?
3. Does it improve year-50 tensor score?
4. Does it generalize to held-out rounds?
5. Does it reduce online inference difficulty for `z_r`?
6. How expensive is it?
7. What assumption did it rely on?
8. What failure mode did it expose?

## 32. Required benchmark matrix

For serious candidates, benchmark on:
- held-out-round aggregate score,
- per-holdout-round score,
- speed,
- memory,
- calibration / entropy-sensitive diagnostics,
- if possible, simulated live-query ablations (e.g. 10 / 20 / 30 / 50 queries),
- if query policy is involved, policy-aware backtests.

## 33. Core leaderboard within this family

Maintain a family-internal leaderboard with at least these columns:
- rank,
- model_name,
- aggregate score,
- score std,
- best/worst held-out round,
- runtime,
- major assumptions,
- notes.

This should be easy to inspect.

---

# Part VII — Performance engineering instructions specific to this family

## 34. Performance priorities

This family can become computationally heavy. You must structure it for speed.

### 34.1 Cache levels

Introduce and reuse caches for:
- parsed replay trajectories,
- canonical yearly state tables,
- geometry features,
- event ledgers,
- pairwise settlement feature tables,
- per-round fitted law summaries,
- synthetic active-round episode datasets.

### 34.2 Avoid repeated expensive recomputation

Do not recompute:
- geodesic distances,
- graph topologies,
- event extraction,
- round summaries,
- denoised teacher targets,

if the underlying source data and feature definitions did not change.

### 34.3 Vectorization targets

Move the following out of slow Python if possible:
- event extraction over cells/settlements,
- pairwise feature generation,
- per-round replay summarization,
- simulation of large batches of synthetic active-round episodes,
- rollout evaluation.

### 34.4 Separate slow offline work from benchmark-time work

The benchmark command should use precomputed artifacts where valid. Do not bury massive replay preprocessing inside the live benchmark path.

---

# Part VIII — Recommended initial model variants within this family

## 35. Shortlist of variants that must be tried

This is the minimum frontier to exhaust.

### Variant class A — Semimechanistic hazard baselines

Implement several increasingly rich variants:
- GLM/GAM hazard model,
- monotone hazard model,
- tree/boosted hazard model,
- hidden-state hazard model if Gate 1 requires it,
- low-rank cross-round coefficient coupling.

This is likely the first useful benchmarkable family subline.

### Variant class B — Symbolic regression of continuous sub-laws

Apply symbolic or sparse discovery to:
- food delta,
- wealth delta,
- defense delta,
- perhaps population delta,

especially after teacher denoising.

### Variant class C — Symbolic hazard formulas

Search for symbolic forms for:
- collapse,
- portization,
- birth,
- rebuild,
- reclaim.

Compare direct symbolic discovery vs symbolic-on-teacher-targets.

### Variant class D — Typed GP / DSL search for discrete logic

Use constrained GP or enumerative search on modules where thresholding/branching clearly matter.

### Variant class E — Neuro-symbolic teacher

A richer per-round/state-space teacher with symbolic modules and learned residuals.

### Variant class F — Hidden-state symbolic state-space model

Only if Gate 1 demands it.

### Variant class G — Student posterior models

Set-based or recurrent transcript encoders trained on synthetic live episodes.

### Variant class H — Query policy models

Policy variants once the teacher and posterior are stable.

### Variant class I — Ensembles / calibration

Blend strongest semimechanistic, symbolic, and teacher/student candidates.

You are not done until this frontier has been meaningfully explored.

---

# Part IX — Pseudocode sketches

## 36. Gate 1 pseudocode

```python
for round_id in historical_rounds:
    for seed in seeds:
        trajs = load_replays(round_id, seed)
        dataset = build_transition_dataset(trajs)

fit_model_M0(features=[X_t])
fit_model_M1(features=[X_t, X_t_minus_1])
fit_model_M2(features=[X_t, learned_short_history])

for target in transition_targets:
    evaluate_by_heldout_round(target, M0, M1, M2)

write_markov_sufficiency_report()
```

## 37. Gate 2 pseudocode

```python
beta = {}
for round_id in historical_rounds:
    beta[round_id] = fit_per_round_effective_law(round_id)

B, z, diagnostics = low_rank_factorize(beta)
score_curve = evaluate_heldout_round_reconstruction(beta, B, z)
write_low_rank_report(score_curve, diagnostics)
```

## 38. Event-ledger extraction pseudocode

```python
for (state_t, state_tp1) in yearly_transitions:
    events = []
    events += detect_births(state_t, state_tp1)
    events += detect_port_conversions(state_t, state_tp1)
    events += detect_collapses(state_t, state_tp1)
    events += detect_rebuilds(state_t, state_tp1)
    events += detect_reclaims(state_t, state_tp1)
    events += detect_owner_switches(state_t, state_tp1)
    deltas = compute_continuous_settlement_deltas(state_t, state_tp1)
    store(events, deltas)
```

## 39. Teacher → symbolic distillation pseudocode

```python
teacher = fit_teacher_transition_model(replay_data)
soft_targets = teacher.predict_module_targets(replay_data)

for module in modules:
    sym_candidates = symbolic_search(module, soft_targets[module], dsl)
    best_candidate = select_by_heldout_round(sym_candidates)
    register_module_law(module, best_candidate)
```

## 40. Online posterior/student pseudocode

```python
for historical_round in rounds:
    for episode in synthetic_live_episodes(historical_round):
        D = sample_query_transcript(episode, policy_or_random)
        z_target = teacher_or_round_latent(historical_round)
        P_target = final_tensor(historical_round)
        train_student(M=episode.map_bundle, D=D, z=z_target, P=P_target)
```

---

# Part X — What to write down after every serious step

## 41. Mandatory reflection template per serious experiment

Every serious experiment must answer:

1. What did I change?
2. Which assumption/hypothesis was this targeting?
3. What was expected to happen?
4. What actually happened?
5. Was the result consistent across held-out rounds?
6. What does this imply about the family?
7. What is the next experiment branch?
8. Did this justify a commit and push? (Usually yes.)

This is part of not losing the research thread.

---

# Part XI — Final perspective the agent should keep in mind

## 42. The deepest principles for this family

Keep these principles in mind at all times.

### Principle 1

The family is only viable if the replay state is close enough to Markov or can be made so with tiny hidden memory.

### Principle 2

The family is only competitive if cross-round variation is low-rank enough for 50 live terminal-window queries to identify the current regime.

### Principle 3

Unlimited replay means one-round law estimation is easy relative to cross-round generalization.

### Principle 4

Do not search for the whole simulator at once. Hazardize and modularize first.

### Principle 5

Do not hard-commit to symbolic formulas until they survive held-out-round falsification.

### Principle 6

Strongest likely endpoint: neuro-symbolic teacher + symbolic distillation + tiny regime manifold + online posterior student + ensemble calibration.

### Principle 7

If a simpler subfamily survives falsification and benchmarks better, prefer it. Complexity must earn itself.

---

# Part XII — Immediate to-do list for the agent

## 43. First 20 concrete tasks

1. Read `docs/game_facts.md`.
2. Inspect framework model-registration pattern.
3. Create experiment registry artifact if absent.
4. Define family name and naming scheme.
5. Implement replay ingestion cache.
6. Verify replay assumptions (full fields, stochasticity, determinism controls, tech/longship availability, sub-phase availability).
7. Canonicalize owner partition handling.
8. Implement geometry feature cache.
9. Implement settlement tracking across years.
10. Implement event ledger extraction.
11. Validate event extraction manually on a few trajectories.
12. Implement Gate 1 Markov-sufficiency audit.
13. Benchmark Gate 1 and write report.
14. Implement a first per-round effective law fitter.
15. Implement Gate 2 low-rank cross-round audit.
16. Benchmark Gate 2 and write report.
17. Implement first benchmarkable semimechanistic hazard baseline model.
18. Run historical benchmark and register result under a unique model name.
19. Commit and push.
20. Branch based on Gate 1 + Gate 2 outcomes.

Do not skip ahead to fancy DSL/GP work before the two gates and the first semimechanistic baseline exist.

---

# Closing instruction

You are expected to be relentless, organized, empirical, and resourceful.

Do not stop at the first decent model.
Do not abandon failed work without extracting lessons.
Do not let the experiment graph become untraceable.
Do not let performance bottlenecks cripple iteration.
Do not let the symbolic family become an excuse for vague theorizing.

Use the framework. Use the benchmark command constantly. Track everything. Commit and push aggressively. Work the family systematically until the meaningful frontier is exhausted.

