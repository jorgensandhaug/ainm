# Score-Aware Reflection

## 1. Task Attribution

- **Attributed task:** `09` (T2, max score 4)
- **Attribution method:** submission `completed_at` (`2026-03-21T16:11:19.864742+00:00`) matches task 09 `last_attempt_at` in after-leaderboard; task 09 `total_attempts` incremented 11→12
- `inference_status` was `ambiguous` (3 entries changed: 09, 21, 24), but timestamp match is decisive for task 09
- Task 09 `best_score` stayed at 2.5333 — our 2.4444 did not improve it

## 2. Correctness Verdict

**Perfect.** `correctness = 1.0`, `score_raw = 8/8`, `6/6 checks passed`.

The final Tripletex state was exactly correct: invoice for Cascade SARL (875483811) with 3 product lines at the correct prices and VAT rates (25%, 15% food, 0% exempt). The amounts matched: 41,100 NOK excl VAT, 45,900 NOK incl VAT.

## 3. Efficiency Verdict

**Not efficient.** `normalized_score = 2.4444` out of max 4 (61%).

The run made **8 API calls** with **1 avoidable 422 error** across two script executions. The optimal path was 3 calls with 0 errors. Five calls and the 422 were entirely wasted.

| Call | Status | Verdict |
|---|---|---|
| Run 1: GET /customer | 200 | wasted (duplicated in run 2) |
| Run 1: GET /product?productNumber=... | 200 | wasted (proxy dropped repeated params, returned incomplete) |
| Run 1: GET /product?count=1000 | 200 | wasted (duplicated in run 2) |
| Run 1: POST /invoice | 422 | wasted (missing required order-level fields) |
| Run 2: GET /customer | 200 | **needed** |
| Run 2: GET /product?productNumber=... | 200 | wasted (same proxy issue, fell through to catalog again) |
| Run 2: GET /product?count=1000 | 200 | **needed** |
| Run 2: POST /invoice | 201 | **needed** |

**Optimal path (3 calls, 0 errors):**
1. `GET /customer?organizationNumber=875483811&fields=*`
2. `GET /product?count=1000&fields=*`
3. `POST /invoice?sendToCustomer=false` (with `orderDate`, `deliveryDate`, `customer` on order)

Leaderboard best for task 09 is 2.5333 — still below max 4 — suggesting even the prior best run had some efficiency overhead (likely the bank-account repair branch or a partial fallback). Our run was below even that.

## 4. Likely Root Cause

Two independent bugs compounded:

**Bug 1: Missing required order-level fields → 422 → full script restart.**
The initial invoice payload omitted `orderDate`, `deliveryDate`, and `customer` on the `orders[]` entry. These are required by the Tripletex API and well-documented in the playbook example payload (lines 199-201) and Invoice Payload Notes (line 186: "`orders[].deliveryDate` is required"). The trusted standard listed fields to include but did not mark them as required with 422-risk. The agent read the trusted standard but skipped the playbook, missing this critical detail. The 422 caused a code fix and full re-run, doubling all prior reads.

**Bug 2: `productNumber` repeated query params don't work on the production proxy.**
`GET /product?productNumber=5679&productNumber=9191&productNumber=5577&fields=*` returned status 200 but 0 matching products. The same query works on the persistent sandbox (confirmed: `productNumber=2109&productNumber=1175&productNumber=9974` returns all 3 in sandbox). The production proxy (`tx-proxy-*.a.run.app`) silently drops repeated query params, so only the last value is searched. This wasted 1 call per script run (2 total), each falling through to the catalog fallback.

**Compounding:** Bug 1 forced the script to re-run from scratch. Bug 2 was hit twice (once per run). Together: 5 wasted calls + 1 avoidable 422 out of 8 total.

## 5. What Went Right

- **Correctness was perfect** — all 6 checks passed, invoice had exact customer, products, prices, and VAT types
- **VAT handling was correct** — reused `product.vatType.id` from the catalog read without needing a separate `/ledger/vatType` call
- **In-script fallback worked** — when productNumber query returned incomplete, the catalog fallback in the same script avoided losing the customer resolution (at least within each script run)
- **No bank-account repair needed** — the fresh production account already had a valid bank account configured
- **Fast execution** — completed in 271s out of 300s budget despite the restart

## 6. What To Change Next Time

1. **Always use `GET /product?count=1000&fields=*` on production** — never use repeated `productNumber` query params. The production proxy silently drops them. This was already documented as a known issue in prior reflections but the trusted standard still listed `productNumber` as the preferred path. The trusted standard has now been updated to prefer the catalog read.

2. **Always include `orderDate`, `deliveryDate`, and `customer` on the `orders[]` entry** — these are required fields that cause a 422 if missing. The trusted standard's Payload Rules section has now been updated to mark these explicitly as required with 422 risk.

3. **Never restart the full script on a payload error** — if the POST fails with a 422 due to a payload issue, fix the payload in-memory and retry within the same script. Do not re-run the script from scratch, as this duplicates all prior GET calls. The current script structure already has in-script recovery for bank-account errors; the same pattern should apply to payload validation errors.

4. **Read the playbook example payload before writing the invoice POST** — the playbook contained the exact correct payload shape including all required order fields. The agent read only the trusted standard and skipped the playbook. For this well-documented task shape, 30 seconds spent reading the playbook example would have saved 5 wasted API calls.

5. **Target for next run: 3 calls, 0 errors, expected score near max 4:**
   - `GET /customer?organizationNumber=...&fields=*`
   - `GET /product?count=1000&fields=*`
   - `POST /invoice?sendToCustomer=false` with complete order fields
