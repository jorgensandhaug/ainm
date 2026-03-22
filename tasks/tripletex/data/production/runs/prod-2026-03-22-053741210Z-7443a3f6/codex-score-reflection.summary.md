# Score Reflection: prod-2026-03-22-053741210Z-7443a3f6

## Task Attribution

- **tx_task_id**: 07 (T1 tier, max score 2)
- **Task shape**: Register full payment on existing customer invoice
- **Prompt**: Portuguese — Floresta Lda / org 906739542 / 6800 NOK ex-VAT / "Consultoria de dados"
- **Trusted standard match**: `register-customer-invoice-payment.md` (exact match)

## Correctness Verdict

**Perfect correctness.** `correctness = 1.0`, `score_raw = 7/7`, `normalized_score = 2/2`. All 2/2 checks passed.

- Check 1: passed
- Check 2: passed

The final Tripletex state was exactly correct. The invoice was located by org number + ex-VAT amount + description, and paid using the live outstanding amount (8500 incl. VAT) via "Betalt til bank" payment type.

## Efficiency Verdict

**Maximum efficiency achieved.** `normalized_score = 2` matches the tier max of 2 and equals the leaderboard best_score for T07.

- Leaderboard before: best_score = 2, total_attempts = 25
- Leaderboard after: best_score = 2, total_attempts = 26
- This run tied the existing best — no regression, no improvement possible

The run used exactly 3 API calls with 0 errors:
1. `GET /invoice` (locate)
2. `GET /invoice/paymentType` (resolve payment type)
3. `PUT /invoice/{id}/:payment` (register payment)

3 calls is the proven minimum for this standalone task shape. No 2-call shortcut exists (sandbox re-verified: `paymentType(*)`, `paymentTypes(*)`, `payments(*)` field expansions on GET /invoice all return 400).

## Likely Root Cause

No issues. This was a textbook execution of the trusted standard with zero deviations. The only minor inefficiency was in the agent's preparation phase — it read 4 documentation files (2 trusted standards + 2 playbooks) when only the `register-customer-invoice-payment` trusted standard was needed. This did not cost API calls or cause errors, but consumed unnecessary context/time.

## What Went Right

1. **Correct task identification**: Recognized this as "register payment on existing invoice" (not "create order + invoice + payment") based on the Portuguese phrase "tem uma fatura pendente" (has a pending invoice)
2. **Followed trusted standard exactly**: 3-call canonical path with no deviations
3. **Correct field expansions**: `fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` on invoice read, `fields=*,debitAccount(*),creditAccount(*)` on payment type read
4. **Used live outstanding amount**: Paid 8500 (the invoice's `amountCurrencyOutstanding`), not the prompt's 6800 ex-VAT locator amount
5. **Query params on PUT /:payment**: Correctly sent `paymentDate`, `paymentTypeId`, `paidAmount` as query parameters, not JSON body
6. **Local filtering**: Filtered invoices locally by `customer.organizationNumber`, `amountExcludingVatCurrency`, positive outstanding, and description match — no server-side filter params that would be silently ignored
7. **Payment type selection**: Preferred "Betalt til bank" with debit account 1920
8. **Zero errors, zero wasted calls**: Perfect execution

## What To Change Next Time

Nothing material for this task shape. The execution was optimal. Minor process improvements:

1. **Read only the matching trusted standard** — do not also read the playbook or other trusted standards. The AGENTS.md instruction is explicit: "After reading the matched standard, immediately write and execute the script." Reading 4 files instead of 1 costs context window and thinking time without improving the outcome.
2. **This is the 17th consecutive successful production confirmation** of the 3-call register-customer-invoice-payment path across 7 languages (en, nb, nn, pt, es, fr, de). The flow is maximally stable. Future agents should treat this as the highest-confidence trusted standard in the system.
