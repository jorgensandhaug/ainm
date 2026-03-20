# Handoff Document: Replay-Rich Regime-Manifold / Grey-Box World-Model Family for Astar Island

This document is for the implementation / iteration agent working inside the existing framework.

It is split into two layers:

1. **Reusable operating instructions**: these apply to any long-running model-iteration family, not just this one.
2. **Family-specific instructions**: this is the deep modeling and experimentation plan for the replay-rich, full-settlement-state, regime-inference family.

The goal is not merely to write a single model. The goal is to run a disciplined scientific and engineering program that discovers, falsifies, and refines a whole family of models until the family is exhausted.

---

# Part I — Reusable Operating Instructions For Any Iterative Research Agent

## 1. Mission

Your job is to improve benchmark score on historical rounds **without sacrificing reproducibility, speed, or clarity**.

You are operating inside an existing framework that already has:
- data loading,
- offline training,
- query policy plumbing,
- online evaluation,
- backtesting.

The framework exposes historical benchmarking via:

```bash
uv run astar run-historical-benchmark --model <ITS_MODEL_NAME_CURRENT_ITERATION>
```

You must use that benchmark continuously and systematically.

You must not stop after finding one decent model. You must keep iterating inside this family until you have **exhausted the meaningful option space** and have high confidence that the family has plateaued.

## 2. Mandatory Reading And Setup

Before writing or modifying any model code, do the following every time you start a fresh branch or session:

1. Read `docs/game_facts.md` in full. Treat it as mandatory.
2. Read the existing framework structure and conventions relevant to models, configs, caching, benchmark output, and logging.
3. Identify where model registration / naming happens.
4. Identify how benchmark output is logged and where to store experiment metadata.
5. Read this handoff document fully.

After reading `docs/game_facts.md`, create or update a **living findings doc** for this family, e.g.:

- `docs/replay_regime_family_findings.md`

That file should accumulate *verified* observations from replay analysis and benchmark analysis. It should separate:
- verified facts,
- strongly supported hypotheses,
- rejected hypotheses,
- open questions.

## 3. Non-Negotiable Working Rules

### 3.1 Unique model name for every meaningfully distinct model
Every materially distinct model or configuration must have a **new model name**.

Do **not** reuse a model name for a changed behavior.

If a change affects any of the following, create a new model name:
- state representation,
- transition structure,
- latent regime parameterization,
- observation/posterior model,
- query policy,
- training loss,
- calibration,
- ensemble composition,
- significant hyperparameters,
- feature set.

### 3.2 Every experiment must be reproducible
For every benchmarked model, record at minimum:
- model name,
- git commit SHA,
- date/time,
- framework command used,
- training rounds / validation rounds / holdout rounds,
- benchmark score summary,
- runtime,
- key hyperparameters,
- short rationale,
- conclusions.

### 3.3 Keep an experiment registry
Maintain a machine-readable ledger, for example:
- `experiments/replay_regime_family/registry.csv` or
- `experiments/replay_regime_family/registry.parquet`

and a human-readable summary:
- `experiments/replay_regime_family/notes.md`

Recommended registry columns:
- `family`
- `model_name`
- `git_sha`
- `timestamp`
- `status` (`planned/running/done/rejected/best`)
- `train_rounds`
- `holdout_rounds`
- `mean_score`
- `median_score`
- `std_score`
- `min_score`
- `max_score`
- `runtime_sec`
- `num_params`
- `features_version`
- `notes`
- `conclusion`

### 3.4 Commit often, push often
Every time you:
- add a new model,
- add a new dataset transformation,
- add a new benchmark result,
- find a new best score,
- validate or reject a key hypothesis,

make a commit and push to the remote branch.

Do not accumulate giant uncommitted changes.

If you discover a new best model, make a clear commit and push immediately.

### 3.5 Code must be performant
Performance is not optional. Slow code kills iteration.

Rules:
- Avoid repeated replay parsing.
- Cache all expensive derived features.
- Use vectorization where possible.
- Use sparse graph representations for settlement interactions.
- Avoid Python loops over cells or settlement pairs when a batched/sparse implementation exists.
- Precompute static geometry features once.
- Separate expensive teacher training from cheap student/distilled backtests.
- Make data pipelines incremental and resumable.

### 3.6 The family must be explored systematically
Do not randomly bounce between ideas. Structure the family as axes of variation and sweep them deliberately.

For each family, define:
- core hypothesis,
- axes of variation,
- order of escalation,
- stopping criteria per subfamily,
- benchmark protocol.

## 4. Recommended Experiment Structure

Use a directory structure like:

```text
experiments/
  replay_regime_family/
    registry.csv
    notes.md
    best_models.md
    failed_hypotheses.md
    summaries/
    plots/
    tables/
```

And for model code / configs:

```text
models/
  replay_regime_family/
    <model_name>/
```

If the framework prefers a different structure, adapt to it, but preserve the same logical separation.

## 5. Standard Iteration Loop

For every hypothesis or model revision, follow this loop:

1. **State the hypothesis explicitly**.
2. **Define the falsification test**.
3. **Implement the smallest valid version**.
4. **Backtest on historical rounds**.
5. **Run ablations**.
6. **Record results in the registry**.
7. **Update findings docs**.
8. **Commit and push**.
9. **Decide whether to scale, pivot, or reject**.

No silent experiments. No memory-only conclusions.

## 6. Backtesting Discipline

Because rounds are the true unit of independence, do **not** validate by random trajectory split if that leaks round identity.

Use round-level splits:
- leave-one-round-out,
- rolling holdout,
- repeated train/holdout folds with entire rounds held out.

Every reported model score should identify exactly which round split was used.

## 7. Required Outputs At All Times

Keep the following files current:

1. `best_models.md` — ranked table of best models and why they are best.
2. `failed_hypotheses.md` — explicit list of hypotheses that failed and why.
3. `replay_regime_family_findings.md` — verified scientific findings about the world dynamics.
4. `next_steps.md` — the next prioritized experiments.

## 8. Coding Principles

- Prefer clean, modular, composable code.
- Prefer typed APIs and explicit dataclasses / config objects when the framework supports them.
- Prefer deterministic seeds in offline training where useful.
- Never bury important hyperparameters in code.
- Put every model variant behind a clearly named config/model entry.
- Write the fastest code you can without making it opaque.
- If you need a heavy model, first build a smaller but structurally similar version for iteration speed.

## 9. Final Attitude

Be scientific, not merely creative.

The job is to:
- discover structure,
- reject bad assumptions quickly,
- use the framework efficiently,
- converge on the strongest models,
- and leave a clean trail that others can reproduce.

---

# Part II — Family-Specific Instructions: Replay-Rich Regime-Manifold Grey-Box Approach

## 10. Core Thesis Of This Family

This family assumes the following asymmetry:

- You have **rich historical replay data** with full yearly trajectories and full settlement state.
- You have **limited numbers of independent rounds**.
- In live rounds, you still only get **50 stochastic year-50 partial queries**.

Therefore the best strategy is:

1. Learn a **shared world-dynamics family** offline from replay.
2. Learn a **very small latent manifold** of how one round differs from another.
3. In the live round, infer only the current round’s latent regime from the 50 terminal viewport observations.
4. Convert that posterior into the final year-50 probability tensor.

This family is not trying to memorize endpoints directly. It is trying to learn a world model plus a tiny regime manifold.

## 11. What Success Looks Like

The end goal is **not** source-code recovery for its own sake.

The end goal is a model stack that, on held-out historical rounds, does all of the following well:

1. predicts the final per-cell probability tensor with strong benchmark score,
2. generalizes to unseen rounds,
3. remains fast enough for online use,
4. chooses informative queries rather than naive coverage,
5. stays calibrated under KL-based scoring,
6. is robust across round types.

More concretely, the ideal final stack for this family is:

- a **teacher**: rich grey-box stochastic simulator trained offline on replay,
- a **terminal decoder**: fast map+regime to year-50 tensor model,
- a **student posterior model**: map+query transcript to regime posterior,
- a **query policy**: selects windows that reduce uncertainty where the score cares,
- a **calibrated ensemble**: combines teacher-derived and semimechanistic baselines.

## 12. The Most Important Thing To Figure Out First

The single most important early question is:

> **After conditioning on state and local/relational mechanics, is cross-round variation low-dimensional?**

This is the hinge question for the whole family.

If the answer is yes, the regime-manifold approach is right.
If the answer is no, then either:
- the round law is too rich for a tiny latent, or
- your state summaries are wrong / incomplete.

### Why this comes first

You may have thousands of trajectories, but they are nested inside only ~30 independent rounds. That means you can learn each round’s internal stochasticity very well, but you cannot support a high-dimensional round manifold.

So before building a large model, you must build the empirical evidence that a small round latent is justified.

### The exact first artifact

Do **not** start by training the final neural world model.

Start by building a **replay-derived event and transition dataset**, then fitting **round-specific effective summary models**. From those summaries, test whether cross-round variation is low-rank / clustered / compressible.

That is the first serious artifact.

## 13. The Full Iteration Loop For This Family

The correct scientific loop for this family is:

1. **Replay ingestion and canonical state construction**
2. **Event extraction and yearly delta tables**
3. **Hypothesis-driven replay diagnostics**
4. **Round-specific effective summary models**
5. **Cross-round factorization into latent regime manifold**
6. **Semimechanistic mixed-effects baseline**
7. **Grey-box teacher simulator**
8. **Fast terminal decoder distillation**
9. **Online student posterior model**
10. **Offline-trained query policy**
11. **Ensembling and calibration**
12. **Repeated falsification + backtesting + documentation**

Every loop through the family should refine one or more of:
- state representation,
- event extraction,
- regime manifold,
- dynamics kernel,
- posterior inference,
- query policy,
- calibration.

---

# 14. Ground Truth About The Data Geometry

Assume approximately:
- 30 distinct historical rounds,
- 5 maps per round,
- 5000 realized trajectories total,
- 50 yearly transitions per trajectory.

That gives roughly 250,000 year-to-year transitions overall, but only ~30 independent round laws.

This has a strong consequence:

- **within-round dynamics** can be modeled with moderate richness,
- **between-round variation** must be heavily regularized, low-rank, or mixture-structured.

Do not let a large neural latent exploit the illusion of large sample size. The number of *independent regimes* is what controls latent dimension.

---

# 15. Core Modeling Hypotheses To Test

Below are the main hypotheses that define this family. Each one needs an explicit replay-based test.

## H1. The observed replay state is close to Markov

Hypothesis:
- The next yearly state is largely predictable from the current observed state.
- If not, only a **small hidden memory** is required.

Why it matters:
- If true, use a near-observed state-space model.
- If false, a heavier latent dynamical model is required.

Test:
1. Fit one-step predictors for a representative set of next-state targets from:
   - current state only,
   - current state + previous state,
   - current state + learned hidden memory.
2. Compare predictive log-loss / event AUC / regression error.

Interpretation:
- Small gain from including past state => observed state is nearly Markov.
- Large gain => hidden memory needed.

Important nuance:
- The mechanics docs mention internal tech level and longship ownership. If replay omits those, hidden memory is expected.

## H2. Cross-round variation is low-rank after the right summary

Hypothesis:
- If each round is summarized by effective hazards / transition coefficients, those summaries lie near a low-dimensional manifold.

Why it matters:
- This is the key justification for a small round latent.

Test:
1. Fit round-specific effective summary models.
2. Stack the summary coefficients by round.
3. Run PCA / factor analysis / low-rank regression / mixture factor models.
4. Measure explained variance and held-out predictive utility.

Interpretation:
- 2–8 latent dimensions explain most round variation => regime manifold is plausible.
- Need dozens of dimensions => family likely too broad or summaries are poor.

## H3. Round variation decomposes into a small number of interpretable mechanism families

Hypothesis:
- Some round differences mostly affect growth/expansion,
- some mostly affect conflict/owner dynamics,
- some mostly affect trade/portization,
- some mostly affect winter/common shocks,
- some mostly affect ruin persistence/reclamation.

Why it matters:
- Supports block-structured latent modulation.

Test:
- Examine how round-specific summary coefficients co-vary across mechanism groups.
- Compare block-structured latent models vs fully dense low-rank models.

## H4. Winter / global stress behaves like a common yearly shock

Hypothesis:
- There is a per-year common latent factor that synchronizes food or collapse dynamics across settlements.

Why it matters:
- This changes the noise model.

Test:
- Compute same-year cross-settlement covariance of food/wealth/population deltas after controlling for local features.
- Look for strong shared factors by year.

Interpretation:
- Strong residual same-year covariance => include yearly global shock variable.

## H5. Trade and raids are sparse graph interactions, not dense global interactions

Hypothesis:
- Each settlement interacts with a relatively sparse set of reachable others.

Why it matters:
- Sparse graph message passing will be much more efficient and better biased than dense attention.

Test:
- Fit pairwise residual interaction models using candidate edge sets defined by geography.
- Examine whether predictive gains saturate with small top-k reachable neighbors.

## H6. Ports are a topological transition, not just another categorical label

Hypothesis:
- Port status changes the interaction graph qualitatively by enabling maritime edges.

Why it matters:
- Portization should modulate graph structure, not only output labels.

Test:
- Compare predictive utility of models that treat port as just a cell category vs a graph-topology modifier.

## H7. Owner dynamics must be permutation-invariant

Hypothesis:
- Only owner equivalence relations and owner-region geometry matter, not raw numeric owner IDs.

Why it matters:
- Prevents learning garbage embeddings of arbitrary labels.

Test:
- Randomly permute owner IDs per replay and ensure model predictions are invariant or equivalent.

## H8. Full-map coverage is not the right live query objective

Hypothesis:
- With a strong offline teacher, live queries should primarily identify the round regime, not tile the whole map.

Why it matters:
- Changes query policy from coverage to posterior uncertainty reduction.

Test:
- Compare coverage-based policies against posterior-disambiguation policies in historical benchmark.

---

# 16. Data Engineering: What To Build First

## 16.1 Canonical replay schema

Create a canonical replay dataset with at least the following tables.

### `rounds`
- round_id
- round_index
- metadata if available

### `maps`
- round_id
- seed_index
- width
- height
- initial_grid
- static geometry features (cached separately if large)

### `states`
- round_id
- seed_index
- traj_id
- year
- grid_state (compressed representation)

### `settlements`
- round_id
- seed_index
- traj_id
- year
- cell_id or (x,y)
- population
- food
- wealth
- defense
- has_port
- alive
- owner_id
- any hidden-memory proxy columns you derive

### `events`
- round_id
- seed_index
- traj_id
- year
- event_type
- subject_cell / subject_settlement
- target_cell / target_settlement if applicable
- event-specific covariates / context

### `query_emulation`
Optional derived table for fast synthetic online episodes.

## 16.2 Event extraction

Build deterministic event extraction from consecutive yearly states:
- settlement birth at a cell,
- settlement death/collapse,
- port appearance/disappearance,
- owner switch,
- ruin creation,
- ruin rebuild,
- ruin reclaim to forest / open,
- resource deltas,
- defense changes,
- frontier movement.

This step must be fast and well tested.

### Pseudocode sketch

```python
for each (round, seed, traj, year t):
    S0 = state[t]
    S1 = state[t+1]

    births = cells where non-settlement -> settlement/port
    deaths = cells where settlement/port -> ruin/open/forest
    port_up = settlements where has_port: 0 -> 1
    owner_switch = active settlements where owner changes
    ruin_create = cells where settlement/port -> ruin
    ruin_rebuild = cells where ruin -> settlement/port
    ruin_reclaim = cells where ruin -> forest/open

    for each active settlement in union(S0, S1):
        compute delta_pop, delta_food, delta_wealth, delta_defense

    write all events and deltas to tables
```

## 16.3 Static geometry feature cache

Precompute once per map seed:
- coast mask,
- ocean adjacency,
- mountain mask,
- forest support counts,
- land connected components,
- sea connected components,
- land geodesic distances,
- maritime reachability summaries,
- fjord depth / coastline curvature / chokepoint scores,
- initial settlement Voronoi-like influence regions,
- nearest-settlement and second-nearest-settlement margins.

This cache should be reused by every model in this family.

---

# 17. The First Major Analytical Phase: Replay Diagnostics

Do not jump straight into heavy models. Spend serious time on diagnostics.

## 17.1 State completeness / Markov tests

Tasks:
- predict next-year cell type from current state,
- predict next-year settlement events from current state,
- compare against models with one-year memory and small hidden memory.

Deliverable:
- report on how much extra memory is needed.

## 17.2 Mechanism locality tests

Tasks:
- quantify how predictive local neighborhoods are for births/collapse,
- quantify what additional long-range graph information adds,
- estimate effective interaction radius on land and sea.

Deliverable:
- recommended local neighborhood size,
- recommended graph edge budget.

## 17.3 Global shock tests

Tasks:
- measure same-year residual covariance in resource/collapse deltas,
- fit one-factor and few-factor yearly latent shock models.

Deliverable:
- recommendation on whether to include yearly common-shock latent.

## 17.4 Owner dynamics tests

Tasks:
- quantify owner switch frequency,
- test whether local frontier geometry predicts switch,
- ensure owner-id permutation invariance in all derived features.

Deliverable:
- owner representation design.

## 17.5 Round low-rankness tests

Tasks:
- fit simple round-specific hazard coefficients,
- stack them across rounds,
- test PCA / factor analysis / low-rank reconstruction.

Deliverable:
- recommended latent dimension range.

This diagnostic phase is the **most important first thing**.
If it is done poorly, the entire family will be built on fantasy.

---

# 18. The First Real Model: Semimechanistic Mixed-Effects Hazard Baseline

Build this before the large teacher.

This model should be strong enough to:
- reveal whether the family has promise,
- provide interpretable round summaries,
- serve as an ensemble anchor,
- run fast.

## 18.1 Structure

Use event heads such as:
- birth hazard,
- collapse hazard,
- portization hazard,
- owner-switch hazard,
- ruin rebuild hazard,
- ruin reclaim hazard,
- continuous delta regressions for pop/food/wealth/defense.

Each head should depend on:
- local cell features,
- settlement marks,
- pairwise graph summaries,
- round random effects / latent factors.

Form:

### a) Generalized linear / additive mixed-effects version

\[
\eta_{e} = f_{e,\phi}(x) + b_{e,r}
\]

with \(b_{e,r}\) low-rank or factorized across rounds.

### b) Small neural mixed-effects version

\[
\eta_{e} = g_{e,\phi}(x) + u_e^\top z_r + x^\top W_e z_r.
\]

## 18.2 Why this is the right first model

- it is statistically efficient,
- it respects the event structure revealed by replay,
- it makes round-to-round variation measurable,
- it is much easier to debug than the full teacher.

## 18.3 What to vary exhaustively here

Exhaustive axes:
- local feature richness,
- graph feature richness,
- latent dimension,
- discrete mixture vs continuous-only regime,
- hidden memory or not,
- common yearly shock or not,
- link functions and calibration.

You must sweep these systematically before scaling up.

---

# 19. The Mainline Teacher: Grey-Box Stochastic World Model

After the hazard baseline establishes that the family is viable, build the main teacher.

## 19.1 Teacher state

Use a hybrid state:

\[
X_t = (\text{grid substrate},\ \text{dynamic cell layer},\ \text{settlement objects},\ \text{optional hidden memory}).
\]

### Grid substrate
Static geometry and terrain-derived tensors.

### Dynamic cell layer
Occupancy / ruin / forest / class state per cell, plus optional ruin age etc.

### Settlement object layer
For each active settlement: marks and derived graph features.

### Hidden memory
Small latent state if Markov tests show it is needed.

## 19.2 Teacher transition modules

Use a yearly kernel with two main computational paths.

### Local cell update path
Handles:
- local resource generation / decay,
- nearby founding,
- ruin aging,
- reclaim / rebuild,
- spatially local competition pressure.

### Settlement graph interaction path
Handles:
- trade,
- raids,
- owner competition,
- maritime range effects,
- long-range influence.

### Optional yearly global latent shock
Handles:
- winter or other common-year perturbation.

## 19.3 How round variation enters

Do **not** let the entire network vary by round.

Use **low-rank adapters / FiLM-style modulation / hypernetwork conditioning** on a tiny round latent.

Examples:
- per-module scale/shift conditioned on \(z_r\),
- low-rank weight offsets,
- additive hazard shifts by mechanism block.

Keep this tiny.

## 19.4 Training loss

Use a multi-term objective:

\[
\mathcal L_{teacher}
=
\lambda_1 L_{1-step}
+
\lambda_2 L_{multi-step}
+
\lambda_3 L_{events}
+
\lambda_4 L_{final-tensor}
+
\lambda_5 L_{latent-reg}.
\]

Where:
- `L_1-step`: one-step transition fit,
- `L_multi-step`: rollout consistency,
- `L_events`: extracted-event supervision,
- `L_final-tensor`: alignment to the actual competition target,
- `L_latent-reg`: keeps regime space small.

The final-tensor term is mandatory. Do not let the teacher become a beautiful simulator that misses the actual benchmark objective.

---

# 20. Regime Inference: The Student / Online Posterior Model

The live round still only gives:
- known initial maps,
- 50 stochastic year-50 viewport observations.

So the online problem is not sequence prediction. It is **regime posterior inference**.

## 20.1 Correct formal target

\[
p(z_r \mid M_r, D_r)
\propto
p(z_r) \prod_{i=1}^{n} p(Y_i \mid M_r, A_i, z_r).
\]

Then the final prediction is

\[
\hat P_r
=
\int F_\phi(M_r,z)\, q_\psi(z\mid M_r,D_r)\, dz.
\]

## 20.2 Best student form

Use a set-based or recurrent transcript encoder.

Each observation is a tuple:
- viewport metadata,
- observed grid patch,
- observed settlement list/marks in the patch.

Because each live query is a fresh stochastic run, repeated identical windows are valid replicated samples from the same patch law. The student should exploit that.

Recommended student classes to try:
- Deep Sets transcript encoder,
- Set Transformer transcript encoder,
- particle-based amortized posterior updater,
- summary-statistic MLP baseline.

Do not start with a huge general-purpose sequence transformer.

## 20.3 Best training method

Generate synthetic active-round episodes from historical replay / teacher simulation:
- hide everything except the initial map,
- sample 50 query windows according to a candidate policy,
- reveal only year-50 patches,
- train the student to predict the teacher regime or the final tensor.

Train against:
- posterior distillation loss,
- final tensor KL loss,
- calibration loss if needed.

---

# 21. Query Policy

A weak team will tile the map.
A strong team will identify the regime.

The initial map is known for the live round. The main uncertainty is the current round law. So query value comes from how much the observation helps infer \(z_r\) and reduce final tensor uncertainty in high-score cells.

## 21.1 The right objective

Approximate:

\[
A^* = \arg\max_A \mathbb E_{Y}
\left[
\Delta \mathbb E[-L_{score}(\hat P, P)]
\right].
\]

In practice, use proxies such as:
- predictive information gain about \(z_r\),
- ensemble disagreement reduction,
- expected reduction in uncertainty on high-entropy final cells,
- expected score improvement from historical simulation.

## 21.2 What to test

Policies to compare:
- full coverage,
- entropy-weighted coverage,
- diagnostic window library,
- posterior-disagreement selection,
- historical-score greedy,
- learned policy.

## 21.3 Policy structure likely to win

Likely best live policy:
1. early diagnostic windows,
2. repeated windows on high-information motifs,
3. late frontier disambiguation.

---

# 22. Ensemble And Calibration

This family should not end with one model.

You should expect the best system to be an ensemble of:
- semimechanistic hazard baseline,
- grey-box teacher / terminal decoder,
- direct student predictor.

Blend them using out-of-fold historical validation.

Because the score is KL-based, overconfidence is expensive. Use conservative calibration:
- temperature scaling,
- class floors where justified,
- mixture with weak priors,
- uncertainty-aware blending.

Do not produce brittle zero probabilities except where support is structurally impossible.

---

# 23. Concrete Experiment Axes To Exhaust

This family is large. Structure the search.

## Axis A: state representation
- grid-only,
- grid + settlement marks,
- grid + settlement marks + hidden memory,
- grid + settlement marks + owner-frontier summaries.

## Axis B: interaction graph
- no graph,
- land-only graph,
- sea-only graph,
- mixed land-sea graph,
- sparse top-k reachability,
- latent learned graph.

## Axis C: round variation model
- no regime latent,
- continuous-only latent,
- discrete-only mixture,
- discrete + continuous,
- block-structured mechanism latent.

## Axis D: stochasticity
- local-only noise,
- local + global yearly shock,
- local + pairwise + global.

## Axis E: hidden memory
- none,
- one-step memory,
- small recurrent hidden state per settlement,
- global hidden state only.

## Axis F: student posterior
- summary-stat baseline,
- Deep Sets,
- Set Transformer,
- particle refinement on top of amortized posterior.

## Axis G: query policy
- coverage,
- entropy-weighted coverage,
- disagreement,
- historical-score greedy,
- learned policy.

## Axis H: calibration / ensemble
- no calibration,
- temperature only,
- floors only,
- temperature + floors,
- blended ensemble.

You do not need to try all Cartesian combinations blindly. Use the experiment registry to stage this.

---

# 24. The First Ten Experiments To Run

These are the highest-priority first experiments.

1. **Replay ETL + event extraction**
   - Produce canonical tables and verify correctness.

2. **Markov sufficiency tests**
   - Current state vs current+previous state vs tiny hidden memory.

3. **Per-round hazard summary fitting**
   - Fit round-specific event/delta models.

4. **Cross-round low-rank analysis**
   - PCA/factor analysis on round summaries.

5. **Winter/global-shock covariance analysis**
   - Check if yearly common shock is real.

6. **Owner-dynamics invariance tests**
   - Ensure no numeric owner-ID leakage.

7. **Semimechanistic mixed-effects baseline**
   - First actual benchmark model.

8. **Student direct posterior baseline**
   - Train on synthetic live episodes from history.

9. **Grey-box teacher small version**
   - Minimal local+graph world model with tiny latent.

10. **Coverage vs diagnostic query policy test**
    - Compare on historical benchmark.

Until those ten are done, do not indulge in giant architectural exploration.

---

# 25. Pseudocode-Level Implementation Guidance

## 25.1 Round summary extraction

```python
def build_round_summaries(replay_dataset):
    summaries = []
    for round_id in replay_dataset.round_ids:
        event_table = replay_dataset.events_for_round(round_id)
        delta_table = replay_dataset.deltas_for_round(round_id)
        geom_table = replay_dataset.geometry_for_round(round_id)

        beta = fit_effective_round_model(
            event_table=event_table,
            delta_table=delta_table,
            geometry=geom_table,
        )
        summaries.append({"round_id": round_id, "beta": beta})
    return summaries
```

## 25.2 Regime manifold fitting

```python
def fit_regime_manifold(round_summaries):
    B = stack_betas(round_summaries)
    low_rank = fit_low_rank_or_mixture(B)
    z = low_rank.transform(B)
    return low_rank, z
```

## 25.3 Teacher training

```python
def train_teacher(train_rounds, manifold_model):
    teacher = build_teacher_model()
    for batch in replay_transition_batches(train_rounds):
        z_r = manifold_model.lookup_or_encode(batch.round_id)
        loss = teacher_loss(batch, z_r)
        optimize(loss)
    return teacher
```

## 25.4 Student training via synthetic episodes

```python
def generate_synthetic_episode(round_id, teacher_or_replay, policy, n_queries=50):
    M = get_initial_maps(round_id)
    D = []
    for _ in range(n_queries):
        A = policy.select(M, D)
        Y = sample_terminal_viewport(round_id, A, teacher_or_replay)
        D.append((A, Y))
    P = get_ground_truth_tensor(round_id)
    return M, D, P
```

```python
def train_student(train_rounds, teacher, policy):
    student = build_student_model()
    for episode in synthetic_episode_stream(train_rounds, teacher, policy):
        M, D, P = episode
        pred = student(M, D)
        loss = final_tensor_loss(pred, P)
        optimize(loss)
    return student
```

## 25.5 Benchmark loop discipline

```python
def run_family_iteration(model_name, notes):
    score = benchmark(model_name)
    update_registry(model_name=model_name, score=score, notes=notes)
    update_findings_if_needed(model_name, score, notes)
    git_commit_and_push_if_warranted(model_name, score, notes)
```

---

# 26. Common Failure Modes To Avoid

1. **Confusing path count with regime count**
   - 5000 trajectories is not 5000 independent round laws.

2. **Using random trajectory splits for validation**
   - This leaks round identity and gives fake confidence.

3. **Using a high-dimensional round latent**
   - You will overfit ~30 rounds.

4. **Treating owner_id as numeric**
   - Wrong inductive bias.

5. **Skipping the replay diagnostics**
   - Then your big model is built on guesses.

6. **Optimizing only one-step likelihood**
   - The benchmark is on the final tensor.

7. **Ignoring calibration**
   - KL-based scoring punishes brittle confidence.

8. **Assuming full map coverage is the optimal query policy**
   - The online task is regime identification, not cartography.

9. **Building the giant teacher before the hazard summaries**
   - This is backwards.

10. **Not documenting failed hypotheses**
   - Leads to repeated dead-end exploration.

---

# 27. Expected Best-In-Class Final Stack

If this family succeeds, the eventual best stack will probably look like:

1. **Replay ETL / event extraction layer**
2. **Round summary / regime manifold layer**
3. **Grey-box teacher simulator**
4. **Fast terminal decoder**
5. **Amortized student posterior**
6. **Diagnostic query policy**
7. **Calibrated ensemble over teacher / hazard / student outputs**

That is the end goal.

It is not one model. It is a system.

---

# 28. Immediate Orders To The Agent

Start here, in this exact order:

1. Read `docs/game_facts.md`.
2. Build the replay canonical dataset and caches.
3. Build event extraction and verify it carefully.
4. Run Markov sufficiency tests.
5. Fit round-specific effective hazard summaries.
6. Measure low-rankness / clustering of round variation.
7. Write up findings in `docs/replay_regime_family_findings.md`.
8. Implement the semimechanistic mixed-effects benchmark baseline.
9. Benchmark it with unique model name(s).
10. Commit and push.
11. Only then start the grey-box teacher.

At every stage:
- keep the experiment registry updated,
- keep `failed_hypotheses.md` updated,
- commit and push every meaningful result,
- use unique model names,
- and keep code fast.

Do not stop until the family is exhausted.

# Handoff Document: Replay-Rich Regime-Manifold / Grey-Box World-Model Family for Astar Island

