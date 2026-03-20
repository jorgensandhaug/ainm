## Task Attribution

`task-attribution.json` does not give a definitive task id. It is marked `inference_status: "ambiguous"` with `diff_entry_count: 3`.

The strongest attribution is `tx_task_id = "10"`. Evidence:

- `leaderboard.diff.json` shows task `10` improved from `2.6667` to `3` with `last_attempt_after = 2026-03-20T22:35:15.616689+00:00`.
- `submissions.after.json` contains submission `afbfe611-50c1-4884-9b41-19089c8f6732`, queued at `2026-03-20T22:33:33.756827+00:00`, completed at `2026-03-20T22:35:15.616689+00:00`, with `score_raw = 8`, `score_max = 8`, `normalized_score = 3`, and `5/5 checks passed`.
- That completion timestamp matches the changed leaderboard row for task `10` exactly.

So attribution is still formally ambiguous, but task `10` is the likely scored task for this run.

## Correctness Verdict

Likely perfect correctness.

The likely submission scored `8/8`, `5/5 checks passed`, so correctness was effectively `1`. There is no signal of wrong customer, wrong products, wrong prices, wrong invoice/payment intent, or missing side effects.

## Efficiency Verdict

Likely efficient, not just correct.

The likely submission had `normalized_score = 3`, and the attributed leaderboard row for task `10` moved to `best_score = 3`. That means this run matched the leaderboard best for the task instead of lagging it.

Given the prior reflection and Codex trace, there is no evidence of wasted retries, avoidable `4xx`s, unnecessary verification reads, or an unnecessary split payment tail. The run likely used the intended `5`-call path:

1. `GET /customer`
2. `GET /product`
3. `GET /invoice/paymentType`
4. `POST /order`
5. `PUT /order/{id}/:invoice` with combined payment params

## Likely Root Cause

There is no correctness failure to explain.

The only real risk in this task family was efficiency drift from one of these avoidable mistakes:

- hardcoding a sandbox `paymentTypeId`
- adding a speculative `/ledger/account` preflight
- adding a follow-up `PUT /invoice/{id}/:payment`
- adding a verification `GET /order/{id}` or `GET /invoice/{id}`

This run appears to have avoided those mistakes. The score data does not indicate hidden inefficiency beyond normal task weight/scaling.

## What Went Right

- The run matched the exact trusted-standard task shape.
- The final state was correct enough to pass all scored checks.
- The run likely resolved `paymentTypeId` dynamically instead of hardcoding the sandbox id.
- The run likely avoided the old 6-call split-tail path and used the lower-call combined invoice-and-payment write.
- The run likely avoided the `/ledger/account` hedge, which would have been wasted here.
- The run likely avoided all avoidable `4xx`s.

## What To Change Next Time

- Keep the same `5`-call default path for a fresh exact-match order->invoice->full-payment run.
- Only drop to `4` calls if the same run already holds a proven reusable `paymentTypeId` for the same company and currency.
- Continue resolving `/invoice/paymentType` dynamically; do not reuse ids from sandbox or older runs.
- Continue skipping `/ledger/account` unless a live validation error proves the bank-account branch is needed.
- Continue trusting the combined invoice write when it already returns outstanding `0`; do not add a standalone payment write or extra verify reads.