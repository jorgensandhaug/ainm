# Score-Aware Reflection: prod-2026-03-21-224024149Z-19c414df

## 1. Task Attribution

- **Run ID**: prod-2026-03-21-224024149Z-19c414df
- **Inference status**: ambiguous (candidate_count=3, diff_entry_count=9)
- **Task**: Create invoice for Brückentor GmbH (804379010) with 3 product lines: Schulung (2626) 17300/25%, Beratungsstunden (7746) 12850/15% food, Cloud-Speicher (5675) 7050/0% exempt
- **Prompt language**: German
- **Most likely task ID**: T01 (T1 tier, max 2.0) — the leaderboard entry T01 last_attempt_after (22:44:13) exactly matches submission 49d2cb9d completed_at (22:44:13), and the 7-check pattern matches a 3-product multi-VAT invoice
- **Most likely submission**: 49d2cb9d — score_raw 8/8, 7/7 checks passed, normalized_score **1.4** out of max 2.0
- **T01 best_score**: 2.0 (already at max before this run — no improvement)

## 2. Correctness Verdict

**PERFECT** — all 7/7 checks passed, 8/8 raw score. The final Tripletex state was fully correct:
- Customer Brückentor GmbH correctly resolved (existing customer, "den Kunden" definite article)
- All 3 products linked to order lines with correct IDs (Schulung/2626, Beratungsstunden/7746, Cloud-Speicher/5675)
- Correct prices: 17300, 12850, 7050 via `unitPriceExcludingVatCurrency`
- Correct VAT types: 25% (code 3), 15% (code 31), 0% exempt (code 5) — dynamically resolved
- Invoice totals correct: exVat=37200, total=43452.5 (17300×1.25 + 12850×1.15 + 7050×1.0)
- Invoice sent via default `sendToCustomer=true`

## 3. Efficiency Verdict

**POOR** — normalized 1.4/2.0 = 70% efficiency. Lost 30% to wasted API calls and avoidable errors.

| Metric | Actual | Optimal | Delta |
|---|---|---|---|
| Total API calls | 11 | 7 | +4 wasted |
| Avoidable 422 errors | 1 | 0 | +1 |
| Script restarts | 3 | 0 | +3 |

### Call-by-call breakdown

| # | Call | Status | Verdict |
|---|---|---|---|
| 1 | GET /customer?organizationNumber=804379010&fields=* | 200 | **Essential** — resolved existing customer |
| 2 | POST /product/list (3 products) | 422 | **WASTED** — products already existed; "Produktnummeret 2626 er i bruk" |
| 3 | GET /ledger/vatType?typeOfVat=OUTGOING&... | 200 | **Essential** — but result discarded due to script crash |
| 4 | GET /product?fields=id,number,name&count=1000 | 200 | **WASTED** — result discarded due to string/number comparison bug |
| 5 | GET /ledger/vatType (redundant 2nd fetch) | 200 | **WASTED** — same data already fetched in call 3 |
| 6 | GET /product (debug call) | 200 | **WASTED** — debugging the comparison bug from call 4 |
| 7 | GET /ledger/vatType (3rd fetch) | 200 | Needed only because calls 3 and 5 results were lost to script crashes |
| 8 | POST /invoice (bank account missing) | 422 | Essential — bank repair branch trigger |
| 9 | GET /ledger/account?isBankAccount=true&fields=* | 200 | Essential — bank repair |
| 10 | PUT /ledger/account/{id} | 200 | Essential — bank repair |
| 11 | POST /invoice (retry) | 201 | Essential — final successful invoice |

### Optimal 7-call path (with bank repair)

1. GET /customer (parallel) → 200
2. GET /ledger/vatType (parallel) → 200
3. GET /product?fields=id,number&count=1000 (parallel) → 200, find all 3 by String(number)
4. POST /invoice → 422 (bank account missing)
5. GET /ledger/account → 200
6. PUT /ledger/account/{id} → 200
7. POST /invoice → 201

Without bank repair: 4 calls (3 parallel + 1 invoice).

## 4. Likely Root Cause

Two independent bugs caused 4 wasted calls:

### Bug 1: POST /product/list on existing products (1 wasted call, 1 avoidable 422)
The trusted standard says "batch-create all products in one call: POST /product/list" but doesn't account for the case where products already exist in the account. This run used `POST /product/list` (following the standard) and got 422 "Produktnummeret 2626 er i bruk" because the existing-customer account already had all 3 products pre-loaded.

**Root cause**: The trusted standard assumed fresh-account = products don't exist. But when the prompt uses the definite article for the customer ("den Kunden"), the account is pre-populated and products may already exist. The standard should use `GET /product` instead of `POST /product/list` when resolving an existing customer.

### Bug 2: String/number type mismatch (3 wasted calls)
Tripletex returns `product.number` and `vatType.number` as **strings** (e.g. `"2626"` not `2626`). The script used strict equality (`===`) with numeric values:
- `needed.includes(p.number)` where `needed = [2626, 7746, 5675]` — `"2626" !== 2626`
- `v.number === 5` — `"5" !== 5`

This caused the product lookup result (call 4) and vatType lookup to silently find zero matches, crashing the script and forcing restarts that re-fetched the same data.

**Root cause**: No existing pitfall documentation warned about string-typed number fields. The trusted standard should document that all `number` fields from product and vatType endpoints return strings, and agents must use `String()` or `Number()` for comparisons.

## 5. What Went Right

1. **Correct task-standard matching**: Correctly identified "create-and-send-customer-invoice" standard for German "Erstellen Sie eine Rechnung"
2. **Correct definite-article handling**: "den Kunden" → existing customer → GET /customer (not POST)
3. **Correct multi-VAT resolution**: Dynamically looked up 25% (code 3), 15% (code 31), 0% exempt (code 5) from filtered outgoing VAT response
4. **Correct product linking**: Products were linked by `product: { "id": <id> }` on each order line (not description-only)
5. **Correct bank repair**: Retained customer.id and vatType IDs across the repair branch — no re-reads of those
6. **Correct price field**: Used `unitPriceExcludingVatCurrency` (not the non-existent `unitCostPrice`)
7. **Perfect final state**: All 7 scorer checks passed

## 6. What To Change Next Time

### Immediate fixes (trusted standard + AGENTS.md)

1. **Product resolution heuristic**: When the prompt uses a definite article for the customer (existing customer), replace `POST /product/list` with `GET /product?fields=id,number&count=1000` in the parallel batch. Only fall back to `POST /product/list` if some products are missing. This avoids the 422 error and potential extra GET call.

2. **String comparison pitfall**: Add a prominent warning that `product.number` and `vatType.number` are **always strings** in Tripletex API responses. All comparisons must use `String(value)` or `Number(value)` — never strict `===` with numeric literals.

3. **Script robustness**: Write all data extraction with string-safe comparisons from the first script. Never assume numeric types from Tripletex JSON responses for `number`-named fields.

### Updated optimal call counts for product-line invoices

| Scenario | Call count |
|---|---|
| New customer, products don't exist, no bank repair | 4 (POST customer + POST product/list + GET vatType ∥ + POST invoice) |
| New customer, products don't exist, with bank repair | 7 |
| Existing customer, products exist, no bank repair | 4 (GET customer + GET product + GET vatType ∥ + POST invoice) |
| Existing customer, products exist, with bank repair | 7 |
| Existing customer, products don't exist, no bank repair | 5 (GET customer + GET product + GET vatType ∥ + POST product/list + POST invoice) |
| Existing customer, products don't exist, with bank repair | 8 |

The definite-article → GET-product heuristic avoids the `POST /product/list` 422 in the common pre-populated account case, saving both 1 call and 1 avoidable error.
