# Score-Aware Reflection: prod-2026-03-21-223529301Z-d4ddc21a

## 1. Task Attribution

- **Inference status**: ambiguous (candidate_count=2)
- **Most likely task**: T15 (set-project-fixed-price-and-invoice-partial-payment)
- **Evidence**: Task completion at 22:37:12Z; T15 last_attempt updated to 22:37:14Z (2-second delta). Prompt shape ("Set a fixed price... Invoice the customer for 33% of the fixed price as a milestone payment") exactly matches the T15 task family.
- **Other diff entries**: T06 (last_attempt 22:35:44, 88s before) and T11 (last_attempt 22:36:29, 43s before) — likely concurrent runs from other agents, not this run.
- **T15 tier**: T2 (max score 4)

## 2. Correctness Verdict

**Likely perfect correctness.** All scored side effects were correctly applied:
- `isFixedPrice: true` and `fixedprice: 170500` set via `PUT /project`
- Customer Brightstone Ltd (org 850116091) already linked, verified via expanded project read
- PM Charlotte Walker (charlotte.walker@example.org) already linked, verified via expanded project read
- Invoice created with `amountExcludingVatCurrency: 56265` (170500 × 0.33, exact)
- `amountCurrencyOutstanding: 70331.25` (56265 × 1.25, correct with 25% VAT)
- Invoice not sent (`sendToCustomer=false`)

The best_score for T15 stayed at 3.3333/4 — no improvement. Since correctness was likely 1.0, the score gap is purely an efficiency issue.

## 3. Efficiency Verdict

**Not minimal.** The run used 7 API calls with 0 errors on the update-needed + missing-bank branch:

| # | Call | Purpose |
|---|------|---------|
| 1 | `GET /project?name=...&fields=*,customer(*),projectManager(*)` | Resolve project, customer, PM |
| 2 | `PUT /project/{id}` | Set fixedprice + isFixedPrice |
| 3 | `GET /ledger/vatType` | Resolve outgoing VAT type |
| 4 | `POST /order` | Create order with milestone line |
| 5 | `GET /ledger/account?isBankAccount=true` | Proactive bank check |
| 6 | `PUT /ledger/account/{id}` | Fix missing bank account number |
| 7 | `PUT /order/{id}/:invoice` | Invoice the order |

**Wasted call**: `POST /order` + `PUT /order/:invoice` = 2 calls for invoicing. The prior reflection proved that `POST /invoice?sendToCustomer=false` with embedded `orders[]` replaces both in 1 call, saving 1 call.

**Additional optimization**: On the update-needed branch, `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account` can run in parallel (3 calls in 1 wall-clock step instead of 3 sequential steps), though the total call count stays the same.

**Optimal path for this exact branch (update-needed + missing bank): 6 calls**
1. `GET /project` (1)
2. `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account` (parallel, 3)
3. `PUT /ledger/account` (1, fix bank)
4. `POST /invoice?sendToCustomer=false` (1)

**Optimal path for update-needed + configured bank: 5 calls**
**Optimal path for skip-PUT branch: 3 calls**

## 4. Likely Root Cause

The run followed the trusted standard as written at the time, which specified `POST /order` + `PUT /order/:invoice` as the invoicing path. This 2-call pattern was inherited from early production confirmations and was never questioned because it worked correctly.

The `POST /invoice?sendToCustomer=false` endpoint with embedded `orders[]` was already proven in other trusted standards (register-project-hours, register-project-lifecycle) but had not been applied to this task family. The prior reflection discovered and sandbox-verified this optimization, reducing all branches by 1 call.

The score gap between this run and the T15 best (3.3333/4) is consistent with 1 extra call penalty. The best_score of 3.3333 was likely achieved by a prior run on the update-needed + configured-bank branch with 6 calls (the old path without POST /invoice), or possibly a skip-PUT branch with 4 calls.

## 5. What Went Right

- **Correct trusted standard match**: Identified and followed the exact-match standard without wasting time on openapi.json exploration.
- **Zero errors**: No 4xx responses, no retries.
- **Proactive bank check**: The bank account was indeed missing (consistent with 80% production rate on update-needed branch). The proactive hedge avoided the 422 + retry penalty.
- **Correct skip logic**: PM already matched from the expanded project read — no wasted `GET /employee` call.
- **Correct milestone arithmetic**: 170500 × 0.33 = 56265, sent directly without rounding.
- **Fast execution**: Task completed in ~2 minutes of wall-clock time.

## 6. What To Change Next Time

1. **Use `POST /invoice?sendToCustomer=false` instead of `POST /order` + `PUT /order/:invoice`**: This saves 1 call on every branch. Sandbox-verified on 2026-03-21 with both skip-PUT (3 calls) and update-needed (5-6 calls) branches.

2. **Parallelize on update-needed branch**: Run `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account` in parallel. They have no interdependencies — all use data from the initial `GET /project` read.

3. **New call targets by branch**:
   - Skip-PUT: **3 calls** (GET project → GET vatType → POST invoice)
   - Update + configured bank: **5 calls** (GET project → parallel[PUT project + GET vatType + GET account] → POST invoice)
   - Update + missing bank: **6 calls** (GET project → parallel[PUT project + GET vatType + GET account] → PUT account → POST invoice)

4. **The trusted standard has been updated** (during prior reflection) to reflect the POST /invoice optimization. Next agents should read the updated standard and follow it directly.
