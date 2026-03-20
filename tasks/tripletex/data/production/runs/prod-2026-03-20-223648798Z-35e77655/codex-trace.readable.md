# Codex Trace Snapshot

- session_id: 019d0d64-e5a3-70a1-9e5a-874fd503f5e0
- session_file: /home/jorge/.codex/sessions/2026/03/20/rollout-2026-03-20T23-36-49-019d0d64-e5a3-70a1-9e5a-874fd503f5e0.jsonl
- completed: true
- assistant_messages: 7
- tool_calls: 9
- tool_results: 9

## 2026-03-20T22:36:50.566Z task_event
event: task_started

## 2026-03-20T22:36:50.567Z user_message
Scored Tripletex run.
Follow ./AGENTS.md exactly.

Highest priorities:
- Get the final Tripletex state exactly correct.
- Use the fewest API calls possible.
- Avoid all avoidable 4xx errors.

Knowledge order:
- 1. ./trusted-standards/
- 2. ./task-playbooks/
- 3. ./openapi.json
- If this is an exact trusted-standard match, use it directly and do not re-check ./openapi.json.

Run-specific rules:
- Only interact with the Tripletex API by writing TypeScript and running it with bun.
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Registrer 5 timer for Ingrid Nilsen (ingrid.nilsen@example.org) på aktiviteten "Analyse" i prosjektet "Plattformintegrasjon" for Bergvik AS (org.nr 989231898). Timesats: 1400 kr/t. Generer en prosjektfaktura til kunden basert på de registrerte timene.

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
3HIU5-fHEeNvz2XjRFXH9bKGaRLg9VOs0G24qcFtWmQ

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts

## 2026-03-20T22:36:55.916Z assistant_message
phase: commentary

Checking exact-match trusted standard/playbook, then I’ll write one bun script in the run `scripts/` dir and execute the minimal Tripletex flow.

## 2026-03-20T22:36:55.922Z tool_call
tool: exec_command
call_id: call_HviLu1Sq4EpOOXqcUjj2D0CZ

```json
{
  "cmd": "sed -n '1,220p' ./trusted-standards/register-project-hours-and-create-project-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:36:55.922Z tool_call
tool: exec_command
call_id: call_r5tyYZmk1RYDNUykzVakYyIE

```json
{
  "cmd": "sed -n '1,260p' ./task-playbooks/register-project-hours-and-create-project-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:36:55.946Z tool_result
tool: exec_command
call_id: call_HviLu1Sq4EpOOXqcUjj2D0CZ

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,220p' ./trusted-standards/register-project-hours-and-create-project-invoice.md"
Chunk ID: ae332c
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 3314
Output:
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
   - if the prompt hour total is `<= 24`, one write is enough
   - if the prompt hour total is `> 24`, split it into one entry per date, each with `projectChargeableHours <= 24`
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
- `projectChargeableHours` cannot exceed `24` on one entry
- Tripletex accepts only one entry per `employee + project + activity + date`; do not plan two same-day writes for the same tuple
- `/activity/>forTimeSheet` exposes activity chargeability as `isChargeable`, not `chargeable`
- do not try to send `projectSpecificRates[]` embedded inside the `PUT /project/hourlyRates/{id}` payload as the only rate write; the model switch and the project-specific-rate create are separate writes
- when `activity.isChargeable=true`, spend `GET /project/hourlyRates` before the timesheet write; a chargeable timesheet can still succeed with `hourlyRate=0` if the exact employee+activity rate is missing
- when you already spend `GET /project/hourlyRates`, prefer the expanded fields pattern `*,projectSpecificRates(*,employee(*),activity(*))` so the same read can prove whether an exact employee+activity rate already exists
- if the resolved activity has `isChargeable=false`, skip the project-hourly-rate reads and writes and still send the normal timesheet payload; the write can persist the requested hours on the target activity while returning `chargeable=false` and `hourlyRate=0`
- if the prompt hour total is `> 24`, pre-plan a multi-day split before the first write instead of discovering the `422`/`409` branch live
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
- if the prompt hour total is `> 24`:
  - do not send one oversized `POST /timesheet/entry`; Tripletex returns `422 projectChargeableHours: Kan ikke være over 24`
  - do not try to finish the same total with a second same-day entry for the same employee + project + activity; Tripletex returns `409 Det er allerede registrert timer ...`
  - split the total across distinct dates, with at most `24` hours per date
  - if one day chunk already succeeded before the duplicate branch surfaced, do one decisive `GET /timesheet/entry?employeeId=...&projectId=...&activityId=...&dateFrom=...&dateTo=...&fields=*` and write only the missing dates
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
  - a same-day persistent-sandbox re-proof with that same analog employee/project/activity and prompt-like `18` hours at rate `950` re-confirmed the same `7`-call non-chargeable floor, returning `amountExcludingVatCurrency=17100` with no `/project/hourlyRates` read
  - for that same sandbox analog with rate `1450` and total hours `39`, `POST /timesheet/entry` with `projectChargeableHours=39` failed with `422 ... Kan ikke være over 24`, a second same-day write after one successful `24`-hour chunk failed with `409 Det er allerede registrert timer ...`, and the corrected 8-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on a different date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded with `amountExcludingVatCurrency=56550`
  - a same-session persistent-sandbox re-proof on 2026-03-20 repeated that exact `39`-hour non-chargeable branch on fresh dates `2026-05-11` / `2026-05-12`, again finished in `8` calls, and found no lower-call public replacement path
  - the 2026-03-20 production German run `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18` hours / `950` matched that same branch: `/activity/>forTimeSheet` returned `isChargeable=false`, the write path stayed at `7` calls, and the invoice returned `amountExcludingVatCurrency=17100` plus `amountCurrencyOutstanding=21375`
  - `POST /order` or `POST /invoice` with a project but no real order lines does not produce a chargeable project-hours invoice through the public API
  - the proven public fallback for the invoice side effect is one real project-linked order line derived from prompt hours and prompt rate, followed by normal order invoicing
  - scored production feedback on 2026-03-20 showed that stopping early on the non-chargeable branch can score `0/8`; for side-effect-scored prompts, the non-chargeable hours write plus manual order/invoice fallback is the safer default
  - the same persistent sandbox already had a valid invoice bank account number on the invoice account, so an unconditional `/ledger/account` preflight would have been an extra call there; keep the bank-account branch conditional unless you intentionally take the fresh-account hedge

```

## 2026-03-20T22:36:55.947Z tool_result
tool: exec_command
call_id: call_r5tyYZmk1RYDNUykzVakYyIE

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,260p' ./task-playbooks/register-project-hours-and-create-project-invoice.md"
Chunk ID: bcc5d8
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 3578
Output:
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
- a same-day persistent-sandbox re-proof with that same analog employee/project/activity and prompt-like `18` hours at `950` re-confirmed the same `7`-call non-chargeable floor and returned `amountExcludingVatCurrency=17100`
- for that same sandbox analog with rate `1450` and total hours `39`, `POST /timesheet/entry` with `projectChargeableHours=39` failed with `422 ... Kan ikke være over 24`
- after one successful `24`-hour chunk on `2026-03-26`, a second same-day write for `15` more hours on the same employee + project + activity failed with `409 Det er allerede registrert timer ...`
- the corrected 8-call non-chargeable branch for that `39`-hour analog succeeded with two dates: `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on another date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`, and the invoice returned `amountExcludingVatCurrency=56550`
- a same-session persistent-sandbox re-proof on 2026-03-20 repeated that exact `39`-hour branch on fresh dates `2026-05-11` / `2026-05-12`, again finished in `8` calls, and did not expose any lower-call public shortcut
- for the same analog project with `Fakturerbart arbeid` and existing exact rate `1550`, the 8-call branch that added `GET /project/hourlyRates` succeeded and the timesheet write returned `chargeable=true`, `hourlyRate=1550`
- on that same chargeable analog, `POST /timesheet/entry` can still succeed with `chargeable=true`, `hourlyRate=0` when the exact employee+activity rate is missing, so skipping `GET /project/hourlyRates` on a chargeable branch is not safe
- after that non-chargeable time write, `POST /order` with one real project-linked manual line and `PUT /order/{id}/:invoice?...sendToCustomer=false` still succeeded and produced the expected customer-facing invoice amount
- the 2026-03-20 production German run `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18` hours / `950` matched that same non-chargeable branch, finished in `7` calls, and would only have become worse by adding `/project/hourlyRates`
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
- the same persistent sandbox already had `1920` / `isInvoiceAccount=true` with `bankAccountNumber=12345678903`, so a default `/ledger/account` preflight would have been an unnecessary extra call in that exact rerun state

## Minimal Safe Flow

1. Confirm these operations in `./openapi.json`
   - `GET /employee`
   - `GET /project`
   - `GET /activity/>forTimeSheet`
   - `GET /project/hourlyRates`
   - `PUT /project/hourlyRates/{id}`
   - `POST /project/hourlyRates/projectSpecificRates`
   - `POST /timesheet/entry`
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
   - `POST /timesheet/entry`
   - send:
     - `employee`
     - `project`
     - `activity`
     - `date`
     - `hours`
     - `projectChargeableHours`
   - keep each entry at `projectChargeableHours <= 24`
   - if the prompt total exceeds `24`, plan one entry per distinct date before the first write
   - if the resolved activity is non-chargeable, still do this write and continue with the invoice fallback when the prompt only scores the requested hours side effect plus the invoice side effect
12. Resolve a valid outgoing VAT type for the invoice date
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
  5. if `activity.isChargeable=false` and prompt hours `> 24`: one `POST /timesheet/entry` per planned date chunk, each `<= 24`
  6. if `activity.isChargeable=false`: `GET /ledger/vatType?...`
  7. if `activity.isChargeable=false`: `POST /order`
  8. if `activity.isChargeable=false`: `PUT /order/{id}/:invoice?...sendToCustomer=false`
  9. if `activity.isChargeable=true`: `GET /project/hourlyRates?...fields=*,projectSpecificRates(*,employee(*),activity(*))`
  10. if `activity.isChargeable=true` and no holder exists yet: `POST /project/hourlyRates`
  11. if needed: conditional `PUT /project/hourlyRates/{id}`
  12. if `activity.isChargeable=true` and the exact rate is missing: `POST /project/hourlyRates/projectSpecificRates`
  13. if `activity.isChargeable=true` and the exact rate exists but differs: `PUT /project/hourlyRates/projectSpecificRates/{id}`
  14. if `activity.isChargeable=true` and prompt hours `<= 24`: `POST /timesheet/entry`
  15. if `activity.isChargeable=true` and prompt hours `> 24`: one `POST /timesheet/entry` per planned date chunk, each `<= 24`
  16. if `activity.isChargeable=true`: `GET /ledger/vatType?...`
  17. if `activity.isChargeable=true`: `POST /order` with one real project-linked line using prompt hours x prompt rate
  18. if `activity.isChargeable=true`: `PUT /order/{id}/:invoice?...sendToCustomer=false`
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
- `POST /timesheet/entry`
  - expect `ResponseWrapperTimesheetEntry`
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

```

## 2026-03-20T22:37:08.315Z assistant_message
phase: commentary

Trusted standard matches. I’m implementing its exact branch with a conditional non-chargeable path and the single allowed bank-account repair retry.

## 2026-03-20T22:37:08.317Z tool_call
tool: exec_command
call_id: call_4AysP8XNOFnHCmqcu7jPu8ld

```json
{
  "cmd": "ls -la /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-20T22:37:08.320Z tool_call
tool: exec_command
call_id: call_Jto3qdprahP4iCuMU6Doqo3w

```json
{
  "cmd": "rg -n \"bankAccountNumber|isInvoiceAccount|projectSpecificRates/\\{|timesheet/entry|activity/>forTimeSheet|project/hourlyRates\" -S ./trusted-standards ./task-playbooks . | sed -n '1,220p'",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:37:08.382Z tool_result
tool: exec_command
call_id: call_4AysP8XNOFnHCmqcu7jPu8ld

```text
Command: /run/current-system/sw/bin/zsh -lc 'ls -la /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts'
Chunk ID: 91dd0e
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 25
Output:
total 8
drwxr-xr-x 2 jorge users 4096 Mar 20 23:36 .
drwxr-xr-x 4 jorge users 4096 Mar 20 23:36 ..

```

## 2026-03-20T22:37:08.383Z tool_result
tool: exec_command
call_id: call_Jto3qdprahP4iCuMU6Doqo3w

```text
Command: /run/current-system/sw/bin/zsh -lc "rg -n \"bankAccountNumber|isInvoiceAccount|projectSpecificRates/\\{|timesheet/entry|activity/>forTimeSheet|project/hourlyRates\" -S ./trusted-standards ./task-playbooks . | sed -n '1,220p'"
Chunk ID: eb96af
Wall time: 0.0001 seconds
Process exited with code 0
Original token count: 12089
Output:
Total output lines: 220

./trusted-standards/register-project-hours-and-create-project-invoice.md:25:3. `GET /activity/>forTimeSheet?projectId=...&employeeId=...&date=...&query=...&filterExistingHours=false&count=50&fields=*`
./trusted-standards/register-project-hours-and-create-project-invoice.md:27:   - `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`
./trusted-standards/register-project-hours-and-create-project-invoice.md:28:   - if no holder exists for that project yet, `POST /project/hourlyRates` once with:
./trusted-standards/register-project-hours-and-create-project-invoice.md:32:   - if needed, `PUT /project/hourlyRates/{id}` with:
./trusted-standards/register-project-hours-and-create-project-invoice.md:37:   - if the holder already exposes one exact employee+activity `projectSpecificRate` with a different hourly rate, `PUT /project/hourlyRates/projectSpecificRates/{id}` once
./trusted-standards/register-project-hours-and-create-project-invoice.md:38:   - otherwise `POST /project/hourlyRates/projectSpecificRates` for the exact employee + activity + hourly rate
./trusted-standards/register-project-hours-and-create-project-invoice.md:39:5. `POST /timesheet/entry`
./trusted-standards/register-project-hours-and-create-project-invoice.md:55:- `/activity/>forTimeSheet` exposes activity chargeability as `isChargeable`, not `chargeable`
./trusted-standards/register-project-hours-and-create-project-invoice.md:56:- do not try to send `projectSpecificRates[]` embedded inside the `PUT /project/hourlyRates/{id}` payload as the only rate write; the model switch and the project-specific-rate create are separate writes
./trusted-standards/register-project-hours-and-create-project-invoice.md:57:- when `activity.isChargeable=true`, spend `GET /project/hourlyRates` before the timesheet write; a chargeable timesheet can still succeed with `hourlyRate=0` if the exact employee+activity rate is missing
./trusted-standards/register-project-hours-and-create-project-invoice.md:58:- when you already spend `GET /project/hourlyRates`, prefer the expanded fields pattern `*,projectSpecificRates(*,employee(*),activity(*))` so the same read can prove whether an exact employee+activity rate already exists
./trusted-standards/register-project-hours-and-create-project-invoice.md:69:- from `PUT /project/hourlyRates/{id}`:
./trusted-standards/register-project-hours-and-create-project-invoice.md:71:- from `POST /project/hourlyRates`:
./trusted-standards/register-project-hours-and-create-project-invoice.md:73:- from `POST /project/hourlyRates/projectSpecificRates`:
./trusted-standards/register-project-hours-and-create-project-invoice.md:75:- from `PUT /project/hourlyRates/projectSpecificRates/{id}`:
./trusted-standards/register-project-hours-and-create-project-invoice.md:77:- from `POST /timesheet/entry`:
./trusted-standards/register-project-hours-and-create-project-invoice.md:106:- if the activity returned by `/activity/>forTimeSheet` is non-chargeable:
./trusted-standards/register-project-hours-and-create-project-invoice.md:107:  - `POST /project/hourlyRates/projectSpecificRates` on that activity is expected to fail with `422 activity.id: Ikke fakturerbar.`
./trusted-standards/register-project-hours-and-create-project-invoice.md:113:  - do not send one oversized `POST /timesheet/entry`; Tripletex returns `422 projectChargeableHours: Kan ikke være over 24`
./trusted-standards/register-project-hours-and-create-project-invoice.md:116:  - if one day chunk already succeeded before the duplicate branch surfaced, do one decisive `GET /timesheet/entry?employeeId=...&projectId=...&activityId=...&dateFrom=...&dateTo=...&fields=*` and write only the missing dates
./trusted-standards/register-project-hours-and-create-project-invoice.md:119:  - update the existing invoice bank account with `PUT /ledger/account/{id}` and a valid unique `bankAccountNumber`
./trusted-standards/register-project-hours-and-create-project-invoice.md:124:- `/activity/>forTimeSheet`, `/project/hourlyRates`, `/project/hourlyRates/projectSpecificRates`, `/timesheet/entry`, `/ledger/vatType`, `/order`, and `/order/{id}/:invoice` re-verified on 2026-03-20
./trusted-standards/register-project-hours-and-create-project-invoice.md:126:  - `GET /activity/>forTimeSheet?...&fields=*` exposes the branch flag as `isChargeable`; do not key this task off a nonexistent `activity.chargeable`
./trusted-standards/register-project-hours-and-create-project-invoice.md:128:  - `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))` can already expose the exact nested employee, activity, and hourly-rate data for an existing project-specific rate, so repeat/sandbox runs can skip a duplicate create write
./trusted-standards/register-project-hours-and-create-project-invoice.md:129:  - when a newly created analog project had no hourly-rate holder yet, one `POST /project/hourlyRates` with `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"` created the holder and the next `POST /project/hourlyRates/projectSpecificRates` plus `POST /timesheet/entry` succeeded normally
./trusted-standards/register-project-hours-and-create-project-invoice.md:130:  - `PUT /project/hourlyRates/{id}` can switch the holder to `TYPE_PROJECT_SPECIFIC_HOURLY_RATES`
./trusted-standards/register-project-hours-and-create-project-invoice.md:131:  - `POST /project/hourlyRates/projectSpecificRates` succeeds for a chargeable activity and then `POST /timesheet/entry` returns `hourlyRate=<prompt rate>`
./trusted-standards/register-project-hours-and-create-project-invoice.md:132:  - for the exact sandbox analog `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Fakturerbart arbeid` + rate `1550`, the 8-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `GET /project/hourlyRates` -> `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded and the timesheet write returned `chargeable=true`, `hourlyRate=1550`
./trusted-standards/register-project-hours-and-create-project-invoice.md:133:  - on that same analog project, `POST /timesheet/entry` for chargeable activity `Fakturerbart arbeid` and employee `18565207` still succeeded with `chargeable=true` but `hourlyRate=0` when the exact employee+activity rate was missing, so skipping `GET /project/hourlyRates` on a chargeable branch is not safe
./trusted-standards/register-project-hours-and-create-project-invoice.md:134:  - `POST /project/hourlyRates/projectSpecificRates` fails with `422 activity.id: Ikke fakturerbar.` on a non-chargeable activity
./trusted-standards/register-project-hours-and-create-project-invoice.md:135:  - even on that non-chargeable branch, `POST /timesheet/entry` can still persist the requested hours on the requested activity while returning `chargeable=false` and `hourlyRate=0`
./trusted-standards/register-project-hours-and-create-project-invoice.md:136:  - for the exact sandbox analog `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Prosjektadministrasjon` + rate `1750`, the 7-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded, with `activity.isChargeable=false`, `timesheet.chargeable=false`, and `timesheet.hourlyRate=0`
./trusted-standards/register-project-hours-and-create-project-invoice.md:137:  - a same-day persistent-sandbox re-proof with that same analog employee/project/activity and prompt-like `18` hours at rate `950` re-confirmed the same `7`-call non-chargeable floor, returning `amountExcludingVatCurrency=17100` with no `/project/hourlyRates` read
./trusted-standards/register-project-hours-and-create-project-invoice.md:138:  - for that same sandbox analog with rate `1450` and total hours `39`, `POST /timesheet/entry` with `projectChargeableHours=39` failed with `422 ... Kan ikke være over 24`, a second same-day write after one successful `24`-hour chunk failed with `409 Det er allerede registrert timer ...`, and the corrected 8-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on a different date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded with `amountExcludingVatCurrency=56550`
./trusted-standards/register-project-hours-and-create-project-invoice.md:140:  - the 2026-03-20 production German run `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18` hours / `950` matched that same branch: `/activity/>forTimeSheet` returned `isChargeable=false`, the write path stayed at `7` calls, and the invoice returned `amountExcludingVatCurrency=17100` plus `amountCurrencyOutstanding=21375`
./task-playbooks/register-project-hours-and-create-project-invoice.md:19:- `GET /activity/>forTimeSheet?...&fields=*` exposes the branch flag as `isChargeable`, not `chargeable`
./task-playbooks/register-project-hours-and-create-project-invoice.md:21:- `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))` returned enough nested data to identify an already-existing exact employee+activity rate and its `hourlyRate` without a second rate-search call
./task-playbooks/register-project-hours-and-create-project-invoice.md:22:- on a newly created analog project with no hourly-rate holder yet, `POST /project/hourlyRates` with `project`, `startDate`, and `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"` created the missing holder, after which `POST /project/hourlyRates/projectSpecificRates` and `POST /timesheet/entry` succeeded normally
./task-playbooks/register-project-hours-and-create-project-invoice.md:23:- `PUT /project/hourlyRates/{id}` can switch an existing project hourly-rate holder from `TYPE_FIXED_HOURLY_RATE` to `TYPE_PROJECT_SPECIFIC_HOURLY_RATES`
./task-playbooks/register-project-hours-and-create-project-invoice.md:24:- after that model switch, `POST /project/hourlyRates/projectSpecificRates` with:
./task-playbooks/register-project-hours-and-create-project-invoice.md:29:  succeeded for a chargeable activity and the next `POST /timesheet/entry` returned:
./task-playbooks/register-project-hours-and-create-project-invoice.md:32:- the same `POST /project/hourlyRates/projectSpecificRates` failed on a non-chargeable activity with:
./task-playbooks/register-project-hours-and-create-project-invoice.md:34:- `POST /timesheet/entry` on a non-chargeable project activity still succeeded even with `projectChargeableHours`, but the write response kept:
./task-playbooks/register-project-hours-and-create-project-invoice.md:37:- for the exact sandbox analog `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Prosjektadministrasjon` + rate `1750`, the 7-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded, with `activity.isChargeable=false`, `timesheet.chargeable=false`, and `timesheet.hourlyRate=0`
./task-playbooks/register-project-hours-and-create-project-invoice.md:39:- for that same sandbox analog with rate `1450` and total hours `39`, `POST /timesheet/entry` with `projectChargeableHours=39` failed with `422 ... Kan ikke være over 24`
./task-playbooks/register-project-hours-and-create-project-invoice.md:41:- the corrected 8-call non-chargeable branch for that `39`-hour analog succeeded with two dates: `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on another date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`, and the invoice returned `amountExcludingVatCurrency=56550`
./task-playbooks/register-project-hours-and-create-project-invoice.md:43:- for the same analog project with `Fakturerbart arbeid` and existing exact rate `1550`, the 8-call branch that added `GET /project/hourlyRates` succeeded and the timesheet write returned `chargeable=true`, `hourlyRate=1550`
./task-playbooks/register-project-hours-and-create-project-invoice.md:44:- on that same chargeable analog, `POST /timesheet/entry` can still succeed with `chargeable=true`, `hourlyRate=0` when the exact employee+activity rate is missing, so skipping `GET /project/hourlyRates` on a chargeable branch is not safe
./task-playbooks/register-project-hours-and-create-project-invoice.md:46:- the 2026-03-20 production German run `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18` hours / `950` matched that same non-chargeable branch, finished in `7` calls, and would only have become worse by adding `/project/hourlyRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:74:- the same persistent sandbox already had `1920` / `isInvoiceAccount=true` with `bankAccountNumber=12345678903`, so a default `/ledger/account` preflight would have been an unnecessary extra call in that exact rerun state
./task-playbooks/register-project-hours-and-create-project-invoice.md:81:   - `GET /activity/>forTimeSheet`
./task-playbooks/register-project-hours-and-create-project-invoice.md:82:   - `GET /project/hourlyRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:83:   - `PUT /project/hourlyRates/{id}`
./task-playbooks/register-project-hours-and-create-project-invoice.md:84:   - `POST /project/hourlyRates/projectSpecificRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:85:   - `POST /timesheet/entry`
./task-playbooks/register-project-hours-and-create-project-invoice.md:98:   - `GET /activity/>forTimeSheet?projectId=<project-id>&employeeId=<employee-id>&date=<date>&query=<activity-name>&filterExistingHours=false&count=50&fields=*`
./task-playbooks/register-project-hours-and-create-project-invoice.md:103:   - `GET /project/hourlyRates?projectId=<project-id>&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`
./task-playbooks/register-project-hours-and-create-project-invoice.md:105:   - `POST /project/hourlyRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:111:   - `PUT /project/hourlyRates/{id}`
./task-playbooks/register-project-hours-and-create-project-invoice.md:118:   - if it exposes one exact employee+activity rate with a different hourly rate, `PUT /project/hourlyRates/projectSpecificRates/{id}` once
./task-playbooks/register-project-hours-and-create-project-invoice.md:119:   - otherwise `POST /project/hourlyRates/projectSpecificRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:121:   - `POST /timesheet/entry`
./task-playbooks/register-project-hours-and-create-project-invoice.md:214:  3. `GET /activity/>forTimeSheet?...`
./task-playbooks/register-project-hours-and-create-project-invoice.md:215:  4. if `activity.isChargeable=false` and prompt hours `<= 24`: `POST /timesheet/entry`
./task-playbooks/register-project-hours-and-create-project-invoice.md:216:  5. if `activity.isChargeable=false` and prompt hours `> 24`: one `POST /timesheet/entry` per planned date chunk, each `<= 24`
./task-playbooks/register-project-hours-and-create-project-invoice.md:220:  9. if `activity.isChargeable=true`: `GET /project/hourlyRates?...fields=*,projectSpecificRates(*,employee(*),activity(*))`
./task-playbooks/register-project-hours-and-create-project-invoice.md:221:  10. if `activity.isChargeable=true` and no holder exists yet: `POST /project/hourlyRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:222:  11. if needed: conditional `PUT /project/hourlyRates/{id}`
./task-playbooks/register-project-hours-and-create-project-invoice.md:223:  12. if `activity.isChargeable=true` and the exact rate is missing: `POST /project/hourlyRates/projectSpecificRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:224:  13. if `activity.isChargeable=true` and the exact rate exists but differs: `PUT /project/hourlyRates/projectSpecificRates/{id}`
./task-playbooks/register-project-hours-and-create-project-invoice.md:225:  14. if `activity.isChargeable=true` and prompt hours `<= 24`: `POST /timesheet/entry`
./task-playbooks/register-project-hours-and-create-project-invoice.md:226:  15. if `activity.isChargeable=true` and prompt hours `> 24`: one `POST /timesheet/entry` per planned date chunk, each `<= 24`
./task-playbooks/register-project-hours-and-create-project-invoice.md:236:- `POST /project/hourlyRates/projectSpecificRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:242:- `POST /timesheet/entry`
./task-playbooks/register-project-hours-and-create-project-invoice.md:267:- Do not branch on `activity.chargeable`; the field from `/activity/>forTimeSheet` is `isChargeable`, and the wrong key can silently skip the rate path on billable activities
./task-playbooks/register-project-hours-and-create-project-invoice.md:269:- Do not ignore already-expanded `projectSpecificRates` and then blindly `POST /project/hourlyRates/projectSpecificRates`; that can waste a write or trigger a duplicate-rate validation branch in persistent/repeat contexts
./task-playbooks/register-project-hours-and-create-project-invoice.md:270:- Do not assume a successful `POST /timesheet/entry` on a chargeable activity proves the prompt rate was applied; without the exact employee+activity rate it can still return `chargeable=true` and `hourlyRate=0`
./task-playbooks/register-project-hours-and-create-project-invoice.md:271:- Do not add `GET /project/hourlyRates` on the non-chargeable branch just because the prompt names an hourly rate; the exact `Windkraft GmbH` / `Sicherheitsaudit` / `Design` production run re-confirmed that this would have been a wasted call once `/activity/>forTimeSheet` already returned `isChargeable=false`
./AGENTS.md:238:- If `PUT /order/{id}/:invoice` fails with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`, do one conditional repair branch: `GET /ledger/account?isBankAccount=true&fields=*`, update the existing invoice bank account under `/ledger/account/{id}` (usually `1920` / `isInvoiceAccount=true`) with a valid unique 11-digit `bankAccountNumber`, then retry the same order invoice once; do not create a second order or project.
./AGENTS.md:239:- In fresh-account runs where `PUT /order/{id}/:invoice` is likely the first outgoing invoice of the run, a proactive `GET /ledger/account?isBankAccount=true&fields=*` is only a situational hedge against the missing-company-bank-account `422`, not the canonical exact order-to-invoice-to-payment fast path. Keep the 5-call default unless the run already gives strong reason to expect that bank-account validation branch; if you do take the hedge and the chosen invoice account already has a `bankAccountNumber`, skip the repair and reuse the same order write.
./AGENTS.md:241:- For the exact project-first fixed-price partial-billing shape, the 2026-03-20 production run for `Tindra AS` / `870827946` / `Nettbutikk-utvikling` / `kristian.nilsen@example.org` / `181650` / `50%` scored only `3.33/4` because it inserted that proactive `/ledger/account` hedge even though the read showed invoice account `1920` already had a valid `bankAccountNumber`. The lower-call replacement path for that exact shape is the optimistic 5-call branch `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`, with `/ledger/account` reserved for a proven missing-bank-account branch.
./AGENTS.md:319:- For project-hour invoice tasks, `GET /activity/>forTimeSheet?...&fields=*` exposes activity chargeability under `isChargeable`, not `chargeable`; branch the hourly-rate path off `activity.isChargeable`.
./AGENTS.md:320:- For project-hour billing tasks, switch the project hourly-rate holder with `PUT /project/hourlyRates/{id}` and then create the employee+activity rate with `POST /project/hourlyRates/projectSpecificRates`; sending embedded `projectSpecificRates[]` inside the holder `PUT` is not the proven rate-write path.
./AGENTS.md:321:- `POST /project/hourlyRates/projectSpecificRates` rejects non-chargeable activities with `422 activity.id: Ikke fakturerbar.`.
./AGENTS.md:322:- If that activity read already shows `isChargeable=false`, the proven exact-match floor for hours-plus-project-invoice tasks is the 7-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`.
./AGENTS.md:323:- The 2026-03-20 production German run `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18` hours / `950` re-confirmed that exact non-chargeable branch: `/activity/>forTimeSheet` returned `isChargeable=false`, the 7-call path succeeded, and any added `/project/hourlyRates` read or rate write would have been wasted.
./AGENTS.md:324:- If that activity read shows `isChargeable=true`, do not skip `GET /project/hourlyRates`; `POST /timesheet/entry` can still succeed on a chargeable activity with `chargeable=true` and `hourlyRate=0` when the exact employee+activity rate is missing.
./AGENTS.md:325:- `POST /timesheet/entry` on a non-chargeable project activity can still succeed even with `projectChargeableHours`, but the write response keeps `chargeable=false` and `hourlyRate=0`.
./AGENTS.md:326:- `projectChargeableHours` cannot exceed `24` on one `POST /timesheet/entry`; Tripletex returns `422 projectChargeableHours: Kan ikke være over 24`.
./AGENTS.md:327:- Tripletex allows only one time entry per `employee + project + activity + date`; a second same-day `POST /timesheet/entry` for the same tuple returns `409 Det er allerede registrert timer ...`.
./AGENTS.md:328:- For exact hours-plus-project-invoice prompts whose total hours exceed `24`, split the hours across distinct dates before the first write. On the non-chargeable branch, the new exact-match floor for a `39`-hour prompt is `8` calls: `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on another date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`.
./AGENTS.md:329:- If a high-hour run already created one day chunk before failing on a duplicate same-day follow-up, recover with one decisive `GET /timesheet/entry?employeeId=...&projectId=...&activityId=...&dateFrom=...&dateTo=...&fields=*`, then write only the missing day chunks; do not restart the whole sequence blindly.
./AGENTS.md:351:- `GET /invoice/paymentType` can also return a perfectly usable incoming bank payment type with `name=null`. Do not reject that row or spend a fallback read just because the label is absent; prefer debit-account traits such as `19xx`, `isBankAccount=true`, and `isInvoiceAccount=true`.
./AGENTS.md:352:- `GET /invoice/paymentType` can also return perfectly usable incoming payment types with `creditAccount=null`. Do not reject `Betalt til bank` just because there is no `15xx` credit account in the response; prefer a payment type whose debit account is `19xx` and marked `isBankAccount=true` or `isInvoiceAccount=true`.
./trusted-standards/create-and-send-customer-invoice.md:30:   - `PUT /ledger/account/{id}` with a checksum-valid unique 11-digit `bankAccountNumber`
./task-playbooks/register-customer-invoice-payment.md:39:  - `Betalt til bank` (`id=32813748`) had `debitAccount.number=1920`, `isBankAccount=true`, `isInvoiceAccount=true`, and `creditAccount=null`
./task-playbooks/register-customer-invoice-payment.md:78:   - if available, prefer `isBankAccount=true` or `isInvoiceAccount=true` on that debit account
./task-playbooks/register-customer-invoice-payment.md:111:-…89 tokens truncated… a second invoice bank account with the same `bankAccountNumber`
./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:96:  - update the existing invoice account with `PUT /ledger/account/{id}` using a valid unique 11-digit `bankAccountNumber`
./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:122:  - that proactive read showed invoice account `1920` already had a valid `bankAccountNumber`
./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:144:  - the same-day persistent sandbox still had invoice account `1920` with `bankAccountNumber=12345678903`, and an analog proof run measured the configured-account update branch at `5` calls plus the already-known skip-`PUT` branch at `4` calls
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:50:  - in that current sandbox state, invoice account `1920` already had `bankAccountNumber=12345678903`, so the company-bank-account validation did not reproduce there
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:60:  - `PUT /ledger/account/{id}` on the existing invoice account because `bankAccountNumber` was missing
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:71:  - that read returned invoice account `1920` with `bankAccountNumber=12345678903`, so the later invoice write already had the prerequisite it needed
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:95:  - the same-day persistent sandbox still had invoice account `1920` with `bankAccountNumber=12345678903`, and an analog proof measured the update-needed configured-account branch at `5` calls and the skip-`PUT` branch at `4`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:159:   - choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:160:   - `PUT /ledger/account/{id}` with a valid unique 11-digit `bankAccountNumber`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:273:- Do not insert a default `GET /ledger/account?isBankAccount=true&fields=*` between `POST /order` and `PUT /order/{id}/:invoice` just because the account is fresh; the 2026-03-20 `Tindra AS` production run lost the efficiency point on that exact wasted preflight when account `1920` already had a valid `bankAccountNumber`
./trusted-standards/create-order-invoice-and-register-payment.md:47:- if you take that hedge and the chosen invoice account already has a `bankAccountNumber`, skip the repair and continue with the same invoice write
./trusted-standards/create-order-invoice-and-register-payment.md:73:  - update the existing invoice bank account with `PUT /ledger/account/{id}` using a valid unique 11-digit `bankAccountNumber`
./task-playbooks/create-order-invoice-and-register-payment.md:111:   - if available, prefer `isBankAccount=true` or `isInvoiceAccount=true` on that debit account
./task-playbooks/create-order-invoice-and-register-payment.md:123:   - choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
./task-playbooks/create-order-invoice-and-register-payment.md:124:   - `PUT /ledger/account/{id}` with a valid `bankAccountNumber`
./task-playbooks/create-order-invoice-and-register-payment.md:219:- Prefer a `19xx` debit account that is also flagged as `isBankAccount=true` or `isInvoiceAccount=true`
./task-playbooks/register-project-hours-and-create-project-invoice.md:19:- `GET /activity/>forTimeSheet?...&fields=*` exposes the branch flag as `isChargeable`, not `chargeable`
./task-playbooks/register-project-hours-and-create-project-invoice.md:21:- `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))` returned enough nested data to identify an already-existing exact employee+activity rate and its `hourlyRate` without a second rate-search call
./task-playbooks/register-project-hours-and-create-project-invoice.md:22:- on a newly created analog project with no hourly-rate holder yet, `POST /project/hourlyRates` with `project`, `startDate`, and `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"` created the missing holder, after which `POST /project/hourlyRates/projectSpecificRates` and `POST /timesheet/entry` succeeded normally
./task-playbooks/register-project-hours-and-create-project-invoice.md:23:- `PUT /project/hourlyRates/{id}` can switch an existing project hourly-rate holder from `TYPE_FIXED_HOURLY_RATE` to `TYPE_PROJECT_SPECIFIC_HOURLY_RATES`
./task-playbooks/register-project-hours-and-create-project-invoice.md:24:- after that model switch, `POST /project/hourlyRates/projectSpecificRates` with:
./task-playbooks/register-project-hours-and-create-project-invoice.md:29:  succeeded for a chargeable activity and the next `POST /timesheet/entry` returned:
./task-playbooks/register-project-hours-and-create-project-invoice.md:32:- the same `POST /project/hourlyRates/projectSpecificRates` failed on a non-chargeable activity with:
./task-playbooks/register-project-hours-and-create-project-invoice.md:34:- `POST /timesheet/entry` on a non-chargeable project activity still succeeded even with `projectChargeableHours`, but the write response kept:
./task-playbooks/register-project-hours-and-create-project-invoice.md:37:- for the exact sandbox analog `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Prosjektadministrasjon` + rate `1750`, the 7-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded, with `activity.isChargeable=false`, `timesheet.chargeable=false`, and `timesheet.hourlyRate=0`
./task-playbooks/register-project-hours-and-create-project-invoice.md:39:- for that same sandbox analog with rate `1450` and total hours `39`, `POST /timesheet/entry` with `projectChargeableHours=39` failed with `422 ... Kan ikke være over 24`
./task-playbooks/register-project-hours-and-create-project-invoice.md:41:- the corrected 8-call non-chargeable branch for that `39`-hour analog succeeded with two dates: `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on another date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`, and the invoice returned `amountExcludingVatCurrency=56550`
./task-playbooks/register-project-hours-and-create-project-invoice.md:43:- for the same analog project with `Fakturerbart arbeid` and existing exact rate `1550`, the 8-call branch that added `GET /project/hourlyRates` succeeded and the timesheet write returned `chargeable=true`, `hourlyRate=1550`
./task-playbooks/register-project-hours-and-create-project-invoice.md:44:- on that same chargeable analog, `POST /timesheet/entry` can still succeed with `chargeable=true`, `hourlyRate=0` when the exact employee+activity rate is missing, so skipping `GET /project/hourlyRates` on a chargeable branch is not safe
./task-playbooks/register-project-hours-and-create-project-invoice.md:46:- the 2026-03-20 production German run `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18` hours / `950` matched that same non-chargeable branch, finished in `7` calls, and would only have become worse by adding `/project/hourlyRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:74:- the same persistent sandbox already had `1920` / `isInvoiceAccount=true` with `bankAccountNumber=12345678903`, so a default `/ledger/account` preflight would have been an unnecessary extra call in that exact rerun state
./task-playbooks/register-project-hours-and-create-project-invoice.md:81:   - `GET /activity/>forTimeSheet`
./task-playbooks/register-project-hours-and-create-project-invoice.md:82:   - `GET /project/hourlyRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:83:   - `PUT /project/hourlyRates/{id}`
./task-playbooks/register-project-hours-and-create-project-invoice.md:84:   - `POST /project/hourlyRates/projectSpecificRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:85:   - `POST /timesheet/entry`
./task-playbooks/register-project-hours-and-create-project-invoice.md:98:   - `GET /activity/>forTimeSheet?projectId=<project-id>&employeeId=<employee-id>&date=<date>&query=<activity-name>&filterExistingHours=false&count=50&fields=*`
./task-playbooks/register-project-hours-and-create-project-invoice.md:103:   - `GET /project/hourlyRates?projectId=<project-id>&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`
./task-playbooks/register-project-hours-and-create-project-invoice.md:105:   - `POST /project/hourlyRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:111:   - `PUT /project/hourlyRates/{id}`
./task-playbooks/register-project-hours-and-create-project-invoice.md:118:   - if it exposes one exact employee+activity rate with a different hourly rate, `PUT /project/hourlyRates/projectSpecificRates/{id}` once
./task-playbooks/register-project-hours-and-create-project-invoice.md:119:   - otherwise `POST /project/hourlyRates/projectSpecificRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:121:   - `POST /timesheet/entry`
./task-playbooks/register-project-hours-and-create-project-invoice.md:214:  3. `GET /activity/>forTimeSheet?...`
./task-playbooks/register-project-hours-and-create-project-invoice.md:215:  4. if `activity.isChargeable=false` and prompt hours `<= 24`: `POST /timesheet/entry`
./task-playbooks/register-project-hours-and-create-project-invoice.md:216:  5. if `activity.isChargeable=false` and prompt hours `> 24`: one `POST /timesheet/entry` per planned date chunk, each `<= 24`
./task-playbooks/register-project-hours-and-create-project-invoice.md:220:  9. if `activity.isChargeable=true`: `GET /project/hourlyRates?...fields=*,projectSpecificRates(*,employee(*),activity(*))`
./task-playbooks/register-project-hours-and-create-project-invoice.md:221:  10. if `activity.isChargeable=true` and no holder exists yet: `POST /project/hourlyRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:222:  11. if needed: conditional `PUT /project/hourlyRates/{id}`
./task-playbooks/register-project-hours-and-create-project-invoice.md:223:  12. if `activity.isChargeable=true` and the exact rate is missing: `POST /project/hourlyRates/projectSpecificRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:224:  13. if `activity.isChargeable=true` and the exact rate exists but differs: `PUT /project/hourlyRates/projectSpecificRates/{id}`
./task-playbooks/register-project-hours-and-create-project-invoice.md:225:  14. if `activity.isChargeable=true` and prompt hours `<= 24`: `POST /timesheet/entry`
./task-playbooks/register-project-hours-and-create-project-invoice.md:226:  15. if `activity.isChargeable=true` and prompt hours `> 24`: one `POST /timesheet/entry` per planned date chunk, each `<= 24`
./task-playbooks/register-project-hours-and-create-project-invoice.md:236:- `POST /project/hourlyRates/projectSpecificRates`
./task-playbooks/register-project-hours-and-create-project-invoice.md:242:- `POST /timesheet/entry`
./task-playbooks/register-project-hours-and-create-project-invoice.md:267:- Do not branch on `activity.chargeable`; the field from `/activity/>forTimeSheet` is `isChargeable`, and the wrong key can silently skip the rate path on billable activities
./task-playbooks/register-project-hours-and-create-project-invoice.md:269:- Do not ignore already-expanded `projectSpecificRates` and then blindly `POST /project/hourlyRates/projectSpecificRates`; that can waste a write or trigger a duplicate-rate validation branch in persistent/repeat contexts
./task-playbooks/register-project-hours-and-create-project-invoice.md:270:- Do not assume a successful `POST /timesheet/entry` on a chargeable activity proves the prompt rate was applied; without the exact employee+activity rate it can still return `chargeable=true` and `hourlyRate=0`
./task-playbooks/register-project-hours-and-create-project-invoice.md:271:- Do not add `GET /project/hourlyRates` on the non-chargeable branch just because the prompt names an hourly rate; the exact `Windkraft GmbH` / `Sicherheitsaudit` / `Design` production run re-confirmed that this would have been a wasted call once `/activity/>forTimeSheet` already returned `isChargeable=false`
./task-playbooks/register-customer-invoice-payment.md:39:  - `Betalt til bank` (`id=32813748`) had `debitAccount.number=1920`, `isBankAccount=true`, `isInvoiceAccount=true`, and `creditAccount=null`
./task-playbooks/register-customer-invoice-payment.md:78:   - if available, prefer `isBankAccount=true` or `isInvoiceAccount=true` on that debit account
./task-playbooks/register-customer-invoice-payment.md:111:- Prefer a `19xx` debit account with `isBankAccount=true` or `isInvoiceAccount=true` when present
./task-playbooks/create-and-send-customer-invoice.md:88:   must have `isInvoiceAccount=true`
./task-playbooks/create-and-send-customer-invoice.md:94:  "bankAccountNumber": "12345678903"
./task-playbooks/create-and-send-customer-invoice.md:170:- Do not create a second invoice bank account with the same `bankAccountNumber`
./trusted-standards/common-endpoints.md:174:- `/activity/>forTimeSheet`
./trusted-standards/common-endpoints.md:177:  - for project hour tasks, prefer `/activity/>forTimeSheet` over a broad `/activity` search because it proves the activity is actually available on the project for that employee/date
./trusted-standards/common-endpoints.md:178:  - `/activity/>forTimeSheet?...&fields=*` exposes the branch flag as `isChargeable`, not `chargeable`
./trusted-standards/common-endpoints.md:180:  - the 2026-03-20 production German `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18h` / `950` run re-confirmed that once `/activity/>forTimeSheet` already returns `isChargeable=false`, adding `GET /project/hourlyRates` would be wasted; keep the 7-call downstream floor `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
./trusted-standards/common-endpoints.md:184:- `/project/hourlyRates`
./trusted-standards/common-endpoints.md:187:- `/project/hourlyRates/{id}`
./trusted-standards/common-endpoints.md:191:- `/project/hourlyRates/projectSpecificRates`
./trusted-standards/common-endpoints.md:194:- `/project/hourlyRates/projectSpecificRates/{id}`
./trusted-standards/common-endpoints.md:199:  - only enter the hourly-rate branch when `/activity/>forTimeSheet` returned `isChargeable=true`
./trusted-standards/common-endpoints.md:200:  - if `GET /project/hourlyRates?projectId=...` returns no holder for a chargeable project, create one with `POST /project/hourlyRates` before writing the employee/activity-specific rate
./trusted-standards/common-endpoints.md:202:  - `GET /project/hourlyRates?projectId=...&fields=*,projectSpecificRates(*,employee(*),activity(*))` can expose enough nested data to detect an existing exact employee+activity rate without spending a second rate-search call
./trusted-standards/common-endpoints.md:205:  - `POST /project/hourlyRates/projectSpecificRates` rejects non-chargeable activities with `422 activity.id: Ikke fakturerbar.`
./trusted-standards/common-endpoints.md:208:- `/timesheet/entry`
./trusted-standards/common-endpoints.md:211:- `/timesheet/entry/{id}`
./trusted-standards/common-endpoints.md:220:  - `projectChargeableHours` has a hard per-entry ceiling of `24`; `POST /timesheet/entry` above that returns `422 projectChargeableHours: Kan ikke være over 24`
./trusted-standards/common-endpoints.md:223:  - if such a run already partially succeeded on one day chunk before the duplicate branch surfaced, use one decisive `GET /timesheet/entry?...` on the intended date window and write only the missing dates
./trusted-standards/common-endpoints.md:253:  - for fresh-account runs where `PUT /order/{id}/:invoice` is likely the first outgoing invoice of the run, a proactive `GET /ledger/account?isBankAccount=true&fields=*` is only a situational hedge against the missing-company-bank-account `422`, not the canonical exact path for this task shape; if you take that hedge and the chosen invoice account lacks `bankAccountNumber`, repair it first and then invoice once
./trusted-standards/common-endpoints.md:259:  - the 2026-03-20 `Tindra AS` production run lost the efficiency point after a wasted proactive `/ledger/account` read that found account `1920` already had a valid `bankAccountNumber`, and the later same-day `Soleil SARL` post-run sandbox proof showed the remaining one-call optimization is skipping `PUT /project` when the first project read already proves the target project state
./trusted-standards/common-endpoints.md:332:  - when scoring candidates from `GET /invoice/paymentType`, do not require `name`; persistent sandbox re-proof on 2026-03-20 settled invoice `2147551077` with payment type `32813748` even though `name=null`, so prefer debit-account traits such as `19xx`, `isBankAccount=true`, and `isInvoiceAccount=true`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:50:  - in that current sandbox state, invoice account `1920` already had `bankAccountNumber=12345678903`, so the company-bank-account validation did not reproduce there
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:60:  - `PUT /ledger/account/{id}` on the existing invoice account because `bankAccountNumber` was missing
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:71:  - that read returned invoice account `1920` with `bankAccountNumber=12345678903`, so the later invoice write already had the prerequisite it needed
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:95:  - the same-day persistent sandbox still had invoice account `1920` with `bankAccountNumber=12345678903`, and an analog proof measured the update-needed configured-account branch at `5` calls and the skip-`PUT` branch at `4`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:159:   - choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:160:   - `PUT /ledger/account/{id}` with a valid unique 11-digit `bankAccountNumber`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:273:- Do not insert a default `GET /ledger/account?isBankAccount=true&fields=*` between `POST /order` and `PUT /order/{id}/:invoice` just because the account is fresh; the 2026-03-20 `Tindra AS` production run lost the efficiency point on that exact wasted preflight when account `1920` already had a valid `bankAccountNumber`
./task-playbooks/create-customer-invoice.md:268:2. choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
./task-playbooks/create-customer-invoice.md:273:  "bankAccountNumber": "12345678903"
./task-playbooks/create-order-invoice-and-register-payment.md:111:   - if available, prefer `isBankAccount=true` or `isInvoiceAccount=true` on that debit account
./task-playbooks/create-order-invoice-and-register-payment.md:123:   - choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
./task-playbooks/create-order-invoice-and-register-payment.md:124:   - `PUT /ledger/account/{id}` with a valid `bankAccountNumber`
./task-playbooks/create-order-invoice-and-register-payment.md:219:- Prefer a `19xx` debit account that is also flagged as `isBankAccount=true` or `isInvoiceAccount=true`
./trusted-standards/register-project-hours-and-create-project-invoice.md:25:3. `GET /activity/>forTimeSheet?projectId=...&employeeId=...&date=...&query=...&filterExistingHours=false&count=50&fields=*`
./trusted-standards/register-project-hours-and-create-project-invoice.md:27:   - `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`
./trusted-standards/register-project-hours-and-create-project-invoice.md:28:   - if no holder exists for that project yet, `POST /project/hourlyRates` once with:
./trusted-standards/register-project-hours-and-create-project-invoice.md:32:   - if needed, `PUT /project/hourlyRates/{id}` with:
./trusted-standards/register-project-hours-and-create-project-invoice.md:37:   - if the holder already exposes one exact employee+activity `projectSpecificRate` with a different hourly rate, `PUT /project/hourlyRates/projectSpecificRates/{id}` once
./trusted-standards/register-project-hours-and-create-project-invoice.md:38:   - otherwise `POST /project/hourlyRates/projectSpecificRates` for the exact employee + activity + hourly rate
./trusted-standards/register-project-hours-and-create-project-invoice.md:39:5. `POST /timesheet/entry`
./trusted-standards/register-project-hours-and-create-project-invoice.md:55:- `/activity/>forTimeSheet` exposes activity chargeability as `isChargeable`, not `chargeable`
./trusted-standards/register-project-hours-and-create-project-invoice.md:56:- do not try to send `projectSpecificRates[]` embedded inside the `PUT /project/hourlyRates/{id}` payload as the only rate write; the model switch and the project-specific-rate create are separate writes
./trusted-standards/register-project-hours-and-create-project-invoice.md:57:- when `activity.isChargeable=true`, spend `GET /project/hourlyRates` before the timesheet write; a chargeable timesheet can still succeed with `hourlyRate=0` if the exact employee+activity rate is missing
./trusted-standards/register-project-hours-and-create-project-invoice.md:58:- when you already spend `GET /project/hourlyRates`, prefer the expanded fields pattern `*,projectSpecificRates(*,employee(*),activity(*))` so the same read can prove whether an exact employee+activity rate already exists
./trusted-standards/register-project-hours-and-create-project-invoice.md:69:- from `PUT /project/hourlyRates/{id}`:
./trusted-standards/register-project-hours-and-create-project-invoice.md:71:- from `POST /project/hourlyRates`:
./trusted-standards/register-project-hours-and-create-project-invoice.md:73:- from `POST /project/hourlyRates/projectSpecificRates`:
./trusted-standards/register-project-hours-and-create-project-invoice.md:75:- from `PUT /project/hourlyRates/projectSpecificRates/{id}`:
./trusted-standards/register-project-hours-and-create-project-invoice.md:77:- from `POST /timesheet/entry`:
./trusted-standards/register-project-hours-and-create-project-invoice.md:106:- if the activity returned by `/activity/>forTimeSheet` is non-chargeable:
./trusted-standards/register-project-hours-and-create-project-invoice.md:107:  - `POST /project/hourlyRates/projectSpecificRates` on that activity is expected to fail with `422 activity.id: Ikke fakturerbar.`
./trusted-standards/register-project-hours-and-create-project-invoice.md:113:  - do not send one oversized `POST /timesheet/entry`; Tripletex returns `422 projectChargeableHours: Kan ikke være over 24`
./trusted-standards/register-project-hours-and-create-project-invoice.md:116:  - if one day chunk already succeeded before the duplicate branch surfaced, do one decisive `GET /timesheet/entry?employeeId=...&projectId=...&activityId=...&dateFrom=...&dateTo=...&fields=*` and write only the missing dates
./trusted-standards/register-project-hours-and-create-project-invoice.md:119:  - update the existing invoice bank account with `PUT /ledger/account/{id}` and a valid unique `bankAccountNumber`
./trusted-standards/register-project-hours-and-create-project-invoice.md:124:- `/activity/>forTimeSheet`, `/project/hourlyRates`, `/project/hourlyRates/projectSpecificRates`, `/timesheet/entry`, `/ledger/vatType`, `/order`, and `/order/{id}/:invoice` re-verified on 2026-03-20

```

## 2026-03-20T22:37:12.491Z assistant_message
phase: commentary

Writing the run script now. It will keep the exact trusted-standard call order and only branch if the activity is chargeable or invoice-bank setup is missing.

## 2026-03-20T22:37:12.492Z tool_call
tool: exec_command
call_id: call_XzkpTdDQRLdAXrl29s5mEfJw

```json
{
  "cmd": "sed -n '250,290p' ./task-playbooks/create-customer-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-20T22:37:12.500Z tool_call
tool: exec_command
call_id: call_EahmDv70AyfBiOdWYS4fmJUk

```json
{
  "cmd": "sed -n '150,170p' ./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-20T22:37:12.525Z tool_result
tool: exec_command
call_id: call_XzkpTdDQRLdAXrl29s5mEfJw

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '250,290p' ./task-playbooks/create-customer-invoice.md"
Chunk ID: 2ed7ef
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 641
Output:
  }
}
```

- that does not mean the detailed line fields are missing from the actual invoice
- the same trap still applies when the sparse response shows the correct number of line link objects; line count alone is not enough for exact verification
- if you need the exact line details, do one immediate `GET /invoice/{id}` with expanded `fields` and stop there
- if the write payload already fixed the scored line fields and the write response totals already prove the intended VAT outcome, the minimal create-only path stops without that extra read

## Bank Account Repair Branch

If `POST /invoice` fails with:

`Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`

then the practical repair path is:

1. `GET /ledger/account?isBankAccount=true&fields=*`
2. choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
3. `PUT /ledger/account/{id}` with:

```json
{
  "bankAccountNumber": "12345678903"
}
```

4. retry `POST /invoice` once
5. keep the same invoice payload on that retry; do not re-read customer, products, or `vatType` if the only failure was the company-bank-account validation

## Avoidable Mistakes

- Do not spend an unconditional `GET /ledger/account` before the first invoice write
- Do not use the send-invoice flow when the prompt only asks to create an invoice
- Do not assume the `POST /invoice` response fully expands each line just because `orderLines.length` matches the requested line count
- Do not assume `GET /product?fields=*` fully expands `vatType.percentage`; it may return only `id`/`url`
- Do not replace a clear exact-product-number prompt with a broad catalog read; use `GET /product?productNumber=...` first and only broaden if that direct resolver is incomplete or ambiguous
- Do not add `/ledger/vatType` by reflex on an exact existing-product-number create-only prompt when the resolved products already carry reusable `vatType.id`
- Do not treat `product: { number: ... }` on `POST /invoice` as a safe existing-product shortcut; sandbox created unlinked lines even though the write succeeded
- Do not assume `customer: { name, organizationNumber }` on `POST /invoice` removes the need for a customer read; sandbox still rejected the related order because `customer.id` was missing
- Do not treat inline numeric refs such as `Analysis Report (9796)` as proven `productNumber` search keys when the prompt never explicitly says those numbers are the stored Tripletex product numbers; if exact names are present, one decisive catalog read is often the lower-call path

```

## 2026-03-20T22:37:12.532Z tool_result
tool: exec_command
call_id: call_EahmDv70AyfBiOdWYS4fmJUk

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '150,170p' ./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md"
Chunk ID: 1ee445
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 478
Output:
     - `project`
     - `orderDate`
     - `deliveryDate`
     - one embedded `orderLines[]` entry for the partial amount
   - for percentage-derived milestones, send the exact 2-decimal amount; do not round values like `350650 * 0.25 = 87662.5`
10. Invoice the order without sending it
   - `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
11. Only if the invoice write fails with the company-bank-account validation, or earlier calls in the same run already proved that prerequisite is missing, repair that prerequisite and retry the same order once
   - `GET /ledger/account?isBankAccount=true&fields=*`
   - choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
   - `PUT /ledger/account/{id}` with a valid unique 11-digit `bankAccountNumber`
   - retry `PUT /order/{id}/:invoice?...` on the same order
11.5. On the exact update-needed project-first branch, choose the bank-account strategy intentionally
   - optimistic branch: `5` calls when the invoice account is already configured, `8` when the company bank account is missing and the run has to recover after the failed invoice write
   - proactive hedge branch: `6` calls when the invoice account is already configured, `7` when the company bank account is missing
   - because same-day production proved both states for this exact task family, there is still no universal winner; only spend the proactive `/ledger/account` read when the fresh-account evidence makes the missing-company-bank-account branch more likely
12. Verify from the write response first
   - reuse the invoice totals from `response.value`
13. For scored runs, stop after the successful invoice write unless the prompt explicitly requires linked-field proof
14. Only for explicit linked-field verification or post-run research, do one decisive read
   - `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)`

```

## 2026-03-20T22:38:17.096Z assistant_message
phase: commentary

Executing the script with the provided base URL/token. If Tripletex returns the known missing-bank-account validation, the script will repair once and retry the same order invoice.

## 2026-03-20T22:38:18.061Z tool_call
tool: exec_command
call_id: call_WTjbQtjV2CGAVDehh4B2FnO6

```json
{
  "cmd": "bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts/register-project-hours-and-invoice.ts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000,
  "login": true
}
```

## 2026-03-20T22:38:18.101Z tool_result
tool: exec_command
call_id: call_WTjbQtjV2CGAVDehh4B2FnO6

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts/register-project-hours-and-invoice.ts'
Chunk ID: 4b16cc
Wall time: 0.0000 seconds
Process exited with code 1
Original token count: 135
Output:
1 | const BASE_URL = process.env.TRIPLETEX_BASE_URL;
2 | const SESSION_TOKEN = process.env.TRIPLETEX_SESSION_TOKEN;
3 | 
4 | if (!BASE_URL || !SESSION_TOKEN) {
5 |   throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
                ^
error: Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN
      at /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts/register-project-hours-and-invoice.ts:5:13
      at loadAndEvaluateModule (2:1)

Bun v1.3.10 (Linux x64)

```

## 2026-03-20T22:38:19.371Z assistant_message
phase: commentary

The first run failed before any API call because the env vars were not passed. Re-running with the provided credentials now.

## 2026-03-20T22:38:21.402Z tool_call
tool: exec_command
call_id: call_wo8tkJIxXCygnTiEOLqJ9Vja

```json
{
  "cmd": "TRIPLETEX_BASE_URL='https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2' TRIPLETEX_SESSION_TOKEN='3HIU5-fHEeNvz2XjRFXH9bKGaRLg9VOs0G24qcFtWmQ' bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts/register-project-hours-and-invoice.ts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000,
  "login": true
}
```

## 2026-03-20T22:38:22.559Z tool_result
tool: exec_command
call_id: call_wo8tkJIxXCygnTiEOLqJ9Vja

```text
Command: /run/current-system/sw/bin/zsh -lc "TRIPLETEX_BASE_URL='https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2' TRIPLETEX_SESSION_TOKEN='3HIU5-fHEeNvz2XjRFXH9bKGaRLg9VOs0G24qcFtWmQ' bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts/register-project-hours-and-invoice.ts"
Chunk ID: c2e9fb
Wall time: 1.0008 seconds
Process running with session ID 10427
Original token count: 0
Output:

```

## 2026-03-20T22:38:23.775Z assistant_message
phase: commentary

The script is in-flight. I’m polling for the Tripletex result, not changing the flow.

## 2026-03-20T22:38:24.067Z tool_call
tool: write_stdin
call_id: call_JOobqFf2EooX846ZF4kJHyws

```json
{
  "session_id": 10427,
  "chars": "",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:38:24.297Z tool_result
tool: write_stdin
call_id: call_JOobqFf2EooX846ZF4kJHyws

```text
Command: /run/current-system/sw/bin/zsh -lc "TRIPLETEX_BASE_URL='https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2' TRIPLETEX_SESSION_TOKEN='3HIU5-fHEeNvz2XjRFXH9bKGaRLg9VOs0G24qcFtWmQ' bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts/register-project-hours-and-invoice.ts"
Chunk ID: 7a29fc
Wall time: 0.2294 seconds
Process exited with code 0
Original token count: 89
Output:
{
  "employeeId": 18590240,
  "projectId": 401975774,
  "activityId": 5852883,
  "activityIsChargeable": false,
  "timesheetEntryId": 175905685,
  "timesheetHourlyRate": 0,
  "timesheetChargeable": false,
  "orderId": 401975861,
  "invoiceId": 2147552371,
  "invoiceNumber": 1,
  "amountExcludingVatCurrency": 7000,
  "amountCurrencyOutstanding": 8750
}

```

## 2026-03-20T22:38:28.158Z assistant_message
phase: final_answer

Done.

5h registered 2026-03-20 for Ingrid Nilsen on `Analyse` in project `Plattformintegrasjon`.
Project invoice created: `invoiceId=2147552371`, `invoiceNumber=1`, `amountExVat=7000`, `outstanding=8750`.

Run script: [register-project-hours-and-invoice.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts/register-project-hours-and-invoice.ts)

## 2026-03-20T22:38:28.175Z task_event
event: task_complete

Done.

5h registered 2026-03-20 for Ingrid Nilsen on `Analyse` in project `Plattformintegrasjon`.
Project invoice created: `invoiceId=2147552371`, `invoiceNumber=1`, `amountExVat=7000`, `outstanding=8750`.

Run script: [register-project-hours-and-invoice.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts/register-project-hours-and-invoice.ts)
