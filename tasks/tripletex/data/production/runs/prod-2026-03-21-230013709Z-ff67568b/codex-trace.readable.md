# Claude Trace Snapshot

- provider: claude
- session_id: e97dc9ca-5d7a-4859-a07b-a86038c242a0
- session_file: /home/jorge/.claude/projects/-home-jorge-repos-ainm-tasks-tripletex-codex-environment/e97dc9ca-5d7a-4859-a07b-a86038c242a0.jsonl
- completed: true
- assistant_messages: 1
- tool_calls: 5
- tool_results: 5

## 2026-03-21T23:00:18.007Z user_message
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
- If this is an exact trusted-standard match, ALWAYS read (cat) the matching .md file BEFORE writing any script. Never write from memory. Then execute it directly without re-checking ./openapi.json.

Run-specific rules:
- Only interact with the Tripletex API by writing TypeScript and running it with bun.
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-230013709Z-ff67568b/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Führen Sie den vollständigen Projektzyklus für 'Cloud-Migration Eichenhof' (Eichenhof GmbH, Org.-Nr. 986645888) durch: 1) Das Projekt hat ein Budget von 253000 NOK. 2) Erfassen Sie Stunden: Hannah Weber (Projektleiter, hannah.weber@example.org) 34 Stunden und Marie Fischer (Berater, marie.fischer@example.org) 118 Stunden. 3) Erfassen Sie Lieferantenkosten von 47050 NOK von Silberberg GmbH (Org.-Nr. 823323948). 4) Erstellen Sie eine Kundenrechnung für das Projekt.

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
PNtqqzqyzyKZVOwMgwuBLVIhuiydPIQIoePl6KNtN8k

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-230013709Z-ff67568b/scripts

Runner configuration:
- provider: claude
- model: claude-opus-4-6
- effort: high
- backend: proxy
- proxy_base_url: https://europe-west1-ai-nm26osl-1706.cloudfunctions.net/claude-proxy
- disable_experimental_betas: false

## 2026-03-21T23:00:24.168Z tool_call
tool: Read
call_id: toolu_vrtx_01WpKqJjKftyZ6gLo3hrqfUZ

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md"
}
```

## 2026-03-21T23:00:24.173Z tool_call
tool: Read
call_id: toolu_vrtx_01Ni1hXL7iP1ddeewpu2kjBP

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md"
}
```

## 2026-03-21T23:00:24.175Z tool_call
tool: Read
call_id: toolu_vrtx_01HEdS1u9YwMQdEiCUiFJP34

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md"
}
```

## 2026-03-21T23:00:25.364Z tool_result
tool: Read
call_id: toolu_vrtx_01WpKqJjKftyZ6gLo3hrqfUZ

```text
     1→# Register Project Lifecycle With Budget, Hours, Cost, and Invoice
     2→
     3→## Trust Level
     4→- Trusted standard
     5→- Use directly for exact matches
     6→- Skip `./openapi.json` re-checking for exact matches
     7→
     8→## Exact Match
     9→- create one customer
    10→- create two employees used for project hours
    11→- create one project
    12→- set one monetary project budget
    13→- register project hours for the two created employees
    14→- register one supplier/project cost linked to the named supplier
    15→- create one unsent customer invoice for that project
    16→- add both employees as project participants
    17→
    18→## Do Not Use This Standard If
    19→- the prompt explicitly scores internal billability fields or true reserve consumption
    20→- the prompt is really a fixed-price update/billing task rather than a fresh project-lifecycle create task
    21→- CRITICAL: if the prompt gives project name + customer org + PM email + fixed price + milestone % WITHOUT mentioning employees to create, hours to register, or supplier costs, use `set-project-fixed-price-and-invoice-partial-payment` instead — the project/customer/PM ALREADY EXIST on fresh production accounts for that task shape; creating from scratch scored 0.5/4 (3/4 checks failed) on 2026-03-21 run c9831f7e
    22→
    23→## CRITICAL CHECKLIST — 4 Fields That MUST Be Set (All 4 Have Caused Scoring Failures)
    24→
    25→1. **`isFixedPrice: true` + `fixedprice: <budget>`** on POST /project — without this, project.fixedprice=0 and Check 3 fails
    26→2. **`budgetHours: <total>`** on POST /project/projectActivity — without this, activity.budgetHours=0 and Check 4 fails
    27→3. **`POST /project/orderline`** with `unitCostCurrency: <supplier-cost>` — the Leverandorfaktura voucher alone does NOT populate project-level cost tracking; BOTH orderline AND voucher are needed. Without orderline, Check 5 fails
    28→4. **`adminAccess: true`** on project participant for the prompt-named project manager — since NO_ACCESS employees cannot be set as projectManager, add them as participant with admin access instead. Without this, the PM check fails
    29→
    30→Each of these has caused scoring failures in ALL 11 production attempts. They are worth ~4/11 raw points combined.
    31→
    32→## Standard Flow
    33→1. `GET /department?isInactive=false&count=1&fields=*` + `POST /customer` + `GET /employee?assignableProjectManagers=true&count=1&fields=*` (parallel, 3 calls)
    34→2. `POST /employee` (employee 1) + `POST /employee` (employee 2) + `POST /project` with `isFixedPrice: true` + `fixedprice: <budget>` (parallel, 3 calls — all deps satisfied from step 1)
    35→3. `POST /project/projectActivity` with `budgetHours` + `budgetFeeCurrency` + `POST /project/participant` (PM employee with `adminAccess: true`) + `POST /project/participant` (other employee with `adminAccess: false`) (parallel, 3 calls)
    36→4. `POST /timesheet/entry/list` with all split date chunks for both employees + `POST /supplier` + `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` + `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` (parallel, 4 calls)
    37→5. `POST /project/orderline` (non-chargeable cost with `unitCostCurrency: <supplier cost>`) + `POST /ledger/voucher` (Leverandørfaktura with explicit `row: 1` / `row: 2` on postings, supplier on 2400 posting, project on expense posting) + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` (parallel, 3 calls)
    38→6. if account 1920 lacks `bankAccountNumber`, `PUT /ledger/account/{id}` once (0-1 calls)
    39→7. `POST /invoice?sendToCustomer=false` with root `invoiceDate`, explicit `invoiceDueDate`, root `customer.id`, and one embedded `orders[]` row containing `customer.id`, `project.id`, `orderDate`, `deliveryDate`, and real `orderLines[]` (1 call)
    40→
    41→## Keep It Minimal
    42→- for this exact family, do not add exact-email project-manager reads trying to make the prompt-named new employee assignable; use one generic assignable-manager read — only the account owner can be a PM, and newly created employees cannot be granted PM access via API
    43→- do not spend a separate `POST /activity` before `POST /project/projectActivity`
    44→- do not use individual `POST /timesheet/entry` writes when `POST /timesheet/entry/list` can batch all split chunks in one call
    45→- do not split the final invoice into `POST /order` plus `PUT /order/{id}/:invoice`; the exact lower-call downstream branch is direct `POST /invoice?sendToCustomer=false`
    46→- supplier cost requires BOTH: (a) `POST /project/orderline` with `unitCostCurrency` to populate `project.overallStatus.costs`, AND (b) `POST /ledger/voucher` (Leverandørfaktura) to create the accounting entry with supplier linkage — using only one of these is insufficient
    47→- do NOT use `POST /supplierInvoice` — the endpoint has no POST in the spec; the only creation path is document import; use the Leverandørfaktura voucher approach instead
    48→- do NOT include `GET /division` or `employments[]` on employee payloads — employees without employment records can still register timesheet entries; skipping division saves 1 call and avoids the `division: { id: undefined }` trap entirely
    49→- do NOT use two separate `GET /ledger/account` reads (one for `number=6590,2400` and one for `isBankAccount=true`); use one combined `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` — account 1920 ("Bankinnskudd") is the standard Norwegian bank account and exists in all standard chart-of-accounts setups
    50→
    51→## Payload Rules
    52→- employee create:
    53→  - always include `userType: "NO_ACCESS"`
    54→  - always include `dateOfBirth`
    55→  - include `department.id`
    56→  - do NOT include `employments[]` — employees without employment records can still register timesheet entries, project participation, and all other scored lifecycle actions; omitting `employments` entirely avoids the division/startDate/employmentType traps and saves the `GET /division` call
    57→  - sandbox-verified on 2026-03-21: employee created without `employments[]` successfully registered 7.5h timesheet entry via `POST /timesheet/entry/list` with 0 errors
    58→- project create:
    59→  - include `name`
    60→  - include `startDate`
    61→  - include `customer.id`
    62→  - include one generic assignable `projectManager.id`
    63→  - include `isFixedPrice: true`
    64→  - include `fixedprice: <budget amount from prompt>` — this sets the project-level budget field; without it, `fixedprice` defaults to 0 and the scorer may not see the budget
    65→  - sandbox-verified on 2026-03-21: `POST /project` with `isFixedPrice: true` + `fixedprice: 229500` returns `{ isFixedPrice: true, fixedprice: 229500 }` on both write response and readback
    66→- project activity:
    67→  - include `project.id`
    68→  - include `startDate`
    69→  - include `budgetFeeCurrency`
    70→  - include `budgetHours: <total hours from prompt>` — the sum of ALL employees' hours (e.g. 37+62=99); this populates the project activity's hour budget alongside the monetary budget
    71→  - inline `activity` requires both `name` (e.g. `"Prosjektaktivitet"`) and `activityType: "PROJECT_SPECIFIC_ACTIVITY"`; omitting either causes `422`
    72→  - include `isChargeable: false` inside the `activity` object (NOT on the projectActivity root); placing `isChargeable` on the projectActivity root causes `422 isChargeable: Feltet eksisterer ikke i objektet.`
    73→- timesheet batch:
    74→  - split totals above `24` into distinct dates before the first write
    75→  - keep every date on or after the project `startDate`
    76→  - CRITICAL: use UTC-safe date arithmetic for splitting; `new Date(dateStr + "T00:00:00")` creates a local-time Date, and `.toISOString().slice(0, 10)` converts to UTC, which shifts dates back by 1 day in CET/CEST timezones — use `new Date(Date.UTC(y, m-1, d))` instead
    77→  - the 2026-03-21 production run `ERP-implementering Havbris` hit this exact trap: the `splitHours` function used local-time Date construction, causing the first timesheet date to be `2026-03-20` (1 day before project startDate), which failed `422 Startdato for prosjektet ... Det kan ikke registreres timer før denne datoen.`
    78→- project participant (add both employees as project members):
    79→  - include `project: { id: projectId }`
    80→  - include `employee: { id: employeeId }`
    81→  - for the employee designated as "project manager" / "prosjektleder" / "gestor de projeto" / "Projektleiter" in the prompt: use `adminAccess: true` — since we cannot make them the real `projectManager`, granting admin access on the participant is the closest proxy and may be checked by the scorer
    82→  - for other employees: use `adminAccess: false`
    83→  - create one `POST /project/participant` per employee (can be parallel)
    84→- supplier cost via project orderline (for project cost tracking):
    85→  - `POST /project/orderline` with `project: { id }`, `description`, `date`, `count: 1`, `unitCostCurrency: <supplier cost amount>`, `isChargeable: false`
    86→  - this populates `project.overallStatus.costs` — without it, `costs` stays at 0 even when a Leverandørfaktura voucher exists
    87→  - `vendor` field on the orderline reads back as `null` — this is known and expected; the voucher handles supplier linkage
    88→  - sandbox-verified on 2026-03-21: adding `POST /project/orderline` with `unitCostCurrency: 56300` changed `overallStatus.costs` from 0 to 56300
    89→- supplier cost via Leverandørfaktura voucher (for accounting + supplier linkage):
    90→  - use `POST /ledger/voucher` in addition to the project orderline above (NOT `POST /supplierInvoice` which has no POST method in the spec)
    91→  - the voucherType ID is **environment-specific** — do NOT hardcode `9744845` (sandbox) or any other ID; always resolve dynamically via `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` in step 4
    92→  - the 2026-03-21 production run `ERP-implementering Snøhetta` proved this: sandbox ID was `9744845`, production ID was `11289239`; hardcoding caused an extra lookup call in recovery
    93→  - include `voucherType: { id: <looked-up-id> }` from the step-6 voucherType read
    94→  - `?sendToLedger=true` is optional for this voucher type — both with and without work (sandbox-verified)
    95→  - CRITICAL: each posting MUST include an explicit `row` field starting from `1`; omitting `row` causes `422 postings.row: Posteringene på rad 0 (guiRow 0) er systemgenererte og kan ikke opprettes eller endres på utsiden av Tripletex.` because Tripletex treats row 0 as system-generated
    96→  - the 2026-03-21 production run `ERP-implementering Snøhetta` hit this exact trap twice: both voucher attempts without `row` fields got 422; adding `row: 1` and `row: 2` succeeded immediately; sandbox re-proof confirmed: without `row` → 422, with `row: 1/2` → 201
    97→  - expense posting (row 1): `row: 1`, `account: { id: acc6590Id }`, `amount/amountCurrency/amountGross/amountGrossCurrency: <cost>`, `project: { id: projectId }`
    98→  - credit posting (row 2): `row: 2`, `account: { id: acc2400Id }`, all four amount fields: `-<cost>`, `supplier: { id: suppId }`
    99→  - **requires `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` before this step** to resolve account IDs (this combined read also provides the bank account for step 6-7 bank fix + invoice)
   100→  - sandbox-verified: supplier persists on 2400 posting, project persists on 6590 posting
   101→- direct lifecycle invoice:
   102→  - include root `invoiceDate`
   103→  - include explicit root `invoiceDueDate`
   104→  - include root `customer.id`
   105→  - create lines under `orders[].orderLines`
   106→  - keep `project` on the surrounding `orders[]` row, not inside `orderLines[]`
   107→  - use one real order line with:
   108→    - `description`
   109→    - `count`
   110→    - `unitPriceExcludingVatCurrency`
   111→    - `vatType.id`
   112→
   113→## Reuse From Write Response
   114→- from `POST /customer`:
   115→  - `value.id`
   116→- from both `POST /employee` writes:
   117→  - employee ids for the timesheet batch
   118→- from the manager read:
   119→  - assignable `projectManager.id`
   120→- from `POST /project`:
   121→  - `value.id`
   122→- from `POST /project/projectActivity`:
   123→  - `value.activity.id`
   124→  - `value.budgetFeeCurrency`
   125→- from `POST /timesheet/entry/list`:
   126→  - created entry ids and returned `hours`
   127→- from `POST /project/participant`:
   128→  - participant ids (for verification only)
   129→- from `POST /supplier`:
   130→  - supplier id
   131→- from `GET /ledger/account?number=1920,6590,2400`:
   132→  - account ids for expense (6590), supplier payable (2400), and bank account (1920)
   133→  - bank account `bankAccountNumber` (to decide if bank fix is needed)
   134→- from `GET /ledger/voucherType?name=Leverandørfaktura`:
   135→  - voucherType id (environment-specific, must not be hardcoded)
   136→- from `POST /project/orderline` (supplier cost tracking):
   137→  - orderline id (populates overallStatus.costs)
   138→- from `POST /ledger/voucher` (Leverandørfaktura):
   139→  - voucher id (supplier cost with accounting + supplier linkage)
   140→- from `POST /invoice?sendToCustomer=false`:
   141→  - invoice id
   142→  - invoice number
   143→  - totals
   144→  - `projectInvoiceDetails`
   145→
   146→## Verification
   147→- default verification is zero extra calls
   148→- trust the project-activity write response for the budget amount
   149→- trust the timesheet batch response for the registered hour totals
   150→- trust the direct invoice write response if it already proves:
   151→  - invoice id
   152→  - invoice number
   153→  - `amountExcludingVatCurrency`
   154→  - one linked `projectInvoiceDetails` row
   155→
   156→## Known Recovery Branches
   157→- if no department exists on the initial read:
   158→  - `POST /department` once with a minimal name payload
   159→- if account 1920 is not found in the combined read (unlikely but possible):
   160→  - fall back to `GET /ledger/account?isBankAccount=true&fields=*` (+1 call) and use the first bank account with a `bankAccountNumber`
   161→- if the chosen invoice bank account (1920) lacks `bankAccountNumber`:
   162→  - `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` (known MOD11-valid Norwegian account number)
   163→  - do not use arbitrary 11-digit numbers; `"12345678901"` fails `422 bankAccountNumber: Dette er ikke et gyldig norsk kontonummer` because Norwegian bank account numbers require a valid MOD11 check digit
   164→  - retry the same direct invoice payload once
   165→- project manager constraint: only the account owner (the single employee returned by `GET /employee?assignableProjectManagers=true`) can be set as `projectManager` on a project; newly created employees (NO_ACCESS or STANDARD) cannot be made assignable via API — `PUT /project` to change PM to a non-assignable employee returns `422 Oppgitt prosjektleder har ikke fått tilgang som prosjektleder i kontoen`
   166→- to work around PM constraint: use the generic assignable manager as `projectManager`, but add the prompt-named PM employee as a project participant via `POST /project/participant`
   167→
   168→## OpenAPI / Sandbox Status
   169→- upstream employee/project/activity/timesheet/cost steps were already proven in the existing playbook family on 2026-03-21
   170→- persistent sandbox re-proof on 2026-03-21 with disposable analog customer `Lifecycle Reflection 22177506 AS`, supplier `Lifecycle Supplier 22177506 AS`, project `Lifecycle Project 22177506`, two created employees, one generic assignable manager, budget `262850`, hours `37 + 101`, and supplier cost `89750` confirmed the new downstream floor:
   171→  - `POST /project/orderline`
   172→  - `GET /ledger/vatType`
   173→  - `GET /ledger/account`
   174→  - direct `POST /invoice?sendToCustomer=false`
   175→  - total full-path call count `14` with 0 errors when the bank account already had a number
   176→- that same sandbox re-proof showed the direct invoice write returned `amountExcludingVatCurrency=262850` and `projectInvoiceDetails.length=1`
   177→- a same-session sandbox control without root `invoiceDueDate` failed `422 invoiceDueDate: Kan ikke være null.`
   178→- the 2026-03-21 production run `Cloud-Migration Brückentor` then re-confirmed the line-shape pitfall from the other direction: `POST /order` with line-level `project` failed `422 field "project" does not exist in object`, so even the older order-first branch needed that correction
   179→- the 2026-03-21 production run `Cloud-Migration Eichenhof` exposed two additional pitfalls:
   180→  - `GET /division?count=1&fields=*` can return an empty array in some production accounts; unconditionally including `division: { id: undefined }` on the employee payload caused `422 employments.division.name: Feltet kan ikke være tomt.` and wasted the first `POST /employee` call
   181→  - using `bankAccountNumber: "12345678901"` on the bank-account repair step failed `422 bankAccountNumber: Dette er ikke et gyldig norsk kontonummer`; the correct known-valid value is `"12345678903"` (MOD11-valid)
   182→  - the run also hit a transient `409` on `POST /timesheet/entry/list` during its second script execution despite all entries having unique (employee, date, activity, project) tuples; the same batch succeeded on immediate retry, suggesting a transient server-side conflict rather than a payload shape error
   183→  - same-day persistent-sandbox re-proof confirmed the full 14-call path succeeds when division is conditionally omitted and bank-account repair uses `"12345678903"`
   184→- the 2026-03-21 production run `Migração Cloud Horizonte` exposed a project-activity payload trap:
   185→  - agent sent `name: "PROJECT_SPECIFIC_ACTIVITY"` without `activityType` — got `422 activity.activityType: Kan ikke være null.`; resume added both `name` + `activityType` — `201`
   186→  - sandbox re-proof: `activityType` alone → `422 name`; `name` alone → `422 activityType`; both → `201`
   187→  - total: 16 calls (15 ideal + 1 wasted 422); full 14-call path re-proven in sandbox with 0 errors
   188→- the 2026-03-21 production run `ERP-implementering Havbris` exposed a JavaScript timezone pitfall in date splitting:
   189→  - the `splitHours` function used `new Date(start + "T00:00:00")` (local time) then `.toISOString().slice(0, 10)` (UTC), shifting dates back 1 day in CET/CEST
   190→  - `POST /timesheet/entry/list` failed `422` because the first entry date was `2026-03-20` (before project startDate `2026-03-21`)
   191→  - the fix: use `Date.UTC()` for date construction, e.g. `new Date(Date.UTC(y, m-1, d + offset))` then `.toISOString().slice(0, 10)`
   192→  - the recovery script reran steps 6-9 with correct UTC dates, but also re-created the supplier (already created in the failed parallel batch), wasting 1 extra call
   193→  - total: 17 calls (15 ideal with bank fix + 1 wasted 422 + 1 duplicate supplier), 1 error
   194→  - sandbox re-proof confirmed the full 14-call path with UTC-safe date splitting succeeds with 0 errors
   195→- the 2026-03-21 production run `Cloud Migration Northwave` exposed an `isChargeable` placement trap on `POST /project/projectActivity`:
   196→  - agent placed `isChargeable: false` on the projectActivity root instead of inside the nested `activity` object
   197→  - got `422 isChargeable: Feltet eksisterer ikke i objektet.` — the field does not exist on the projectActivity schema, only on the activity schema
   198→  - the resume script moved `isChargeable: false` inside `activity: { name: ..., activityType: ..., isChargeable: false }` and succeeded
   199→  - total: 16 calls (15 ideal with bank fix + 1 wasted 422), 1 error
   200→  - sandbox re-proof confirmed: `isChargeable` on projectActivity root → 422; inside `activity` object → 201; omitted entirely → 201 (defaults to undefined/false)
   201→  - the trusted standard line "include `isChargeable: false` on the activity" was ambiguous — clarified to explicitly state "inside the `activity` object (NOT on the projectActivity root)"
   202→- the 2026-03-21 production run `ERP-implementering Snøhetta` exposed three pitfalls:
   203→  - `employmentType: "ORDINARY"` on the employment object does not exist in the schema — `POST /employee` failed `422 employmentType: Feltet eksisterer ikke i objektet.`; the only valid employment fields are `startDate` and optionally `division`
   204→  - voucher postings without explicit `row: 1` / `row: 2` fields fail `422 postings.row: Posteringene på rad 0 (guiRow 0) er systemgenererte`; Tripletex assigns row 0 to system-generated postings and rejects user postings that collide with it
   205→  - the hardcoded `voucherType: { id: 9744845 }` from sandbox was wrong in production (actual ID was `11289239`); voucherType IDs are environment-specific and must always be resolved via `GET /ledger/voucherType?name=Leverandørfaktura`
   206→  - total: 26 calls (19 ideal with bank fix + 1 employmentType 422 + 2 voucher-no-row 422s + 4 repeated GETs lost to Promise.all rejection), 3 errors
   207→  - sandbox re-proof confirmed: `employmentType` → 422; without `row` → 422; with `row: 1/2` → 201; voucherType lookup returns correct environment-specific ID
   208→- the 2026-03-21 production run `Migração Cloud Horizonte` (second attempt, f17d4753) completed with 19 calls, 0 errors:
   209→  - followed the trusted standard exactly with the old 18-call baseline (GET div + separate bank-account read)
   210→  - bank fix was needed (+1 call), bringing total to 19
   211→  - all scored fields correct: budget 229500, hours 37+62=99, supplier cost 56300, invoice with projectInvoiceDetails
   212→  - post-run sandbox optimization proved two call-saving improvements:
   213→    - (a) omit `employments[]` from employee payloads entirely — employees without employment records can register timesheet entries (sandbox-verified); this eliminates `GET /division` (-1 call)
   214→    - (b) combine account reads into `GET /ledger/account?number=1920,6590,2400` — account 1920 is the standard Norwegian bank account; this replaces both `GET ?number=6590,2400` and `GET ?isBankAccount=true` (-1 call)
   215→    - (c) move PM read to step 1 (parallel with dept+customer) and parallelize emp1+emp2+project in step 2 (fewer sequential steps)
   216→  - sandbox full-path re-proof with optimized flow: 16 calls, 0 errors, all scored fields correct
   217→  - new baseline: **16 calls** (or 17 with bank fix)
   218→- the 2026-03-21 production run `Dataplattform Elvdal` (a81782be) completed with 19 calls, 0 errors:
   219→  - followed the OLD 18-call baseline (GET /division + separate bank-account read + suboptimal sequencing)
   220→  - wasted 2 calls: (1) `GET /division` unnecessary since employees don't need `employments[]`, (2) separate `GET /ledger/account?isBankAccount=true` replaced by combined `number=1920,6590,2400` read
   221→  - suboptimal sequencing: emp1 in step 2, then PM+emp2 parallel in step 3, then project in step 4 — optimal is PM read in step 1, emp1+emp2+project all parallel in step 2
   222→  - bank fix was needed (+1 call), bringing total to 19 vs optimal 17
   223→  - all scored fields correct: budget 331100, hours 43+100=143, supplier cost 61650 (Fossekraft AS), invoice with projectInvoiceDetails
   224→  - sandbox re-proof of optimized 16-call path (without bank fix) confirmed: 16 calls, 0 errors, employees without `employments[]` register timesheet entries successfully
   225→- CRITICAL structural analysis of all 10+ task 29 attempts (2026-03-21):
   226→  - all attempts score exactly 4/11 (checks 1,2,6 pass; checks 3,4,5,7 fail) when all entities are created
   227→  - the production scripts had THREE critical omissions despite the trusted standard documenting them:
   228→    (a) `isFixedPrice: true` + `fixedprice: <budget>` were NOT included on `POST /project` — these are mandatory for check 3 (budget)
   229→    (b) `budgetHours: <total>` was NOT included on `POST /project/projectActivity` — likely checked by scorer
   230→    (c) `adminAccess: true` was NOT set for the PM employee's participant — both employees had `adminAccess: false`
   231→  - in addition, `POST /project/orderline` with `unitCostCurrency` was NOT used — the Leverandørfaktura voucher alone does NOT populate `project.overallStatus.costs` (stays at 0); the orderline is needed for project-level cost tracking
   232→  - sandbox re-proof on 2026-03-21: full lifecycle with all 4 fixes (isFixedPrice+fixedprice, budgetHours, adminAccess, orderline) completed in 17 calls (16 base + 1 bank fix), 0 errors; `overallStatus.costs` correctly shows supplier cost amount, `project.fixedprice` correctly shows budget
   233→  - new baseline: **17 calls** (16 base + 1 orderline, or 18 with bank fix)
   234→
```

## 2026-03-21T23:00:25.390Z tool_result
tool: Read
call_id: toolu_vrtx_01Ni1hXL7iP1ddeewpu2kjBP

```text
     1→# Register Project Lifecycle With Budget, Hours, Cost, and Invoice
     2→
     3→## Scope
     4→
     5→Use for tasks like:
     6→- create the customer, employees, and project
     7→- set a project budget
     8→- register project hours
     9→- register one supplier/project cost
    10→- create an unsent customer invoice for the project
    11→
    12→Do not use for:
    13→- prompts that explicitly score true project-hour reserve consumption by the invoice
    14→
    15→## CRITICAL CHECKLIST — 4 Fields That MUST Be Set (All 4 Have Caused Scoring Failures)
    16→
    17→1. **`isFixedPrice: true` + `fixedprice: <budget>`** on POST /project — without this, project.fixedprice=0 and Check 3 fails
    18→2. **`budgetHours: <total>`** on POST /project/projectActivity — without this, activity.budgetHours=0 and Check 4 fails
    19→3. **`POST /project/orderline`** with `unitCostCurrency: <supplier-cost>` — the Leverandorfaktura voucher alone does NOT populate project-level cost tracking; BOTH orderline AND voucher are needed. Without orderline, Check 5 fails
    20→4. **`adminAccess: true`** on project participant for the prompt-named project manager — since NO_ACCESS employees cannot be set as projectManager, add them as participant with admin access instead. Without this, the PM check fails
    21→
    22→Each of these has caused scoring failures in ALL 11 production attempts. They are worth ~4/11 raw points combined.
    23→
    24→## Verified Findings
    25→
    26→Persistent-sandbox follow-up on 2026-03-21 showed:
    27→- `POST /project/projectActivity` can create the inline project-specific activity and set both `budgetHours` and `budgetFeeCurrency` in one write
    28→- for that exact branch, a separate `POST /activity` before `POST /project/projectActivity` is wasted
    29→- `POST /timesheet/entry` still has the hard per-entry ceiling `projectChargeableHours <= 24`
    30→- the same employee + project + activity + date tuple still allows only one time-entry write, so totals above `24` must be pre-split across dates
    31→- `POST /timesheet/entry/list` accepts an array of timesheet entries for multiple employees and dates in one call, returning `{ values: [...] }` with all created entries; this replaces N individual `POST /timesheet/entry` calls with 1 batch call
    32→- persistent sandbox re-proof on 2026-03-21 confirmed `POST /timesheet/entry/list` with 9 entries (2 employees, mixed hours across 9 dates) succeeded in 1 call and returned all 9 entries with correct `hours` values
    33→- `POST /project/orderline` with a non-chargeable cost-only payload and `unitCostCurrency` increases project costs directly
    34→- the same sandbox proof showed `GET /project/{id}/period/overallStatus?...` moving from `costs=61650` to `123300` and then `184950` after repeated identical cost-only project-orderline writes
    35→- sending `unitPriceExcludingVatCurrency` on that non-chargeable cost line fails with `422 unitPriceExcludingVatCurrency: Ordrelinjen er ikke fakturerbar.`
    36→- sending `vendor: { "id": ... }` on that cheap cost branch was accepted but later read back as `vendor=null`
    37→- the supplier-invoice voucher path (`POST /ledger/voucher/importDocument` -> `PUT /ledger/voucher/{id}`) can create a supplier invoice while the later project-orderline read still shows `project=null`, so it is not the default project-cost branch for this task family
    38→- a freshly created employee was not automatically assignable as project manager in persistent sandbox; `POST /project` failed with `projectManager.id: Oppgitt prosjektleder har ikke fått tilgang som prosjektleder i kontoen`
    39→- `GET /employee?assignableProjectManagers=true` therefore remains a real gate, not just a convenience filter
    40→- the ordinary invoice branch still worked with `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` -> `POST /order` -> `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`
    41→- persistent sandbox re-proof on 2026-03-21 then reduced that invoice branch one step further for this exact lifecycle family: after the same upstream setup, direct `POST /invoice?sendToCustomer=false` with root `invoiceDate`, explicit `invoiceDueDate`, root `customer.id`, and one embedded `orders[]` row with `customer.id`, `project.id`, `orderDate`, `deliveryDate`, and real `orderLines[]` succeeded in 1 call and returned `projectInvoiceDetails.length == 1`
    42→- that same re-proof showed `invoiceDueDate` is mandatory on the direct lifecycle-invoice branch; omitting it failed with `422 invoiceDueDate: Kan ikke være null.`
    43→- the 2026-03-21 production run for `Cloud-Migration Brückentor` exposed a separate shape trap: `project` is valid on the surrounding `order`/`orders[]` object, but not on the nested `orderLines[]`; sending line-level `project` failed `422 field \"project\" does not exist in object`
    44→- timesheet entries must have dates on or after the project `startDate`; entries before the project start fail with `422 Startdato for prosjektet ... Det kan ikke registreres timer før denne datoen.`
    45→- employee creation requires `department.id` in accounts with department functionality enabled; the 2026-03-21 production run for `System Upgrade Greenfield` hit `422 department.id: Feltet må fylles ut.` on the first `POST /employee` and timed out after failing to recover
    46→- `POST /employee` may also require `employments[].division.id`; persistent sandbox on 2026-03-21 required both `department.id` and `division.id`
    47→- however, subsequent sandbox re-proof on 2026-03-21 confirmed that employees created WITHOUT `employments[]` can still register timesheet entries, be added as project participants, and perform all scored lifecycle actions — this eliminates the `GET /division` call entirely and avoids the division/startDate/employmentType traps
    48→- for this lifecycle task family, only `GET /department` is needed proactively (not `GET /division`)
    49→- CRITICAL finding on 2026-03-21: the Leverandørfaktura voucher with project linkage on the 6590 posting does NOT populate `project.overallStatus.costs` — costs remain 0 even when voucher postings correctly reference the project; only `POST /project/orderline` with `unitCostCurrency` populates `overallStatus.costs`; therefore BOTH are needed: orderline for project-level cost tracking + voucher for accounting and supplier linkage
    50→- `POST /supplierInvoice` has no POST method in the OpenAPI spec; it was removed or never existed; the endpoint returns 500 (without fields) or 422 (with unknown fields like `dueDate` or `paymentDueDate`); supplier invoices can only be created via document import — the Leverandørfaktura voucher is the correct alternative
    51→
    52→Production run for `Dataplattform Elvdal` (a81782be) on 2026-03-21 completed with 0 errors but 2 wasted calls:
    53→- the script used `GET /division` (+1 unnecessary call) and included `employments[]` on employee payloads — employees without employment records can still register timesheet entries and all scored actions; sandbox re-proof confirmed this
    54→- the script used two separate `GET /ledger/account` reads: `number=6590,2400` for voucher accounts and `isBankAccount=true` for bank accounts (+1 unnecessary call) — a single combined `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` provides all three accounts in 1 call
    55→- the script also had suboptimal sequencing: emp1 sequential (step 2), then emp2+PM parallel (step 3), then project sequential (step 4) — the PM read should be in step 1 (parallel with dept+customer), enabling both employees + project to be created in parallel in step 2
    56→- the bank-account repair branch was triggered (acc 1920 had no bankAccountNumber), adding 1 conditional call
    57→- total calls: 19 (17 optimal with bank fix + 1 wasted GET /division + 1 wasted separate bank-account GET); 0 errors
    58→- sandbox re-proof confirmed the optimized 16-call path (without bank fix) with 0 errors: employees without `employments[]`, combined account read `number=1920,6590,2400`, and maximal step-2 parallelization (emp1+emp2+project)
    59→
    60→Production run for `System Upgrade Greenfield` on 2026-03-21 scored `0/1` (timeout) because:
    61→- the script did not include proactive `GET /department` before `POST /employee`
    62→- `POST /employee` failed with `422 department.id: Feltet må fylles ut.`
    63→- the agent spent too long reading documentation before writing the script, then failed to recover within the 300s budget
    64→- the corrected script (with dept+div reads) was written but never ran successfully before timeout
    65→
    66→Production run for `ERP Implementation Silveroak` on 2026-03-21 scored `0/1` (timeout) because:
    67→- the script omitted `userType` from the `POST /employee` payload
    68→- `POST /employee` failed with `422 Brukertype kan ikke være "0" eller tom.`
    69→- only 3 API calls succeeded (GET department, GET division, POST customer) before the first employee write failed
    70→- the agent was asked to continue but the follow-up pass started instead of the original run continuing within the 300s budget
    71→- sandbox re-verification on 2026-03-21 confirmed the full lifecycle flow succeeds with `userType: "NO_ACCESS"` on both employee creates
    72→- sandbox also confirmed that `employments[].startDate` is required when `employments[]` is included (for division linkage); omitting it fails with `422 employments.startDate: Kan ikke være null.`
    73→- sandbox also required `dateOfBirth` on employee creation, though fresh production accounts may not; include a placeholder `"1985-01-15"` defensively
    74→
    75→Production run for `Cloud-Migration Eichenhof` on 2026-03-21 was incomplete because:
    76→- `GET /division?count=1&fields=*` returned an empty array (no divisions in the account)
    77→- the script unconditionally included `division: { id: undefined }` in the employment payload
    78→- `POST /employee` failed with `422 employments.division.name: Feltet kan ikke være tomt.` because Tripletex interprets the presence of the `division` key as an attempt to create a new division
    79→- after recovery from the division error, `POST /timesheet/entry/list` returned a transient `409` but succeeded on immediate retry
    80→- the bank-account repair step used `bankAccountNumber: "12345678901"` (not MOD11-valid) and failed `422`; the correct value is `"12345678903"`
    81→- the invoice was never created because the agent stopped after the bank-account error
    82→- total calls: 16 (13 success + 3 errors), task incomplete
    83→- the correct path would have been 14-15 calls with 0 errors by: (a) conditionally omitting `division` when no division exists, (b) using `"12345678903"` for the bank-account repair
    84→
    85→Production run for `ERP-implementering Havbris` on 2026-03-21 completed with 1 avoidable 422 and 1 duplicate call:
    86→- the `splitHours` function used `new Date(start + "T00:00:00")` (local time) then `.toISOString().slice(0, 10)` (UTC), shifting all timesheet dates back by 1 day in CET/CEST timezone
    87→- `POST /timesheet/entry/list` failed `422 Startdato for prosjektet ... Det kan ikke registreres timer før denne datoen.` because the first entry date was `2026-03-20` instead of `2026-03-21`
    88→- the supplier POST ran in parallel and succeeded before the error was caught
    89→- the recovery script (run2) re-created the supplier (duplicate) and re-ran timesheet with UTC-safe dates using `new Date(Date.UTC(y, m-1, d + offset))`
    90→- total calls: 17 (15 ideal with bank fix + 1 wasted 422 + 1 duplicate supplier), 1 error
    91→- the correct implementation: always use `Date.UTC()` for date construction in timesheet splitting
    92→- sandbox re-proof confirmed the full 14-call path with UTC-safe dates succeeds with 0 errors
    93→
    94→Production run for `Migração Cloud Horizonte` on 2026-03-21 completed with 1 avoidable 422:
    95→- the agent sent `activity: { name: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false }` without `activityType` on `POST /project/projectActivity`
    96→- got `422 activity.activityType: Kan ikke være null.`, wasting 1 call
    97→- the resume script used both `name: "Prosjektaktivitet"` and `activityType: "PROJECT_SPECIFIC_ACTIVITY"` which succeeded
    98→- the bank-account repair branch was also triggered (bank had no number), adding 1 conditional call
    99→- total calls: 16 (15 base with bank repair + 1 wasted 422); ideal was 15
   100→- sandbox re-proof confirmed both `name` and `activityType` are independently mandatory on the inline `activity` object
   101→
   102→Production run for `Cloud Migration Northwave` on 2026-03-21 completed with 1 avoidable 422:
   103→- the agent placed `isChargeable: false` on the `POST /project/projectActivity` root instead of inside the nested `activity` object
   104→- got `422 isChargeable: Feltet eksisterer ikke i objektet.`, wasting 1 call
   105→- the resume script moved `isChargeable` inside `activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false }` and succeeded
   106→- the bank-account repair branch was also triggered (bank had no number), adding 1 conditional call
   107→- total calls: 16 (15 base with bank repair + 1 wasted 422); ideal was 15
   108→- sandbox re-proof confirmed: `isChargeable` on projectActivity root → 422; inside `activity` object → 201; omitted entirely → 201
   109→
   110→Production run for `ERP-implementering Snøhetta` on 2026-03-21 completed with 3 avoidable 422s and 4 wasted repeat GETs:
   111→- the script included `employmentType: "ORDINARY"` and `percentageOfFullTimeEquivalent: 100` on the employment object; `POST /employee` failed `422 employmentType: Feltet eksisterer ikke i objektet.`; the only valid employment fields are `startDate` and optionally `division`
   112→- the script omitted `row: 1` / `row: 2` from voucher postings; `POST /ledger/voucher` failed twice with `422 postings.row: Posteringene på rad 0 (guiRow 0) er systemgenererte`; adding explicit `row` fields succeeded immediately
   113→- the trusted standard hardcoded `voucherType: { id: 9744845 }` (sandbox); production had `voucherType id: 11289239`; this required an extra `GET /ledger/voucherType` lookup call
   114→- when the voucher POST failed inside `Promise.all`, the parallel vatType and bank-account GETs completed but their results were lost; these had to be repeated in the next recovery script, wasting 4 GET calls across two failed batches
   115→- the bank-account repair branch was triggered (bank had no number), adding 1 conditional call
   116→- total calls: 26 (19 ideal with bank fix + 1 employmentType 422 + 2 voucher-no-row 422s + 4 repeated GETs lost to Promise.all rejection), 3 errors
   117→- sandbox re-proof confirmed: `employmentType` → 422; without `row` → 422; with `row: 1/2` → 201; voucherType ID is environment-specific and must be looked up
   118→
   119→Production run for `Migração Cloud Horizonte` (second attempt, f17d4753) on 2026-03-21 completed with 19 calls, 0 errors but scored only 4/11 (checks 3,4,5,7 failed):
   120→- despite 0 API errors, 4 checks always failed across ALL 10+ task-29 attempts
   121→- root cause analysis revealed the production script omitted 4 critical fields documented in the trusted standard:
   122→  (a) `isFixedPrice: true` + `fixedprice: 229500` were NOT included on `POST /project`
   123→  (b) `budgetHours: 99` was NOT included on `POST /project/projectActivity`
   124→  (c) `adminAccess: true` was NOT set for the PM employee (Catarina) on `POST /project/participant` — both employees had `adminAccess: false`
   125→  (d) `POST /project/orderline` with `unitCostCurrency: 56300` was NOT created — the Leverandørfaktura voucher alone does not populate `project.overallStatus.costs` (remains 0)
   126→- sandbox investigation confirmed:
   127→  - Leverandørfaktura voucher with project linkage on 6590 posting shows `overallStatus.costs: 0` — voucher does NOT populate project costs
   128→  - adding `POST /project/orderline` with `unitCostCurrency: 56300` changes `overallStatus.costs` from 0 to 56300
   129→  - both orderline + voucher are needed: orderline for project-level cost tracking, voucher for accounting + supplier linkage
   130→- full lifecycle sandbox re-proof with all 4 fixes: 17 calls (16 base + 1 bank fix), 0 errors, all scored fields correct:
   131→  - `project.isFixedPrice: true`, `project.fixedprice: 229500`
   132→  - `projectActivity.budgetHours: 99`, `projectActivity.budgetFeeCurrency: 229500`
   133→  - PM employee participant `adminAccess: true`
   134→  - `overallStatus.costs: 56300` (from orderline), `overallStatus.income: 229500` (from invoice)
   135→- new baseline: **17 calls** (16 base + 1 orderline, or 18 with bank fix)
   136→
   137→## Minimal Safe Flow
   138→
   139→The optimized path skips `GET /division` (employees work without `employments[]`), combines account reads, uses both orderline+voucher for supplier cost, and uses maximal parallelization:
   140→
   141→1. `GET /department?isInactive=false&count=1&fields=*` + `POST /customer` + `GET /employee?assignableProjectManagers=true&count=1&fields=*` (parallel, 3 calls)
   142→2. `POST /employee` (emp1) + `POST /employee` (emp2) + `POST /project` with `isFixedPrice: true` + `fixedprice: <budget>` (parallel, 3 calls — all deps from step 1)
   143→3. `POST /project/projectActivity` with `budgetHours` + `budgetFeeCurrency` + `POST /project/participant` (PM emp with `adminAccess: true`) + `POST /project/participant` (other emp with `adminAccess: false`) (parallel, 3 calls)
   144→4. `POST /timesheet/entry/list` + `POST /supplier` + `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` + `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` (parallel, 4 calls)
   145→5. `POST /project/orderline` (non-chargeable cost with `unitCostCurrency`) + `POST /ledger/voucher` (Leverandørfaktura) + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*` (parallel, 3 calls)
   146→6. (conditional) `PUT /ledger/account/{id}` if bank account 1920 needs `bankAccountNumber` fix (0 or 1 calls)
   147→7. `POST /invoice?sendToCustomer=false` with root `invoiceDate`, explicit `invoiceDueDate`, root `customer.id`, and embedded `orders[]` row
   148→
   149→Call count breakdown:
   150→- 1 department read (parallel with customer + PM)
   151→- 1 customer write (parallel with dept + PM)
   152→- 1 assignable-manager read (parallel with dept + customer)
   153→- 2 employee writes (parallel with project, step 2)
   154→- 1 project write with `isFixedPrice: true` + `fixedprice` (parallel with employees, step 2)
   155→- 1 project-activity write with `budgetHours` + `budgetFeeCurrency` (parallel with 2 participant writes)
   156→- 2 project-participant writes (PM emp: `adminAccess: true`, other: `adminAccess: false`)
   157→- 1 batch timesheet write (parallel with supplier + combined account read + voucherType read)
   158→- 1 supplier write (parallel)
   159→- 1 combined account read for 1920+6590+2400 (replaces two separate reads)
   160→- 1 voucherType read (parallel)
   161→- 1 project orderline write for cost tracking (parallel with voucher + VAT read)
   162→- 1 Leverandørfaktura voucher write for supplier linkage (parallel with orderline + VAT read)
   163→- 1 outgoing-VAT read (parallel with orderline + voucher)
   164→- 0-1 bank-account fix
   165→- 1 direct invoice write
   166→- **total baseline: `17` calls, 0 errors** (or `18` with bank fix)
   167→
   168→## Critical Rules — MUST-IMPLEMENT (previously omitted by agents, causing 4 check failures)
   169→
   170→These 4 rules were documented but NOT implemented in 10+ production runs, causing checks 3,4,5,7 to always fail:
   171→
   172→1. **Project isFixedPrice + fixedprice**: ALWAYS include `isFixedPrice: true` and `fixedprice: <budget amount>` on `POST /project`; without these, `fixedprice` defaults to 0 and the scorer cannot see the budget — this likely causes check 3 to fail
   173→2. **budgetHours on projectActivity**: ALWAYS include `budgetHours: <total hours from prompt>` (sum of ALL employees' hours, e.g. 37+62=99) on the `POST /project/projectActivity` payload alongside `budgetFeeCurrency` — this likely causes check 4 to fail
   174→3. **PM employee adminAccess**: for the employee designated as "project manager" / "prosjektleder" / "gestor de projeto" in the prompt, use `adminAccess: true` on their `POST /project/participant`; the other employee gets `adminAccess: false` — this likely causes check 5 to fail
   175→4. **Project orderline for supplier cost tracking**: ALWAYS create `POST /project/orderline` with `unitCostCurrency: <supplier cost>` and `isChargeable: false` IN ADDITION to the Leverandørfaktura voucher; the voucher alone does NOT populate `project.overallStatus.costs` (stays at 0); the orderline is needed for project-level cost visibility — this likely causes check 7 to fail
   176→
   177→## Critical Rules — Standard
   178→
   179→- **Employee userType**: always include `userType: "NO_ACCESS"` on every `POST /employee`; omitting it causes `422 Brukertype kan ikke være "0" eller tom.`
   180→- **Employee without employments[]**: do NOT include `employments[]` on employee payloads in this lifecycle flow; employees without employment records can still register timesheet entries, project participation, and all scored actions; this avoids the division/startDate/employmentType traps entirely and eliminates the `GET /division` call
   181→- **Employee dateOfBirth**: include a placeholder `dateOfBirth` (e.g. `"1985-01-15"`) defensively; some accounts require it
   182→- **Department**: always read department proactively; if none exists, create one with `POST /department`
   183→- **Project startDate**: must be on or before the earliest planned timesheet entry date; set it to the run date
   184→- **Timesheet dates**: all dates must be >= project `startDate`; consecutive dates, max 7.5h per entry per employee per date
   185→- **Timesheet date arithmetic**: CRITICAL — use `new Date(Date.UTC(y, m-1, d))` for UTC-safe date construction; `new Date(dateStr + "T00:00:00")` + `.toISOString()` shifts dates back 1 day in CET/CEST
   186→- **Batch timesheet**: use `POST /timesheet/entry/list` with array of all entries; 1 API call regardless of count
   187→- **Combined account read**: use `GET /ledger/account?number=1920,6590,2400` to get voucher accounts (6590, 2400) and bank account (1920) in 1 call instead of 2
   188→- **Lifecycle invoice**: use direct `POST /invoice?sendToCustomer=false` with embedded `orders[]`
   189→- **Invoice due date**: requires explicit root `invoiceDueDate`; omitting it fails `422`
   190→- **Manager lookup**: use one generic `GET /employee?assignableProjectManagers=true&count=1&fields=*`; do not try to make newly created employees assignable as PM
   191→
   192→## Conditional Branches
   193→
   194→- If no department exists in `GET /department?isInactive=false&count=1&fields=*`:
   195→  - `POST /department` with `{ "name": "Avdeling" }` (+1 call)
   196→- If account 1920 is not returned by the combined account read:
   197→  - fall back to `GET /ledger/account?isBankAccount=true&fields=*` (+1 call)
   198→- If the bank account (1920) lacks `bankAccountNumber`:
   199→  - `PUT /ledger/account/{id}` with `{ "bankAccountNumber": "12345678903" }` (MOD11-valid)
   200→  - retry the same direct `POST /invoice` payload once
   201→- PM constraint: only the account owner can be PM; use the generic assignable manager and add the prompt-named PM as a project participant
   202→
   203→## Recommended Shapes
   204→
   205→Employee for lifecycle flow (POST /employee) — no `employments[]` needed:
   206→
   207→```json
   208→{
   209→  "firstName": "Henry",
   210→  "lastName": "Harris",
   211→  "email": "henry.harris@example.org",
   212→  "dateOfBirth": "1985-01-15",
   213→  "userType": "NO_ACCESS",
   214→  "department": { "id": 12345 }
   215→}
   216→```
   217→
   218→Direct budgeted project activity:
   219→
   220→```json
   221→{
   222→  "project": { "id": 54321 },
   223→  "startDate": "2026-03-21",
   224→  "budgetHours": 186,
   225→  "budgetFeeCurrency": 206300,
   226→  "activity": {
   227→    "name": "Prosjektarbeid",
   228→    "activityType": "PROJECT_SPECIFIC_ACTIVITY",
   229→    "isChargeable": false
   230→  }
   231→}
   232→```
   233→
   234→Direct lifecycle invoice:
   235→
   236→```json
   237→{
   238→  "invoiceDate": "2026-03-21",
   239→  "invoiceDueDate": "2026-04-04",
   240→  "customer": { "id": 12345 },
   241→  "orders": [
   242→    {
   243→      "customer": { "id": 12345 },
   244→      "project": { "id": 54321 },
   245→      "orderDate": "2026-03-21",
   246→      "deliveryDate": "2026-03-25",
   247→      "orderLines": [
   248→        {
   249→          "description": "Cloud-Migration Brückentor",
   250→          "count": 1,
   251→          "unitPriceExcludingVatCurrency": 262850,
   252→          "vatType": { "id": 6 }
   253→        }
   254→      ]
   255→    }
   256→  ]
   257→}
   258→```
   259→
   260→Keep `project` on the embedded `orders[]` object, not on `orderLines[]`.
   261→
   262→Batch timesheet entries (POST /timesheet/entry/list):
   263→
   264→```json
   265→[
   266→  { "employee": { "id": 111 }, "project": { "id": 222 }, "activity": { "id": 333 }, "date": "2026-03-21", "hours": 24 },
   267→  { "employee": { "id": 111 }, "project": { "id": 222 }, "activity": { "id": 333 }, "date": "2026-03-22", "hours": 12 },
   268→  { "employee": { "id": 444 }, "project": { "id": 222 }, "activity": { "id": 333 }, "date": "2026-03-21", "hours": 24 },
   269→  { "employee": { "id": 444 }, "project": { "id": 222 }, "activity": { "id": 333 }, "date": "2026-03-22", "hours": 24 }
   270→]
   271→```
   272→
   273→Project participant — PM employee (POST /project/participant):
   274→
   275→```json
   276→{
   277→  "project": { "id": 54321 },
   278→  "employee": { "id": 111 },
   279→  "adminAccess": true
   280→}
   281→```
   282→
   283→Project participant — other employee (POST /project/participant):
   284→
   285→```json
   286→{
   287→  "project": { "id": 54321 },
   288→  "employee": { "id": 444 },
   289→  "adminAccess": false
   290→}
   291→```
   292→
   293→Supplier cost — project orderline for cost tracking (POST /project/orderline):
   294→
   295→```json
   296→{
   297→  "project": { "id": 54321 },
   298→  "description": "Leverandørkostnad fra Supplier Name",
   299→  "date": "2026-03-21",
   300→  "count": 1,
   301→  "unitCostCurrency": 56750,
   302→  "isChargeable": false
   303→}
   304→```
   305→
   306→This populates `project.overallStatus.costs`. The `vendor` field reads back as `null` — this is expected. The voucher below handles supplier linkage.
   307→
   308→Supplier cost — Leverandørfaktura voucher for accounting + supplier linkage (POST /ledger/voucher):
   309→
   310→```json
   311→{
   312→  "date": "2026-03-21",
   313→  "description": "Leverandørkostnad fra Supplier Name",
   314→  "voucherType": { "id": "<looked-up-id-from-GET-voucherType>" },
   315→  "postings": [
   316→    {
   317→      "row": 1,
   318→      "date": "2026-03-21",
   319→      "description": "Leverandørkostnad",
   320→      "account": { "id": "<6590-id>" },
   321→      "amount": 56750,
   322→      "amountCurrency": 56750,
   323→      "amountGross": 56750,
   324→      "amountGrossCurrency": 56750,
   325→      "project": { "id": 54321 }
   326→    },
   327→    {
   328→      "row": 2,
   329→      "date": "2026-03-21",
   330→      "description": "Leverandørgjeld",
   331→      "account": { "id": "<2400-id>" },
   332→      "amount": -56750,
   333→      "amountCurrency": -56750,
   334→      "amountGross": -56750,
   335→      "amountGrossCurrency": -56750,
   336→      "supplier": { "id": 67890 }
   337→    }
   338→  ]
   339→}
   340→```
   341→
   342→BOTH the project orderline AND the Leverandørfaktura voucher are needed:
   343→- The orderline populates `project.overallStatus.costs` (the voucher alone leaves costs at 0)
   344→- The voucher creates the accounting entry with supplier linkage (the orderline's `vendor` field reads back as null)
   345→Do NOT use `POST /supplierInvoice` — the endpoint has no POST method in the spec; supplier invoices are created only via document import.
   346→The voucherType ID for Leverandørfaktura is **environment-specific** (e.g. `9744845` in sandbox, `11289239` in production). Always resolve it dynamically via `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` in step 4. Resolve account IDs via `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` (combined read that also provides bank account).
   347→CRITICAL: each posting MUST include an explicit `row` field (`row: 1` for expense, `row: 2` for credit). Omitting `row` causes `422 postings.row: Posteringene på rad 0 (guiRow 0) er systemgenererte` because Tripletex treats row 0 as system-generated.
   348→
   349→## Avoidable Mistakes
   350→
   351→CORRECTNESS-CRITICAL (caused all 10+ production attempts to fail checks 3,4,5,7):
   352→- Do not omit `isFixedPrice: true` and `fixedprice: <budget>` from `POST /project` — the scorer checks the project-level budget
   353→- Do not omit `budgetHours: <total>` from `POST /project/projectActivity` — the scorer checks hour budgets
   354→- Do not use `adminAccess: false` for the PM employee's participant — the PM employee (prosjektleder/gestor de projeto) MUST have `adminAccess: true`
   355→- Do not skip `POST /project/orderline` for supplier cost — the Leverandørfaktura voucher alone does NOT populate `project.overallStatus.costs`; you need BOTH orderline (for cost tracking) AND voucher (for supplier linkage)
   356→
   357→Standard:
   358→- Do not omit `userType` from `POST /employee` payloads; use `"NO_ACCESS"`
   359→- Do not include `employments[]` on employee payloads for this lifecycle flow; employees work without employment records and omitting them avoids all division/startDate/employmentType traps
   360→- Do not use `GET /division` — it is unnecessary when employees are created without `employments[]`
   361→- Do not use two separate `GET /ledger/account` reads; combine into one `GET /ledger/account?number=1920,6590,2400`
   362→- Do not use individual `POST /timesheet/entry` calls; use `POST /timesheet/entry/list` batch
   363→- Do not set project `startDate` after timesheet entry dates
   364→- Do not skip proactive `GET /department`
   365→- Do not use `POST /supplierInvoice` (no POST method in spec; only document import)
   366→- Do not hardcode voucherType ID — always resolve via `GET /ledger/voucherType?name=Leverandørfaktura`
   367→- Do not omit `row` on voucher postings — use `row: 1` and `row: 2`
   368→- Do not put `project` inside `orderLines[]`; keep on `orders[]` level
   369→- Do not omit `invoiceDueDate` on the direct invoice
   370→- Do not omit `activityType` from inline `activity` on projectActivity; both `name` and `activityType: "PROJECT_SPECIFIC_ACTIVITY"` are mandatory
   371→- Do not place `isChargeable` on projectActivity root; it must be inside the `activity` object
   372→- Use `new Date(Date.UTC(y, m-1, d))` for timesheet date splitting — local-time construction shifts dates back 1 day in CET/CEST
   373→- Bank account fix: always use `"12345678903"` (MOD11-valid); `"12345678901"` fails 422
   374→
```

## 2026-03-21T23:00:25.757Z tool_result
tool: Read
call_id: toolu_vrtx_01HEdS1u9YwMQdEiCUiFJP34

```text
File content (30149 tokens) exceeds maximum allowed tokens (10000). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.
```

## 2026-03-21T23:01:29.237Z tool_call
tool: Write
call_id: toolu_vrtx_01QKXwz9rDCFwb6yMyLtgNDu

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-230013709Z-ff67568b/scripts/run.ts",
  "content": "const BASE = \"https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2\";\nconst TOKEN = \"PNtqqzqyzyKZVOwMgwuBLVIhuiydPIQIoePl6KNtN8k\";\nconst AUTH = \"Basic \" + btoa(\"0:\" + TOKEN);\nconst TODAY = \"2026-03-22\";\n\nasync function api(method: string, path: string, body?: any) {\n  const url = `${BASE}${path}`;\n  const opts: any = {\n    method,\n    headers: { \"Authorization\": AUTH, \"Content-Type\": \"application/json\" },\n  };\n  if (body !== undefined) opts.body = JSON.stringify(body);\n  const r = await fetch(url, opts);\n  const text = await r.text();\n  let json: any;\n  try { json = JSON.parse(text); } catch { json = text; }\n  if (!r.ok) {\n    console.error(`${method} ${path} -> ${r.status}`, JSON.stringify(json).slice(0, 500));\n    throw new Error(`${r.status} on ${method} ${path}`);\n  }\n  console.log(`${method} ${path} -> ${r.status}`);\n  return json;\n}\n\nfunction splitHours(total: number, startDate: string): { date: string; hours: number }[] {\n  const entries: { date: string; hours: number }[] = [];\n  const [y, m, d] = startDate.split(\"-\").map(Number);\n  let remaining = total;\n  let offset = 0;\n  while (remaining > 0) {\n    const h = Math.min(remaining, 7.5);\n    const dt = new Date(Date.UTC(y, m - 1, d + offset));\n    entries.push({ date: dt.toISOString().slice(0, 10), hours: h });\n    remaining -= h;\n    offset++;\n  }\n  return entries;\n}\n\nasync function main() {\n  // ── Step 1: dept + customer + assignable PM (parallel, 3 calls) ──\n  const [deptRes, custRes, pmRes] = await Promise.all([\n    api(\"GET\", \"/department?isInactive=false&count=1&fields=*\"),\n    api(\"POST\", \"/customer\", {\n      name: \"Eichenhof GmbH\",\n      organizationNumber: \"986645888\",\n    }),\n    api(\"GET\", \"/employee?assignableProjectManagers=true&count=1&fields=*\"),\n  ]);\n\n  let deptId: number;\n  if (deptRes.values && deptRes.values.length > 0) {\n    deptId = deptRes.values[0].id;\n  } else {\n    const newDept = await api(\"POST\", \"/department\", { name: \"Avdeling\" });\n    deptId = newDept.value.id;\n  }\n\n  const customerId = custRes.value.id;\n  const pmManagerId = pmRes.values[0].id;\n\n  // ── Step 2: 2 employees + project (parallel, 3 calls) ──\n  const [hannahRes, marieRes, projRes] = await Promise.all([\n    api(\"POST\", \"/employee\", {\n      firstName: \"Hannah\",\n      lastName: \"Weber\",\n      email: \"hannah.weber@example.org\",\n      dateOfBirth: \"1985-01-15\",\n      userType: \"NO_ACCESS\",\n      department: { id: deptId },\n    }),\n    api(\"POST\", \"/employee\", {\n      firstName: \"Marie\",\n      lastName: \"Fischer\",\n      email: \"marie.fischer@example.org\",\n      dateOfBirth: \"1987-06-20\",\n      userType: \"NO_ACCESS\",\n      department: { id: deptId },\n    }),\n    api(\"POST\", \"/project\", {\n      name: \"Cloud-Migration Eichenhof\",\n      startDate: TODAY,\n      customer: { id: customerId },\n      projectManager: { id: pmManagerId },\n      isFixedPrice: true,\n      fixedprice: 253000,\n    }),\n  ]);\n\n  const hannahId = hannahRes.value.id;\n  const marieId = marieRes.value.id;\n  const projectId = projRes.value.id;\n\n  // ── Step 3: projectActivity + 2 participants (parallel, 3 calls) ──\n  const totalHours = 34 + 118; // 152\n  const [actRes] = await Promise.all([\n    api(\"POST\", \"/project/projectActivity\", {\n      project: { id: projectId },\n      startDate: TODAY,\n      budgetHours: totalHours,\n      budgetFeeCurrency: 253000,\n      activity: {\n        name: \"Prosjektaktivitet\",\n        activityType: \"PROJECT_SPECIFIC_ACTIVITY\",\n        isChargeable: false,\n      },\n    }),\n    // Hannah = Projektleiter → adminAccess: true\n    api(\"POST\", \"/project/participant\", {\n      project: { id: projectId },\n      employee: { id: hannahId },\n      adminAccess: true,\n    }),\n    // Marie = Berater → adminAccess: false\n    api(\"POST\", \"/project/participant\", {\n      project: { id: projectId },\n      employee: { id: marieId },\n      adminAccess: false,\n    }),\n  ]);\n\n  const activityId = actRes.value.activity.id;\n\n  // ── Step 4: timesheet batch + supplier + accounts + voucherType (parallel, 4 calls) ──\n  const hannahEntries = splitHours(34, TODAY).map(e => ({\n    employee: { id: hannahId },\n    project: { id: projectId },\n    activity: { id: activityId },\n    date: e.date,\n    hours: e.hours,\n  }));\n  const marieEntries = splitHours(118, TODAY).map(e => ({\n    employee: { id: marieId },\n    project: { id: projectId },\n    activity: { id: activityId },\n    date: e.date,\n    hours: e.hours,\n  }));\n  const allEntries = [...hannahEntries, ...marieEntries];\n\n  const [tsRes, suppRes, accRes, vtRes] = await Promise.all([\n    api(\"POST\", \"/timesheet/entry/list\", allEntries),\n    api(\"POST\", \"/supplier\", {\n      name: \"Silberberg GmbH\",\n      organizationNumber: \"823323948\",\n    }),\n    api(\"GET\", \"/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber\"),\n    api(\"GET\", \"/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name\"),\n  ]);\n\n  const supplierId = suppRes.value.id;\n  const accounts = accRes.values as any[];\n  const acc1920 = accounts.find((a: any) => a.number === 1920);\n  const acc6590 = accounts.find((a: any) => a.number === 6590);\n  const acc2400 = accounts.find((a: any) => a.number === 2400);\n  const voucherTypeId = vtRes.values[0].id;\n\n  console.log(`Accounts: 1920=${acc1920?.id}, 6590=${acc6590?.id}, 2400=${acc2400?.id}`);\n  console.log(`VoucherType: ${voucherTypeId}`);\n  console.log(`Timesheet entries created: ${tsRes.values?.length}`);\n\n  // ── Step 5: orderline + voucher + vatType (parallel, 3 calls) ──\n  const [olRes, vchRes, vatRes] = await Promise.all([\n    api(\"POST\", \"/project/orderline\", {\n      project: { id: projectId },\n      description: \"Leverandørkostnad fra Silberberg GmbH\",\n      date: TODAY,\n      count: 1,\n      unitCostCurrency: 47050,\n      isChargeable: false,\n    }),\n    api(\"POST\", \"/ledger/voucher\", {\n      date: TODAY,\n      description: \"Leverandørkostnad fra Silberberg GmbH\",\n      voucherType: { id: voucherTypeId },\n      postings: [\n        {\n          row: 1,\n          date: TODAY,\n          description: \"Leverandørkostnad\",\n          account: { id: acc6590.id },\n          amount: 47050,\n          amountCurrency: 47050,\n          amountGross: 47050,\n          amountGrossCurrency: 47050,\n          project: { id: projectId },\n        },\n        {\n          row: 2,\n          date: TODAY,\n          description: \"Leverandørgjeld\",\n          account: { id: acc2400.id },\n          amount: -47050,\n          amountCurrency: -47050,\n          amountGross: -47050,\n          amountGrossCurrency: -47050,\n          supplier: { id: supplierId },\n        },\n      ],\n    }),\n    api(\"GET\", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),\n  ]);\n\n  console.log(`Orderline: ${olRes.value?.id}`);\n  console.log(`Voucher: ${vchRes.value?.id}`);\n\n  const vatTypes = vatRes.values as any[];\n  const vat25 = vatTypes.find((v: any) => v.percentage === 25.0) || vatTypes[0];\n  console.log(`VAT type: ${vat25.id} (${vat25.percentage}%)`);\n\n  // ── Step 6: bank account fix if needed ──\n  let bankFixed = false;\n  if (acc1920 && !acc1920.bankAccountNumber) {\n    console.log(\"Bank account 1920 needs bankAccountNumber fix\");\n    await api(\"PUT\", `/ledger/account/${acc1920.id}`, {\n      id: acc1920.id,\n      number: acc1920.number,\n      name: acc1920.name,\n      bankAccountNumber: \"12345678903\",\n    });\n    bankFixed = true;\n  }\n\n  // ── Step 7: direct invoice ──\n  const dueDate = \"2026-04-05\";\n  const invoiceRes = await api(\"POST\", \"/invoice?sendToCustomer=false\", {\n    invoiceDate: TODAY,\n    invoiceDueDate: dueDate,\n    customer: { id: customerId },\n    orders: [\n      {\n        customer: { id: customerId },\n        project: { id: projectId },\n        orderDate: TODAY,\n        deliveryDate: TODAY,\n        orderLines: [\n          {\n            description: \"Cloud-Migration Eichenhof\",\n            count: 1,\n            unitPriceExcludingVatCurrency: 253000,\n            vatType: { id: vat25.id },\n          },\n        ],\n      },\n    ],\n  });\n\n  console.log(\"\\n=== RESULT ===\");\n  console.log(`Customer: ${customerId}`);\n  console.log(`Employees: Hannah=${hannahId}, Marie=${marieId}`);\n  console.log(`Project: ${projectId} (fixedprice=253000, isFixedPrice=true)`);\n  console.log(`Activity: ${activityId} (budgetHours=${totalHours})`);\n  console.log(`Supplier: ${supplierId}`);\n  console.log(`Orderline: ${olRes.value?.id} (unitCostCurrency=47050)`);\n  console.log(`Voucher: ${vchRes.value?.id}`);\n  console.log(`Bank fix: ${bankFixed}`);\n  console.log(`Invoice: ${invoiceRes.value?.id}`);\n  console.log(`Invoice amount: ${invoiceRes.value?.amountExcludingVatCurrency}`);\n  console.log(`Project invoice details: ${invoiceRes.value?.projectInvoiceDetails?.length}`);\n  const totalCalls = 17 + (bankFixed ? 1 : 0);\n  console.log(`Total API calls: ${totalCalls}`);\n}\n\nmain().catch(e => { console.error(\"FATAL:\", e.message); process.exit(1); });\n"
}
```

## 2026-03-21T23:01:29.292Z tool_result
tool: Write
call_id: toolu_vrtx_01QKXwz9rDCFwb6yMyLtgNDu

```text
File created successfully at: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-230013709Z-ff67568b/scripts/run.ts
```

## 2026-03-21T23:01:38.156Z tool_call
tool: Bash
call_id: toolu_vrtx_01LrNGRXnefrCDN7LB4dkMGd

```json
{
  "command": "cd /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-230013709Z-ff67568b/scripts && bun run run.ts 2>&1",
  "description": "Execute Tripletex project lifecycle script",
  "timeout": 120000
}
```

## 2026-03-21T23:01:42.334Z tool_result
tool: Bash
call_id: toolu_vrtx_01LrNGRXnefrCDN7LB4dkMGd

```text
GET /department?isInactive=false&count=1&fields=* -> 200
GET /employee?assignableProjectManagers=true&count=1&fields=* -> 200
POST /customer -> 201
POST /employee -> 201
POST /employee -> 201
POST /project -> 201
POST /project/participant -> 201
POST /project/projectActivity -> 201
POST /project/participant -> 201
GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber -> 200
GET /ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name -> 200
POST /supplier -> 201
POST /timesheet/entry/list -> 201
Accounts: 1920=476626678, 6590=476626954, 2400=476626737
VoucherType: 11429736
Timesheet entries created: 21
POST /project/orderline -> 201
GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=* -> 200
POST /ledger/voucher -> 201
Orderline: 1607581635
Voucher: 609202624
VAT type: 3 (25%)
Bank account 1920 needs bankAccountNumber fix
PUT /ledger/account/476626678 -> 200
POST /invoice?sendToCustomer=false -> 201

=== RESULT ===
Customer: 108451398
Employees: Hannah=18686811, Marie=18686810
Project: 402044472 (fixedprice=253000, isFixedPrice=true)
Activity: 5994811 (budgetHours=152)
Supplier: 108451409
Orderline: 1607581635 (unitCostCurrency=47050)
Voucher: 609202624
Bank fix: true
Invoice: 2147648911
Invoice amount: 253000
Project invoice details: 1
Total API calls: 18
```

## 2026-03-21T23:01:48.948Z assistant_message
18 calls, 0 errors. All entities created:

- **Customer**: Eichenhof GmbH (108451398)
- **Employees**: Hannah Weber (18686811, PM/adminAccess:true), Marie Fischer (18686810)
- **Project**: Cloud-Migration Eichenhof (402044472, fixedprice=253000, isFixedPrice=true)
- **Activity**: budgetHours=152, budgetFeeCurrency=253000
- **Timesheet**: 21 entries (34h Hannah + 118h Marie)
- **Supplier**: Silberberg GmbH (108451409), cost=47050
- **Orderline**: unitCostCurrency=47050 (project cost tracking)
- **Voucher**: Leverandørfaktura with supplier linkage
- **Bank fix**: 1920 account needed bankAccountNumber → applied "12345678903"
- **Invoice**: 2147648911, amount=253000, projectInvoiceDetails=1
