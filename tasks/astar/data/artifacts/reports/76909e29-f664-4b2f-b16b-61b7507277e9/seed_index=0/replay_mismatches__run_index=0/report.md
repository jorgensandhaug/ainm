# Replay Mismatch Audit Round 76909e29-f664-4b2f-b16b-61b7507277e9 Seed 0

- round_id: `76909e29-f664-4b2f-b16b-61b7507277e9`
- seed_index: `0`
- frame_count: `51`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/76909e29-f664-4b2f-b16b-61b7507277e9/seed_index=0/replay_mismatches__run_index=0/mismatch_breakdown.parquet`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/76909e29-f664-4b2f-b16b-61b7507277e9/seed_index=0/replay_mismatches__run_index=0/mismatch_rows.parquet`
- rebuild_without_settlement_count: `0`
- replay_run_id: `880698e508784ccea5b78ca6b2532f29`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-mismatches --round-id 76909e29-f664-4b2f-b16b-61b7507277e9 --seed-index 0 --replay-run-index 0 --max-examples-per-kind 3`
- ruin_without_collapse_count: `49`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/76909e29-f664-4b2f-b16b-61b7507277e9/seed_index=0/20260320T091709.204056Z__sim_seed=129751314__capture_id=880698e508784ccea5b78ca6b2532f29.json`
- total_mismatch_count: `49`

## Figures

- mismatch_timeline: `mismatch_timeline.png`
  Counts of unmatched ruin/rebuild cell transitions by yearly step.
- ruin_without_collapse__step_2__x_24__y_36: `ruin_without_collapse__step_2__x_24__y_36.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_8__x_6__y_6: `ruin_without_collapse__step_8__x_6__y_6.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_8__x_23__y_8: `ruin_without_collapse__step_8__x_23__y_8.png`
  Focused replay transition with mismatch cell highlighted in red.

## Summary

- total_mismatch_count: `49`
- ruin_without_collapse_count: `49`
- rebuild_without_settlement_count: `0`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/76909e29-f664-4b2f-b16b-61b7507277e9/seed_index=0/replay_mismatches__run_index=0/mismatch_rows.parquet`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/76909e29-f664-4b2f-b16b-61b7507277e9/seed_index=0/replay_mismatches__run_index=0/mismatch_breakdown.parquet`

## Breakdown

| mismatch_kind | prev_code | next_code | count | first_step | last_step |
| --- | --- | --- | --- | --- | --- |
| ruin_without_collapse | 11 | 3 | 32 | 8 | 48 |
| ruin_without_collapse | 4 | 3 | 17 | 2 | 48 |

## Example Audits

### ruin_without_collapse step 2 -> 3 at (24, 36)

- figure: `ruin_without_collapse__step_2__x_24__y_36.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 36 | 24 | 4 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 8 -> 9 at (6, 6)

- figure: `ruin_without_collapse__step_8__x_6__y_6.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | 6 | 6 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 8 -> 9 at (23, 8)

- figure: `ruin_without_collapse__step_8__x_23__y_8.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8 | 8 | 23 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_
