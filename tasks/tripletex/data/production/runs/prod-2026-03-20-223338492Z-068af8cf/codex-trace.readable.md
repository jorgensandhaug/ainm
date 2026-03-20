# Codex Trace Snapshot

- session_id: 019d0d62-0382-7622-912d-5af226b56c92
- session_file: /home/jorge/.codex/sessions/2026/03/20/rollout-2026-03-20T23-33-40-019d0d62-0382-7622-912d-5af226b56c92.jsonl
- completed: true
- assistant_messages: 6
- tool_calls: 9
- tool_results: 9

## 2026-03-20T22:33:41.436Z task_event
event: task_started

## 2026-03-20T22:33:41.438Z user_message
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
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Erstellen Sie einen Auftrag für den Kunden Waldstein GmbH (Org.-Nr. 975687821) mit den Produkten Netzwerkdienst (4366) zu 32750 NOK und Beratungsstunden (3402) zu 17450 NOK. Wandeln Sie den Auftrag in eine Rechnung um und registrieren Sie die vollständige Zahlung.

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
Pnj12sBpYpdKDLjoF4vplAlqHuouAEVkZ9NXGPDkp2I

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts

## 2026-03-20T22:33:47.756Z assistant_message
phase: commentary

Task maps to order-create -> invoice -> full-payment flow. I’m reading the exact trusted standard and nearby run docs, then I’ll write one bun script in the provided run directory and execute it.

## 2026-03-20T22:33:47.757Z tool_call
tool: exec_command
call_id: call_kXfuso1oUL8gnACHPmEDg9xN

```json
{
  "cmd": "sed -n '1,240p' ./trusted-standards/create-order-invoice-and-register-payment.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:33:47.771Z tool_call
tool: exec_command
call_id: call_nYaylz6cOrg3PJp24SrfikH9

```json
{
  "cmd": "sed -n '1,260p' ./task-playbooks/create-order-invoice-and-register-payment.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:33:47.809Z tool_result
tool: exec_command
call_id: call_kXfuso1oUL8gnACHPmEDg9xN

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,240p' ./trusted-standards/create-order-invoice-and-register-payment.md"
Chunk ID: 2f6ed8
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 2002
Output:
# Create Order, Invoice, and Register Full Payment

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one order for an existing customer
- use one or more existing products already identified in the prompt
- convert that new order into an invoice immediately
- register full payment on that created invoice immediately
- do not send the invoice unless the prompt explicitly asks for it

## Do Not Use This Standard If
- the task also requires creating the customer or products first
- the task is project-fixed-price, on-account, subscription, reversal, or partial-payment specific
- the prompt is too ambiguous to identify the existing customer or products decisively
- the task explicitly requires sending the invoice

## Standard Flow
1. `GET /customer?organizationNumber=...&fields=*` if the prompt identifies the customer by organization number
2. `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
3. only if that first product read does not resolve every product, do one fallback `GET /product?ids=<ref>,<ref>&fields=*`
4. only if both numeric reads miss and the prompt also gives exact product names, do one final decisive `GET /product?count=1000&fields=*` and filter locally
5. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
6. `POST /order` with embedded `orderLines`
7. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<id>&paidAmount=<seed>&paymentTypeIdRestAmount=<same-id>`
8. verify `amountCurrencyOutstanding=0` or `amountOutstanding=0` from the invoice write response
9. stop

## Payload Rules
- on `POST /order`, send:
  - `customer: { "id": ... }`
  - `orderDate`
  - `deliveryDate`
  - `orderLines[]` with:
    - `product: { "id": ... }`
    - `description`
    - `count`
    - `unitPriceExcludingVatCurrency`
- preserve prompt product names/descriptions exactly when they are part of the scored state
- when resolving `GET /product?productNumber=...&fields=*`, normalize both `number` and `productNumber` from the response; some accounts return the matched key under `number`
- do not insert an automatic `GET /order/{id}` just because `POST /order` can echo `orderLines=[]`
- the canonical exact-match path does not include an automatic `GET /ledger/account` preflight
- if this is likely the first outgoing invoice in a fresh-account run and you intentionally choose the hedge against the missing-company-bank-account `422`, use one proactive `GET /ledger/account?isBankAccount=true&fields=*` before the first invoice write
- if you take that hedge and the chosen invoice account already has a `bankAccountNumber`, skip the repair and continue with the same invoice write
- for the combined invoice-and-payment write, use one valid incoming `paymentTypeId`, a minimal positive `paidAmount` seed, and the same id as `paymentTypeIdRestAmount`
- `paidAmount=0` is not a valid shortcut here; live validation treats it as missing
- for ordinary NOK runs, `paidAmount=0.01` is a proven safe seed that lets Tripletex calculate the remaining full payment automatically

## Reuse From Write Response
- from `POST /order`:
  - `value.id`
- from `PUT /order/{id}/:invoice`:
  - `value.id`
  - `value.invoiceNumber`
  - `value.amountCurrencyOutstanding` or `value.amountOutstanding`
  - invoice totals if needed for proof

## Verification
- default verification is zero extra calls after the combined invoice write
- trust the invoice write response when it proves remaining outstanding amount is `0`
- do not add a follow-up `GET /invoice/{id}` unless the task explicitly scores expanded linked fields that the write response omits

## Known Recovery Branches
- if the first product-number lookup only partially resolves:
  - try one fallback `GET /product?ids=...&fields=*`
  - only then consider one final `GET /product?count=1000&fields=*` name-filter fallback
  - do not let a name-only match from the first product-number read count as resolution for a missing numeric ref
- if `PUT /order/{id}/:invoice` fails only with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - update the existing invoice bank account with `PUT /ledger/account/{id}` using a valid unique 11-digit `bankAccountNumber`
  - retry the same `PUT /order/{id}/:invoice?...` once
  - do not create a second order
- if the combined invoice-and-payment write rejects the seed-payment shape for an unexpected account-specific reason after the invoice already exists:
  - resume from the existing unpaid invoice instead of rebuilding the order
  - `GET /invoice/paymentType?...` only if the same run does not already hold a proven valid incoming payment type
  - `PUT /invoice/{id}/:payment?...` with the actual outstanding amount from the invoice object

## OpenAPI / Sandbox Status
- `/order`, `/order/{id}/:invoice`, `/invoice/paymentType`, and `/invoice/{id}/:payment` verified in `./openapi.json`
- exact downstream fast path re-proven on 2026-03-20 in production and sandbox
- when the first `GET /product?productNumber=...` already resolves every product and no same-run `paymentTypeId` is cached yet, the exact-match path is usually 5 Tripletex API calls:
  - `GET /customer`
  - `GET /product`
  - `GET /invoice/paymentType`
  - `POST /order`
  - `PUT /order/{id}/:invoice` with `paymentTypeId`, a minimal positive `paidAmount`, and `paymentTypeIdRestAmount`
- if the same run already holds a proven valid incoming `paymentTypeId` for the same company and currency, the path drops to 4 calls:
  - `GET /customer`
  - `GET /product`
  - `POST /order`
  - `PUT /order/{id}/:invoice` with the combined prepayment parameters
- re-verified earlier on 2026-03-20 in persistent sandbox for customer `864062245` with product refs `6749` and `3048`; before the combined-prepayment improvement was proven, the downstream split-tail path completed in 6 calls, selected payment type `32813748` (`Betalt til bank` / debit account `1920`), and settled the invoice to outstanding `0`
- further persistent-sandbox verification on 2026-03-20 with customer `975687821` and product refs `4366` / `3402` proved the lower-call replacement path:
  - `GET /customer?organizationNumber=975687821&fields=*`
  - `GET /product?productNumber=4366&productNumber=3402&fields=*`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false&paymentTypeId=32813748&paidAmount=0.01&paymentTypeIdRestAmount=32813748`
  - the invoice write returned `amountCurrencyOutstanding=0` directly, so the extra `PUT /invoice/{id}/:payment` call was unnecessary
- the same sandbox proof also showed that `GET /product?productNumber=...&fields=*` can return the matched product ref under `number` instead of `productNumber`; resolvers must normalize both
- additional production re-verification on 2026-03-20 for customer `989093630` with product refs `5981` and `6784` had earlier completed in the same 6-call split-tail path with no `/ledger/account` hedge, and the created invoice outstanding was `63000` even though the prompt ex-VAT sum was `50400`
- production re-verification on 2026-03-20 again showed that the prompt ex-VAT total can differ from the payment amount because payment must use the created invoice outstanding balance
- production reflection on 2026-03-20 also showed that when the first outgoing order invoice in the account would otherwise hit the missing-company-bank-account validation, a proactive `/ledger/account` preflight would have saved one Tripletex call and avoided the `422`
- later production reflection on 2026-03-20 also showed the opposite risk: turning that `/ledger/account` hedge into a default step would spend a sixth call on accounts where the plain 5-call exact path already works, so the hedge must stay conditional rather than canonical

```

## 2026-03-20T22:33:47.811Z tool_result
tool: exec_command
call_id: call_nYaylz6cOrg3PJp24SrfikH9

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,260p' ./task-playbooks/create-order-invoice-and-register-payment.md"
Chunk ID: 001f2a
Wall time: 0.0019 seconds
Process exited with code 0
Original token count: 4036
Output:
# Create Order, Invoice, and Register Full Payment

## Scope

Use for tasks like:
- create an order for an existing customer
- use one or more existing products on the order
- convert that order into an invoice
- register full payment on the created invoice
- do not send the invoice unless the prompt explicitly asks for sending

Do not use for:
- create-only order tasks with no invoice/payment step
- invoice-send tasks where customer delivery/send method is the main concern
- update/delete/reverse flows on existing orders or invoices

Exact-match tasks should now prefer the trusted standard:
- `./trusted-standards/create-order-invoice-and-register-payment.md`

## Key Findings

- `POST /order` can create embedded `orderLines`, but the `201` response may still echo `orderLines=[]`
- do not treat an empty `response.value.orderLines` on `POST /order` as proof that line creation failed
- sandbox verification on 2026-03-20 showed:
  - `POST /order` with embedded `orderLines` returned `orderLines=[]` in `response.value`
  - `GET /order/{id}?fields=*,customer(*),orderLines(*)` on that same order returned the expected 2 order lines
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` on an order created that way succeeded directly
  - the invoice response returned `amountExcludingVatCurrency=20450` and `amountCurrencyOutstanding=20450`
  - `PUT /invoice/{id}/:payment?...` reduced the remaining outstanding amount to `0`
- additional production verification on 2026-03-20 showed:
  - `PUT /order/{id}/:invoice?...` can fail after a successful `POST /order` with `422` and validation message `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`
  - `GET /ledger/account?isBankAccount=true&fields=*`, then `PUT /ledger/account/{id}` on the existing invoice bank account `1920`, then retrying the same `PUT /order/{id}/:invoice` succeeded
  - therefore the recovery branch must resume from the already-created order; do not create a second order
- product lookup verification on 2026-03-20 showed:
  - `GET /product?productNumber=<a>&productNumber=<b>&fields=*` returned both target products
  - `GET /product?ids=<id-a>,<id-b>&fields=*` also returned both target products
  - therefore, for numeric product refs in the prompt, product-number lookup is a good first try and one fallback ID lookup is enough if needed
  - if the first `productNumber` lookup misses one ref, do not let a name-only match from that same partial response count as success; keep exact-name matching as the final fallback after both numeric reads miss
  - the same search can return the matched product ref under `number` instead of `productNumber`; normalize both response keys before treating the direct numeric lookup as incomplete
- additional production verification on 2026-03-20 showed two more traps:
  - prompt numeric refs in parentheses are not guaranteed to be Tripletex `productNumber` values or product IDs
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` can return the correct incoming payment type with `creditAccount=null`; in that account `Betalt til bank` with debit account `1920` was still the right payment type and successfully settled the invoice
- persistent-sandbox verification on 2026-03-20 showed a lower-call replacement for the old split invoice/payment tail:
  - `PUT /order/{id}/:invoice` accepts `paymentTypeId`, `paidAmount`, and `paymentTypeIdRestAmount`
  - `paidAmount=0` was rejected as effectively missing even when `paymentTypeId` was present
  - `paidAmount=0.01` plus the same id as `paymentTypeIdRestAmount` settled the full NOK invoice in that same invoice write
  - therefore the extra `PUT /invoice/{id}/:payment` call is unnecessary on this exact task shape unless the combined prepayment branch fails
- later production reflection on 2026-03-20 showed one more efficiency trap:
  - turning the `/ledger/account` bank-account hedge into an automatic preflight on this exact task shape spends a sixth Tripletex call on accounts where the plain 5-call path already works
  - keep `/ledger/account` as a conditional hedge or repair branch, not as the default exact-match path
- additional production verification on 2026-03-20 also showed the older split-tail exact-match path before the combined-prepayment improvement:
  - one successful run completed with 6 Tripletex API calls after local spec confirmation
  - `GET /customer?organizationNumber=...&fields=*`
  - `GET /product?productNumber=<a>&productNumber=<b>&fields=*` already returned both target products, so no fallback `/product?ids=...` read was needed
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `PUT /invoice/{id}/:payment?...`
  - the prompt line-price sum excluding VAT was `56350`, but the actual payment amount from the invoice response was `70437.5`; this confirmed again that payment must use the invoice outstanding amount, not the prompt ex-VAT total
- another production verification on 2026-03-20 confirmed the same exact-match path again:
  - `GET /customer?organizationNumber=911511053&fields=*`
  - `GET /product?productNumber=7579&productNumber=2292&fields=*`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `PUT /invoice/{id}/:payment?...`
  - the prompt line-price sum excluding VAT was `26450`, but the actual payment amount from the invoice response was `33062.5`; `Betalt til bank` again settled the invoice to `0`
- persistent-sandbox re-verification on 2026-03-20 confirmed the same downstream exact-match path for customer `864062245` and products `6749` / `3048` once those entities existed in the sandbox:
  - `GET /customer?organizationNumber=864062245&fields=*`
  - `GET /product?productNumber=6749&productNumber=3048&fields=*`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `PUT /invoice/{id}/:payment?...`
  - the invoice response exposed `paidAmount=12650`, payment type `32813748` (`Betalt til bank` / debit account `1920`), and the payment write settled the invoice to `0`

- additional production verification on 2026-03-20 confirmed the same exact-match path for customer `989093630` and products `5981` / `6784`:
  - `GET /customer?organizationNumber=989093630&fields=*`
  - `GET /product?productNumber=5981&productNumber=6784&fields=*`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `PUT /invoice/{id}/:payment?...`
  - the prompt line-price sum excluding VAT was `50400`, but the actual payment amount from the invoice response was `63000`; this exact Spanish-language prompt again confirmed that payment must use invoice outstanding, not prompt arithmetic

## Minimal Flow

1. Confirm these operations in `./openapi.json`
   - `GET /customer`
   - `GET /product`
   - `GET /invoice/paymentType`
   - `POST /order`
   - `PUT /order/{id}/:invoice`
2. Resolve the customer
   - usually `GET /customer?organizationNumber=...&fields=*`
3. Resolve the products from prompt refs
   - first try `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
   - if that does not uniquely resolve the products, do one fallback `GET /product?ids=<ref>,<ref>&fields=*`
   - if both numeric lookups fail and the prompt also gives exact product names, do one final decisive fallback `GET /product?count=1000&fields=*` and filter locally by exact prompt names
4. Resolve one usable incoming payment type
   - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
   - prefer a bank-style incoming payment type whose debit account is `19xx`
   - if available, prefer `isBankAccount=true` or `isInvoiceAccount=true` on that debit account
   - do not reject the candidate just because `creditAccount` is `null`
5. Create the order with embedded lines
   - `POST /order`
   - send `customer`, `orderDate`, `deliveryDate`
   - embed `orderLines` with `product: { id }`, `description`, `count`, and the requested unit price
6. Convert the order into an invoice and settle it in the same write
   - `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<id>&paidAmount=<seed>&paymentTypeIdRestAmount=<same-id>`
   - for ordinary NOK runs, `paidAmount=0.01` is the proven seed
   - do not use `paidAmount=0`; sandbox validation treated it as missing
7. Only if that invoice write fails with the company-bank-account validation, repair that prerequisite and retry the same order once
   - `GET /ledger/account?isBankAccount=true&fields=*`
   - choose the existing invoice bank account, usually `1920` / `isInvoiceAccount=true`
   - `PUT /ledger/account/{id}` with a valid `bankAccountNumber`
   - retry `PUT /order/{id}/:invoice?...` on the same order
8. Reuse the invoice write response
   - verify `amountCurrencyOutstanding` first, otherwise `amountOutstanding`
   - use invoice totals/lines in that response as verification where available
9. Stop when remaining outstanding amount is `0`

## Exact-Match Fast Path

- For a prompt that already identifies:
  - the existing customer by organization number
  - the existing products by numeric refs
  - the order line prices
  - the need to invoice and fully pay immediately
- the winning path is usually 5 Tripletex API calls when the first product-number read succeeds and the run does not already hold a reusable incoming `paymentTypeId`:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
  3. if that misses, `GET /product?ids=<ref>,<ref>&fields=*`
  4. only if both numeric lookups miss and the prompt also gives exact product names, `GET /product?count=1000&fields=*` and filter locally by exact names
  5. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  6. `POST /order` with embedded `orderLines`
  7. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<id>&paidAmount=<seed>&paymentTypeIdRestAmount=<same-id>`
- if the same run already holds a proven valid incoming `paymentTypeId` for the same company and currency, the same exact task drops to 4 downstream calls by skipping step 5
- Do not insert an automatic `GET /order/{id}` just because `POST /order` echoed empty `orderLines`
- Do not insert an automatic `GET /ledger/account` before the first invoice write; on this exact task shape that turns the canonical 5-call path into a 6-call hedge
- If `PUT /order/{id}/:invoice` fails only because the company bank account number is missing, repair `/ledger/account` and retry the same order instead of creating a new one
- If the invoice response already proves the charged lines/totals and outstanding amount, that same write response is enough; do not automatically split into a later payment write

## Order Payload Notes

- Use the `Order` schema referenced by `POST /order`
- a safe embedded-line shape is:

```json
{
  "customer": { "id": 123 },
  "orderDate": "2026-03-20",
  "deliveryDate": "2026-03-20",
  "orderLines": [
    {
      "product": { "id": 456 },
      "description": "Training session",
      "count": 1,
      "unitPriceExcludingVatCurrency": 5700
    },
    {
      "product": { "id": 789 },
      "description": "Consulting hours",
      "count": 1,
      "unitPriceExcludingVatCurrency": 14750
    }
  ]
}
```

- if the account/product setup requires it, include a valid `vatType` on the order line
- when you already resolved products from `GET /product?fields=*`, reuse the returned product IDs directly

## Response Shape Trap

- `POST /order` may not be a reliable verifier for embedded line creation
- specifically, the write response can contain:

```json
{
  "value": {
    "id": 401954042,
    "orderLines": []
  }
}
```

- even though the order actually contains lines and can be invoiced immediately
- do not branch into a corrective rewrite just because that field is empty
- only add `GET /order/{id}?fields=*,orderLines(*)` if you truly need decisive pre-invoice verification

## Product Resolution Rules

- When the prompt names existing products with numeric refs in parentheses, try product-number resolution first
- Use:
  - `GET /product?productNumber=<ref>&productNumber=<ref>&fields=*`
- If that first read already returns both target products, stop there and reuse those IDs directly
- normalize both `number` and `productNumber` from the returned product objects before deciding a ref is missing
- If that does not uniquely resolve the products, do one fallback:
  - `GET /product?ids=<ref>,<ref>&fields=*`
- If both numeric reads fail and the prompt also gives exact product names, one final decisive fallback is allowed:
  - `GET /product?count=1000&fields=*`
  - filter locally by exact prompt names
- Do not let a name-only match from the initial `productNumber` response count as success for a still-missing numeric ref
- Do not spray multiple exploratory `/product` reads after that final fallback
- Reuse the resolved product objects for IDs and any needed VAT context

## Payment Rules

- For `GET /invoice/paymentType`, normalize account numbers before prefix checks
- Prefer a `19xx` debit account that is also flagged as `isBankAccount=true` or `isInvoiceAccount=true`
- Do not require a `15xx` `creditAccount`; the correct incoming payment type may return `creditAccount=null`
- For the lower-call exact-match path, pay during `PUT /order/{id}/:invoice` instead of using a separate `PUT /invoice/{id}/:payment`
- Use the same resolved incoming `paymentTypeId` as both `paymentTypeId` and `paymentTypeIdRestAmount`
- Seed `paidAmount` with the smallest positive amount accepted for the invoice currency; `0.01` is proven for ordinary NOK runs
- Do not use `paidAmount=0`; sandbox validation rejected it as effectively missing
- Only fall back to a later standalone invoice-payment write if the combined invoice-prepayment write fails for an account-specific reason

## Recovery Rule After Partial Success

- If `POST /order` succeeded but `PUT /order/{id}/:invoice` failed only because the company bank account number is missing:
  - do `GET /ledger/account?isBankAccount=true&fields=*`
  - update the existing invoice bank account with `PUT /ledger/account/{id}`
  - retry the same `PUT /order/{id}/:invoice?...`
  - do not restart from `POST /order`
- If `POST /order` and `PUT /order/{id}/:invoice` already succeeded but the combined prepayment branch did not settle the invoice, do not start over with a new order
- Locate the existing unpaid invoice with one decisive read such as:
  - `GET /invoice?customerId=<id>&invoiceDateFrom=<date>&invoiceDateTo=<next-date>&count=1000&fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))`
- Filter locally by:
  - positive outstanding amount
  - exact ex-VAT total
  - exact prompt line descriptions or product refs
- Then finish with:
  - `GET /invoice/paymentType?...`
  - `PUT /invoice/{id}/:payment?...`
- This avoids duplicating orders/invoices after a late-step failure

## Verification Shape

- `POST /order`:
  - trust the returned `id`
  - do not over-trust `orderLines`
- `PUT /order/{id}/:invoice`:
  - expect `ResponseWrapperInvoice`
  - reuse `id`, `invoiceNumber`, invoice totals, and outstanding amount
- `PUT /invoice/{id}/:payment`:
  - expect `ResponseWrapperInvoice`
  - verify remaining outstanding amount is `0`

## If You Still Need To Probe

- First probe only the exact missing uncertainty
- Good examples:
  - `GET /order/{id}?fields=*,orderLines(*)` if you must confirm line creation before invoicing
  - `GET /product?ids=...&fields=*` if product-number lookup failed
- Avoid widening into generic invoice/order browsing when the created invoice or payment response already proves the next step

```

## 2026-03-20T22:33:56.056Z assistant_message
phase: commentary

The flow is an exact trusted-standard match. I’m writing the run script for the 5-call path, with only the documented bank-account repair branch if the invoice write returns that specific validation error.

## 2026-03-20T22:33:57.165Z tool_call
tool: exec_command
call_id: call_ekCRQXM1v1gRjCuAaqGzw1ve

```json
{
  "cmd": "ls -la /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-20T22:33:57.188Z tool_result
tool: exec_command
call_id: call_ekCRQXM1v1gRjCuAaqGzw1ve

```text
Command: /run/current-system/sw/bin/zsh -lc 'ls -la /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts'
Chunk ID: 38873d
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 25
Output:
total 8
drwxr-xr-x 2 jorge users 4096 Mar 20 23:33 .
drwxr-xr-x 4 jorge users 4096 Mar 20 23:33 ..

```

## 2026-03-20T22:34:12.884Z assistant_message
phase: commentary

The script includes the documented product-resolution fallbacks, but it will stop on the exact 5-call path if the first numeric lookup resolves both products. I’m checking one local example for the ledger-account repair payload so the recovery branch is precise if it’s needed.

## 2026-03-20T22:34:12.885Z tool_call
tool: exec_command
call_id: call_jmLCurM8Nti3uXODtw98Hgdq

```json
{
  "cmd": "rg -n \"bankAccountNumber|ledger/account/\\{id\\}|:invoice\\?invoiceDate\" -S .",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:34:12.900Z tool_call
tool: exec_command
call_id: call_FSIFqUlJ8PbwXDjimQNNaNis

```json
{
  "cmd": "sed -n '1,220p' ./trusted-standards/common-endpoints.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:34:12.920Z tool_result
tool: exec_command
call_id: call_jmLCurM8Nti3uXODtw98Hgdq

```text
Command: /run/current-system/sw/bin/zsh -lc "rg -n \"bankAccountNumber|ledger/account/\\{id\\}|:invoice\\?invoiceDate\" -S ."
Chunk ID: 656c3c
Wall time: 0.0001 seconds
Process exited with code 0
Original token count: 3957
Output:
./AGENTS.md:152:- `/ledger/account` and `/ledger/account/{id}` — chart-of-accounts search/create/update/delete
./AGENTS.md:238:- If `PUT /order/{id}/:invoice` fails with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`, do one conditional repair branch: `GET /ledger/account?isBankAccount=true&fields=*`, update the existing invoice bank account under `/ledger/account/{id}` (usually `1920` / `isInvoiceAccount=true`) with a valid unique 11-digit `bankAccountNumber`, then retry the same order invoice once; do not create a second order or project.
./AGENTS.md:239:- In fresh-account runs where `PUT /order/{id}/:invoice` is likely the first outgoing invoice of the run, a proactive `GET /ledger/account?isBankAccount=true&fields=*` is only a situational hedge against the missing-company-bank-account `422`, not the canonical exact order-to-invoice-to-payment fast path. Keep the 5-call default unless the run already gives strong reason to expect that bank-account validation branch; if you do take the hedge and the chosen invoice account already has a `bankAccountNumber`, skip the repair and reuse the same order write.
./AGENTS.md:240:- For the exact project-first fixed-price partial-billing shape, the 2026-03-20 production run for `Tindra AS` / `870827946` / `Nettbutikk-utvikling` / `kristian.nilsen@example.org` / `181650` / `50%` scored only `3.33/4` because it inserted that proactive `/ledger/account` hedge even though the read showed invoice account `1920` already had a valid `bankAccountNumber`. The lower-call replacement path for that exact shape is the optimistic 5-call branch `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`, with `/ledger/account` reserved for a proven missing-bank-account branch.
./AGENTS.md:242:- A later 2026-03-20 production run for `Sjøbris AS` / `825338756` / `Automatiseringsprosjekt` / `knut.kvamme@example.org` / `316000` / `50%` exposed the opposite efficiency miss on the same project-first update branch: the initial `GET /project` already proved the exact project, nested customer, and nested manager email, but the optimistic `PUT /order/:invoice` hit `422 Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.` The successful path became `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> failed `PUT /order/:invoice` -> `GET /ledger/account` -> `PUT /ledger/account/{id}` -> retry `PUT /order/:invoice` for `8` total calls.
./AGENTS.md:255:- Production reflection on 2026-03-20 for the exact prompt shape `977448239` with `Konsulenttimer (6390)`, `Systemutvikling (1652)`, `Webdesign (3273)`, and VAT `25%` / `15%` / `0%` showed that spending `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` was one wasted call. The products resolved directly by exact number, the invoice still needed the later conditional bank-account repair, and the realistic lower-call replacement in that same fresh-account state is `GET /customer` -> `GET /product?productNumber=6390&productNumber=1652&productNumber=3273&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional `GET /ledger/account` -> `PUT /ledger/account/{id}` -> single invoice retry.
./trusted-standards/register-project-hours-and-create-project-invoice.md:49:8. `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`
./trusted-standards/register-project-hours-and-create-project-invoice.md:119:  - update the existing invoice bank account with `PUT /ledger/account/{id}` and a valid unique `bankAccountNumber`
./task-playbooks/register-project-hours-and-create-project-invoice.md:68:- `POST /order` with one embedded project-linked line for `count=5`, `unitPriceExcludingVatCurrency=1750`, `vatType.id=6` then `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` succeeded with:
./task-playbooks/register-project-hours-and-create-project-invoice.md:73:- the same persistent sandbox already had `1920` / `isInvoiceAccount=true` with `bankAccountNumber=12345678903`, so a default `/ledger/account` preflight would have been an unnecessary extra call in that exact rerun state
./task-playbooks/register-project-hours-and-create-project-invoice.md:142:   - `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
./trusted-standards/create-and-send-customer-invoice.md:30:   - `PUT /ledger/account/{id}` with a checksum-valid unique 11-digit `bankAccountNumber`
./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:34:9. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:96:  - update the existing invoice account with `PUT /ledger/account/{id}` using a valid unique 11-digit `bankAccountNumber`
./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:122:  - that proactive read showed invoice account `1920` already had a valid `bankAccountNumber`
./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:143:  - the successful production path became `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> failed `PUT /order/:invoice` -> `GET /ledger/account` -> `PUT /ledger/account/{id}` -> retry `PUT /order/:invoice` for `8` total calls
./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md:144:  - the same-day persistent sandbox still had invoice account `1920` with `bankAccountNumber=12345678903`, and an analog proof run measured the configured-account update branch at `5` calls plus the already-known skip-`PUT` branch at `4` calls
./task-playbooks/create-and-send-customer-invoice.md:92:PUT /ledger/account/{id}
./task-playbooks/create-and-send-customer-invoice.md:94:  "bankAccountNumber": "12345678903"
./task-playbooks/create-and-send-customer-invoice.md:169:- The public/spec-confirmed path that solved this was `PUT /ledger/account/{id}`
./task-playbooks/create-and-send-customer-invoice.md:170:- Do not create a second invoice bank account with the same `bankAccountNumber`
./task-playbooks/create-and-send-customer-invoice.md:195:   - update the existing invoice account with `PUT /ledger/account/{id}`
./trusted-standards/create-order-invoice-and-register-payment.md:28:7. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<id>&paidAmount=<seed>&paymentTypeIdRestAmount=<same-id>`
./trusted-standards/create-order-invoice-and-register-payment.md:47:- if you take that hedge and the chosen invoice account already has a `bankAccountNumber`, skip the repair and continue with the same invoice write
./trusted-standards/create-order-invoice-and-register-payment.md:73:  - update the existing invoice bank account with `PUT /ledger/account/{id}` using a valid unique 11-digit `bankAccountNumber`
./trusted-standards/create-order-invoice-and-register-payment.md:101:  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false&paymentTypeId=32813748&paidAmount=0.01&paymentTypeIdRestAmount=32813748`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:24:  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` failed with `422` and validation message `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:25:  - `GET /ledger/account?isBankAccount=true&fields=*`, then `PUT /ledger/account/{id}` on the existing invoice bank account `1920`, then retrying the same `PUT /order/{id}/:invoice` succeeded
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:46:  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` then succeeded and one decisive `GET /invoice/{id}?fields=*,customer(*),orders(*,project(*,customer(*),projectManager(*)),orderLines(*)),orderLines(*)` proved:
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:50:  - in that current sandbox state, invoice account `1920` already had `bankAccountNumber=12345678903`, so the company-bank-account validation did not reproduce there
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:60:  - `PUT /ledger/account/{id}` on the existing invoice account because `bankAccountNumber` was missing
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:67:  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` succeeded directly in persistent sandbox without any `/ledger/account` preflight because that sandbox company already had a valid invoice bank account
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:71:  - that read returned invoice account `1920` with `bankAccountNumber=12345678903`, so the later invoice write already had the prerequisite it needed
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:94:  - the successful production path became `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> failed `PUT /order/:invoice` -> `GET /ledger/account` -> `PUT /ledger/account/{id}` -> retry `PUT /order/:invoice` for `8` calls
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:95:  - the same-day persistent sandbox still had invoice account `1920` with `bankAccountNumber=12345678903`, and an analog proof measured the update-needed configured-account branch at `5` calls and the skip-`PUT` branch at `4`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:156:   - `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:160:   - `PUT /ledger/account/{id}` with a valid unique 11-digit `bankAccountNumber`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:228:  9. `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`
./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md:273:- Do not insert a default `GET /ledger/account?isBankAccount=true&fields=*` between `POST /order` and `PUT /order/{id}/:invoice` just because the account is fresh; the 2026-03-20 `Tindra AS` production run lost the efficiency point on that exact wasted preflight when account `1920` already had a valid `bankAccountNumber`
./task-playbooks/create-customer-invoice.md:26:  - the same run then hit the known missing-company-bank-account validation on the first `POST /invoice`, so the realistic minimal successful production path for that exact account state was six calls: `GET /customer?organizationNumber=977448239&fields=*` -> `GET /product?productNumber=6390&productNumber=1652&productNumber=3273&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> single retry
./task-playbooks/create-customer-invoice.md:47:  - the first invoice write hit the known bank-account validation and succeeded only after the documented `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` repair -> single retry branch
./task-playbooks/create-customer-invoice.md:269:3. `PUT /ledger/account/{id}` with:
./task-playbooks/create-customer-invoice.md:273:  "bankAccountNumber": "12345678903"
./task-playbooks/create-order-invoice-and-register-payment.md:27:  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` on an order created that way succeeded directly
./task-playbooks/create-order-invoice-and-register-payment.md:32:  - `GET /ledger/account?isBankAccount=true&fields=*`, then `PUT /ledger/account/{id}` on the existing invoice bank account `1920`, then retrying the same `PUT /order/{id}/:invoice` succeeded
./task-playbooks/create-order-invoice-and-register-payment.md:56:  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
./task-playbooks/create-order-invoice-and-register-payment.md:64:  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
./task-playbooks/create-order-invoice-and-register-payment.md:72:  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
./task-playbooks/create-order-invoice-and-register-payment.md:81:  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
./task-playbooks/create-order-invoice-and-register-payment.md:110:   - `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<id>&paidAmount=<seed>&paymentTypeIdRestAmount=<same-id>`
./task-playbooks/create-order-invoice-and-register-payment.md:116:   - `PUT /ledger/account/{id}` with a valid `bankAccountNumber`
./task-playbooks/create-order-invoice-and-register-payment.md:137:  7. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<id>&paidAmount=<seed>&paymentTypeIdRestAmount=<same-id>`
./task-playbooks/create-order-invoice-and-register-payment.md:223:  - update the existing invoice bank account with `PUT /ledger/account/{id}`
./trusted-standards/create-customer-invoice.md:66:  - update existing invoice account with `PUT /ledger/account/{id}`
./trusted-standards/create-customer-invoice.md:88:- that same run then hit the known missing-company-bank-account validation on the first `POST /invoice`, so the realistic lower-call replacement in that exact fresh-account state is `GET /customer?organizationNumber=977448239&fields=*` -> `GET /product?productNumber=6390&productNumber=1652&productNumber=3273&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> single retry of the same invoice write
./trusted-standards/common-endpoints.md:250:  - for fresh-account runs where `PUT /order/{id}/:invoice` is likely the first outgoing invoice of the run, a proactive `GET /ledger/account?isBankAccount=true&fields=*` is only a situational hedge against the missing-company-bank-account `422`, not the canonical exact path for this task shape; if you take that hedge and the chosen invoice account lacks `bankAccountNumber`, repair it first and then invoice once
./trusted-standards/common-endpoints.md:256:  - the 2026-03-20 `Tindra AS` production run lost the efficiency point after a wasted proactive `/ledger/account` read that found account `1920` already had a valid `bankAccountNumber`, and the later same-day `Soleil SARL` post-run sandbox proof showed the remaining one-call optimization is skipping `PUT /project` when the first project read already proves the target project state
./trusted-standards/common-endpoints.md:258:  - a later same-day production run for `Sjøbris AS` showed the opposite miss on the update-needed branch: the optimistic `5`-call path became `8` because the first invoice write discovered the missing-company-bank-account prerequisite and had to recover through `GET /ledger/account` -> `PUT /ledger/account/{id}` -> retry `PUT /order/:invoice`
./trusted-standards/common-endpoints.md:285:  - sometimes company bank-account repair through `/ledger/account/{id}`
./trusted-standards/common-endpoints.md:302:  - if the first `POST /invoice` on an exact-number existing-product create-only path fails only on the missing-company-bank-account validation, repair `/ledger/account/{id}` and retry the exact same invoice payload once; do not re-read customer, products, or `/ledger/vatType`
./trusted-standards/common-endpoints.md:435:- `/ledger/account/{id}`
./openapi.json:13674:    "/ledger/account/{id}" : {
./openapi.json:39625:          "bankAccountNumber" : {
./openapi.json:40988:          "bankAccountNumber" : {
./openapi.json:45242:          "bankAccountNumber" : {
./openapi.json:83812:          "bankAccountNumber" : {
./openapi.json:92488:          "bankAccountNumber" : {
./openapi.json:107974:          "bankAccountNumber" : {

```

## 2026-03-20T22:34:12.934Z tool_result
tool: exec_command
call_id: call_FSIFqUlJ8PbwXDjimQNNaNis

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,220p' ./trusted-standards/common-endpoints.md"
Chunk ID: 2c470b
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 4350
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
  - 2026-03-20 persistent sandbox re-proof confirmed there is still no safe `2`-call shortcut for that exact shape: `POST /project` with nested `customer { name, organizationNumber }` can return `201` while leaving `customer=null`, and manager details without `projectManager.id` still fail validation
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
  - `/activity/>forTimeSheet?...&fields=*` exposes the branch flag as `isChargeable`, not `chargeable`
  - if that read returns `isChargeable=false`, do not assume `projectChargeableHours` or a project-specific rate write can still make it billable
  - the 2026-03-20 production German `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18h` / `950` run re-confirmed that once `/activity/>forTimeSheet` already returns `isChargeable=false`, adding `GET /project/hourlyRates` would be wasted; keep the 7-call downstream floor `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
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
- `/timesheet/week/:approve`
  - `PUT` approve week
- Standard time-registration note:
  - a timesheet write on a non-chargeable project activity can still succeed while returning `chargeable=false` and `hourlyRate=0`
  - a timesheet write on a chargeable project activity can also succeed with `chargeable=true` and `hourlyRate=0` when the exact employee+activity rate is missing, so the write alone does not prove the prompt rate was applied
  - `projectChargeableHours` has a hard per-entry ceiling of `24`; `POST /timesheet/entry` above that returns `422 projectChargeableHours: Kan ikke være over 24`
  - Tripletex allows only one timesheet entry per `employee + project + activity + date`; a second same-day write for the same tuple returns `409 Det er allerede registrert timer ...`
  - for project-hour prompts whose total hours exceed `24`, plan a multi-day split before the first write instead of sending one oversized entry or stacking multiple same-day entries
  - if such a run already partially succeeded on one day chunk before the duplicate branch surfaced, use one decisive `GET /timesheet/entry?...` on the intended date window and write only the missing dates

```

## 2026-03-20T22:34:16.417Z tool_call
tool: exec_command
call_id: call_ZJ1CJ8ymPzfhHlCLmDmG3j1s

```json
{
  "cmd": "sed -n '250,290p' ./task-playbooks/create-customer-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 6000
}
```

## 2026-03-20T22:34:16.420Z tool_call
tool: exec_command
call_id: call_wSqEGEMG6UTzHaVVXNqr4u4l

```json
{
  "cmd": "sed -n '84,106p' ./task-playbooks/create-and-send-customer-invoice.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-20T22:34:16.448Z tool_result
tool: exec_command
call_id: call_ZJ1CJ8ymPzfhHlCLmDmG3j1s

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '250,290p' ./task-playbooks/create-customer-invoice.md"
Chunk ID: c29107
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

## 2026-03-20T22:34:16.450Z tool_result
tool: exec_command
call_id: call_wSqEGEMG6UTzHaVVXNqr4u4l

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '84,106p' ./task-playbooks/create-and-send-customer-invoice.md"
Chunk ID: 99d237
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 162
Output:
1. Find the company bank ledger account with:
   `GET /ledger/account?isBankAccount=true&fields=*`
2. Pick the existing invoice account:
   usually account `1920`
   must have `isInvoiceAccount=true`
3. Register the bank account number on that account:

```http
PUT /ledger/account/{id}
{
  "bankAccountNumber": "12345678903"
}
```

This was verified in sandbox:
- invoice creation failed before this update
- invoice creation succeeded after this update
- not every 11-digit string is accepted in practice; use a checksum-valid unique 11-digit number

## Key Finding: Resolve VAT Type Dynamically

Do not hardcode invoice line `vatType.id = 3`.


```

## 2026-03-20T22:34:25.362Z assistant_message
phase: commentary

I have the exact payload shapes I need. Next step is writing the TypeScript runner in the provided scripts directory, then executing it once on the canonical path and only branching if the invoice write hits the known bank-account validation.

## 2026-03-20T22:35:08.196Z tool_call
tool: exec_command
call_id: call_A5jeE6sLf38KVwM2xBjbPqUl

```json
{
  "cmd": "bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts/run.ts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:35:09.352Z tool_result
tool: exec_command
call_id: call_A5jeE6sLf38KVwM2xBjbPqUl

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts/run.ts'
Chunk ID: 93ab28
Wall time: 1.0014 seconds
Process running with session ID 72304
Original token count: 0
Output:

```

## 2026-03-20T22:35:10.584Z assistant_message
phase: commentary

The script is running against the canonical path now. I’m waiting on the result and will only edit if the live response shows a specific repair branch is required.

## 2026-03-20T22:35:10.986Z tool_call
tool: write_stdin
call_id: call_0TapHVBYHtOenoSTIh8UU2D3

```json
{
  "session_id": 72304,
  "chars": "",
  "yield_time_ms": 1000,
  "max_output_tokens": 12000
}
```

## 2026-03-20T22:35:10.993Z tool_result
tool: write_stdin
call_id: call_0TapHVBYHtOenoSTIh8UU2D3

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts/run.ts'
Chunk ID: 036d96
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 44
Output:
{"ok":true,"customerId":108284401,"orderId":401975681,"invoiceId":2147552137,"invoiceNumber":1,"amountCurrencyOutstanding":0,"amountOutstanding":0,"paymentTypeId":36030207}

```

## 2026-03-20T22:35:13.662Z assistant_message
phase: final_answer

Erledigt. Auftrag erstellt, in Rechnung umgewandelt, vollständige Zahlung registriert.

Run-Skript: [run.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts/run.ts)

## 2026-03-20T22:35:13.699Z task_event
event: task_complete

Erledigt. Auftrag erstellt, in Rechnung umgewandelt, vollständige Zahlung registriert.

Run-Skript: [run.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223338492Z-068af8cf/scripts/run.ts)
