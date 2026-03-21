# Score-Aware Reflection — prod-2026-03-21-171446078Z-7315b8b8

## 1. Task Attribution

- **tx_task_id**: 10
- **Tier**: T2 (tasks 9–18, max score 4)
- **Prompt**: Spanish — create order for Luna SL (org 966920963), products Desarrollo de sistemas (5271) at 6950 NOK + Asesoría de datos (3613) at 7000 NOK, convert to invoice, register full payment
- **Task shape**: create-order-invoice-and-register-payment (exact trusted-standard match)

## 2. Correctness Verdict

**Perfect.** correctness = 1.0, score_raw = 8/8, all 5/5 checks passed. The final Tripletex state — order, invoice, and full payment — was exactly correct.

## 3. Efficiency Verdict

**Suboptimal.** normalized_score = 3 out of max 4. The 1-point gap is entirely an efficiency penalty.

- **API calls made**: 7 (zero 4xx errors)
- **Optimal for this task shape**: 5 calls
- **Wasted calls**: 2 extra product-resolution fallbacks

The 7-call breakdown:

| # | Call | Status | Verdict |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=966920963&fields=*` | 200 | Required |
| 2 | `GET /product?productNumber=5271&productNumber=3613&fields=*` | 200 | Required — found 3613, missed 5271 |
| 3 | `GET /product?ids=5271&fields=*` | 200 | **Wasted** — 5271 is not a Tripletex internal ID (those are ~84M+), so this was guaranteed to return empty |
| 4 | `GET /product?count=1000&fields=*` | 200 | Required given call 3 failed — found 5271 by name |
| 5 | `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` | 200 | Required |
| 6 | `POST /order` | 201 | Required |
| 7 | `PUT /order/{id}/:invoice?...&paymentTypeId=...&paidAmount=0.01&paymentTypeIdRestAmount=...` | 200 | Required — combined invoice+payment, outstanding=0 |

**Achievable minimum**: 6 calls (skip the useless `ids` fallback). The ideal 5-call path requires the first `productNumber` query to resolve both products, which failed here because ref 5271 was the product's `number` field, not its `productNumber`.

Leaderboard context: best_score for task 10 was already 3 before this run and remained 3 after. No prior attempt has achieved 4/4 on this task. The product-number resolution miss may be inherent to how products are configured in this task's account, making 6 calls (not 5) the realistic floor.

## 4. Likely Root Cause

The efficiency loss came from one specific mistake: **the `ids` fallback is provably useless for prompt-provided numeric refs**.

Prompt refs like `(5271)` are product identifiers displayed to the user, not Tripletex internal IDs. Tripletex product IDs are large integers (84M+). The `ids` query param searches by internal ID, so passing a small prompt ref like 5271 will always return empty.

The trusted standard's 3-tier product fallback is:
1. `productNumber=ref1&productNumber=ref2` → may partially miss
2. `ids=ref1,ref2` → **always fails for prompt refs** (wrong field)
3. `count=1000` full list + name filter → works but costs a call

Tier 2 should be eliminated entirely. After tier 1 partially misses, the agent should skip directly to tier 3.

Additionally, the root cause of the partial miss on tier 1 is that Tripletex products have two number-like fields (`productNumber` and `number`), and the `productNumber` query param does not always search the deprecated `number` field. In this account, product "Desarrollo de sistemas" had its ref in `number` but not in `productNumber`, so `productNumber=5271` didn't match.

Sandbox investigation (from prior reflection) confirmed:
- When both `productNumber` and `number` params are provided together, Tripletex uses AND semantics — combining them in a single call does NOT produce a union of results
- The `number` deprecated param with comma-separated values does work for the `number` field specifically
- There is no single-call strategy that reliably resolves products whose refs may be in either `productNumber` or `number`

## 5. What Went Right

1. **Perfect correctness** — all 5 checks passed, order/invoice/payment state exactly correct
2. **Combined invoice+payment** — used the proven `paidAmount=0.01` + `paymentTypeIdRestAmount` single-call pattern, saving 1 call vs split tail
3. **No 4xx errors** — zero avoidable errors across all 7 calls
4. **Correct trusted-standard selection** — identified and followed the exact match immediately
5. **Fast execution** — completed in ~122 seconds with no wasted time on documentation reading
6. **Proper product name filtering** — when fallbacks were needed, the name-filter logic worked correctly

## 6. What To Change Next Time

1. **Eliminate the `ids` fallback for prompt refs.** After `productNumber` partially misses, skip directly to `count=1000` name-filter. This saves 1 wasted call every time `productNumber` doesn't fully resolve. The `ids` param only works for Tripletex internal IDs (84M+), never for prompt-provided product refs.

2. **Consider `number=<missing-refs>` as tier 2 before full list.** The deprecated `number` param (comma-separated integers) searches the `number` field directly. If the missing ref IS the `number` field, this tier-2 call would succeed and avoid the more expensive `count=1000` full-list call. However, sandbox showed AND semantics when `productNumber` and `number` are combined, so they must be separate calls.

3. **Updated fallback chain should be:**
   - Tier 1: `GET /product?productNumber=ref1&productNumber=ref2&fields=*`
   - Tier 2 (if missing): `GET /product?number=<missing-refs-comma-separated>&fields=*`
   - Tier 3 (if still missing): `GET /product?count=1000&fields=*` + name filter

4. **The trusted standard should document** that `ids` is never a valid fallback for prompt-provided product refs and should be removed from the standard fallback chain.

5. **Realistic call target for this task shape**: 5 calls when `productNumber` resolves all products; 6 calls when it partially misses (tier 1 + tier 2 or tier 3); the current 7-call path with the useless `ids` step should never happen again.
