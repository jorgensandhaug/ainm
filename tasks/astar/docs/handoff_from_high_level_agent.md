# Astar Island replay-driven architecture and implementation brief

Audience: coding agent continuing the current scaffold.

Primary goal: refactor the current scaffold into a **replay-driven research operating system** that supports:
- live-round querying and submission,
- historical replay ingestion,
- privileged offline teacher training,
- online posterior inference for current rounds,
- synthetic episode generation for student training,
- offline policy learning,
- full observability, diagnostics, and correctness checking.

This brief assumes two classes of facts:

1. **Officially documented constraints** (must be encoded as hard invariants or boundary assumptions):
   - active rounds expose only `/simulate`, not trajectories;
   - `/simulate` returns a stochastic year-50 viewport and settlement marks;
   - the score is entropy-weighted KL on a final `H x W x 6` tensor;
   - each round has 5 seeds and 50 shared queries;
   - initial maps are visible and mountains are static; class 0 collapses ocean/plains/empty.

2. **User-verified replay premise** (must be supported architecturally, even if not part of official docs):
   - for completed rounds there is effectively unlimited stochastic replay;
   - replay yields full-map state at each year 0..50;
   - replay includes settlement/full state information, not just cell classes;
   - the coding agent will have access to a replay folder locally and must inspect its concrete format.

---

## 0. Keep these design theses verbatim

These are the core conceptual guardrails. Preserve them in docs and code comments.

- **The native object is an episode.**
- **Historical rounds learn phi; current rounds infer z.**
- **Rich teacher, tiny latent, disciplined student.**
- **Specific in mechanics, abstract in regime.**
- **Immutable raw artifacts; normalized derived views; reproducible reports.**
- **Do not let notebooks contain unique logic.**
- **Do not retrain the universe from 50 live queries.**
- **Do not treat final marginals as if they define the replay patch joint law.**

Interpretation:
- `phi` = parameters of **our** world model / emulator family.
- `z_r` = round-specific latent regime.
- `F_phi(M, z)` = terminal decoder / terminal distribution operator.
- `G_phi(M, A, z)` = live query observation law for final-window patches.
- `K_phi,z` = replay-time transition law / yearly dynamics operator.

---

## 1. What changes because replay exists

Without replay, the project is mostly a terminal operator learning problem.
With replay, it becomes a **privileged offline system identification + online latent inference** problem.

The asymmetry is everything:
- within a completed round, you can have many replay trajectories under one fixed regime;
- across rounds, you still only have however many rounds exist, so distinct regimes are scarce.

This implies:
- teacher dynamics may be moderately rich;
- cross-round variation must be modeled **very parsimoniously**;
- online inference should solve only for a small `z_r` (and possibly a tiny local correction), not for all of `phi`.

In other words:
- historical replay is for learning dynamics, hazards, regime summaries, and terminal decoders;
- live current-round queries are for **posterior collapse in low-dimensional round space**.

---

## 2. Immediate critique of the current scaffold and what to preserve

### Preserve

Keep the current high-level package split:
- `core/`
- `infra/`
- `features/`
- `observe/`
- `models/`
- `eval/`
- `workflows/`

Keep the philosophy that:
- domain logic is pure,
- IO is at the edges,
- the CLI is the operational surface,
- artifacts are immutable and catalogued.

### Refactor aggressively

The current scaffold is still **terminal-query-centric**. It is missing a first-class historical replay subsystem and a teacher/student split.

Specific issues:
- `workflows/replay_round.py` is misnamed and too shallow; it only fetches analysis tensors and backtests a predictor.
- `models/latent_regime.py` is placeholder logic and conflates posterior inference, decoder modes, and baseline composition.
- `features/geometry.py` is a good seed but far too weak for the actual geometry needed.
- `infra/catalog/schema.sql` is missing replay, datasets, runs, metrics, model artifacts, splits, and derived summaries.
- there is no explicit episode abstraction,
- no replay ingestion abstraction,
- no dataset builder layer,
- no teacher dynamics layer,
- no student/distillation layer,
- no offline policy-training environment,
- no serious visualization/reporting subsystem.

---

## 3. Target architecture after refactor

Use the existing scaffold as a base, but evolve it into this bounded-context shape:

```text
src/astar/
  core/
  infra/
  history/
    replay/
    episodes/
    datasets/
    summaries/
  features/
  observe/
  teacher/
    dynamics/
    decoder/
    regime/
  student/
    posterior/
    predictor/
    distill/
  policy/
  eval/
  viz/
  workflows/
  cli.py
```

### Bounded contexts

#### `core/`
Pure types, invariants, scoring, tensor contracts, state semantics, transition/event enums.
No filesystem, no network, no training.

#### `infra/`
API client, replay-source adapters, artifact store, catalog DB, settings, serialization.
No geometry, no model math.

#### `history/replay/`
Replay ingestion and normalization.
This package should be able to inspect the replay folder you have locally and convert whatever it contains into typed trajectories.

#### `history/episodes/`
Builds episode objects from raw historical sources:
- initial maps,
- replay trajectories,
- live query logs,
- post-round ground truth,
- submissions.

#### `history/datasets/`
Constructs supervised datasets for:
- teacher transition training,
- terminal decoder training,
- student synthetic-live episodes,
- offline query-policy training,
- diagnostics/calibration.

#### `history/summaries/`
Round-level hazard summaries, transition statistics, regime summary extraction, low-rank residual fitting.
This layer is crucial.

#### `features/`
Deterministic geometry, topology, graph features, spectral bases, motif detectors.
Only depends on known initial maps.

#### `observe/`
Live evidence acquisition and live transcript handling.
This stays current-round only.

#### `teacher/`
Privileged offline models that may see replay trajectories and terminal truths.

#### `student/`
Models that only see what will exist during a live round:
- initial maps,
- query transcript,
- optionally prior summaries.

#### `policy/`
Acquisition logic and offline policy training.
Should depend on student/teacher interfaces, not on raw infra.

#### `eval/`
Backtests, calibration, ablations, residual atlases, leaderboard-style evaluations.

#### `viz/`
All plotting/report rendering. No business logic.

---

## 4. Non-negotiable data contracts

### 4.1 Episode is the native object

Create a first-class `RoundEpisode` object.

```python
@dataclass(frozen=True, slots=True)
class RoundEpisode:
    round_id: str
    round_number: int | None
    status: str
    seeds: tuple[SeedEpisode, ...]
    metadata: RoundMetadata
    live_transcript: LiveTranscript | None
    replay_bundle: ReplayBundle | None
```

```python
@dataclass(frozen=True, slots=True)
class SeedEpisode:
    seed_index: int
    initial_state: InitialWorldState
    terminal_truth: TerminalTruth | None
    submitted_prediction: FloatTensor | None
    replay_runs: tuple[ReplayRunRef, ...] = ()
```

### 4.2 Full historical replay state types

```python
@dataclass(frozen=True, slots=True)
class SettlementFullState:
    settlement_id: str | None
    x: int
    y: int
    population: float | None
    food: float | None
    wealth: float | None
    defense: float | None
    tech_level: float | None
    has_port: bool
    longship_count: float | None
    owner_id: int | None
    alive: bool
```

```python
@dataclass(frozen=True, slots=True)
class WorldFrame:
    t: int  # 0..50
    grid: IntGrid  # H x W, keep 8-state internal codes
    settlements: tuple[SettlementFullState, ...]
```

```python
@dataclass(frozen=True, slots=True)
class ReplayRun:
    replay_run_id: str
    round_id: str
    seed_index: int
    stochastic_key: str | None  # whatever replay gives; else digest/ordinal
    frames: tuple[WorldFrame, ...]  # length 51 if including t=0
    source_digest: str
```

### 4.3 Terminal truth remains separate from replay

Do not conflate a replay run with terminal ground truth.
Ground truth is a Monte-Carlo aggregate distribution; replay run is one sample path.

```python
@dataclass(frozen=True, slots=True)
class TerminalTruth:
    probs: FloatTensor  # H x W x 6
    score_against_submission: float | None = None
```

### 4.4 Live transcript remains its own object

```python
@dataclass(frozen=True, slots=True)
class LiveTranscript:
    observations: tuple[LiveQueryObs, ...]
```

Each `LiveQueryObs` should retain:
- raw viewport,
- clamped viewport,
- sampled grid patch,
- sampled settlement table,
- request/response artifact digests,
- query order,
- budget counters.

---

## 5. Storage and catalog redesign

### 5.1 Keep code and mutable state separate

Continue keeping mutable state outside the repo, e.g. under `ASTAR_HOME/`:

```text
$ASTAR_HOME/
  catalog.duckdb
  blobs/
  cache/
  datasets/
  runs/
  reports/
```

### 5.2 Use raw immutable blobs + normalized metadata + derived datasets

Recommended storage primitives:
- raw replay/source payloads: JSON / msgpack / archived originals
- dense tensors/trajectories: Zarr or chunked NPZ (prefer Zarr for large replay corpora)
- tables: Parquet
- catalog: DuckDB

### 5.3 Expand catalog schema substantially

Add at least these tables:

- `rounds`
- `seed_initial_states`
- `live_query_events`
- `submission_events`
- `analysis_events`
- `replay_sources`
- `replay_runs`
- `replay_frame_stats`
- `trajectory_summary_events`
- `round_summary_events`
- `dataset_builds`
- `synthetic_episode_builds`
- `training_runs`
- `checkpoints`
- `metric_events`
- `report_events`

Strong recommendation: make **everything** an immutable event with digests.

### 5.4 Add model lineage

Every trained model/checkpoint should store:
- model family,
- exact Python spec import path,
- git sha,
- data snapshot digest,
- feature manifest digest,
- training split id,
- metric summary,
- artifact digest for checkpoint.

Do not rely on ad hoc filenames.

---

## 6. Replay ingestion subsystem: highest-priority new component

The coding agent will have a replay folder locally. Do not assume format. Implement an adapter layer.

### 6.1 Required abstraction

```python
class ReplaySource(Protocol):
    def discover_runs(self) -> Iterable[ReplayRunHandle]: ...
    def load_run(self, handle: ReplayRunHandle) -> ReplayRunPayload: ...
```

Implement at least:
- `FolderReplaySource`
- maybe later `ApiReplaySource`

### 6.2 Ingestion workflow

1. inspect replay folder structure,
2. identify round/seed/run/frame/state metadata,
3. preserve original raw payloads as immutable blobs,
4. normalize to `ReplayRun` typed objects,
5. store frame tensors and settlement tables,
6. compute quick frame-level stats,
7. register in catalog.

### 6.3 Important invariant

Do **not** let replay ingestion decide modeling semantics.
Its job is only to canonicalize the raw replay asset into typed historical trajectories.

### 6.4 Golden tests required

Use a tiny replay fixture and test:
- frame count parsed correctly,
- initial frame equals documented initial state when appropriate,
- settlement tables round-trip,
- grid codes are preserved exactly,
- multiple stochastic replays of same round/seed remain distinct runs.

---

## 7. Feature engine redesign

The current `features/geometry.py` is too primitive. Expand it into a real geometry package.

### 7.1 Add graph constructions

Build at least:
- land graph,
- sea graph,
- mixed mobility graph (land + maritime access),
- coastal interface graph,
- initial settlement influence graph.

### 7.2 Add feature families

Per-cell deterministic features:
- coast mask,
- ocean adjacency,
- fjord depth / marine penetration,
- forest adjacency counts,
- mountain barrier depth,
- land distance to nearest settlement,
- land distance gap between nearest and second nearest settlement,
- sea distance to nearest coastal founder,
- mixed geodesic distance,
- settlement-basin membership,
- basin tie margin,
- local corridor/chokepoint score,
- spectral coordinates from graph Laplacians,
- effective-resistance-like summaries if feasible.

Per-settlement deterministic features:
- coastal exposure,
- basin size,
- nearest rival distance,
- maritime centrality,
- frontier pressure,
- forest support around founder,
- barrier shielding.

### 7.3 Feature manifests

Every feature build should emit a manifest/digest so downstream models know exactly what feature version they were trained on.

---

## 8. Historical summary and hazard extraction pipeline

This is the first serious modeling layer and should be built **before** the big neural teacher.

### 8.1 Why

Because replay gives massive within-round data, but distinct rounds are scarce.
You need a compressive intermediate representation of each round before learning cross-round structure.

### 8.2 Extract event-level transition summaries from replay

For each replay run, estimate events such as:
- build/colonization,
- port formation,
- owner change,
- collapse to ruin,
- ruin persistence,
- ruin -> forest,
- ruin -> rebuilt,
- alive survival,
- first-settlement arrival time,
- first-port time,
- occupancy duration,
- ruin duration,
- forest reclamation lag.

Aggregate across replay runs within the same round/seed to estimate empirical hazards and arrival distributions.

### 8.3 Build per-round effective coefficients

Fit semimechanistic hazard surfaces conditioned on deterministic geometry + local context. Examples:

```python
lambda_birth(u, t | round)
lambda_port(u, t | round)
lambda_collapse(u, t | round)
lambda_reclaim(u, t | round)
lambda_owner_flip(u, t | round)
```

Do this per round first. Then factorize the fitted coefficient vectors across rounds using low-rank methods.

### 8.4 Why this matters

This is the cleanest way to discover whether the regime manifold is low-dimensional in practice.
It also gives you a strong interpretable baseline and a hedge against neural misspecification.

---

## 9. Model stack to support

The codebase must support multiple model families behind common interfaces.
Do **not** hardwire a single ontology.

### 9.1 Family A: semimechanistic hazard baseline

This should become the first serious nontrivial model.

Properties:
- data-efficient,
- interpretable,
- aligned with replay summaries,
- useful as ensemble member and diagnostic baseline.

### 9.2 Family B: grey-box teacher dynamics model

This is the high-ceiling model.

Requirements:
- recurrent yearly update,
- explicit local grid component,
- explicit settlement interaction graph component,
- global/regional round latent modulation,
- optional submodules named after docs phases (growth/conflict/trade/winter/environment),
- output both next-state prediction and terminal tensor approximation.

Important: phase-named modules are inductive bias, not necessarily literal access to true sub-phase states.

### 9.3 Family C: fast student posterior/predictor

This is the online model.
It only sees:
- initial maps,
- query transcript,
- maybe cached prior summaries.

It must support:
- posterior inference over `z_r`,
- direct final tensor prediction,
- distillation targets from teacher.

### 9.4 Family D: observation emulator

Needed for:
- offline active-learning policy training,
- synthetic transcript generation,
- likelihood-style posterior inference,
- regime-discriminative query scoring.

If teacher is good enough, `G_phi` may be induced by rollout + viewport sampling.
Still expose it as its own interface.

### 9.5 Family E: retrieval / kernel fallback

Simple round-embedding retrieval model. Keep as fallback and ensemble component.

---

## 10. Interfaces to implement now

### 10.1 Teacher interfaces

```python
class DynamicsTeacher(Protocol):
    name: str

    def fit(self, dataset: "ReplayDataset") -> "DynamicsTeacher": ...
    def encode_round(self, episode: RoundEpisode) -> np.ndarray: ...
    def rollout(self, seed: SeedEpisode, regime: np.ndarray, n_rollouts: int, horizon: int = 50) -> "RolloutBatch": ...
    def terminal_tensor(self, seed: SeedEpisode, regime: np.ndarray, n_rollouts: int = 256) -> FloatTensor: ...
```

### 10.2 Student interfaces

```python
class PosteriorStudent(Protocol):
    name: str

    def infer_regime(self, context: "LiveInferenceContext") -> "RegimePosteriorState": ...
    def predict_seed(self, context: "LiveInferenceContext", seed_index: int) -> FloatTensor: ...
```

### 10.3 Observation model interfaces

```python
class ObservationModel(Protocol):
    name: str

    def sample_patch(self, seed: SeedEpisode, regime: np.ndarray, viewport: Viewport, n: int = 1) -> list[LiveQueryObs]: ...
    def log_prob(self, obs: LiveQueryObs, seed: SeedEpisode, regime: np.ndarray) -> float: ...
```

### 10.4 Query policy interface

```python
class QueryPolicy(Protocol):
    name: str

    def initial_plan(self, context: "PlanningContext") -> list[PlannedQuery]: ...
    def next_query(self, context: "PlanningContext") -> PlannedQuery | None: ...
```

### 10.5 Dataset builder interfaces

```python
class DatasetBuilder(Protocol):
    name: str
    def build(self, catalog: Catalog, spec: object) -> "DatasetRef": ...
```

---

## 11. Training environment design

### 11.1 Separate training products

Build four dataset builders:

1. `teacher_transition_dataset`
   - next-state / rollout supervision from replay.

2. `teacher_terminal_dataset`
   - final tensor supervision from historical analysis.

3. `student_synthetic_episode_dataset`
   - simulate active-round conditions by revealing only allowed final-window observations from historical episodes.

4. `policy_offline_env_dataset`
   - historical episodes with synthetic stochastic query outcomes for offline policy evaluation/training.

### 11.2 Synthetic episode generation is core, not optional

For each historical round:
- hide replay + truth from the student,
- reveal only initial maps,
- reveal a sampled sequence of allowed query observations,
- require prediction of the true final tensor.

This should mimic current-round constraints exactly.

### 11.3 Distillation should be explicit

Teacher sees privileged replay.
Student does not.
The code should make that asymmetry explicit in dataset builders and model interfaces.

### 11.4 Keep training specs in Python, not YAML

Continue using Python import-path run specs for training jobs.

---

## 12. Query-policy training environment

Now that replay exists, the repo should support genuine offline policy learning.

### 12.1 Add candidate-window enumerators

Enumerate all valid 15x15 windows (and edge-clamped equivalents if needed).
For default 40x40 maps, this action set is finite and manageable.

### 12.2 Add three policy families

1. `coverage_policy`
   - legacy baseline.

2. `diagnostic_then_replicate_policy`
   - early motif queries, then repeats, then frontier refinement.

3. `score_aligned_policy`
   - uses student/teacher disagreement or predictive information heuristics.

Later:
4. learned policy optimized on historical synthetic episodes.

### 12.3 Policy evaluation metrics

Track not just final score, but:
- posterior entropy reduction in regime space,
- predicted entropy reduction on high-value cells,
- score vs budget curves,
- query redundancy,
- calibration after each additional query.

---

## 13. Observability and visualization requirements

This is mandatory.
The system must make it easy to understand whether each part is working.

### 13.1 Replay/history visualizations

Implement at least:
- replay movie viewer,
- time-slice grid viewer,
- per-cell first-hit-time maps,
- per-cell ruin duration maps,
- port-birth-time maps,
- owner-domain evolution plots if owner ids exist,
- replay ensemble aggregate maps for one round/seed,
- transition heatmaps between years.

### 13.2 Round/regime visualizations

Implement:
- round embedding scatter plots,
- round residual atlases,
- mode contribution visualizations,
- per-round hazard coefficient plots,
- regime posterior collapse as queries arrive.

### 13.3 Final-prediction diagnostics

Implement:
- predicted entropy maps,
- true entropy maps,
- weighted KL maps,
- classwise reliability curves,
- confidence-vs-error plots,
- score decomposition by motif / geometry bin,
- residual maps by class.

### 13.4 Query diagnostics

Implement:
- coverage heatmaps,
- repeat-count heatmaps,
- query utility attribution maps,
- diagnostic motif overlays,
- posterior change per query.

---

## 14. Testing and correctness

The project is now rich enough that sloppy tests will sink it.

### 14.1 Unit tests

- terrain-code mapping
- static invariants
- score implementation
- tensor validation
- geometry primitives
- replay frame parsing
- settlement state round-trip
- event extraction from trajectories

### 14.2 Integration tests

- ingest replay fixture -> normalized `ReplayRun`
- live query -> artifact -> catalog -> evidence state
- analysis fetch -> terminal truth -> backtest
- synthetic episode builder -> dataset outputs

### 14.3 Regression tests

- known historical round backtest scores for baseline predictor
- hazard-summary metrics on frozen replay fixture
- student predictions on frozen synthetic episode
- report generation snapshots

### 14.4 Property tests

- predicted probabilities always sum to 1
- static cells remain support-correct
- replay ingestion is deterministic from fixed input
- score finite under probability floor
- multiple replay runs of same round/seed remain distinct

---

## 15. Concrete module-by-module implementation instructions

### 15.1 `core/`

Add:
- `core/world_state.py`
- `core/trajectory.py`
- `core/events.py`
- `core/invariants.py`

Refactor existing `types.py` so it does **not** become a dumping ground.
Split terminal-query types from replay types.

### 15.2 `infra/`

Add:
- `infra/replay_source/base.py`
- `infra/replay_source/folder.py`
- `infra/serialization/zarr_store.py`
- `infra/catalog/migrations/`

Expand catalog repository with append-only methods for replay runs, datasets, training runs, metrics, and reports.

### 15.3 `history/replay/`

Add:
- `ingest.py`
- `normalize.py`
- `inspect.py`
- `frame_stats.py`

This package should be the first thing the coding agent builds after the schema refactor.

### 15.4 `history/summaries/`

Add:
- `events.py`
- `hazards.py`
- `round_coefficients.py`
- `factorize.py`
- `manifold.py`

The first milestone is a pipeline that can compute per-round summary coefficients and show whether they are low-rank across rounds.

### 15.5 `teacher/`

Add:
- `teacher/dynamics/base.py`
- `teacher/dynamics/hazard_teacher.py`
- `teacher/dynamics/greybox_teacher.py`
- `teacher/decoder/terminal.py`
- `teacher/regime/encoder.py`

Build the semimechanistic hazard teacher first.
The grey-box neural teacher comes only after the summary pipeline is stable.

### 15.6 `student/`

Add:
- `student/posterior/base.py`
- `student/posterior/deepset_student.py`
- `student/predictor/direct.py`
- `student/distill/losses.py`

Student should accept a transcript as a set of observations, not as a naive concatenated tensor.
Repeated identical windows are informative replicates and must be preserved as such.

### 15.7 `policy/`

Add:
- `policy/base.py`
- `policy/coverage.py`
- `policy/diagnostic.py`
- `policy/score_aligned.py`
- `policy/offline_env.py`

### 15.8 `viz/`

Add:
- `viz/replay.py`
- `viz/entropy.py`
- `viz/residuals.py`
- `viz/regime.py`
- `viz/policy.py`
- `viz/reports.py`

### 15.9 `workflows/`

Split current workflows into explicit use cases:
- `sync_round.py`
- `fetch_analysis.py`
- `ingest_replay_folder.py`
- `summarize_replay.py`
- `build_synthetic_episodes.py`
- `train_teacher.py`
- `train_student.py`
- `train_policy.py`
- `run_live_round.py`
- `backtest.py`
- `make_report.py`

---

## 16. High-level code skeletons the agent can use immediately

### 16.1 Live inference context

```python
@dataclass(frozen=True, slots=True)
class LiveInferenceContext:
    round_episode: RoundEpisode
    geometry_bundle: GeometryBundle
    transcript: LiveTranscript
    prior_summary: PriorSummaryBundle | None
```

### 16.2 Posterior state

```python
@dataclass(frozen=True, slots=True)
class RegimePosteriorState:
    mean: np.ndarray
    cov: np.ndarray | None
    particles: tuple[np.ndarray, ...] | None = None
    weights: np.ndarray | None = None
```

### 16.3 Prior summary bundle

```python
@dataclass(frozen=True, slots=True)
class PriorSummaryBundle:
    terminal_prior: tuple[FloatTensor, ...]          # one per seed
    entropy_prior: tuple[np.ndarray, ...]            # one per seed
    motif_maps: tuple[dict[str, np.ndarray], ...]    # one per seed
    round_embedding_bank: np.ndarray | None = None
```

### 16.4 Terminal predictor composition

```python
class PosteriorPredictor(Predictor):
    def __init__(self, student: PosteriorStudent, decoder: TerminalDecoder, calibrator: Calibrator):
        self.student = student
        self.decoder = decoder
        self.calibrator = calibrator

    def predict_seed(self, context: LiveInferenceContext, seed_index: int) -> FloatTensor:
        post = self.student.infer_regime(context)
        probs = self.decoder.posterior_predictive(context.round_episode.seeds[seed_index], post)
        return self.calibrator.apply(probs, context.round_episode.seeds[seed_index].initial_state.grid)
```

### 16.5 Dataset builder for student training

```python
class SyntheticEpisodeBuilder:
    def build(self, historical_episode: RoundEpisode, policy: QueryPolicy, budget: int = 50) -> SyntheticEpisode:
        # Hide replay and terminal truth from the student view.
        # Use replay samples or observation emulator to produce only allowed live observations.
        ...
```

---

## 17. Milestone order (strict)

### Milestone 1: replay as a first-class data source
- build replay source adapter
- ingest replay folder
- store normalized trajectories
- compute frame stats
- add basic replay visualizations

### Milestone 2: historical summary pipeline
- extract transition events
- compute round-specific hazard summaries
- factorize round summaries across rounds
- test whether round residual structure is low-rank

### Milestone 3: stronger baseline family
- replace current geometry baseline with geometry + hazard prior
- add entropy prior
- add retrieval fallback
- improve reports and residual atlases

### Milestone 4: synthetic episode generation
- create active-round-style historical episodes
- train a disciplined student with direct tensor loss
- distill teacher summaries where available

### Milestone 5: grey-box teacher
- add richer recurrent dynamics model
- compare against semimechanistic hazard teacher
- keep both as ensemble members if useful

### Milestone 6: offline query policy learning
- build policy environment
- benchmark heuristic policies
- optionally train a learned policy

### Milestone 7: live-round hardening
- robust budget-aware workflow
- safe submission pipeline
- report generation during rounds
- posterior tracking by query order

---

## 18. What not to do

- Do not hardcode replay file format assumptions into core domain code.
- Do not let teacher-only privileged info leak into live-round inference interfaces.
- Do not train a giant generic latent model first.
- Do not skip the hazard-summary / regime-factorization stage.
- Do not collapse internal 8-state terrain to 6 classes until the scoring boundary.
- Do not model current-round learning as re-fitting `phi`.
- Do not put important logic only in notebooks.
- Do not use YAML for experiments, models, or pipeline definitions.
- Do not confuse one replay sample path with the Monte-Carlo terminal truth.

---

## 19. The single sharpest modeling picture to preserve

Everything should be organized around this decomposition:

```text
Historical offline:
    replay trajectories + terminal truths -> learn K_phi,z, F_phi, G_phi, p(z)

Current online:
    initial maps + live transcript D_r -> infer q(z_r | M_r, D_r)
    posterior predictive:
        P_hat_r = ∫ F_phi(M_r, z) q(z | M_r, D_r) dz
```

And under replay, the best practical philosophy is:

- **rich teacher** from replay,
- **tiny regime manifold** across rounds,
- **disciplined student** for live rounds,
- **score-aligned query policy** trained or validated offline,
- **strong semimechanistic baseline** always kept alive for robustness.


