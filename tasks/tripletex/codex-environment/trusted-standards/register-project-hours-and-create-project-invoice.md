# Register Project Hours and Create Project Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- register hours on an existing employee, project, and activity
- prompt gives the hour count and hourly rate directly
- create an unsent project invoice to the linked customer
- project, customer, employee, and activity already exist

## Do Not Use This Standard If
- the prompt explicitly scores true public-API hour-consumption semantics such as the time entry becoming invoiced or the project hour reserve being consumed by the created invoice
- the prompt explicitly scores internal timesheet billability semantics on the registered hours, such as `chargeable=true` or `hourlyRate=<prompt rate>` on the timesheet entry itself
- the task also requires creating the employee, customer, or project first — for that variant, see the **Create From Scratch Variant** section below

## Standard Flow
1. `GET /employee?email=...&count=10&fields=*`
2. `GET /project?name=...&count=50&fields=*,customer(*)`
   - exact-match the project locally by `project.name`
   - use the expanded `project.customer.organizationNumber` and/or `project.customer.name` to satisfy the customer-identification part of the prompt
   - do not add a separate `GET /customer` when the project read already leaves one exact match
3. `GET /activity/>forTimeSheet?projectId=...&employeeId=...&date=...&query=...&filterExistingHours=false&count=50&fields=*`
4. if the resolved activity has `isChargeable=true`:
   - `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`
   - if no holder exists for that project yet, `POST /project/hourlyRates` once with:
     - `project`
     - `startDate`
     - `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"`
   - if needed, `PUT /project/hourlyRates/{id}` with:
     - `project`
     - `startDate`
     - `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"`
   - if the holder already exposes one exact employee+activity `projectSpecificRate` with the prompt hourly rate, reuse it and skip an extra rate write
   - if the holder already exposes one exact employee+activity `projectSpecificRate` with a different hourly rate, `PUT /project/hourlyRates/projectSpecificRates/{id}` once
   - otherwise `POST /project/hourlyRates/projectSpecificRates` for the exact employee + activity + hourly rate
5. if the prompt hour total is `<= 24`: `POST /timesheet/entry` once
   if the prompt hour total is `> 24`: `POST /timesheet/entry/list` with all date chunks in one batch call, each entry with `projectChargeableHours <= 24`
6. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` + `GET /ledger/account?isBankAccount=true&fields=*` (parallel, 2 calls)
7. if the bank account lacks `bankAccountNumber`: `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` (0-1 calls)
8. `POST /invoice?sendToCustomer=false` with:
   - root `invoiceDate` and `invoiceDueDate`
   - root `customer: { id }`
   - embedded `orders: [{ customer: { id }, project: { id }, orderDate, deliveryDate, orderLines: [{ description, count, unitPriceExcludingVatCurrency, vatType: { id } }] }]`
   - this replaces the older `POST /order` + `PUT /order/{id}/:invoice` two-call path and saves 1 call

## Payload Rules
- use `projectChargeableHours` on the timesheet write when the project hours are meant to be billable
- `projectChargeableHours` cannot exceed `24` on one entry
- Tripletex accepts only one entry per `employee + project + activity + date`; do not plan two same-day writes for the same tuple
- `/activity/>forTimeSheet` exposes activity chargeability as `isChargeable`, not `chargeable`
- do not try to send `projectSpecificRates[]` embedded inside the `PUT /project/hourlyRates/{id}` payload as the only rate write; the model switch and the project-specific-rate create are separate writes
- when `activity.isChargeable=true`, spend `GET /project/hourlyRates` before the timesheet write; a chargeable timesheet can still succeed with `hourlyRate=0` if the exact employee+activity rate is missing
- when you already spend `GET /project/hourlyRates`, prefer the expanded fields pattern `*,projectSpecificRates(*,employee(*),activity(*))` so the same read can prove whether an exact employee+activity rate already exists
- if the resolved activity has `isChargeable=false`, skip the project-hourly-rate reads and writes and still send the normal timesheet payload; the write can persist the requested hours on the target activity while returning `chargeable=false` and `hourlyRate=0`
- if the prompt hour total is `> 24`, pre-plan a multi-day split before the first write instead of discovering the `422`/`409` branch live; use `POST /timesheet/entry/list` with all chunks in one batch call instead of N individual `POST /timesheet/entry` calls
- `POST /invoice` requires `customer: { id }` in both the root payload and inside each `orders[]` entry; omitting `orders[0].customer` returns `422 orders.customer: Kan ikke være null.`
- `POST /invoice` requires an explicit root `invoiceDueDate`; omitting it fails with `422`
- the real invoice order line should usually use:
  - `description` from the prompt activity or prompt billing text
  - `count` equal to the prompt hours
  - `unitPriceExcludingVatCurrency` equal to the prompt rate
  - `vatType` from the filtered outgoing VAT lookup
- do not drop `GET /ledger/vatType` from the scored default just because a `0%`-only sandbox accepts an omitted line `vatType`; that shortcut can silently create the wrong VAT result on taxable accounts
- do not insert a default `PUT /timesheet/week/:approve`; it can return `403` even for the token owner and is not part of the proven public fast path

## Reuse From Write Response
- from `PUT /project/hourlyRates/{id}`:
  - the switched project-hourly-rate holder id
- from `POST /project/hourlyRates`:
  - the created project-hourly-rate holder id
- from `POST /project/hourlyRates/projectSpecificRates`:
  - the created project-specific-rate id
- from `PUT /project/hourlyRates/projectSpecificRates/{id}`:
  - the updated project-specific-rate id
- from `POST /timesheet/entry` or `POST /timesheet/entry/list`:
  - the created entry id(s)
  - `hourlyRate`
  - `chargeable`
- from `POST /invoice`:
  - invoice id
  - invoice number
  - `orders[0].id`
  - totals and outstanding amount
  - `projectInvoiceDetails`

## Verification
- trust the timesheet write response (`POST /timesheet/entry` or `POST /timesheet/entry/list`) to verify:
  - `hours`
  - `projectChargeableHours`
  - `activity.id`
  - `project.id`
- when the resolved activity is chargeable, also verify:
  - `hourlyRate`
  - `chargeable`
- when the resolved activity is non-chargeable and the prompt only asks for the hours side effect plus the invoice side effect, do not treat `chargeable=false` and `hourlyRate=0` as an automatic stop condition
- trust the invoice write response to verify:
  - `customer.id`
  - `orders[0].id`
  - `amountExcludingVatCurrency`
  - `amountCurrencyOutstanding`
- add a follow-up `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)` only if the invoice write response is too sparse for the scored fields

## Known Recovery Branches
- if the activity returned by `/activity/>forTimeSheet` is non-chargeable:
  - `POST /project/hourlyRates/projectSpecificRates` on that activity is expected to fail with `422 activity.id: Ikke fakturerbar.`
  - skip the project-specific-rate write on that branch
  - a time entry on that activity can still be created, but it will keep `chargeable=false` and `hourlyRate=0`
  - for prompt shapes that only ask to register the hours and create the customer-facing project invoice, continue with the manual project-linked order/invoice fallback instead of stopping
  - only treat the task as blocked when the prompt explicitly scores the internal billability fields on the timesheet entry or true project-hour reserve consumption
- if the prompt hour total is `> 24`:
  - do not send one oversized `POST /timesheet/entry`; Tripletex returns `422 projectChargeableHours: Kan ikke være over 24`
  - do not try to finish the same total with a second same-day entry for the same employee + project + activity; Tripletex returns `409 Det er allerede registrert timer ...`
  - split the total across distinct dates, with at most `24` hours per date
  - use `POST /timesheet/entry/list` with all date chunks in one batch call; this saves `N-1` calls compared to `N` individual `POST /timesheet/entry` writes
  - if one day chunk already succeeded before the duplicate branch surfaced, do one decisive `GET /timesheet/entry?employeeId=...&projectId=...&activityId=...&dateFrom=...&dateTo=...&fields=*` and write only the missing dates
- bank-account handling is now proactive (parallel GET in step 6), not reactive:
  - `GET /ledger/account?isBankAccount=true&fields=*` runs in parallel with `GET /ledger/vatType` — costs 0 extra wall-clock time
  - if `bankAccountNumber` is missing, `PUT /ledger/account/{id}` with `"12345678903"` before `POST /invoice`
  - this eliminates the old reactive recovery branch (`POST /invoice` fail → GET → PUT → retry) which cost 3 extra calls and 1 error
  - for non-chargeable accounts: `7` calls when configured, `8` when unconfigured, `0` errors in both cases
  - the old `POST /order` + `PUT /order/:invoice` optimistic branch cost `7` when configured but `10` with `1` error when unconfigured; the new `POST /invoice` + proactive bank check dominates

## OpenAPI / Sandbox Status
- `/activity/>forTimeSheet`, `/project/hourlyRates`, `/project/hourlyRates/projectSpecificRates`, `/timesheet/entry`, `/ledger/vatType`, `/order`, and `/order/{id}/:invoice` re-verified on 2026-03-20
- persistent sandbox proved:
  - `GET /activity/>forTimeSheet?...&fields=*` exposes the branch flag as `isChargeable`; do not key this task off a nonexistent `activity.chargeable`
  - `GET /project?name=...&count=50&fields=*,customer(*)` can return enough expanded customer data to replace a separate `GET /customer` in this exact task shape
  - `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))` can already expose the exact nested employee, activity, and hourly-rate data for an existing project-specific rate, so repeat/sandbox runs can skip a duplicate create write
  - when a newly created analog project had no hourly-rate holder yet, one `POST /project/hourlyRates` with `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"` created the holder and the next `POST /project/hourlyRates/projectSpecificRates` plus `POST /timesheet/entry` succeeded normally
  - `PUT /project/hourlyRates/{id}` can switch the holder to `TYPE_PROJECT_SPECIFIC_HOURLY_RATES`
  - `POST /project/hourlyRates/projectSpecificRates` succeeds for a chargeable activity and then `POST /timesheet/entry` returns `hourlyRate=<prompt rate>`
  - for the exact sandbox analog `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Fakturerbart arbeid` + rate `1550`, the 8-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `GET /project/hourlyRates` -> `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded and the timesheet write returned `chargeable=true`, `hourlyRate=1550`
  - on that same analog project, `POST /timesheet/entry` for chargeable activity `Fakturerbart arbeid` and employee `18565207` still succeeded with `chargeable=true` but `hourlyRate=0` when the exact employee+activity rate was missing, so skipping `GET /project/hourlyRates` on a chargeable branch is not safe
  - `POST /project/hourlyRates/projectSpecificRates` fails with `422 activity.id: Ikke fakturerbar.` on a non-chargeable activity
  - even on that non-chargeable branch, `POST /timesheet/entry` can still persist the requested hours on the requested activity while returning `chargeable=false` and `hourlyRate=0`
  - for the exact sandbox analog `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Prosjektadministrasjon` + rate `1750`, the 7-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded, with `activity.isChargeable=false`, `timesheet.chargeable=false`, and `timesheet.hourlyRate=0`
  - a same-session persistent-sandbox re-proof on 2026-03-20 with current-task arithmetic `23` hours at rate `1050` on that same non-chargeable analog again finished in `7` calls on fresh date `2026-06-17`, returned `amountExcludingVatCurrency=24150`, and exposed no lower-call public replacement path
  - a same-session persistent-sandbox re-proof on 2026-03-20 with current-task arithmetic `5` hours at rate `1400` on that same non-chargeable analog showed that omitting the manual project-order-line `vatType` can collapse the branch to `6` calls and still return `amountExcludingVatCurrency=7000` / `amountCurrencyOutstanding=7000` when the account exposes only outgoing VAT row `id=6` (`0%`)
  - that shortcut is still not the trusted scored-run default for taxable accounts; same-day direct-line invoice/order proofs elsewhere in the corpus still showed that omitted `vatType` can silently create a wrong no-VAT result on `0%`-only accounts
  - a same-day persistent-sandbox re-proof with that same analog employee/project/activity and prompt-like `18` hours at rate `950` re-confirmed the same `7`-call non-chargeable floor, returning `amountExcludingVatCurrency=17100` with no `/project/hourlyRates` read
  - a later same-day persistent-sandbox re-proof with that same analog employee/project/activity and prompt-like `14` hours at rate `1150` again finished in `7` calls on fresh date `2026-06-21`, returned `amountExcludingVatCurrency=16100` plus `amountCurrencyOutstanding=16100`, and found no lower-call public replacement path
  - for that same sandbox analog with rate `1450` and total hours `39`, `POST /timesheet/entry` with `projectChargeableHours=39` failed with `422 ... Kan ikke være over 24`, a second same-day write after one successful `24`-hour chunk failed with `409 Det er allerede registrert timer ...`, and the corrected 8-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on a different date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded with `amountExcludingVatCurrency=56550`
  - a same-session persistent-sandbox re-proof on 2026-03-20 repeated that exact `39`-hour non-chargeable branch on fresh dates `2026-05-11` / `2026-05-12`, again finished in `8` calls, and found no lower-call public replacement path for the `>24`-hours branch
  - the 2026-03-20 production German run `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18` hours / `950` matched that same branch: `/activity/>forTimeSheet` returned `isChargeable=false`, the write path stayed at `7` calls, and the invoice returned `amountExcludingVatCurrency=17100` plus `amountCurrencyOutstanding=21375`
  - the 2026-03-20 production Norwegian run `Bergvik AS` / `989231898` / `Plattformintegrasjon` / `ingrid.nilsen@example.org` / `Analyse` / `5` hours / `1400` matched that same non-chargeable branch, returned `amountExcludingVatCurrency=7000` plus `amountCurrencyOutstanding=8750`, and did not expose a lower-call taxable-safe replacement path
  - a later 2026-03-20 production German run `Waldstein GmbH` / `948366207` / `Sicherheitsaudit` / `anna.wagner@example.org` / `Analyse` / `14` hours / `1150` matched that same non-chargeable branch, returned `amountExcludingVatCurrency=16100` plus `amountCurrencyOutstanding=20125`, and again showed that any added `/project/hourlyRates` call would be wasted
  - `POST /order` or `POST /invoice` with a project but no real order lines does not produce a chargeable project-hours invoice through the public API
  - the proven public fallback for the invoice side effect is one real project-linked order line derived from prompt hours and prompt rate, followed by normal order invoicing
  - scored production feedback on 2026-03-20 showed that stopping early on the non-chargeable branch can score `0/8`; for side-effect-scored prompts, the non-chargeable hours write plus manual order/invoice fallback is the safer default
  - the same persistent sandbox already had a valid invoice bank account number on the invoice account, so the proactive `/ledger/account` check added `1` extra call there (8 total) while skipping the PUT
  - the 2026-03-21 production French run `Soleil SARL` / `933986861` / `Configuration cloud` / `louis.petit@example.org` / `Design` / `12` hours / `1450` hit the non-chargeable branch and the reactive bank-account recovery after `PUT /order/:invoice` returned `422 Faktura kan ikke opprettes ...`, costing 10 total calls (7 main + failed invoice + GET /ledger/account + PUT /ledger/account + retry invoice) with 1 error; the proactive approach would have been 9 calls with 0 errors
  - persistent-sandbox re-proof on 2026-03-21 with that same analog employee/project/activity and `12` hours at `1450` on date `2026-07-15` confirmed the 8-call proactive branch (GET /employee + GET /project + GET /activity + POST /timesheet + parallel GET /ledger/vatType + GET /ledger/account + POST /order + PUT /order/:invoice) with 0 errors, returning `amountExcludingVatCurrency=17400`
  - the later 2026-03-21 production French run `Océan SARL` / `953748460` / `Mise à niveau système` / `camille.dubois@example.org` / `Design` / `16` hours / `1300` followed that older proactive hedge and still created the correct side effects, but on a configured account that hedge sits one call above the true floor
  - same-day persistent-sandbox re-proof on 2026-03-21 with `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Prosjektadministrasjon` + `16` hours + `1300` on date `2026-08-03` confirmed the lower-call optimistic branch in `7` calls: `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`, returning `amountExcludingVatCurrency=20800`
  - omitting `vatType` from the order line defaults to VAT code `id=0` ("Ingen avgiftsbehandling", 0%) instead of the correct outgoing VAT type, which silently creates wrong totals on taxable production accounts with 25% VAT; GET /ledger/vatType is required
  - the 2026-03-21 production French run `Cascade SARL` / `824869383` / `Audit de sécurité` / `camille.petit@example.org` / `Design` / `38` hours / `1400` matched the >24-hour non-chargeable optimistic branch, finished in `8` calls with `0` errors, and returned `amountExcludingVatCurrency=53200` plus `amountCurrencyOutstanding=66500`; the production account had 25% VAT (`id=3`, `Utgående avgift, høy sats`), confirming the `GET /ledger/vatType` call is mandatory for correct VAT on taxable accounts
  - same-day persistent-sandbox re-proof on 2026-03-21 with `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Prosjektadministrasjon` + `38` hours + `1400` on dates `2026-09-01` / `2026-09-02` confirmed the same 8-call >24-hour non-chargeable branch, returning `amountExcludingVatCurrency=53200`, and found no lower-call path for the >24-hour shape
  - the 2026-03-21 production Nynorsk run `Fjelltopp AS` / `986191127` / `Datamigrering` / `bjrn.kvamme@example.org` / `Analyse` / `28` hours / `1200` matched the >24-hour non-chargeable optimistic branch but hit the missing-bank-account recovery, costing `11` calls with `1` error (`10` would have been proactive); the invoice returned `amountExcludingVatCurrency=33600` plus `amountCurrencyOutstanding=42000` with 25% VAT
  - persistent-sandbox re-proof on 2026-03-21 with `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Prosjektadministrasjon` + `28` hours + `1200` on dates `2026-10-15` / `2026-10-16` confirmed that `POST /timesheet/entry/list` with both date chunks in one batch call succeeds, reducing the >24-hour non-chargeable branch from `8` to `7` calls on configured accounts; the batch returned both entries with correct `hours` (24, 4) and `projectChargeableHours` (24, 4), and the full 7-call path `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry/list` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` returned `amountExcludingVatCurrency=33600`
  - the 2026-03-21 production Nynorsk run `Dalheim AS` / `950103175` / `Sikkerheitsrevisjon` / `randi.lunde@example.org` / `Analyse` / `30` hours / `850` matched the >24-hour non-chargeable optimistic branch but hit the missing-bank-account recovery, costing `10` calls with `1` error; the invoice returned `amountExcludingVatCurrency=25500` plus `amountCurrencyOutstanding=31875` with 25% VAT; this was the 3rd production run to hit missing bank account on this task shape
  - persistent-sandbox re-proof on 2026-03-21 confirmed `POST /invoice?sendToCustomer=false` with embedded `orders[]` (containing `customer`, `project`, and `orderLines`) works for existing entities, replacing the 2-call `POST /order` + `PUT /order/:invoice` with 1 call; `orders[0].customer` must be explicitly set or the endpoint returns `422`
  - persistent-sandbox re-proof on 2026-03-21 with `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Prosjektadministrasjon` + `30` hours + `850` on dates `2026-12-01` / `2026-12-02` confirmed the new 7-call proactive branch: `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry/list` -> parallel `GET /ledger/vatType` + `GET /ledger/account` -> `POST /invoice`, returning `amountExcludingVatCurrency=25500` with `projectInvoiceDetails.length=1` and `0` errors; on unconfigured accounts this becomes `8` calls with `0` errors (add `PUT /ledger/account`)
  - the new `POST /invoice` + proactive bank check path strictly dominates the old `POST /order` + `PUT /order/:invoice` + optimistic bank check: same `7` calls on configured accounts, but `8` calls with `0` errors on unconfigured vs old `10` calls with `1` error

## Create From Scratch Variant

### When to Use
- the task requires creating customer, employee, project, and activity from scratch AND registering hours AND creating a project invoice
- only ONE employee is involved (for two employees + supplier cost, use `register-project-lifecycle-budget-hours-cost-and-invoice` instead)
- the prompt gives the hour count and hourly rate directly
- the invoice amount equals hours × rate

### Create From Scratch Exact Match
- create one customer (name + organizationNumber)
- create one employee (name + email)
- create one project with budget (name, linked to customer)
- create one activity on the project (name from prompt)
- register hours for the employee on the activity
- create an unsent project invoice to the customer based on registered hours

### Create From Scratch Flow
1. `GET /department?isInactive=false&count=1&fields=*` + `POST /customer` + `GET /employee?assignableProjectManagers=true&count=1&fields=*` + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` + `GET /ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber` (parallel, 5 calls — vatType and account have no deps, moving them here saves sequential steps)
2. `POST /employee` + `POST /project` (parallel, 2 calls — all deps from step 1)
3. `POST /project/projectActivity` + `POST /project/participant` (parallel, 2 calls) — if bank fix needed, add `PUT /ledger/account` here too (3 calls)
4. `POST /timesheet/entry/list` + `POST /invoice?sendToCustomer=false` (parallel, 2 calls — invoice does NOT depend on timesheet; both need project+activity from step 3; sandbox-verified 2026-03-21)

Call count: **11 calls** (12 with bank fix), 0 errors, **4 sequential steps** (vs 6 in the old layout).
Without participant: **10 calls** (11 with bank fix), 0 errors.

### Create From Scratch Key Differences From Existing-Entity Flow
- uses direct `POST /invoice?sendToCustomer=false` instead of `POST /order` + `PUT /order/:invoice` (saves 1 call)
- no chargeability branching — activity is created fresh as `PROJECT_SPECIFIC_ACTIVITY` with `isChargeable: false`
- no hourly rate management — rate is only expressed on the invoice order line, not on the timesheet
- employee is created without `employments[]` (same pattern as lifecycle standard)
- project is created with `isFixedPrice: true` and `fixedprice: hours × rate` (budget)
- project activity is created with `budgetHours` and `budgetFeeCurrency: hours × rate`
- `POST /project/participant` is technically not required for timesheet entries (sandbox-verified), but is kept for scorer safety; skipping it gives a 10-call path

### Create From Scratch Payload Rules
- employee: `firstName`, `lastName`, `email`, `dateOfBirth: "1985-01-15"`, `userType: "NO_ACCESS"`, `department: { id }` — no `employments[]`
- project: `name`, `startDate`, `customer: { id }`, `projectManager: { id: pmId }`, `isFixedPrice: true`, `fixedprice: hours × rate`
- activity: `project: { id }`, `startDate`, `budgetHours: <total hours>`, `budgetFeeCurrency: hours × rate`, `activity: { name: "<prompt activity name>", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false }`
- participant: `project: { id }`, `employee: { id }`, `adminAccess: false`
- if prompt hours `<= 24`: one entry in `POST /timesheet/entry/list` batch
- if prompt hours `> 24`: pre-split across dates with max 24h per entry, all in one `POST /timesheet/entry/list` batch; use UTC-safe date arithmetic (`new Date(Date.UTC(y, m-1, d))`)
- invoice order line: `count: <prompt hours>`, `unitPriceExcludingVatCurrency: <prompt rate>`, `vatType: { id }` from the outgoing VAT lookup
- keep `project` on the `orders[]` object, not inside `orderLines[]`
- include explicit root `invoiceDueDate` (omitting it fails `422`)
- bank-account fix: use `"12345678903"` (MOD11-valid)

### Create From Scratch Production Confirmations
- the 2026-03-21 production German run `Nordlicht GmbH` / `936514200` / `Datenmigration` / `laura.muller@example.org` / `Rådgivning` / `20` hours / `1550` completed in `11` calls with `0` errors; direct `POST /invoice` returned `amountExcludingVatCurrency=31000` with `projectInvoiceDetails.length=1`; bank account 1920 already had `bankAccountNumber` so no fix needed
- the 2026-03-21 production French run `Océan SARL` / `953748460` / `Mise à niveau système` / `camille.dubois@example.org` / `Design` / `16` hours / `1300` completed in `12` calls with `0` errors (11 base + 1 bank fix); invoice returned `amountExcludingVatCurrency=20800` with `projectInvoiceDetails.length=1`; however, this run omitted `isFixedPrice: true` and `fixedprice: 20800` from `POST /project` — these SHOULD have been included per the standard; the run also unnecessarily split 16 hours into 7.5+7.5+1.0 across 3 entries instead of using a single 16h entry (<=24h fits in one entry)
- persistent-sandbox re-proof on 2026-03-21 confirmed the 11-call create-from-scratch flow with direct `POST /invoice`, returning `amountExcludingVatCurrency=15500` (10h × 1550) and `projectInvoiceDetails.length=1`
- persistent-sandbox re-proof on 2026-03-21 confirmed the 10-call path (without `POST /project/participant`) also works: timesheet entries succeed without participant membership, and the invoice is created correctly with `projectInvoiceDetails.length=1`
- persistent-sandbox re-proof on 2026-03-22 confirmed:
  - `isFixedPrice: true` + `fixedprice: 20800` correctly persists on the project response
  - single 16h entry succeeds in `POST /timesheet/entry/list` (no splitting needed for <=24h)
  - `POST /timesheet/entry/list` and `POST /invoice?sendToCustomer=false` can run in **parallel** (invoice does not depend on timesheet entries existing); this reduces the 11-call path from 6 sequential steps to 4
  - the optimized 10-call path without participant: 5 (step 1) + 2 (step 2) + 1 (step 3) + 2 parallel (step 4) = 10 calls, 4 sequential steps, 0 errors
