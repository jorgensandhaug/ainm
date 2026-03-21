# Score-Aware Reflection: prod-2026-03-21-203059680Z-e6f842d7

## 1. Task Attribution

- **tx_task_id**: 09 (T2 task, max score = 4)
- **Prompt**: Create customer invoice for Montanha Lda (org. nr 869972401) with 3 product lines: Sessão de formação (7733) at 22950 NOK / 25% VAT, Licença de software (6106) at 10250 NOK / 15% VAT (food), Manutenção (1351) at 3150 NOK / 0% VAT (exempt)
- **Language**: Portuguese
- **Matched standard**: `create-customer-invoice` (exact match)

## 2. Correctness Verdict

**Perfect.** `correctness = 1.0`, `score_raw = 8/8`, `6/6 checks passed`, `all_checks_passed = true`.

All product lines, prices, descriptions, VAT types, and customer linkage were correct. The comma-separated `number=7733,6106,1351` product query resolved all three products with correct `vatType.id` values (3=25%, 31=15%, 6=0%).

## 3. Efficiency Verdict

**Not optimal.** `normalized_score = 2.5333` vs leaderboard `best_score = 4.0` for task 09.

- This run used **6 API calls** with **1 x 422 error** (bank-account validation).
- The leaderboard best of 4.0 almost certainly came from a run that didn't hit the bank-account validation (3 calls, 0 errors).
- Efficiency factor: `2.5333 / 4.0 = 0.633` — a ~37% penalty from the 3 extra bank-account repair calls plus the 422 error.

**API calls made (6 total):**

| # | Call | Status | Necessary? |
|---|------|--------|------------|
| 1 | `GET /customer?organizationNumber=869972401&fields=*` | 200 | Yes |
| 2 | `GET /product?number=7733,6106,1351&fields=*` | 200 | Yes |
| 3 | `POST /invoice?sendToCustomer=false` | 422 | Yes (unavoidable — can't know bank account is missing without trying) |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Yes (repair) |
| 5 | `PUT /ledger/account/{id}` | 200 | Yes (repair) |
| 6 | `POST /invoice?sendToCustomer=false` (retry) | 201 | Yes (repair) |

**Wasted calls: 0.** All 6 calls were necessary given the bank-account validation. The 3-call core path (calls 1-3) was the theoretical minimum. The 3 extra calls (4-6) were the documented repair branch.

## 4. Likely Root Cause

The score gap vs the leaderboard best is **entirely due to account-level variance**, not agent mistakes:

- **Bank-account validation**: Fresh production accounts sometimes lack a configured bank account number. When they do, the first `POST /invoice` returns 422 with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.` This adds 3 unavoidable calls (GET bank account + PUT repair + retry POST).
- **Previous best of 4.0**: Likely achieved by a run (e.g., Sierra SL / 909007135) where the fresh account already had a bank account number configured, so the 3-call fast path succeeded without repair.
- **No avoidable inefficiency**: The agent did not waste any calls on speculative product lookups, unnecessary `/ledger/vatType` reads, or post-create verification GETs. The comma-separated product query returned all 3 products in one call. The product `vatType.id` values were reused directly without a separate VAT lookup.
- **Pre-emptive bank-account GET would be worse on average**: Adding `GET /ledger/account` before the first invoice write would cost +1 call on every run (making the no-repair case 4 calls instead of 3), while saving only 1 call on the repair case (making it 5 instead of 6). Since the scoring heavily rewards the 3-call minimum, the on-failure repair approach is still the correct strategy.

## 5. What Went Right

1. **Comma-separated product query**: `GET /product?number=7733,6106,1351&fields=*` returned all 3 products in one call — second production confirmation of this approach.
2. **No unnecessary `/ledger/vatType`**: Products carried `vatType.id` values (3, 31, 6) and these were reused directly on the invoice lines.
3. **No unnecessary readback**: The write response totals (`amountExcludingVatCurrency=36350`, `amountCurrency=43625`) were trusted without a follow-up `GET /invoice/{id}`.
4. **Bank-account repair in-script**: The repair branch was handled inline without re-reading customer or products, and the same invoice payload was retried unchanged.
5. **Fast execution**: 95s total duration, well within the 300s budget.
6. **Perfect correctness**: 6/6 checks passed, all fields correct.

## 6. What To Change Next Time

**Nothing in the agent flow needs to change.** This was the optimal execution for the task shape with bank-account repair:

- The 3-call core path (`GET /customer` → `GET /product?number=X,Y,Z` → `POST /invoice`) is already the theoretical minimum.
- The bank-account repair branch is the documented correct response to the 422 validation error.
- Pre-emptive bank-account checks would hurt the average case.
- The score gap is account-level luck (whether the fresh account has a bank account configured), not agent behavior.

**For future scoring context**: Task 09 best_score of 4.0 represents the ceiling achievable only when the fresh account doesn't require bank-account repair. When bank-account repair is needed, `normalized_score ≈ 2.53` appears to be the realistic ceiling for this 6-call path. This variance is outside agent control.
