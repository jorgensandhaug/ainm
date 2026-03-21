# Score-Aware Reflection

## Task Attribution

- **tx_task_id:** 28
- **Tier:** T3 (tasks 19–30), max normalized score = 6
- **Prompt:** German — analyze Jan→Feb expense increase, create 3 internal projects with activities
- **Attempt:** 3rd attempt on this task (previous best was already 6)

## Correctness Verdict

**Perfect.** correctness = 1, score_raw = 10/10, normalized_score = 6/6, all 5 checks passed.

The final Tripletex state was exactly correct:
- Correct top-3 expense accounts identified by `(feb - jan)` increase
- 3 internal projects created with correct names (`account.displayName`)
- 1 activity per project created with correct names
- Project manager assigned on all projects

## Efficiency Verdict

**Good but not optimal.** The run used 6 API calls with 0 errors — no wasted retries or 4xx mistakes. However, the proven minimum for this task shape is 3 calls (using inline `projectActivities` on `POST /project/list`).

The 3 extra calls were:
1. `POST /project/projectActivity` (project 1) — could be inlined
2. `POST /project/projectActivity` (project 2) — could be inlined
3. `POST /project/projectActivity` (project 3) — could be inlined

Since the score was already at maximum (6/6), the extra calls did not reduce the score on this attempt. The scoring formula apparently does not penalize beyond a certain call-count threshold for T3 tasks when correctness is perfect. Still, 3 calls is strictly better and should be used next time.

## Likely Root Cause

The trusted standard at the time of the run documented 6 calls as the minimum. It specified separate `POST /project/projectActivity` calls per project because the inline `projectActivities` capability of `POST /project/list` had not been tested. The prior reflection pass discovered and sandbox-verified the inline approach, and the trusted standard has since been updated to target 3 calls.

## What Went Right

1. **Exact trusted-standard match** — agent correctly identified the task shape, skipped openapi.json, and followed the standard flow
2. **Zero errors** — no 4xx, no retries, no wasted calls beyond the structural overhead
3. **Correct naming** — used `account.displayName` which preserves account number (e.g., "7100 Bilgodtgjørelse oppgavepliktig")
4. **Correct ranking** — aggregated signed `amount` by expense account, ranked by `(feb - jan)` descending
5. **Batch project create** — used `POST /project/list` instead of 3 individual `POST /project` calls
6. **Perfect score** — 6/6, matching the previous best on this task

## What To Change Next Time

1. **Use inline `projectActivities` on `POST /project/list`** — the trusted standard now documents this as the 3-call path. Each project row should include `projectActivities: [{ startDate, activity: { name, activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false } }]`.
2. **No separate `POST /project/projectActivity` calls** — these are now proven unnecessary for this exact task shape.
3. **Target: 3 total API calls** — (1) GET ledger/posting, (2) GET employee, (3) POST project/list with inline activities.
4. **No other changes needed** — the correctness approach (ranking logic, naming, manager resolution) was already optimal.
