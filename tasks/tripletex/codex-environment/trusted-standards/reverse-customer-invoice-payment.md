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
3. `GET /invoice?...&id=<invoiceId>&fields=*,postings(*,voucher(*))` to verify the invoice outstanding amount reopened
4. stop

## Payload Rules
- identify the invoice from prompt facts such as customer organization number, ex-VAT amount, and service text
- treat a prompt ex-VAT amount as a locate key, not as the post-reversal verification target
- prefer the prompt-provided reversal date; otherwise use the task date
- extract the payment voucher id from `postings[]`, not from a guessed invoice field
- for single-payment invoices, the payment voucher is usually the unique voucher referenced by postings with `type=INCOMING_PAYMENT` or `type=INCOMING_PAYMENT_OPPOSITE`, or by negative payment postings

## Reuse From Read / Write Responses
- from the first invoice read:
  - `invoice.id`
  - the expected reopened outstanding amount from the invoice object itself, usually `amountCurrency` or `amount`
  - `paymentVoucherId`
- from `PUT /ledger/voucher/{id}/:reverse`:
  - `value.id` of the reverse voucher

## Verification
- do one decisive invoice re-read after the reversal
- verify `amountCurrencyOutstanding` or `amountOutstanding` equals the expected reopened balance captured from the first invoice read, not the prompt lookup amount
- do not spend an extra voucher read if the invoice verification already proves the scored state

## Known Recovery Branches
- if the first invoice read yields multiple paid invoices, narrow locally with the prompt identifiers before writing
- if several payment vouchers remain after prompt-based filtering, stop treating the task as an exact-match standard and inspect the specific vouchers more carefully

## OpenAPI / Sandbox Status
- `/invoice` and `/ledger/voucher/{id}/:reverse` verified in `./openapi.json`
- exact reverse-payment flow re-proven on 2026-03-20 in sandbox and production
- sandbox re-proof on 2026-03-20 again confirmed the 3-call reversal path once the paid invoice already existed: locate invoice, reverse payment voucher, re-read invoice
- `GET /invoice` for outgoing invoices rejects `fields=...payments(...)`; use `postings(...)` instead
