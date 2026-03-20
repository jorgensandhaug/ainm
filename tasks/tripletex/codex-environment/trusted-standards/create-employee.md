# Create Employee

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one employee
- prompt directly provides employee identity/contact fields
- no payroll run in the same task
- no complex multi-employee workflow

## Do Not Use This Standard If
- payroll setup/run is part of the task
- prompt requires repairing an existing employee
- department/accounting state is unclear and prompt depends on it

## Standard Flow
1. if department is clearly required by account/task, resolve department in one decisive `GET`
2. `POST /employee`
3. if scored fields are fully proven by write response, stop
4. if employment start date is scored but response is sparse, do one decisive `GET /employee/employment?employeeId=...&fields=*`

## Payload Rules
- send only prompt-required employee fields
- if department functionality is enabled or required, include department reference
- if prompt/task requires a user type/role field, include explicit `userType`
- do not invent personal data not given by prompt

## Reuse From Write Response
- `value.id`
- returned employee identity fields
- returned employment link ids if present

## Verification
- zero extra calls if write response already proves scored state
- one employment read only when start-date/employment coverage is actually scored and missing from response

## Known Recovery Branches
- department may be required if department functionality is enabled
- write response may echo sparse employment data only

## OpenAPI / Sandbox Status
- `/employee` verified in `./openapi.json`
- sparse-employment and department gotchas documented from prior verified runs
