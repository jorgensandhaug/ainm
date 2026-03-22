# Score Reflection — prod-2026-03-22-101759006Z-b65ab238

## Task Attribution

- **Task ID**: 09 (T2 tier, max normalized score = 4)
- **Prompt**: Create customer invoice for Solmar SL (829487888) with 3 product lines — Sesión de formación (6042) 2350 NOK 25% VAT, Mantenimiento (5211) 3150 NOK 15% VAT, Licencia de software (8022) 14300 NOK 0% VAT
- **Request ID**: a2b5753c
- **Duration**: 155.6s

## Correctness Verdict

**Perfect correctness.** score_raw = 8/8, correctness = 1.0, 6/6 checks passed. All product lines, amounts, VAT types, and customer data were correct.

- amountExcludingVatCurrency = 19800 (2350 + 3150 + 14300)
- amountCurrency = 20860 (2937.5 + 3622.5 + 14300)
- All three products correctly linked with correct vatType.id values (3=25%, 31=15%, 6=0%)

## Efficiency Verdict

**Efficiency gap.** normalized_score = 2.5333 out of max 4.0 (63.3%). Leaderboard best for task 09 is 4.0 (both before and after this run). The gap of 1.4667 points is entirely due to efficiency penalty — the correctness was perfect.

The run used 6 API calls:
1. `GET /customer` → 200 (free)
2. `GET /product` → 200 (free)
3. `POST /invoice` → **422** (bank account missing — THIS IS THE PROBLEM)
4. `GET /ledger/account` → 200 (free)
5. `PUT /ledger/account` → 200
6. `POST /invoice` → 201 (retry)

The 422 error on call 3 is a 4xx error that penalizes the efficiency bonus. Additionally, the failed POST followed by a retry means 3 writes instead of the 2 that would suffice with a proactive approach.

## Likely Root Cause

The **reactive bank-account repair pattern** (POST invoice → 422 → GET bank → PUT bank → retry POST) causes an avoidable 422 error. Since the scoring penalizes 4xx errors, this pattern inherently caps the efficiency bonus even though correctness is perfect.

The **proactive bank-account check** approach (already identified in the prior reflection) eliminates this:
1. `GET /customer` → 200 (free)
2. `GET /product` → 200 (free)
3. `GET /ledger/account?isBankAccount=true&fields=*` → 200 (free — check `bankAccountNumber`)
4. `PUT /ledger/account/{id}` → 200 (fix bank account, only if `bankAccountNumber` is falsy)
5. `POST /invoice?sendToCustomer=false` → 201 (succeeds first try, 0 errors)

Result: **0 errors, 2 writes** vs the actual **1 error, 3 writes**. The free GET to check the bank account costs nothing but eliminates both the 422 error and the wasted retry write.

The leaderboard best of 4.0 confirms that a zero-error path exists and scores full marks.

## What Went Right

1. **Product resolution**: comma-separated `GET /product?number=6042,5211,8022&fields=*` resolved all 3 products in one call — seventh production confirmation of this approach
2. **VAT inheritance**: products carried correct `vatType.id` values (3, 31, 6); reusing them with explicit `vatType: { id: product.vatType.id }` produced correct totals without needing `/ledger/vatType`
3. **Invoice payload**: correct structure with `orders[].orderLines`, proper `invoiceDate`/`invoiceDueDate`, product linking via `product: { id }`
4. **Correctness**: 6/6 checks passed, all amounts and VAT types verified
5. **Script execution**: fast execution, no wasted documentation reads, no timeouts
6. **Bank account repair**: when the 422 hit, repair was clean — find account, set `bankAccountNumber`, retry once

## What To Change Next Time

1. **Proactive bank-account check (CRITICAL)**: Before `POST /invoice`, always do `GET /ledger/account?isBankAccount=true&fields=*` (free). If the invoice account's `bankAccountNumber` is falsy, `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` BEFORE attempting the invoice write. This eliminates the 422 error entirely and should recover the ~1.47 efficiency points lost on this run.

2. **Updated optimal flow for task 09 shape**:
   - `GET /customer?organizationNumber=...&fields=*` (free)
   - `GET /product?number=X,Y,Z&fields=*` (free)
   - `GET /ledger/account?isBankAccount=true&fields=*` (free) — check `bankAccountNumber`
   - conditional `PUT /ledger/account/{id}` (1 write, only if needed)
   - `POST /invoice?sendToCustomer=false` (1 write, succeeds first try)
   - `GET /invoice/{id}?fields=*,...` (free verification)
   - Total: 3 free reads + 1-2 writes + 0 errors

3. **The trusted standard has already been updated** (in the prior reflection phase) to include the proactive bank-account check as step 4 in the Standard Flow. The next agent reading the standard will follow the proactive path.

4. **7/8 recent production runs for this task shape needed bank-account repair.** The proactive approach is not a micro-optimization — it affects the vast majority of runs and is worth the 1 free GET every time.
