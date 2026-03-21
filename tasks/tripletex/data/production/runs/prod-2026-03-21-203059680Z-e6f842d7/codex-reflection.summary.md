# Codex Reflection Summary

## Task

Create a customer invoice for Montanha Lda (org. nr 869972401) with three product lines:
- Sessão de formação (7733) at 22950 NOK with 25% VAT
- Licença de software (6106) at 10250 NOK with 15% VAT (food)
- Manutenção (1351) at 3150 NOK with 0% VAT (exempt)

Portuguese prompt. Exact trusted-standard match: create-customer-invoice.

## Reflection

**What went well:**
- Immediately recognized this as an exact trusted-standard match and used the 3-call fast path
- Used comma-separated `number=7733,6106,1351` product query (OR semantics) — returned all 3 products in one call (2nd production confirmation of this approach after Sierra SL)
- Reused `product.vatType.id` on each line instead of wasting a `/ledger/vatType` call: vatType 3 (25%), 31 (15%), 6 (0%)
- Bank-account repair was handled correctly in-script with fallback logic
- No avoidable errors; the 422 bank-account validation is a known fresh-account condition

**What went poorly:**
- Nothing. This was an optimal execution.

## Call Efficiency

**This run was minimal-call: 6 calls, 0 avoidable errors.**

| # | Call | Status | Necessary? |
|---|------|--------|------------|
| 1 | `GET /customer?organizationNumber=869972401&fields=*` | 200 | Yes — resolve customer |
| 2 | `GET /product?number=7733,6106,1351&fields=*` | 200 | Yes — resolve all 3 products |
| 3 | `POST /invoice?sendToCustomer=false` | 422 | Yes — first attempt, hit bank-account validation |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Yes — bank-account repair |
| 5 | `PUT /ledger/account/{id}` | 200 | Yes — bank-account repair |
| 6 | `POST /invoice?sendToCustomer=false` | 201 | Yes — retry after repair |

**Wasted calls: 0**

**Lower-call path:** This run already achieved the theoretical minimum. The 3-call core path (GET customer + GET product + POST invoice) is the floor for this task shape. The bank-account repair adds 3 unavoidable calls (failed POST + GET account + PUT account). Without the bank-account issue, this would have been 3 calls (matching the Sierra SL optimal run).

## Root Causes

No errors or inefficiencies to diagnose. The bank-account validation is a known fresh-account condition that cannot be pre-detected without an extra speculative read (which the trusted standard correctly prohibits).

## Sandbox Verification

- Verified that product-linked invoice creation with `product: { id }` and `vatType: { id: product.vatType.id }` produces correct readback with all 3 lines, correct descriptions, unit prices, and VAT percentages
- Sandbox uses 0% VAT only, so `amountCurrency` matched `amountExcludingVatCurrency` (36350) rather than the production mixed-VAT total (43625)
- Comma-separated `number=X,Y,Z` query failed in sandbox due to abnormally large sandbox product numbers (10-digit), but production confirmed it works for standard 4-digit product numbers (2 production confirmations now)

## Playbook Changes

**Updated existing files (no new files created):**
- `./trusted-standards/create-customer-invoice.md` — added 8th production confirmation (e6f842d7, Portuguese prompt, Montanha Lda / 869972401, comma-separated product query, 6-call optimal path with bank-account repair)
- `./task-playbooks/create-customer-invoice.md` — added same production confirmation with call-by-call breakdown

No AGENTS.md changes needed — task pattern table already correct.

## Commit

- Hash: `a52137a4`
- Message: `tripletex playbook: create-customer-invoice — add 8th production confirmation (e6f842d7, Portuguese prompt, Montanha Lda / 869972401 / 7733+6106+1351 / 22950+10250+3150 / 25%+15%+0%, 6 calls 0 avoidable errors), 2nd production confirmation of comma-separated number=X,Y,Z product query, 1st production confirmation of optimal 6-call path (3 core + 3 bank-account repair)`

## Reusable Heuristics

1. **Comma-separated `number=X,Y,Z` is now doubly production-proven** for the exact-number existing-product invoice shape. Sierra SL (3 calls, no bank repair) and Montanha Lda (6 calls, with bank repair) both returned all 3 products in one call. This should be the default product resolver for all exact-number prompts.

2. **The optimal bank-account repair path is 6 calls total** (3 core + 3 repair). This cannot be reduced — the fresh-account bank-account validation can only be detected by attempting the first invoice write, and the trusted standard correctly prohibits speculative `GET /ledger/account` before that.

3. **Product `vatType.id` values are stable across fresh production accounts**: `3` (25%), `31` (15%), `6` (0%). Reusing them from the product read avoids the `/ledger/vatType` call every time.

4. **Portuguese prompts** use the same product/customer structure as Spanish, English, Norwegian, Nynorsk, and German prompts — no special handling needed.

5. **For the next agent on this exact task shape** (existing customer by org number, existing products by number, mixed VAT, create-only): read the trusted standard, then immediately write and execute the 3-call script with bank-account fallback. Do not read AGENTS.md or openapi.json — the trusted standard is sufficient.
