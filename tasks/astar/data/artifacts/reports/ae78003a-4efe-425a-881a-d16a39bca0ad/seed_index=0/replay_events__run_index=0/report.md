# Replay Event Audit Round ae78003a-4efe-425a-881a-d16a39bca0ad Seed 0

- round_id: `ae78003a-4efe-425a-881a-d16a39bca0ad`
- seed_index: `0`
- cell_event_count: `2317`
- frame_count: `51`
- replay_run_id: `0fb8492818fb419ba9a5e5ee824d27d4`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-events --round-id ae78003a-4efe-425a-881a-d16a39bca0ad --seed-index 0 --replay-run-index 0 --max-steps 2`
- selected_steps: `[47, 48]`
- settlement_transition_count: `9474`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/ae78003a-4efe-425a-881a-d16a39bca0ad/seed_index=0/20260320T120558.864791Z__sim_seed=1715428029__capture_id=0fb8492818fb419ba9a5e5ee824d27d4.json`

## Figures

- change_timeline: `change_timeline.png`
  Changed-cell and changed-settlement counts by yearly transition step.
- transition_step_47: `transition_step_47.png`
  Previous state, next state, and changed-cell overlay for one yearly transition.
- transition_step_48: `transition_step_48.png`
  Previous state, next state, and changed-cell overlay for one yearly transition.

## Step Audits

### Step 47 -> 48

- cell_events: `143`
- settlement_transitions: `419`
- figure: `transition_step_47.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest | matched_collapse_to_ruin | matched_settlement_rebuild |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | 4 | 1 | build | True | False | False | False | False | False | False |
| 1 | 9 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 1 | 16 | 11 | 3 | ruin | False | False | True | False | False | False | False |
| 2 | 3 | 4 | 1 | build | True | False | False | False | False | False | False |
| 2 | 9 | 3 | 11 | clear | False | False | False | False | False | False | False |
| 2 | 11 | 11 | 1 | build | True | False | False | False | False | False | False |
| 2 | 21 | 11 | 1 | build | True | False | False | False | False | False | False |
| 3 | 18 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 3 | 22 | 3 | 1 | rebuild | False | False | False | True | False | False | True |
| 3 | 23 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 5 | 10 | 11 | 1 | build | True | False | False | False | False | False | False |
| 5 | 20 | 3 | 11 | clear | False | False | False | False | False | False | False |

#### Settlement Transitions

| y | x | transition_kind | birth | rebuild | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | birth | True | False | False | False | False | False | False |  |  |  |  |
| 1 | 9 | collapse_to_ruin | False | False | True | True | False | False | False |  |  |  |  |
| 1 | 12 | stat_change | False | False | False | False | False | False | False | 0.10399999999999987 | -0.10899999999999999 | 0.0 | 0.07899999999999996 |
| 1 | 17 | stat_change | False | False | False | False | False | False | False | 0.10899999999999999 | -0.07500000000000001 | 0.0 | 0.034999999999999976 |
| 1 | 18 | stat_change | False | False | False | False | False | False | False | 0.06700000000000017 | -0.23899999999999996 | -0.0019999999999999983 | 0.0 |
| 1 | 20 | stat_change | False | False | False | False | False | False | False | 0.10399999999999998 | 0.26800000000000007 | 0.0 | 0.03 |
| 2 | 2 | stat_change | False | False | False | False | False | False | False | 0.1060000000000001 | -0.08099999999999996 | 0.0 | 0.040000000000000036 |
| 2 | 3 | birth | True | False | False | False | False | False | False |  |  |  |  |
| 2 | 4 | stat_change | False | False | False | False | False | False | False | 0.10299999999999998 | -0.07899999999999996 | 0.0 | 0.039000000000000035 |
| 2 | 11 | birth | True | False | False | False | False | False | False |  |  |  |  |
| 2 | 15 | stat_change | False | False | False | False | False | False | False | -0.008000000000000007 | -0.253 | 0.0 | 0.07199999999999995 |
| 2 | 17 | stat_change | False | False | False | False | False | False | False | 0.10499999999999998 | -0.07500000000000007 | 0.0 | 0.06000000000000005 |

### Step 48 -> 49

- cell_events: `131`
- settlement_transitions: `418`
- figure: `transition_step_48.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest | matched_collapse_to_ruin | matched_settlement_rebuild |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 9 | 3 | 11 | clear | False | False | False | False | False | False | False |
| 1 | 12 | 1 | 2 | port_gain | False | True | False | False | False | False | False |
| 1 | 16 | 3 | 1 | rebuild | False | False | False | True | False | False | True |
| 3 | 18 | 3 | 1 | rebuild | False | False | False | True | False | False | True |
| 3 | 19 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 3 | 23 | 3 | 1 | rebuild | False | False | False | True | False | False | True |
| 4 | 2 | 4 | 1 | build | True | False | False | False | False | False | False |
| 4 | 19 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 4 | 25 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 4 | 38 | 11 | 1 | build | True | False | False | False | False | False | False |
| 5 | 7 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 5 | 35 | 1 | 3 | ruin | False | False | True | False | False | True | False |

#### Settlement Transitions

| y | x | transition_kind | birth | rebuild | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | stat_change | False | False | False | False | False | False | False | 0.0 | 0.099 | 0.0 | 0.02099999999999999 |
| 1 | 12 | port_gain | False | False | False | False | True | False | False | 0.10499999999999998 | 0.0020000000000000018 | 0.005 | 0.049000000000000044 |
| 1 | 16 | rebuild | False | True | False | False | False | False | False |  |  |  |  |
| 1 | 17 | stat_change | False | False | False | False | False | False | False | 0.1100000000000001 | -0.06499999999999997 | 0.0 | 0.03999999999999998 |
| 1 | 18 | stat_change | False | False | False | False | False | False | False | 0.0 | -0.08200000000000002 | 0.006000000000000002 | 0.0 |
| 1 | 20 | stat_change | False | False | False | False | False | False | False | 0.10499999999999998 | 0.22199999999999998 | 0.0 | 0.034999999999999976 |
| 2 | 2 | stat_change | False | False | False | False | False | False | False | 0.10699999999999987 | -0.0050000000000000044 | 0.0 | 0.043999999999999984 |
| 2 | 3 | stat_change | False | False | False | False | False | False | False | 0.0 | 0.154 | 0.0 | 0.02099999999999999 |
| 2 | 4 | stat_change | False | False | False | False | False | False | False | 0.10299999999999998 | -0.0050000000000000044 | 0.0 | 0.04299999999999998 |
| 2 | 11 | stat_change | False | False | False | False | False | False | False | 0.018000000000000016 | 0.372 | 0.0 | -0.019000000000000017 |
| 2 | 15 | stat_change | False | False | False | False | False | False | False | 0.10899999999999999 | 0.11699999999999999 | 0.0 | 0.07700000000000007 |
| 2 | 17 | stat_change | False | False | False | False | False | False | False | 0.10400000000000009 | -0.025999999999999912 | 0.0 | 0.06399999999999995 |
