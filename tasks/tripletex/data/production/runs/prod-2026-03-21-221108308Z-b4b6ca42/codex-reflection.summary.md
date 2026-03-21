# Reflection: prod-2026-03-21-221108308Z-b4b6ca42

## 1. Task

Create an invoice for the customer Oakwood Ltd (org no. 909722500) with three product lines: Analysis Report (9796) at 27700 NOK with 25% VAT, Maintenance (2145) at 12700 NOK with 15% VAT (food), and System Development (5995) at 7050 NOK with 0% VAT (exempt).

Task shape: create-and-send-customer-invoice with product numbers and mixed VAT rates.

## 2. Reflection

**What went well:**
- Correctly matched the `create-and-send-customer-invoice` trusted standard (not the order-based flow)
- Used the definite-article heuristic ("the customer Oakwood Ltd") to resolve the existing customer via `GET /customer` instead of `POST /customer`
- Correctly parallelized `GET /customer` and `GET /ledger/vatType`
- Correctly selected different VAT types for each line (25% → id=3, 15% → id=31, 0% exempt → id=5)
- Retained `customer.id` and `vatType` IDs across the bank-account repair branch (no wasted re-reads)
- Bank-account repair completed optimally: `GET /ledger/account` → `PUT /ledger/account/{id}` → retry
- Amounts were correct: excl VAT = 47,450, incl VAT = 56,280

**What went wrong:**
- Used description-only order lines without product references. The task specified product numbers (9796, 2145, 5995) in parentheses next to each description. These needed to be created as products and referenced on the order lines.
- The scoring matched 3 candidate tasks (ambiguous). The most likely match (task 09) scored 5/8 with checks 3, 4, 5 failed — almost certainly the 3 product-related checks.
- The trusted standard at the time did not document the product-line variant at all, so the agent had no guidance to create products.

**Why it happened:**
- The trusted standard's note about "description-only lines" was interpreted to cover all direct-line invoices, but it only applies when the prompt gives descriptions without product numbers.
- The prompt pattern `"Analysis Report (9796)"` signals a product number that should be linked to the order line, but the standard had no detection heuristic for this.

## 3. Call Efficiency

**Production run: 6 calls (NOT minimal for this task shape)**

| # | Call | Purpose | Wasted? |
|---|------|---------|---------|
| 1 | `GET /customer?organizationNumber=909722500&fields=*` | Resolve existing customer | No |
| 2 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | Resolve VAT types | No |
| 3 | `POST /invoice?sendToCustomer=true` | First attempt (422 bank) | No (unavoidable) |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | Find bank account | No |
| 5 | `PUT /ledger/account/377539235` | Repair bank account | No |
| 6 | `POST /invoice?sendToCustomer=true` | Retry (201 success) | No |

**Missing call:** `POST /product/list` to batch-create products 9796, 2145, 5995 was not made. This should have been parallelized with calls 1 and 2.

**Optimal path for this exact task shape (with bank repair): 7 calls**

| # | Call | Parallel group |
|---|------|----------------|
| 1 | `GET /customer?organizationNumber=909722500&fields=*` | A (parallel) |
| 2 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | A (parallel) |
| 3 | `POST /product/list` with 3 products | A (parallel) |
| 4 | `POST /invoice?sendToCustomer=true` | B (sequential) |
| 5 | `GET /ledger/account?isBankAccount=true&fields=*` | C (repair) |
| 6 | `PUT /ledger/account/{id}` | D (repair) |
| 7 | `POST /invoice?sendToCustomer=true` retry | E (repair) |

**Without bank repair: 4 calls** (3 parallel + 1 invoice).

The run used 6 calls but missed the `POST /product/list` call, so it was 1 call short of the correct 7-call path. The 6 calls were efficiently executed but the correctness gap (missing products) likely cost 3 check failures.

## 4. Root Causes

1. **Missing product-line variant in trusted standard**: The `create-and-send-customer-invoice` standard documented description-only lines extensively but had no guidance for when the prompt gives product numbers. The note "do not spend calls on `GET /product` or `POST /product`" was correct for description-only prompts but misleading for product-line prompts.

2. **Ambiguous prompt pattern not documented**: The pattern `"Analysis Report (9796)"` — where a number in parentheses follows a description — is a product-number indicator. The trusted standard had no detection heuristic for this.

3. **Silent product linkage failure not known**: Before this investigation, it was not known that `product: { number: 9796 }` on order lines silently fails (product appears as `null` on readback). This trap makes description-only lines look correct during write but fail on scoring.

## 5. Sandbox Verification

All verified in persistent sandbox on 2026-03-21:

1. **`POST /product/list`** batch-creates multiple products in one call. `[{ "name": "Analysis Report", "number": 9796 }, { "name": "Maintenance", "number": 2145 }, { "name": "System Development", "number": 5995 }]` → 201 with all 3 IDs returned.

2. **Product reference by ID**: `POST /invoice` with `orders[].orderLines[].product: { "id": <product-id> }` correctly links the product. Readback shows `product.number = "9796"`, `product.name = "Analysis Report"`.

3. **Product reference by number DOES NOT WORK**: `product: { "number": 9796 }` on order line → invoice created (201) but readback shows `product: null`. Tripletex silently ignores the number-only reference.

4. **Inline product creation DOES NOT WORK**: `product: { "name": "X", "number": 9796 }` on order line → invoice created (201) but readback shows `product: null`. Products must be pre-created separately.

5. **Full optimal flow verified**: 3 parallel calls (`POST /product/list` + `GET /customer` + `GET /ledger/vatType`) → 1 `POST /invoice` = 4 calls total. Readback confirmed all 3 order lines have correct product linkage, descriptions, prices, and VAT types.

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Change |
|------|--------|
| `./trusted-standards/create-and-send-customer-invoice.md` | Added product-line variant: detection heuristic for product numbers in parentheses, `POST /product/list` batch-creation step, product reference rules, inline/number-only pitfalls, optimal call counts (4 happy / 7 repair), production confirmation for Oakwood Ltd |
| `./task-playbooks/create-and-send-customer-invoice.md` | Added "Key Finding: Product-Line Invoices Require Batch Product Creation" section with the correct flow, sandbox-verified pitfalls, and "Key Finding: Multi-VAT-Rate Invoices" section documenting VAT code selection for 25%/15%/12%/0% rates |
| `./trusted-standards/common-endpoints.md` | Added `POST /product/list` batch-create endpoint documentation |
| `./AGENTS.md` | Updated product endpoint listing to include `/product/list` with batch-create note |

## 7. Commit

- **Hash**: `d8b0b69d`
- **Message**: `tripletex playbook: create-and-send-customer-invoice — add product-line variant with POST /product/list batch creation (b4b6ca42, Oakwood Ltd / 909722500, 3 product lines with mixed VAT 25%/15%/0%, 6 calls 0 errors but scored 5/8 with 3 product-related checks failed); sandbox-verified that description-only lines produce product:null on readback while batch-created product references link correctly; add POST /product/list to common-endpoints and AGENTS.md; correct optimal call count: 4 happy (3 parallel + 1 invoice) or 7 with bank repair; document inline product and number-only reference pitfalls`

## 8. Reusable Heuristics

1. **Product number detection**: When the prompt gives `"<Description> (<number>)"` (e.g. "Analysis Report (9796)"), the number in parentheses is a product number that must be created and linked on the order line. Description-only lines will fail product-related scorer checks.

2. **`POST /product/list` is the optimal batch creation**: Creates N products in 1 API call. Use this instead of N individual `POST /product` calls. Parallelize with customer resolution and VAT lookup.

3. **Product references require `{ "id": <id> }`, not `{ "number": <number> }`**: Number-only references are silently ignored by Tripletex. Always use the `id` returned from the product creation response.

4. **Inline product creation via invoice does NOT work**: Setting `product: { "name": "X", "number": 9796 }` on an order line inside `POST /invoice` creates the invoice but the product is `null` on readback. Products must be created with a separate `POST /product` or `POST /product/list` before the invoice.

5. **Multi-VAT-rate selection from single lookup**: One `GET /ledger/vatType?typeOfVat=OUTGOING` call returns all outgoing VAT types. Select the correct one for each line by `percentage` and `number` (code). Production codes: 3 (25%), 31 (15%), 32 (12%), 5 (0% exempt), 6 (0% outside), 52 (0% export).

6. **Description-only vs product-line discrimination**: If the prompt gives product numbers → batch-create products (4/7 calls). If the prompt gives only descriptions without numbers → use description-only lines (3/6 calls). The distinction saves 1 call when products aren't needed.

7. **Bank repair adds 3 calls**: The bank-account repair branch (GET account + PUT repair + retry invoice) is unavoidable on fresh accounts ~30% of the time. The preemptive approach (adding GET account to initial parallel batch) adds 1 wasted call ~70% of the time, so keep the reactive approach.
