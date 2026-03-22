# Codex Reflection: prod-2026-03-22-052656254Z-be66ee30

## Task

Create order for customer Snøhetta AS (org.nr 800082021) with products Webdesign (2797) at 33100 kr and Analyserapport (5684) at 18550 kr. Convert order to invoice and register full payment. Norwegian prompt, standard order-invoice-payment shape.

## Reflection

**What went well:**
- Correctly identified exact trusted-standard match: `create-order-invoice-and-register-payment.md`
- Read the trusted standard before writing the script (as mandated)
- Used the correct `POST /invoice` path with embedded `orders[]` and `paymentTypeId` + `paidAmount` query params
- Used `vatType(*)` expansion on product lookup to compute exact paidAmount (33100×1.25 + 18550×1.25 = 64562.50)
- Used comma-separated `number=2797,5684` product lookup (OR semantics, single call)
- Used proactive bank-account hedge as recommended by the trusted standard
- Used `pts[0]` payment type selection (no `isIncoming` filter trap)
- All 5 API calls succeeded with 0 errors
- Invoice settled to amountOutstanding=0 on the single POST /invoice write

**What went poorly:**
- Nothing. This was a clean execution following the trusted standard exactly.

**No mistakes occurred.** The agent read the trusted standard, wrote the script with all documented pitfall mitigations (string product.number comparison, proactive bank hedge, exact paidAmount computation, no isIncoming filter), and executed in 5 calls with 0 errors.

## Call Efficiency

**Run was near-minimal.** 5 calls, 0 errors.

| Call # | Endpoint | Purpose | Necessary? |
|--------|----------|---------|------------|
| 1 | `GET /customer?organizationNumber=800082021&fields=*` | Resolve customer ID | Yes — inline `customer: { organizationNumber }` → 422 |
| 2 | `GET /product?number=2797,5684&fields=*,vatType(*)` | Resolve product IDs + VAT percentages | Yes — inline `product: { number }` → orphaned lines |
| 3 | `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` | Resolve payment type ID | Yes — omitting paymentTypeId → 422 |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | Proactive bank-account hedge | **Unnecessary in hindsight** — bank account 1920 was already configured |
| 5 | `POST /invoice?sendToCustomer=false&paymentTypeId=38807531&paidAmount=64562.5` | Create order + invoice + register payment atomically | Yes |

**Wasted calls:** 1 (the proactive bank-account hedge, call #4).

**Theoretical minimum:** 4 calls (skip call #4). Sandbox-verified 2026-03-22: 4-call path works cleanly when bank account is configured.

**Why 5 calls is still the recommended default:** The hedge costs 1 extra call when bank is OK (90% of runs) but saves 2 calls + 1 error when bank needs repair (10% of runs). Expected value: 5.1 calls / 0 errors (hedge) vs 4.3 calls / 0.1 errors (no hedge). Since scoring heavily penalizes 4xx errors, the hedge is the safer bet for scoring purposes.

**Lower-call path for next agent (same task shape):**
1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /product?number=<ref1>,<ref2>&fields=*,vatType(*)`
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
4. `GET /ledger/account?isBankAccount=true&fields=*` — conditionally `PUT` if `bankAccountNumber` missing
5. `POST /invoice?sendToCustomer=false&paymentTypeId=<id>&paidAmount=<exact total>` with embedded `orders[].orderLines`

This is the **5-call recommended path** (or 6 if bank needs repair). The 4-call path (skip step 4) is the absolute minimum but risks 7 calls + 1 error on fresh accounts without bank configuration.

## Root Causes

No issues to root-cause. The run was clean.

The only observation: the proactive bank-account hedge was unnecessary because bank account 1920 was already configured in this production environment. This is expected behavior — the hedge is a probabilistic optimization, not a guaranteed need.

## Sandbox Verification

Sandbox test confirmed the **4-call path** (no bank-account hedge) works cleanly:
- Used existing sandbox customer (Logging Probe AS) and products
- `POST /invoice?sendToCustomer=false&paymentTypeId=32813747&paidAmount=15000` → 201
- `amountOutstanding=0`, `amountCurrencyOutstanding=0`
- No bank-account issues in the persistent sandbox

This confirms that 4 calls is the theoretical floor and 5 calls (with hedge) is the safe default.

## Playbook Changes

**Updated existing files (no new files created):**

1. **`./trusted-standards/create-order-invoice-and-register-payment.md`** — Added production confirmation entry for Snøhetta AS (2026-03-22, 5 calls, 0 errors, 2nd POST /invoice confirmation)

2. **`./task-playbooks/create-order-invoice-and-register-payment.md`** — Added production run entry for Snøhetta AS with hedge analysis (bank OK, 5 calls, confirms hedge path as stable default)

3. **`./AGENTS.md`** — Updated create-order-invoice-and-register-payment gotcha to clarify 4-call vs 5-call path distinction and list both POST /invoice production confirmations (Floresta Lda + Snøhetta AS)

## Commit

- **Hash:** `38921c6c`
- **Message:** `tripletex playbook: create-order-invoice-and-register-payment — add prod-be66ee30 run entry (Norwegian prompt, Snøhetta AS / 800082021 / Webdesign 2797 + Analyserapport 5684 / 33100+18550 / 5 calls 0 errors, paidAmount=64562.50); 2nd POST /invoice production confirmation with proactive bank-account hedge (bank OK, no PUT needed); update AGENTS.md gotcha with both POST /invoice production confirmations (Floresta+Snøhetta)`

## Reusable Heuristics

1. **Proactive bank-account hedge is the correct default for this task shape.** The 1-call cost is worth the 0-error guarantee. The Floresta Lda run (11 calls due to missing recovery) proved the catastrophic downside of skipping it.

2. **Exact paidAmount computation is mandatory with POST /invoice.** Unlike the old `PUT /order/:invoice` path which accepted `paidAmount=0.01` + `paymentTypeIdRestAmount`, `POST /invoice` has no rest-amount parameter. Use `Σ(unitPrice × count × (1 + vatType.percentage / 100))` from the resolved products.

3. **product.number is always a string.** Use `String(p.number) == String(promptRef)` or loose equality. Strict `===` with integer silently fails.

4. **Payment type objects have no `isIncoming` field.** Just use `pts[0]`. Both "Kontant" and "Betalt til bank" work.

5. **comma-separated `number=X,Y` uses OR semantics.** This is the correct product lookup strategy. Do NOT use `number=X&number=Y` (repeated params) — that uses AND-like semantics and only returns the first value.

6. **Read the trusted standard before writing.** This run succeeded precisely because it followed the trusted standard verbatim. Multiple prior runs scored 0% from writing scripts from memory.

7. **The 5-call POST /invoice path is now doubly production-confirmed** (Floresta Lda 3-product, Snøhetta AS 2-product). No further sandbox verification needed for this exact task shape.
