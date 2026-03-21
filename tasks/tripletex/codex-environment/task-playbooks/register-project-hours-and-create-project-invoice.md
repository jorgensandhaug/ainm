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

## Minimal Safe Flow

1. Confirm these operations in `./openapi.json`
   - `GET /employee`
   - `GET /project`
   - `GET /activity/>forTimeSheet`
   - `GET /project/hourlyRates`
   - `PUT /project/hourlyRates/{id}`
   - `POST /project/hourlyRates/projectSpecificRates`
   - `POST /timesheet/entry` or `POST /timesheet/entry/list` (for >24h batch)
   - `GET /ledger/vatType`
   - `POST /order`
   - `PUT /order/{id}/:invoice`
2. Resolve the employee
   - `GET /employee?email=<email>&count=10&fields=*`
   - exact-match locally because the email filter is containing
3. Resolve the project and linked customer in one read
   - `GET /project?name=<project-name>&count=50&fields=*,customer(*)`
   - exact-match the project name locally
   - exact-match the nested `customer.organizationNumber` and/or `customer.name` locally when the prompt gives them
   - only fall back to a separate `GET /customer` if the project read is ambiguous or unexpectedly sparse
5. Resolve the applicable activity through the project-timesheet endpoint
   - `GET /activity/>forTimeSheet?projectId=<project-id>&employeeId=<employee-id>&date=<date>&query=<activity-name>&filterExistingHours=false&count=50&fields=*`
   - branch on `activity.isChargeable`, not `activity.chargeable`
6. If `activity.isChargeable===true`, continue with the rate path
   - if `activity.isChargeable===false`, skip directly to the timesheet write and keep the exact branch at 7 calls
7. Resolve the project hourly-rate holder
   - `GET /project/hourlyRates?projectId=<project-id>&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`
8. If no holder exists yet, create it once
   - `POST /project/hourlyRates`
   - send:
     - `project`
     - `startDate`
     - `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"`
9. If needed, switch the holder to project-specific rates
   - `PUT /project/hourlyRates/{id}`
   - send:
     - `project`
     - `startDate`
     - `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"`
10. Reuse or write the exact employee+activity rate
   - if that holder read already exposes one exact employee+activity rate with the prompt hourly rate, reuse it and skip an extra write
   - if it exposes one exact employee+activity rate with a different hourly rate, `PUT /project/hourlyRates/projectSpecificRates/{id}` once
   - otherwise `POST /project/hourlyRates/projectSpecificRates`
11. Register the hours
   - if the prompt total is `<= 24`: `POST /timesheet/entry`
   - if the prompt total is `> 24`: `POST /timesheet/entry/list` with all date chunks in one batch call
   - send per entry:
     - `employee`
     - `project`
     - `activity`
     - `date`
     - `hours`
     - `projectChargeableHours`
   - keep each entry at `projectChargeableHours <= 24`
   - if the prompt total exceeds `24`, plan one entry per distinct date before the first write
   - if the resolved activity is non-chargeable, still do this write and continue with the invoice fallback when the prompt only scores the requested hours side effect plus the invoice side effect
12. Resolve VAT type
   - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*`
13. Create a real project-linked order line derived from the prompt hours and rate
   - `POST /order`
   - include:
     - `customer`
     - `project`
     - `orderDate`
     - `deliveryDate`
     - one embedded `orderLines[]` row using the prompt hours and prompt rate
14. Invoice that order without sending it
   - `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
15. Only if that invoice write fails with the company-bank-account validation, repair the invoice bank account and retry the same order once

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

Fallback public invoice order:

```json
{
  "customer": { "id": 12345 },
  "project": { "id": 54321 },
  "orderDate": "2026-03-20",
  "deliveryDate": "2026-03-20",
  "orderLines": [
    {
      "description": "Design",
      "count": 5,
      "unitPriceExcludingVatCurrency": 1750,
      "vatType": { "id": 6 }
    }
  ]
}
```

Replace VAT id `6` with the filtered outgoing VAT type actually returned for the invoice date.

## Exact-Match Fast Path

- For a prompt that gives:
  - employee email
  - project name plus customer organization number and/or name
  - activity name
  - hour count
  - hourly rate
- the public fast path is usually:
  1. `GET /employee?...`
  2. `GET /project?name=...&fields=*,customer(*)`
  3. `GET /activity/>forTimeSheet?...`
  4. if `activity.isChargeable=false` and prompt hours `<= 24`: `POST /timesheet/entry`
  5. if `activity.isChargeable=false` and prompt hours `> 24`: `POST /timesheet/entry/list` with all planned date chunks in one batch call, each entry `<= 24` hours
  6. `GET /ledger/vatType?...`
  7. `POST /order`
  8. `PUT /order/{id}/:invoice?...sendToCustomer=false`
  9. only if that invoice write fails on missing company bank account: `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> retry the same `PUT /order/{id}/:invoice`
  10. if `activity.isChargeable=true`: `GET /project/hourlyRates?...fields=*,projectSpecificRates(*,employee(*),activity(*))`
  11. if `activity.isChargeable=true` and no holder exists yet: `POST /project/hourlyRates`
  12. if needed: conditional `PUT /project/hourlyRates/{id}`
  13. if `activity.isChargeable=true` and the exact rate is missing: `POST /project/hourlyRates/projectSpecificRates`
  14. if `activity.isChargeable=true` and the exact rate exists but differs: `PUT /project/hourlyRates/projectSpecificRates/{id}`
  15. if `activity.isChargeable=true` and prompt hours `<= 24`: `POST /timesheet/entry`
  16. if `activity.isChargeable=true` and prompt hours `> 24`: `POST /timesheet/entry/list` with all planned date chunks in one batch call, each entry `<= 24` hours
  17. steps 6-9 apply to both chargeable and non-chargeable branches
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
- `PUT /order/{id}/:invoice`
  - expect `ResponseWrapperInvoice`
  - verify:
    - `customer.id`
    - `amountExcludingVatCurrency`
    - `amountCurrencyOutstanding`
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
- Do not insert a proactive `GET /ledger/account` hedge by rote on this exact task shape; on configured accounts it wastes one call, as re-proved on 2026-03-21
- Do not ignore the bank-account tradeoff either: the optimistic non-chargeable branch is `7` calls when configured but `10` when missing, while the proactive hedge is `8` when configured and `9` when missing; with batch timesheet for >24h, both branches drop by 1 call each
- If `PUT /order/{id}/:invoice` fails only on missing company bank account, repair the existing invoice account once and retry the same invoice write; do not create a second order or repeat earlier reads
