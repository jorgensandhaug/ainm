# Register Project Lifecycle With Budget, Hours, Cost, and Invoice

## Scope

Use for tasks like:
- create the customer, employees, and project
- set a project budget
- register project hours
- register one supplier/project cost
- create an unsent customer invoice for the project

Do not use for:
- prompts that explicitly score true project-hour reserve consumption by the invoice
- **CRITICAL**: prompts that give project name + customer org + PM email + fixed price + milestone % WITHOUT mentioning employees to create, hours to register, or supplier costs — use `set-project-fixed-price-and-invoice-partial-payment` instead; the 2026-03-21 run for `Brückentor GmbH / E-Commerce-Entwicklung` scored **0.5/4** because the agent used this lifecycle standard instead of the fixed-price update standard

## CRITICAL CHECKLIST — 4 Fields That MUST Be Set (All 4 Have Caused Scoring Failures)

1. **`isFixedPrice: true` + `fixedprice: <budget>`** on POST /project — without this, project.fixedprice=0 and Check 3 fails
2. **`budgetHours: <total>`** on POST /project/projectActivity — without this, activity.budgetHours=0 and Check 4 fails
3. **`POST /project/orderline`** with `unitCostCurrency: <supplier-cost>` — the Leverandorfaktura voucher alone does NOT populate project-level cost tracking; BOTH orderline AND voucher are needed. Without orderline, Check 5 fails
4. **`adminAccess: true`** on project participant for the prompt-named project manager — since NO_ACCESS employees cannot be set as projectManager, add them as participant with admin access instead. Without this, the PM check fails

Each of these has caused scoring failures in ALL 11 production attempts. They are worth ~4/11 raw points combined.

## Verified Findings

Persistent-sandbox follow-up on 2026-03-21 showed:
- `POST /project/projectActivity` can create the inline project-specific activity and set both `budgetHours` and `budgetFeeCurrency` in one write
- for that exact branch, a separate `POST /activity` before `POST /project/projectActivity` is wasted
- `POST /timesheet/entry` still has the hard per-entry ceiling `projectChargeableHours <= 24`
- the same employee + project + activity + date tuple still allows only one time-entry write, so totals above `24` must be pre-split across dates
- `POST /timesheet/entry/list` accepts an array of timesheet entries for multiple employees and dates in one call, returning `{ values: [...] }` with all created entries; this replaces N individual `POST /timesheet/entry` calls with 1 batch call
- persistent sandbox re-proof on 2026-03-21 confirmed `POST /timesheet/entry/list` with 9 entries (2 employees, mixed hours across 9 dates) succeeded in 1 call and returned all 9 entries with correct `hours` values
- `POST /project/orderline` with a non-chargeable cost-only payload and `unitCostCurrency` increases project costs directly
- the same sandbox proof showed `GET /project/{id}/period/overallStatus?...` moving from `costs=61650` to `123300` and then `184950` after repeated identical cost-only project-orderline writes
- sending `unitPriceExcludingVatCurrency` on that non-chargeable cost line fails with `422 unitPriceExcludingVatCurrency: Ordrelinjen er ikke fakturerbar.`
- sending `vendor: { "id": ... }` on that cheap cost branch was accepted but later read back as `vendor=null`
- the supplier-invoice voucher path (`POST /ledger/voucher/importDocument` -> `PUT /ledger/voucher/{id}`) can create a supplier invoice while the later project-orderline read still shows `project=null`, so it is not the default project-cost branch for this task family
- a freshly created employee was not automatically assignable as project manager in persistent sandbox; `POST /project` failed with `projectManager.id: Oppgitt prosjektleder har ikke fått tilgang som prosjektleder i kontoen`
- `GET /employee?assignableProjectManagers=true` therefore remains a real gate, not just a convenience filter
- the ordinary invoice branch still worked with `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` -> `POST /order` -> `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`
- persistent sandbox re-proof on 2026-03-21 then reduced that invoice branch one step further for this exact lifecycle family: after the same upstream setup, direct `POST /invoice?sendToCustomer=false` with root `invoiceDate`, explicit `invoiceDueDate`, root `customer.id`, and one embedded `orders[]` row with `customer.id`, `project.id`, `orderDate`, `deliveryDate`, and real `orderLines[]` succeeded in 1 call and returned `projectInvoiceDetails.length == 1`
- that same re-proof showed `invoiceDueDate` is mandatory on the direct lifecycle-invoice branch; omitting it failed with `422 invoiceDueDate: Kan ikke være null.`
- the 2026-03-21 production run for `Cloud-Migration Brückentor` exposed a separate shape trap: `project` is valid on the surrounding `order`/`orders[]` object, but not on the nested `orderLines[]`; sending line-level `project` failed `422 field \"project\" does not exist in object`
- timesheet entries must have dates on or after the project `startDate`; entries before the project start fail with `422 Startdato for prosjektet ... Det kan ikke registreres timer før denne datoen.`
- employee creation requires `department.id` in accounts with department functionality enabled; the 2026-03-21 production run for `System Upgrade Greenfield` hit `422 department.id: Feltet må fylles ut.` on the first `POST /employee` and timed out after failing to recover
- `POST /employee` may also require `employments[].division.id`; persistent sandbox on 2026-03-21 required both `department.id` and `division.id`
- however, subsequent sandbox re-proof on 2026-03-21 confirmed that employees created WITHOUT `employments[]` can still register timesheet entries, be added as project participants, and perform all scored lifecycle actions — this eliminates the `GET /division` call entirely and avoids the division/startDate/employmentType traps
- for this lifecycle task family, only `GET /department` is needed proactively (not `GET /division`)
- CRITICAL finding on 2026-03-21: the Leverandørfaktura voucher with project linkage on the 6590 posting does NOT populate `project.overallStatus.costs` — costs remain 0 even when voucher postings correctly reference the project; only `POST /project/orderline` with `unitCostCurrency` populates `overallStatus.costs`; therefore BOTH are needed: orderline for project-level cost tracking + voucher for accounting and supplier linkage
- `POST /supplierInvoice` has no POST method in the OpenAPI spec; it was removed or never existed; the endpoint returns 500 (without fields) or 422 (with unknown fields like `dueDate` or `paymentDueDate`); supplier invoices can only be created via document import — the Leverandørfaktura voucher is the correct alternative

Production run for `Dataplattform Elvdal` (a81782be) on 2026-03-21 completed with 0 errors but 2 wasted calls:
- the script used `GET /division` (+1 unnecessary call) and included `employments[]` on employee payloads — employees without employment records can still register timesheet entries and all scored actions; sandbox re-proof confirmed this
- the script used two separate `GET /ledger/account` reads: `number=6590,2400` for voucher accounts and `isBankAccount=true` for bank accounts (+1 unnecessary call) — a single combined `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` provides all three accounts in 1 call
- the script also had suboptimal sequencing: emp1 sequential (step 2), then emp2+PM parallel (step 3), then project sequential (step 4) — the PM read should be in step 1 (parallel with dept+customer), enabling both employees + project to be created in parallel in step 2
- the bank-account repair branch was triggered (acc 1920 had no bankAccountNumber), adding 1 conditional call
- total calls: 19 (17 optimal with bank fix + 1 wasted GET /division + 1 wasted separate bank-account GET); 0 errors
- sandbox re-proof confirmed the optimized 16-call path (without bank fix) with 0 errors: employees without `employments[]`, combined account read `number=1920,6590,2400`, and maximal step-2 parallelization (emp1+emp2+project)

Production run for `System Upgrade Greenfield` on 2026-03-21 scored `0/1` (timeout) because:
- the script did not include proactive `GET /department` before `POST /employee`
- `POST /employee` failed with `422 department.id: Feltet må fylles ut.`
- the agent spent too long reading documentation before writing the script, then failed to recover within the 300s budget
- the corrected script (with dept+div reads) was written but never ran successfully before timeout

Production run for `ERP Implementation Silveroak` on 2026-03-21 scored `0/1` (timeout) because:
- the script omitted `userType` from the `POST /employee` payload
- `POST /employee` failed with `422 Brukertype kan ikke være "0" eller tom.`
- only 3 API calls succeeded (GET department, GET division, POST customer) before the first employee write failed
- the agent was asked to continue but the follow-up pass started instead of the original run continuing within the 300s budget
- sandbox re-verification on 2026-03-21 confirmed the full lifecycle flow succeeds with `userType: "NO_ACCESS"` on both employee creates
- sandbox also confirmed that `employments[].startDate` is required when `employments[]` is included (for division linkage); omitting it fails with `422 employments.startDate: Kan ikke være null.`
- sandbox also required `dateOfBirth` on employee creation, though fresh production accounts may not; include a placeholder `"1985-01-15"` defensively

Production run for `Cloud-Migration Eichenhof` on 2026-03-21 was incomplete because:
- `GET /division?count=1&fields=*` returned an empty array (no divisions in the account)
- the script unconditionally included `division: { id: undefined }` in the employment payload
- `POST /employee` failed with `422 employments.division.name: Feltet kan ikke være tomt.` because Tripletex interprets the presence of the `division` key as an attempt to create a new division
- after recovery from the division error, `POST /timesheet/entry/list` returned a transient `409` but succeeded on immediate retry
- the bank-account repair step used `bankAccountNumber: "12345678901"` (not MOD11-valid) and failed `422`; the correct value is `"12345678903"`
- the invoice was never created because the agent stopped after the bank-account error
- total calls: 16 (13 success + 3 errors), task incomplete
- the correct path would have been 14-15 calls with 0 errors by: (a) conditionally omitting `division` when no division exists, (b) using `"12345678903"` for the bank-account repair

Production run for `ERP-implementering Havbris` on 2026-03-21 completed with 1 avoidable 422 and 1 duplicate call:
- the `splitHours` function used `new Date(start + "T00:00:00")` (local time) then `.toISOString().slice(0, 10)` (UTC), shifting all timesheet dates back by 1 day in CET/CEST timezone
- `POST /timesheet/entry/list` failed `422 Startdato for prosjektet ... Det kan ikke registreres timer før denne datoen.` because the first entry date was `2026-03-20` instead of `2026-03-21`
- the supplier POST ran in parallel and succeeded before the error was caught
- the recovery script (run2) re-created the supplier (duplicate) and re-ran timesheet with UTC-safe dates using `new Date(Date.UTC(y, m-1, d + offset))`
- total calls: 17 (15 ideal with bank fix + 1 wasted 422 + 1 duplicate supplier), 1 error
- the correct implementation: always use `Date.UTC()` for date construction in timesheet splitting
- sandbox re-proof confirmed the full 14-call path with UTC-safe dates succeeds with 0 errors

Production run for `Migração Cloud Horizonte` on 2026-03-21 completed with 1 avoidable 422:
- the agent sent `activity: { name: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false }` without `activityType` on `POST /project/projectActivity`
- got `422 activity.activityType: Kan ikke være null.`, wasting 1 call
- the resume script used both `name: "Prosjektaktivitet"` and `activityType: "PROJECT_SPECIFIC_ACTIVITY"` which succeeded
- the bank-account repair branch was also triggered (bank had no number), adding 1 conditional call
- total calls: 16 (15 base with bank repair + 1 wasted 422); ideal was 15
- sandbox re-proof confirmed both `name` and `activityType` are independently mandatory on the inline `activity` object

Production run for `Cloud Migration Northwave` on 2026-03-21 completed with 1 avoidable 422:
- the agent placed `isChargeable: false` on the `POST /project/projectActivity` root instead of inside the nested `activity` object
- got `422 isChargeable: Feltet eksisterer ikke i objektet.`, wasting 1 call
- the resume script moved `isChargeable` inside `activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false }` and succeeded
- the bank-account repair branch was also triggered (bank had no number), adding 1 conditional call
- total calls: 16 (15 base with bank repair + 1 wasted 422); ideal was 15
- sandbox re-proof confirmed: `isChargeable` on projectActivity root → 422; inside `activity` object → 201; omitted entirely → 201

Production run for `ERP-implementering Snøhetta` on 2026-03-21 completed with 3 avoidable 422s and 4 wasted repeat GETs:
- the script included `employmentType: "ORDINARY"` and `percentageOfFullTimeEquivalent: 100` on the employment object; `POST /employee` failed `422 employmentType: Feltet eksisterer ikke i objektet.`; the only valid employment fields are `startDate` and optionally `division`
- the script omitted `row: 1` / `row: 2` from voucher postings; `POST /ledger/voucher` failed twice with `422 postings.row: Posteringene på rad 0 (guiRow 0) er systemgenererte`; adding explicit `row` fields succeeded immediately
- the trusted standard hardcoded `voucherType: { id: 9744845 }` (sandbox); production had `voucherType id: 11289239`; this required an extra `GET /ledger/voucherType` lookup call
- when the voucher POST failed inside `Promise.all`, the parallel vatType and bank-account GETs completed but their results were lost; these had to be repeated in the next recovery script, wasting 4 GET calls across two failed batches
- the bank-account repair branch was triggered (bank had no number), adding 1 conditional call
- total calls: 26 (19 ideal with bank fix + 1 employmentType 422 + 2 voucher-no-row 422s + 4 repeated GETs lost to Promise.all rejection), 3 errors
- sandbox re-proof confirmed: `employmentType` → 422; without `row` → 422; with `row: 1/2` → 201; voucherType ID is environment-specific and must be looked up

Production run for `Migração Cloud Horizonte` (second attempt, f17d4753) on 2026-03-21 completed with 19 calls, 0 errors but scored only 4/11 (checks 3,4,5,7 failed):
- despite 0 API errors, 4 checks always failed across ALL 10+ task-29 attempts
- root cause analysis revealed the production script omitted 4 critical fields documented in the trusted standard:
  (a) `isFixedPrice: true` + `fixedprice: 229500` were NOT included on `POST /project`
  (b) `budgetHours: 99` was NOT included on `POST /project/projectActivity`
  (c) `adminAccess: true` was NOT set for the PM employee (Catarina) on `POST /project/participant` — both employees had `adminAccess: false`
  (d) `POST /project/orderline` with `unitCostCurrency: 56300` was NOT created — the Leverandørfaktura voucher alone does not populate `project.overallStatus.costs` (remains 0)
- sandbox investigation confirmed:
  - Leverandørfaktura voucher with project linkage on 6590 posting shows `overallStatus.costs: 0` — voucher does NOT populate project costs
  - adding `POST /project/orderline` with `unitCostCurrency: 56300` changes `overallStatus.costs` from 0 to 56300
  - both orderline + voucher are needed: orderline for project-level cost tracking, voucher for accounting + supplier linkage
- full lifecycle sandbox re-proof with all 4 fixes: 17 calls (16 base + 1 bank fix), 0 errors, all scored fields correct:
  - `project.isFixedPrice: true`, `project.fixedprice: 229500`
  - `projectActivity.budgetHours: 99`, `projectActivity.budgetFeeCurrency: 229500`
  - PM employee participant `adminAccess: true`
  - `overallStatus.costs: 56300` (from orderline), `overallStatus.income: 229500` (from invoice)
- new baseline: **17 calls** (16 base + 1 orderline, or 18 with bank fix)

## Minimal Safe Flow

The optimized path skips `GET /division` (employees work without `employments[]`), combines account reads, uses both orderline+voucher for supplier cost, and uses maximal parallelization:

1. `GET /department?isInactive=false&count=1&fields=*` + `POST /customer` + `GET /employee?assignableProjectManagers=true&count=1&fields=*` (parallel, 3 calls)
2. `POST /employee` (emp1) + `POST /employee` (emp2) + `POST /project` with `isFixedPrice: true` + `fixedprice: <budget>` (parallel, 3 calls — all deps from step 1)
3. `POST /project/projectActivity` with `budgetHours` + `budgetFeeCurrency` + `POST /project/participant` (PM emp with `adminAccess: true`) + `POST /project/participant` (other emp with `adminAccess: false`) (parallel, 3 calls)
4. `POST /timesheet/entry/list` + `POST /supplier` + `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` + `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` (parallel, 4 calls)
5. `POST /project/orderline` (non-chargeable cost with `unitCostCurrency`) + `POST /ledger/voucher` (Leverandørfaktura) + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*` (parallel, 3 calls)
6. (conditional) `PUT /ledger/account/{id}` if bank account 1920 needs `bankAccountNumber` fix (0 or 1 calls)
7. `POST /invoice?sendToCustomer=false` with root `invoiceDate`, explicit `invoiceDueDate`, root `customer.id`, and embedded `orders[]` row

Call count breakdown:
- 1 department read (parallel with customer + PM)
- 1 customer write (parallel with dept + PM)
- 1 assignable-manager read (parallel with dept + customer)
- 2 employee writes (parallel with project, step 2)
- 1 project write with `isFixedPrice: true` + `fixedprice` (parallel with employees, step 2)
- 1 project-activity write with `budgetHours` + `budgetFeeCurrency` (parallel with 2 participant writes)
- 2 project-participant writes (PM emp: `adminAccess: true`, other: `adminAccess: false`)
- 1 batch timesheet write (parallel with supplier + combined account read + voucherType read)
- 1 supplier write (parallel)
- 1 combined account read for 1920+6590+2400 (replaces two separate reads)
- 1 voucherType read (parallel)
- 1 project orderline write for cost tracking (parallel with voucher + VAT read)
- 1 Leverandørfaktura voucher write for supplier linkage (parallel with orderline + VAT read)
- 1 outgoing-VAT read (parallel with orderline + voucher)
- 0-1 bank-account fix
- 1 direct invoice write
- **total baseline: `17` calls, 0 errors** (or `18` with bank fix)

## Critical Rules — MUST-IMPLEMENT (previously omitted by agents, causing 4 check failures)

These 4 rules were documented but NOT implemented in 10+ production runs, causing checks 3,4,5,7 to always fail:

1. **Project isFixedPrice + fixedprice**: ALWAYS include `isFixedPrice: true` and `fixedprice: <budget amount>` on `POST /project`; without these, `fixedprice` defaults to 0 and the scorer cannot see the budget — this likely causes check 3 to fail
2. **budgetHours on projectActivity**: ALWAYS include `budgetHours: <total hours from prompt>` (sum of ALL employees' hours, e.g. 37+62=99) on the `POST /project/projectActivity` payload alongside `budgetFeeCurrency` — this likely causes check 4 to fail
3. **PM employee adminAccess**: for the employee designated as "project manager" / "prosjektleder" / "gestor de projeto" in the prompt, use `adminAccess: true` on their `POST /project/participant`; the other employee gets `adminAccess: false` — this likely causes check 5 to fail
4. **Project orderline for supplier cost tracking**: ALWAYS create `POST /project/orderline` with `unitCostCurrency: <supplier cost>` and `isChargeable: false` IN ADDITION to the Leverandørfaktura voucher; the voucher alone does NOT populate `project.overallStatus.costs` (stays at 0); the orderline is needed for project-level cost visibility — this likely causes check 7 to fail

## Critical Rules — Standard

- **Employee userType**: always include `userType: "NO_ACCESS"` on every `POST /employee`; omitting it causes `422 Brukertype kan ikke være "0" eller tom.`
- **Employee without employments[]**: do NOT include `employments[]` on employee payloads in this lifecycle flow; employees without employment records can still register timesheet entries, project participation, and all scored actions; this avoids the division/startDate/employmentType traps entirely and eliminates the `GET /division` call
- **Employee dateOfBirth**: include a placeholder `dateOfBirth` (e.g. `"1985-01-15"`) defensively; some accounts require it
- **Department**: always read department proactively; if none exists, create one with `POST /department`
- **Project startDate**: must be on or before the earliest planned timesheet entry date; set it to the run date
- **Timesheet dates**: all dates must be >= project `startDate`; consecutive dates, max 7.5h per entry per employee per date
- **Timesheet date arithmetic**: CRITICAL — use `new Date(Date.UTC(y, m-1, d))` for UTC-safe date construction; `new Date(dateStr + "T00:00:00")` + `.toISOString()` shifts dates back 1 day in CET/CEST
- **Batch timesheet**: use `POST /timesheet/entry/list` with array of all entries; 1 API call regardless of count
- **Combined account read**: use `GET /ledger/account?number=1920,6590,2400` to get voucher accounts (6590, 2400) and bank account (1920) in 1 call instead of 2
- **Lifecycle invoice**: use direct `POST /invoice?sendToCustomer=false` with embedded `orders[]`
- **Invoice due date**: requires explicit root `invoiceDueDate`; omitting it fails `422`
- **Manager lookup**: use one generic `GET /employee?assignableProjectManagers=true&count=1&fields=*`; do not try to make newly created employees assignable as PM

## Conditional Branches

- If no department exists in `GET /department?isInactive=false&count=1&fields=*`:
  - `POST /department` with `{ "name": "Avdeling" }` (+1 call)
- If account 1920 is not returned by the combined account read:
  - fall back to `GET /ledger/account?isBankAccount=true&fields=*` (+1 call)
- If the bank account (1920) lacks `bankAccountNumber`:
  - `PUT /ledger/account/{id}` with `{ "bankAccountNumber": "12345678903" }` (MOD11-valid)
  - retry the same direct `POST /invoice` payload once
- PM constraint: only the account owner can be PM; use the generic assignable manager and add the prompt-named PM as a project participant

## Recommended Shapes

Employee for lifecycle flow (POST /employee) — no `employments[]` needed:

```json
{
  "firstName": "Henry",
  "lastName": "Harris",
  "email": "henry.harris@example.org",
  "dateOfBirth": "1985-01-15",
  "userType": "NO_ACCESS",
  "department": { "id": 12345 }
}
```

Direct budgeted project activity:

```json
{
  "project": { "id": 54321 },
  "startDate": "2026-03-21",
  "budgetHours": 186,
  "budgetFeeCurrency": 206300,
  "activity": {
    "name": "Prosjektarbeid",
    "activityType": "PROJECT_SPECIFIC_ACTIVITY",
    "isChargeable": false
  }
}
```

Direct lifecycle invoice:

```json
{
  "invoiceDate": "2026-03-21",
  "invoiceDueDate": "2026-04-04",
  "customer": { "id": 12345 },
  "orders": [
    {
      "customer": { "id": 12345 },
      "project": { "id": 54321 },
      "orderDate": "2026-03-21",
      "deliveryDate": "2026-03-25",
      "orderLines": [
        {
          "description": "Cloud-Migration Brückentor",
          "count": 1,
          "unitPriceExcludingVatCurrency": 262850,
          "vatType": { "id": 6 }
        }
      ]
    }
  ]
}
```

Keep `project` on the embedded `orders[]` object, not on `orderLines[]`.

Batch timesheet entries (POST /timesheet/entry/list):

```json
[
  { "employee": { "id": 111 }, "project": { "id": 222 }, "activity": { "id": 333 }, "date": "2026-03-21", "hours": 24 },
  { "employee": { "id": 111 }, "project": { "id": 222 }, "activity": { "id": 333 }, "date": "2026-03-22", "hours": 12 },
  { "employee": { "id": 444 }, "project": { "id": 222 }, "activity": { "id": 333 }, "date": "2026-03-21", "hours": 24 },
  { "employee": { "id": 444 }, "project": { "id": 222 }, "activity": { "id": 333 }, "date": "2026-03-22", "hours": 24 }
]
```

Project participant — PM employee (POST /project/participant):

```json
{
  "project": { "id": 54321 },
  "employee": { "id": 111 },
  "adminAccess": true
}
```

Project participant — other employee (POST /project/participant):

```json
{
  "project": { "id": 54321 },
  "employee": { "id": 444 },
  "adminAccess": false
}
```

Supplier cost — project orderline for cost tracking (POST /project/orderline):

```json
{
  "project": { "id": 54321 },
  "description": "Leverandørkostnad fra Supplier Name",
  "date": "2026-03-21",
  "count": 1,
  "unitCostCurrency": 56750,
  "isChargeable": false
}
```

This populates `project.overallStatus.costs`. The `vendor` field reads back as `null` — this is expected. The voucher below handles supplier linkage.

Supplier cost — Leverandørfaktura voucher for accounting + supplier linkage (POST /ledger/voucher):

```json
{
  "date": "2026-03-21",
  "description": "Leverandørkostnad fra Supplier Name",
  "voucherType": { "id": "<looked-up-id-from-GET-voucherType>" },
  "postings": [
    {
      "row": 1,
      "date": "2026-03-21",
      "description": "Leverandørkostnad",
      "account": { "id": "<6590-id>" },
      "amount": 56750,
      "amountCurrency": 56750,
      "amountGross": 56750,
      "amountGrossCurrency": 56750,
      "project": { "id": 54321 }
    },
    {
      "row": 2,
      "date": "2026-03-21",
      "description": "Leverandørgjeld",
      "account": { "id": "<2400-id>" },
      "amount": -56750,
      "amountCurrency": -56750,
      "amountGross": -56750,
      "amountGrossCurrency": -56750,
      "supplier": { "id": 67890 }
    }
  ]
}
```

BOTH the project orderline AND the Leverandørfaktura voucher are needed:
- The orderline populates `project.overallStatus.costs` (the voucher alone leaves costs at 0)
- The voucher creates the accounting entry with supplier linkage (the orderline's `vendor` field reads back as null)
Do NOT use `POST /supplierInvoice` — the endpoint has no POST method in the spec; supplier invoices are created only via document import.
The voucherType ID for Leverandørfaktura is **environment-specific** (e.g. `9744845` in sandbox, `11289239` in production). Always resolve it dynamically via `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` in step 4. Resolve account IDs via `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` (combined read that also provides bank account).
CRITICAL: each posting MUST include an explicit `row` field (`row: 1` for expense, `row: 2` for credit). Omitting `row` causes `422 postings.row: Posteringene på rad 0 (guiRow 0) er systemgenererte` because Tripletex treats row 0 as system-generated.

## Avoidable Mistakes

CORRECTNESS-CRITICAL (caused all 10+ production attempts to fail checks 3,4,5,7):
- Do not omit `isFixedPrice: true` and `fixedprice: <budget>` from `POST /project` — the scorer checks the project-level budget
- Do not omit `budgetHours: <total>` from `POST /project/projectActivity` — the scorer checks hour budgets
- Do not use `adminAccess: false` for the PM employee's participant — the PM employee (prosjektleder/gestor de projeto) MUST have `adminAccess: true`
- Do not skip `POST /project/orderline` for supplier cost — the Leverandørfaktura voucher alone does NOT populate `project.overallStatus.costs`; you need BOTH orderline (for cost tracking) AND voucher (for supplier linkage)

Standard:
- Do not omit `userType` from `POST /employee` payloads; use `"NO_ACCESS"`
- Do not include `employments[]` on employee payloads for this lifecycle flow; employees work without employment records and omitting them avoids all division/startDate/employmentType traps
- Do not use `GET /division` — it is unnecessary when employees are created without `employments[]`
- Do not use two separate `GET /ledger/account` reads; combine into one `GET /ledger/account?number=1920,6590,2400`
- Do not use individual `POST /timesheet/entry` calls; use `POST /timesheet/entry/list` batch
- Do not set project `startDate` after timesheet entry dates
- Do not skip proactive `GET /department`
- Do not use `POST /supplierInvoice` (no POST method in spec; only document import)
- Do not hardcode voucherType ID — always resolve via `GET /ledger/voucherType?name=Leverandørfaktura`
- Do not omit `row` on voucher postings — use `row: 1` and `row: 2`
- Do not put `project` inside `orderLines[]`; keep on `orders[]` level
- Do not omit `invoiceDueDate` on the direct invoice
- Do not omit `activityType` from inline `activity` on projectActivity; both `name` and `activityType: "PROJECT_SPECIFIC_ACTIVITY"` are mandatory
- Do not place `isChargeable` on projectActivity root; it must be inside the `activity` object
- Use `new Date(Date.UTC(y, m-1, d))` for timesheet date splitting — local-time construction shifts dates back 1 day in CET/CEST
- Bank account fix: always use `"12345678903"` (MOD11-valid); `"12345678901"` fails 422
