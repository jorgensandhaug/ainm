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
- always pre-read department and include `department: { id: ... }` as a **top-level employee field** on the POST; this avoids a 422 repair branch on 50%+ of production accounts and eliminates avoidable 4xx errors
- CRITICAL: `department` is a top-level employee field ONLY — do NOT put `department` inside the `employments[]` array; the employment object does not have a `department` field and the API returns code 16000 "Request mapping failed" with "Feltet eksisterer ikke i objektet." if you try; this is an unmappable-field error, not a validation error; sandbox-verified on 2026-03-22
- `division` is the opposite: it belongs ONLY inside each employment row, never at the top level; `department` → employee, `division` → employment
- do not pre-read or prefill `division` by default; add a real `division: { "id": ... }` inside each employment row only when a validation repair branch proves the account requires it (0/13 production runs needed division; only persistent sandbox requires it)
- always include explicit `userType: "NO_ACCESS"` unless the prompt explicitly asks for login access; do not use `"STANDARD"` as the default — `"NO_ACCESS"` is the proven safe choice for create-only tasks
- normalize mixed-language prompt dates such as `8. December 1982` to ISO; prompt language does not change the employee-create endpoint choice
- preserve prompt-provided Unicode names exactly as written; do not ASCII-normalize names such as `João`
- do not invent personal data not given by prompt
- CRITICAL: the employment object accepts ONLY `startDate` (and `division` for repair) — do NOT add `employmentType`, `percentageOfFullTimeEquivalent`, `employmentDetails`, or any other invented fields; these trigger code 16000 "Request mapping failed" / "Feltet eksisterer ikke i objektet."; sandbox-verified on 2026-03-22; the aa0e0f72 production run wasted 2 calls on this exact mistake

## Validation Rules
- do not branch on the generic top-level `422 message`; it can stay `Validering feilet.` across different failures
- for employee-create repair branches, key off `validationMessages[].field`
- the current proven repair fields are `department.id` (handled by pre-read) and `employments.division.id` (repair-only)
- division requirement is a second-stage branch, not a safe speculative pre-read (0% occurrence in production)
- a `422` with code `16000` ("Request mapping failed") and field `"department"` means `department` was placed inside the employment object; this is an unmappable-field error, not a validation error — the fix is to move `department` to the top level, not to retry with a different id

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
- pre-reading department was adopted after the dept-required rate crossed 50% (7/11 = 64% when adopted)
- at 64% department-required: pre-read averages 2.0 calls / 0 errors vs no-pre-read 2.3 calls / 0.64 errors — fewer calls AND zero 4xx errors
- the AGENTS.md scoring rules penalize 4xx errors, making pre-read strictly better at 50%+
- division remains at 0% in production (0/13 runs); pre-reading it would waste 1 call every time

## OpenAPI / Sandbox Status
- `/employee` verified in `./openapi.json`
- sparse-employment, department, and division gotchas documented from prior verified runs
- `POST /employee?fields=*,employments(*)` returns the full employee object WITH expanded employment objects including `startDate`; this eliminates the need for a verification GET
- `POST /employee?fields=*` (without `employments(*)`) still returns sparse employments (id + url only) — the nested expansion `employments(*)` is essential
- persistent sandbox re-verification on 2026-03-20 reproduced both `422 department.id` and `422 employments.division.id` as precise repair branches
- persistent sandbox re-verification on 2026-03-21 confirmed the pre-read strategy (GET /department + POST /employee with dept + division) succeeds in the sandbox with 0 errors
- out of 14 known production create-employee runs, 4 succeeded without department and 8 needed it (2 used pre-read so requirement is indeterminate); dept-required rate is at least 57%
- André Almeida run (e9e115f1, Portuguese prompt, 1992-05-30, andre.almeida@example.org, start 2026-02-04) used the pre-read strategy but placed `department` inside the employment object; caused 2 wasted 422s (code 16000 unmappable-field) before correcting placement; 4 calls, 2 errors; should have been 2 calls, 0 errors
- Bjørn Neset run (8e8e2e86, Nynorsk prompt, 1996-02-21, bjrn.neset@example.org, start 2026-06-16) used the CURRENT pre-read strategy correctly; 2 calls, 0 errors (GET /department found 973047, POST /employee with dept→201); 1st production run achieving the proven-minimum 2-call path with pre-read
- the Torbjørn Neset run (b23d4cc2) and Hannah Becker run (3705040b) both used the OLD no-pre-read strategy despite the trusted standard already specifying pre-read; each wasted 1 call + 1 error — agent MUST follow the CURRENT standard flow, not cached/old patterns
- sandbox verification on 2026-03-22 confirmed: `department` inside employment → code 16000; `department` at top level → correct; `department` only in employment → code 16000
- Bjørn Neset run (aa0e0f72, Nynorsk prompt, 2nd instance) added invented fields (`employmentType`, `percentageOfFullTimeEquivalent`, `employmentDetails`) to the employment object; caused code 16000 → script re-run; 4 calls, 1 error against production; should have been 2 calls, 0 errors; sandbox re-verified on 2026-03-22: `employmentType` in employment → code 16000
- the employment object for the simple create-employee shape accepts ONLY `startDate` (plus `division` for repair); all other fields (`employmentType`, `workingHoursScheme`, `remunerationType`, `percentageOfFullTimeEquivalent`, `employmentDetails`) belong to the richer onboard-employee shape and are NOT valid on the base employment model used by `POST /employee`
