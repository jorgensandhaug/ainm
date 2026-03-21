# Regime Validation Ladder

Goal: validate summary/regime stack with the cheapest trustworthy runs first.

## Rung 1: One-round summary smoke

Purpose:
- verify summary fitter runs
- verify holdout metrics are sane
- catch probe/path/schema breakage

Command:

```bash
uv run astar evaluate-behavioral-fingerprint-summary \
  --profile smoke \
  --round-id 36e581f1-73f8-453f-ab98-cbe3052b701b \
  --summary-profile core_v1 \
  --name bf_summary_smoke_36e
```

Fast enough:
- target: < 15s wall

What to check:
- `mean_*_brier` and `mean_*_rmse` finite
- `min_probe_support_fraction` high
- if `all_probe_families_in_range` is false, inspect probe families before trusting cross-round work

Current observed run:
- wall: `12.84s`
- reported elapsed: `8.290s`

## Rung 2: Tiny regime smoke

Purpose:
- verify summary -> heldout regime validation path
- verify rank sweep runs cheaply
- check whether low-rank beats trivial baseline at all

Command:

```bash
uv run astar evaluate-regime-model \
  --profile smoke \
  --round-id 36e581f1-73f8-453f-ab98-cbe3052b701b \
  --round-id 71451d74-be9f-471f-aacd-a41f3b68a9cd \
  --round-id 76909e29-f664-4b2f-b16b-61b7507277e9 \
  --max-rank 2 \
  --bootstrap-samples 0 \
  --name regime_model_smoke_analyzed3
```

Fast enough:
- target: < 40s wall

What to check:
- `best_rank_by_*`
- `mean_reconstruction_rmse_improvement`
- `mean_terminal_weighted_kl_improvement`
- if improvements are negative, low-rank regime is not yet validated

Current observed run:
- wall: `33.73s`
- reported elapsed: `30.831s`
- result: low-rank still worse than mean baseline

## Rung 3: Real-corpus regime smoke

Purpose:
- verify real nontrivial rounds still run cheaply
- measure actual bottlenecks

Command:

```bash
uv run astar evaluate-regime-model \
  --profile smoke \
  --round-id 2a341ace-0f57-4309-9b89-e59fe0f09179 \
  --round-id 324fde07-1670-4202-b199-7aa92ecb40ee \
  --round-id 36e581f1-73f8-453f-ab98-cbe3052b701b \
  --max-rank 2 \
  --bootstrap-samples 0 \
  --name regime_model_eval_smoke_real_timed_v3
```

Current observed run:
- old wall: `259.37s`, max RSS `38.3GB`
- new wall: `28.47s`, max RSS `15.0GB`

## Rung 4: Teacher smoke

Purpose:
- verify whether summary/regime helps downstream teacher at all

Problem:
- current hazard-teacher science path is now the next slow rung
- one tiny smoke with 3 train rounds, 1 eval round, 4 rollouts was still too slow for normal iteration

Current recommendation:
- do not use teacher-science as the default inner loop
- only run after summary/regime changes survive rungs 1-3

## Decision rule

- If rung 1 fails: fix summary extraction/fitting
- If rung 1 passes but rung 2 fails: summary exists, regime compression not yet justified
- If rung 2 passes but rung 4 fails: regime abstraction exists, teacher mapping is weak
- If rung 3 regresses badly on speed: stop model work, fix runtime first

## Current conclusion

- Summary smoke: usable
- Regime smoke: fast enough
- Low-rank regime usefulness: not yet validated
- Teacher smoke: next performance bottleneck
