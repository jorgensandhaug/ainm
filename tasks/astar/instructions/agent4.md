# Agent Handoff — Grey-Box Replay-Driven World-Model Family for Astar Island

This document is the family-specific handoff for the replay-driven grey-box teacher / online student approach. It assumes the generic protocol document is also being followed.

## 0. Mission for this family

Build the strongest possible model family under the following strategic view:

- historical completed rounds give replay access to many stochastic paths,
- each historical round has 5 seed maps that share one hidden round law,
- active rounds still expose only the official online interface: known initial maps + up to 50 stochastic year-50 viewport queries,
- the score depends only on the final probability tensor.

The family goal is therefore:

1. learn a strong **teacher world model** offline from replay,
2. compress round-to-round variation into a **small regime manifold**,
3. learn a **student online inference model** that maps the live transcript to either a posterior over the regime or the final tensor directly,
4. learn a **query policy** that chooses live windows to reduce uncertainty in the final tensor efficiently,
5. ensemble and calibrate the resulting predictors.

The end goal is **not** to recover the exact simulator source code as an end in itself. The end goal is to maximize held-out-round historical benchmark score on the actual competition objective.

## 1. Non-negotiable game facts and modeling consequences

The agent must read `docs/game_facts.md` first. In addition, the following consequences from the game structure must be treated as central:

1. A round contains 5 seeds/maps sharing one hidden round law.
2. Active rounds allow only 50 stochastic `/simulate` calls total across all 5 seeds.
3. Each `/simulate` call returns a year-50 viewport only, and each call uses fresh simulator randomness.
4. Replays on historical rounds expose much richer information than live rounds.
5. The score is entropy-weighted KL on the final per-cell probability tensor.
6. Maps are small, fixed grids; geography matters massively.
7. Settlements carry rich marks (population, food, wealth, defense, port, alive, owner), and mechanics include growth, conflict, trade, winter, environment.
8. Some important internals may still be hidden (for example, docs mention tech / longship internally), so do not assume observed replay state is perfectly Markov without testing.

Core implication:

- within-round stochasticity is relatively easy to estimate from replay,
- across-round variation is the true statistical bottleneck,
- therefore the teacher can be moderately rich, but the round latent must stay small and heavily regularized.

## 2. The single most important thing to figure out first

### Scientific priority #1

**Does there exist a small, stable, cross-round regime manifold after factoring out geography?**

This is the highest-value scientific question because the entire family lives or dies on it.

If cross-round variation is low-rank / low-dimensional, then:
- the teacher can share most dynamics across rounds,
- the student only has to infer a tiny latent from 50 online queries,
- the query policy can target regime identification rather than brute map coverage.

If cross-round variation is not low-rank, this family becomes much weaker.

### Engineering priority #1

**Build a trusted replay-to-transition / replay-to-event extraction pipeline.**

Do not start by building a giant neural model. Start by making sure you can derive reliable yearly transition tables, event labels, and round summaries from replay.

If the event extraction is wrong, every downstream model is poisoned.

### The first two things to do, concretely

1. Build a replay ingestion + validation + event derivation pipeline.
2. Build round-summary estimation and test whether those summaries are low-rank across rounds.

Only after those two are working should you invest heavily in the full teacher.

## 3. What the end goal actually is

The end goal is a system that treats a live round as a small Bayesian inverse problem over a learned regime manifold.

Offline, we learn:
- a shared transition family,
- a terminal predictor,
- a patch/query likelihood or synthetic likelihood,
- a prior over round regimes,
- a student that imitates the best available posterior decision rule,
- a query policy.

Online, we do:
- initialize from prior/map-only prediction,
- gather 50 informative year-50 patch samples,
- infer the current round regime,
- output the posterior predictive final tensor,
- calibrate / ensemble before submission.

In formula form, the family aims to approximate:

```math
p(z_r \mid M_r, D_r) \propto p(z_r) \prod_i p(Y_i \mid M_r, A_i, z_r),
```

and then submit

```math
\hat P_r = \int F_\phi(M_r, z)\, p(z \mid M_r, D_r)\, dz.
```

Even if the student predicts \(\hat P\) directly, this latent-posterior view should still inform the architecture.

## 4. Full iterative exploration loop for this family

The loop should be treated as a repeated scientific cycle, not as a one-shot implementation.

### Phase A — Replay understanding and data trust

Goal: establish a trusted dataset and facts before any serious modeling.

Tasks:
1. Parse replay data into clean trajectories by round / seed / path / year.
2. Validate invariants:
   - coordinates consistent,
   - settlement records consistent with grid occupancy,
   - alive/dead transitions sane,
   - ports only where legal / expected,
   - state counts stable under serialization.
3. Derive yearly state diffs and event labels.
4. Create human-readable sanity dashboards or summary tables.

Verification:
- spot-check trajectories manually,
- compare derived events against state diffs on random samples,
- confirm no impossible transitions unless explicitly documented.

Outputs:
- canonical replay dataset,
- canonical event table dataset,
- geometry cache dataset.

### Phase B — Hypothesis-driven world-dynamics science

Goal: identify what structure the teacher actually needs.

The important hypotheses to test first are:

#### H1. Near-Markov sufficiency of observed replay state

Question:
Can next-year visible state be predicted well from current visible state alone, or do we need lagged history / hidden memory?

Test:
- Fit simple one-step predictors using only current observed state.
- Compare against predictors with 1-year lag, 2-year lag, or tiny hidden recurrent state.
- Measure next-step NLL and selected event-prediction metrics.

Interpretation:
- If lag/history adds little: observed state is nearly sufficient.
- If lag/history adds material gain: add tiny latent memory to the teacher.

#### H2. Low-rank cross-round variation

Question:
After fitting round-specific transition summaries, can those summaries be explained with a small number of factors?

Test:
- Fit per-round effective hazard / transition coefficients \(eta_r\).
- Apply PCA / factor analysis / low-rank regression / matrix factorization.
- Evaluate explained variance and leave-one-round-out predictive utility as latent dimension grows.

Interpretation:
- If 2–8 dimensions explain most predictive variation, the family is validated.
- If not, the round effect structure needs rethinking.

#### H3. Need for explicit graph interactions

Question:
Do local cell/neighborhood features explain most transitions, or are sparse long-range settlement graph interactions essential?

Test:
- Compare local-only models vs local+graph models on event heads (owner switch, port formation, collapse, wealth changes).

Interpretation:
- Significant gain on trade/conflict-like phenomena justifies settlement graph modules.

#### H4. Need for common year/path shocks

Question:
Do residuals remain correlated across distant cells/settlements within a year after conditioning on local/graph features?

Test:
- Fit baseline local/graph model.
- Measure residual correlation structure across space within same year/path.
- Add small global year latent and test gain.

Interpretation:
- If synchronized failures/surges remain unexplained, keep common-shock latent.

#### H5. Value of phase-structured modules

Question:
Does a mechanism-factored yearly model outperform a monolithic one-step model?

Test:
- Compare monolithic transition head vs explicit mechanism/event heads.

Interpretation:
- Keep only if it materially improves holdout score, calibration, or interpretability.

#### H6. Owner process is relational, not numeric

Question:
Does modeling owner transitions as relational candidate selection outperform naïve owner ID classification?

Test:
- Compare relational owner choice head vs raw categorical treatment.

Interpretation:
- Strong expected win; verify and then lock in.

Outputs of Phase B:
- hypothesis report,
- empirical evidence for/against each structural assumption,
- recommended teacher architecture constraints.

### Phase C — Strong baseline stack

Before the full teacher, build the following baselines:

1. **Map-only terminal predictor**.
   - Predict final tensor from initial maps alone.
   - Serves as prior and lower bound.

2. **Simple event-hazard teacher**.
   - No hidden memory.
   - Local features only.
   - Round-specific low-rank modulation.

3. **Direct student-only transcript model**.
   - Predict final tensor directly from synthetic live transcripts.
   - Useful baseline and diagnostic of transcript informativeness.

These baselines are mandatory. They anchor later gains.

### Phase D — Teacher world model

Build the full teacher only after Phases A–C are solid.

Recommended teacher state:

```text
Static substrate per cell:
  terrain code, coast mask, forest context, mountain barriers, land/sea reachability,
  choke metrics, distances, initial settlement features.

Dynamic per-cell state:
  class, ruin age / occupancy age / recent transition markers.

Dynamic settlement/object state:
  x, y, population, food, wealth, defense, has_port, alive, owner partition features,
  tiny hidden memory slot h if needed.

Path/year shared latent:
  small shock variable ω_{path,year} if residual common shocks are real.
```

Recommended teacher modules:

1. local update module,
2. settlement graph interaction module,
3. event heads for births / ports / collapse / rebuild / reclaim / owner switch,
4. continuous-delta heads for population / food / wealth / defense,
5. low-rank round conditioning via FiLM / hypernetwork / additive modulators,
6. optional tiny hidden memory if H1 says observed state is not enough.

Recommended training losses:
- one-step negative log-likelihood,
- short rollout loss,
- longer rollout stability loss on selected steps,
- year-50 tensor KL loss against Monte Carlo empirical tensor,
- regularization on round latent size and hidden memory usage.

### Phase E — Round-regime manifold

The teacher is not enough by itself. You need a small cross-round regime space.

Procedure:
1. Fit round-specific summary parameters or embeddings.
2. Factorize them.
3. Choose the smallest latent dimensionality that preserves held-out-round predictive utility.
4. Prefer structured regime blocks (growth/conflict/trade/winter/environment/residual) over one monolith.
5. Use strong shrinkage or ARD so unused regime directions collapse.

Success criterion:
- a tiny latent should explain most of the useful cross-round variation.

Failure criterion:
- if a large latent is needed, this family is likely overfitting and needs stronger structure.

### Phase F — Student online inference model

Build the student after the teacher is strong enough to generate realistic synthetic episodes.

Student input:
- full initial maps for all 5 seeds,
- live transcript of up to 50 stochastic year-50 windows,
- per-window settlement sets.

Student output options:
1. posterior over round latent \(q(z \mid M,D)\), or
2. direct final tensor \(\hat P\), or
3. both (recommended).

Recommended architecture:
- map encoder with cached geometry features,
- query-item encoder with patch-grid branch + settlement-set branch,
- permutation-invariant transcript aggregator (prefer Set Transformer / Deep Sets over order-sensitive RNN as default),
- small bottleneck representation,
- residual posterior update over map-only prior,
- structured output head.

Training data:
- synthetic active-round episodes generated from historical replay,
- variable transcript lengths,
- multiple policies (random, coverage, diagnostic, current-best policy) to reduce policy-shift risk.

Student losses:
- final tensor KL / score-aligned loss,
- same-round consistency between different transcripts from same round,
- local queried-cell likelihood consistency,
- distillation from teacher posterior / predictions.

### Phase G — Query policy

Do not treat online querying as simple map coverage.

Maps are already known. The online problem is regime identification under score weighting.

Recommended query-policy development order:

1. coverage baseline,
2. hand-built diagnostic motif heuristic,
3. ensemble-disagreement / posterior-variance reduction heuristic,
4. offline-trained policy against historical replay / teacher environment,
5. policy conditioned on current student posterior.

Policy objective should approximate expected reduction in final score loss, not just information gain about arbitrary internal variables.

### Phase H — Ensemble and calibration

Mandatory final stage.

Ensemble at least:
- strongest teacher-derived predictor,
- strongest direct student,
- strongest semimechanistic hazard baseline.

Calibrate on held-out rounds.
Use probability floors and temperature / Dirichlet-style calibration if available.
Track whether score gains come from true calibration improvement or merely sharper wrong predictions.

## 5. Exactly what to test first

### First engineering milestone

Implement and validate replay -> yearly event table extraction.

Must produce:
- births,
- deaths/collapse to ruin,
- ruin -> rebuilt,
- ruin -> forest/open,
- settlement -> port transitions,
- owner switches,
- yearly deltas for population/food/wealth/defense,
- per-year settlement graph snapshots.

### First scientific milestone

Estimate round-specific summaries and answer:

**Is cross-round variation low-dimensional?**

This must be answered before any large architecture search.

### First modeling milestone

Fit a simple local event-hazard mixed-effects model with:
- shared coefficients,
- low-rank round effects,
- no hidden memory,
- no graph interactions.

Then add one complexity at a time:
1. graph,
2. common year shock,
3. hidden memory,
4. phase structure.

This ordering is intentional. Do not start with the most complex model.

## 6. Concrete hypotheses and how to verify them

Use this as a living checklist.

### Hypothesis group A — State sufficiency

A1. Current visible state is enough for one-step prediction.
- Verify by comparing with lagged-history variants.

A2. Tiny hidden memory materially helps.
- Verify by adding 2–8 hidden dims per occupied site and testing LOO gains.

### Hypothesis group B — Geometry and interactions

B1. Local geometry dominates births/reclaims.
- Verify with local-only hazards.

B2. Trade/conflict requires sparse settlement graph.
- Verify by event-wise gains when adding graph module.

B3. Coast access is essential for portization.
- Verify support constraints; ensure model never relies on impossible port dynamics.

### Hypothesis group C — Stochastic structure

C1. Independent local noise is insufficient.
- Verify via residual correlation maps.

C2. A small common year/path shock fixes calibration.
- Verify on synchronized collapse / food drop behavior and final tensor calibration.

### Hypothesis group D — Round manifold

D1. A 2–8 dimensional latent explains most useful round variation.
- Verify with factorization and LOO benchmarks.

D2. Mechanism-blocked latents beat monolithic latents.
- Verify with structured vs unstructured modulation.

D3. A discrete mixture component helps.
- Verify only if residual clustering suggests regime families.

### Hypothesis group E — Student / online inference

E1. Student should infer latent rather than predict tensor directly.
- Compare q(z|M,D)+decoder vs direct \(\hat P\) path.

E2. A hybrid output (latent + direct residual tensor) is best.
- Compare against pure latent and pure direct.

E3. Transcript order invariance matters.
- Compare Set Transformer / Deep Sets vs RNN.

E4. Repeated identical windows are valuable.
- Verify with transcript generation allowing replication and compare policy effectiveness.

### Hypothesis group F — Policy

F1. Coverage is suboptimal once map is known.
- Compare coverage vs diagnostic motif policies.

F2. Posterior-variance / disagreement acquisition improves score.
- Verify on held-out rounds.

F3. Offline learned policy outperforms hand heuristics.
- Verify only after student/teacher are stable.

## 7. Model classes to implement and exhaust in this family

Implement and benchmark the following subfamilies systematically.
Each must have separate model names.

### Class 0 — Priors / trivial baselines
- `gbx_prior_maponly_*`
- `gbx_prior_entropy_*`

### Class 1 — Event hazard mixed-effects models
- local-only,
- local + graph,
- local + graph + common shock,
- local + graph + common shock + tiny hidden memory,
- structured mechanism-blocked round latent,
- monolithic round latent.

### Class 2 — Grey-box recurrent world model teacher
- no memory,
- tiny hidden memory,
- common shock,
- mechanism-factorized modules,
- monolithic transition module,
- low-rank round modulation variants.

### Class 3 — Student transcript models
- Deep Sets transcript,
- Set Transformer transcript,
- latent-only output,
- direct tensor output,
- hybrid latent+residual output,
- with / without teacher distillation.

### Class 4 — Query policy
- coverage,
- random,
- diagnostic motifs,
- ensemble disagreement,
- posterior variance reduction,
- offline learned policy.

### Class 5 — Ensembles / calibration
- teacher only,
- student only,
- hazard only,
- teacher+student,
- teacher+hazard,
- student+hazard,
- all three,
- calibration variants.

The agent must not stop after finding “one good model.” Exhaust the main combinations in this family in a structured order.

## 8. Recommended experiment order

Use this order unless evidence strongly pushes otherwise.

1. Replay parser + validation.
2. Event derivation.
3. Round-summary estimation.
4. Low-rank round manifold analysis.
5. Simple local mixed-effects hazard model.
6. Add graph interactions.
7. Add common year/path shock.
8. Add tiny hidden memory.
9. Compare phase-structured vs monolithic teacher.
10. Train first strong teacher.
11. Generate synthetic active-round episodes.
12. Train first student.
13. Compare student output styles.
14. Add distillation.
15. Develop query policy.
16. Ensemble and calibrate.
17. Iterate on highest-value ablations.

Do not reorder this casually. This sequence is designed to answer the highest-leverage questions first.

## 9. How to structure the experiment ledger for this family

Add family-specific metadata to the generic experiment ledger:

- `family = greybox_replay`
- `subfamily = prior|hazard|teacher|student|policy|ensemble`
- `round_latent_dim`
- `round_latent_structure = monolithic|blocked|mixture`
- `graph = none|sparse_land|sparse_sea|mixed`
- `common_shock = none|year|path_year`
- `hidden_memory_dim`
- `student_arch = none|deepsets|settransformer|rnn`
- `student_output = none|latent|tensor|hybrid`
- `distillation = yes|no`
- `policy = none|coverage|diagnostic|disagreement|learned`
- `calibration = none|temperature|dirichlet|ensemble`
- `runtime_train`
- `runtime_benchmark`
- `score_mean`
- `score_worst_round`
- `notes`

Also maintain a human-readable best-model table with short commentary on why each improvement helped.

## 10. Pseudocode for the core loop

### Replay ingestion and event extraction

```python
for round_id in historical_rounds:
    load round metadata and initial maps
    for seed in seeds:
        for replay_path in sampled_replays(round_id, seed):
            states = load_states(round_id, seed, replay_path)  # years 0..50
            validate_states(states)
            for t in range(50):
                s_t = states[t]
                s_tp1 = states[t+1]
                events = derive_events(s_t, s_tp1)
                append_transition_record(round_id, seed, replay_path, t, s_t, s_tp1, events)
```

### Round-summary estimation

```python
for round_id in historical_rounds:
    fit simple per-round event / delta models on that round's transitions
    extract coefficients, residual summaries, covariance summaries
    store beta_round[round_id]

Z = factorize(beta_round)  # PCA / factor analysis / low-rank regression
choose latent dimension via leave-one-round-out utility
```

### Teacher training

```python
initialize teacher with shared params phi and per-round latent z_r
while not converged:
    batch transitions and short rollouts across rounds
    compute one-step likelihoods
    compute rollout losses
    periodically compute year-50 tensor calibration loss on sampled rollouts
    regularize z_r, hidden memory, and common shock dimensions
    update phi and z_r
```

### Student synthetic-episode generation

```python
for round_id in historical_rounds:
    for episode in sample_episodes(round_id, policy_mix):
        D = sample_live_like_transcript(round_id, episode.policy, max_queries=50)
        target = empirical_final_tensor(round_id)
        save_episode(M_round, D, target, maybe_teacher_posterior)
```

### Student training

```python
for batch in synthetic_episode_loader:
    h = transcript_encoder(M, D)
    pred = student_decoder(M, h)
    loss = final_tensor_kl(pred, target)
    loss += consistency_loss_if_applicable
    loss += distillation_loss_if_applicable
    update student
```

### Query policy iteration

```python
initialize policy = coverage / heuristic
repeat:
    generate synthetic episodes with current policy
    train/update student
    evaluate policy on held-out rounds using teacher/replay environment
    if improved:
        freeze new policy variant, benchmark, log, commit, push
```

## 11. Code-performance guidance specific to this family

Non-negotiable:
- precompute static geometry features once per map,
- cache replay-derived transition tables,
- use compact event-table formats (Parquet/Arrow or repo-standard equivalent),
- avoid reconstructing settlement graphs from scratch with slow Python loops inside hot training paths,
- batch transitions by year/count of settlements when possible,
- use sparse edge lists for graph interaction modules,
- keep student episode generation deterministic and cacheable by seed/config,
- profile the benchmark path, not just training.

Since there are only ~5,000 paths total, it is usually acceptable to materialize rich derived datasets if that materially speeds repeated experiments.

## 12. Expected failure modes and what they mean

### Failure mode: large gains in train-like splits, weak gains in held-out rounds
Interpretation: round manifold too flexible; model memorizing historical round laws.
Response: reduce latent dimension, strengthen pooling, simplify modulation.

### Failure mode: good one-step accuracy, poor multi-step rollout stability
Interpretation: teacher lacks rollout robustness.
Response: increase rollout-aware training, inject noise, add common shocks or hidden memory if justified.

### Failure mode: teacher good, student poor
Interpretation: transcript encoder or synthetic episode distribution is weak.
Response: improve transcript architecture, distillation, and episode generation / policy coverage.

### Failure mode: good mean score, bad worst-round score
Interpretation: poor calibration or lack of robustness to unusual regimes.
Response: ensemble, calibrate, inspect outlier rounds, possibly add small mixture component in regime space.

### Failure mode: policy overfits to historical teacher quirks
Interpretation: student/policy loop exploiting model bias.
Response: diversify policy-training environment with replay + multiple teacher checkpoints + ensemble disagreement.

## 13. Definition of success for this family

This family succeeds if, on repeated held-out-round backtests:

1. it materially beats the simpler map-only and direct-only baselines,
2. it does so with a small and interpretable regime manifold,
3. it remains computationally practical for repeated iteration,
4. the student can perform strong online inference under the exact live-query interface,
5. the system remains well calibrated under the KL-based score.

## 14. Final marching orders

1. Read `docs/game_facts.md` first.
2. Build the replay/event pipeline before large models.
3. Answer the low-rank-round-manifold question early.
4. Do not start with huge generic neural models.
5. Keep the teacher specific in structure and the round latent tiny.
6. Train the student only after the teacher is strong enough.
7. Train the query policy against the actual historical interface.
8. Log every experiment.
9. Commit and push frequently.
10. Exhaust the family systematically.

The core principle to remember throughout this family is:

**You have many transitions but very few independent round laws.**

All good decisions in this branch should respect that asymmetry.


