# Score Reflection — prod-2026-03-22-103515995Z-70014f3c

## 1. Task Attribution

- **Leaderboard diff**: T17 (attempt 24→25, best 3.5→3.5) and T22 (attempt 14→15, best 2.1→2.1) both incremented.
- **Inference status**: ambiguous (2 tasks changed).
- **Timestamp match**: Submission completed at `10:36:57.426240`, T17's `last_attempt_after` is `10:36:57.426240` (exact match). T22's is `10:37:05.817566` (8s later, likely a concurrent submission).
- **Most likely task**: **T17** (T2 tier, max 4 points).
- **Normalized score**: 1.6923. `1.6923 / 0.8461 = 2.0` → scored as T1-equivalent (max 2) OR efficiency-penalized T2. The math `correctness × 2 = 1.6923` fits a T1 max of 2 at full efficiency.

## 2. Correctness Verdict

- **Score**: 11/13 raw, correctness = 0.8461, normalized = 1.6923.
- **Checks**: 6 total, 5 passed, **Check 3 failed** (worth 2 points).
- **Correctness is NOT perfect**. The final Tripletex state has a wrong field value.

### Check-by-check

| Check | Status | Likely meaning |
|---|---|---|
| 1 | passed | Voucher exists and is booked |
| 2 | passed | Correct expense account (7360) |
| 3 | **failed** | Amount and/or VAT treatment |
| 4 | passed | Correct department (Salg) |
| 5 | passed | Unknown (possibly description or date) |
| 6 | passed | Attachment present |

Note: The trusted standard documents 5 checks; this task has 6. The check numbering may not align exactly.

## 3. Efficiency Verdict

- **3 writes** (POST department, POST voucher, POST attachment), **0 errors**, **1 free GET** (account resolution), **2 free verification GETs**.
- **Zero 4xx errors**. Execution was maximally efficient.
- **Efficiency is not the issue**. The problem is correctness (Check 3 failed).
- Duration: 126s — well within the 300s budget.

## 4. Likely Root Cause

**Receipt amount interpretation: NET vs GROSS.**

The receipt math proves the amounts are **NET** (before VAT):

```
Forretningslunsj:  13200.00 kr
Whiteboard:          390.00 kr
Togbillett:          420.00 kr
Totalt:           14010.00 kr
herav MVA 25%:     3502.50 kr

Check: 14010 × 0.25 = 3502.50  ✓  (NET interpretation — totalt IS the net)
Check: 14010 / 1.25 × 0.25 = 2802  ≠ 3502.50  (GROSS interpretation FAILS)
```

The MVA calculation **only** works if the total (and therefore each line) is NET. The actual gross payment for Forretningslunsj was `13200 × 1.25 = 16500`.

The run used `amountGross = 13200` (the raw line amount). For Branch A (7360, vatLocked, vatType=0), all 4 amount fields are set to the same value. If the correct GROSS amount is 16500, the voucher under-recorded the expense by 3300 and the bank outflow by 3300.

**Contradiction with trusted standard**: The standard says "Do NOT multiply by 1.25" based on run e89025d1 (Tastatur 6900 × 1.25 = 8625, failed). However, that receipt may have had a different format where amounts were already GROSS. The receipts appear to vary in whether line amounts are NET or GROSS.

**Disambiguation rule** (not yet in the standard):
- If `total × 0.25 ≈ stated MVA` → amounts are **NET** → multiply by (1 + rate) for amountGross
- If `total / 1.25 × 0.25 ≈ stated MVA` → amounts are **GROSS** → use directly

This run's receipt clearly passes the NET test. The agent should have multiplied.

**Alternative hypothesis**: Check 3 may test something other than amount (e.g., description text, date format, or a field not covered by the 5-check trusted standard). Without access to the scorer's rubric, the amount hypothesis is the strongest given the receipt math mismatch.

## 5. What Went Right

1. **Branch selection**: Correctly identified Branch A (Forretningslunsj → 7360, non-deductible representation, vatLocked, 0% VAT).
2. **Department handling**: POST created "Salg" on first try, used `{ id }` correctly.
3. **Account resolution**: GET accounts with comma-separated numbers, extracted IDs correctly.
4. **Voucher structure**: `?sendToLedger=true`, `row: 1`/`row: 2`, `account: { id }`, `department: { id }`, no vatType sent.
5. **Attachment**: Uploaded successfully, verified with readback.
6. **Zero errors**: No 4xx, no retries, no wasted calls.
7. **Speed**: 126s execution, well under 300s.
8. **Trusted standard followed**: Read the standard before writing code.

## 6. What To Change Next Time

### Critical: Add receipt NET/GROSS detection logic

Before setting `amountGross`, the agent MUST check the receipt's MVA math:

```typescript
const total = 14010;       // from receipt "Totalt:"
const statedMVA = 3502.50; // from receipt "herav MVA 25%:"

const netTest = total * 0.25;             // = 3502.50
const grossTest = (total / 1.25) * 0.25;  // = 2802.00

if (Math.abs(netTest - statedMVA) < 0.01) {
  // Amounts are NET — multiply line by 1.25 for GROSS
  lineAmountGross = lineAmountNet * 1.25;
} else if (Math.abs(grossTest - statedMVA) < 0.01) {
  // Amounts are GROSS — use directly
  lineAmountGross = lineAmount;
} else {
  // Mixed rates or unusual format — use line amount directly (safest default)
  lineAmountGross = lineAmount;
}
```

For Branch A (non-deductible, vatLocked=0%): `amountGross = lineGross` regardless. Since VAT is non-recoverable, the full gross amount goes to 7360 and the full gross leaves the bank.

### Update trusted standard

The trusted standard's "Do NOT multiply" rule needs a conditional:
- GROSS receipts (verified by MVA math): use line amount directly
- NET receipts (verified by MVA math): multiply by `1 + vatRate` for amountGross

This is a critical correction. The current blanket rule caused Check 3 to fail on this NET receipt.

### No efficiency changes needed

The 3-write + free-GETs path is already minimal. No calls can be eliminated.
