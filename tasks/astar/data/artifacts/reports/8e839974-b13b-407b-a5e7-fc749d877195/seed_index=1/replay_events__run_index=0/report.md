# Replay Event Audit Round 8e839974-b13b-407b-a5e7-fc749d877195 Seed 1

- round_id: `8e839974-b13b-407b-a5e7-fc749d877195`
- seed_index: `1`
- cell_event_count: `1194`
- frame_count: `51`
- replay_run_id: `7eda6fe4951e467090cb592e2a30a75f`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-events --round-id 8e839974-b13b-407b-a5e7-fc749d877195 --seed-index 1 --replay-run-index 0 --max-steps 3`
- selected_steps: `[47, 48, 49]`
- settlement_transition_count: `6215`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/8e839974-b13b-407b-a5e7-fc749d877195/seed_index=1/20260320T104302.277304Z__sim_seed=702241945__capture_id=7eda6fe4951e467090cb592e2a30a75f.json`

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

- cell_events: `47`
- settlement_transitions: `273`
- figure: `transition_step_47.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 15 | 11 | 1 | build | True | False | False | False | False |
| 2 | 15 | 11 | 1 | build | True | False | False | False | False |
| 3 | 17 | 1 | 3 | ruin | False | False | True | False | False |
| 3 | 23 | 1 | 3 | ruin | False | False | True | False | False |
| 4 | 34 | 11 | 1 | build | True | False | False | False | False |
| 4 | 37 | 11 | 1 | build | True | False | False | False | False |
| 5 | 16 | 4 | 1 | build | True | False | False | False | False |
| 7 | 21 | 11 | 1 | build | True | False | False | False | False |
| 9 | 32 | 11 | 1 | build | True | False | False | False | False |
| 10 | 28 | 4 | 1 | build | True | False | False | False | False |
| 11 | 6 | 11 | 1 | build | True | False | False | False | False |
| 11 | 29 | 11 | 1 | build | True | False | False | False | False |

#### Settlement Transitions

| y | x | transition_kind | birth | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 8 | stat_change | False | False | False | False | False | False | 0.0 | 0.069 | 0.0010000000000000009 | 0.0 |
| 1 | 9 | stat_change | False | False | False | False | False | False | 0.04500000000000004 | -0.0010000000000000009 | 0.0 | 0.02200000000000002 |
| 1 | 14 | stat_change | False | False | False | False | False | False | 0.0 | 0.24499999999999997 | 0.0 | 0.014000000000000012 |
| 1 | 15 | birth | True | False | False | False | False | False |  |  |  |  |
| 1 | 16 | stat_change | False | False | False | False | False | False | -0.13600000000000012 | -0.2789999999999999 | -0.006000000000000002 | 0.03500000000000003 |
| 1 | 24 | stat_change | False | False | False | False | False | False | 0.09400000000000008 | -0.0010000000000000009 | 0.0 | 0.04300000000000004 |
| 2 | 6 | stat_change | False | False | False | False | False | False | 0.01200000000000001 | 0.0 | 0.0 | 0.006000000000000005 |
| 2 | 8 | stat_change | False | False | False | False | False | False | 0.08400000000000007 | -0.0010000000000000009 | 0.0 | 0.03899999999999998 |
| 2 | 15 | birth | True | False | False | False | False | False |  |  |  |  |
| 2 | 22 | stat_change | False | False | False | False | False | False | 0.08800000000000008 | -0.0020000000000000018 | 0.0 | 0.041000000000000036 |
| 2 | 23 | stat_change | False | False | False | False | False | False | 0.05399999999999994 | -0.0010000000000000009 | 0.0 | 0.025000000000000022 |
| 2 | 32 | stat_change | False | False | False | False | False | False | 0.04500000000000004 | 0.0 | 0.0 | 0.02100000000000002 |

### Step 48 -> 49

- cell_events: `39`
- settlement_transitions: `276`
- figure: `transition_step_48.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 32 | 11 | 1 | build | True | False | False | False | False |
| 2 | 34 | 11 | 3 | ruin | True | False | True | False | False |
| 3 | 17 | 3 | 11 | clear | False | False | False | False | False |
| 3 | 23 | 3 | 1 | rebuild | False | False | False | True | False |
| 4 | 4 | 1 | 3 | ruin | False | False | True | False | False |
| 4 | 37 | 1 | 3 | ruin | False | False | True | False | False |
| 5 | 37 | 1 | 3 | ruin | False | False | True | False | False |
| 10 | 34 | 1 | 3 | ruin | False | False | True | False | False |
| 11 | 6 | 1 | 3 | ruin | False | False | True | False | False |
| 11 | 7 | 11 | 1 | build | True | False | False | False | False |
| 12 | 28 | 1 | 3 | ruin | False | False | True | False | False |
| 13 | 26 | 1 | 3 | ruin | False | False | True | False | False |

#### Settlement Transitions

| y | x | transition_kind | birth | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 8 | stat_change | False | False | False | False | False | False | 0.0 | 0.05099999999999999 | 0.0 | 0.0 |
| 1 | 9 | stat_change | False | False | False | False | False | False | 0.050000000000000044 | -0.017999999999999905 | 0.0 | 0.022999999999999965 |
| 1 | 14 | stat_change | False | False | False | False | False | False | 0.02999999999999997 | 0.15999999999999998 | 0.0 | 0.014999999999999986 |
| 1 | 15 | stat_change | False | False | False | False | False | False | 0.0 | 0.068 | 0.0 | 0.016999999999999987 |
| 1 | 16 | stat_change | False | False | False | False | False | False | 0.1100000000000001 | 0.21299999999999997 | 0.0020000000000000018 | 0.0 |
| 1 | 24 | stat_change | False | False | False | False | False | False | 0.10299999999999998 | -0.03600000000000003 | 0.0 | 0.04699999999999993 |
| 1 | 32 | birth | True | False | False | False | False | False |  |  |  |  |
| 2 | 6 | stat_change | False | False | False | False | False | False | 0.011999999999999983 | -0.0050000000000000044 | 0.0 | 0.0059999999999999915 |
| 2 | 8 | stat_change | False | False | False | False | False | False | 0.09099999999999997 | -0.03200000000000003 | 0.0 | 0.04200000000000004 |
| 2 | 15 | stat_change | False | False | False | False | False | False | 0.038000000000000034 | 0.355 | 0.0 | 0.01899999999999999 |
| 2 | 22 | stat_change | False | False | False | False | False | False | 0.09499999999999997 | -0.03300000000000003 | 0.0 | 0.04499999999999993 |
| 2 | 23 | stat_change | False | False | False | False | False | False | 0.05900000000000005 | -0.020999999999999908 | 0.0 | 0.02799999999999997 |

### Step 49 -> 50

- cell_events: `94`
- settlement_transitions: `270`
- figure: `transition_step_49.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 9 | 2 | 3 | ruin | False | False | True | False | False |
| 1 | 14 | 1 | 3 | ruin | False | False | True | False | False |
| 1 | 15 | 1 | 3 | ruin | False | False | True | False | False |
| 2 | 8 | 1 | 3 | ruin | False | False | True | False | False |
| 2 | 34 | 3 | 11 | clear | False | False | False | False | False |
| 2 | 36 | 1 | 3 | ruin | False | False | True | False | False |
| 3 | 12 | 1 | 3 | ruin | False | False | True | False | False |
| 3 | 20 | 1 | 3 | ruin | False | False | True | False | False |
| 3 | 23 | 1 | 3 | ruin | False | False | True | False | False |
| 3 | 37 | 1 | 3 | ruin | False | False | True | False | False |
| 4 | 4 | 3 | 1 | rebuild | False | False | False | True | False |
| 4 | 14 | 1 | 3 | ruin | False | False | True | False | False |

#### Settlement Transitions

| y | x | transition_kind | birth | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 8 | stat_change | False | False | False | False | False | False | 0.30699999999999994 | -0.136 | 0.0030000000000000027 | 0.0 |
| 1 | 9 | collapse_to_ruin | False | True | True | False | True | False |  |  |  |  |
| 1 | 14 | collapse_to_ruin | False | True | True | False | False | False |  |  |  |  |
| 1 | 15 | collapse_to_ruin | False | True | True | False | False | False |  |  |  |  |
| 1 | 16 | stat_change | False | False | False | False | False | False | 0.2549999999999999 | -0.03700000000000003 | 0.0019999999999999983 | 0.0 |
| 1 | 24 | stat_change | False | False | False | False | False | False | 0.10799999999999987 | -0.06399999999999995 | 0.0 | 0.050000000000000044 |
| 1 | 32 | stat_change | False | False | False | False | False | False | 0.0 | 0.121 | 0.0 | 0.016999999999999987 |
| 2 | 6 | stat_change | False | False | False | False | False | False | 0.014000000000000012 | -0.008000000000000007 | 0.0 | 0.007000000000000006 |
| 2 | 8 | collapse_to_ruin | False | True | True | False | False | False |  |  |  |  |
| 2 | 15 | stat_change | False | False | False | False | False | False | 0.040999999999999925 | 0.30000000000000004 | 0.0 | 0.01999999999999999 |
| 2 | 22 | stat_change | False | False | False | False | False | False | 0.1459999999999999 | -0.06099999999999994 | 0.0 | 0.04700000000000004 |
| 2 | 23 | stat_change | False | False | False | False | False | False | 0.06299999999999994 | -0.03700000000000003 | 0.0 | 0.029000000000000026 |
