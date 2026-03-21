# Replay Mismatch Audit Round 36e581f1-73f8-453f-ab98-cbe3052b701b Seed 3

- round_id: `36e581f1-73f8-453f-ab98-cbe3052b701b`
- seed_index: `3`
- frame_count: `51`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/36e581f1-73f8-453f-ab98-cbe3052b701b/seed_index=3/replay_mismatches__run_index=0/mismatch_breakdown.parquet`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/36e581f1-73f8-453f-ab98-cbe3052b701b/seed_index=3/replay_mismatches__run_index=0/mismatch_rows.parquet`
- rebuild_without_settlement_count: `0`
- replay_run_id: `5d146e58d7ba47bbb5aab01fba893ca0`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-mismatches --round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --seed-index 3 --replay-run-index 0 --max-examples-per-kind 3`
- ruin_without_collapse_count: `36`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/36e581f1-73f8-453f-ab98-cbe3052b701b/seed_index=3/20260320T163827.590039Z__sim_seed=1647271942__capture_id=5d146e58d7ba47bbb5aab01fba893ca0.json`
- total_mismatch_count: `36`

## Figures

- mismatch_timeline: `mismatch_timeline.png`
  Counts of unmatched ruin/rebuild cell transitions by yearly step.
- ruin_without_collapse__step_7__x_11__y_4: `ruin_without_collapse__step_7__x_11__y_4.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_7__x_15__y_6: `ruin_without_collapse__step_7__x_15__y_6.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_7__x_18__y_11: `ruin_without_collapse__step_7__x_18__y_11.png`
  Focused replay transition with mismatch cell highlighted in red.

## Summary

- total_mismatch_count: `36`
- ruin_without_collapse_count: `36`
- rebuild_without_settlement_count: `0`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/36e581f1-73f8-453f-ab98-cbe3052b701b/seed_index=3/replay_mismatches__run_index=0/mismatch_rows.parquet`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/36e581f1-73f8-453f-ab98-cbe3052b701b/seed_index=3/replay_mismatches__run_index=0/mismatch_breakdown.parquet`

## Breakdown

| mismatch_kind | prev_code | next_code | count | first_step | last_step |
| --- | --- | --- | --- | --- | --- |
| ruin_without_collapse | 11 | 3 | 24 | 7 | 49 |
| ruin_without_collapse | 4 | 3 | 12 | 7 | 34 |

## Example Audits

### ruin_without_collapse step 7 -> 8 at (11, 4)

- figure: `ruin_without_collapse__step_7__x_11__y_4.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 4 | 11 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 7 -> 8 at (15, 6)

- figure: `ruin_without_collapse__step_7__x_15__y_6.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 6 | 15 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 7 -> 8 at (18, 11)

- figure: `ruin_without_collapse__step_7__x_18__y_11.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 11 | 18 | 4 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_
