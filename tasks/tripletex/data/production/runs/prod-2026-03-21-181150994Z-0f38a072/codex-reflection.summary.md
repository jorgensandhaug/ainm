# Post-Run Reflection: Cloud Migration Northwave

## Task

Execute the complete project lifecycle for "Cloud Migration Northwave" (Northwave Ltd, org no. 932075482):
1. Create customer, two employees, and project with budget 396900 NOK
2. Log time: Samuel Brown 74 hours, Sarah Lewis 85 hours
3. Register supplier cost of 56750 NOK from Clearwater Ltd (org no. 889264985)
4. Create a customer invoice for the project

This was an exact match for the trusted standard `register-project-lifecycle-budget-hours-cost-and-invoice.md`.

## Reflection

**What went well:**
- Correctly identified the task as an exact trusted-standard match and went straight to script writing
- All prerequisite reads (department, division) and conditional logic (division omission, bank account fix) were handled correctly
- UTC-safe date arithmetic was used correctly for timesheet splitting
- Both `name` and `activityType` were correctly included on the inline activity object
- The full lifecycle completed successfully in 2 scripts with only 1 error

**What went poorly:**
- Placed `isChargeable: false` on the `POST /project/projectActivity` root instead of inside the nested `activity` object
- This caused a `422 isChargeable: Feltet eksisterer ikke i objektet.` error, wasting 1 API call
- Required a recovery script (02-resume.ts) to continue from step 5

**Why the mistake happened:**
- The trusted standard line "include `isChargeable: false` on the activity" was ambiguous — "on the activity" could be read as "on the project activity" (the root object) rather than "inside the `activity` object"
- The recommended payload shape in the playbook showed the correct placement, but the agent relied on the trusted standard's terse instruction instead of cross-referencing the playbook's example payload

## Call Efficiency

**Was the run minimal-call?** No. 1 wasted call.

| Metric | Value |
|--------|-------|
| Total API calls | 16 |
| Successful calls | 15 |
| Wasted calls | 1 (422 on POST /project/projectActivity) |
| Ideal calls | 15 (14 standard + 1 bank fix) |
| Error count | 1 |

**Wasted call breakdown:**
1. `POST /project/projectActivity` with `isChargeable: false` on root → 422 (should have been inside `activity` object)

**Ideal 15-call path (with bank fix):**
1. `GET /department?isInactive=false&count=1&fields=*` (parallel)
2. `GET /division?count=1&fields=*` (parallel)
3. `POST /customer` (parallel)
4. `POST /employee` (Samuel Brown)
5. `GET /employee?assignableProjectManagers=true&count=1&fields=*` (parallel)
6. `POST /employee` (Sarah Lewis, parallel)
7. `POST /project`
8. `POST /project/projectActivity` with `activity: { ..., isChargeable: false }`
9. `POST /timesheet/entry/list` (parallel)
10. `POST /supplier` (parallel)
11. `POST /project/orderline` (parallel)
12. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` (parallel)
13. `GET /ledger/account?isBankAccount=true&fields=*` (parallel)
14. `PUT /ledger/account/{id}` (bank fix — conditional)
15. `POST /invoice?sendToCustomer=false`

## Root Causes

1. **Ambiguous trusted standard wording**: The instruction "include `isChargeable: false` on the activity" did not specify "inside the `activity` object" vs "on the projectActivity root". The agent interpreted "on the activity" as the project activity level, not the nested activity object.

2. **No cross-reference to payload example**: The playbook's recommended payload shape (lines 182-195) clearly showed `isChargeable` inside the `activity` object, but the agent relied solely on the trusted standard's terse rules.

## Sandbox Verification

Sandbox re-proof on 2026-03-21 confirmed:
- **TEST A**: `isChargeable: false` on projectActivity root → `422 isChargeable: Feltet eksisterer ikke i objektet.`
- **TEST B**: `isChargeable: false` inside `activity` object → `201` (correct)
- **TEST C**: `isChargeable` omitted entirely → `201` (defaults to undefined/false)

Full 15-call lifecycle path (14 + bank fix) completed with 0 errors in sandbox, confirming the corrected approach.

## Playbook Changes

**Updated existing trusted standard** `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`:
- Clarified line 62 from "include `isChargeable: false` on the activity" to "include `isChargeable: false` inside the `activity` object (NOT on the projectActivity root); placing `isChargeable` on the projectActivity root causes `422 isChargeable: Feltet eksisterer ikke i objektet.`"
- Added production run finding for `Cloud Migration Northwave` to OpenAPI / Sandbox Status section

**Updated existing trusted standard** `./trusted-standards/create-project-activity-with-budget.md`:
- Added CRITICAL warning: "`isChargeable` must be inside the `activity` object, NOT on the projectActivity root"

**Updated existing playbook** `./task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md`:
- Added production run finding for `Cloud Migration Northwave` to Verified Findings section
- Added avoidable mistake entry about `isChargeable` placement

## Commit

- **Hash**: `8566794f`
- **Message**: `tripletex playbook: register-project-lifecycle — clarify isChargeable must be inside activity object, not projectActivity root`
- **Files changed**: 3 (2 trusted standards + 1 playbook)

## Reusable Heuristics

1. **`isChargeable` placement on `POST /project/projectActivity`**: Must be inside the nested `activity: { ..., isChargeable: false }` object. Placing it on the projectActivity root causes `422`. This is a recurring pattern — the Tripletex API projectActivity schema does not have `isChargeable`; the field belongs to the activity schema.

2. **When a trusted standard instruction is ambiguous about nesting level**: Cross-reference the recommended payload shape in the playbook before writing the script. The payload examples are unambiguous about field placement.

3. **Pattern for this lifecycle task family**: The `POST /project/projectActivity` payload has two distinct schema levels — the projectActivity root (accepts `project`, `startDate`, `budgetFeeCurrency`, `budgetHours`) and the nested `activity` object (accepts `name`, `activityType`, `isChargeable`). Never mix fields between these levels.

4. **Recovery cost of parallel batches**: When a step fails mid-flow but other parallel calls in the same batch succeeded (e.g., supplier created in parallel with a failed timesheet), the recovery script must skip re-creating already-created resources. Track which parallel calls succeeded before the error.
