# Replay Mismatch Audit Round f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb Seed 0

- round_id: `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
- seed_index: `0`
- frame_count: `51`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb/seed_index=0/replay_mismatches__run_index=0/mismatch_breakdown.parquet`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb/seed_index=0/replay_mismatches__run_index=0/mismatch_rows.parquet`
- rebuild_without_settlement_count: `0`
- replay_run_id: `0002df3a763349e0bb38e15f3e13b3b3`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-mismatches --round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb --seed-index 0 --replay-run-index 0 --max-examples-per-kind 3`
- ruin_without_collapse_count: `41`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb/seed_index=0/20260320T092528.792968Z__sim_seed=1111444410__capture_id=0002df3a763349e0bb38e15f3e13b3b3.json`
- total_mismatch_count: `41`

## Figures

- mismatch_timeline: `mismatch_timeline.png`
  Counts of unmatched ruin/rebuild cell transitions by yearly step.
- ruin_without_collapse__step_2__x_18__y_21: `ruin_without_collapse__step_2__x_18__y_21.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_2__x_34__y_24: `ruin_without_collapse__step_2__x_34__y_24.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_2__x_36__y_29: `ruin_without_collapse__step_2__x_36__y_29.png`
  Focused replay transition with mismatch cell highlighted in red.

## Summary

- total_mismatch_count: `41`
- ruin_without_collapse_count: `41`
- rebuild_without_settlement_count: `0`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb/seed_index=0/replay_mismatches__run_index=0/mismatch_rows.parquet`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb/seed_index=0/replay_mismatches__run_index=0/mismatch_breakdown.parquet`

## Breakdown

| mismatch_kind | prev_code | next_code | count | first_step | last_step |
| --- | --- | --- | --- | --- | --- |
| ruin_without_collapse | 11 | 3 | 28 | 2 | 47 |
| ruin_without_collapse | 4 | 3 | 13 | 7 | 45 |

## Example Audits

### ruin_without_collapse step 2 -> 3 at (18, 21)

- figure: `ruin_without_collapse__step_2__x_18__y_21.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 21 | 18 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 2 -> 3 at (34, 24)

- figure: `ruin_without_collapse__step_2__x_34__y_24.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 24 | 34 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 2 -> 3 at (36, 29)

- figure: `ruin_without_collapse__step_2__x_36__y_29.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 29 | 36 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_
