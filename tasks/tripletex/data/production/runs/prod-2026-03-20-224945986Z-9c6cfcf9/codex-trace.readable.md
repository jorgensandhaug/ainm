# Codex Trace Snapshot

- session_id: 019d0d70-c958-7b72-bba9-2cf6fc783a8a
- session_file: /home/jorge/.codex/sessions/2026/03/20/rollout-2026-03-20T23-49-48-019d0d70-c958-7b72-bba9-2cf6fc783a8a.jsonl
- completed: true
- assistant_messages: 7
- tool_calls: 14
- tool_results: 14

## 2026-03-20T22:49:49.957Z task_event
event: task_started

## 2026-03-20T22:49:49.959Z user_message
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
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224945986Z-9c6cfcf9/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Erstellen und senden Sie eine Rechnung an den Kunden Bergwerk GmbH (Org.-Nr. 981122011) über 45150 NOK ohne MwSt. Die Rechnung betrifft Datenberatung.

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
c2cRya5UUphQz-SkSUM7AcRzo6_CrKMvypr5jhzVtkk

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224945986Z-9c6cfcf9/scripts

## 2026-03-20T22:49:58.925Z assistant_message
phase: commentary

Prüfe nur den passenden Trusted Standard für diesen exakten Rechnungsfall, dann schreibe ein einziges `bun`-Script im vorgegebenen Run-Ordner und führe es aus.

## 2026-03-20T22:49:58.927Z tool_call
tool: exec_command
call_id: call_AibvZVsjOQHpkZ1r0s19tSAh

```json
{
  "cmd": "sed -n '1,220p' trusted-standards/create-and-send-customer-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:49:58.935Z tool_call
tool: exec_command
call_id: call_eGDIH0oqjOr0lvhLyv127bWD

```json
{
  "cmd": "ls -la /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224945986Z-9c6cfcf9/scripts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-20T22:49:58.950Z tool_result
tool: exec_command
call_id: call_AibvZVsjOQHpkZ1r0s19tSAh

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,220p' trusted-standards/create-and-send-customer-invoice.md"
Chunk ID: be1423
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 3140
Output:
# Create And Send Customer Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one outgoing invoice
- send it as part of the same minimal flow
- invoice has one or more simple direct order lines
- prompt gives the customer identity directly or the customer is resolvable in one decisive read
- prompt does not require a specific send channel override such as a forced email address

## Do Not Use This Standard If
- prompt requires a specific send channel that is not already safely implied by known customer data
- prompt requires an existing-product lookup-heavy flow
- task is payment, reversal, or correction

## Standard Flow
1. if the prompt explicitly identifies an already-existing customer, resolve that customer in one decisive `GET /customer?...&fields=*`; otherwise, in the normal fresh-account variant, create the customer directly
2. if creating a new customer and the prompt gives no email or postal address, `POST /customer` with:
   - `name`
   - `organizationNumber`
   - `invoiceSendMethod: "MANUAL"`
3. resolve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
4. `POST /invoice` and let the default `sendToCustomer=true` handle the send in the same write
5. only if that invoice write fails with missing company bank account:
   - `GET /ledger/account?isBankAccount=true&fields=*`
   - `PUT /ledger/account/{id}` on the existing invoice account (usually `1920`) with minimal payload `{ "bankAccountNumber": "12345678903" }`
   - retry the same `POST /invoice` once
6. stop

## Payload Rules
- include:
  - `invoiceDate`
  - `invoiceDueDate`
  - `customer: { "id": ... }`
  - `orders[].customer`
  - `orders[].orderDate`
  - `orders[].deliveryDate`
  - `orders[].orderLines`
- create lines under `orders[].orderLines`, not `invoice.orderLines`
- do not hardcode output VAT code `3`
- do not omit direct-line `vatType` just to save the VAT lookup; a successful write can still create the wrong VAT outcome
- for explicit no-VAT / `0%` direct-line prompts, still resolve the current account's filtered outgoing `0%` VAT row instead of assuming omission is equivalent
- for ordinary direct-line services explicitly priced excluding VAT / MVA, select an exact `25%` row from the filtered outgoing VAT result; if no such row exists, treat the task as blocked in that account instead of falling back to `0%`
- if creating the customer with no delivery/contact details, prefer `invoiceSendMethod: "MANUAL"` and let the invoice create do the send attempt

## Reuse From Write Response
- `customer.value.id`
- `invoice.value.id`
- `invoice.value.invoiceNumber`
- totals from the invoice write response

## Verification
- default verification is zero extra calls
- treat a successful `POST /invoice` with default `sendToCustomer=true` as the winning send path for this task shape
- do not add an automatic follow-up `PUT /invoice/{id}/:send`

## Known Recovery Branches
- if invoice creation fails with missing company bank account:
  - repair the existing invoice bank account and retry the same invoice write once
- if the prompt explicitly identifies an already-existing customer, use one decisive customer read instead of blind customer create
- if customer creation already succeeded but local process state is lost before the repaired retry:
  - resume with `GET /customer?organizationNumber=...&fields=*`, the same filtered outgoing VAT read, and the same `POST /invoice`

## Known Pitfalls
- do not spend `GET /customer` first on the normal fresh-account new-customer variant
- do not treat wording like `invoice customer <name> (<organizationNumber>)` as proof that the customer already exists; when the prompt only supplies business identity and the environment implies a fresh account, the winning path is still direct `POST /customer`
- do not branch into `PUT /invoice/{id}/:send?sendType=MANUAL` as the default path; sandbox reproduced `500` on 2026-03-20 while the same task shape succeeded through `POST /invoice` with default send behavior
- do not assume sparse `postalAddress` or `physicalAddress` links on the customer prove that `PAPER` send is available; sandbox returned `422 Faktura kan ikke sendes via PAPER`
- do not assume organization number alone proves EHF sendability; production returned `422 Faktura kan ikke sendes via EHF`
- do not treat a successful `POST /invoice` without `orderLines[].vatType` as proof that VAT is correct; persistent sandbox on 2026-03-20 accepted that lower-call write and created `amountCurrency == amountExcludingVatCurrency` (`28500`) on the same task shape
- for the exact one-line no-VAT service shape with prompt-only `name + organizationNumber + amount + description`, do not add a speculative customer lookup before the customer create; persistent sandbox re-verification on 2026-03-20 succeeded in `3` calls with `POST /customer`, filtered `GET /ledger/vatType`, then `POST /invoice`
- the same exact no-VAT branch also covers Portuguese wording such as `sem IVA`; the 2026-03-20 production run for `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` used the same `3` calls and did not need `GET /customer` or `PUT /invoice/{id}/:send`
- for ordinary one-line service prompts that explicitly price the work excluding VAT / MVA, do not take the first filtered VAT row if it is `0%`; the safe branch is exact `25%` selection or a blocked conclusion for that account
- if the first `POST /invoice` fails only on missing company bank account, do not let a local helper bug or ad hoc bank-number guess force a full script restart; the minimum recovery is still one valid `PUT /ledger/account/{id}` and one retry of the same invoice payload
- if that first failed invoice happened after a successful customer create, do not blind-retry `POST /customer`; if you lost in-memory state, resume on the existing-customer branch instead
- French wording such as `hors TVA` belongs to that same taxed ex-VAT branch, not the no-VAT branch. The 2026-03-20 production run for `Colline SARL` / `944164340` / `Service réseau` / `44750` succeeded in the canonical `3` calls, while the same-day persistent sandbox still exposed only `0%`, produced a wrong untaxed `44750` total when `vatType` was omitted, and rejected hardcoded `vatType.id=3` with `422`.
- Norwegian wording such as `eksklusiv MVA` belongs to that same taxed ex-VAT branch, not the no-VAT branch. The 2026-03-20 persistent-sandbox analog `Nordhav Reflection 12c28001 AS` / `999280012` / `Analyserapport` / `7850` still exposed only VAT code `6` (`0%`) on the filtered outgoing VAT read for `2026-03-20`, so that sandbox state remains blocked for the taxed branch rather than a valid lower-call shortcut.

## OpenAPI / Sandbox Status
- `/customer`, `/invoice`, `/ledger/vatType`, and `/ledger/account` verified in `./openapi.json`
- minimal create-and-send path re-verified in persistent sandbox on 2026-03-20:
  - `POST /customer` with `invoiceSendMethod: "MANUAL"` succeeded
  - `POST /invoice` with default `sendToCustomer=true` succeeded for the same customer
  - explicit later `PUT /invoice/{id}/:send?sendType=MANUAL` reproduced `500`
  - explicit later `PUT /invoice/{id}/:send?sendType=PAPER` reproduced `422`
- VAT handling re-verified in persistent sandbox on 2026-03-20 for the same one-line service invoice shape:
  - `POST /invoice` without line `vatType` succeeded but created a no-VAT invoice (`amountExcludingVatCurrency=28500`, `amountCurrency=28500`)
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
  - hardcoded line `vatType.id=3` failed with `422 ... Ugyldig mva-kode.`
- exact ordinary-service ex-VAT create-and-send shape re-confirmed across production plus sandbox on 2026-03-20:
  - production run `Snøhetta AS` / `871844062` / `Webdesign` / `20100` succeeded in the canonical `3` calls: `POST /customer` with `invoiceSendMethod=MANUAL`, filtered outgoing VAT read, then `POST /invoice`
  - the production invoice write already proved the intended taxed outcome with `amountExcludingVatCurrency=20100` and `amountCurrency=25125`
  - the persistent sandbox still exposed only VAT code `6` (`0%`) for the same date, so the exact same prompt shape would be blocked there for standard VAT rather than downgraded to `0%`
  - the French prompt variant `Colline SARL` / `944164340` / `Service réseau` / `44750` / `hors TVA` succeeded in the same canonical `3` calls in production and confirms that `hors TVA` must be normalized to ordinary taxed ex-VAT handling, not `0%`
  - the same-day persistent sandbox re-check on analogous org `944164341` again exposed only VAT code `6`, created a wrong untaxed `44750` total when `orderLines[].vatType` was omitted, and rejected hardcoded `vatType.id=3` with `422 Ugyldig mva-kode.`
  - the later same-day French production run `Lumière SARL` / `959714320` / `Stockage cloud` / `34100` again finished on the same exact `3` calls and preserved the Unicode customer name exactly as prompted
  - the later same-day French production run `Étoile SARL` / `995085488` / `Rapport d'analyse` / `7250` confirmed the conditional bank-account repair branch for the same taxed direct-line shape: after the standard `POST /customer` and filtered outgoing VAT read, the first `POST /invoice` failed on missing company bank account, `PUT /ledger/account/{id}` on invoice account `1920` with minimal payload `{ "bankAccountNumber": "12345678903" }` repaired the prerequisite, and the existing-customer resume branch `GET /customer?organizationNumber=995085488&fields=*` -> filtered outgoing VAT read -> `POST /invoice` then completed with `amountExcludingVatCurrency=7250` and `amountCurrency=9062.5`
  - the same-day persistent sandbox analog `Lumière Reflection b9572091 SARL` / `957223729` still exposed only VAT code `6` (`0%`); for that exact `34100` line, omitting `orderLines[].vatType` created a wrong untaxed `34100` total, so that sandbox account remains blocked for the taxed branch rather than a valid shortcut
  - the same-day persistent sandbox analog `Nordhav Reflection 12c28001 AS` / `999280012` / `Analyserapport` / `7850` re-confirmed that Norwegian wording `eksklusiv MVA` follows the same taxed branch: after the standard `POST /customer`, the filtered outgoing VAT read for `2026-03-20` still exposed only code `6` (`0%`), so that sandbox account remained blocked for the taxed branch rather than a no-VAT fallback
  - a same-day persistent sandbox control re-check on the provided follow-up sandbox still exposed only VAT code `6` (`0%`) for `2026-03-20`; the exact taxed `7250` branch therefore remained blocked there, but the surrounding create-and-send mechanics still re-proved cleanly in `3` calls on a control line by using the available `0%` row with the same `POST /customer` -> filtered `GET /ledger/vatType` -> `POST /invoice` flow
- exact no-VAT direct-line create-and-send shape re-verified in persistent sandbox on 2026-03-20:
  - fresh-account-style branch: on the same one-line `22700` / `Design web` / `0%` shape, direct `POST /customer` with `invoiceSendMethod=MANUAL`, then `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`, then `POST /invoice` succeeded without any customer pre-read
  - the filtered VAT read returned only code `6` (`0%`)
  - the invoice write returned `amountExcludingVatCurrency=22700`, `amountCurrency=22700`, and an invoice number without any extra verification read
  - on the exact `Porto Alegre Lda` / `826870192` task identity, once that customer existed in sandbox, the existing-customer branch also succeeded with one decisive `GET /customer?organizationNumber=826870192&fields=*`, the same filtered VAT read, and the same invoice write
- exact Portuguese no-VAT direct-line create-and-send shape re-confirmed across production plus persistent sandbox on 2026-03-20:
  - production run `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` / `sem IVA` succeeded in the canonical `3` calls: direct `POST /customer` with `invoiceSendMethod=MANUAL`, filtered outgoing VAT read, then `POST /invoice`
  - the production invoice write already proved the intended no-VAT outcome with `amountExcludingVatCurrency=11200` and `amountCurrency=11200`
  - persistent sandbox re-check on the analogous fresh-customer `842889155` shape returned VAT code `6` (`0%`) and the same `11200` / `11200` totals through the same `3` calls, again without any customer pre-read or explicit `:send` call

```

## 2026-03-20T22:49:58.973Z tool_result
tool: exec_command
call_id: call_eGDIH0oqjOr0lvhLyv127bWD

```text
Command: /run/current-system/sw/bin/zsh -lc 'ls -la /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224945986Z-9c6cfcf9/scripts'
Chunk ID: 18b892
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 25
Output:
total 8
drwxr-xr-x 2 jorge users 4096 Mar 20 23:49 .
drwxr-xr-x 4 jorge users 4096 Mar 20 23:49 ..

```

## 2026-03-20T22:50:07.339Z assistant_message
phase: commentary

Trusted Standard passt exakt: neuer Kunde, eine einfache Zeile, `ohne MwSt.`, Versand im selben `POST /invoice`. Ich ziehe jetzt nur ein nahes Referenzscript aus früheren Runs heran, dann schreibe die minimale Variante für diesen Fall.

## 2026-03-20T22:50:07.341Z tool_call
tool: exec_command
call_id: call_UGLUiJPKLBUitnimFRd16md9

```json
{
  "cmd": "rg -n \"invoiceSendMethod|sendToCustomer|typeOfVat=OUTGOING|orderLines\" /home/jorge/repos/ainm/tasks/tripletex/data/production/runs -g '*.ts' | head -n 40",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:50:07.354Z tool_call
tool: exec_command
call_id: call_Q4F6Nhz1WHzg7bfbtstlwWt3

```json
{
  "cmd": "date +%F",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 1000
}
```

## 2026-03-20T22:50:07.375Z tool_result
tool: exec_command
call_id: call_UGLUiJPKLBUitnimFRd16md9

```text
Command: /run/current-system/sw/bin/zsh -lc "rg -n \"invoiceSendMethod|sendToCustomer|typeOfVat=OUTGOING|orderLines\" /home/jorge/repos/ainm/tasks/tripletex/data/production/runs -g '*.ts' | head -n 40"
Chunk ID: 545845
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 2006
Output:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_supplier_invoice_approval.ts:10:type SupplierInvoice = { id?: number; approvalListElements?: Array<{ id?: number }>; orderLines?: Array<Record<string, unknown>> };
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_supplier_invoice_approval.ts:72:  params: { fields: "*,approvalListElements(*),orderLines(*,currency(*),vatType(*))" },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_supplier_invoice_approval.ts:92:  params: { fields: "*,approvalListElements(*),orderLines(*,currency(*),vatType(*))" },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_supplier_invoice_approval.ts:95:const orderLine = afterApprove.body.value?.orderLines?.[0];
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_import_xml_then_supplier_invoice.ts:40:  orderLines?: unknown[];
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184659113Z-e3e88ae8/scripts/sandbox_verify_reverse_payment_reflection.ts:141:      orderLines: [
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184659113Z-e3e88ae8/scripts/sandbox_verify_reverse_payment_reflection.ts:153:    params: { invoiceDate: TODAY, sendToCustomer: "false" },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184659113Z-e3e88ae8/scripts/sandbox_verify_reverse_payment_reflection.ts:177:      fields: "*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-100544625Z-3cc7ddc8/scripts/sandbox-verify-create-customer.ts:10:  invoiceSendMethod?: string;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-100544625Z-3cc7ddc8/scripts/sandbox-verify-create-customer.ts:136:        invoiceSendMethod: customer.invoiceSendMethod ?? null,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/search_supplier_invoice_postings_shape.ts:16:  orderLines?: Array<{ id?: number }>;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/search_supplier_invoice_postings_shape.ts:150:    orderLineId = supplierInvoice?.orderLines?.[0]?.id ?? null;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184659113Z-e3e88ae8/scripts/reverse_customer_invoice_payment.ts:68:  const topLevel = asArray(invoice.orderLines).flatMap((line) => {
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184659113Z-e3e88ae8/scripts/reverse_customer_invoice_payment.ts:72:    asArray(order.orderLines).flatMap((line) => {
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184659113Z-e3e88ae8/scripts/reverse_customer_invoice_payment.ts:158:    fields: "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_full_orderline_postings.ts:14:type SupplierInvoice = { id?: number; orderLines?: OrderLine[] };
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_full_orderline_postings.ts:92:    fields: "*,orderLines(*,currency(*),vatType(*),product(*),vendor(*),order(*))",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_full_orderline_postings.ts:95:const orderLine = expanded.body.value?.orderLines?.[0];
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_full_orderline_postings.ts:137:    params: { fields: "*,orderLines(*,currency(*),vatType(*),product(*),vendor(*),order(*)),voucher(*)" },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/inspect_imported_supplier_invoice.ts:67:    fields: "*,supplier(*),voucher(*),orderLines(*,currency(*),vatType(*),product(*),vendor(*),order(*))",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-223654833Z-37761213/scripts/sandbox_verify_create_customer.ts:51:  ["invoiceSendMethod", customer.invoiceSendMethod, "EMAIL"],
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-223654833Z-37761213/scripts/sandbox_verify_create_customer.ts:71:      invoiceSendMethod: customer.invoiceSendMethod,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154579Z-837cd40b/scripts/reverse-brightstone-payment.ts:41:    ...(invoice.orderLines ?? []).flatMap((line: Json) => [
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154579Z-837cd40b/scripts/reverse-brightstone-payment.ts:94:    "orderLines(*)",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154579Z-837cd40b/scripts/reverse-brightstone-payment.ts:155:      "*,customer(*),orderLines(*),postings(*,voucher(*))",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/run.ts:301:          invoiceSendMethod: "MANUAL",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/run.ts:367:      orderLines: [
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/run.ts:384:        sendToCustomer: false,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/run.ts:418:        sendToCustomer: false,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154579Z-837cd40b/scripts/sandbox-verify-reverse-customer-invoice-payment.ts:75:    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154579Z-837cd40b/scripts/sandbox-verify-reverse-customer-invoice-payment.ts:106:      orderLines: [
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154579Z-837cd40b/scripts/sandbox-verify-reverse-customer-invoice-payment.ts:118:    `/order/${order.value.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154579Z-837cd40b/scripts/sandbox-verify-reverse-customer-invoice-payment.ts:134:      "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131502143Z-73ec8a8f/scripts/set-fixed-price-and-invoice.ts:139:        invoiceSendMethod: "MANUAL",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131502143Z-73ec8a8f/scripts/set-fixed-price-and-invoice.ts:192:      orderLines: [
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131502143Z-73ec8a8f/scripts/set-fixed-price-and-invoice.ts:207:      sendToCustomer: false,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131502143Z-73ec8a8f/scripts/set-fixed-price-and-invoice.ts:216:        fields: "*,orders(*,project(*),orderLines(*)),orderLines(*)",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/sandbox-proof-skip-project-put.ts:209:          invoiceSendMethod: "MANUAL",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/sandbox-proof-skip-project-put.ts:322:          orderLines: [
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/sandbox-proof-skip-project-put.ts:344:          sendToCustomer: false,

```

## 2026-03-20T22:50:07.385Z tool_result
tool: exec_command
call_id: call_Q4F6Nhz1WHzg7bfbtstlwWt3

```text
Command: /run/current-system/sw/bin/zsh -lc 'date +%F'
Chunk ID: acd8e9
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 3
Output:
2026-03-20

```

## 2026-03-20T22:50:11.515Z assistant_message
phase: commentary

Ziehe nur den relevanten Payload-/HTTP-Shape aus einem vorhandenen `run.ts`, dann schreibe ich die produktive Variante ohne Zusatzreads.

## 2026-03-20T22:50:11.516Z tool_call
tool: exec_command
call_id: call_CUtowSruxEOjQ4mDzYzP60bY

```json
{
  "cmd": "sed -n '1,260p' /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/run.ts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:50:11.526Z tool_call
tool: exec_command
call_id: call_WUhmLZWV0UPAEmfYFymohPvn

```json
{
  "cmd": "sed -n '260,460p' /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/run.ts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:50:11.545Z tool_result
tool: exec_command
call_id: call_CUtowSruxEOjQ4mDzYzP60bY

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,260p' /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/run.ts"
Chunk ID: 2cc582
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 1953
Output:
const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "aOOg8Yt5wKNIyH9qIoSWgSdhNWKNnS957m1MCsr6Pds";

const RUN_DATE = "2026-03-20";
const CUSTOMER_NAME = "Soleil SARL";
const CUSTOMER_ORG_NO = "931336738";
const PROJECT_NAME = "Mise à niveau infrastructure";
const PROJECT_MANAGER_EMAIL = "nathan.thomas@example.org";
const FIXED_PRICE = 125550;
const PARTIAL_AMOUNT = Number((FIXED_PRICE * 0.25).toFixed(2));
const ORDER_LINE_DESCRIPTION = "Paiement d'étape 25 % du prix forfaitaire";

type QueryValue = string | number | boolean | null | undefined;

type ApiList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type ApiValue<T> = {
  value: T;
};

type Customer = {
  id: number;
  name?: string | null;
  organizationNumber?: string | null;
};

type Employee = {
  id: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
};

type Project = {
  id: number;
  name?: string | null;
  startDate?: string | null;
  isClosed?: boolean | null;
  isFixedPrice?: boolean | null;
  fixedprice?: number | null;
  customer?: Customer | null;
  projectManager?: Employee | null;
};

type VatType = {
  id: number;
  percentage?: number | null;
};

type Order = {
  id: number;
};

type Invoice = {
  id: number;
  customer?: { id?: number | null } | null;
  amountExcludingVatCurrency?: number | null;
  amountCurrencyOutstanding?: number | null;
};

type LedgerAccount = {
  id: number;
  number?: number | string | null;
  bankAccountNumber?: string | null;
  isInvoiceAccount?: boolean | null;
};

class ApiError extends Error {
  status: number;
  body: unknown;
  method: string;
  path: string;

  constructor(method: string, path: string, status: number, body: unknown) {
    super(`${method} ${path} -> ${status}`);
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
  }
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`, "utf8").toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): URL {
  const url = new URL(path.replace(/^\//, ""), BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

async function request<T>(
  method: string,
  path: string,
  options: {
    query?: Record<string, QueryValue>;
    body?: unknown;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new Error(
      `Blocked: network failure for ${method} ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  const body = parseBody(text);

  if (!response.ok) {
    const errorText =
      body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "";
    if (
      response.status === 403 &&
      (errorText === "Invalid or expired token" ||
        errorText ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
    ) {
      throw new Error(`Blocked: ${errorText}`);
    }
    throw new ApiError(method, path, response.status, body ?? text);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return body as T;
}

function fullName(employee: Employee): string {
  const combined = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
  return combined || employee.name || "";
}

function chooseProject(values: Project[]): Project | null {
  const exact = values.filter(
    (project) =>
      project.name === PROJECT_NAME &&
      project.customer?.organizationNumber === CUSTOMER_ORG_NO,
  );
  if (exact.length === 0) return null;
  if (exact.length === 1) return exact[0];

  const exactManager = exact.filter(
    (project) => project.projectManager?.email === PROJECT_MANAGER_EMAIL,
  );
  if (exactManager.length === 1) return exactManager[0];

  const open = exact.filter((project) => project.isClosed !== true);
  if (open.length === 1) return open[0];

  throw new Error(`Ambiguous project for ${PROJECT_NAME} / ${CUSTOMER_ORG_NO}`);
}

function chooseCustomer(values: Customer[]): Customer | null {
  const orgMatches = values.filter((customer) => customer.organizationNumber === CUSTOMER_ORG_NO);
  if (orgMatches.length === 0) return null;
  if (orgMatches.length === 1) return orgMatches[0];

  const exactName = orgMatches.filter((customer) => customer.name === CUSTOMER_NAME);
  if (exactName.length === 1) return exactName[0];

  throw new Error(`Ambiguous customer for ${CUSTOMER_ORG_NO}`);
}

function chooseManager(values: Employee[]): Employee | null {
  const emailMatches = values.filter((employee) => employee.email === PROJECT_MANAGER_EMAIL);
  if (emailMatches.length === 0) return null;
  if (emailMatches.length === 1) return emailMatches[0];

  const exactName = emailMatches.filter((employee) => fullName(employee) === "Nathan Thomas");
  if (exactName.length === 1) return exactName[0];

  throw new Error(`Ambiguous project manager for ${PROJECT_MANAGER_EMAIL}`);
}

function chooseVatType(values: VatType[]): VatType {
  const vat25 = values.find((vatType) => Number(vatType.percentage) === 25);
  if (vat25) return vat25;
  if (values.length === 1) return values[0];

  const zeroVat = values.filter((vatType) => Number(vatType.percentage) === 0);
  if (zeroVat.length === 1 && zeroVat.length === values.length) return zeroVat[0];

  throw new Error(`No decisive outgoing VAT type: ${JSON.stringify(values)}`);
}

function collectStrings(input: unknown, acc: string[] = []): string[] {
  if (typeof input === "string") {
    acc.push(input);
    return acc;
  }
  if (Array.isArray(input)) {
    for (const value of input) collectStrings(value, acc);
    return acc;
  }
  if (input && typeof input === "object") {
    for (const value of Object.values(input)) collectStrings(value, acc);
  }
  return acc;
}

function isMissingBankAccountError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.status !== 422) return false;
  return collectStrings(error.body).some((message) =>
    message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."),
  );
}

function chooseInvoiceBankAccount(values: LedgerAccount[]): LedgerAccount {
  const invoiceAccount = values.find((account) => account.isInvoiceAccount);
  if (invoiceAccount) return invoiceAccount;

  const account1920 = values.find((account) => String(account.number) === "1920");
  if (account1920) return account1920;

  if (values.length === 1) return values[0];

  throw new Error("No decisive invoice bank account found");
}

function makeValidBankAccountNumber(existingNumbers: Set<string>): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (let prefixNum = 3210000000; prefixNum < 3299999999; prefixNum += 1) {
    const prefix = String(prefixNum);
    const sum = prefix
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);

```

## 2026-03-20T22:50:11.559Z tool_result
tool: exec_command
call_id: call_WUhmLZWV0UPAEmfYFymohPvn

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '260,460p' /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/run.ts"
Chunk ID: a84523
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 1407
Output:
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;
    if (checkDigit >= 10) continue;
    const candidate = `${prefix}${checkDigit}`;
    if (!existingNumbers.has(candidate)) return candidate;
  }
  throw new Error("Unable to generate valid bank account number");
}

async function main(): Promise<void> {
  const projectSearch = await request<ApiList<Project>>("GET", "project", {
    query: {
      name: PROJECT_NAME,
      count: 50,
      fields: "*,customer(*),projectManager(*)",
    },
  });

  const existingProject = chooseProject(projectSearch.values ?? []);
  let customer = existingProject?.customer ?? null;
  let projectManager =
    existingProject?.projectManager?.email === PROJECT_MANAGER_EMAIL
      ? existingProject.projectManager
      : null;

  if (!customer) {
    const customerSearch = await request<ApiList<Customer>>("GET", "customer", {
      query: {
        organizationNumber: CUSTOMER_ORG_NO,
        count: 10,
        fields: "*",
      },
    });
    customer = chooseCustomer(customerSearch.values ?? []);

    if (!customer) {
      const createdCustomer = await request<ApiValue<Customer>>("POST", "customer", {
        body: {
          name: CUSTOMER_NAME,
          organizationNumber: CUSTOMER_ORG_NO,
          invoiceSendMethod: "MANUAL",
        },
      });
      customer = createdCustomer.value;
    }
  }

  if (!projectManager) {
    const employeeSearch = await request<ApiList<Employee>>("GET", "employee", {
      query: {
        email: PROJECT_MANAGER_EMAIL,
        assignableProjectManagers: true,
        count: 10,
        fields: "*",
      },
    });
    projectManager = chooseManager(employeeSearch.values ?? []);
    if (!projectManager) {
      throw new Error(`Project manager not found for ${PROJECT_MANAGER_EMAIL}`);
    }
  }

  const projectPayload = {
    name: PROJECT_NAME,
    startDate: existingProject?.startDate || RUN_DATE,
    customer: { id: customer.id },
    projectManager: { id: projectManager.id },
    isFixedPrice: true,
    fixedprice: FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  };

  const projectWrite = existingProject
    ? await request<ApiValue<Project>>("PUT", `project/${existingProject.id}`, {
        body: projectPayload,
      })
    : await request<ApiValue<Project>>("POST", "project", {
        body: projectPayload,
      });
  const project = projectWrite.value;

  if (
    project.customer?.id !== customer.id ||
    project.projectManager?.id !== projectManager.id ||
    project.isFixedPrice !== true ||
    Number(project.fixedprice) !== FIXED_PRICE
  ) {
    throw new Error(`Project write verification failed: ${JSON.stringify(project)}`);
  }

  const vatSearch = await request<ApiList<VatType>>("GET", "ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: RUN_DATE,
      fields: "*",
    },
  });
  const vatType = chooseVatType(vatSearch.values ?? []);

  const orderWrite = await request<ApiValue<Order>>("POST", "order", {
    body: {
      customer: { id: customer.id },
      project: { id: project.id },
      orderDate: RUN_DATE,
      deliveryDate: RUN_DATE,
      invoiceOnAccountVatHigh: false,
      orderLines: [
        {
          description: ORDER_LINE_DESCRIPTION,
          count: 1,
          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
          vatType: { id: vatType.id },
        },
      ],
    },
  });
  const order = orderWrite.value;

  let invoiceWrite: ApiValue<Invoice>;
  try {
    invoiceWrite = await request<ApiValue<Invoice>>("PUT", `order/${order.id}/:invoice`, {
      query: {
        invoiceDate: RUN_DATE,
        sendToCustomer: false,
      },
    });
  } catch (error) {
    if (!isMissingBankAccountError(error)) throw error;

    const ledgerAccounts = await request<ApiList<LedgerAccount>>("GET", "ledger/account", {
      query: {
        isBankAccount: true,
        fields: "*",
      },
    });
    const invoiceBankAccount = chooseInvoiceBankAccount(ledgerAccounts.values ?? []);

    if (invoiceBankAccount.bankAccountNumber) {
      throw error;
    }

    const existingNumbers = new Set(
      (ledgerAccounts.values ?? [])
        .map((account) => String(account.bankAccountNumber ?? "").trim())
        .filter((value) => /^\d{11}$/.test(value)),
    );
    const bankAccountNumber = makeValidBankAccountNumber(existingNumbers);

    await request<ApiValue<LedgerAccount>>("PUT", `ledger/account/${invoiceBankAccount.id}`, {
      body: {
        bankAccountNumber,
      },
    });

    invoiceWrite = await request<ApiValue<Invoice>>("PUT", `order/${order.id}/:invoice`, {
      query: {
        invoiceDate: RUN_DATE,
        sendToCustomer: false,
      },
    });
  }

  const invoice = invoiceWrite.value;
  if (invoice.customer?.id !== customer.id) {
    throw new Error(`Invoice customer mismatch: ${JSON.stringify(invoice)}`);
  }
  if (Number(invoice.amountExcludingVatCurrency) !== PARTIAL_AMOUNT) {
    throw new Error(
      `Invoice amount mismatch: ${invoice.amountExcludingVatCurrency} !== ${PARTIAL_AMOUNT}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        projectManagerId: projectManager.id,
        projectId: project.id,
        orderId: order.id,
        invoiceId: invoice.id,
        fixedprice: project.fixedprice,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();

```

## 2026-03-20T22:50:15.502Z tool_call
tool: exec_command
call_id: call_wLaGoJ6JXJkpcW9azd7ebUWO

```json
{
  "cmd": "rg -n \"POST\\\", \\\"invoice\\\"|sendToCustomer: true|sendToCustomer=true|invoiceDueDate|unitPriceExcludingVatCurrency\" /home/jorge/repos/ainm/tasks/tripletex/data/production/runs -g '*.ts'",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 20000
}
```

## 2026-03-20T22:50:15.509Z tool_call
tool: exec_command
call_id: call_aE8vp9D7f9McNSnigXH4HNbj

```json
{
  "cmd": "rg -n \"ohne MwSt|sem IVA|hors TVA|without VAT|0%\" trusted-standards task-playbooks /home/jorge/repos/ainm/tasks/tripletex/data/production/runs -g '*.md' -g '*.ts' | head -n 80",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:50:15.596Z tool_result
tool: exec_command
call_id: call_wLaGoJ6JXJkpcW9azd7ebUWO

```text
Command: /run/current-system/sw/bin/zsh -lc "rg -n \"POST\\\", \\\"invoice\\\"|sendToCustomer: true|sendToCustomer=true|invoiceDueDate|unitPriceExcludingVatCurrency\" /home/jorge/repos/ainm/tasks/tripletex/data/production/runs -g '*.ts'"
Chunk ID: b98c0a
Wall time: 0.0001 seconds
Process exited with code 0
Original token count: 15702
Output:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223638732Z-2498866c/scripts/run.ts:327:            unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223638732Z-2498866c/scripts/sandbox-proof.ts:245:          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223638732Z-2498866c/scripts/sandbox-proof.ts:312:          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503725Z-27516e6d/scripts/sandbox-verify-fixed-price-partial-flow.ts:80:      unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503725Z-27516e6d/scripts/sandbox-verify-fixed-price-partial-flow.ts:265:          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503725Z-27516e6d/scripts/sandbox-verify-fixed-price-partial-flow.ts:332:    verifiedLine?.unitPriceExcludingVatCurrency === MILESTONE_AMOUNT ||
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503725Z-27516e6d/scripts/verify-invoice-project-state.ts:41:      unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503725Z-27516e6d/scripts/verify-invoice-project-state.ts:47:    unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503725Z-27516e6d/scripts/verify-invoice-project-state.ts:114:    line?.unitPriceExcludingVatCurrency === MILESTONE_AMOUNT ||
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503725Z-27516e6d/scripts/set-project-fixedprice-and-invoice-33pct.ts:233:          unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-134356961Z-71b6f16b/scripts/order_invoice_pay.ts:284:            unitPriceExcludingVatCurrency: 14650,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-134356961Z-71b6f16b/scripts/order_invoice_pay.ts:290:            unitPriceExcludingVatCurrency: 11800,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-134356961Z-71b6f16b/scripts/sandbox_verify_order_invoice_pay.ts:302:            unitPriceExcludingVatCurrency: 14650,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-134356961Z-71b6f16b/scripts/sandbox_verify_order_invoice_pay.ts:308:            unitPriceExcludingVatCurrency: 11800,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223035578Z-f8ee5198/scripts/sandbox-proof-39h-project-invoice.ts:177:          unitPriceExcludingVatCurrency: HOURLY_RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223035578Z-f8ee5198/scripts/run.ts:336:          unitPriceExcludingVatCurrency: HOURLY_RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819684Z-afc5fde0/scripts/register-hours-project-invoice.ts:339:          unitPriceExcludingVatCurrency: RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-161635045Z-902cdde6/scripts/sandbox-project-hours-proof.ts:186:        unitPriceExcludingVatCurrency: RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-161635045Z-902cdde6/scripts/sandbox-project-hours-proof.ts:215:        unitPriceExcludingVatCurrency: RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-161635045Z-902cdde6/scripts/register-hours-and-project-invoice.ts:299:          unitPriceExcludingVatCurrency: HOURLY_RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224241061Z-b9df9754/scripts/run.ts:396:          unitPriceExcludingVatCurrency: HOURLY_RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224241061Z-b9df9754/scripts/sandbox-proof.ts:150:          unitPriceExcludingVatCurrency: HOURLY_RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-101321096Z-4ed95059/scripts/sandbox-fixed-price-partial.ts:144:          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154043711Z-89cff08b/scripts/sandbox_verify_create_send_invoice.ts:179:    unitPriceExcludingVatCurrency: LINE_AMOUNT_EX_VAT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154043711Z-89cff08b/scripts/sandbox_verify_create_send_invoice.ts:185:    invoiceDueDate: DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154043711Z-89cff08b/scripts/create_send_invoice.ts:212:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154043711Z-89cff08b/scripts/create_send_invoice.ts:223:            unitPriceExcludingVatCurrency: LINE_AMOUNT_EX_VAT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d/scripts/order_invoice_payment.ts:14:    unitPriceExcludingVatCurrency: 32750,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d/scripts/order_invoice_payment.ts:19:    unitPriceExcludingVatCurrency: 17450,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d/scripts/order_invoice_payment.ts:189:      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184659113Z-e3e88ae8/scripts/sandbox_verify_reverse_payment_reflection.ts:146:          unitPriceExcludingVatCurrency: 1000,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151148780Z-105d5e03/scripts/sandbox_verify_credit_note.ts:146:    invoiceDueDate: "2026-04-03",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151148780Z-105d5e03/scripts/sandbox_verify_credit_note.ts:157:            unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d/scripts/sandbox_order_invoice_payment_probe.ts:12:    { name: "Netzwerkdienst", ref: "4366", unitPriceExcludingVatCurrency: 32750 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d/scripts/sandbox_order_invoice_payment_probe.ts:13:    { name: "Beratungsstunden", ref: "3402", unitPriceExcludingVatCurrency: 17450 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d/scripts/sandbox_order_invoice_payment_probe.ts:99:        priceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d/scripts/sandbox_order_invoice_payment_probe.ts:167:        unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185808904Z-b553a118/scripts/sandbox-optimize.ts:158:        unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185808904Z-b553a118/scripts/sandbox-optimize.ts:179:        unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-152251584Z-b8bed751/scripts/sandbox_project_hour_invoice_probe.ts:217:      invoiceDueDate: "2026-04-03",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-152251584Z-b8bed751/scripts/sandbox_project_hour_invoice_probe.ts:247:      invoiceDueDate: "2026-04-03",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-152251584Z-b8bed751/scripts/sandbox_project_hour_invoice_probe.ts:299:    invoiceDueDate: "2026-04-03",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-152251584Z-b8bed751/scripts/sandbox_project_hour_invoice_probe.ts:343:    invoiceDueDate: "2026-04-03",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-152251584Z-b8bed751/scripts/sandbox_project_hour_invoice_probe.ts:386:        unitPriceExcludingVatCurrency: Number(unitPrice),
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d/scripts/sandbox_order_invoice_prepay_probe.ts:11:  { name: "Netzwerkdienst", ref: "4366", unitPriceExcludingVatCurrency: 32750 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d/scripts/sandbox_order_invoice_prepay_probe.ts:12:  { name: "Beratungsstunden", ref: "3402", unitPriceExcludingVatCurrency: 17450 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185625383Z-ee73443d/scripts/sandbox_order_invoice_prepay_probe.ts:103:        unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185808904Z-b553a118/scripts/sandbox-project-first.ts:163:        unitPriceExcludingVatCurrency: 87662.5,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-185808904Z-b553a118/scripts/run.ts:225:        unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-150026580Z-cd6b831a/scripts/sandbox-verify-order-flow.ts:201:            unitPriceExcludingVatCurrency: 4950,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-150026580Z-cd6b831a/scripts/sandbox-verify-order-flow.ts:207:            unitPriceExcludingVatCurrency: 7700,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-150026580Z-cd6b831a/scripts/create-order-invoice-pay.ts:187:          unitPriceExcludingVatCurrency: 4950,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-150026580Z-cd6b831a/scripts/create-order-invoice-pay.ts:193:          unitPriceExcludingVatCurrency: 7700,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-160114982Z-9f31c41d/scripts/sandbox-verify-reverse-payment-efficiency.ts:159:          unitPriceExcludingVatCurrency: UNIT_PRICE_EX_VAT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_task11_flow.ts:48:  invoiceDueDate?: string;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_task11_flow.ts:245:          invoiceDueDate: invoice.invoiceDueDate ?? null,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_import_xml_then_supplier_invoice.ts:34:  invoiceDueDate?: string;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151734977Z-7b560c69/scripts/prove-reverse-payment-sandbox.ts:170:          unitPriceExcludingVatCurrency: 1000,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222822362Z-d92470e8/scripts/run.ts:318:          unitPriceExcludingVatCurrency: HOURLY_RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_import_then_put_voucher.ts:38:  invoiceDueDate?: string;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222822362Z-d92470e8/scripts/sandbox-proof.ts:123:          unitPriceExcludingVatCurrency: HOURLY_RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts/sandbox-investigate-project-hours-invoice.ts:125:            unitPriceExcludingVatCurrency: HOURLY_RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_empty_voucher_supplier_invoice.ts:30:  invoiceDueDate?: string;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223648798Z-35e77655/scripts/register-project-hours-and-invoice.ts:291:            unitPriceExcludingVatCurrency: HOURLY_RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_full_orderline_postings.ts:105:  unitPriceExcludingVatCurrency: orderLine.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-150538277Z-1f4cda78/scripts/sandbox-verify-credit-note.ts:82:      invoiceDueDate: addDays(today, 14),
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-150538277Z-1f4cda78/scripts/sandbox-verify-credit-note.ts:93:              unitPriceExcludingVatCurrency: 10400,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_import_then_supplier_invoice.ts:25:  invoiceDueDate?: string;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/probe_supplier_invoice_postings.ts:24:  invoiceDueDate?: string;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224503351Z-06e7e781/scripts/run.ts:232:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224503351Z-06e7e781/scripts/run.ts:243:            unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts/run.ts:297:        unitPriceExcludingVatCurrency: 32750,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts/run.ts:303:        unitPriceExcludingVatCurrency: 17450,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts/sandbox-proof.ts:139:          unitPriceExcludingVatCurrency: 32750,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts/sandbox-proof.ts:145:          unitPriceExcludingVatCurrency: 17450,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-141139299Z-7ed19654/scripts/create_and_send_invoice.ts:170:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-141139299Z-7ed19654/scripts/create_and_send_invoice.ts:181:            unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-141139299Z-7ed19654/scripts/sandbox_invoice_post_send_probe.ts:43:      invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-141139299Z-7ed19654/scripts/sandbox_invoice_post_send_probe.ts:54:              unitPriceExcludingVatCurrency: 103,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221828110Z-f670e116/scripts/sandbox-proof-fixed-price-partial.ts:202:        unitPriceExcludingVatCurrency: 158000,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221828110Z-f670e116/scripts/sandbox-proof-fixed-price-partial.ts:247:        unitPriceExcludingVatCurrency: 158000,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221828110Z-f670e116/scripts/set-fixed-price-and-invoice-partial.ts:320:          unitPriceExcludingVatCurrency: partialAmount,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/sandbox-order-invoice-payment-proof.ts:35:  unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/sandbox-order-invoice-payment-proof.ts:214:          unitPriceExcludingVatCurrency: spec.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/sandbox-order-invoice-payment-proof.ts:248:      unitPriceExcludingVatCurrency: spec.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-141139299Z-7ed19654/scripts/sandbox_create_and_send_invoice_probe.ts:140:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-141139299Z-7ed19654/scripts/sandbox_create_and_send_invoice_probe.ts:151:            unitPriceExcludingVatCurrency: amount,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/sandbox-embedded-order-e2e-proof.ts:153:        unitPriceExcludingVatCurrency: spec.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183323603Z-7249988d/scripts/sandbox_reverse_payment_proof.ts:106:          unitPriceExcludingVatCurrency: exVatAmount,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/create-order-invoice-pay.ts:9:  { label: "Sesión de formación", ref: "8488", unitPriceExcludingVatCurrency: 5700 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/create-order-invoice-pay.ts:10:  { label: "Horas de consultoría", ref: "3787", unitPriceExcludingVatCurrency: 14750 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/create-order-invoice-pay.ts:56:  unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/create-order-invoice-pay.ts:290:    const expected = PRODUCT_SPECS.reduce((sum, spec) => sum + spec.unitPriceExcludingVatCurrency, 0);
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/create-order-invoice-pay.ts:324:    if (line.unitPriceExcludingVatCurrency !== undefined) {
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/create-order-invoice-pay.ts:326:        line.unitPriceExcludingVatCurrency === spec.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/create-order-invoice-pay.ts:406:      unitPriceExcludingVatCurrency: spec.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts/create-order-invoice-pay.ts:450:          unitPriceExcludingVatCurrency: PRODUCT_SPECS[index].unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/sandbox_proof_exact_number_invoice_path.ts:242:  const created = await api("POST", "invoice", {
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/sandbox_proof_exact_number_invoice_path.ts:248:      invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/sandbox_proof_exact_number_invoice_path.ts:259:            unitPriceExcludingVatCurrency: target.priceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts:16:    unitPriceExcludingVatCurrency: 2850,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts:22:    unitPriceExcludingVatCurrency: 2650,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts:28:    unitPriceExcludingVatCurrency: 7400,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts:34:  (sum, line) => sum + line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts:40:    line.unitPriceExcludingVatCurrency * (1 + line.vatPercentage / 100),
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts:418:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts:431:            unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221643357Z-96005f2d/scripts/create_invoice_havbris.ts:516:  return await api<Record<string, unknown>>("POST", "invoice", {
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135154579Z-837cd40b/scripts/sandbox-verify-reverse-customer-invoice-payment.ts:111:          unitPriceExcludingVatCurrency: 1000,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-161046877Z-7a5a61d5/scripts/task.ts:229:        unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-161046877Z-7a5a61d5/scripts/reflection-sandbox.ts:149:        unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184002643Z-28bd654b/scripts/sandbox-credit-note-reflection.ts:181:        invoiceDueDate: "2026-04-03",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184002643Z-28bd654b/scripts/sandbox-credit-note-reflection.ts:192:                unitPriceExcludingVatCurrency: TARGET_AMOUNT_EX_VAT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/sandbox_verify_create_customer_invoice.ts:181:      invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/sandbox_verify_create_customer_invoice.ts:192:            unitPriceExcludingVatCurrency: line.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/run.ts:13:    unitPriceExcludingVatCurrency: 27500,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/run.ts:19:    unitPriceExcludingVatCurrency: 3900,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/run.ts:25:    unitPriceExcludingVatCurrency: 3400,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/run.ts:230:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/run.ts:241:          unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164234744Z-dedde543/scripts/sandbox-verify-credit-note-path.ts:109:      invoiceDueDate: dueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164234744Z-dedde543/scripts/sandbox-verify-credit-note-path.ts:120:              unitPriceExcludingVatCurrency: targetAmount,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/sandbox_invoice_variant_addendum.ts:155:  unitPriceExcludingVatCurrency: line.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/sandbox_invoice_variant_addendum.ts:163:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/sandbox_invoice_variant_addendum.ts:180:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/sandbox_invoice_variant_addendum.ts:196:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/sandbox_invoice_variant_addendum.ts:208:          unitPriceExcludingVatCurrency: line.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/sandbox_exhaust_invoice_variants.ts:224:      unitPriceExcludingVatCurrency: line.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220416308Z-5452345a/scripts/sandbox_exhaust_invoice_variants.ts:237:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-200743664Z-ca50ecdc/scripts/set_project_fixed_price_and_invoice_partial_payment.ts:340:            unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-200743664Z-ca50ecdc/scripts/sandbox-proof-fixed-price-project-first.ts:227:        unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819645Z-9f5748e9/scripts/create_invoice.ts:12:  { description: "Analysis Report", productNumber: "9796", unitPriceExcludingVatCurrency: 27700, vatPercentage: 25 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819645Z-9f5748e9/scripts/create_invoice.ts:13:  { description: "Maintenance", productNumber: "2145", unitPriceExcludingVatCurrency: 12700, vatPercentage: 15 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819645Z-9f5748e9/scripts/create_invoice.ts:14:  { description: "System Development", productNumber: "5995", unitPriceExcludingVatCurrency: 7050, vatPercentage: 0 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819645Z-9f5748e9/scripts/create_invoice.ts:17:const EXPECTED_AMOUNT_EX_VAT = LINES.reduce((sum, line) => sum + line.unitPriceExcludingVatCurrency, 0);
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819645Z-9f5748e9/scripts/create_invoice.ts:19:  (sum, line) => sum + line.unitPriceExcludingVatCurrency * (1 + line.vatPercentage / 100),
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819645Z-9f5748e9/scripts/create_invoice.ts:309:      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819645Z-9f5748e9/scripts/create_invoice.ts:316:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819645Z-9f5748e9/scripts/sandbox_verify_oakwood_invoice_reflection.ts:239:    invoiceDueDate: DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164819645Z-9f5748e9/scripts/sandbox_verify_oakwood_invoice_reflection.ts:250:          unitPriceExcludingVatCurrency: line.amount,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221935135Z-67b1e44b/scripts/sandbox_chargeable_proof.ts:152:        unitPriceExcludingVatCurrency: RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221935135Z-67b1e44b/scripts/sandbox_nonchargeable_proof.ts:131:        unitPriceExcludingVatCurrency: RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221935135Z-67b1e44b/scripts/run.ts:299:          unitPriceExcludingVatCurrency: RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-130812019Z-b9b7ee26/scripts/create_order_invoice_pay.ts:133:        unitPriceExcludingVatCurrency: 20900,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-130812019Z-b9b7ee26/scripts/create_order_invoice_pay.ts:139:        unitPriceExcludingVatCurrency: 18350,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-130812019Z-b9b7ee26/scripts/pay_existing_invoice.ts:27:  unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-130812019Z-b9b7ee26/scripts/pay_existing_invoice.ts:80:      line.unitPriceExcludingVatCurrency === 20900,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-130812019Z-b9b7ee26/scripts/pay_existing_invoice.ts:86:      line.unitPriceExcludingVatCurrency === 18350,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222820469Z-288ee29e/scripts/sandbox-proof-498050-partial.ts:314:              unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-184949556Z-a5fce89a/scripts/sandbox-verify-reverse-payment-account-null.ts:140:          unitPriceExcludingVatCurrency: 1000,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222820469Z-288ee29e/scripts/run.ts:325:          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222135740Z-77300026/scripts/set-project-fixed-price-and-invoice-partial-payment.ts:347:          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222135740Z-77300026/scripts/sandbox-proof-skip-put-fixed-price-partial.ts:89:          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-160449149Z-30295d99/scripts/sandbox_prove_invoice_task.ts:198:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-160449149Z-30295d99/scripts/sandbox_prove_invoice_task.ts:209:          unitPriceExcludingVatCurrency: spec.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-160449149Z-30295d99/scripts/create_customer_invoice.ts:11:  { ref: "3644", description: "Maintenance", unitPriceExcludingVatCurrency: 1850, vatPercentage: 25 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-160449149Z-30295d99/scripts/create_customer_invoice.ts:12:  { ref: "4934", description: "Licence logicielle", unitPriceExcludingVatCurrency: 14850, vatPercentage: 15 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-160449149Z-30295d99/scripts/create_customer_invoice.ts:13:  { ref: "8806", description: "Service réseau", unitPriceExcludingVatCurrency: 17250, vatPercentage: 0 },
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-160449149Z-30295d99/scripts/create_customer_invoice.ts:232:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-160449149Z-30295d99/scripts/create_customer_invoice.ts:243:          unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222435186Z-5db75c99/scripts/sandbox_verify_high_hour_split.ts:254:          unitPriceExcludingVatCurrency: RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222435186Z-5db75c99/scripts/run.ts:351:          unitPriceExcludingVatCurrency: RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183326696Z-cbd272e6/scripts/sandbox_verify_create_send_invoice.ts:6:const invoiceDueDate = addDays(invoiceDate, 14);
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183326696Z-cbd272e6/scripts/sandbox_verify_create_send_invoice.ts:64:    invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183326696Z-cbd272e6/scripts/sandbox_verify_create_send_invoice.ts:75:            unitPriceExcludingVatCurrency: amountExcludingVat,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131502143Z-73ec8a8f/scripts/set-fixed-price-and-invoice.ts:196:          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183326696Z-cbd272e6/scripts/create_send_invoice.ts:5:const invoiceDueDate = addDays(invoiceDate, 14);
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183326696Z-cbd272e6/scripts/create_send_invoice.ts:53:    invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183326696Z-cbd272e6/scripts/create_send_invoice.ts:64:            unitPriceExcludingVatCurrency: amountExVat,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131502143Z-73ec8a8f/scripts/sandbox-verify-fixed-price-bank-repair.ts:151:          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/sandbox_prove_existing_invoice_4call.ts:30:  unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/sandbox_prove_existing_invoice_4call.ts:147:    invoiceDueDate: DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/sandbox_prove_existing_invoice_4call.ts:158:          unitPriceExcludingVatCurrency: line.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/sandbox_prove_existing_invoice_4call.ts:201:        unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/create_invoice_bolgekraft.ts:52:  unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/create_invoice_bolgekraft.ts:77:  unitPriceExcludingVatCurrency: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/create_invoice_bolgekraft.ts:85:    unitPriceExcludingVatCurrency: 27000,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/create_invoice_bolgekraft.ts:91:    unitPriceExcludingVatCurrency: 9300,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/create_invoice_bolgekraft.ts:97:    unitPriceExcludingVatCurrency: 16300,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/create_invoice_bolgekraft.ts:366:      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/create_invoice_bolgekraft.ts:378:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/create_invoice_bolgekraft.ts:477:    if (matching.unitPriceExcludingVatCurrency !== expected.unitPriceExcludingVatCurrency) {
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/create_invoice_bolgekraft.ts:479:        `Wrong unit price on ${expected.ref}: expected ${expected.unitPriceExcludingVatCurrency}, got ${matching.unitPriceExcludingVatCurrency}`,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/create_invoice_bolgekraft.ts:511:      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/sandbox_prove_invoice_flow.ts:49:  unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/sandbox_prove_invoice_flow.ts:249:    unitPriceExcludingVatCurrency: spec.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/sandbox_prove_invoice_flow.ts:254:    invoiceDueDate: DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-151341523Z-1e345deb/scripts/sandbox_prove_invoice_flow.ts:337:            unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/sandbox_verify_ambiguous_customer_invoice_path.ts:20:    unitPriceExcludingVatCurrency: 29800,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/sandbox_verify_ambiguous_customer_invoice_path.ts:26:    unitPriceExcludingVatCurrency: 5200,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/sandbox_verify_ambiguous_customer_invoice_path.ts:32:    unitPriceExcludingVatCurrency: 18050,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/sandbox_verify_ambiguous_customer_invoice_path.ts:149:        priceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/sandbox_verify_ambiguous_customer_invoice_path.ts:212:        invoiceDueDate: DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/sandbox_verify_ambiguous_customer_invoice_path.ts:223:              unitPriceExcludingVatCurrency:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/sandbox_verify_ambiguous_customer_invoice_path.ts:224:                ANALOG_LINES[index].unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/create_customer_invoice.ts:16:    unitPriceExcludingVatCurrency: 29800,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/create_customer_invoice.ts:22:    unitPriceExcludingVatCurrency: 5200,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/create_customer_invoice.ts:28:    unitPriceExcludingVatCurrency: 18050,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/create_customer_invoice.ts:192:      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-164443065Z-17460256/scripts/create_customer_invoice.ts:199:    invoiceDueDate: DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202049737Z-a3ffdc72/scripts/run.ts:359:          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202049737Z-a3ffdc72/scripts/sandbox-proof.ts:326:          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223526134Z-ab23f4db/scripts/run.ts:245:        unitPriceExcludingVatCurrency: wanted.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223526134Z-ab23f4db/scripts/sandbox_prove_order_invoice_payment.ts:152:      unitPriceExcludingVatCurrency: wanted.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223254465Z-414fdf78/scripts/sandbox-proof-current-shape.ts:138:        unitPriceExcludingVatCurrency: RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223254465Z-414fdf78/scripts/run.ts:396:          unitPriceExcludingVatCurrency: HOURLY_RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/run.ts:371:          unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-130812019Z-b9b7ee26/scripts/sandbox_verify_order_invoice_payment.ts:80:          unitPriceExcludingVatCurrency: 5700,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-130812019Z-b9b7ee26/scripts/sandbox_verify_order_invoice_payment.ts:86:          unitPriceExcludingVatCurrency: 14750,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/sandbox-proof-skip-project-put.ts:326:              unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220947811Z-96532526/scripts/sandbox-proof.ts:367:              unitPriceExcludingVatCurrency: PARTIAL_AMOUNT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183646352Z-6e6fefe0/scripts/sandbox-credit-note-proof.ts:182:      invoiceDueDate: DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183646352Z-6e6fefe0/scripts/sandbox-credit-note-proof.ts:193:              unitPriceExcludingVatCurrency: TARGET.amountExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/create_invoice_riviere.ts:12:    unitPriceExcludingVatCurrency: 28100,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/create_invoice_riviere.ts:19:    unitPriceExcludingVatCurrency: 12600,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/create_invoice_riviere.ts:26:    unitPriceExcludingVatCurrency: 1800,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/create_invoice_riviere.ts:200:  const invoiceDueDate = addDays(INVOICE_DATE, 14);
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/create_invoice_riviere.ts:310:      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/create_invoice_riviere.ts:317:    invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/create_invoice_riviere.ts:347:      unitPriceExcludingVatCurrency: line?.unitPriceExcludingVatCurrency ?? null,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220623442Z-71f64784/scripts/sandbox_verify_reverse_customer_invoice_payment.ts:226:        invoiceDueDate: DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-220623442Z-71f64784/scripts/sandbox_verify_reverse_customer_invoice_payment.ts:237:                unitPriceExcludingVatCurrency: TARGET.amountExVat,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/sandbox_verify_invoice_fast_path.ts:247:        invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/sandbox_verify_invoice_fast_path.ts:258:              unitPriceExcludingVatCurrency: spec.priceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/sandbox_verify_invoice_fast_path.ts:312:            unitPriceExcludingVatCurrency: line?.unitPriceExcludingVatCurrency ?? null,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/sandbox_verify_invoice_product_link_path.ts:198:        invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/sandbox_verify_invoice_product_link_path.ts:209:              unitPriceExcludingVatCurrency: spec.priceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/sandbox_verify_invoice_product_link_path.ts:262:            unitPriceExcludingVatCurrency: line?.unitPriceExcludingVatCurrency ?? null,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-125301992Z-a332a753/scripts/verify_invoice_riviere.ts:48:          unitPriceExcludingVatCurrency: line?.unitPriceExcludingVatCurrency ?? null,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/create_customer_invoice.ts:42:  unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/create_customer_invoice.ts:69:    unitPriceExcludingVatCurrency: 19600,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/create_customer_invoice.ts:75:    unitPriceExcludingVatCurrency: 12450,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/create_customer_invoice.ts:81:    unitPriceExcludingVatCurrency: 9150,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/create_customer_invoice.ts:87:  (sum, line) => sum + line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/create_customer_invoice.ts:93:    line.unitPriceExcludingVatCurrency * (1 + line.vatPercentage / 100),
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/create_customer_invoice.ts:155:      typeof line.unitPriceExcludingVatCurrency === "number" &&
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/create_customer_invoice.ts:171:        almostEqual(line.unitPriceExcludingVatCurrency, expected.unitPriceExcludingVatCurrency) &&
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/create_customer_invoice.ts:343:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/create_customer_invoice.ts:364:            unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/sandbox_create_customer_invoice_probe.ts:32:  unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/sandbox_create_customer_invoice_probe.ts:122:    invoiceDueDate: "2026-04-03",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/sandbox_create_customer_invoice_probe.ts:133:          unitPriceExcludingVatCurrency: product.priceExcludingVatCurrency ?? index + 1,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503625Z-8edc0028/scripts/sandbox_create_customer_invoice_probe.ts:212:        unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223723539Z-b9572091/scripts/probe-omit-vat.ts:51:      invoiceDueDate: "2026-04-03",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223723539Z-b9572091/scripts/probe-omit-vat.ts:62:              unitPriceExcludingVatCurrency: 34100,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223723539Z-b9572091/scripts/run.ts:5:const invoiceDueDate = "2026-04-03";
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223723539Z-b9572091/scripts/run.ts:113:    invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223723539Z-b9572091/scripts/run.ts:124:            unitPriceExcludingVatCurrency: amountExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-163628397Z-e88605ae/scripts/create-order-invoice-pay.ts:272:        unitPriceExcludingVatCurrency: item.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-163628397Z-e88605ae/scripts/sandbox-verify-order-invoice-payment.ts:94:      unitPriceExcludingVatCurrency: 5700,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-163628397Z-e88605ae/scripts/sandbox-verify-order-invoice-payment.ts:100:      unitPriceExcludingVatCurrency: 6950,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223723539Z-b9572091/scripts/verify-create-send.ts:6:const invoiceDueDate = "2026-04-03";
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223723539Z-b9572091/scripts/verify-create-send.ts:132:    invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223723539Z-b9572091/scripts/verify-create-send.ts:143:            unitPriceExcludingVatCurrency: 34100,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135605080Z-755a7fa2/scripts/run.ts:408:        unitPriceExcludingVatCurrency: RATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/create_invoice_floresta.ts:17:    unitPriceExcludingVatCurrency: 24900,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/create_invoice_floresta.ts:23:    unitPriceExcludingVatCurrency: 14050,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/create_invoice_floresta.ts:29:    unitPriceExcludingVatCurrency: 15750,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/create_invoice_floresta.ts:272:      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/create_invoice_floresta.ts:279:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/create_invoice_floresta.ts:347:        Number(line.unitPriceExcludingVatCurrency) === expected.unitPriceExcludingVatCurrency &&
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/create_invoice_floresta.ts:387:        invoiceDueDate: invoice.invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-201702224Z-93727a4a/scripts/verify_credit_note_sandbox.ts:131:      invoiceDueDate: runDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-201702224Z-93727a4a/scripts/verify_credit_note_sandbox.ts:142:              unitPriceExcludingVatCurrency: amountExcludingVat,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/sandbox_prove_create_customer_invoice.ts:19:    unitPriceExcludingVatCurrency: 24900,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/sandbox_prove_create_customer_invoice.ts:24:    unitPriceExcludingVatCurrency: 14050,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/sandbox_prove_create_customer_invoice.ts:29:    unitPriceExcludingVatCurrency: 15750,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/sandbox_prove_create_customer_invoice.ts:129:        priceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/sandbox_prove_create_customer_invoice.ts:189:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/sandbox_prove_create_customer_invoice.ts:200:          unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-154433919Z-c844c6eb/scripts/sandbox_prove_create_customer_invoice.ts:276:    unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-145823778Z-b5869355/scripts/sandbox_verify_credit_note.ts:173:    invoiceDueDate: "2026-04-03",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-145823778Z-b5869355/scripts/sandbox_verify_credit_note.ts:184:            unitPriceExcludingVatCurrency: 12000,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-224559410Z-50b33b90/scripts/register-polaris-payment.ts:59:  invoiceDueDate?: string;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-211943971Z-aca7a086/scripts/create_and_send_invoice.ts:55:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-211943971Z-aca7a086/scripts/create_and_send_invoice.ts:66:            unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-224559410Z-50b33b90/scripts/sandbox-verify-register-invoice-payment.ts:159:    invoiceDueDate: "2026-04-02",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-224559410Z-50b33b90/scripts/sandbox-verify-register-invoice-payment.ts:170:            unitPriceExcludingVatCurrency: 15200,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-211943971Z-aca7a086/scripts/sandbox_prove_create_and_send_invoice.ts:48:      invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-211943971Z-aca7a086/scripts/sandbox_prove_create_and_send_invoice.ts:59:              unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221651369Z-1afff2f2/scripts/run.ts:5:const invoiceDueDate = addDays(invoiceDate, 14);
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221651369Z-1afff2f2/scripts/run.ts:45:    invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221651369Z-1afff2f2/scripts/run.ts:56:            unitPriceExcludingVatCurrency: amountExcludingVat,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221651369Z-1afff2f2/scripts/sandbox_probe_french_ex_vat.ts:6:const invoiceDueDate = addDays(invoiceDate, 14);
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221651369Z-1afff2f2/scripts/sandbox_probe_french_ex_vat.ts:106:    invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221651369Z-1afff2f2/scripts/sandbox_probe_french_ex_vat.ts:117:            unitPriceExcludingVatCurrency: amountExcludingVat,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190852606Z-d16e2731/scripts/post-run-reverse-proof.ts:193:          unitPriceExcludingVatCurrency: amountExcludingVat,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-162059824Z-e71cd397/scripts/create-order-invoice-pay.ts:248:          unitPriceExcludingVatCurrency: line.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190409614Z-462506c3/scripts/run.ts:5:const invoiceDueDate = "2026-04-03";
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190409614Z-462506c3/scripts/run.ts:123:    invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190409614Z-462506c3/scripts/run.ts:134:            unitPriceExcludingVatCurrency: amountExcludingVat,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-162059824Z-e71cd397/scripts/verify-create-order-invoice-pay-sandbox.ts:123:        unitPriceExcludingVatCurrency: line.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190409614Z-462506c3/scripts/sandbox-verify-create-and-send-standard-vat.ts:6:const invoiceDueDate = "2026-04-03";
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190409614Z-462506c3/scripts/sandbox-verify-create-and-send-standard-vat.ts:73:    unitPriceExcludingVatCurrency: 20100,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-190409614Z-462506c3/scripts/sandbox-verify-create-and-send-standard-vat.ts:92:      invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183037920Z-fcc24ae9/scripts/create-credit-note.ts:28:  unitPriceExcludingVatCurrency?: number;
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183037920Z-fcc24ae9/scripts/create-credit-note.ts:78:      approxEqual(line.unitPriceExcludingVatCurrency, TARGET_AMOUNT_EX_VAT)
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183037920Z-fcc24ae9/scripts/create-credit-note.ts:84:      typeof line.unitPriceExcludingVatCurrency === "number" &&
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183037920Z-fcc24ae9/scripts/create-credit-note.ts:86:      approxEqual(line.unitPriceExcludingVatCurrency * line.count, TARGET_AMOUNT_EX_VAT)
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183037920Z-fcc24ae9/scripts/sandbox-verify-credit-note-dataradgjeving.ts:99:      invoiceDueDate: addDays(TODAY, 14),
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-183037920Z-fcc24ae9/scripts/sandbox-verify-credit-note-dataradgjeving.ts:110:              unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-162453083Z-f4543b2f/scripts/create_invoice.ts:260:      unitPriceExcludingVatCurrency: wanted.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-162453083Z-f4543b2f/scripts/create_invoice.ts:267:    invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/create-and-send-customer-invoice.ts:5:const invoiceDueDate = "2026-04-03";
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/create-and-send-customer-invoice.ts:118:  invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/create-and-send-customer-invoice.ts:129:          unitPriceExcludingVatCurrency: amountExcludingVat,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/create-and-send-customer-invoice.ts:210:    const invoice = await request("POST", "invoice", invoicePayload);
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/create-and-send-customer-invoice.ts:230:    const invoice = await request("POST", "invoice", invoicePayload);
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/resume-create-and-send-customer-invoice.ts:5:const invoiceDueDate = "2026-04-03";
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/resume-create-and-send-customer-invoice.ts:68:  const invoice = await request("POST", "invoice", {
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/resume-create-and-send-customer-invoice.ts:70:    invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/resume-create-and-send-customer-invoice.ts:81:            unitPriceExcludingVatCurrency: 7250,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/sandbox-verify-create-and-send-customer-invoice.ts:6:const invoiceDueDate = "2026-04-03";
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/sandbox-verify-create-and-send-customer-invoice.ts:98:  const invoice = await request("POST", "invoice", {
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/sandbox-verify-create-and-send-customer-invoice.ts:100:    invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/sandbox-verify-create-and-send-customer-invoice.ts:111:            unitPriceExcludingVatCurrency: 7250,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-132044599Z-64f82378/scripts/create-order-invoice-pay.ts:165:          unitPriceExcludingVatCurrency: 36900,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-132044599Z-64f82378/scripts/create-order-invoice-pay.ts:171:          unitPriceExcludingVatCurrency: 19450,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-132044599Z-64f82378/scripts/sandbox-verify-order-invoice-payment.ts:154:          unitPriceExcludingVatCurrency: 36900,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-132044599Z-64f82378/scripts/sandbox-verify-order-invoice-payment.ts:160:          unitPriceExcludingVatCurrency: 19450,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-162453083Z-f4543b2f/scripts/sandbox_verify_create_invoice.ts:258:      unitPriceExcludingVatCurrency: wanted.price,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-162453083Z-f4543b2f/scripts/sandbox_verify_create_invoice.ts:270:          invoiceDueDate: INVOICE_DUE_DATE,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223029044Z-952b9df9/scripts/verify_credit_note_path_sandbox.ts:12:  invoiceDueDate: "2026-04-03",
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223029044Z-952b9df9/scripts/verify_credit_note_path_sandbox.ts:119:      invoiceDueDate: FIXTURE.invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223029044Z-952b9df9/scripts/verify_credit_note_path_sandbox.ts:130:              unitPriceExcludingVatCurrency: FIXTURE.amountExcludingVatCurrency,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223925860Z-12c28001/scripts/create_and_send_invoice.ts:5:const invoiceDueDate = "2026-04-03";
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223925860Z-12c28001/scripts/create_and_send_invoice.ts:121:  return request("POST", "invoice", {
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223925860Z-12c28001/scripts/create_and_send_invoice.ts:124:      invoiceDueDate,
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223925860Z-12c28001/scripts/create_and_send_invoice.ts:135:              unitPriceExcludingVatCurrency: amountExcludingVat,

```

## 2026-03-20T22:50:15.597Z tool_result
tool: exec_command
call_id: call_aE8vp9D7f9McNSnigXH4HNbj

```text
Command: /run/current-system/sw/bin/zsh -lc "rg -n \"ohne MwSt|sem IVA|hors TVA|without VAT|0%\" trusted-standards task-playbooks /home/jorge/repos/ainm/tasks/tripletex/data/production/runs -g '*.md' -g '*.ts' | head -n 80"
Chunk ID: 32480c
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 5757
Output:
task-playbooks/register-project-hours-and-create-project-invoice.md:39:- a same-session persistent-sandbox re-proof on 2026-03-20 with current-task arithmetic `5` hours at `1400` on that same non-chargeable analog showed that omitting the manual project-order-line `vatType` can collapse the branch to `6` calls and still return `amountExcludingVatCurrency=7000` / `amountCurrencyOutstanding=7000` when the account exposes only outgoing VAT row `id=6` (`0%`)
task-playbooks/register-project-hours-and-create-project-invoice.md:40:- that shortcut is still not the trusted scored-run default for taxable accounts; same-day direct-line invoice/order proofs elsewhere in the corpus still showed that omitted `vatType` can silently create a wrong no-VAT result on `0%`-only accounts
task-playbooks/register-project-hours-and-create-project-invoice.md:74:- in the same sandbox account, `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
task-playbooks/register-project-hours-and-create-project-invoice.md:278:- Do not generalize the `0%`-only sandbox shortcut of omitting `orderLines[].vatType`; taxable accounts can still silently create a wrong no-VAT invoice, so the default scored path keeps `GET /ledger/vatType`
trusted-standards/register-project-hours-and-create-project-invoice.md:66:- do not drop `GET /ledger/vatType` from the scored default just because a `0%`-only sandbox accepts an omitted line `vatType`; that shortcut can silently create the wrong VAT result on taxable accounts
trusted-standards/register-project-hours-and-create-project-invoice.md:139:  - a same-session persistent-sandbox re-proof on 2026-03-20 with current-task arithmetic `5` hours at rate `1400` on that same non-chargeable analog showed that omitting the manual project-order-line `vatType` can collapse the branch to `6` calls and still return `amountExcludingVatCurrency=7000` / `amountCurrencyOutstanding=7000` when the account exposes only outgoing VAT row `id=6` (`0%`)
trusted-standards/register-project-hours-and-create-project-invoice.md:140:  - that shortcut is still not the trusted scored-run default for taxable accounts; same-day direct-line invoice/order proofs elsewhere in the corpus still showed that omitted `vatType` can silently create a wrong no-VAT result on `0%`-only accounts
task-playbooks/create-and-send-customer-invoice.md:68:The same rule is language-agnostic for explicit no-VAT prompts. The 2026-03-20 production run for Portuguese `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` / `sem IVA` also succeeded in the same `3` calls:
task-playbooks/create-and-send-customer-invoice.md:127:- in that sandbox account, the filtered outgoing VAT result for the same date only exposed VAT code `6` (`0%`)
task-playbooks/create-and-send-customer-invoice.md:135:- resolve the filtered outgoing `0%` VAT row that actually exists in the current account
task-playbooks/create-and-send-customer-invoice.md:143:The 2026-03-20 production run for Portuguese `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` / `sem IVA` and the same-day persistent sandbox re-check on analogous org `842889155` reconfirmed the same branch:
task-playbooks/create-and-send-customer-invoice.md:146:- filtered outgoing VAT read returning code `6` (`0%`)
task-playbooks/create-and-send-customer-invoice.md:155:- if the filtered result exposes only `0%`, treat the run as blocked in that account instead of downgrading the invoice to `0%`
task-playbooks/create-and-send-customer-invoice.md:156:- French `hors TVA` and Norwegian `eksklusiv MVA` belong to this taxed ex-VAT branch. Do not misread them as `sans TVA` / `0%`.
task-playbooks/create-and-send-customer-invoice.md:161:- the French production run for `Colline SARL` / `944164340` / `Service réseau` / `44750` / `hors TVA` also succeeded in the same `3` calls and confirms the same taxed branch
task-playbooks/create-and-send-customer-invoice.md:164:- the persistent sandbox on the same date still exposed only VAT code `6` (`0%`)
task-playbooks/create-and-send-customer-invoice.md:168:- on the later same-day sandbox analog `Lumière Reflection b9572091 SARL` / `957223729`, the filtered outgoing VAT read still exposed only code `6` (`0%`), and omitting `orderLines[].vatType` on the exact `34100` line again created a wrong untaxed `34100` total, so that sandbox state remained blocked for the taxed branch rather than a lower-call replacement
task-playbooks/create-and-send-customer-invoice.md:169:- on the same-day sandbox analog `Nordhav Reflection 12c28001 AS` / `999280012` / `Analyserapport` / `7850`, the filtered outgoing VAT read for `2026-03-20` still exposed only code `6` (`0%`), so the exact Norwegian `eksklusiv MVA` branch remained blocked there rather than a valid no-VAT shortcut
task-playbooks/create-and-send-customer-invoice.md:192:   - this also applies to explicit no-VAT direct-line prompts; resolve the filtered outgoing `0%` row instead of assuming omission is equivalent
trusted-standards/create-and-send-customer-invoice.md:46:- for explicit no-VAT / `0%` direct-line prompts, still resolve the current account's filtered outgoing `0%` VAT row instead of assuming omission is equivalent
trusted-standards/create-and-send-customer-invoice.md:47:- for ordinary direct-line services explicitly priced excluding VAT / MVA, select an exact `25%` row from the filtered outgoing VAT result; if no such row exists, treat the task as blocked in that account instead of falling back to `0%`
trusted-standards/create-and-send-customer-invoice.md:76:- the same exact no-VAT branch also covers Portuguese wording such as `sem IVA`; the 2026-03-20 production run for `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` used the same `3` calls and did not need `GET /customer` or `PUT /invoice/{id}/:send`
trusted-standards/create-and-send-customer-invoice.md:77:- for ordinary one-line service prompts that explicitly price the work excluding VAT / MVA, do not take the first filtered VAT row if it is `0%`; the safe branch is exact `25%` selection or a blocked conclusion for that account
trusted-standards/create-and-send-customer-invoice.md:80:- French wording such as `hors TVA` belongs to that same taxed ex-VAT branch, not the no-VAT branch. The 2026-03-20 production run for `Colline SARL` / `944164340` / `Service réseau` / `44750` succeeded in the canonical `3` calls, while the same-day persistent sandbox still exposed only `0%`, produced a wrong untaxed `44750` total when `vatType` was omitted, and rejected hardcoded `vatType.id=3` with `422`.
trusted-standards/create-and-send-customer-invoice.md:81:- Norwegian wording such as `eksklusiv MVA` belongs to that same taxed ex-VAT branch, not the no-VAT branch. The 2026-03-20 persistent-sandbox analog `Nordhav Reflection 12c28001 AS` / `999280012` / `Analyserapport` / `7850` still exposed only VAT code `6` (`0%`) on the filtered outgoing VAT read for `2026-03-20`, so that sandbox state remains blocked for the taxed branch rather than a valid lower-call shortcut.
trusted-standards/create-and-send-customer-invoice.md:92:  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
trusted-standards/create-and-send-customer-invoice.md:97:  - the persistent sandbox still exposed only VAT code `6` (`0%`) for the same date, so the exact same prompt shape would be blocked there for standard VAT rather than downgraded to `0%`
trusted-standards/create-and-send-customer-invoice.md:98:  - the French prompt variant `Colline SARL` / `944164340` / `Service réseau` / `44750` / `hors TVA` succeeded in the same canonical `3` calls in production and confirms that `hors TVA` must be normalized to ordinary taxed ex-VAT handling, not `0%`
trusted-standards/create-and-send-customer-invoice.md:102:  - the same-day persistent sandbox analog `Lumière Reflection b9572091 SARL` / `957223729` still exposed only VAT code `6` (`0%`); for that exact `34100` line, omitting `orderLines[].vatType` created a wrong untaxed `34100` total, so that sandbox account remains blocked for the taxed branch rather than a valid shortcut
trusted-standards/create-and-send-customer-invoice.md:103:  - the same-day persistent sandbox analog `Nordhav Reflection 12c28001 AS` / `999280012` / `Analyserapport` / `7850` re-confirmed that Norwegian wording `eksklusiv MVA` follows the same taxed branch: after the standard `POST /customer`, the filtered outgoing VAT read for `2026-03-20` still exposed only code `6` (`0%`), so that sandbox account remained blocked for the taxed branch rather than a no-VAT fallback
trusted-standards/create-and-send-customer-invoice.md:104:  - a same-day persistent sandbox control re-check on the provided follow-up sandbox still exposed only VAT code `6` (`0%`) for `2026-03-20`; the exact taxed `7250` branch therefore remained blocked there, but the surrounding create-and-send mechanics still re-proved cleanly in `3` calls on a control line by using the available `0%` row with the same `POST /customer` -> filtered `GET /ledger/vatType` -> `POST /invoice` flow
trusted-standards/create-and-send-customer-invoice.md:106:  - fresh-account-style branch: on the same one-line `22700` / `Design web` / `0%` shape, direct `POST /customer` with `invoiceSendMethod=MANUAL`, then `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`, then `POST /invoice` succeeded without any customer pre-read
trusted-standards/create-and-send-customer-invoice.md:107:  - the filtered VAT read returned only code `6` (`0%`)
trusted-standards/create-and-send-customer-invoice.md:111:  - production run `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` / `sem IVA` succeeded in the canonical `3` calls: direct `POST /customer` with `invoiceSendMethod=MANUAL`, filtered outgoing VAT read, then `POST /invoice`
trusted-standards/create-and-send-customer-invoice.md:113:  - persistent sandbox re-check on the analogous fresh-customer `842889155` shape returned VAT code `6` (`0%`) and the same `11200` / `11200` totals through the same `3` calls, again without any customer pre-read or explicit `:send` call
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:55:  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` still returned only VAT code `6` (`0%`) in that account
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:68:  - omitting `orderLines[].vatType` on the same sandbox account also succeeded only because `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` exposed a single valid `0%` row; that omission is still not a trusted scored-run shortcut
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:69:- exact production reflection on 2026-03-20 for `Tindra AS` / `870827946` / `Nettbutikk-utvikling` / `kristian.nilsen@example.org` / `181650` / `50%`, followed by sandbox re-proof on the same date, showed the concrete efficiency miss:
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:77:  - the sandbox still exposed only filtered outgoing VAT code `6` (`0%`), yet the invoice write still proved `amountExcludingVatCurrency=123832.5` and `amountCurrencyOutstanding=123832.5`
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:84:  - that sandbox still exposed only outgoing VAT `0%`, so the analog invoice returned `amountExcludingVatCurrency=31387.5` and `amountCurrencyOutstanding=31387.5`
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:86:- exact production confirmation on 2026-03-20 for `Fossekraft AS` / `907433498` / `Automatiseringsprosjekt` / `solveig.eide@example.org` / `430750` / `50%`, plus a same-day persistent-sandbox analog proof on existing fixture `Estrella SL` / `816896770` / `Desarrollo e-commerce` / `375250` / `33%`, closed the last efficiency question on the skip-`PUT` branch:
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:92:- later production reflection on 2026-03-20 for `Sjøbris AS` / `825338756` / `Automatiseringsprosjekt` / `knut.kvamme@example.org` / `316000` / `50%`, plus a same-day persistent-sandbox analog proof, exposed the remaining branch tradeoff:
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:97:- a same-session persistent-sandbox analog on 2026-03-20 with current-task arithmetic `498050 * 50% = 249025` re-confirmed that the conditional floor did not move:
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:152:   - if the filtered result only exposes `0%`, use that one valid row rather than guessing another VAT code
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:153:   - even if omitting `vatType` happens to work in a sandbox that only exposes one `0%` row, do not treat that as the scored-run fast path
task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:274:- Do not blindly choose the highest outgoing VAT percentage when the filtered result already shows the account only allows `0%` on the invoice date
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:64:- if the filtered outgoing VAT result only exposes `0%`, use that one valid row instead of guessing another VAT code
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:109:  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` may expose only VAT code `6` (`0%`) in that account
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:116:  - omitting `orderLines[].vatType` on the same sandbox account also succeeded only because the filtered outgoing VAT list exposed a single `0%` row; do not generalize that as the trusted scored-run shortcut
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:120:- exact production reflection on 2026-03-20 for `Tindra AS` / `870827946` / `Nettbutikk-utvikling` / `kristian.nilsen@example.org` / `181650` / `50%` plus persistent-sandbox proof on the same date established the opposite branch for already-configured accounts:
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:128:  - that sandbox account still exposed only the filtered outgoing `0%` VAT row (`id=6`), and the invoice write still returned `amountExcludingVatCurrency=123832.5` plus `amountCurrencyOutstanding=123832.5`
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:134:  - that sandbox still exposed only outgoing VAT `0%`, so the analog invoice returned `amountExcludingVatCurrency=31387.5` and `amountCurrencyOutstanding=31387.5`
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:136:- exact production confirmation on 2026-03-20 for `Fossekraft AS` / `907433498` / `Automatiseringsprosjekt` / `solveig.eide@example.org` / `430750` / `50%` proved that the same skip-`PUT /project` branch is also the true minimum on a taxable account:
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:141:- later production reflection on 2026-03-20 for `Sjøbris AS` / `825338756` / `Automatiseringsprosjekt` / `knut.kvamme@example.org` / `316000` / `50%`, plus a same-day persistent-sandbox analog proof, sharpened the remaining bank-account heuristic on the update-needed branch:
trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:149:  - the sandbox still exposed only outgoing `0%` VAT on that date, and both proof invoices returned `amountExcludingVatCurrency=249025`
trusted-standards/create-product.md:13:- localized excluding-VAT wording such as Portuguese `sem IVA` or Spanish `sin IVA` still clearly maps to the excluding-VAT price field
trusted-standards/create-product.md:40:- do not use that one-call shortcut for exact `0%`, reduced-rate, or otherwise non-standard VAT prompts
trusted-standards/create-product.md:44:- do not rely on omitting `vatType` even if a sandbox account auto-fills a 0% default
trusted-standards/create-product.md:47:- do not search for a book-specific product subtype or extra accounting field just because the prompt says "0% for books"; still pick the matching 0% row from the filtered `OUTGOING` result
trusted-standards/create-product.md:68:- fresh-account production verification on 2026-03-20 for the Portuguese prompt `Sessão de formação` / `6378` / `37050` `sem IVA` / standard `25%` also succeeded with one `POST /product`, returning `priceIncludingVatCurrency=46312.5` and `vatType.id=3`
trusted-standards/create-product.md:69:- fresh-account production verification on 2026-03-20 for the French prompt `Maintenance` / `1327` / `3700 NOK hors TVA` / standard `25%` also succeeded with one `POST /product`, returning `priceIncludingVatCurrency=4625` and `vatType.id=3`
trusted-standards/create-product.md:71:- persistent-sandbox verification on 2026-03-20 showed that `POST /product` without `vatType` auto-filled `0%` VAT code `6`, so the one-call shortcut is account-dependent and must stay scoped to the exact fresh-account standard-`25%` shape
trusted-standards/create-product.md:72:- persistent-sandbox re-verification on 2026-03-20 still exposed only `0%` on the filtered `OUTGOING` VAT read, and the omitted-`vatType` create still produced `priceIncludingVatCurrency == priceExcludingVatCurrency`; that account remains blocked for explicit `25%` VAT resolution
trusted-standards/create-product.md:73:- persistent-sandbox re-verification later on 2026-03-20 with the same `37050` price and Portuguese naming still returned only `OUTGOING` VAT row `id=6` / `0%`, and the omitted-`vatType` create again auto-filled `vatType.id=6` with `priceIncludingVatCurrency=37050`
trusted-standards/create-product.md:74:- persistent-sandbox re-verification on 2026-03-20 for the same French `Maintenance` / `3700` shape again returned only `OUTGOING` VAT row `id=6` / `0%`, and an omitted-`vatType` create auto-filled `vatType.id=6` with `priceIncludingVatCurrency=3700`; that sandbox still cannot prove an exact `25%` product create and remains blocked for explicit `25%` resolution
trusted-standards/create-product.md:75:- persistent-sandbox re-verification on 2026-03-20 for the same Spanish `Mantenimiento` / `650 sin IVA` shape again returned only `OUTGOING` VAT row `id=6` / `0%`, and an omitted-`vatType` create auto-filled `vatType.id=6` with `priceIncludingVatCurrency=650`; that sandbox still cannot prove an exact `25%` product create and remains blocked for explicit `25%` resolution
task-playbooks/create-customer-invoice.md:20:- production feedback on 2026-03-20 for the exact prompt shape `customer.organizationNumber=861379760`, products `2109`, `1175`, `9974`, names `Mantenimiento`, `Horas de consultoría`, `Informe de análisis`, VAT `25%` / `15%` / `0%` showed:
task-playbooks/create-customer-invoice.md:24:- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=977448239`, lines `Konsulenttimer (6390)`, `Systemutvikling (1652)`, `Webdesign (3273)`, VAT `25%` / `15%` / `0%` showed:
task-playbooks/create-customer-invoice.md:35:- reflection on the successful production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=909722500`, product lines `Analysis Report (9796)`, `Maintenance (2145)`, `System Development (5995)`, VAT `25%` / `15%` / `0%`) showed:
task-playbooks/create-customer-invoice.md:39:- reflection on the production run for the exact prompt shape on 2026-03-20 (`customer.organizationNumber=851635874`, product labels `(2934)`, `(8699)`, `(1355)`, names `Analyserapport`, `Datarådgivning`, `Nettverkstjeneste`, VAT `25%` / `15%` / `0%`) showed:
task-playbooks/create-customer-invoice.md:66:  - that sandbox account still exposed only outgoing VAT `0%`, so the analog proved the lower-call exact-number product-linking branch and the lack of any need for `/ledger/vatType` in the proof path itself, but not the mixed `25%` / `15%` / `0%` percentages
task-playbooks/create-customer-invoice.md:70:  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` exposed only VAT code `6` (`0%`) in that sandbox account, so the exact mixed `25%` / `15%` / `0%` task could not be replayed there
task-playbooks/create-customer-invoice.md:75:  - `POST /invoice?sendToCustomer=false` returned sparse `orderLines` but also returned decisive totals (`amountExcludingVatCurrency=54700`, `amountCurrency=54700`) for the create-only 0% proof invoice
task-playbooks/create-customer-invoice.md:78:  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
task-playbooks/create-customer-invoice.md:80:  - therefore exact mixed `25%` / `15%` / `0%` VAT could not be replayed in that sandbox account, but the product-linked invoice path, sparse write-response trap, and lower-call no-extra-read create path were proven
task-playbooks/create-customer-invoice.md:85:  - because that sandbox account still exposed only `0%` outgoing VAT, the analog proved the product-resolution and create-only-path lesson, but not the mixed `25%` / `15%` / `0%` VAT combination itself
task-playbooks/create-customer-invoice.md:90:  - because the sandbox still exposed only `0%` outgoing VAT, the analog proved the product-resolution and create-only-path lesson for this task shape, but not the exact mixed `25%` / `15%` / `0%` VAT combination itself
task-playbooks/create-customer-invoice.md:95:  - because the sandbox still exposed only `0%` outgoing VAT, this analog proved the product-resolution and single-script callback/fallback lesson, but not the exact mixed `25%` / `15%` / `0%` VAT combination itself
trusted-standards/create-customer-invoice.md:77:- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=909722500` with lines `Analysis Report (9796)`, `Maintenance (2145)`, and `System Development (5995)` plus VAT `25%` / `15%` / `0%` showed that one speculative `GET /product?productNumber=9796&productNumber=2145&productNumber=5995&fields=*` was wasted before the later catalog read settled the products; the lower-call replacement in that same fresh-account state is `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
trusted-standards/create-customer-invoice.md:78:- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=851635874` with lines `Analyserapport (2934)`, `Datarådgivning (8699)`, and `Nettverkstjeneste (1355)` plus VAT `25%` / `15%` / `0%` showed that a speculative `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*` did not resolve all lines, and the run only succeeded after a broader catalog fallback on exact names; the lower-call replacement for that shape is one decisive `GET /product?count=1000&fields=*`, then `GET /ledger/vatType`, then `POST /invoice?sendToCustomer=false`

```

## 2026-03-20T22:50:19.817Z tool_call
tool: exec_command
call_id: call_C0dbNVy8gxIbU1CTbWWPrGTV

```json
{
  "cmd": "sed -n '1,260p' /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/create-and-send-customer-invoice.ts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:50:19.820Z tool_call
tool: exec_command
call_id: call_up4dbnHLKCUM8n1hL7Z62aXQ

```json
{
  "cmd": "sed -n '1,220p' /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-211943971Z-aca7a086/scripts/create_and_send_invoice.ts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:50:19.865Z tool_result
tool: exec_command
call_id: call_C0dbNVy8gxIbU1CTbWWPrGTV

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,260p' /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224150351Z-8169c6a8/scripts/create-and-send-customer-invoice.ts"
Chunk ID: 717090
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 1699
Output:
const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "hCx_qH9VXK8VJe9182SSUiicbVdEcpjVPZAK1lOo-ss";

const invoiceDate = "2026-03-20";
const invoiceDueDate = "2026-04-03";

const customerInput = {
  name: "Étoile SARL",
  organizationNumber: "995085488",
  invoiceSendMethod: "MANUAL",
};

const lineDescription = "Rapport d'analyse";
const amountExcludingVat = 7250;
const repairBankAccountNumber = "12345678903";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type ApiResponse<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
  message?: string;
  error?: string;
  source?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Customer = { id: number };
type VatType = { id: number; percentage?: number };
type LedgerAccount = {
  id: number;
  number?: string;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string | null;
};

const joinUrl = (path: string, search?: URLSearchParams) => {
  const url = new URL(path, `${baseUrl}/`);
  if (search) url.search = search.toString();
  return url.toString();
};

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const isInvalidToken = (body: any) =>
  body?.error === "Invalid or expired token" ||
  body?.error ===
    "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.";

const request = async (
  method: string,
  path: string,
  body?: unknown,
  search?: URLSearchParams,
) => {
  const response = await fetch(joinUrl(path, search), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const parsed = await parseJson(response);

  if (response.status === 403 && isInvalidToken(parsed)) {
    throw new Error(`Blocked credentials: ${JSON.stringify(parsed)}`);
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(`${method} ${path} failed with ${response.status}`),
      { status: response.status, body: parsed },
    );
  }

  return parsed as ApiResponse<any>;
};

const hasMissingBankAccountError = (body: any) => {
  const text = JSON.stringify(body);
  return text.includes(
    "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
  );
};

const hasDuplicateCustomerError = (body: any) => {
  const text = JSON.stringify(body);
  return (
    text.includes("organizationNumber") &&
    (text.toLowerCase().includes("eksisterer") ||
      text.toLowerCase().includes("already exists") ||
      text.toLowerCase().includes("duplicate"))
  );
};

const findOutgoing25Vat = (vatTypes: VatType[]) => {
  const vat = vatTypes.find((entry) => Number(entry.percentage) === 25);
  if (!vat) {
    throw new Error("Blocked account state: no outgoing 25% VAT type available");
  }
  return vat;
};

const buildInvoicePayload = (customerId: number, vatTypeId: number) => ({
  invoiceDate,
  invoiceDueDate,
  customer: { id: customerId },
  orders: [
    {
      customer: { id: customerId },
      orderDate: invoiceDate,
      deliveryDate: invoiceDate,
      orderLines: [
        {
          description: lineDescription,
          count: 1,
          unitPriceExcludingVatCurrency: amountExcludingVat,
          vatType: { id: vatTypeId },
        },
      ],
    },
  ],
});

const repairInvoiceBankAccount = async () => {
  const accounts = await request(
    "GET",
    "ledger/account",
    undefined,
    new URLSearchParams({ isBankAccount: "true", fields: "*" }),
  );
  const candidates = (accounts.values ?? []) as LedgerAccount[];
  const account =
    candidates.find((entry) => entry.isInvoiceAccount && entry.number === "1920") ??
    candidates.find((entry) => entry.isInvoiceAccount) ??
    candidates.find((entry) => entry.number === "1920") ??
    candidates[0];

  if (!account) {
    throw new Error("No bank ledger account available for repair");
  }

  const bankAccountNumber =
    account.bankAccountNumber && /^\d{11}$/.test(account.bankAccountNumber)
      ? account.bankAccountNumber
      : repairBankAccountNumber;

  await request("PUT", `ledger/account/${account.id}`, { bankAccountNumber });
};

const createOrResolveCustomer = async () => {
  try {
    const customer = await request("POST", "customer", customerInput);
    const customerId = (customer.value as Customer | undefined)?.id;
    if (!customerId) {
      throw new Error("Customer create response missing id");
    }
    return customerId;
  } catch (error: any) {
    if (error?.status !== 422 || !hasDuplicateCustomerError(error.body)) {
      throw error;
    }

    const customer = await request(
      "GET",
      "customer",
      undefined,
      new URLSearchParams({
        organizationNumber: customerInput.organizationNumber,
        fields: "*",
      }),
    );
    const resolvedId = (customer.values?.[0] as Customer | undefined)?.id;
    if (!resolvedId) {
      throw new Error("Existing customer lookup returned no match");
    }
    return resolvedId;
  }
};

const main = async () => {
  const customerId = await createOrResolveCustomer();

  const vatTypes = await request(
    "GET",
    "ledger/vatType",
    undefined,
    new URLSearchParams({
      typeOfVat: "OUTGOING",
      vatDate: invoiceDate,
      fields: "*",
    }),
  );
  const vatType = findOutgoing25Vat((vatTypes.values ?? []) as VatType[]);
  const invoicePayload = buildInvoicePayload(customerId, vatType.id);

  try {
    const invoice = await request("POST", "invoice", invoicePayload);
    console.log(
      JSON.stringify(
        {
          customerId,
          invoiceId: invoice.value?.id,
          invoiceNumber: invoice.value?.invoiceNumber,
          amountExcludingVatCurrency: invoice.value?.amountExcludingVatCurrency,
          amountCurrency: invoice.value?.amountCurrency,
        },
        null,
        2,
      ),
    );
  } catch (error: any) {
    if (error?.status !== 422 || !hasMissingBankAccountError(error.body)) {
      throw error;
    }

    await repairInvoiceBankAccount();
    const invoice = await request("POST", "invoice", invoicePayload);
    console.log(
      JSON.stringify(
        {
          customerId,
          invoiceId: invoice.value?.id,
          invoiceNumber: invoice.value?.invoiceNumber,
          amountExcludingVatCurrency: invoice.value?.amountExcludingVatCurrency,
          amountCurrency: invoice.value?.amountCurrency,
          repairedBankAccount: true,
        },
        null,
        2,
      ),
    );
  }
};

await main();

```

## 2026-03-20T22:50:19.867Z tool_result
tool: exec_command
call_id: call_up4dbnHLKCUM8n1hL7Z62aXQ

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,220p' /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-211943971Z-aca7a086/scripts/create_and_send_invoice.ts"
Chunk ID: 3816a7
Wall time: 0.0001 seconds
Process exited with code 0
Original token count: 1488
Output:
const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "_8GKl8er9If9_YOz0PCLwaPBgeCM9mTmHT3a8SIF_EU";

const CUSTOMER_NAME = "Porto Alegre Lda";
const ORGANIZATION_NUMBER = "842889154";
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const DESCRIPTION = "Consultoria de dados";
const AMOUNT_EX_VAT = 11200;

type ApiErrorPayload = {
  error?: string;
  message?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Customer = {
  id: number;
};

type VatType = {
  id: number;
  percentage?: number;
  parentType?: { id?: number };
};

type Account = {
  id: number;
  number?: string;
  version?: number;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};

class ApiError extends Error {
  status: number;
  payload: ApiErrorPayload | string | undefined;

  constructor(status: number, payload: ApiErrorPayload | string | undefined) {
    super(`${status}`);
    this.status = status;
    this.payload = payload;
  }
}

const AUTH_HEADER = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

await main();

async function main() {
  const customer = await createCustomer();
  const vatType = await resolveZeroVatType();
  const invoicePayload = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: [
          {
            description: DESCRIPTION,
            count: 1,
            unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  };

  let invoiceResponse;
  try {
    invoiceResponse = await api("invoice", { method: "POST", body: invoicePayload });
  } catch (error) {
    if (!(error instanceof ApiError) || !isMissingBankAccountError(error)) {
      throw error;
    }

    await repairCompanyBankAccount();
    invoiceResponse = await api("invoice", { method: "POST", body: invoicePayload });
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        invoiceId: invoiceResponse?.value?.id,
        invoiceNumber: invoiceResponse?.value?.invoiceNumber,
        amountExcludingVatCurrency: invoiceResponse?.value?.amountExcludingVatCurrency,
        amountCurrency: invoiceResponse?.value?.amountCurrency,
      },
      null,
      2,
    ),
  );
}

async function createCustomer(): Promise<Customer> {
  const response = await api("customer", {
    method: "POST",
    body: {
      name: CUSTOMER_NAME,
      organizationNumber: ORGANIZATION_NUMBER,
      invoiceSendMethod: "MANUAL",
    },
  });

  return response.value;
}

async function resolveZeroVatType(): Promise<VatType> {
  const response = await api(
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
  );
  const values: VatType[] = response.values ?? [];
  const zeroVatTypes = values.filter((value) => Number(value.percentage) === 0);

  if (zeroVatTypes.length === 0) {
    throw new Error("No 0% outgoing VAT type available");
  }

  return (
    zeroVatTypes.find((value) => value.parentType?.id === 0 || value.parentType?.id === undefined) ??
    zeroVatTypes[0]
  );
}

async function repairCompanyBankAccount() {
  const response = await api("ledger/account?isBankAccount=true&fields=*");
  const values: Account[] = response.values ?? [];
  const target =
    values.find((value) => value.isInvoiceAccount && value.number === "1920") ??
    values.find((value) => value.isInvoiceAccount) ??
    values[0];

  if (!target) {
    throw new Error("No bank account available for repair");
  }

  if (target.bankAccountNumber && /^\d{11}$/.test(target.bankAccountNumber)) {
    return;
  }

  const existingNumbers = new Set(
    values
      .map((value) => value.bankAccountNumber)
      .filter((value): value is string => typeof value === "string" && /^\d{11}$/.test(value)),
  );

  await api(`ledger/account/${target.id}`, {
    method: "PUT",
    body: {
      id: target.id,
      version: target.version,
      bankAccountNumber: generateUniqueNorwegianBankAccountNumber(existingNumbers, target.id),
    },
  });
}

function isMissingBankAccountError(error: ApiError): boolean {
  return deepText(error.payload).includes(
    "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer",
  );
}

function generateUniqueNorwegianBankAccountNumber(
  existingNumbers: Set<string>,
  seed: number,
): string {
  for (let offset = 0; offset < 10000; offset += 1) {
    const candidate = buildValidNorwegianBankAccountNumber(seed + offset);
    if (!existingNumbers.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to generate unique bank account number");
}

function buildValidNorwegianBankAccountNumber(seed: number): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

  for (let offset = 0; offset < 100; offset += 1) {
    const digits = `1234${String((seed + offset) % 1_000_000).padStart(6, "0")}`;
    const sum = digits
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;

    if (checkDigit !== 10) {
      return `${digits}${checkDigit}`;
    }
  }

  throw new Error("Unable to build valid bank account number");
}

function deepText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepText(item)).join(" ");
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => deepText(item))
      .join(" ");
  }
  return String(value ?? "");
}

async function api(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<any> {

```

## 2026-03-20T22:50:32.198Z assistant_message
phase: commentary

Schreibe jetzt das einzige Run-Script in den vorgegebenen Ordner, mit exakt dem 3-Call-Standard plus dem bekannten Bankkonto-Reparaturzweig.

## 2026-03-20T22:50:58.558Z assistant_message
phase: commentary

Script steht. Führe jetzt genau diesen Flow gegen die Produktions-Run-URL aus und stoppe nach der ersten erfolgreichen finalen Rechnung.

## 2026-03-20T22:50:59.537Z tool_call
tool: exec_command
call_id: call_zanTQFGN4Bwyp2lIeujAjWfA

```json
{
  "cmd": "bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224945986Z-9c6cfcf9/scripts/run.ts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:51:00.695Z tool_result
tool: exec_command
call_id: call_zanTQFGN4Bwyp2lIeujAjWfA

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224945986Z-9c6cfcf9/scripts/run.ts'
Chunk ID: 347b55
Wall time: 1.0016 seconds
Process running with session ID 69756
Original token count: 0
Output:

```

## 2026-03-20T22:51:02.090Z assistant_message
phase: commentary

Der Lauf ist aktiv. Ich lese nur noch das Ergebnis oder einen präzisen Validierungsfehler aus und ändere nichts ohne klare Notwendigkeit.

## 2026-03-20T22:51:02.417Z tool_call
tool: write_stdin
call_id: call_Ya70RwaUHyvPOnOwqAQ1uNPC

```json
{
  "session_id": 69756,
  "chars": "",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:51:07.418Z tool_result
tool: write_stdin
call_id: call_Ya70RwaUHyvPOnOwqAQ1uNPC

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224945986Z-9c6cfcf9/scripts/run.ts'
Chunk ID: 72c937
Wall time: 5.0004 seconds
Process running with session ID 69756
Original token count: 0
Output:

```

## 2026-03-20T22:51:08.730Z tool_call
tool: write_stdin
call_id: call_P8XAVrzTGNGr9kCAC7RZw4cS

```json
{
  "session_id": 69756,
  "chars": "",
  "yield_time_ms": 3000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:51:13.733Z tool_result
tool: write_stdin
call_id: call_P8XAVrzTGNGr9kCAC7RZw4cS

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224945986Z-9c6cfcf9/scripts/run.ts'
Chunk ID: 37f1b1
Wall time: 5.0005 seconds
Process running with session ID 69756
Original token count: 0
Output:

```

## 2026-03-20T22:51:15.188Z tool_call
tool: write_stdin
call_id: call_7ZD2rfRF3nOXOF66kd6GXPfu

```json
{
  "session_id": 69756,
  "chars": "",
  "yield_time_ms": 10000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:51:15.209Z tool_result
tool: write_stdin
call_id: call_7ZD2rfRF3nOXOF66kd6GXPfu

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-224945986Z-9c6cfcf9/scripts/run.ts'
Chunk ID: 2b1954
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 41
Output:
{
  "customerId": 108287903,
  "vatTypeId": 5,
  "invoiceId": 2147553143,
  "invoiceNumber": 1,
  "amountExcludingVatCurrency": 45150,
  "amountCurrency": 45150
}

```

## 2026-03-20T22:51:17.534Z assistant_message
phase: final_answer

Erledigt.

Rechnung erstellt und gesendet für `Bergwerk GmbH` (`981122011`) über `45150 NOK` ohne MwSt. für `Datenberatung`.

Verifiziert aus Write-Response: `invoiceId=2147553143`, `invoiceNumber=1`, `amountExcludingVatCurrency=45150`, `amountCurrency=45150`.

## 2026-03-20T22:51:17.552Z task_event
event: task_complete

Erledigt.

Rechnung erstellt und gesendet für `Bergwerk GmbH` (`981122011`) über `45150 NOK` ohne MwSt. für `Datenberatung`.

Verifiziert aus Write-Response: `invoiceId=2147553143`, `invoiceNumber=1`, `amountExcludingVatCurrency=45150`, `amountCurrency=45150`.
