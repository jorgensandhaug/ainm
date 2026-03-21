# Score Reflection — prod-2026-03-21-221731166Z-ebf7baf1

## Task Attribution

- **Attributed task:** Task 01 (Create Employee) — T1, max 2 points
- **Attribution status:** ambiguous (3 candidate diffs: tasks 01, 10, 26)
- **Confidence:** high — the prompt is "create employee Astrid Nilsen" which maps unambiguously to the create-employee task shape (task 01)
- **Leaderboard diff:** task 01 best_score stayed at 2.0 (already at max), total_attempts 16→17
- A concurrent submission for the same task shape (`f2b36867`, 7/7 checks, normalized_score 1.4) completed at 22:18:26, matching task 01's last_attempt timestamp
- Our submission (`d5b31cea`, queued 22:18:23) was still "processing" in the after snapshot, so exact score unavailable

## Correctness Verdict

**Almost certainly perfect.** The concurrent submission for the same task shape scored 8/8 raw with 7/7 checks passed. Our run followed the identical trusted standard with identical field mapping (firstName, lastName, dateOfBirth, email, startDate). The POST response confirmed all fields stored correctly. There is no reason to suspect any correctness issue.

## Efficiency Verdict

**Suboptimal — estimated ~1.4/2.0 (70% of max).** The run hit the department-repair branch:

| Call | Endpoint | Status | Purpose |
|------|----------|--------|---------|
| 1 | POST /employee?fields=*,employments(*) | 422 | Initial attempt without department — rejected |
| 2 | GET /department?isInactive=false&count=1&fields=* | 200 | Resolve existing department |
| 3 | POST /employee?fields=*,employments(*) | 201 | Retry with department — success |

3 calls, 1 error (422). The ideal path for a no-department account is 1 call, 0 errors, which achieves the max score of 2.0.

The efficiency penalty of ~0.6 points comes from:
- **+2 extra calls** (422 POST + GET department)
- **+1 avoidable 4xx error** (the 422 itself)

**Best_score was already at max (2.0)** from a prior run that hit the no-department branch. This run did not improve the leaderboard position.

## Likely Root Cause

The 422 on department.id is an **account-level configuration** — some fresh Tripletex accounts require department, others don't. This cannot be predicted without a pre-read.

The no-pre-read strategy is **optimal for best_score maximization**:
- No-pre-read ceiling: 2.0 (1 call, 0 errors when account doesn't need dept)
- Pre-read ceiling: ~1.7–1.8 (2 calls, 0 errors — always)
- Since best_score = max across attempts, the no-pre-read strategy can achieve 2.0 while pre-read never can
- The 1.4 score on dept-required accounts is acceptable because the best_score was already 2.0

Production statistics (7 runs): 4/7 (57%) no-dept needed, 3/7 (43%) dept required. The no-pre-read strategy hits 2.0 more than half the time.

## What Went Right

1. **Trusted standard followed exactly** — read the `.md` file before writing any script, no openapi.json re-checking
2. **`?fields=*,employments(*)` used on all POST attempts** — first production run to use this optimization, saving 1 call vs the pre-discovery flow (previous dept-repair runs used 4 calls, this used 3)
3. **Fast execution** — total wall time ~49 seconds (22:17:33 → 22:18:22), well within 300s budget
4. **Correct department repair** — detected `validationMessages[].field == "department.id"`, resolved via GET, retried once
5. **All identity fields correct** — firstName, lastName, dateOfBirth, email, startDate all match prompt exactly
6. **No wasted calls** — every call was necessary given the account's department requirement; no verification GETs, no speculative reads

## What To Change Next Time

1. **Keep the no-pre-read strategy** — it is optimal for best_score maximization. The 1.4 score on dept-required accounts is a known trade-off, but the 2.0 ceiling on no-dept accounts is the key advantage. Pre-reading would permanently cap the score at ~1.7–1.8.

2. **No code changes needed** — the script correctly implements the trusted standard. The department repair branch (3 calls, 1 error) is the minimum possible for accounts that require department.

3. **Monitor the dept-required ratio** — currently 3/7 (43%). If it exceeds 50%, the average-score argument for no-pre-read weakens, but the best_score argument remains valid as long as ANY account doesn't require department.

4. **The `?fields=*,employments(*)` optimization is confirmed** — this run proved it works in production, saving 1 call vs the old standard. This is now the baseline for all future create-employee runs.
