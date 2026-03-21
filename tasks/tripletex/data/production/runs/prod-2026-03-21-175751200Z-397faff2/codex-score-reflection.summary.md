# Score-Aware Reflection — Run 397faff2

## 1. Task Attribution

- **tx_task_id**: 24
- **Task tier**: T3 (tasks 19–30), max score 6
- **Task shape**: correct-ledger-errors (4 errors: wrong account, duplicate, missing VAT, incorrect amount)
- **Leaderboard before**: best_score 2.25 (6 attempts)
- **Leaderboard after**: best_score 2.25 (7 attempts) — this run tied but did not improve

## 2. Correctness Verdict

**Not perfect.** correctness = 0.75 (3/4 checks passed).

| Check | Result | Error type |
|-------|--------|------------|
| Check 1 | passed | Wrong account (6500→6540, 7350) |
| Check 2 | passed | Duplicate reversal (7100, 3200) |
| Check 3 | **failed** | Missing VAT (6540, 11450 excl, 2710) |
| Check 4 | passed | Incorrect amount (6300, 8200→5800) |

- score_raw: 7.5 / 10
- normalized_score: 2.25 / 6

## 3. Efficiency Verdict

The run used exactly 3 API calls and 0 errors — the theoretical minimum. Efficiency was perfect. The issue is purely correctness on Check 3, not efficiency.

## 4. Likely Root Cause

**The script matched the WRONG voucher for the missing-VAT error.**

The prompt says: "a missing VAT line (account 6540, amount excl. 11450 NOK missing VAT on account 2710)". The phrase "missing VAT line" strongly implies the 2710 posting is **entirely absent** (Case A), not just too low (Case B).

The script's detection logic searched for any 6540 posting where `amountGross === 11450` or `amount === 11450`, and took the **first match**. It found a voucher with:
- 6540: amountGross=11450, amount(net)=9160, vatType=1
- 2710: 2290 (auto-generated from vatType=1 on gross 11450)
- Counterpart: 2400 -11450

This voucher HAD a 2710 line, so the script classified it as Case B and posted:
- 2710 +572.50 (vat shortfall)
- 6540 +2290 (expense net shortfall, vatType=0)
- 2400 -2862.50 (with supplier)

**But the actual erroneous voucher was almost certainly a DIFFERENT voucher**: one where 6540 was booked with gross=11450 and vatType=0 (no VAT at all), meaning no 2710 line exists. That voucher needed Case A:
- 2710 +2862.50
- Counterpart -2862.50

The script has a broader search (step 3) that looks for 6540 vouchers with no 2710 line, but this code never ran because the first search already found a match (the wrong voucher with 2710).

**Key insight**: The detection priority was inverted. For "missing VAT line" errors, the script should:
1. **FIRST** look for vouchers matching account+amount that have NO 2710 line (Case A)
2. **THEN** fall back to vouchers with existing but too-low 2710 (Case B)

The prior reflection incorrectly declared this run as "the first run to correctly use Case B direct-2710 posting in production and achieve 3 calls with 0 errors on all 4 correction types." The 0 errors (no 4xx) was true, but Check 3 failed because Case B was applied to the wrong voucher.

**This is the same Check 3 failure as run 0607a659** — but for a different reason. Run 0607a659 used the wrong correction method (expense+vatType=1 instead of direct 2710). This run used the right correction method (direct 2710) but on the wrong voucher.

## 5. What Went Right

1. **3 API calls, 0 errors** — efficiency was optimal
2. **Checks 1, 2, 4 all passed** — wrong account reclassification, duplicate reversal, and incorrect amount were all correctly identified and corrected
3. **vatType handling** — correctly copied from originals (vatType=1 for reclassification, vatType=0 for dup/wrong-amount)
4. **Supplier ID** — correctly included on 2400 counterpart
5. **dateTo=2026-03-01** — correctly used exclusive date boundary
6. **Duplicate detection** — description keyword cascade worked perfectly
7. **Case B math was correct** — the correction arithmetic was sound, it was just applied to the wrong voucher
8. **Fast execution** — completed in ~168s with clean single-pass execution

## 6. What To Change Next Time

### Critical fix: Missing-VAT voucher detection priority

The detection logic for the missing-VAT error must be restructured:

1. **FIRST**: Search for vouchers on the prompt account + prompt amount (gross or net) that have **NO 2710 posting** (Case A — entirely missing VAT). This is the most common interpretation of "missing VAT line."
2. **SECOND**: Search for vouchers matching by description keywords ("uten mva", "without vat", "mangler mva") on the prompt account.
3. **THIRD**: Search for vouchers on the prompt account + prompt amount that HAVE a 2710 posting but with VAT too low (Case B — net booked as gross).
4. **FOURTH**: Broadest fallback — any voucher with the prompt account and no 2710 line.

The current code searches in order: amount-match-any → description-keyword → no-2710-broader. The fix is: no-2710-with-amount-match → description-keyword → has-2710-with-amount-match → no-2710-broader.

### Trusted standard update needed

The `correct-ledger-errors.md` trusted standard should add a section on detection priority for missing-VAT vouchers:

> **CRITICAL: When detecting the missing-VAT voucher, PREFER vouchers that have NO 2710 posting.** The prompt says "missing VAT line", which usually means the 2710 line is entirely absent (Case A). Only fall back to Case B (existing 2710 is too low) if no Case A match exists. Production run 397faff2 failed Check 3 because it matched a voucher that had vatType=1 and an existing 2710 line, when the actual error voucher was a different one booked without VAT entirely.

### Summary of remaining Check 3 failures across runs

| Run | Check 3 approach | Failure reason |
|-----|-----------------|----------------|
| 0607a659 (3rd) | expense+vatType=1 | Wrong correction method (auto-VAT doesn't match scorer) |
| 397faff2 (4th) | direct 2710, Case B | Correct method, wrong voucher (Case B matched instead of Case A) |

Both runs scored 2.25/6. Neither solved Check 3. The next run must combine the correct method (direct 2710) with correct detection (prefer no-2710 vouchers).
