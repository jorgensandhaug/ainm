# Replay Mismatch Audit Round ae78003a-4efe-425a-881a-d16a39bca0ad Seed 0

- round_id: `ae78003a-4efe-425a-881a-d16a39bca0ad`
- seed_index: `0`
- frame_count: `51`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/ae78003a-4efe-425a-881a-d16a39bca0ad/seed_index=0/replay_mismatches__run_index=0/mismatch_breakdown.parquet`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/ae78003a-4efe-425a-881a-d16a39bca0ad/seed_index=0/replay_mismatches__run_index=0/mismatch_rows.parquet`
- rebuild_without_settlement_count: `0`
- replay_run_id: `0fb8492818fb419ba9a5e5ee824d27d4`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-mismatches --round-id ae78003a-4efe-425a-881a-d16a39bca0ad --seed-index 0 --replay-run-index 0 --max-examples-per-kind 3`
- ruin_without_collapse_count: `52`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/ae78003a-4efe-425a-881a-d16a39bca0ad/seed_index=0/20260320T120558.864791Z__sim_seed=1715428029__capture_id=0fb8492818fb419ba9a5e5ee824d27d4.json`
- total_mismatch_count: `52`

## Figures

- mismatch_timeline: `mismatch_timeline.png`
  Counts of unmatched ruin/rebuild cell transitions by yearly step.
- ruin_without_collapse__step_3__x_7__y_6: `ruin_without_collapse__step_3__x_7__y_6.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_3__x_38__y_10: `ruin_without_collapse__step_3__x_38__y_10.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_3__x_11__y_13: `ruin_without_collapse__step_3__x_11__y_13.png`
  Focused replay transition with mismatch cell highlighted in red.

## Summary

- total_mismatch_count: `52`
- ruin_without_collapse_count: `52`
- rebuild_without_settlement_count: `0`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/ae78003a-4efe-425a-881a-d16a39bca0ad/seed_index=0/replay_mismatches__run_index=0/mismatch_rows.parquet`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/ae78003a-4efe-425a-881a-d16a39bca0ad/seed_index=0/replay_mismatches__run_index=0/mismatch_breakdown.parquet`

## Breakdown

| mismatch_kind | prev_code | next_code | count | first_step | last_step |
| --- | --- | --- | --- | --- | --- |
| ruin_without_collapse | 11 | 3 | 40 | 3 | 48 |
| ruin_without_collapse | 4 | 3 | 12 | 3 | 48 |

## Example Audits

### ruin_without_collapse step 3 -> 4 at (7, 6)

- figure: `ruin_without_collapse__step_3__x_7__y_6.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 6 | 7 | 4 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 3 -> 4 at (38, 10)

- figure: `ruin_without_collapse__step_3__x_38__y_10.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 10 | 38 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 3 -> 4 at (11, 13)

- figure: `ruin_without_collapse__step_3__x_11__y_13.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 13 | 11 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_
