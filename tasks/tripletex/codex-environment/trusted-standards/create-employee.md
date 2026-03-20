# Create Employee

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one employee
- prompt directly provides employee identity/contact fields
- no payroll run in the same task
- no complex multi-employee workflow

## Do Not Use This Standard If
- payroll setup/run is part of the task
- prompt requires repairing an existing employee
- department/accounting state is unclear and prompt depends on it

## Standard Flow
1. `POST /employee` with the prompt-required employee fields, explicit `userType`, and nested `employments[]` when the prompt scores a start date
2. if that write fails with `422` on `department.id`, do one decisive `GET /department?isInactive=false&count=1&fields=*`, reuse the returned active department id, and retry once
3. if the department repair branch finds no active department and department is clearly required, `POST /department` with a minimal name-only payload, then retry the same employee create once with that new department id
4. if the employee write fails with `422` on `employments.division.id`, do one decisive `GET /division?count=1&fields=*`, reuse the returned division id inside the nested employment row, and retry once
5. if scored fields are fully proven by the successful write response, stop
6. if employment start date is scored but the create response is sparse, do one decisive `GET /employee/employment?employeeId=...&fields=*`

## Payload Rules
- send only prompt-required employee fields
- do not pre-read or prefill `department` by default for an exact create-only task; add it only when the prompt explicitly requires it or a validation repair branch proves it is needed
- do not pre-read or prefill `division` by default; add a real `division: { "id": ... }` inside each employment row only when a validation repair branch proves the account requires it
- if prompt/task requires a user type/role field, include explicit `userType`
- do not invent personal data not given by prompt

## Reuse From Write Response
- `value.id`
- returned employee identity fields
- returned employment link ids if present

## Verification
- zero extra calls if write response already proves scored state
- one employment read only when start-date/employment coverage is actually scored and missing from response
- for the exact prompt shape `name + birth date + email + start date`, the current minimum safe success path is usually `2` calls in fresh accounts: `POST /employee`, then `GET /employee/employment?employeeId=...&fields=*`
- a one-call stop after `POST /employee` is not yet a trusted standard for start-date-scored tasks because the successful create response often omits the actual `startDate`

## Known Recovery Branches
- some accounts reject the initial create without `department.id`; in that branch, resolve one active department or create a minimal one only if the read proves none exist
- employment creation may also require `employments[].division.id`; if validation says so, resolve one existing `/division?count=1&fields=*` and retry once with that `division.id`
- write response may echo sparse employment data only

## OpenAPI / Sandbox Status
- `/employee` verified in `./openapi.json`
- sparse-employment, department, and division gotchas documented from prior verified runs
- persistent sandbox re-verification on 2026-03-20 reproduced both `422 department.id` and `422 employments.division.id` as precise repair branches, while scored production feedback the same day showed that automatic pre-reading of `department` can overpay calls on accounts that do not require it
- scored production re-verification on 2026-03-20 for `Miguel Sánchez` confirmed the fresh-account winning branch: direct `POST /employee` succeeded without department or division repair, and one follow-up `GET /employee/employment?employeeId=...&fields=*` was still needed because the successful write response did not prove the requested `startDate`
