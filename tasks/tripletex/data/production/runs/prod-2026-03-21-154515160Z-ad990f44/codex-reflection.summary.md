# Codex Reflection Summary

## Task
Analyze the general ledger to find the three expense accounts with the largest cost increase from January to February 2026. Create an internal project for each account (named after it) and one activity per project.

## Reflection

**What went well:**
- Correctly identified the task as an exact trusted standard match
- Read only the trusted standard — no wasted time on openapi.json or multiple playbooks
- Used batch `POST /project/list` instead of 3 individual `POST /project` calls
- Used `account.displayName` for project/activity names (preserves account number)
- All 6 API calls succeeded with 0 errors
- Correct ranking by `(feb - jan)` descending, correct top 3 identified

**What could have been better:**
- The run used 6 calls when 3 were sufficient. The 3 separate `POST /project/projectActivity` calls were unnecessary because `POST /project/list` accepts inline `projectActivities` arrays on each project row. This was not documented in the trusted standard at the time of the run.

## Call Efficiency

**Was the run minimal-call?** No. It used 6 calls; the proven minimum is 3.

**Wasted calls (3):**
1. `POST /project/projectActivity` for project 1 — unnecessary
2. `POST /project/projectActivity` for project 2 — unnecessary
3. `POST /project/projectActivity` for project 3 — unnecessary

**Exact lower-call path the next agent should follow (3 calls):**
1. `GET /ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)` — one decisive ledger read
2. `GET /employee?assignableProjectManagers=true&count=1&fields=*` — resolve assignable manager
3. `POST /project/list` with each row containing:
   - `name`, `startDate`, `isInternal: true`, `projectManager: { id }`
   - `projectActivities: [{ startDate, activity: { name, activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false } }]`

## Root Causes

The trusted standard documented the flow as requiring separate `POST /project/projectActivity` calls because the `projectActivities` inline capability of `POST /project/list` had not been tested. The Project schema in openapi.json showed `projectActivities` as a writable (non-readOnly) array, but this was not noticed or tested in previous reflection passes.

## Sandbox Verification

On the persistent sandbox (`kkpqfuj-amager.tripletex.dev`):
1. `POST /project/list` with inline `projectActivities` → **201 Created**
2. Two test projects created, each with one inline project-specific activity
3. `GET /activity?id=...&fields=*` confirmed:
   - `name` matched the project name exactly
   - `activityType` = `PROJECT_SPECIFIC_ACTIVITY`
   - `isChargeable` = `false`
4. The inline approach is confirmed safe and correct

## Playbook Changes

Updated existing files (no new files created):

| File | Change |
|---|---|
| `trusted-standards/analyze-expense-increase-create-internal-projects.md` | Rewrote Standard Flow from 6 calls to 3 calls; updated Payload Rules to use inline `projectActivities` on `POST /project/list`; updated Known Pitfalls to warn against separate `POST /project/projectActivity` calls |
| `task-playbooks/analyze-expense-increase-create-internal-projects.md` | Updated Minimal Safe Flow from 6 steps to 4 steps; updated Call Efficiency target from 6 to 3; added inline `projectActivities` to Avoidable Mistakes |
| `trusted-standards/common-endpoints.md` | Updated the ledger-analysis project-creation fast-path note from 6 calls to 3; added inline `projectActivities` documentation |

## Commit

- **Hash:** `023493b8`
- **Message:** `tripletex playbook: reduce analyze-expense-increase flow from 6 to 3 calls via inline projectActivities on POST /project/list`

## Reusable Heuristics

1. **Always check if `POST .../list` endpoints accept nested child arrays inline.** The Project schema's `projectActivities` field was not marked `readOnly`, which was the signal that inline creation might work. This pattern may apply to other Tripletex entities with writable nested arrays.
2. **Sandbox-test inline creation before accepting the "separate POST per child" pattern as minimal.** The previous trusted standard assumed 6 calls was the floor because it only tested the separate-activity path.
3. **The `projectActivities` inline pattern saves N calls per task** where N is the number of projects created. For the 3-project shape, this halves the total call count.
4. **When reviewing openapi.json schemas, check `readOnly` annotations on array fields.** A writable array on a parent schema often means the batch-create endpoint accepts inline children.
