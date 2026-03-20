# Task Attribution

`task-attribution.json` is formally ambiguous (`inference_status: "ambiguous"`), so no task id is explicitly attributed there.

Best inference: `tx_task_id = 16`.

Why:
- `leaderboard.after.json` shows task `16` got a new attempt at `2026-03-20T22:44:15.415618+00:00`
- that timestamp exactly matches the completed submission `233202b7-d9aa-4370-aefe-9215a09958ce` in `submissions.after.json`
- that completed submission also lines up with this run’s completion window, unlike task `01` and `07`, whose new attempts landed earlier

# Correctness Verdict

Likely perfect correctness.

Evidence:
- inferred submission: `233202b7-d9aa-4370-aefe-9215a09958ce`
- `score_raw = 8`
- `score_max = 8`
- `normalized_score = 2.96`
- feedback: `7/7 checks passed.`

So correctness was effectively `1.0`.

# Efficiency Verdict

Likely efficient, not lagging.

Why:
- inferred task `16` leaderboard best before run: `2.96`
- inferred task `16` leaderboard best after run: `2.96`
- inferred submission normalized score: `2.96`

So the run appears to have matched the current leaderboard best for that task rather than trailing it. There is no score-based sign of wasted calls, retries, or avoidable `4xx` errors.

# Likely Root Cause

No production failure signal.

The run likely succeeded because it chose the correct non-chargeable branch:
- resolved employee
- resolved project plus linked customer in one read
- resolved activity through `/activity/>forTimeSheet`
- saw `isChargeable=false`
- skipped `/project/hourlyRates`
- wrote the time entry
- resolved VAT once
- created one real project-linked order line
- invoiced the order unsent

Given the perfect score and leaderboard-tied normalized score, there is no evidence of wrong final state, wrong field mapping, extra retries, or avoidable reads in the scored run.

# What Went Right

- It followed the exact trusted-standard non-chargeable path.
- It avoided the common waste branch: no `/project/hourlyRates` read or rate write after `isChargeable=false`.
- It avoided speculative hour-consumption or `includeHours=true` attempts.
- It kept the VAT lookup, which was production-safe for a taxable account.
- It appears to have finished with the minimal 7-call path and no visible `4xx` repair loop.
- It produced the expected final side effects: registered hours and a project-linked customer invoice.

# What To Change Next Time

- Keep using the same 7-call path for this exact shape when `/activity/>forTimeSheet` returns `isChargeable=false` and hours `<= 24`.
- Do not add `/project/hourlyRates`, `/customer`, `/invoice/details`, or `/timesheet/week/:approve` on this branch.
- Do not drop `GET /ledger/vatType` just because sandbox sometimes allows omitted `vatType`; that is not production-safe.
- If attribution is ambiguous again, use the closest `completed_at` to `leaderboard.after.last_attempt_at` to identify the likely scored submission.

Bottom line: this run looks correct and efficient. The next agent should mostly repeat the same execution pattern, not “optimize” it further.