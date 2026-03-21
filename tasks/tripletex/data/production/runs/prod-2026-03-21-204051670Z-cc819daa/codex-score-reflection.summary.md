# Score-Aware Reflection

## Task Attribution

- **Task ID**: 10 (T2 tier, max score = 4)
- **Prompt**: Nynorsk — create order for Strandvik AS (911845016), products Skylagring (7865) at 38500 kr + Datarådgjeving (3949) at 18500 kr, convert to invoice, register full payment
- **Matched trusted standard**: `create-order-invoice-and-register-payment.md`

## Correctness Verdict

**Perfect correctness.** score_raw = 8/8, correctness = 1.0, all 5/5 checks passed. The final Tripletex state was exactly correct: order created, invoice created, full payment registered (outstanding = 0).

## Efficiency Verdict

**Normalized score: 3 out of max 4.** This matches the leaderboard best for task 10 (best_score = 3 both before and after this run). No run has yet achieved 4/4 on this task.

The run used **6 API calls** instead of the canonical **5**. The 1 wasted call (a duplicate `GET /invoice/paymentType` debug fetch) cost efficiency points. However, since the leaderboard best is also 3, this suggests that either (a) prior runs also had inefficiencies, or (b) the scoring curve for this task is tight enough that even 5 calls yields 3/4 rather than 4/4. The canonical 5-call path is the floor for this task shape since `paymentTypeId` must be resolved dynamically and cannot be omitted.

## Likely Root Cause

The score loss from 4 to 3 is an efficiency penalty from the wasted API call:

1. **Script 1** made 3 calls (customer, products, paymentTypes) — all 200. Then JS logic filtered by nonexistent `pt.isIncoming === true`, found nothing, and aborted.
2. **Debug script** re-fetched `GET /invoice/paymentType` — **wasted duplicate** (call #4).
3. **Script 2** hardcoded IDs from script 1 and made 2 calls (POST order, PUT invoice-with-payment) — both succeeded.

Total: 6 calls. Canonical: 5. The extra call was entirely avoidable.

**Root cause**: The agent hallucinated an `isIncoming` field on payment type objects. This field does not exist — the actual keys are `id`, `version`, `url`, `description`, `displayName`, `debitAccount`, `creditAccount`, `vatType`, `sequence`, `customer`, `supplier`, `currencyId`, `currencyCode`. The trusted standard did not warn about this prior to this run.

## What Went Right

1. Correctly identified exact trusted-standard match and read it before writing the script
2. Comma-separated `number=7865,3949` product lookup resolved both products in one call (no fallback needed)
3. `paidAmount=0.01` seed correctly settled the full invoice — no separate payment call needed
4. Bank account was already configured (no repair branch needed)
5. Final state perfect: 5/5 checks passed, correctness = 1.0
6. Matched the current leaderboard best (3) for task 10
7. Second script correctly reused already-fetched IDs instead of re-calling customer/product APIs

## What To Change Next Time

1. **Never filter payment types by `isIncoming`.** This field does not exist. Just use `pts[0]` — any payment type works for the combined invoice-and-payment write. This pitfall is now documented in the trusted standard and playbook.

2. **Write the complete script in one attempt.** The 3 reads (customer, products, paymentTypes) + 2 writes (order, invoice-with-payment) should all be in a single script with correct payment type selection logic. The canonical path is:
   - `GET /customer?organizationNumber=...&fields=*`
   - `GET /product?number=<ref1>,<ref2>&fields=*`
   - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
   - `POST /order` with embedded orderLines
   - `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false&paymentTypeId=<pts[0].id>&paidAmount=0.01&paymentTypeIdRestAmount=<pts[0].id>`

3. **To reach 4/4**, the agent must execute the canonical 5-call path with 0 wasted calls and 0 errors. Whether 5 calls is sufficient for max score on this task is unproven — it's possible the scoring curve caps at 3/4 for 5 calls, meaning a lower-call path would be needed. However, sandbox verification confirmed `paymentTypeId` cannot be omitted (422), so 5 calls appears to be the hard floor for this task shape.

4. **If a script fails due to a JS logic error (not an API error), inspect the already-fetched data** from the console output rather than making a new debug API call. The payment type data was already printed in the first script's response — a careful read would have revealed the missing `isIncoming` field without wasting a call.
