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
- prompt also scores department onboarding plus employment salary/worktime configuration; use `./trusted-standards/onboard-employee.md` for that richer shape

## Standard Flow
1. `POST /employee` with the prompt-required employee fields, explicit `userType`, and nested `employments[]` when the prompt scores a start date
2. if that write fails with `422` where `validationMessages[].field == "department.id"`, do one decisive `GET /department?isInactive=false&count=1&fields=*`, reuse the returned active department id, and retry once
3. if the department repair branch finds no active department and department is clearly required, `POST /department` with a minimal name-only payload, then retry the same employee create once with that new department id
4. if the employee write fails with `422` where `validationMessages[].field == "employments.division.id"`, do one decisive `GET /division?count=1&fields=*`, reuse the returned division id inside the nested employment row, and retry once
5. if scored fields are fully proven by the successful write response, stop
6. if employment start date is scored but the create response is sparse, do one decisive `GET /employee/employment?employeeId=...&fields=*`

## Payload Rules
- send only prompt-required employee fields
- do not pre-read or prefill `department` by default for an exact create-only task; add it only when the prompt explicitly requires it or a validation repair branch proves it is needed
- do not pre-read or prefill `division` by default; add a real `division: { "id": ... }` inside each employment row only when a validation repair branch proves the account requires it
- if prompt/task requires a user type/role field, include explicit `userType`
- normalize mixed-language prompt dates such as `8. December 1982` to ISO; prompt language does not change the employee-create endpoint choice
- preserve prompt-provided Unicode names exactly as written; do not ASCII-normalize names such as `João`
- do not invent personal data not given by prompt

## Validation Rules
- do not branch on the generic top-level `422 message`; it can stay `Validering feilet.` across different failures
- for employee-create repair branches, key off `validationMessages[].field`
- the current proven repair fields are `department.id` and `employments.division.id`
- after a `department.id` failure, retry `POST /employee` with the repaired `department` before reading `/division`; the division requirement is still a second-stage branch, not a safe speculative pre-read

## Reuse From Write Response
- `value.id`
- returned employee identity fields
- returned employment link ids if present

## Verification
- zero extra calls if write response already proves scored state
- one employment read only when start-date/employment coverage is actually scored and missing from response
- for the exact prompt shape `name + birth date + email + start date`, the current minimum safe success path is usually `2` calls in fresh accounts: `POST /employee`, then `GET /employee/employment?employeeId=...&fields=*`
- the 2026-03-20 production English run for `Thomas Harris` (`1991-06-04`, `thomas.harris@example.org`, start `2026-10-06`) re-confirmed that same `2`-call branch and again showed that the successful create response still did not prove `startDate`
- the later 2026-03-20 production Portuguese run for `João Rodrigues` (`1980-09-05`, `joao.rodrigues@example.org`, start `2026-08-08`) re-confirmed the same `2`-call branch after ISO-normalizing `5. September 1980` and `8. August 2026`, with the Unicode first name preserved exactly
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
- scored production re-verification on 2026-03-20 for `Jules Bernard` confirmed that a French prompt with mixed-language dates `8. December 1982` and `27. December 2026` still stays on the same normalized employee-create shape after ISO conversion
- scored production re-verification on 2026-03-20 for `Thomas Harris` confirmed the same fresh-account floor from an English prompt: direct `POST /employee` succeeded, the create response echoed only sparse `employments[]`, and one decisive `GET /employee/employment?employeeId=...&fields=*` finished the task in `2` calls
- scored production re-verification on 2026-03-20 for `João Rodrigues` confirmed that a Portuguese prompt with mixed-language date strings `5. September 1980` and `8. August 2026` still stays on the same fresh-account `2`-call branch after ISO normalization, and that the write/read path preserves Unicode employee names exactly
- persistent sandbox re-verification on 2026-03-20 for `Lucy Wilson Sandbox` confirmed the exact validation payload fields `department.id` and `employments.division.id`, and re-confirmed that the successful `201` response still returned `employments` as link-only objects without `startDate`
- a same-session persistent-sandbox reflection run on 2026-03-20 for `Thomas Harris Reflection 1774058512120` re-confirmed the contrast: `POST /employee` -> `422 department.id` -> `GET /department` -> `POST /employee` -> `422 employments.division.id` -> `GET /division` -> `POST /employee` -> `GET /employee/employment`, with the final create response still lacking `startDate`
- a later same-session persistent-sandbox reflection run on 2026-03-20 for `João Rodrigues Reflection 1774047088805` repeated that exact repair order with existing department `837842` and division `108244566`, confirming again that `/division` should stay a second-stage reactive read rather than a speculative read after the first `422`
