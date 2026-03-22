# Codex Reflection Summary

## Task
Create a customer invoice for Ridgepoint Ltd (org no. 932956233) with three product lines:
- Analysis Report (5566) at 24650 NOK, 25% VAT
- Cloud Storage (6035) at 3350 NOK, 15% VAT (food)
- Training Session (5199) at 13350 NOK, 0% VAT (exempt)

## Reflection

**What went well:**
- Immediate execution after reading trusted standard — no wasted time on additional file reads
- Proactive bank-account check (GET → conditional PUT) applied BEFORE `POST /invoice` — eliminated the 422 error entirely
- Comma-separated `number=5566,6035,5199` product query resolved all 3 products in one call (eighth production confirmation of OR semantics)
- Product VAT inheritance worked: products carried `vatType.id` values `3` (25%), `31` (15%), `6` (0%); explicit `vatType: { id: product.vatType.id }` on each line produced correct totals
- Final totals correct: `amountExcludingVatCurrency=41350`, `amountCurrency=48015`
- **First production run to use proactive bank-account check** — validated the approach added after the previous run's post-run analysis

**What went poorly:**
- Nothing. This was an optimal execution with 0 errors.

**Mistakes:**
- None.

## Call Efficiency

**Was the run minimal-call?** Yes — 6 calls is the minimum when bank-account repair is needed.

**Exact call sequence (6 calls, 0 errors):**
1. `GET /customer?organizationNumber=932956233&fields=*` → 200 (free)
2. `GET /product?number=5566,6035,5199&fields=*` → 200 (free)
3. `GET /ledger/account?isBankAccount=true&fields=*` → 200 (free, proactive bank check)
4. `PUT /ledger/account/498857626` → 200 (bank repair — bankAccountNumber was missing)
5. `POST /invoice?sendToCustomer=false` → 201 (succeeded first try)
6. `GET /invoice/2147696156?fields=*,...` → 200 (free verification)

**Wasted calls:** 0

**Comparison with reactive approach (used in all prior production runs):**
- Reactive: GET customer → GET product → POST invoice [422] → GET bank → PUT bank → POST invoice retry = 6 calls, **1 error**
- Proactive: GET customer → GET product → GET bank → PUT bank → POST invoice [201] → GET verify = 6 calls, **0 errors**
- Same total calls, but proactive eliminates the 422 error penalty AND the wasted POST write

**Optimal path for next agent (same task shape):**
1. `GET /customer?organizationNumber=...&fields=*` (free)
2. `GET /product?number=X,Y,Z&fields=*` — comma-separated, OR semantics (free)
3. `GET /ledger/account?isBankAccount=true&fields=*` — proactive bank check (free)
4. (conditional) `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` if missing
5. `POST /invoice?sendToCustomer=false` with product IDs and `vatType: { id: product.vatType.id }`
6. `GET /invoice/{id}?fields=*,...` — verification (free)

## Root Causes

No failures in this run. The proactive bank-account check — added after the previous run's post-run analysis — prevented the only known failure mode for this task shape.

## Sandbox Verification

Sandbox re-proof confirmed:
- When bank account already has `bankAccountNumber`, the proactive GET returns it and no PUT is needed (5 calls: 3 core + 1 bank GET + 1 verify)
- Invoice creation succeeds first try in both cases (with and without bank repair)
- Product VAT inheritance works identically in sandbox and production

## Playbook Changes

**Updated existing files (no new files created):**
- `./trusted-standards/create-customer-invoice.md` — added production run entry confirming first proactive bank-account check validation; documented that proactive approach is strictly better (same calls, 0 errors vs 1 error)
- `./task-playbooks/create-customer-invoice.md` — added production run entry; fixed contradictory "Avoidable Mistakes" entry that said "Do not spend an unconditional GET /ledger/account" (now correctly says DO spend the proactive GET since it's free and eliminates 422 errors)

## Commit

- Hash: `3f13ce4f`
- Message: `tripletex playbook: first proactive bank-account check production validation (Ridgepoint Ltd, 0 errors)`

## Reusable Heuristics

1. **Proactive bank-account check is strictly better than reactive.** Same call count, 0 errors vs 1 error. The failed POST /invoice in reactive mode counts as both a wasted write AND an error penalty. Always do `GET /ledger/account?isBankAccount=true&fields=*` before `POST /invoice`.

2. **Comma-separated `number=X,Y,Z` product query is the proven primary resolver.** Eight production confirmations now. Always use this as the first product resolution attempt; fall back to `count=1000` only if it returns fewer products than expected.

3. **Product `vatType.id` values are stable across accounts:** `3` (25%), `31` (15%), `6` (0%). Reuse them directly from the product read with explicit `vatType: { id: product.vatType.id }` — no `/ledger/vatType` call needed.

4. **Read trusted standard → immediately write script → execute.** This run followed that pattern and completed optimally. Previous runs that read multiple files (AGENTS.md + playbook + trusted standard) before writing a script timed out at 0%.

5. **GETs are free; 4xx errors are not.** Spend free GETs to prevent errors rather than saving GETs and paying the error penalty later.
