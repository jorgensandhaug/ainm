# Reverse Customer Invoice Payment

## Scope

Use for tasks like:
- reverse one already-registered payment on an existing outgoing customer invoice
- reopen the invoice outstanding amount after the bank returned or rejected the payment
- locate the invoice from prompt facts such as customer organization number, ex-VAT amount, and line/service description

Do not use for:
- registering a new payment
- creating the invoice itself
- supplier-invoice payment reversals
- ambiguous prompts where several paid invoices or several payment vouchers could fit

## Key Findings

- The correct write is `PUT /ledger/voucher/{id}/:reverse`, not `PUT /invoice/{id}/:payment`
- `GET /invoice` requires both `invoiceDateFrom` and `invoiceDateTo`
- For outgoing invoices, payment voucher discovery works from `postings(...)`
- `fields=...payments(...)` on `GET /invoice` can fail with `400 Illegal field in fields filter: payments ... InvoiceDTO`
- The score-optimal exact-match path is usually 2 Tripletex API calls, not 3: one decisive invoice read, then the voucher-reverse write, then stop
- A prompt ex-VAT amount can be only a locate key; the post-reversal verification target should come from the invoice object's own pre-reversal total, usually `amountCurrency` or `amount`
- A final `GET /invoice?...id=<invoiceId>` is only an optional proof branch; it is not part of the score-optimal exact-match path
- Payment-voucher detection must not rely only on `posting.type`; the payment posting can be `type=null` while still being the unique negative `1500` customer-ledger posting with `description` like `Betaling: ...`
- a direct `GET /invoice/{id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*))),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` can already expose enough reversal evidence on one invoice: top-level `orderLines[].description` / `displayName` carry the service text, and `postings[]` can show the null-typed negative `1500` payment posting
- persistent sandbox on 2026-03-20 also showed a proof-only trap: a freshly created paid invoice was immediately readable on `GET /invoice/{id}` but absent from the broader same-day `/invoice` search; treat that as sandbox search lag or indexing noise, not as a reason to add `GET /customer`, extra paging, or automatic verify reads to the production exact-match path

Verified on 2026-03-20 in persistent sandbox with a disposable customer/product/order fixture:
- created customer `108245278`
- created product `84385870`
- created order `401957843`
- invoiced it as invoice `2147527118` / invoice number `16`
- paid it with payment type `32813748` (`Betalt til bank`)
- `GET /invoice?...&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` exposed the payment voucher id `608824977`
- `PUT /ledger/voucher/608824977/:reverse?date=2026-03-20` returned reverse voucher `608824978`
- the final `GET /invoice?...id=2147527118&fields=*,postings(*,voucher(*))` showed `amountCurrencyOutstanding=1000` again

Re-verified on 2026-03-20 in persistent sandbox with another disposable fixture:
- created customer `108247071`
- created product `84386675`
- created order `401959818`
- invoiced it as invoice `2147529999`
- paid it with payment type `32813748`
- `GET /invoice?...&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` exposed payment voucher `608827344`
- `PUT /ledger/voucher/608827344/:reverse?date=2026-03-20` returned reverse voucher `608827345`
- the final `GET /invoice?...id=2147529999&fields=*,postings(*,voucher(*))` showed `amountCurrencyOutstanding=1000` again

Re-verified on 2026-03-20 in persistent sandbox with another disposable fixture focused on call efficiency:
- created order `401960687`
- invoiced it as invoice `2147531258` / invoice number `38`
- paid it with payment type `32813747`
- the locate read showed two relevant customer-ledger postings:
  - invoice posting `voucherId=608828378`, `type=OUTGOING_INVOICE_CUSTOMER_POSTING`, `amountCurrency=1000`
  - payment posting `voucherId=608828379`, `type=null`, `amountCurrency=-1000`, `account.number=1500`, `description="Betaling: Faktura nummer 38 til Montanha Lda (10042)"`
- `PUT /ledger/voucher/608828379/:reverse?date=2026-03-20` returned reverse voucher `608828380`
- one later proof-only `GET /invoice?...id=2147531258&fields=*,postings(*,voucher(*))` showed `amountCurrencyOutstanding=1000` again
- therefore the score-optimal exact-match production path is 2 calls, while the 3rd invoice read remains only an optional proof branch outside the minimum path

## Minimal Flow

1. Confirm these operations in `./openapi.json`
   - `GET /invoice`
   - `PUT /ledger/voucher/{id}/:reverse`
2. Locate the exact paid invoice with one decisive read
   - usually `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`
3. Filter locally to one invoice
   - exact customer organization number if provided
   - exact ex-VAT amount from `amountExcludingVatCurrency` or `amountExcludingVat`
   - prompt text match in `orderLines[].description`, `orderLines[].displayName`, `orders[].invoiceComment`, or nearby invoice text fields
   - fully paid state before reversal: `amountCurrencyOutstanding = 0` or `amountOutstanding = 0`
4. Extract one payment voucher id from `postings[]`
   - prefer vouchers referenced by `type=INCOMING_PAYMENT` or `type=INCOMING_PAYMENT_OPPOSITE`
   - if no such typed posting exists, accept the unique negative customer-ledger payment posting instead
   - in practice that fallback is often `account.number=1500` plus payment text such as `Betaling: ...`, even when `posting.type` is `null`
5. Reverse that voucher
   - `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=<reverse-date>`
6. Stop for the score-optimal exact-match path
7. Only if explicit proof is needed, verify the invoice balance reopened
   - `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&id=<invoiceId>&fields=*,postings(*,voucher(*))`
   - confirm `amountCurrencyOutstanding` or `amountOutstanding` equals the pre-reversal invoice balance from the first invoice read, not the prompt ex-VAT lookup amount

## Exact-Match Fast Path

- For a standard prompt that names one paid outgoing invoice strongly enough, the winning score-first path is usually 2 Tripletex API calls:
  1. `GET /invoice`
  2. `PUT /ledger/voucher/{paymentVoucherId}/:reverse`
- Only add the third call below when explicit proof is worth the extra score cost:
  3. `GET /invoice`
- Do not add `GET /customer`, `GET /ledger/voucher/{id}`, or `GET /ledger/posting` unless the first invoice read is genuinely ambiguous

## OpenAPI Navigation Trap

- The outgoing invoice endpoint returns `InvoiceDTO`
- Nearby invoice-related schemas elsewhere in `./openapi.json` mention `payments`, but that does not make `payments` a valid field filter on `GET /invoice`
- For this task shape, trust the endpoint response behavior and use `postings` for payment-voucher discovery

## Verification Shape

- Expect the reverse write to return `ResponseWrapperVoucher`
- Reuse the first invoice read for:
  - invoice id
  - payment voucher id
- only if you choose the optional proof branch, also reuse the first invoice read for the expected reopened outstanding amount
- if you do choose the optional proof branch, expect the final invoice verification read to return `ListResponseInvoice`
- do not add another voucher read if the optional final invoice read already proves the reopened balance

## Avoidable Mistakes

- Do not call `PUT /invoice/{id}/:payment` to undo a payment
- Do not send `fields=...payments(...)` on `GET /invoice`
- Do not reverse the original invoice voucher when the prompt is about the payment voucher
- Do not assume the payment voucher will always surface under `posting.type=INCOMING_PAYMENT`; a real matching payment posting can have `type=null`
- Do not spend an automatic final `GET /invoice` in an exact-match scored run once the right payment voucher has been isolated and successfully reversed
- Do not verify the reopened balance against the prompt ex-VAT amount when the invoice object itself carries the true gross/pre-reversal balance
- Do not add separate `GET /ledger/voucher/{id}` or `GET /ledger/posting` reads when the first invoice read already isolates one payment voucher
- Do not treat one persistent-sandbox miss on the broad `/invoice` search as evidence that production needs an extra `GET /customer` or `GET /invoice/{id}` by default; the winning production path stays the 2-call locate-then-reverse flow
