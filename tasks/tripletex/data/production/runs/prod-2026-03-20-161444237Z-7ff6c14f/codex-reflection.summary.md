## 1. Task
Post-run learning pass for the production task that created employee `André Almeida` with `andre.almeida@example.org`, birth date `1980-04-09`, start date `2026-09-22`.

## 2. Reflection
What went well:
- Correct employee state created and verified.
- `userType: "NO_ACCESS"` was correct.
- `GET /employee/employment?employeeId=...&fields=*` was the right verification read because the create response was sparse.

What went poorly:
- The run pre-read `GET /department?isInactive=false&count=1&fields=*` before the first employee write.
- User feedback confirmed the run was not call-optimal.

Correct approach:
- For this exact create-only employee shape, the first move should be direct `POST /employee`.
- Only branch into department or division reads if the API returns the precise `422` validation telling you those links are required.

## 3. Call Efficiency
The run was not minimal-call.

Original production API path:
1. `GET /department?isInactive=false&count=1&fields=*`
2. `POST /employee`
3. `GET /employee/employment?employeeId=<id>&fields=*`

Wasted call:
- `GET /department?isInactive=false&count=1&fields=*`

Lower-call path for the next agent:
1. `POST /employee` with `firstName`, `lastName`, `dateOfBirth`, `email`, `userType: "NO_ACCESS"`, `employments: [{ "startDate": "YYYY-MM-DD" }]`
2. If that succeeds, `GET /employee/employment?employeeId=<id>&fields=*` to verify `startDate`

Conditional repair branches only if needed:
- On `422 department.id`: `GET /department?isInactive=false&count=1&fields=*`, optionally `POST /department` only if no active department exists, then retry `POST /employee`
- On `422 employments.division.id`: `GET /division?count=1&fields=*`, then retry `POST /employee` with `division: { "id": ... }`

## 4. Root Causes
- I followed an older employee-create playbook that optimized for avoiding `422`, not for theoretical minimum calls.
- The trusted guidance had drifted toward automatic department pre-resolution.
- I overfit to prior sandbox behavior and underweighted the possibility that production accepted the initial write without department repair.

## 5. Sandbox Verification
Persistent sandbox proof on `2026-03-20`:
- `POST /employee` without `department` returned `422` on `department.id`
- `GET /department?isInactive=false&count=1&fields=*` returned active department `837842`
- `POST /employee` with `department: { "id": 837842 }` but without `division` returned `422` on `employments.division.id`
- `GET /division?count=1&fields=*` returned division `108244566`
- `POST /employee` with both department and division succeeded, creating employee `18566131`
- `GET /employee/employment?employeeId=18566131&fields=*` verified `startDate = 2026-09-22`
- Successful create response still echoed `userType: null` and sparse `employments[]`, so the employment read remains the decisive verification step

## 6. Playbook Changes
Updated existing docs; no new files created.

Changed paths:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-employee.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-employee.md`

What changed:
- employee create fast path now starts with direct `POST /employee`
- `GET /department` moved from default path to `422 department.id` repair branch
- `GET /division` documented as `422 employments.division.id` repair branch
- verification guidance kept the conditional `GET /employee/employment`
- AGENTS gotcha updated to warn that automatic department pre-read can lose the efficiency bonus

## 7. Commit
`765f3c9d5bef5d3711081e171c6bff28f3e0805a`

`tripletex playbook: optimize create-employee flow`

## 8. Reusable Heuristics
- For create-only Tripletex tasks, prefer one write first when the prompt already gives all scored fields.
- Move prerequisite reads out of the default path unless the prompt or a trusted standard proves they are mandatory.
- Treat precise `422` validation fields as permission for one narrow repair branch, not for broad exploration.
- Reuse successful write responses for ids, but do not trust sparse echoed subobjects to prove scored nested fields.
- When a create response returns link-only nested objects, use one decisive verification read, not several follow-up reads.