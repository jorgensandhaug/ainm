# Score-Aware Reflection: prod-2026-03-21-195244028Z-449edb73

## Task Attribution

- **tx_task_id**: 06
- **Tier**: T1 (tasks 1-8), max score = 2
- **Prompt**: "Opprett og send en faktura til kunden Bergvik AS (org.nr 890733751) på 28900 kr eksklusiv MVA. Fakturaen gjelder Systemutvikling."
- **Task shape**: create-and-send customer invoice, existing customer, description-only line (no product numbers), Norwegian `eksklusiv MVA` → taxed 25% branch

## Correctness Verdict

**Perfect correctness.** `correctness=1`, `score_raw=7/7`, all 5/5 checks passed.

The final Tripletex state was exactly right:
- Invoice created for Bergvik AS (org.nr 890733751)
- Amount excluding VAT: 28,900 kr
- Amount including VAT: 36,125 kr (correct 25% MVA)
- Invoice description: "Systemutvikling"
- Invoice sent to customer (`sendToCustomer=true`)

## Efficiency Verdict

**Suboptimal.** `normalized_score=1.32` out of 2.0 max (efficiency bonus 0.32 out of 1.0 possible).

- **This run**: 1.32
- **Leaderboard best for task 06**: 1.4 (before and after — this run did not improve the best)
- **Gap to max**: 0.68 points lost to inefficiency

The run used **8 API calls with 1 error (422)**. The optimal path for this specific run (where bank-account repair was needed) is **6 calls with 1 unavoidable error (422)**. That's 2 wasted calls.

| # | Call | Status | Verdict |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=890733751&fields=*` | 200 | Needed |
| 2 | `GET /product?count=1000&fields=*` | 200 | **WASTED** — task has no product numbers; description-only lines don't need product lookup |
| 3 | `POST /product` (Systemutvikling) | 201 | **WASTED** — `POST /invoice` with `orders[].orderLines[]` supports description-only lines without product reference |
| 4 | `POST /order` | 201 | Wrong flow — should have used `POST /invoice` directly |
| 5 | `PUT /order/:invoice` | 422 | Wrong flow + unavoidable bank-account error |
| 6 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Needed (bank repair) |
| 7 | `PUT /ledger/account/{id}` | 200 | Needed (bank repair) |
| 8 | `PUT /order/:invoice` (retry) | 200 | Needed (but for wrong flow) |

**Correct 6-call path with bank repair:**
1. `GET /customer?organizationNumber=890733751&fields=*`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` (→ id=3 at 25%)
3. `POST /invoice` with `sendToCustomer=true` (→ 422 bank account)
4. `GET /ledger/account?isBankAccount=true&fields=*`
5. `PUT /ledger/account/{id}` with `{ "bankAccountNumber": "12345678903" }`
6. `POST /invoice` retry (→ 201)

The order-based flow (`POST /order` + `PUT /order/:invoice`) uses 2 calls where `POST /invoice` uses 1, and the order flow also requires a product ID. This makes the order-based flow strictly worse for description-only invoice tasks.

## Likely Root Cause

**Wrong trusted-standard selection.** The agent read `create-order-invoice-and-register-payment.md` instead of `create-and-send-customer-invoice.md`.

The `create-order-invoice-and-register-payment` standard explicitly says in its "Do Not Use" section: "the task explicitly requires sending the invoice". The task says "Opprett og **send** en faktura" — send is explicit. This should have triggered the agent to use the `create-and-send-customer-invoice` standard instead.

Contributing factors:
1. The agent saw "faktura" (invoice) + "kunden" (customer) + "28900 kr" and pattern-matched to the order→invoice flow, ignoring that it requires existing products and payment registration.
2. The task gives no product numbers — only a description "Systemutvikling". The agent unnecessarily searched for products, found none, then created one, when direct `POST /invoice` order lines support description-only entries with `product: null`.
3. The agent didn't read the `create-and-send-customer-invoice` standard at all, missing the documented 3-call path.

## What Went Right

1. **Perfect correctness** — all 5 checks passed, final Tripletex state was exactly correct
2. **Bank-account repair** — the 422 was handled correctly per the documented recovery branch
3. **VAT handling** — 25% MVA was correctly applied via the product's inherited vatType (id=3)
4. **Customer resolution** — correctly identified Bergvik AS as an existing customer via org number
5. **Description preservation** — "Systemutvikling" preserved exactly as prompted
6. **Duration** — completed in 154s, well within 300s budget

## What To Change Next Time

1. **Match the correct standard.** When the prompt says "send" (opprett og **send**), always check `create-and-send-customer-invoice.md` first, not the order-based payment standard.
2. **Description-only = no product needed.** When the prompt gives only a service description (like "Systemutvikling") without parenthetical product numbers, do NOT search for or create products. Use `POST /invoice` with `orders[].orderLines[].description` directly. Sandbox-verified: readback shows `product: null` and correct description.
3. **"kunden" = existing customer.** Norwegian definite article "kunden" means "the customer" — resolve with `GET /customer`, don't create.
4. **Use `POST /invoice`, not `POST /order` + `PUT /order/:invoice`.** For this task shape, `POST /invoice` creates the order, order lines, and invoice in a single call. The order-based flow splits this into 2 calls and requires a product ID.
5. **Target 6 calls** for this exact task shape with bank repair, or **3 calls** if the company bank account is already configured. The leaderboard best of 1.4 suggests some runs avoided the bank-account error entirely (3 calls, 0 errors), achieving a higher efficiency bonus.
