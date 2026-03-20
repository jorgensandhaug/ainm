## Task

Post-run learning pass for the scored Tripletex employee-creation run for `Miguel Sánchez`, then sandbox proof, doc updates, one commit, and this summary.

## Reflection

What went well:
- The production run matched the exact `create-employee` trusted standard.
- The run avoided the known wasteful pre-read on `/department`.
- The run used the optimistic branch first: `POST /employee` with `userType: "NO_ACCESS"` and nested `employments`.
- The write succeeded directly in production, so no repair branch calls were burned.
- The follow-up read used the decisive endpoint `/employee/employment`, not a weaker employee lookup.

What went poorly:
- No production-side API mistake happened.
- The docs were still underspecified on one point: they warned against pre-reading `department`, but they did not state clearly enough that the fresh-account winning branch for this exact prompt shape is usually a `2`-call safe path, not a 1-call gamble and not a pre-read-heavy sandbox path.

Correct approach:
- For exact prompt shape `name + birth date + email + start date`, start with `POST /employee`.
- Only branch into `GET /department` or `GET /division` after a precise `422`.
- If the write succeeds but `startDate` is not echoed, do one decisive `GET /employee/employment?employeeId=...&fields=*`.

## Call Efficiency

The scored production run was minimal-call for the trusted safe path.

Production calls used:
- `POST /employee`
- `GET /employee/employment?employeeId=18579632&fields=*`

Wasted calls:
- None.

Exact lower-call path next agent should follow:
- `POST /employee` with `firstName`, `lastName`, `dateOfBirth`, `email`, `userType: "NO_ACCESS"`, `employments: [{ startDate }]`
- If `201` response does not prove `startDate`, `GET /employee/employment?employeeId=...&fields=*`
- Only if the first write fails with `422 department.id`, do `GET /department?isInactive=false&count=1&fields=*`
- Only if the retry then fails with `422 employments.division.id`, do `GET /division?count=1&fields=*` and retry once

Important nuance:
- A 1-call stop after successful `POST /employee` is a theoretical lower-call gamble, but not the trusted minimum safe path for a start-date-scored task because the successful write response often omits the actual `startDate`.

## Root Causes

- Persistent sandbox behavior can mislead agents into overfitting to repair branches (`department`, then `division`) that are not needed in fresh production accounts.
- Existing employee docs already discouraged the `GET /department` pre-read, but they did not explicitly lock in the `2`-call fresh-account success branch as the minimum safe path.
- The write response is sparse: `userType` may echo as `null`, and `employments[]` may be link-only. That creates pressure either to over-read or to under-verify. The correct balance is exactly one decisive employment read when `startDate` is scored.

## Sandbox Verification

Persistent sandbox proof used only sandbox credentials and one Bun script in the run scripts directory.

Observed call sequence:
- `POST /employee` -> `422`, `department.id: Feltet må fylles ut.`
- `GET /department?isInactive=false&count=1&fields=*` -> `200`, active department id `837842`
- `POST /employee` with department -> `422`, `employments.division.id: Arbeidsforholdet må knyttes til en virksomhet/underenhet.`
- `GET /division?count=1&fields=*` -> `200`, division id `108244566`
- `POST /employee` with department and division -> `201`, but `userTypeEcho: null` and `employmentsEcho` was link-only
- `GET /employee/employment?employeeId=18579670&fields=*` -> `200`, `startDate: 2026-08-12`, `divisionId: 108244566`

What this proves:
- Sandbox still requires validation-driven department and division repair branches.
- Even after success, the create response still does not safely prove `startDate`.
- `/employee/employment` remains the decisive verification endpoint.

## Playbook Changes

Updated existing docs. Created no new trusted standard or playbook.

Changed paths:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-employee.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-employee.md`

What changed:
- Added the exact 2026-03-20 production lesson that the fresh-account winning branch for this task shape is usually `POST /employee` + one decisive employment read.
- Explicitly documented that a 1-call stop is not yet a trusted minimum safe path when `startDate` is scored.
- Reinforced that `GET /department` and `GET /division` are repair-only branches, not defaults.

## Commit

- Commit hash: `7065dce`
- Commit message: `tripletex playbook: tighten create-employee call path`

## Reusable Heuristics

- For exact create-one-employee prompts, default to optimistic `POST /employee`; do not preload `department`.
- Treat sandbox-only `department` and `division` failures as repair branches, not baseline prerequisites for fresh production accounts.
- Always include explicit `userType: "NO_ACCESS"` when the prompt only asks to create the employee.
- If `startDate` is scored and the create response is sparse, use exactly one decisive `GET /employee/employment?employeeId=...&fields=*`.
- Do not waste reads on `/employee` lookup for pure create tasks.
- Do not mistake `userType: null` or link-only `employments[]` in a successful create response for a failed create.
- Do not trust the request payload alone as proof of final state when the scored field is omitted from the write response.