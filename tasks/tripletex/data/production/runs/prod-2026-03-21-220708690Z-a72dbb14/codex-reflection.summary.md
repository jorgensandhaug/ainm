# Reflection Summary — prod-2026-03-21-220708690Z-a72dbb14

## Task
Register receipt expense voucher for "Kundemøte lunsj" (14,050 NOK NET) in department "Drift" with correct expense account and VAT treatment. Spanish-language prompt. Branch A (non-deductible representation) — account 7360, VAT code 0.

## Reflection

**What went well:**
- Correctly identified Branch A (Kundemøte lunsj → 7360, non-deductible representation)
- Correctly detected NET pricing (14380 × 0.25 = 3595 = stated MVA) and computed GROSS = 14050 × 1.25 = 17562.50
- Used `sendToLedger=true`, correct department via `POST /department`, correct account via `GET /ledger/account`
- Attachment uploaded successfully
- Final voucher state correct: amount=17562.50, amountGross=17562.50, vatType=0, department=Drift

**What went poorly:**
- First `POST /ledger/voucher` returned 422 because postings omitted the `row` field. Tripletex defaults unset `row` to 0, which is reserved for system-generated postings → "Posteringene på rad 0 (guiRow 0) er systemgenererte"
- Required a retry with `row: 1` and `row: 2` added, wasting 1 API call

## Call Efficiency

**Not minimal-call.** Used 5 calls instead of optimal 4.

| # | Call | Status | Needed? |
|---|------|--------|---------|
| 1 | `POST /department` (create Drift) | 201 | Yes |
| 2 | `GET /ledger/account?number=7360,1920&fields=*` | 200 | Yes |
| 3 | `POST /ledger/voucher?sendToLedger=true` (no `row`) | 422 | **Wasted** |
| 4 | `POST /ledger/voucher?sendToLedger=true` (with `row`) | 201 | Yes |
| 5 | `POST /ledger/voucher/{id}/attachment` | 201 | Yes |

**Optimal 4-call path:**
1. `POST /department` → create "Drift"
2. `GET /ledger/account?number=7360,1920&fields=*` → resolve account IDs
3. `POST /ledger/voucher?sendToLedger=true` with `row: 1` on expense posting, `row: 2` on balancing posting
4. `POST /ledger/voucher/{id}/attachment` → upload receipt PDF

## Root Causes

1. **Missing `row` field documentation in trusted standard**: The trusted standard's "Common rules" and "Payload Rules" sections did not mention the mandatory `row` field. The playbook's example payloads had it, but the agent followed the trusted standard (higher priority) without cross-referencing the playbook's payload examples.
2. **Tripletex API behavior**: When `row` is omitted, it defaults to 0 (system-reserved), causing 422. This was already documented in `common-endpoints.md` (line 765) and `create-free-accounting-dimension-and-book-voucher.md`, but not in the receipt-expense-voucher trusted standard.

## Sandbox Verification

- Confirmed without `row` → 422 "Posteringene på rad 0 (guiRow 0) er systemgenererte" (sandbox, account 424191174)
- Confirmed with `row: 1, row: 2` → 201 success (sandbox voucher 609179076, date 2026-12-15)
- No lower-call path exists: 4 calls is the floor (POST dept + GET accounts + POST voucher + POST attachment)

## Playbook Changes

**Updated existing files** (changes already committed via automation into `e52d74a6`):

1. `trusted-standards/register-receipt-expense-voucher.md`:
   - Added `row` field requirement as first item in "Common rules (all branches)" section
   - Text: "CRITICAL: every posting MUST include an explicit `row` field — expense posting `row: 1`, balancing posting `row: 2`"

2. `task-playbooks/register-receipt-expense-voucher.md`:
   - Added `row` field requirement as first item in "Validation Traps" section
   - Added Branch A production proof for run a72dbb14 (Spanish prompt, Kundemøte lunsj, 5 calls 1 avoidable 422)

No AGENTS.md changes needed — no new task shapes or trusted standards created.

## Commit

Changes committed via user automation in `e52d74a6`:
```
tripletex playbook: create-order-invoice-and-register-payment — ...
```
(Bundled with concurrent reflection session changes.)

Files changed:
- `trusted-standards/register-receipt-expense-voucher.md`
- `task-playbooks/register-receipt-expense-voucher.md`

## Reusable Heuristics

1. **Always include `row: 1, 2, ...` on voucher postings.** Row 0 is system-reserved. This applies to ALL `POST /ledger/voucher` calls, not just receipt-expense vouchers.
2. **Cross-reference playbook example payloads even when following trusted standard.** The trusted standard's prose may omit fields that the playbook's JSON examples include.
3. **The `row` requirement is universal for Tripletex voucher postings** — already documented in `common-endpoints.md` line 765 and `create-free-accounting-dimension-and-book-voucher.md`. Now also in the receipt-expense-voucher standard.
4. **Branch A (representation) optimal path is 4 calls** — POST dept + GET accounts + POST voucher + POST attachment. No vatType resolution needed (7360 is vatLocked=true, code 0).
5. **NET→GROSS conversion confirmed correct**: 14050 × 1.25 = 17562.50 for Branch A. All four amount fields (amount, amountCurrency, amountGross, amountGrossCurrency) use the same GROSS value for non-deductible representation.
