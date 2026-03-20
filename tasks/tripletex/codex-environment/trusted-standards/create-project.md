# Create Project

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one project
- prompt provides project name and basic fields directly
- any required customer or project manager is already clearly known or resolvable in one read each
- no invoicing in the same task

## Do Not Use This Standard If
- fixed-price billing/invoice workflow is part of the task
- project manager eligibility is unclear
- task is update/delete/search-heavy

## Standard Flow
1. resolve customer if needed with one decisive `GET /customer?...&fields=*`
2. resolve project manager only if needed with one decisive `GET /employee?...assignableProjectManagers=true&fields=*`
3. `POST /project`
4. verify directly from write response
5. stop

## Payload Rules
- usually include:
  - `name`
  - `startDate`
  - `customer: { "id": ... }` if customer is part of task
  - `projectManager: { "id": ... }` if manager is part of task
- include `startDate` when prompt gives or implies it
- prefer assignable project managers, not any arbitrary employee

## Reuse From Write Response
- `value.id`
- `value.customer.id`
- `value.projectManager.id`
- fixed-price fields if present

## Verification
- default verification is zero extra calls
- trust the write response if it already proves the scored fields

## Known Recovery Branches
- if project-manager assignment is validated strictly, resolve with `assignableProjectManagers=true`

## OpenAPI / Sandbox Status
- `/project` verified in `./openapi.json`
- required `startDate` and manager-eligibility gotchas proven in existing playbooks
