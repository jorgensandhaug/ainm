# Reflection: prod-2026-03-22-105454556Z-40dc180c

## 1. Task
Create and send a customer invoice to Solmar SL (org. nr 893298169) for 19500 NOK sin IVA (without VAT). Description: Mantenimiento. Spanish prompt, new customer, fresh account.

## 2. Reflection
**What went well:**
- Correctly identified as `create-and-send-customer-invoice` trusted standard match
- Read the trusted standard before writing the script
- Used hardcoded `vatType: { id: 6 }` for Spanish "sin IVA" — saved 1 call vs GET /ledger/vatType
- Proactive bank-account check (free GET) prevented a 422 error on POST /invoice
- Parallelized POST /customer with GET /ledger/account
- Retained customer.id in memory across bank repair step
- Script was clean, no retries, no errors
- Final state correct: amountExcludingVatCurrency=19500, amountCurrency=19500

**What went poorly:**
- Nothing. This was a clean, optimal execution.

**Mistakes:**
- None.

## 3. Call Efficiency
**The run was minimal-call.** 4 calls, 0 errors.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `POST /customer` | 201 | Create Solmar SL (parallel) |
| 2 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Proactive bank check (parallel, free) |
| 3 | `PUT /ledger/account/{id}` | 200 | Fix missing bankAccountNumber |
| 4 | `POST /invoice` | 201 | Create + send invoice (sendToCustomer=true) |

**Wasted calls:** 0

**Lower-call path:** Not possible. This IS the optimal path for fresh-account create-and-send with bank repair:
- POST /customer and GET /ledger/account run in parallel (step 1)
- PUT /ledger/account is required (bank always empty on fresh accounts)
- POST /invoice is the final scored write
- vatType.id=6 is hardcoded — no GET /ledger/vatType needed

**Comparison to previous Spanish "sin IVA" runs:**
- Río Verde SL (2026-03-21): 6 calls, 1 error (reactive bank repair + GET /ledger/vatType)
- Solmar SL (this run): 4 calls, 0 errors — **33% fewer calls, 100% fewer errors**

## 4. Root Causes
No issues to root-cause. The run executed the trusted standard's recommended path exactly.

## 5. Sandbox Verification
Sandbox re-verified the exact same flow:
- `POST /customer` (Solmar Reflection 31545 SL) → 201
- `GET /ledger/account` → bank already set from prior runs (no PUT needed)
- `POST /invoice` with hardcoded `vatType: { id: 6 }` → 201, amountExcludingVatCurrency=19500, amountCurrency=19500
- Verification GET confirmed: `vatType.id=6`, `vatType.percentage=0`, description "Mantenimiento", customer correct
- Also verified: when bank account is already set, the path reduces to 2 scored writes (POST /customer + POST /invoice)

## 6. Playbook Changes
Updated existing files (no new files created):

**`./trusted-standards/create-and-send-customer-invoice.md`:**
- Added Solmar SL as the first Spanish "sin IVA" production confirmation of hardcoded vatType.id=6 + proactive bank check (4 calls, 0 errors)
- Updated the Spanish "sin IVA" known-pitfall entry to reference the new 4-call optimal path instead of the old 6-call reactive path

**`./task-playbooks/create-and-send-customer-invoice.md`:**
- Removed contradictory advice ("Do not hardcode VAT code 3") that conflicted with the Minimal Flow section ("DO NOT call GET /ledger/vatType — hardcode"); replaced with consistent "DO hardcode vatType IDs" guidance
- Updated Spanish "sin IVA" section to show the optimal 4-call path with hardcoded vatType.id=6 (was showing 5-call path with GET /ledger/vatType)
- Updated product-line sections (new customer + existing customer) to use proactive bank check and hardcoded vatType instead of GET /ledger/vatType; corrected call counts accordingly

## 7. Commit
- Hash: `2c1f822a`
- Message: `tripletex playbook: create-and-send — Solmar SL confirms 4-call Spanish sin IVA path (hardcoded vatType.id=6 + proactive bank check)`

## 8. Reusable Heuristics
1. **Hardcoded vatType IDs are stable across production and sandbox.** For all single-VAT-rate invoices, hardcode the ID (3=25%, 6=0% outside, 5=0% exempt, 31=15%, 32=12%, 52=0% export) and skip GET /ledger/vatType entirely. Saves 1 call per invoice run.
2. **Proactive bank-account check is always better than reactive.** GET /ledger/account is free from scoring; the 422 error from reactive costs 1 extra write + 1 error. Fresh accounts always need bank repair, so the proactive path always wins.
3. **Parallelize POST /customer with GET /ledger/account.** These are independent operations and can run concurrently, reducing wall-clock time.
4. **Spanish "sin IVA" = vatType.id=6 (0% outside MVA).** This is now production-confirmed. Do not use vatType.id=5 (exempt) for "sin IVA" — use id=6 (outside MVA area).
5. **Optimal fresh-account create-and-send (any language, bank repair needed): 4 calls, 0 errors.** POST /customer ∥ GET /ledger/account → PUT /ledger/account → POST /invoice.
6. **Optimal fresh-account create-and-send (bank already set): 3 calls, 0 errors.** POST /customer ∥ GET /ledger/account → POST /invoice. The GET is free but confirms bank is set, avoiding surprise 422s.
