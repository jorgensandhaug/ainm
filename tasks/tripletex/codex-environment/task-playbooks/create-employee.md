# Create Employee

## Scope

Use for tasks like:
- create one new employee
- prompt provides identity fields such as name, birth date, email, and start date
- no salary, leave, login-role assignment, or update/delete flow is requested

## Verified Findings

Sandbox verification showed:
- `POST /employee` fails with `422` if `userType` is omitted
- `POST /employee` fails with `422` if `department.id` is omitted in accounts where department is required
- `POST /employee` accepts nested `employments: [{ "startDate": "YYYY-MM-DD" }]`
- the employee create response may still omit `userType` and nested employment fields even when creation succeeded
- `GET /employee/employment?employeeId=...&fields=*` confirmed the requested start date after create

Observed validation messages:
- missing `userType`: `Brukertype kan ikke være "0" eller tom.`
- missing `department.id`: `Feltet må fylles ut.`

## Minimal Safe Flow

1. Confirm `POST /employee`, `GET /department`, optional `POST /department`, and `GET /employee/employment` in `./openapi.json`
2. Resolve department before employee creation
   - `GET /department?isInactive=false&count=1&fields=*`
   - if an active department exists, reuse its `id`
   - if none exists and a department is required, `POST /department` with a minimal name and reuse the returned `id`
3. Build the employee payload with:
   - requested identity fields
   - explicit `userType`
   - `department: { "id": ... }`
   - nested `employments: [{ "startDate": "YYYY-MM-DD" }]` if the prompt includes start date
4. `POST /employee`
5. Verify from the write response what it actually returns
6. If the response does not clearly prove the employment start date, do one decisive verification read:
   - `GET /employee/employment?employeeId=<newId>&fields=*`
7. Stop once requested employee fields and start date are confirmed

## Recommended Payload Shape

Use ISO dates.

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

## Why `NO_ACCESS`

- Use `NO_ACCESS` as the default when the prompt only asks to create the employee and does not ask for login access
- This satisfies the required field without adding unnecessary system access side effects

## Verification Trap

- Do not assume `POST /employee` echoes all writable fields back
- A successful create response may show `email` and `dateOfBirth` but still omit `userType` and nested `employments`
- If start date is scored, verify it via `/employee/employment` using the returned employee id

## Avoidable Mistakes

- Do not omit `userType`
- Do not assume department is optional just because the schema has no `required` list
- Do not jump straight to `POST /employee/employment` before first trying nested `employments` on create
- Do not spend extra reads on employee lookup for a pure create task
