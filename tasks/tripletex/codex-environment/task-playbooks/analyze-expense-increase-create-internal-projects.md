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

Production reflection on 2026-03-21 showed:
- the original run was not minimal-call and not fully correct
- it wasted two full reruns of the decisive ledger read after avoidable `422` project-creation errors
- `POST /project` without `projectManager` failed twice with `422`
- the prompt score later came back only `5/10`, so the first implementation likely missed a scorer-facing naming or ranking detail in addition to wasting calls
- the safest correction is:
  - resolve the internal-project manager up front
  - use batch project create
  - keep the account label intact via `account.displayName`

Persistent-sandbox verification on 2026-03-21 showed:
- `POST /project` with:
  - `name`
  - `startDate`
  - `isInternal: true`
  but without `projectManager`
  failed with:
  - `422`
  - validation message `Feltet "Prosjektleder" må fylles ut.`
- `GET /employee?assignableProjectManagers=true&count=1&fields=*` returned one reusable assignable manager id
- `POST /project/list` successfully created three internal projects in one call when each row included:
  - `name`
  - `startDate`
  - `isInternal: true`
  - `projectManager: { id }`
- each `POST /project/projectActivity` then succeeded with:
  - `project`
  - `startDate`
  - inline `activity.name`
  - `activityType: "PROJECT_SPECIFIC_ACTIVITY"`
  - `isChargeable: false`
- the ledger read `GET /ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)` exposed both:
  - `account.name`
  - `account.displayName`
  so the future agent can preserve the full ledger-facing label instead of dropping the account number

## Minimal Safe Flow

1. Read the whole analysis window once
   - `GET /ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)`
2. Aggregate locally
   - filter to expense accounts
   - sum signed `amount` by account for January and February
   - rank by `(feb - jan)` descending
   - take the top three
3. Resolve one assignable manager
   - `GET /employee?assignableProjectManagers=true&count=1&fields=*`
4. Batch-create the internal projects
   - `POST /project/list`
5. Create one project-specific activity per returned project id
   - `POST /project/projectActivity`
   - `POST /project/projectActivity`
   - `POST /project/projectActivity`
6. Stop

## Naming Rule

- When the prompt says to use the account's name, prefer `account.displayName`
- Reason:
  - it preserves the account number
  - it matches how Tripletex presents ledger accounts in read responses
  - it avoids ambiguity between similar bare `account.name` strings
- Only fall back to `${account.number} ${account.name}` or bare `account.name` if `displayName` is unexpectedly absent

## Call Efficiency

- The next agent should target `6` calls for this exact shape when the first ledger page already contains the needed postings:
  1. `GET /ledger/posting?...dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)`
  2. `GET /employee?assignableProjectManagers=true&count=1&fields=*`
  3. `POST /project/list`
  4. `POST /project/projectActivity`
  5. `POST /project/projectActivity`
  6. `POST /project/projectActivity`
- Only add more ledger reads if pagination is actually needed

## Avoidable Mistakes

- Do not probe `POST /project` without `projectManager`; that `422` is now proven
- Do not rerun the whole workflow from the first ledger read after a mid-flow validation error
- Do not spend three separate `POST /project` calls when `POST /project/list` already creates all three
- Do not use bare `account.name` by reflex on ledger-facing naming tasks
- Do not switch to `amountCurrency` or absolute values unless the prompt explicitly changes the ranking criterion
- Do not add verification reads after `POST /project/list` or `POST /project/projectActivity` when the write responses already prove the created ids and links
