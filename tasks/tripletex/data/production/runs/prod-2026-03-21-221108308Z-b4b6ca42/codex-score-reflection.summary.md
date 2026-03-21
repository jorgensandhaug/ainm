# Score-Aware Reflection: prod-2026-03-21-221108308Z-b4b6ca42

## 1. Task Attribution

- **Status**: ambiguous (candidate_count=3)
- **Candidate tasks**: 09, 16, 21
- **Most likely**: task 09 (T2, max 4)
- **Reasoning**: The prompt is "Create an invoice for the customer Oakwood Ltd (org no. 909722500) with three product lines: Analysis Report (9796) at 27700 NOK with 25% VAT, Maintenance (2145) at 12700 NOK with 15% VAT (food), and System Development (5995) at 7050 NOK with 0% VAT (exempt)." The submission that most plausibly matches this run (c303599d, queued 22:11:06, completed 22:13:17) scored 5/8 raw with "3/6 checks failed" (checks 3, 4, 5). The 3 failed checks align perfectly with the 3 product lines whose product references were missing.
- **Leaderboard**: task 09 best_score stayed at 4 (already at T2 max). This run's normalized_score of 1.25 did not improve.
- **Note**: The run's own submission may have still been processing at after-capture time (3 processing entries at 22:11:44, 22:13:24, 22:13:32). The 5/8 submission above may be from a concurrent run. Either way, our run had the same product-reference deficiency.

## 2. Correctness Verdict

**Correctness < 1. Wrong final state.**

The run created an invoice with description-only order lines (no product references). The task explicitly said "three product lines" with product numbers (9796, 2145, 5995) in parentheses. These numbers are product identifiers that should have been:
1. Created as products via `POST /product/list` (batch create)
2. Referenced on the order lines via `product: { id: <created_product_id> }`

Sandbox investigation confirmed:
- `product: { number: 9796 }` on an order line does NOT auto-resolve to an existing product — readback shows `product: null`
- Products must be created first, then referenced by `product: { id: ... }`
- `POST /product/list` supports batch creation of all 3 products in 1 call
- Readback after referencing by id confirms `product.number: "9796"`, `product.name: "Analysis Report"` on the order line

The 3 failed checks (3/6 in task 09 candidate) almost certainly correspond to the 3 order lines missing their product references.

## 3. Efficiency Verdict

**Efficiency is moot because correctness was imperfect.** No efficiency bonus applies.

The run used 6 API calls (2 parallel reads + 1 failed invoice + 3 bank repair). This would have been optimal IF no products were needed (3 core + 3 bank repair = 6). But products WERE needed, making the correct count:

**Optimal path with bank repair (7 calls, 1 unavoidable 422):**
1. `GET /customer?organizationNumber=909722500&fields=*` (parallel)
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` (parallel)
3. `POST /product/list` with 3 products (parallel with 1+2)
4. `POST /invoice?sendToCustomer=true` with `product: { id: ... }` per line → 422 bank account
5. `GET /ledger/account?isBankAccount=true&fields=*`
6. `PUT /ledger/account/{id}` with bankAccountNumber
7. `POST /invoice?sendToCustomer=true` retry → 201

**Optimal path without bank issues (4 calls):**
1-3 in parallel: GET /customer, GET /ledger/vatType, POST /product/list
4. POST /invoice → 201

## 4. Likely Root Cause

1. **Trusted standard mismatch**: The `create-and-send-customer-invoice.md` trusted standard explicitly says "Do Not Use This Standard If... prompt requires an existing-product lookup-heavy flow." The task said "product lines" with product numbers — this is a product-reference flow. The standard's "Do Not Use" clause should have triggered.

2. **Description-only pitfall note in trusted standard was misleading**: The standard contains: "do not confuse description-only invoice tasks (where the prompt gives only a service description like 'Systemutvikling' without product numbers) with the order-based flow... description-only lines work perfectly... sandbox readback confirmed product: null on the resulting order line." The agent correctly followed this guidance for description-only tasks. However, this task explicitly gave product numbers (9796, 2145, 5995), making it NOT a description-only task. The agent failed to distinguish between the two cases.

3. **No playbook or guidance exists for the multi-product-line invoice shape**: There is no trusted standard or playbook that covers "create invoice with product references." The existing `create-and-send-customer-invoice.md` standard only covers description-only lines and explicitly excludes product-heavy flows. The `create-order-invoice-and-register-payment.md` standard is for the order→invoice→payment flow, not for direct invoice creation with products.

## 5. What Went Right

- **Correct customer resolution**: "the customer Oakwood Ltd" correctly triggered `GET /customer` (existing-customer branch) instead of `POST /customer`
- **Correct VAT resolution**: All 3 VAT rates (25%, 15% food, 0% exempt) were dynamically resolved from the filtered outgoing VAT lookup
- **Correct bank-account repair**: The repair branch fired correctly, retained customer.id and vatType IDs across the repair, and completed in 3 calls (GET account + PUT account + retry invoice)
- **Correct totals**: amountExcludingVatCurrency=47,450 (27700+12700+7050) and amountCurrency=56,280 (34625+14605+7050) were correct
- **No avoidable errors**: The only 422 was the unavoidable bank-account missing error
- **Fast execution**: Only 4 tool calls in the agent trace (2 reads + 1 write + 1 bash), completing in ~2 minutes

## 6. What To Change Next Time

### Critical fix: product-referenced invoice lines

When the task prompt gives product numbers in parentheses (e.g., "Analysis Report (9796)"), these are NOT just descriptions — they are product numbers that must be:
1. Created via `POST /product/list` with `{ name, number }` for each product
2. Referenced on order lines via `product: { id: <product_id> }`

### Optimal call sequence for product-line invoice tasks

**Without bank repair (4 calls):**
```
[parallel] GET /customer, GET /ledger/vatType, POST /product/list
POST /invoice with product: { id: ... } per line
```

**With bank repair (7 calls, 1 unavoidable 422):**
```
[parallel] GET /customer, GET /ledger/vatType, POST /product/list
POST /invoice → 422 bank account
GET /ledger/account
PUT /ledger/account/{id}
POST /invoice retry → 201
```

### Trusted standard gap to fix

The `create-and-send-customer-invoice.md` standard needs a new section covering "product-line" variant tasks where the prompt gives product numbers. The key additions:
- Recognize product numbers in parentheses as mandatory product references
- Add `POST /product/list` as a parallel step with customer/vatType resolution
- Include `product: { id: ... }` on each order line
- Note that `POST /product/list` accepts an array and creates all products in 1 call
- Note that `product: { number: N }` on an order line does NOT auto-resolve — product must be pre-created and referenced by id

### Detection heuristic

The prompt distinguishes the two shapes:
- **Description-only**: "invoice with order lines for Systemutvikling at 28900" → no product numbers → description-only lines
- **Product-line**: "invoice with product lines: Analysis Report (9796) at 27700" → product numbers in parens → must create products first

The word "product lines" and numbers in parentheses are the key signals.
