# Reflection Summary — prod-2026-03-21-194143438Z-8e978a3e

## Task

Create an order for customer Solmar Lda (org. nº 867069526) with products Sessão de formação (4466) at 35600 NOK and Licença de software (3717) at 3250 NOK. Convert the order to an invoice and register full payment.

## Reflection

**What went well:**
- Correctly identified the task as an exact match for the `create-order-invoice-and-register-payment` trusted standard
- Read the trusted standard before writing the script (as mandated)
- Used the canonical 5-call path without deviation
- Used `count=1000&fields=*` for product lookup with `String(p.number)` comparison (avoiding the type pitfall)
- Used `paidAmount=0.01` seed for the combined invoice+payment write
- All 5 calls succeeded with 0 errors
- Invoice settled to `amountOutstanding=0` on the first attempt

**What went poorly:**
- Nothing — this was a clean execution of an already-optimized flow

**Mistakes:**
- None

## Call Efficiency

The run was **minimal-call** at 5 API calls with 0 errors:

1. `GET /customer?organizationNumber=867069526&fields=*` → 200
2. `GET /product?count=1000&fields=*` → 200
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` → 200
4. `POST /order` → 201
5. `PUT /order/402031506/:invoice?invoiceDate=2026-03-21&sendToCustomer=false&paymentTypeId=28268899&paidAmount=0.01&paymentTypeIdRestAmount=28268899` → 200

**Wasted calls:** 0
**Lower-call path:** 5 calls is the proven canonical minimum for this task shape without cached data. The only possible reduction is to 4 calls if a prior run in the same session already holds a valid `paymentTypeId`.

## Root Causes

No errors or inefficiencies to diagnose. The run followed the trusted standard exactly and achieved perfect execution.

## Sandbox Verification

Sandbox verification on 2026-03-21 confirmed:

1. **5-call path works**: Created order, invoiced, and paid with outstanding=0 in sandbox
2. **New finding — comma-separated `number` query**: `GET /product?number=7579,2292&fields=*` returns both products using OR semantics
   - Verified with 2 and 3 products
   - Partial matches (one exists, one doesn't) return found ones without error
   - Works with `fields=*`
3. **`number=X&number=Y` (repeated query params)**: Uses non-OR semantics — only returns the first value. Do NOT confuse with comma-separated format
4. **`productNumber=X&productNumber=Y`**: Returns all values (OR semantics in sandbox) but is unreliable in production per earlier findings
5. **`productNumber` is NOT a valid ProductDTO `fields` value**: `GET /product?fields=id,productNumber` returns 400 with "Illegal field in fields filter"
6. **`productNumber` is only a query parameter**, not a response field; `number` is the response field

## Playbook Changes

Updated existing trusted standards and playbooks to recommend `number=X,Y` (comma-separated) as the primary product resolver:

**Trusted standards updated:**
- `./trusted-standards/create-order-invoice-and-register-payment.md` — updated Standard Flow step 2, Payload Rules, and replaced "Why count=1000" section with new "Product Lookup Strategy" section; added production confirmation for this run
- `./trusted-standards/create-customer-invoice.md` — updated Standard Flow step 2 to use comma-separated `number` query
- `./trusted-standards/common-endpoints.md` — updated product search notes to recommend `number=X,Y` as primary resolver

**Playbooks updated:**
- `./task-playbooks/create-order-invoice-and-register-payment.md` — added production confirmation, updated Minimal Flow step 3, Exact-Match Fast Path step 2, and Product Resolution Rules to use `number=X,Y`
- `./task-playbooks/create-customer-invoice.md` — updated Minimal Flow step 3, Exact-Match Fast Path step 2, and Avoidable Mistakes to use `number=X,Y`

No new files created. No AGENTS.md changes needed (task patterns and file paths unchanged).

## Commit

Changes were committed as part of `1b6112c0` ("more info") by a parallel process that picked up all pending playbook/trusted-standard changes.

Intended commit message: `tripletex playbook: create-order-invoice-and-register-payment — add 6th production confirmation (8e978a3e, Solmar Lda / 867069526 / Sessão de formação 4466 + Licença de software 3717, 5 calls 0 errors), discover and document comma-separated number=X,Y product query (OR semantics, sandbox-verified), update all product lookup guidance to recommend number=X,Y as primary resolver with count=1000 fallback, document productNumber is not a valid ProductDTO fields value (returns 400)`

## Reusable Heuristics

1. **Use `number=X,Y` (comma-separated) for product lookup** — it uses OR semantics and returns all matching products in one call. This is more targeted than `count=1000` and avoids scanning through all products locally. Verified in sandbox with 2- and 3-product queries.

2. **Never use `number=X&number=Y` (repeated query params)** — this uses non-OR semantics and only returns the first value. The comma-separated format `number=X,Y` is the correct multi-product query.

3. **`productNumber` is not a valid field** — requesting it in the `fields` filter returns 400. It exists only as a query parameter for filtering, and even then is unreliable across accounts.

4. **`paidAmount=0.01` is the proven seed** — Tripletex calculates the remaining full payment automatically for NOK runs.

5. **Always use `String(p.number) === String(promptRef)`** — `product.number` is always a string in the API response, never an integer. Strict equality with integer literals silently fails.

6. **The 5-call path is the canonical minimum** — for order→invoice→payment tasks without cached data: customer GET, product GET, paymentType GET, order POST, invoice PUT. No lower path exists without prior cached state.
