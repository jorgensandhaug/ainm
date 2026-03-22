# Analyze Expense Increase And Create Internal Projects

## Scope

Use for tasks like:
- compare January and February ledger expenses
- identify the three expense accounts with the largest increase
- create one internal project per selected account
- create one activity per created project

Do not use for:
- broader accounting analysis tasks that require a human explanation rather than side effects
- prompts that specify a fixed manager identity, customer, billing setup, or project budget
- prompts that ask for project updates instead of new internal projects

## Verified Findings

Production run `ccafc2e3` on 2026-03-22 (latest, English prompt) achieved:
- **3 calls, 0 errors, correct result** — the theoretical minimum for this task shape
- used `POST /project/list` with inline `projectActivities` per project for batch create
- same top 3 accounts as all prior runs

7 consecutive optimal production runs (en/es/pt) confirm this standard is fully stable and language-independent:
- `ccafc2e3` (English, 2026-03-22), `29c4733d` (Spanish, 2026-03-22), `2916e388` (English, 2026-03-21), `454452ef` (Spanish), `1c76136a` (Portuguese), `3a21d463` (Spanish), 1st run (English)
- All: 3 calls, 0 errors, same top 3 accounts, same batch create path

Persistent-sandbox verification on 2026-03-21 showed:
- `POST /project/list` with inline `projectActivities` array per project successfully creates both the project and its activity in a single batch call
- each activity was verified to have the correct `name`, `activityType=PROJECT_SPECIFIC_ACTIVITY`, and `isChargeable=false`
- `POST /project` without `projectManager` returns `422` with `Feltet "Prosjektleder" må fylles ut.`
- `GET /employee?assignableProjectManagers=true&count=1&fields=*` returns a reusable assignable manager id
- `POST /project/list` response returns `projectActivities[].{id, url}` only — nested `activity` object is not expanded; this is normal, not a creation failure

## Minimal Safe Flow

1. Fire both reads in parallel (saves wall time, same 2-call count):
   - `GET /ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)`
   - `GET /employee?assignableProjectManagers=true&count=1&fields=*`
2. Aggregate locally
   - filter to expense accounts (`account.type == "OPERATING_EXPENSES"`, fallback `4000-8999`)
   - sum signed `amount` by account for January and February
   - rank by `(feb - jan)` descending
   - take the top three
3. Batch-create the internal projects with inline activities
   - `POST /project/list` with each row containing:
     - `name` (use `account.displayName`)
     - `startDate`
     - `isInternal: true`
     - `projectManager: { id }`
     - `projectActivities: [{ startDate, activity: { name, activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false } }]`
5. Stop

## Naming Rule

- When the prompt says to use the account's name, prefer `account.displayName`
- Reason:
  - it preserves the account number
  - it matches how Tripletex presents ledger accounts in read responses
  - it avoids ambiguity between similar bare `account.name` strings
- Only fall back to `${account.number} ${account.name}` or bare `account.name` if `displayName` is unexpectedly absent

## Call Efficiency

- The next agent should target **3 calls** for this exact shape:
  1. `GET /ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)`
  2. `GET /employee?assignableProjectManagers=true&count=1&fields=*`
  3. `POST /project/list` (with inline `projectActivities` per project)
- Only add more ledger reads if pagination is actually needed

## Avoidable Mistakes

- Do not probe `POST /project` without `projectManager`; that `422` is now proven
- Do not rerun the whole workflow from the first ledger read after a mid-flow validation error
- Do not spend three separate `POST /project` calls when `POST /project/list` already creates all three
- Do not use three separate `POST /project/projectActivity` calls; inline `projectActivities` in the `POST /project/list` payload
- Do not use bare `account.name` by reflex on ledger-facing naming tasks
- Do not switch to `amountCurrency` or absolute values unless the prompt explicitly changes the ranking criterion
- Do not add verification reads after `POST /project/list` when the write response already proves the created ids and links
