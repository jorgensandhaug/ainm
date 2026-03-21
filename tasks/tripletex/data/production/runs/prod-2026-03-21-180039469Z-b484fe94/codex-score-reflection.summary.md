# Score-Aware Reflection: prod-2026-03-21-180039469Z-b484fe94

## Task Attribution

- **Task ID**: `08` (T1 tier, max score = 2)
- **Prompt**: Create project "Implémentation Montagne" linked to customer Montagne SARL (org 842138248), project manager Jules Martin (jules.martin@example.org)
- **Attempt**: 15th attempt on task 08 (14 prior)

## Correctness Verdict

**Perfect correctness.** `correctness = 1`, `score_raw = 7/7`, all 4/4 checks passed. The final Tripletex state was exactly correct — project name, customer link, and project manager all matched expectations.

## Efficiency Verdict

**Maximum efficiency.** `normalized_score = 2` which equals the T1 tier max of 2. The leaderboard best_score for task 08 was already 2 before this run, and this run matched it. The run achieved the theoretical maximum score.

- 3 API calls, 0 errors, 0 retries, 0 wasted calls
- Duration: ~52 seconds (well within 300s budget)
- No 4xx errors

There is no room for improvement on this task shape. The 3-call path (GET customer → GET employee → POST project) is the proven minimum and this run executed it flawlessly.

## Likely Root Cause

No issues to diagnose. The run was optimal in both correctness and efficiency.

## What Went Right

1. **Immediate trusted-standard recognition**: The agent identified the exact `create-project` trusted standard match without reading `openapi.json` or other documentation, saving significant time.
2. **Exact 3-call minimum path**: GET customer by orgNr → GET assignable employee by email → POST project. No extra reads, no verification GETs.
3. **Correct `startDate` defaulting**: The prompt omitted `startDate`; the agent correctly defaulted it to `2026-03-21` (the run date).
4. **Unicode handling**: The `é` in "Implémentation" was passed through without adding disambiguation calls.
5. **Local exact-match filtering**: The script correctly filtered customer by exact `organizationNumber` and employee by exact `email` before using IDs.
6. **Zero wasted time on documentation**: No reads of `AGENTS.md`, `openapi.json`, or multiple playbooks — straight to script execution.

## What To Change Next Time

Nothing. This run is the reference implementation for the `create-project` trusted standard with the `existing customer by organizationNumber + existing manager by email` shape. Future agents should replicate this exact approach:

1. Read only `./trusted-standards/create-project.md`
2. Write a single TypeScript script with all 3 calls
3. Execute it once
4. Verify from the POST response
5. Stop

The only theoretical improvement would be a 2-call or 1-call shortcut, but persistent sandbox proofs on both 2026-03-20 and 2026-03-21 confirm no such shortcut exists — nested customer data silently drops the link, and manager-by-email without ID returns 422.
