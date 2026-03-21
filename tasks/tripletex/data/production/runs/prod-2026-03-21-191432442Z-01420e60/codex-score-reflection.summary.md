# Score Reflection — Run 01420e60

## 1. Task Attribution

- **Task ID**: 22 (T3 tier, max 6 leaderboard points)
- **Prompt**: "Necesitamos el gasto de Kundemøte lunsj de este recibo registrado en el departamento Drift. Usa la cuenta de gastos correcta y asegura el tratamiento correcto del IVA."
- **Receipt**: Peppes Pizza, 26.04.2026, line "Kundemøte lunsj" 14050 kr, "Kontorrekvisita" 330 kr, Totalt 14380 kr, herav MVA 25% 3595 kr, paid by Bedriftskort.
- **Leaderboard**: task 22 best_score = 0 across 8 attempts (including this one). Never solved.

## 2. Correctness Verdict

**Correctness: 0 — Total failure.** Score 0/10, 5/5 checks failed.

The run booked amount 14050 on account 7360 (non-deductible representation) with VAT code 0. All 5 scorer checks failed, meaning either the amount, the account, the VAT treatment, or multiple fields were wrong.

## 3. Efficiency Verdict

Efficiency is irrelevant — correctness was 0. The 4-call execution was mechanically clean (0 errors, 0 retries), but efficiency bonuses only apply at perfect correctness.

## 4. Likely Root Cause

**Primary: Wrong amount — receipt shows NET prices, agent treated them as GROSS.**

The receipt says:
```
Kundemøte lunsj       14050.00 kr
Kontorrekvisita         330.00 kr
Totalt:               14380.00 kr
 herav MVA 25%:        3595.00 kr
```

Critical math analysis:
- If 14380 were GROSS (including VAT): VAT = 14380 × 0.2 = **2876** — does NOT match 3595
- If 14380 is NET (before VAT): VAT = 14380 × 0.25 = **3595** — MATCHES exactly

Therefore the receipt line prices are **NET** (before VAT). The actual gross amount for "Kundemøte lunsj" is:
- Net: 14050
- VAT (25%): 14050 × 0.25 = 3512.50
- Gross: 14050 + 3512.50 = **17562.50**

The agent booked 14050 as both `amount` and `amountGross`, but 14050 is only the net. The correct gross amount is 17562.50. For non-deductible representation (account 7360, VAT code 0), the full cost including non-recoverable VAT should be booked:
- `amount` = `amountGross` = **17562.50** (the company bears the full cost since VAT is not deductible)
- Bank posting: **-17562.50**

**Secondary: Possibly wrong account or VAT treatment entirely.**

Task 22 has 0 best_score across 8 attempts, meaning no approach has ever worked. This suggests the issue may go beyond just the amount. Possible alternatives not yet tested:
- Account 7360 is correct but amount must be the GROSS (17562.50) — most likely fix
- Account 7350 already failed (noted in trusted standard as 0/10)
- Maybe the task expects deductible VAT treatment with a different account (e.g., 6860 Møter/kurs, or a 6500-series office-cost account with incoming 25% VAT)
- Maybe the scorer expects a different voucher structure (e.g., three postings with VAT split even for representation)

**Tertiary: Prior reflection was dangerously wrong.**

The initial post-run reflection marked this as "optimal" and added it as a "production proof" in the trusted standard and playbook. This is incorrect and harmful — it encodes a failing pattern as a proven success. The commit `2988ae97` should be reverted or corrected in a future pass.

## 5. What Went Right

1. **Correct branch identification**: "Kundemøte lunsj" IS a business lunch / customer meeting lunch — representation is the right category conceptually.
2. **Clean API execution**: 4 calls, 0 errors, 0 retries. Mechanically flawless.
3. **Correct department handling**: Created "Drift" with POST /department, used department.id on posting.
4. **Receipt attachment uploaded**: The attachment step was correctly executed.
5. **Followed trusted standard exactly**: The agent read the standard and executed it faithfully.

## 6. What To Change Next Time

### Must fix: Receipt amount interpretation

1. **Always verify whether receipt prices are NET or GROSS.** Check the math:
   - Compute `total × 0.2` (gross VAT extraction). If it matches the stated MVA, prices are GROSS.
   - Compute `total × 0.25` (net VAT addition). If it matches the stated MVA, prices are NET.
   - For this receipt: 14380 × 0.25 = 3595 ✓ → prices are NET. Gross = line × 1.25.

2. **For non-deductible representation (7360, VAT code 0) with NET-priced receipts:**
   - `amount` = `amountGross` = line × 1.25 (the full cost including non-recoverable VAT)
   - Bank posting: -(line × 1.25)

3. **Update the trusted standard** to add a receipt-format detection step before computing amounts. The current standard assumes receipt line prices are GROSS, which is wrong for receipts that show "herav MVA" with NET-based math.

### Should investigate: Is account 7360 actually correct for task 22?

4. Since task 22 has 0/8 success rate, the next reflection pass should:
   - Test in sandbox with amount 17562.50 on account 7360 — the most likely fix
   - If that still fails, test alternative accounts: 6860 (Møter/kurs), 6500-series, or even a deductible representation path with incoming VAT
   - Test whether the scorer expects the voucher to have a VAT split posting (three postings) even for representation

### Must fix: Remove incorrect production proof

5. The commit `2988ae97` added a "Branch A production proof" claiming this run was optimal. It was not — it scored 0/10. This production proof must be removed or marked as a failed attempt in a future playbook update pass.

### Process improvement

6. **Never mark a run as "production proof" until the actual score is confirmed.** The prior reflection assumed success from HTTP 201 responses, which only proves the API accepted the request, not that the final state matches the scorer's expectations.
