# Score-Aware Reflection: prod-2026-03-21-233821110Z-6714382c

## 1. Task Attribution

- **Task ID**: 18 (T2 tier, max 4 points)
- **Task shape**: Reverse customer invoice payment
- **Prompt**: Nynorsk — reverse payment from Strandvik AS (859256333) for invoice "Nettverksteneste" (41550 kr excl. VAT)
- **Attempt**: #20 for this task

## 2. Correctness Verdict

**Perfect correctness.** `correctness=1`, `score_raw=8/8`, all 3/3 checks passed. The payment reversal produced the exact expected Tripletex state: invoice outstanding amount restored after reversing the payment voucher.

## 3. Efficiency Verdict

**Maximum score achieved.** `normalized_score=4` out of T2 max 4. This matches the leaderboard best_score of 4 (unchanged before/after). The run used the theoretical minimum of 2 API calls with 0 errors:

1. `GET /invoice?customerOrgNumber=859256333&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` — returned count=3, local filter on `amountExcludingVatCurrency === 41550` isolated the target
2. `PUT /ledger/voucher/608892429/:reverse?date=2026-03-22` — produced reverse voucher 609218552

No wasted calls. No avoidable errors. No verification re-read. This is the optimal path.

## 4. Likely Root Cause

No issues. The run executed the canonical 2-call trusted standard path flawlessly. The agent:
- Correctly identified this as an exact trusted-standard match
- Read the trusted standard before writing any script
- Used the correct field names (`amountExcludingVatCurrency`) for multi-invoice local filtering
- Accepted the `type=null` fallback payment posting without requiring `account.number`
- Skipped the optional verification read, trusting the reverse write's success

## 5. What Went Right

- **Standard match**: Instantly recognized the task as `reverse-customer-invoice-payment` trusted standard
- **Minimal reads**: Read only the trusted standard + playbook (no openapi.json)
- **Multi-invoice handling**: The GET returned count=3 (highest seen for this task shape), and the local filter on `amountExcludingVatCurrency === 41550` correctly isolated the target — first production proof of the count=3 case
- **Fallback matcher**: Correctly accepted the `type=null` negative `Betaling:` posting as the payment voucher without requiring `account.number`
- **No proof read**: Correctly omitted the optional verification GET, staying at the 2-call minimum
- **Zero errors**: No 4xx responses
- **Fast completion**: 63s total duration including scoring

## 6. What To Change Next Time

Nothing. This run is a template for how to execute this task shape. The next agent should:

1. Read the trusted standard `reverse-customer-invoice-payment.md` first
2. Write and execute the 2-call script immediately
3. Use `customerOrgNumber` filter + `amountExcludingVatCurrency` local filter (correct field name, not `amountExVat`)
4. Accept the `type=null` fallback payment posting regardless of `account` being null
5. Skip the verification read
6. This is the 13th consecutive optimal production run for this task shape across en/nb/nn/es/fr/de, confirming the standard is fully language-independent and stable
