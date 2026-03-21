# Replay Mismatch Audit Round 71451d74-be9f-471f-aacd-a41f3b68a9cd Seed 0

- round_id: `71451d74-be9f-471f-aacd-a41f3b68a9cd`
- seed_index: `0`
- frame_count: `51`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/71451d74-be9f-471f-aacd-a41f3b68a9cd/seed_index=0/replay_mismatches__run_index=0/mismatch_breakdown.parquet`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/71451d74-be9f-471f-aacd-a41f3b68a9cd/seed_index=0/replay_mismatches__run_index=0/mismatch_rows.parquet`
- rebuild_without_settlement_count: `0`
- replay_run_id: `2a3e5803778e4e28bc6047ba0b250a3c`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-mismatches --round-id 71451d74-be9f-471f-aacd-a41f3b68a9cd --seed-index 0 --replay-run-index 0 --max-examples-per-kind 3`
- ruin_without_collapse_count: `17`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/71451d74-be9f-471f-aacd-a41f3b68a9cd/seed_index=0/20260320T090423.960062Z__sim_seed=1997692158__capture_id=2a3e5803778e4e28bc6047ba0b250a3c.json`
- total_mismatch_count: `17`

## Figures

- mismatch_timeline: `mismatch_timeline.png`
  Counts of unmatched ruin/rebuild cell transitions by yearly step.
- ruin_without_collapse__step_2__x_28__y_22: `ruin_without_collapse__step_2__x_28__y_22.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_3__x_9__y_2: `ruin_without_collapse__step_3__x_9__y_2.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_3__x_33__y_34: `ruin_without_collapse__step_3__x_33__y_34.png`
  Focused replay transition with mismatch cell highlighted in red.

## Summary

- total_mismatch_count: `17`
- ruin_without_collapse_count: `17`
- rebuild_without_settlement_count: `0`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/71451d74-be9f-471f-aacd-a41f3b68a9cd/seed_index=0/replay_mismatches__run_index=0/mismatch_rows.parquet`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/71451d74-be9f-471f-aacd-a41f3b68a9cd/seed_index=0/replay_mismatches__run_index=0/mismatch_breakdown.parquet`

## Breakdown

| mismatch_kind | prev_code | next_code | count | first_step | last_step |
| --- | --- | --- | --- | --- | --- |
| ruin_without_collapse | 11 | 3 | 13 | 2 | 49 |
| ruin_without_collapse | 4 | 3 | 4 | 3 | 40 |

## Example Audits

### ruin_without_collapse step 2 -> 3 at (28, 22)

- figure: `ruin_without_collapse__step_2__x_28__y_22.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 22 | 28 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 3 -> 4 at (9, 2)

- figure: `ruin_without_collapse__step_3__x_9__y_2.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 2 | 9 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 3 -> 4 at (33, 34)

- figure: `ruin_without_collapse__step_3__x_33__y_34.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 34 | 33 | 4 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_
