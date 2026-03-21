# Replay Event Audit Round 71451d74-be9f-471f-aacd-a41f3b68a9cd Seed 1

- round_id: `71451d74-be9f-471f-aacd-a41f3b68a9cd`
- seed_index: `1`
- cell_event_count: `1480`
- frame_count: `51`
- replay_run_id: `54fce64acd99443d8dfd6d1687e7ce48`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-events --round-id 71451d74-be9f-471f-aacd-a41f3b68a9cd --seed-index 1 --replay-run-index 0 --max-steps 2`
- selected_steps: `[47, 48]`
- settlement_transition_count: `8158`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/71451d74-be9f-471f-aacd-a41f3b68a9cd/seed_index=1/20260320T091030.064337Z__sim_seed=1110905655__capture_id=54fce64acd99443d8dfd6d1687e7ce48.json`

## Figures

- change_timeline: `change_timeline.png`
  Changed-cell and changed-settlement counts by yearly transition step.
- transition_step_47: `transition_step_47.png`
  Previous state, next state, and changed-cell overlay for one yearly transition.
- transition_step_48: `transition_step_48.png`
  Previous state, next state, and changed-cell overlay for one yearly transition.

## Step Audits

### Step 47 -> 48

- cell_events: `85`
- settlement_transitions: `327`
- figure: `transition_step_47.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 22 | 1 | 3 | ruin | False | False | True | False | False |
| 2 | 16 | 3 | 4 | ruin_to_forest | False | False | False | False | True |
| 3 | 31 | 11 | 1 | build | True | False | False | False | False |
| 4 | 6 | 4 | 3 | ruin | True | False | True | False | False |
| 4 | 29 | 11 | 1 | build | True | False | False | False | False |
| 5 | 2 | 11 | 1 | build | True | False | False | False | False |
| 5 | 5 | 1 | 3 | ruin | False | False | True | False | False |
| 5 | 9 | 1 | 3 | ruin | False | False | True | False | False |
| 5 | 11 | 4 | 1 | build | True | False | False | False | False |
| 5 | 15 | 1 | 3 | ruin | False | False | True | False | False |
| 5 | 21 | 4 | 1 | build | True | False | False | False | False |
| 6 | 20 | 11 | 1 | build | True | False | False | False | False |

#### Settlement Transitions

| y | x | transition_kind | birth | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 19 | stat_change | False | False | False | False | False | False | 0.262 | -0.15600000000000003 | 0.0 | 0.0 |
| 1 | 20 | stat_change | False | False | False | False | False | False | 0.04400000000000004 | -0.05599999999999994 | 0.0 | 0.019000000000000017 |
| 1 | 22 | collapse_to_ruin | False | True | True | False | False | False |  |  |  |  |
| 1 | 33 | stat_change | False | False | False | False | False | False | 0.07899999999999996 | -0.10100000000000009 | 0.0 | 0.03500000000000003 |
| 1 | 34 | stat_change | False | False | False | False | False | False | 0.07199999999999984 | -0.09100000000000008 | 0.0 | 0.031000000000000028 |
| 2 | 3 | stat_change | False | False | False | False | False | False | 0.041000000000000036 | -0.05399999999999994 | 0.0 | 0.019000000000000017 |
| 2 | 17 | stat_change | False | False | False | False | False | False | 0.03400000000000003 | -0.04899999999999993 | 0.0 | 0.017000000000000015 |
| 2 | 20 | stat_change | False | False | False | False | False | False | -0.10000000000000009 | -0.37 | -0.005999999999999998 | 0.0 |
| 2 | 21 | stat_change | False | False | False | False | False | False | 0.039999999999999925 | -0.04999999999999993 | 0.0 | 0.01799999999999996 |
| 2 | 31 | stat_change | False | False | False | False | False | False | 0.05700000000000005 | -0.07199999999999995 | 0.0 | 0.024999999999999967 |
| 2 | 33 | stat_change | False | False | False | False | False | False | -0.121 | -0.30100000000000005 | -0.0009999999999999992 | 0.03500000000000003 |
| 3 | 3 | stat_change | False | False | False | False | False | False | 0.04500000000000004 | -0.0010000000000000009 | 0.0 | 0.020000000000000018 |

### Step 48 -> 49

- cell_events: `66`
- settlement_transitions: `328`
- figure: `transition_step_48.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 22 | 3 | 11 | clear | False | False | False | False | False |
| 3 | 9 | 11 | 1 | build | True | False | False | False | False |
| 4 | 6 | 3 | 4 | ruin_to_forest | False | False | False | False | True |
| 4 | 8 | 11 | 1 | build | True | False | False | False | False |
| 5 | 5 | 3 | 11 | clear | False | False | False | False | False |
| 5 | 9 | 3 | 4 | ruin_to_forest | False | False | False | False | True |
| 5 | 11 | 1 | 3 | ruin | False | False | True | False | False |
| 5 | 15 | 3 | 1 | rebuild | False | False | False | True | False |
| 6 | 20 | 1 | 3 | ruin | False | False | True | False | False |
| 7 | 4 | 11 | 1 | build | True | False | False | False | False |
| 7 | 14 | 11 | 1 | build | True | False | False | False | False |
| 9 | 6 | 1 | 3 | ruin | False | False | True | False | False |

#### Settlement Transitions

| y | x | transition_kind | birth | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 19 | stat_change | False | False | False | False | False | False | 0.11299999999999999 | -0.039999999999999925 | 0.0 | 0.0 |
| 1 | 20 | stat_change | False | False | False | False | False | False | 0.04699999999999993 | 0.04899999999999993 | 0.0 | 0.020999999999999963 |
| 1 | 33 | stat_change | False | False | False | False | False | False | 0.08299999999999996 | 0.028000000000000025 | 0.0 | 0.03700000000000003 |
| 1 | 34 | stat_change | False | False | False | False | False | False | 0.07700000000000018 | -0.007000000000000006 | 0.0 | 0.03399999999999992 |
| 2 | 3 | stat_change | False | False | False | False | False | False | 0.04500000000000004 | 0.04699999999999993 | 0.0 | 0.020000000000000018 |
| 2 | 17 | stat_change | False | False | False | False | False | False | 0.03699999999999992 | 0.040999999999999925 | 0.0 | 0.017000000000000015 |
| 2 | 20 | stat_change | False | False | False | False | False | False | 0.11299999999999999 | -0.05400000000000002 | 0.0 | 0.0 |
| 2 | 21 | stat_change | False | False | False | False | False | False | 0.041000000000000036 | 0.04399999999999993 | 0.0 | 0.019000000000000017 |
| 2 | 31 | stat_change | False | False | False | False | False | False | 0.05999999999999994 | 0.06300000000000006 | 0.0 | 0.027000000000000024 |
| 2 | 33 | stat_change | False | False | False | False | False | False | 0.09699999999999998 | 0.15000000000000002 | 0.0 | 0.03699999999999992 |
| 3 | 3 | stat_change | False | False | False | False | False | False | 0.04699999999999993 | 0.05999999999999994 | 0.0 | 0.019999999999999962 |
| 3 | 4 | stat_change | False | False | False | False | False | False | 0.07299999999999995 | 0.06800000000000006 | 0.0 | 0.03299999999999992 |
