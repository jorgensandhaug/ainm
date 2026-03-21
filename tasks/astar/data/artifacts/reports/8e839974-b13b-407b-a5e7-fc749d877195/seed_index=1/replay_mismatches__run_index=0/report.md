# Replay Mismatch Audit Round 8e839974-b13b-407b-a5e7-fc749d877195 Seed 1

- round_id: `8e839974-b13b-407b-a5e7-fc749d877195`
- seed_index: `1`
- frame_count: `51`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/8e839974-b13b-407b-a5e7-fc749d877195/seed_index=1/replay_mismatches__run_index=0/mismatch_breakdown.parquet`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/8e839974-b13b-407b-a5e7-fc749d877195/seed_index=1/replay_mismatches__run_index=0/mismatch_rows.parquet`
- rebuild_without_settlement_count: `0`
- replay_run_id: `7eda6fe4951e467090cb592e2a30a75f`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-mismatches --round-id 8e839974-b13b-407b-a5e7-fc749d877195 --seed-index 1 --replay-run-index 0 --max-examples-per-kind 3`
- ruin_without_collapse_count: `84`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/8e839974-b13b-407b-a5e7-fc749d877195/seed_index=1/20260320T104302.277304Z__sim_seed=702241945__capture_id=7eda6fe4951e467090cb592e2a30a75f.json`
- total_mismatch_count: `84`

## Figures

- mismatch_timeline: `mismatch_timeline.png`
  Counts of unmatched ruin/rebuild cell transitions by yearly step.
- ruin_without_collapse__step_3__x_35__y_4: `ruin_without_collapse__step_3__x_35__y_4.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_3__x_9__y_9: `ruin_without_collapse__step_3__x_9__y_9.png`
  Focused replay transition with mismatch cell highlighted in red.
- ruin_without_collapse__step_3__x_26__y_11: `ruin_without_collapse__step_3__x_26__y_11.png`
  Focused replay transition with mismatch cell highlighted in red.

## Summary

- total_mismatch_count: `84`
- ruin_without_collapse_count: `84`
- rebuild_without_settlement_count: `0`
- mismatch_rows_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/8e839974-b13b-407b-a5e7-fc749d877195/seed_index=1/replay_mismatches__run_index=0/mismatch_rows.parquet`
- mismatch_breakdown_path: `/home/jorge/ainm/tasks/astar/data/artifacts/reports/8e839974-b13b-407b-a5e7-fc749d877195/seed_index=1/replay_mismatches__run_index=0/mismatch_breakdown.parquet`

## Breakdown

| mismatch_kind | prev_code | next_code | count | first_step | last_step |
| --- | --- | --- | --- | --- | --- |
| ruin_without_collapse | 11 | 3 | 56 | 3 | 49 |
| ruin_without_collapse | 4 | 3 | 28 | 3 | 49 |

## Example Audits

### ruin_without_collapse step 3 -> 4 at (35, 4)

- figure: `ruin_without_collapse__step_3__x_35__y_4.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 4 | 35 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 3 -> 4 at (9, 9)

- figure: `ruin_without_collapse__step_3__x_9__y_9.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 9 | 9 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_

### ruin_without_collapse step 3 -> 4 at (26, 11)

- figure: `ruin_without_collapse__step_3__x_26__y_11.png`

#### Mismatch Row

| step | y | x | prev_code | next_code | event_kind | ruin_created | rebuilt_from_ruin | matched_collapse_to_ruin | matched_settlement_rebuild | mismatch_kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 11 | 26 | 11 | 3 | ruin | True | False | False | False | ruin_without_collapse |

#### Same-Position Settlement Rows

_none_
