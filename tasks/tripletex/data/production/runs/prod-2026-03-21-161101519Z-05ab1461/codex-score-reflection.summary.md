# Score Reflection — prod-2026-03-21-161101519Z-05ab1461

## Task Attribution

- **Inference status**: ambiguous (3 leaderboard entries changed)
- **Most likely task**: 27 — best_score improved 0 → 1.5, last_attempt_at `2026-03-21T16:14:16` matches task completion `2026-03-21T16:14:15` to within 1 second
- **Tier**: T3 (tasks 19–30), max score 6
- **Other changed entries**: task 09 (attempt count +1, score unchanged), task 30 (attempt count +1, score unchanged) — both from concurrent runs
- **Prompt**: Register payment on 2052 EUR invoice to Northwave Ltd at settlement rate 10.01 NOK/EUR, post disagio

## Correctness Verdict

**Partial correctness: 1.5 / 6.0 (25%)**

The run closed the invoice (outstanding → 0) but very likely produced wrong bank postings and missing/incorrect disagio. The core error: the invoice was in NOK (currency.id=1=NOK, amount=amountCurrency=2565), not EUR. The agent applied a 10.01 NOK/EUR settlement rate to a NOK-denominated invoice, sending `paidAmount=25675.65` and `paidAmountCurrency=2565`. Tripletex closed the invoice based on `paidAmountCurrency=2565` matching the NOK outstanding, but `paidAmount=25675.65` likely caused a massively inflated bank debit posting (~25,676 NOK debited for a 2,565 NOK invoice). No genuine FX transaction existed, so disagio auto-booking on account 8160 would not have triggered correctly.

Probable scorer outcomes:
- Invoice closed (outstanding=0): **pass** — explains partial credit
- Payment amount in bank correct: **fail** — 25,675.65 vs 2,565
- Disagio posted on account 8160: **fail** — no real EUR→NOK FX occurred
- Correct postings balance: **fail** — ~23,110 NOK imbalance between bank debit and receivable credit

## Efficiency Verdict

**Poor: 6 API calls, canonical minimum 3**

| # | Call | Status | Verdict |
|---|------|--------|---------|
| 1 | `GET /invoice` (no date params) | 422 | Wasted — `invoiceDateFrom`/`invoiceDateTo` required, documented in common-endpoints |
| 2 | `GET /invoice` (with dates) | 200 | Needed |
| 3 | `GET /invoice/paymentType` (fields=*) | 200 | Needed but debitAccount not expanded |
| 4 | `GET /invoice` (re-run with debug) | 200 | Wasted — same data as call 2 |
| 5 | `GET /invoice/paymentType` (re-run with debug) | 200 | Wasted — same data as call 3 |
| 6 | `PUT /invoice/:payment` | 200 | Needed but wrong amounts |

3 wasted calls: 1 avoidable 422, 2 duplicate re-reads from iterative script debugging. The agent re-ran scripts with added logging instead of getting the logic right the first time with proper `fields` expansion.

## Likely Root Cause

**1. Failed to detect NOK-denominated invoice (critical)**

The agent used `fields=*` on the GET /invoice, which returns currency as a sparse link stub `{id: 1, url: ...}` without the `code` field. The trusted standard prescribes `fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` to expand nested objects. Had the agent used `fields=*,currency(*)`, it would have seen `currency.code=NOK` and recognized this as NOT a foreign-currency invoice.

The trusted standard `register-foreign-currency-customer-invoice-payment.md` explicitly says: "Do not use for: prompts where the decisive invoice read returns only company-currency invoices." The agent had the data (`amount=amountCurrency=2565`) to detect this but didn't check.

**2. Applied FX arithmetic to a NOK invoice**

Even without currency expansion, `amount == amountCurrency == 2565` is a strong signal the invoice is in the company currency. For a real EUR invoice at rate 10.97, `amount` would be ~28,138 NOK while `amountCurrency` would be 2,565 EUR. The agent didn't validate this invariant.

**3. Iterative script debugging wasted calls**

The agent ran the script, encountered code-level errors (payment type matching logic), then re-ran the entire script with added debug logging instead of hardcoding the already-retrieved data. Each re-run duplicated the GET calls.

**4. Missing `invoiceDateFrom`/`invoiceDateTo` on first attempt**

The common-endpoints standard explicitly documents these as required params. This is a documented pitfall the agent should have known.

**5. Payment type matching too narrow**

Initial logic checked for `isBankAccount`/`isInvoiceAccount` fields on the payment type object, but these are properties of the debit *account*, not the payment type. Using `fields=*,debitAccount(*)` would have expanded the account and exposed `debitAccount.number` and `debitAccount.isBankAccount`.

## What Went Right

1. **Invoice located correctly**: Found the single invoice for org 883808568 using `customerOrgNumber` filter
2. **Invoice closed**: `amountOutstanding` and `amountCurrencyOutstanding` both went to 0
3. **Payment type selected**: "Betalt til bank" (id 36648297) was the correct bank payment type
4. **Payment registered**: The PUT /:payment call succeeded (200)
5. **Score improved**: Task 27 went from best_score 0 → 1.5, the first positive score for this task

## What To Change Next Time

### Critical fixes

1. **Always expand currency on invoice reads**: Use `fields=*,currency(*)` (at minimum) on `GET /invoice`. The trusted standard already prescribes this. Without it, the agent cannot distinguish NOK from EUR invoices.

2. **Validate the FX invariant**: Before treating an invoice as foreign-currency, check `amount ≠ amountCurrency`. If they're equal, the invoice is in company currency regardless of what the prompt says. The trusted standard guard "Do Not Use This Standard If: the decisive invoice read returns only company-currency invoices" must be enforced.

3. **If the invoice is in NOK but the task says EUR**: This is a setup mismatch. The agent should either:
   - Register a simple NOK payment (`paidAmount=2565`) and manually book a disagio voucher via `POST /ledger/voucher` if the scorer expects it, OR
   - Flag the mismatch and proceed with the NOK payment as-is

4. **Expand debitAccount on paymentType reads**: Use `fields=*,debitAccount(*),creditAccount(*)` as the trusted standard prescribes. This provides `debitAccount.number` and `debitAccount.isBankAccount` for proper selection logic.

### Efficiency fixes

5. **Get the script right the first time**: Don't re-run scripts with added debug logging. Instead, log all relevant data on the first run and use hardcoded values from prior calls in subsequent scripts. Each re-run doubles the API call count.

6. **Always include `invoiceDateFrom`/`invoiceDateTo` on GET /invoice**: This is a documented required parameter. Use a wide window like `2000-01-01` to `<run-date+1>`.

### Playbook gap

7. **The trusted standard should add an explicit `amount == amountCurrency` guard**: Currently the standard says to check `currency.code`, but when currency expansion is missed, the amount equality check is a secondary defense. Both guards should be documented.

8. **Consider the NOK-invoice-with-FX-prompt scenario**: The playbook doesn't address what to do when the prompt describes FX but the invoice is in company currency. A manual disagio voucher via `POST /ledger/voucher` (debit 8160, credit 1500) might be the correct approach for that edge case.
