# Regime Model Implementation Plan

## Goal

Turn the current round-summary work into a validated, reusable regime layer that answers three questions:

1. does the round summary `theta_r` make sense and stay stable within round?
2. does `theta_r` collapse to a small low-rank regime `z_r` across rounds?
3. is `z_r` actually useful for downstream prediction?

This doc is the implementation plan for that step.

---

## Current Repo Truth

What already exists:

- replay measurement tables
- per-round summary fitters
- behavioral fingerprint core selection
- uncertainty-aware scaled factorization
- teacher path that, by default, already uses `behavioral_fingerprint_core` coordinates

What is still missing:

- one canonical workflow that evaluates the regime step end-to-end
- strict low-rank validation beyond “SVD ran”
- explicit downstream usefulness checks for the regime coordinates
- rank-selection guidance tied to held-out rounds

---

## Mathematical Objects

Per round:

- `theta_r in R^P`: behavioral fingerprint core summary
- `Sigma_r`: uncertainty estimate, currently diagonal via bootstrap std

Cross-round regime model:

- `x_r = (theta_r - mu) / s`
- `x_r ~= z_r B`

where:

- `mu in R^P`: across-round mean summary
- `s in R^P_+`: uncertainty-aware column scale
- `B in R^{d x P}`: low-rank basis
- `z_r in R^d`: regime coordinate for round `r`

Current intended public summary width:

- `P = 135` for `behavioral_fingerprint_core_v1`

Current practical rank target:

- sweep `d = 1..4`

Do not assume larger `d` is justified until holdout metrics say so.

---

## Validation Stack

### Layer 1: Summary validity

Use the existing behavioral-fingerprint validator.

Questions:

- do per-round submodels predict held-out replay runs from the same round?
- are canonical probes in-range?
- is bootstrap instability acceptable?

Existing workflow:

- `evaluate-behavioral-fingerprint-summary`

Gate:

- if summary fit is noisy or unsupported, do not trust regime factorization yet

### Layer 2: Low-rank validity

New regime validator should test:

- strict leave-one-round-out reconstruction
- train-only scaling on each holdout fold
- rank sweep over small `d`

Main metrics:

- summary MAE / RMSE
- baseline-vs-regime improvement
- cosine similarity

Gate:

- low-rank should beat mean-summary baseline on held-out rounds

### Layer 3: Downstream usefulness

Regime step is only useful if it helps prediction.

For each held-out round and rank:

1. fit factorization on train rounds only
2. project held-out `theta_r` to `z_r`
3. fit ridge map `z -> semimechanistic terminal coefficients` on train rounds
4. predict held-out coefficients
5. decode held-out terminal tensors

Main metrics:

- coefficient L2
- terminal tensor L1
- baseline-vs-regime improvement

Gate:

- low-rank regime must beat mean-coefficient baseline

---

## Implementation Order

### Phase 1

Add a dedicated regime evaluation workflow:

- estimate BF-core summaries once
- sweep rank
- run strict held-out reconstruction
- run held-out coefficient/terminal usefulness checks
- write JSON + markdown artifacts

### Phase 2

Use the regime evaluation workflow to choose:

- summary version
- bootstrap budget
- allowed rank range

### Phase 3

Use the chosen rank in:

- `HazardTeacher`
- synthetic-live regime targets
- student posterior training

### Phase 4

Only after the regime layer is validated:

- move deeper into handoff5 grey-box transition model work

---

## Non-Negotiable Verification Rules

- hold out full rounds for regime evaluation
- never choose rank from in-sample explained variance alone
- never let noisy dimensions dominate because of scale
- keep the baseline in every report
- treat `theta_r` as measured behavior, not literal simulator parameters

---

## Concrete Deliverables

1. regime evaluation workflow
2. regime evaluation artifact schema
3. CLI command and text renderer
4. tests for:
   - rank sweep artifact generation
   - strict held-out evaluation on multi-round sample data
   - baseline improvement fields present and finite

