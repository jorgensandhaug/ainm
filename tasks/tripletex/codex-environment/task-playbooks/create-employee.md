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

Strategy update on 2026-03-21 (after dept-required rate crossed 50%):
- department pre-read is now the default; 7/11 production runs (64%) required department
- pre-reading department: always 2 calls, 0 errors (regardless of account)
- no pre-read: 1 call 0 errors (no dept needed) or 3 calls 1 error (dept needed) — at 64% dept-required, averages 2.3 calls + 0.64 errors
- pre-read wins on both calls and errors; every subsequent no-pre-read run that hits dept wastes 1 call + 1 error

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

1. `GET /department?isInactive=false&count=1&fields=id`
   - if an active department exists, reuse its `id`
   - if none exists, `POST /department` with a minimal name-only payload
2. `POST /employee?fields=*,employments(*)` with:
   - requested identity fields
   - explicit `userType: "NO_ACCESS"`
   - `department: { id: ... }` from step 1
   - nested `employments: [{ "startDate": "YYYY-MM-DD" }]` if the prompt includes start date
3. If `422` where `validationMessages[].field == "employments.division.id"`:
   - `GET /division?count=1&fields=id`
   - retry `POST /employee?fields=*,employments(*)` with `division: { "id": ... }` inside the employment row
4. Stop — the response proves all scored fields including `startDate`; no verification GET needed

## Recommended Payload Shape

Use ISO dates. Normalize any localized prompt date first.

```json
{
  "firstName": "Astrid",
  "lastName": "Johansen",
  "dateOfBirth": "1989-06-10",
  "email": "astrid.johansen@example.org",
  "userType": "NO_ACCESS",
  "department": { "id": 12345 },
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

Run 2026-03-21 (Astrid Nilsen, Norwegian prompt): 3 calls, 1 error — dept-repair branch; first run to use `?fields=*,employments(*)` in production, saving 1 call vs pre-discovery flow; confirms the no-verification-GET path works end-to-end

Run 2026-03-21 (Charles Walker, English prompt): 3 calls, 1 error — dept-repair branch (f1d7b5dd); used `?fields=*,employments(*)` correctly; with the new pre-read strategy this would have been 2 calls, 0 errors; this run brought dept-required rate to 5/9 (56%), triggering the strategy switch to pre-read

Run 2026-03-21 (Torbjørn Neset, Nynorsk prompt): 3 calls, 1 error — dept-repair branch (b23d4cc2); agent used OLD no-pre-read strategy despite trusted standard already specifying pre-read; with pre-read would have been 2 calls, 0 errors; dept-required rate now 6/10 (60%); root cause: agent cached the old strategy pattern instead of following the current trusted standard flow

Run 2026-03-21 (Hannah Becker, German prompt): 3 calls, 1 error — dept-repair branch (3705040b); agent used OLD no-pre-read strategy (POST → 422 dept → GET /department found 745170 → POST with dept → 201); with pre-read would have been 2 calls, 0 errors; dept-required rate now 7/11 (64%); German date normalization (31. January 1996 → 1996-01-31, 15. July 2026 → 2026-07-15) correct

## Avoidable Mistakes

- Do not omit `userType`
- Do not use `POST /employee?fields=*` without `employments(*)` — the nested expansion is required to get `startDate` in the response
- Do not skip the `GET /department` pre-read; at 64% department-required rate (7/11 runs), pre-reading saves calls and errors on average; the Torbjørn Neset and Hannah Becker runs both proved that using the old no-pre-read pattern wastes 1 call + 1 error
- CRITICAL: always follow the CURRENT trusted standard flow, not a cached older version — the trusted standard may have been updated between runs
- Do not pre-read `/division` — 0/11 production runs needed it; only repair if `422` on `employments.division.id`
- Do not ASCII-normalize or transliterate prompt-provided employee names; preserve names such as `João` exactly
- Do not branch on the generic `422 message`; inspect `validationMessages[].field`
- Do not use `userType: "STANDARD"` when the prompt only asks to create the employee; always use `"NO_ACCESS"`
- Do not add a separate `GET /employee/employment` verification call — use `?fields=*,employments(*)` on POST instead
