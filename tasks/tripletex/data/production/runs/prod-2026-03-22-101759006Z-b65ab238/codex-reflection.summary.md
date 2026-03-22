# Codex Reflection Summary — Run b65ab238

## 1. Task

Create customer invoice for Solmar SL (org. 829487888) with three product lines:
- Sesión de formación (6042) at 2350 NOK, 25% VAT
- Mantenimiento (5211) at 3150 NOK, 15% VAT (food)
- Licencia de software (8022) at 14300 NOK, 0% VAT (exempt)

Spanish-language prompt; standard create-customer-invoice shape.

## 2. Reflection

**What went well:**
- Correctly identified as exact-match `create-customer-invoice` trusted standard
- Used comma-separated `GET /product?number=6042,5211,8022&fields=*` (seventh production confirmation of OR semantics) — resolved all 3 products in one call
- Reused `product.vatType.id` values (`3`=25%, `31`=15%, `6`=0%) instead of wasting a `/ledger/vatType` call
- Correct invoice totals: `amountExcludingVatCurrency=19800`, `amountCurrency=20860`
- Bank-account repair handled correctly when the 422 occurred
- Verification GET confirmed all fields correct

**What went poorly:**
- The reactive bank-account pattern (POST → 422 → GET → PUT → retry POST) caused 1 avoidable 422 error and 1 extra write (the failed POST). This has happened in 7/8 recent production runs.

**Mistakes:**
- No script-level mistakes. The script was well-structured with proper error handling.
- The only inefficiency was following the old playbook's reactive bank-account pattern instead of proactively checking.

## 3. Call Efficiency

**Was the run minimal-call?** No — it could have avoided 1 write and 1 error.

**Actual calls (6 + 1 free):**
1. `GET /customer?organizationNumber=829487888&fields=*` → 200 (free)
2. `GET /product?number=6042,5211,8022&fields=*` → 200 (free)
3. `POST /invoice?sendToCustomer=false` → 422 (avoidable error + wasted write)
4. `GET /ledger/account?isBankAccount=true&fields=*` → 200 (free)
5. `PUT /ledger/account/{id}` → 200 (necessary write)
6. `POST /invoice?sendToCustomer=false` → 201 (necessary write)
7. `GET /invoice/{id}?fields=*,...` → 200 (free verification)

**Writes: 3** (1 wasted), **Errors: 1** (avoidable 422)

**Optimal path (proactive bank-account check):**
1. `GET /customer?organizationNumber=829487888&fields=*` → 200 (free)
2. `GET /product?number=6042,5211,8022&fields=*` → 200 (free)
3. `GET /ledger/account?isBankAccount=true&fields=*` → 200 (free — check `bankAccountNumber`)
4. `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` → 200 (conditional write)
5. `POST /invoice?sendToCustomer=false` → 201 (succeeds first try)
6. `GET /invoice/{id}?fields=*,...` → 200 (free verification)

**Writes: 2**, **Errors: 0**

**Savings:** 1 fewer write, 1 fewer error. The proactive approach is strictly better because:
- GETs are free (the extra bank-account check costs nothing)
- 4xx errors hurt scoring
- When bank account is already set: 1 write (POST invoice), 0 errors
- When bank account needs repair: 2 writes (PUT + POST), 0 errors

## 4. Root Causes

**Why the 422 happened:** The playbook previously recommended a reactive pattern — try POST /invoice first, handle the 422, then fix the bank account and retry. This made sense when GETs counted against call totals, but is suboptimal now that GETs are free and 4xx errors are penalized.

**Why 7/8 recent runs hit this:** Fresh production accounts almost never have bank account numbers configured. The proactive check would have prevented the 422 in all 7 cases.

## 5. Sandbox Verification

1. **Bank account state check** — `GET /ledger/account?isBankAccount=true&fields=*` returns `bankAccountNumber` directly on the account object. When set: non-empty string. When unset: empty string or null. This is sufficient to detect the need for repair before POST /invoice.

2. **Proactive flow end-to-end** — In sandbox with existing customer `861379760` and products `2109,1175,9974`:
   - GET customer (free) → GET products (free) → GET bank account (free, already set) → POST invoice → 201 first try
   - Invoice: `amountExcludingVatCurrency=10000`, all products linked correctly
   - Zero errors, 1 write

## 6. Playbook Changes

**Updated existing files (no new files created):**

| File | Change |
|------|--------|
| `trusted-standards/create-customer-invoice.md` | Added proactive bank-account check as Standard Flow step 4; updated Known Recovery Branches to note proactive is preferred; added run b65ab238 production confirmation with proactive-check finding |
| `task-playbooks/create-customer-invoice.md` | Replaced "Bank Account Repair Branch" with "Bank Account — Proactive Check (Preferred)" + "Reactive Fallback"; updated Minimal Flow steps 5-9; updated Exact-Match Fast Path to include proactive bank check; changed "Do not insert automatic GET /ledger/account" to "DO insert proactive GET"; added run b65ab238 production confirmation |

No AGENTS.md changes needed — same task shape, no new task type.

## 7. Commit

- **Hash:** `2c7c3d29`
- **Message:** `tripletex playbook: proactive bank-account check before POST /invoice — eliminates 422 error (Run b65ab238)`
- **Files:** `trusted-standards/create-customer-invoice.md`, `task-playbooks/create-customer-invoice.md`

## 8. Reusable Heuristics

1. **Proactive > reactive when reads are free.** If a common failure mode can be detected and prevented with a free GET before the write, always do that instead of handling the error after the fact. The cost of a free GET is zero; the cost of a 422 is 1 wasted write + 1 error penalty.

2. **Bank account repair is nearly universal in fresh accounts.** 7/8 recent production runs needed it. Treat it as a near-certain prerequisite, not a rare edge case.

3. **The proactive bank-account check pattern:**
   ```
   GET /ledger/account?isBankAccount=true&fields=*
   → find isInvoiceAccount=true (usually account 1920)
   → if !bankAccountNumber → PUT with "12345678903"
   → then POST /invoice
   ```

4. **Comma-separated `number=X,Y,Z` is proven.** Seven production confirmations across 5 languages (es, pt, fr, nb, nn, en). Always use this as the primary product resolver for exact-number prompts.

5. **Product-carried `vatType.id` eliminates `/ledger/vatType` calls.** Products in this task shape always carry `vatType.id` values `3` (25%), `31` (15%), `6` (0%). Reuse them directly — no separate VAT lookup needed.
