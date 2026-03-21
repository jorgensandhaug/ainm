# Reflection Summary

## Task
Analyze the ledger for January vs February 2026 expense increases, identify the top 3 expense accounts by increase, create an internal project for each (named after the account), and create one activity per project. Prompt was in Portuguese.

## Reflection
**What went well:**
- Exact trusted-standard match (`analyze-expense-increase-create-internal-projects.md`) identified immediately
- Agent read the trusted standard before writing any script — followed the documented rule
- Script followed the standard precisely: one ledger read, one employee read, one batch project create with inline activities
- 3 API calls total, 0 errors — the theoretical minimum
- Used `account.displayName` as recommended for project/activity naming
- Used `POST /project/list` with inline `projectActivities` instead of separate `POST /project/projectActivity` calls
- Portuguese prompt was correctly interpreted without language-related issues

**What could be improved:**
- The console logging attempted `pa.activity?.name` which returned `undefined` because `POST /project/list` response only returns `projectActivities[].{id, url}` without expanding the nested `activity` object. This is cosmetic (not a correctness issue) but could mislead a future agent into thinking activities weren't created.

## Call Efficiency
**The run was minimal-call.** 3 API calls, 0 wasted calls.

| # | Call | Purpose |
|---|------|---------|
| 1 | `GET /ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)` | Fetch all Jan+Feb postings in one read |
| 2 | `GET /employee?assignableProjectManagers=true&count=1&fields=*` | Resolve assignable project manager |
| 3 | `POST /project/list` (3 projects with inline `projectActivities`) | Batch-create all 3 projects + activities |

**Lower-call path:** None exists. 3 calls is the theoretical minimum — the ledger read cannot be avoided (data-dependent ranking), the employee read is required (no hardcoded manager ID in a fresh account), and the batch project create is already a single call.

## Root Causes
No errors or wasted calls. The only documentation gap was:
- **AGENTS.md line 283** was outdated: still referenced the old 6-call path (`POST /project/list` + 3 separate `POST /project/projectActivity`), contradicting the trusted standard which already documented the 3-call path with inline activities. Fixed in this reflection.

## Sandbox Verification
- Created 2 test projects with inline `projectActivities` via `POST /project/list` on persistent sandbox
- Confirmed response returns `projectActivities[].{id, url}` only — nested `activity` not expanded
- Verified via `GET /project/projectActivity/{id}?fields=*,activity(*)` that activities were created with correct `name`, `activityType=PROJECT_SPECIFIC_ACTIVITY`, `isChargeable=false`
- This confirms the production run's `undefined` activity names in the log were a response-shape issue, not a creation failure

## Playbook Changes
Updated existing files (no new files created):

1. **`./AGENTS.md`** (line 283): Fixed outdated gotcha from 6-call path to correct 3-call path with inline `projectActivities`. Added note about response shape.
2. **`./trusted-standards/analyze-expense-increase-create-internal-projects.md`**: Added response-shape pitfall about `projectActivities[].{id, url}` and production confirmation section.
3. **`./task-playbooks/analyze-expense-increase-create-internal-projects.md`**: Updated verified findings with latest production run (3 calls, 0 errors), added response-shape note.

## Commit
- Hash: `201faf83`
- Message: `tripletex playbook: analyze-expense-increase-create-internal-projects — add production confirmation for 3-call minimum, fix AGENTS.md outdated 6-call gotcha`

## Reusable Heuristics
1. **Inline `projectActivities` on `POST /project/list` is production-proven.** Do not fall back to separate `POST /project/projectActivity` calls for this task shape. The 3-call path is now confirmed by both sandbox and production.
2. **`POST /project/list` response does not expand nested objects in `projectActivities`.** Do not log or assert on `pa.activity?.name` — it will always be `undefined` in the write response. Trust the creation succeeded if the HTTP status is 201.
3. **Keep AGENTS.md gotchas in sync with trusted standards.** When a trusted standard is updated with a lower-call path, also update the corresponding AGENTS.md gotcha to avoid contradictory guidance.
4. **Portuguese prompts map cleanly to the same task shapes.** "livro razão" = ledger, "contas de despesa" = expense accounts, "projeto interno" = internal project, "atividade" = activity. No special handling needed beyond language recognition.
5. **For this exact task shape, the call floor is 3.** No further optimization is possible without hardcoding environment-specific IDs.
