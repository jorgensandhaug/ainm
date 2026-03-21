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
1. `GET /department?isInactive=false&count=1&fields=id` — pre-read one active department; if none exists, `POST /department` with a minimal name-only payload
2. `POST /employee?fields=*,employments(*)` with the prompt-required employee fields, explicit `userType`, `department: { id: ... }` from step 1, and nested `employments[]` when the prompt scores a start date
3. if that write fails with `422` where `validationMessages[].field == "employments.division.id"`, do one decisive `GET /division?count=1&fields=id`, reuse the returned division id inside the nested employment row, and retry `POST /employee?fields=*,employments(*)` once
4. stop — the `?fields=*,employments(*)` response proves all scored fields including `startDate`; no verification GET is needed

## Payload Rules
- send only prompt-required employee fields
- always pre-read department and include `department: { id: ... }` on the POST; this avoids a 422 repair branch on 50%+ of production accounts and eliminates avoidable 4xx errors
- do not pre-read or prefill `division` by default; add a real `division: { "id": ... }` inside each employment row only when a validation repair branch proves the account requires it (0/11 production runs needed division; only persistent sandbox requires it)
- always include explicit `userType: "NO_ACCESS"` unless the prompt explicitly asks for login access; do not use `"STANDARD"` as the default — `"NO_ACCESS"` is the proven safe choice for create-only tasks
- normalize mixed-language prompt dates such as `8. December 1982` to ISO; prompt language does not change the employee-create endpoint choice
- preserve prompt-provided Unicode names exactly as written; do not ASCII-normalize names such as `João`
- do not invent personal data not given by prompt

## Validation Rules
- do not branch on the generic top-level `422 message`; it can stay `Validering feilet.` across different failures
- for employee-create repair branches, key off `validationMessages[].field`
- the current proven repair fields are `department.id` (handled by pre-read) and `employments.division.id` (repair-only)
- division requirement is a second-stage branch, not a safe speculative pre-read (0% occurrence in production)

## Reuse From Write Response
- `value.id` — employee id from `POST /employee?fields=*,employments(*)`
- `value.firstName`, `value.lastName`, `value.dateOfBirth`, `value.email` — all employee identity fields
- `value.employments[0].startDate` — the employment start date, proving all scored state in one response
- no verification GET is needed when using `?fields=*,employments(*)`

## Verification
- zero extra calls when using `POST /employee?fields=*,employments(*)` — the response includes the full employment object with `startDate`
- for the exact prompt shape `name + birth date + email + start date`, the minimum safe success path is **2 calls**: `GET /department` + `POST /employee?fields=*,employments(*)`
- CRITICAL: `POST /employee?fields=*` (without the nested expansion) still returns sparse `employments` (id + url only, no `startDate`); the `employments(*)` part is essential
- sandbox verification on 2026-03-21 confirmed that `POST /employee?fields=*,employments(*)` returns the full response with all employee identity fields AND full employment objects including `startDate`
- sandbox verification on 2026-03-21 confirmed that `POST /employee?fields=employments(*)` also returns `startDate` but omits top-level employee fields like `firstName`; always use `fields=*,employments(*)` to get both

## Total Calls
- 2 calls in the common path (GET /department + POST /employee?fields=*,employments(*)), 0 errors
- 3 calls when no active department exists (GET /department + POST /department + POST /employee), 0 errors
- +2 calls + 1 error when division-repair is also needed (POST 422 + GET /division + POST retry)

## Known Recovery Branches
- employment creation may require `employments[].division.id`; if validation says so, resolve one existing `/division?count=1&fields=id` and retry once with that `division.id`
- always use `?fields=*,employments(*)` on every POST /employee attempt (including retries) to get the full response and avoid needing a verification GET

## Strategy Rationale
- pre-reading department was adopted after the dept-required rate crossed 50% (now 7/11 = 64%)
- at 64% department-required: pre-read averages 2.0 calls / 0 errors vs no-pre-read 2.3 calls / 0.64 errors — fewer calls AND zero 4xx errors
- the AGENTS.md scoring rules penalize 4xx errors, making pre-read strictly better at 50%+
- division remains at 0% in production (0/11 runs); pre-reading it would waste 1 call every time

## OpenAPI / Sandbox Status
- `/employee` verified in `./openapi.json`
- sparse-employment, department, and division gotchas documented from prior verified runs
- `POST /employee?fields=*,employments(*)` returns the full employee object WITH expanded employment objects including `startDate`; this eliminates the need for a verification GET
- `POST /employee?fields=*` (without `employments(*)`) still returns sparse employments (id + url only) — the nested expansion `employments(*)` is essential
- persistent sandbox re-verification on 2026-03-20 reproduced both `422 department.id` and `422 employments.division.id` as precise repair branches
- persistent sandbox re-verification on 2026-03-21 confirmed the pre-read strategy (GET /department + POST /employee with dept + division) succeeds in the sandbox with 0 errors
- out of 11 known production create-employee runs, 4 succeeded without department and 7 needed it; dept-required rate is now 64%
- latest run: Hannah Becker (3705040b, German prompt, 1996-01-31, hannah.becker@example.org, start 2026-07-15) used OLD no-pre-read strategy; 3 calls, 1 error (POST→422, GET /department found 745170, POST with dept→201); with pre-read would have been 2 calls, 0 errors
- the Torbjørn Neset run (b23d4cc2) and Hannah Becker run (3705040b) both used the OLD no-pre-read strategy despite the trusted standard already specifying pre-read; each wasted 1 call + 1 error — agent MUST follow the CURRENT standard flow, not cached/old patterns
