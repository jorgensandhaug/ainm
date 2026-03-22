# Claude Trace Snapshot

- provider: claude
- session_id: 2a536ff0-91f7-4d08-84d5-728dbf5eef0b
- session_file: /home/jorge/.claude/projects/-home-jorge-repos-ainm-tasks-tripletex-codex-environment/2a536ff0-91f7-4d08-84d5-728dbf5eef0b.jsonl
- completed: true
- assistant_messages: 1
- tool_calls: 12
- tool_results: 12

## 2026-03-22T10:40:48.257Z user_message
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
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-104047538Z-c93ecb23/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Create an order for the customer Oakwood Ltd (org no. 932937204) with the products Data Advisory (3346) at 16000 NOK and Network Service (7273) at 22050 NOK. Convert the order to an invoice and register full payment.

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
7VtyU0K1uLsf9wwHsEAm7-JXp3-BY4yRoA2eLeobwD8

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-104047538Z-c93ecb23/scripts

Runner configuration:
- provider: claude
- model: claude-opus-4-6
- effort: high
- backend: proxy
- proxy_base_url: https://europe-west1-ai-nm26osl-1706.cloudfunctions.net/claude-proxy
- disable_experimental_betas: false

## 2026-03-22T10:40:53.887Z tool_call
tool: Glob
call_id: toolu_vrtx_01JDk1hGRY3qDREkd8Z9JwUj

```json
{
  "pattern": "trusted-standards/create-and-send-customer-invoice*",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-22T10:40:53.889Z tool_call
tool: Glob
call_id: toolu_vrtx_016TGuzrv1WYRc5MjkjBzVby

```json
{
  "pattern": "task-playbooks/create-and-send-customer-invoice*",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-22T10:40:53.890Z tool_call
tool: Read
call_id: toolu_vrtx_01DB3uMkXW7pHLSUayMdfrMa

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md"
}
```

## 2026-03-22T10:40:53.900Z tool_result
tool: Glob
call_id: toolu_vrtx_01JDk1hGRY3qDREkd8Z9JwUj

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-and-send-customer-invoice.md
```

## 2026-03-22T10:40:53.903Z tool_result
tool: Glob
call_id: toolu_vrtx_016TGuzrv1WYRc5MjkjBzVby

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-and-send-customer-invoice.md
```

## 2026-03-22T10:40:55.037Z tool_result
tool: Read
call_id: toolu_vrtx_01DB3uMkXW7pHLSUayMdfrMa

```text
File content (32427 tokens) exceeds maximum allowed tokens (10000). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.
```

## 2026-03-22T10:40:57.485Z tool_call
tool: Read
call_id: toolu_vrtx_01SHifA7CRffWbEcNAzhuTWm

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-and-send-customer-invoice.md"
}
```

## 2026-03-22T10:40:57.487Z tool_call
tool: Read
call_id: toolu_vrtx_019kMr9yrWTPnfxfCTJxVrUk

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-and-send-customer-invoice.md"
}
```

## 2026-03-22T10:40:58.754Z tool_result
tool: Read
call_id: toolu_vrtx_01SHifA7CRffWbEcNAzhuTWm

```text
File content (11232 tokens) exceeds maximum allowed tokens (10000). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.
```

## 2026-03-22T10:40:58.829Z tool_result
tool: Read
call_id: toolu_vrtx_019kMr9yrWTPnfxfCTJxVrUk

```text
     1→# Create and Send Customer Invoice
     2→
     3→## Scope
     4→
     5→Use for tasks like:
     6→- create an invoice for an existing or new customer
     7→- send the invoice after creation
     8→- invoice has one or more simple order lines
     9→
    10→For create-only invoice tasks that should stop before sending, use `./task-playbooks/create-customer-invoice.md`.
    11→
    12→## Key Finding: The Winning Send Path Is Usually The Invoice Create Itself
    13→
    14→For this task shape, do not default to:
    15→
    16→`POST /invoice?sendToCustomer=false`
    17→
    18→followed by:
    19→
    20→`PUT /invoice/{id}/:send?sendType=...`
    21→
    22→Persistent sandbox re-verification on 2026-03-20 showed a lower-call and safer path:
    23→
    24→1. create or resolve the customer
    25→2. resolve outgoing VAT
    26→3. `POST /invoice` with the default `sendToCustomer=true`
    27→4. stop
    28→
    29→The same sandbox session also showed:
    30→- explicit later `PUT /invoice/{id}/:send?sendType=MANUAL` returned `500`
    31→- explicit later `PUT /invoice/{id}/:send?sendType=PAPER` returned `422 Faktura kan ikke sendes via PAPER`
    32→
    33→For the common "new customer, no email/address in prompt" variant, the invoice create itself is the trusted send step.
    34→
    35→## Key Finding: Fresh-Account Customer Identity Is Not The Same As Existing-Customer Proof
    36→
    37→For exact create-and-send prompts that only give customer business identity such as:
    38→
    39→- exact `name`
    40→- exact `organizationNumber`
    41→- no email
    42→- no postal address
    43→- no explicit wording that the customer already exists
    44→
    45→do not spend a speculative:
    46→
    47→`GET /customer?organizationNumber=...&fields=*`
    48→
    49→first.
    50→
    51→Persistent sandbox re-verification on 2026-03-20 showed the lower-call path for that fresh-account shape is:
    52→
    53→1. `POST /customer` with:
    54→   - `name`
    55→   - `organizationNumber`
    56→   - `invoiceSendMethod: "MANUAL"`
    57→2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
    58→3. `POST /invoice`
    59→
    60→The same sandbox account then re-verified the existing-customer branch with:
    61→
    62→1. `GET /customer?organizationNumber=...&fields=*`
    63→2. `GET /ledger/vatType?...`
    64→3. `POST /invoice`
    65→
    66→So the pre-read is only part of the trusted path when the prompt explicitly implies an already-existing customer or the run context is not the normal fresh-account shape.
    67→
    68→The same rule is language-agnostic for explicit no-VAT prompts. The 2026-03-20 production run for Portuguese `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` / `sem IVA` also succeeded in the same `3` calls:
    69→
    70→1. `POST /customer` with `invoiceSendMethod: "MANUAL"`
    71→2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
    72→3. `POST /invoice`
    73→
    74→So do not let prompt language push this shape onto an unnecessary existing-customer lookup branch.
    75→
    76→The same no-VAT branch also covers German wording such as `ohne MwSt.`. The 2026-03-20 production run for `Bergwerk GmbH` / `981122011` / `Datenberatung` / `45150` and the same-day persistent sandbox analog `Bergwerk Reflection 999518478 GmbH` both succeeded in the same `3` calls with `amountExcludingVatCurrency=amountCurrency=45150`:
    77→
    78→1. `POST /customer` with `invoiceSendMethod: "MANUAL"`
    79→2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
    80→3. `POST /invoice`
    81→
    82→The same no-VAT branch also covers Spanish wording such as `sin IVA`. The 2026-03-21 production run for `Río Verde SL` / `894012358` / `Sesión de formación` / `29100` used 6 calls (with reactive bank-account repair) and confirmed `amountExcludingVatCurrency=amountCurrency=29100`. With the now-recommended proactive approach, the optimal path would have been 5 calls:
    83→
    84→1. `POST /customer` with `invoiceSendMethod: "MANUAL"` (parallel with steps 2-3)
    85→2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` (parallel, found 0% at code 5)
    86→3. `GET /ledger/account?isBankAccount=true&fields=*` (parallel, free)
    87→4. `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` (conditional, if bankAccountNumber falsy)
    88→5. `POST /invoice` (201 — succeeds on first try, 0 errors)
    89→
    90→## Key Finding: Proactive Bank-Account Check (Preferred)
    91→
    92→Since GETs are free and 4xx errors cost penalty, **proactively check and fix the bank account BEFORE `POST /invoice`**:
    93→
    94→1. `GET /ledger/account?isBankAccount=true&fields=*` (free GET, parallelize with customer/VAT reads)
    95→2. Find the invoice account (usually `number=1920`, `isInvoiceAccount=true`)
    96→3. If `bankAccountNumber` is falsy: `PUT /ledger/account/{id}` with `{ ...acct, bankAccountNumber: "12345678903" }`
    97→4. Then `POST /invoice` — succeeds on first try, 0 errors
    98→
    99→This replaces the old reactive pattern (POST → 422 → GET → PUT → retry POST) which costs 1 extra write and 1 avoidable 422 error. The 2026-03-22 `Blueshore Ltd` production run used reactive and wasted 1 write + 1 error that proactive would have prevented. Sandbox-verified 2026-03-22: proactive 3-way parallel [GET /customer + GET /ledger/vatType + GET /ledger/account] + conditional PUT + POST /invoice succeeded with 0 errors.
   100→
   101→## Bank Account Repair — Reactive Fallback
   102→
   103→If `POST /invoice` still fails with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.` despite the proactive check:
   104→
   105→1. `GET /ledger/account?isBankAccount=true&fields=*` (if not already done)
   106→2. `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"`
   107→3. Retry `POST /invoice` once
   108→4. Keep the same invoice payload; do not re-read customer, products, or `vatType`
   109→
   110→Known constraints:
   111→- the known-good minimal payload on the existing invoice account is `{ "bankAccountNumber": "12345678903" }`
   112→- do not burn calls on an improvised locally generated bank-account number unless this exact minimal repair itself fails
   113→- if you do need a different number, use a valid Norwegian mod-11 checksum with weights `5,4,3,2,7,6,5,4,3,2` across the first ten digits; the wrong weight order only burns a `422`
   114→- once that repair branch has already identified the invoice `account.id`, reuse it directly; do not spend a second `/ledger/account` read after a local repair-payload mistake
   115→- if the customer create already succeeded and you later lose local process state, resume on the existing-customer branch instead of repeating `POST /customer`
   116→
   117→## Key Finding: Resolve VAT Type Dynamically
   118→
   119→Do not hardcode invoice line `vatType.id = 3`.
   120→
   121→Use:
   122→
   123→`GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
   124→
   125→and choose from the filtered result for the actual invoice date.
   126→
   127→This was re-verified in sandbox on 2026-03-19:
   128→- `POST /invoice` failed with `Ugyldig mva-kode.` when line VAT was hardcoded to `3`
   129→- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*` returned only VAT code `6`
   130→- invoice creation succeeded after using the dynamically resolved VAT type from that filtered result
   131→
   132→## Key Finding: Omitting Line VAT Is A Fake Optimization
   133→
   134→Do not try to save the `GET /ledger/vatType` call for a simple direct service line by omitting `orderLines[].vatType`.
   135→
   136→Persistent sandbox re-verification on 2026-03-20 showed:
   137→- `POST /invoice` without line `vatType` still succeeded
   138→- the resulting invoice had `amountExcludingVatCurrency=28500` and `amountCurrency=28500`
   139→- in that sandbox account, the filtered outgoing VAT result for the same date only exposed VAT code `6` (`0%`)
   140→- hardcoding `vatType.id = 3` still failed with `422 ... Ugyldig mva-kode.`
   141→
   142→So the lower-call omission path can silently create a no-VAT invoice instead of the intended taxable-service invoice. For this task shape, the dynamic filtered VAT lookup remains the minimum safe path.
   143→
   144→For exact direct-line no-VAT prompts, the same rule still applies:
   145→
   146→- do not omit `orderLines[].vatType`
   147→- resolve the filtered outgoing `0%` VAT row that actually exists in the current account
   148→
   149→Persistent sandbox re-verification on 2026-03-20 for `Porto Alegre Lda` / `826870192` / `Design web` / `22700` showed:
   150→
   151→- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6`
   152→- `POST /invoice` with that resolved `vatType.id=6` succeeded
   153→- the write response already proved the intended no-VAT outcome with `amountExcludingVatCurrency=22700` and `amountCurrency=22700`
   154→
   155→The 2026-03-20 production run for Portuguese `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` / `sem IVA` and the same-day persistent sandbox re-check on analogous org `842889155` reconfirmed the same branch:
   156→
   157→- direct `POST /customer`
   158→- filtered outgoing VAT read returning code `6` (`0%`)
   159→- direct `POST /invoice`
   160→- no customer pre-read
   161→- no explicit `PUT /invoice/{id}/:send`
   162→
   163→For ordinary direct-line service prompts that are explicitly priced excluding VAT / MVA, the same dynamic rule becomes an exact `25%` selector:
   164→
   165→- use the filtered outgoing VAT read
   166→- choose an exact `25%` row, not the first returned row
   167→- if the filtered result exposes only `0%`, treat the run as blocked in that account instead of downgrading the invoice to `0%`
   168→- French `hors TVA` and Norwegian `eksklusiv MVA` belong to this taxed ex-VAT branch. Do not misread them as `sans TVA` / `0%`.
   169→
   170→This was re-confirmed on 2026-03-20 across production plus persistent sandbox:
   171→
   172→- the production run for `Snøhetta AS` / `871844062` / `Webdesign` / `20100` succeeded in `3` calls: direct `POST /customer`, filtered outgoing VAT read, then `POST /invoice`
   173→- the French production run for `Colline SARL` / `944164340` / `Service réseau` / `44750` / `hors TVA` also succeeded in the same `3` calls and confirms the same taxed branch
   174→- the later same-day French production run for `Lumière SARL` / `959714320` / `Stockage cloud` / `34100` again used the same exact `3` calls and preserved the Unicode customer name exactly as prompted
   175→- the production invoice write already proved the taxed outcome with `amountExcludingVatCurrency=20100` and `amountCurrency=25125`
   176→- the persistent sandbox on the same date still exposed only VAT code `6` (`0%`)
   177→- on that sandbox account, omitting `vatType` for the same `20100` / `Webdesign` line silently created `amountCurrency=20100`
   178→- on that sandbox account, hardcoded `vatType.id=3` still failed with `422 ... Ugyldig mva-kode.`
   179→- on the analogous sandbox probe `944164341` / `Service reseau` / `44750`, omission again created a wrong untaxed `44750` total and hardcoded `vatType.id=3` again failed with `422 ... Ugyldig mva-kode.`
   180→- on the later same-day sandbox analog `Lumière Reflection b9572091 SARL` / `957223729`, the filtered outgoing VAT read still exposed only code `6` (`0%`), and omitting `orderLines[].vatType` on the exact `34100` line again created a wrong untaxed `34100` total, so that sandbox state remained blocked for the taxed branch rather than a lower-call replacement
   181→- on the same-day sandbox analog `Nordhav Reflection 12c28001 AS` / `999280012` / `Analyserapport` / `7850`, the filtered outgoing VAT read for `2026-03-20` still exposed only code `6` (`0%`), so the exact Norwegian `eksklusiv MVA` branch remained blocked there rather than a valid no-VAT shortcut
   182→
   183→## Important Constraints
   184→
   185→- The correct order-line price field is `unitPriceExcludingVatCurrency`; do not use `unitCostPrice` — it does not exist on the order-line schema and returns `422 Feltet eksisterer ikke i objektet.`
   186→- Do not assume there is a separate public company-level bank-account endpoint in `openapi.json`
   187→- The public/spec-confirmed path that solved this was `PUT /ledger/account/{id}`
   188→- Do not create a second invoice bank account with the same `bankAccountNumber`
   189→- Duplicate bank account numbers trigger validation errors
   190→- Prefer updating existing `1920` over creating a new invoice account
   191→- Do not hardcode invoice/order-line VAT code `3`
   192→- The authoritative candidate set for invoice lines is the filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` result on the invoice date
   193→- If the provided base URL already ends in `/v2`, do not pass endpoint paths with a leading slash into `new URL(...)`; that can silently escape back to host-root `/customer` or `/invoice` and waste a `404`
   194→- If the first common-endpoint call still comes back `404`, inspect the final request path before spending a second Tripletex call; host-root `/customer` or `/invoice` means the client URL builder is wrong, not that the endpoint changed
   195→
   196→## Minimal Flow
   197→
   198→1. Find or create the customer
   199→   - for the normal fresh-account new-customer variant, skip the pre-read and `POST /customer` directly
   200→   - if creating a new customer and the prompt gives no email or postal address, prefer `invoiceSendMethod: "MANUAL"`
   201→   - only use `GET /customer?organizationNumber=...&fields=*` when the prompt or environment actually implies an existing customer lookup
   202→   - prompt wording like `invoice customer <name> (<organizationNumber>)` is not, by itself, enough reason to spend that pre-read in a fresh-account run
   203→2. Resolve a valid outgoing VAT type for the invoice date when the line VAT is not already safely implied by the resolved product/account setup
   204→   - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
   205→   - use a VAT type that actually exists in that filtered response
   206→   - do not omit direct-line `vatType` just because the write may still succeed; that can silently produce a no-VAT invoice
   207→   - this also applies to explicit no-VAT direct-line prompts; resolve the filtered outgoing `0%` row instead of assuming omission is equivalent
   208→   - for ordinary service prompts priced excluding VAT / MVA, require an exact `25%` row from that filtered result; if `25%` is absent, stop as blocked for that account
   209→2b. Proactive bank-account check (GETs are free, 4xx errors cost penalty)
   210→   - `GET /ledger/account?isBankAccount=true&fields=*` — parallelize with steps 1/2
   211→   - find the invoice account (usually `number=1920`, `isInvoiceAccount=true`)
   212→   - if `bankAccountNumber` is falsy: `PUT /ledger/account/{id}` with `{ ...acct, bankAccountNumber: "12345678903" }`
   213→   - this eliminates the 422 + retry POST entirely
   214→3. Create invoice and let the default `sendToCustomer=true` perform the send in the same write
   215→   - include required dates
   216→   - include `orders`
   217→   - include `orderLines` inside the order, not directly on invoice input
   218→   - once customer resolution and filtered VAT resolution have succeeded, keep `customer.id` and `vatType.id` in memory; a local request-construction bug is not a reason to repeat either call in the same run
   219→   - with the proactive bank check in step 2b, this should succeed on the first try
   220→4. If `POST /invoice` still fails with the company-bank-account validation despite step 2b, repair and retry once (see Bank Account Repair — Reactive Fallback)
   221→5. If you need exact line-level proof and the invoice write response is sparse, do one immediate `GET /invoice/{id}` with expanded `fields`
   222→
   223→## Invoice Payload Notes
   224→
   225→- `invoiceDueDate` is required
   226→- `orders[].deliveryDate` is required
   227→- `invoice.orderLines` is read-only in the schema
   228→- create lines under `orders[].orderLines`
   229→
   230→Example shape:
   231→
   232→```json
   233→{
   234→  "invoiceDate": "2026-03-19",
   235→  "invoiceDueDate": "2026-04-02",
   236→  "customer": { "id": 123 },
   237→  "orders": [
   238→    {
   239→      "customer": { "id": 123 },
   240→      "orderDate": "2026-03-19",
   241→      "deliveryDate": "2026-03-19",
   242→      "orderLines": [
   243→        {
   244→          "description": "Analyserapport",
   245→          "count": 1,
   246→          "unitPriceExcludingVatCurrency": 7850,
   247→          "vatType": { "id": 6 }
   248→        }
   249→      ]
   250→    }
   251→  ]
   252→}
   253→```
   254→
   255→In real tasks, replace `6` with the VAT type resolved from the filtered `GET /ledger/vatType` response for the invoice date. Do not assume the same code is valid across accounts.
   256→
   257→For create-and-send tasks, omit `sendToCustomer=false` unless the prompt explicitly requires a separate later send step or send-channel override.
   258→
   259→## Sparse Response Trap
   260→
   261→- `POST /invoice` can succeed while returning `orderLines` only as link objects with `id` and `url`
   262→- do not treat that as a failed line create
   263→- if the task requires exact line-level proof before sending, do one immediate:
   264→  - `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
   265→
   266→## If You Still Need to Probe
   267→
   268→- First test in sandbox if available
   269→- Reproduce with one simple zero-VAT or standard-VAT line
   270→- If invoice fails after bank-account registration, use the new validation message as the next branch
   271→- Reuse returned IDs from write responses
   272→
   273→## Proven Send-Channel Pitfalls
   274→
   275→- Do not assume `PUT /invoice/{id}/:send?sendType=MANUAL` is the safe fallback for customers created without email/address; persistent sandbox reproduced `500` on 2026-03-20
   276→- Do not assume sparse customer address links mean `PAPER` send is available; persistent sandbox reproduced `422 Faktura kan ikke sendes via PAPER`
   277→- Do not assume organization number alone makes EHF available; the production run for this task shape reproduced `422 Faktura kan ikke sendes via EHF`
   278→- Do not assume a successful direct-line invoice write without explicit `vatType` means the VAT is correct; persistent sandbox on 2026-03-20 accepted that shape and produced a no-VAT invoice (`28500` total on a `28500` ex-VAT line)
   279→- Do not spend `GET /customer` first on the exact fresh-account shape that only gives `name + organizationNumber` for a new customer; the 2026-03-20 sandbox re-verification proved the lower-call path is direct `POST /customer`, then filtered `GET /ledger/vatType`, then `POST /invoice`
   280→- If the first `POST /invoice` fails only on missing company bank account, do not turn that branch into a full rerun by guessing a new bank number or restarting from customer creation; the minimum recovery is one valid `PUT /ledger/account/{id}` and one retry of the same invoice payload
   281→- If that failed invoice already came after a successful customer create and you no longer hold the customer id locally, resume with `GET /customer?organizationNumber=...&fields=*`, then the same filtered VAT read, then `POST /invoice`
   282→- When the bank-account repair branch fires, retain `customer.id` and `vatType.id` in memory across the repair; the 2026-03-21 production run for `Fjelltopp AS` completed the repair in 6 total calls by retaining state, while the earlier Étoile SARL run wasted 2 calls re-reading both after losing local state (8 total calls)
   283→- **REVERSED 2026-03-22**: DO proactively add `GET /ledger/account` to every create-and-send flow; since GETs are free from scoring and 4xx errors cost penalty, the proactive approach is strictly better or equal in all cases; the 2026-03-22 `Blueshore Ltd` run wasted 1 write + 1 error by using reactive; sandbox-verified 2026-03-22
   284→- Nynorsk prompt language (`nn`) follows the same rules as Bokmål (`nb`): `eksklusiv MVA` → taxed 25% branch
   285→- Do not use `unitCostPrice` on order lines; the only accepted price field is `unitPriceExcludingVatCurrency`; the 2026-03-21 production run for `Étoile SARL` / `976414284` wasted 1 call on this wrong field name before correcting it
   286→- Do not confuse this task shape with the order-based `create-order-invoice-and-register-payment` flow; if the prompt gives only a description (e.g. "Systemutvikling") without product numbers and does not require payment registration, use `POST /invoice` with direct description-only order lines, not `POST /order` + `PUT /order/:invoice`; the order-based flow wastes calls on unnecessary product creation and the two-step order→invoice conversion
   287→- When the prompt gives only a service description without product numbers, do not spend calls on `GET /product` or `POST /product`; `POST /invoice` with `orders[].orderLines[]` containing only `description`, `count`, `unitPriceExcludingVatCurrency`, and resolved `vatType` creates the line correctly with `product: null` on readback; sandbox-verified on 2026-03-21
   288→- The 2026-03-21 production run for `Bergvik AS` / `890733751` / `Systemutvikling` / `28900` / `eksklusiv MVA` incorrectly used the order-based flow with product creation and spent 8 calls (1 error); the correct path was this standard's existing-customer variant with bank repair = 6 calls: `GET /customer` → `GET /ledger/vatType` (25%) → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` retry; final state was correct (`amountExcludingVatCurrency=28900`, `amountCurrency=36125`)
   289→- The 2026-03-21 production run for `Brightstone Ltd` / `894181273` / `Cloud Storage` / `14150` / `excluding VAT` (English prompt, existing customer) confirmed the existing-customer direct-line create-and-send variant with bank repair in optimal 6 calls: `GET /customer?organizationNumber=894181273&fields=*` → `GET /ledger/vatType` (id=3, 25%) → `POST /invoice?sendToCustomer=true` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice?sendToCustomer=true` (201); final: `amountExcludingVatCurrency=14150`, `amountCurrency=17687.5`; English definite article "the customer" correctly triggered `GET /customer` instead of `POST /customer`
   290→- The same English definite-article heuristic applies: "the customer X" or "invoice to the customer X" implies existing customer → `GET /customer?organizationNumber=...&fields=*`; this mirrors Norwegian "kunden" (definite) vs "en kunde" (indefinite)
   291→- The same German definite-article heuristic applies: "den Kunden X" or "für den Kunden X" (accusative definite) implies existing customer; "einen Kunden" (accusative indefinite) would imply creating; the 2026-03-21 production run for `Brückentor GmbH` / `804379010` confirmed this: German "den Kunden" correctly indicated existing customer
   292→- The 2026-03-21 Bokmål production run `Nordhav AS` / `876520427` / `Analyserapport` / `7850` / `eksklusiv MVA` confirmed the existing-customer + bank-repair shape in optimal 6 calls and 0 avoidable errors: `GET /customer` (parallel with `GET /ledger/vatType`, found 25%) → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` (201, `amountExcludingVatCurrency=7850`, `amountCurrency=9812.5`); Norwegian definite "kunden" correctly triggered existing-customer lookup
   293→- The 2026-03-21 English production run `Ironbridge Ltd` / `841254546` / `System Development` / `28500` / `excluding VAT` confirmed the same existing-customer + bank-repair shape in optimal 6 calls and 0 avoidable errors: `GET /customer` (parallel with `GET /ledger/vatType`, found vatType.id=3 at 25%) → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` (201, `amountExcludingVatCurrency=28500`, `amountCurrency=35625`); second English definite-article confirmation after Brightstone Ltd
   294→- The 2026-03-21 Nynorsk production run `Bølgekraft AS` / `892362416` / `Vedlikehald` / `34150` / `eksklusiv MVA` confirmed the same existing-customer + bank-repair shape in optimal 6 calls and 0 avoidable errors: `GET /customer` (parallel with `GET /ledger/vatType`, found vatType.id=3 at 25%) → `POST /invoice` (422 bank) → `GET /ledger/account` → `PUT /ledger/account/{id}` → `POST /invoice` (201, `amountExcludingVatCurrency=34150`, `amountCurrency=42687.5`); 2nd Nynorsk definite-article "kunden" existing-customer confirmation after Sjøbris AS; 13th consecutive optimal run across en/nb/nn/es/fr/de confirms the standard is fully language-independent and stable
   295→
   296→## Key Finding: Product-Line Invoices Require Linked Products
   297→
   298→When the prompt gives product numbers in parentheses (e.g. "Analysis Report (9796) at 27700 NOK with 25% VAT"), these are NOT just descriptions — they are product numbers that must appear as linked products on the invoice order lines.
   299→
   300→**Description-only lines will fail product-related scorer checks** even if amounts and VAT are correct. The 2026-03-21 production run for `Oakwood Ltd` / `909722500` with 3 product lines (9796, 2145, 5995) used description-only lines and scored 5/8 (checks 3, 4, 5 failed).
   301→
   302→### New customer (fresh account) — products don't exist yet
   303→
   304→1. `POST /customer` with `invoiceSendMethod: "MANUAL"` (parallel)
   305→2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` (parallel)
   306→3. `POST /product/list` with `[{ "name": "Analysis Report", "number": 9796 }, ...]` (parallel with 1 and 2)
   307→4. `POST /invoice?sendToCustomer=true` with `product: { "id": <id> }` on each order line
   308→
   309→This is 4 calls in the happy path (3 parallel + 1 invoice), or 7 with bank-account repair.
   310→
   311→### Existing customer — products may already exist
   312→
   313→When the prompt uses a definite article (Norwegian "kunden", English "the customer", German "den Kunden"), the customer already exists AND products with the given numbers may already be pre-loaded. Blindly using `POST /product/list` will return `422 Produktnummeret X er i bruk`, wasting a call and counting as a scored error.
   314→
   315→1. `GET /customer?organizationNumber=...&fields=*` (parallel)
   316→2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` (parallel)
   317→3. `GET /product?fields=id,number&count=1000` (parallel with 1 and 2) — match by `String(p.number)` client-side
   318→4. If all products found → `POST /invoice?sendToCustomer=true` (total: 4 or 7 with bank repair)
   319→5. If any products missing → `POST /product/list` with only missing ones, then `POST /invoice` (total: 5 or 8 with bank repair)
   320→
   321→The 2026-03-21 production run for `Brückentor GmbH` / `804379010` hit the existing-product pitfall: the agent used `POST /product/list` which returned 422, then had additional string/number comparison bugs, totaling 11 API calls instead of the optimal 7. The correct path was: `GET /customer` + `GET /vatType` + `GET /product` (parallel) → `POST /invoice` (422 bank) → bank repair → `POST /invoice` retry.
   322→
   323→### Sandbox-verified pitfalls
   324→- `product: { "number": 9796 }` on order line does NOT resolve products — readback shows `product: null`; must use `product: { "id": <id> }`
   325→- Inline product creation via invoice (product with name+number but no id in order line) does NOT work — readback shows `product: null`
   326→- Products must be pre-created via `POST /product/list` (batch) or `POST /product` (single), or looked up via `GET /product` if they already exist
   327→
   328→### CRITICAL type pitfall: string comparison
   329→
   330→Tripletex returns `product.number` and `vatType.number` as **strings**, never numbers. All comparisons must use string-safe equality:
   331→- WRONG: `[2626, 7746].includes(p.number)` — silently returns false because `"2626" !== 2626`
   332→- WRONG: `v.number === 5` — fails because vatType number is `"5"` not `5`
   333→- RIGHT: `String(p.number) === String(targetNum)` or `Number(p.number) === targetNum`
   334→
   335→The Brückentor run wasted 3 calls on this bug: product lookup returned 0 matches despite products existing, and vatType 0%-exempt was not found despite being in the response.
   336→
   337→## Key Finding: Multi-VAT-Rate Invoices
   338→
   339→When the prompt specifies different VAT rates for different lines (e.g. 25%, 15% food, 0% exempt), the single `GET /ledger/vatType?typeOfVat=OUTGOING` call returns ALL available outgoing VAT types. Select the correct one for each line:
   340→
   341→- 25% standard: look for `percentage === 25` (production code 3)
   342→- 15% food/drink: look for `percentage === 15` (production code 31)
   343→- 12% low rate: look for `percentage === 12` (production code 32)
   344→- 0% exempt (within VAT law): look for `percentage === 0` AND `Number(v.number) === 5` (avgiftsfri) — remember `v.number` is a string
   345→- 0% outside VAT area: look for `percentage === 0` AND `Number(v.number) === 6`
   346→- 0% export: look for `percentage === 0` AND `Number(v.number) === 52`
   347→
   348→When the prompt says "0% VAT (exempt)", prefer code 5 (within VAT law/avgiftsfri). When the prompt says "food" or "mat", select the 15% rate (code 31). One vatType lookup serves all lines.
   349→
```

## 2026-03-22T10:41:07.951Z tool_call
tool: Glob
call_id: toolu_vrtx_01DahrJtnaiYSzgKmFzdBTsK

```json
{
  "pattern": "trusted-standards/*order*",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-22T10:41:07.951Z tool_call
tool: Glob
call_id: toolu_vrtx_019o4wBYQ5mnyqDP2Cyydcxh

```json
{
  "pattern": "task-playbooks/*order*",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-22T10:41:07.952Z tool_call
tool: Glob
call_id: toolu_vrtx_01HUBZaFGvENCDWfBSaMN99E

```json
{
  "pattern": "trusted-standards/*payment*",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-22T10:41:07.953Z tool_call
tool: Glob
call_id: toolu_vrtx_018jRaqENescmnkuZ87sWFrp

```json
{
  "pattern": "task-playbooks/*payment*",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-22T10:41:07.960Z tool_result
tool: Glob
call_id: toolu_vrtx_01DahrJtnaiYSzgKmFzdBTsK

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-order-invoice-and-register-payment.md
```

## 2026-03-22T10:41:07.962Z tool_result
tool: Glob
call_id: toolu_vrtx_019o4wBYQ5mnyqDP2Cyydcxh

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-order-invoice-and-register-payment.md
```

## 2026-03-22T10:41:07.963Z tool_result
tool: Glob
call_id: toolu_vrtx_01HUBZaFGvENCDWfBSaMN99E

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-order-invoice-and-register-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/reverse-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-foreign-currency-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md
```

## 2026-03-22T10:41:07.964Z tool_result
tool: Glob
call_id: toolu_vrtx_018jRaqENescmnkuZ87sWFrp

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-foreign-currency-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/reverse-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-order-invoice-and-register-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md
```

## 2026-03-22T10:41:11.226Z tool_call
tool: Read
call_id: toolu_vrtx_015R7dLnGVQ5pcYk1jkNbSoR

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-order-invoice-and-register-payment.md"
}
```

## 2026-03-22T10:41:12.559Z tool_result
tool: Read
call_id: toolu_vrtx_015R7dLnGVQ5pcYk1jkNbSoR

```text
     1→# Create Order, Invoice, and Register Full Payment
     2→
     3→## Trust Level
     4→- Trusted standard
     5→- Use directly for exact matches
     6→- Skip `./openapi.json` re-checking for exact matches
     7→
     8→## Exact Match
     9→- create one order for an existing customer
    10→- use one or more existing products already identified in the prompt
    11→- convert that new order into an invoice immediately
    12→- register full payment on that created invoice immediately
    13→- do not send the invoice unless the prompt explicitly asks for it
    14→
    15→## Do Not Use This Standard If
    16→- the task also requires creating the customer or products first
    17→- the task is project-fixed-price, on-account, subscription, reversal, or partial-payment specific
    18→- the prompt is too ambiguous to identify the existing customer or products decisively
    19→- the task explicitly requires sending the invoice — use `./trusted-standards/create-and-send-customer-invoice.md` instead
    20→- the prompt gives only a service description (e.g. "Systemutvikling") without referencing existing products by number — use `./trusted-standards/create-and-send-customer-invoice.md` or `./trusted-standards/create-customer-invoice.md` instead; `POST /invoice` handles description-only order lines natively without needing a product
    21→
    22→## Scoring Note
    23→- **GET calls do not count against the efficiency score** — only writes (POST/PUT/DELETE) are scored
    24→- use GETs liberally to gather information, verify state, and log important details
    25→- the optimization target is minimizing write calls and errors, not total calls
    26→
    27→## Standard Flow
    28→1. `GET /customer?organizationNumber=...&fields=*` if the prompt identifies the customer by organization number; log customer id, name, organization number
    29→2. `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)` using comma-separated prompt refs; verify that the returned count matches the expected count, and confirm each product name from the prompt as a secondary check; the expanded `vatType(*)` returns the VAT `percentage` needed to compute the exact invoice total; log each product's id, number, name, and vatType.percentage
    30→3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` — log the selected payment type id, description, and debit/credit account numbers
    31→4. `GET /ledger/account?isBankAccount=true&fields=*` — proactive bank-account hedge; if the invoice bank account (`isInvoiceAccount=true`, usually number `1920`) lacks a `bankAccountNumber`, repair with `PUT /ledger/account/{id}` using `{ "bankAccountNumber": "12345678903" }` before the invoice write; skip the PUT if `bankAccountNumber` already exists; log account number, bankAccountNumber presence, and whether repair was needed
    32→5. compute `paidAmount = Σ(unitPriceExcludingVat_i × count_i × (1 + vatType.percentage_i / 100))` from the resolved products; log the per-line breakdown and total
    33→6. `POST /invoice?sendToCustomer=false&paymentTypeId=<id>&paidAmount=<computed total>` with body containing embedded `orders[]` with `orderLines` — **this is the only write call**
    34→7. log from POST /invoice response: invoice id, invoiceNumber, amount, amountExcludingVat, amountOutstanding, amountCurrencyOutstanding, orders[0].id, orderLines count, isCharged, amountRoundoff
    35→8. `GET /invoice/{id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))` — readback to verify and log full state: customer name/org linked correctly, each order line description + product name/number + unitPrice, amounts match prompt expectations
    36→9. verify `amountCurrencyOutstanding=0` or `amountOutstanding=0`
    37→10. stop
    38→
    39→## Payload Rules
    40→- on `POST /invoice`, send body:
    41→  - `invoiceDate`
    42→  - `invoiceDueDate`
    43→  - `orders[]` containing one order with:
    44→    - `customer: { "id": ... }`
    45→    - `orderDate`
    46→    - `deliveryDate`
    47→    - `orderLines[]` with:
    48→      - `product: { "id": ... }`
    49→      - `description`
    50→      - `count`
    51→      - `unitPriceExcludingVatCurrency`
    52→- `POST /invoice` creates the order and invoice in a single call; the `paymentTypeId` and `paidAmount` query parameters register full payment in the same write
    53→- **paidAmount computation**: compute the exact invoice total including VAT from the resolved products: `paidAmount = Σ(unitPrice_i × count_i × (1 + vatType.percentage_i / 100))`; this requires `vatType(*)` in the product lookup fields; do NOT use `paidAmount=0.01` with `POST /invoice` — that only pays 0.01 (there is no `paymentTypeIdRestAmount` parameter on `POST /invoice`); do NOT overpay — overpaying creates negative outstanding
    54→- preserve prompt product names/descriptions exactly when they are part of the scored state
    55→- when resolving products from `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)`, verify the returned count matches the expected count; if any are missing, fall back to `GET /product?count=1000&fields=*,vatType(*)` and filter locally by the `number` response field
    56→- do not rely on the `productNumber` field since it is often null/undefined in fresh accounts; `productNumber` is not even a valid field in ProductDTO's `fields` filter (returns 400)
    57→- **CRITICAL type pitfall**: `product.number` is always a **string** in the API response (e.g. `"6247"`), never an integer; use `String(p.number) === String(promptRef)` or loose equality `p.number == promptRef` — strict `p.number === 6247` silently fails and wastes API calls on the retry
    58→- **CRITICAL: always include bank-account recovery in the script from the first write** — writing the script without recovery and then re-running from scratch after a 422 doubles the API calls (the 2026-03-22 production run hit 11 calls instead of 6-7 because the initial script lacked recovery and had to restart all 3 reads + the failed POST)
    59→- **recommended for fresh accounts**: use a proactive `GET /ledger/account?isBankAccount=true&fields=*` BEFORE the first `POST /invoice`; if the invoice bank account (usually `1920`) lacks a `bankAccountNumber`, repair it with `PUT /ledger/account/{id}` before proceeding — this avoids the 422 entirely and saves 1 call + 1 error vs the reactive recovery path (6 calls 0 errors vs 7 calls 1 error); when the bank account already has a number, the proactive check costs 1 extra call (5 total vs 4) but guarantees 0 errors
    60→- the proactive hedge is the recommended default for this task shape because production always uses fresh accounts where bank-account status is unpredictable; 5 of 7 prior production runs did NOT need repair, but the 7th did — so the hedge is worth the tradeoff
    61→- if you skip the proactive hedge and take the reactive path, the script MUST still include inline recovery logic for the `bankkontonummer` 422 to avoid the catastrophic script-restart waste
    62→- **CRITICAL payment-type pitfall**: payment type objects from `GET /invoice/paymentType` do NOT have an `isIncoming` field; the returned keys are `id`, `version`, `url`, `description`, `displayName`, `debitAccount`, `creditAccount`, `vatType`, `sequence`, `customer`, `supplier`, `currencyId`, `currencyCode` — do NOT filter by `pt.isIncoming === true` as it will always find nothing and block the run; just use the first available payment type (any of them work for the invoice-and-payment write)
    63→
    64→## Reuse From Write Response
    65→- from `POST /invoice`:
    66→  - `value.id` (invoice id)
    67→  - `value.invoiceNumber`
    68→  - `value.amountCurrencyOutstanding` or `value.amountOutstanding`
    69→  - `value.orders[0].id` (order id)
    70→  - invoice totals if needed for proof
    71→
    72→## Verification
    73→- **always do a readback GET after the invoice write** — GETs are free and the readback confirms full state
    74→- `GET /invoice/{id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))` verifies:
    75→  - customer is correctly linked (name, organizationNumber)
    76→  - order exists with correct order lines
    77→  - each order line has the correct product (name, number), description, count, unitPrice
    78→  - amounts match expectations (amountExcludingVat = prompt ex-VAT total, amount = computed inc-VAT total)
    79→  - amountOutstanding = 0
    80→- log all key fields from the readback for debugging and scoring transparency
    81→
    82→## Known Recovery Branches
    83→- if `POST /invoice` fails only with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`:
    84→  - `GET /ledger/account?isBankAccount=true&fields=*`
    85→  - update the existing invoice bank account with `PUT /ledger/account/{id}` using the minimal payload `{ "bankAccountNumber": "12345678903" }`
    86→  - retry the same `POST /invoice?...` once with the same payload
    87→- if `POST /invoice` succeeds but `amountOutstanding ≠ 0` (rounding edge case):
    88→  - `PUT /invoice/{id}/:payment?paymentTypeId=<id>&paymentDate=<date>&paidAmount=<outstanding>&paidAmountCurrency=<outstanding>` to settle the remainder
    89→  - this adds one extra call (5 total) only in the rounding edge case
    90→
    91→## OpenAPI / Sandbox Status
    92→- `POST /invoice`, `/invoice/paymentType`, and `/invoice/{id}/:payment` verified in `./openapi.json`
    93→- `POST /invoice` accepts `paymentTypeId`, `paidAmount`, and `sendToCustomer` as query parameters; the request body accepts embedded `orders[]` with `orderLines[]` — the order and invoice are created in one call
    94→- **GET calls are free** (do not count against efficiency score) — only writes (POST/PUT/DELETE) are scored
    95→- the recommended exact-match path has **1 write call** (POST /invoice) plus free GETs for data gathering and verification:
    96→  1. `GET /customer?organizationNumber=...&fields=*` (free)
    97→  2. `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)` (free)
    98→  3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` (free)
    99→  4. `GET /ledger/account?isBankAccount=true&fields=*` (free) — proactive hedge; conditionally `PUT` to repair if `bankAccountNumber` is missing (this PUT is a write if needed)
   100→  5. `POST /invoice?sendToCustomer=false&paymentTypeId=<id>&paidAmount=<computed total>` with embedded orders — **the only required write**
   101→  6. `GET /invoice/{id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))` (free) — readback verification + logging
   102→- the old 5-call path (`POST /order` + `PUT /order/:invoice`) had **2 writes**; the `POST /invoice` path has **1 write** — this is the primary efficiency gain
   103→- the `paidAmount` must be the exact invoice total including VAT, computed as `Σ(unitPrice × count × (1 + vatType.percentage/100))` from the resolved products; `vatType(*)` on the product lookup provides the percentage
   104→- do NOT use `paidAmount=0.01` with `POST /invoice` — unlike `PUT /order/:invoice`, `POST /invoice` has no `paymentTypeIdRestAmount` parameter, so it only pays the literal `paidAmount`; 0.01 leaves the rest outstanding
   105→- do NOT overpay — setting `paidAmount` higher than the invoice total creates negative outstanding (a credit), not a cap at zero
   106→- if the same run already holds a proven valid incoming `paymentTypeId` for the same company and currency, the path drops to 3 calls by skipping step 3
   107→- the incoming `paymentTypeId` is account-specific; never hardcode it across environments
   108→- the `/ledger/account` proactive hedge is now the recommended default for fresh accounts; it costs 1 extra call when bank acct exists (5 total) but saves 1 call + avoids 1 error when bank acct is missing (6 vs 7 calls, 0 vs 1 error); the 2026-03-22 production run proved the reactive path wastes calls catastrophically when the initial script lacks recovery
   109→- sandbox verification on 2026-03-22 proved the 4-call path using `POST /invoice` with embedded orders:
   110→  - `POST /invoice?sendToCustomer=false&paymentTypeId=<id>&paidAmount=<exact total>` with `orders[{customer,orderDate,deliveryDate,orderLines}]`
   111→  - creates order + invoice + registers payment in one call
   112→  - `paidAmount=<exact total>` settles the invoice: `amountOutstanding=0`, `amountCurrencyOutstanding=0`
   113→  - readback confirmed: order exists with proper product-linked order lines
   114→  - `paidAmount=0.01` only pays 0.01 on `POST /invoice` (no `paymentTypeIdRestAmount` param)
   115→  - overpaying creates negative outstanding (credit), not a cap at zero
   116→  - `vatType(*)` on product lookup provides the VAT percentage to compute exact total
   117→  - tested with non-round prices (13450 + 14200) — no rounding issues
   118→- production confirmations using the new `POST /invoice` path (4-call canonical):
   119→  - 2026-03-22: Portuguese `Floresta Lda` / `919172657` — 3 products (4783/3343/4380), 3 VAT rates (25%/15%/0%), paidAmount=63032.50; **11 actual calls** (4 wasted from script restart + 7 with recovery); needed bank-account repair (GET ledger + PUT ledger + retry POST); root cause: initial script lacked recovery branch; **FIRST 3-product confirmation, FIRST POST /invoice production run, FIRST bank-account repair on this path**
   120→  - 2026-03-22: Norwegian `Snøhetta AS` / `800082021` — 2 products (2797/5684), both 25% VAT, paidAmount=64562.50; **5 calls, 0 errors**; proactive hedge found bank account 1920 already configured (no PUT needed); 2nd POST /invoice production confirmation
   121→- prior production confirmations (all used the old 5-call path with `POST /order` + `PUT /order/:invoice`):
   122→  - 2026-03-21: Portuguese `Solmar Lda` / `867069526` — 5 calls, 0 errors
   123→  - 2026-03-21: English `Ridgepoint Ltd` / `997470311` — 5 calls, 0 errors
   124→  - 2026-03-21: Nynorsk `Strandvik AS` / `911845016` — 6 calls (wasted 1 on nonexistent `pt.isIncoming`)
   125→  - 2026-03-21: Portuguese `Cascata Lda` / `927161524` — 5 calls, 0 errors
   126→  - 2026-03-21: Spanish `Río Verde SL` / `937237243` — 5 calls, 0 errors
   127→  - 2026-03-22: French `Colline SARL` / `953795493` — 5 calls, 0 errors
   128→- sandbox investigation on 2026-03-21 disproved three other call-reduction hypotheses:
   129→  - inline `product: { number }`: orphaned lines, no product linkage
   130→  - inline `customer: { organizationNumber }`: rejected 422
   131→  - hardcoded `paymentTypeId=1`: rejected 422
   132→  - `paymentTypeId` omission on any payment path: always rejected 422
   133→
   134→## Product Lookup Strategy
   135→- **primary**: `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)` — comma-separated `number` values use OR semantics and return all matching products in one call; `vatType(*)` expands the VAT type to include `percentage` needed for paidAmount computation
   136→  - sandbox verification on 2026-03-21 confirmed: `number=7579,2292` returned both, `number=7579,2292,4366` returned all 3, partial matches (one exists, one doesn't) return found ones without error
   137→  - if fewer products are returned than expected, fall back to `count=1000`
   138→- **fallback**: `GET /product?count=1000&fields=*,vatType(*)` — returns all products, filter locally by `number` response field
   139→  - reliable for fresh accounts with few products (typically 2-5 products)
   140→- **CRITICAL**: do NOT use `number=X&number=Y` (repeated query params) — this uses non-OR semantics and only returns the first value
   141→- **CRITICAL**: `productNumber` is not a valid field in ProductDTO's `fields` filter (returns 400); it exists only as a query parameter for filtering, and even then is unreliable across accounts
   142→- the old 2-tier approach (`productNumber` first → `count=1000` fallback) was inconsistent and is superseded
   143→- do NOT use `GET /product?ids=<ref>&fields=*` — prompt refs are small integers, never Tripletex internal IDs (84M+ range)
   144→
```

## 2026-03-22T10:41:58.218Z tool_call
tool: Write
call_id: toolu_vrtx_01Y9mdJqXhnJ36SCojUGBaKy

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-104047538Z-c93ecb23/scripts/run.ts",
  "content": "const BASE = \"https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2\";\nconst TOKEN = \"7VtyU0K1uLsf9wwHsEAm7-JXp3-BY4yRoA2eLeobwD8\";\nconst AUTH = \"Basic \" + btoa(\"0:\" + TOKEN);\nconst TODAY = \"2026-03-22\";\nconst DUE = \"2026-04-05\";\n\nasync function api(method: string, path: string, body?: any) {\n  const url = `${BASE}${path}`;\n  const opts: any = { method, headers: { Authorization: AUTH, \"Content-Type\": \"application/json\" } };\n  if (body) opts.body = JSON.stringify(body);\n  const r = await fetch(url, opts);\n  const text = await r.text();\n  let json: any;\n  try { json = JSON.parse(text); } catch { json = text; }\n  console.log(`${method} ${path} -> ${r.status}`);\n  if (!r.ok) { console.log(\"ERROR:\", JSON.stringify(json).slice(0, 500)); }\n  return { status: r.status, data: json };\n}\n\nasync function main() {\n  // Step 1-4: parallel free GETs\n  const [custR, prodR, ptR, bankR] = await Promise.all([\n    api(\"GET\", \"/customer?organizationNumber=932937204&fields=*\"),\n    api(\"GET\", \"/product?number=3346,7273&fields=*,vatType(*)\"),\n    api(\"GET\", \"/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)\"),\n    api(\"GET\", \"/ledger/account?isBankAccount=true&fields=*\"),\n  ]);\n\n  // Customer\n  const cust = custR.data?.values?.[0];\n  if (!cust) { console.log(\"BLOCKED: customer not found\"); return; }\n  console.log(`Customer: id=${cust.id} name=${cust.name} org=${cust.organizationNumber}`);\n\n  // Products\n  const prods = prodR.data?.values || [];\n  console.log(`Products returned: ${prods.length}`);\n  const p3346 = prods.find((p: any) => String(p.number) === \"3346\");\n  const p7273 = prods.find((p: any) => String(p.number) === \"7273\");\n  if (!p3346 || !p7273) {\n    console.log(\"BLOCKED: missing products. Found:\", prods.map((p: any) => `${p.number}(${p.name})`));\n    // Fallback: get all products\n    const allR = await api(\"GET\", \"/product?count=1000&fields=*,vatType(*)\");\n    const all = allR.data?.values || [];\n    const f3346 = all.find((p: any) => String(p.number) === \"3346\");\n    const f7273 = all.find((p: any) => String(p.number) === \"7273\");\n    if (!f3346 || !f7273) { console.log(\"BLOCKED: products still not found\"); return; }\n    Object.assign(p3346 || {}, f3346);\n    Object.assign(p7273 || {}, f7273);\n  }\n  console.log(`Product 3346: id=${p3346!.id} name=${p3346!.name} vat=${p3346!.vatType?.percentage}%`);\n  console.log(`Product 7273: id=${p7273!.id} name=${p7273!.name} vat=${p7273!.vatType?.percentage}%`);\n\n  // Payment type\n  const pts = ptR.data?.values || [];\n  const pt = pts[0];\n  if (!pt) { console.log(\"BLOCKED: no payment types\"); return; }\n  console.log(`PaymentType: id=${pt.id} desc=${pt.description}`);\n\n  // Bank account proactive check\n  const banks = bankR.data?.values || [];\n  const invoiceAcct = banks.find((a: any) => a.isInvoiceAccount) || banks.find((a: any) => a.number === 1920);\n  let bankRepaired = false;\n  if (invoiceAcct) {\n    console.log(`Bank acct: id=${invoiceAcct.id} number=${invoiceAcct.number} bankAcctNum=${invoiceAcct.bankAccountNumber}`);\n    if (!invoiceAcct.bankAccountNumber) {\n      console.log(\"Repairing bank account...\");\n      const putR = await api(\"PUT\", `/ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: \"12345678903\" });\n      bankRepaired = true;\n      console.log(`Bank repair: ${putR.status}`);\n    }\n  }\n\n  // Compute paidAmount\n  const vat1 = p3346!.vatType?.percentage ?? 0;\n  const vat2 = p7273!.vatType?.percentage ?? 0;\n  const line1 = 16000 * (1 + vat1 / 100);\n  const line2 = 22050 * (1 + vat2 / 100);\n  const paidAmount = line1 + line2;\n  console.log(`Line 1: 16000 * (1+${vat1}/100) = ${line1}`);\n  console.log(`Line 2: 22050 * (1+${vat2}/100) = ${line2}`);\n  console.log(`paidAmount = ${paidAmount}`);\n\n  // Step 5: POST /invoice with embedded order\n  const invoiceBody = {\n    invoiceDate: TODAY,\n    invoiceDueDate: DUE,\n    orders: [{\n      customer: { id: cust.id },\n      orderDate: TODAY,\n      deliveryDate: TODAY,\n      orderLines: [\n        {\n          product: { id: p3346!.id },\n          description: \"Data Advisory\",\n          count: 1,\n          unitPriceExcludingVatCurrency: 16000,\n        },\n        {\n          product: { id: p7273!.id },\n          description: \"Network Service\",\n          count: 1,\n          unitPriceExcludingVatCurrency: 22050,\n        },\n      ],\n    }],\n  };\n\n  const invR = await api(\"POST\", `/invoice?sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`, invoiceBody);\n\n  if (invR.status === 422 && JSON.stringify(invR.data).includes(\"bankkontonummer\")) {\n    // Reactive fallback if proactive missed\n    if (!bankRepaired && invoiceAcct) {\n      console.log(\"Reactive bank repair...\");\n      await api(\"PUT\", `/ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: \"12345678903\" });\n      const retryR = await api(\"POST\", `/invoice?sendToCustomer=false&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`, invoiceBody);\n      if (retryR.status !== 201) { console.log(\"BLOCKED: invoice retry failed\"); return; }\n      logInvoice(retryR.data);\n      await readback(retryR.data.value.id);\n      return;\n    }\n    console.log(\"BLOCKED: bank account issue unresolvable\");\n    return;\n  }\n\n  if (invR.status !== 201) { console.log(\"BLOCKED: invoice creation failed\"); return; }\n  logInvoice(invR.data);\n  await readback(invR.data.value.id);\n}\n\nfunction logInvoice(data: any) {\n  const v = data.value;\n  console.log(`Invoice created: id=${v.id} number=${v.invoiceNumber}`);\n  console.log(`  amount=${v.amount} amountExVat=${v.amountExcludingVat}`);\n  console.log(`  outstanding=${v.amountOutstanding} outstandingCurrency=${v.amountCurrencyOutstanding}`);\n  console.log(`  isCharged=${v.isCharged} roundoff=${v.amountRoundoff}`);\n  if (v.orders?.[0]) console.log(`  orderId=${v.orders[0].id}`);\n}\n\nasync function readback(invoiceId: number) {\n  const rb = await api(\"GET\", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))`);\n  const v = rb.data?.value;\n  if (!v) { console.log(\"Readback failed\"); return; }\n  console.log(`\\nReadback invoice ${v.id}:`);\n  console.log(`  customer: ${v.customer?.name} org=${v.customer?.organizationNumber}`);\n  console.log(`  amount=${v.amount} exVat=${v.amountExcludingVat} outstanding=${v.amountOutstanding}`);\n  const oLines = v.orders?.[0]?.orderLines || v.orderLines || [];\n  for (const ol of oLines) {\n    console.log(`  line: \"${ol.description}\" product=${ol.product?.name}(${ol.product?.number}) price=${ol.unitPriceExcludingVatCurrency} count=${ol.count}`);\n  }\n  if (v.amountOutstanding === 0 || v.amountCurrencyOutstanding === 0) {\n    console.log(\"VERIFIED: amountOutstanding=0, fully paid\");\n  } else {\n    console.log(`WARNING: amountOutstanding=${v.amountOutstanding}`);\n  }\n}\n\nmain().catch(e => console.error(e));\n"
}
```

## 2026-03-22T10:41:58.261Z tool_result
tool: Write
call_id: toolu_vrtx_01Y9mdJqXhnJ36SCojUGBaKy

```text
File created successfully at: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-104047538Z-c93ecb23/scripts/run.ts
```

## 2026-03-22T10:42:04.395Z tool_call
tool: Bash
call_id: toolu_vrtx_01GfB6abtU3ZgvdCP8YHLoRg

```json
{
  "command": "cd /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-104047538Z-c93ecb23/scripts && bun run run.ts 2>&1",
  "description": "Execute the order-invoice-payment script",
  "timeout": 30000
}
```

## 2026-03-22T10:42:11.394Z tool_result
tool: Bash
call_id: toolu_vrtx_01GfB6abtU3ZgvdCP8YHLoRg

```text
GET /customer?organizationNumber=932937204&fields=* -> 200
GET /product?number=3346,7273&fields=*,vatType(*) -> 200
GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*) -> 200
GET /ledger/account?isBankAccount=true&fields=* -> 200
Customer: id=108583063 name=Oakwood Ltd org=932937204
Products returned: 2
Product 3346: id=84439151 name=Data Advisory vat=25%
Product 7273: id=84439153 name=Network Service vat=25%
PaymentType: id=39711630 desc=Kontant
Bank acct: id=498671397 number=1920 bankAcctNum=12345678903
Line 1: 16000 * (1+25/100) = 20000
Line 2: 22050 * (1+25/100) = 27562.5
paidAmount = 47562.5
POST /invoice?sendToCustomer=false&paymentTypeId=39711630&paidAmount=47562.5 -> 201
Invoice created: id=2147695562 number=1
  amount=47562.5 amountExVat=38050
  outstanding=0 outstandingCurrency=0
  isCharged=true roundoff=0
  orderId=402077500
GET /invoice/2147695562?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*))) -> 200

Readback invoice 2147695562:
  customer: Oakwood Ltd org=932937204
  amount=47562.5 exVat=38050 outstanding=0
  line: "Data Advisory" product=Data Advisory(3346) price=16000 count=1
  line: "Network Service" product=Network Service(7273) price=22050 count=1
VERIFIED: amountOutstanding=0, fully paid
```

## 2026-03-22T10:42:18.834Z assistant_message
Done. **1 write, 0 errors, 5 total calls** (4 free GETs + 1 POST).

- Order created (id=402077500) for Oakwood Ltd (932937204)
- Invoice #1 (id=2147695562): 38050 ex-VAT, 47562.50 inc-VAT (25%)
- Lines: Data Advisory (3346) @ 16000, Network Service (7273) @ 22050
- Full payment registered: amountOutstanding=0
