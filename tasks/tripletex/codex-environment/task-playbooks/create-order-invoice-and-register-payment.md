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
- description-only invoice tasks where the prompt gives only a service description (e.g. "Systemutvikling") without product numbers — use `./task-playbooks/create-and-send-customer-invoice.md` or `./task-playbooks/create-customer-invoice.md` instead; `POST /invoice` handles description-only lines natively without products
- tasks that require sending the invoice — use `./task-playbooks/create-and-send-customer-invoice.md`

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
- same-day production verification on 2026-03-20 for the exact German prompt `Waldstein GmbH` / `975687821` / `Netzwerkdienst (4366)` / `Beratungsstunden (3402)` confirmed the canonical 5-call path directly:
  - `GET /customer?organizationNumber=975687821&fields=*`
  - `GET /product?productNumber=4366&productNumber=3402&fields=*`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false&paymentTypeId=36030207&paidAmount=0.01&paymentTypeIdRestAmount=36030207`
  - that run needed no `/ledger/account` repair branch and the invoice write returned outstanding `0`
- same-day production verification on 2026-03-20 for the exact Norwegian prompt `Vestfjord AS` / `970769994` / `Nettverksteneste (3237)` / `Analyserapport (4609)` / prices `13450` + `14200` re-confirmed that same uncached 5-call path on a second prompt family:
  - `GET /customer?organizationNumber=970769994&fields=*`
  - `GET /product?productNumber=3237&productNumber=4609&fields=*`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false&paymentTypeId=<resolved>&paidAmount=0.01&paymentTypeIdRestAmount=<same-id>`
  - that run also needed no `/ledger/account` repair branch and the invoice write returned outstanding `0`
- paired with the same-day persistent-sandbox proof for the same customer/product refs, this also confirmed that `paymentTypeId` is environment-specific: sandbox used `32813748`, production used `36030207`; keep resolving `/invoice/paymentType` dynamically unless the same run already holds a proven reusable id
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

- production run on 2026-03-21 for Spanish prompt `Luna SL` / `966920963` / `Desarrollo de sistemas (5271)` / `Asesoría de datos (3613)` / prices `6950` + `7000`:
  - `GET /product?productNumber=5271&productNumber=3613&fields=*` found only 3613, missed 5271
  - `GET /product?ids=5271&fields=*` returned empty (5271 is not a Tripletex ID — IDs are 84M+)
  - `GET /product?count=1000&fields=*` found product by name filter
  - this proved the `ids` fallback is wasted: prompt refs are never Tripletex internal IDs
  - sandbox verification on 2026-03-21 also proved that `productNumber` and `number` API query params use AND semantics when combined, so mixing them in one call does not help cross-field matching
  - further production run on 2026-03-21 for Portuguese prompt `Estrela Lda` / `842487803` / `Design web (1851)` / `Consultoria de dados (5065)` also had `productNumber=1851` miss — confirming that `productNumber` is unreliable across accounts
  - sandbox verification on 2026-03-21 proved that `count=1000` as the default first product lookup guarantees 5 calls every time, eliminating the 2-tier inconsistency
- production run on 2026-03-21 for Portuguese prompt `Horizonte Lda` / `904130338` / `Serviço de rede (6247)` / `Desenvolvimento de sistemas (5919)` / prices `15250` + `13250`:
  - used the canonical 5-call path with `count=1000` product lookup
  - initial script attempt wasted 2 API calls (GET customer + GET product) because it matched `p.number === 6247` with strict integer equality — `product.number` is always a string (`"6247"`), causing silent mismatch and local throw
  - after fixing to `String(p.number) === "6247"`, the second run completed all 5 calls successfully with 0 errors
  - this proves `product.number` type is string, not integer — added as a critical type pitfall in both trusted standard and playbook
  - total actual API calls: 7 (2 wasted + 5 successful), ideal was 5
- production run on 2026-03-21 for Portuguese prompt `Solmar Lda` / `867069526` / `Sessão de formação (4466)` / `Licença de software (3717)` / prices `35600` + `3250`:
  - used `count=1000` product lookup, `String(p.number)` comparison, `paidAmount=0.01` seed
  - 5 calls, 0 errors, outstanding=0 — canonical minimum confirmed
  - sandbox investigation on same day proved `number=X,Y` comma-separated query uses OR semantics:
    - `number=7579,2292` returned both products; `number=7579,2292,4366` returned all 3
    - `number=7579,99999` gracefully returned 1 (no error for missing)
    - this is strictly better than `count=1000` for targeted lookups
  - also confirmed `productNumber` is NOT a valid field in ProductDTO `fields` filter (returns 400)
  - `number=X&number=Y` (repeated query params) uses non-OR semantics and only returns first value — do not confuse with comma-separated format
- production run on 2026-03-21 for English prompt `Ridgepoint Ltd` / `997470311` / `Maintenance (6293)` + `Software License (5849)` / prices `21700` + `2250`:
  - used comma-separated `number=6293,5849` product lookup, `String(p.number)` comparison, `paidAmount=0.01` seed
  - 5 calls, 0 errors, outstanding=0 — 2nd confirmation of the comma-separated product lookup on this exact task shape
  - confirms the canonical 5-call path is stable across English and Portuguese prompts with comma-separated `number` filter
- production run on 2026-03-21 for Nynorsk prompt `Strandvik AS` / `911845016` / `Skylagring (7865)` + `Datarådgjeving (3949)` / prices `38500` + `18500`:
  - used comma-separated `number=7865,3949` product lookup, `String(p.number)` comparison, `paidAmount=0.01` seed
  - wasted 1 call (6 total): first script filtered paymentTypes by nonexistent `pt.isIncoming === true` and aborted; a debug call re-fetched paymentTypes; second script succeeded with hardcoded IDs
  - root cause: payment type objects have no `isIncoming` field — just use `pts[0]`
  - sandbox confirmed both "Kontant" and "Betalt til bank" work for the combined write
- production run on 2026-03-21 for Portuguese prompt `Cascata Lda` / `927161524` / `Consultoria de dados (8400)` + `Design web (2535)` / prices `5700` + `3850`:
  - used comma-separated `number=8400,2535` product lookup, `String(p.number)` comparison, `paidAmount=0.01` seed, `pts[0]` payment type selection
  - 5 calls, 0 errors, outstanding=0 — 4th confirmation of the canonical 5-call path
  - sandbox investigation disproved three call-reduction hypotheses: inline `product: { number }` creates orphaned lines (no product linkage), inline `customer: { organizationNumber }` rejected (422, requires name), hardcoded `paymentTypeId=1` rejected (422) — 5 calls is the proven floor
- production run on 2026-03-21 for Spanish prompt `Río Verde SL` / `937237243` / `Informe de análisis (5700)` + `Diseño web (2680)` / prices `33200` + `17200`:
  - used comma-separated `number=5700,2680` product lookup, `String(p.number)` comparison, `paidAmount=0.01` seed, `pts[0]` payment type selection
  - 5 calls, 0 errors, outstanding=0 — 5th confirmation of the canonical 5-call path
  - sandbox also disproved paymentTypeId omission: `PUT /order/:invoice` with `paidAmount` but no `paymentTypeId` → 422; `PUT /invoice/:payment` without `paymentTypeId` → 422; GET /invoice/paymentType cannot be eliminated
- production run on 2026-03-22 for French prompt `Colline SARL` / `953795493` / `Rapport d'analyse (6272)` + `Heures de conseil (7628)` / prices `30600` + `2350`:
  - used comma-separated `number=6272,7628` product lookup, `String(p.number)` comparison, `paidAmount=0.01` seed, `pts[0]` payment type selection
  - 5 calls, 0 errors, outstanding=0 — 6th confirmation of the canonical 5-call path
  - FIRST French-language production confirmation on this task shape
- production run on 2026-03-22 for Portuguese prompt `Floresta Lda` / `919172657` / `Sessão de formação (4783)` + `Armazenamento na nuvem (3343)` + `Serviço de rede (4380)` / prices `24900` + `14050` + `15750` / VAT 25% + 15% + 0%:
  - FIRST production run using the new 4-call `POST /invoice` path (not the old `POST /order` + `PUT /order/:invoice` path)
  - FIRST 3-product confirmation on this task shape
  - FIRST bank-account repair needed on this task shape
  - used comma-separated `number=4783,3343,4380&fields=*,vatType(*)`, `pts[0]` payment type selection, exact `paidAmount=63032.5`
  - initial script lacked recovery branch → POST /invoice 422 (bankkontonummer) crashed script → re-wrote script with recovery → re-ran from scratch → total **11 API calls** (4 wasted from restart + 7 with recovery), **2 × 422 errors**
  - root cause: script did not include bank-account recovery from the start; the 4 wasted calls (GET customer + GET product + GET paymentType + POST /invoice 422) were completely avoidable
  - ideal with proactive hedge: 6 calls, 0 errors (GET customer + GET product + GET paymentType + GET /ledger/account + PUT /ledger/account + POST /invoice)
  - sandbox-verified 2026-03-22: proactive hedge path = 5 calls when bank acct exists, 6 calls when bank acct missing, 0 errors either way
- production run on 2026-03-22 for Norwegian prompt `Snøhetta AS` / `800082021` / `Webdesign (2797)` + `Analyserapport (5684)` / prices `33100` + `18550`:
  - used `POST /invoice` path with proactive bank-account hedge, comma-separated `number=2797,5684&fields=*,vatType(*)`, exact `paidAmount=64562.5` (both products 25% VAT), `pts[0]` payment type selection
  - bank account 1920 already configured — hedge cost 1 extra call but guaranteed 0 errors
  - 5 calls, 0 errors, outstanding=0 — 2nd confirmation of `POST /invoice` path with proactive hedge
  - confirms the 5-call hedge path is stable as the recommended default; 4-call path (skip hedge) would have sufficed here but risks 422 + retry on fresh accounts

## Minimal Flow

1. Confirm these operations in `./openapi.json`
   - `GET /customer`
   - `GET /product`
   - `GET /invoice/paymentType`
   - `POST /invoice`
2. Resolve the customer
   - usually `GET /customer?organizationNumber=...&fields=*`
3. Resolve the products from prompt refs with VAT info
   - use `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)` with comma-separated prompt refs; verify the returned count matches the expected count
   - `vatType(*)` expands each product's VAT type to include `percentage` — needed to compute the exact `paidAmount`
   - if any are missing, fall back to `GET /product?count=1000&fields=*,vatType(*)` and filter locally by `number` response field
   - do not rely on the `productNumber` field since it is often null/undefined in fresh accounts; `productNumber` is not even a valid ProductDTO `fields` value (returns 400)
   - do not use `number=X&number=Y` (repeated query params) — this uses non-OR semantics and only returns the first value
4. Resolve one usable payment type
   - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
   - just use the first available payment type — do NOT filter by `isIncoming` (that field does not exist)
   - do not reject the candidate just because `creditAccount` is `null`
5. Proactive bank-account hedge (recommended for fresh accounts)
   - `GET /ledger/account?isBankAccount=true&fields=*`
   - find the invoice bank account (`isInvoiceAccount=true`, usually number `1920`)
   - if `bankAccountNumber` is missing/empty, repair with `PUT /ledger/account/{id}` using `{ "bankAccountNumber": "12345678903" }`
   - if `bankAccountNumber` already exists, skip the PUT (0 extra cost beyond the GET)
   - this avoids the catastrophic 422 + script-restart waste that hit the 2026-03-22 production run (11 calls instead of 6)
6. Compute the exact invoice total including VAT
   - `paidAmount = Σ(unitPriceExcludingVat_i × count_i × (1 + vatType.percentage_i / 100))`
   - use the `percentage` from each product's expanded `vatType(*)` response
7. Create order, invoice, and register payment in one call
   - `POST /invoice?sendToCustomer=false&paymentTypeId=<id>&paidAmount=<computed total>`
   - body: `{ invoiceDate, invoiceDueDate, orders: [{ customer: { id }, orderDate, deliveryDate, orderLines: [...] }] }`
   - `POST /invoice` creates the order and invoice atomically, and `paymentTypeId` + `paidAmount` register the payment in the same write
   - do NOT use `paidAmount=0.01` with `POST /invoice` — unlike `PUT /order/:invoice`, there is no `paymentTypeIdRestAmount` param, so it only pays the literal amount
   - do NOT overpay — setting `paidAmount` higher than the actual total creates negative outstanding (a credit)
   - **CRITICAL**: the script MUST include inline recovery for the `bankkontonummer` 422 even if the proactive hedge is used — defense in depth against unexpected bank-account state
8. Reuse the invoice write response
   - verify `amountCurrencyOutstanding` first, otherwise `amountOutstanding`
   - use invoice totals/lines in that response as verification where available
9. Stop when remaining outstanding amount is `0`
   - if outstanding ≠ 0 due to rounding, fall back to `PUT /invoice/{id}/:payment` to settle the remainder (adds 1 call)

## Exact-Match Fast Path

- For a prompt that already identifies:
  - the existing customer by organization number
  - the existing products by numeric refs
  - the order line prices
  - the need to invoice and fully pay immediately
- the recommended path is **5 Tripletex API calls** (with proactive bank-account hedge):
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)` — comma-separated refs, OR semantics, VAT percentage included
  3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  4. `GET /ledger/account?isBankAccount=true&fields=*` — conditionally `PUT` to repair bank account if missing
  5. `POST /invoice?sendToCustomer=false&paymentTypeId=<id>&paidAmount=<computed total>` with embedded `orders[].orderLines`
- the absolute minimum is 4 calls (skip step 4), but risks 422 + retry (7 calls + 1 error) on fresh accounts — the proactive hedge is safer and cheaper in expectation
- if the same run already holds a proven valid incoming `paymentTypeId` for the same company and currency, drop to 4 calls by skipping step 3
- if the bank account repair is needed, the total becomes 6 calls (5 + 1 PUT) with 0 errors — still better than the reactive 7 + 1 error
- If the invoice response already proves the charged lines/totals and outstanding amount, that same write response is enough; do not automatically add a follow-up payment or verification read

## Invoice Payload Notes

- `POST /invoice` creates the order and invoice atomically — the body embeds the order inside the invoice
- a safe payload shape is:

```json
{
  "invoiceDate": "2026-03-22",
  "invoiceDueDate": "2026-04-22",
  "orders": [{
    "customer": { "id": 123 },
    "orderDate": "2026-03-22",
    "deliveryDate": "2026-03-22",
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
  }]
}
```

- the query parameters `paymentTypeId=<id>&paidAmount=<total>&sendToCustomer=false` handle payment + send behavior
- if the account/product setup requires it, include a valid `vatType` on the order line
- when you already resolved products from `GET /product?fields=*,vatType(*)`, reuse the returned product IDs and VAT percentages directly

## Product Resolution Rules

- **Primary**: use `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)` with comma-separated prompt refs
  - comma-separated `number` values use OR semantics and return all matching products in one call
  - `vatType(*)` expands each product's VAT type including `percentage` — needed for paidAmount computation
  - verify the returned count matches the expected product count from the prompt
  - if any are missing, fall back to `GET /product?count=1000&fields=*,vatType(*)` and filter locally by `number` response field
- **CRITICAL type pitfall**: `product.number` is always a **string** in the API response (e.g. `"6247"`), never an integer; use `String(p.number) === String(promptRef)` or loose equality — strict `p.number === 6247` silently fails and wastes API calls on the retry
- Use exact product name from the prompt as a secondary match check
- Do NOT use `number=X&number=Y` (repeated query params) — uses non-OR semantics, only returns first value
- Do not rely on the `productNumber` field — it is often null/undefined in fresh accounts and is not even a valid field in ProductDTO's `fields` filter (returns 400)
- Do not use `GET /product?ids=<ref>&fields=*` — prompt refs are small integers, never Tripletex internal IDs (84M+ range)
- Do not spray multiple exploratory `/product` reads
- Reuse the resolved product objects for IDs and VAT percentages

## Payment Rules

- **CRITICAL**: payment type objects from `GET /invoice/paymentType` do NOT have an `isIncoming` field; do NOT filter by `pt.isIncoming === true` — it will always find nothing and block the run
- The available keys are: `id`, `version`, `url`, `description`, `displayName`, `debitAccount`, `creditAccount`, `vatType`, `sequence`, `customer`, `supplier`, `currencyId`, `currencyCode`
- Just use the first available payment type (`pts[0]`) — both "Kontant" and "Betalt til bank" work for the invoice-and-payment write
- Do not require a `15xx` `creditAccount`; the correct payment type may return `creditAccount=null`
- **paidAmount computation**: `paidAmount = Σ(unitPrice_i × count_i × (1 + vatType.percentage_i / 100))` — compute from product VAT percentages resolved in step 3
- Do NOT use `paidAmount=0.01` with `POST /invoice` — it only pays 0.01 (no `paymentTypeIdRestAmount` on this endpoint)
- Do NOT overpay — excess creates negative outstanding (credit), not a cap at zero
- Do not use `paidAmount=0`; validation rejects it as missing
- Only fall back to a later standalone `PUT /invoice/{id}/:payment` if the computed paidAmount leaves a nonzero outstanding (rounding edge case)

## Recovery Rule After Partial Success

- If `POST /invoice` fails only because the company bank account number is missing:
  - do `GET /ledger/account?isBankAccount=true&fields=*`
  - update the existing invoice bank account with `PUT /ledger/account/{id}`
  - retry the same `POST /invoice?...` with the same payload
- If `POST /invoice` succeeded but `amountOutstanding ≠ 0` (rounding edge case):
  - settle with `PUT /invoice/{id}/:payment?paymentTypeId=<id>&paymentDate=<date>&paidAmount=<outstanding>&paidAmountCurrency=<outstanding>`

## Verification Shape

- `POST /invoice`:
  - expect `ResponseWrapperInvoice`
  - reuse `id`, `invoiceNumber`, invoice totals, and outstanding amount
  - `orders[0].id` gives the created order id
  - `orderLines[]` gives the created order line ids
- `PUT /invoice/{id}/:payment` (fallback only):
  - expect `ResponseWrapperInvoice`
  - verify remaining outstanding amount is `0`

## If You Still Need To Probe

- First probe only the exact missing uncertainty
- Good examples:
  - `GET /invoice/{id}?fields=*,orderLines(*,product(*)),orders(*,orderLines(*,product(*)))` if you must confirm line creation and product linkage after the invoice write
  - `GET /product?ids=...&fields=*` if product-number lookup failed
- Avoid widening into generic invoice/order browsing when the created invoice response already proves the next step
