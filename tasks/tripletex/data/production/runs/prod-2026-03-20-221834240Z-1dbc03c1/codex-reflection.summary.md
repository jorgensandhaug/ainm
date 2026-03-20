## 1. Task
Reflect the scored run that created project `Integração Porto` for customer `Porto Alegre Lda` (`884811686`) with project manager `Lucas Silva` (`lucas.silva@example.org`), audit call efficiency, verify the path in persistent sandbox, and update the learning system if needed.

## 2. Reflection
The production run itself was correct and efficient. It used the exact trusted-standard path: resolve customer by `organizationNumber`, resolve assignable manager by `email`, then `POST /project` with `startDate=2026-03-20`.

What went well:
- The task was recognized as an exact create-project trusted-standard match.
- The run skipped unnecessary `openapi.json` re-checking.
- The write response was reused for verification, so there was no wasted follow-up `GET /project`.

What went poorly:
- Nothing in the scored flow. The only risk worth auditing was whether a hidden 2-call shortcut existed.

Correct approach:
- Keep the canonical 3-call flow for this exact task shape.
- Always send `startDate`, defaulting to run date when omitted.
- Resolve both related object ids before `POST /project`.

## 3. Call Efficiency
The scored run was minimal-call.

Used calls:
1. `GET /customer?organizationNumber=884811686&count=10&fields=*`
2. `GET /employee?email=lucas.silva@example.org&assignableProjectManagers=true&count=10&fields=*`
3. `POST /project`

Wasted calls:
- None.

Lower-call path for the next agent:
- There is no safe lower-call path proven for this exact shape.
- Use the same 3-call path above.

Why no 2-call path:
- `POST /project` still needs a real linked `customer.id`.
- `projectManager` still needs a real assignable manager id.
- Prompt names are tie-breakers only, not safe id substitutes.

## 4. Root Causes
The only meaningful failure mode here is false optimization:
- Assuming nested `customer { name, organizationNumber }` on `POST /project` would link the existing customer.
- Assuming manager `email` or name fields could replace `projectManager.id`.
- Assuming a `201` response proves the customer link exists without checking `response.value.customer`.

## 5. Sandbox Verification
Exact-path proof in persistent sandbox succeeded:
- Discovery picked customer `Codex Payment Probe 752963` (`889752963`, id `108162307`) and assignable manager `simen.sandhaug@gmail.com` (id `18441996`).
- Exact path succeeded with:
  - `GET /customer?organizationNumber=889752963&count=10&fields=*`
  - `GET /employee?email=simen.sandhaug@gmail.com&assignableProjectManagers=true&count=10&fields=*`
  - `POST /project`
- Created sandbox project id: `401974801`.

Shortcut probes:
- `POST /project` with nested `customer { name, organizationNumber }` plus valid `projectManager.id` returned `201`, but `response.value.customer` was `null`. That branch is unsafe.
- `POST /project` with `projectManager { email }` returned `422` requiring `projectManager.firstName` and `projectManager.lastName`.
- `POST /project` with `projectManager { firstName, lastName, email }` still returned `422` with `Feltet "Prosjektleder" må fylles ut.`

Conclusion:
- Customer read cannot be skipped safely.
- Manager read cannot be skipped safely.
- The 3-call path remains the minimum safe path.

## 6. Playbook Changes
No new file-content changes were needed in this pass.

Verified existing learning artifacts already reflected the correct path:
- `./AGENTS.md`
- `./trusted-standards/common-endpoints.md`
- `./trusted-standards/create-project.md`
- `./task-playbooks/create-project.md`

Result:
- No trusted standard or playbook was newly created.
- No additional trusted-standard or playbook content change was required after verification.

## 7. Commit
Commit hash: `4c65fae`
Commit message: `tripletex playbook: confirm create-project 3-call path`

This was an empty verification commit because the relevant docs already matched the verified result.

## 8. Reusable Heuristics
- For exact create-project tasks identified by existing customer `organizationNumber` plus existing manager `email`, default to `GET /customer` -> `GET /employee?assignableProjectManagers=true` -> `POST /project`.
- Treat prompt `customer.name` and manager name as local tie-breakers only after exact `organizationNumber` / exact `email` filtering.
- Never omit `startDate` on `POST /project`; if absent in the prompt, use the run date.
- Do not trust a `201` alone on `POST /project`; check that `response.value.customer.id` and `response.value.projectManager.id` are actually populated before concluding the shortcut worked.
- Do not spend extra verification reads when the `POST /project` response already proves `name`, `startDate`, `customer.id`, and `projectManager.id`.
