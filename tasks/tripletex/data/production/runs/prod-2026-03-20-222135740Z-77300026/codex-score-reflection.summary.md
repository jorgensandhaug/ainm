## Task Attribution
`task-attribution.json` did not resolve a unique task id; `inference_status` is `ambiguous`.

Best attribution: `tx_task_id` `15`.

Why `15` is the most likely match:
- `leaderboard.diff.json` shows task `15` got a new attempt with `last_attempt_after = 2026-03-20T22:24:11.975904+00:00`.
- `submissions.after.json` shows submission `92a00ab9-1a26-4d0f-8151-2caaa49cd749` completed at that exact timestamp.
- That submission was already `processing` in `submissions.before.json`, matching this run window.

## Correctness Verdict
Likely perfect correctness.

`submission-score.json` itself stayed ambiguous, but the matching submission in `submissions.after.json` shows:
- `score_raw = 8`
- `score_max = 8`
- `normalized_score = 2.96`
- feedback: `4/4 checks passed`

Under the decision rule, this indicates the final Tripletex state was correct.

## Efficiency Verdict
Likely inefficient relative to the best known score for the same task.

For attributed task `15`:
- leaderboard best before: `3.5`
- leaderboard best after: `3.5`
- likely run score: `2.96`

So the run appears to have had perfect correctness but lagged the task leaderboard by `0.54` normalized points. That is an efficiency signal, not a correctness signal.

## Likely Root Cause
The trace shows no visible recovery branch, no retry loop, and no `4xx` failure. The production script finished cleanly and returned the correct invoice totals. That makes one avoidable read the most likely culprit.

Most likely wasted call: `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`

Why this is the strongest explanation:
- The run already used the exact skip-`PUT /project` branch.
- It already avoided separate `GET /customer` and `GET /employee`.
- It did not hit the `/ledger/account` repair branch.
- The initial `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` likely already returned reusable `project.vatType.id` on the exact existing project row.
- A previous task best of `3.5` versus this run’s `2.96` is consistent with one unnecessary read on an otherwise correct flow.

So the earlier post-run conclusion that the `4`-call path was minimal was likely wrong for this exact scored task. The more likely winner is:
1. `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)`
2. `POST /order` using `project.vatType.id` from that same project row
3. `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`

Fallback rule for the next agent:
- Only spend `GET /ledger/vatType` if the initial project row does not expose a usable `vatType.id`, or if the prompt explicitly signals a VAT treatment that should not be inherited from the existing project.

## What Went Right
- The run executed the right intent and produced the correct side effects.
- It reused the initial project resolver to skip separate customer and employee reads.
- It correctly skipped `PUT /project` because the project row already proved the target fixed price and manager.
- It avoided the known `/ledger/account` hedge/recovery waste.
- It produced the correct taxable invoice totals: `amountExcludingVatCurrency = 215375` and `amountCurrencyOutstanding = 269218.75`.
- It appears to have finished with zero validation failures.

## What To Change Next Time
- On this exact task shape, treat the initial expanded `GET /project` as the first place to source VAT as well as project/customer/manager state.
- If that project row already exposes a reusable `project.vatType.id`, do not automatically call `GET /ledger/vatType`.
- Reclassify the old `4`-call skip-`PUT` branch as likely one-call too expensive for the exact existing-project case.
- Keep the current good behavior of skipping `GET /customer`, `GET /employee`, and `PUT /project` when the initial project row already proves those facts.
- Keep `/ledger/account` out of the path unless the invoice write actually proves the company-bank-account prerequisite is missing.