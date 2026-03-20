# Task

Reflect on the scored Tripletex run that created employee `Thomas Harris`, prove the correct path in the persistent sandbox, update the employee guidance, commit the doc changes, and record the result.

# Reflection

The scored run went well. It matched the existing exact employee trusted standard, used the optimistic fresh-account path, and finished with the correct employee state.

Nothing in the scored run was a true mistake. The only weak point in the pre-run knowledge was that persistent sandbox evidence was much more expensive than fresh-account production evidence for this task family. The correct approach was still to trust the fresh-account standard: start with direct `POST /employee`, include `userType: "NO_ACCESS"` and nested `employments`, and only branch on field-specific `422` validation failures.

The production result also re-confirmed that the successful create response is still too sparse for a one-call stop on start-date-scored employee tasks.

# Call Efficiency

The scored production run was minimal-call for this exact task shape.

Wasted calls: none.

Exact lower-call path the next agent should use:
- `POST /employee` with `firstName`, `lastName`, `dateOfBirth`, `email`, `userType: "NO_ACCESS"`, and `employments: [{ startDate }]`
- If the write succeeds but does not echo the actual `startDate`, do `GET /employee/employment?employeeId=...&fields=*`
- Only if the first write fails with `validationMessages[].field == "department.id"`, do `GET /department?isInactive=false&count=1&fields=*`, optionally `POST /department` only if none exists, then retry once
- Only if the retry fails with `validationMessages[].field == "employments.division.id"`, do `GET /division?count=1&fields=*` and retry once with `division.id`

There is still no proven one-call replacement. In production for `Thomas Harris`, the create response did not prove `startDate`, so skipping `GET /employee/employment` would have been an avoidable correctness gamble.

# Root Causes

- Persistent sandbox and fresh-account production diverge on employee prerequisites. Sandbox can require both `department.id` and `employments.division.id`; fresh production can accept the direct create.
- The create response remains sparse. It can return `userType: null` and link-only `employments[]`, so trusting the write response alone can miss the scored `startDate`.
- The main future risk is overfitting to sandbox repair branches and paying proactive `GET /department` or `GET /division` in production when they are not needed.

# Sandbox Verification

Persistent sandbox proof used only sandbox credentials and created a reflection employee on the same task shape.

Observed call log:
- `POST /employee` -> `422` with `validationMessages[].field == "department.id"`
- `GET /department?isInactive=false&count=1&fields=*` -> `200`, reused department `837842`
- `POST /employee` with `department.id` -> `422` with `validationMessages[].field == "employments.division.id"`
- `GET /division?count=1&fields=*` -> `200`, reused division `108244566`
- `POST /employee` with `department.id` and `division.id` -> `201`, employee `18591045`
- `GET /employee/employment?employeeId=18591045&fields=*` -> `200`, verified `startDate: 2026-10-06`

Important proof points:
- Persistent sandbox still needs the repair ladder for this task family.
- Even after successful create, `createHasStartDate` was `false`.
- The sandbox result proves the repair branches, not a better production path.

# Playbook Changes

Updated existing guidance; created no new files.

Changed paths:
- `AGENTS.md`
- `trusted-standards/create-employee.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/create-employee.md`

What changed:
- Added the `Thomas Harris` production proof that the exact fresh-account employee-create path is still `2` calls.
- Added the same-session persistent-sandbox proof that the repair ladder can still cost `6` calls.
- Made the anti-pattern explicit: do not let sandbox behavior justify proactive department or division reads in fresh-account scored runs.

# Commit

Commit hash: `55327a1b6f2fe5e0399377bb2d659a453ffc8ea6`

Commit message: `tripletex playbook: tighten create-employee path`

# Reusable Heuristics

- For exact employee create tasks with `name + birth date + email + start date`, default to the optimistic fresh-account branch, not the sandbox branch.
- Always include explicit `userType: "NO_ACCESS"` unless the prompt asks for login access.
- Route employee-create repairs only from `validationMessages[].field`, not from generic `422` text.
- Treat `GET /employee/employment?employeeId=...&fields=*` as the decisive verification read when `startDate` is scored and the create response is sparse.
- Do not pre-read `/employee`, `/department`, or `/division` for pure create tasks unless the trusted repair branch proves they are needed.