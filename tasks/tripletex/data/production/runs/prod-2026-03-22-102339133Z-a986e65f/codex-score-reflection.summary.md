# Score Reflection — prod-2026-03-22-102339133Z-a986e65f

## 1. Task Attribution

- **Task ID**: 23 (Reconcile bank statement with open invoices)
- **Task tier**: T3 (max 6 points)
- **Language**: Spanish
- **CSV**: 10 lines — 5 customer payments (1 partial), 3 supplier payments, 2 Skattetrekk (incoming)
- **All lines in single month**: January 2026

## 2. Correctness Verdict

**PERFECT CORRECTNESS — 7/7 raw, 5/5 checks passed.**

| Metric | Value |
|--------|-------|
| score_raw | 7 |
| score_max | 7 |
| normalized_score | 1.2667 |
| checks passed | 5/5 |
| feedback | "5/5 checks passed." |
| mutating calls | 20 |
| GET calls | 28 (free) |
| errors | 0 |
| duration_ms | 241195 |

This is the **FIRST production run to pass all checks** for Task 23. Previous best was 0.6/6 (2/10, Check 2 only). This run achieved 1.2667/6 — a **2.1× improvement**.

Note: The submission score was not captured by the initial poller (status stayed "processing"), but was confirmed completed in submissions-history.jsonl at 10:31:35Z with full results.

## 3. Efficiency Verdict

**Correctness is perfect but efficiency is low.** Normalized score 1.2667 on a max of 6 suggests a significant efficiency penalty.

**Call breakdown (20 mutating):**
| Step | Calls | Description |
|------|-------|-------------|
| Step 0 | 1 | POST opening balance voucher (DR 1920 / CR 2050) |
| Step 3 | 5 | PUT /invoice/:payment (5 customer payments, parallel) |
| Step 4+5 | 1 | POST combined voucher (3 supplier + 2 Skattetrekk = 10 postings) |
| Step 6 | 1 | POST /bank/statement/import (SBANKEN_BEDRIFT_CSV) |
| Step 7a | 1 | POST /bank/reconciliation (create, single period) |
| Step 7b | 10 | POST /bank/reconciliation/match (1 per CSV line, parallel) |
| Step 8 | 1 | PUT /bank/reconciliation/:id (close with correct balance) |
| **Total** | **20** | |

**The 10 individual match calls are the primary efficiency drain.** They account for 50% of all mutating calls. If batch matching works (untested — sandbox was locked), this could drop to 11 mutating calls.

**Secondary optimization**: Combining OB voucher with the supplier/non-invoice voucher into a single POST would save 1 more call (→ 10 total). This was attempted in sandbox but couldn't be verified because all periods had closed reconciliations blocking voucher creation on account 1920.

**Theoretical minimum mutating calls**: 10 (1 combined voucher + 5 customer payments + 1 bank import + 1 create recon + 1 batch match + 1 close recon).

## 4. Likely Root Cause

**Efficiency penalty from 20 mutating calls.** With perfect correctness (7/7), the normalized_score of 1.2667/6 = 21.1% suggests the efficiency formula heavily penalizes high call counts. The pre-built script executes the full 9-step flow correctly but uses 10 individual match calls where a batch approach might suffice.

No correctness issues exist — all 5 checks passed:
- Check 1–5: all passed (exact check descriptions unavailable, but Check 1 was historically the bank reconciliation check that failed in all prior runs)

**Prior run comparison:**
- All 15 prior runs scored 0.6/6 (Check 2 only, no bank reconciliation)
- This run: 1.2667/6 (all 5 checks, full bank reconciliation flow)
- The full 9-step flow (Steps 0+6+7+8) was the critical differentiator

## 5. What Went Right

1. **Pre-built script approach**: Copying and running `scripts/reconcile-bank-statement.ts` eliminated the LLM generation bottleneck. Total wall-clock time ~30s for API execution, well within 300s budget.
2. **Full 9-step flow worked**: Opening balance (Step 0) + bank import (Step 6) + per-period matching (Step 7) + recon close (Step 8) = first time all checks passed.
3. **Zero errors**: Clean execution with no 4xx errors. All amount matching, sign handling, and date grouping was correct.
4. **Correct partial payment handling**: Invoice #1 (González SL) had outstanding 6375, CSV showed 2550 payment → correctly registered as partial.
5. **Single-period optimization**: CSV was entirely in January 2026, so only 1 reconciliation was needed (vs. the multi-period path for cross-month CSVs).
6. **Correct Skattetrekk direction**: Both Skattetrekk lines were incoming (Inn column), correctly booked as DR 1920 / CR 2600.

## 6. What To Change Next Time

### Priority 1: Reduce match calls (10 → 1)
Investigate batch matching: `POST /bank/reconciliation/match` accepts `transactions[]` and `postings[]` as arrays. If all 10 txn/posting pairs can be sent in a single call (net amounts sum to zero), this drops 9 mutating calls. **Untested** — sandbox was blocked by existing closed reconciliations. This is the single highest-impact optimization.

### Priority 2: Combine OB + supplier voucher (2 → 1)
Merge the opening balance postings (DR 1920 / CR 2050) into the combined supplier/non-invoice voucher. Both are `POST /ledger/voucher`. The OB date may differ from the earliest supplier date, but individual posting dates are preserved per-posting. Saves 1 call.

### Priority 3: Verify batch match in a clean sandbox
Before updating the pre-built script, verify batch matching works in a sandbox without existing closed reconciliations. Create a fresh test period, post a voucher with 3+ postings on 1920, import a bank statement, then try `POST /bank/reconciliation/match` with all txns and postings in one call.

### Do NOT change
- The 9-step flow structure is correct and proven
- SBANKEN_BEDRIFT_CSV format with Norwegian chars is correct
- Per-period reconciliation grouping is correct (needed for cross-month CSVs)
- Positional txn ID mapping from import response is correct
- Using creation version for recon close is correct (version doesn't change after matches)
- The pre-built script approach (copy + run) is the right execution strategy
