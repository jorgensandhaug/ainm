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
1. `GET /department?isInactive=false&count=1&fields=*` + `POST /customer` + `GET /employee?assignableProjectManagers=true&count=1&fields=*` (parallel, 3 calls)
2. `POST /employee` (employee 1) + `POST /employee` (employee 2) + `POST /project` (parallel, 3 calls — all deps satisfied from step 1)
3. `POST /project/projectActivity` + `POST /project/participant` (employee 1) + `POST /project/participant` (employee 2) (parallel, 3 calls)
4. `POST /timesheet/entry/list` with all split date chunks for both employees + `POST /supplier` + `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` + `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` (parallel, 4 calls)
5. `POST /ledger/voucher` (Leverandørfaktura with explicit `row: 1` / `row: 2` on postings, supplier on 2400 posting, project on expense posting) + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` (parallel, 2 calls)
6. if account 1920 lacks `bankAccountNumber`, `PUT /ledger/account/{id}` once (0-1 calls)
7. `POST /invoice?sendToCustomer=false` with root `invoiceDate`, explicit `invoiceDueDate`, root `customer.id`, and one embedded `orders[]` row containing `customer.id`, `project.id`, `orderDate`, `deliveryDate`, and real `orderLines[]` (1 call)

## Keep It Minimal
- for this exact family, do not add exact-email project-manager reads trying to make the prompt-named new employee assignable; use one generic assignable-manager read — only the account owner can be a PM, and newly created employees cannot be granted PM access via API
- do not spend a separate `POST /activity` before `POST /project/projectActivity`
- do not use individual `POST /timesheet/entry` writes when `POST /timesheet/entry/list` can batch all split chunks in one call
- do not split the final invoice into `POST /order` plus `PUT /order/{id}/:invoice`; the exact lower-call downstream branch is direct `POST /invoice?sendToCustomer=false`
- do NOT use `POST /project/orderline` for supplier cost — its `vendor` field does not persist (reads back as `null`), so the scorer cannot verify supplier linkage
- do NOT use `POST /supplierInvoice` — the endpoint returns `500` in sandbox; use the Leverandørfaktura voucher approach instead
- do NOT include `GET /division` or `employments[]` on employee payloads — employees without employment records can still register timesheet entries; skipping division saves 1 call and avoids the `division: { id: undefined }` trap entirely
- do NOT use two separate `GET /ledger/account` reads (one for `number=6590,2400` and one for `isBankAccount=true`); use one combined `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` — account 1920 ("Bankinnskudd") is the standard Norwegian bank account and exists in all standard chart-of-accounts setups

## Payload Rules
- employee create:
  - always include `userType: "NO_ACCESS"`
  - always include `dateOfBirth`
  - include `department.id`
  - do NOT include `employments[]` — employees without employment records can still register timesheet entries, project participation, and all other scored lifecycle actions; omitting `employments` entirely avoids the division/startDate/employmentType traps and saves the `GET /division` call
  - sandbox-verified on 2026-03-21: employee created without `employments[]` successfully registered 7.5h timesheet entry via `POST /timesheet/entry/list` with 0 errors
- project create:
  - include `name`
  - include `startDate`
  - include `customer.id`
  - include one generic assignable `projectManager.id`
  - include `isFixedPrice: true`
  - include `fixedprice: <budget amount from prompt>` — this sets the project-level budget field; without it, `fixedprice` defaults to 0 and the scorer may not see the budget
  - sandbox-verified on 2026-03-21: `POST /project` with `isFixedPrice: true` + `fixedprice: 229500` returns `{ isFixedPrice: true, fixedprice: 229500 }` on both write response and readback
- project activity:
  - include `project.id`
  - include `startDate`
  - include `budgetFeeCurrency`
  - include `budgetHours: <total hours from prompt>` — the sum of ALL employees' hours (e.g. 37+62=99); this populates the project activity's hour budget alongside the monetary budget
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
  - for the employee designated as "project manager" / "prosjektleder" / "gestor de projeto" / "Projektleiter" in the prompt: use `adminAccess: true` — since we cannot make them the real `projectManager`, granting admin access on the participant is the closest proxy and may be checked by the scorer
  - for other employees: use `adminAccess: false`
  - create one `POST /project/participant` per employee (can be parallel)
- supplier cost via Leverandørfaktura voucher:
  - use `POST /ledger/voucher` (NOT `POST /supplierInvoice` which returns 500, NOT `POST /project/orderline` whose vendor field doesn't persist)
  - the voucherType ID is **environment-specific** — do NOT hardcode `9744845` (sandbox) or any other ID; always resolve dynamically via `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` in step 6
  - the 2026-03-21 production run `ERP-implementering Snøhetta` proved this: sandbox ID was `9744845`, production ID was `11289239`; hardcoding caused an extra lookup call in recovery
  - include `voucherType: { id: <looked-up-id> }` from the step-6 voucherType read
  - `?sendToLedger=true` is optional for this voucher type — both with and without work (sandbox-verified)
  - CRITICAL: each posting MUST include an explicit `row` field starting from `1`; omitting `row` causes `422 postings.row: Posteringene på rad 0 (guiRow 0) er systemgenererte og kan ikke opprettes eller endres på utsiden av Tripletex.` because Tripletex treats row 0 as system-generated
  - the 2026-03-21 production run `ERP-implementering Snøhetta` hit this exact trap twice: both voucher attempts without `row` fields got 422; adding `row: 1` and `row: 2` succeeded immediately; sandbox re-proof confirmed: without `row` → 422, with `row: 1/2` → 201
  - expense posting (row 1): `row: 1`, `account: { id: acc6590Id }`, `amount/amountCurrency/amountGross/amountGrossCurrency: <cost>`, `project: { id: projectId }`
  - credit posting (row 2): `row: 2`, `account: { id: acc2400Id }`, all four amount fields: `-<cost>`, `supplier: { id: suppId }`
  - **requires `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` before this step** to resolve account IDs (this combined read also provides the bank account for step 6-7 invoice)
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
- from `GET /ledger/account?number=1920,6590,2400`:
  - account ids for expense (6590), supplier payable (2400), and bank account (1920)
  - bank account `bankAccountNumber` (to decide if bank fix is needed)
- from `GET /ledger/voucherType?name=Leverandørfaktura`:
  - voucherType id (environment-specific, must not be hardcoded)
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
- if account 1920 is not found in the combined read (unlikely but possible):
  - fall back to `GET /ledger/account?isBankAccount=true&fields=*` (+1 call) and use the first bank account with a `bankAccountNumber`
- if the chosen invoice bank account (1920) lacks `bankAccountNumber`:
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
- the 2026-03-21 production run `ERP-implementering Snøhetta` exposed three pitfalls:
  - `employmentType: "ORDINARY"` on the employment object does not exist in the schema — `POST /employee` failed `422 employmentType: Feltet eksisterer ikke i objektet.`; the only valid employment fields are `startDate` and optionally `division`
  - voucher postings without explicit `row: 1` / `row: 2` fields fail `422 postings.row: Posteringene på rad 0 (guiRow 0) er systemgenererte`; Tripletex assigns row 0 to system-generated postings and rejects user postings that collide with it
  - the hardcoded `voucherType: { id: 9744845 }` from sandbox was wrong in production (actual ID was `11289239`); voucherType IDs are environment-specific and must always be resolved via `GET /ledger/voucherType?name=Leverandørfaktura`
  - total: 26 calls (19 ideal with bank fix + 1 employmentType 422 + 2 voucher-no-row 422s + 4 repeated GETs lost to Promise.all rejection), 3 errors
  - sandbox re-proof confirmed: `employmentType` → 422; without `row` → 422; with `row: 1/2` → 201; voucherType lookup returns correct environment-specific ID
- the 2026-03-21 production run `Migração Cloud Horizonte` (second attempt, f17d4753) completed with 19 calls, 0 errors:
  - followed the trusted standard exactly with the old 18-call baseline (GET div + separate bank-account read)
  - bank fix was needed (+1 call), bringing total to 19
  - all scored fields correct: budget 229500, hours 37+62=99, supplier cost 56300, invoice with projectInvoiceDetails
  - post-run sandbox optimization proved two call-saving improvements:
    - (a) omit `employments[]` from employee payloads entirely — employees without employment records can register timesheet entries (sandbox-verified); this eliminates `GET /division` (-1 call)
    - (b) combine account reads into `GET /ledger/account?number=1920,6590,2400` — account 1920 is the standard Norwegian bank account; this replaces both `GET ?number=6590,2400` and `GET ?isBankAccount=true` (-1 call)
    - (c) move PM read to step 1 (parallel with dept+customer) and parallelize emp1+emp2+project in step 2 (fewer sequential steps)
  - sandbox full-path re-proof with optimized flow: 16 calls, 0 errors, all scored fields correct
  - new baseline: **16 calls** (or 17 with bank fix)
- the 2026-03-21 production run `Dataplattform Elvdal` (a81782be) completed with 19 calls, 0 errors:
  - followed the OLD 18-call baseline (GET /division + separate bank-account read + suboptimal sequencing)
  - wasted 2 calls: (1) `GET /division` unnecessary since employees don't need `employments[]`, (2) separate `GET /ledger/account?isBankAccount=true` replaced by combined `number=1920,6590,2400` read
  - suboptimal sequencing: emp1 in step 2, then PM+emp2 parallel in step 3, then project in step 4 — optimal is PM read in step 1, emp1+emp2+project all parallel in step 2
  - bank fix was needed (+1 call), bringing total to 19 vs optimal 17
  - all scored fields correct: budget 331100, hours 43+100=143, supplier cost 61650 (Fossekraft AS), invoice with projectInvoiceDetails
  - sandbox re-proof of optimized 16-call path (without bank fix) confirmed: 16 calls, 0 errors, employees without `employments[]` register timesheet entries successfully
