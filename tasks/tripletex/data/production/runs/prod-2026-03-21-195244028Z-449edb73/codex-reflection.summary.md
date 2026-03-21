# Post-Run Reflection: prod-2026-03-21-195244028Z-449edb73

## 1. Task

Create and send an invoice to existing customer Bergvik AS (org.nr 890733751) for 28 900 kr excluding VAT. The invoice is for "Systemutvikling" (system development). Norwegian prompt with `eksklusiv MVA` → taxed 25% branch.

## 2. Reflection

**What went well:**
- Final Tripletex state was correct: `amountExcludingVatCurrency=28900`, `amountCurrency=36125` (25% VAT applied), invoice sent
- Bank-account repair branch executed correctly when the `422` fired
- Customer was correctly identified as existing (GET, not POST)

**What went poorly:**
- Agent selected the wrong trusted standard: read `create-order-invoice-and-register-payment` instead of `create-and-send-customer-invoice`
- The wrong standard explicitly says "Do Not Use This Standard If the task explicitly requires sending the invoice" — but the agent continued with the order-based flow anyway
- Agent searched for products (`GET /product?count=1000`) when the task gives only a description, not product numbers
- Agent created an unnecessary product (`POST /product`) — direct invoice lines work without product references
- Used the order-based 2-step flow (`POST /order` + `PUT /order/:invoice`) instead of the single-step `POST /invoice`
- Ran the task in 2 separate scripts, wasting the first script's GET calls

**Root cause of mistakes:**
1. **Wrong standard selection**: The agent read the first matching-looking standard (order-invoice-payment) without checking if the task explicitly matched a different, better standard (create-and-send-customer-invoice)
2. **Product assumption**: The agent assumed all invoice lines need a product reference, which is incorrect — `POST /invoice` with `orders[].orderLines[]` handles description-only lines natively (`product: null` on readback)

## 3. Call Efficiency

**NOT minimal-call.** The run used **8 API calls** (1 error) instead of the optimal **6 calls** (1 error, bank repair needed) or **3 calls** (happy path).

| # | Call | Status | Verdict |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=890733751&fields=*` | 200 | NEEDED |
| 2 | `GET /product?count=1000&fields=*` | 200 | **WASTED** — no products needed for description-only lines |
| 3 | `POST /product` (Systemutvikling) | 201 | **WASTED** — direct lines don't need product references |
| 4 | `POST /order` | 201 | **WASTED** — should have used `POST /invoice` directly |
| 5 | `PUT /order/:invoice` (first attempt) | 422 | **WASTED** — wrong flow; bank error would also hit on `POST /invoice` but the order step itself was unnecessary |
| 6 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | NEEDED (bank repair) |
| 7 | `PUT /ledger/account/{id}` | 200 | NEEDED (bank repair) |
| 8 | `PUT /order/:invoice` (retry) | 200 | NEEDED (retry after repair, but in wrong flow) |

**Wasted calls: 4** (GET product, POST product, POST order, first PUT order/:invoice)

**Correct lower-call path for the next agent (with bank repair):**
1. `GET /customer?organizationNumber=890733751&fields=*` → resolve existing customer
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` → select 25% VAT (id=3 in production)
3. `POST /invoice` with `sendToCustomer=true`, `orders[].orderLines[]` containing `description: "Systemutvikling"`, `count: 1`, `unitPriceExcludingVatCurrency: 28900`, `vatType: { id: <25%> }` → 422 bank account
4. `GET /ledger/account?isBankAccount=true&fields=*` → find account 1920
5. `PUT /ledger/account/{id}` with `{ "bankAccountNumber": "12345678903" }` → repair
6. `POST /invoice` (retry) → 201, invoice created and sent

**= 6 calls, 1 error (bank account 422, unavoidable)**

**Happy path (no bank repair): 3 calls, 0 errors.**

## 4. Root Causes

1. **Wrong standard selection**: The agent read `create-order-invoice-and-register-payment` which is for order+invoice+payment tasks with existing products. The correct match was `create-and-send-customer-invoice` which handles direct description-only lines and sending.

2. **Product creation fallacy**: The agent assumed invoice lines require a product ID. In reality, `POST /invoice` with `orders[].orderLines[]` containing only `description`, `count`, `unitPriceExcludingVatCurrency`, and `vatType` creates lines correctly. Readback shows `product: null`.

3. **Two-step order flow**: The `POST /order` + `PUT /order/:invoice` flow is strictly more calls than `POST /invoice` for this task shape, and also requires a product reference that the direct flow does not need.

## 5. Sandbox Verification

Verified in persistent sandbox on 2026-03-21:

- `POST /invoice` with description-only order line (`description: "Systemutvikling"`, no `product` field) → **201 success**
- Readback via `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*)))` confirmed:
  - `product: null`
  - `description: "Systemutvikling"`
  - `unitPriceExcludingVatCurrency: 28900`
  - `vatType: { id: 6, percentage: 0 }` (sandbox only has 0% VAT)
- This proves the `POST /invoice` direct flow handles product-less lines natively
- No `POST /product` or `GET /product` was needed

## 6. Playbook Changes

Updated existing trusted standards and playbooks (no new files created):

### Files changed:
- `./trusted-standards/create-and-send-customer-invoice.md` — added 3 new Known Pitfalls (description-only line distinction, Norwegian "kunden" definite article, Bergvik AS production run data) and 1 new Sandbox Status entry (description-only line verification)
- `./trusted-standards/create-order-invoice-and-register-payment.md` — added 2 new Do Not Use clauses (sending requirement cross-reference, description-only task cross-reference)
- `./task-playbooks/create-and-send-customer-invoice.md` — added 3 new Proven Send-Channel Pitfalls (order-based flow confusion, description-only line handling, Bergvik AS production run data)
- `./task-playbooks/create-order-invoice-and-register-payment.md` — added 2 new Do Not Use clauses (description-only tasks, send-required tasks)

## 7. Commit

- **Hash**: `2eb3f395`
- **Message**: `tripletex playbook: register-supplier-invoice — add 5th optimal production confirmation (8c302260, German prompt, Waldstein GmbH / 927720523 / INV-2026-6337 / 55950 / 7000 / 25%, 5 calls 0 errors), first account 7000 use, sandbox re-confirm single PUT+sendToLedger=true fails and account:{number,name} fails, 5-call path is true minimum`
- Note: Our 4 playbook/standard changes were bundled into this commit by a concurrent agent process

## 8. Reusable Heuristics

1. **Standard selection is the highest-leverage decision.** Reading the wrong trusted standard led to 4 wasted calls. Always check the "Do Not Use This Standard If" section before proceeding.

2. **Description-only lines do not need products.** When the prompt gives only a service description (e.g., "Systemutvikling") without product numbers in parentheses, use `POST /invoice` with `orders[].orderLines[]` containing `description`, `count`, `unitPriceExcludingVatCurrency`, and resolved `vatType`. No product creation, no product search.

3. **"kunden" (definite) ≠ "en kunde" (indefinite).** Norwegian "kunden" with definite article means the customer exists → `GET /customer`. "en kunde" would mean create → `POST /customer`.

4. **Send-required tasks → `create-and-send-customer-invoice` standard.** Never use the order-based flow for tasks that say "og send" / "and send" / "et envoyer" etc. The `create-order-invoice-and-register-payment` standard explicitly excludes sending.

5. **`POST /invoice` > `POST /order` + `PUT /order/:invoice`** for simple one-line invoices. The direct invoice flow is always fewer calls and doesn't require a product reference.

6. **The bank-account 422 is unavoidable on fresh accounts** but adds only 3 calls to the repair branch (GET account + PUT account + retry invoice). With bank repair, the optimal for this task shape is 6 calls.
