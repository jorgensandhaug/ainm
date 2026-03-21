# Behavioral Fingerprint Unification Plan

## Purpose

Make `behavioral_fingerprint_core_v1` the canonical exported round-summary object that downstream models actually use.

Keep `dynamic_law` only as:

- legacy baseline
- validator/control
- debugging path while cutover completes

Do not make `dynamic_law` the permanent owner of the summary engine. The permanent shape should be:

`replay measurements -> shared behavioral blocks -> behavioral_fingerprint_core_v1 -> uncertainty-weighted factorization -> downstream regime use`

That matches `handoff4_summary_model.md` more closely than the old split.

## Current State

### What is already good

- replay measurement substrate now covers:
  - site opportunities
  - live settlement transitions
  - ruin transitions
  - pairwise candidates
  - owner years
  - year shocks
  - macro trajectories
- `behavioral_fingerprint` now has:
  - canonical fixed probes
  - bootstrap std
  - probe-support diagnostics
  - corpus-invariant summary schema

### What is still wrong / incomplete

- `behavioral_fingerprint` still mixes:
  - strong probe blocks
  - weaker coarse aggregate `year_shock::*`
  - weaker coarse aggregate `macro::*`
- teacher/student are still not cleanly centered on factorized fingerprint summaries
- uncertainty exists, but factorization does not weight by it yet
- there is still duplicated fitting logic between `dynamic_law` and `behavioral_fingerprint`

## Target Architecture

### Layer 1: Measurement substrate

Replay measurement tables remain the only raw source:

- site opportunities
- live settlement transitions
- ruin transitions
- pairwise candidates
- owner years
- year shocks
- macro trajectories
- later: terminal response table from analyses

### Layer 2: Shared behavioral blocks

Introduce one neutral internal layer that owns:

- feature builders
- target definitions
- fitted heads
- per-round fitted block object
- engine-level validation

This must not be named or conceptualized as `dynamic_law` ownership. `dynamic_law` and `behavioral_fingerprint` should both be consumers of this layer while migration is in progress.

### Layer 3: Behavioral fingerprint

`behavioral_fingerprint` owns:

- canonical probe library
- probe evaluation on fitted blocks
- summary vector assembly
- bootstrap uncertainty
- probe support / applicability diagnostics

### Layer 4: Behavioral fingerprint core

`behavioral_fingerprint_core_v1` is the actually factorized / exported / downstream-used subset:

- `site_binary::*`
- `live_binary::*`
- `live_linear::*`
- `ruin_binary::*`
- `pairwise_binary::*`
- `pairwise_linear::*`
- `owner_linear::*`

Exclude for now:

- `year_shock::*`
- `macro::*`

Those remain attached to the full fingerprint artifact, but not part of the regime manifold until they are promoted to fitted probe-evaluated blocks.

### Layer 5: Regime manifold

Factorize only `behavioral_fingerprint_core_v1`.

Use uncertainty-aware column scaling, not plain raw SVD.

Recommended scale:

`scale_j = sqrt(var_j + mean(std_ij^2) + eps)`

where:

- `var_j` = across-round variance of summary dimension `j`
- `std_ij` = bootstrap std for round `i`, dimension `j`

This keeps large-scale and noisy dimensions from dominating the manifold just because of units or noise.

## Migration Plan

### Phase 1: Freeze the canonical public object

Goal: define exactly what downstream code should use now.

Tasks:

- freeze `behavioral_fingerprint_core_v1`
- define exact block-prefix allowlist
- define exact exported summary names
- version the artifact name and probe-library metadata explicitly

Exit criteria:

- same round gives identical core summary regardless of corpus mix
- summary names are stable across runs
- support diagnostics are attached and finite

### Phase 2: Add uncertainty-weighted factorization

Goal: make the core fingerprint usable as a regime manifold.

Tasks:

- extend factorization to carry column scale
- factorize `behavioral_fingerprint_core_v1`, not full BF
- save:
  - selected source names
  - selected source indexes
  - mean vector
  - scale vector
  - basis
  - coordinates
  - probe library kind/version

Exit criteria:

- reconstruction/project APIs handle scaled factorization correctly
- artifacts are reproducible
- leave-one-out works on the scaled manifold

### Phase 3: Wire downstream teacher onto BF core

Goal: make the teacher actually use the new summary.

Tasks:

- make `HazardTeacher` summary-backend aware:
  - `dynamic_law`
  - `behavioral_fingerprint_core`
- for BF-core backend:
  - fit round behavioral fingerprints
  - extract core summary
  - project to factor coordinates
  - map coordinates to semimechanistic coefficients
- keep `dynamic_law` path available as baseline

Exit criteria:

- teacher can fit/encode with BF-core
- encoded round vectors equal saved synthetic dataset regime vectors
- teacher science eval still runs

### Phase 4: Remove legacy query-residual regime shim

Goal: stop routing through the old 12-dim legacy projection.

Tasks:

- stop calling `_legacy_projected_teacher(...)`
- make `query_residual` regress directly onto teacher regime coordinates
- keep regime feature naming explicit

Exit criteria:

- synthetic dataset stores BF-core regime coords
- query-residual trains and predicts using those coords directly

### Phase 5: Validation workflow parity

Goal: give BF-core operational validation comparable to or better than legacy.

Tasks:

- add `evaluate-behavioral-fingerprint-summary`
- hold out full `replay_run_id`, never rows
- stratify holdouts by seed where possible
- report:
  - binary Brier
  - linear RMSE
  - bootstrap std
  - probe support / in-range diagnostics
  - runtime / row-cap / artifact metadata

Important correction:

- do not rebuild probes from train-only data for canonical probes
- instead verify canonical probe invariance and support

Exit criteria:

- workflow exists
- metadata is enough to reproduce the result exactly
- validator catches unsupported or out-of-range probes

### Phase 6: Shared fitted-block core extraction

Goal: remove duplicated fit logic after BF-core is already in use.

Tasks:

- extract shared internal fitted-block layer
- move common feature/target/head fit logic there
- make both `dynamic_law` and `behavioral_fingerprint` consume it

Exit criteria:

- one source of truth for fitted heads
- no duplicated ridge/logistic implementations between the paths

### Phase 7: Add fitted shock/macro blocks

Goal: promote remaining coarse blocks to proper behavioral summaries.

Tasks:

- fit a probe-evaluated year-shock block
- fit a probe-evaluated macro block or replace macro aggregates with fitted responses
- then decide whether those blocks should enter `behavioral_fingerprint_core_v2`

Exit criteria:

- no coarse aggregate-only blocks inside the factorized public object

### Phase 8: Add terminal-response block

Goal: finish the handoff4 picture by linking replay dynamics back to the actual score target.

Tasks:

- build terminal response table from analyses
- add entropy-aware terminal summary block
- add uncertainty-aware terminal probes or target summaries

Exit criteria:

- fingerprint includes terminal-response behavior
- downstream validation can test whether summary quality improves target prediction

### Phase 9: Canonical cutover

Goal: make BF-core the normal path everywhere it is ready.

Tasks:

- switch default round-summary factorization to `behavioral_fingerprint_core`
- switch teacher default backend to BF-core
- switch student/synthetic dataset/query-residual defaults to BF-core
- keep `dynamic_law` available explicitly for A/B and debugging

Exit criteria:

- downstream code no longer treats dynamic-law probe vectors as the public regime object
- BF-core is the default regime path

## Validation Rules

### Always verify at four levels

1. unit invariants
2. replay holdout behavior
3. cross-round manifold stability
4. downstream usefulness

### Unit invariants

- fixed summary name order
- fixed probe width
- bootstrap never changes summary schema
- canonical probe library is corpus invariant
- all exported probes report support metadata
- scaled project/reconstruct round-trips are numerically correct

### Replay holdout validation

- hold out full `replay_run_id`, never rows
- stratify by seed where possible
- report:
  - binary Brier
  - linear RMSE
  - bootstrap std
  - probe support fractions
  - out-of-range counts

### Cross-round manifold validation

- leave-one-round-out reconstruction
- bootstrap coordinate stability within round
- nearest-neighbor consistency under replay resampling
- uncertainty-weighted manifold vs unweighted baseline

### Downstream validation

Validate at least:

- `HazardTeacher(dynamic_law)` vs `HazardTeacher(behavioral_fingerprint_core)`
- `query_residual` with legacy regime shim vs direct BF-core regime coords
- teacher science report
- synthetic or historical benchmark score if runtime allows

Success criterion is not “BF summary matches dynamic-law vector”.

Success criterion is:

- replay behavior is predicted well
- manifold is stable
- downstream prediction gets better or at least not worse with lower fragility

## Immediate Priority Order

1. freeze `behavioral_fingerprint_core_v1`
2. add uncertainty-weighted factorization
3. wire `HazardTeacher` to BF-core
4. remove query-residual legacy regime shim
5. add BF-core validation workflow
6. only then flip remaining defaults
