# Codex Reflection Summary

## Task

Set a fixed price of 313650 NOK on project "Migração para nuvem" for Estrela Lda (org. nr 922471126). Project manager: Leonor Sousa (leonor.sousa@example.org). Invoice 50% of the fixed price (156825 NOK) as a milestone payment, unsent.

This is the **2nd production run** for this exact same task prompt. The 1st run (also on 2026-03-21) encountered a configured bank account and completed in 6 calls. This run encountered a missing bank account.

## Reflection

**What went well:**
- Correctly identified the exact trusted standard match (`set-project-fixed-price-and-invoice-partial-payment.md`)
- Followed the update-needed proactive-hedge branch exactly as documented
- The proactive hedge correctly discovered the empty `bankAccountNumber` on account 1920 and fixed it before the invoice write, avoiding a 422 error
- All 7 calls were necessary given the state; 0 errors
- The initial expanded `GET /project` proved customer and manager in one call, avoiding separate `GET /customer` and `GET /employee` calls

**What went poorly:**
- Nothing. The run was optimal for the state encountered.

## Call Efficiency

**The run was minimal-call.** 7 calls, 0 errors. Normalized score: 3.0/4.0 (gap vs leaderboard best 3.333 is from environmental variance — bank was missing this time).

| # | Call | Purpose | Necessary? |
|---|------|---------|------------|
| 1 | `GET /project?name=...&fields=*,customer(*),projectManager(*)` | Find project, prove customer + manager | Yes |
| 2 | `PUT /project/{id}` | Set `fixedprice=313650`, `isFixedPrice=true` | Yes (was `fixedprice=0`) |
| 3 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | Resolve VAT type | Yes |
| 4 | `POST /order` | Create order with milestone line (156825 NOK) | Yes |
| 5 | `GET /ledger/account?isBankAccount=true&fields=*` | Proactive bank-account check | Yes (bank was missing) |
| 6 | `PUT /ledger/account/{id}` | Fix empty `bankAccountNumber` on account 1920 | Yes |
| 7 | `PUT /order/{id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false` | Create invoice | Yes |

**Wasted calls:** 0

**Lower-call path for next agent (same state):** None — 7 is the minimum for update-needed + missing-bank. Without proactive hedge, the optimistic path would cost 8 calls + 1 error (422).

**Canonical call counts for this task family:**
- Skip-PUT branch (project already at target state): **4 calls**
- Update-needed + configured bank: **6 calls**
- Update-needed + missing bank: **7 calls**

## Root Causes

No mistakes to diagnose. The run correctly followed the trusted standard's proactive-hedge default for the update-needed branch.

## Sandbox Verification

Persistent sandbox re-confirmed both branches with `313650 * 0.50 = 156825`:
- **Update-needed proactive hedge:** 6 measured calls (sandbox bank was already configured from prior proofs)
- **Skip-PUT branch:** 4 measured calls
- Both returned `amountExcludingVatCurrency=156825`
- Sandbox exposed only outgoing VAT `0%` (id=6); production exposed `25%` (id=3) — both are handled correctly by the "prefer 25%, fall back to 0%" logic

No lower-call path was found. The conditional `4/6/7`-call standard remains the proven minimum.

## Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md`**
  - Added 6th update-needed production confirmation (Estrela Lda 2nd run, missing bank, 7 calls, 0 errors)
  - Updated bank-account missing rate from 3/5 (60%) to 4/6 (67%)
  - Added sandbox re-verification for both branches with current-task arithmetic
  - Noted that the same task ran twice on different fresh accounts with different bank states, confirming bank-account state varies per fresh account

- **`./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`**
  - Added 6th production confirmation entry with same data
  - Updated all statistics references from 3/5 (60%) to 4/6 (67%)
  - Updated Avoidable Mistakes section with 4th missing-bank-account example

## Commit

- **Hash:** `ba9092d6`
- **Message:** `tripletex playbook: set-project-fixed-price — add 6th production confirmation (d64d5813, Estrela Lda 2nd run, 922471126, 7 calls 0 errors, bank missing, proactive hedge optimal)`

## Reusable Heuristics

1. **Proactive hedge is the clear default for the update-needed branch.** 4/6 production runs (67%) had missing bank accounts. The proactive `GET /ledger/account` between `POST /order` and `PUT /order/:invoice` costs 1 call when configured but saves 2 calls + 1 error when missing.

2. **Bank-account state is unpredictable.** The same task prompt (`Estrela Lda` / `922471126`) ran twice: first with bank configured (6 calls), then with bank missing (7 calls). Never assume bank state from the task prompt alone.

3. **Skip-PUT branch stays optimistic.** No production run on the skip-PUT branch has ever hit the bank-account issue. Only add the hedge when `PUT /project` was actually performed.

4. **One decisive `GET /project` with expanded fields replaces three separate lookups.** `fields=*,customer(*),projectManager(*)` proves customer org number and manager email in one call, saving separate `GET /customer` and `GET /employee` calls when both are already linked.

5. **Milestone arithmetic is straightforward.** `313650 * 0.50 = 156825` — exact integer, no rounding needed. Verify against `amountExcludingVatCurrency` (not `amountCurrencyOutstanding`, which includes VAT on taxable accounts).
