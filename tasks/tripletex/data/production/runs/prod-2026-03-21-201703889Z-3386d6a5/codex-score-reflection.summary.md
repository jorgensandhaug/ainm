# Score Reflection: prod-2026-03-21-201703889Z-3386d6a5

## 1. Task Attribution

- **tx_task_id**: 27
- **Task tier**: T3 (tasks 19–30), max score **6**
- **Prompt language**: Nynorsk
- **Task shape**: Register foreign-currency customer invoice payment with agio (FX gain)
- **Entities**: Elvdal AS / 964825114 / 10781 EUR, rate 11.03→11.41 NOK/EUR
- **Attempt**: 11th attempt on task 27

## 2. Correctness Verdict

**Perfect.** Correctness = 1.0, score_raw = 10/10, normalized_score = 6/6 (T3 max). All 4 checks passed.

| Check | Result |
|-------|--------|
| Check 1 | passed |
| Check 2 | passed |
| Check 3 | passed |
| Check 4 | passed |

Feedback: "4/4 checks passed."

## 3. Efficiency Verdict

**Optimal.** 5 API calls, 0 errors. Normalized score of 6 equals the T3 maximum and ties the leaderboard best_score of 6 (unchanged before→after). No efficiency penalty detected.

| Metric | Value |
|--------|-------|
| API calls | 5 |
| 4xx errors | 0 |
| Duration | 90,068 ms |
| Normalized score | 6 (max) |
| Leaderboard best (before) | 6 |
| Leaderboard best (after) | 6 |

The 5-call NOK fallback path (invoice + paymentType + payment + accountLookup + agioVoucher) is the canonical minimum for this task shape when the invoice is in company currency (NOK). No lower-call path exists:
- Can't skip invoice lookup (need to locate and identify the invoice)
- Can't skip paymentType lookup (ID is account-specific)
- Can't skip payment registration (core task)
- Can't skip account ID lookup (`account: { number }` in vouchers → 422)
- Can't skip manual agio voucher (NOK invoices don't auto-book FX)

## 4. Likely Root Cause

**No issues.** This run executed flawlessly. The trusted standard was followed exactly, every API call succeeded on the first attempt, and the final Tripletex state matched all 4 scoring checks.

The only prior risk factor for this task shape was agents failing to implement the manual agio voucher in the NOK fallback path (caused 50% scores in runs e0bd9a2b and 840df81a). This run correctly implemented the full 5-call NOK fallback with manual agio voucher on account 8060.

## 5. What Went Right

1. **Read trusted standard first** — the agent read the full `register-foreign-currency-customer-invoice-payment.md` before writing code, avoiding all documented API traps.
2. **Correct EUR/NOK branching** — script checked for genuine EUR invoice first (`currency.code !== "NOK"` AND `amount !== amountCurrency`), then fell back to NOK path when no EUR match found.
3. **Correct invoice matching** — matched `amountExcludingVat === 10781` on the NOK invoice, correctly identifying `amountOutstanding=13476.25` (10781 × 1.25).
4. **Correct payment type selection** — used `fields=*,debitAccount(*)` expansion, selected bank payment type by `debitAccount.number` range and `isBankAccount` flag.
5. **Correct simple payment** — used `paidAmount=amountOutstanding` without FX params on the NOK invoice (Tripletex ignores FX params on NOK invoices).
6. **Correct agio calculation** — 10781 × (11.41 − 11.03) = 10781 × 0.38 = 4096.78 NOK.
7. **Correct manual voucher** — used `row: 1` and `row: 2` (not row 0), `account: { id }` (not `{ number }`), debit 1920 + credit 8060 with `vatType: { id: 0 }`.
8. **Zero errors** — every call succeeded on the first attempt.
9. **Single script** — all 5 calls in one script execution, no retries or debug scripts.

## 6. What To Change Next Time

**Nothing.** This run achieved maximum score with minimum calls and zero errors. The trusted standard and playbook are validated for the NOK-fallback agio case with 2 consecutive production confirmations (86050544 and this run).

The only minor optimization identified during post-run sandbox investigation is reusing the paymentType `debitAccount.id` for the bank side of the agio voucher instead of looking it up separately via `GET /ledger/account`. This doesn't reduce call count (still need to look up 8060/8160) but is semantically cleaner. This has been documented in the trusted standard's sandbox proofs section.

The NOK-fallback disagio path (debit 8160, credit 1920) still lacks a full-score production confirmation — the only disagio attempt (e0bd9a2b) scored 50% because it skipped the manual voucher. Next time a disagio prompt appears, the agent should follow the same 5-call pattern with 8160 instead of 8060.
