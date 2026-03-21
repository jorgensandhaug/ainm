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
- register one supplier/project cost linked to the named supplier
- create one unsent customer invoice for that project
- add both employees as project participants

## Do Not Use This Standard If
- the prompt explicitly scores internal billability fields or true reserve consumption
- the prompt is really a fixed-price update/billing task rather than a fresh project-lifecycle create task

## Standard Flow
1. `GET /department?isInactive=false&count=1&fields=*` + `GET /division?count=1&fields=*` + `POST /customer` (parallel)
2. `POST /employee` for the first prompt-named employee
3. `GET /employee?assignableProjectManagers=true&count=1&fields=*` + `POST /employee` for the second prompt-named employee (parallel)
4. `POST /project`
5. `POST /project/projectActivity` + `POST /project/participant` (employee 1) + `POST /project/participant` (employee 2) (parallel)
6. `POST /timesheet/entry/list` with all split date chunks for both employees + `POST /supplier` + `GET /ledger/account?number=6590,2400&fields=id,number,name` (parallel)
7. `POST /ledger/voucher` (Leverandørfaktura with supplier on 2400 posting, project on expense posting) + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` + `GET /ledger/account?isBankAccount=true&fields=*` (parallel)
8. if the chosen invoice bank account lacks `bankAccountNumber`, `PUT /ledger/account/{id}` once
9. `POST /invoice?sendToCustomer=false` with root `invoiceDate`, explicit `invoiceDueDate`, root `customer.id`, and one embedded `orders[]` row containing `customer.id`, `project.id`, `orderDate`, `deliveryDate`, and real `orderLines[]`

## Keep It Minimal
- for this exact family, do not add exact-email project-manager reads trying to make the prompt-named new employee assignable; use one generic assignable-manager read — only the account owner can be a PM, and newly created employees cannot be granted PM access via API
- do not spend a separate `POST /activity` before `POST /project/projectActivity`
- do not use individual `POST /timesheet/entry` writes when `POST /timesheet/entry/list` can batch all split chunks in one call
- do not split the final invoice into `POST /order` plus `PUT /order/{id}/:invoice`; the exact lower-call downstream branch is direct `POST /invoice?sendToCustomer=false`
- do NOT use `POST /project/orderline` for supplier cost — its `vendor` field does not persist (reads back as `null`), so the scorer cannot verify supplier linkage
- do NOT use `POST /supplierInvoice` — the endpoint returns `500` in sandbox; use the Leverandørfaktura voucher approach instead

## Payload Rules
- employee create:
  - always include `userType: "NO_ACCESS"`
  - always include `dateOfBirth`
  - always include `employments[].startDate`
  - include `department.id`
  - include `employments[].division.id` only when `GET /division` returned a usable row; if the division read returned an empty array, omit `division` entirely from the employment object — sending `division: { id: undefined }` causes `422 employments.division.name: Feltet kan ikke være tomt.` because Tripletex interprets the presence of the `division` key as an attempt to create a new division
  - the 2026-03-21 production run `Cloud-Migration Eichenhof` hit this exact trap: `GET /division?count=1&fields=*` returned an empty array, the script unconditionally included `division: { id: undefined }`, and the first `POST /employee` failed with `422`
- project create:
  - include `name`
  - include `startDate`
  - include `customer.id`
  - include one generic assignable `projectManager.id`
- project activity:
  - include `project.id`
  - include `startDate`
  - include `budgetFeeCurrency`
  - inline `activity` requires both `name` (e.g. `"Prosjektaktivitet"`) and `activityType: "PROJECT_SPECIFIC_ACTIVITY"`; omitting either causes `422`
  - include `isChargeable: false` inside the `activity` object (NOT on the projectActivity root); placing `isChargeable` on the projectActivity root causes `422 isChargeable: Feltet eksisterer ikke i objektet.`
- timesheet batch:
  - split totals above `24` into distinct dates before the first write
  - keep every date on or after the project `startDate`
  - CRITICAL: use UTC-safe date arithmetic for splitting; `new Date(dateStr + "T00:00:00")` creates a local-time Date, and `.toISOString().slice(0, 10)` converts to UTC, which shifts dates back by 1 day in CET/CEST timezones — use `new Date(Date.UTC(y, m-1, d))` instead
  - the 2026-03-21 production run `ERP-implementering Havbris` hit this exact trap: the `splitHours` function used local-time Date construction, causing the first timesheet date to be `2026-03-20` (1 day before project startDate), which failed `422 Startdato for prosjektet ... Det kan ikke registreres timer før denne datoen.`
- project participant (add both employees as project members):
  - include `project: { id: projectId }`
  - include `employee: { id: employeeId }`
  - include `adminAccess: false`
  - create one `POST /project/participant` per employee (can be parallel)
- supplier cost via Leverandørfaktura voucher:
  - use `POST /ledger/voucher` (NOT `POST /supplierInvoice` which returns 500, NOT `POST /project/orderline` whose vendor field doesn't persist)
  - include `voucherType: { id: 9744845 }` (Leverandørfaktura)
  - `?sendToLedger=true` is optional for this voucher type — both with and without work (sandbox-verified)
  - expense posting (row 1): `account: { id: acc6590Id }`, `amount/amountCurrency/amountGross/amountGrossCurrency: <cost>`, `project: { id: projectId }`
  - credit posting (row 2): `account: { id: acc2400Id }`, all four amount fields: `-<cost>`, `supplier: { id: suppId }`
  - **requires `GET /ledger/account?number=6590,2400&fields=id,number,name` before this step** to resolve account IDs
  - sandbox-verified: supplier persists on 2400 posting, project persists on 6590 posting
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
- from `POST /project/participant`:
  - participant ids (for verification only)
- from `POST /supplier`:
  - supplier id
- from `GET /ledger/account?number=6590,2400`:
  - account ids for expense (6590) and supplier payable (2400)
- from `POST /ledger/voucher` (Leverandørfaktura):
  - voucher id (supplier cost with project linkage)
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
- if no division exists on the initial read:
  - omit `division` from all `employments[]` objects; do not send `division: { id: undefined }` or `division: null`
- if the chosen invoice bank account lacks `bankAccountNumber`:
  - `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` (known MOD11-valid Norwegian account number)
  - do not use arbitrary 11-digit numbers; `"12345678901"` fails `422 bankAccountNumber: Dette er ikke et gyldig norsk kontonummer` because Norwegian bank account numbers require a valid MOD11 check digit
  - retry the same direct invoice payload once
- project manager constraint: only the account owner (the single employee returned by `GET /employee?assignableProjectManagers=true`) can be set as `projectManager` on a project; newly created employees (NO_ACCESS or STANDARD) cannot be made assignable via API — `PUT /project` to change PM to a non-assignable employee returns `422 Oppgitt prosjektleder har ikke fått tilgang som prosjektleder i kontoen`
- to work around PM constraint: use the generic assignable manager as `projectManager`, but add the prompt-named PM employee as a project participant via `POST /project/participant`

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
- the 2026-03-21 production run `Cloud-Migration Eichenhof` exposed two additional pitfalls:
  - `GET /division?count=1&fields=*` can return an empty array in some production accounts; unconditionally including `division: { id: undefined }` on the employee payload caused `422 employments.division.name: Feltet kan ikke være tomt.` and wasted the first `POST /employee` call
  - using `bankAccountNumber: "12345678901"` on the bank-account repair step failed `422 bankAccountNumber: Dette er ikke et gyldig norsk kontonummer`; the correct known-valid value is `"12345678903"` (MOD11-valid)
  - the run also hit a transient `409` on `POST /timesheet/entry/list` during its second script execution despite all entries having unique (employee, date, activity, project) tuples; the same batch succeeded on immediate retry, suggesting a transient server-side conflict rather than a payload shape error
  - same-day persistent-sandbox re-proof confirmed the full 14-call path succeeds when division is conditionally omitted and bank-account repair uses `"12345678903"`
- the 2026-03-21 production run `Migração Cloud Horizonte` exposed a project-activity payload trap:
  - agent sent `name: "PROJECT_SPECIFIC_ACTIVITY"` without `activityType` — got `422 activity.activityType: Kan ikke være null.`; resume added both `name` + `activityType` — `201`
  - sandbox re-proof: `activityType` alone → `422 name`; `name` alone → `422 activityType`; both → `201`
  - total: 16 calls (15 ideal + 1 wasted 422); full 14-call path re-proven in sandbox with 0 errors
- the 2026-03-21 production run `ERP-implementering Havbris` exposed a JavaScript timezone pitfall in date splitting:
  - the `splitHours` function used `new Date(start + "T00:00:00")` (local time) then `.toISOString().slice(0, 10)` (UTC), shifting dates back 1 day in CET/CEST
  - `POST /timesheet/entry/list` failed `422` because the first entry date was `2026-03-20` (before project startDate `2026-03-21`)
  - the fix: use `Date.UTC()` for date construction, e.g. `new Date(Date.UTC(y, m-1, d + offset))` then `.toISOString().slice(0, 10)`
  - the recovery script reran steps 6-9 with correct UTC dates, but also re-created the supplier (already created in the failed parallel batch), wasting 1 extra call
  - total: 17 calls (15 ideal with bank fix + 1 wasted 422 + 1 duplicate supplier), 1 error
  - sandbox re-proof confirmed the full 14-call path with UTC-safe date splitting succeeds with 0 errors
- the 2026-03-21 production run `Cloud Migration Northwave` exposed an `isChargeable` placement trap on `POST /project/projectActivity`:
  - agent placed `isChargeable: false` on the projectActivity root instead of inside the nested `activity` object
  - got `422 isChargeable: Feltet eksisterer ikke i objektet.` — the field does not exist on the projectActivity schema, only on the activity schema
  - the resume script moved `isChargeable: false` inside `activity: { name: ..., activityType: ..., isChargeable: false }` and succeeded
  - total: 16 calls (15 ideal with bank fix + 1 wasted 422), 1 error
  - sandbox re-proof confirmed: `isChargeable` on projectActivity root → 422; inside `activity` object → 201; omitted entirely → 201 (defaults to undefined/false)
  - the trusted standard line "include `isChargeable: false` on the activity" was ambiguous — clarified to explicitly state "inside the `activity` object (NOT on the projectActivity root)"
