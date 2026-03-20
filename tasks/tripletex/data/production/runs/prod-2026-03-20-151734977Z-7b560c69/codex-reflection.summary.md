## 1. Task

Reverse the returned bank payment on Étoile SARL invoice identified by org no `835510131`, description `Session de formation`, and lookup amount `19650 NOK` excluding VAT, so the invoice shows unpaid again.

## 2. Reflection

What went well:
- I matched the task to the correct trusted standard immediately.
- I used the correct production write on the first try: `PUT /ledger/voucher/{paymentVoucherId}/:reverse`.
- Production had no `4xx`; the payment reversal itself succeeded.

What went poorly:
- My local verifier used the prompt ex-VAT amount as the expected reopened balance.
- The invoice reopened correctly, but my script treated the successful reversal as a failure because the reopened balance was the invoice’s true gross/pre-reversal balance, not the prompt lookup amount.
- That false negative caused one unnecessary follow-up read-only rerun.

Correct approach:
- Use the prompt ex-VAT amount only to locate the invoice.
- From the first `GET /invoice`, capture the invoice’s own pre-reversal total, usually `amountCurrency` or `amount`.
- After `PUT /ledger/voucher/{id}/:reverse`, verify the reopened outstanding amount against that captured invoice total.

## 3. Call Efficiency

The production run was not minimal-call.

Used:
- `GET /invoice` locate
- `PUT /ledger/voucher/{id}/:reverse`
- `GET /invoice` verify
- extra `GET /invoice` on rerun after the reversal was already complete

Wasted calls:
- 1 extra `GET /invoice` caused by the bad verification assumption

Fewest realistic calls for this exact task shape:
- 3 calls total
- `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`
- `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=<task-date>`
- `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&id=<invoiceId>&fields=*,postings(*,voucher(*))`

Why 3 is minimal here:
- The prompt did not provide the invoice id or payment voucher id.
- One decisive read was needed to locate the invoice and payment voucher safely.
- One write was needed to reverse.
- One final read was needed to prove the invoice balance reopened.

## 4. Root Causes

- I deviated from the trusted-standard rule to reuse the expected reopened balance from the first invoice read.
- I over-trusted the human prompt amount as a verification target instead of treating it as a locator.
- I did not encode the distinction between invoice identification fields and invoice-state verification fields strongly enough in the script.

## 5. Sandbox Verification

I re-proved the reversal path in persistent sandbox.

Fixture created:
- customer `108247071`
- product `84386675`
- order `401959818`
- invoice `2147529999`

Proof path:
- paid invoice `2147529999` with payment type `32813748`
- locate read exposed payment voucher `608827344`
- reversed with `PUT /ledger/voucher/608827344/:reverse?date=2026-03-20`
- reverse write returned voucher `608827345`
- final invoice read showed `reopenedOutstanding=1000`

Important sandbox note:
- this sandbox account currently exposed only outgoing VAT code `6` (`0%`) via `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
- the 3-call reversal subpath was still re-proven once the paid invoice existed

## 6. Playbook Changes

I updated existing guidance; I did not create new files.

Changed paths:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `trusted-standards/reverse-customer-invoice-payment.md`
- `task-playbooks/reverse-customer-invoice-payment.md`

What changed:
- explicitly documented that prompt ex-VAT amounts are locate keys only in outgoing payment-reversal tasks
- explicitly documented that post-reversal verification must use the invoice object’s own pre-reversal total from the first read, usually `amountCurrency` or `amount`
- added fresh sandbox re-proof details to the reversal playbook

## 7. Commit

- Hash: `b3eb4851698ebeb51d7f12f3c2ce8c9f20c0fda3`
- Message: `tripletex playbook: tighten payment reversal verification`

## 8. Reusable Heuristics

- In reversal tasks, separate locate fields from verify fields.
- If the prompt names an ex-VAT amount, do not assume the reopened balance will equal that amount.
- On outgoing invoice reads, use `postings(...)`, never `payments(...)`, to discover the payment voucher.
- For this task shape, if the first read uniquely identifies the paid invoice, stop at the standard 3-call path. No customer read, no voucher read, no posting read.
- When the trusted standard says “reuse the first read’s expected balance,” implement that literally.