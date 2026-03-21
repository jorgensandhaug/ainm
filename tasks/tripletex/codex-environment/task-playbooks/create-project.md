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

Persistent sandbox re-verification on 2026-03-20 additionally showed:
- `POST /project` with nested `customer { name, organizationNumber }` plus a valid `projectManager.id` can still return `201` while leaving `customer=null`; that is not a valid shortcut
- `POST /project` with nested manager details but without `projectManager.id` still fails validation, so the manager read cannot be skipped safely
- the exact create-project shape therefore still has no safe `2`-call branch; the minimal safe path remains `GET /customer` -> `GET /employee?assignableProjectManagers=true` -> `POST /project`

Persistent sandbox follow-up on 2026-03-21 additionally showed:
- a freshly created employee is not automatically assignable as project manager
- `POST /project` with that new employee id failed with `projectManager.id: Oppgitt prosjektleder har ikke fått tilgang som prosjektleder i kontoen`
- if a broader project-lifecycle prompt requires a newly created employee to be the manager, do not treat that as an exact match for this simple create-project playbook unless corpus evidence already proves the public access-grant path

Production verification on 2026-03-20 additionally showed:
- the Portuguese prompt shape `create project + customer org number + manager email + omitted startDate` succeeded with the same 3-call path
- the original run did not waste any API calls
- the Portuguese production run `Análise Porto` / `Porto Alegre Lda` / `996943305` / `lucas.oliveira@example.org` also stayed on the same 3-call path; the Unicode `á` in the project name did not justify any extra resolver or verification read
- the Norwegian prompt shape `project name + customer name + customer org number + manager name + manager email + omitted startDate` also succeeded with the same 3-call path for `Havbris AS` / `999148387` / `henrik.degard@example.org`
- in that Norwegian production proof, the manager prompt name used `Ø` while the email local-part used ASCII `degard`; the exact-email match from the filtered employee read was still sufficient, so no extra name-based disambiguation read was needed
- the French prompt shape `project name + customer name + customer org number + manager name + manager email + omitted startDate` also succeeded with the same 3-call path for `Migration Lumière` / `Lumière SARL` / `849572458` / `nathan.dubois@example.org`
- in that French production proof, the Unicode `è` in both project and customer names did not justify any extra resolver read once the exact `organizationNumber` hit and exact `email` hit were already found
- second French production run on 2026-03-21 for `Implémentation Montagne` / `Montagne SARL` / `842138248` / `jules.martin@example.org` also succeeded with the same 3-call path; `é` in project name handled without extra reads
- Nynorsk production run on 2026-03-21 for `Oppgradering Fjelltopp` / `Fjelltopp AS` / `826557990` / `torbjrn.stlsvik@example.org` also succeeded with the same 3-call path; Nynorsk prompt language (`Prosjektleiar`, `knytt til`) did not change the flow
- third French production run on 2026-03-21 for `Implémentation Colline` / `Colline SARL` / `869753017` / `ines.dubois@example.org` also succeeded with the same 3-call path; 10 consecutive optimal runs across en/pt/es/nb/nn/fr confirm the standard is stable and language-independent
- second Nynorsk production run on 2026-03-21 for `Migrasjon Vestfjord` / `Vestfjord AS` / `887727872` / `liv.stlsvik@example.org` also succeeded with the same 3-call path; 12 consecutive optimal runs across en/pt/es/nb/nn/fr/de confirm the standard is fully language-independent

## Minimal Safe Flow

1. Confirm `GET /customer`, `GET /employee`, and `POST /project` in `./openapi.json`
2. Resolve the customer with one decisive read
   - usually `GET /customer?organizationNumber=...&count=10&fields=*`
   - if the prompt also gives the customer name, use it only as a local tie-breaker when multiple exact-`organizationNumber` hits remain
3. Resolve the project manager with one decisive read
   - `GET /employee?email=<email>&assignableProjectManagers=true&count=10&fields=*`
   - exact-match the email locally because the API filter is containing, not exact
   - if the prompt also gives the manager name, use it only as a local tie-breaker when multiple exact-email hits remain
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
- Do not assume a just-created employee can be assigned as project manager
- Prefer `assignableProjectManagers=true` on the lookup itself
- Because `email` is a containing search, compare returned `employee.email` to the prompt email exactly in your script before reusing the id
- Do not treat Unicode-versus-ASCII spelling differences between the prompt name and the email local-part as a mismatch that requires more reads; once the filtered result leaves one exact email hit, reuse it
- If the filtered manager read already yields one exact-email hit, do not reject it just because the returned display name differs from the prompt name or is missing in the response
- If plain email search finds an employee but the assignable-manager search does not, do not `POST /project` with that employee id unless the prompt explicitly indicates you must first enable or change project-manager access
- If the employee was created earlier in the same run and still does not appear in the assignable-manager read, do not guess a hidden entitlement write; stop treating the task as an exact create-project match and switch to a broader playbook or corpus-guided branch

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
- Do not try to save one call by sending nested customer details on `POST /project`; that branch can return `201` and still leave the project unlinked from the customer
- Do not try to save one call by sending manager name/email fields without `projectManager.id`; current sandbox proof still rejects that branch, and a manager-email-only write failed specifically with `422 projectManager.firstName: Kan ikke være null.` plus `projectManager.lastName: Kan ikke være null.`
- Do not spend pre-write `./openapi.json` re-checking when the trusted standard already matches this exact task shape
- Do not make prompt `customer.name` or manager name a hard requirement once one exact `organizationNumber` or exact `email` hit already exists; that only creates avoidable false negatives and repeat reads
- Do not spend a verification read if the `POST /project` response already proves the requested links
