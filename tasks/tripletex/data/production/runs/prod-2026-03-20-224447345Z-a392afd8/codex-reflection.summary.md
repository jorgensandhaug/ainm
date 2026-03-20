# Task

Create one employee from a Portuguese prompt: `João Rodrigues`, birth date `5. September 1980`, email `joao.rodrigues@example.org`, start date `8. August 2026`.

# Reflection

- The production run matched the exact trusted-standard employee-create shape, so the right starting point was `POST /employee` with `userType: "NO_ACCESS"` and nested `employments: [{ startDate }]`.
- The run correctly normalized the mixed-language dates to `1980-09-05` and `2026-08-08`.
- The run correctly preserved the Unicode first name `João`; no ASCII-normalization leak happened.
- The run correctly kept the verification read focused on `GET /employee/employment?employeeId=...&fields=*` because the successful create response still did not prove `startDate`.
- What went poorly was not the API flow but the documentation coverage: Portuguese mixed-language date prose plus Unicode employee names were not called out explicitly enough in the employee docs before this run.
- A smaller process gap also remained: the production script did not emit a per-call trace, so post-run call-count audit had to rely on the observed result plus the trusted standard rather than an explicit execution log.

# Call Efficiency

- This run was minimal-call for the exact fresh-account task shape.
- Realistic minimum safe path for this shape remains exactly `2` calls:
  1. `POST /employee` with `firstName`, `lastName`, `dateOfBirth`, `email`, `userType: "NO_ACCESS"`, `employments: [{ startDate }]`
  2. `GET /employee/employment?employeeId=<newId>&fields=*`
- Wasted calls: none.
- Lower-call replacement path: none proven. A one-call stop after `POST /employee` is still unsafe because the successful write response commonly returns sparse `employments[]` without the scored `startDate`.
- Calls that would have been wasted for this exact production shape:
  - `GET /department` before the first `POST /employee`
  - `GET /division` before a live `422 employments.division.id`
  - any employee search/read before create
  - `POST /employee/employment` as a first move instead of nested `employments` on create

# Root Causes

- The main ambiguity source is environmental mismatch: fresh production accounts often accept the first `POST /employee`, while the persistent sandbox still requires repair branches for `department.id` and `employments.division.id`.
- The main verification trap is sparse write responses: `POST /employee` can succeed while echoing `userType: null` and only link-style `employments[]`.
- The prompt itself mixed Portuguese prose with English month names, which could tempt over-analysis or endpoint drift; the correct response is still simple ISO normalization.
- Unicode names are scorer-relevant state. Any transliteration such as `Joao` would be a correctness bug even if the API write otherwise succeeded.

# Sandbox Verification

- I proved the repair branch in the persistent sandbox using a disposable employee with the same shape and Unicode first name: `João Rodrigues Reflection 1774046808818`, email `joao.rodrigues.1774046808818@example.org`.
- Sandbox credentials used:
  - base URL `https://kkpqfuj-amager.tripletex.dev/v2`
  - Basic auth username `0`
- Verified sandbox path was `6` calls total:
  1. `POST /employee` -> `422` with `validationMessages[].field == "department.id"`
  2. `GET /department?isInactive=false&count=1&fields=*` -> reused department `837842`
  3. `POST /employee` with `department.id` -> `422` with `validationMessages[].field == "employments.division.id"`
  4. `GET /division?count=1&fields=*` -> reused division `108244566`
  5. `POST /employee` with `department.id` and `division.id` -> `201`, employee `18591608`
  6. `GET /employee/employment?employeeId=18591608&fields=*` -> proved `startDate: 2026-08-08`
- The sandbox proof re-confirmed two important facts:
  - sandbox repair behavior is real, but repair reads must stay conditional
  - even after success, the create response still did not prove `startDate`

# Playbook Changes

- Updated existing trusted standards and playbook; created no new files.
- Changed paths:
  - `./AGENTS.md`
  - `./trusted-standards/common-endpoints.md`
  - `./trusted-standards/create-employee.md`
  - `./task-playbooks/create-employee.md`
- What changed:
  - documented that Portuguese employee-create prompts with mixed-language date strings still use the same exact `2`-call fresh-account path
  - documented that Unicode employee names such as `João` must be preserved exactly
  - reinforced that no lower-call path than `POST /employee` -> `GET /employee/employment` is yet trusted for start-date-scored employee creates

# Commit

- Commit hash: `7ff9fee7ddd5cb81265a703692aad6ccc4752079`
- Commit message: `tripletex playbook: tighten create-employee multilingual guidance`

# Reusable Heuristics

- For exact create-one-employee tasks with prompt-provided name, birth date, email, and start date, start with the trusted standard and do not re-open `openapi.json`.
- Normalize localized or mixed-language dates to ISO before writing, but do not let prompt language change the endpoint choice.
- Preserve Unicode names exactly as prompted.
- Use `userType: "NO_ACCESS"` unless the prompt explicitly asks for login/system access.
- Do not pre-read `department` or `division` in fresh-account production runs; spend those reads only after live `422` evidence.
- Route employee-create repair branches only from `validationMessages[].field`, not from the generic top-level `422` message.
- If `startDate` is scored, expect one decisive `GET /employee/employment?employeeId=...&fields=*`; treat attempts to skip that read as unproven optimization.
