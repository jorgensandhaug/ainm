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
- tasks where supplier-side payment must be solved through a non-public or still-unproven path

## What Went Wrong In The 2026-03-21 French Run

- the first resolver assumptions were too literal
- the bank text `Faktura 1001` .. `1005` did not equal Tripletex `invoiceNumber`
- the live open customer invoices were `1` .. `5`, and the decisive signal was customer name plus amount plus the open-invoice inventory
- `/incomingInvoice*` was a pure waste branch
- `/supplierInvoice` without a supplier filter was not a safe decisive read for the outgoing side
- later sandbox follow-up showed `voucherId=` lookup on `/supplierInvoice` can also return `values=[]` even when `supplierId=` returns the real rows

## Proven Customer-Side Path

Persistent sandbox re-proof on 2026-03-21:
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&invoiceNumber=178&count=1000&fields=*,customer(*)`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*)`
- `PUT /invoice/2147580573/:payment?paymentDate=2026-03-21&paymentTypeId=32813748&paidAmount=500`
- the write response reduced `amountCurrencyOutstanding` from `5000` to `4500`

Implications:
- incoming customer payments should still use `/invoice/{id}/:payment`
- for partial payments, send the bank amount, not the full outstanding amount
- for bank-statement prompts with several customer lines, prefer one decisive `GET /invoice?...count=1000...` over one read per invoice
- resolve the incoming payment type once per run and reuse it

## Supplier-Side Findings

### What is safe
- never use `/incomingInvoice*` in scored runs for this repo
- first resolve supplier ids from one `GET /supplier?...fields=*`
- then query `/supplierInvoice` with `supplierId=...`
- if supplier-specific `/supplierInvoice` still gives no usable rows, only then use `/ledger/posting/openPost?supplierId=...` as a diagnostic fallback

### What is unsafe
- do not trust an empty unfiltered `GET /supplierInvoice?...` as proof that no supplier invoices exist
- do not trust `voucherId=` lookup on `/supplierInvoice` as a decisive resolver
- do not assume `POST /supplierInvoice/{id}/:addPayment` is always usable on imported supplier invoices

Persistent sandbox on 2026-03-21 showed:
- `GET /supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&voucherId=608853423&count=1000&fields=*,supplier(*),payments(*),voucher(*)` returned `values=[]`
- `GET /supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&supplierId=108269769&count=1000&fields=*,supplier(*),payments(*),voucher(*)` returned real invoices for `Elvdal AS`
- `POST /supplierInvoice/2147547151/:addPayment?...` returned `422 Cannot add payment to unregistered voucher`
- after a later read, the linked voucher still showed booked number `100`, so even that state was not enough to make `:addPayment` work on this imported object family
- `PUT /supplierInvoice/2147547151/:approve` also failed `422 Denne bilagstypen kan ikke attesteres.`

Implications:
- the outgoing supplier-payment branch is not an exact trusted-standard match yet
- do not spend scored-run calls on `/incomingInvoice*`, `voucherId=` retries, or speculative `:approve` retries after the `unregistered voucher` validation branch
- if the task requires outgoing supplier reconciliation and the account exposes only this fragile object family, treat it as a higher-risk branch and keep exploration narrow

## Minimal-Call Guidance For Future Runs

### Incoming-only or customer-dominant runs
1. parse CSV locally
2. `GET /invoice?...count=1000...`
3. `GET /invoice/paymentType?...`
4. `PUT /invoice/{id}/:payment` once per matched incoming line

### Mixed incoming/outgoing runs
1. parse CSV locally
2. `GET /invoice?...count=1000...`
3. `GET /invoice/paymentType?...`
4. if outgoing lines exist, `GET /supplier?count=1000&fields=*`
5. for each distinct outgoing supplier name, `GET /supplierInvoice?...&supplierId=...`
6. only if those supplier-specific reads still fail to reveal payable rows, use `GET /ledger/posting/openPost?...&supplierId=...` as diagnosis
7. avoid `/incomingInvoice*` completely

## Matching Heuristics

- match customer incoming lines on the combination of:
  - normalized customer name from the bank text
  - bank amount
  - live positive outstanding amount
  - live open-invoice inventory
- do not require the bank text invoice label to equal Tripletex `invoiceNumber`
- for supplier outgoing lines with only supplier name and amount, supplier-specific invoice reads are safer than global invoice reads
- when the bank amount is lower than live outstanding, mark the line as a partial payment candidate

## Pitfalls To Avoid

- `/incomingInvoice*` is beta-only here; treat it as dead
- unfiltered `/supplierInvoice` can be misleading
- `voucherId=` on `/supplierInvoice` can be misleading
- imported supplier-invoice objects can still reject `:addPayment` with misleading `unregistered voucher` validation
- do not overfit to sandbox noise such as already-credited customer invoices when selecting proof targets
