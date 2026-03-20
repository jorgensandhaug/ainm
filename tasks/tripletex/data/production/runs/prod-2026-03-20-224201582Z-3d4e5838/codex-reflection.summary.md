## Task
Post-run learning for the scored production employee-create run for `Jules Bernard` (`1982-12-08`, `jules.bernard@example.org`, `2026-12-27`), then sandbox proof, docs update, and commit.

## Reflection
What went well:
- Original run used the right exact-task family: employee create, `userType: "NO_ACCESS"`, nested `employments`, ISO-normalized dates.
- No speculative `/employee` lookup, no speculative `/division` lookup, no endpoint drift.
- Final production state was correct.

What went poorly:
- The run script did not log branch decisions or per-call trace.
- Because original credentials must not be reused, post-run audit cannot prove whether production hit the `department.id` repair branch or finished on the direct 2-call branch.

Mistake:
- Observability mistake only. Not an API-shape mistake.

Correct approach:
- Keep the optimistic fresh-account branch as default.
- Only spend `/department` and `/division` reads after live `422` validation on those exact fields.
- Always normalize mixed-language prompt dates to ISO before write.

## Call Efficiency
Verdict:
- Strategy was minimal-call for the exact task shape.
- No confirmed wasted calls.
- Exact realized production call count is not provable from the saved artifacts because the script did not log branch hits.

Realistic minimum for next time:
- Default path: `POST /employee` -> `GET /employee/employment?employeeId=...&fields=*`
- That is the current 2-call floor for exact `name + birth date + email + start date` employee-create tasks when the first write succeeds.

Conditional repair path:
- If `POST /employee` returns `422 department.id`: `GET /department?isInactive=false&count=1&fields=*`, retry.
- If retry returns `422 employments.division.id`: `GET /division?count=1&fields=*`, retry.
- Then do the one required `GET /employee/employment`.
- Full stacked repair ladder costs 6 calls total and is not wasted if triggered by live validation.

No lower-call universally safer replacement was found.

## Root Causes
- Missing branch logging in the production script blocked exact post-run call-count reconstruction.
- Mixed-language prompt text could have tempted unnecessary detours; the right move was simple ISO normalization only.
- The employee-create endpoint still returns sparse `employments[]`, so trying to save the verification read would risk scorer-visible underproof.

## Sandbox Verification
Persistent sandbox proved the repair ladder exactly:

- `POST /employee` -> `422` with `validationMessages[].field == "department.id"`
- `GET /department?isInactive=false&count=1&fields=*` -> reused `departmentId=837842`
- `POST /employee` with department -> `422` with `validationMessages[].field == "employments.division.id"`
- `GET /division?count=1&fields=*` -> reused `divisionId=108244566`
- `POST /employee` with department + division -> `201`
- `GET /employee/employment?employeeId=...&fields=*` -> proved `startDate=2026-12-27`

Other proved facts:
- Successful create still returned sparse `employments` link objects only.
- Prompt language did not require any alternate flow; French prose plus `December` dates still stayed on the same employee-create path after ISO conversion.

## Playbook Changes
Updated existing docs. No new trusted standard or playbook created.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [create-employee.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-employee.md)
- [create-employee.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-employee.md)

What changed:
- Added that mixed-language date prose like `8. December 1982` / `27. December 2026` still uses the standard employee-create flow after ISO normalization.
- Added the confirmed stacked sandbox repair ladder and its 6-call cost as repair-only guidance.

## Commit
- Hash: `eb7f2d0220a46eb4da1a3d63e75e9c4a078d9ae2`
- Message: `tripletex playbook: refine employee-create guidance`

## Reusable Heuristics
- Exact one-employee create task: start with `POST /employee`, not `GET /department`.
- Send `userType: "NO_ACCESS"` unless prompt explicitly asks for access.
- Put `startDate` inside nested `employments` on create.
- Normalize localized or mixed-language dates to ISO before any write.
- Treat `department.id` and `employments.division.id` as validation-driven repair branches only.
- Do not trust successful `POST /employee` to echo `startDate`; use one decisive `GET /employee/employment`.
- Do not let French/German/Spanish/Norwegian prompt language push you into a different endpoint path for this exact task shape.