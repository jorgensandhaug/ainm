# Codex Trace Snapshot

- session_id: 019d10a2-2901-7273-89b7-99c2a5e3d157
- session_file: /home/jorge/.codex/sessions/2026/03/21/rollout-2026-03-21T14-42-36-019d10a2-2901-7273-89b7-99c2a5e3d157.jsonl
- completed: true
- assistant_messages: 9
- tool_calls: 16
- tool_results: 16

## 2026-03-21T13:42:36.545Z task_event
event: task_started

## 2026-03-21T13:42:36.547Z user_message
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
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134233345Z-26bded68/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Enregistrez 16 heures pour Camille Dubois (camille.dubois@example.org) sur l'activité "Design" du projet "Mise à niveau système" pour Océan SARL (nº org. 953748460). Taux horaire : 1300 NOK/h. Générez une facture de projet au client basée sur les heures enregistrées.

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
t5aWk15wycvpVqQIrW4iRuKIbSnvzKSwaS4e-JLcnZg

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134233345Z-26bded68/scripts

## 2026-03-21T13:42:48.337Z assistant_message
phase: commentary

Task understood. I’m checking trusted standard/playbook for exact flow, then I’ll write one bun script in the run scripts dir and execute it.

## 2026-03-21T13:42:48.343Z tool_call
tool: exec_command
call_id: call_R5TctcGoHqFNwCN8N5COsutH

```json
{
  "cmd": "rg --files trusted-standards task-playbooks | rg 'register-project-hours-and-create-project-invoice|common-endpoints|create-customer|create-project|create-employee|create-product|project'",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-21T13:42:48.349Z tool_call
tool: exec_command
call_id: call_9oQpBEN5mJgCJab7GosRu9Wn

```json
{
  "cmd": "pwd",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 1000
}
```

## 2026-03-21T13:42:48.495Z tool_result
tool: exec_command
call_id: call_R5TctcGoHqFNwCN8N5COsutH

```text
Command: /run/current-system/sw/bin/zsh -lc "rg --files trusted-standards task-playbooks | rg 'register-project-hours-and-create-project-invoice|common-endpoints|create-customer|create-project|create-employee|create-product|project'"
Chunk ID: 5c5c8a
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 287
Output:
task-playbooks/create-customer-invoice.md
task-playbooks/create-project.md
task-playbooks/analyze-expense-increase-create-internal-projects.md
task-playbooks/create-employee.md
trusted-standards/create-customer-invoice.md
trusted-standards/common-endpoints.md
trusted-standards/create-project.md
trusted-standards/create-project-activity-with-budget.md
task-playbooks/create-customer-invoice-credit-note.md
trusted-standards/analyze-expense-increase-create-internal-projects.md
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md
task-playbooks/create-product.md
task-playbooks/create-customer.md
task-playbooks/register-project-hours-and-create-project-invoice.md
task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md
trusted-standards/create-product.md
trusted-standards/create-customer-invoice-credit-note.md
trusted-standards/create-employee.md
trusted-standards/create-customer.md
trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md
trusted-standards/register-project-hours-and-create-project-invoice.md

```

## 2026-03-21T13:42:48.497Z tool_result
tool: exec_command
call_id: call_9oQpBEN5mJgCJab7GosRu9Wn

```text
Command: /run/current-system/sw/bin/zsh -lc pwd
Chunk ID: ca564c
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 15
Output:
/home/jorge/repos/ainm/tasks/tripletex/codex-environment

```

## 2026-03-21T13:42:52.248Z assistant_message
phase: commentary

I found an exact trusted standard name match. Reading that standard first; only if task shape diverges I’ll inspect narrower references.

## 2026-03-21T13:42:52.251Z tool_call
tool: exec_command
call_id: call_EVpOpzd5KK9KncFTyATYhNUs

```json
{
  "cmd": "sed -n '1,240p' trusted-standards/register-project-hours-and-create-project-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 5000
}
```

## 2026-03-21T13:42:52.261Z tool_call
tool: exec_command
call_id: call_LmUQVh5oIPXdv25nfM5rvFHj

```json
{
  "cmd": "sed -n '1,260p' task-playbooks/register-project-hours-and-create-project-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 5000
}
```

## 2026-03-21T13:42:52.290Z tool_result
tool: exec_command
call_id: call_EVpOpzd5KK9KncFTyATYhNUs

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,240p' trusted-standards/register-project-hours-and-create-project-invoice.md"
Chunk ID: 047652
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 4293
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
6. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` and `GET /ledger/account?isBankAccount=true&fields=*` in parallel
   - the bank-account read is proactive: if the invoice account (`1920` / `isInvoiceAccount=true`) has no `bankAccountNumber`, fix it with `PUT /ledger/account/{id}` before the invoice write
   - if the invoice account already has a `bankAccountNumber`, skip the PUT and continue
   - this proactive check avoids a `422` on `PUT /order/:invoice` plus a retry, saving 1 call and 1 error on fresh accounts
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
- if the proactive `GET /ledger/account` was skipped and `PUT /order/{id}/:invoice` fails with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - update the existing invoice bank account with `PUT /ledger/account/{id}` and a valid unique `bankAccountNumber`
  - retry the same `PUT /order/{id}/:invoice?...` once
  - this reactive branch costs 3 extra calls (failed invoice + GET + PUT + retry) vs the proactive check which costs 1 extra call (GET) or 2 (GET + PUT) with 0 errors
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
  - a same-session persistent-sandbox re-proof on 2026-03-20 with current-task arithmetic `23` hours at rate `1050` on that same non-chargeable analog again finished in `7` calls on fresh date `2026-06-17`, returned `amountExcludingVatCurrency=24150`, and exposed no lower-call public replacement path
  - a same-session persistent-sandbox re-proof on 2026-03-20 with current-task arithmetic `5` hours at rate `1400` on that same non-chargeable analog showed that omitting the manual project-order-line `vatType` can collapse the branch to `6` calls and still return `amountExcludingVatCurrency=7000` / `amountCurrencyOutstanding=7000` when the account exposes only outgoing VAT row `id=6` (`0%`)
  - that shortcut is still not the trusted scored-run default for taxable accounts; same-day direct-line invoice/order proofs elsewhere in the corpus still showed that omitted `vatType` can silently create a wrong no-VAT result on `0%`-only accounts
  - a same-day persistent-sandbox re-proof with that same analog employee/project/activity and prompt-like `18` hours at rate `950` re-confirmed the same `7`-call non-chargeable floor, returning `amountExcludingVatCurrency=17100` with no `/project/hourlyRates` read
  - a later same-day persistent-sandbox re-proof with that same analog employee/project/activity and prompt-like `14` hours at rate `1150` again finished in `7` calls on fresh date `2026-06-21`, returned `amountExcludingVatCurrency=16100` plus `amountCurrencyOutstanding=16100`, and found no lower-call public replacement path
  - for that same sandbox analog with rate `1450` and total hours `39`, `POST /timesheet/entry` with `projectChargeableHours=39` failed with `422 ... Kan ikke være over 24`, a second same-day write after one successful `24`-hour chunk failed with `409 Det er allerede registrert timer ...`, and the corrected 8-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on a different date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded with `amountExcludingVatCurrency=56550`
  - a same-session persistent-sandbox re-proof on 2026-03-20 repeated that exact `39`-hour non-chargeable branch on fresh dates `2026-05-11` / `2026-05-12`, again finished in `8` calls, and found no lower-call public replacement path
  - the 2026-03-20 production German run `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18` hours / `950` matched that same branch: `/activity/>forTimeSheet` returned `isChargeable=false`, the write path stayed at `7` calls, and the invoice returned `amountExcludingVatCurrency=17100` plus `amountCurrencyOutstanding=21375`
  - the 2026-03-20 production Norwegian run `Bergvik AS` / `989231898` / `Plattformintegrasjon` / `ingrid.nilsen@example.org` / `Analyse` / `5` hours / `1400` matched that same non-chargeable branch, returned `amountExcludingVatCurrency=7000` plus `amountCurrencyOutstanding=8750`, and did not expose a lower-call taxable-safe replacement path
  - a later 2026-03-20 production German run `Waldstein GmbH` / `948366207` / `Sicherheitsaudit` / `anna.wagner@example.org` / `Analyse` / `14` hours / `1150` matched that same non-chargeable branch, returned `amountExcludingVatCurrency=16100` plus `amountCurrencyOutstanding=20125`, and again showed that any added `/project/hourlyRates` call would be wasted
  - `POST /order` or `POST /invoice` with a project but no real order lines does not produce a chargeable project-hours invoice through the public API
  - the proven public fallback for the invoice side effect is one real project-linked order line derived from prompt hours and prompt rate, followed by normal order invoicing
  - scored production feedback on 2026-03-20 showed that stopping early on the non-chargeable branch can score `0/8`; for side-effect-scored prompts, the non-chargeable hours write plus manual order/invoice fallback is the safer default
  - the same persistent sandbox already had a valid invoice bank account number on the invoice account, so the proactive `/ledger/account` check added `1` extra call there (8 total) while skipping the PUT
  - the 2026-03-21 production French run `Soleil SARL` / `933986861` / `Configuration cloud` / `louis.petit@example.org` / `Design` / `12` hours / `1450` hit the non-chargeable branch and the reactive bank-account recovery after `PUT /order/:invoice` returned `422 Faktura kan ikke opprettes ...`, costing 10 total calls (7 main + failed invoice + GET /ledger/account + PUT /ledger/account + retry invoice) with 1 error; the proactive approach would have been 9 calls with 0 errors
  - persistent-sandbox re-proof on 2026-03-21 with that same analog employee/project/activity and `12` hours at `1450` on date `2026-07-15` confirmed the 8-call proactive branch (GET /employee + GET /project + GET /activity + POST /timesheet + parallel GET /ledger/vatType + GET /ledger/account + POST /order + PUT /order/:invoice) with 0 errors, returning `amountExcludingVatCurrency=17400`
  - omitting `vatType` from the order line defaults to VAT code `id=0` ("Ingen avgiftsbehandling", 0%) instead of the correct outgoing VAT type, which silently creates wrong totals on taxable production accounts with 25% VAT; GET /ledger/vatType is required

```

## 2026-03-21T13:42:52.290Z tool_result
tool: exec_command
call_id: call_LmUQVh5oIPXdv25nfM5rvFHj

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,260p' task-playbooks/register-project-hours-and-create-project-invoice.md"
Chunk ID: 5bfd79
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 4201
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
- omitting `vatType` from the order line defaults to wrong VAT code `id=0` (0%) instead of the correct outgoing type; GET /ledger/vatType is required on taxable accounts

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
12. Resolve VAT type and proactively check bank account in parallel
   - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*`
   - `GET /ledger/account?isBankAccount=true&fields=*`
   - if the invoice account (`1920` / `isInvoiceAccount=true`) has no `bankAccountNumber`, fix it with `PUT /ledger/account/{id}` before the order write
   - if the invoice account already has a `bankAccountNumber`, skip the PUT
   - this proactive check avoids a `422` on `PUT /order/:invoice` plus a 3-call recovery (failed invoice + GET + PUT + retry), saving 1 call and 1 error on fresh accounts
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
15. Only if the proactive check was skipped and that invoice write fails with the company-bank-account validation, repair the invoice bank account and retry the same order once

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
  6. `GET /ledger/vatType?...` and `GET /ledger/account?isBankAccount=true&fields=*` in parallel
  7. if the invoice account has no `bankAccountNumber`: `PUT /ledger/account/{id}` to fix it
  8. `POST /order`
  9. `PUT /order/{id}/:invoice?...sendToCustomer=false`
  10. if `activity.isChargeable=true`: `GET /project/hourlyRates?...fields=*,projectSpecificRates(*,employee(*),activity(*))`
  11. if `activity.isChargeable=true` and no holder exists yet: `POST /project/hourlyRates`
  12. if needed: conditional `PUT /project/hourlyRates/{id}`
  13. if `activity.isChargeable=true` and the exact rate is missing: `POST /project/hourlyRates/projectSpecificRates`
  14. if `activity.isChargeable=true` and the exact rate exists but differs: `PUT /project/hourlyRates/projectSpecificRates/{id}`
  15. if `activity.isChargeable=true` and prompt hours `<= 24`: `POST /timesheet/entry`
  16. if `activity.isChargeable=true` and prompt hours `> 24`: one `POST /timesheet/entry` per planned date chunk, each `<= 24`
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
- `POST /timesheet/entry`
  - expect `ResponseWrapperTimesheetEntry`
  - verify:
    - `hours`
    - `projectChargeableHours`
    - `project.id`
    - `activity.id`

```

## 2026-03-21T13:43:03.568Z assistant_message
phase: commentary

The standard is exact match. I’m implementing that flow directly, with proactive bank-account check to avoid the known invoice 422/retry branch.

## 2026-03-21T13:43:03.571Z tool_call
tool: exec_command
call_id: call_ZinRZ5oIedJqSGCW6u1GYLMI

```json
{
  "cmd": "rg -n \"bankAccountNumber\" trusted-standards task-playbooks . | sed -n '1,160p'",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-21T13:43:03.580Z tool_call
tool: exec_command
call_id: call_8PHhs40Y29oAbOkO5w3A6vEU

```json
{
  "cmd": "ls -la /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134233345Z-26bded68/scripts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 2000
}
```

## 2026-03-21T13:43:03.638Z tool_result
tool: exec_command
call_id: call_ZinRZ5oIedJqSGCW6u1GYLMI

```text
Command: /run/current-system/sw/bin/zsh -lc "rg -n \"bankAccountNumber\" trusted-standards task-playbooks . | sed -n '1,160p'"
Chunk ID: 350d41
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 5373
Output:
Total output lines: 88

trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:34:8. if the chosen invoice bank account lacks `bankAccountNumber`, `PUT /ledger/account/{id}` once
trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:121:- if the chosen invoice bank account lacks `bankAccountNumber`:
trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:122:  - `PUT /ledger/account/{id}` with a valid `bankAccountNumber`
trusted-standards/register-project-hours-and-create-project-invoice.md:43:   - the bank-account read is proactive: if the invoice account (`1920` / `isInvoiceAccount=true`) has no `bankAccountNumber`, fix it with `PUT /ledger/account/{id}` before the invoice write
trusted-standards/register-project-hours-and-create-project-invoice.md:44:   - if the invoice account already has a `bankAccountNumber`, skip the PUT and continue
trusted-standards/register-project-hours-and-create-project-invoice.md:123:  - update the existing invoice bank account with `PUT /ledger/account/{id}` and a valid unique `bankAccountNumber`
./AGENTS.md:266:- The later 2026-03-20 production French run for `Étoile SARL` / `995085488` / `Rapport d'analyse` / `7250` exposed the conditional bank-account branch for that same exact one-line taxed create-and-send shape: `POST /customer` -> filtered outgoing `GET /ledger/vatType` -> failed `POST /invoice` with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.` -> `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` on invoice account `1920` with minimal payload `{ "bankAccountNumber": "12345678903" }` -> retry the same `POST /invoice`. Do not improvise an unverified generated bank-account number, and do not restart from `POST /customer` after that failure; if in-memory state is lost after the customer create, resume on the existing-customer branch `GET /customer?organizationNumber=...&fields=*` -> filtered `GET /ledger/vatType` -> `POST /invoice` instead of blind customer recreation.
./AGENTS.md:269:- For the exact employment-contract shape `name + birth date + nationalIdentityNumber + bankAccountNumber + department + STYRK 2511 + annual salary + percentage + start date` and no hours/day, the lower-call branch is `GET /division?count=1&fields=id` -> `POST /department` -> `POST /employee` with nested `employmentDetails` and `occupationCode: { id: 301 }`, omitting `division` only if that read returns zero rows. Persistent sandbox on 2026-03-21 proved that `occupationCode.id=301` persists as code `2511102` even with the real `nationalIdentityNumber` and `bankAccountNumber`, while `GET /employee/employment/occupationCode?code=2511&count=1000&fields=*` returned 19 exact-`2511` rows and both `occupationCode: { code: "2511" }` and `occupationCode: { code: "2511102" }` returned `201` but persisted `occupationCode: null`. Do not burn scored-run calls on the ambiguous code-search branch or on `occupationCode.code` writes for this task family.
./AGENTS.md:291:- If `PUT /order/{id}/:invoice` fails with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`, do one conditional repair branch: `GET /ledger/account?isBankAccount=true&fields=*`, update the existing invoice bank account under `/ledger/account/{id}` (usually `1920` / `isInvoiceAccount=true`) with a valid unique 11-digit `bankAccountNumber`, then retry the same order invoice once; do not create a second order or project.
./AGENTS.md:295:- For the exact project-first fixed-price partial-billing shape, the 2026-03-20 production run for `Tindra AS` / `870827946` / `Nettbutikk-utvikling` / `kristian.nilsen@example.org` / `181650` / `50%` scored only `3.33/4` because it inserted that proactive `/ledger/account` hedge even though the read showed invoice account `1920` already had a valid `bankAccountNumber`. The lower-call replacement path for that exact shape is the optimistic 5-call branch `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`, with `/ledger/account` reserved for a proven missing-bank-account branch.
task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:113:  - `PUT /ledger/account/{id}` with a valid `bankAccountNumber`
trusted-standards/onboard-employee.md:16:- prompt may provide `nationalIdentityNumber` (personnummer) and/or `bankAccountNumber` — include them directly on the employee payload
trusted-standards/onboard-employee.md:30:   - prompt identity fields (including `nationalIdentityNumber` and `bankAccountNumber` when provided)
trusted-standards/onboard-employee.md:188:  - `POST /employee` with real `nationalIdentityNumber`, real `bankAccountNumber`, and nested `occupationCode: { id: 301 }` → `201`
task-playbooks/register-project-hours-and-create-project-invoice.md:80:- the same persistent sandbox already had `1920` / `isInvoiceAccount=true` with `bankAccountNumber=12345678903`, so the proactive `/ledger/account` check added 1 extra call but skipped the PUT
task-playbooks/register-project-hours-and-create-project-invoice.md:144:   - if the invoice account (`1920` / `isInvoiceAccount=true`) has no `bankAccountNumber`, fix it with `PUT /ledger/account/{id}` before the order write
task-playbooks/register-project-hours-and-create-project-invoice.md:145:   - if the invoice account already has a `bankAccountNumber`, skip the PUT
task-playbooks/register-project-hours-and-create-project-invoice.md:231:  7. if the invoice account has no `bankAccountNumber`: `PUT /ledger/account/{id}` to fix it
task-playbooks/create-and-send-customer-invoice.md:100:  "bankAccountNumber": "12345678903"
task-playbooks/create-and-send-customer-invoice.md:107:- the known-good minimal payload on the existing invoice account is `{ "bankAccountNumber": "12345678903" }`
task-playbooks/create-and-send-customer-invoice.md:183:- Do not create a second invoice bank account with the same `bankAccountNumber`
task-playbooks/create-and-send-customer-invoice.md:211:   - update the existing invoice account with `PUT /ledger/account/{id}` and minimal payload `{ "bankAccountNumber": "12345678903" }`
trusted-standards/create-and-send-customer-invoice.md:30:   - `PUT /ledger/account/{id}` on the existing invoice account (usually `1920`) with minimal payload `{ "bankAccountNumber": "12345678903" }`
trusted-standards/create-and-send-customer-invoice.md:85:- do not invent the bank-account checksum branch during a scored run; production reflection on 2026-03-20 burned `422 bankAccountNumber: Dette er ikke et gyldig norsk kontonummer` on the wrong weight order before the valid mod-11 routine was restored
trusted-standards/create-and-send-customer-invoice.md:109:  - the later same-day French production run `Étoile SARL` / `995085488` / `Rapport d'analyse` / `7250` confirmed the conditional bank-account repair branch for the same taxed direct-line shape: after the standard `POST /customer` and filtered outgoing VAT read, the first `POST /invoice` failed on missing company bank account, `PUT /ledger/account/{id}` on invoice account `1920` with minimal payload `{ "bankAccountNumber": "12345678903" }` repaired the prerequisite, and the existing-customer resume branch `GET /customer?organizationNumber=995085488&fields=*` -> filtered outgoing VAT read -> `POST /invoice` then completed with `amountExcludingVatCurrency=7250` and `amountCurrency=9062.5`
./task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:113:  - `PUT /ledger/account/{id}` with a valid `bankAccountNumber`
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:96:  - update the existing invoice account with `PUT /ledger/account/{id}` using a valid unique 11-digit `bankAccountNumber`
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:122:  - that proactive read showed invoice account `1920` already had a valid `bankAccountNumber`
trusted-standards/set-project-fixed-price-and-invoice-partial-payme…1373 tokens truncated…nd-invoice.md:34:8. if the chosen invoice bank account lacks `bankAccountNumber`, `PUT /ledger/account/{id}` once
./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:121:- if the chosen invoice bank account lacks `bankAccountNumber`:
./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:122:  - `PUT /ledger/account/{id}` with a valid `bankAccountNumber`
./task-playbooks/create-order-invoice-and-register-payment.md:131:   - `PUT /ledger/account/{id}` with the minimal payload `{ "bankAccountNumber": "12345678903" }`
./task-playbooks/create-customer-invoice.md:273:  "bankAccountNumber": "12345678903"
task-playbooks/create-customer-invoice.md:273:  "bankAccountNumber": "12345678903"
./trusted-standards/register-project-hours-and-create-project-invoice.md:43:   - the bank-account read is proactive: if the invoice account (`1920` / `isInvoiceAccount=true`) has no `bankAccountNumber`, fix it with `PUT /ledger/account/{id}` before the invoice write
./trusted-standards/register-project-hours-and-create-project-invoice.md:44:   - if the invoice account already has a `bankAccountNumber`, skip the PUT and continue
./trusted-standards/register-project-hours-and-create-project-invoice.md:123:  - update the existing invoice bank account with `PUT /ledger/account/{id}` and a valid unique `bankAccountNumber`
./trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md:95:  - `PUT /ledger/account/{id}` on the existing invoice account with minimal payload `{ "bankAccountNumber": "12345678903" }`
trusted-standards/common-endpoints.md:360:  - for fresh-account runs where `PUT /order/{id}/:invoice` is likely the first outgoing invoice of the run, a proactive `GET /ledger/account?isBankAccount=true&fields=*` is only a situational hedge against the missing-company-bank-account `422`, not the canonical exact path for this task shape; if you take that hedge and the chosen invoice account lacks `bankAccountNumber`, repair it first and then invoice once
trusted-standards/common-endpoints.md:367:  - the 2026-03-20 `Tindra AS` production run lost the efficiency point after a wasted proactive `/ledger/account` read that found account `1920` already had a valid `bankAccountNumber`, and the later same-day `Soleil SARL` post-run sandbox proof showed the remaining one-call optimization is skipping `PUT /project` when the first project read already proves the target project state
trusted-standards/common-endpoints.md:427:  - for this exact lifecycle family, a proactive `GET /ledger/account?isBankAccount=true&fields=*` remains the 0-error hedge on fresh accounts before the invoice write; if the chosen invoice account lacks `bankAccountNumber`, repair it first and continue with the same direct invoice payload
trusted-standards/common-endpoints.md:434:  - if that first `POST /invoice` fails only on the missing-company-bank-account validation, the conditional repair remains `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` on the existing invoice account with minimal payload `{ "bankAccountNumber": "12345678903" }` -> retry the same `POST /invoice` once
./trusted-standards/create-order-invoice-and-register-payment.md:47:- if you take that hedge and the chosen invoice account already has a `bankAccountNumber`, skip the repair and continue with the same invoice write
./trusted-standards/create-order-invoice-and-register-payment.md:73:  - update the existing invoice bank account with `PUT /ledger/account/{id}` using the minimal payload `{ "bankAccountNumber": "12345678903" }`
./trusted-standards/onboard-employee.md:16:- prompt may provide `nationalIdentityNumber` (personnummer) and/or `bankAccountNumber` — include them directly on the employee payload
./trusted-standards/onboard-employee.md:30:   - prompt identity fields (including `nationalIdentityNumber` and `bankAccountNumber` when provided)
./trusted-standards/onboard-employee.md:188:  - `POST /employee` with real `nationalIdentityNumber`, real `bankAccountNumber`, and nested `occupationCode: { id: 301 }` → `201`
./trusted-standards/create-and-send-customer-invoice.md:30:   - `PUT /ledger/account/{id}` on the existing invoice account (usually `1920`) with minimal payload `{ "bankAccountNumber": "12345678903" }`
./trusted-standards/create-and-send-customer-invoice.md:85:- do not invent the bank-account checksum branch during a scored run; production reflection on 2026-03-20 burned `422 bankAccountNumber: Dette er ikke et gyldig norsk kontonummer` on the wrong weight order before the valid mod-11 routine was restored
./trusted-standards/create-and-send-customer-invoice.md:109:  - the later same-day French production run `Étoile SARL` / `995085488` / `Rapport d'analyse` / `7250` confirmed the conditional bank-account repair branch for the same taxed direct-line shape: after the standard `POST /customer` and filtered outgoing VAT read, the first `POST /invoice` failed on missing company bank account, `PUT /ledger/account/{id}` on invoice account `1920` with minimal payload `{ "bankAccountNumber": "12345678903" }` repaired the prerequisite, and the existing-customer resume branch `GET /customer?organizationNumber=995085488&fields=*` -> filtered outgoing VAT read -> `POST /invoice` then completed with `amountExcludingVatCurrency=7250` and `amountCurrency=9062.5`
./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:96:  - update the existing invoice account with `PUT /ledger/account/{id}` using a valid unique 11-digit `bankAccountNumber`
./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:122:  - that proactive read showed invoice account `1920` already had a valid `bankAccountNumber`
./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:144:  - the same-day persistent sandbox still had invoice account `1920` with `bankAccountNumber=12345678903`, and an analog proof run measured the configured-account update branch at `5` calls plus the already-known skip-`PUT` branch at `4` calls
./trusted-standards/common-endpoints.md:360:  - for fresh-account runs where `PUT /order/{id}/:invoice` is likely the first outgoing invoice of the run, a proactive `GET /ledger/account?isBankAccount=true&fields=*` is only a situational hedge against the missing-company-bank-account `422`, not the canonical exact path for this task shape; if you take that hedge and the chosen invoice account lacks `bankAccountNumber`, repair it first and then invoice once
./trusted-standards/common-endpoints.md:367:  - the 2026-03-20 `Tindra AS` production run lost the efficiency point after a wasted proactive `/ledger/account` read that found account `1920` already had a valid `bankAccountNumber`, and the later same-day `Soleil SARL` post-run sandbox proof showed the remaining one-call optimization is skipping `PUT /project` when the first project read already proves the target project state
./trusted-standards/common-endpoints.md:427:  - for this exact lifecycle family, a proactive `GET /ledger/account?isBankAccount=true&fields=*` remains the 0-error hedge on fresh accounts before the invoice write; if the chosen invoice account lacks `bankAccountNumber`, repair it first and continue with the same direct invoice payload
./trusted-standards/common-endpoints.md:434:  - if that first `POST /invoice` fails only on the missing-company-bank-account validation, the conditional repair remains `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` on the existing invoice account with minimal payload `{ "bankAccountNumber": "12345678903" }` -> retry the same `POST /invoice` once
./openapi.json:39625:          "bankAccountNumber" : {
./openapi.json:40988:          "bankAccountNumber" : {
./openapi.json:45242:          "bankAccountNumber" : {
./openapi.json:83812:          "bankAccountNumber" : {
./openapi.json:92488:          "bankAccountNumber" : {
./openapi.json:107974:          "bankAccountNumber" : {

```

## 2026-03-21T13:43:03.639Z tool_result
tool: exec_command
call_id: call_8PHhs40Y29oAbOkO5w3A6vEU

```text
Command: /run/current-system/sw/bin/zsh -lc 'ls -la /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134233345Z-26bded68/scripts'
Chunk ID: d77650
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 25
Output:
total 8
drwxr-xr-x 2 jorge users 4096 Mar 21 14:42 .
drwxr-xr-x 4 jorge users 4096 Mar 21 14:42 ..

```

## 2026-03-21T13:43:18.129Z assistant_message
phase: commentary

I have the flow. Now I’m checking one narrow repo detail: the exact project-specific-rate update shape, so the script can handle a chargeable activity without guesses.

## 2026-03-21T13:43:18.133Z tool_call
tool: exec_command
call_id: call_JGrXXBXAc98OrfZ5CYdYav4y

```json
{
  "cmd": "rg -n \"projectSpecificRates/\\{id\\}|projectSpecificRates\" trusted-standards task-playbooks AGENTS.md | sed -n '1,220p'",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 5000
}
```

## 2026-03-21T13:43:18.135Z tool_call
tool: exec_command
call_id: call_xZbKdF6CQB3b0gnyqBntnDfl

```json
{
  "cmd": "rg -n 'orderLines|unitPriceExcludingVatCurrency|projectChargeableHours|TYPE_PROJECT_SPECIFIC_HOURLY_RATES' trusted-standards/register-project-hours-and-create-project-invoice.md task-playbooks/register-project-hours-and-create-project-invoice.md | sed -n '1,220p'",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-21T13:43:18.169Z tool_result
tool: exec_command
call_id: call_JGrXXBXAc98OrfZ5CYdYav4y

```text
Command: /run/current-system/sw/bin/zsh -lc "rg -n \"projectSpecificRates/\\{id\\}|projectSpecificRates\" trusted-standards task-playbooks AGENTS.md | sed -n '1,220p'"
Chunk ID: 4cb48f
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 1763
Output:
AGENTS.md:386:- For project-hour billing tasks, switch the project hourly-rate holder with `PUT /project/hourlyRates/{id}` and then create the employee+activity rate with `POST /project/hourlyRates/projectSpecificRates`; sending embedded `projectSpecificRates[]` inside the holder `PUT` is not the proven rate-write path.
AGENTS.md:387:- `POST /project/hourlyRates/projectSpecificRates` rejects non-chargeable activities with `422 activity.id: Ikke fakturerbar.`.
trusted-standards/register-project-hours-and-create-project-invoice.md:27:   - `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`
trusted-standards/register-project-hours-and-create-project-invoice.md:37:   - if the holder already exposes one exact employee+activity `projectSpecificRate` with a different hourly rate, `PUT /project/hourlyRates/projectSpecificRates/{id}` once
trusted-standards/register-project-hours-and-create-project-invoice.md:38:   - otherwise `POST /project/hourlyRates/projectSpecificRates` for the exact employee + activity + hourly rate
trusted-standards/register-project-hours-and-create-project-invoice.md:59:- do not try to send `projectSpecificRates[]` embedded inside the `PUT /project/hourlyRates/{id}` payload as the only rate write; the model switch and the project-specific-rate create are separate writes
trusted-standards/register-project-hours-and-create-project-invoice.md:61:- when you already spend `GET /project/hourlyRates`, prefer the expanded fields pattern `*,projectSpecificRates(*,employee(*),activity(*))` so the same read can prove whether an exact employee+activity rate already exists
trusted-standards/register-project-hours-and-create-project-invoice.md:77:- from `POST /project/hourlyRates/projectSpecificRates`:
trusted-standards/register-project-hours-and-create-project-invoice.md:79:- from `PUT /project/hourlyRates/projectSpecificRates/{id}`:
trusted-standards/register-project-hours-and-create-project-invoice.md:111:  - `POST /project/hourlyRates/projectSpecificRates` on that activity is expected to fail with `422 activity.id: Ikke fakturerbar.`
trusted-standards/register-project-hours-and-create-project-invoice.md:129:- `/activity/>forTimeSheet`, `/project/hourlyRates`, `/project/hourlyRates/projectSpecificRates`, `/timesheet/entry`, `/ledger/vatType`, `/order`, and `/order/{id}/:invoice` re-verified on 2026-03-20
trusted-standards/register-project-hours-and-create-project-invoice.md:133:  - `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))` can already expose the exact nested employee, activity, and hourly-rate data for an existing project-specific rate, so repeat/sandbox runs can skip a duplicate create write
trusted-standards/register-project-hours-and-create-project-invoice.md:134:  - when a newly created analog project had no hourly-rate holder yet, one `POST /project/hourlyRates` with `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"` created the holder and the next `POST /project/hourlyRates/projectSpecificRates` plus `POST /timesheet/entry` succeeded normally
trusted-standards/register-project-hours-and-create-project-invoice.md:136:  - `POST /project/hourlyRates/projectSpecificRates` succeeds for a chargeable activity and then `POST /timesheet/entry` returns `hourlyRate=<prompt rate>`
trusted-standards/register-project-hours-and-create-project-invoice.md:139:  - `POST /project/hourlyRates/projectSpecificRates` fails with `422 activity.id: Ikke fakturerbar.` on a non-chargeable activity
trusted-standards/common-endpoints.md:293:- `/project/hourlyRates/projectSpecificRates`
trusted-standards/common-endpoints.md:296:- `/project/hourlyRates/projectSpecificRates/{id}`
trusted-standards/common-endpoints.md:304:  - `GET /project/hourlyRates?projectId=...&fields=*,projectSpecificRates(*,employee(*),activity(*))` can expose enough nested data to detect an existing exact employee+activity rate without spending a second rate-search call
trusted-standards/common-endpoints.md:306:  - do not rely on embedded `projectSpecificRates[]` inside the holder `PUT` as the only rate write
trusted-standards/common-endpoints.md:307:  - `POST /project/hourlyRates/projectSpecificRates` rejects non-chargeable activities with `422 activity.id: Ikke fakturerbar.`
task-playbooks/register-project-hours-and-create-project-invoice.md:21:- `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))` returned enough nested data to identify an already-existing exact employee+activity rate and its `hourlyRate` without a second rate-search call
task-playbooks/register-project-hours-and-create-project-invoice.md:22:- on a newly created analog project with no hourly-rate holder yet, `POST /project/hourlyRates` with `project`, `startDate`, and `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"` created the missing holder, after which `POST /project/hourlyRates/projectSpecificRates` and `POST /timesheet/entry` succeeded normally
task-playbooks/register-project-hours-and-create-project-invoice.md:24:- after that model switch, `POST /project/hourlyRates/projectSpecificRates` with:
task-playbooks/register-project-hours-and-create-project-invoice.md:32:- the same `POST /project/hourlyRates/projectSpecificRates` failed on a non-chargeable activity with:
task-playbooks/register-project-hours-and-create-project-invoice.md:93:   - `POST /project/hourlyRates/projectSpecificRates`
task-playbooks/register-project-hours-and-create-project-invoice.md:112:   - `GET /project/hourlyRates?projectId=<project-id>&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`
task-playbooks/register-project-hours-and-create-project-invoice.md:127:   - if it exposes one exact employee+activity rate with a different hourly rate, `PUT /project/hourlyRates/projectSpecificRates/{id}` once
task-playbooks/register-project-hours-and-create-project-invoice.md:128:   - otherwise `POST /project/hourlyRates/projectSpecificRates`
task-playbooks/register-project-hours-and-create-project-invoice.md:234:  10. if `activity.isChargeable=true`: `GET /project/hourlyRates?...fields=*,projectSpecificRates(*,employee(*),activity(*))`
task-playbooks/register-project-hours-and-create-project-invoice.md:237:  13. if `activity.isChargeable=true` and the exact rate is missing: `POST /project/hourlyRates/projectSpecificRates`
task-playbooks/register-project-hours-and-create-project-invoice.md:238:  14. if `activity.isChargeable=true` and the exact rate exists but differs: `PUT /project/hourlyRates/projectSpecificRates/{id}`
task-playbooks/register-project-hours-and-create-project-invoice.md:248:- `POST /project/hourlyRates/projectSpecificRates`
task-playbooks/register-project-hours-and-create-project-invoice.md:281:- Do not ignore already-expanded `projectSpecificRates` and then blindly `POST /project/hourlyRates/projectSpecificRates`; that can waste a write or trigger a duplicate-rate validation branch in persistent/repeat contexts

```

## 2026-03-21T13:43:18.173Z tool_result
tool: exec_command
call_id: call_xZbKdF6CQB3b0gnyqBntnDfl

```text
Command: /run/current-system/sw/bin/zsh -lc "rg -n 'orderLines|unitPriceExcludingVatCurrency|projectChargeableHours|TYPE_PROJECT_SPECIFIC_HOURLY_RATES' trusted-standards/register-project-hours-and-create-project-invoice.md task-playbooks/register-project-hours-and-create-project-invoice.md | sed -n '1,220p'"
Chunk ID: 5c681f
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 1603
Output:
task-playbooks/register-project-hours-and-create-project-invoice.md:22:- on a newly created analog project with no hourly-rate holder yet, `POST /project/hourlyRates` with `project`, `startDate`, and `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"` created the missing holder, after which `POST /project/hourlyRates/projectSpecificRates` and `POST /timesheet/entry` succeeded normally
task-playbooks/register-project-hours-and-create-project-invoice.md:23:- `PUT /project/hourlyRates/{id}` can switch an existing project hourly-rate holder from `TYPE_FIXED_HOURLY_RATE` to `TYPE_PROJECT_SPECIFIC_HOURLY_RATES`
task-playbooks/register-project-hours-and-create-project-invoice.md:34:- `POST /timesheet/entry` on a non-chargeable project activity still succeeded even with `projectChargeableHours`, but the write response kept:
task-playbooks/register-project-hours-and-create-project-invoice.md:43:- for that same sandbox analog with rate `1450` and total hours `39`, `POST /timesheet/entry` with `projectChargeableHours=39` failed with `422 ... Kan ikke være over 24`
task-playbooks/register-project-hours-and-create-project-invoice.md:75:- `POST /order` with one embedded project-linked line for `count=5`, `unitPriceExcludingVatCurrency=1750`, `vatType.id=6` then `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` succeeded with:
task-playbooks/register-project-hours-and-create-project-invoice.md:118:     - `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"`
task-playbooks/register-project-hours-and-create-project-invoice.md:124:     - `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"`
task-playbooks/register-project-hours-and-create-project-invoice.md:137:     - `projectChargeableHours`
task-playbooks/register-project-hours-and-create-project-invoice.md:138:   - keep each entry at `projectChargeableHours <= 24`
task-playbooks/register-project-hours-and-create-project-invoice.md:154:     - one embedded `orderLines[]` row using the prompt hours and prompt rate
task-playbooks/register-project-hours-and-create-project-invoice.md:167:  "hourlyRateModel": "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"
task-playbooks/register-project-hours-and-create-project-invoice.md:191:  "projectChargeableHours": 5
task-playbooks/register-project-hours-and-create-project-invoice.md:203:  "orderLines": [
task-playbooks/register-project-hours-and-create-project-invoice.md:207:      "unitPriceExcludingVatCurrency": 1750,
task-playbooks/register-project-hours-and-create-project-invoice.md:258:    - `projectChargeableHours`
task-playbooks/register-project-hours-and-create-project-invoice.md:273:- optional `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)`
task-playbooks/register-project-hours-and-create-project-invoice.md:284:- Do not generalize the `0%`-only sandbox shortcut of omitting `orderLines[].vatType`; taxable accounts can still silently create a wrong no-VAT invoice, so the default scored path keeps `GET /ledger/vatType`
task-playbooks/register-project-hours-and-create-project-invoice.md:285:- Do not send `projectChargeableHours > 24` in one entry; Tripletex rejects it with `422`
task-playbooks/register-project-hours-and-create-project-invoice.md:287:- Do not assume `projectChargeableHours` overrides a non-chargeable activity; the timesheet entry can still come back with `chargeable=false` and `hourlyRate=0`
trusted-standards/register-project-hours-and-create-project-invoice.md:31:     - `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"`
trusted-standards/register-project-hours-and-create-project-invoice.md:35:     - `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"`
trusted-standards/register-project-hours-and-create-project-invoice.md:41:   - if the prompt hour total is `> 24`, split it into one entry per date, each with `projectChargeableHours <= 24`
trusted-standards/register-project-hours-and-create-project-invoice.md:51:   - one real embedded `orderLines[]` entry using the prompt hours and prompt rate
trusted-standards/register-project-hours-and-create-project-invoice.md:55:- use `projectChargeableHours` on the timesheet write when the project hours are meant to be billable
trusted-standards/register-project-hours-and-create-project-invoice.md:56:- `projectChargeableHours` cannot exceed `24` on one entry
trusted-standards/register-project-hours-and-create-project-invoice.md:67:  - `unitPriceExcludingVatCurrency` equal to the prompt rate
trusted-standards/register-project-hours-and-create-project-invoice.md:95:  - `projectChargeableHours`
trusted-standards/register-project-hours-and-create-project-invoice.md:107:- add a follow-up `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)` only if the invoice write response is too sparse for the scored fields
trusted-standards/register-project-hours-and-create-project-invoice.md:117:  - do not send one oversized `POST /timesheet/entry`; Tripletex returns `422 projectChargeableHours: Kan ikke være over 24`
trusted-standards/register-project-hours-and-create-project-invoice.md:126:- if `POST /order` echoes `orderLines=[]`, do not assume the embedded line failed; rely on the later invoice response first
trusted-standards/register-project-hours-and-create-project-invoice.md:134:  - when a newly created analog project had no hourly-rate holder yet, one `POST /project/hourlyRates` with `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"` created the holder and the next `POST /project/hourlyRates/projectSpecificRates` plus `POST /timesheet/entry` succeeded normally
trusted-standards/register-project-hours-and-create-project-invoice.md:135:  - `PUT /project/hourlyRates/{id}` can switch the holder to `TYPE_PROJECT_SPECIFIC_HOURLY_RATES`
trusted-standards/register-project-hours-and-create-project-invoice.md:147:  - for that same sandbox analog with rate `1450` and total hours `39`, `POST /timesheet/entry` with `projectChargeableHours=39` failed with `422 ... Kan ikke være over 24`, a second same-day write after one successful `24`-hour chunk failed with `409 Det er allerede registrert timer ...`, and the corrected 8-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on a different date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice` succeeded with `amountExcludingVatCurrency=56550`

```

## 2026-03-21T13:43:25.131Z tool_call
tool: exec_command
call_id: call_i97vTwHdfWhV5oLT4J4JXUaP

```json
{
  "cmd": "sed -n '286,330p' trusted-standards/common-endpoints.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 3000
}
```

## 2026-03-21T13:43:25.132Z tool_call
tool: exec_command
call_id: call_LhTePQ7HysNcIcvvtpCGXo2P

```json
{
  "cmd": "sed -n '248,310p' task-playbooks/register-project-hours-and-create-project-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 3000
}
```

## 2026-03-21T13:43:25.188Z tool_result
tool: exec_command
call_id: call_i97vTwHdfWhV5oLT4J4JXUaP

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '286,330p' trusted-standards/common-endpoints.md"
Chunk ID: 26b81a
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 885
Output:
- `/project/hourlyRates`
  - `GET` search
  - `POST` create
- `/project/hourlyRates/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/project/hourlyRates/projectSpecificRates`
  - `GET` search
  - `POST` create
- `/project/hourlyRates/projectSpecificRates/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard time-registration note:
  - only enter the hourly-rate branch when `/activity/>forTimeSheet` returned `isChargeable=true`
  - if `GET /project/hourlyRates?projectId=...` returns no holder for a chargeable project, create one with `POST /project/hourlyRates` before writing the employee/activity-specific rate
  - switching an existing project hourly-rate holder to `TYPE_PROJECT_SPECIFIC_HOURLY_RATES` and then creating the employee+activity rate are separate writes
  - `GET /project/hourlyRates?projectId=...&fields=*,projectSpecificRates(*,employee(*),activity(*))` can expose enough nested data to detect an existing exact employee+activity rate without spending a second rate-search call
  - when that same holder read already shows one exact employee+activity rate with the prompt hourly rate, reuse it and skip an extra write; if it shows the exact pair with a different hourly rate, update that existing specific rate once instead of blindly posting a duplicate
  - do not rely on embedded `projectSpecificRates[]` inside the holder `PUT` as the only rate write
  - `POST /project/hourlyRates/projectSpecificRates` rejects non-chargeable activities with `422 activity.id: Ikke fakturerbar.`

## Timesheet
- `/timesheet/entry`
  - `GET` search
  - `POST` create
- `/timesheet/entry/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/timesheet/entry/list`
  - `POST` batch create (array of timesheet entries for multiple employees/dates)
  - `PUT` batch update
- `/timesheet/week/:approve`
  - `PUT` approve week
- Standard time-registration note:
  - `POST /timesheet/entry/list` accepts an array of entries and creates them all in one call; persistent sandbox on 2026-03-21 confirmed 9 entries across 2 employees in 1 call, returning `{ values: [...] }` with all created entries; use this for lifecycle tasks with many timesheet entries instead of individual `POST /timesheet/entry` calls
  - timesheet entry dates must be on or after the project `startDate`; entries before the project start fail with `422 Startdato for prosjektet ... Det kan ikke registreres timer før denne datoen.`
  - a timesheet write on a non-chargeable project activity can still succeed while returning `chargeable=false` and `hourlyRate=0`
  - a timesheet write on a chargeable project activity can also succeed with `chargeable=true` and `hourlyRate=0` when the exact employee+activity rate is missing, so the write alone does not prove the prompt rate was applied
  - `projectChargeableHours` has a hard per-entry ceiling of `24`; `POST /timesheet/entry` above that returns `422 projectChargeableHours: Kan ikke være over 24`
  - Tripletex allows only one timesheet entry per `employee + project + activity + date`; a second same-day write for the same tuple returns `409 Det er allerede registrert timer ...`
  - for project-hour prompts whose total hours exceed `24`, plan a multi-day split before the first write instead of sending one oversized entry or stacking multiple same-day entries
  - if such a run already partially succeeded on one day chunk before the duplicate branch surfaced, use one decisive `GET /timesheet/entry?...` on the intended date window and write only the missing dates

```

## 2026-03-21T13:43:25.190Z tool_result
tool: exec_command
call_id: call_LhTePQ7HysNcIcvvtpCGXo2P

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '248,310p' task-playbooks/register-project-hours-and-create-project-invoice.md"
Chunk ID: f751be
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 1017
Output:
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
- Do not assume `projectChargeableHours` overrides a non-chargeable activity; the timesheet entry can still come back with `chargeable=false` and `hourlyRate=0`
- Do not stop the run solely because of that non-chargeable timesheet response when the prompt only scores requested hours registration plus the invoice side effect; the scoring-first fallback is still the timesheet write plus a manual project-linked order/invoice
- Do not assume a positive project invoicing reserve means the public API can actually charge those hours into an invoice
- Do not use `POST /order` or `POST /invoice` with a project but no real order lines as the invoicing write; both public paths were re-proven to fail for this task shape
- Do not treat writable-looking nested `preliminaryInvoice.projectInvoiceDetails[].includeHours=true` as a working path; the server accepts or validates the payload but still persists `includeHours=false`
- Do not rely on `PUT /invoice/{id}` or `PUT /invoice/details/{id}`; both were re-proven as method-not-allowed
- Do not assume the fallback public invoice consumes the registered project-hour reserve; it creates the customer-facing invoice side effect but leaves `includeHours=false`
- Do not skip the proactive `GET /ledger/account` check in this task shape; the 2026-03-21 production run proved that the reactive recovery (failed invoice + GET + PUT + retry) costs 3 extra calls and 1 error vs the proactive check which costs 1 extra call and 0 errors
- Run `GET /ledger/vatType` and `GET /ledger/account` in parallel to minimize wall time without increasing call count

```

## 2026-03-21T13:43:44.046Z assistant_message
phase: commentary

I’m taking one more narrow reference for VAT selection logic. After that I’ll patch the script and run it.

## 2026-03-21T13:43:44.050Z tool_call
tool: exec_command
call_id: call_5uXdQL813Z6QnJDJZjBTUrYs

```json
{
  "cmd": "rg -n \"vatType\\?|typeOfVat=OUTGOING|Ingen avgiftsbehandling|25%|output vat\" trusted-standards task-playbooks | sed -n '1,220p'",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 5000
}
```

## 2026-03-21T13:43:44.051Z tool_call
tool: exec_command
call_id: call_pttkLH7p91HhZr2L5wxD8Q47

```json
{
  "cmd": "sed -n '1,220p' trusted-standards/create-customer-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 5000
}
```

## 2026-03-21T13:43:44.098Z tool_result
tool: exec_command
call_id: call_5uXdQL813Z6QnJDJZjBTUrYs

```text
Command: /run/current-system/sw/bin/zsh -lc "rg -n \"vatType\\?|typeOfVat=OUTGOING|Ingen avgiftsbehandling|25%|output vat\" trusted-standards task-playbooks | sed -n '1,220p'"
Chunk ID: aed85b
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 11026
Output:
Total output lines: 189

task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:33:- the ordinary invoice branch still worked with `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` -> `POST /order` -> `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`
task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md:72:7. `POST /project/orderline` + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*` + `GET /ledger/account?isBankAccount=true&fields=*` (parallel, 3 calls)
task-playbooks/register-project-hours-and-create-project-invoice.md:74:- in the same sandbox account, `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
task-playbooks/register-project-hours-and-create-project-invoice.md:142:   - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*`
task-playbooks/register-project-hours-and-create-project-invoice.md:230:  6. `GET /ledger/vatType?...` and `GET /ledger/account?isBankAccount=true&fields=*` in parallel
trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md:33:7. `POST /project/orderline` + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` + `GET /ledger/account?isBankAccount=true&fields=*` (parallel)
trusted-standards/register-project-hours-and-create-project-invoice.md:42:6. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` and `GET /ledger/account?isBankAccount=true&fields=*` in parallel
trusted-standards/register-project-hours-and-create-project-invoice.md:158:  - omitting `vatType` from the order line defaults to VAT code `id=0` ("Ingen avgiftsbehandling", 0%) instead of the correct outgoing VAT type, which silently creates wrong totals on taxable production accounts with 25% VAT; GET /ledger/vatType is required
task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md:40:  - omit `vatType` on the order line; the API defaults to vatType id=0 ("Ingen avgiftsbehandling", 0%) which is correct for a no-VAT reminder fee
task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md:195:  - API defaulted to vatType id=0 ("Ingen avgiftsbehandling", 0%) — correct for no-VAT reminder fees
task-playbooks/create-and-send-customer-invoice.md:57:2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
task-playbooks/create-and-send-customer-invoice.md:63:2. `GET /ledger/vatType?...`
task-playbooks/create-and-send-customer-invoice.md:71:2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
task-playbooks/create-and-send-customer-invoice.md:79:2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
task-playbooks/create-and-send-customer-invoice.md:119:`GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
task-playbooks/create-and-send-customer-invoice.md:125:- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*` returned only VAT code `6`
task-playbooks/create-and-send-customer-invoice.md:147:- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6`
task-playbooks/create-and-send-customer-invoice.md:159:For ordinary direct-line service prompts that are explicitly priced excluding VAT / MVA, the same dynamic rule becomes an exact `25%` selector:
task-playbooks/create-and-send-customer-invoice.md:162:- choose an exact `25%` row, not the first returned row
task-playbooks/create-and-send-customer-invoice.md:187:- The authoritative candidate set for invoice lines is the filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` result on the invoice date
task-playbooks/create-and-send-customer-invoice.md:199:   - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
task-playbooks/create-and-send-customer-invoice.md:203:   - for ordinary service prompts priced excluding VAT / MVA, require an exact `25%` row from that filtered result; if `25%` is absent, stop as blocked for that account
trusted-standards/create-and-send-customer-invoice.md:26:3. resolve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
trusted-standards/create-and-send-customer-invoice.md:49:- for ordinary direct-line services explicitly priced excluding VAT / MVA, select an exact `25%` row from the filtered outgoing VAT result; if no such row exists, treat the task as blocked in that account instead of falling back to `0%`
trusted-standards/create-and-send-customer-invoice.md:83:- for ordinary one-line service prompts that explicitly price the work excluding VAT / MVA, do not take the first filtered VAT row if it is `0%`; the safe branch is exact `25%` selection or a blocked conclusion for that account
trusted-standards/create-and-send-customer-invoice.md:100:  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
trusted-standards/create-and-send-customer-invoice.md:114:  - fresh-account-style branch: on the same one-line `22700` / `Design web` / `0%` shape, direct `POST /customer` with `invoiceSendMethod=MANUAL`, then `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`, then `POST /invoice` succeeded without any customer pre-read
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:32:7. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:63:- if the prompt implies a normal taxable service and the filtered outgoing VAT result contains `25%`, use that `25%` row
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:109:  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` may expose only VAT code `6` (`0%`) in that account
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:115:  - `POST /order` plus `PUT /order/{id}/:invoice` preserved a percentage-derived decimal partial amount of `87662.5` exactly; do not round `25%` milestone amounts such as `350650 * 0.25`
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:129:- post-run scoring on 2026-03-20 for `Soleil SARL` / `931336738` / `Mise à niveau infrastructure` / `nathan.thomas@example.org` / `125550` / `25%` showed that the production solution was still one call above the true minimum even after removing `/ledger/account`
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:131:  - that production account exposed outgoing VAT `25%`, and the successful invoice write proved `amountExcludingVatCurrency=31387.5` with `amountCurrencyOutstanding=39234.38`; verify the milestone amount against the excluding-VAT field, not the VAT-inclusive outstanding balance
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:132:- persistent-sandbox analog re-proof on 2026-03-20 with the same fixed-price / `25%` milestone arithmetic (`125550 * 0.25 = 31387.5`) proved the missing lower-call branch after fixture setup:
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:139:  - that production account exposed outgoing VAT `25%`, and the invoice write returned `amountExcludingVatCurrency=215375` plus `amountCurrencyOutstanding=269218.75`
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:151:- exact production reflection on 2026-03-20 for `Windkraft GmbH` / `886395582` / `Datensicherheit` / `maximilian.wagner@example.org` / `473250` / `25%` added one more same-day floor check:
task-playbooks/register-supplier-invoice.md:79:3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*`
task-playbooks/register-supplier-invoice.md:86:3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*`
task-playbooks/register-supplier-invoice.md:94:4. `GET /ledger/vatType?...`
task-playbooks/register-supplier-invoice.md:99:- 2026-03-20 persistent sandbox re-proof for `Océan Reflection SARL 321000010` / `321000010` / `services de bureau` / `56300` gross / `6500` / `25%` completed in the lower-call `5`-call create-first branch
task-playbooks/register-supplier-invoice.md:100:- 2026-03-20 persistent sandbox re-proof for this session's exact amount/account shape `Minimal Proof Supplier 007945 AS` / `910079457` / `kontortjenester` / `61600` gross / `6340` / `25%` also completed in the same lower-call `5`-call create-first branch
task-playbooks/register-supplier-invoice.md:101:- 2026-03-20 persistent sandbox re-proof for `Lumière SARL` / `913175212` / `services de bureau` / `72350` gross / `6300` / `25%` took exactly this `6`-call zero-hit branch
task-playbooks/register-supplier-invoice.md:144:- resolve VAT through `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*`
task-playbooks/register-supplier-invoice.md:146:- if several rows match the percentage, prefer the base code, typically `number="1"` for ordinary `25%` input VAT
task-playbooks/register-supplier-invoice.md:226:For `gross=39750` and `25%` VAT:
task-playbooks/register-supplier-invoice.md:230:For `gross=72350` and `25%` VAT:
task-playbooks/register-supplier-invoice.md:234:For `gross=56300` and `25%` VAT:
task-playbooks/register-supplier-invoice.md:270:- VAT `25%`
task-playbooks/register-supplier-invoice.md:280:- 2026-03-20 persistent-sandbox re-proof for the exact production-like French office-services shape (`Océan Reflection SARL 321000010` / `321000010` / `services de bureau` / `56300` / `6500` / `25%`) succeeded on the lower-call create-first path
task-playbooks/register-supplier-invoice.md:284:  3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*`
task-playbooks/register-supplier-invoice.md:291:- 2026-03-20 persistent-sandbox re-proof for the French office-services shape (`Lumière SARL` / `913175212` / `services de bureau` / `72350` / `6300` / `25%`) also succeeded
task-playbooks/register-supplier-invoice.md:296:  4. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*`
task-playbooks/register-sup…6026 tokens truncated…ask-playbooks/create-customer-invoice.md:39:- reflection on the production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=851635874`, product labels `(2934)`, `(8699)`, `(1355)`, names `Analyserapport`, `Datarådgivning`, `Nettverkstjeneste`, VAT `25%` / `15%` / `0%`) showed:
task-playbooks/create-customer-invoice.md:42:  - the lower-call replacement for that exact task shape is `GET /customer?organizationNumber=851635874&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
task-playbooks/create-customer-invoice.md:52:  - reserve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` for direct-line invoices, ambiguous product VAT, or cases where the task must override the resolved product VAT
task-playbooks/create-customer-invoice.md:66:  - that sandbox account still exposed only outgoing VAT `0%`, so the analog proved the lower-call exact-number product-linking branch and the lack of any need for `/ledger/vatType` in the proof path itself, but not the mixed `25%` / `15%` / `0%` percentages
task-playbooks/create-customer-invoice.md:70:  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` exposed only VAT code `6` (`0%`) in that sandbox account, so the exact mixed `25%` / `15%` / `0%` task could not be replayed there
task-playbooks/create-customer-invoice.md:78:  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
task-playbooks/create-customer-invoice.md:80:  - therefore exact mixed `25%` / `15%` / `0%` VAT could not be replayed in that sandbox account, but the product-linked invoice path, sparse write-response trap, and lower-call no-extra-read create path were proven
task-playbooks/create-customer-invoice.md:83:  - after setup, the proof path itself was exactly four calls: `GET /customer?organizationNumber=925760838&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
task-playbooks/create-customer-invoice.md:85:  - because that sandbox account still exposed only `0%` outgoing VAT, the analog proved the product-resolution and create-only-path lesson, but not the mixed `25%` / `15%` / `0%` VAT combination itself
task-playbooks/create-customer-invoice.md:88:  - after setup, the proof path itself was exactly four calls: `GET /customer?organizationNumber=909722502&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
task-playbooks/create-customer-invoice.md:90:  - because the sandbox still exposed only `0%` outgoing VAT, the analog proved the product-resolution and create-only-path lesson for this task shape, but not the exact mixed `25%` / `15%` / `0%` VAT combination itself
task-playbooks/create-customer-invoice.md:93:  - after setup, the winning proof path itself was exactly four calls: `GET /customer?organizationNumber=851635875&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
task-playbooks/create-customer-invoice.md:95:  - because the sandbox still exposed only `0%` outgoing VAT, this analog proved the product-resolution and single-script callback/fallback lesson, but not the exact mixed `25%` / `15%` / `0%` VAT combination itself
task-playbooks/create-customer-invoice.md:115:   - only if the task must force VAT independently of the resolved product, or the product read lacks even a reusable `vatType.id`, do one filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
task-playbooks/create-customer-invoice.md:147:  - only add `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*` when the task must override the resolved product VAT or the product read lacks reusable `vatType.id`
task-playbooks/create-customer-invoice.md:162:  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
task-playbooks/create-customer-invoice.md:169:  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
task-playbooks/create-customer-invoice.md:228:  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md:49:- omit `vatType` on the order line; the API defaults to vatType id=0 ("Ingen avgiftsbehandling", 0%) which is correct for a no-VAT reminder fee and produces the correct invoice amount
trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md:126:  - `POST /invoice` without `orderLines[].vatType` succeeded for fee amount `35`; API defaulted to vatType id=0 ("Ingen avgiftsbehandling", 0%); invoice amount was correct at `35`
trusted-standards/common-endpoints.md:180:  - if the requested exact VAT percentage is absent from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`, treat product create as blocked in that account
trusted-standards/common-endpoints.md:182:  - for the exact fresh-account create-one-product shape with prompt-provided `name`, `number`, excluding-VAT price, and standard `25%` VAT wording, the canonical winning path is one `POST /product` with no explicit `vatType`
trusted-standards/common-endpoints.md:183:  - on that exact shortcut, verify directly from the `POST /product` response that Tripletex returned a `vatType` and the computed `priceIncludingVatCurrency` reflects `25%`; the 2026-03-20 `Softwarelizenz` / `7986` / `24900` production run again confirmed that one-write path with `priceIncludingVatCurrency=31125` and `vatType.id=3`
trusted-standards/common-endpoints.md:187:  - `POST /product` without `vatType` can silently inherit an account default in some sandbox accounts; the persistent sandbox still auto-filled `0%` VAT code `6` on 2026-03-20 and produced `priceIncludingVatCurrency == priceExcludingVatCurrency`, so do not use that as the trusted fast path when the prompt scores exact VAT outside the exact fresh-account standard-`25%` shortcut
trusted-standards/common-endpoints.md:189:  - the same persistent sandbox still omitted `15%` from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`, exposed `id=31` only in the broader `/ledger/vatType?fields=*` catalog, and rejected `POST /product` with `vatType.id=31` as `422 Ugyldig mva-kode.`; if the filtered outgoing list omits the requested reduced rate, treat the task as blocked in that account
trusted-standards/common-endpoints.md:198:  - for explicit-VAT invoice tasks, do not assume that product search alone proves the VAT percentage; if the prompt scores exact VAT and the product read is sparse, do one filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` before the invoice write
trusted-standards/common-endpoints.md:372:  - the same-day production German run for `Windkraft GmbH` / `886395582` / `Datensicherheit` / `maximilian.wagner@example.org` / `473250` / `25%` finished with full correctness but only `2.96` normalized score, which means the solution still sat above that `4/5`-call floor even though the invoice itself was correct
trusted-standards/common-endpoints.md:403:  - that exact-number branch still stays lower-call even when the prompt text itself repeats a mixed VAT set such as `25%` / `15%` / `0%`; do not add `GET /ledger/vatType` by reflex when the task is only to create the invoice and the resolved products already expose reusable `vatType.id`
trusted-standards/common-endpoints.md:406:  - 2026-03-20 production reflection on the exact create-only shape `customer.organizationNumber=977448239` with `Konsulenttimer (6390)`, `Systemutvikling (1652)`, and `Webdesign (3273)` plus VAT `25%` / `15%` / `0%` showed that an added `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` was one wasted call; the realistic lower-call replacement in that same fresh-account state was customer read -> exact-number product read -> invoice write -> conditional bank-account repair -> single retry
trusted-standards/common-endpoints.md:420:  - hardcoding `vatType.id=3` is not the safe shortcut either; accounts that only expose VAT code `6` on `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` reject hardcoded `3` with `422 ... Ugyldig mva-kode.`
trusted-standards/common-endpoints.md:439:  - for ordinary direct-line service prompts explicitly priced excluding VAT / MVA, the same 3-call path is still the safe minimum, but the VAT selector must pick an exact `25%` row from the filtered outgoing result; if the filtered read exposes only `0%`, treat the run as blocked in that account instead of sending a `0%` invoice
trusted-standards/common-endpoints.md:502:  - 2026-03-20 production for `Stormberg AS` / `877462137` / `INV-2026-9382` / `61600` / `6340` / `25%` repeated the same miss: the old lookup-first zero-hit branch wasted one call because the supplier did not exist and still had to be created
trusted-standards/common-endpoints.md:504:  - same-day persistent-sandbox re-proof for `Minimal Proof Supplier 007945 AS` / `910079457` / `kontortjenester` / `61600` gross / `6340` / `25%` confirmed the create-first supplier-invoice branch closes correctly in `5` calls with no default verification read
trusted-standards/common-endpoints.md:728:  - the 2026-03-20 persistent-sandbox re-proof for `Océan Reflection SARL 321000010` / `321000010` / `services de bureau` / `56300` / `6500` / `25%` confirmed the create-first branch at `5` calls and again showed no default verification read is needed after the final voucher write
trusted-standards/common-endpoints.md:729:  - the older lookup-first zero-hit re-proof for `Lumière SARL` / `913175212` / `services de bureau` / `72350` / `6300` / `25%` still matters only as a retry/persistent-account fallback; it is no longer the default fresh-account path

```

## 2026-03-21T13:43:44.099Z tool_result
tool: exec_command
call_id: call_pttkLH7p91HhZr2L5wxD8Q47

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,220p' trusted-standards/create-customer-invoice.md"
Chunk ID: 05bf08
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 3437
Output:
# Create Customer Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one outgoing invoice
- do not send it
- customer already exists or is resolvable in one decisive read
- products either already exist or lines are directly creatable from prompt
- prompt is a standard customer-invoice create, not payment or reversal

## Do Not Use This Standard If
- prompt requires sending after create
- prompt requires a custom multi-order workflow
- task is a correction/reversal/payment flow

## Standard Flow
1. resolve customer with one decisive `GET /customer?...&fields=*` if needed
2. resolve existing products only if prompt clearly references existing products
   - if the prompt clearly gives exact product numbers, prefer one decisive `GET /product?productNumber=<a>&productNumber=<b>...&fields=*`
   - if the prompt gives exact product names plus numeric refs that are not explicitly guaranteed Tripletex product numbers, prefer one decisive `GET /product?count=1000&fields=*` and local exact filtering by product `number` and/or product `name`
   - only fall back from the direct numeric query or catalog read to the next resolver if the earlier read is ambiguous, truncated for the account, or the prompt lacks exact product names
   - only spend `GET /product?ids=...` if the earlier resolver still leaves the products unresolved
   - if you do start with a speculative product-number resolver and it returns an incomplete subset, keep the broader product-catalog fallback inside the same script and reuse the already-resolved customer instead of restarting the whole flow
3. for product-linked create-only prompts, treat the resolved product VAT as the default line VAT
   - if the product read already returns a reusable `product.vatType.id`, either reuse that same id on the line or omit explicit line `vatType` and inherit from the product
   - only resolve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*` when the task must force a VAT different from the resolved product, the product read lacks even a reusable `vatType.id`, or the line is not product-linked
4. `POST /invoice?sendToCustomer=false`
5. only if the write response omits decisive totals or later logic truly needs readback-only line details, do one immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
6. stop

## Payload Rules
- include:
  - `invoiceDate`
  - `invoiceDueDate`
  - `customer: { "id": ... }`
  - lines under `orders[].orderLines`
- do not create lines under read-only `invoice.orderLines`
- for product-linked lines, prefer `product: { "id": ... }`
- do not send unless prompt explicitly asks
- do not hardcode output VAT code `3`
- if `GET /product?fields=*` returns `vatType` as `id`/`url`, that id is still reusable for an exact existing-product create-only invoice
- if the resolved product already carries the intended VAT, you may omit explicit line `vatType` and inherit from the product
- if you want the payload to pin the same VAT explicitly without a separate VAT lookup, reuse the resolved `product.vatType.id`
- if the filtered outgoing VAT read shows a mismatch and the desired percentage exists, force that line with `vatType: { "id": ... }`

## Reuse From Write Response
- `value.id`
- `value.invoiceNumber`
- totals from invoice write response
- sparse line objects still prove line count, not full line details
- if the payload already fixed `product`, `description`, `count`, `unitPriceExcludingVatCurrency`, and explicit line `vatType`, and the write response returns decisive totals (`amountExcludingVatCurrency` / `amountCurrency`), that is enough to stop on a create-only task

## Verification
- default verification is zero extra calls if invoice totals/existence are enough
- sparse `orderLines` alone are not a reason to fetch the invoice again when the payload already fixed the line data and the write response totals match the intended VAT mix
- use one immediate expanded `GET /invoice/{id}` only when exact scored line details still need proof or the write response is too thin to prove the financial outcome

## Known Recovery Branches
- if the first attempted API call returns `403` with body `{"error":"Invalid or expired token"}`, stop; the run is blocked by unusable credentials, not by invoice-flow uncertainty
- if invoice creation fails with missing company bank account:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - update existing invoice account with `PUT /ledger/account/{id}`
  - retry invoice write once
  - keep the same invoice payload on that retry; do not re-read customer, products, or `vatType` after a bank-account-only validation failure
- if the one-shot product catalog read is ambiguous or incomplete, use the documented numeric recovery chain instead of guessing from approximate matches
- if a speculative `GET /product?productNumber=...` returns only a partial subset on a name-rich prompt, do the broader catalog fallback in the same script; do not re-read the customer or rerun the whole flow from the top

## OpenAPI / Sandbox Status
- `/invoice`, `/ledger/account`, and related invoice family endpoints verified in `./openapi.json`
- flow and bank-account repair proven in sandbox/playbooks
- later 2026-03-20 post-run reduction showed that the older 4-call exact-product-number path should not be treated as the floor for standard create-only existing-product invoices; exact-product-number prompts can be lower-call when the resolved products already carry reusable `vatType.id`
- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=925760838` with products labeled `(3644)`, `(4934)`, `(8806)` plus exact names showed that two numeric product-resolver reads were wasted before a later catalog read settled the products; the lower-call replacement for that shape is one decisive `GET /product?count=1000&fields=*` with local exact filtering by `number` and/or `name`
- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=909722500` with lines `Analysis Report (9796)`, `Maintenance (2145)`, and `System Development (5995)` plus VAT `25%` / `15%` / `0%` showed that one speculative `GET /product?productNumber=9796&productNumber=2145&productNumber=5995&fields=*` was wasted before the later catalog read settled the products; the lower-call replacement in that same fresh-account state is `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=851635874` with lines `Analyserapport (2934)`, `Datarådgivning (8699)`, and `Nettverkstjeneste (1355)` plus VAT `25%` / `15%` / `0%` showed that a speculative `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*` did not resolve all lines, and the run only succeeded after a broader catalog fallback on exact names; the lower-call replacement for that shape is one decisive `GET /product?count=1000&fields=*`, then `GET /ledger/vatType`, then `POST /invoice?sendToCustomer=false`
- the same `851635874` run also showed a control-flow inefficiency: the product-fallback logic happened only after the first script aborted, which forced a duplicate customer read on the second script run; next time keep the fallback as an in-script callback/branch and reuse the first successful customer resolution
- re-verified on 2026-03-20 in persistent sandbox that `GET /product?productNumber=...&fields=*` can return `vatType` only as a link object (`id`/`url`), so explicit-VAT prompts may still need one filtered outgoing `vatType` lookup before the invoice write
- re-verified on 2026-03-20 in persistent sandbox that `POST /invoice?sendToCustomer=false` can return sparse `orderLines` while still returning decisive totals; when the create payload already fixes the scored line fields, that write response is enough for the minimal create-only path
- re-verified on 2026-03-20 in persistent sandbox with the exact customer/product-number shape `827304212` + `6744/2584/3739` that the proof path is still `GET /customer` -> `GET /product?productNumber=...` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false`; that sandbox account exposed only outgoing VAT `0%`, so the exact mixed `25%` / `15%` / `0%` write could not be replayed there and only a 0%-analog invoice could be proven in-account
- re-verified again on 2026-03-20 in persistent sandbox with a disposable analog that exact-name product resolution plus `GET /ledger/vatType` plus `POST /invoice?sendToCustomer=false` completes the proof path in four calls after setup; that sandbox account still exposed only `0%` outgoing VAT, so mixed `25%` / `15%` / `0%` could not be replayed there
- re-verified again on 2026-03-20 in persistent sandbox with a prompt-like analog for the `909722500` Oakwood task shape: after setup, a four-call proof path `GET /customer?organizationNumber=909722502&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false` resolved sandbox products whose stored numbers intentionally differed from prompt-like refs `9796`, `2145`, and `5995`; the created invoice returned `amountExcludingVatCurrency=47450` and `amountCurrency=47450`, and the sandbox still exposed only `0%` outgoing VAT
- re-verified again on 2026-03-20 in persistent sandbox with an analog customer and exact-name products whose stored product numbers intentionally differed from prompt-like refs `2934` / `8699` / `1355`; after setup, the winning proof path was exactly `GET /customer?organizationNumber=851635875&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`, and the created invoice returned `amountExcludingVatCurrency=53050` and `amountCurrency=53050`
- production feedback on 2026-03-20 for the exact prompt shape `customer.organizationNumber=861379760` with exact product numbers `2109`, `1175`, `9974` and VAT mix `25%` / `15%` / `0%` confirmed that the successful 4-call path still was not efficiency-optimal; the lower-call replacement for that exact shape is `GET /customer?organizationNumber=...&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false`, reusing each resolved product's `vatType.id` or inheriting VAT from the product
- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=977448239` with `Konsulenttimer (6390)`, `Systemutvikling (1652)`, and `Webdesign (3273)` plus VAT `25%` / `15%` / `0%` showed that the created invoice was correct but not minimal-call because it spent `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` before the first invoice write
- that same run then hit the known missing-company-bank-account validation on the first `POST /invoice`, so the realistic lower-call replacement in that exact fresh-account state is `GET /customer?organizationNumber=977448239&fields=*` -> `GET /product?productNumber=6390&productNumber=1652&productNumber=3273&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> single retry of the same invoice write
- exhaustive persistent-sandbox reduction on 2026-03-20 with the same customer/product-number analog `861379760` + `2109/1175/9974` proved the floor for the exact-number existing-product branch:
  - `GET /customer?organizationNumber=861379760&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false` with `product.id` and no explicit line `vatType` succeeded and preserved linked product numbers on readback
  - the same 3-call path also succeeded when each line explicitly reused the resolved `product.vatType.id`
  - the tempting 2-call shortcut `GET /customer` -> `POST /invoice` with `product.number` did create an invoice, but readback showed `product=null` on all lines, so it is not a valid existing-product replacement path
  - the tempting 2-call shortcut `GET /product` -> `POST /invoice` with inline `customer { name, organizationNumber }` failed with `422` because the related order still required `customer.id`
  - that sandbox account still exposed only outgoing VAT `0%`, so the mixed `25%` / `15%` / `0%` combination itself could not be replayed there; the proof is about the lower-call resolver/write path, not the mixed-rate availability of that account
- persistent-sandbox re-proof on 2026-03-20 with a disposable exact-number analog `customer.organizationNumber=977448240` and products `96390`, `91652`, `93273` re-confirmed the same lower-call branch after setup:
  - proof path itself was `GET /customer?organizationNumber=977448240&fields=*` -> `GET /product?productNumber=96390&productNumber=91652&productNumber=93273&fields=*` -> `POST /invoice?sendToCustomer=false`
  - the immediate documentation readback `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` showed linked product numbers `96390`, `91652`, `93273`
  - that sandbox account still exposed only outgoing VAT `0%`, so the analog proved the no-extra-`/ledger/vatType` exact-number path and linked-product behavior, but not the mixed `25%` / `15%` / `0%` combination itself

```

## 2026-03-21T13:44:33.696Z assistant_message
phase: commentary

I’m writing the bun script now in the required run directory, then I’ll execute it once.

## 2026-03-21T13:45:22.233Z assistant_message
phase: commentary

Small script correction before execution: preserving the pre-read project-specific rates across a holder model switch, so the chargeable branch won’t duplicate-rate by accident.

## 2026-03-21T13:45:27.760Z tool_call
tool: exec_command
call_id: call_BhLn4PFLmolfnQZzdOiokZmr

```json
{
  "cmd": "bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134233345Z-26bded68/scripts/run.ts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 8000
}
```

## 2026-03-21T13:45:28.925Z tool_result
tool: exec_command
call_id: call_BhLn4PFLmolfnQZzdOiokZmr

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134233345Z-26bded68/scripts/run.ts'
Chunk ID: ef4bae
Wall time: 1.0016 seconds
Process running with session ID 81098
Original token count: 0
Output:

```

## 2026-03-21T13:45:30.437Z assistant_message
phase: commentary

The script is running against the API now. I’m polling for completion/result, not changing the flow.

## 2026-03-21T13:45:30.727Z tool_call
tool: write_stdin
call_id: call_EUigAvEbCDp07dtOxD70FFCr

```json
{
  "session_id": 81098,
  "chars": "",
  "yield_time_ms": 1000,
  "max_output_tokens": 8000
}
```

## 2026-03-21T13:45:35.739Z tool_result
tool: write_stdin
call_id: call_EUigAvEbCDp07dtOxD70FFCr

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134233345Z-26bded68/scripts/run.ts'
Chunk ID: afeaa1
Wall time: 5.0013 seconds
Process running with session ID 81098
Original token count: 0
Output:

```

## 2026-03-21T13:45:37.297Z tool_call
tool: write_stdin
call_id: call_jfuvDAaNh9Kpi4lpcOVfJ5l7

```json
{
  "session_id": 81098,
  "chars": "",
  "yield_time_ms": 1000,
  "max_output_tokens": 8000
}
```

## 2026-03-21T13:45:42.305Z tool_result
tool: write_stdin
call_id: call_jfuvDAaNh9Kpi4lpcOVfJ5l7

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134233345Z-26bded68/scripts/run.ts'
Chunk ID: 1f8d8d
Wall time: 5.0006 seconds
Process running with session ID 81098
Original token count: 0
Output:

```

## 2026-03-21T13:45:44.415Z tool_call
tool: write_stdin
call_id: call_AwzZvmcAYWeFt02UyMlWkT8x

```json
{
  "session_id": 81098,
  "chars": "",
  "yield_time_ms": 1000,
  "max_output_tokens": 8000
}
```

## 2026-03-21T13:45:44.429Z tool_result
tool: write_stdin
call_id: call_AwzZvmcAYWeFt02UyMlWkT8x

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-134233345Z-26bded68/scripts/run.ts'
Chunk ID: b245ff
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 86
Output:
{
  "blocked": false,
  "workDate": "2026-03-21",
  "employeeId": 18610337,
  "projectId": 401986894,
  "activityId": 5877737,
  "activityIsChargeable": false,
  "timesheetEntryId": 175907842,
  "orderId": 402007333,
  "invoiceId": 2147593506,
  "invoiceNumber": 1,
  "amountExcludingVatCurrency": 20800,
  "amountCurrencyOutstanding": 26000
}

```

## 2026-03-21T13:45:48.713Z assistant_message
phase: final_answer

Completed. Registered 16h on `2026-03-21` for Camille Dubois on `Design` in `Mise à niveau système`, and created project invoice `#1` for `20,800 NOK` excl. VAT (`26,000 NOK` outstanding).

## 2026-03-21T13:45:48.752Z task_event
event: task_complete

Completed. Registered 16h on `2026-03-21` for Camille Dubois on `Design` in `Mise à niveau système`, and created project invoice `#1` for `20,800 NOK` excl. VAT (`26,000 NOK` outstanding).
