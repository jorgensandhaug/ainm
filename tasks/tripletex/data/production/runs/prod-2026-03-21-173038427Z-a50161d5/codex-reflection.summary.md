# Codex Reflection Summary

## Task

Create an order for customer Estrela Lda (org. nr 842487803) with products Design web (1851) at 24050 NOK and Consultoria de dados (5065) at 13450 NOK. Convert the order to an invoice and register full payment.

## Reflection

The run completed correctly: order created, invoice #2 issued (37500 NOK ex-VAT, 46875 NOK incl. VAT), payment settled to outstanding=0. However, it used 6 API calls instead of the optimal 5.

**What went well:**
- Correctly matched the trusted standard `create-order-invoice-and-register-payment`
- Combined invoice + payment in a single `PUT /order/:invoice` call with `paidAmount=0.01`
- No 4xx errors
- Final state correct (outstanding=0)

**What went poorly:**
- Product resolution used 2 calls instead of 1
- `GET /product?productNumber=1851&productNumber=5065` found only 5065, missed 1851
- Triggered the `count=1000` fallback, adding 1 unnecessary call

## Call Efficiency

**Not minimal.** 6 calls used, 5 was achievable.

| # | Call | Verdict |
|---|------|---------|
| 1 | `GET /customer?organizationNumber=842487803&fields=*` | Necessary |
| 2 | `GET /product?productNumber=1851&productNumber=5065&fields=*` | **Wasted** — only resolved 1 of 2 products |
| 3 | `GET /product?count=1000&fields=*` | Necessary (fallback for missed product) |
| 4 | `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` | Necessary |
| 5 | `POST /order` | Necessary |
| 6 | `PUT /order/402022162/:invoice?...&paymentTypeId=28112639&paidAmount=0.01&paymentTypeIdRestAmount=28112639` | Necessary |

**Optimal 5-call path:**
1. `GET /customer?organizationNumber=842487803&fields=*`
2. `GET /product?count=1000&fields=*` → filter locally by `number` field
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
4. `POST /order` with embedded orderLines
5. `PUT /order/{id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false&paymentTypeId=<id>&paidAmount=0.01&paymentTypeIdRestAmount=<same-id>`

## Root Causes

1. **`productNumber` query param is unreliable.** In this production account, `productNumber=1851` did not match the product whose ref was stored under the `number` field ("1851"), while `productNumber=5065` did match. Both products had their ref under `number` with no `productNumber` field set. The `productNumber` query param's matching against the `number` field is inconsistent across accounts.

2. **The 2-tier product resolution approach is inherently risky.** The old approach (`productNumber` first → `count=1000` fallback) works in best case (5 calls) but degrades to 6 calls when `productNumber` partially resolves. This has now happened in 2 out of the last 3 production runs on this task shape (Luna SL on 2026-03-21, Estrela Lda on 2026-03-21).

## Sandbox Verification

Tested in persistent sandbox (`kkpqfuj-amager.tripletex.dev`):

1. **Product query semantics:**
   - `productNumber` multi-value: OR semantics (returns all matching)
   - `number` multi-value: NOT OR (returns only first match)
   - `number` + `productNumber` cross-param: AND semantics (intersection)
   - All sandbox products have `productNumber: undefined` — refs stored only under `number`

2. **Full 5-call path with `count=1000` as default:**
   - `GET /customer?organizationNumber=864062245&fields=*` → Montanha Lda
   - `GET /product?count=1000&fields=*` → resolved 7579 + 2292 by `number` field
   - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` → Betalt til bank (32813748)
   - `POST /order` → order 402022733
   - `PUT /order/402022733/:invoice?invoiceDate=2026-03-21&sendToCustomer=false&paymentTypeId=32813748&paidAmount=0.01&paymentTypeIdRestAmount=32813748` → invoice #280, outstanding=0
   - **5 calls total, payment fully settled**

## Playbook Changes

**Updated existing files** (no new files created):

- `./trusted-standards/create-order-invoice-and-register-payment.md`:
  - Standard Flow: replaced 2-tier `productNumber` → `count=1000` fallback with single `count=1000` as default
  - Payload Rules: updated product resolution guidance to match by `number` field
  - Removed obsolete recovery branch for partial product-number resolution
  - Added "Why count=1000 Is the Default" section with production evidence
  - Updated canonical call count from "usually 5" to "always 5"

- `./task-playbooks/create-order-invoice-and-register-payment.md`:
  - Minimal Flow step 3: replaced 2-tier product resolution with `count=1000` default
  - Exact-Match Fast Path: updated to always-5-call path
  - Product Resolution Rules: replaced old 2-tier rules with `count=1000` default
  - Added production evidence from Estrela Lda run

## Commit

- **Hash:** `a2be0332`
- **Message:** `tripletex playbook: order-invoice-payment — switch product lookup to count=1000 default, eliminates 2-tier productNumber inconsistency, guaranteed 5-call path`

## Reusable Heuristics

1. **Use `count=1000` as the default product lookup for scored runs.** Fresh accounts have 2-5 products. The `productNumber` query param is unreliable when product refs are stored under `number` rather than `productNumber`. A single `count=1000` call always resolves all products.

2. **Never use `GET /product?ids=<ref>` as a fallback.** Prompt refs (e.g. 1851, 5065) are small integers, never Tripletex internal IDs (84M+ range). The `ids` fallback always returns empty.

3. **`number` multi-value uses non-OR semantics.** `GET /product?number=X&number=Y` returns only one result. Cannot use it as a replacement for `count=1000`.

4. **`productNumber` and `number` cross-param uses AND.** `GET /product?productNumber=X&number=Y` returns only products matching BOTH. Cannot use it for cross-field matching.

5. **The `productNumber` query param inconsistently matches `number` field.** In sandbox, `productNumber=7579` found a product whose ref is only under `number`. In production, `productNumber=1851` did NOT find a product whose ref is only under `number`. Do not rely on this behavior.
