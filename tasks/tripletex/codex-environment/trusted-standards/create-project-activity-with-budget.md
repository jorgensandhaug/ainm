# Create Project Activity With Budget

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one project-specific activity on an already-resolved project
- set budget on that same project activity
- prompt or upstream flow already gives the target project id
- task does not explicitly score internal billability semantics on the activity itself

## Do Not Use This Standard If
- the task needs multiple activities
- the task explicitly requires a reusable global `/activity` catalog item first
- the task explicitly scores `isChargeable=true` or another unproven chargeability field on the created activity
- the project itself is not yet resolved

## Standard Flow
1. `POST /project/projectActivity`
2. verify directly from the write response
3. stop

## Keep It Minimal
- do not `POST /activity` first for this exact shape
- do not add `GET /project/projectActivity` or `GET /activity` verification reads when the write response already proves the created project activity
- the current proven one-call branch is the inline activity payload on `/project/projectActivity`

## Payload Rules
- include:
  - `project: { "id": ... }`
  - `startDate`
  - `activity`
- include `budgetHours` and/or `budgetFeeCurrency` when the prompt scores them
- the currently proven inline `activity` shape is:
  - `name`
  - `activityType: "PROJECT_SPECIFIC_ACTIVITY"`
  - `isChargeable: false`
- CRITICAL: `isChargeable` must be inside the `activity` object, NOT on the projectActivity root; placing it on the root causes `422 isChargeable: Feltet eksisterer ikke i objektet.`

## Recommended Payload Shape

```json
{
  "project": { "id": 54321 },
  "startDate": "2026-07-10",
  "budgetHours": 143,
  "budgetFeeCurrency": 331100,
  "activity": {
    "name": "Prosjektarbeid",
    "activityType": "PROJECT_SPECIFIC_ACTIVITY",
    "isChargeable": false
  }
}
```

## Reuse From Write Response
- `value.id`
- `value.project.id`
- `value.activity.id`
- `value.budgetHours`
- `value.budgetFeeCurrency`

## Verification
- default verification is zero extra calls
- trust the write response if it already proves:
  - project-activity id
  - linked project id
  - activity id or name
  - `budgetHours`
  - `budgetFeeCurrency`

## OpenAPI / Sandbox Status
- `/project/projectActivity` `POST` is present in `./openapi.json`
- persistent sandbox follow-up on `2026-03-21` proved the one-call branch:
  - `POST /project/projectActivity` with inline `activity`
  - `budgetHours`
  - `budgetFeeCurrency`
- that follow-up showed no need for a separate `POST /activity` before the project-activity write
