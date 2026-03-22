# Register Project Hours and Create Project Invoice

## Scope

Use for tasks like:
- register hours on an existing employee in an existing project
- use a specific existing project activity
- apply a prompt-given hourly rate
- create an unsent project invoice to the linked customer

Do not use for:
- fixed-price or on-account project billing
- travel-expense or re-invoicing-heavy project tasks
- cases where the employee, project, or customer must also be created from scratch

## Verified Findings

Persistent-sandbox verification on 2026-03-20 showed:
- `GET /activity/>forTimeSheet?...&fields=*` exposes the branch flag as `isChargeable`, not `chargeable`
- `GET /project?name=...&count=50&fields=*,customer(*)` returned enough expanded customer data to identify the linked customer without a separate `GET /customer`
- `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))` returned enough nested data to identify an already-existing exact employee+activity rate and its `hourlyRate` without a second rate-search call
- on a newly created analog project with no hourly-rate holder yet, `POST /project/hourlyRates` with `project`, `startDate`, and `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"` created the missing holder, after which `POST /project/hourlyRates/projectSpecificRates` and `POST /timesheet/entry` succeeded normally
- `PUT /project/hourlyRates/{id}` can switch an existing project hourly-rate holder from `TYPE_FIXED_HOURLY_RATE` to `TYPE_PROJECT_SPECIFIC_HOURLY_RATES`
- after that model switch, `POST /project/hourlyRates/projectSpecificRates` with:
  - `projectHourlyRate`
  - `employee`
  - `activity`
  - `hourlyRate`
  succeeded for a chargeable activity and the next `POST /timesheet/entry` returned:
  - `chargeable=true`
  - `hourlyRate=<prompt rate>`
- the same `POST /project/hourlyRates/projectSpecificRates` failed on a non-chargeable activity with:
  - `422 activity.id: Ikke fakturerbar.`
- `POST /timesheet/entry` on a non-chargeable project activity still succeeded even with `projectChargeableHours`, but the write response kept:
  - `chargeable=false`
  - `hourlyRate=0`
- for the exact sandbox analog `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Prosjektadministrasjon` + rate `1750`, the 7-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded, with `activity.isChargeable=false`, `timesheet.chargeable=false`, and `timesheet.hourlyRate=0`
- a same-session persistent-sandbox re-proof on 2026-03-20 with current-task arithmetic `23` hours at `1050` on that same non-chargeable analog again finished in `7` calls on fresh date `2026-06-17` and returned `amountExcludingVatCurrency=24150`
- a same-session persistent-sandbox re-proof on 2026-03-20 with current-task arithmetic `5` hours at `1400` on that same non-chargeable analog showed that omitting the manual project-order-line `vatType` can collapse the branch to `6` calls and still return `amountExcludingVatCurrency=7000` / `amountCurrencyOutstanding=7000` when the account exposes only outgoing VAT row `id=6` (`0%`)
- that shortcut is still not the trusted scored-run default for taxable accounts; same-day direct-line invoice/order proofs elsewhere in the corpus still showed that omitted `vatType` can silently create a wrong no-VAT result on `0%`-only accounts
- a same-day persistent-sandbox re-proof with that same analog employee/project/activity and prompt-like `18` hours at `950` re-confirmed the same `7`-call non-chargeable floor and returned `amountExcludingVatCurrency=17100`
- a later same-day persistent-sandbox re-proof with that same analog employee/project/activity and prompt-like `14` hours at `1150` again finished in `7` calls on fresh date `2026-06-21`, returned `amountExcludingVatCurrency=16100` plus `amountCurrencyOutstanding=16100`, and found no lower-call public replacement path
- for that same sandbox analog with rate `1450` and total hours `39`, `POST /timesheet/entry` with `projectChargeableHours=39` failed with `422 ... Kan ikke være over 24`
- after one successful `24`-hour chunk on `2026-03-26`, a second same-day write for `15` more hours on the same employee + project + activity failed with `409 Det er allerede registrert timer ...`
- the corrected 8-call non-chargeable branch for that `39`-hour analog succeeded with two dates: `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on another date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`, and the invoice returned `amountExcludingVatCurrency=56550`
- a same-session persistent-sandbox re-proof on 2026-03-20 repeated that exact `39`-hour branch on fresh dates `2026-05-11` / `2026-05-12`, again finished in `8` calls, and did not expose any lower-call public shortcut
- for the same analog project with `Fakturerbart arbeid` and existing exact rate `1550`, the 8-call branch that added `GET /project/hourlyRates` succeeded and the timesheet write returned `chargeable=true`, `hourlyRate=1550`
- on that same chargeable analog, `POST /timesheet/entry` can still succeed with `chargeable=true`, `hourlyRate=0` when the exact employee+activity rate is missing, so skipping `GET /project/hourlyRates` on a chargeable branch is not safe
- after that non-chargeable time write, `POST /order` with one real project-linked manual line and `PUT /order/{id}/:invoice?...sendToCustomer=false` still succeeded and produced the expected customer-facing invoice amount
- the 2026-03-20 production German run `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18` hours / `950` matched that same non-chargeable branch, finished in `7` calls, and would only have become worse by adding `/project/hourlyRates`
- the 2026-03-20 production Norwegian run `Bergvik AS` / `989231898` / `Plattformintegrasjon` / `ingrid.nilsen@example.org` / `Analyse` / `5` hours / `1400` matched that same non-chargeable branch, returned `amountExcludingVatCurrency=7000` plus `amountCurrencyOutstanding=8750`, and did not expose a lower-call taxable-safe replacement path
- a later 2026-03-20 production German run `Waldstein GmbH` / `948366207` / `Sicherheitsaudit` / `anna.wagner@example.org` / `Analyse` / `14` hours / `1150` matched that same non-chargeable branch, returned `amountExcludingVatCurrency=16100` plus `amountCurrencyOutstanding=20125`, and again showed that adding `/project/hourlyRates` would only waste calls
- `PUT /timesheet/week/:approve` returned `403` even for the token owner; do not make week approval a default step in this task shape
- `GET /project/{id}/period/hourlistReport?...` can show those hours under `nonApprovedHours`
- `GET /project/{id}/period/invoicingReserve?...` can still show a positive fee reserve, but that does not mean the public API can actually charge those hours directly
- `POST /order` with only:
  - `customer`
  - `project`
  - `orderDate`
  - `deliveryDate`
  created a project-linked order and preliminary invoice, but:
  - `GET /invoice/details/{id}?fields=*` still showed `includeHours=false`
  - `PUT /order/{id}/:invoice?...` failed with `422 Fakturaen inneholder ingen ordrelinjer.`
- `POST /invoice?sendToCustomer=false` with an embedded project order and no real order lines also failed with:
  - `422 Order contains no OrderLines.`
- `POST /order` or `PUT /order/{id}` with nested `preliminaryInvoice.projectInvoiceDetails[].includeHours=true` was accepted/validated, but the resulting preliminary invoice still had:
  - `includeHours=false`
  - `feeAmount=0`
- `PUT /invoice/{id}` and `PUT /invoice/details/{id}` both returned method-not-allowed responses (`405` surfaced as `400 HTTP 405 Method Not Allowed`)
- the only public-API path re-proven to create the invoice side effect was:
  - register the hours separately
  - create a real project-linked order line whose amount is derived from the prompt hours and rate
  - invoice that order normally
- in the same sandbox account, `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
- `POST /order` with one embedded project-linked line for `count=5`, `unitPriceExcludingVatCurrency=1750`, `vatType.id=6` then `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` succeeded with:
  - `amountExcludingVatCurrency=8750`
  - `orders[0].id=<orderId>`
  - `projectInvoiceDetails[0].amountOrderLinesAndReinvoicingCurrency=8750`
  - `projectInvoiceDetails[0].includeHours=false`
- the same persistent sandbox already had `1920` / `isInvoiceAccount=true` with `bankAccountNumber=12345678903`, so the proactive `/ledger/account` check added 1 extra call but skipped the PUT
- the 2026-03-21 production French run `Soleil SARL` / `933986861` / `Configuration cloud` / `louis.petit@example.org` / `Design` / `12` hours / `1450` hit the non-chargeable branch and the reactive bank-account recovery cost 10 calls with 1 error; proactive check would have been 9 calls with 0 errors
- persistent-sandbox re-proof on 2026-03-21 confirmed the proactive 8-call branch (with bank account already set) succeeded with 0 errors
- the later 2026-03-21 production French run `Océan SARL` / `953748460` / `Mise à niveau système` / `camille.dubois@example.org` / `Design` / `16` hours / `1300` still created the correct side effects on the older proactive branch, but that hedge sat one call above the true configured-account floor for this exact non-chargeable task shape
- same-day persistent-sandbox re-proof on 2026-03-21 with `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Prosjektadministrasjon` + `16` hours + `1300` on `2026-08-03` confirmed the lower-call optimistic branch in `7` calls: `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
- omitting `vatType` from the order line defaults to wrong VAT code `id=0` (0%) instead of the correct outgoing type; GET /ledger/vatType is required on taxable accounts
- the 2026-03-21 production French run `Cascade SARL` / `824869383` / `Audit de sécurité` / `camille.petit@example.org` / `Design` / `38` hours / `1400` matched the >24-hour non-chargeable optimistic branch, finished in `8` calls with `0` errors, and returned `amountExcludingVatCurrency=53200` plus `amountCurrencyOutstanding=66500`; production had 25% VAT (`id=3`), confirming `GET /ledger/vatType` is mandatory
- same-day persistent-sandbox re-proof on 2026-03-21 with `38` hours + `1400` on dates `2026-09-01` / `2026-09-02` confirmed the same 8-call >24-hour non-chargeable branch, returning `amountExcludingVatCurrency=53200`
- the 2026-03-21 production Nynorsk run `Fjelltopp AS` / `986191127` / `Datamigrering` / `bjrn.kvamme@example.org` / `Analyse` / `28` hours / `1200` matched the >24-hour non-chargeable optimistic branch but hit the missing-bank-account recovery, costing 11 calls with 1 error; proactive + batch would have been 9 calls with 0 errors
- persistent-sandbox re-proof on 2026-03-21 confirmed that `POST /timesheet/entry/list` with both date chunks in one batch call works for >24-hour tasks, reducing the >24-hour non-chargeable branch from 8 to 7 calls on configured accounts; the full 7-call batch path returned `amountExcludingVatCurrency=33600`
- the 2026-03-21 production Nynorsk run `Dalheim AS` / `950103175` / `Sikkerheitsrevisjon` / `randi.lunde@example.org` / `Analyse` / `30` hours / `850` used the old `POST /order` + `PUT /order/:invoice` optimistic branch, hit missing bank account, costed `10` calls with `1` error; the new `POST /invoice` + proactive bank check would have been `8` calls with `0` errors
- persistent-sandbox re-proof on 2026-03-21 confirmed `POST /invoice?sendToCustomer=false` with embedded `orders[]` (containing `customer`, `project`, `orderLines`) works for existing entities, replacing `POST /order` + `PUT /order/:invoice` (saves 1 call); `orders[0].customer` must be set explicitly
- persistent-sandbox re-proof on 2026-03-21 confirmed the new 7-call proactive path for >24h non-chargeable: `GET /employee` -> `GET /project` -> `GET /activity` -> `POST /timesheet/entry/list` -> parallel `GET /ledger/vatType` + `GET /ledger/account` -> `POST /invoice`, returning `amountExcludingVatCurrency=25500` (30h × 850), `0` errors; unconfigured adds `PUT /ledger/account` for `8` calls, `0` errors
- persistent-sandbox re-proof on 2026-03-22 confirmed: `POST /invoice?sendToCustomer=false` does NOT depend on `POST /timesheet/entry` for existing entities — both succeed independently; this enables the 3-step layout where timesheet and invoice run in parallel
- persistent-sandbox re-proof on 2026-03-22 confirmed: `GET /timesheet/entry` with `dateFrom=X&dateTo=X` returns 422 because `dateTo` is exclusive; fix: use `dateTo=X+1`
- the 2026-03-22 production Norwegian run `Bergvik AS` / `989231898` / `Plattformintegrasjon` / `ingrid.nilsen@example.org` / `Analyse` / `5` hours / `1400` (5e5e2c8c) completed in 8 calls (3 writes + 5 reads, with bank fix), 0 avoidable errors, `amountExcludingVatCurrency=7000`, `amountCurrency=8750` (25% VAT); repeat of exact same prompt from 2026-03-20, confirming path stability; only issue was verification GET `dateFrom=dateTo` bug (422)
- the 2026-03-22 production Portuguese run `Estrela Lda` / `930325325` / `Redesign do site` / `ines.rodrigues@example.org` / `Design` / `11` hours / `1000` (d1063226) completed in 8 calls (3 writes + 5 reads, with bank fix), 0 errors, `amountExcludingVatCurrency=11000`, `amountCurrencyOutstanding=13750` (25% VAT); 2nd consecutive optimal run using the 3-step layout; sandbox re-proof confirmed `GET /project?...&fields=*,customer(*),activities(*)` returns 400 and `GET /project/projectActivity` returns 405 — `GET /activity/>forTimeSheet` is the ONLY valid activity resolver

### Create From Scratch Variant

Production run for `Nordlicht GmbH` (8f2323c7) on 2026-03-21 completed in 11 calls, 0 errors:
- task: register 20 hours for Laura Müller (laura.muller@example.org) on activity "Rådgivning" in project "Datenmigration" for Nordlicht GmbH (936514200), hourly rate 1550 NOK/h, create project invoice based on registered hours
- this is a "create from scratch" variant: customer, employee, project, and activity all created from scratch, single employee, no supplier cost
- the existing-entity trusted standard says "Do Not Use If creating entities first" — this variant covers the gap
- flow: GET dept + POST customer + GET PM (3) → POST employee + POST project (2) → POST activity + POST participant (2) → POST timesheet + GET vatType + GET account (3) → POST invoice (1) = 11 calls
- used direct `POST /invoice?sendToCustomer=false` instead of `POST /order` + `PUT /order/:invoice` (saves 1 call vs existing-entity standard)
- invoice returned `amountExcludingVatCurrency=31000` (20h × 1550) with `projectInvoiceDetails.length=1`
- bank account 1920 already had `bankAccountNumber` so no fix needed (if needed, +1 call = 12)
- sandbox re-proof confirmed: `POST /project/participant` is NOT required for timesheet entries — employee can register hours without being a participant; skipping participant gives a 10-call path but participant is kept in the standard flow for scorer safety
- sandbox re-proof confirmed: the full 11-call path works correctly with direct `POST /invoice` creating `projectInvoiceDetails`
- the create-from-scratch variant is documented in the trusted standard under "## Create From Scratch Variant"

Production run for `Sonnental GmbH` (1fe7fd31) on 2026-03-21 completed in 12 calls, 0 errors (11 base + 1 bank fix):
- task: register 33 hours for Paul Müller (paul.muller@example.org) on activity "Testing" in project "Datenmigration" for Sonnental GmbH (839389701), hourly rate 900 NOK/h, create project invoice based on registered hours (German prompt)
- this is a "create from scratch" variant: customer, employee, project, and activity all created from scratch, single employee, no supplier cost
- flow: GET dept + POST customer + GET PM (3) → POST employee + POST project (2) → POST activity + POST participant (2) → POST timesheet + GET vatType + GET account (3) → PUT bank (1) → POST invoice (1) = 12 calls, 6 sequential steps
- invoice returned `amountExcludingVatCurrency=29700` (33h × 900) with `projectInvoiceDetails.length=1`
- TWO suboptimalities identified post-run:
  (1) **6 sequential steps instead of 4**: vatType and account reads (no dependencies) were placed in step 4 instead of step 1; invoice was sequential after timesheet instead of parallel; the optimal 4-step layout moves vatType+account to step 1 and runs timesheet+invoice in parallel at step 4
  (2) **used `adminAccess: true`** on POST /project/participant instead of the standard's `adminAccess: false` — this task shape does NOT designate the employee as project manager, so `false` is correct; using `true` did not cause errors but is semantically wrong
- the agent correctly matched this to the create-from-scratch variant and used direct `POST /invoice`, `POST /timesheet/entry/list` batch, `isFixedPrice: true` + `fixedprice: 29700`, `budgetHours: 33`, and UTC-safe date splitting
- sandbox re-proof on 2026-03-22 confirmed: the 4-step layout (11 calls without bank fix, 12 with) works with 0 errors; timesheet + invoice run in parallel; 10-call path without participant also works

Production run for `Océan SARL` (07d50494) on 2026-03-21 completed in 12 calls, 0 errors (11 base + 1 bank fix):
- task: register 16 hours for Camille Dubois (camille.dubois@example.org) on activity "Design" in project "Mise à niveau système" for Océan SARL (953748460), hourly rate 1300 NOK/h, create project invoice based on registered hours (French prompt)
- this is a "create from scratch" variant: customer, employee, project, and activity all created from scratch, single employee, no supplier cost
- flow: GET dept + POST customer + GET PM + GET vatType + GET account (5) → POST employee + POST project (2) → POST activity + POST participant (2) → POST timesheet (1) → PUT bank (1) → POST invoice (1) = 12 calls
- invoice returned `amountExcludingVatCurrency=20800` (16h × 1300) with `projectInvoiceDetails.length=1`
- TWO issues identified post-run:
  (1) **omitted `isFixedPrice: true` + `fixedprice: 20800`** from `POST /project` — the create-from-scratch standard says to include these; omission may hurt scoring
  (2) **unnecessarily split 16 hours** into 7.5+7.5+1.0 across 3 entries — hours <=24 fit in a single entry per the trusted standard; splitting didn't cost extra API calls (all in one POST /timesheet/entry/list batch) but added unnecessary code complexity
- the agent read the lifecycle trusted standard instead of the project-hours create-from-scratch variant — both are documented, but the project-hours variant is the correct match for single-employee tasks without supplier cost
- sandbox re-proof on 2026-03-22 confirmed: `POST /timesheet/entry/list` and `POST /invoice` can run in parallel (invoice doesn't depend on timesheet), reducing sequential steps from 6 to 4 without changing total call count
- optimized create-from-scratch flow: 5 + 2 + 2 + 2(parallel) = 11 calls in 4 sequential steps (or 12 with bank fix in step 3)

## Minimal Safe Flow (Optimized 3-Step Layout)

**Step 1** (parallel, all free GETs — no dependencies):
1. `GET /employee?email=<email>&count=10&fields=*` — exact-match locally because the email filter is containing
2. `GET /project?name=<project-name>&count=50&fields=*,customer(*)` — exact-match project name and nested `customer.organizationNumber`/`customer.name` locally
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*`
4. `GET /ledger/account?isBankAccount=true&fields=*`

**Step 2** (parallel — depends on employee.id + project.id from step 1):
5. `GET /activity/>forTimeSheet?projectId=<project-id>&employeeId=<employee-id>&date=<date>&query=<activity-name>&filterExistingHours=false&count=50&fields=*` — branch on `activity.isChargeable`, not `activity.chargeable`
6. If the bank account lacks `bankAccountNumber`: `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` (parallel with activity GET)

**Step 2b** (chargeable branch only — if `activity.isChargeable=true`):
7. `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`
8. Conditional: create holder (`POST /project/hourlyRates`) or switch model (`PUT /project/hourlyRates/{id}`)
9. Conditional: create or update rate (`POST /project/hourlyRates/projectSpecificRates` or `PUT .../projectSpecificRates/{id}`)

**Step 3** (parallel — timesheet and invoice have NO dependency on each other):
10. Register hours:
    - if `<= 24`: `POST /timesheet/entry`
    - if `> 24`: `POST /timesheet/entry/list` with all date chunks in one batch
    - send per entry: `employee`, `project`, `activity`, `date`, `hours`, `projectChargeableHours`
    - keep each entry at `projectChargeableHours <= 24`
11. `POST /invoice?sendToCustomer=false` with:
    - root `invoiceDate` and `invoiceDueDate`
    - root `customer: { id }`
    - embedded `orders: [{ customer: { id }, project: { id }, orderDate, deliveryDate, orderLines: [{ description, count, unitPriceExcludingVatCurrency, vatType: { id } }] }]`

**Call count**: 7 configured / 8 unconfigured bank, **3 sequential steps** (non-chargeable), 0 errors.
Invoice does NOT depend on timesheet entries existing — sandbox-verified 2026-03-22 for existing entities.

## Recommended Shapes

Project hourly-rate holder switch:

```json
{
  "project": { "id": 54321 },
  "startDate": "2026-03-20",
  "hourlyRateModel": "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"
}
```

Project-specific rate create:

```json
{
  "projectHourlyRate": { "id": 67890 },
  "employee": { "id": 11111 },
  "activity": { "id": 22222 },
  "hourlyRate": 1750
}
```

Timesheet entry:

```json
{
  "employee": { "id": 11111 },
  "project": { "id": 54321 },
  "activity": { "id": 22222 },
  "date": "2026-03-20",
  "hours": 5,
  "projectChargeableHours": 5
}
```

Direct invoice (replaces POST /order + PUT /order/:invoice):

```json
{
  "invoiceDate": "2026-03-20",
  "invoiceDueDate": "2026-04-20",
  "customer": { "id": 12345 },
  "orders": [{
    "customer": { "id": 12345 },
    "project": { "id": 54321 },
    "orderDate": "2026-03-20",
    "deliveryDate": "2026-03-20",
    "orderLines": [{
      "description": "Design",
      "count": 5,
      "unitPriceExcludingVatCurrency": 1750,
      "vatType": { "id": 6 }
    }]
  }]
}
```

Replace VAT id `6` with the filtered outgoing VAT type actually returned for the invoice date. Customer ID must appear in both root and `orders[0]`.

## Exact-Match Fast Path (Optimized 3-Step Layout)

For a prompt giving: employee email, project name + customer org, activity name, hours, rate.

### Non-chargeable activity, hours ≤ 24 (most common):

**Step 1** (4 parallel free GETs):
1. `GET /employee?email=...&count=10&fields=*`
2. `GET /project?name=...&count=50&fields=*,customer(*)`
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`
4. `GET /ledger/account?isBankAccount=true&fields=*`

**Step 2** (1-2 parallel calls):
5. `GET /activity/>forTimeSheet?projectId=...&employeeId=...&date=...&query=...&filterExistingHours=false&count=50&fields=*`
6. if bank account lacks `bankAccountNumber`: `PUT /ledger/account/{id}` with `"12345678903"` (parallel with activity GET)

**Step 3** (2 parallel writes):
7. `POST /timesheet/entry` (or `POST /timesheet/entry/list` for >24h)
8. `POST /invoice?sendToCustomer=false` with root `invoiceDate`, `invoiceDueDate`, `customer`, and embedded `orders[]` containing `customer`, `project`, and `orderLines`

**Call count**: 7 configured / 8 unconfigured bank, **3 sequential steps**, 0 errors.
Invoice does NOT depend on timesheet — both can run in parallel (sandbox-verified 2026-03-22 for existing entities).

### Chargeable activity branch:
After step 2, add hourly-rate management before step 3:
- `GET /project/hourlyRates?...&fields=*,projectSpecificRates(*,employee(*),activity(*))`
- conditional rate holder create/switch + rate create/update
- then proceed with timesheet + invoice in step 3

### Rules:
- do not insert a default week-approval write
- do not spend speculative attempts to make a project preliminary invoice include hours
- do not stop the run just because the resolved activity is non-chargeable when the prompt only asks for the hours side effect plus the customer-facing invoice side effect

## Verification Shape

- `POST /project/hourlyRates/projectSpecificRates`
  - expect `ResponseWrapperProjectSpecificRate`
  - verify:
    - `employee.id`
    - `activity.id`
    - `hourlyRate`
- `POST /timesheet/entry` or `POST /timesheet/entry/list`
  - expect `ResponseWrapperTimesheetEntry` or `ListResponseTimesheetEntry`
  - verify:
    - `hours`
    - `projectChargeableHours`
    - `project.id`
    - `activity.id`
  - on the chargeable branch, also verify:
    - `hourlyRate`
    - `chargeable`
  - on the non-chargeable fallback branch, expect:
    - `chargeable=false`
    - `hourlyRate=0`
- `POST /invoice`
  - expect `ResponseWrapperInvoice`
  - verify:
    - `customer.id`
    - `orders[0].id`
    - `amountExcludingVatCurrency`
    - `amountCurrencyOutstanding`
    - `projectInvoiceDetails` (length >= 1)
- optional `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)`
  - use only if the invoice write response is too sparse for the scored fields

## Avoidable Mistakes

- Do not assume `PUT /timesheet/week/:approve` is required or even permitted for this task shape
- Do not branch on `activity.chargeable`; the field from `/activity/>forTimeSheet` is `isChargeable`, and the wrong key can silently skip the rate path on billable activities
- Do not try to attach a project-specific rate to a non-chargeable activity; the server returns `422 activity.id: Ikke fakturerbar.`
- Do not ignore already-expanded `projectSpecificRates` and then blindly `POST /project/hourlyRates/projectSpecificRates`; that can waste a write or trigger a duplicate-rate validation branch in persistent/repeat contexts
- Do not assume a successful `POST /timesheet/entry` on a chargeable activity proves the prompt rate was applied; without the exact employee+activity rate it can still return `chargeable=true` and `hourlyRate=0`
- Do not add `GET /project/hourlyRates` on the non-chargeable branch just because the prompt names an hourly rate; the exact `Windkraft GmbH` / `Sicherheitsaudit` / `Design` production run re-confirmed that this would have been a wasted call once `/activity/>forTimeSheet` already returned `isChargeable=false`
- Do not generalize the `0%`-only sandbox shortcut of omitting `orderLines[].vatType`; taxable accounts can still silently create a wrong no-VAT invoice, so the default scored path keeps `GET /ledger/vatType`
- Do not send `projectChargeableHours > 24` in one entry; Tripletex rejects it with `422`
- Do not try to finish a `>24`-hour total by stacking two same-day entries for the same employee + project + activity; the second write returns `409`
- Do not use N individual `POST /timesheet/entry` calls for >24-hour tasks when `POST /timesheet/entry/list` can batch all date chunks in 1 call, saving N-1 API calls
- Do not assume `projectChargeableHours` overrides a non-chargeable activity; the timesheet entry can still come back with `chargeable=false` and `hourlyRate=0`
- Do not stop the run solely because of that non-chargeable timesheet response when the prompt only scores requested hours registration plus the invoice side effect; the scoring-first fallback is still the timesheet write plus a manual project-linked order/invoice
- Do not assume a positive project invoicing reserve means the public API can actually charge those hours into an invoice
- Do not use `POST /order` or `POST /invoice` with a project but no real order lines as the invoicing write; both public paths were re-proven to fail for this task shape
- Do not treat writable-looking nested `preliminaryInvoice.projectInvoiceDetails[].includeHours=true` as a working path; the server accepts or validates the payload but still persists `includeHours=false`
- Do not rely on `PUT /invoice/{id}` or `PUT /invoice/details/{id}`; both were re-proven as method-not-allowed
- Do not assume the fallback public invoice consumes the registered project-hour reserve; it creates the customer-facing invoice side effect but leaves `includeHours=false`
- Do use the proactive `GET /ledger/account` in parallel with `GET /ledger/vatType` — it costs 0 extra wall-clock time and eliminates the 4xx error on unconfigured accounts; 3 out of 8 production runs on 2026-03-21 hit missing bank accounts, making the proactive approach strictly better than the old optimistic default
- Do not use `POST /order` + `PUT /order/{id}/:invoice` — use `POST /invoice?sendToCustomer=false` with embedded `orders[]` instead; it saves 1 call and is sandbox-verified for existing entities
- Do not omit `customer` from `orders[0]` when using `POST /invoice`; the endpoint returns `422 orders.customer: Kan ikke være null.`
- Do not omit `invoiceDueDate` from the root `POST /invoice` payload; it returns `422`
- Do not use `dateFrom=X&dateTo=X` in `GET /timesheet/entry` verification — `dateTo` is exclusive, so same date returns 422; use `dateTo=X+1` (next day); sandbox-verified 2026-03-22
- Do move `GET /ledger/vatType` and `GET /ledger/account` into step 1 (parallel with employee + project) — they have no dependencies; placing them later adds unnecessary sequential steps
- Do parallelize `POST /timesheet/entry` and `POST /invoice` at step 3 — invoice does NOT depend on timesheet entries existing; sandbox-verified 2026-03-22 for existing entities
- Do not try to skip the activity GET by expanding activities from the project GET — `activities` is not a valid field on ProjectDTO (returns 400), and `GET /project/projectActivity` is POST-only (returns 405); `/activity/>forTimeSheet` is the only valid activity resolver; sandbox-verified 2026-03-22
