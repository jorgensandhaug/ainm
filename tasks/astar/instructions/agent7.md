# Astar Island — Fifth-Family (Operator / Regime-Manifold / Retrieval) Handoff

## 0. Mission

Your mission is to exhaust the **fifth-family** approach space for Astar Island: a **hierarchical semiparametric operator-retrieval system** in which each historical round is compressed into a small set of round-law coordinates, a shared decoder maps `(map, regime)` to the final tensor, and the live round uses 50 stochastic year-50 viewport observations to infer the current round’s coordinates and query adaptively.

You are **not** optimizing a single model. You are optimizing a **system** with these components:

1. Historical replay ingestion and per-round summary extraction.
2. Per-round operator / hazard / motif-response estimation.
3. Low-dimensional regime-manifold learning.
4. Shared decoder from `(map, regime)` to year-50 probability tensor.
5. Online transcript encoder / posterior inference over regime.
6. Query policy optimized for regime identifiability and final score.
7. Calibration, uncertainty, OOD detection, and ensembles.
8. Fast backtesting, reproducibility, experiment tracking, and disciplined git workflow.

You have a benchmark harness already. Use it relentlessly:

```bash
uv run astar run-historical-benchmark --model <MODEL_NAME>
```

Your goal is **not** to stop after one strong model. Your goal is to systematically traverse the space of plausible variants inside this family until the family is genuinely exhausted by evidence.

---

# Part I — Reusable agent instructions (generic; reuse for other families too)

## 1. Non-negotiables

1. **Read `docs/game_facts.md` first.** Treat it as mandatory. Do not assume this document is a substitute for that file. Reconcile both.
2. Work **inside the existing framework**. Do not fight it. Extend it cleanly.
3. Every model/variant must have a **unique model name** and be reproducible from config/code.
4. Every change that produces a new best score, a new useful capability, or a new stable baseline must be **committed** and **pushed** immediately.
5. Code must be **fast**, **vectorized**, **cache-aware**, and **clean**. Slow code kills iteration.
6. Evaluate honestly. Use **leave-one-round-out** or equivalent round-level holdout. Never treat multiple synthetic episodes from the same historical round as independent regime samples.
7. Keep a detailed machine-readable experiment ledger. Never rely on memory.
8. Do not stop at local improvements. Keep a structured search agenda and exhaust it.

## 2. Core engineering rules

### 2.1 Reproducibility

Every model must be reproducible from:
- model name
- git SHA
- config file or config object
- training rounds / holdout round
- random seed(s)
- artifact paths

Each experiment entry must include at least:
- `model_name`
- `family`
- `timestamp`
- `git_sha`
- `branch`
- `training_rounds`
- `holdout_round(s)`
- `core_hyperparams`
- `benchmark_score_mean`
- `benchmark_score_std`
- `seed_scores`
- `query_policy_summary`
- `wall_time`
- `notes`

Maintain this in a durable structured file, e.g. JSONL or SQLite.

### 2.2 Git discipline

- Commit and push for:
  - every new model class
  - every new best score
  - every new benchmarkable ablation set
  - every infrastructure improvement that materially affects iteration speed or correctness
- Use short, consistent commit messages.
- Example pattern:
  - `ffam: add round-summary extractor and caching`
  - `ffam: add local-linear beta inference baseline`
  - `ffam: new best +1.7 historical benchmark via motif posterior`

### 2.3 Performance discipline

Assume the bottleneck is iteration speed.

Requirements:
- precompute and cache immutable map features
- precompute and cache replay-derived per-round summaries
- avoid Python loops over cells when vectorization is possible
- prefer NumPy / PyTorch batched operations
- cache expensive motif extraction and transcript simulation
- avoid repeated JSON parsing in hot loops
- use memory-mapped or chunked storage for large replay tables if needed
- profile periodically; do not guess about bottlenecks

### 2.4 Scientific discipline

For each new idea, do all four:
1. state the hypothesis explicitly
2. define the estimand / metric that would support or falsify it
3. implement the smallest clean experiment to test it
4. record the outcome in the experiment ledger

No vague “seems better”. Everything should reduce to measurable evidence.

### 2.5 Backtesting discipline

Use the existing historical benchmark harness as the final arbiter.

Internal evaluation hierarchy:
1. unit / invariant checks
2. replay-derived diagnostic metrics
3. round-level holdout backtests
4. full historical benchmark score

If a change improves an internal proxy but not round-level benchmark score, treat it as suspect until proven useful elsewhere.

## 3. Model naming convention

Every new benchmarkable variant needs a new model name. Keep names structured and parseable.

Suggested template:

```text
ffam_<summary>_<manifold>_<decoder>_<posterior>_<policy>_<calib>_vNNN
```

Examples:
- `ffam_globalcurve_pca3_linmode_llr_diagrep_floor_v001`
- `ffam_hazard_pca4_hazarddec_gp_diagig_temp_v003`
- `ffam_motifdist_supsvd5_nlmode_particle_miquery_ens_v002`

Where:
- `summary` = how historical rounds are summarized
- `manifold` = how regime coords are extracted
- `decoder` = how `(map, beta)` maps to tensor
- `posterior` = how live transcript maps to beta/posterior
- `policy` = query policy
- `calib` = calibration scheme

## 4. Experiment-structure requirements

You must organize the search so it scales over many iterations.

Maintain at least these layers:

1. **Registry of candidate ideas**
   - one-line hypothesis
   - status: todo / active / rejected / promoted
   - dependencies
   - expected cost

2. **Experiment ledger**
   - every executed run
   - benchmark results
   - artifact references

3. **Champion table**
   - best model overall
   - best by subfamily
   - best speed/score tradeoff
   - best uncertainty calibration
   - best query policy

4. **Ablation table**
   - what component changed
   - what score impact it had
   - confidence in result

Do not let the experiment history become unsearchable.

## 5. Code-quality requirements

- Prefer pure functions and typed dataclasses/config objects.
- Keep file/module responsibilities narrow.
- Separate data extraction, summary estimation, manifold learning, decoder training, posterior inference, and query policy.
- Add lightweight tests for invariants and serialization.
- Make every expensive stage cacheable and resumable.
- Write code another engineer can read six weeks later.

## 6. What not to do

- Do not treat synthetic episodes from the same historical round as independent rounds.
- Do not use random train/test splits over episodes; use round-level splits.
- Do not add giant latent spaces because replay volume “feels large”. The number of distinct rounds is the governing sample size for regime variation.
- Do not overinvest in polishing a model variant before proving it moves the benchmark.
- Do not leave results undocumented.
- Do not let model names become ambiguous.

---

# Part II — Family-specific mission: Fifth-family operator / manifold / retrieval approach

## 7. Core thesis of this family

This family is based on a single decisive asymmetry:

- **within a historical round**: we have many replay paths, so the round’s internal law can be estimated fairly accurately
- **across historical rounds**: we have only ~30 distinct round regimes, so cross-round variation must be modeled with extreme parsimony

Therefore:
- within-round estimation can be rich
- cross-round manifold must be tiny
- online inference must identify only that tiny manifold from 50 year-50 partial observations

The family succeeds **iff** the following proposition is true enough:

> Historical round-to-round variation can be compressed into a small number of regime coordinates that are identifiable from live year-50 query transcripts and sufficient for final-tensor prediction.

Everything in this family is aimed at testing and exploiting that proposition.

## 8. Most important thing to figure out first

### The single most important question

**Is round-to-round variation low-dimensional and identifiable from year-50 windows?**

If the answer is “no”, this family is only a weak ensemble member.
If the answer is “yes”, this family can become the main engine.

This is more important than any specific neural architecture.

### Why this is first

Because the historical replay abundance can fool you. You may think you have massive data. You do not have massive **regime** data. You have massive **within-round path** data and only ~30 regime draws.

So before building a large student or a sophisticated GP, you must prove that:

1. round-level behavior is compressible
2. compressed coordinates predict final tensors well
3. those coordinates can be inferred from feasible query transcripts

If you do not establish those three facts early, you can waste enormous time on the wrong subspace.

## 9. End goal for this family

The end-state system should look like:

1. **Historical replay teacher** estimates per-round summary objects `u_r`.
2. `u_r` is compressed into small round coordinates `beta_r`.
3. A shared decoder `F_theta(map, beta)` predicts the year-50 probability tensor.
4. Synthetic live-episode generation creates transcript datasets from replays.
5. A posterior model `q_psi(beta | map, transcript)` infers the current round’s beta.
6. A query policy selects windows to maximize reduction in final-tensor uncertainty / expected score loss.
7. A calibration + OOD layer hedges when the current round lies off-manifold.
8. An ensemble combines at least:
   - a retrieval/interpolation model
   - a particle historical-round mixture baseline
   - a semimechanistic hazard-based decoder

This family’s final prediction form should be approximately:

```math
\hat P(M) = \mathbb E_{\beta \sim q_\psi(\beta \mid M, D)}[F_\theta(M, \beta)]
```

where `D` is the live query transcript.

---

# Part III — Exploration and verification loop

## 10. Full iteration loop

The loop for this family is:

1. **Understand replay semantics and extract truthy data structures**
2. **Estimate per-round summaries from replay**
3. **Test hypotheses about dynamics and low-rank variation**
4. **Learn tiny regime coordinates**
5. **Build shared decoder(s)**
6. **Generate synthetic live episodes**
7. **Train posterior / retrieval / interpolation models**
8. **Train/evaluate query policies**
9. **Calibrate, ensemble, OOD-gate**
10. **Benchmark on held-out rounds**
11. **Record, commit, push, iterate**

Every phase must have falsifiable subgoals.

## 11. Where to start (strict order)

### Phase 0 — Replay semantics audit (mandatory)

Before any modeling, verify exact semantics of replay data in code.

Questions to answer:
- Is replay state identical in schema across all historical rounds?
- Are settlement identities stable across time? If not, can they be reconstructed?
- Are owner IDs stable within a replay path? Across replay runs of the same round?
- What exact fields exist at each time step?
- Are the replays independent fresh stochastic draws for fixed round/seed?
- What is the exact time indexing (state at t=0..50 or transitions 0->1 ... 49->50)?
- Can the live `/simulate` output be emulated exactly from replay terminal states?
- Are there any hidden fields not available in replay but available in live simulate, or vice versa?

Artifacts to produce:
- `replay_schema.md`
- serialization / loader tests
- simple statistics sanity report

Do not proceed until this is settled.

### Phase 1 — Canonical per-round summary extraction (mandatory)

Build a pipeline that converts all replay paths in a historical round into a canonical summary object `u_r`.

`u_r` must be deterministic given the replay corpus and cheap to load later.

This summary object should include at least these blocks:

#### 11.1 Global time curves
For each seed and aggregated over seeds, estimate by year:
- expected alive mass
- expected settlement mass
- expected port mass
- expected ruin mass
- expected forest-once-ruin or reclamation-related counts if recoverable
- expected entropy proxy from replay sample frequencies at each time
- owner turnover / owner-domain fragmentation if available
- coastal occupancy share
- inland occupancy share
- birth and death counts per year

#### 11.2 Transition / hazard summaries
Estimate effective transition intensities for:
- empty/plains -> settlement
- settlement -> port
- settlement/port -> ruin
- ruin -> settlement/port
- ruin -> forest
- ruin -> class-0 open land

Condition on geometry and local context such as:
- coastal indicator
- mountain barrier / reachability
- local forest support
- neighborhood occupancy counts
- distance to nearest initial settlement(s)
- land and sea geodesics
- tie margin between nearest competing basins

#### 11.3 Motif response summaries
Define motif classes and estimate replay response distributions for each round.
Candidate motifs:
- coast-connected initial settlement
- fjord-adjacent basin
- inland high-forest basin
- mountain-separated rivalry corridor
- isolated coastal seed
- sparse frontier cell near one power center
- tie-zone between two power centers
- coastal ruin-prone corridor

For each motif class, estimate distributions of relevant year-50 outcomes and, if useful, trajectory summaries.

#### 11.4 Interaction summaries
Estimate coarse pairwise kernels or sparse summaries for:
- trade-like co-survival between ports in sea reach
- conflict-like adverse coupling across rival frontiers
- winter synchrony / common collapse shock indicators

#### 11.5 Final target summaries
Always retain direct supervision targets:
- full year-50 probability tensor for each seed
- entropy maps
- class marginals
- derived targets such as alive probability, built probability, port|alive

Store all of this in a cacheable binary format.

### Phase 2 — First decisive hypothesis tests (highest priority)

These are the first hypotheses you must test. They determine viability.

#### H1. Low-rank round variation

**Hypothesis**: After removing a shared map-only baseline, the residual final-tensor variation across rounds is low-rank.

Test:
- fit a baseline map-only predictor `B(M)` on historical rounds
- compute residual tensors `R_r = P_r - B(M_r)`
- perform low-rank analysis (PCA / SVD / supervised factorization) across rounds
- assess how many components explain useful round-level variance
- evaluate leave-one-round-out (LORO) reconstruction / prediction

Success criterion:
- a tiny `q` (ideally 2–5) captures most score-relevant residual variation

#### H2. Hazard modulation is low-rank

**Hypothesis**: Per-round differences in transition hazards can be explained by low-rank modulation of a shared hazard model.

Test:
- fit round-specific hazard/logit models from replay
- stack coefficient vectors or response surfaces
- do factor analysis / PCA / low-rank regression
- measure explained variance and predictive lift

Success criterion:
- a small number of latent directions captures most between-round hazard variation

#### H3. Diagnostic motifs are regime-informative

**Hypothesis**: A small library of motif windows observed at year 50 is sufficient to infer the round regime well.

Test:
- from historical replay, sample synthetic live transcripts using candidate query policies
- estimate round classification / beta inference accuracy as a function of query count
- compare motif-based policies against coverage-style policies

Success criterion:
- regime inference quality rises sharply with repeated diagnostic motif queries

#### H4. Transcript -> beta is smoother than transcript -> full tensor

**Hypothesis**: Learning transcript-to-beta then beta-to-tensor is easier and more stable than direct transcript-to-tensor prediction.

Test:
- compare direct discriminative student versus two-stage beta inference + decoder
- evaluate LORO benchmark score, calibration, and OOD behavior

Success criterion:
- beta-mediated models are more stable and generalize better across held-out rounds

#### H5. Historical manifold local interpolation works

**Hypothesis**: The current round usually lies near the historical regime manifold so local interpolation is better than nearest-round snapping.

Test:
- compare particle historical-round mixture, kNN, local linear regression, and GP on beta
- evaluate on held-out rounds

Success criterion:
- local interpolation consistently beats pure nearest historical round

### Phase 3 — Decide viability

After H1–H5, make a hard call.

If all mostly fail:
- keep fifth-family only as a fallback / prior / ensemble member
- do not overinvest

If most pass:
- this family is viable as mainline
- proceed to aggressive refinement

Do not skip this decision point.

---

# Part IV — Model classes to exhaust inside this family

## 12. Shared decoder families `(map, beta) -> final tensor`

These must be explored systematically.

### 12.1 Baseline + linear response modes

Form:
```math
F_\theta(M, \beta) = B_\theta(M) + \sum_{m=1}^q \beta_m R_{\theta,m}(M)
```

Where:
- `B_theta(M)` is a map-only baseline predictor
- `R_theta,m(M)` are learned score-relevant response modes

Pros:
- highly parsimonious
- directly aligned with low-rank regime idea
- easy to inspect

Cons:
- may underfit nonlinear round effects

### 12.2 Baseline + nonlinear low-rank adapter

Form:
- map encoder produces features `h(M)`
- small `beta` modulates features through FiLM / low-rank adapters / hypernetwork weights
- output head predicts tensor

Pros:
- more expressive than linear modes
- still low-dimensional in regime

Cons:
- easier to overfit with only ~30 rounds

### 12.3 Semimechanistic hazard decoder

Decoder predicts intermediate event probabilities / hazards:
- built probability
- alive probability
- port conditional on alive
- ruin probability
- reclaim probabilities

Then maps these to final classes.

Pros:
- strong inductive bias
- interpretable
- robust with small round count

Cons:
- model misspecification risk

### 12.4 Mixed decoder ensemble

Use multiple decoders and combine by learned or validation-tuned weights.

Strong candidate final production setup.

## 13. Regime-coordinate extraction families `u_r -> beta_r`

### 13.1 Pure PCA / FPCA
- on final residual tensors
- on global curves
- on hazard coefficients

### 13.2 Supervised factorization
- choose factors that maximize final score prediction on held-out rounds
- more aligned than unsupervised PCA

### 13.3 Multi-view factorization
Combine several blocks:
- global curves
- hazard summaries
- motif response summaries
- interaction summaries

Use CCA-style or shared latent methods to extract common regime coordinates.

### 13.4 Discrete mixture + continuous residual
Let rounds cluster into coarse modes, then add small continuous coordinates within cluster.

This is likely strong if some rounds correspond to qualitatively different dynamic families.

## 14. Online posterior / retrieval families `transcript -> beta`

This is the heart of the fifth family.

### 14.1 Particle historical-round mixture
Treat historical rounds as particles with weights from transcript likelihood or transcript similarity.

Pros:
- robust
- uncertainty naturally spread over historical support
- strong baseline

### 14.2 kNN / local kernel regression
Simple, cheap, strong if summary space is well engineered.

Must test:
- plain kernel averaging
- local linear regression
- bandwidth adaptation
- metric choices

### 14.3 GP on transcript summary -> beta
Use a tiny transcript summary space and independent or correlated GPs for beta dimensions.

Pros:
- uncertainty estimates
- good with ~30 support points if dimensionality is low

### 14.4 Metric-learned retrieval
Learn a low-rank Mahalanobis or equivalent metric so transcript summaries cluster by score-relevant similarity.

Must strongly regularize.

### 14.5 Kernel Bayes / conditional mean embedding variants
Only pursue if summary space is already stable and low-dimensional.
This is advanced and elegant, but not first-line.

### 14.6 Deep Sets / Set Transformer transcript encoder + local regressor
Encode query set into a compact summary, then regress to beta using a small head.

Use only with strong regularization and distillation from more stable teachers.

## 15. Query policy families to exhaust

### 15.1 Coverage-style policy
Necessary baseline, but probably not optimal.

### 15.2 Fixed diagnostic motif library
Query repeated motif instances known to separate regimes.

### 15.3 Expected info gain on beta
Approximate expected reduction in posterior variance over beta.

### 15.4 Expected score improvement
More expensive, more aligned. Use replay-derived teacher to estimate.

### 15.5 Hybrid policy
- early: diagnostic motif selection
- middle: posterior-collapse repetition
- late: score-sensitive frontier refinement

This is a very strong candidate end-state.

## 16. Calibration / OOD / fallback families

### 16.1 Probability floors / temperature / shrinkage
Must be evaluated because the score is KL-based.

### 16.2 Novelty detection in beta / transcript space
Flag if current transcript lies far from historical support.
Use novelty as a gating variable for safer fallback predictions.

### 16.3 Baseline shrinkage
When posterior is diffuse or OOD, shrink toward:
- map-only baseline
- particle mixture over historical rounds
- safer high-entropy prediction in uncertain frontier zones

### 16.4 Ensemble blending
Blend:
- local interpolation model
- particle mixture model
- semimechanistic decoder

This should likely be in the final system.

---

# Part V — How to infer and verify hypotheses from replay

## 17. Fundamental inferential principle

Replay gives you repeated trajectories under a fixed historical round law. Use this to estimate **round-specific observables** first. Do not jump directly to giant end-to-end learning.

Think of replay as a microscope for discovering what quantities are stable, what vary by round, and how that variation manifests.

## 18. Classes of hypotheses and how to test them

### 18.1 Hypotheses about local transition structure

Examples:
- port formation is primarily a function of coastal access + local prosperity proxies
- ruin creation hazard is mostly affected by isolation, prior pressure, and round-level winter/conflict axes
- forest reclamation is mostly a function of ruin age, nearby thriving settlements, and round environment axis

How to test:
- estimate transition tables / conditional hazard models from replay
- compare simple feature sets versus richer ones
- inspect residuals by round and by motif
- check whether round effects look additive, multiplicative, or more complex

### 18.2 Hypotheses about global/common shocks

Examples:
- winter acts mostly as a round-wide common shock with year-to-year variation
- some rounds have synchronized collapse phases not explainable by local covariates alone

How to test:
- compute per-year collapse synchrony statistics across distant settlements / regions
- regress year-specific death surges on global latent factors versus local only
- compare independent-local versus common-shock models

### 18.3 Hypotheses about competition / interaction range

Examples:
- rivalry influence is mostly local in land geodesic distance
- maritime edges substantially alter effective reach only for certain rounds

How to test:
- estimate pairwise influence summaries by geodesic land/sea distance bins
- compare models with and without long-range maritime features
- inspect round-specific modulation of those pairwise kernels

### 18.4 Hypotheses about low-dimensional round variation

Examples:
- most round variation can be summarized by 2–5 axes
- one axis mostly controls expansion, another ruin pressure, another maritime leverage

How to test:
- fit per-round summaries, then do low-rank factorization
- rotate factors and inspect loading patterns
- check whether held-out round prediction saturates quickly in q

### 18.5 Hypotheses about online identifiability

Examples:
- 50 year-50 windows are enough to infer beta accurately if queries are diagnostic
- repeated identical windows are more informative than broad one-pass coverage

How to test:
- generate synthetic online episodes from historical replay under many policies
- estimate posterior error on beta and final benchmark score versus query count
- compare repetition versus coverage

## 19. Statistical tools to use

Use tools deliberately, not decoratively.

Recommended toolkit:
- generalized linear / hazard models for transition estimation
- hierarchical mixed-effects models for separating within-round from between-round variation
- PCA / FPCA / low-rank regression / tensor factorization for regime compression
- local linear regression for interpolation on tiny manifolds
- GPs on low-dimensional summary spaces
- metric learning with strong regularization
- bootstrap over replay paths within a round for uncertainty on round summaries
- leave-one-round-out evaluation for all cross-round claims
- calibration diagnostics tied to the actual competition loss

Use the simplest tool that can falsify the hypothesis. Do not jump to fancy methods first.

---

# Part VI — Concrete first build order

## 20. Build order (strict)

### Build 1 — Replay audit + summary cache
Deliverables:
- robust replay loaders
- schema/invariant tests
- precomputed per-round summary objects `u_r`
- simple notebooks/reports showing sanity plots

### Build 2 — Map-only baseline decoder
A strong baseline `B_theta(M)` trained on historical final tensors only.

Purpose:
- establish baseline score
- compute residuals for manifold analysis
- identify score-relevant entropy structure

### Build 3 — Round residual rank test
Deliverables:
- residual tensor stack
- PCA / supervised low-rank analysis
- report: how many dimensions matter?

This is the first crucial go/no-go decision.

### Build 4 — Per-round hazard summaries
Fit effective transition models from replay and factorize them across rounds.

Deliverables:
- hazard coefficients / surfaces per round
- low-rank analysis report
- relation to residual tensor factors

### Build 5 — Synthetic live-episode generator
Given a historical round and a query policy, simulate active-round transcripts exactly in framework format.

This is the bridge to online inference.

### Build 6 — Minimal fifth-family online model
Start with the simplest viable version:
- `beta_r` from low-rank factorization (q=2..5)
- local linear transcript-summary -> beta
- baseline + linear response decoder
- simple diagnostic query policy

Benchmark it.

### Build 7 — Stronger posterior models
Then evaluate:
- particle historical-round mixture
- GP on summary -> beta
- metric-learned local regression
- Deep Sets transcript encoder + regressor

### Build 8 — Stronger decoders
Then evaluate:
- nonlinear low-rank adapters
- semimechanistic hazard decoder
- decoder ensembles

### Build 9 — Query policy optimization
Use historical replay to optimize policies against held-out rounds.

### Build 10 — OOD + calibration + ensemble
Only after the core family is working.

---

# Part VII — Exact experiment agenda to exhaust the family

## 21. Summary object ablations

Exhaust at least these summary families:

1. `globalcurve`
   - only time curves and aggregate counts
2. `finalresid`
   - final tensor residuals only
3. `hazardcoef`
   - per-round hazard coefficients only
4. `motifdist`
   - motif response summaries only
5. `multiview`
   - concatenation / fused latent of all above

Measure:
- low-rankness
- held-out round predictiveness
- online identifiability from transcripts

## 22. Regime manifold ablations

Exhaust:
- PCA q=1..8
- supervised factorization q=1..8
- mixture + PCA within cluster
- multi-view factorization

Measure:
- held-out tensor prediction
- transcript->beta recoverability
- stability across resampling

## 23. Decoder ablations

Exhaust:
- map-only baseline
- baseline + linear modes
- baseline + nonlinear adapters
- semimechanistic hazard decoder
- ensembles of the above

Measure:
- benchmark score
- calibration under KL loss
- speed

## 24. Posterior / retrieval ablations

Exhaust:
- particle round mixture
- kNN on summary space
- local linear kernel regression
- GP on summary -> beta
- metric-learned local regression
- Deep Sets summary -> beta
- kernel embedding / KBR variants if summary space is mature

Measure:
- beta posterior accuracy on synthetic episodes
- final benchmark score
- OOD behavior
- speed

## 25. Query policy ablations

Exhaust:
- full coverage baseline
- random motif baseline
- hand-designed diagnostic motif library
- posterior variance reduction on beta
- expected score-improvement policy
- hybrid staged policies

Measure:
- score vs query budget curves
- posterior entropy reduction curves
- performance under repeated window allocation

## 26. Calibration / fallback ablations

Exhaust:
- fixed floor only
- temperature scaling
- shrinkage to map-only baseline
- novelty-gated shrinkage
- ensemble averaging with uncertainty weights

Measure:
- KL stability
- tail robustness
- held-out score

---

# Part VIII — Query-policy philosophy for this family

## 27. Core policy principle

The policy is not about seeing the whole world. The map is already known. The unknown is the **round regime**.

Therefore the policy must maximize **regime identifiability** first and **score-relevant refinement** second.

The likely best structure is:
1. early diagnostic motif queries
2. repeated queries on the most regime-informative windows
3. late score-sensitive refinement in high-entropy frontier regions

Do not assume broad tiling is optimal once the offline model is strong.

## 28. How to discover diagnostic motifs

From replay:
- mine motif classes across historical rounds
- estimate how different rounds separate on the year-50 response distributions of those motifs
- rank motifs by mutual information with beta / round identity / score-relevant residuals
- keep a compact motif library

The policy should query motif *instances* on the current maps, not arbitrary coordinates.

---

# Part IX — Evaluation and falsification rules

## 29. Hard evaluation rule

**All cross-round claims must be validated leave-one-round-out.**

Episodes are not the sample size. Rounds are the sample size.

Never claim generalization because a model did well on random episode splits.

## 30. What counts as real progress

A change is real progress if it improves at least one of:
- held-out historical benchmark score
- held-out calibration under the actual loss
- score/query-efficiency curve under held-out rounds
- speed at equal score
- robustness / OOD handling without harming score

If not, record and discard.

## 31. Failure criteria for this family

If, after honest iteration, you find any of the following, downweight the family:
- round variation is not low-rank enough for tiny beta
- transcript->beta mapping remains too weak even under optimized queries
- map-conditioned decoder dominates and beta adds little
- retrieval/interpolation is unstable across held-out rounds
- direct discriminative student consistently beats beta-mediated models with less complexity

Do not cling to the family for aesthetic reasons.

---

# Part X — Suggested concrete pseudocode skeleton

## 32. Historical preprocessing

```python
for round_id in historical_rounds:
    replay_paths = load_all_replays(round_id)
    maps = load_initial_maps(round_id)
    final_tensors = load_ground_truth_tensors(round_id)

    summary = extract_round_summary(
        maps=maps,
        replay_paths=replay_paths,
        final_tensors=final_tensors,
    )
    save_round_summary(round_id, summary)
```

## 33. Baseline + manifold extraction

```python
summaries = [load_round_summary(r) for r in historical_rounds]
maps = [load_initial_maps(r) for r in historical_rounds]
final_tensors = [load_ground_truth_tensors(r) for r in historical_rounds]

baseline = train_map_only_decoder(maps, final_tensors)
residuals = compute_round_residuals(baseline, maps, final_tensors)

beta = learn_round_manifold(
    summaries=summaries,
    residuals=residuals,
    method=config.manifold_method,
    q=config.q,
)

decoder = train_decoder(
    maps=maps,
    beta=beta,
    final_tensors=final_tensors,
    method=config.decoder_method,
)
```

## 34. Synthetic live episodes

```python
for round_id in historical_rounds:
    for episode_idx in range(num_synth_episodes):
        transcript = simulate_live_transcript(
            round_id=round_id,
            policy=config.policy_for_episode_generation,
            query_budget=50,
        )
        save_episode(round_id, episode_idx, transcript)
```

## 35. Posterior model

```python
posterior_model = train_transcript_to_beta_model(
    episodes=load_all_episodes(),
    beta_targets=beta,
    method=config.posterior_method,
)
```

## 36. Online prediction

```python
def predict_current_round(round_maps, live_transcript):
    beta_post = posterior_model.infer(round_maps, live_transcript)
    pred = integrate_decoder_over_beta(decoder, round_maps, beta_post)
    pred = calibrate_and_gate(pred, beta_post, round_maps, live_transcript)
    return pred
```

---

# Part XI — Practical implementation notes

## 37. Representation choices that are likely worth it

Use explicit geometry features. At minimum:
- coast indicator / sea adjacency
- land geodesic distance to each initial settlement
- sea geodesic distance / maritime centrality for coastal cells
- mountain barrier depth / connectivity components
- local forest neighborhood statistics
- tie margins between nearest influence basins
- frontier indicators

Do not rely on raw grids alone. The family is too data-poor at the round level for that.

## 38. Storage / caching suggestions

Cache at least:
- map static features per seed
- per-round summary objects
- motif catalogs per map
- synthetic transcript episodes
- learned beta per historical round
- decoder features if expensive

## 39. Speed priorities

Highest speed wins likely come from:
- avoiding recomputation of replay summaries
- vectorized motif extraction
- precomputing query-candidate motif instances
- lightweight posterior models for online loops
- decoder design that avoids heavy Monte Carlo online

---

# Part XII — Best current recommendation (starting point)

## 40. Recommended starting model stack

Start with the most plausible strong version, not the fanciest:

### Historical teacher side
- per-round `multiview` summaries combining:
  - global time curves
  - hazard coefficients
  - motif response summaries
- low-rank supervised manifold with `q = 3` first
- shared decoder = map-only baseline + linear response modes

### Online side
- transcript summary built from diagnostic motif windows
- posterior model = local linear regression to beta with a learned low-rank metric
- fallback particle historical-round mixture
- calibration via shrinkage toward baseline when OOD / diffuse

### Query policy
- fixed diagnostic motif library first
- repeated queries on top-separating motif instances
- benchmark against coverage baseline

This stack is fast, interpretable, and aligned with the statistical constraints.

Only after this is stable should you escalate to GP beta inference, nonlinear decoders, or more elaborate metric learning.

---

# Part XIII — Final strategic reminders

## 41. What matters most

The most important thing is **not** a specific algorithm.

It is proving or disproving this chain:
1. replay lets us estimate accurate per-round operator summaries
2. per-round summaries lie on a tiny manifold
3. that manifold is predictable from 50 terminal-window queries
4. a shared decoder can convert manifold coordinates into high-quality final tensors

If all four are true, this family can be world-class.
If any of the middle links fail badly, the family should be demoted.

## 42. What to keep repeating to yourself

- rounds, not episodes, determine regime sample size
- compress round variation ruthlessly
- make query policy about regime identifiability
- evaluate leave-one-round-out only
- benchmark constantly
- cache aggressively
- commit and push constantly
- document everything

## 43. Definition of exhausting this family

You have **not** exhausted the family until you have tried, benchmarked, and recorded evidence for at least:
- all major summary types
- multiple manifold extraction methods
- multiple decoders
- multiple posterior/retrieval models
- multiple query policies
- multiple calibration / OOD strategies
- ensembles of the strongest variants

and until the experiment ledger shows diminishing returns with no clear unexplored branch left in the family tree.

Do not stop early. But do not wander aimlessly either.

Proceed systematically.

