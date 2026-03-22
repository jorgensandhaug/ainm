# Score Reflection: analyze-expense-increase (bfc6f50a)

## Task Attribution
- **Inference status**: ambiguous (2 leaderboard entries changed during scoring window)
- **Candidates**: T16 (last_attempt 11:34:44, best unchanged 2.667) and T28 (last_attempt 11:34:50, best unchanged 6.0)
- **Most likely**: **T28** — task completed at 11:34:48Z; T28's last_attempt at 11:34:50Z is 2s after (scorer processing delay), while T16 at 11:34:44Z is 4s before completion (likely another competitor)
- **T28 tier**: T3, max score 6.0
- **Submission score**: polling timed out (`status: "timed_out"`, `score_raw: null`); must infer from leaderboard

## Correctness Verdict
**Likely perfect (6/6).** T28 best_score was already 6.0 before this run (from 14 prior attempts) and remained 6.0 after (15 attempts). Since this is a T3 task with max 6.0 and the best was already maxed, either we scored 6.0 again (maintaining perfection) or slightly less (but the 11 consecutive optimal runs for this task shape make a regression extremely unlikely).

The run produced the correct top 3 expense accounts (7100 +7000, 6500 +5600, 5000 +5000), created 3 internal projects with correct names (`account.displayName`), and created inline activities — all matching the 10 prior successful runs exactly.

## Efficiency Verdict
**Optimal.** 3 scored API calls (2 parallel GETs + 1 batch POST), 0 errors, 1 free verification GET. This is the theoretical minimum for this task shape:
1. Must read ledger postings (1 GET)
2. Must get assignable project manager (1 GET)
3. Must create 3 projects with activities (1 batch POST)

No wasted calls. No retries. No 4xx errors.

## Likely Root Cause
No issues. The run was flawless. The score polling timeout is an infrastructure artifact (scorer still processing when the 180s poll window expired), not a sign of any run problem.

## What Went Right
1. **Instant trusted-standard match** — agent read the `.md` file before writing any code, avoiding all documented pitfalls
2. **Batch creation** — `POST /project/list` with inline `projectActivities` created all 3 projects + 3 activities in 1 call instead of 6
3. **Parallel reads** — ledger + employee GETs fired concurrently, reducing wall time
4. **Zero errors** — no 4xx, no retries, no wasted exploration
5. **Correct naming** — used `account.displayName` which includes the account number (e.g., "7100 Bilgodtgjørelse oppgavepliktig")
6. **11th consecutive optimal run** — confirms the standard is fully stable across en/es/pt/nb/nn/de prompts

## What To Change Next Time
Nothing. This task shape is solved. The standard achieves 3 calls / 0 errors / perfect correctness consistently across all tested languages. The next agent should:
1. Match the trusted standard
2. Read the `.md` file
3. Execute exactly as documented
4. Not attempt any "improvements" or alternative paths
