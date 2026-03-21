# Replay Event Audit Round 36e581f1-73f8-453f-ab98-cbe3052b701b Seed 3

- round_id: `36e581f1-73f8-453f-ab98-cbe3052b701b`
- seed_index: `3`
- cell_event_count: `1172`
- frame_count: `51`
- replay_run_id: `5d146e58d7ba47bbb5aab01fba893ca0`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-events --round-id 36e581f1-73f8-453f-ab98-cbe3052b701b --seed-index 3 --replay-run-index 0 --max-steps 3`
- selected_steps: `[47, 48, 49]`
- settlement_transition_count: `7006`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/36e581f1-73f8-453f-ab98-cbe3052b701b/seed_index=3/20260320T163827.590039Z__sim_seed=1647271942__capture_id=5d146e58d7ba47bbb5aab01fba893ca0.json`

## Figures

- change_timeline: `change_timeline.png`
  Changed-cell and changed-settlement counts by yearly transition step.
- transition_step_47: `transition_step_47.png`
  Previous state, next state, and changed-cell overlay for one yearly transition.
- transition_step_48: `transition_step_48.png`
  Previous state, next state, and changed-cell overlay for one yearly transition.
- transition_step_49: `transition_step_49.png`
  Previous state, next state, and changed-cell overlay for one yearly transition.

## Step Audits

### Step 47 -> 48

- cell_events: `30`
- settlement_transitions: `224`
- figure: `transition_step_47.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 31 | 11 | 1 | build | True | False | False | False | False |
| 3 | 34 | 4 | 1 | build | True | False | False | False | False |
| 5 | 28 | 1 | 3 | ruin | False | False | True | False | False |
| 6 | 18 | 1 | 3 | ruin | False | False | True | False | False |
| 7 | 13 | 3 | 11 | clear | False | False | False | False | False |
| 7 | 19 | 1 | 3 | ruin | False | False | True | False | False |
| 7 | 26 | 3 | 1 | rebuild | False | False | False | True | False |
| 9 | 16 | 11 | 1 | build | True | False | False | False | False |
| 11 | 12 | 3 | 1 | rebuild | False | False | False | True | False |
| 11 | 13 | 3 | 4 | ruin_to_forest | False | False | False | False | True |
| 14 | 3 | 11 | 1 | build | True | False | False | False | False |
| 14 | 35 | 2 | 3 | ruin | False | False | True | False | False |

#### Settlement Transitions

| y | x | transition_kind | birth | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | stat_change | False | False | False | False | False | False | 0.05599999999999994 | 0.118 | 0.0 | 0.041000000000000036 |
| 1 | 30 | stat_change | False | False | False | False | False | False | 0.03300000000000003 | 0.24800000000000003 | 0.0 | 0.03 |
| 1 | 31 | stat_change | False | False | False | False | False | False | 0.11999999999999988 | 0.04499999999999993 | 0.0 | 0.0 |
| 1 | 32 | stat_change | False | False | False | False | False | False | 0.0 | 0.020000000000000018 | 0.0 | 0.028000000000000025 |
| 1 | 33 | stat_change | False | False | False | False | False | False | 0.0 | 0.134 | 0.0 | 0.02200000000000002 |
| 2 | 1 | stat_change | False | False | False | False | False | False | 0.0 | -0.022999999999999993 | 0.0 | 0.0 |
| 2 | 3 | stat_change | False | False | False | False | False | False | 0.1060000000000001 | -0.020000000000000018 | 0.0 | 0.08499999999999996 |
| 2 | 10 | stat_change | False | False | False | False | False | False | 0.08499999999999996 | -0.015000000000000013 | 0.0 | 0.06000000000000005 |
| 2 | 11 | stat_change | False | False | False | False | False | False | 0.040000000000000036 | -0.008000000000000007 | 0.0 | 0.03400000000000003 |
| 2 | 31 | birth | True | False | False | False | False | False |  |  |  |  |
| 2 | 32 | stat_change | False | False | False | False | False | False | -0.135 | -0.277 | -0.002 | 0.0 |
| 2 | 33 | stat_change | False | False | False | False | False | False | 0.07700000000000007 | -0.013000000000000012 | 0.0 | 0.052000000000000046 |

### Step 48 -> 49

- cell_events: `25`
- settlement_transitions: `233`
- figure: `transition_step_48.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 16 | 11 | 1 | build | True | False | False | False | False |
| 4 | 27 | 11 | 1 | build | True | False | False | False | False |
| 5 | 28 | 3 | 11 | clear | False | False | False | False | False |
| 6 | 15 | 1 | 3 | ruin | False | False | True | False | False |
| 6 | 18 | 3 | 1 | rebuild | False | False | False | True | False |
| 7 | 9 | 4 | 1 | build | True | False | False | False | False |
| 7 | 19 | 3 | 1 | rebuild | False | False | False | True | False |
| 9 | 18 | 11 | 1 | build | True | False | False | False | False |
| 9 | 26 | 1 | 3 | ruin | False | False | True | False | False |
| 13 | 35 | 1 | 2 | port_gain | False | True | False | False | False |
| 14 | 35 | 3 | 1 | rebuild | False | False | False | True | False |
| 19 | 14 | 11 | 1 | build | True | False | False | False | False |

#### Settlement Transitions

| y | x | transition_kind | birth | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | stat_change | False | False | False | False | False | False | 0.06300000000000006 | 0.017000000000000015 | 0.0 | 0.044999999999999984 |
| 1 | 30 | stat_change | False | False | False | False | False | False | 0.038999999999999924 | 0.22800000000000004 | 0.0 | 0.033 |
| 1 | 31 | stat_change | False | False | False | False | False | False | 0.1200000000000001 | -0.09599999999999997 | 0.0 | 0.0 |
| 1 | 32 | stat_change | False | False | False | False | False | False | 0.0 | 0.07500000000000001 | 0.0 | 0.028000000000000025 |
| 1 | 33 | stat_change | False | False | False | False | False | False | 0.02999999999999997 | 0.185 | 0.0 | 0.024999999999999994 |
| 2 | 1 | stat_change | False | False | False | False | False | False | 0.0 | -0.028999999999999998 | 0.0 | 0.0 |
| 2 | 3 | stat_change | False | False | False | False | False | False | 0.10499999999999998 | 0.03500000000000003 | 0.0 | 0.03400000000000003 |
| 2 | 10 | stat_change | False | False | False | False | False | False | 0.09400000000000008 | 0.02300000000000002 | 0.0 | 0.06599999999999995 |
| 2 | 11 | stat_change | False | False | False | False | False | False | 0.04600000000000004 | 0.014000000000000012 | 0.0 | 0.03699999999999998 |
| 2 | 31 | stat_change | False | False | False | False | False | False | 0.0 | 0.18400000000000002 | 0.0 | 0.027999999999999997 |
| 2 | 32 | stat_change | False | False | False | False | False | False | 0.0 | -0.121 | 0.0 | 0.0 |
| 2 | 33 | stat_change | False | False | False | False | False | False | 0.08499999999999996 | 0.019999999999999907 | 0.0 | 0.05599999999999994 |

### Step 49 -> 50

- cell_events: `49`
- settlement_transitions: `239`
- figure: `transition_step_49.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 1 | 2 | 3 | ruin | False | False | True | False | False |
| 2 | 4 | 4 | 1 | build | True | False | False | False | False |
| 3 | 3 | 1 | 3 | ruin | False | False | True | False | False |
| 3 | 12 | 1 | 3 | ruin | False | False | True | False | False |
| 4 | 9 | 4 | 1 | build | True | False | False | False | False |
| 4 | 27 | 1 | 3 | ruin | False | False | True | False | False |
| 5 | 1 | 11 | 1 | build | True | False | False | False | False |
| 5 | 17 | 1 | 3 | ruin | False | False | True | False | False |
| 6 | 15 | 3 | 11 | clear | False | False | False | False | False |
| 6 | 18 | 1 | 3 | ruin | False | False | True | False | False |
| 6 | 19 | 1 | 3 | ruin | False | False | True | False | False |
| 6 | 25 | 1 | 3 | ruin | False | False | True | False | False |

#### Settlement Transitions

| y | x | transition_kind | birth | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | stat_change | False | False | False | False | False | False | 0.06899999999999995 | -0.07599999999999996 | 0.0 | 0.04799999999999999 |
| 1 | 30 | stat_change | False | False | False | False | False | False | 0.04300000000000004 | 0.22599999999999998 | 0.0 | 0.033999999999999975 |
| 1 | 31 | stat_change | False | False | False | False | False | False | 0.1200000000000001 | -0.301 | 0.0 | 0.0 |
| 1 | 32 | stat_change | False | False | False | False | False | False | 0.0 | 0.0040000000000000036 | 0.0 | 0.02899999999999997 |
| 1 | 33 | stat_change | False | False | False | False | False | False | 0.03300000000000003 | 0.11099999999999999 | 0.0 | 0.025999999999999995 |
| 2 | 1 | collapse_to_ruin | False | True | True | False | True | False |  |  |  |  |
| 2 | 3 | stat_change | False | False | False | False | False | False | -0.14900000000000002 | -0.367 | 0.0 | 0.0 |
| 2 | 4 | birth | True | False | False | False | False | False |  |  |  |  |
| 2 | 10 | stat_change | False | False | False | False | False | False | 0.10299999999999998 | -0.1110000000000001 | 0.0 | 0.07100000000000006 |
| 2 | 11 | stat_change | False | False | False | False | False | False | 0.050999999999999934 | -0.06099999999999994 | 0.0 | 0.040000000000000036 |
| 2 | 31 | stat_change | False | False | False | False | False | False | 0.038000000000000034 | 0.15099999999999997 | 0.0 | 0.031 |
| 2 | 32 | stat_change | False | False | False | False | False | False | 0.0 | -0.20900000000000002 | 0.0 | 0.0 |
