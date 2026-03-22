# Handoff7 Integration Plan

This doc translates the post-regime Handoff7 ideas into the current repo.

Use it together with:

- [student_model_implementation_plan.md](/home/jorge/ainm/tasks/astar/docs/student_model_implementation_plan.md)
- [dynamics_teacher_implementation_plan.md](/home/jorge/ainm/tasks/astar/docs/dynamics_teacher_implementation_plan.md)
- [regime_model_implementation_plan.md](/home/jorge/ainm/tasks/astar/docs/regime_model_implementation_plan.md)
- [regime_validation_ladder.md](/home/jorge/ainm/tasks/astar/docs/regime_validation_ladder.md)

## Notation

Keep the same notation as the existing teacher/student docs.

- round index: `r`
- seed index: `s`
- cell index: `u`
- visible initial maps: `M_r = {M_{r,s}}_{s=1..5}`
- legal live transcript: `D_r`
- teacher-side replay summary: `theta_r`
- low-rank teacher regime coordinate: `z_r`
- student posterior: `q(z_r | M_r, D_r)`
- teacher decoder / rollout model: `F`

Do not reuse `theta_r` and `z_r` interchangeably.

## Current Repo Truth

What already exists:

- replay-backed teacher decoders:
  - `HazardTeacher`
  - `StateSpaceTeacher`
- replay-safe student posteriors:
  - `SummaryBankStudent`
  - `StateSpaceStudent`
- synthetic-live episodes for offline student training
- strong monolithic online baseline:
  - `QueryResidualPredictor`

What was missing in the actual serving stack before this pass:

- `SummaryBankStudent` was not wired into `build_online_predictor(...)`
- `StateSpaceStudent` was not wired into `build_online_predictor(...)`
- historical benchmark could not evaluate those student models online
- student serving outputs did not apply a probability floor before scoring
- synthetic episode target loading assumed derived analysis `.npz` files even when only raw analysis JSON existed

## What Is Implemented Now

This pass adds the missing stage-0 serving foundation.

New serving path:

- `src/astar/student/predictor/offline_stack.py`
  - cached load-or-fit wrappers for:
    - `SummaryBankStudent`
    - `StateSpaceStudent`
  - cached synthetic-live dataset reuse
  - online predictor adapter for transcript updates + whole-round prediction

New student serving safety:

- `SummaryBankStudent.predict_seed(...)` now applies `apply_probability_floor(...)`
- `StateSpaceStudent.predict_seed(...)` now applies `apply_probability_floor(...)`
- both students now expose `build_prediction_bundle_from_context(...)` so one inferred posterior can decode all 5 seeds without recomputing `q(z_r | M_r, D_r)` five times

New checkpoint/runtime support:

- `HazardTeacher.load_checkpoint(...)` now exists for serving-time reuse
- synthetic target loading now falls back to raw saved analysis JSON when derived analysis tensors do not exist yet

New benchmark/CLI wiring:

- `summary_bank_student` and `state_space_student` are now valid online predictors
- both are now wired into:
  - `run-live-online`
  - `run-historical-benchmark`
  - `run-synthetic-benchmark`
  - `run-synthetic-tournament`
  - `visualize-model-prediction`

New modular post-posterior step:

- `state_space_student_assimilated`
  - wraps `StateSpaceStudent` only
  - decodes the teacher posterior predictive once per seed
  - applies explicit observed-cell assimilation with a Dirichlet update
  - calibrates the assimilation prior pseudocount on synthetic-live episodes by mean weighted KL
  - remains fully opt-in; plain `state_space_student` is unchanged

## What Still Does Not Exist

Relative to Handoff7 steps 4/5/6, the repo still does not have the full modular post-posterior stack:

1. explicit support projection layer
2. explicit calibration layer separate from `query_residual`
3. explicit dynamic score-aligned policy
4. explicit seed-local residual posterior `q(\eta_{r,s} | M_{r,s}, D_{r,s}, z_r)`

So the current repo still has this shape:

`q(z_r | M_r, D_r) -> F(M_{r,s}, z_r) -> Assimilate -> floor`

not yet:

`q -> F -> Assimilate -> Project -> Calibrate`

## Recommended Immediate Validation Order

Now that the posterior students are real online predictors, validate in this order:

1. benchmark `summary_bank_student` vs `state_space_student` vs `query_residual`
2. use small paired historical benchmarks first:
   - same rounds
   - same policy
   - same budget
   - same `samples_per_round`
3. benchmark `state_space_student_assimilated` against plain `state_space_student`
4. only after that add support projection and calibration

Recommended first command pair:

```bash
uv run astar run-historical-benchmark \
  --model summary_bank_student \
  --mode online_interactive \
  --policy coverage \
  --samples-per-round 1 \
  --budget 10 \
  --episode-seed 0 \
  --with-png none \
  --round-id 36e581f1-73f8-453f-ab98-cbe3052b701b \
  --round-id 71451d74-be9f-471f-aacd-a41f3b68a9cd \
  --round-id 76909e29-f664-4b2f-b16b-61b7507277e9 \
  --name h7_summary_bank_student_cov10_r3
```

```bash
uv run astar run-historical-benchmark \
  --model state_space_student \
  --mode online_interactive \
  --policy coverage \
  --samples-per-round 1 \
  --budget 10 \
  --episode-seed 0 \
  --with-png none \
  --round-id 36e581f1-73f8-453f-ab98-cbe3052b701b \
  --round-id 71451d74-be9f-471f-aacd-a41f3b68a9cd \
  --round-id 76909e29-f664-4b2f-b16b-61b7507277e9 \
  --name h7_state_space_student_cov10_r3
```

```bash
uv run astar run-historical-benchmark \
  --model state_space_student_assimilated \
  --mode online_interactive \
  --policy coverage \
  --samples-per-round 1 \
  --budget 10 \
  --episode-seed 0 \
  --with-png none \
  --round-id 36e581f1-73f8-453f-ab98-cbe3052b701b \
  --round-id 71451d74-be9f-471f-aacd-a41f3b68a9cd \
  --round-id 76909e29-f664-4b2f-b16b-61b7507277e9 \
  --name h7_state_space_student_assimilated_cov10_r3
```

Then compare both against a `query_residual` run on the same slice.

## Next Implementation Slice

The next clean Handoff7 step should now be:

1. add explicit support projection after observed-cell assimilation
2. add explicit calibration after projection
3. keep both separate from `QueryResidualPredictor`
4. benchmark each layer incrementally against `state_space_student_assimilated`
