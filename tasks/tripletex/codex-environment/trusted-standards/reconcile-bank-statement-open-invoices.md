# Reconcile Bank Statement With Open Invoices — Trusted Standard

## When to use

Task asks to reconcile a bank statement (CSV) against open invoices. Incoming payments matched to customer invoices, outgoing payments matched to supplier invoices. May include partial payments.

## CSV parsing

Parse locally. Classify lines:
- **Incoming customer**: description contains customer name + invoice reference, `Inn` column populated
- **Outgoing supplier**: description contains supplier name, `Ut` column populated (negative)
- **Non-invoice**: bank fees, tax, interest — skip these

## Optimal call flow (mixed incoming/outgoing, no supplier invoices — common case)

### Step 1: Fire 5 reads in parallel

```
GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)
GET /invoice/paymentType?count=1000&fields=*,debitAccount(*)
GET /supplier?count=1000&fields=*
GET /supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)
GET /ledger/account?number=2400,1920&fields=*
```

### Step 2: Select payment type

Pick the payment type where `debitAccount.number === 1920`.

### Step 3: Match and pay customer invoices

For each incoming bank line:
1. Extract customer name from description (case-insensitive)
2. Find open invoices matching customer name
3. Priority: exact outstanding match → smallest outstanding >= bankAmount → lowest invoiceNumber
4. Pay: `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<amount>`
5. Update local outstanding tracker after each payment (same customer may have multiple bank lines)

Partial payment: when bankAmount < outstanding, send bankAmount (not full outstanding).

### Step 4: Handle supplier payments

**If `/supplierInvoice` returned results**: use `POST /supplierInvoice/{id}/:addPayment` per match (also need `GET /ledger/paymentTypeOut` — 1 extra read).

**If `/supplierInvoice` returned 0 (common case)**: combine ALL supplier payments into ONE `POST /ledger/voucher`:

```typescript
{
  date: "<earliest-payment-date>",
  description: "Bank reconciliation - supplier payments",
  postings: [
    // For each supplier payment: 2 postings
    { row: N,   date: "<date>", account: { id: <2400_id> }, amountGross: <amount>,  amountGrossCurrency: <amount>,  supplier: { id: <supplierId> } },
    { row: N+1, date: "<date>", account: { id: <1920_id> }, amountGross: -<amount>, amountGrossCurrency: -<amount> },
    // ... next supplier payment at row N+2, N+3 ...
  ]
}
```

Row numbering starts at 1 (row 0 is system-reserved). Voucher date = earliest payment date. Individual posting dates preserved per-posting.

## Call count

- **No supplier invoices (common)**: 5 reads + N customer payments + 1 supplier voucher
- **Has supplier invoices**: 6 reads + N customer payments + M supplier invoice payments
- Example: 5 customer + 3 supplier, no supplier invoices = **11 calls**

## Proven production results

- English run 4: 11 calls, 0 errors, 5 customer (1 partial) + 3 supplier combined into 1 voucher
- Nynorsk run: 13 calls (used 3 separate vouchers instead of 1 combined — wasted 2)

## Critical pitfalls

- Bank text invoice labels (e.g. `Faktura 1001`) do NOT equal Tripletex `invoiceNumber` — match on customer name + amount
- `amountCurrencyOutstanding` does NOT exist on `SupplierInvoiceDTO` — using it in `fields=` causes `400`
- Do NOT fire per-supplier `/supplierInvoice` queries — one broad query decides the path
- Do NOT create separate vouchers per supplier payment — combine into one
- Do NOT split into multiple scripts or debug passes
- Non-invoice lines (Bankgebyr, Skattetrekk, Renteinntekter) must be skipped
- After paying a customer invoice, update local outstanding tracker before matching the next line
