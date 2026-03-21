# Score-Aware Reflection: prod-2026-03-21-204558586Z-ee909d4d

## 1. Task Attribution

- **Task ID**: 24 (T3, max score 6)
- **Task shape**: correct-ledger-errors — 4 error corrections (wrong account, duplicate, missing VAT, incorrect amount)
- **Prompt language**: Portuguese
- **Attempt number**: 11th attempt on this task
- **Error params**: 7140→7100 (2250), dup 7000 (4400), missing VAT 6500 (14100 excl), wrong amount 6590 (13150→11650)

## 2. Correctness Verdict

**Correctness: 0.75 (3/4 checks passed). NOT perfect.**

- Check 1: **passed** — wrong account reclassification (7140→7100, 2250, cross-vatType 12→0)
- Check 2: **passed** — duplicate reversal (7000, 4400, vatType 1)
- Check 3: **FAILED** — missing VAT correction on 6500/14100
- Check 4: **passed** — incorrect amount correction (6590, 13150→11650)

Normalized score: **2.25/6**. Best score unchanged at 2.25 (no improvement across 11 attempts).

## 3. Efficiency Verdict

Call count was optimal: **3 API calls, 0 HTTP errors**. The problem is purely correctness, not efficiency. Even with perfect correctness, 3 calls would be the proven minimum for this task shape.

## 4. Likely Root Cause

**Wrong voucher selected for the missing-VAT correction.**

The script found voucher 609144589 on account 6500 with `gross=14100, net=11280, has2710=true (existing2710=2820)`. This was a **correctly-booked** voucher (vatType=1, which auto-generated 2710=2820 = 14100×0.2). The script applied Case B (partial VAT shortfall): posted `2710 +705, 6500 +2820 (vatType=0), 2400 -3525`.

The actual erroneous voucher was a **different** entry on account 6500 with `gross=14100` and **no 2710 posting at all** (booked with vatType=0, no VAT calculated). The correct fix was Case A: `2710 +3525 (= 14100 × 0.25), counterpart -3525` — only 2 lines.

This is the same failure pattern as production runs 397faff2 (4th), 7fed6a02 (5th), and db732541 (7th). Task 24 has **never** passed Check 3 across all 11 attempts.

**Detection logic flaw**: The script iterated through vouchers and stopped at the first 6500/14100 match regardless of whether it had a 2710 posting. The correctly-booked voucher appeared first (earlier date), so it was selected. The actual error voucher (without 2710) was skipped.

## 5. What Went Right

- **3 API calls** — optimal call count, matching proven minimum
- **0 HTTP errors** — no wasted calls from 422s or retries
- **Cross-vatType reclassification** — 7140 (vatType 12) reversed correctly, 7100 posted with locked vatType 0; auto-generated 2710 -241.07 on reversal side only
- **Duplicate detection** — keyword cascade ("duplikat") found the duplicate on first try
- **Wrong-amount correction** — 6590 gross difference of 1500 with vatType 1, counterpart 1920
- **Counterpart extraction** — all counterpart account IDs and supplier IDs from voucher response nested expansion, no extra GET needed
- **Script robustness** — null checks, cascade fallbacks, no crashes

## 6. What To Change Next Time

### Critical fix: Missing-VAT detection priority

The detection loop must **prioritize no-2710 vouchers** (Case A) over vouchers with 2710 (Case B):

```typescript
// FIRST: look for vouchers on prompt account with matching amount AND no 2710 posting
const caseA = candidates.find(c => !c.has2710);
// SECOND: only if no Case A match, fall back to Case B
const caseB = candidates.find(c => c.has2710);
const selected = caseA || caseB;
```

When Case A is selected (no 2710 exists), the correction is simpler — only 2 lines:
```
2710 +net*0.25, counterpart -net*0.25
```

The playbook and trusted standard have been updated with this detection priority fix. The next run should be the first to pass all 4 checks on task 24.

### No other changes needed

- Call count (3) is already optimal
- vatType handling (cross-vatType reclassification, copying from originals) is correct
- Duplicate detection cascade is proven
- Counterpart/supplier extraction is correct
- `dateTo=2026-03-01` (exclusive) is correct
