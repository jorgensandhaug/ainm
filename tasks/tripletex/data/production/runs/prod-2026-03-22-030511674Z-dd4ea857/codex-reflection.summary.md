# Post-Run Reflection: prod-2026-03-22-030511674Z-dd4ea857

## 1. Task

Create an invoice for customer **Floresta Lda** (org. nr 919172657) with three product lines:
- Sessão de formação (4783) at 24900 NOK, 25% VAT
- Armazenamento na nuvem (3343) at 14050 NOK, 15% VAT (food)
- Serviço de rede (4380) at 15750 NOK, 0% VAT (exempt)

Portuguese-language prompt. Task shape: create-order-invoice-and-register-payment (exact trusted-standard match).

## 2. Reflection

### What went well
- Correctly identified the task as an exact trusted-standard match and read the standard before writing code.
- Used the new optimized `POST /invoice` path (with embedded `orders[]`) instead of the old 5-call `POST /order` + `PUT /order/:invoice` path.
- Correctly computed `paidAmount = 24900×1.25 + 14050×1.15 + 15750×1.00 = 63032.50` from product VAT percentages.
- Used comma-separated `number=4783,3343,4380&fields=*,vatType(*)` for product lookup — all 3 products resolved in one call.
- Used `pts[0]` payment type selection (avoiding the `isIncoming` trap).
- Final Tripletex state was correct: invoice created, fully paid, amountOutstanding=0.

### What went poorly
- **Initial script lacked bank-account recovery logic.** When `POST /invoice` returned 422 ("bankkontonummer"), the script crashed. Had to rewrite the script with recovery and re-run from scratch — doubling the API calls.
- **11 total API calls** instead of the ideal 6 (with proactive hedge) or 7 (with reactive recovery built-in from the start).
- **2 × 422 errors** — one from each script execution.
- 4 calls were completely wasted (re-executing GET customer + GET product + GET paymentType + POST /invoice 422 a second time).

### What the correct approach should have been
- Include the bank-account recovery branch in the initial script (reactive approach: 7 calls, 1 error).
- Even better: use the proactive bank-account hedge (GET /ledger/account before POST /invoice, conditional PUT to repair): 6 calls, 0 errors.

## 3. Call Efficiency

**The run was NOT minimal-call.** It used 11 calls with 2 errors. Breakdown:

| Phase | Call | Result |
|-------|------|--------|
| Run 1 | GET /customer | 200 (wasted — repeated in Run 2) |
| Run 1 | GET /product | 200 (wasted — repeated in Run 2) |
| Run 1 | GET /invoice/paymentType | 200 (wasted — repeated in Run 2) |
| Run 1 | POST /invoice | **422** (wasted — no recovery) |
| Run 2 | GET /customer | 200 |
| Run 2 | GET /product | 200 |
| Run 2 | GET /invoice/paymentType | 200 |
| Run 2 | POST /invoice | **422** (triggers recovery) |
| Run 2 | GET /ledger/account | 200 |
| Run 2 | PUT /ledger/account | 200 |
| Run 2 | POST /invoice | **201** (success) |

**Wasted calls: 4** (all from Run 1 script restart).

### Lower-call path for the next agent

**Recommended path (proactive hedge): 5-6 calls, 0 errors:**
1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /product?number=<refs>&fields=*,vatType(*)`
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
4. `GET /ledger/account?isBankAccount=true&fields=*` — if invoice bank account lacks `bankAccountNumber`, do `PUT /ledger/account/{id}` (adds 1 call)
5. `POST /invoice?sendToCustomer=false&paymentTypeId=<id>&paidAmount=<exact total>` with embedded `orders[].orderLines`

= **5 calls** when bank account exists, **6 calls** when repair needed, **0 errors** either way.

**Minimum path (no hedge): 4 calls** when bank account exists, but **7 calls + 1 error** when missing (422 + GET + PUT + retry POST).

## 4. Root Causes

1. **Script lacked recovery logic**: The initial script used `process.exit(1)` on POST /invoice failure without any recovery branch for the well-known `bankkontonummer` 422. This is the single biggest waste — it forced a complete script restart, doubling all 3 read calls.

2. **No proactive bank-account check**: The trusted standard at the time said the proactive hedge was "not canonical" and "situational." But on fresh accounts (which is always the production reality), bank-account status is unpredictable, and the hedge costs only 1 extra call vs saving 1 call + 1 error.

3. **First run on the new POST /invoice path**: All 6 prior production runs used the old `POST /order` + `PUT /order/:invoice` path (5 calls). This was the first run to use the combined `POST /invoice` path (4 calls canonical). The bank-account issue exposed the missing recovery logic that wasn't needed on the old path's prior runs.

## 5. Sandbox Verification

### Test 1: Bank account state check
- `GET /ledger/account?isBankAccount=true&fields=*` on sandbox → found 3 bank accounts
- Invoice account 1920 already has `bankAccountNumber=12345678903` → proactive hedge would skip PUT (5 total calls)

### Test 2: Full E2E with 3 products + proactive hedge
- Created 3 test products with unique numbers + 1 test customer
- Executed the 5-call proactive hedge path: GET customer → GET products (comma-separated, vatType) → GET paymentType → GET ledger/account (bank acct exists, no repair) → POST /invoice
- Result: Invoice created, `amountOutstanding=0`, fully paid in **5 calls, 0 errors**
- Confirmed: 3-product comma-separated lookup works correctly with `vatType(*)` expansion

### Conclusion
The proactive hedge path is strictly better for fresh accounts:
- Bank acct exists: 5 calls, 0 errors (vs 4 without hedge — 1 extra call)
- Bank acct missing: 6 calls, 0 errors (vs 7 + 1 error without hedge — saves 1 call + avoids 1 error)

## 6. Playbook Changes

### Updated files
1. **`./trusted-standards/create-order-invoice-and-register-payment.md`**
   - Standard Flow updated: added step 4 (proactive bank-account hedge with `GET /ledger/account`)
   - Changed canonical path from 4 calls to 5 (with proactive hedge as recommended default)
   - Added CRITICAL warning: always include bank-account recovery in script from first write
   - Added production confirmation: Floresta Lda / 919172657 / 3 products / 3 VAT rates / paidAmount=63032.50
   - Updated `/ledger/account` guidance: proactive hedge is now recommended default (not "situational")

2. **`./task-playbooks/create-order-invoice-and-register-payment.md`**
   - Minimal Flow updated: added step 5 (proactive bank-account hedge)
   - Exact-Match Fast Path updated: 5-call path with proactive hedge as recommended
   - Added production confirmation with root cause analysis (11 calls → ideal 6)
   - Added CRITICAL warning about inline recovery as defense in depth

3. **`./trusted-standards/common-endpoints.md`**
   - Order fast-path note updated: mentions `POST /invoice` with embedded orders (not old POST /order + PUT path)
   - Bank-account hedge note updated: proactive hedge is now recommended default for fresh accounts

No new files created. No AGENTS.md table changes needed (existing entries cover this task shape).

## 7. Commit

```
6f3a0d7b tripletex playbook: create-order-invoice-and-register-payment — proactive bank-account hedge now recommended default; 8th production confirmation (prod-2026-03-22-030511674Z-dd4ea857, Portuguese prompt, Floresta Lda / 919172657 / 3 products 4783+3343+4380 / 3 VAT rates 25%+15%+0% / paidAmount=63032.50); FIRST POST /invoice path production run; FIRST 3-product confirmation; FIRST bank-account repair on this path; 11 actual calls (4 wasted from script restart) — root cause: initial script lacked recovery branch; proactive hedge saves 1 call + 1 error vs reactive recovery (6 vs 7+1 error when bank acct missing); sandbox-verified 2026-03-22
```

## 8. Reusable Heuristics

1. **Always include known recovery branches in the initial script.** The bankkontonummer 422 is a well-documented failure mode. Writing a script without recovery and then re-running from scratch wastes every call from the first attempt. This applies to ALL task shapes that call `POST /invoice` or `PUT /order/:invoice`.

2. **Use the proactive bank-account hedge for fresh-account invoice tasks.** `GET /ledger/account?isBankAccount=true&fields=*` before the first invoice write costs 1 extra call when the bank account exists, but saves 1 call + avoids 1 error when it's missing. Since production always uses fresh accounts and bank-account status is unpredictable (5/7 prior runs didn't need repair, 1/7 did), the hedge is worth the tradeoff.

3. **3-product comma-separated lookup works reliably.** `GET /product?number=A,B,C&fields=*,vatType(*)` returns all matching products in one call with OR semantics, even for 3+ products. The VAT `percentage` expansion from `vatType(*)` is essential for computing the exact `paidAmount`.

4. **POST /invoice with embedded orders is strictly better than POST /order + PUT /order/:invoice.** It saves 1 call (4 vs 5 canonical) by combining order creation, invoice creation, and payment registration in a single write. But it requires `paidAmount=<exact total>` (not `0.01`) because there is no `paymentTypeIdRestAmount` parameter.

5. **Script-restart waste is the biggest efficiency killer.** A failed script without recovery costs N wasted calls (where N = all calls before the failure point). Always design scripts with inline error handling for known failure modes rather than relying on `process.exit(1)`.
