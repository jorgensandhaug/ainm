# Score-Aware Reflection

## Task Attribution

- **Run ID:** prod-2026-03-22-034509041Z-e8933369
- **Task ID:** 08 (T1 tier, max score = 2)
- **Prompt:** Create project "Implementation Ridgepoint" linked to customer Ridgepoint Ltd (org no. 948050927), project manager Edward Brown (edward.brown@example.org)
- **Matched standard:** `create-project` (exact match)

## Correctness Verdict

**Perfect.** Correctness = 1.0, score_raw = 7/7, normalized_score = 2/2 (maximum for T1). All 4 checks passed. No data issues, no missing side effects.

## Efficiency Verdict

**Optimal.** 3 API calls, 0 errors, 0 wasted calls. The leaderboard best_score for T08 was already 2 before this run (from prior optimal runs), and this run matched it exactly. The attempt count went from 24 → 25, confirming this was scored and counted. No efficiency penalty — the run achieved the theoretical maximum score.

The 3-call path (GET customer → GET employee → POST project) is the proven minimum. No 2-call shortcut exists (extensively sandbox-verified: inline customer silently drops the link, inline manager without ID returns 422).

## Likely Root Cause

No issues. The run was flawless. Perfect correctness + maximum efficiency bonus = maximum possible score of 2/2.

## What Went Right

1. **Immediate trusted-standard recognition.** The agent identified this as an exact `create-project` match and read the trusted standard before writing any code.
2. **No unnecessary reads.** Did not read AGENTS.md fully, openapi.json, or the playbook — went straight from trusted standard to script.
3. **Exact 3-call execution.** GET customer by orgNumber, GET employee by email with assignableProjectManagers=true, POST project. No verification GETs.
4. **Zero errors.** No 4xx responses, no retries, no wasted calls.
5. **Correct payload.** Included startDate defaulted to run date, customer.id and projectManager.id from resolved entities.
6. **Fast completion.** 52s total duration including scoring.

## What To Change Next Time

**Nothing.** This task shape is fully solved. The `create-project` trusted standard has now been confirmed across 19 consecutive optimal production runs spanning en/pt/es/nb/nn/fr/de prompts. The 3-call path is the proven minimum and achieves maximum score every time.

The only action item is to continue following the trusted standard exactly as written — no shortcuts, no extra reads, no verification GETs.
