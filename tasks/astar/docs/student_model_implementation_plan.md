# Student Model Implementation Plan

This doc fixes the naming and dependency story for the student.

Use it together with:

- [regime_model_implementation_plan.md](/home/jorge/ainm/tasks/astar/docs/regime_model_implementation_plan.md)
- [dynamics_teacher_implementation_plan.md](/home/jorge/ainm/tasks/astar/docs/dynamics_teacher_implementation_plan.md)
- [handoff6_student.md](/home/jorge/ainm/tasks/astar/handoff6_student.md)

## Core Role

The student is not the world model.

The student is the online-safe inverse model:

- input: initial maps `M_r` plus legal live transcript `D_r`
- target: posterior over the teacher-side round object
- output today: posterior over teacher regime coordinates `z_r`
- output later, if justified: posterior over richer round summary `theta_r`

Current repo dependency chain should be read as:

`replay -> behavioral fingerprint core theta_r -> low-rank regime z_r -> teacher decoder F(M, z) -> student q(z | M, D)`

Important notation cleanup:

- `theta_r`: teacher-side measured round summary, not live evidence
- `z_r`: low-rank factorization of `theta_r`
- `q`: student posterior model
- `F`: teacher decoder / terminal predictor

Do not let student code depend directly on replay trajectories, replay-only fields, or post-round truth.

## Current Repo Truth

What already exists:

- replay-backed synthetic-live episodes
- a teacher that encodes rounds into regime coordinates and decodes them to terminal tensors
- a summary-bank student baseline

What is still wrong:

- `deepset_student.py` was not actually a deepset model
- the baseline collapsed the transcript into a coarse per-seed average
- repeated queries to the same window were not represented explicitly
- student target choice is still downstream of unfinished regime validation

## Canonical Student Input Schema

The baseline and the future neural student should both see the same online-safe object:

1. query observation
   - one `(seed, viewport, final patch, settlement marks)` sample
2. repeated-window group
   - all repeated observations for one `(seed, viewport)`
3. transcript set
   - all repeated-window groups across all seeds

This matters because repeated queries to the same window are i.i.d. samples from one patch law, not duplicate features.

Immediate feature families:

- viewport geometry
- initial patch class composition
- initial settlements / initial ports inside the viewport
- final patch class composition
- initial-to-final class deltas
- observed settlement density / alive density / port density
- observed mean population / food / wealth / defense
- repeat count per queried window

This is still a summary baseline, not the final neural student.
But it preserves the right statistical structure.

## Target Object

Until the regime layer is validated, the public student target should stay:

- `z_r`: the teacher regime coordinates actually used by the decoder

Reason:

- that is the object already consumed by `HazardTeacher.terminal_tensor(...)`
- it keeps the student aligned with the current teacher interface
- it can later be swapped to `theta_r` without changing the transcript schema

When regime validation is stronger, reassess whether the student should instead predict:

- posterior over `theta_r`
- posterior over `(c_r, u_r)` for discrete archetype + continuous residual

## Implementation Order

### Phase 1. Transcript schema

- keep one canonical online-safe transcript-set builder in `student/posterior/`
- use it for both synthetic training artifacts and live inference
- expose grouped-window summaries for debugging and tests

### Phase 2. Stronger baseline

- keep `SummaryBankStudent` as the cheap baseline
- make it consume grouped transcript summaries
- keep file naming honest: summary-bank baseline separate from future set encoder

### Phase 3. Real amortized posterior

Build a true set model with three levels:

1. per-query encoder
2. repeated-window encoder
3. transcript-set encoder

Output:

- posterior mean
- posterior covariance or particle weights

Losses:

- teacher posterior distillation if available
- decoded terminal loss through `F`
- direct regime/summary supervision
- anytime truncation over query budget

### Phase 4. Particle correction

After the amortized model is stable:

- use the student as a proposal posterior
- add likelihood-ratio or synthetic-likelihood correction over repeated-window summaries

## Naming Rules

- `summary_bank`: kNN / nonparametric baseline over grouped transcript summaries
- `set_encoder`: learned amortized student over grouped transcript elements
- `transcript_set`: canonical online-safe student input object
- `regime`: teacher-side latent coordinates used by the decoder
- `summary`: teacher-side measured round fingerprint before factorization

Do not name a module `deepset` unless it actually contains a permutation-invariant learned set encoder.
