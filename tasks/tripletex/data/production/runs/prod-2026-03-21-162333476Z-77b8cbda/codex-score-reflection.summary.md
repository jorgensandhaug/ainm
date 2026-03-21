# Score Reflection — Task 27 (FX Customer Invoice Payment with Agio)

## Task Attribution

- **Task ID**: 27 (T3 tier, max score 6)
- **Run ID**: prod-2026-03-21-162333476Z-77b8cbda
- **Prompt**: Register payment on 11,660 EUR invoice to Montagne SARL (org 959783748) at settlement rate 11.65 NOK/EUR (original rate 10.98); book the FX gain (agio) on the correct account.
- **Leaderboard before**: best_score = 1.5 (3 prior attempts)
- **Leaderboard after**: best_score = 1.5 (4 attempts) — this run tied best, did not improve

## Correctness Verdict

**Correctness = 0.5** — 2/4 checks failed.

| Check | Result |
|-------|--------|
| Check 1 | passed |
| Check 2 | passed |
| Check 3 | **failed** |
| Check 4 | **failed** |

- **score_raw**: 5/10
- **normalized_score**: 1.5 / 6.0
- **Interpretation**: The payment was registered and the invoice was closed (checks 1–2), but the FX gain/agio booking was incorrect or missing (checks 3–4). This is a **correctness failure**, not just efficiency.

## Efficiency Verdict

4 API calls total (1 wasted 422 + 3 successful). The canonical minimum is 3 calls. The 422 was avoidable but is secondary to the correctness failure.

| Call | Status | Notes |
|------|--------|-------|
| `GET /invoice?...` (no date params) | 422 | Missing `invoiceDateFrom`/`invoiceDateTo` |
| `GET /invoice?...` (with dates) | 200 | Used `fields=*` without `currency(*)` |
| `GET /invoice/paymentType?fields=*` | 200 | Missing `debitAccount(*)` expansion |
| `PUT /invoice/{id}/:payment` | 200 | Applied FX logic to what was likely a NOK invoice |

## Likely Root Cause

The root cause is a chain of three compounding errors, all stemming from the agent not reading the trusted standard before writing the script:

### 1. Missing `currency(*)` expansion (critical — caused correctness failure)
The agent used `fields=*` instead of `fields=*,currency(*)`. The production invoice returned `currency: { id: 1 }` — a sparse link stub. Without the expanded `code` field, the agent could not verify the invoice was actually EUR.

The production response showed `amount === amountCurrency === 14575`. For a true EUR invoice at rate 10.98, `amount` would be ~160,033.50 NOK. The equality `amount === amountCurrency` is the canonical signal that the invoice is in company currency (NOK), not EUR. The agent did not check this.

### 2. Invalid query parameters silently ignored
The agent used `customerOrganizationNumber=959783748` and `currency=EUR` as GET /invoice query params. Both are **silently ignored** by the API (sandbox-verified: `currency=DOESNOTEXIST` and `customerOrganizationNumber=000000000` both return fullResultSize identical to unfiltered). The agent believed it was filtering by customer and currency, but was actually getting all invoices in the account.

In the fresh production account there was only 1 invoice total, and it was NOK. The agent treated it as the target EUR invoice.

### 3. FX logic applied to a NOK invoice
The agent sent `paidAmount=169,798.75` (= 14575 × 11.65) and `paidAmountCurrency=14575` on what was a NOK invoice. Per sandbox proof, Tripletex ignores the mismatched `paidAmount` on NOK invoices — it debits bank by only the actual outstanding (14575 NOK) and creates zero FX postings. No agio was booked on account 8060, so checks 3 and 4 failed.

### 4. Missing `invoiceDateFrom`/`invoiceDateTo` (efficiency — wasted 1 call)
The first GET /invoice omitted required date params, causing a 422. The trusted standard explicitly documents this as a required parameter.

## What Went Right

1. **Task shape correctly identified** as a foreign-currency customer invoice payment — matched the trusted standard pattern.
2. **Payment was registered** and the invoice was fully closed (`amountOutstanding=0`), passing checks 1 and 2.
3. **Payment type selection** worked via description-based fallback ("Betalt til bank") even though the primary filter failed due to missing `debitAccount(*)` expansion.
4. **The correct settlement arithmetic** was applied (11,660 ex-VAT → 14,575 incl. VAT → × 11.65 settlement rate).
5. **Fast execution** — completed in ~202s, well within the 300s budget.

## What To Change Next Time

### Must-fix (correctness)

1. **Always read the trusted standard before writing the script.** The agent recognized an exact match but wrote the script from memory instead of reading the standard. Every error in this run was already documented in the trusted standard's pitfalls section. The AGENTS.md rule at line 27 says: "Read only the matching trusted standard, then immediately write and execute the script."

2. **Always use `fields=*,currency(*)` on GET /invoice.** Without it, `currency` comes back as `{ id, url }` — useless for currency detection. The standard explicitly requires this expansion.

3. **Always validate `currency.code !== "NOK"` and `amount !== amountCurrency` before applying FX logic.** If the invoice is NOK despite the prompt saying EUR, fall back to the Company-Currency Fallback section of the trusted standard.

4. **Do not use `customerOrganizationNumber` or `currency` as GET /invoice query params** — they are silently ignored. Use `customerId` (internal ID) if pre-resolved, or fetch all invoices and filter locally. In a fresh production account with few invoices, local filtering is cheap.

5. **Always use `fields=*,debitAccount(*)` on GET /invoice/paymentType.** Without it, `debitAccount` is a link stub and the primary selection filter (`debitAccount.number in 19xx && debitAccount.isBankAccount`) always fails.

### Nice-to-fix (efficiency)

6. **Always include `invoiceDateFrom` and `invoiceDateTo` on GET /invoice.** These are required parameters; omitting them returns 422. Use `invoiceDateFrom=2000-01-01&invoiceDateTo=<run-date-plus-one-day>`.

7. **`isIncoming` and `isBankAccount` are NOT top-level fields on the payment type object** — they exist only on the expanded `debitAccount` subobject. Do not filter by `paymentType.isIncoming`.

### Correct path for this exact task shape (3 calls, 0 errors)

```
GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)
  → filter locally: currency.code === "EUR" && amountCurrencyOutstanding > 0
  → validate: amount !== amountCurrency (proves true EUR invoice)
  → extract: invoiceId, amountCurrencyOutstanding

GET /invoice/paymentType?fields=*,debitAccount(*)
  → select: debitAccount.number >= 1900 && < 2000 && debitAccount.isBankAccount === true
  → fallback: description.toLowerCase().includes("bank")

PUT /invoice/{id}/:payment?paymentDate=2026-03-21&paymentTypeId={id}&paidAmount={amountCurrencyOutstanding * 11.65}&paidAmountCurrency={amountCurrencyOutstanding}
  → verify: amountOutstanding === 0, amountCurrencyOutstanding === 0
  → FX gain auto-booked on account 8060 by Tripletex
```
