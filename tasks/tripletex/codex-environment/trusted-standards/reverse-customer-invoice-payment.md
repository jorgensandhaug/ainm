# Reverse Customer Invoice Payment

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- reverse one already-registered payment on one existing outgoing customer invoice
- prompt identifies the paid invoice strongly enough to find it in one decisive read
- prompt does not require creating the invoice first

## Do Not Use This Standard If
- the task includes creating or paying the invoice first
- the prompt is too ambiguous to isolate one invoice or one payment voucher safely
- the task is a supplier-invoice payment reversal

## Standard Flow
1. `GET /invoice?...&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` to identify the exact paid invoice and extract its payment voucher id
2. `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=<reverse-date>`
3. stop
4. only if the task or local uncertainty truly requires explicit balance proof, `GET /invoice?...&id=<invoiceId>&fields=*,postings(*,voucher(*))` to verify the invoice outstanding amount reopened

## Payload Rules
- identify the invoice from prompt facts such as customer organization number, ex-VAT amount, and service text
- treat a prompt ex-VAT amount as a locate key, not as the post-reversal verification target
- prefer the prompt-provided reversal date; otherwise use the task date
- extract the payment voucher id from `postings[]`, not from a guessed invoice field
- for single-payment invoices, the payment voucher is usually the unique voucher referenced by postings with `type=INCOMING_PAYMENT` or `type=INCOMING_PAYMENT_OPPOSITE`
- if no such typed posting exists, accept the unique negative customer-ledger payment posting instead, typically `account.number=1500` with payment-style text such as `Betaling: ...`; the payment posting `type` can be `null`

## Reuse From Read / Write Responses
- from the first invoice read:
  - `invoice.id`
  - `paymentVoucherId`
  - only if you plan the optional verification read, the expected reopened outstanding amount from the invoice object itself, usually `amountCurrency` or `amount`
- from `PUT /ledger/voucher/{id}/:reverse`:
  - `value.id` of the reverse voucher

## Verification
- for exact-match scored runs, the default fast path is no verification read after the successful reverse write
- only do one decisive invoice re-read after the reversal when the prompt explicitly requires balance proof or the locate step left enough ambiguity that the extra read materially reduces risk
- on that optional re-read, verify `amountCurrencyOutstanding` or `amountOutstanding` equals the expected reopened balance captured from the first invoice read, not the prompt lookup amount
- do not spend an extra voucher read if the optional invoice verification already proves the scored state

## Known Recovery Branches
- if the first invoice read yields multiple paid invoices, narrow locally with the prompt identifiers before writing
- if several payment vouchers remain after prompt-based filtering, stop treating the task as an exact-match standard and inspect the specific vouchers more carefully

## OpenAPI / Sandbox Status
- `/invoice` and `/ledger/voucher/{id}/:reverse` verified in `./openapi.json`
- exact reverse-payment flow re-proven on 2026-03-20 in sandbox and production
- sandbox re-proof on 2026-03-20 confirmed the score-optimal 2-call exact-match path once the paid invoice already existed: locate invoice, reverse payment voucher, stop
- the same sandbox proof on 2026-03-20 also confirmed the optional third-call verification branch: a later invoice read showed the outstanding amount reopened correctly after the reverse write
- persistent sandbox fixture invoice `38` / invoice id `2147531258` showed the payment posting as `amountCurrency=-1000`, `account.number=1500`, `description="Betaling: Faktura nummer 38 til Montanha Lda (10042)"`, `voucherId=608828379`, and `type=null`
- additional persistent-sandbox proof on 2026-03-20 with disposable invoice `56` / invoice id `2147536442` showed that `GET /invoice/{id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*))),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` already exposed the service text in top-level `orderLines[].description` / `displayName` and the reverse target as the unique negative `1500` posting with `type=null`
- that same persistent-sandbox proof also showed one sandbox-only trap: a broad same-day `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-20&count=1000...` omitted that freshly created paid invoice even though `GET /invoice/{id}` returned it immediately; do not let that sandbox omission push the production exact-match standard toward extra resolver calls
- `GET /invoice` for outgoing invoices rejects `fields=...payments(...)`; use `postings(...)` instead
