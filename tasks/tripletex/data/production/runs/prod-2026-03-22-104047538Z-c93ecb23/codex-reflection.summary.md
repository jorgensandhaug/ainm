# Codex Reflection Summary — prod-2026-03-22-104047538Z-c93ecb23

## 1. Task

Create an order for customer Oakwood Ltd (org no. 932937204) with products Data Advisory (3346) at 16000 NOK and Network Service (7273) at 22050 NOK. Convert the order to an invoice and register full payment.

**Task shape**: create-order-invoice-and-register-payment (exact trusted-standard match)

## 2. Reflection

**What went well:**
- Agent correctly identified the exact trusted-standard match and read it before writing the script
- Script was written correctly on the first attempt — no wasted calls, no script restarts
- All 4 free GETs parallelized (customer + products + paymentType + bank account hedge)
- Product lookup used comma-separated `number=3346,7273&fields=*,vatType(*)` — both found in 1 call
- paidAmount computed exactly from product VAT percentages: 16000×1.25 + 22050×1.25 = 47562.50
- Bank account proactive hedge found bank already configured — no PUT needed
- POST /invoice with embedded orders + paymentTypeId + paidAmount created order + invoice + payment in 1 write
- Readback confirmed: correct products linked, correct amounts, amountOutstanding=0

**What went poorly:**
- Nothing. The run was optimal.

**Mistakes:**
- None.

## 3. Call Efficiency

**Verdict: OPTIMAL — minimal call path achieved**

| # | Call | Type | Purpose |
|---|------|------|---------|
| 1 | `GET /customer?organizationNumber=932937204&fields=*` | Free | Resolve customer ID |
| 2 | `GET /product?number=3346,7273&fields=*,vatType(*)` | Free | Resolve product IDs + VAT % |
| 3 | `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` | Free | Resolve payment type ID |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | Free | Proactive bank hedge |
| 5 | `POST /invoice?sendToCustomer=false&paymentTypeId=39711630&paidAmount=47562.5` | **1 write** | Create order + invoice + register payment |
| 6 | `GET /invoice/2147695562?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))` | Free | Readback verification |

**Total: 6 calls, 1 write, 0 errors.**

No wasted calls. All GETs are free and necessary. The single POST is the minimum possible write. No lower-call path exists for this task shape.

## 4. Root Causes

No issues to diagnose — the run followed the trusted standard exactly and achieved the optimal outcome.

## 5. Sandbox Verification

Verified one potential optimization hypothesis:
- **Hardcoded vatType on order lines**: `POST /invoice` with `vatType: { id: 3 }` (25%) hardcoded on order lines succeeded in sandbox. However, `GET /product` is still needed to resolve product IDs, and `vatType(*)` is included in the same call at zero cost. No call savings possible.
- **paymentTypeId variability confirmed**: sandbox IDs (32813747/32813748) differ from production (39711630), confirming paymentTypeId cannot be hardcoded across environments.

## 6. Playbook Changes

Updated existing files (no new files created):
- `./trusted-standards/create-order-invoice-and-register-payment.md` — added 3rd POST /invoice production confirmation (Oakwood Ltd, 1 write, 0 errors)
- `./task-playbooks/create-order-invoice-and-register-payment.md` — added same production confirmation entry

No AGENTS.md changes needed — the task shape, flow, and table entries are already correct.

## 7. Commit

- **Hash**: `943d99a4`
- **Message**: `tripletex playbook: order-invoice-payment — 3rd POST /invoice confirmation (Oakwood Ltd, 1 write 0 errors)`

## 8. Reusable Heuristics

1. **The POST /invoice path is fully stable for this task shape** — 3 consecutive production confirmations (Floresta, Snøhetta, Oakwood) across Portuguese, Norwegian, and English prompts with 0 errors when proactive hedge is used.
2. **Proactive bank-account hedge is zero-risk** — when bank account exists, it costs 1 free GET. When it doesn't, it prevents a 422 + retry (saves 1 write + 1 error). Always include it.
3. **All 4 initial GETs should be parallelized** — customer, products, paymentType, and bank account can all run in parallel before the single POST.
4. **Comma-separated `number=X,Y` on GET /product uses OR semantics** — always returns all matching products in 1 call. No need for `count=1000` fallback unless some products are missing.
5. **`vatType(*)` expansion on GET /product is free data** — provides VAT percentage needed for paidAmount computation at no extra call cost.
6. **paymentTypeId is always account-specific** — never hardcode it. The GET /invoice/paymentType call cannot be eliminated.
7. **Use `pts[0]` for payment type selection** — do NOT filter by `isIncoming` (field doesn't exist). Both "Kontant" and "Betalt til bank" work.
8. **paidAmount must be exact** — compute as `Σ(unitPrice × count × (1 + vatPct/100))`. No `paidAmount=0.01` trick on POST /invoice (no `paymentTypeIdRestAmount` param).
9. **Always include readback GET** — free call that confirms full state for scoring transparency.
10. **Always include inline bank-account recovery in the script** — even with proactive hedge, defense in depth prevents the catastrophic script-restart waste seen in earlier runs (11 calls instead of 6).
