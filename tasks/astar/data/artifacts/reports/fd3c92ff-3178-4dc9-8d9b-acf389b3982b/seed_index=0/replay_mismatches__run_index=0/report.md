# Replay Mismatch Audit Round fd3c92ff-3178-4dc9-8d9b-acf389b3982b Seed 0

- round_id: `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
- seed_index: `0`
- frame_count: `51`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/fd3c92ff-3178-4dc9-8d9b-acf389b3982b/seed_index=0/replay_mismatches__run_index=0/mismatch_breakdown.parquet`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/fd3c92ff-3178-4dc9-8d9b-acf389b3982b/seed_index=0/replay_mismatches__run_index=0/mismatch_rows.parquet`
- rebuild_without_settlement_count: `0`
- replay_run_id: `51dd71af11594b3faa90ae82395af657`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-mismatches --round-id fd3c92ff-3178-4dc9-8d9b-acf389b3982b --seed-index 0 --replay-run-index 0 --max-examples-per-kind 3`
- ruin_without_collapse_count: `136`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/fd3c92ff-3178-4dc9-8d9b-acf389b3982b/seed_index=0/20260320T105026.193815Z__sim_seed=1942615156__capture_id=51dd71af11594b3faa90ae82395af657.json`
- total_mismatch_count: `136`

## Figures

- mismatch_timeline: `mismatch_timeline.png`
  Counts of unmatched ruin/rebuild cell transitions by yearly step.
- ruin_without_collapse__step_3__x_33__y_7: `ruin_without_collapse__step_3__x_33__y_7.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_3__x_4__y_16: `ruin_without_collapse__step_3__x_4__y_16.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_3__x_10__y_16: `ruin_without_collapse__step_3__x_10__y_16.png`
  Focused replay transition with mismatch cell highlighted in red.

## Summary

- total_mismatch_count: `136`
- ruin_without_collapse_count: `136`
- rebuild_without_settlement_count: `0`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/fd3c92ff-3178-4dc9-8d9b-acf389b3982b/seed_index=0/replay_mismatches__run_index=0/mismatch_rows.parquet`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/fd3c92ff-3178-4dc9-8d9b-acf389b3982b/seed_index=0/replay_mismatches__run_index=0/mismatch_breakdown.parquet`

## Breakdown

| mismatch_kind | prev_code | next_code | count | first_step | last_step |
| --- | --- | --- | --- | --- | --- |
| ruin_without_collapse | 11 | 3 | 88 | 3 | 48 |
| ruin_without_collapse | 4 | 3 | 48 | 3 | 48 |

## Example Audits

### ruin_without_collapse step 3 -> 4 at (33, 7)

- figure: `ruin_without_collapse__step_3__x_33__y_7.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 7 | 33 | 4 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 3 -> 4 at (4, 16)

- figure: `ruin_without_collapse__step_3__x_4__y_16.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 16 | 4 | 4 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 3 -> 4 at (10, 16)

- figure: `ruin_without_collapse__step_3__x_10__y_16.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 16 | 10 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_
