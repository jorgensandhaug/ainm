# Replay Event Audit Round 71451d74-be9f-471f-aacd-a41f3b68a9cd Seed 0

- round_id: `71451d74-be9f-471f-aacd-a41f3b68a9cd`
- seed_index: `0`
- cell_event_count: `941`
- frame_count: `51`
- replay_run_id: `2a3e5803778e4e28bc6047ba0b250a3c`
- replay_run_index: `0`
- rerun_command: `uv run astar visualize-replay-events --round-id 71451d74-be9f-471f-aacd-a41f3b68a9cd --seed-index 0 --replay-run-index 0 --max-steps 1`
- selected_steps: `[48]`
- settlement_transition_count: `5100`
- source_path: `/home/jorge/ainm/tasks/astar/data/raw/replays/71451d74-be9f-471f-aacd-a41f3b68a9cd/seed_index=0/20260320T090423.960062Z__sim_seed=1997692158__capture_id=2a3e5803778e4e28bc6047ba0b250a3c.json`

## Figures

- change_timeline: `change_timeline.png`
  Changed-cell and changed-settlement counts by yearly transition step.
- transition_step_48: `transition_step_48.png`
  Previous state, next state, and changed-cell overlay for one yearly transition.

## Step Audits

### Step 48 -> 49

- cell_events: `59`
- settlement_transitions: `204`
- figure: `transition_step_48.png`

#### Cell Events

| y | x | prev_code | next_code | event_kind | built_created | port_created | ruin_created | rebuilt_from_ruin | reclaimed_by_forest | matched_collapse_to_ruin | matched_settlement_rebuild |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 25 | 2 | 3 | ruin | False | False | True | False | False | True | False |
| 1 | 28 | 1 | 2 | port_gain | False | True | False | False | False | False | False |
| 2 | 6 | 11 | 3 | ruin | False | False | True | False | False | False | False |
| 2 | 9 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 2 | 25 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 3 | 14 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 4 | 11 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 4 | 18 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 4 | 19 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 4 | 22 | 3 | 4 | ruin_to_forest | False | False | False | False | True | False | False |
| 4 | 26 | 1 | 3 | ruin | False | False | True | False | False | True | False |
| 6 | 17 | 1 | 3 | ruin | False | False | True | False | False | True | False |

#### Settlement Transitions

| y | x | transition_kind | birth | rebuild | collapse | collapse_to_ruin | port_gain | port_loss | owner_flip | population_delta | food_delta | wealth_delta | defense_delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6 | stat_change | False | False | False | False | False | False | False | 0.126 | -0.03500000000000003 | 0.0 | 0.022999999999999965 |
| 1 | 25 | collapse_to_ruin | False | False | True | True | False | False | False |  |  |  |  |
| 1 | 26 | stat_change | False | False | False | False | False | False | False | 0.049000000000000044 | -0.03500000000000003 | 0.0 | 0.02200000000000002 |
| 1 | 28 | port_gain | False | False | False | False | True | False | False | 0.03299999999999992 | 0.21799999999999997 | 0.0 | 0.014999999999999986 |
| 2 | 9 | collapse_to_ruin | False | False | True | True | False | False | False |  |  |  |  |
| 2 | 14 | stat_change | False | False | False | False | False | False | False | -0.067 | 0.04799999999999999 | 0.0 | -0.04100000000000001 |
| 2 | 15 | stat_change | False | False | False | False | False | False | False | 0.0 | 0.18700000000000006 | 0.001 | 0.01100000000000001 |
| 2 | 16 | stat_change | False | False | False | False | False | False | False | 0.08799999999999986 | -0.061999999999999944 | 0.004000000000000002 | 0.041000000000000036 |
| 2 | 18 | stat_change | False | False | False | False | False | False | False | 0.028000000000000025 | 0.368 | 0.0 | 0.012999999999999984 |
| 2 | 23 | stat_change | False | False | False | False | False | False | False | 0.030999999999999917 | 0.07100000000000006 | 0.0 | 0.014999999999999986 |
| 2 | 25 | collapse_to_ruin | False | False | True | True | False | False | False |  |  |  |  |
| 3 | 11 | stat_change | False | False | False | False | False | False | False | 0.43399999999999994 | -0.08100000000000007 | 0.0 | 0.015000000000000013 |
