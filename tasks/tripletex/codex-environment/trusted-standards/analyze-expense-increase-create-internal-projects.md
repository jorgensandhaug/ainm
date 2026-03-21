# Analyze Expense Increase And Create Internal Projects

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- analyze January versus February ledger expenses
- identify the three expense accounts with the largest increase in amount
- create one internal project per selected account
- create one project-specific activity per created project
- prompt does not ask for invoice/customer linkage, project members beyond the default manager, or further accounting side effects

## Do Not Use This Standard If
- the prompt scores an existing-project update instead of project creation
- the prompt specifies a particular project manager by identity that must be preserved
- the prompt asks for a different month window or more complex analytics than simple January-vs-February increase
- the account ranking depends on non-ledger sources or additional business filters not already visible on `/ledger/posting`

## Standard Flow
1. fire in parallel (saves wall time, same call count):
   - `GET /ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)`
   - `GET /employee?assignableProjectManagers=true&count=1&fields=*`
2. aggregate signed `amount` by expense account and by month in local code
3. select the top three accounts by `(february total - january total)` descending
4. `POST /project/list` once with the three internal projects **and inline `projectActivities`** on each row
5. verify from write responses
6. stop

Total: **3 API calls** (1 ledger read + 1 employee read + 1 batch project create with inline activities)

## Keep It Minimal
- do not split the ledger analysis into separate January and February reads when one combined read already covers both months
- do not add `GET /project`, `GET /project/{id}`, or `GET /activity` verification reads for this exact shape
- do not loop over three separate `POST /project` calls when `POST /project/list` already supports batch create
- do not use three separate `POST /project/projectActivity` calls; inline the `projectActivities` array directly in each project row of `POST /project/list`
- do not `POST /activity` first; create the inline project-specific activity directly inside the project payload

## Payload Rules
- on the ledger read:
  - use `fields=*,account(*)`
  - use `count=10000` on the first pass and paginate only if the response proves you need more
- on the local ranking step:
  - treat expense accounts as `account.type == "OPERATING_EXPENSES"`; if `type` is unexpectedly sparse, local fallback to `4000-8999` is acceptable
  - aggregate signed company-currency `amount`, not `amountCurrency`
  - prefer `account.displayName` for the project/activity name; if it is absent, fallback to `${account.number} ${account.name}` or bare `account.name`
- on `GET /employee?assignableProjectManagers=true&count=1&fields=*`:
  - reuse the first returned assignable manager id
  - do not spend extra filtering calls when the prompt does not specify a particular manager
- on `POST /project/list`, include for each row:
  - `name`
  - `startDate`
  - `isInternal: true`
  - `projectManager: { "id": ... }`
  - `projectActivities`: array with one element containing:
    - `startDate`
    - `activity` with:
      - `name` (same as project name)
      - `activityType: "PROJECT_SPECIFIC_ACTIVITY"`
      - `isChargeable: false`

## Reuse From Write Responses
- from `GET /ledger/posting`:
  - `account.id`
  - `account.displayName`
  - `account.number`
  - `amount`
- from `GET /employee`:
  - `employee.id`
- from `POST /project/list`:
  - created `project.id`
  - returned `project.name`
  - returned `project.isInternal`
  - returned `project.projectManager.id`
  - returned `project.projectActivities[].id`

## Verification
- default verification is zero extra calls
- trust `POST /project/list` for project ids, names, `isInternal`, manager linkage, and inline activity ids

## Known Pitfalls
- `POST /project` without `projectManager` is not a safe shortcut for internal projects; both production and persistent sandbox returned `422` with `Feltet "Prosjektleder" må fylles ut.`
- using bare `account.name` risks dropping the account number from the scorer-facing label; prefer `account.displayName`
- re-running the whole script after a validation error can waste the decisive ledger read; fix the exact branch and resume
- do not rank by absolute values unless the prompt explicitly asks for absolute movement rather than increase
- do not use 3 separate `POST /project/projectActivity` calls; the `projectActivities` array on `POST /project/list` creates them inline (sandbox-verified 2026-03-21)
- `POST /project/list` response returns `projectActivities[].{id, url}` without expanding the nested `activity` object; do not log `pa.activity?.name` expecting it to be populated — the activities are created correctly despite appearing as `undefined` in the response (production-confirmed 2026-03-21)

## OpenAPI / Sandbox Status
- `/ledger/posting`, `/employee`, and `/project/list` verified in `./openapi.json`
- persistent sandbox proof on `2026-03-21` confirmed:
  - `POST /project` without `projectManager` returned `422` with validation message `Feltet "Prosjektleder" må fylles ut.`
  - `POST /project/list` successfully created internal projects with inline `projectActivities` in one call
  - each inline activity was created with the correct `name`, `activityType=PROJECT_SPECIFIC_ACTIVITY`, and `isChargeable=false`
  - the `Activity` objects were verified via `GET /activity` to have the expected names and properties
  - this eliminates the need for any separate `POST /project/projectActivity` calls
- 1st production run on `2026-03-21` confirmed the full 3-call path:
  - `GET /ledger/posting` returned 42 postings covering Jan+Feb 2026
  - top 3 expense accounts: `7100 Bilgodtgjørelse oppgavepliktig` (+7000), `6500 Motordrevet verktøy` (+5600), `5000 Lønn til ansatte` (+5000)
  - `POST /project/list` created all 3 projects with inline activities in one batch call
  - 0 errors, 3 total API calls — the theoretical minimum for this task shape
- 2nd production run `3a21d463` on `2026-03-21` (Spanish prompt) confirmed the identical 3-call path:
  - same top 3 accounts, same amounts, same batch create — 0 errors, 3 calls
  - confirms the standard handles non-English prompts without any extra API calls
- 3rd production run `1c76136a` on `2026-03-21` (Portuguese prompt) confirmed the identical 3-call path:
  - same top 3 accounts, same amounts, same batch create — 0 errors, 3 calls
- 4th production run `454452ef` on `2026-03-21` (Spanish prompt) confirmed the identical 3-call path:
  - same top 3 accounts, same amounts, same batch create — 0 errors, 3 calls
  - 4 consecutive optimal runs across 4 languages (English, Spanish, Portuguese, Spanish) confirm this standard is stable
