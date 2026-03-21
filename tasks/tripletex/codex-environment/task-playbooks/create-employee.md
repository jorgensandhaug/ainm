# Create Employee

## Scope

Use for tasks like:
- create one new employee
- prompt provides identity fields such as name, birth date, email, and start date
- no salary, leave, login-role assignment, or update/delete flow is requested
- no explicit department onboarding, annual-salary setup, or standard-worktime setup is requested

## Verified Findings

CRITICAL discovery on 2026-03-21:
- `POST /employee?fields=*,employments(*)` returns the full employee object WITH expanded employment objects including `startDate`
- this eliminates the need for a separate verification `GET /employee/employment` call
- `POST /employee?fields=*` (without `employments(*)`) still returns sparse employments (id + url only) — the nested expansion is essential
- `POST /employee?fields=employments(*)` returns full employment but omits top-level employee fields — always use `fields=*,employments(*)`
- minimum for fresh accounts: **1 call** (down from 2)
- minimum for dept-required accounts: **3 calls + 1 error** (down from 4 + 1 error)

Sandbox verification showed:
- `POST /employee` fails with `422` if `userType` is omitted
- `POST /employee` can fail with `422` if `department.id` is omitted in accounts where department is required
- `POST /employee` accepts nested `employments: [{ "startDate": "YYYY-MM-DD" }]`
- the `201` response with `?fields=*,employments(*)` proves all scored state in one response

Observed validation messages:
- missing `userType`: `Brukertype kan ikke være "0" eller tom.`
- missing `department.id`: `validationMessages[].field == "department.id"` with message `Feltet må fylles ut.`
- missing `employments.division.id`: `validationMessages[].field == "employments.division.id"` with message `Arbeidsforholdet må knyttes til en virksomhet/underenhet.`
- top-level `message` can stay the same generic `Validering feilet.` across both repair branches

## Minimal Safe Flow

1. `POST /employee?fields=*,employments(*)` with:
   - requested identity fields
   - explicit `userType: "NO_ACCESS"`
   - nested `employments: [{ "startDate": "YYYY-MM-DD" }]` if the prompt includes start date
2. If `422` where `validationMessages[].field == "department.id"`:
   - `GET /department?isInactive=false&count=1&fields=*`
   - if an active department exists, reuse its `id`
   - if none exists, `POST /department` with a minimal name-only payload
3. Retry `POST /employee?fields=*,employments(*)` with `department: { "id": ... }`
4. If `422` where `validationMessages[].field == "employments.division.id"`:
   - `GET /division?count=1&fields=*`
   - retry `POST /employee?fields=*,employments(*)` with `division: { "id": ... }` inside the employment row
5. Stop — the response proves all scored fields including `startDate`; no verification GET needed

## Recommended Payload Shape

Use ISO dates. Normalize any localized prompt date first.

```json
{
  "firstName": "Astrid",
  "lastName": "Johansen",
  "dateOfBirth": "1989-06-10",
  "email": "astrid.johansen@example.org",
  "userType": "NO_ACCESS",
  "employments": [
    {
      "startDate": "2026-10-25"
    }
  ]
}
```

Always POST to `/employee?fields=*,employments(*)`.

## Production Run History

Run 2026-03-20 (Miguel Sánchez, fresh account): 2 calls, 0 errors — direct POST succeeded, 1 verification GET (pre-discovery)

Run 2026-03-20 (Thomas Harris, fresh account): 2 calls, 0 errors — same branch (pre-discovery)

Run 2026-03-20 (Jules Bernard, French prompt): 2 calls, 0 errors — same branch with ISO date normalization (pre-discovery)

Run 2026-03-20 (João Rodrigues, Portuguese prompt): 2 calls, 0 errors — Unicode name preserved (pre-discovery)

Run 2026-03-21 (Ingrid Johansen, Norwegian prompt): 4 calls, 1 error — dept-repair branch (pre-discovery)

Run 2026-03-21 (Geir Neset, Nynorsk prompt): 4 calls, 1 error — dept-repair branch (pre-discovery); with `?fields=*,employments(*)` would have been 3 calls + 1 error

## Avoidable Mistakes

- Do not omit `userType`
- Do not use `POST /employee?fields=*` without `employments(*)` — the nested expansion is required to get `startDate` in the response
- Do not default to `GET /department` before the first create attempt; add `department.id` only when the 422 repair branch proves it is needed
- Do not read `/division` immediately after a `422 department.id`; retry with repaired department first
- Do not ASCII-normalize or transliterate prompt-provided employee names; preserve names such as `João` exactly
- Do not branch on the generic `422 message`; inspect `validationMessages[].field`
- Do not use `userType: "STANDARD"` when the prompt only asks to create the employee; always use `"NO_ACCESS"`
- Do not add a separate `GET /employee/employment` verification call — use `?fields=*,employments(*)` on POST instead
