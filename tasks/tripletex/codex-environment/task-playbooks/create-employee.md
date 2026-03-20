# Create Employee

## Scope

Use for tasks like:
- create one new employee
- prompt provides identity fields such as name, birth date, email, and start date
- no salary, leave, login-role assignment, or update/delete flow is requested

## Verified Findings

Sandbox verification showed:
- `POST /employee` fails with `422` if `userType` is omitted
- `POST /employee` can fail with `422` if `department.id` is omitted in accounts where department is required
- `POST /employee` accepts nested `employments: [{ "startDate": "YYYY-MM-DD" }]`
- the employee create response may still omit `userType` and nested employment fields even when creation succeeded
- `GET /employee/employment?employeeId=...&fields=*` confirmed the requested start date after create

Persistent-sandbox re-verification on 2026-03-19 showed:
- `POST /employee` succeeded with `userType: "NO_ACCESS"`, `department: { "id": ... }`, and nested `employments`
- the `201` response echoed `userType: null` even though `NO_ACCESS` was sent
- the `201` response included `employments: [{ "id": ..., "url": ... }]` but still did not echo `startDate`
- `GET /employee/employment?employeeId=...&fields=*` returned the authoritative `startDate`

Persistent-sandbox re-verification on 2026-03-20 showed:
- a direct `POST /employee` with `userType` and nested `employments`, but without `department`, failed with `422 department.id: Feltet må fylles ut.`
- the next create attempt with `department: { "id": ... }`, but still without `division`, failed with `422 employments.division.id: Arbeidsforholdet må knyttes til en virksomhet/underenhet.`
- one decisive `GET /division?count=1&fields=*` provided a usable division for the final successful retry
- the successful `201` response still echoed `userType: null` and sparse `employments[]`

Scored production feedback on 2026-03-20 showed:
- an automatic `GET /department` before the first employee write can lose the call-efficiency bonus on accounts that accept the create without department repair

Scored production re-verification on 2026-03-20 for `Miguel Sánchez` showed:
- in a fresh account, direct `POST /employee` with `userType: "NO_ACCESS"` and nested `employments: [{ "startDate": ... }]` succeeded without department or division repair
- the successful create response still did not prove `startDate`, so one decisive `GET /employee/employment?employeeId=...&fields=*` remained necessary
- that exact prompt shape therefore settled at a minimum safe `2` calls when the initial create succeeded

Scored production re-verification on 2026-03-20 for `Thomas Harris` showed:
- the same exact fresh-account branch held for an English prompt with `1991-06-04`, `thomas.harris@example.org`, and start `2026-10-06`
- direct `POST /employee` succeeded without department or division repair
- the successful create response still returned sparse `employments[]`, so one decisive `GET /employee/employment?employeeId=...&fields=*` remained necessary
- that run added no evidence for a one-call stop; it re-confirmed the `2`-call floor

Persistent-sandbox reflection re-verification on 2026-03-20 showed:
- the same prompt shape still hit the full repair ladder in the persistent sandbox: `422 department.id`, then `422 employments.division.id`, then success after reusing one active department and one division id
- the sandbox path therefore remained `6` calls total including the final employment verification read
- this is sandbox-only evidence for the repair branches, not a reason to pre-read `department` or `division` in fresh-account scored runs

Observed validation messages:
- missing `userType`: `Brukertype kan ikke være "0" eller tom.`
- missing `department.id`: `validationMessages[].field == "department.id"` with message `Feltet må fylles ut.`
- missing `employments.division.id`: `validationMessages[].field == "employments.division.id"` with message `Arbeidsforholdet må knyttes til en virksomhet/underenhet.`
- top-level `message` can stay the same generic `Validering feilet.` across both repair branches

## Minimal Safe Flow

1. Confirm `POST /employee`, conditional `GET /department`, conditional `POST /department`, conditional `GET /division`, and `GET /employee/employment` in `./openapi.json`
2. Build the first employee payload with:
   - requested identity fields
   - explicit `userType`
   - nested `employments: [{ "startDate": "YYYY-MM-DD" }]` if the prompt includes start date
3. `POST /employee`
4. If that write fails with `422` where `validationMessages[].field == "department.id"`, resolve department in one decisive read:
   - `GET /department?isInactive=false&count=1&fields=*`
   - if an active department exists, reuse its `id`
   - if none exists and department is clearly required, `POST /department` with a minimal name and reuse the returned `id`
5. Retry `POST /employee` with `department: { "id": ... }`
6. If that write fails with `422` where `validationMessages[].field == "employments.division.id"`, resolve one division:
   - `GET /division?count=1&fields=*`
   - retry `POST /employee` with `division: { "id": ... }` inside the same nested employment row
7. Verify from the successful write response what it actually returns
8. If the response does not clearly prove the employment start date, do one decisive verification read:
   - `GET /employee/employment?employeeId=<newId>&fields=*`
9. Stop once requested employee fields and start date are confirmed

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

## Exact-Match Fast Path

- If the prompt only asks to create one employee and gives name, birth date, email, and start date, use this flow:
  1. `POST /employee` with:
     - `firstName`
     - `lastName`
     - `dateOfBirth` in ISO format
     - `email`
     - `userType: "NO_ACCESS"`
     - `employments: [{ "startDate": "YYYY-MM-DD" }]`
  2. if the write fails with `422` where `validationMessages[].field == "department.id"`, do `GET /department?isInactive=false&count=1&fields=*`
  3. if that department read returns no active department and department is clearly required, `POST /department` with a minimal name-only payload
  4. retry `POST /employee` with `department: { "id": ... }`
  5. if the write then fails with `422` where `validationMessages[].field == "employments.division.id"`, do `GET /division?count=1&fields=*` and retry once with `division: { "id": ... }` inside the employment row
  6. Inspect `response.value`
  7. If `response.value.employments` does not already include the actual `startDate`, do one decisive `GET /employee/employment?employeeId=<newId>&fields=*`
- When step `1` succeeds directly in a fresh account, treat step `7` as the normal minimum safe second call for a start-date-scored task; do not try to save it unless the write response unexpectedly already contains the real `startDate`
- Do not add a pre-read on `/employee` for a pure create task
- Do not add any extra employee, department, or division reads beyond validation-driven repair branches and the conditional employment verification read

## Why `NO_ACCESS`

- Use `NO_ACCESS` as the default when the prompt only asks to create the employee and does not ask for login access
- This satisfies the required field without adding unnecessary system access side effects

## Verification Trap

- Do not assume `POST /employee` echoes all writable fields back
- A successful create response may show `email` and `dateOfBirth` but still echo `userType: null`
- A successful create response may include `employments`, but only as references such as `{ "id": ..., "url": ... }` without `startDate`
- If start date is scored, verify it via `/employee/employment` using the returned employee id

## Avoidable Mistakes

- Do not omit `userType`
- Do not assume department is optional just because the schema has no `required` list
- Do not default to `GET /department` before the first create attempt for an exact create-only task; that can waste a call on accounts that accept the write directly
- Do not let the persistent sandbox's `6`-call repair branch trick you into paying `GET /department` or `GET /division` up front in fresh-account production runs
- Do not assume `division` is never needed just because older sandbox runs accepted employments without it
- Do not branch on `422 message == "Validering feilet."` or on `Feltet må fylles ut.` alone; inspect `validationMessages[].field` before spending department/division repair calls
- Do not jump straight to `POST /employee/employment` before first trying nested `employments` on create
- Do not spend extra reads on employee lookup for a pure create task
- Do not treat `response.value.userType === null` as proof that the create failed or that `NO_ACCESS` was rejected
- Do not skip the employment verification read just because `response.value.employments` is non-empty
- Do not treat a one-call `POST /employee` stop as the trusted minimum path for a start-date-scored task unless the write response actually echoes the requested `startDate`
