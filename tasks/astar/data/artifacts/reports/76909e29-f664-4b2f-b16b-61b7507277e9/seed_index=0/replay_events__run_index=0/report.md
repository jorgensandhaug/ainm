# Replay Event Audit Round 76909e29-f664-4b2f-b16b-61b7507277e9 Seed 0

- round_id: `76909e29-f664-4b2f-b16b-61b7507277e9`
- seed_index: `0`
- cell_event_count: `1468`
- frame_count: `51`
- replay_run_id: `880698e508784ccea5b78ca6b2532f29`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-events --round-id 76909e29-f664-4b2f-b16b-61b7507277e9 --seed-index 0 --replay-run-index 0 --max-steps 2`
- selected_steps: `[46, 47]`
- settlement_transition_count: `7233`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/76909e29-f664-4b2f-b16b-61b7507277e9/seed_index=0/20260320T091709.204056Z__sim_seed=129751314__capture_id=880698e508784ccea5b78ca6b2532f29.json`

## Figures

- change_timeline: `change_timeline.png`
  Changed-cell and changed-settlement counts by yearly transition step.
- transition_step_46: `transition_step_46.png`
  Previous state, next state, and changed-cell overlay for one yearly transition.
- transition_step_47: `transition_step_47.png`
  Previous state, next state, and changed-cell overlay for one yearly transition.

## Step Audits

### Step 46 -> 47

- cell_events: `89`
- settlement_transitions: `288`
- figure: `transition_step_46.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 15 | 1 | 3 | ruin | False | False | True | False | False |
| 1 | 18 | 1 | 2 | port_gain | False | True | False | False | False |
| 2 | 20 | 1 | 3 | ruin | False | False | True | False | False |
| 3 | 17 | 1 | 3 | ruin | False | False | True | False | False |
| 3 | 21 | 1 | 3 | ruin | False | False | True | False | False |
| 4 | 4 | 1 | 3 | ruin | False | False | True | False | False |
| 4 | 13 | 1 | 3 | ruin | False | False | True | False | False |
| 4 | 26 | 3 | 4 | ruin_to_forest | False | False | False | False | True |
| 5 | 13 | 4 | 3 | ruin | False | False | True | False | False |
| 5 | 18 | 1 | 3 | ruin | False | False | True | False | False |
| 5 | 24 | 1 | 3 | ruin | False | False | True | False | False |
| 6 | 13 | 11 | 1 | build | True | False | False | False | False |

#### Settlement Transitions

| y | x | transition_kind | birth | rebuild | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | stat_change | False | False | False | False | False | False | False | 0.0 | 0.36399999999999993 | 0.0 | 0.024999999999999994 |
| 1 | 15 | collapse_to_ruin | False | False | True | True | False | False | False |  |  |  |  |
| 1 | 18 | port_gain | False | False | False | False | True | False | False | 0.11199999999999988 | -0.135 | 0.008 | 0.0 |
| 2 | 12 | stat_change | False | False | False | False | False | False | False | 0.07299999999999995 | -0.050999999999999934 | 0.002 | 0.03500000000000003 |
| 2 | 14 | stat_change | False | False | False | False | False | False | False | 0.07799999999999985 | -0.22399999999999998 | -0.0049999999999999975 | 0.0 |
| 2 | 20 | collapse_to_ruin | False | False | True | True | False | False | False |  |  |  |  |
| 2 | 22 | stat_change | False | False | False | False | False | False | False | 0.4249999999999998 | -0.16099999999999992 | 0.0 | 0.0 |
| 3 | 7 | stat_change | False | False | False | False | False | False | False | -0.06499999999999995 | -0.22999999999999998 | -0.004999999999999999 | -0.05999999999999997 |
| 3 | 17 | collapse_to_ruin | False | False | True | True | False | False | False |  |  |  |  |
| 3 | 18 | stat_change | False | False | False | False | False | False | False | -0.11599999999999999 | -0.029000000000000026 | -0.003 | -0.07599999999999998 |
| 3 | 21 | collapse_to_ruin | False | False | True | True | False | False | False |  |  |  |  |
| 3 | 26 | stat_change | False | False | False | False | False | False | False | 0.0 | -0.253 | 0.0 | 0.0 |

### Step 47 -> 48

- cell_events: `95`
- settlement_transitions: `283`
- figure: `transition_step_47.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 15 | 3 | 1 | rebuild | False | False | False | True | False |
| 2 | 20 | 3 | 1 | rebuild | False | False | False | True | False |
| 3 | 7 | 1 | 3 | ruin | False | False | True | False | False |
| 3 | 17 | 3 | 1 | rebuild | False | False | False | True | False |
| 3 | 18 | 1 | 3 | ruin | False | False | True | False | False |
| 3 | 21 | 3 | 1 | rebuild | False | False | False | True | False |
| 4 | 4 | 3 | 1 | rebuild | False | False | False | True | False |
| 4 | 13 | 3 | 1 | rebuild | False | False | False | True | False |
| 4 | 22 | 11 | 1 | build | True | False | False | False | False |
| 5 | 13 | 3 | 1 | rebuild | False | False | False | True | False |
| 5 | 18 | 3 | 11 | clear | False | False | False | False | False |
| 5 | 24 | 3 | 1 | rebuild | False | False | False | True | False |

#### Settlement Transitions

| y | x | transition_kind | birth | rebuild | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | stat_change | False | False | False | False | False | False | False | 0.05700000000000005 | 0.32600000000000007 | 0.0 | 0.027999999999999997 |
| 1 | 15 | rebuild | False | True | False | False | False | False | False |  |  |  |  |
| 1 | 18 | stat_change | False | False | False | False | False | False | False | 0.11100000000000021 | 0.18500000000000005 | 0.001999999999999995 | 0.0 |
| 2 | 12 | stat_change | False | False | False | False | False | False | False | -0.07299999999999995 | -0.128 | -0.005 | -0.068 |
| 2 | 14 | stat_change | False | False | False | False | False | False | False | 0.1120000000000001 | 0.276 | 0.0 | 0.0 |
| 2 | 20 | rebuild | False | True | False | False | False | False | False |  |  |  |  |
| 2 | 22 | stat_change | False | False | False | False | False | False | False | -0.13600000000000012 | -0.02200000000000002 | -0.0030000000000000027 | 0.0 |
| 3 | 7 | collapse_to_ruin | False | False | True | True | False | False | False |  |  |  |  |
| 3 | 17 | rebuild | False | True | False | False | False | False | False |  |  |  |  |
| 3 | 18 | collapse_to_ruin | False | False | True | True | False | False | False |  |  |  |  |
| 3 | 21 | rebuild | False | True | False | False | False | False | False |  |  |  |  |
| 3 | 26 | stat_change | False | False | False | False | False | False | False | 0.0 | 0.198 | 0.0 | 0.0 |
