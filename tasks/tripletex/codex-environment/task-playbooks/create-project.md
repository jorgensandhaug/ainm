# Create Project

## Scope

Use for tasks like:
- create one project
- link it to an existing customer
- set an existing employee as project manager
- prompt identifies the customer by organization number and/or name
- prompt identifies the project manager by email and/or name

## Verified Findings

Sandbox verification on 2026-03-19 showed:
- `POST /project` fails with `422` if `startDate` is omitted, with validation message `startDate: Feltet må fylles ut.`
- `projectManager.id` is validated for project-manager access; a normal employee can still fail with `projectManager.id: Oppgitt prosjektleder har ikke fått tilgang som prosjektleder i kontoen`
- `GET /employee?email=...` uses a containing filter, so do exact-match filtering locally on the returned email
- `GET /employee?email=...&assignableProjectManagers=true&fields=*` successfully finds an eligible manager when the employee really is assignable
- the successful `POST /project` response already contained `name`, `startDate`, `customer.id`, and `projectManager.id`, so no follow-up `GET` was needed for verification

Sandbox verification on 2026-03-20 additionally showed:
- when the prompt omits `startDate`, using the run date as `startDate` succeeds on `POST /project`
- the exact task shape with existing customer-by-organization-number plus existing manager-by-email still needs only two reads and one write

## Minimal Safe Flow

1. Confirm `GET /customer`, `GET /employee`, and `POST /project` in `./openapi.json`
2. Resolve the customer with one decisive read
   - usually `GET /customer?organizationNumber=...&count=10&fields=*`
   - if the prompt also gives the customer name, exact-match that locally too
3. Resolve the project manager with one decisive read
   - `GET /employee?email=<email>&assignableProjectManagers=true&count=10&fields=*`
   - exact-match the email locally because the API filter is containing, not exact
   - if the prompt also gives the manager name, use it only as a local tie-breaker
4. `POST /project` with:
   - `name`
   - `startDate`
   - `customer: { "id": ... }`
   - `projectManager: { "id": ... }`
5. Verify directly from `response.value`
6. Stop if the response already proves the linked customer and manager

## Recommended Payload Shape

Use ISO date for `startDate`.
- if the prompt omits `startDate`, default it to the run date instead of omitting the field

```json
{
  "name": "Implementation Ridgepoint",
  "startDate": "2026-03-19",
  "customer": { "id": 12345 },
  "projectManager": { "id": 67890 }
}
```

## Manager Resolution Trap

- Do not blindly search `/employee` by email and use the first hit
- Do not assume any existing employee can be assigned as project manager
- Prefer `assignableProjectManagers=true` on the lookup itself
- Because `email` is a containing search, compare returned `employee.email` to the prompt email exactly in your script before reusing the id
- If plain email search finds an employee but the assignable-manager search does not, do not `POST /project` with that employee id unless the prompt explicitly indicates you must first enable or change project-manager access

## Verification Shape

- Expect `201 Created`
- Expect a wrapper of shape `{"value": {...}}`
- The write response can already prove:
  - project `id`
  - `name`
  - `startDate`
  - `customer.id`
  - `projectManager.id`
- Reuse that response instead of doing `GET /project` unless the response unexpectedly omits a scored field

## Avoidable Mistakes

- Do not omit `startDate` just because `openapi.json` does not clearly mark it required
- Do not treat a missing prompt date as permission to skip `startDate`; default it to the run date
- Do not fall back from `assignableProjectManagers=true` to a plain employee hit and then try the write blindly
- Do not spend a verification read if the `POST /project` response already proves the requested links
