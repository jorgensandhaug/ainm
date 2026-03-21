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

## Production Run Results (2026-03-21)

### Nynorsk run (task 23, 13 calls, 0 errors)
- 5 customer payments via `PUT /invoice/{id}/:payment` (4 full + 1 partial 6500 of 13000 outstanding)
- `GET /supplierInvoice` returned 0 results; fell back to manual voucher path
- 3 supplier payments via 3 separate `POST /ledger/voucher` (debit 2400, credit 1920)
- total: 5 reads + 5 customer payments + 3 supplier vouchers = 13 calls
- **wasted 2 calls**: the 3 supplier vouchers should have been 1 combined voucher with 6 postings (sandbox proof below)

### Earlier English run (task 23, score 0/0)
- the agent matched 5 customer incoming payments correctly via `PUT /invoice/{id}/:payment`
- all 5 customer payments succeeded (4 full, 1 partial at 5156.25 on outstanding 10312.5)
- supplier side: `GET /supplierInvoice` (both filtered and unfiltered) returned 0 results for all suppliers in the account
- the agent then wasted the remaining 300s budget on exploratory debug scripts trying alternative supplier lookup strategies
- the run timed out with `completion_reason: "timeout"`

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
- for row numbering, start at `row: 1` (row 0 is system-reserved) and increment per posting

### Combined voucher for multiple supplier payments (proven sandbox 2026-03-21)

When multiple supplier payments exist, combine ALL of them into ONE `POST /ledger/voucher` with 2M postings (M = number of supplier payments). This saves M-1 API calls vs. creating separate vouchers.

Sandbox proof (voucher `609057796`):
```
POST /ledger/voucher with body:
{
  date: "<earliest-payment-date>",
  description: "Bank reconciliation - supplier payments",
  postings: [
    { row: 1, date: "2026-01-27", account: { id: <2400_id> }, amountGross: 11500, amountGrossCurrency: 11500, supplier: { id: <sup1_id> } },
    { row: 2, date: "2026-01-27", account: { id: <1920_id> }, amountGross: -11500, amountGrossCurrency: -11500 },
    { row: 3, date: "2026-01-30", account: { id: <2400_id> }, amountGross: 6400, amountGrossCurrency: 6400, supplier: { id: <sup2_id> } },
    { row: 4, date: "2026-01-30", account: { id: <1920_id> }, amountGross: -6400, amountGrossCurrency: -6400 },
    { row: 5, date: "2026-02-01", account: { id: <2400_id> }, amountGross: 6200, amountGrossCurrency: 6200, supplier: { id: <sup3_id> } },
    { row: 6, date: "2026-02-01", account: { id: <1920_id> }, amountGross: -6200, amountGrossCurrency: -6200 }
  ]
}
```
Key findings:
- individual posting dates are preserved per-posting even when they differ from the voucher date
- supplier linkage works correctly per-posting
- open postings are created correctly per supplier
- voucher date should be set to the earliest payment date

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
2. fire all 5 reads in parallel:
   - `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)`
   - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*)`
   - `GET /supplier?count=1000&fields=*`
   - `GET /supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)` (check if ANY exist)
   - `GET /ledger/account?number=2400,1920&fields=*` (speculative; needed if no supplier invoices)
3. if supplier invoices exist: also `GET /ledger/paymentTypeOut?count=1000&fields=*,creditAccount(*)`, then `POST /supplierInvoice/{id}/:addPayment` per match
4. if NO supplier invoices exist (common case): use one combined `POST /ledger/voucher` with 2M postings for all M supplier payments
5. `PUT /invoice/{id}/:payment` once per matched incoming line
- **no-supplier-invoice floor: 5 reads + N customer payments + 1 combined supplier voucher**
- **has-supplier-invoices floor: 6 reads + N customer payments + M supplier invoice payments (1 speculative /ledger/account read wasted)**
- example: 5 customer + 3 supplier with no supplier invoices = 5 + 5 + 1 = **11 calls**

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
