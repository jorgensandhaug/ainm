# Score-Aware Reflection: prod-2026-03-21-204843788Z-3d464771

## 1. Task Attribution

- **tx_task_id**: 24
- **Task tier**: T3 (tasks 19-30, max score 6)
- **Task type**: correct-ledger-errors
- **Prompt language**: German
- **Attempt**: 12th on this task (total_attempts: 11 → 12)
- **Error shape**: wrong account 6340→6390 (3050), duplicate 6860 (1650), missing VAT 4500 (22900 excl-VAT), wrong amount 6860 (24450→10850)

## 2. Correctness Verdict

- **Score**: 2.25/6 (normalized_score)
- **Correctness**: 0.75 (score_raw 7.5/10)
- **Checks**: 3/4 passed — Check 1 passed, Check 2 passed, **Check 3 failed**, Check 4 passed
- **Verdict**: **NOT CORRECT** — the missing-VAT correction (Check 3) was wrong

The best_score for task 24 remains stuck at 2.25 across all 12 attempts. Check 3 (missing VAT) has **never** passed on this task.

## 3. Efficiency Verdict

- **API calls**: 3 (the proven minimum — GET accounts, GET vouchers, POST correction)
- **HTTP errors**: 0
- **Duration**: 171.7s
- **Efficiency assessment**: **Optimal call count** — the run achieved the theoretical minimum of 3 calls with 0 errors. Efficiency is irrelevant because correctness was not perfect; no efficiency bonus applies at correctness < 1.0.

No calls were wasted. The problem is purely a correctness issue with Check 3.

## 4. Likely Root Cause

**Same root cause as ALL prior runs on task 24**: the missing-VAT voucher detection picked the wrong voucher.

The script searched for vouchers on account 4500 with `|amountGross| === 22900` and found:
- **1 candidate** with `has2710: true` (existing2710=4580, vatType=1 on the 4500 posting)
- **0 candidates** without 2710

Since no Case A candidate (no-2710 voucher) was found, the script fell through to Case B and applied a 3-line correction:
- `2710 +1145` (vat shortfall = 5725 - 4580)
- `4500 +4580` (expense net shortfall, vatType=0)
- `2400 -5725` (with supplier)

**Why this is wrong**: The playbook and trusted standard updates from the parallel 8th run (ee909d4d) conclusively proved that the missing-VAT error is ALWAYS Case A (no 2710 posting at all). In every production run where this was investigated, there were TWO vouchers on the prompt account with the same gross — one correctly booked (WITH 2710) and one error (WITHOUT 2710). The script consistently found only the one WITH 2710.

**Why the Case A voucher was missed**: The most likely explanation is that the error voucher (without 2710) was present in the API response but the detection logic failed to match it. Possible causes:
1. The error voucher's `amountGross` is not exactly 22900 (e.g., it could be 22900.0 vs integer comparison issues, though JavaScript handles this)
2. The error voucher's posting on 4500 uses `amountGross` with a different sign than expected (the script uses `Math.abs`)
3. There is a subtle data shape difference that the `p.account?.number === 4500` check doesn't catch (e.g., the posting uses a sub-account or different field)
4. The voucher query returned paginated results and the error voucher was outside the returned set (unlikely — only 30 vouchers found, well under count=1000)

**Critical gap**: The script does NOT log all vouchers on account 4500 regardless of amount. If it did, we could see whether the Case A voucher exists with a different amountGross. The next agent MUST add diagnostic logging of ALL postings on the missing-VAT account before filtering by amount.

## 5. What Went Right

1. **Optimal API efficiency**: 3 calls, 0 errors — the absolute minimum proven path
2. **Checks 1, 2, 4 all passed**: wrong-account reclassification (6340→6390, vatType 1), duplicate reversal (6860/1650, vatType 1), and wrong-amount correction (6860/24450→10850, vatType 1) were all correct
3. **Correct vatType handling**: all vatTypes were correctly copied from original postings; the reclassification correctly used the same vatType (1) on both accounts since 6340 and 6390 share the same default
4. **Correct supplier handling**: the missing-VAT counterpart on 2400 correctly included supplier.id
5. **Fast execution**: completed in 171.7s, well within the 300s budget
6. **No-2710-first detection priority was implemented**: the script correctly tried Case A first before falling back to Case B — the issue was that no Case A candidate was found, not that the priority was wrong

## 6. What To Change Next Time

### Immediate fix: broaden missing-VAT detection

The detection must not rely solely on `amountGross === promptExclVatAmount` to find the error voucher. The next agent should:

1. **Log ALL postings on the prompt account** (e.g., all 4500 postings regardless of amount) before filtering by amount — this reveals whether the Case A voucher exists with a different gross
2. **Search by account only, then filter by amount patterns**: collect all vouchers with any posting on the prompt account, then check which ones lack 2710
3. **Consider that amountGross for the error voucher might differ**: if the error voucher was booked with gross = net * 1.25 = 28625 but WITHOUT the 2710 line (the gross is correct but the VAT posting is missing), then amountGross=28625 ≠ 22900 and the current matching misses it entirely
4. **Add a broader fallback**: if no exact-amount Case A candidate is found, search for ANY voucher on the prompt account WITHOUT 2710 — there should be at most one such voucher in the error set

### Detection cascade revision

```
1. FIRST: account match + amountGross = promptExclVat + no 2710 → Case A (current)
2. NEW SECOND: account match + ANY amountGross + no 2710 → Case A (broader)
3. THIRD: account match + amountGross = promptExclVat + has 2710 → Case B (current fallback)
```

### Playbook/trusted standard update needed

The trusted standard's detection guidance needs to add the broader fallback at step 2 above. The current guidance says to match `amountGross` = prompt excl-VAT amount, but this has never successfully found a Case A voucher in 12 production attempts on task 24. Something about the amountGross matching is wrong for the actual test data.

### Key open question

Until we see the actual voucher data (all 4500 postings with their amounts), we cannot confirm whether the Case A voucher has a different amountGross or is entirely absent. The next run MUST include diagnostic logging to answer this question definitively.
