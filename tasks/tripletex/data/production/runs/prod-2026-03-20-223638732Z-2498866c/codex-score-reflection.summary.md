## 1. Task Attribution

`task-attribution.json` did not resolve a single task id; `inference_status` is `ambiguous`.

Best attribution: `tx_task_id=15`.
Reason: in `leaderboard.after.json`, task `15` is the only row whose `last_attempt_at` moved to `2026-03-20T22:38:00.387802+00:00`, which matches the completed submission timestamp recovered from local submissions history.

## 2. Correctness Verdict

Correctness was effectively perfect.

`submission-score.json` was not usable for scoring because it says:
- `status: skipped`
- `reason: reflection_not_completed`
- `reflection_status: timed_out`

Actual submission result had to be recovered from local submissions history for the matching completion timestamp `2026-03-20T22:38:00.387802+00:00`:
- `score_raw: 8`
- `score_max: 8`
- `normalized_score: 2.96`
- feedback: `4/4 checks passed`

So final Tripletex state matched intent; this was not a wrong-data run.

## 3. Efficiency Verdict

Inefficient.

Because correctness was perfect, the weaker score is an efficiency signal, not a correctness signal.

Evidence:
- recovered submission `normalized_score = 2.96`
- attributed leaderboard best for task `15` was already `3.5` before the run and stayed `3.5` after the run
- therefore this run finished below the known task ceiling despite perfect correctness

Most likely conclusion: at least one unnecessary API call happened, and possibly more than one. The run did not improve the leaderboard best.

## 4. Likely Root Cause

Likely waste came from branch selection inside the generic script, not from wrong payload mapping.

The saved run script proves these possible extra-call branches existed:
- unconditional first resolver: `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)`
- conditional fallback `GET /employee` if the expanded project row did not prove the manager
- conditional `PUT /project` if the row did not prove `fixedprice=473250`
- conditional `/ledger/account` repair branch on invoice failure

The trace does not contain the actual HTTP branch outcome, so exact wasted call count is not directly observable. But prior sandbox proof for this exact task family already established the floor:
- `4` calls if the first project read already proves customer + manager + fixed price
- `5` calls if the first project read proves customer + manager but fixed price still needs updating

Given this run scored below the task best, the likely waste was one of:
- unnecessary `GET /employee` even though `projectManager.email` was already proven in the first project row
- unnecessary `PUT /project` even though the first row already proved `fixedprice=473250`
- less likely, hidden invoice repair branch through `/ledger/account`

The strongest signal is the first two, because the script was built around those branches and the known floor for this task family is already `4/5` calls.

## 5. What Went Right

- Exact trusted-standard match recognized early.
- No broad spec re-checking or internet lookup.
- Correct milestone arithmetic: `473250 * 25% = 118312.5`.
- Correct final business result: fixed-price project state plus milestone invoice.
- No extra verification read after invoice creation.
- No evidence of correctness failure; recovered submission feedback was `4/4 checks passed`.

## 6. What To Change Next Time

- Treat the first expanded `GET /project` as the decisive branch point.
- If that row already proves exact customer, exact manager email, and `fixedprice=<prompt-fixed-price>`, stop paying resolver/update tax and use the `4`-call path:
  `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
- If that row already proves exact customer and exact manager email but not the fixed price, use the `5`-call path:
  `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
- Do not keep `GET /employee` in the hot path once `projectManager.email` is already proven by `projectManager(*)` on the first project read.
- Do not keep `PUT /project` in the hot path once that same row already proves the target fixed price.
- Keep avoiding default `/ledger/account` preflights and default verification reads; only branch there on live evidence.
- For this exact run family, score lag with perfect correctness should be interpreted as branch inefficiency, not as payload/correctness uncertainty.
