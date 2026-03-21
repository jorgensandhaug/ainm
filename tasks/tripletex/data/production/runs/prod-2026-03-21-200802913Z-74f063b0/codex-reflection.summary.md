# Codex Reflection Summary

## Task
Create an invoice for customer Sierra SL (org. nº 909007135) with three product lines:
- Desarrollo de sistemas (8344) at 19250 NOK with 25% VAT
- Horas de consultoría (9563) at 10000 NOK with 15% VAT (food)
- Informe de análisis (8060) at 15800 NOK with 0% VAT (exempt)

Spanish-language prompt. Create-only (no send). Exact product numbers given in parentheses.

## Reflection
**What went well:**
- The agent correctly identified this as an exact trusted-standard match for the 3-call fast path
- Read the trusted standard before writing the script (avoiding the timeout trap from the 970844708 run)
- Used the comma-separated `number=8344,9563,8060` product query (OR semantics) — first production use of this approach
- All 3 products resolved in one call; no fallback to catalog read needed
- Products carried correct `vatType.id` values: `3` (25%), `31` (15%), `6` (0%)
- Reused `product.vatType.id` on each invoice line — no separate `/ledger/vatType` call needed
- No bank-account repair was needed
- Invoice created successfully with correct totals: `amountExcludingVatCurrency=45050`, `amountCurrency=51362.5`

**What went poorly:**
- Nothing. This was an optimal execution.

**Mistakes:**
- None. Zero wasted calls, zero 4xx errors.

## Call Efficiency
**The run was minimal-call.** 3 API calls, 0 errors — the theoretical minimum for this task shape.

| # | Call | Result |
|---|------|--------|
| 1 | `GET /customer?organizationNumber=909007135&fields=*` | Customer resolved (id 108326495) |
| 2 | `GET /product?number=8344,9563,8060&fields=*` | All 3 products resolved with vatType.id |
| 3 | `POST /invoice?sendToCustomer=false` | Invoice created (id 2147633010, invoiceNumber 2) |

**Wasted calls:** None.

**Lower-call path:** N/A — 3 calls is the theoretical floor. Cannot avoid the customer read (need `customer.id`), the product read (need `product.id` and `vatType.id`), or the invoice write.

**Expected totals verification:**
- amountExcludingVat: 19250 + 10000 + 15800 = 45050 ✓
- amountCurrency: 19250×1.25 + 10000×1.15 + 15800×1.0 = 24062.5 + 11500 + 15800 = 51362.5 ✓

## Root Causes
No failures to diagnose. The run executed the exact trusted-standard fast path without deviation.

## Sandbox Verification
- Persistent sandbox re-proof with comma-separated `number=2109,1175,9974` confirmed OR semantics works: all 3 products returned in one call
- Full 3-call invoice creation with analog customer (889752963) and products succeeded: `amountExcludingVatCurrency=45050` (sandbox 0% only, so `amountCurrency=45050`)
- Readback (`GET /invoice/{id}?fields=*,...`) confirmed all products linked with correct numbers (`1175`, `2109`, `9974`), descriptions, and unit prices
- Also confirmed that comma-separated `number` query fails 422 when any product number exceeds int32 range (e.g., `9459732933`); this does not affect task prompts which always use small integers

## Playbook Changes
Updated existing trusted standard and playbook (no new files created):
- `./trusted-standards/create-customer-invoice.md` — added 9th production confirmation entry documenting the 3-call optimal path with comma-separated product query, first production confirmation of `number=X,Y,Z` OR semantics
- `./task-playbooks/create-customer-invoice.md` — added matching production confirmation entry
- `./trusted-standards/common-endpoints.md` — added production confirmation note to the primary product resolver entry

## Commit
- Hash: `ead76f38`
- Message: `tripletex playbook: create-customer-invoice — add 9th production confirmation (74f063b0, Spanish prompt, Sierra SL / 909007135 / products 8344+9563+8060 / 19250+10000+15800 / 25%+15%+0%, 3 calls 0 errors), first production confirmation of comma-separated number=X,Y,Z product query (OR semantics), theoretical 3-call minimum achieved for mixed-VAT exact-number existing-product create-only invoice, sandbox re-proof with analog products confirmed same path`

## Reusable Heuristics
1. **Comma-separated `number` query is now production-proven**: `GET /product?number=8344,9563,8060&fields=*` returned all 3 products in one call. This is strictly better than repeated `productNumber=X&productNumber=Y` params which are unreliable across accounts.
2. **Product VAT inheritance eliminates `/ledger/vatType` call**: When products carry `vatType.id`, reusing it on invoice lines (or omitting explicit `vatType` to inherit) avoids the extra call. Production-confirmed with mixed 25%/15%/0% VAT.
3. **3-call floor for exact-number existing-product create-only invoice**: `GET /customer` → `GET /product?number=X,Y,Z` → `POST /invoice?sendToCustomer=false`. No lower path exists.
4. **Read the trusted standard, then immediately write and execute**: This run avoided the timeout trap (970844708 run) by not reading AGENTS.md or openapi.json for an exact match.
5. **Comma-separated `number` query has int32 constraint**: Product numbers exceeding 2147483647 cause 422. Not a practical concern for task prompts (always 4-5 digit numbers).
6. **Spanish/multilingual prompts do not change the API path**: The same 3-call path works regardless of prompt language. Product names and descriptions are passed through as-is.
