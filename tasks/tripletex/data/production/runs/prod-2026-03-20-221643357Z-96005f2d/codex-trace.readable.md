# Codex Trace Snapshot

- session_id: 019d0d52-85eb-7212-bf73-cf073a93ec55
- session_file: /home/jorge/.codex/sessions/2026/03/20/rollout-2026-03-20T23-16-45-019d0d52-85eb-7212-bf73-cf073a93ec55.jsonl
- completed: true
- assistant_messages: 6
- tool_calls: 11
- tool_results: 11

## 2026-03-20T22:16:46.300Z task_event
event: task_started

## 2026-03-20T22:16:46.310Z user_message
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
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Opprett en faktura til kunden Havbris AS (org.nr 977448239) med tre produktlinjer: Konsulenttimer (6390) til 2850 kr med 25 % MVA, Systemutvikling (1652) til 2650 kr med 15 % MVA (næringsmiddel), og Webdesign (3273) til 7400 kr med 0 % MVA (avgiftsfri).

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
C-QB1MpRfrM1VivNmsIuPr64jATLnvhHRJ_GldDG4Ns

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts

## 2026-03-20T22:16:55.288Z assistant_message
phase: commentary

Leser relevant trusted standard/playbook og bygger minimal API-flyt før noen kall. Deretter skriver jeg ett bun-script i angitt run-dir og kjører det.

## 2026-03-20T22:16:55.291Z tool_call
tool: exec_command
call_id: call_hZ2QHN9SCuu9qQhxLPbXLfya

```json
{
  "cmd": "rg --files trusted-standards task-playbooks | rg 'create-customer-invoice|common-endpoints|invoice'",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "max_output_tokens": 4000,
  "yield_time_ms": 1000
}
```

## 2026-03-20T22:16:55.292Z tool_call
tool: exec_command
call_id: call_VEPsYCTt0ybsHmYxJyHZaKpp

```json
{
  "cmd": "pwd",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "max_output_tokens": 1000,
  "yield_time_ms": 1000
}
```

## 2026-03-20T22:16:55.354Z tool_result
tool: exec_command
call_id: call_hZ2QHN9SCuu9qQhxLPbXLfya

```text
Command: /run/current-system/sw/bin/zsh -lc "rg --files trusted-standards task-playbooks | rg 'create-customer-invoice|common-endpoints|invoice'"
Chunk ID: 7d7a4d
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 263
Output:
task-playbooks/reverse-customer-invoice-payment.md
task-playbooks/register-supplier-invoice.md
task-playbooks/create-customer-invoice.md
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md
task-playbooks/create-order-invoice-and-register-payment.md
task-playbooks/create-customer-invoice-credit-note.md
task-playbooks/register-project-hours-and-create-project-invoice.md
task-playbooks/register-customer-invoice-payment.md
task-playbooks/create-and-send-customer-invoice.md
trusted-standards/reverse-customer-invoice-payment.md
trusted-standards/register-supplier-invoice.md
trusted-standards/create-customer-invoice.md
trusted-standards/common-endpoints.md
trusted-standards/create-order-invoice-and-register-payment.md
trusted-standards/create-customer-invoice-credit-note.md
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md
trusted-standards/register-customer-invoice-payment.md
trusted-standards/create-and-send-customer-invoice.md
trusted-standards/register-project-hours-and-create-project-invoice.md

```

## 2026-03-20T22:16:55.357Z tool_result
tool: exec_command
call_id: call_VEPsYCTt0ybsHmYxJyHZaKpp

```text
Command: /run/current-system/sw/bin/zsh -lc pwd
Chunk ID: 46e0b3
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 15
Output:
/home/jorge/repos/ainm/tasks/tripletex/codex-environment

```

## 2026-03-20T22:17:00.216Z tool_call
tool: exec_command
call_id: call_vHVrxM87dToocayseRD4z8jg

```json
{
  "cmd": "sed -n '1,220p' trusted-standards/create-customer-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "max_output_tokens": 5000,
  "yield_time_ms": 1000
}
```

## 2026-03-20T22:17:00.217Z tool_call
tool: exec_command
call_id: call_LUSx15bUbTEBtOk7Q1yYaMt5

```json
{
  "cmd": "sed -n '1,260p' task-playbooks/create-customer-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "max_output_tokens": 7000,
  "yield_time_ms": 1000
}
```

## 2026-03-20T22:17:00.253Z tool_result
tool: exec_command
call_id: call_vHVrxM87dToocayseRD4z8jg

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,220p' trusted-standards/create-customer-invoice.md"
Chunk ID: a7f9dd
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 2966
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
- exhaustive persistent-sandbox reduction on 2026-03-20 with the same customer/product-number analog `861379760` + `2109/1175/9974` proved the floor for the exact-number existing-product branch:
  - `GET /customer?organizationNumber=861379760&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false` with `product.id` and no explicit line `vatType` succeeded and preserved linked product numbers on readback
  - the same 3-call path also succeeded when each line explicitly reused the resolved `product.vatType.id`
  - the tempting 2-call shortcut `GET /customer` -> `POST /invoice` with `product.number` did create an invoice, but readback showed `product=null` on all lines, so it is not a valid existing-product replacement path
  - the tempting 2-call shortcut `GET /product` -> `POST /invoice` with inline `customer { name, organizationNumber }` failed with `422` because the related order still required `customer.id`
  - that sandbox account still exposed only outgoing VAT `0%`, so the mixed `25%` / `15%` / `0%` combination itself could not be replayed there; the proof is about the lower-call resolver/write path, not the mixed-rate availability of that account

```

## 2026-03-20T22:17:00.268Z tool_result
tool: exec_command
call_id: call_LUSx15bUbTEBtOk7Q1yYaMt5

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,260p' task-playbooks/create-customer-invoice.md"
Chunk ID: dc46a2
Wall time: 0.0001 seconds
Process exited with code 0
Original token count: 6122
Output:
# Create Customer Invoice

## Scope

Use for tasks like:
- create one outgoing customer invoice
- do not send the invoice unless the prompt explicitly asks for sending
- the customer already exists and is usually identified by organization number
- the lines may use existing products identified by numeric refs in parentheses
- the prompt gives line descriptions, prices, and sometimes exact VAT rates

Do not use for:
- send-after-create tasks where the sending step is part of the prompt
- order-then-invoice tasks that explicitly require a separate `POST /order` flow
- invoice-payment tasks

## Verified Findings

- later 2026-03-20 reduction work showed that the older 4-call exact-product-number branch should not be treated as the floor for standard create-only existing-product invoices; when the resolved products already carry reusable `vatType.id`, the `/ledger/vatType` read is often unnecessary
- production feedback on 2026-03-20 for the exact prompt shape `customer.organizationNumber=861379760`, products `2109`, `1175`, `9974`, names `Mantenimiento`, `Horas de consultoría`, `Informe de análisis`, VAT `25%` / `15%` / `0%` showed:
  - the created invoice was fully correct, but the winning write path was still not efficiency-optimal because it spent `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
  - the lower-call replacement for that exact task shape is `GET /customer?organizationNumber=861379760&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false`
  - on that lower-call replacement, use `product: { id }` on each line and either reuse the resolved `product.vatType.id` explicitly or let the product VAT inherit; do not spend `/ledger/vatType` just because the prompt text repeats the VAT percentages
- the production run for this exact task on 2026-03-20 stopped on the first call:
  - `GET /customer?organizationNumber=919172657&fields=*` returned `403 {"error":"Invalid or expired token"}`
  - that was a credential block, not an invoice-flow failure, so no further production API calls were justified
- follow-up reflection on the successful production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=925760838`, product labels `(3644)`, `(4934)`, `(8806)`, names `Maintenance`, `Licence logicielle`, `Service réseau`) showed:
  - the run succeeded, but it spent two extra product-resolution reads before a later `GET /product?count=1000&fields=*` settled the products
  - because the prompt already gave exact product names, the lower-call resolver for that exact shape should have been one decisive catalog read with local exact filtering by product `number` and/or exact product `name`, not `GET /product?productNumber=...` followed by `GET /product?ids=...`
  - the same run also hit the known missing-company-bank-account validation on the first invoice write, so the realistic minimal successful production path for that account state was seven API calls: `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
- reflection on the successful production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=909722500`, product lines `Analysis Report (9796)`, `Maintenance (2145)`, `System Development (5995)`, VAT `25%` / `15%` / `0%`) showed:
  - the run reached the correct final invoice state, but it was not minimal-call
  - one speculative `GET /product?productNumber=9796&productNumber=2145&productNumber=5995&fields=*` was wasted before a broader `GET /product?count=1000&fields=*` settled the products by exact-name filtering
  - the same run also hit the known missing-company-bank-account validation on the first invoice write, so the realistic minimal successful production path for that exact account state was seven API calls: `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
- reflection on the production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=851635874`, product labels `(2934)`, `(8699)`, `(1355)`, names `Analyserapport`, `Datarådgivning`, `Nettverkstjeneste`, VAT `25%` / `15%` / `0%`) showed:
  - correctness was fine, but the run lost the efficiency point because it used a speculative `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*` before a later broader catalog read settled the products
  - the script then aborted on that partial resolver result and restarted the whole flow, which duplicated the already-successful customer read; that control-flow mistake is exactly the kind of avoidable non-minimal behavior that should stay inside one in-script callback/fallback branch instead
  - the lower-call replacement for that exact task shape is `GET /customer?organizationNumber=851635874&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
- the original production run on 2026-03-20 succeeded with:
  - `GET /customer?organizationNumber=...&fields=*`
  - an initial `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` returned only a partial subset, so the script had to continue through the documented fallback chain instead of stopping
  - `POST /invoice?sendToCustomer=false`
  - the first invoice write hit the known bank-account validation and succeeded only after the documented `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` repair -> single retry branch
- persistent-sandbox verification on 2026-03-20 showed:
  - `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` can return all requested products when the refs are real product numbers
  - `GET /product?productNumber=<a>&productNumber=<b>&productNumber=<c>&fields=*` can still return each product `vatType` only as a sparse link object (`id`/`url`), not with `percentage`
  - for exact existing-product create-only invoices, that sparse `vatType` link can still be reusable: the returned `product.vatType.id` can be copied onto the line, or the line can inherit VAT from the resolved product, without spending `GET /ledger/vatType`
  - reserve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` for direct-line invoices, ambiguous product VAT, or cases where the task must override the resolved product VAT
  - an existing-customer, existing-product invoice can be created directly with `POST /invoice?sendToCustomer=false` using `orderLines[].product = { "id": ... }`
  - the `POST /invoice` response returned `orderLines` only as sparse link objects with keys `id` and `url`, even though `orderLines.length` matched the requested line count and the response still included decisive totals
  - one immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` returned the exact product numbers, descriptions, unit prices, and VAT data for the created lines
  - a clean existing-customer plus existing-product proof path was re-proven in exactly three calls for the create-only path: `GET /customer` -> `GET /product` -> `POST /invoice?sendToCustomer=false`
  - the same shape stayed at four calls only when an immediate `GET /invoice/{id}` was intentionally added for documentation-grade readback proof
- exhaustive persistent-sandbox reduction on 2026-03-20 with the exact analog customer/product numbers `861379760` + `2109/1175/9974` showed:
  - `GET /customer?organizationNumber=861379760&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false` with `product.id` and no explicit line `vatType` succeeded and preserved linked product numbers on readback
  - the same 3-call path also succeeded when each line explicitly reused the resolved `product.vatType.id`
  - the tempting 2-call shortcut `GET /customer` -> `POST /invoice` with `product.number` created unlinked direct lines (`product=null` on readback), so it is not a valid existing-product shortcut
  - the tempting 2-call shortcut `GET /product` -> `POST /invoice` with inline `customer { name, organizationNumber }` failed with `422` because the related order still required `customer.id`
- persistent-sandbox verification on 2026-03-20 with the exact identifiers from this task shape (`customer.organizationNumber=827304212`, products `6744`, `2584`, `3739`) showed:
  - `GET /customer?organizationNumber=827304212&fields=*` resolved the customer in one call
  - `GET /product?productNumber=6744&productNumber=2584&productNumber=3739&fields=*` resolved all three exact-number products in one call and again returned each product `vatType` only as an `id`/`url` link
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` exposed only VAT code `6` (`0%`) in that sandbox account, so the exact mixed `25%` / `15%` / `0%` task could not be replayed there
  - after sandbox-only setup of exact-number analog products, the same four-call proof path (`GET /customer` -> `GET /product?productNumber=...` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false`) succeeded and returned a sparse-write-response invoice with `amountExcludingVatCurrency=52600`, `amountCurrency=52600`, and three link-only `orderLines`
- additional persistent-sandbox post-run verification on 2026-03-20 with the exact identifiers from this task shape (`customer.organizationNumber=919172657`, products `4783`, `3343`, `4380`) showed:
  - after sandbox setup, `GET /customer?organizationNumber=919172657&fields=*` resolved the customer in one call
  - `GET /product?productNumber=4783&productNumber=3343&productNumber=4380&fields=*` resolved all three products in one call and again returned each product `vatType` only as an `id`/`url` link
  - `POST /invoice?sendToCustomer=false` returned sparse `orderLines` but also returned decisive totals (`amountExcludingVatCurrency=54700`, `amountCurrency=54700`) for the create-only 0% proof invoice
  - the follow-up `GET /invoice/{id}` was useful for documentation proof, but was not required for the minimum create-only path because the payload had already fixed the line fields and the write response totals already proved the financial outcome
- sandbox constraint on 2026-03-20:
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
  - additional spot checks on 2022-03-20, 2023-03-20, 2024-03-20, 2025-03-20, and 2026-03-19 still returned only VAT code `6`
  - therefore exact mixed `25%` / `15%` / `0%` VAT could not be replayed in that sandbox account, but the product-linked invoice path, sparse write-response trap, and lower-call no-extra-read create path were proven
- persistent-sandbox follow-up on 2026-03-20 with a disposable analog for this exact prompt shape proved the lower-call product resolver directly:
  - setup used products with the exact prompt names but intentionally different stored product numbers, so the parenthetical refs were not usable Tripletex lookup keys
  - after setup, the proof path itself was exactly four calls: `GET /customer?organizationNumber=925760838&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
  - the proof invoice succeeded with `amountExcludingVatCurrency=33950` and `amountCurrency=33950`
  - because that sandbox account still exposed only `0%` outgoing VAT, the analog proved the product-resolution and create-only-path lesson, but not the mixed `25%` / `15%` / `0%` VAT combination itself
- persistent-sandbox follow-up on 2026-03-20 with a prompt-like analog for the `909722500` Oakwood task shape showed:
  - setup used analog customer `organizationNumber=909722502` and products whose exact names preserved the same line structure while the stored product numbers intentionally differed from prompt-like refs `9796`, `2145`, and `5995`
  - after setup, the proof path itself was exactly four calls: `GET /customer?organizationNumber=909722502&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
  - the proof invoice succeeded with `amountExcludingVatCurrency=47450` and `amountCurrency=47450`
  - because the sandbox still exposed only `0%` outgoing VAT, the analog proved the product-resolution and create-only-path lesson for this task shape, but not the exact mixed `25%` / `15%` / `0%` VAT combination itself
- persistent-sandbox follow-up on 2026-03-20 with a disposable analog for the `851635874` task shape proved the callback/fallback lesson directly:
  - setup used an analog customer `organizationNumber=851635875` and exact-name products whose stored product numbers were intentionally different from prompt-like refs `2934`, `8699`, and `1355`
  - after setup, the winning proof path itself was exactly four calls: `GET /customer?organizationNumber=851635875&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`
  - that proof invoice succeeded with `amountExcludingVatCurrency=53050` and `amountCurrency=53050`
  - because the sandbox still exposed only `0%` outgoing VAT, this analog proved the product-resolution and single-script callback/fallback lesson, but not the exact mixed `25%` / `15%` / `0%` VAT combination itself

## Minimal Flow

1. Confirm these operations in `./openapi.json`
   - `GET /customer`
   - `GET /product`
   - `POST /invoice`
   - `GET /invoice/{id}`
   - if exact invoice-line VAT must be forced rather than inherited from the resolved products, also confirm `GET /ledger/vatType`
2. Resolve the customer
   - usually `GET /customer?organizationNumber=...&fields=*`
3. Resolve any existing products referenced by numeric prompt refs
   - if the prompt clearly gives exact product numbers, start with one decisive `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
   - if the prompt also gives exact product names and the numeric refs are not explicitly guaranteed Tripletex product numbers, start instead with one decisive `GET /product?count=1000&fields=*` and filter locally by exact product `number` and/or exact product `name`
   - only if the first resolver is ambiguous, truncated for the account, or the prompt lacks exact product names, continue to the next resolver
   - only if those earlier reads still do not uniquely resolve them, use one fallback `GET /product?ids=<ref>,<ref>&fields=*`
   - do not let a partial first resolver terminate the script and force a full rerun; keep the broader catalog fallback in the same script/callback chain so the customer read is not duplicated
4. If the prompt gives exact VAT rates, inspect how much VAT detail the product read actually returned
   - for exact existing-product create-only prompts, a sparse `product.vatType` link is still enough to keep the low-call branch: reuse `product.vatType.id` directly or omit explicit line `vatType` and inherit from the product
   - only if the task must force VAT independently of the resolved product, or the product read lacks even a reusable `vatType.id`, do one filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
   - do not spend `/ledger/vatType` just because the prompt text repeats VAT percentages that are already implied by the exact resolved products
5. Create the invoice directly
   - `POST /invoice?sendToCustomer=false`
   - include `invoiceDate`, `invoiceDueDate`, `customer`
   - create lines under `orders[].orderLines`
   - for product-linked lines, prefer `product: { "id": ... }`, `description`, `count`, and the requested unit price
   - if the filtered outgoing VAT lookup returns a valid id for the prompt percentage, prefer sending explicit line `vatType: { "id": ... }` so the write payload itself fixes the scored VAT field
6. Reuse the invoice write response
   - trust the returned `id`, `invoiceNumber`, and totals
   - if the payload already fixed `product`, `description`, `count`, `unitPriceExcludingVatCurrency`, and any needed explicit line `vatType`, and the write response already proves the totals, stop
7. If exact line-level verification is needed and the write response is sparse, do one immediate read
   - `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
   - treat the response as sparse not only when `orderLines` is empty, but also when the entries are link-only objects without `product.number`, `description`, `unitPriceExcludingVatCurrency`, and `vatType.percentage`
   - do not add this read merely because the write response kept `orderLines` sparse if the write response totals already prove the intended create-only financial outcome
8. Only if `POST /invoice` fails with the company-bank-account validation, repair that prerequisite and retry once

## Exact-Match Fast Path

- For a prompt that:
  - identifies an existing customer by organization number
  - identifies existing products by exact product numbers
  - asks only to create the invoice, not send it
  - gives explicit VAT percentages that must be respected
- the winning path is usually:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
  3. `POST /invoice?sendToCustomer=false`
  - on that write, use `product: { id }` and either:
    - explicit `vatType: { id: product.vatType.id }` copied from the resolved product read, or
    - no explicit line `vatType`, letting the invoice line inherit VAT from the resolved product
  - stop there if the write response totals match the intended line prices and VAT mix
  - only add `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*` when the task must override the resolved product VAT or the product read lacks reusable `vatType.id`
- For a prompt that:
  - identifies an existing customer by organization number
  - identifies existing products by exact names plus ambiguous numeric refs in parentheses
  - asks only to create the invoice, not send it
  - does not force an extra VAT confirmation step beyond what the product read already proves
- the winning path is usually:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?count=1000&fields=*` and local exact filtering by product `number` and/or `name`
  3. `POST /invoice?sendToCustomer=false`
  4. optional immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` only if you still need exact line proof
- For the explicit-VAT variant where `GET /product?fields=*` leaves `vatType` sparse as only `id`/`url`, the safer verified path is usually five calls:
  - the lower-call winning path is usually four calls:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?count=1000&fields=*` and local exact filtering by product `number` and/or `name`
  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
  4. `POST /invoice?sendToCustomer=false`
  - stop there if the write response totals match the intended line prices and VAT mix
  - add a fifth immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` only when exact readback-only line proof is still needed
- For the explicit-VAT variant where `GET /product?fields=*` leaves `vatType` sparse as only `id`/`url`, the documented proof path can still be five calls:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?count=1000&fields=*` and local exact filtering by product `number` and/or `name`
  3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
  4. `POST /invoice?sendToCustomer=false`
  5. immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
- if the catalog read is ambiguous or step 2 still does not uniquely settle the products, then use the documented numeric fallback chain before deciding the refs are unresolved
- if a speculative first product resolver misses one line, do not restart from `GET /customer`; continue in the same script and reuse already-known ids/results
- Do not insert an automatic `GET /ledger/account` before the first invoice write
- Do not call `PUT /invoice/{id}/:send`
- Do not add a delayed verification read in a separate later script/session if you already know you need line-level proof; do the one decisive `GET /invoice/{id}` immediately while the same token is still in use
- Do not treat sparse `orderLines` in the write response as an automatic reason to spend `GET /invoice/{id}`; first check whether the write response totals already prove the outcome

## Invoice Payload Notes

- `invoiceDueDate` is required
- `orders[].deliveryDate` is required
- `invoice.orderLines` is read-only in the schema
- create lines under `orders[].orderLines`

Safe product-linked shape:

```json
{
  "invoiceDate": "2026-03-20",
  "invoiceDueDate": "2026-04-03",
  "customer": { "id": 123 },
  "orders": [
    {
      "customer": { "id": 123 },
      "orderDate": "2026-03-20",
      "deliveryDate": "2026-03-20",
      "orderLines": [
        {
          "product": { "id": 456 },
          "description": "Maintenance",
          "count": 1,
          "unitPriceExcludingVatCurrency": 28100
        }
      ]
    }
  ]
}
```

If you must force a specific VAT code on the line, add:

```json
{
  "vatType": { "id": 3 }
}
```

on that `orderLines[]` item.

## VAT Rules

- Do not hardcode invoice-line `vatType.id = 3`
- For exact existing-product create-only invoices, reusing the resolved `product.vatType.id` is a valid low-call way to keep the line tied to the product VAT
- If the resolved product/account combination already carries the intended VAT safely, the invoice write can also succeed without an explicit line `vatType`
- `GET /product?fields=*` may still expose `vatType` only as `id`/`url`; that is not enough for a percentage proof, but it is still enough to reuse the same product VAT id on the invoice line
- If the task is direct-line, the prompt requires overriding the product VAT, or the product lookup does not return a reusable `vatType.id`, resolve `vatType` from:
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
- Choose from the filtered result for the actual invoice date
- If the resolved product `vatType.id` already maps to the prompt percentage in that filtered result, you can keep the lower-call write shape and omit explicit line `vatType`
- Do not substitute VAT ids from the broader unfiltered catalog when the `OUTGOING` result disagrees or is narrower

## Credential Trap

- If the first attempted API call returns `403` with body `{"error":"Invalid or expired token"}`, stop immediately
- Do not spend follow-up calls on `/product`, `/invoice`, or alternate auth variations
- That response means the run is blocked by unusable credentials, not by uncertainty about the invoice flow

## Sparse Response Trap

- `POST /invoice` can return:

```json
{
  "value": {
    "id": 2147525654,
    "orderLines": [
      { "id": 1, "url": "..." }
    ]
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

```

## 2026-03-20T22:17:17.956Z assistant_message
phase: commentary

Nå henter jeg kun detaljene som trengs for eventuell fallback: produkt-resolver i samme script og bankkonto-reparasjonsgren ved kjent valideringsfeil. Deretter skriver jeg scriptet.

## 2026-03-20T22:17:17.985Z tool_call
tool: exec_command
call_id: call_os9N3AsyzMlDQeXXfa7GFwwo

```json
{
  "cmd": "sed -n '260,420p' task-playbooks/create-customer-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "max_output_tokens": 5000,
  "yield_time_ms": 1000
}
```

## 2026-03-20T22:17:17.985Z tool_call
tool: exec_command
call_id: call_pn5geH7Z0oX90ECM6igmy5qp

```json
{
  "cmd": "sed -n '1,220p' trusted-standards/common-endpoints.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "max_output_tokens": 6000,
  "yield_time_ms": 1000
}
```

## 2026-03-20T22:17:18.001Z tool_result
tool: exec_command
call_id: call_os9N3AsyzMlDQeXXfa7GFwwo

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '260,420p' task-playbooks/create-customer-invoice.md"
Chunk ID: b013be
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 625
Output:
2. choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
3. `PUT /ledger/account/{id}` with:

```json
{
  "bankAccountNumber": "12345678903"
}
```

4. retry `POST /invoice` once

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
- Do not spend both numeric product resolver reads when the prompt already gives exact names and one decisive catalog read would settle the products
- Do not let a partial product-resolver miss abort the script and trigger a second full run; the broader resolver belongs in the same in-script callback/fallback path
- Do not postpone a needed verification read into a later separate script/session
- Do not stop after a partial or ambiguous product resolver result; continue the documented fallback chain in the same script
- Do not keep probing after a first-call `403 {"error":"Invalid or expired token"}`
- Do not spend `GET /invoice/{id}` by reflex after every successful create-only invoice write; reuse the payload plus write-response totals first
- Do not let a local arithmetic/assertion bug after a successful invoice write trigger a retry; re-check the VAT math first

```

## 2026-03-20T22:17:18.005Z tool_result
tool: exec_command
call_id: call_pn5geH7Z0oX90ECM6igmy5qp

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,220p' trusted-standards/common-endpoints.md"
Chunk ID: b8830c
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 4018
Output:
# Common Endpoints

Verified against `./openapi.json`.

Use this as the exact endpoint-shape reference for the most common Tripletex resources.

## Customer
- `/customer`
  - `GET` search
  - `POST` create
- `/customer/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard create prerequisite:
  - none
- Standard fast-path note:
  - for the exact one-customer create shape with prompt-provided `name`, `email`, Norwegian `organizationNumber`, and optionally one ordinary `postalAddress`, the canonical path is one `POST /customer`
  - no `GET /customer` pre-read and no `GET /customer/{id}` follow-up read are part of the trusted fast path
- Standard verification note:
  - `POST /customer` can return a sparse auto-generated `physicalAddress` link object even when the payload only sent `postalAddress`; verify the prompt-scored fields from `value` and do not add a follow-up read just for that link
  - when the prompt includes one ordinary mailing address, `value.postalAddress.addressLine1`, `value.postalAddress.postalCode`, and `value.postalAddress.city` can already prove the scored address fields
  - localized generic email labels such as `Correo` still map to the same `email` payload field; they are not a reason to add `invoiceEmail`

## Department
- `/department`
  - `GET` search
  - `POST` create one
- `/department/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/department/list`
  - `POST` batch create
- Standard create prerequisite:
  - none
- Standard verification note:
  - for `POST /department/list`, trust `values[]` and the returned department fields; top-level wrapper metadata such as `fullResultSize` can stay `0` on successful writes
  - for exact multi-department create prompts, including multilingual prompts that only supply department names, the canonical path is one `POST /department/list`; do not add a discovery `GET /department` and do not split the task into repeated `POST /department` calls

## Division
- `/division`
  - `GET` search
  - `POST` create
- `/division/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard prerequisite note:
  - division is not part of the default employee-create fast path
  - resolve one existing `/division?count=1&fields=*` only when a live validation branch explicitly requires `employments[].division.id`

## Employee
- `/employee`
  - `GET` search
  - `POST` create
- `/employee/{id}`
  - `GET` read
  - `PUT` update
- `/employee/employment`
  - `GET` search employments
  - `POST` create employment
- Standard create prerequisites:
  - explicit `userType`
- Standard create fast-path note:
  - for the exact create-one-employee shape with prompt-provided name, birth date, email, and start date, the lower-call default is `POST /employee` first with explicit `userType` and nested `employments`
  - 2026-03-20 production re-confirmed that when that first write succeeds in a fresh account, the minimum safe path is usually `2` calls total: the `POST /employee` write plus one decisive `GET /employee/employment?employeeId=...&fields=*`
  - do not default to `GET /department` before the first write; only branch into `GET /department?isInactive=false&count=1&fields=*` if the create fails with `422` where `validationMessages[].field == "department.id"`
  - if that department repair read returns no active department and department is clearly required, `POST /department` with a minimal name-only payload and retry the same employee create once
  - if the employee create then fails with `422` where `validationMessages[].field == "employments.division.id"`, do one decisive `GET /division?count=1&fields=*` and retry once with `division: { "id": ... }` inside the employment row
- Standard verification note:
  - a successful `POST /employee` can still echo `userType: null` plus `employments[]` as link-only objects without `startDate`
  - do not branch on the generic top-level `422 message`; current proven employee-create repair routing depends on `validationMessages[].field`
  - when the prompt scores employment start date, `GET /employee/employment?employeeId=...&fields=*` is the decisive verification read unless the create response unexpectedly already includes the actual `startDate`
  - do not try to save that verification read by trusting the write request itself on a start-date-scored task; that is still an unproven gamble rather than the trusted minimum safe path
- Standard payroll note:
  - `GET /employee?fields=*` can still return `employments[]` as sparse stubs with null `startDate`, null `division`, and empty-looking `employmentDetails[]`
  - for payroll-readiness checks, do one conditional `GET /employee/employment?employeeId=...&fields=*` only when the employee search response is too sparse to judge the payroll period or business linkage

## Salary
- `/salary/type`
  - `GET` search salary types
- `/salary/transaction`
  - `POST` create salary transaction
- `/salary/transaction/{id}`
  - `GET` read salary transaction
  - `DELETE` delete salary transaction
- `/salary/payslip`
  - `GET` search payslips
- `/salary/payslip/{id}`
  - `GET` read payslip
- Standard payroll prerequisites:
  - exact employee id
  - payroll-ready employee data
  - resolved salary-type ids
- Standard fast-path note:
  - for the exact one-employee payroll task shape, prefer `./trusted-standards/run-employee-payroll.md`
  - the winning successful path for a payroll-ready employee is usually employee read, conditional employment read only if needed, salary-type read, then salary-transaction write
  - for the exact task-12-like branch where the employee read shows one exact employee with `dateOfBirth=null` and `employments=[]`, but `GET /salary/type?count=1000&fields=*` succeeds, the lower-zero-risk path is salary-type read, one `GET /division?count=1&fields=*`, `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"`, `POST /employee/employment`, then `POST /salary/transaction`
  - do not add `POST /employee/employment/details` by default in that repair branch; persistent sandbox on 2026-03-20 proved payroll can succeed without it for manual salary lines
  - do not add speculative `/salary/settings` or company-module activation reads to the default payroll path; only branch into feature-state investigation after a live `403` permission response from salary endpoints
- Standard verification note:
  - `GET /salary/payslip/{id}?fields=*` is enough for `grossAmount`, `amount`, and `specifications.length`
  - `GET /salary/payslip/{id}?fields=*` can still keep individual `specifications[]` as link-only objects
  - for exact line-level verification, use `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))`

## Product
- `/product`
  - `GET` search
  - `POST` create
- `/product/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard create prerequisite:
  - exact prompt-required fields
  - if the prompt requires a non-standard or otherwise non-default exact VAT percentage, resolve a valid outgoing `vatType`
  - if the requested exact VAT percentage is absent from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`, treat product create as blocked in that account
- Standard create fast-path note:
  - for the exact fresh-account create-one-product shape with prompt-provided `name`, `number`, excluding-VAT price, and standard `25%` VAT wording, the canonical winning path is one `POST /product` with no explicit `vatType`
  - on that exact shortcut, verify directly from the `POST /product` response that Tripletex returned a `vatType` and the computed `priceIncludingVatCurrency` reflects `25%`; the 2026-03-20 `Softwarelizenz` / `7986` / `24900` production run again confirmed that one-write path with `priceIncludingVatCurrency=31125` and `vatType.id=3`
  - for exact `0%`, reduced-rate, or otherwise non-standard VAT prompts, fall back to one filtered outgoing VAT read followed by `POST /product`
  - do not re-check `./openapi.json` for an exact trusted-standard match, and do not add `GET /product` pre-reads or `GET /product/{id}` verification reads when the write response already proves the scored fields
- Standard create note:
  - `POST /product` without `vatType` can silently inherit an account default in some sandbox accounts; the persistent sandbox still auto-filled `0%` VAT code `6` on 2026-03-20 and produced `priceIncludingVatCurrency == priceExcludingVatCurrency`, so do not use that as the trusted fast path when the prompt scores exact VAT outside the exact fresh-account standard-`25%` shortcut
  - exact `0%` product prompts such as books still use the same rule: select the matching `0%` row from the filtered outgoing VAT result in the current account
- Standard search note:
  - `GET /product?fields=*` can still return `vatType` only as a sparse link object (`id`/`url`)
  - `GET /product?productNumber=...&fields=*` can return the matched identifier under `number` rather than `productNumber`; normalize both keys before deciding a direct numeric resolver failed
  - when the prompt clearly provides exact existing product numbers, the lower-call first resolver is one decisive `GET /product?productNumber=<a>&productNumber=<b>...&fields=*`
  - for invoice/order tasks where the prompt gives exact product names plus parenthetical numeric refs of unclear semantics, the lower-call product resolver is one decisive `GET /product?count=1000&fields=*` with local exact filtering by `number` and/or `name`
  - only switch from the direct `productNumber` query to the broader catalog read when those numeric refs are unclear semantics or the direct numeric query returns an incomplete/ambiguous subset
  - only spend `GET /product?ids=...` after the catalog read or numeric query if the earlier resolver still left the products unresolved
  - for explicit-VAT invoice tasks, do not assume that product search alone proves the VAT percentage; if the prompt scores exact VAT and the product read is sparse, do one filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` before the invoice write

## Project
- `/project`
  - `GET` search
  - `POST` create
- `/project/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard create prerequisites:
  - customer id
  - often assignable project manager id
  - `startDate`
- Standard fast-path note:
  - for the exact create-one-project shape with an existing customer identified by `organizationNumber` and an existing manager identified by `email`, the winning path is usually `GET /customer?organizationNumber=...&count=10&fields=*`, `GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*`, then `POST /project`
  - 2026-03-20 production re-confirmed that the same 3-call path is still minimal for a Portuguese prompt that omitted `startDate`; using the run date in the write payload succeeded directly
  - keep exact uniqueness checks local by comparing returned `customer.organizationNumber` and `employee.email`, and use prompt names only as local tie-breakers when they are provided
  - if the filtered reads already leave one exact-`organizationNumber` hit and one exact-`email` hit, reuse those ids directly; do not require the prompt names to match the returned display names
  - if the prompt omits `startDate`, default it to the run date in ISO format instead of omitting the field
- Standard search note:
  - for project-linked task shapes where the prompt gives project name plus customer identifiers, `GET /project?name=...&count=50&fields=*,customer(*)` can often resolve both the project and the linked customer in one read
  - for update-shaped project tasks that also score the existing manager, `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` can often resolve the project, linked customer, and current manager in one read
  - when that expanded project search already leaves one exact `project.name` plus nested `customer.organizationNumber` and/or `customer.name` match, do not add a separate `GET /customer`
  - when that same expanded row also shows nested `projectManager.email` matching the prompt, do not add a separate `GET /employee` just to re-resolve the same manager id
  - for fixed-price partial-billing update tasks, that same expanded project read can also supply the existing `startDate`; reuse it on `PUT /project/{id}` unless the prompt explicitly asks to change the start date
- Standard verification note:
  - the successful `POST /project` response can already prove `name`, `startDate`, `customer.id`, and `projectManager.id`; do not add `GET /project/{id}` unless one of those scored fields is unexpectedly missing
  - in that exact create-project shape, do not add `GET /customer/{id}` or `GET /employee/{id}` after the filtered resolver reads; the search responses plus the project write response already prove the scored linkage

## Activity
- `/activity`
  - `GET` search
  - `POST` create
- `/activity/{id}`
  - `GET` read
- `/activity/>forTimeSheet`
  - `GET` resolve project activities available for one employee on one date
- Standard time-registration note:
  - for project hour tasks, prefer `/activity/>forTimeSheet` over a broad `/activity` search because it proves the activity is actually available on the project for that employee/date
  - if the resolved activity is non-chargeable, do not assume `projectChargeableHours` or a project-specific rate write can still make it billable
  - for prompt shapes that only score requested hours registration plus the customer-facing project invoice, a non-chargeable activity is still not an automatic stop condition: skip the doomed project-specific-rate write, register the hours, and use the manual project-linked order/invoice fallback

## Project Hourly Rates
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
- `/timesheet/week/:approve`
  - `PUT` approve week
- Standard time-registration note:
  - a timesheet write on a non-chargeable project activity can still succeed while returning `chargeable=false` and `hourlyRate=0`
  - that non-chargeable timesheet response is only a true blocker when the prompt explicitly scores internal billability semantics or true project-hour reserve consumption
  - do not make `/timesheet/week/:approve` part of the default fast path for project-hour invoice tasks; it can return `403` even for the token owner

## Project Period
- `/project/{id}/period/hourlistReport`
  - `GET` read hour totals for a date window
- `/project/{id}/period/invoicingReserve`
  - `GET` read invoice reserve for a date window
- Standard verification note:

```

## 2026-03-20T22:17:55.685Z assistant_message
phase: commentary

Skriver nå ett selvstendig bun-script i run-dir. Det håndterer: kundelesing, produkt-oppløsning med fallback i samme prosess, fakturaoppretting, og kun ved kjent bankkonto-feil en enkel reparasjon + én retry.

## 2026-03-20T22:17:55.689Z tool_call
tool: exec_command
call_id: call_U4OvyvenMZLwXMcCfy3oxR7g

```json
{
  "cmd": "ls -la /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "max_output_tokens": 3000,
  "yield_time_ms": 1000
}
```

## 2026-03-20T22:17:55.696Z tool_call
tool: exec_command
call_id: call_jg8wJU8ujh0DKhJFLsMqMWLW

```json
{
  "cmd": "bun --version",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "max_output_tokens": 1000,
  "yield_time_ms": 1000
}
```

## 2026-03-20T22:17:55.722Z tool_result
tool: exec_command
call_id: call_U4OvyvenMZLwXMcCfy3oxR7g

```text
Command: /run/current-system/sw/bin/zsh -lc 'ls -la /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts'
Chunk ID: 998498
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 25
Output:
total 8
drwxr-xr-x 2 jorge users 4096 Mar 20 23:16 .
drwxr-xr-x 4 jorge users 4096 Mar 20 23:16 ..

```

## 2026-03-20T22:17:55.729Z tool_result
tool: exec_command
call_id: call_jg8wJU8ujh0DKhJFLsMqMWLW

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun --version'
Chunk ID: 3d91da
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 2
Output:
1.3.10

```

## 2026-03-20T22:19:27.619Z assistant_message
phase: commentary

Kjører scriptet nå. Hvis første kall viser ugyldig token stopper jeg direkte. Hvis faktura-kallet kun feiler på manglende selskapsbankkonto tar scriptet den ene dokumenterte reparasjonsgrenen og retryer én gang.

## 2026-03-20T22:19:28.544Z tool_call
tool: exec_command
call_id: call_RSXN1RKYnI31KU8PIDTntws6

```json
{
  "cmd": "bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "max_output_tokens": 12000,
  "yield_time_ms": 1000
}
```

## 2026-03-20T22:19:29.698Z tool_result
tool: exec_command
call_id: call_RSXN1RKYnI31KU8PIDTntws6

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts'
Chunk ID: 02904a
Wall time: 1.0001 seconds
Process running with session ID 43436
Original token count: 0
Output:

```

## 2026-03-20T22:19:33.221Z assistant_message
phase: commentary

Skriptet kjører fortsatt. Jeg venter kun på API-responsene og kontrollerer totalsummen fra skrive-responsen før jeg avslutter.

## 2026-03-20T22:19:33.622Z tool_call
tool: write_stdin
call_id: call_PA52xkz19CqnPUhoDQQ61nGW

```json
{
  "session_id": 43436,
  "chars": "",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:19:38.624Z tool_result
tool: write_stdin
call_id: call_PA52xkz19CqnPUhoDQQ61nGW

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts'
Chunk ID: 8c9d95
Wall time: 5.0008 seconds
Process running with session ID 43436
Original token count: 0
Output:

```

## 2026-03-20T22:19:43.584Z tool_call
tool: write_stdin
call_id: call_RVRqjLHwmeR2J5P0zmLV9FPI

```json
{
  "session_id": 43436,
  "chars": "",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:19:45.251Z tool_result
tool: write_stdin
call_id: call_RVRqjLHwmeR2J5P0zmLV9FPI

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts'
Chunk ID: 9e71fe
Wall time: 1.6661 seconds
Process exited with code 0
Original token count: 39
Output:
{
  "ok": true,
  "apiCallCount": 7,
  "invoiceId": 2147550925,
  "invoiceNumber": 1,
  "amountExcludingVatCurrency": 12900,
  "amountCurrency": 14010
}

```

## 2026-03-20T22:19:49.754Z assistant_message
phase: final_answer

Faktura opprettet korrekt.

Script: [create_invoice_havbris.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts)

Resultat: faktura `#1`, `invoiceId=2147550925`, `amountExcludingVatCurrency=12900`, `amountCurrency=14010`.

Kjørte 7 API-kall total. Første `POST /invoice` traff kjent bankkonto-validering; scriptet tok dokumentert bankkonto-reparasjon og retryet én gang.

## 2026-03-20T22:19:49.774Z task_event
event: task_complete

Faktura opprettet korrekt.

Script: [create_invoice_havbris.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts)

Resultat: faktura `#1`, `invoiceId=2147550925`, `amountExcludingVatCurrency=12900`, `amountCurrency=14010`.

Kjørte 7 API-kall total. Første `POST /invoice` traff kjent bankkonto-validering; scriptet tok dokumentert bankkonto-reparasjon og retryet én gang.
