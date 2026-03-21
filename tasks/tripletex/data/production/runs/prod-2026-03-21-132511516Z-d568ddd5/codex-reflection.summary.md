# 1. Task

Reflect the failed production run for the German lifecycle prompt `Cloud-Migration Brückentor`, prove the best public API path in persistent sandbox, update the Tripletex learning artifacts, commit those doc changes, and write the final summary.

# 2. Reflection

The run got most prerequisite modeling right. It created the customer, supplier, employees, project, project activity, timesheet batch, and project cost without hitting the earlier known lifecycle traps around `department.id`, `division.id`, `userType`, or batched hours.

What went poorly was the downstream invoice path and the manager-resolution strategy. The script spent three extra reads trying to preserve `Lukas Hoffmann` as the actual Tripletex project manager even though this task family already had a lower-call generic-manager branch and no proven public way to make a newly created employee assignable as project manager. Then it stayed on the older order-first invoice branch and failed `POST /order` because `project` was placed on the nested line object instead of only on the surrounding order object. That `422` was avoidable.

The deeper mistake was that the lifecycle playbook had become stale. It still documented `POST /order` -> `PUT /order/:invoice` as the downstream invoice branch and did not state two critical facts clearly enough for this family: direct `POST /invoice?sendToCustomer=false` is lower-call, and that branch needs explicit `invoiceDueDate`.

Correct approach for the next agent: create the prompt-named employees for hour registration, resolve one generic assignable project manager in one read, keep the cheap cost-only `POST /project/orderline` branch, then invoice directly with one `POST /invoice?sendToCustomer=false` carrying root `invoiceDate`, explicit `invoiceDueDate`, root `customer.id`, and one embedded `orders[]` row with `project.id`.

# 3. Call Efficiency

The production run was not minimal-call.

Wasted or avoidable calls:

- `GET /employee?email=lukas.hoffmann@example.org&assignableProjectManagers=true...`
- `GET /employee?email=lukas.hoffmann@example.org...`
- `GET /employee?email=tobias.meyer@example.org...`
- the extra order write in the old downstream branch (`POST /order`) instead of direct `POST /invoice`
- one avoidable `422` on that `POST /order` because line-level `project` is invalid

Realistic lower-call replacement for the same exact task shape:

1. `GET /department?isInactive=false&count=1&fields=*` + `GET /division?count=1&fields=*` + `POST /customer`
2. `POST /employee` for first prompt-named employee
3. `GET /employee?assignableProjectManagers=true&count=1&fields=*` + `POST /employee` for second prompt-named employee
4. `POST /project`
5. `POST /project/projectActivity`
6. `POST /timesheet/entry/list` + `POST /supplier`
7. `POST /project/orderline` + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` + `GET /ledger/account?isBankAccount=true&fields=*`
8. conditional `PUT /ledger/account/{id}` only if bank account number is missing
9. `POST /invoice?sendToCustomer=false`

That is a proven `14`-call floor with 0 errors when the bank account already exists, or `15` with one bank-account repair write. Compared with the original production script shape, the next agent should save `4` calls and remove the avoidable `422`.

# 4. Root Causes

- The lifecycle playbook still pointed at the older order-first invoice branch, so the agent never looked for the direct-invoice reduction.
- The run treated prompt role text (`Projektleiter`) as a reason to spend exact-email manager reads, even though the public API still does not prove a cheap way to make a newly created employee assignable as project manager.
- The script mixed valid project placement at order level with invalid project placement at line level.
- The docs did not explicitly warn that direct lifecycle invoicing needs root `invoiceDueDate`, so this lower-call branch had not yet been captured as trusted guidance.

# 5. Sandbox Verification

Used only the provided persistent sandbox credentials and placed all API scripts in:

- `/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-132511516Z-d568ddd5/scripts`

Key sandbox proofs:

- Created a disposable lifecycle analog with unique customer, supplier, project, two created employees, one generic assignable manager, budget `262850`, hours `37 + 101`, and supplier cost `89750`.
- Re-proved the upstream lifecycle setup branch with batched timesheets and cheap cost-only `POST /project/orderline`.
- First direct-invoice attempt failed in exactly one call with `422 invoiceDueDate: Kan ikke være null.`
- Second direct-invoice attempt added explicit root `invoiceDueDate` and succeeded in exactly one call.
- Full-path direct-invoice proof completed in `14` total calls with 0 errors and returned:
  - `amountExcludingVatCurrency=262850`
  - one `projectInvoiceDetails` row
  - created invoice id `2147592248`
  - created invoice number `204`
- A control run with the older fallback still showed that `POST /order` -> `PUT /order/:invoice` works, but it is one call above the proven floor and therefore no longer the preferred downstream branch.

# 6. Playbook Changes

Updated existing docs and created one new trusted standard.

Changed paths:

- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md`

What changed:

- added a new trusted standard for the exact lifecycle task family
- reduced the lifecycle invoice branch from order-first to direct `POST /invoice?sendToCustomer=false`
- documented that root `invoiceDueDate` is mandatory on this direct branch
- documented that `project` belongs on the surrounding `order` / `orders[]` object, not on nested `orderLines[]`
- tightened the manager-resolution rule so future agents do not waste exact-email reads on prompt-named newly created employees when a generic assignable manager is enough

# 7. Commit

- Commit hash: `4d1a65b0ba4df73e96c363a2b2ff8dc65ef1f4e1`
- Commit message: `tripletex playbook: cut lifecycle invoice path to one write`

# 8. Reusable Heuristics

- For fresh lifecycle tasks that create employees, do not assume the newly created future project manager can become Tripletex `projectManager`; use one generic assignable-manager read unless the prompt explicitly scores exact manager identity.
- For this lifecycle family, direct `POST /invoice?sendToCustomer=false` beats `POST /order` -> `PUT /order/:invoice` by one call.
- On that direct lifecycle-invoice branch, root `invoiceDueDate` is mandatory even when the prompt does not mention due date.
- Keep `project` on the embedded `order` / `orders[]` object, never on nested `orderLines[]`.
- Keep the cheap non-chargeable `POST /project/orderline` branch for project costs when the prompt scores amount, not durable vendor linkage.
- Keep batched timesheet creation; it is still the major call-count reducer for multi-day hour totals.
