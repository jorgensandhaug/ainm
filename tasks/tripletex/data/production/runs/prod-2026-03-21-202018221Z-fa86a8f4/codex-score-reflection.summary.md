# Score-Aware Reflection

## Task Attribution
- **Run ID**: `prod-2026-03-21-202018221Z-fa86a8f4`
- **Task ID**: `08` (T1, max score 2)
- **Prompt**: French — create project "Implémentation Colline" linked to Colline SARL (869753017) with PM Inès Dubois (ines.dubois@example.org)
- **Completion reason**: completed
- **Duration**: 59,333 ms (~59s)

## Correctness Verdict
**Perfect.** Score raw 7/7, correctness 1.0, all 4 checks passed. Normalized score 2/2 (T1 maximum).

## Efficiency Verdict
**Optimal.** Normalized score 2 matches leaderboard best of 2 for task 08. The run used exactly 3 API calls with 0 errors — the proven theoretical minimum for this task shape. No efficiency penalty was applied.

- Leaderboard best before run: 2 (from 16 prior attempts)
- Leaderboard best after run: 2 (17 total attempts)
- This run achieved the maximum possible score, matching the leaderboard ceiling.

## Likely Root Cause
No issues. The run executed the canonical 3-call trusted-standard path without deviation:
1. `GET /customer?organizationNumber=869753017&count=10&fields=*` → 200
2. `GET /employee?email=ines.dubois@example.org&assignableProjectManagers=true&count=10&fields=*` → 200
3. `POST /project` → 201

Zero wasted calls. Zero 4xx errors. All scored fields verified from the write response.

## What Went Right
1. **Immediate trusted-standard match**: agent recognized the exact `create-project` shape and read the standard before writing the script.
2. **Minimal-call execution**: followed the proven 3-call path with no speculative reads, no verification reads, no retries.
3. **Correct `startDate` default**: prompt omitted `startDate`; agent defaulted to run date `2026-03-21` (avoiding the known 422 trap).
4. **Exact-match email filtering**: script compared `employee.email` exactly against prompt email, handling the containing-filter API behavior correctly.
5. **Unicode preservation**: `Implémentation` with `é` passed through without ASCII normalization or extra validation reads.
6. **No unnecessary doc reading**: agent did not re-read `openapi.json` for this exact trusted-standard match, saving time.

## What To Change Next Time
Nothing. This is the 10th consecutive optimal run for this task shape across 6 languages (en/pt/es/nb/nn/fr). The trusted standard and playbook are stable. The 3-call minimum is the proven floor — sandbox re-proofs consistently show all shortcut paths (nested customer, manager-by-email-only, both-nested) either silently break linkage or return 422. Continue using the exact same flow.
