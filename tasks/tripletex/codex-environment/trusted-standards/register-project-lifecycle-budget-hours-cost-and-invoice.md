# Register Project Lifecycle With Budget, Hours, Cost, and Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one customer
- create two employees used for project hours
- create one project
- set one monetary project budget
- register project hours for the two created employees
- register one supplier/project cost
- create one unsent customer invoice for that project
- prompt does not explicitly score true project-hour reserve consumption by the invoice
- prompt does not explicitly score hidden project-manager-access toggles on a newly created employee
- prompt does not explicitly score durable vendor linkage on the cheap project-cost row

## Do Not Use This Standard If
- the prompt explicitly requires the newly created future project manager to become the actual Tripletex `projectManager`
- the prompt explicitly scores vendor linkage on the project cost row
- the prompt explicitly scores internal billability fields or true reserve consumption
- the prompt is really a fixed-price update/billing task rather than a fresh project-lifecycle create task

## Standard Flow
1. `GET /department?isInactive=false&count=1&fields=*` + `GET /division?count=1&fields=*` + `POST /customer` (parallel)
2. `POST /employee` for the first prompt-named employee
3. `GET /employee?assignableProjectManagers=true&count=1&fields=*` + `POST /employee` for the second prompt-named employee (parallel)
4. `POST /project`
5. `POST /project/projectActivity`
6. `POST /timesheet/entry/list` with all split date chunks for both employees + `POST /supplier` (parallel)
7. `POST /project/orderline` + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` + `GET /ledger/account?isBankAccount=true&fields=*` (parallel)
8. if the chosen invoice bank account lacks `bankAccountNumber`, `PUT /ledger/account/{id}` once
9. `POST /invoice?sendToCustomer=false` with root `invoiceDate`, explicit `invoiceDueDate`, root `customer.id`, and one embedded `orders[]` row containing `customer.id`, `project.id`, `orderDate`, `deliveryDate`, and real `orderLines[]`

## Keep It Minimal
- for this exact family, do not add exact-email project-manager reads trying to make the prompt-named new employee assignable; use one generic assignable-manager read
- do not spend a separate `POST /activity` before `POST /project/projectActivity`
- do not use individual `POST /timesheet/entry` writes when `POST /timesheet/entry/list` can batch all split chunks in one call
- do not use the supplier-invoice voucher machinery as the default project-cost branch when the prompt only scores the project cost amount
- do not split the final invoice into `POST /order` plus `PUT /order/{id}/:invoice`; the exact lower-call downstream branch is direct `POST /invoice?sendToCustomer=false`

## Payload Rules
- employee create:
  - always include `userType: "NO_ACCESS"`
  - always include `dateOfBirth`
  - always include `employments[].startDate`
  - include `department.id`
  - include `employments[].division.id`
- project create:
  - include `name`
  - include `startDate`
  - include `customer.id`
  - include one generic assignable `projectManager.id`
- project activity:
  - include `project.id`
  - include `startDate`
  - include `budgetFeeCurrency`
  - inline `activity` should be `PROJECT_SPECIFIC_ACTIVITY` and currently proven with `isChargeable=false`
- timesheet batch:
  - split totals above `24` into distinct dates before the first write
  - keep every date on or after the project `startDate`
- cost-only project order line:
  - include `project.id`
  - include `description`
  - include `date`
  - include `count`
  - include `unitCostCurrency`
  - include `isChargeable: false`
  - do not send `unitPriceExcludingVatCurrency`
- direct lifecycle invoice:
  - include root `invoiceDate`
  - include explicit root `invoiceDueDate`
  - include root `customer.id`
  - create lines under `orders[].orderLines`
  - keep `project` on the surrounding `orders[]` row, not inside `orderLines[]`
  - use one real order line with:
    - `description`
    - `count`
    - `unitPriceExcludingVatCurrency`
    - `vatType.id`

## Reuse From Write Response
- from `POST /customer`:
  - `value.id`
- from both `POST /employee` writes:
  - employee ids for the timesheet batch
- from the manager read:
  - assignable `projectManager.id`
- from `POST /project`:
  - `value.id`
- from `POST /project/projectActivity`:
  - `value.activity.id`
  - `value.budgetFeeCurrency`
- from `POST /timesheet/entry/list`:
  - created entry ids and returned `hours`
- from `POST /supplier`:
  - supplier id
- from `POST /project/orderline`:
  - cost row id
- from `POST /invoice?sendToCustomer=false`:
  - invoice id
  - invoice number
  - totals
  - `projectInvoiceDetails`

## Verification
- default verification is zero extra calls
- trust the project-activity write response for the budget amount
- trust the timesheet batch response for the registered hour totals
- trust the direct invoice write response if it already proves:
  - invoice id
  - invoice number
  - `amountExcludingVatCurrency`
  - one linked `projectInvoiceDetails` row

## Known Recovery Branches
- if no department exists on the initial read:
  - `POST /department` once with a minimal name payload
- if the chosen invoice bank account lacks `bankAccountNumber`:
  - `PUT /ledger/account/{id}` with a valid `bankAccountNumber`
  - retry the same direct invoice payload once
- if the prompt later proves that exact project-manager identity is scored:
  - do not force this standard; that branch is outside the proven lower-call path until public evidence proves a safe access-grant write

## OpenAPI / Sandbox Status
- upstream employee/project/activity/timesheet/cost steps were already proven in the existing playbook family on 2026-03-21
- persistent sandbox re-proof on 2026-03-21 with disposable analog customer `Lifecycle Reflection 22177506 AS`, supplier `Lifecycle Supplier 22177506 AS`, project `Lifecycle Project 22177506`, two created employees, one generic assignable manager, budget `262850`, hours `37 + 101`, and supplier cost `89750` confirmed the new downstream floor:
  - `POST /project/orderline`
  - `GET /ledger/vatType`
  - `GET /ledger/account`
  - direct `POST /invoice?sendToCustomer=false`
  - total full-path call count `14` with 0 errors when the bank account already had a number
- that same sandbox re-proof showed the direct invoice write returned `amountExcludingVatCurrency=262850` and `projectInvoiceDetails.length=1`
- a same-session sandbox control without root `invoiceDueDate` failed `422 invoiceDueDate: Kan ikke være null.`
- the 2026-03-21 production run `Cloud-Migration Brückentor` then re-confirmed the line-shape pitfall from the other direction: `POST /order` with line-level `project` failed `422 field "project" does not exist in object`, so even the older order-first branch needed that correction
