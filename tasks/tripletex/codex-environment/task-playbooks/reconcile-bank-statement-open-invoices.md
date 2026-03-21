# Reconcile Bank Statement With Open Invoices

## Scope

Use for tasks like:
- parse an attached bank statement CSV
- match incoming bank lines to open customer invoices
- match outgoing bank lines to open supplier invoices
- register the corresponding payments
- handle partial payments correctly

Do not use for:
- generic bank-booking tasks that do not mention invoices
- tasks that explicitly require the Tripletex bank-reconciliation UI/API objects themselves

## Critical Timing Rule

The task has a hard 300s budget. Do not spend time on debug scripts, exploratory reads, or multiple fallback strategies within the same run. Plan the full flow before the first API call, execute it in one script, and stop.

## Production Run Failures (2026-03-21)

### English run (task 23, score 0/0)
- the agent matched 5 customer incoming payments correctly via `PUT /invoice/{id}/:payment`
- all 5 customer payments succeeded (4 full, 1 partial at 5156.25 on outstanding 10312.5)
- supplier side: `GET /supplierInvoice` (both filtered and unfiltered) returned 0 results for all suppliers in the account
- the agent then wasted the remaining 300s budget on exploratory debug scripts trying alternative supplier lookup strategies
- the run timed out with `completion_reason: "timeout"`
- the score was 0/1 with `0/0 checks passed` and empty `feedback_checks`
- best_score for task 23 remains 0 across 2 attempts

### Earlier French run
- the first resolver assumptions were too literal
- the bank text `Faktura 1001` .. `1005` did not equal Tripletex `invoiceNumber`
- the live open customer invoices were `1` .. `5`, and the decisive signal was customer name plus amount plus the open-invoice inventory
- `/incomingInvoice*` was a pure waste branch

## Proven Customer-Side Path

Persistent sandbox re-proof on 2026-03-21:
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*)`
- `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<amount>`
- the write response reduced `amountCurrencyOutstanding` and proves the payment registered

Implications:
- incoming customer payments should still use `/invoice/{id}/:payment`
- for partial payments, send the bank amount, not the full outstanding amount
- for bank-statement prompts with several customer lines, prefer one decisive `GET /invoice?...count=1000...` over one read per invoice
- resolve the incoming payment type once per run and reuse it
- prefer debit-account 1920 when selecting the payment type

## Supplier-Side Path

### Proven findings from 2026-03-21 sandbox

1. Production accounts can have 0 `/supplierInvoice` objects even when open supplier postings exist on account 2400
2. Manual vouchers on 2400 (debit 6300 expense, credit 2400 supplier) create open supplier postings but do NOT create `/supplierInvoice` objects
3. `:addPayment` requires a registered supplier invoice; unregistered ones fail `422 Cannot add payment to unregistered voucher`
4. `:approve` fails on imported voucher types with `422 Denne bilagstypen kan ikke attesteres.`
5. `putPostings` with `sendToLedger=true` fails on vouchers that already have postings

### Supplier payment via manual voucher (proven sandbox 2026-03-21)

When no `/supplierInvoice` objects exist for a supplier, book the outgoing payment as a manual voucher:
- debit account 2400 (supplier liability) with `supplier: { id: <supplierId> }`
- credit account 1920 (bank)
- use `amountGross` / `amountGrossCurrency` with positive on debit, negative on credit
- include `row: 1` and `row: 2` on the postings (row 0 is system-reserved)

Sandbox proof:
```
POST /ledger/voucher with body:
{
  date: "2026-03-21",
  description: "Payment to supplier",
  postings: [
    { row: 1, date: "2026-03-21", account: { id: <2400_id> }, amountGross: 10000, amountGrossCurrency: 10000, supplier: { id: <supplierId> } },
    { row: 2, date: "2026-03-21", account: { id: <1920_id> }, amountGross: -10000, amountGrossCurrency: -10000 }
  ]
}
```
This created voucher `608909971` successfully.

### What is safe
- never use `/incomingInvoice*` in scored runs for this repo
- first resolve supplier ids from one `GET /supplier?count=1000&fields=*`
- then query `/supplierInvoice` with `supplierId=...`
- if supplier-specific `/supplierInvoice` returns payable rows, use `POST /supplierInvoice/{id}/:addPayment`
- if no `/supplierInvoice` objects exist, fall back to manual voucher payment (debit 2400, credit 1920)
- to resolve account ids for manual voucher, use one `GET /ledger/account?number=2400,1920&fields=*`

### What is unsafe
- do not trust an empty unfiltered `GET /supplierInvoice?...` as proof that no supplier invoices exist
- do not trust `voucherId=` lookup on `/supplierInvoice` as a decisive resolver
- do not assume `POST /supplierInvoice/{id}/:addPayment` is always usable on imported supplier invoices
- do not spend calls on `:approve` or `putPostings` retries after the validation errors above

## Minimal-Call Guidance

### Incoming-only (no outgoing supplier lines)
1. parse CSV locally
2. `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)`
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*)`
4. `PUT /invoice/{id}/:payment` once per matched incoming line
- **total: 2 reads + N customer payments**

### Mixed incoming/outgoing runs
1. parse CSV locally
2. `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)`
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*)`
4. `GET /supplier?count=1000&fields=*`
5. `GET /supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)` (unfiltered first to check if ANY exist)
6. if supplier invoices exist: `POST /supplierInvoice/{id}/:addPayment` per match; also `GET /ledger/paymentTypeOut?count=1000&fields=*,creditAccount(*)`
7. if NO supplier invoices exist: `GET /ledger/account?number=2400,1920&fields=*` then `POST /ledger/voucher` per supplier payment
8. `PUT /invoice/{id}/:payment` once per matched incoming line
- **total: 4-5 reads + N customer payments + M supplier payments**

### Critical: do not split into multiple scripts or debug passes
- write one comprehensive script that handles the complete flow
- if supplier invoices return 0, immediately fall back to manual voucher path in the same script
- do not spawn debug scripts that consume the 300s budget

## Matching Heuristics

### Customer incoming lines
- match on the combination of:
  - normalized customer name from the bank text (case-insensitive contains)
  - bank amount vs. live positive outstanding amount
  - live open-invoice inventory
- do not require the bank text invoice label to equal Tripletex `invoiceNumber`
- when multiple invoices match the customer name:
  1. try exact outstanding amount match first
  2. if no exact match, pick the invoice with smallest outstanding >= bankAmount (best partial payment candidate)
  3. if still multiple, pick the one with the lowest invoiceNumber
- when bank amount < outstanding, register the bank amount as partial payment
- when bank amount == outstanding, register as full payment
- after each payment, update the local outstanding value for subsequent matches (same customer may have multiple bank lines)

### Supplier outgoing lines
- match on supplier name (case-insensitive contains)
- the bank `Ut` amount is negative; use `Math.abs()` for the payment amount
- when multiple supplier invoices match, prefer exact amount match, then smallest outstanding >= bankAmount
- for manual voucher payments, match supplier name to supplier id

### Non-invoice lines
- lines like "Renteinntekter", "Skattetrekk" are not invoice-related
- skip these lines during reconciliation (they are interest income, tax deductions, etc.)
- do not try to match them to invoices

## `/ledger/posting/openPost` Parameter Notes
- requires `date` parameter (NOT `dateFrom`/`dateTo`)
- `date` is a cutoff: postings dated before this date, format `YYYY-MM-DD`
- use `date=2031-01-01` for a future-proof cutoff
- `supplierId` filter works for linked supplier postings
- returns posting ids, not supplier-invoice ids; not a drop-in replacement for `/supplierInvoice`

## Pitfalls To Avoid

- `/incomingInvoice*` is beta-only; treat it as dead
- unfiltered `/supplierInvoice` can be misleading (may return 0 even when supplier-filtered returns rows)
- `voucherId=` on `/supplierInvoice` can be misleading
- imported supplier-invoice objects can reject `:addPayment` with `422 Cannot add payment to unregistered voucher`
- `:approve` fails on imported voucher types
- `putPostings` fails on vouchers that already have postings
- do not overfit to sandbox noise such as already-credited customer invoices when selecting proof targets
- do not spend the 300s budget on debug/exploration scripts after the main work
- always include `row: 1` and `row: 2` on manual voucher postings (row 0 is system-reserved)
