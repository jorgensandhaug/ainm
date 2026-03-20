## 1. Task
Post-run learning pass for the scored Tripletex run that created employee Lucy Wilson, then sandbox-proof the exact task shape, update the learning docs, make one commit, and summarize.

## 2. Reflection
What went well:
- Production run followed the exact employee-create standard.
- It used the optimistic fresh-account path: `POST /employee` first, no speculative `GET /department`.
- It reused the create response `id` and did one decisive verification read for `startDate`.
- It finished with no avoidable `4xx` in production.

What went poorly:
- My implementation logic for repair branches was weaker than ideal: it matched generic validation text, not the exact `validationMessages[].field`.
- That weakness did not hurt this run because production never entered a repair branch, but it was still the wrong standard.
- The shared docs also did not explicitly surface `/division` in the common endpoint inventory.

Correct approach:
- Keep the optimistic 2-call production path.
- If a repair branch is needed, route it only from `validationMessages[].field`, not from generic `422` text.

## 3. Call Efficiency
The scored production run was minimal-call for this exact fresh-account task shape.

Used:
- `POST /employee`
- `GET /employee/employment?employeeId=...&fields=*`

Wasted calls:
- None.

Exact lower-call path next agent should use:
- `POST /employee` with `firstName`, `lastName`, `dateOfBirth`, `email`, `userType: "NO_ACCESS"`, `employments: [{ startDate }]`
- If the successful write response does not already prove `startDate`, `GET /employee/employment?employeeId=<newId>&fields=*`

Repair calls to reserve only for live validation:
- `GET /department?isInactive=false&count=1&fields=*` only if `validationMessages[].field == "department.id"`
- `GET /division?count=1&fields=*` only if `validationMessages[].field == "employments.division.id"`

## 4. Root Causes
- Documentation gap: employee-create docs mentioned department/division repair, but not strongly enough that routing must key off `validationMessages[].field`.
- Reference gap: `/division` was used by employee/payroll branches but not listed in the common endpoint inventory.
- Implementation weakness: I encoded the fallback matcher too loosely because the docs did not force the exact field-based branch condition.

## 5. Sandbox Verification
Persistent sandbox proved the repair payloads and the sparse-success response:

- `POST /employee` with nested `employments` returned `422` with `validationMessages[0].field = "department.id"`.
- `GET /department?isInactive=false&count=1&fields=*` returned active department `id=837842`.
- Retried `POST /employee` with `department.id`; got `422` with `validationMessages[0].field = "employments.division.id"`.
- `GET /division?count=1&fields=*` returned division `id=108244566`.
- Retried `POST /employee` with both `department.id` and `employments[0].division.id`; got `201`, employee `id=18587297`.
- The successful `201` still returned `userType: null` and `employments` as link-only objects, not `startDate`.
- `GET /employee/employment?employeeId=18587297&fields=*` proved `startDate = 2026-04-25`.

Conclusion:
- Persistent sandbox account still needs the repair branch.
- Fresh production account still supports the 2-call optimistic path.
- One-call stop is still not a trusted path for start-date-scored employee create.

## 6. Playbook Changes
Updated existing docs. No new trusted standard or playbook created.

Changed paths:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-employee.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-employee.md`

What changed:
- Added `/division` to the common endpoint inventory.
- Tightened employee-create repair rules to use exact `validationMessages[].field`.
- Re-confirmed the fresh-account minimal path stays 2 calls.
- Re-confirmed successful `POST /employee` can still be too sparse to prove `startDate`.

## 7. Commit
- Hash: `74c39cba0a1af30dfe4f352dc188ec21fd3e6611`
- Message: `tripletex playbook: tighten employee-create repair signals`

## 8. Reusable Heuristics
- For exact create-one-employee prompts with scored `startDate`, default to the optimistic 2-call path, not a department pre-read.
- Treat `POST /employee` as authoritative for `id`, but not for `startDate`.
- Do not branch on generic `422` text like `Validering feilet.` or `Feltet må fylles ut.` alone.
- For employee-create repair, branch on exact fields: `department.id` and `employments.division.id`.
- Do not interpret `userType: null` in the success response as a failed write.
- Do not spend `GET /employee` on pure create tasks.
