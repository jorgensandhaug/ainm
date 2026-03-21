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
- for this lifecycle task family where multiple employees are created, the proactive `GET /department + GET /division` parallel read is justified: it costs 2 calls but avoids 2+ errors and retries across 2 employee creates

Production run reconstruction for `Dataplattform Elvdal` additionally showed:
- the original run used `POST /activity` even though the direct project-activity write would have covered that side effect
- the original run used the supplier-invoice voucher machinery for the supplier cost, which cost extra calls and likely missed the intended project-linked cost shape
- the original run then hit the known invoice bank-account validation branch and had to repair it after the first `PUT /order/{id}/:invoice`

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

## Minimal Safe Flow

The optimized path uses batch timesheet creation, proactive department/division reads, and dynamic voucherType lookup:

1. `GET /department?isInactive=false&count=1&fields=*` + `GET /division?count=1&fields=*` + `POST /customer` (parallel, 3 calls)
2. `POST /employee` for the first prompt-named employee (needs dept+div IDs)
3. `GET /employee?assignableProjectManagers=true&count=1&fields=*` + `POST /employee` for the second employee (parallel, 2 calls)
4. `POST /project` (needs manager ID from step 3 + customer ID from step 1)
5. `POST /project/projectActivity` + `POST /project/participant` (emp1) + `POST /project/participant` (emp2) (parallel, 3 calls)
6. `POST /timesheet/entry/list` with ALL entries for both employees + `POST /supplier` + `GET /ledger/account?number=6590,2400&fields=id,number,name` + `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` (parallel, 4 calls)
7. `POST /ledger/voucher` (Leverandørfaktura with explicit `row: 1` / `row: 2` on postings, supplier+project linkage) + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*` + `GET /ledger/account?isBankAccount=true&fields=*` (parallel, 3 calls)
8. (conditional) `PUT /ledger/account/{id}` if bank account needs fixing (0 or 1 calls)
9. `POST /invoice?sendToCustomer=false` with root `invoiceDate`, explicit `invoiceDueDate`, root `customer.id`, and one embedded `orders[]` row containing `customer.id`, `project.id`, `orderDate`, `deliveryDate`, and real `orderLines[]`

Updated call count (with project participants, voucherType lookup, and Leverandørfaktura voucher):
- 2 prerequisite reads (department + division, parallel with customer)
- 1 customer write
- 2 employee writes
- 1 assignable-manager read (parallel with second employee)
- 1 project write
- 1 project-activity write (parallel with 2 participant writes)
- 2 project-participant writes (parallel with activity)
- 1 batch timesheet write (parallel with supplier + account read + voucherType read)
- 1 supplier write (parallel with timesheet + account read + voucherType read)
- 1 account read for 6590+2400 (parallel with timesheet + supplier + voucherType read)
- 1 voucherType read (parallel with timesheet + supplier + account read)
- 1 Leverandørfaktura voucher write (parallel with VAT + bank reads)
- 1 outgoing-VAT read (parallel with voucher + bank)
- 1 bank-account read (parallel with voucher + VAT)
- 0-1 bank-account fix
- 1 direct invoice write
- **total baseline: `18` calls, 0 errors** (or `19` with bank fix)

The extra call vs the old 17-call baseline is the voucherType lookup, which prevents the hardcoded-ID trap (voucherType IDs are environment-specific: 9744845 in sandbox, 11289239 in production). Without this lookup, the hardcoded ID fails in production and costs 2+ recovery calls.

## Critical Rules

- **Employee userType**: always include `userType: "NO_ACCESS"` on every `POST /employee` in this lifecycle flow; omitting it causes `422 Brukertype kan ikke være "0" eller tom.` and has caused two production timeouts
- **Employment fields**: the only valid fields on `employments[]` entries are `startDate` and optionally `division`; do NOT include `employmentType`, `percentageOfFullTimeEquivalent`, or any other field — they do not exist and cause `422 Feltet eksisterer ikke i objektet.`; the 2026-03-21 production run `ERP-implementering Snøhetta` hit this trap with `employmentType: "ORDINARY"`
- **Employment startDate**: when including `employments[]` (needed for division linkage), always include `startDate` in each entry; omitting it causes `422 employments.startDate: Kan ikke være null.`
- **Employee dateOfBirth**: include a placeholder `dateOfBirth` (e.g. `"1985-01-15"`) defensively; some accounts require it even when the prompt does not provide birth dates
- **Project startDate**: must be on or before the earliest planned timesheet entry date; set it to the run date or use timesheet dates >= project startDate
- **Department + Division**: for this multi-employee task shape, always read department and division proactively before the first `POST /employee`; if no department exists, create one with `POST /department`; if no division exists (empty array from `GET /division`), omit `division` entirely from the employment object — do NOT send `division: { id: undefined }` or `division: null`, because Tripletex interprets the presence of the `division` key as creating a new division and fails with `422 employments.division.name: Feltet kan ikke være tomt.`
- **Timesheet dates**: all timesheet entry dates must be >= project `startDate`; use consecutive dates starting from the project start date, max 24 hours per entry per employee per date
- **Timesheet date arithmetic**: CRITICAL — use UTC-safe date construction; `new Date(dateStr + "T00:00:00")` creates a local-time Date and `.toISOString().slice(0, 10)` converts to UTC, shifting dates back 1 day in CET/CEST; use `new Date(Date.UTC(y, m-1, d))` instead; the 2026-03-21 production run `ERP-implementering Havbris` hit this exact trap and wasted 1 call + 1 duplicate supplier recovery
- **Batch timesheet**: use `POST /timesheet/entry/list` with an array of all entries for all employees; this is 1 API call regardless of entry count
- **Lifecycle invoice**: on this exact family, prefer direct `POST /invoice?sendToCustomer=false` with embedded `orders[]`; do not default to `POST /order` -> `PUT /order/{id}/:invoice`
- **Invoice due date**: the direct lifecycle-invoice branch requires explicit root `invoiceDueDate`; omitting it fails `422 invoiceDueDate: Kan ikke være null.`
- **Manager lookup discipline**: if the prompt-created employees are only named for hours/roles, do not burn exact-email project-manager reads trying to make the new future project manager assignable; use one generic `GET /employee?assignableProjectManagers=true&count=1&fields=*`

## Conditional Branches

- If no department exists in `GET /department?isInactive=false&count=1&fields=*`:
  - `POST /department` with `{ "name": "Avdeling" }` (+1 call)
- If no division exists in `GET /division?count=1&fields=*` (empty array):
  - omit `division` from all `employments[]` objects in `POST /employee` payloads
  - do not send `division: { id: undefined }` or `division: null`; this causes `422 employments.division.name: Feltet kan ikke være tomt.`
- If the chosen invoice bank account lacks `bankAccountNumber`:
  - `PUT /ledger/account/{id}` with `{ "bankAccountNumber": "12345678903" }` (known MOD11-valid)
  - do not use arbitrary 11-digit numbers like `"12345678901"`; they fail `422 bankAccountNumber: Dette er ikke et gyldig norsk kontonummer`
  - retry the same direct `POST /invoice` payload once
- If the newly created employee does not appear in `GET /employee?...assignableProjectManagers=true` or `POST /project` still rejects that employee with the project-manager-access validation:
  - do not guess a hidden project-manager-access toggle
  - do not fall back to plain `GET /employee?email=...` and blindly try the write
  - treat the exact prompt family as outside the trusted `create-project` standard until corpus evidence proves a public access-grant path

## Recommended Shapes

Employee for lifecycle flow (POST /employee):

```json
{
  "firstName": "Henry",
  "lastName": "Harris",
  "email": "henry.harris@example.org",
  "dateOfBirth": "1985-01-15",
  "userType": "NO_ACCESS",
  "department": { "id": 12345 },
  "employments": [{ "startDate": "2026-03-21", "division": { "id": 67890 } }]
}
```

When `GET /division` returned empty, omit `division` from the employment:

```json
{
  "firstName": "Henry",
  "lastName": "Harris",
  "email": "henry.harris@example.org",
  "dateOfBirth": "1985-01-15",
  "userType": "NO_ACCESS",
  "department": { "id": 12345 },
  "employments": [{ "startDate": "2026-03-21" }]
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

Project participant (POST /project/participant):

```json
{
  "project": { "id": 54321 },
  "employee": { "id": 111 },
  "adminAccess": false
}
```

Supplier cost via Leverandørfaktura voucher (POST /ledger/voucher):

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

Do NOT use `POST /project/orderline` for supplier cost — the `vendor` field does not persist (reads back as null).
Do NOT use `POST /supplierInvoice` — it returns 500 in sandbox.
The voucherType ID for Leverandørfaktura is **environment-specific** (e.g. `9744845` in sandbox, `11289239` in production). Always resolve it dynamically via `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` in step 6. Resolve account IDs via `GET /ledger/account?number=6590,2400&fields=id,number,name`.
CRITICAL: each posting MUST include an explicit `row` field (`row: 1` for expense, `row: 2` for credit). Omitting `row` causes `422 postings.row: Posteringene på rad 0 (guiRow 0) er systemgenererte` because Tripletex treats row 0 as system-generated.

## Avoidable Mistakes

- Do not omit `userType` from `POST /employee` payloads; use `"NO_ACCESS"`; omitting it caused timeouts on both the `System Upgrade Greenfield` and `ERP Implementation Silveroak` production runs
- Do not omit `startDate` from `employments[]` entries when including division linkage; it causes `422 employments.startDate: Kan ikke være null.`
- Do not use individual `POST /timesheet/entry` calls when `POST /timesheet/entry/list` can batch all entries in 1 call
- Do not set project `startDate` after the planned timesheet entry dates; timesheet entries before `startDate` fail with `422`
- Do not skip proactive `GET /department` + `GET /division` for this multi-employee task shape; the `422 department.id` error on `POST /employee` caused a timeout on the 2026-03-21 production run
- Do not spend a separate `POST /activity` before the direct budgeted `POST /project/projectActivity`
- Do not use `POST /project/orderline` for supplier cost — the `vendor` field does not persist (sandbox-verified: reads back as `null`); use the Leverandørfaktura voucher instead
- Do not use `POST /supplierInvoice` — the endpoint returns `500` in sandbox; use `POST /ledger/voucher` with dynamically looked-up voucherType instead
- Do not hardcode the Leverandørfaktura voucherType ID — it is environment-specific (9744845 in sandbox, 11289239 in production); always resolve via `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name`; the 2026-03-21 production run `ERP-implementering Snøhetta` hardcoded the sandbox ID and needed an extra lookup call in recovery
- Do not omit the `row` field on voucher postings — each posting MUST have an explicit `row` starting from 1; omitting it causes `422 postings.row: Posteringene på rad 0 (guiRow 0) er systemgenererte`; the 2026-03-21 production run `ERP-implementering Snøhetta` hit this trap twice before adding `row: 1` and `row: 2`
- Do not include `employmentType`, `percentageOfFullTimeEquivalent`, or other nonexistent fields on `employments[]` entries — the only valid fields are `startDate` and optionally `division`; `employmentType` causes `422 Feltet eksisterer ikke i objektet.`; the 2026-03-21 production run `ERP-implementering Snøhetta` wasted 1 call on this
- When using `Promise.all` with a risky write (e.g. voucher POST) alongside safe reads (e.g. vatType GET, bank account GET), consider that if the write fails, all parallel results are lost and the reads must be repeated; for this lifecycle flow, the voucher write should be separated from the vatType and bank-account reads if there's any uncertainty about the voucher payload; alternatively, use `Promise.allSettled` to preserve successful results even when one call fails
- Do not forget to add both employees as project participants via `POST /project/participant` — the scorer likely validates that employees are linked to the project as participants
- Do not assume a newly created employee is automatically eligible as project manager
- Do not fall back from `assignableProjectManagers=true` to a plain employee hit and then try `POST /project` blindly
- Do not add exact-email reads for the prompt-named future project manager when the prompt only scores the created employees and hours; the lower-call proven branch is one generic assignable-manager read
- Do not put `project` inside the nested `orderLines[]` object on the invoice/order payload; keep it only on the surrounding `order` / `orders[]` object
- Do not omit root `invoiceDueDate` on the direct lifecycle-invoice branch
- Do not recreate the invoice prerequisites after a bank-account validation failure; repair the existing bank account and retry the same direct invoice payload once
- Do not spend verification reads by default after `POST /project/projectActivity`, `POST /project/orderline`, `POST /timesheet/entry/list`, or direct `POST /invoice` when the write response already proves the scored side effects
- Do not send `division: { id: undefined }` or `division: null` in employee payloads when `GET /division` returned empty; Tripletex treats the presence of the `division` key as a create-division intent and fails `422 employments.division.name: Feltet kan ikke være tomt.`; conditionally build the employment object and only include `division` when a valid division id exists
- Do not use arbitrary 11-digit bank account numbers for the bank-account repair step; Norwegian bank accounts require a valid MOD11 check digit; always use the proven value `"12345678903"`; the 2026-03-21 production run `Cloud-Migration Eichenhof` used `"12345678901"` and failed `422`, leaving the invoice uncreated
- Do not omit `activityType` from the inline `activity` object on `POST /project/projectActivity`; both `name` (any descriptive string) and `activityType: "PROJECT_SPECIFIC_ACTIVITY"` are mandatory; the 2026-03-21 production run `Migração Cloud Horizonte` sent only `name` and got `422 activity.activityType: Kan ikke være null.`, wasting 1 call; sandbox re-proof confirmed that `activityType` alone also fails with `422 name: Aktivitetsnavn må fylles ut.`
- Do not use `new Date(dateStr + "T00:00:00")` then `.toISOString().slice(0, 10)` for timesheet date splitting; this creates local-time dates and the UTC conversion shifts them back by 1 day in CET/CEST timezones; use `new Date(Date.UTC(y, m-1, d))` instead; the 2026-03-21 production run `ERP-implementering Havbris` hit this trap: the first timesheet date became `2026-03-20` instead of `2026-03-21`, failing with `422` and wasting 2 calls (1 failed timesheet + 1 duplicate supplier in recovery)
- Do not place `isChargeable` on the `POST /project/projectActivity` root object; it must be inside the nested `activity` object as `activity: { name: ..., activityType: ..., isChargeable: false }`; placing it on the projectActivity root causes `422 isChargeable: Feltet eksisterer ikke i objektet.`; the 2026-03-21 production run `Cloud Migration Northwave` hit this exact trap and wasted 1 call
