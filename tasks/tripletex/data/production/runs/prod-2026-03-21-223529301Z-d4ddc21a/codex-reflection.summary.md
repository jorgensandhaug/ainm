# Post-Run Reflection: prod-2026-03-21-223529301Z-d4ddc21a

## 1. Task

Set a fixed price of 170500 NOK on project "Infrastructure Upgrade" for Brightstone Ltd (org no. 850116091). Project manager Charlotte Walker (charlotte.walker@example.org). Invoice customer for 33% of fixed price (56265 NOK) as milestone payment.

## 2. Reflection

**What went well:**
- Correctly identified the task as an exact match for `set-project-fixed-price-and-invoice-partial-payment` trusted standard
- Read the trusted standard before writing any script
- Initial `GET /project` with expanded `customer(*)` and `projectManager(*)` found the project immediately; PM already matched, so no extra `GET /employee` was needed
- Proactive bank-account check discovered missing `bankAccountNumber` on account 1920 and fixed it pre-emptively, avoiding a `422` on the invoice write
- All 7 calls succeeded with 0 errors
- Milestone amount `170500 * 0.33 = 56265` was exact (no decimal rounding needed)

**What could be improved:**
- Used the old 2-call `POST /order` + `PUT /order/:invoice` path when `POST /invoice?sendToCustomer=false` with embedded `orders[]` could have saved 1 call
- Did not parallelize `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account` — these are independent calls that can run simultaneously

## 3. Call Efficiency

**Production run: 7 calls, 0 errors (update-needed + missing bank)**

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | GET /project?name=...&fields=*,customer(*),projectManager(*) | 200 | Find project, customer, PM |
| 2 | PUT /project/402042581 | 200 | Set fixedprice=170500, isFixedPrice=true |
| 3 | GET /ledger/vatType | 200 | Get outgoing VAT (25%, id=3) |
| 4 | POST /order | 200 | Create order with milestone line |
| 5 | GET /ledger/account?isBankAccount=true | 200 | Proactive bank check |
| 6 | PUT /ledger/account/475572767 | 200 | Fix missing bankAccountNumber |
| 7 | PUT /order/:invoice | 200 | Create invoice |

**Wasted call: 1**
- Call 4 (`POST /order`) + Call 7 (`PUT /order/:invoice`) = 2 calls for invoice creation
- `POST /invoice?sendToCustomer=false` with embedded `orders[]` does both in 1 call
- Net saving: 1 call

**Optimal path for this exact branch (update-needed + missing bank): 6 calls**

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | GET /project?name=...&fields=*,customer(*),projectManager(*) | 200 | Find project, customer, PM |
| 2-4 | PUT /project + GET /ledger/vatType + GET /ledger/account | 200 | Parallel: update project + get VAT + check bank |
| 5 | PUT /ledger/account/{id} | 200 | Fix missing bankAccountNumber |
| 6 | POST /invoice?sendToCustomer=false | 201 | Create milestone invoice |

## 4. Root Causes

1. **Stale trusted standard**: The trusted standard still used the old `POST /order` + `PUT /order/:invoice` 2-call path. Other trusted standards (e.g., `register-project-hours-and-create-project-invoice`) had already adopted `POST /invoice` but this one had not been updated.

2. **Sequential execution**: `PUT /project`, `GET /ledger/vatType`, and `GET /ledger/account` were run sequentially even though they have no data dependencies between them.

## 5. Sandbox Verification

Three sandbox tests confirmed the optimization:

1. **POST /invoice for fixed-price milestone**: `POST /invoice?sendToCustomer=false` with embedded `orders[]` containing project, customer, and milestone order line succeeded (201), returning `amountExcludingVatCurrency=56265` and `projectInvoiceDetails.length=1`.

2. **Skip-PUT branch = 3 calls**: When project already has correct fixedprice/PM, the path is `GET /project` → `GET /ledger/vatType` → `POST /invoice` = 3 measured calls (was 4).

3. **Update-needed branch = 5 calls**: With parallelized `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account`, the path is 5 measured calls on configured bank (was 6), with `amountExcludingVatCurrency=81114` (`245800 * 0.33`).

All three tests returned correct `projectInvoiceDetails` and milestone amounts.

## 6. Playbook Changes

Updated existing files (no new files created):

- `trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md`:
  - Replaced `POST /order` + `PUT /order/:invoice` (steps 8+10) with `POST /invoice?sendToCustomer=false` (step 8)
  - Updated Standard Flow to parallelize `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account` on update-needed branch
  - Updated Payload Rules with `POST /invoice` shape and requirements (`invoiceDueDate`, `orders[0].customer`)
  - Updated call counts: skip-PUT = 3 (was 4), update+configured = 5 (was 6), update+missing = 6 (was 7)
  - Updated Reuse From Write Response for `POST /invoice`
  - Updated Known Recovery Branches
  - Added 12th production confirmation (d4ddc21a) and sandbox verification of POST /invoice optimization

- `task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`:
  - Updated Minimal Safe Flow steps 8-13 for `POST /invoice` and parallelization
  - Updated Recommended Shapes with `POST /invoice` payload example
  - Updated Exact-Match Fast Path with new call counts
  - Updated Verification Shape for `POST /invoice`
  - Updated Avoidable Mistakes

## 7. Commit

- **Hash**: `52c3c2a2`
- **Message**: `tripletex playbook: set-project-fixed-price-and-invoice-partial-payment — replace 2-call POST /order + PUT /order/:invoice with 1-call POST /invoice?sendToCustomer=false (sandbox-verified 2026-03-21); parallelize PUT /project + GET /ledger/vatType + GET /ledger/account on update-needed branch; new call counts: skip-PUT = 3 (was 4), update+configured = 5 (was 6), update+missing = 6 (was 7); add 12th production confirmation (d4ddc21a, Brightstone Ltd / 850116091 / Infrastructure Upgrade / charlotte.walker@example.org / 170500 / 33%, 7 calls 0 errors, amountExcludingVatCurrency=56265, VAT 25%); 9/11 update-needed runs had missing bank accounts (82%)`

## 8. Reusable Heuristics

1. **POST /invoice replaces POST /order + PUT /order/:invoice everywhere**: Any task that creates an unsent invoice via `POST /order` + `PUT /order/:invoice` (2 calls) can use `POST /invoice?sendToCustomer=false` with embedded `orders[]` (1 call) instead. Saves 1 call every time. Requires: root `invoiceDate`, root `invoiceDueDate`, root `customer`, and `orders[0].customer` must all be explicitly set.

2. **Parallelize independent API calls**: When `PUT /project` is needed, `GET /ledger/vatType` and `GET /ledger/account` can run in parallel with it since they don't depend on the project update result. Use `Promise.all()` for parallel execution.

3. **Proactive bank check remains the default on update-needed branch**: 9/11 production update-needed runs (82%) had missing bank accounts. The proactive hedge costs 0 extra calls when parallelized with other reads, and avoids the `422` + retry penalty.

4. **Skip-PUT branch stays optimistic**: When the project already has the correct fixedprice/PM, skip both the project write and the bank check. No skip-PUT production run has ever hit a bank-account issue.

5. **POST /invoice pitfalls**: Always include `invoiceDueDate` (omitting → `422`). Always include `customer: { id }` inside `orders[0]` (omitting → `422 orders.customer: Kan ikke være null`). Keep `project` on `orders[0]`, not inside `orderLines[]`.
