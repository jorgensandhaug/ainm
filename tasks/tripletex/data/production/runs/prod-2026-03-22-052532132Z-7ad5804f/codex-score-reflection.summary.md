# Score Reflection — prod-2026-03-22-052532132Z-7ad5804f

## 1. Task Attribution

- **Task ID**: T22 (Register receipt expense voucher)
- **Tier**: T3 (max 6 normalized)
- **Prompt language**: Norwegian (nb)
- **Receipt**: Jernia, 21.06.2026 — Whiteboard 14300 kr, Mus 120 kr, Totalt 14420 kr, herav MVA 25% 3605 kr
- **Request**: Book Whiteboard to department HR, correct expense account + VAT

## 2. Correctness Verdict

**INCORRECT — 1/10 raw, correctness = 0.1**

| Check | Result |
|---|---|
| Check 1 | **failed** |
| Check 2 | **failed** |
| Check 3 | **failed** |
| Check 4 | **failed** |
| Check 5 | passed |

Only the attachment upload (Check 5) passed. The voucher itself was either not found by the scorer or had completely wrong field values, causing all 4 voucher-related checks to fail.

Prior reflection predicted 10/10. Actual: 1/10. The prediction was catastrophically wrong.

## 3. Efficiency Verdict

Not applicable — correctness was the bottleneck, not efficiency. The run used 4 calls with 0 errors, which would have been optimal IF the data had been correct. The normalized_score of 0.3 (from correctness=0.1) confirms this is a correctness failure.

Leaderboard context:
- T22 best_score before: 2.1 (13 attempts)
- T22 best_score after: 2.1 (14 attempts — this run did not improve the best)

## 4. Likely Root Cause

**The NET vs GROSS interpretation of receipt prices is wrong in the trusted standard.**

### The "herav" problem

The receipt says: `herav MVA 25%: 3605.00 kr`

The Norwegian word **"herav"** means **"thereof" / "of which"**. This phrasing indicates that the MVA amount (3605) is **contained within** the total (14420). In standard Norwegian retail receipts, "herav MVA" means the displayed prices are **GROSS (VAT-inclusive)**.

### Why the detection formula gave the wrong answer

The trusted standard's detection formula:
```
IF receipt_total × 0.25 == stated_MVA → NET
IF receipt_total / 1.25 × 0.25 == stated_MVA → GROSS
```

For this receipt:
- Check 1: 14420 × 0.25 = 3605 = MVA ✓ → formula says **NET**
- Check 2: 14420 / 1.25 × 0.25 = 2884 ≠ 3605 → not GROSS

The formula matched "NET" and the run multiplied: GROSS = 14300 × 1.25 = **17875**.

But "herav" linguistically means the prices ARE GROSS. The mathematical ambiguity arises because the receipt uses a simplified display: it calculates "MVA = total × 25%" (a label-rate shortcut) rather than the standard accounting formula "MVA = total / 1.25 × 0.25". Both happen to be valid computations, but they give different results (3605 vs 2884), and the receipt uses the simpler one.

### What the scorer likely expected

If prices are GROSS (as "herav" indicates):
- **Whiteboard amountGross = 14300** (the price on the receipt, already including VAT)
- NET = 14300 / 1.25 = 11440
- VAT = 14300 - 11440 = 2860
- Bank posting = -14300

What the run sent:
- **Whiteboard amountGross = 17875** (14300 × 1.25 — treating as NET)
- Auto NET = 14300
- Auto VAT = 3575
- Bank posting = -17875

The amounts are **27% too high** (17875 vs 14300). The scorer likely searched for a voucher matching the expected amounts, found nothing, and all voucher checks (1-4) failed. The attachment existed independently → Check 5 passed.

### Corroborating evidence

1. **No T22 run has ever scored 10/10 in production.** The best is 7/10 (3373fbc9, Branch C), where the issue was vatType not amounts. But even that run used NET × multiplier — if amounts were also wrong, other check failures may have been masked.

2. **The prior Branch B run (e89025d1, Tastatur) also likely scored ≤ 3/10.** T22 best is 2.1 normalized across 13 pre-run attempts, and e89025d1 used the same NET × 1.25 approach. If it had scored 10/10, the best would be ~6.0.

3. **"herav" is the standard Norwegian phrasing for VAT-inclusive prices.** Norwegian consumer receipts are legally required to show VAT-inclusive prices. "herav MVA" is the conventional way to indicate the VAT portion within the total.

4. **The formula's NET check is a mathematical coincidence.** For any amount X and flat 25% rate: X × 0.25 = X × 0.25 is tautologically true. The formula doesn't discriminate between "NET amount where MVA = NET × 25%" and "GROSS amount where the receipt labels MVA as total × 25%". The formula ALWAYS returns "NET" when the receipt uses the simplified MVA display, regardless of whether prices are actually NET or GROSS.

### Why the formula is fundamentally broken

The detection formula `receipt_total × 0.25 == stated_MVA → NET` is a **tautology** when receipts use the common Norwegian notation `herav MVA 25%: [total × 0.25]`. It will ALWAYS match "NET" for these receipts, even when prices are GROSS. The formula cannot distinguish between the two cases because the receipt's simplified MVA display makes both formulas produce the same result.

The ONLY reliable signal is linguistic: **"herav" = GROSS**, **no "herav" = NET**. The mathematical formula should be a secondary check, not the primary one.

## 5. What Went Right

1. **Correct task identification**: Correctly matched to T22 receipt expense voucher trusted standard
2. **Correct branch selection**: Whiteboard → Branch B (6540, 25% VAT) — correct
3. **Clean execution**: 4 API calls, 0 errors, 0 retries — optimal call count for this task shape
4. **Read trusted standard before coding** — followed protocol exactly
5. **Attachment uploaded successfully** — Check 5 passed
6. **Department created correctly** — POST /department for "HR" succeeded (201)

## 6. What To Change Next Time

### Critical fix: Reverse the NET/GROSS default assumption

The trusted standard must be corrected:

1. **"herav MVA" → prices are GROSS.** When the receipt uses the word "herav" (thereof/of which), treat item prices as GROSS (VAT-inclusive). Use the receipt line price directly as `amountGross` WITHOUT multiplying by (1 + rate).

2. **Kill the formula-first approach.** The detection formula `total × 0.25 == MVA → NET` is a tautology for Norwegian receipts using "herav MVA 25%: [total × 25%]". It should NOT be the primary detection method.

3. **New detection priority**:
   - **Primary**: Look for "herav" → if present, prices are GROSS
   - **Secondary**: If no "herav", check whether `total / 1.25 × 0.25 == MVA` → if yes, prices are GROSS
   - **Tertiary**: If receipt explicitly says "Netto" / "ekskl. MVA" / "ex. MVA" → prices are NET

4. **Branch B corrected flow** (Whiteboard, GROSS prices):
   - amountGross = 14300 (receipt price, unchanged)
   - vatType = 1 (25% incoming, from account 6540)
   - Tripletex auto-computes: NET = 11440, VAT = 2860
   - Bank posting: amountGross = -14300

5. **Sandbox-verify the GROSS interpretation** before updating the trusted standard. Run a sandbox test with amountGross = receipt_line_price (without multiplying) and confirm that the auto-computed amounts make sense. Then await a production run to validate.

6. **Do NOT update the trusted standard based on this analysis alone.** The "herav = GROSS" theory is the strongest hypothesis but has not been production-validated. The next step is a sandbox test followed by a production run with the corrected amounts.

### Broader implication

All 4 branches (A, B, C, D) may be affected. Every Branch A/B/D run that used GROSS = NET × 1.25 may have been wrong. Branch C runs that used GROSS = NET × 1.12 may also be wrong. The corrected approach would be:

| Branch | Current (wrong?) | Corrected (to verify) |
|---|---|---|
| A (7360) | GROSS = line × 1.25 | GROSS = line (use as-is) |
| B (6540) | GROSS = line × 1.25 | GROSS = line (use as-is) |
| C (7140) | GROSS = line × 1.12 | GROSS = line (use as-is) |
| D (6860) | GROSS = line × 1.25 | GROSS = line (use as-is) |

If this theory is correct, the bank posting should always equal the negative of the receipt line price (the amount actually paid), and Tripletex handles the NET/VAT decomposition internally based on the vatType.
