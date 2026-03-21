# Score Reflection — prod-2026-03-21-194545009Z-e0bd9a2b

## 1. Task Attribution

- **tx_task_id**: 27
- **Tier**: T3 (tasks 19–30, max 6 points)
- **Task**: Register payment on a 12,689 EUR invoice to Océan SARL (org 863081793) at settlement rate 10.71 NOK/EUR (original rate 11.28) and book disagio
- **Trusted standard match**: `register-foreign-currency-customer-invoice-payment`

## 2. Correctness Verdict

**Not perfect.** Correctness = 0.5 (2/4 checks passed, 2/4 failed).

- Check 1: passed — payment was registered
- Check 2: passed — invoice outstanding = 0 (fully closed)
- Check 3: failed — disagio not booked (no FX posting on account 8160)
- Check 4: failed — correct disagio amount not present

**normalized_score**: 1.5 / 6.0 max
**Leaderboard best before**: 1.5 (tied — no run has ever scored better on task 27)
**Leaderboard best after**: 1.5 (unchanged — this run matched the best)

## 3. Efficiency Verdict

The run used **3 API calls, 0 errors** — the theoretical minimum for this task shape per the trusted standard. Efficiency was optimal. The problem is purely correctness: the FX payment path was not taken, so the `:payment` endpoint was called without FX parameters and therefore did not auto-book disagio.

## 4. Likely Root Cause

The trusted standard's foreign-currency filter includes a guard: `inv.amount !== inv.amountCurrency`. This guard was intended to detect invoices that appear to be in EUR (`currency.code = "EUR"`) but are actually in NOK.

**In production, this guard was a false negative.** The production invoice (ID 2147630880) had `amountOutstanding = 15861.25`, which equals `12689 * 1.25` (prompt amount + 25% VAT). This value is far too small to be the NOK equivalent at rate 11.28 (which would be ~178,915 NOK). The most likely explanation:

1. **The test framework created a EUR invoice without applying an exchange rate** (or applied rate = 1.0), so `amount === amountCurrency === 15861.25`.
2. The script's filter `inv.amount !== inv.amountCurrency` returned `false`, excluding this invoice from foreign-currency candidates (0 FX candidates found).
3. The script fell back to NOK payment logic: `paidAmount = amountOutstanding = 15861.25` with no `paidAmountCurrency` parameter.
4. The `:payment` endpoint received no FX signal, so it booked a simple NOK payment with zero FX posting.

**The `amount !== amountCurrency` guard is the direct cause of the failure.** It was added based on sandbox observations where properly-created EUR invoices always have different `amount` (NOK) and `amountCurrency` (EUR) values. But the production test framework may create EUR invoices differently (e.g., without configuring the company exchange rate), resulting in `amount === amountCurrency` even though `currency.code = "EUR"`.

This same root cause pattern has now caused **every** task-27 run to fail checks 3–4, explaining why the leaderboard best is only 1.5/6.0.

## 5. What Went Right

1. **Read the trusted standard before writing** — avoided the documented API traps (silently ignored query params, missing field expansions)
2. **Correct field expansions** — used `fields=*,currency(*)` and `fields=*,debitAccount(*)` as required
3. **3 calls, 0 errors** — minimal call count, zero 4xx errors
4. **NOK fallback worked** — the script didn't crash or time out when no FX candidates were found; it registered a payment and closed the invoice (earning checks 1–2)
5. **Fast execution** — completed in ~2 seconds of API time within the 300s budget

## 6. What To Change Next Time

### Critical fix: relax the foreign-currency filter

The `amount !== amountCurrency` guard must be removed or downgraded from a hard filter to a diagnostic log. The correct filter is:

```
currency.code && currency.code !== "NOK" && amountCurrencyOutstanding > 0
```

If `currency.code !== "NOK"`, the invoice IS foreign-currency regardless of whether `amount === amountCurrency`. The script should then use FX payment logic:

- `paidAmountCurrency` = `amountCurrencyOutstanding` (full foreign-currency outstanding)
- `paidAmount` = `amountCurrencyOutstanding * settlementRate` (NOK at the new exchange rate)

### Update trusted standard

The trusted standard `register-foreign-currency-customer-invoice-payment.md` must:

1. **Remove** the `amount !== amountCurrency` condition from the mandatory FX validation
2. **Remove** or soften the statement "if they are equal, the invoice is in company currency regardless of what `currency.code` says" — this is incorrect in production
3. **Trust `currency.code`** as the authoritative currency indicator
4. **Update the NOK fallback** to only trigger when `currency.code === "NOK"` (or null/missing), not when `amount === amountCurrency`
5. Add this production failure to the failure history section

### Specific calculation for the correct payment

For this exact task with the corrected logic:
- Invoice: 12,689 EUR ex-VAT → 15,861.25 EUR with 25% VAT
- `paidAmountCurrency` = 15,861.25 EUR
- `paidAmount` = 15,861.25 × 10.71 = **169,874.19 NOK**
- Disagio = 15,861.25 × (11.28 − 10.71) = 15,861.25 × 0.57 = **9,040.91 NOK** (auto-booked on account 8160)
- Still 3 calls, 0 errors — only the payment parameters change
