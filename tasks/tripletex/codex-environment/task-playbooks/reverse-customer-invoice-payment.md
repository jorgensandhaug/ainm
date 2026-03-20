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
- invoices whose payment-style postings still share the exact same `voucher.id` as the original invoice posting, such as after a combined `PUT /order/{id}/:invoice?...paymentTypeId=...` prepayment flow

## Key Findings

- The correct write is `PUT /ledger/voucher/{id}/:reverse`, not `PUT /invoice/{id}/:payment`
- `GET /invoice` requires both `invoiceDateFrom` and `invoiceDateTo`
- For outgoing invoices, payment voucher discovery works from `postings(...)`
- `fields=...payments(...)` on `GET /invoice` can fail with `400 Illegal field in fields filter: payments ... InvoiceDTO`
- The score-optimal exact-match path is usually 2 Tripletex API calls, not 3: one decisive invoice read, then the voucher-reverse write, then stop
- A prompt ex-VAT amount can be only a locate key; the post-reversal verification target should come from the invoice object's own pre-reversal total, usually `amountCurrency` or `amount`
- A final `GET /invoice?...id=<invoiceId>` is only an optional proof branch; it is not part of the score-optimal exact-match path
- Payment-voucher detection must not rely only on `posting.type`; the payment posting can be `type=null` while still being the unique negative payment-style posting with `description` like `Betaling: ...`
- do not make the fallback matcher depend on `account.number`; `1500` is common, but some real locate reads return the same winning payment posting with `account=null`
- if the invoice posting and the negative payment-style postings all share one `voucher.id`, do not reverse that shared voucher as if it were a standalone returned payment; treat that as a different shape than the ordinary exact-match reversal task
- a direct `GET /invoice/{id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*))),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` can already expose enough reversal evidence on one invoice: top-level `orderLines[].description` / `displayName` carry the service text, and `postings[]` can show the null-typed negative payment posting even when the account expansion is absent
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

Re-verified on 2026-03-20 in persistent sandbox with another disposable fixture aimed at the missing-account case:
- created product `84388586`
- created customer `108260054`
- created order `401965073`
- invoiced it as invoice `2147537052` / invoice number `64`
- paid it with payment type `32813748`
- the decisive locate read showed the real reverse target as:
  - `type=null`
  - `description="Betaling: Faktura nummer 64 til Reflection Reverse Customer 1774032662638 (10076)"`
  - `amountCurrency=-1000`
  - `voucherId=608833573`
  - `account=null`
- `PUT /ledger/voucher/608833573/:reverse?date=2026-03-20` returned reverse voucher `608833574`
- one proof-only `GET /invoice?...id=2147537052&fields=*,postings(*,voucher(*),account(*))` showed `amountCurrencyOutstanding=1000` again
- therefore the fallback matcher must accept the unique negative `Betaling: ...` posting even when `account` is missing; rejecting it would waste an extra locate read without improving correctness

Re-verified on 2026-03-20 in persistent sandbox with another disposable fixture using a Portuguese-like service description:
- created product `84388624`
- created customer `108260584`
- created order `401965212`
- invoiced it as invoice `2147537237` / invoice number `66`
- paid it with payment type `32813748`
- broad `GET /invoice?...id=2147537237...` still returned `values=[]`, so the proof branch had to use direct `GET /invoice/2147537237`
- that direct invoice read exposed the correct reverse target as:
  - `type=null`
  - `description="Betaling: Faktura nummer 66 til Reflection Reverse Null Account Customer 1774032887559 (10078)"`
  - `amountCurrency=-1000`
  - `voucherId=608833742`
  - `account=null`
- `PUT /ledger/voucher/608833742/:reverse?date=2026-03-20` returned reverse voucher `608833743`
- the final direct invoice read showed `amountCurrencyOutstanding=1000` again
- this re-confirmed the exact production lesson: for the fallback matcher, ignore `account.number` entirely and trust the unique negative `Betaling: ...` posting

Observed production miss on 2026-03-20:
- exact prompt shape `customer.organizationNumber=888412972` + `amountExcludingVatCurrency=35800` + line text `Diseño web`
- the first decisive `GET /invoice` already returned the correct paid invoice and the real payment posting:
  - `type=null`
  - `description="Betaling: Faktura nummer 1 til Montaña SL (10001)"`
  - `amountCurrency=-44750`
  - `voucherId=608775910`
  - `account=null`
- the run still finished correctly, but it lost the efficiency point because the local resolver over-required `account.number=1500`, threw away the winning voucher candidate, and forced one extra `GET /invoice`
- lower-call replacement for the next agent: treat the first locate read as sufficient and reverse that voucher immediately

Observed production confirmation on 2026-03-20:
- exact prompt shape `customer.organizationNumber=998536561` + `amountExcludingVatCurrency=32350` + line text `Programvarelisens`
- the run finished in the canonical 2-call path:
  - one decisive `GET /invoice?...fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`
  - one `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=2026-03-20`
- no follow-up proof read was needed; the side effect itself was the scored target

Observed sandbox proof nuance on 2026-03-20:
- disposable invoice `76` / invoice id `2147538250` was created unpaid, then paid through standalone `PUT /invoice/{id}/:payment`, and its payment reversal worked normally through standalone voucher `608834712`
- an earlier failed disposable proof paid during the combined `PUT /order/{id}/:invoice?...paymentTypeId=...` write and produced one shared voucher containing both the invoice posting and the payment-style postings
- therefore that combined-prepayment shape must not be treated as an ordinary standalone-payment-reversal exact match

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
   - in practice that fallback often has payment text such as `Betaling: ...`, and `account.number=1500` may be present
   - but the matcher should ignore `account.number` completely; if the same unique negative `Betaling: ...` posting comes back with `account=null`, it is still the correct reverse target
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
- Do not require `posting.account.number=1500` before accepting the fallback payment posting; some real exact-match reads omit the `account` expansion entirely
- Do not spend an automatic final `GET /invoice` in an exact-match scored run once the right payment voucher has been isolated and successfully reversed
- Do not verify the reopened balance against the prompt ex-VAT amount when the invoice object itself carries the true gross/pre-reversal balance
- Do not add separate `GET /ledger/voucher/{id}` or `GET /ledger/posting` reads when the first invoice read already isolates one payment voucher
- Do not treat one persistent-sandbox miss on the broad `/invoice` search as evidence that production needs an extra `GET /customer` or `GET /invoice/{id}` by default; the winning production path stays the 2-call locate-then-reverse flow
