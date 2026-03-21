# Codex Reflection Summary — prod-2026-03-21-215530659Z-cdea5ca9

## 1. Task

Create an invoice for customer Ridgepoint Ltd (org no. 970844708) with three product lines:
- Software License (3957) at 3650 NOK with 25% VAT
- Maintenance (8149) at 11000 NOK with 15% VAT (food)
- Web Design (8092) at 17700 NOK with 0% VAT (exempt)

This was an exact match for the `create-customer-invoice` trusted standard. It was also the **second attempt** at this exact task — the first attempt (same day) scored 0/1 because the agent spent all 300s reading documentation and never executed a single API call.

## 2. Reflection

**What went well:**
- The agent read only the trusted standard, then immediately wrote and executed the script — the exact lesson from the first failed attempt.
- Used comma-separated `number=3957,8149,8092` product query (OR semantics), resolving all 3 products in one call.
- Reused `product.vatType.id` directly (3=25%, 31=15%, 6=0%) instead of wasting a call on `/ledger/vatType`.
- Correctly handled the known bank-account repair branch (422 → GET bank account → PUT repair → retry).
- No wasted calls. No avoidable errors.

**What went poorly:**
- Nothing. This was an optimal execution.

**Why the first attempt failed:**
- The first attempt tried to read `AGENTS.md` (27703 tokens, exceeded read limit), then the trusted standard, then partial `AGENTS.md` again — consuming all 300s without ever writing or running a script.
- The fix was simple: read the trusted standard first, then immediately execute.

## 3. Call Efficiency

**Was the run minimal-call?** Yes — optimal for the account state.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=970844708&fields=*` | 200 | Resolve customer (id=108330523) |
| 2 | `GET /product?number=3957,8149,8092&fields=*` | 200 | Resolve all 3 products in one call |
| 3 | `POST /invoice?sendToCustomer=false` | 422 | Bank account missing (known fresh-account issue) |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Find bank account to repair |
| 5 | `PUT /ledger/account/377288489` | 200 | Set bank account number |
| 6 | `POST /invoice?sendToCustomer=false` | 201 | Invoice created successfully |

**Total: 6 calls, 0 avoidable errors.**

- Theoretical minimum without bank-account issue: 3 calls (GET customer + GET products + POST invoice)
- Theoretical minimum with bank-account repair: 6 calls (3 + GET bank + PUT bank + retry POST)
- This run achieved the 6-call minimum.
- No `/ledger/vatType` call was needed — products already carried the intended VAT.
- No readback `GET /invoice/{id}` was needed — write response totals proved the outcome.

**Wasted calls: 0**

## 4. Root Causes

The only historical issue was the first attempt's timeout from excessive documentation reading. The retry fixed this by:
1. Reading only the trusted standard (not AGENTS.md or openapi.json)
2. Immediately writing and executing the script
3. Following the documented 3-call fast path with inline bank-account repair fallback

No API-flow issues were discovered. The task shape is well-documented and the trusted standard is accurate.

## 5. Sandbox Verification

Verified in persistent sandbox (`kkpqfuj-amager.tripletex.dev`) with analog products `2109`, `1175`, `9974`:

1. `GET /product?number=2109,1175,9974&fields=*` → 200, returned all 3 products (comma-separated OR semantics confirmed)
2. `GET /customer?count=3&fields=*` → 200, used existing sandbox customer
3. `POST /invoice?sendToCustomer=false` → 201, invoice created with `amountExcludingVatCurrency=32350` (sandbox 0% VAT only, so `amountCurrency=32350`)
4. Readback `GET /invoice/{id}?fields=*,...` → 200, confirmed all 3 products linked with correct numbers, descriptions, unit prices

The 3-call core path (without bank-account repair) was confirmed. The sandbox did not require bank-account repair.

**Key sandbox finding:** The `number` query parameter with comma-separated values validates that values must be positive integers. Product numbers like `9459732933` (too large/non-integer) cause a 422 validation error. The production product numbers (3957, 8149, 8092) are small positive integers and work correctly.

## 6. Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/create-customer-invoice.md`**: Added production confirmation for the Ridgepoint Ltd retry (cdea5ca9). Replaced the "scored 0/1" note with the full successful retry details including call sequence, vatType reuse, and bank-account repair. Added sandbox re-proof with comma-separated query.

- **`./task-playbooks/create-customer-invoice.md`**: Same updates as trusted standard — replaced timeout failure note with successful retry details. Third production confirmation of comma-separated `number=X,Y,Z` query.

- **`./AGENTS.md`** (line 35): Updated the timeout warning to note that the immediate retry succeeded in 6 calls by reading only the trusted standard then executing.

## 7. Commit

```
Hash: 41beae6d
Message: tripletex playbook: create-customer-invoice — add 2nd production confirmation for Ridgepoint Ltd (cdea5ca9, 970844708, products 3957+8149+8092, 6 calls 0 avoidable errors), optimal 6-call path with bank-account repair; third production confirmation of comma-separated number query; update AGENTS.md timeout warning with successful retry outcome
Files: AGENTS.md, trusted-standards/create-customer-invoice.md, task-playbooks/create-customer-invoice.md
```

## 8. Reusable Heuristics

1. **Read trusted standard, then execute immediately.** Do not also read AGENTS.md, openapi.json, or playbooks. The 300s budget is tight. This run proved the pattern: read one file, write script, execute.

2. **Comma-separated `number=X,Y,Z` is the primary product resolver.** Three production confirmations now (Sierra SL, Montanha Lda, Ridgepoint Ltd). It uses OR semantics and resolves all matching products in one call. Fall back to `count=1000` only if it returns fewer than expected.

3. **Reuse `product.vatType.id` instead of calling `/ledger/vatType`.** For exact-number existing-product create-only invoices, the product read returns `vatType.id` values that map to the standard VAT rates (3=25%, 31=15%, 6=0%). Copying these onto the invoice lines is sufficient — no separate VAT lookup needed.

4. **Bank-account repair is 3 extra calls and unavoidable in fresh accounts.** The pattern is always: first POST → 422 → GET bank account → PUT repair → retry POST. Do not try to preempt it (that would add an unconditional call). The 6-call path (3 core + 3 repair) is optimal for this account state.

5. **The write response totals are sufficient for create-only tasks.** When the payload fixes product, description, count, unitPrice, and vatType, and the response returns `amountExcludingVatCurrency` and `amountCurrency`, no readback GET is needed. This saves 1 call.

6. **vatType.id values are consistent across production accounts:** 3 (25%), 31 (15%), 6 (0%). Every production run has confirmed this mapping. The products carry these values directly.
