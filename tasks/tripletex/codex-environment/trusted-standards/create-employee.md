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
1. `POST /employee?fields=*,employments(*)` with the prompt-required employee fields, explicit `userType`, and nested `employments[]` when the prompt scores a start date
2. if that write fails with `422` where `validationMessages[].field == "department.id"`, do one decisive `GET /department?isInactive=false&count=1&fields=*`, reuse the returned active department id, and retry once
3. if the department repair branch finds no active department and department is clearly required, `POST /department` with a minimal name-only payload, then retry the same employee create once with that new department id
4. if the employee write fails with `422` where `validationMessages[].field == "employments.division.id"`, do one decisive `GET /division?count=1&fields=*`, reuse the returned division id inside the nested employment row, and retry once
5. stop — the `?fields=*,employments(*)` response proves all scored fields including `startDate`; no verification GET is needed

## Payload Rules
- send only prompt-required employee fields
- do not pre-read or prefill `department` by default for an exact create-only task; add it only when the prompt explicitly requires it or a validation repair branch proves it is needed
- do not pre-read or prefill `division` by default; add a real `division: { "id": ... }` inside each employment row only when a validation repair branch proves the account requires it
- always include explicit `userType: "NO_ACCESS"` unless the prompt explicitly asks for login access; do not use `"STANDARD"` as the default — `"NO_ACCESS"` is the proven safe choice for create-only tasks
- normalize mixed-language prompt dates such as `8. December 1982` to ISO; prompt language does not change the employee-create endpoint choice
- preserve prompt-provided Unicode names exactly as written; do not ASCII-normalize names such as `João`
- do not invent personal data not given by prompt

## Validation Rules
- do not branch on the generic top-level `422 message`; it can stay `Validering feilet.` across different failures
- for employee-create repair branches, key off `validationMessages[].field`
- the current proven repair fields are `department.id` and `employments.division.id`
- after a `department.id` failure, retry `POST /employee` with the repaired `department` before reading `/division`; the division requirement is still a second-stage branch, not a safe speculative pre-read

## Reuse From Write Response
- `value.id` — employee id from `POST /employee?fields=*,employments(*)`
- `value.firstName`, `value.lastName`, `value.dateOfBirth`, `value.email` — all employee identity fields
- `value.employments[0].startDate` — the employment start date, proving all scored state in one response
- no verification GET is needed when using `?fields=*,employments(*)`

## Verification
- zero extra calls when using `POST /employee?fields=*,employments(*)` — the response includes the full employment object with `startDate`
- for the exact prompt shape `name + birth date + email + start date`, the minimum safe success path is **1 call** in fresh accounts: `POST /employee?fields=*,employments(*)`
- CRITICAL: `POST /employee?fields=*` (without the nested expansion) still returns sparse `employments` (id + url only, no `startDate`); the `employments(*)` part is essential
- sandbox verification on 2026-03-21 confirmed that `POST /employee?fields=*,employments(*)` returns the full response with all employee identity fields AND full employment objects including `startDate`
- sandbox verification on 2026-03-21 confirmed that `POST /employee?fields=employments(*)` also returns `startDate` but omits top-level employee fields like `firstName`; always use `fields=*,employments(*)` to get both
- the 2026-03-21 production Nynorsk run for `Geir Neset` (`1997-06-24`, `geir.neset@example.org`, start `2026-10-15`) used the previous 2-call standard (POST + GET employment) and hit the department-repair branch, resulting in 4 calls + 1 error; with `?fields=*,employments(*)` this would have been 3 calls + 1 error (saving the verification GET)

## Total Calls
- 1 call when fresh account accepts the write directly (POST /employee?fields=*,employments(*))
- 3 calls + 1 error when department-repair branch is needed (POST → 422, GET /department, POST with dept)
- 4 calls + 1 error when department-repair finds no active dept (POST → 422, GET /department, POST /department, POST /employee with dept)
- +2 calls + 1 error when division-repair is also needed (additional GET /division + POST retry)

## Known Recovery Branches
- some accounts reject the initial create without `department.id`; in that branch, resolve one active department or create a minimal one only if the read proves none exist
- employment creation may also require `employments[].division.id`; if validation says so, resolve one existing `/division?count=1&fields=*` and retry once with that `division.id`
- always use `?fields=*,employments(*)` on every POST /employee attempt (including retries) to get the full response and avoid needing a verification GET

## OpenAPI / Sandbox Status
- `/employee` verified in `./openapi.json`
- sparse-employment, department, and division gotchas documented from prior verified runs
- CRITICAL discovery on 2026-03-21: `POST /employee?fields=*,employments(*)` returns the full employee object WITH expanded employment objects including `startDate`; this eliminates the need for a verification GET and reduces the fresh-account minimum from 2 calls to 1 call
- `POST /employee?fields=*` (without `employments(*)`) still returns sparse employments (id + url only) — the nested expansion `employments(*)` is essential
- `POST /employee?fields=employments(*)` returns full employment objects but omits top-level employee fields — always use `fields=*,employments(*)` for both
- persistent sandbox re-verification on 2026-03-20 reproduced both `422 department.id` and `422 employments.division.id` as precise repair branches
- out of 6 known production create-employee runs, 4 succeeded without department repair (previously 2 calls, now 1) and 2 needed it (previously 4 calls, now 3); the no-pre-read strategy remains correct on average
- the 2026-03-21 production run for `Geir Neset` (Nynorsk prompt, 1997-06-24, geir.neset@example.org, start 2026-10-15) hit the department-repair branch: POST /employee → 422 → GET /department (found existing dept 742168) → POST /employee with dept → 201 → GET /employee/employment (unnecessary with new fields expansion); total 4 calls, 1 error; with `?fields=*,employments(*)` this would have been 3 calls + 1 error
