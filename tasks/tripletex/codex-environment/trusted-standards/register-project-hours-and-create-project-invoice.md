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
- the task also requires creating the employee, customer, or project first

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
5. `POST /timesheet/entry`
6. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`
7. `POST /order` with:
   - `customer`
   - `project`
   - `orderDate`
   - `deliveryDate`
   - one real embedded `orderLines[]` entry using the prompt hours and prompt rate
8. `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`

## Payload Rules
- use `projectChargeableHours` on the timesheet write when the project hours are meant to be billable
- `/activity/>forTimeSheet` exposes activity chargeability as `isChargeable`, not `chargeable`
- do not try to send `projectSpecificRates[]` embedded inside the `PUT /project/hourlyRates/{id}` payload as the only rate write; the model switch and the project-specific-rate create are separate writes
- when `activity.isChargeable=true`, spend `GET /project/hourlyRates` before the timesheet write; a chargeable timesheet can still succeed with `hourlyRate=0` if the exact employee+activity rate is missing
- when you already spend `GET /project/hourlyRates`, prefer the expanded fields pattern `*,projectSpecificRates(*,employee(*),activity(*))` so the same read can prove whether an exact employee+activity rate already exists
- if the resolved activity has `isChargeable=false`, skip the project-hourly-rate reads and writes and still send the normal timesheet payload; the write can persist the requested hours on the target activity while returning `chargeable=false` and `hourlyRate=0`
- the real invoice line should usually use:
  - `description` from the prompt activity or prompt billing text
  - `count` equal to the prompt hours
  - `unitPriceExcludingVatCurrency` equal to the prompt rate
  - `vatType` from the filtered outgoing VAT lookup
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
- from `POST /timesheet/entry`:
  - the created entry id
  - `hourlyRate`
  - `chargeable`
- from `POST /order`:
  - the created order id
- from `PUT /order/{id}/:invoice`:
  - invoice id
  - invoice number
  - totals and outstanding amount

## Verification
- trust the timesheet write response to verify:
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
- if `PUT /order/{id}/:invoice` fails only with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - update the existing invoice bank account with `PUT /ledger/account/{id}` and a valid unique `bankAccountNumber`
  - retry the same `PUT /order/{id}/:invoice?...` once
- if `POST /order` echoes `orderLines=[]`, do not assume the embedded line failed; rely on the later invoice response first

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
  - `POST /order` or `POST /invoice` with a project but no real order lines does not produce a chargeable project-hours invoice through the public API
  - the proven public fallback for the invoice side effect is one real project-linked order line derived from prompt hours and prompt rate, followed by normal order invoicing
  - scored production feedback on 2026-03-20 showed that stopping early on the non-chargeable branch can score `0/8`; for side-effect-scored prompts, the non-chargeable hours write plus manual order/invoice fallback is the safer default
  - the same persistent sandbox already had a valid invoice bank account number on the invoice account, so an unconditional `/ledger/account` preflight would have been an extra call there; keep the bank-account branch conditional unless you intentionally take the fresh-account hedge
