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
   - use `GET /product?count=1000&fields=*` and filter locally by the `number` response field matching the prompt refs, and by exact product name from the prompt as a secondary check
   - do not rely on the `productNumber` field since it is often null/undefined in fresh accounts
   - do not use a 2-tier `productNumber` first approach — it is unreliable and can waste an extra call when `productNumber` partially resolves
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
   - `PUT /ledger/account/{id}` with the minimal payload `{ "bankAccountNumber": "12345678903" }`
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
- the winning path is always 5 Tripletex API calls when the run does not already hold a reusable incoming `paymentTypeId`:
  1. `GET /customer?organizationNumber=...&fields=*`
  2. `GET /product?count=1000&fields=*` + local filter by `number` field and exact name
  3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  4. `POST /order` with embedded `orderLines`
  5. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<id>&paidAmount=0.01&paymentTypeIdRestAmount=<same-id>`
- if the same run already holds a proven valid incoming `paymentTypeId` for the same company and currency, the same exact task drops to 4 calls by skipping step 3
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

- Use `GET /product?count=1000&fields=*` as the default and only product lookup
- Filter locally by the `number` response field matching the prompt refs
- **CRITICAL type pitfall**: `product.number` is always a **string** in the API response (e.g. `"6247"`), never an integer; use `String(p.number) === String(promptRef)` or loose equality — strict `p.number === 6247` silently fails and wastes API calls on the retry
- Use exact product name from the prompt as a secondary match check
- Do not rely on the `productNumber` field since it is often null/undefined in fresh accounts
- Do not use the old 2-tier approach (`productNumber` first → `count=1000` fallback); it is unreliable and wastes a call when `productNumber` partially resolves
- Do not use `GET /product?ids=<ref>&fields=*` — prompt refs are small integers, never Tripletex internal IDs (84M+ range)
- Do not spray multiple exploratory `/product` reads
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
