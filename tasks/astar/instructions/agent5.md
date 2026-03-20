# Handoff Document: Grey-Box World-Model Research Program for Astar Island

This document is addressed to an implementation / iteration agent operating inside an existing framework for data loading, offline training, query policy execution, online inference, and historical backtesting.

Your mission is to exhaust the **grey-box stochastic world-model family** for Astar Island. You are not here to implement one model and stop. You are here to run a disciplined, reproducible research program across this family until plausible avenues are exhausted.

The framework already provides a historical benchmark runner:

```bash
uv run astar run-historical-benchmark --model <MODEL_NAME>
```

Assume there is already infrastructure for:
- loading historical rounds and replay data,
- loading official live-query style observations,
- running offline training,
- running benchmark backtests,
- computing score outputs,
- model registration / instantiation by model name.

You must adapt to the framework rather than fight it.

---

# Part I — Generic execution charter (reusable across model families)

This section is intentionally generic and should be reusable for other model-family exploration agents.

## 1. Mission

Your job is to:
1. understand the framework and the game facts,
2. implement clean, fast, reproducible models inside the existing conventions,
3. benchmark relentlessly on held-out rounds,
4. track every meaningful experiment in a reproducible way,
5. commit and push frequently,
6. never stop at the first decent model,
7. continue iterating until the family is genuinely exhausted.

You are judged by:
- benchmark score,
- reliability of benchmark score across held-out rounds,
- reproducibility,
- code cleanliness,
- runtime efficiency,
- quality of scientific reasoning and experiment tracking.

## 2. Non-negotiable first steps

Before changing code, do all of the following:

1. Read `docs/game_facts.md` completely.
2. Inspect the existing framework structure carefully.
3. Find how models are registered / instantiated by name.
4. Find where benchmark outputs are written.
5. Find where existing models store artifacts/checkpoints.
6. Find how train/holdout round splits are configured.
7. Run at least one existing model end-to-end to understand latency and output shape.
8. Create a family-specific working notes file and experiment registry before implementing anything nontrivial.

Do not guess framework behavior if you can inspect it.

## 3. Operating principles

### 3.1 Reproducibility is mandatory

Every experiment must be reproducible from:
- model name,
- config,
- git commit hash,
- benchmark command,
- artifact/checkpoint path,
- random seed(s),
- train/holdout split identifier.

If a score cannot be reproduced later, treat the experiment as invalid.

### 3.2 Frequent commits and pushes are mandatory

Every time you:
- add a new model family member,
- introduce a new significant ablation,
- get a new best score,
- fix a serious bug,
- add a major analysis artifact,

you must:
1. commit,
2. push to remote branch.

Do not batch many unrelated experiments into one giant commit.

### 3.3 Keep a permanent experiment registry

Create and maintain a **machine-readable** registry and a **human-readable** summary.

Recommended:
- `experiments/<family_name>/registry.jsonl` (append-only)
- `experiments/<family_name>/leaderboard.md`
- `experiments/<family_name>/notes.md`

Each registry entry should include at least:
- timestamp,
- model name,
- git commit hash,
- parent model / base model,
- short description,
- hypothesis tested,
- train rounds,
- holdout rounds,
- score summary,
- runtime summary,
- artifact path,
- whether kept / rejected,
- why.

Never rely on memory.

### 3.4 Model naming must be explicit and granular

Every materially distinct model/config must have a distinct model name.

Model names should encode family + version + main choice.

Recommended pattern:

```text
greybox_<subfamily>_<majoridea>_<variant>_<vNN>
```

Examples:
- `greybox_hazard_markov_v01`
- `greybox_hybrid_phasefactored_v03`
- `greybox_teacher_student_lora_z6_v11`
- `greybox_queryinfo_diagrepeat_v04`

The model name must be enough to re-run the benchmark exactly.

### 3.5 Performance matters

Slow code kills iteration speed and therefore research quality.

You must write:
- vectorized code where possible,
- cache-heavy code where sensible,
- low-overhead dataloaders,
- minimal Python loops in hot paths,
- batched rollout code,
- fast feature precomputation,
- compact serialization,
- simple and robust configs.

If two designs are similar in score and one is dramatically faster, prefer the faster one.

### 3.6 Statistical hygiene matters

The unit of generalization is the **round**, not the replay path.

Never claim success from path-level splits that leak round identity.

All serious decisions must be validated by **held-out rounds**.

## 4. What to track for every serious experiment

For each experiment, explicitly record:

1. What hypothesis is being tested?
2. What changed from the previous best model?
3. Why should this help?
4. What metric determines success or failure?
5. What is the runtime cost?
6. What did the result imply about the family?
7. Should the change be kept, reverted, or conditionally retained?

This is not bureaucracy. This is how you avoid repeating dead ends.

## 5. Benchmark discipline

The benchmark runner already exists. Use it constantly.

At minimum, each serious model iteration should have:
- one quick sanity benchmark on a small round subset,
- one proper historical benchmark on the designated split,
- if promising, one more benchmark on alternate held-out rounds.

Do not over-train or over-tune to a single holdout round.

Maintain a small set of standard benchmark protocols, for example:
- `quick_debug_split`
- `main_cv_split_A`
- `main_cv_split_B`
- `late_round_split`
- `stress_split_sparse`

If the framework does not already formalize split names, formalize them yourself within its conventions.

## 6. Code-quality requirements

All code must be:
- readable,
- typed where practical,
- modular,
- benchmarkable,
- loggable,
- testable,
- aligned with framework conventions.

Avoid:
- giant single files,
- hidden state mutation,
- silent fallbacks,
- duplicated feature computation,
- excessive coupling between model training and benchmark code,
- unversioned configs.

## 7. Failure handling

When a model fails badly, do not just move on. Categorize failure:
- data bug,
- feature bug,
- optimization instability,
- rollout drift,
- calibration failure,
- cross-round overfit,
- inference bottleneck,
- policy mismatch,
- speed bottleneck.

Write the diagnosis down.

## 8. Stop condition for a family

Do **not** stop because one model is decent.

Stop only when:
- all major subfamilies within this family have been tried,
- obvious ablations are exhausted,
- student / teacher / policy variants have all been stress-tested,
- the score improvements plateau across multiple serious attempts,
- the registry clearly documents which branches failed and why,
- remaining ideas are genuinely low-priority relative to other families.

Until then, keep going.

---

# Part II — Family-specific brief: grey-box stochastic world-model family

This section is specific to the current family.

## 1. Core framing of the problem

For this family, think of Astar Island as:
- a repeated stochastic world simulator,
- with stable broad mechanics across rounds,
- with round-specific latent regime variation,
- rich historical replay access,
- tiny online inference budget.

The central asymmetry is:
- **many replay paths per historical round**,
- but only **~30 distinct rounds**.

So the right decomposition is:

- shared rich dynamics = learnable,
- cross-round regime manifold = must be tiny,
- online adaptation = must infer only that tiny regime from 50 legal terminal-window observations.

This means the model family should aim for:
1. a strong shared teacher world model,
2. a small round latent / low-rank random effects,
3. a fast student for online inference,
4. a benchmark-trained query policy.

## 2. Conceptual end goal

The end goal is **not** source-code recovery.
It is **not** just next-step replay fit.
It is **not** just year-50 tensor fit.

The end goal is a deployed predictive engine that, on a new round, does this:

1. reads the 5 known initial maps,
2. chooses 50 queries intelligently,
3. infers the current round regime from those query results,
4. outputs calibrated year-50 tensors for all 5 seeds,
5. scores extremely well in held-out-round backtests.

Mathematically, the deployed object is:

```text
posterior over current round regime  +  fast terminal decoder  ->  final tensor prediction
```

or approximately:

\[
\hat P_r = \mathbb E_{z \sim q_\psi(z \mid M_r, D_r)} [F_\phi(M_r, z)].
\]

Where:
- `M_r`: initial maps for round `r`,
- `D_r`: legal online query transcript,
- `q_psi`: fast online inference model,
- `F_phi`: teacher-derived fast terminal decoder.

## 3. High-level scientific questions for this family

This family should answer the following, in order.

### 3.1 Is the observed yearly replay state close to a sufficient predictive state?

This is the first major question.

If yes, the teacher can be a nearly observed transition model.
If no, it needs latent settlement memory and/or global hidden yearly shocks.

### 3.2 How much of cross-round variation is low-rank?

This is the second major question.

If a tiny latent `z_r` explains most between-round differences, this family is ideal.
If not, the family may still work, but only with stronger per-round adaptation or a richer discrete-mixture regime model.

### 3.3 Which topologies matter?

Need to quantify the importance of:
- local grid neighborhood,
- land connectivity,
- maritime connectivity,
- faction structure,
- global yearly shocks.

### 3.4 How much of the simulator can be captured by semimechanistic event structure?

If hazards and structured event heads capture most signal, the model should stay relatively interpretable.
If not, more neural flexibility is needed in the transition modules.

### 3.5 Can a student trained on legal synthetic episodes recover the teacher’s regime well enough online?

If yes, the family is deployable.
If no, the teacher may be too complex, the latent may be poorly identified, or the query policy may be weak.

---

# Part III — The full exploration and iteration program

## Phase 0 — Ground truth about the framework and facts

### Objective
Establish a reliable base before doing any science.

### Required actions
1. Read `docs/game_facts.md` fully.
2. Inspect how replay data are stored / loaded.
3. Inspect how active-round query data are represented in the framework.
4. Inspect how model registration works.
5. Inspect benchmark output format and metrics.
6. Inspect where artifacts/checkpoints/logs should go.
7. Find at least one existing working model and run it end-to-end.

### Deliverables
- short framework map,
- notes on data schemas,
- notes on benchmark expectations,
- notes on performance bottlenecks.

### Verification
- can run an existing model end-to-end,
- can locate artifacts and score outputs,
- can instantiate a no-op or dummy model by new model name.

---

## Phase 1 — Canonical replay ingestion and event extraction

### Objective
Create a trusted state/event dataset that everything else can use.

### Why this is the first real task
If replay parsing or event extraction is wrong, every downstream model will learn nonsense.

### Required actions
1. Implement a canonical typed representation for yearly replay state.
2. Implement settlement identity tracking across adjacent years if needed.
3. Implement event extraction for at least:
   - settlement birth/founding,
   - port conversion,
   - owner switch,
   - collapse to ruin,
   - ruin rebuild,
   - ruin-to-forest reclaim,
   - yearly deltas in population/food/wealth/defense,
   - faction births/deaths/size changes.
4. Store extracted per-round summaries and per-transition event tables.
5. Cache aggressively.

### Suggested data products
- `round_state_sequences.parquet`
- `transition_events.parquet`
- `round_summary_stats.parquet`
- `state_index_cache.pkl`
- `geography_features.parquet`

### Verification
- accounting identities hold between yearly states and extracted events,
- manual replay spot checks match extracted events,
- no silent mismatches in settlement identity tracking,
- repeated extraction is deterministic.

### Pseudocode sketch

```python
for round in historical_rounds:
    for seed in round.seeds:
        paths = load_replay_paths(round, seed)
        for path in paths:
            states = canonicalize_states(path)
            tracked_states = track_settlement_identity(states)
            events = extract_transition_events(tracked_states)
            save(states, events)
```

---

## Phase 2 — Exploratory variance decomposition

### Objective
Quantify where the signal actually lives.

### Required actions
For many summary targets, decompose variation into:
- between-round,
- between-seed-within-round,
- within-seed stochastic path noise.

Example summaries:
- year-50 live settlement count,
- year-50 port count,
- year-50 ruin count,
- year-50 forest reclaim count,
- survival fraction of initial settlements,
- expansion radius,
- average food,
- average wealth,
- average defense,
- owner fragmentation,
- time-to-first-port,
- mean ruin lifetime.

### Why it matters
This tells you:
- how much information is already in geometry,
- how much current-round inference actually matters,
- how many latent regime dimensions might be justifiable.

### Verification
- produce plots/tables of variance shares,
- verify stability of conclusions across multiple summary families,
- archive the analysis.

### Decision criterion
If between-round variation is tiny for most summaries, keep `z_r` minimal.
If between-round variation is meaningful but low-rank, this family is ideal.

---

## Phase 3 — State sufficiency tests

### Objective
Determine whether replay state is near-Markov or requires latent memory.

### Required actions
Train nested models:
1. `M1`: predict `X_{t+1}` from `X_t` only.
2. `M2`: predict `X_{t+1}` from `(X_t, X_{t-1})`.
3. `M3`: predict `X_{t+1}` from `X_t` plus small hidden memory.
4. `M4`: add year-level random effect / global shock.

Evaluate on held-out rounds.

### What to compare
- next-step likelihood,
- event prediction calibration,
- short rollout quality,
- long rollout drift.

### Interpretation
- If `M2` barely helps over `M1`, observed state is near-Markov.
- If `M3` helps, hidden latent state matters.
- If `M4` helps, global yearly shocks matter.

### This is the most important scientific test early on
Do not skip it.

---

## Phase 4 — Topology ablations

### Objective
Learn which relational structures are truly necessary.

### Required actions
Run nested transition models with:
1. local-grid only,
2. local + land graph,
3. local + land + sea graph,
4. local + land + sea + faction pooling,
5. add global yearly shock.

### Evaluate on held-out rounds
Metrics:
- one-step fit,
- event fit,
- rollout fit,
- year-50 tensor fit.

### Output
A ranked table of topology importance by target family.

### Decision criterion
Whatever is consistently useful on held-out rounds becomes mandatory in the teacher.

---

## Phase 5 — Per-round effective-law estimation

### Objective
Estimate each historical round’s effective transition law before fitting one big cross-round model.

### Why this is critical
You have many paths per round but few rounds total. Exploit that asymmetry.

### Required actions
For each round, fit a semimechanistic effective model:
- event hazards,
- resource update laws,
- global shock behavior,
- maritime sensitivity,
- collapse/rebuild/reclaim parameters,
- faction-change summaries.

These do **not** need to be the final deployed model. They are the per-round fingerprints.

### Suggested form
For discrete events:
```text
logit P(event | features) = baseline(features) + round-specific coefficients
```

For continuous updates:
```text
delta = baseline(features) + round-specific coefficients + shock + noise
```

### Deliverables
- one effective-law summary per round,
- uncertainty estimates for those summaries,
- plots showing round-to-round variation.

### Verification
- can fit each round accurately,
- summaries are stable under replay subsampling,
- per-round summaries predict held-out paths from the same round reasonably well.

---

## Phase 6 — Compress round fingerprints into a regime manifold

### Objective
Define the round latent empirically.

### Required actions
Take the fitted round fingerprints `beta_r` and factorize them across rounds.
Try multiple forms:
- PCA / low-rank factorization,
- discrete mixture + low-rank residual,
- nonlinear but tiny latent autoencoding,
- hierarchical Bayesian random effects.

### Strong prior recommendation
Prefer:
- very small continuous latent,
- maybe plus a tiny discrete regime ID,
- strong shrinkage / regularization.

### Suggested forms
```text
beta_r ≈ beta_0 + B z_r
```

or

```text
beta_r ≈ beta_0 + B_{m_r} u_r
```
with small discrete mode `m_r` and small continuous `u_r`.

### Verification
- held-out-round reconstruction of `beta_r`,
- held-out-round prediction of year-50 summaries using only inferred latent,
- sensitivity to latent dimensionality.

### Hard rule
Do not let `z_r` become large. With ~30 rounds, it must be tiny unless evidence overwhelmingly justifies more.

---

## Phase 7 — Build the teacher world model

### Objective
Implement the main grey-box stochastic teacher.

### Recommended teacher state
- static terrain/geography features,
- dynamic cell field,
- settlement table,
- faction pooled state,
- small hidden settlement memory,
- year-level global shock,
- low-dimensional round regime latent.

### Recommended teacher architecture
- terrain encoder (cached),
- local grid update blocks,
- land-graph message passing,
- sea-graph message passing,
- faction pooling / broadcasting,
- low-rank round modulation on transition heads,
- stochastic event heads and continuous update heads,
- optional phase-factored yearly modules.

### Required outputs
At minimum the teacher must support:
- next-state simulation,
- rollout simulation,
- derived year-50 tensor production,
- teacher posterior / regime code on historical rounds.

### Training objectives
Use a multi-term objective:
- 1-step transition loss,
- short rollout loss,
- event supervision loss,
- year-50 tensor loss,
- latent regularization / shrinkage loss.

### Verification
Teacher is acceptable only if it passes all of:
- strong held-out-round 1-step fit,
- stable rollouts,
- good year-50 tensor score on held-out rounds,
- reasonable calibration,
- acceptable runtime.

---

## Phase 8 — Distill the legal online student

### Objective
Build the model that actually runs in active-round-like conditions.

### Student input
- initial maps for the 5 seeds,
- up to 50 legal terminal-window query results.

### Student output
One or both of:
- posterior over round latent `z_r`,
- direct final tensor prediction.

### Preferred student architecture
- set-based / order-invariant transcript encoder,
- explicit handling of repeated queries to the same window,
- optional amortized posterior head for `z_r`,
- direct terminal tensor head for speed and robustness.

### Training procedure
Generate synthetic online episodes from historical rounds:
- choose a historical round,
- restrict observables to the legal active-round interface,
- simulate query sequences,
- train student to match teacher posterior and/or true final tensor.

### Verification
Held-out-round closed-loop benchmark:
- fixed query budget,
- legal interface only,
- student score compared to teacher oracle and baseline models.

---

## Phase 9 — Query policy learning

### Objective
Exploit the teacher/student to choose informative queries online.

### Important conceptual point
The initial map is already known.
So online query selection is **not** about map coverage.
It is about:
- reducing uncertainty about the current round regime,
- reducing score-relevant uncertainty in year-50 tensor predictions.

### Candidate policy families
1. heuristic motif policy,
2. expected information gain on `z_r`,
3. expected score-improvement policy,
4. learned policy network trained offline.

### Suggested progression
- start with heuristics + posterior disagreement,
- move to offline-trained policy only after student is reliable.

### Verification
Compare policies on held-out rounds under identical student/teacher stacks.
Judge only by final score and runtime.

---

## Phase 10 — Ensemble, calibration, and robustness

### Objective
Reduce misspecification risk.

### Ensemble members to consider
- semimechanistic hazard baseline,
- full grey-box teacher/student stack,
- lighter Markov baseline,
- direct tensor student.

### Why ensemble
KL-based scoring punishes unjustified certainty. Diverse but sensible models can help avoid catastrophic overconfidence.

### Calibration tools
- probability floor / smoothing,
- temperature scaling or Dirichlet-style calibration,
- per-class or per-region calibration,
- mixture-weight tuning on held-out rounds.

### Verification
- improved held-out score,
- improved calibration under held-out rounds,
- no large runtime explosion.

---

# Part IV — Concrete hypotheses to test and how to verify them

Below is a non-exhaustive but high-priority hypothesis list. Treat this as the structured scientific agenda.

## H1. Observed yearly replay state is almost Markov-sufficient

### Test
Compare `X_t -> X_{t+1}` versus `(X_t, X_{t-1}) -> X_{t+1}` versus `X_t + latent memory -> X_{t+1}`.

### Accept if
Adding previous state or latent memory gives negligible held-out-round gain.

### Reject if
Those additions improve event fit / rollout stability materially.

## H2. There is a meaningful global yearly shock component

### Test
After conditioning on local + relational features, check residual synchronization across settlements in the same year. Compare models with and without year-level latent `g_t`.

### Accept if
Global shock improves held-out-round fit and calibration.

## H3. Maritime graph structure is essential

### Test
Ablate sea-graph modules and port-specific relational features.

### Accept if
Removing them clearly hurts port, raid, trade, and year-50 predictions.

## H4. Faction-level structure matters beyond owner equality at the pairwise level

### Test
Compare pairwise same-owner features versus explicit faction pooling/state.

### Accept if
Faction pooling improves owner-switch prediction, conflict fit, or year-50 results.

## H5. Cross-round variation is low-rank

### Test
Fit per-round laws and factorize them. Measure held-out-round reconstruction and downstream predictive utility as latent dimension grows.

### Accept if
Very low-dimensional latent explains most usable variation.

## H6. A small discrete mixture over regime families helps

### Test
Compare pure continuous latent vs discrete+continuous regime model.

### Accept if
Mixture improves held-out-round robustness and online inference.

## H7. Phase-factored teacher beats monolithic yearly kernel

### Test
Compare phase-factored vs monolithic yearly transition module.

### Accept if
Phase factorization improves sample efficiency, generalization, or interpretability without hurting runtime too much.

## H8. Event-structured supervision helps the teacher

### Test
Teacher with and without explicit event heads.

### Accept if
Event heads improve calibration and rollout quality.

## H9. Direct student head helps beyond posterior-only inference

### Test
Student predicts only `z_r` vs `z_r` + direct tensor head.

### Accept if
Hybrid student gives better online score or robustness.

## H10. Repeated diagnostic queries beat simple coverage under a strong student

### Test
Coverage-heavy policy vs posterior-aware repeated-window policy.

### Accept if
Held-out-round online score improves.

---

# Part V — Recommended order of model implementations

This is the order I recommend. Do not jump directly to the fanciest teacher.

## Stage A — Cheap scientific baselines

Implement first:
1. replay/event extraction pipeline,
2. per-round summary statistics and variance decomposition,
3. simple state-sufficiency tests,
4. semimechanistic per-round hazard summaries.

Goal: understand the data and the rank structure.

## Stage B — Minimal serious models

Implement next:
1. local Markov baseline,
2. local + graph baseline,
3. low-rank round effect on hazard summaries,
4. simple terminal decoder from map + latent.

Goal: establish the irreducible minimum complexity.

## Stage C — Teacher v1

Implement first real teacher:
- hybrid grid/graph transition model,
- no large latent,
- maybe minimal hidden memory,
- year-level shock,
- event heads.

Goal: get stable rollouts and strong year-50 fit.

## Stage D — Student v1

Implement first legal online student:
- transcript encoder,
- posterior over small regime latent,
- teacher decoder reuse.

Goal: strong held-out-round online benchmark.

## Stage E — Policy v1

Implement first posterior-aware query policy.

Goal: beat coverage heuristics.

## Stage F — Teacher v2 / v3 refinements

Then iterate on:
- phase factorization,
- discrete regime mixture,
- richer faction modeling,
- better hidden memory,
- ensemble and calibration.

---

# Part VI — Experiment organization and record-keeping specific to this family

## 1. Directory layout recommendation

Create a dedicated family directory, e.g.

```text
experiments/greybox_worldmodel/
  registry.jsonl
  leaderboard.md
  notes.md
  splits/
  analyses/
  figures/
  configs/
```

## 2. Required metadata fields for registry entries

Each entry should include at least:
- `timestamp`
- `model_name`
- `git_commit`
- `parent_model`
- `family`
- `subfamily`
- `hypothesis`
- `dataset_version`
- `split_name`
- `train_rounds`
- `holdout_rounds`
- `score_mean`
- `score_std`
- `score_by_round`
- `runtime_total`
- `runtime_per_round`
- `artifact_path`
- `status` (`keep` / `reject` / `needs_more_testing`)
- `notes`

## 3. Notes discipline

For every serious experiment, write:
- what changed,
- why,
- what happened,
- what it implies.

Prefer short but precise notes over vague commentary.

## 4. Commit discipline

Suggested commit message style:

```text
[greybox] add per-round hazard summary extraction v01
[greybox] benchmark local+sea graph baseline on split_A
[greybox] add hidden settlement memory ablation v03
[greybox] best-so-far: teacher_student_z4_phasefactored_v07
```

Push every serious change.

---

# Part VII — Performance engineering instructions

This family can become slow quickly. You must keep it fast.

## 1. Precompute everything static

Precompute and cache:
- terrain embeddings,
- coast masks,
- land/sea geodesics,
- fjord / basin / chokepoint features,
- candidate interaction edges,
- per-cell static feature tensors.

## 2. Vectorize replay ingestion and event extraction

Do not repeatedly scan Python objects in inner loops if you can flatten them into arrays / tensors / Arrow / Parquet tables.

## 3. Separate heavy preprocessing from training

Preprocess once.
Serialize compactly.
Train from precomputed tensors/features/events.

## 4. Keep teacher rollouts batched

Batch across seeds, trajectories, and time windows when feasible.

## 5. Keep student extremely lightweight

The student must be cheap enough to run many times during benchmark loops.

## 6. Avoid giant hidden states

If a model needs a huge hidden state to fit, first assume the representation is wrong.

## 7. Use coarse-to-fine experimentation

Start with small/debug splits and reduced replay counts.
Only escalate to full historical benchmarks when an idea survives quick checks.

---

# Part VIII — Pseudocode sketches

## 1. Per-round hazard summary fitting

```python
def fit_round_effective_law(round_data):
    # round_data contains many replay paths for all 5 seeds in one round
    events = round_data.events
    state_features = round_data.state_features

    beta = {}
    beta["birth"] = fit_discrete_hazard(events.birth, state_features.birth_features)
    beta["port"] = fit_discrete_hazard(events.port, state_features.port_features)
    beta["owner_switch"] = fit_discrete_hazard(events.owner_switch, state_features.owner_features)
    beta["collapse"] = fit_discrete_hazard(events.collapse, state_features.collapse_features)
    beta["rebuild"] = fit_discrete_hazard(events.rebuild, state_features.rebuild_features)
    beta["reclaim"] = fit_discrete_hazard(events.reclaim, state_features.reclaim_features)

    beta["delta_population"] = fit_continuous_update(events.delta_population, state_features.resource_features)
    beta["delta_food"] = fit_continuous_update(events.delta_food, state_features.resource_features)
    beta["delta_wealth"] = fit_continuous_update(events.delta_wealth, state_features.resource_features)
    beta["delta_defense"] = fit_continuous_update(events.delta_defense, state_features.resource_features)

    beta["global_shock"] = fit_year_random_effect(round_data)
    return beta
```

## 2. Cross-round manifold fitting

```python
def fit_round_manifold(betas):
    # betas: dict(round_id -> effective law summary vector)
    summary_matrix = stack_beta_vectors(betas)
    manifold = fit_low_rank_model(summary_matrix)
    # could be PCA, factor model, discrete+continuous mixture, etc.
    return manifold
```

## 3. Teacher training loop

```python
def train_teacher(train_rounds, manifold_model):
    teacher = build_teacher_model()
    for batch in replay_transition_batches(train_rounds):
        x_t, x_tp1, round_id = batch
        z_r = manifold_model.encode_round(round_id)

        losses = teacher.compute_losses(x_t, x_tp1, z_r)
        loss = combine_losses(losses)
        optimize(loss)

    return teacher
```

## 4. Student training on legal synthetic episodes

```python
def train_student(teacher, historical_rounds, query_policy_sampler):
    student = build_student_model()
    for episode in synthetic_active_round_episodes(historical_rounds, query_policy_sampler):
        M, D, target_tensor, teacher_posterior = episode
        pred = student.predict(M, D)
        loss = tensor_loss(pred.tensor, target_tensor) + posterior_distill(pred.posterior, teacher_posterior)
        optimize(loss)
    return student
```

## 5. Closed-loop benchmark harness concept

```python
def evaluate_model_on_round(model, round_data, query_policy):
    M = round_data.initial_maps
    D = []
    for step in range(50):
        A = query_policy.choose(M, D, model)
        Y = round_data.sample_live_query(A)   # legal active-round simulation interface
        D.append((A, Y))
    pred = model.predict(M, D)
    return score_against_ground_truth(pred, round_data.ground_truth)
```

---

# Part IX — Concrete model naming roadmap

Below is a suggested sequence of model names. Adapt to framework conventions as needed.

### Data / analysis utilities
- `greybox_data_eventextract_v01`
- `greybox_analysis_var_decomp_v01`
- `greybox_analysis_markovtest_v01`
- `greybox_analysis_topology_v01`

### Simple scientific baselines
- `greybox_hazard_roundfit_v01`
- `greybox_hazard_roundfit_z2_v02`
- `greybox_hazard_roundfit_mix2_z3_v03`

### Transition baselines
- `greybox_markov_local_v01`
- `greybox_markov_local_land_v02`
- `greybox_markov_local_land_sea_v03`
- `greybox_markov_local_land_sea_faction_v04`

### Teacher models
- `greybox_teacher_hybrid_v01`
- `greybox_teacher_hybrid_hidden_v02`
- `greybox_teacher_hybrid_shock_v03`
- `greybox_teacher_hybrid_phase_v04`
- `greybox_teacher_hybrid_phase_mix_v05`

### Student models
- `greybox_student_posterior_v01`
- `greybox_student_tensor_v02`
- `greybox_student_joint_v03`
- `greybox_student_joint_repeataware_v04`

### Query policies
- `greybox_policy_coverage_v01`
- `greybox_policy_diagmotif_v02`
- `greybox_policy_postinfo_v03`
- `greybox_policy_scoregain_v04`

### Ensembles
- `greybox_ensemble_teacher_hazard_v01`
- `greybox_ensemble_joint_v02`

---

# Part X — High-priority practical nuances specific to Astar Island

These are important modeling nuances that should shape implementation.

1. **The online problem is tiny.**
   Never waste active-round capacity relearning the world model from scratch.
   The online job is to infer the current regime and produce calibrated final tensors.

2. **Paths are abundant; rounds are scarce.**
   This is the single deepest asymmetry in the data.

3. **Owner IDs are labels, not magnitudes.**
   Model faction structure relationally / partition-wise.

4. **Ports, maritime reach, and long-range edges are first-class.**
   Do not reduce everything to local convolutions.

5. **Global yearly shocks are likely real.**
   Treat winter-like synchronized stress as a real hypothesis and test it early.

6. **Do not trust one-step accuracy alone.**
   Rollout quality and final-tensor quality are what matter.

7. **Held-out-round validation is sacred.**
   Never let path-level leakage fool you.

8. **The score is KL-based and entropy-weighted.**
   Overconfidence can be fatal. Calibration matters.

9. **Repeated identical live queries can be good.**
   They estimate the local terminal patch law under the current regime.

10. **Start scientific, then scale neural complexity.**
    First learn what the data are saying. Then build the richest teacher consistent with those facts.

---

# Part XI — Immediate action list

If you are starting now, do this exact sequence.

## Immediate checklist

1. Read `docs/game_facts.md`.
2. Inspect framework model registration and benchmark outputs.
3. Run one existing model end-to-end.
4. Create `experiments/greybox_worldmodel/registry.jsonl`, `leaderboard.md`, `notes.md`.
5. Implement canonical replay ingestion.
6. Implement settlement tracking and event extraction.
7. Run sanity checks and manual replay spot checks.
8. Compute variance decomposition across round / seed / path.
9. Run state sufficiency tests.
10. Run topology ablations.
11. Fit per-round effective hazard summaries.
12. Factorize per-round summaries into a tiny regime manifold.
13. Build teacher v1.
14. Benchmark teacher on held-out rounds.
15. Build student v1 from synthetic legal episodes.
16. Benchmark student closed-loop.
17. Build query policy v1.
18. Compare against coverage and existing baselines.
19. Iterate and commit/push every meaningful improvement.

---

# Final instruction

Do not behave like a feature factory.
Behave like a scientist-engineer running a disciplined model-discovery program.

The goal is not to ship one impressive architecture diagram.
The goal is to:
- learn the transition family,
- compress its round variation into a tiny reusable regime manifold,
- exploit that manifold online through a fast student and a strong query policy,
- and beat benchmarks on unseen rounds reproducibly.

Work until this family is genuinely exhausted.

