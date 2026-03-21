# Score Reflection — prod-2026-03-21-220234309Z-97a9db84

## Task Attribution

- **Inference status**: ambiguous (3 candidate tasks: 13, 21, 23)
- **Our submission**: most likely `3842a16a` (queued 22:02:49, still "processing" at snapshot time 22:04:12)
- **Agent exit**: 22:03:40Z
- **Score**: unknown — our submission had not completed scoring when the after-snapshot was taken
- The 3 leaderboard diff entries (tasks 13, 21, 23) each match other completed submissions (`342b39ad`, `d2ad87aa`, `ae8c16a2`) queued before our API calls started — none is definitively ours

**Best candidate by task shape**: If this onboard-employee task maps to task 21 (T3), the reference submission `d2ad87aa` scored **12/14 (normalized 2.5714/6)** with **1/10 checks failed (Check 5)**. However, this submission was queued at 22:02:22 — 16 seconds before our before-snapshot — so it was likely from a different concurrent run.

## Correctness Verdict

**Unknown** — our submission was still processing at snapshot time. No definitive score available.

**If the task maps to task 21 (best reference)**: The reference shows 12/14 with check 5 failed. This same check 5 also failed in the first Salgssjef production run (11/14 with checks 5 and 10 failed). The persistent check 5 failure across two runs with different code paths suggests a systematically missing field, not a transient error.

**Candidate for check 5**: The offer letter mentions "provetid pa 6 maneder" (6-month probation period from start date 2026-06-24). If the Tripletex employment details schema has a probation/trial period end date field (e.g., `endOfTrialPeriod`), we are not setting it. This is the most likely root cause for the persistent check 5 failure — the field is explicitly stated in the offer letter but absent from our payload and trusted standard.

## Efficiency Verdict

**Optimal for what was executed.** 4 calls, 0 errors:

| # | Call | Result |
|---|------|--------|
| 1 | `GET /division?count=1&fields=id` | 200, 0 rows |
| 2 | `POST /department` | 201 |
| 3 | `POST /employee?fields=*,employments(*)` | 201 |
| 4 | `POST /employee/standardTime` | 201 |

No wasted calls. Steps 1+2 ran in parallel. Hardcoded occupation code (Salgssjef → 4930) saved 1 call vs dynamic lookup. No 4xx errors. This is the proven minimum-call floor for the hardcoded-occupation-code + standard-worktime onboard-employee shape.

## Likely Root Cause

**If check 5 is indeed failing**: The offer letter explicitly states a 6-month probation period ("provetid pa 6 maneder med 14 dagers gjensidig oppsigelsesfrist"). The employment details payload does not include any probation-related field. If the Tripletex `employmentDetails` schema supports a field like `endOfTrialPeriod` (computed as startDate + 6 months = 2026-12-24), this would explain the persistent check 5 failure across both Salgssjef runs.

**Investigation needed** (for next reflection cycle with sandbox access):
1. Check if `/employee/employment/details` schema has an `endOfTrialPeriod` or `probationEndDate` field
2. If yes, test whether including it in the nested `employmentDetails` payload persists correctly
3. If yes, update the trusted standard to extract probation period from offer letters and compute the end date

## What Went Right

1. **Correct task routing**: Identified onboard-employee (not simple create-employee) based on department + salary + occupation code + worktime requirements
2. **Read trusted standard first**: Followed the critical rule of reading the trusted standard before writing any script
3. **Hardcoded occupation code**: Used Salgssjef → id 4930 mapping, saving 1 API call
4. **Correct standard-time endpoint**: Used `POST /employee/standardTime` (per-employee), not the wrong `/salary/settings/standardTime` (company-wide) — fixing the check 10 failure from the first Salgssjef run
5. **Parallel prerequisite resolution**: GET /division + POST /department ran concurrently
6. **Division handling**: Correctly omitted division from payload when GET /division returned 0 rows (fresh account)
7. **Zero 4xx errors**: All 4 calls succeeded on first attempt
8. **Full response expansion**: Used `?fields=*,employments(*)` to eliminate verification GET

## What To Change Next Time

1. **Investigate probation period field**: Before the next onboard-employee run, sandbox-verify whether `employmentDetails` supports a probation/trial period end date field. If the offer letter mentions "prøvetid" / "provetid", compute the end date (startDate + stated months) and include it in the payload. This is the most likely fix for the persistent check 5 failure.
2. **No call-count changes needed**: The 4-call path is already minimal. Adding the probation field (if it exists) costs 0 extra calls — it's just a new field in the existing POST /employee payload.
3. **Score verification**: This run's submission was still processing at snapshot time. Future runs should ensure the after-snapshot is taken with a longer delay to capture the score.
