# Claude Trace Snapshot

- provider: claude
- session_id: e078fe79-3aaf-497e-9108-ed53ac1df699
- session_file: /home/jorge/.claude/projects/-home-jorge-repos-ainm-tasks-tripletex-codex-environment/e078fe79-3aaf-497e-9108-ed53ac1df699.jsonl
- completed: true
- assistant_messages: 1
- tool_calls: 7
- tool_results: 7

## 2026-03-21T20:08:04.353Z user_message
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
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-200802913Z-74f063b0/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Crea una factura para el cliente Sierra SL (org. nº 909007135) con tres líneas de producto: Desarrollo de sistemas (8344) a 19250 NOK con 25 % IVA, Horas de consultoría (9563) a 10000 NOK con 15 % IVA (alimentos), y Informe de análisis (8060) a 15800 NOK con 0 % IVA (exento).

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
O1m3IwC1jGnmyHEQMoGEg7BJidoFYhz8Vo_oYldK4tc

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-200802913Z-74f063b0/scripts

Runner configuration:
- provider: claude
- model: claude-opus-4-6
- effort: high
- backend: proxy
- proxy_base_url: https://europe-west1-ai-nm26osl-1706.cloudfunctions.net/claude-proxy
- disable_experimental_betas: false

## 2026-03-21T20:08:09.987Z tool_call
tool: Read
call_id: toolu_vrtx_01RCC67hTDK9593fcEcfQDDK

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md"
}
```

## 2026-03-21T20:08:09.991Z tool_call
tool: Glob
call_id: toolu_vrtx_01KTg3B1w2WAcYG8gDDmkSEz

```json
{
  "pattern": "trusted-standards/*invoice*",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-21T20:08:09.992Z tool_call
tool: Glob
call_id: toolu_vrtx_019sGhZKKbDd15gZd5n4VGW6

```json
{
  "pattern": "task-playbooks/*invoice*",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-21T20:08:10.001Z tool_result
tool: Glob
call_id: toolu_vrtx_01KTg3B1w2WAcYG8gDDmkSEz

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice-credit-note.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-project-hours-and-create-project-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-and-send-customer-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-order-invoice-and-register-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-foreign-currency-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/reverse-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/reconcile-bank-statement-open-invoices.md
```

## 2026-03-21T20:08:10.003Z tool_result
tool: Glob
call_id: toolu_vrtx_019sGhZKKbDd15gZd5n4VGW6

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/reverse-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer-invoice-credit-note.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-project-hours-and-create-project-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-and-send-customer-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-order-invoice-and-register-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-foreign-currency-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/reconcile-bank-statement-open-invoices.md
```

## 2026-03-21T20:08:11.384Z tool_result
tool: Read
call_id: toolu_vrtx_01RCC67hTDK9593fcEcfQDDK

```text
File content (28914 tokens) exceeds maximum allowed tokens (10000). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.
```

## 2026-03-21T20:08:14.037Z tool_call
tool: Read
call_id: toolu_vrtx_01SNfzv6sVDcSZS6VP4MMjVn

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice.md"
}
```

## 2026-03-21T20:08:14.045Z tool_call
tool: Read
call_id: toolu_vrtx_012FHoHartPBbV92y25R3m65

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer-invoice.md"
}
```

## 2026-03-21T20:08:15.247Z tool_result
tool: Read
call_id: toolu_vrtx_01SNfzv6sVDcSZS6VP4MMjVn

```text
     1→# Create Customer Invoice
     2→
     3→## Trust Level
     4→- Trusted standard
     5→- Use directly for exact matches
     6→- Skip `./openapi.json` re-checking for exact matches
     7→
     8→## Exact Match
     9→- create one outgoing invoice
    10→- do not send it
    11→- customer already exists or is resolvable in one decisive read
    12→- products either already exist or lines are directly creatable from prompt
    13→- prompt is a standard customer-invoice create, not payment or reversal
    14→
    15→## Do Not Use This Standard If
    16→- prompt requires sending after create
    17→- prompt requires a custom multi-order workflow
    18→- task is a correction/reversal/payment flow
    19→
    20→## Standard Flow
    21→1. resolve customer with one decisive `GET /customer?...&fields=*` if needed
    22→2. resolve existing products only if prompt clearly references existing products
    23→   - prefer `GET /product?number=<ref1>,<ref2>&fields=*` with comma-separated prompt refs (OR semantics, returns all matches in one call); sandbox-verified on 2026-03-21
    24→   - verify the returned count matches expected; if any are missing, fall back to `GET /product?count=1000&fields=*` and filter locally by `number` and/or `name`
    25→   - do NOT use `number=X&number=Y` (repeated query params) — non-OR semantics, returns only first value
    26→   - do NOT use `productNumber=X&productNumber=Y` — unreliable across accounts, sometimes misses products
    27→   - do NOT use `GET /product?ids=<ref>` — prompt refs are small integers, never Tripletex internal IDs (84M+ range)
    28→   - if you do start with a speculative product resolver and it returns an incomplete subset, keep the broader catalog fallback inside the same script and reuse the already-resolved customer instead of restarting the whole flow
    29→3. for product-linked create-only prompts, treat the resolved product VAT as the default line VAT
    30→   - if the product read already returns a reusable `product.vatType.id`, either reuse that same id on the line or omit explicit line `vatType` and inherit from the product
    31→   - only resolve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*` when the task must force a VAT different from the resolved product, the product read lacks even a reusable `vatType.id`, or the line is not product-linked
    32→4. `POST /invoice?sendToCustomer=false`
    33→5. only if the write response omits decisive totals or later logic truly needs readback-only line details, do one immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
    34→6. stop
    35→
    36→## Payload Rules
    37→- include:
    38→  - `invoiceDate`
    39→  - `invoiceDueDate`
    40→  - `customer: { "id": ... }`
    41→  - lines under `orders[].orderLines`
    42→- do not create lines under read-only `invoice.orderLines`
    43→- for product-linked lines, prefer `product: { "id": ... }`
    44→- do not send unless prompt explicitly asks
    45→- do not hardcode output VAT code `3`
    46→- if `GET /product?fields=*` returns `vatType` as `id`/`url`, that id is still reusable for an exact existing-product create-only invoice
    47→- if the resolved product already carries the intended VAT, you may omit explicit line `vatType` and inherit from the product
    48→- if you want the payload to pin the same VAT explicitly without a separate VAT lookup, reuse the resolved `product.vatType.id`
    49→- if the filtered outgoing VAT read shows a mismatch and the desired percentage exists, force that line with `vatType: { "id": ... }`
    50→
    51→## Reuse From Write Response
    52→- `value.id`
    53→- `value.invoiceNumber`
    54→- totals from invoice write response
    55→- sparse line objects still prove line count, not full line details
    56→- if the payload already fixed `product`, `description`, `count`, `unitPriceExcludingVatCurrency`, and explicit line `vatType`, and the write response returns decisive totals (`amountExcludingVatCurrency` / `amountCurrency`), that is enough to stop on a create-only task
    57→
    58→## Verification
    59→- default verification is zero extra calls if invoice totals/existence are enough
    60→- sparse `orderLines` alone are not a reason to fetch the invoice again when the payload already fixed the line data and the write response totals match the intended VAT mix
    61→- use one immediate expanded `GET /invoice/{id}` only when exact scored line details still need proof or the write response is too thin to prove the financial outcome
    62→
    63→## Known Recovery Branches
    64→- if the first attempted API call returns `403` with body `{"error":"Invalid or expired token"}`, stop; the run is blocked by unusable credentials, not by invoice-flow uncertainty
    65→- if invoice creation fails with missing company bank account:
    66→  - `GET /ledger/account?isBankAccount=true&fields=*`
    67→  - update existing invoice account with `PUT /ledger/account/{id}`
    68→  - retry invoice write once
    69→  - keep the same invoice payload on that retry; do not re-read customer, products, or `vatType` after a bank-account-only validation failure
    70→- if the one-shot product catalog read is ambiguous or incomplete, use the documented numeric recovery chain instead of guessing from approximate matches
    71→- if a speculative `GET /product?productNumber=...` returns only a partial subset on a name-rich prompt, do the broader catalog fallback in the same script; do not re-read the customer or rerun the whole flow from the top
    72→
    73→## OpenAPI / Sandbox Status
    74→- `/invoice`, `/ledger/account`, and related invoice family endpoints verified in `./openapi.json`
    75→- flow and bank-account repair proven in sandbox/playbooks
    76→- later 2026-03-20 post-run reduction showed that the older 4-call exact-product-number path should not be treated as the floor for standard create-only existing-product invoices; exact-product-number prompts can be lower-call when the resolved products already carry reusable `vatType.id`
    77→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=925760838` with products labeled `(3644)`, `(4934)`, `(8806)` plus exact names showed that two numeric product-resolver reads were wasted before a later catalog read settled the products; the lower-call replacement for that shape is one decisive `GET /product?count=1000&fields=*` with local exact filtering by `number` and/or `name`
    78→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=909722500` with lines `Analysis Report (9796)`, `Maintenance (2145)`, and `System Development (5995)` plus VAT `25%` / `15%` / `0%` showed that one speculative `GET /product?productNumber=9796&productNumber=2145&productNumber=5995&fields=*` was wasted before the later catalog read settled the products; the lower-call replacement in that same fresh-account state is `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
    79→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=851635874` with lines `Analyserapport (2934)`, `Datarådgivning (8699)`, and `Nettverkstjeneste (1355)` plus VAT `25%` / `15%` / `0%` showed that a speculative `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*` did not resolve all lines, and the run only succeeded after a broader catalog fallback on exact names; the lower-call replacement for that shape is one decisive `GET /product?count=1000&fields=*`, then `GET /ledger/vatType`, then `POST /invoice?sendToCustomer=false`
    80→- the same `851635874` run also showed a control-flow inefficiency: the product-fallback logic happened only after the first script aborted, which forced a duplicate customer read on the second script run; next time keep the fallback as an in-script callback/branch and reuse the first successful customer resolution
    81→- re-verified on 2026-03-20 in persistent sandbox that `GET /product?productNumber=...&fields=*` can return `vatType` only as a link object (`id`/`url`), so explicit-VAT prompts may still need one filtered outgoing `vatType` lookup before the invoice write
    82→- re-verified on 2026-03-20 in persistent sandbox that `POST /invoice?sendToCustomer=false` can return sparse `orderLines` while still returning decisive totals; when the create payload already fixes the scored line fields, that write response is enough for the minimal create-only path
    83→- re-verified on 2026-03-20 in persistent sandbox with the exact customer/product-number shape `827304212` + `6744/2584/3739` that the proof path is still `GET /customer` -> `GET /product?productNumber=...` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false`; that sandbox account exposed only outgoing VAT `0%`, so the exact mixed `25%` / `15%` / `0%` write could not be replayed there and only a 0%-analog invoice could be proven in-account
    84→- re-verified again on 2026-03-20 in persistent sandbox with a disposable analog that exact-name product resolution plus `GET /ledger/vatType` plus `POST /invoice?sendToCustomer=false` completes the proof path in four calls after setup; that sandbox account still exposed only `0%` outgoing VAT, so mixed `25%` / `15%` / `0%` could not be replayed there
    85→- re-verified again on 2026-03-20 in persistent sandbox with a prompt-like analog for the `909722500` Oakwood task shape: after setup, a four-call proof path `GET /customer?organizationNumber=909722502&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false` resolved sandbox products whose stored numbers intentionally differed from prompt-like refs `9796`, `2145`, and `5995`; the created invoice returned `amountExcludingVatCurrency=47450` and `amountCurrency=47450`, and the sandbox still exposed only `0%` outgoing VAT
    86→- re-verified again on 2026-03-20 in persistent sandbox with an analog customer and exact-name products whose stored product numbers intentionally differed from prompt-like refs `2934` / `8699` / `1355`; after setup, the winning proof path was exactly `GET /customer?organizationNumber=851635875&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`, and the created invoice returned `amountExcludingVatCurrency=53050` and `amountCurrency=53050`
    87→- production feedback on 2026-03-20 for the exact prompt shape `customer.organizationNumber=861379760` with exact product numbers `2109`, `1175`, `9974` and VAT mix `25%` / `15%` / `0%` confirmed that the successful 4-call path still was not efficiency-optimal; the lower-call replacement for that exact shape is `GET /customer?organizationNumber=...&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false`, reusing each resolved product's `vatType.id` or inheriting VAT from the product
    88→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=977448239` with `Konsulenttimer (6390)`, `Systemutvikling (1652)`, and `Webdesign (3273)` plus VAT `25%` / `15%` / `0%` showed that the created invoice was correct but not minimal-call because it spent `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` before the first invoice write
    89→- that same run then hit the known missing-company-bank-account validation on the first `POST /invoice`, so the realistic lower-call replacement in that exact fresh-account state is `GET /customer?organizationNumber=977448239&fields=*` -> `GET /product?productNumber=6390&productNumber=1652&productNumber=3273&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> single retry of the same invoice write
    90→- exhaustive persistent-sandbox reduction on 2026-03-20 with the same customer/product-number analog `861379760` + `2109/1175/9974` proved the floor for the exact-number existing-product branch:
    91→  - `GET /customer?organizationNumber=861379760&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false` with `product.id` and no explicit line `vatType` succeeded and preserved linked product numbers on readback
    92→  - the same 3-call path also succeeded when each line explicitly reused the resolved `product.vatType.id`
    93→  - the tempting 2-call shortcut `GET /customer` -> `POST /invoice` with `product.number` did create an invoice, but readback showed `product=null` on all lines, so it is not a valid existing-product replacement path
    94→  - the tempting 2-call shortcut `GET /product` -> `POST /invoice` with inline `customer { name, organizationNumber }` failed with `422` because the related order still required `customer.id`
    95→  - that sandbox account still exposed only outgoing VAT `0%`, so the mixed `25%` / `15%` / `0%` combination itself could not be replayed there; the proof is about the lower-call resolver/write path, not the mixed-rate availability of that account
    96→- persistent-sandbox re-proof on 2026-03-20 with a disposable exact-number analog `customer.organizationNumber=977448240` and products `96390`, `91652`, `93273` re-confirmed the same lower-call branch after setup:
    97→  - proof path itself was `GET /customer?organizationNumber=977448240&fields=*` -> `GET /product?productNumber=96390&productNumber=91652&productNumber=93273&fields=*` -> `POST /invoice?sendToCustomer=false`
    98→  - the immediate documentation readback `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` showed linked product numbers `96390`, `91652`, `93273`
    99→  - that sandbox account still exposed only outgoing VAT `0%`, so the analog proved the no-extra-`/ledger/vatType` exact-number path and linked-product behavior, but not the mixed `25%` / `15%` / `0%` combination itself
   100→- the 2026-03-21 production run for `Ridgepoint Ltd` / `970844708` / products `Software License (3957)` + `Maintenance (8149)` + `Web Design (8092)` / VAT `25%` + `15% food` + `0% exempt` scored `0/1` because the agent spent all `300s` reading documentation and never executed the API script; the correct path was the exact-match `3`-call fast path already documented above: `GET /customer?organizationNumber=970844708&fields=*` -> `GET /product?productNumber=3957&productNumber=8149&productNumber=8092&fields=*` -> `POST /invoice?sendToCustomer=false` with reused `product.vatType.id`
   101→- persistent sandbox re-proof on 2026-03-21 with analog customer and three analog products re-confirmed that both explicit `vatType: { id: product.vatType.id }` and omitted `vatType` on product-linked lines produce identical readback; for this exact-number existing-product task shape, the `GET /ledger/vatType` call is unnecessary when the product read returns reusable `vatType.id`
   102→- the 2026-03-21 production run for `Elvdal AS` / `810713909` / products `Nettverksteneste (7765)` + `Konsulenttimar (4369)` + `Vedlikehald (5331)` / VAT `25%` + `15% food` + `0% exempt` succeeded with 7 API calls but wasted 1 call on a speculative `GET /product?productNumber=7765&productNumber=4369&productNumber=5331&fields=*` that returned only product `5331`; the broader `GET /product?count=1000&fields=*` fallback then resolved all three by local `number` filtering
   103→  - the wasted call confirms that `productNumber` multi-value query can return partial results in fresh production accounts even when all products exist in the catalog by their `number` field
   104→  - the correct path for this "names + parenthetical numbers" prompt shape was `GET /customer?organizationNumber=810713909&fields=*` -> `GET /product?count=1000&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional bank-account repair -> retry = 6 calls instead of the actual 7
   105→  - product VAT inheritance worked correctly: products carried `vatType.id` values `3` (25%), `31` (15%), `6` (0%), and reusing them on the invoice lines produced correct totals `amountExcludingVatCurrency=33650` / `amountCurrency=38707.5`
   106→  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
   107→  - persistent sandbox re-proof on 2026-03-21 with the same amounts and catalog-read path produced the same `amountExcludingVatCurrency=33650` in 3 calls (sandbox had no bank-account issue)
   108→
```

## 2026-03-21T20:08:15.669Z tool_result
tool: Read
call_id: toolu_vrtx_012FHoHartPBbV92y25R3m65

```text
     1→# Create Customer Invoice
     2→
     3→## Scope
     4→
     5→Use for tasks like:
     6→- create one outgoing customer invoice
     7→- do not send the invoice unless the prompt explicitly asks for sending
     8→- the customer already exists and is usually identified by organization number
     9→- the lines may use existing products identified by numeric refs in parentheses
    10→- the prompt gives line descriptions, prices, and sometimes exact VAT rates
    11→
    12→Do not use for:
    13→- send-after-create tasks where the sending step is part of the prompt
    14→- order-then-invoice tasks that explicitly require a separate `POST /order` flow
    15→- invoice-payment tasks
    16→
    17→## Verified Findings
    18→
    19→- later 2026-03-20 reduction work showed that the older 4-call exact-product-number branch should not be treated as the floor for standard create-only existing-product invoices; when the resolved products already carry reusable `vatType.id`, the `/ledger/vatType` read is often unnecessary
    20→- production feedback on 2026-03-20 for the exact prompt shape `customer.organizationNumber=861379760`, products `2109`, `1175`, `9974`, names `Mantenimiento`, `Horas de consultoría`, `Informe de análisis`, VAT `25%` / `15%` / `0%` showed:
    21→  - the created invoice was fully correct, but the winning write path was still not efficiency-optimal because it spent `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
    22→  - the lower-call replacement for that exact task shape is `GET /customer?organizationNumber=861379760&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false`
    23→  - on that lower-call replacement, use `product: { id }` on each line and either reuse the resolved `product.vatType.id` explicitly or let the product VAT inherit; do not spend `/ledger/vatType` just because the prompt text repeats the VAT percentages
    24→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=977448239`, lines `Konsulenttimer (6390)`, `Systemutvikling (1652)`, `Webdesign (3273)`, VAT `25%` / `15%` / `0%` showed:
    25→  - the run created the correct invoice, but it was not minimal-call because it spent `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` before the first invoice write even though the exact-number product read already returned reusable `product.vatType.id`
    26→  - the same run then hit the known missing-company-bank-account validation on the first `POST /invoice`, so the realistic minimal successful production path for that exact account state was six calls: `GET /customer?organizationNumber=977448239&fields=*` -> `GET /product?productNumber=6390&productNumber=1652&productNumber=3273&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> single retry
    27→  - do not let the presence of reduced VAT `15%` trick you into an automatic `/ledger/vatType` read on an exact-number existing-product create-only prompt; reuse `product.vatType.id` unless the task explicitly overrides the product VAT or the product lookup lacks a reusable vatType id
    28→- the production run for this exact task on 2026-03-20 stopped on the first call:
    29→  - `GET /customer?organizationNumber=919172657&fields=*` returned `403 {"error":"Invalid or expired token"}`
    30→  - that was a credential block, not an invoice-flow failure, so no further production API calls were justified
    31→- follow-up reflection on the successful production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=925760838`, product labels `(3644)`, `(4934)`, `(8806)`, names `Maintenance`, `Licence logicielle`, `Service réseau`) showed:
    32→  - the run succeeded, but it spent two extra product-resolution reads before a later `GET /product?count=1000&fields=*` settled the products
    33→  - because the prompt already gave exact product names, the lower-call resolver for that exact shape should have been one decisive catalog read with local exact filtering by product `number` and/or exact product `name`, not `GET /product?productNumber=...` followed by `GET /product?ids=...`
    34→  - the same run also hit the known missing-company-bank-account validation on the first invoice write, so the realistic minimal successful production path for that account state was seven API calls: `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
    35→- reflection on the successful production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=909722500`, product lines `Analysis Report (9796)`, `Maintenance (2145)`, `System Development (5995)`, VAT `25%` / `15%` / `0%`) showed:
    36→  - the run reached the correct final invoice state, but it was not minimal-call
    37→  - one speculative `GET /product?productNumber=9796&productNumber=2145&productNumber=5995&fields=*` was wasted before a broader `GET /product?count=1000&fields=*` settled the products by exact-name filtering
    38→  - the same run also hit the known missing-company-bank-account validation on the first invoice write, so the realistic minimal successful production path for that exact account state was seven API calls: `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
    39→- reflection on the production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=851635874`, product labels `(2934)`, `(8699)`, `(1355)`, names `Analyserapport`, `Datarådgivning`, `Nettverkstjeneste`, VAT `25%` / `15%` / `0%`) showed:
    40→  - correctness was fine, but the run lost the efficiency point because it used a speculative `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*` before a later broader catalog read settled the products
    41→  - the script then aborted on that partial resolver result and restarted the whole flow, which duplicated the already-successful customer read; that control-flow mistake is exactly the kind of avoidable non-minimal behavior that should stay inside one in-script callback/fallback branch instead
    42→  - the lower-call replacement for that exact task shape is `GET /customer?organizationNumber=851635874&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
    43→- the original production run on 2026-03-20 succeeded with:
    44→  - `GET /customer?organizationNumber=...&fields=*`
    45→  - an initial `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` returned only a partial subset, so the script had to continue through the documented fallback chain instead of stopping
    46→  - `POST /invoice?sendToCustomer=false`
    47→  - the first invoice write hit the known bank-account validation and succeeded only after the documented `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` repair -> single retry branch
    48→- persistent-sandbox verification on 2026-03-20 showed:
    49→  - `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` can return all requested products when the refs are real product numbers
    50→  - `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` can still return each product `vatType` only as a sparse link object (`id`/`url`), not with `percentage`
    51→  - for exact existing-product create-only invoices, that sparse `vatType` link can still be reusable: the returned `product.vatType.id` can be copied onto the line, or the line can inherit VAT from the resolved product, without spending `GET /ledger/vatType`
    52→  - reserve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` for direct-line invoices, ambiguous product VAT, or cases where the task must override the resolved product VAT
    53→  - an existing-customer, existing-product invoice can be created directly with `POST /invoice?sendToCustomer=false` using `orderLines[].product = { "id": ... }`
    54→  - the `POST /invoice` response returned `orderLines` only as sparse link objects with keys `id` and `url`, even though `orderLines.length` matched the requested line count and the response still included decisive totals
    55→  - one immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` returned the exact product numbers, descriptions, unit prices, and VAT data for the created lines
    56→  - a clean existing-customer plus existing-product proof path was re-proven in exactly three calls for the create-only path: `GET /customer` -> `GET /product` -> `POST /invoice?sendToCustomer=false`
    57→  - the same shape stayed at four calls only when an immediate `GET /invoice/{id}` was intentionally added for documentation-grade readback proof
    58→- exhaustive persistent-sandbox reduction on 2026-03-20 with the exact analog customer/product numbers `861379760` + `2109/1175/9974` showed:
    59→  - `GET /customer?organizationNumber=861379760&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false` with `product.id` and no explicit line `vatType` succeeded and preserved linked product numbers on readback
    60→  - the same 3-call path also succeeded when each line explicitly reused the resolved `product.vatType.id`
    61→  - the tempting 2-call shortcut `GET /customer` -> `POST /invoice` with `product.number` created unlinked direct lines (`product=null` on readback), so it is not a valid existing-product shortcut
    62→  - the tempting 2-call shortcut `GET /product` -> `POST /invoice` with inline `customer { name, organizationNumber }` failed with `422` because the related order still required `customer.id`
    63→- persistent-sandbox re-proof on 2026-03-20 with disposable analog customer `977448240` and exact-number products `96390`, `91652`, `93273` showed:
    64→  - after setup, the proof path itself was `GET /customer?organizationNumber=977448240&fields=*` -> `GET /product?productNumber=96390&productNumber=91652&productNumber=93273&fields=*` -> `POST /invoice?sendToCustomer=false`
    65→  - the immediate documentation readback `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` showed linked product numbers `96390`, `91652`, `93273`
    66→  - that sandbox account still exposed only outgoing VAT `0%`, so the analog proved the lower-call exact-number product-linking branch and the lack of any need for `/ledger/vatType` in the proof path itself, but not the mixed `25%` / `15%` / `0%` percentages
    67→- persistent-sandbox verification on 2026-03-20 with the exact identifiers from this task shape (`customer.organizationNumber=827304212`, products `6744`, `2584`, `3739`) showed:
    68→  - `GET /customer?organizationNumber=827304212&fields=*` resolved the customer in one call
    69→  - `GET /product?productNumber=6744&productNumber=2584&productNumber=3739&fields=*` resolved all three exact-number products in one call and again returned each product `vatType` only as an `id`/`url` link
    70→  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` exposed only VAT code `6` (`0%`) in that sandbox account, so the exact mixed `25%` / `15%` / `0%` task could not be replayed there
    71→  - after sandbox-only setup of exact-number analog products, the same four-call proof path (`GET /customer` -> `GET /product?productNumber=...` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false`) succeeded and returned a sparse-write-response invoice with `amountExcludingVatCurrency=52600`, `amountCurrency=52600`, and three link-only `orderLines`
    72→- additional persistent-sandbox post-run verification on 2026-03-20 with the exact identifiers from this task shape (`customer.organizationNumber=919172657`, products `4783`, `3343`, `4380`) showed:
    73→  - after sandbox setup, `GET /customer?organizationNumber=919172657&fields=*` resolved the customer in one call
    74→  - `GET /product?productNumber=4783&productNumber=3343&productNumber=4380&fields=*` resolved all three products in one call and again returned each product `vatType` only as an `id`/`url` link
    75→  - `POST /invoice?sendToCustomer=false` returned sparse `orderLines` but also returned decisive totals (`amountExcludingVatCurrency=54700`, `amountCurrency=54700`) for the create-only 0% proof invoice
    76→  - the follow-up `GET /invoice/{id}` was useful for documentation proof, but was not required for the minimum create-only path because the payload had already fixed the line fields and the write response totals already proved the financial outcome
    77→- sandbox constraint on 2026-03-20:
    78→  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
    79→  - additional spot checks on 2022-03-20, 2023-03-20, 2024-03-20, 2025-03-20, and 2026-03-19 still returned only VAT code `6`
    80→  - therefore exact mixed `25%` / `15%` / `0%` VAT could not be replayed in that sandbox account, but the product-linked invoice path, sparse write-response trap, and lower-call no-extra-read create path were proven
    81→- persistent-sandbox follow-up on 2026-03-20 with a disposable analog for this exact prompt shape proved the lower-call product resolver directly:
    82→  - setup used products with the exact prompt names but intentionally different stored product numbers, so the parenthetical refs were not usable Tripletex lookup keys
    83→  - after setup, the proof path itself was exactly four calls: `GET /customer?organizationNumber=925760838&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
    84→  - the proof invoice succeeded with `amountExcludingVatCurrency=33950` and `amountCurrency=33950`
    85→  - because that sandbox account still exposed only `0%` outgoing VAT, the analog proved the product-resolution and create-only-path lesson, but not the mixed `25%` / `15%` / `0%` VAT combination itself
    86→- persistent-sandbox follow-up on 2026-03-20 with a prompt-like analog for the `909722500` Oakwood task shape showed:
    87→  - setup used analog customer `organizationNumber=909722502` and products whose exact names preserved the same line structure while the stored product numbers intentionally differed from prompt-like refs `9796`, `2145`, and `5995`
    88→  - after setup, the proof path itself was exactly four calls: `GET /customer?organizationNumber=909722502&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
    89→  - the proof invoice succeeded with `amountExcludingVatCurrency=47450` and `amountCurrency=47450`
    90→  - because the sandbox still exposed only `0%` outgoing VAT, the analog proved the product-resolution and create-only-path lesson for this task shape, but not the exact mixed `25%` / `15%` / `0%` VAT combination itself
    91→- persistent-sandbox follow-up on 2026-03-20 with a disposable analog for the `851635874` task shape proved the callback/fallback lesson directly:
    92→  - setup used an analog customer `organizationNumber=851635875` and exact-name products whose stored product numbers were intentionally different from prompt-like refs `2934`, `8699`, and `1355`
    93→  - after setup, the winning proof path itself was exactly four calls: `GET /customer?organizationNumber=851635875&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
    94→  - that proof invoice succeeded with `amountExcludingVatCurrency=53050` and `amountCurrency=53050`
    95→  - because the sandbox still exposed only `0%` outgoing VAT, this analog proved the product-resolution and single-script callback/fallback lesson, but not the exact mixed `25%` / `15%` / `0%` VAT combination itself
    96→- the 2026-03-21 production run for `Ridgepoint Ltd` / `970844708` / products `3957` + `8149` + `8092` / VAT `25%` + `15% food` + `0% exempt` scored `0/1` (timeout) because the agent spent all `300s` reading documentation files (`AGENTS.md` too large at 27703 tokens, then trusted standard, then partial `AGENTS.md`) and never wrote or executed the API script; no API calls were made at all
    97→  - this was an exact trusted-standard match for the `3`-call fast path: `GET /customer` -> `GET /product?productNumber=...` -> `POST /invoice?sendToCustomer=false`
    98→  - the root cause was excessive file reading before execution, not an API-flow issue
    99→  - persistent sandbox re-proof on 2026-03-21 re-confirmed that both explicit `vatType: { id: product.vatType.id }` and omitted `vatType` produce identical product-linked invoice readback
   100→- the 2026-03-21 production run for `Elvdal AS` / `810713909` / products `Nettverksteneste (7765)` + `Konsulenttimar (4369)` + `Vedlikehald (5331)` / VAT `25%` + `15% food` + `0% exempt` succeeded but used 7 calls instead of the optimal 6:
   101→  - the wasted call was a speculative `GET /product?productNumber=7765&productNumber=4369&productNumber=5331&fields=*` that returned only product `5331`; the broader `GET /product?count=1000&fields=*` fallback then found all three by local `number` filtering
   102→  - this confirms that for the "names + parenthetical numbers" prompt pattern, the catalog read is always strictly equal or better than the speculative productNumber query: both are 1 call, but the speculative query can waste an extra call when it returns partial results
   103→  - the correct lower-call path was `GET /customer` -> `GET /product?count=1000&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional bank-account repair -> retry = 6 calls
   104→  - product VAT inheritance worked: products carried `vatType.id` values `3` (25%), `31` (15%), `6` (0%) and reusing them produced correct totals `amountExcludingVatCurrency=33650` / `amountCurrency=38707.5`
   105→  - persistent sandbox re-proof on 2026-03-21 with the same amounts confirmed the catalog-read path in 3 calls (sandbox had no bank-account issue)
   106→
   107→## Minimal Flow
   108→
   109→1. Confirm these operations in `./openapi.json`
   110→   - `GET /customer`
   111→   - `GET /product`
   112→   - `POST /invoice`
   113→   - `GET /invoice/{id}`
   114→   - if exact invoice-line VAT must be forced rather than inherited from the resolved products, also confirm `GET /ledger/vatType`
   115→2. Resolve the customer
   116→   - usually `GET /customer?organizationNumber=...&fields=*`
   117→3. Resolve any existing products referenced by numeric prompt refs
   118→   - use `GET /product?number=<ref1>,<ref2>&fields=*` with comma-separated prompt refs (OR semantics); sandbox-verified on 2026-03-21
   119→   - verify the returned count matches expected; if any are missing, fall back to `GET /product?count=1000&fields=*` and filter locally by `number` and/or `name`
   120→   - do NOT use `number=X&number=Y` (repeated query params) — non-OR semantics, returns only first value
   121→   - do NOT use `productNumber=X&productNumber=Y` — unreliable across accounts
   122→   - do not let a partial first resolver terminate the script and force a full rerun; keep the broader catalog fallback in the same script/callback chain so the customer read is not duplicated
   123→4. If the prompt gives exact VAT rates, inspect how much VAT detail the product read actually returned
   124→   - for exact existing-product create-only prompts, a sparse `product.vatType` link is still enough to keep the low-call branch: reuse `product.vatType.id` directly or omit explicit line `vatType` and inherit from the product
   125→   - only if the task must force VAT independently of the resolved product, or the product read lacks even a reusable `vatType.id`, do one filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
   126→   - do not spend `/ledger/vatType` just because the prompt text repeats VAT percentages that are already implied by the exact resolved products
   127→5. Create the invoice directly
   128→   - `POST /invoice?sendToCustomer=false`
   129→   - include `invoiceDate`, `invoiceDueDate`, `customer`
   130→   - create lines under `orders[].orderLines`
   131→   - for product-linked lines, prefer `product: { "id": ... }`, `description`, `count`, and the requested unit price
   132→   - if the filtered outgoing VAT lookup returns a valid id for the prompt percentage, prefer sending explicit line `vatType: { "id": ... }` so the write payload itself fixes the scored VAT field
   133→6. Reuse the invoice write response
   134→   - trust the returned `id`, `invoiceNumber`, and totals
   135→   - if the payload already fixed `product`, `description`, `count`, `unitPriceExcludingVatCurrency`, and any needed explicit line `vatType`, and the write response already proves the totals, stop
   136→7. If exact line-level verification is needed and the write response is sparse, do one immediate read
   137→   - `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
   138→   - treat the response as sparse not only when `orderLines` is empty, but also when the entries are link-only objects without `product.number`, `description`, `unitPriceExcludingVatCurrency`, and `vatType.percentage`
   139→   - do not add this read merely because the write response kept `orderLines` sparse if the write response totals already prove the intended create-only financial outcome
   140→8. Only if `POST /invoice` fails with the company-bank-account validation, repair that prerequisite and retry once
   141→
   142→## Exact-Match Fast Path
   143→
   144→- For a prompt that:
   145→  - identifies an existing customer by organization number
   146→  - identifies existing products by exact product numbers
   147→  - asks only to create the invoice, not send it
   148→  - gives explicit VAT percentages that must be respected
   149→- the winning path is usually:
   150→  1. `GET /customer?organizationNumber=...&fields=*`
   151→  2. `GET /product?number=<ref1>,<ref2>&fields=*` — comma-separated refs, OR semantics
   152→  3. `POST /invoice?sendToCustomer=false`
   153→  - on that write, use `product: { id }` and either:
   154→    - explicit `vatType: { id: product.vatType.id }` copied from the resolved product read, or
   155→    - no explicit line `vatType`, letting the invoice line inherit VAT from the resolved product
   156→  - stop there if the write response totals match the intended line prices and VAT mix
   157→  - only add `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*` when the task must override the resolved product VAT or the product read lacks reusable `vatType.id`
   158→- For a prompt that:
   159→  - identifies an existing customer by organization number
   160→  - identifies existing products by exact names plus ambiguous numeric refs in parentheses
   161→  - asks only to create the invoice, not send it
   162→  - does not force an extra VAT confirmation step beyond what the product read already proves
   163→- the winning path is usually:
   164→  1. `GET /customer?organizationNumber=...&fields=*`
   165→  2. `GET /product?number=<ref1>,<ref2>&fields=*` — comma-separated refs, OR semantics; fall back to `count=1000` if any are missing
   166→  3. `POST /invoice?sendToCustomer=false`
   167→  4. optional immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` only if you still need exact line proof
   168→- For the explicit-VAT variant where `GET /product?fields=*` leaves `vatType` sparse as only `id`/`url`:
   169→  - the lower-call winning path is usually four calls:
   170→  1. `GET /customer?organizationNumber=...&fields=*`
   171→  2. `GET /product?number=<ref1>,<ref2>&fields=*` — comma-separated refs, OR semantics
   172→  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
   173→  4. `POST /invoice?sendToCustomer=false`
   174→  - stop there if the write response totals match the intended line prices and VAT mix
   175→  - add a fifth immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` only when exact readback-only line proof is still needed
   176→- For the explicit-VAT variant where `GET /product?fields=*` leaves `vatType` sparse as only `id`/`url`, the documented proof path can still be five calls:
   177→  1. `GET /customer?organizationNumber=...&fields=*`
   178→  2. `GET /product?number=<ref1>,<ref2>&fields=*` — comma-separated refs, OR semantics
   179→  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
   180→  4. `POST /invoice?sendToCustomer=false`
   181→  5. immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
   182→- if the catalog read is ambiguous or step 2 still does not uniquely settle the products, then use the documented numeric fallback chain before deciding the refs are unresolved
   183→- if a speculative first product resolver misses one line, do not restart from `GET /customer`; continue in the same script and reuse already-known ids/results
   184→- Do not insert an automatic `GET /ledger/account` before the first invoice write
   185→- Do not call `PUT /invoice/{id}/:send`
   186→- Do not add a delayed verification read in a separate later script/session if you already know you need line-level proof; do the one decisive `GET /invoice/{id}` immediately while the same token is still in use
   187→- Do not treat sparse `orderLines` in the write response as an automatic reason to spend `GET /invoice/{id}`; first check whether the write response totals already prove the outcome
   188→
   189→## Invoice Payload Notes
   190→
   191→- `invoiceDueDate` is required
   192→- `orders[].deliveryDate` is required
   193→- `invoice.orderLines` is read-only in the schema
   194→- create lines under `orders[].orderLines`
   195→
   196→Safe product-linked shape:
   197→
   198→```json
   199→{
   200→  "invoiceDate": "2026-03-20",
   201→  "invoiceDueDate": "2026-04-03",
   202→  "customer": { "id": 123 },
   203→  "orders": [
   204→    {
   205→      "customer": { "id": 123 },
   206→      "orderDate": "2026-03-20",
   207→      "deliveryDate": "2026-03-20",
   208→      "orderLines": [
   209→        {
   210→          "product": { "id": 456 },
   211→          "description": "Maintenance",
   212→          "count": 1,
   213→          "unitPriceExcludingVatCurrency": 28100
   214→        }
   215→      ]
   216→    }
   217→  ]
   218→}
   219→```
   220→
   221→If you must force a specific VAT code on the line, add:
   222→
   223→```json
   224→{
   225→  "vatType": { "id": 3 }
   226→}
   227→```
   228→
   229→on that `orderLines[]` item.
   230→
   231→## VAT Rules
   232→
   233→- Do not hardcode invoice-line `vatType.id = 3`
   234→- For exact existing-product create-only invoices, reusing the resolved `product.vatType.id` is a valid low-call way to keep the line tied to the product VAT
   235→- If the resolved product/account combination already carries the intended VAT safely, the invoice write can also succeed without an explicit line `vatType`
   236→- `GET /product?fields=*` may still expose `vatType` only as `id`/`url`; that is not enough for a percentage proof, but it is still enough to reuse the same product VAT id on the invoice line
   237→- If the task is direct-line, the prompt requires overriding the product VAT, or the product lookup does not return a reusable `vatType.id`, resolve `vatType` from:
   238→  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
   239→- Choose from the filtered result for the actual invoice date
   240→- If the resolved product `vatType.id` already maps to the prompt percentage in that filtered result, you can keep the lower-call write shape and omit explicit line `vatType`
   241→- Do not substitute VAT ids from the broader unfiltered catalog when the `OUTGOING` result disagrees or is narrower
   242→
   243→## Credential Trap
   244→
   245→- If the first attempted API call returns `403` with body `{"error":"Invalid or expired token"}`, stop immediately
   246→- Do not spend follow-up calls on `/product`, `/invoice`, or alternate auth variations
   247→- That response means the run is blocked by unusable credentials, not by uncertainty about the invoice flow
   248→
   249→## Sparse Response Trap
   250→
   251→- `POST /invoice` can return:
   252→
   253→```json
   254→{
   255→  "value": {
   256→    "id": 2147525654,
   257→    "orderLines": [
   258→      { "id": 1, "url": "..." }
   259→    ]
   260→  }
   261→}
   262→```
   263→
   264→- that does not mean the detailed line fields are missing from the actual invoice
   265→- the same trap still applies when the sparse response shows the correct number of line link objects; line count alone is not enough for exact verification
   266→- if you need the exact line details, do one immediate `GET /invoice/{id}` with expanded `fields` and stop there
   267→- if the write payload already fixed the scored line fields and the write response totals already prove the intended VAT outcome, the minimal create-only path stops without that extra read
   268→
   269→## Bank Account Repair Branch
   270→
   271→If `POST /invoice` fails with:
   272→
   273→`Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`
   274→
   275→then the practical repair path is:
   276→
   277→1. `GET /ledger/account?isBankAccount=true&fields=*`
   278→2. choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
   279→3. `PUT /ledger/account/{id}` with:
   280→
   281→```json
   282→{
   283→  "bankAccountNumber": "12345678903"
   284→}
   285→```
   286→
   287→4. retry `POST /invoice` once
   288→5. keep the same invoice payload on that retry; do not re-read customer, products, or `vatType` if the only failure was the company-bank-account validation
   289→
   290→## Avoidable Mistakes
   291→
   292→- Do not spend an unconditional `GET /ledger/account` before the first invoice write
   293→- Do not use the send-invoice flow when the prompt only asks to create an invoice
   294→- Do not assume the `POST /invoice` response fully expands each line just because `orderLines.length` matches the requested line count
   295→- Do not assume `GET /product?fields=*` fully expands `vatType.percentage`; it may return only `id`/`url`
   296→- Always use `GET /product?number=<ref1>,<ref2>&fields=*` (comma-separated, OR semantics) as the primary product resolver; fall back to `count=1000` only if it returns fewer products than expected
   297→- Do NOT use `number=X&number=Y` (repeated query params) — non-OR semantics, returns only first value
   298→- Do NOT use `productNumber=X&productNumber=Y` — unreliable across accounts, sometimes misses products
   299→- Do not add `/ledger/vatType` by reflex on an exact existing-product-number create-only prompt when the resolved products already carry reusable `vatType.id`
   300→- Do not treat `product: { number: ... }` on `POST /invoice` as a safe existing-product shortcut; sandbox created unlinked lines even though the write succeeded
   301→- Do not assume `customer: { name, organizationNumber }` on `POST /invoice` removes the need for a customer read; sandbox still rejected the related order because `customer.id` was missing
   302→- Do not treat inline numeric refs such as `Analysis Report (9796)` as proven `productNumber` search keys when the prompt never explicitly says those numbers are the stored Tripletex product numbers; if exact names are present, one decisive catalog read is often the lower-call path
   303→- Do not spend both numeric product resolver reads when the prompt already gives exact names and one decisive catalog read would settle the products
   304→- Do not let a partial product-resolver miss abort the script and trigger a second full run; the broader resolver belongs in the same in-script callback/fallback path
   305→- Do not postpone a needed verification read into a later separate script/session
   306→- Do not stop after a partial or ambiguous product resolver result; continue the documented fallback chain in the same script
   307→- Do not keep probing after a first-call `403 {"error":"Invalid or expired token"}`
   308→- Do not spend `GET /invoice/{id}` by reflex after every successful create-only invoice write; reuse the payload plus write-response totals first
   309→- Do not let a local arithmetic/assertion bug after a successful invoice write trigger a retry; re-check the VAT math first
   310→
```

## 2026-03-21T20:08:56.217Z tool_call
tool: Write
call_id: toolu_vrtx_01JR3Xzr7LSbekeDCRnWY2g8

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-200802913Z-74f063b0/scripts/create-invoice.ts",
  "content": "const BASE = \"https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2\";\nconst TOKEN = \"O1m3IwC1jGnmyHEQMoGEg7BJidoFYhz8Vo_oYldK4tc\";\nconst AUTH = \"Basic \" + btoa(\"0:\" + TOKEN);\nconst H = { Authorization: AUTH, \"Content-Type\": \"application/json\" };\n\nasync function get(path: string) {\n  const r = await fetch(BASE + path, { headers: H });\n  const body = await r.json();\n  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${JSON.stringify(body)}`);\n  return body;\n}\n\nasync function post(path: string, data: any) {\n  const r = await fetch(BASE + path, { method: \"POST\", headers: H, body: JSON.stringify(data) });\n  const body = await r.json();\n  if (!r.ok) return { ok: false, status: r.status, body };\n  return { ok: true, status: r.status, body };\n}\n\nasync function put(path: string, data: any) {\n  const r = await fetch(BASE + path, { method: \"PUT\", headers: H, body: JSON.stringify(data) });\n  const body = await r.json();\n  if (!r.ok) throw new Error(`PUT ${path} ${r.status}: ${JSON.stringify(body)}`);\n  return body;\n}\n\nasync function main() {\n  // 1. Resolve customer\n  const custResp = await get(\"/customer?organizationNumber=909007135&fields=*\");\n  if (!custResp.values?.length) throw new Error(\"Customer not found\");\n  const customer = custResp.values[0];\n  console.log(\"Customer:\", customer.id, customer.name);\n\n  // 2. Resolve products by number (comma-separated, OR semantics)\n  const prodResp = await get(\"/product?number=8344,9563,8060&fields=*\");\n  const products = prodResp.values || [];\n  console.log(\"Products found:\", products.length);\n\n  if (products.length < 3) {\n    // Fallback to catalog read\n    console.log(\"Partial product match, falling back to catalog read...\");\n    const catalogResp = await get(\"/product?count=1000&fields=*\");\n    const catalog = catalogResp.values || [];\n    const needed = new Set([\"8344\", \"9563\", \"8060\"]);\n    const resolved: Record<string, any> = {};\n    for (const p of products) resolved[String(p.number)] = p;\n    for (const p of catalog) {\n      if (needed.has(String(p.number)) && !resolved[String(p.number)]) {\n        resolved[String(p.number)] = p;\n      }\n    }\n    if (Object.keys(resolved).length < 3) throw new Error(\"Could not resolve all products\");\n    return await createInvoice(customer, resolved[\"8344\"], resolved[\"9563\"], resolved[\"8060\"]);\n  }\n\n  // Map by number\n  const byNum: Record<string, any> = {};\n  for (const p of products) byNum[String(p.number)] = p;\n  return await createInvoice(customer, byNum[\"8344\"], byNum[\"9563\"], byNum[\"8060\"]);\n}\n\nasync function createInvoice(customer: any, prod8344: any, prod9563: any, prod8060: any) {\n  console.log(\"Product 8344:\", prod8344.id, prod8344.name, \"vatType.id:\", prod8344.vatType?.id);\n  console.log(\"Product 9563:\", prod9563.id, prod9563.name, \"vatType.id:\", prod9563.vatType?.id);\n  console.log(\"Product 8060:\", prod8060.id, prod8060.name, \"vatType.id:\", prod8060.vatType?.id);\n\n  const invoiceDate = \"2026-03-21\";\n  const invoiceDueDate = \"2026-04-04\";\n\n  const payload = {\n    invoiceDate,\n    invoiceDueDate,\n    customer: { id: customer.id },\n    orders: [\n      {\n        customer: { id: customer.id },\n        orderDate: invoiceDate,\n        deliveryDate: invoiceDate,\n        orderLines: [\n          {\n            product: { id: prod8344.id },\n            description: \"Desarrollo de sistemas\",\n            count: 1,\n            unitPriceExcludingVatCurrency: 19250,\n            vatType: { id: prod8344.vatType?.id }\n          },\n          {\n            product: { id: prod9563.id },\n            description: \"Horas de consultoría\",\n            count: 1,\n            unitPriceExcludingVatCurrency: 10000,\n            vatType: { id: prod9563.vatType?.id }\n          },\n          {\n            product: { id: prod8060.id },\n            description: \"Informe de análisis\",\n            count: 1,\n            unitPriceExcludingVatCurrency: 15800,\n            vatType: { id: prod8060.vatType?.id }\n          }\n        ]\n      }\n    ]\n  };\n\n  let result = await post(\"/invoice?sendToCustomer=false\", payload);\n\n  // Bank account repair if needed\n  if (!result.ok && result.status === 422) {\n    const errMsg = JSON.stringify(result.body);\n    if (errMsg.includes(\"bankkontonummer\") || errMsg.includes(\"bank account\")) {\n      console.log(\"Bank account repair needed...\");\n      const acctResp = await get(\"/ledger/account?isBankAccount=true&fields=*\");\n      const invoiceAcct = acctResp.values?.find((a: any) => a.isInvoiceAccount) || acctResp.values?.[0];\n      if (!invoiceAcct) throw new Error(\"No bank account found\");\n      console.log(\"Updating account:\", invoiceAcct.id, invoiceAcct.number);\n      await put(`/ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: \"12345678903\" });\n      // Retry\n      result = await post(\"/invoice?sendToCustomer=false\", payload);\n    }\n  }\n\n  if (!result.ok) throw new Error(`POST /invoice failed: ${result.status} ${JSON.stringify(result.body)}`);\n\n  const inv = result.body.value;\n  console.log(\"\\nInvoice created:\");\n  console.log(\"  id:\", inv.id);\n  console.log(\"  invoiceNumber:\", inv.invoiceNumber);\n  console.log(\"  amountExcludingVatCurrency:\", inv.amountExcludingVatCurrency);\n  console.log(\"  amountCurrency:\", inv.amountCurrency);\n  console.log(\"  amountExcludingVat:\", inv.amountExcludingVat);\n  console.log(\"  amount:\", inv.amount);\n}\n\nmain().catch(e => { console.error(e); process.exit(1); });\n"
}
```

## 2026-03-21T20:08:56.256Z tool_result
tool: Write
call_id: toolu_vrtx_01JR3Xzr7LSbekeDCRnWY2g8

```text
File created successfully at: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-200802913Z-74f063b0/scripts/create-invoice.ts
```

## 2026-03-21T20:09:02.186Z tool_call
tool: Bash
call_id: toolu_vrtx_019ZufUdy7yGpnHgUeTV6B5m

```json
{
  "command": "cd /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-200802913Z-74f063b0/scripts && bun run create-invoice.ts 2>&1",
  "description": "Run create-invoice script",
  "timeout": 30000
}
```

## 2026-03-21T20:09:07.790Z tool_result
tool: Bash
call_id: toolu_vrtx_019ZufUdy7yGpnHgUeTV6B5m

```text
Customer: 108326495 Sierra SL
Products found: 3
Product 8344: 84411316 Desarrollo de sistemas vatType.id: 3
Product 9563: 84411317 Horas de consultoría vatType.id: 31
Product 8060: 84411319 Informe de análisis vatType.id: 6

Invoice created:
  id: 2147633010
  invoiceNumber: 2
  amountExcludingVatCurrency: 45050
  amountCurrency: 51362.5
  amountExcludingVat: 45050
  amount: 51362.5
```

## 2026-03-21T20:09:12.486Z assistant_message
Invoice created successfully in 3 API calls:

- **Customer**: Sierra SL (id 108326495)
- **Products**: 8344 (vatType 3 = 25%), 9563 (vatType 31 = 15%), 8060 (vatType 6 = 0%)
- **Invoice #2** (id 2147633010)
  - amountExcludingVat: 45050 NOK (19250 + 10000 + 15800)
  - amountIncludingVat: 51362.5 NOK (19250×1.25 + 10000×1.15 + 15800×1.0 = 24062.5 + 11500 + 15800)
