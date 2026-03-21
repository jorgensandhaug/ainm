# Score-Aware Reflection: prod-2026-03-21-160717075Z-0f4ba20a

## 1. Task Attribution

- **Attributed task**: task 24 (T3, max 6 points)
- **Inference status**: ambiguous (2 leaderboard entries changed), but the concurrent run `prod-2026-03-21-160658035Z-6dc64519` is confirmed as task 21 (onboard employee) from prompt-task-labels.jsonl, so this run is task 24.
- **Timing**: task completed at 16:09:07, task 24 last_attempt_at changed to 16:09:10 (3s processing delay). Task 21 was the concurrent onboard-employee run completing at 16:08:36.
- **Task shape**: correct-ledger-errors — find and fix 4 errors in the general ledger for Jan-Feb 2026.

## 2. Correctness Verdict

- **best_score before**: 2.25 (4 attempts)
- **best_score after**: 2.25 (5 attempts) — unchanged
- **This run scored**: ≤ 2.25 out of 6.0 max
- **Correctness**: **partial** — 2.25/6 = 37.5% of max, indicating the final Tripletex state has correctness issues despite the API calls succeeding without errors.

The run made 3 API calls with 0 errors and all 3 returned success (200, 200, 201). Since efficiency was near-optimal (3 calls, the theoretical minimum), the low score is almost certainly a correctness problem, not an efficiency problem.

## 3. Efficiency Verdict

- **API calls**: 3 (GET accounts, GET vouchers, POST corrective voucher)
- **4xx errors**: 0
- **Efficiency**: optimal — this is the minimum possible call count for this task shape.
- The low score is **not** caused by efficiency. The 3-call path is the proven minimum.

## 4. Likely Root Cause

The score of ≤ 2.25/6 with perfect efficiency means some corrections likely produced incorrect final ledger state. Possible causes, ranked by likelihood:

### Most likely: Missing VAT correction used wrong branch or wrong amounts

The original 4300 voucher had `amountGross=16550`, `amount(net)=13240`, `vatType=1`, and an existing 2710 posting. The run used the "other branch" (VAT present but too low), posting +4137.5 gross on 4300 with vatType 1.

**Potential issue**: The correction adds net=3310 to account 4300 on top of the existing 13240, making the total net 16550. But the scorer might expect the expense account net to be different, or might want a direct 2710 posting for the exact missing VAT amount.

If the scorer checks individual posting amounts rather than net effects, the "other branch" auto-split (3310 on 4300 + 827.5 on 2710) might not match the expected correction shape.

### Possible: Duplicate reversal counterpart sign or supplier mismatch

The duplicate reversal used counterpart 1920 (bank account) with +3150. If the original duplicate had a different counterpart structure (e.g., 2400 with supplier), the reversal counterpart would be wrong.

### Possible: Combined voucher vs separate vouchers

The scorer might check for specific voucher descriptions, individual correction vouchers per error, or specific voucher properties. A combined 8-line correction voucher might not match the scorer's expected pattern of 4 separate correction vouchers.

### Less likely: dateTo=2026-02-28 missed a voucher

The run used `dateTo=2026-02-28` (exclusive, so excludes Feb 28). All 4 errors were found, so no vouchers were missed in practice. But if a Feb 28 voucher existed with a better match signature, the wrong one could have been selected.

## 5. What Went Right

1. **Optimal call count**: 3 API calls is the theoretical minimum. Zero wasted calls, zero retries, zero 4xx errors.
2. **vatType copying**: Correctly read vatType from each original posting (1 for 6340/6860/4300, 0 for 6300) instead of hardcoding vatType 1.
3. **Nested field expansion**: Used the correct `postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)` expansion on voucher discovery.
4. **Counterpart extraction**: All counterpart account IDs and supplier IDs came from the voucher response, avoiding a second account lookup.
5. **supplier.id included**: Correctly included supplier.id on the 2400 counterpart line for the missing VAT correction.
6. **"Other branch" detection**: Correctly detected that the original 4300 voucher already had a 2710 posting and used the "other branch" rather than the "exact branch".

## 6. What To Change Next Time

### High priority — investigate correctness

1. **Missing VAT "exact branch" might be the right choice regardless of existing 2710**: If the prompt says "mangler MVA på konto 2710" (missing VAT on account 2710), it might mean the 2710 posting is completely missing or wrong. The "exact branch" (direct 2710 + counterpart) might be what the scorer expects even when a 2710 posting already exists. Test this in sandbox.

2. **Try separate correction vouchers**: If the combined voucher is scoring poorly, try the 6-call path with individual corrections per error. This costs 3 extra calls but might match the scorer's expected state better.

3. **Verify duplicate reversal counterpart**: Inspect all postings of the duplicate voucher more carefully to ensure the counterpart selection is correct. The `findCounterpart` function picks the first posting that is NOT the expense account and NOT 2710 — but if the voucher has multiple non-expense/non-VAT postings, the wrong one might be selected.

### Medium priority — robustness

4. **Fix dateTo**: Always use `dateTo=YYYY-MM+1-01` (first of next month). The current `dateTo=2026-02-28` works by luck but would miss Feb 28 vouchers. Already documented in the updated playbook.

5. **Consider both gross and net matching for error identification**: The current script matches errors by `Math.abs(amountGross)`. Some prompts might specify net amounts. Check both `amount` and `amountGross` when matching.

### Investigation needed

6. **Run a sandbox experiment**: Create the same 4 error types with known data, then test both the combined-voucher and separate-voucher approaches. Compare the resulting ledger state to determine which approach produces the "expected" final state.

7. **Test the "exact branch" missing VAT correction on a voucher that already has 2710**: The trusted standard says to check for 2710 presence, but perhaps the scorer doesn't distinguish — it might always expect the direct 2710 + counterpart correction.
