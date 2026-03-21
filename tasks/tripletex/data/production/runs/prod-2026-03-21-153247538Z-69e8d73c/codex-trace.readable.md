# Claude Trace Snapshot

- provider: claude
- session_id: 1c733908-1ec7-4fdf-9d82-a8f61649fe10
- session_file: /home/jorge/.claude/projects/-home-jorge-repos-ainm-tasks-tripletex-codex-environment/1c733908-1ec7-4fdf-9d82-a8f61649fe10.jsonl
- completed: false
- assistant_messages: 0
- tool_calls: 5
- tool_results: 5

## 2026-03-21T15:32:49.336Z user_message
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
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-153247538Z-69e8d73c/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Create an invoice for the customer Ridgepoint Ltd (org no. 970844708) with three product lines: Software License (3957) at 3650 NOK with 25% VAT, Maintenance (8149) at 11000 NOK with 15% VAT (food), and Web Design (8092) at 17700 NOK with 0% VAT (exempt).

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
ednfKnO0T1YtUhc7IXWBoCV_K8jx4tl2beYRpTJWTdU

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-153247538Z-69e8d73c/scripts

Runner configuration:
- provider: claude
- model: claude-opus-4-6
- effort: high
- backend: proxy
- proxy_base_url: https://europe-west1-ai-nm26osl-1706.cloudfunctions.net/claude-proxy
- disable_experimental_betas: false

## 2026-03-21T15:32:56.847Z tool_call
tool: Read
call_id: toolu_vrtx_01TL1pKqKi3xpPTfbZ74J1Qi

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md"
}
```

## 2026-03-21T15:32:56.851Z tool_call
tool: Glob
call_id: toolu_vrtx_014t1HKSzaCbJtD6AUUTxe3X

```json
{
  "pattern": "trusted-standards/**/*invoice*",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-21T15:32:56.852Z tool_call
tool: Glob
call_id: toolu_vrtx_01RmFswuQ2D6EePBXRvPgxtE

```json
{
  "pattern": "task-playbooks/**/*invoice*",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-21T15:32:56.859Z tool_result
tool: Glob
call_id: toolu_vrtx_014t1HKSzaCbJtD6AUUTxe3X

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-order-invoice-and-register-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-and-send-customer-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-foreign-currency-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice-credit-note.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/reverse-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-project-hours-and-create-project-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md
```

## 2026-03-21T15:32:56.862Z tool_result
tool: Glob
call_id: toolu_vrtx_01RmFswuQ2D6EePBXRvPgxtE

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-order-invoice-and-register-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-and-send-customer-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-foreign-currency-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer-invoice-credit-note.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/reconcile-bank-statement-open-invoices.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/reverse-customer-invoice-payment.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-project-hours-and-create-project-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md
```

## 2026-03-21T15:33:07.461Z tool_result
tool: Read
call_id: toolu_vrtx_01TL1pKqKi3xpPTfbZ74J1Qi

```text
File content (27703 tokens) exceeds maximum allowed tokens (25000). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.
```

## 2026-03-21T15:33:11.840Z tool_call
tool: Read
call_id: toolu_vrtx_016To3736Wajo55HUFSxFVQv

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice.md"
}
```

## 2026-03-21T15:33:11.860Z tool_call
tool: Read
call_id: toolu_vrtx_01VpX4wBchJuBZ7XppadXNsJ

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md",
  "offset": 1,
  "limit": 100
}
```

## 2026-03-21T15:33:11.874Z tool_result
tool: Read
call_id: toolu_vrtx_016To3736Wajo55HUFSxFVQv

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
    23→   - if the prompt clearly gives exact product numbers, prefer one decisive `GET /product?productNumber=<a>&productNumber=<b>...&fields=*`
    24→   - if the prompt gives exact product names plus numeric refs that are not explicitly guaranteed Tripletex product numbers, prefer one decisive `GET /product?count=1000&fields=*` and local exact filtering by product `number` and/or product `name`
    25→   - only fall back from the direct numeric query or catalog read to the next resolver if the earlier read is ambiguous, truncated for the account, or the prompt lacks exact product names
    26→   - only spend `GET /product?ids=...` if the earlier resolver still leaves the products unresolved
    27→   - if you do start with a speculative product-number resolver and it returns an incomplete subset, keep the broader product-catalog fallback inside the same script and reuse the already-resolved customer instead of restarting the whole flow
    28→3. for product-linked create-only prompts, treat the resolved product VAT as the default line VAT
    29→   - if the product read already returns a reusable `product.vatType.id`, either reuse that same id on the line or omit explicit line `vatType` and inherit from the product
    30→   - only resolve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*` when the task must force a VAT different from the resolved product, the product read lacks even a reusable `vatType.id`, or the line is not product-linked
    31→4. `POST /invoice?sendToCustomer=false`
    32→5. only if the write response omits decisive totals or later logic truly needs readback-only line details, do one immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
    33→6. stop
    34→
    35→## Payload Rules
    36→- include:
    37→  - `invoiceDate`
    38→  - `invoiceDueDate`
    39→  - `customer: { "id": ... }`
    40→  - lines under `orders[].orderLines`
    41→- do not create lines under read-only `invoice.orderLines`
    42→- for product-linked lines, prefer `product: { "id": ... }`
    43→- do not send unless prompt explicitly asks
    44→- do not hardcode output VAT code `3`
    45→- if `GET /product?fields=*` returns `vatType` as `id`/`url`, that id is still reusable for an exact existing-product create-only invoice
    46→- if the resolved product already carries the intended VAT, you may omit explicit line `vatType` and inherit from the product
    47→- if you want the payload to pin the same VAT explicitly without a separate VAT lookup, reuse the resolved `product.vatType.id`
    48→- if the filtered outgoing VAT read shows a mismatch and the desired percentage exists, force that line with `vatType: { "id": ... }`
    49→
    50→## Reuse From Write Response
    51→- `value.id`
    52→- `value.invoiceNumber`
    53→- totals from invoice write response
    54→- sparse line objects still prove line count, not full line details
    55→- if the payload already fixed `product`, `description`, `count`, `unitPriceExcludingVatCurrency`, and explicit line `vatType`, and the write response returns decisive totals (`amountExcludingVatCurrency` / `amountCurrency`), that is enough to stop on a create-only task
    56→
    57→## Verification
    58→- default verification is zero extra calls if invoice totals/existence are enough
    59→- sparse `orderLines` alone are not a reason to fetch the invoice again when the payload already fixed the line data and the write response totals match the intended VAT mix
    60→- use one immediate expanded `GET /invoice/{id}` only when exact scored line details still need proof or the write response is too thin to prove the financial outcome
    61→
    62→## Known Recovery Branches
    63→- if the first attempted API call returns `403` with body `{"error":"Invalid or expired token"}`, stop; the run is blocked by unusable credentials, not by invoice-flow uncertainty
    64→- if invoice creation fails with missing company bank account:
    65→  - `GET /ledger/account?isBankAccount=true&fields=*`
    66→  - update existing invoice account with `PUT /ledger/account/{id}`
    67→  - retry invoice write once
    68→  - keep the same invoice payload on that retry; do not re-read customer, products, or `vatType` after a bank-account-only validation failure
    69→- if the one-shot product catalog read is ambiguous or incomplete, use the documented numeric recovery chain instead of guessing from approximate matches
    70→- if a speculative `GET /product?productNumber=...` returns only a partial subset on a name-rich prompt, do the broader catalog fallback in the same script; do not re-read the customer or rerun the whole flow from the top
    71→
    72→## OpenAPI / Sandbox Status
    73→- `/invoice`, `/ledger/account`, and related invoice family endpoints verified in `./openapi.json`
    74→- flow and bank-account repair proven in sandbox/playbooks
    75→- later 2026-03-20 post-run reduction showed that the older 4-call exact-product-number path should not be treated as the floor for standard create-only existing-product invoices; exact-product-number prompts can be lower-call when the resolved products already carry reusable `vatType.id`
    76→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=925760838` with products labeled `(3644)`, `(4934)`, `(8806)` plus exact names showed that two numeric product-resolver reads were wasted before a later catalog read settled the products; the lower-call replacement for that shape is one decisive `GET /product?count=1000&fields=*` with local exact filtering by `number` and/or `name`
    77→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=909722500` with lines `Analysis Report (9796)`, `Maintenance (2145)`, and `System Development (5995)` plus VAT `25%` / `15%` / `0%` showed that one speculative `GET /product?productNumber=9796&productNumber=2145&productNumber=5995&fields=*` was wasted before the later catalog read settled the products; the lower-call replacement in that same fresh-account state is `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
    78→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=851635874` with lines `Analyserapport (2934)`, `Datarådgivning (8699)`, and `Nettverkstjeneste (1355)` plus VAT `25%` / `15%` / `0%` showed that a speculative `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*` did not resolve all lines, and the run only succeeded after a broader catalog fallback on exact names; the lower-call replacement for that shape is one decisive `GET /product?count=1000&fields=*`, then `GET /ledger/vatType`, then `POST /invoice?sendToCustomer=false`
    79→- the same `851635874` run also showed a control-flow inefficiency: the product-fallback logic happened only after the first script aborted, which forced a duplicate customer read on the second script run; next time keep the fallback as an in-script callback/branch and reuse the first successful customer resolution
    80→- re-verified on 2026-03-20 in persistent sandbox that `GET /product?productNumber=...&fields=*` can return `vatType` only as a link object (`id`/`url`), so explicit-VAT prompts may still need one filtered outgoing `vatType` lookup before the invoice write
    81→- re-verified on 2026-03-20 in persistent sandbox that `POST /invoice?sendToCustomer=false` can return sparse `orderLines` while still returning decisive totals; when the create payload already fixes the scored line fields, that write response is enough for the minimal create-only path
    82→- re-verified on 2026-03-20 in persistent sandbox with the exact customer/product-number shape `827304212` + `6744/2584/3739` that the proof path is still `GET /customer` -> `GET /product?productNumber=...` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false`; that sandbox account exposed only outgoing VAT `0%`, so the exact mixed `25%` / `15%` / `0%` write could not be replayed there and only a 0%-analog invoice could be proven in-account
    83→- re-verified again on 2026-03-20 in persistent sandbox with a disposable analog that exact-name product resolution plus `GET /ledger/vatType` plus `POST /invoice?sendToCustomer=false` completes the proof path in four calls after setup; that sandbox account still exposed only `0%` outgoing VAT, so mixed `25%` / `15%` / `0%` could not be replayed there
    84→- re-verified again on 2026-03-20 in persistent sandbox with a prompt-like analog for the `909722500` Oakwood task shape: after setup, a four-call proof path `GET /customer?organizationNumber=909722502&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false` resolved sandbox products whose stored numbers intentionally differed from prompt-like refs `9796`, `2145`, and `5995`; the created invoice returned `amountExcludingVatCurrency=47450` and `amountCurrency=47450`, and the sandbox still exposed only `0%` outgoing VAT
    85→- re-verified again on 2026-03-20 in persistent sandbox with an analog customer and exact-name products whose stored product numbers intentionally differed from prompt-like refs `2934` / `8699` / `1355`; after setup, the winning proof path was exactly `GET /customer?organizationNumber=851635875&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`, and the created invoice returned `amountExcludingVatCurrency=53050` and `amountCurrency=53050`
    86→- production feedback on 2026-03-20 for the exact prompt shape `customer.organizationNumber=861379760` with exact product numbers `2109`, `1175`, `9974` and VAT mix `25%` / `15%` / `0%` confirmed that the successful 4-call path still was not efficiency-optimal; the lower-call replacement for that exact shape is `GET /customer?organizationNumber=...&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false`, reusing each resolved product's `vatType.id` or inheriting VAT from the product
    87→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=977448239` with `Konsulenttimer (6390)`, `Systemutvikling (1652)`, and `Webdesign (3273)` plus VAT `25%` / `15%` / `0%` showed that the created invoice was correct but not minimal-call because it spent `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` before the first invoice write
    88→- that same run then hit the known missing-company-bank-account validation on the first `POST /invoice`, so the realistic lower-call replacement in that exact fresh-account state is `GET /customer?organizationNumber=977448239&fields=*` -> `GET /product?productNumber=6390&productNumber=1652&productNumber=3273&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> single retry of the same invoice write
    89→- exhaustive persistent-sandbox reduction on 2026-03-20 with the same customer/product-number analog `861379760` + `2109/1175/9974` proved the floor for the exact-number existing-product branch:
    90→  - `GET /customer?organizationNumber=861379760&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false` with `product.id` and no explicit line `vatType` succeeded and preserved linked product numbers on readback
    91→  - the same 3-call path also succeeded when each line explicitly reused the resolved `product.vatType.id`
    92→  - the tempting 2-call shortcut `GET /customer` -> `POST /invoice` with `product.number` did create an invoice, but readback showed `product=null` on all lines, so it is not a valid existing-product replacement path
    93→  - the tempting 2-call shortcut `GET /product` -> `POST /invoice` with inline `customer { name, organizationNumber }` failed with `422` because the related order still required `customer.id`
    94→  - that sandbox account still exposed only outgoing VAT `0%`, so the mixed `25%` / `15%` / `0%` combination itself could not be replayed there; the proof is about the lower-call resolver/write path, not the mixed-rate availability of that account
    95→- persistent-sandbox re-proof on 2026-03-20 with a disposable exact-number analog `customer.organizationNumber=977448240` and products `96390`, `91652`, `93273` re-confirmed the same lower-call branch after setup:
    96→  - proof path itself was `GET /customer?organizationNumber=977448240&fields=*` -> `GET /product?productNumber=96390&productNumber=91652&productNumber=93273&fields=*` -> `POST /invoice?sendToCustomer=false`
    97→  - the immediate documentation readback `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` showed linked product numbers `96390`, `91652`, `93273`
    98→  - that sandbox account still exposed only outgoing VAT `0%`, so the analog proved the no-extra-`/ledger/vatType` exact-number path and linked-product behavior, but not the mixed `25%` / `15%` / `0%` combination itself
    99→
```

## 2026-03-21T15:33:11.878Z tool_result
tool: Read
call_id: toolu_vrtx_01VpX4wBchJuBZ7XppadXNsJ

```text
     1→# Tripletex Task Agent Instructions
     2→
     3→## Mission
     4→- Perform the exact requested side effects in Tripletex.
     5→- Optimize for score, not explanation.
     6→- Correctness first. Efficiency second.
     7→- Task is complete only when final Tripletex state is correct.
     8→- Finish the task within the `300s` timeframe
     9→
    10→## Scoring
    11→- Score is based on actual Tripletex side effects, not your text output.
    12→- Correctness is normalized field-by-field from the expected output.
    13→- Efficiency bonus applies only at perfect correctness.
    14→- Efficiency bonus depends on:
    15→  - low API call count (Important)
    16→  - few or zero `4xx` errors (Make sure you know the API calls will work before running)
    17→- Avoid trial-and-error. Every unnecessary call and every `4xx` hurts. (Verify the correct API call flow before running, this is MEGA important, this is often where alot of errors pile up)
    18→
    19→## Operating Rules
    20→- Work fully autonomously.
    21→- Do not ask questions.
    22→- Do not talk to the user.
    23→- Do only the requested task. No extra work.
    24→- Do not spend scored-run time on unrelated repo tooling or environment rituals unless the prompt explicitly requires them.
    25→- Ignore generic repo-wide startup rituals such as `br list` during scored Tripletex runs unless the prompt explicitly asks for them.
    26→- Assume a hard `300s` budget. Plan before calling APIs.
    27→- Only interact with the Tripletex API by writing TypeScript and running it with `bun` (Important)
    28→- The prompt provides a run-specific scripts directory.
    29→- Put all API-interaction scripts only in that provided scripts directory.
    30→- Do not place API-interaction scripts anywhere else.
    31→
    32→## Environment Facts
    33→- Real submissions use a fresh Tripletex account.
    34→- Sandbox testing may use a persistent account.
    35→- Prompts may be in `nb`, `en`, `es`, `pt`, `nn`, `de`, or `fr`.
    36→- Files or images may be provided. Read them from disk before acting.
    37→- Extract exact facts from attachments: names, dates, amounts, identifiers, relationships, requested actions.
    38→
    39→## Credentials
    40→The prompt provides:
    41→- `Tripletex API base URL`
    42→- `Tripletex session token`
    43→- `Run scripts directory`
    44→
    45→Authentication:
    46→- Use Basic Auth.
    47→- Username: `0`
    48→- Password: provided session token.
    49→- Always call the provided base URL.
    50→- If the provided base URL already includes `/v2`, do not join endpoint paths with a leading slash in a way that escapes back to the host root; `new URL('/customer', baseUrl)` can silently turn `.../v2` into `/customer` and waste a `404`.
    51→- If the provided base URL ends at `/v2` without a trailing slash, `new URL('supplier', baseUrl)` can also drop the `/v2` segment; either append the slash first or build paths with safe string concatenation such as ``${baseUrl.replace(/\/+$/, "")}/supplier``.
    52→- Never switch to any default Tripletex URL and never look up online ever.
    53→- If the provided base URL is obviously a placeholder or non-routable host such as `example.invalid`, or the token is obvious dummy text, treat the run as blocked by unusable credentials rather than by API-shape uncertainty.
    54→- In that case, do not guess alternate hosts, do not swap in default Tripletex URLs, and do not burn time on extra API attempts or unrelated spec exploration.
    55→- If both the host and token are obviously fake placeholders, it is acceptable to stop after local playbook/spec confirmation without attempting a doomed network call.
    56→- If the first attempted call returns `403` with body `{"error":"Invalid or expired token"}`, treat the run as blocked by unusable credentials; do not spend more calls on alternate endpoints or auth variations.
    57→- Treat the proxy-specific `403` body `{"error":"Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.","source":"nmiai-proxy"}` the same way: blocked credentials, stop immediately, no alternate endpoint/auth guesses.
    58→
    59→## API Reference Strategy
    60→- Knowledge order:
    61→  1. `./trusted-standards/`
    62→  2. `./task-playbooks/`
    63→  3. `./openapi.json`
    64→- Trusted standards are stricter than playbooks.
    65→- Trusted standards are the canonical lowest-call, lowest-error, pre-verified flows for the most common task shapes.
    66→- If the task is an exact or near-exact match for a trusted standard, use that trusted standard first.
    67→- For an exact trusted-standard match, do not spend time re-checking `./openapi.json`.
    68→- For exact trusted-standard matches, the anti-`4xx` rule is satisfied by following the trusted standard itself.
    69→- Only fall back to `./openapi.json` if:
    70→  - no trusted standard matches
    71→  - the prompt materially differs from the trusted standard
    72→  - the trusted standard explicitly tells you to confirm a detail
    73→  - a live API response contradicts the trusted standard
    74→- Use the common endpoints below first.
    75→- These are common endpoints, not the only possible endpoints.
    76→- Always confirm the exact method, path, query parameters, request body, and response shape in `./openapi.json` before calling, except for exact trusted-standard matches.
    77→- Use `./openapi.json` as the full API reference.
    78→- When multiple similarly named schemas exist, trust the schema directly referenced by the chosen endpoint operation, not another nearby/read-only customer-facing schema.
    79→- Do not guess endpoint shapes, field names, request payloads, or delete/update paths, always verify.
    80→- For exact-match playbook tasks, inspect `openapi.json` with narrow endpoint/schema extraction.
    81→- Do not run broad keyword searches across the whole spec for common fields like `name`, `email`, or `organizationNumber` when the playbook already identifies the exact endpoint.
    82→
    83→## Trusted Standards
    84→- Before acting, check whether the task matches a trusted standard in `./trusted-standards/`
    85→- If it matches exactly, execute the trusted standard directly
    86→- For exact trusted-standard matches, do not double-check or triple-check `./openapi.json`; doing so wastes time and hurts score
    87→- Trusted standards are intended to be safer than ad hoc spec-reading for their exact task shape
    88→- If a trusted standard is incomplete, wrong, or no longer optimal, fix it during post-run reflection
    89→
    90→| Task pattern | Trusted standard |
    91→|---|---|
    92→| Canonical common endpoints | `./trusted-standards/common-endpoints.md` |
    93→| Create customer | `./trusted-standards/create-customer.md` |
    94→| Create supplier | `./trusted-standards/create-supplier.md` |
    95→| Create department | `./trusted-standards/create-department.md` |
    96→| Create product | `./trusted-standards/create-product.md` |
    97→| Create project | `./trusted-standards/create-project.md` |
    98→| Create project activity with budget | `./trusted-standards/create-project-activity-with-budget.md` |
    99→| Analyze expense increase and create internal projects | `./trusted-standards/analyze-expense-increase-create-internal-projects.md` |
   100→| Onboard employee | `./trusted-standards/onboard-employee.md` |
```
