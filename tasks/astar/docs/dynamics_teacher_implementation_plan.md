# Dynamics Teacher Implementation Plan

This doc turns `handoff5_dynamics_model.md` into an implementation target for this repo.

It answers one question:

What should the next teacher actually be, given what the repo already has?

Short answer:

- keep the existing replay measurement + round-summary + regime-manifold work
- replace the current terminal-only `HazardTeacher` with a real yearly transition teacher
- model yearly dynamics on a hybrid grid-plus-settlement state with a tiny round latent

This is the step after:

- [per_round_dynamic_law_blueprint.md](/home/jorge/ainm/tasks/astar/docs/per_round_dynamic_law_blueprint.md)
- [regime_model_implementation_plan.md](/home/jorge/ainm/tasks/astar/docs/regime_model_implementation_plan.md)

## Decision

The target teacher is:

- a partially observed stochastic state-space model
- with hand-specified state structure
- with a learned grey-box yearly transition kernel
- with one tiny round latent `z_r` shared across the 5 seeds in a round

Concretely:

- static geometry `G`
- dynamic site grid `C_t`
- dynamic settlement table `S_t`
- optional hidden memory `H_t`
- round latent `z_r`

and yearly evolution

- `X_t = (G, C_t, S_t, H_t)`
- `X_{t+1} ~ K_{phi,z_r}(X_t, noise_t)`

This is not:

- a cellwise Markov chain
- a direct terminal decoder only
- a giant generic sequence model

## Current Repo Truth

What already exists and should be reused:

- replay-derived measurement families in [measurements.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/measurements.py)
- per-round dynamic-law / behavioral-fingerprint summaries in [dynamic_law.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/dynamic_law.py) and [behavioral_fingerprint.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/behavioral_fingerprint.py)
- cross-round low-rank regime factorization in [regime_validation.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/regime_validation.py)
- a first teacher/student wiring path in [hazard_teacher.py](/home/jorge/ainm/tasks/astar/src/astar/teacher/dynamics/hazard_teacher.py) and [deepset_student.py](/home/jorge/ainm/tasks/astar/src/astar/student/posterior/deepset_student.py)

Important: current `HazardTeacher` is not yet a dynamics teacher.

Today it does this:

- encode replay-backed rounds into a small summary/regime coordinate
- map regime linearly into semimechanistic terminal coefficients
- decode those coefficients directly into final class probabilities

Current gaps:

- no learned yearly state transition kernel
- no settlement graph interaction module
- no explicit settlement mark dynamics
- no learned ruin lifecycle dynamics
- no real rollout; `rollout()` currently reuses stored replay trajectories
- student is still nearest-neighbor over crude transcript summaries, not a real set encoder

So the handoff direction is compatible with current repo work, but the actual teacher has not been built yet.

## State To Model

The minimum useful teacher state is:

### 1. Static geometry `G`

Deterministic features from initial map only:

- buildable / land / coast / ocean / mountain
- land and sea reachability
- basin gap / chokepoint / frontier features
- forest / mountain local density

Most of this already exists in [features/](/home/jorge/ainm/tasks/astar/src/astar/features) and in replay measurement tables.

### 2. Dynamic site grid `C_t`

Per cell:

- current collapsed terrain class
- ruin age proxy if applicable
- optional recent local event flags

### 3. Dynamic settlement table `S_t`

Per live or present settlement:

- position
- alive
- has_port
- owner_id
- population
- food
- wealth
- defense
- optional learned settlement memory vector

### 4. Small hidden memory `H_t`

Only if needed after a no-memory baseline:

- small global yearly-shock state
- small per-settlement memory for unobserved simulator state

Do not start with much hidden memory. The replay state already exposes a lot.

### 5. Tiny round latent `z_r`

- shared across the 5 seeds in a round
- learned offline from replay summaries
- inferred online from transcript evidence

Start with:

- continuous `d = 4`
- test `d = 6` only if holdout improves

Discrete archetypes can come later if the round manifold clearly clusters.

## Yearly Kernel Structure

The yearly kernel should be structured, not monolithic.

Use the documented phase order as inductive bias:

1. growth-like updates
2. conflict-like updates
3. trade-like updates
4. winter-like updates
5. environment / ruin / reclaim updates

Do not assume replay labels those subphases directly.

Do use them to decide module boundaries.

## Teacher Architecture

The first real teacher should be an event-based stochastic graph-cell simulator.

### Grid module

Purpose:

- local build / reclaim / forest / ruin behavior
- local support features around candidate sites

Input:

- static geometry channels
- current site class channels
- local settlement occupancy / port / ruin masks
- local aggregated graph messages
- broadcast round latent `z_r`

Output features feed:

- site opportunity heads
- ruin lifecycle heads

### Settlement graph module

Nodes:

- current settlements

Edges:

- top-k land reachable pairs
- top-k sea reachable pairs
- same-owner and other-owner pairs both kept

Node inputs:

- settlement marks
- local geometry features at site
- nearby counts
- broadcast `z_r`

Edge inputs:

- land distance
- sea distance
- maritime pair flag
- same-owner flag
- relative marks
- chokepoint / basin asymmetry if available

Outputs:

- node messages for settlement heads
- pooled local messages back onto nearby grid cells

### Head families

Use the replay measurement families already present in [measurements.py](/home/jorge/ainm/tasks/astar/src/astar/history/summaries/measurements.py).

#### Site opportunity heads

Train on `site_opportunities`.

Predict:

- birth
- rebuild
- site ruin created
- rebuild as port
- ruin to forest
- ruin to empty

#### Live settlement heads

Train on `settlement_measurements` or `live_settlement_transitions`.

Predict:

- collapse
- collapse to ruin
- port gain
- port loss
- owner flip
- population delta
- food delta
- wealth delta
- defense delta

#### Ruin lifecycle heads

Train on `ruin_transitions`.

Predict:

- remain ruin
- rebuild settlement
- rebuild port
- reclaim forest
- fade empty

#### Pairwise interaction encoder

Train on `pairwise_candidates`.

Do not force a fake `trade yes/no` label.

Use it to learn interaction messages predictive of:

- destination collapse next
- destination owner flip next
- destination port gain next
- optional destination mark deltas

#### Global shock head

Train on `year_shocks`.

Predict or infer:

- birth / collapse / owner-flip / port-change aggregate rates
- shared yearly shock embedding

This is the clean place to encode winter-like common shocks.

## First Implementable Slice

Do not start with the full 1M-3M graph simulator.

Start with a strict baseline that already matches the handoff factorization:

### Teacher VNext-A

- no hidden memory
- no end-to-end subphase simulator
- one yearly step model at year boundaries only
- grid features from existing geometry stack
- pairwise message aggregation from existing `pairwise_candidates`
- tiny MLP or ridge heads per family
- `z_r` enters every head by FiLM-style affine modulation or feature concatenation

This baseline is already a real dynamics teacher because it predicts `t -> t+1` state changes, not just terminal tensors.

If VNext-A is not better than the current terminal decoder, deeper graph/grid capacity is not justified yet.

## Training Stack

Do not train everything jointly from scratch.

Use this order:

1. deterministic replay measurement extraction
2. per-round summary fitting
3. cross-round regime factorization to get `z_r`
4. joint training of the shared yearly transition teacher on all replay transitions
5. rollout-based terminal decoding to final `H x W x 6`
6. separate student training on synthetic live episodes
7. query policy / calibration last

This keeps the between-round latent tiny and stops the transition model from memorizing round IDs.

## Losses

Use simple losses first.

### Binary heads

- weighted BCE
- keep all positives
- downsample negatives only in the data loader
- correct prevalence if needed

### Multi-class heads

- cross-entropy

Examples:

- ruin lifecycle
- owner destination choice if implemented directly

### Continuous settlement deltas

- Huber or Gaussian NLL

### Aggregate shock heads

- Gaussian NLL or Poisson-style count losses depending on target

### Terminal loss

After rollouts, supervise terminal class marginals with:

- per-cell cross-entropy or KL against replay/analysis terminal marginals

Do not rely on terminal loss alone. Transition supervision is the whole point.

## Decoder Contract

The final teacher API should remain compatible with the repo mental model:

- encode round -> regime latent
- rollout seed under regime -> replay-like trajectories
- average rollouts -> terminal `H x W x 6` tensor

That means the current `TerminalDecoder` seam is still fine, but `HazardTeacher.terminal_tensor()` should become:

- `simulate_many(seed, regime, n_rollouts)`
- collapse year-50 states across rollouts

not:

- `linear_map(regime) -> three logits -> terminal tensor`

## Evaluation Gates

Before promoting any new teacher family, require all three:

1. better one-step heldout transition metrics on replay rows
2. better seed-level terminal marginals after rollout
3. better heldout-round downstream score than the current semimechanistic decoder baseline

Track at least:

- per-head AUROC / log loss for binary transitions
- per-head RMSE or NLL for mark deltas
- rollout terminal KL / score
- heldout-round generalization, not only within-round replay fit

## Concrete Repo Work Order

### Phase 1: make the dataset real

Current [teacher_transition.py](/home/jorge/ainm/tasks/astar/src/astar/history/datasets/teacher_transition.py) is too coarse. It only stores macro counts.

Replace or extend it with a transition dataset manifest that points to:

- site opportunity rows
- live settlement rows
- ruin rows
- pairwise rows
- year-shock rows
- terminal targets

Each row family should keep:

- round_id
- seed_index
- replay_run_id
- step
- features
- targets
- sample weights / prevalence metadata if applicable

### Phase 2: add a real dynamics teacher module

Add a new module under [src/astar/teacher/dynamics/](/home/jorge/ainm/tasks/astar/src/astar/teacher/dynamics) rather than extending the current `HazardTeacher` shape forever.

Recommended split:

- `state.py`
- `encoder.py`
- `kernel.py`
- `heads.py`
- `rollout.py`
- `state_space_teacher.py`

Keep the current `hazard_teacher.py` as baseline / legacy terminal decoder.

### Phase 3: teacher-science workflow

Add a workflow that:

- trains transition heads
- runs replay rollouts
- scores terminal marginals
- compares against current `HazardTeacher`

This should sit beside [evaluate_teacher_science.py](/home/jorge/ainm/tasks/astar/src/astar/workflows/evaluate_teacher_science.py).

### Phase 4: student replacement

Current [deepset_student.py](/home/jorge/ainm/tasks/astar/src/astar/student/posterior/deepset_student.py) is actually nearest-neighbor over a handcrafted transcript summary.

After the transition teacher is stable:

- replace it with a true set encoder over query patches and observed settlement tables
- keep the latent small
- predict `z_r`, not terminal tensors directly

## Non-Goals

Not yet:

- giant transformer world models
- end-to-end live-query-to-terminal training
- large hidden latent states
- large discrete regime catalogs
- learned query policy before the teacher is stable

## Default Recommendation

If only one thing gets built next, build this:

- a replay-supervised yearly transition teacher with per-family heads over existing measurement tables
- conditioned on a 4D round latent from the current validated regime manifold
- with rollout to terminal marginals

That is the smallest implementation that is actually aligned with `handoff5_dynamics_model.md`.
