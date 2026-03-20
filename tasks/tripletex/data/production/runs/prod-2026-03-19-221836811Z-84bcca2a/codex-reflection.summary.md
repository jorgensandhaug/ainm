## 1. Task

Do post-run learning for the project-creation run, verify the correct sandbox path, update learning docs, commit only `AGENTS.md` and playbook changes, then write this summary.

## 2. Reflection

What went well:
- Correct core dependency graph: resolve existing customer, resolve employee, then `POST /project`.
- Correct link shape: `customer: {id}` and `projectManager: {id}`.
- Correct reuse of write response for final verification; no follow-up `GET /project` was needed in the winning path.

What went poorly:
- Missed a write-time requirement: `startDate` was required in practice for `POST /project`.
- Took one avoidable `422` on the production run because that requirement was not known before writing.
- Added a plain-email employee fallback in code without proof that any plain employee hit was eligible as project manager.
- Did more local schema searching than needed because no project playbook existed.

Correct approach:
- Read a focused project playbook first.
- Resolve customer by org number.
- Resolve manager with `assignableProjectManagers=true` plus exact email filtering in code.
- `POST /project` with `name`, `startDate`, `customer.id`, `projectManager.id`.
- Verify from `response.value` and stop.

## 3. Root Causes

- No existing playbook for project creation, so known Tripletex quirks were not preloaded.
- Trusted the `Project` schema too literally; it did not clearly mark `startDate` required, but runtime validation did.
- Underweighted manager eligibility. `projectManager.id` is not just any employee id.
- The `/employee` `email` filter is containing, not exact, so plain lookup is weaker than it looks.

## 4. Sandbox Verification

Used only sandbox creds via TypeScript + `bun` in the run scripts dir.

Verified:
- `POST /project` without `startDate` returns `422` with `field: "startDate"` and message `Feltet må fylles ut.`
- A temp employee created with `userType: "NO_ACCESS"` was found by plain email search (`count 1`) but not by `assignableProjectManagers=true` (`count 0`).
- Trying that ineligible employee as `projectManager.id` returned `422` with `field: "projectManager.id"` and message that the employee lacked project-manager access.
- An existing assignable manager found via `GET /employee?assignableProjectManagers=true&fields=*` was also findable by exact email.
- Successful create used:
```json
{
  "name": "Sandbox Project 58978600",
  "startDate": "2026-03-19",
  "customer": { "id": 108157049 },
  "projectManager": { "id": 18441996 }
}
```
- The `201` response already proved `name`, `startDate`, `customer.id`, and `projectManager.id`; no verification `GET` needed.

## 5. Playbook Changes

Created new playbook:
- `./task-playbooks/create-project.md`

Updated:
- `./AGENTS.md`
- Added `Create project` to the Task Playbooks table.
- Added a project-specific gotcha about required `startDate` and manager eligibility.

The new playbook captures:
- required `startDate`
- manager lookup via `assignableProjectManagers=true`
- exact email matching client-side
- no blind fallback from plain employee hit to project-manager write
- write-response-first verification

## 6. Commit

- Commit hash: `97cd5bc`
- Commit message: `tripletex playbook: add project creation guidance`

## 7. Reusable Heuristics

- For Tripletex writes, runtime validation can be stricter than schema `required`; record any proven `422` requirement in a playbook.
- When linking an employee into a role, search for role-eligible employees first; do not assume any employee id is valid.
- If a search filter is containing, always exact-match the returned value locally before reusing ids.
- If `POST` response already proves scored fields and links, do not spend a verification `GET`.
- Missing playbook + first-time task pattern is a strong signal to add one immediately after verification.