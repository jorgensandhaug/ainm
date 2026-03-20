## 1. Task

Post-run learning pass for the exact payment-reversal run on Colline SARL invoice `"Maintenance"`.

Scope completed:
- reflected on the production run
- audited call efficiency
- re-proved the path in persistent sandbox
- updated existing guidance
- committed only the learning artifacts

## 2. Reflection

What went well:
- final production side effect was correct
- no `4xx` errors were introduced
- the first locate read already found the right invoice shape

What went poorly:
- the run used a debug/retry pattern instead of a single decisive locate read
- voucher extraction logic was too narrow
- the run spent an unnecessary final verification read for a score-first exact-match task

Correct approach:
- one decisive `GET /invoice` to isolate the paid outgoing invoice and its payment voucher
- one `PUT /ledger/voucher/{paymentVoucherId}/:reverse`
- stop

## 3. Call Efficiency

The production run was not minimal-call.

Actual production call pattern:
1. `GET /invoice` locate
2. `GET /invoice` debug rerun
3. `GET /invoice` final locate rerun
4. `PUT /ledger/voucher/{id}/:reverse`
5. `GET /invoice` verification

Realistic lower-call path for this exact task shape:
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=<run-date-plus-one-day>&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`
2. `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=<task-date>`

Wasted calls in the production run:
- 2 extra `GET /invoice` calls caused by local debug/retry after a too-narrow voucher heuristic
- 1 extra final `GET /invoice` that is not part of the score-optimal exact-match path

Score implication:
- likely lost efficiency on call count, not correctness
- no evidence of avoidable `4xx`; the penalty was the extra reads

## 4. Root Causes

- I assumed payment-voucher detection would usually rely on `posting.type=INCOMING_PAYMENT` or `INCOMING_PAYMENT_OPPOSITE`.
- In the real production invoice, the payment posting had `type=null`, so my first extraction rule failed.
- I treated invoice re-read verification as mandatory for the trusted path, but for this scored exact-match task the better rule is score-first: stop after the successful reverse write.
- Documentation bias contributed: the previous trusted/playbook wording pushed a 3-call “locate, reverse, verify” pattern instead of the true 2-call minimum.

## 5. Sandbox Verification

Persistent sandbox proof used a disposable fixture built on existing sandbox entities, then ran the reversal flow.

Verified facts:
- created order `401960687`
- created invoice `2147531258` / invoice number `38`
- paid it, then located it via one wide `GET /invoice`
- locate read showed:
  - invoice posting `voucherId=608828378`, `type=OUTGOING_INVOICE_CUSTOMER_POSTING`, `amountCurrency=1000`
  - payment posting `voucherId=608828379`, `type=null`, `amountCurrency=-1000`, `account.number=1500`, `description="Betaling: Faktura nummer 38 til Montanha Lda (10042)"`
- reversed with `PUT /ledger/voucher/608828379/:reverse?date=2026-03-20`
- reverse write returned voucher `608828380`
- proof-only later `GET /invoice` showed `amountCurrencyOutstanding=1000` again

Conclusion from sandbox:
- the score-optimal exact-match path is 2 calls
- the payment posting can be `type=null`
- the correct fallback is the unique negative customer-ledger payment posting, often `1500` plus payment text like `Betaling: ...`

## 6. Playbook Changes

Updated existing files:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [trusted-standards/reverse-customer-invoice-payment.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/reverse-customer-invoice-payment.md)
- [task-playbooks/reverse-customer-invoice-payment.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/reverse-customer-invoice-payment.md)

Changes made:
- changed reverse-payment trusted path from 3-call default to 2-call score-first default
- kept final invoice read as optional proof branch only
- added the `type=null` payment-posting fallback heuristic
- updated common endpoint guidance and AGENTS gotcha text to match the lower-call path

No new trusted standard or playbook was created.

## 7. Commit

Commit hash: `d50d499139e44b73044c3077a23affd5398840a8`

Commit message: `tripletex playbook: optimize reverse payment path`

## 8. Reusable Heuristics

- For exact outgoing customer-invoice payment reversals, default to 2 calls: one decisive invoice read, one voucher reverse write.
- Do not spend an automatic final invoice verification read in scored exact-match runs.
- On `GET /invoice`, use `postings(...)`, never `payments(...)`.
- Do not rely only on `posting.type` for payment-voucher extraction.
- If no `INCOMING_PAYMENT`-typed posting exists, look for the unique negative customer-ledger payment posting instead.
- Strong fallback signature: `amount < 0`, `account.number=1500`, payment text like `Betaling: ...`, distinct `voucherId`.
- Treat prompt ex-VAT amount as a locate key only, not as the reopened-balance truth source.
- Only add a final `GET /invoice` when the prompt explicitly scores balance proof or the first read leaves real ambiguity.