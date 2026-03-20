# Task

Reflect on the production run that created project `Analyse Sjøbris`, audit call efficiency, verify the canonical sandbox path for the same task shape, update the project-creation guidance, commit only the learning-doc changes, and record the result here.

# Reflection

What went well:
- The initial task classification was correct: exact `create-project` trusted-standard shape.
- The winning write payload was correct: `name`, `startDate`, `customer.id`, `projectManager.id`.
- The production run finished successfully without any Tripletex `4xx`.

What went poorly:
- The first production script treated prompt manager name as a hard requirement instead of a tie-breaker.
- That created a false negative after the manager lookup even though the API path itself was correct.
- The rerun repeated both prerequisite reads.

Correct approach:
- Follow the trusted standard literally: exact-match `organizationNumber` and exact-match `email`.
- Use prompt customer/manager names only to break ties when multiple exact hits remain.
- If one exact email hit already exists from the filtered manager read, reuse that id and continue to `POST /project`.

# Call Efficiency

The production run was not minimal-call.

Used path:
1. `GET /customer?organizationNumber=883693329&count=10&fields=*`
2. `GET /employee?email=steinar.berge@example.org&assignableProjectManagers=true&count=10&fields=*`
3. Abort in local script because of overly strict name match
4. Repeat `GET /customer?organizationNumber=883693329&count=10&fields=*`
5. Repeat `GET /employee?email=steinar.berge@example.org&assignableProjectManagers=true&count=10&fields=*`
6. `POST /project`

Wasted calls:
- The first customer read.
- The first manager read.

Exact lower-call path the next agent should follow:
1. `GET /customer?organizationNumber=<orgnr>&count=10&fields=*`
2. `GET /employee?email=<email>&assignableProjectManagers=true&count=10&fields=*`
3. `POST /project` with `name`, `startDate`, `customer: { id }`, `projectManager: { id }`

For this exact task shape, minimal realistic call count is 3. No verification `GET /project` is needed when the write response already proves `name`, `startDate`, `customer.id`, and `projectManager.id`.

# Root Causes

- I did not follow the existing trusted-standard wording strictly enough; it already said prompt names are tie-breakers, not hard requirements.
- I overfit local selection logic to both email and name instead of honoring exact-email uniqueness.
- The first script did not preserve successful prerequisite lookup data after the false-negative abort, so recovery required repeated reads.

# Sandbox Verification

I used only the provided sandbox credentials and a TypeScript script in the run scripts directory.

Sandbox investigation outcome:
- Broad customer seed read found customer `Reflection Smoke Test AS` with organization number `999888777`.
- Broad assignable-manager seed read found manager id `18441996` with email `simen.sandhaug@gmail.com`.
- Exact filtered customer read `GET /customer?organizationNumber=999888777&count=10&fields=*` returned `4` exact-organization-number hits.
- Exact filtered manager read `GET /employee?email=simen.sandhaug%40gmail.com&assignableProjectManagers=true&count=10&fields=*` returned `1` exact-email hit.
- `POST /project` with `startDate=2026-03-20` succeeded and returned project id `401960569`.

What this proved:
- The canonical production path is still `GET customer by org`, `GET assignable manager by email`, `POST project`.
- Customer name is legitimately useful as a tie-breaker when multiple exact organization-number hits exist.
- Manager name must not be a hard gate once one exact email hit already exists.

# Playbook Changes

Updated existing files:
- `AGENTS.md`
- `trusted-standards/create-project.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/create-project.md`

What changed:
- Clarified that prompt `customer.name` and manager name are tie-breakers only.
- Added explicit guidance to reuse a single exact `organizationNumber` hit or single exact `email` hit without requiring display-name equality.
- Added an explicit avoidable-mistake note to prevent false negatives and repeated reads in create-project flows.

No new trusted standard or playbook was created.

# Commit

Commit hash: `9e0b8e41b8217548ef50308cc5c054c126a0c380`

Commit message: `tripletex playbook: tighten create-project matching guidance`

# Reusable Heuristics

- In Tripletex filtered search flows, treat exact prompt identifiers like `organizationNumber` and `email` as the primary keys; treat names as secondary disambiguators.
- Do not escalate prompt display-name mismatches into extra API reads when one exact identifier hit already exists.
- For create-project tasks, default omitted `startDate` to the run date.
- Trust the successful `POST /project` response for final verification unless a scored field is missing.
- When a local filter rejects a lookup result, inspect whether the rejection rule is stricter than the trusted standard before rerunning any reads.