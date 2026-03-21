# Reconcile Bank Statement With Open Invoices — Trusted Standard

> **NO BETA ENDPOINTS.** NEVER use `/bank/reconciliation*`, `/incomingInvoice*`, or any `(BETA)` endpoint. They ALL return `403`. Use manual voucher and `/invoice/:payment` paths only.

## When to use

Task asks to reconcile a bank statement (CSV) against open invoices. Incoming payments matched to customer invoices, outgoing payments matched to supplier invoices. May include partial payments.

## CSV parsing

Parse locally. Classify lines:
- **Incoming customer**: description contains customer name + invoice reference, `Inn` column populated
- **Outgoing supplier**: description contains supplier name, `Ut` column populated (negative)
- **Non-invoice**: bank fees, tax, interest — **MUST be booked** (see Step 5 below)

## Optimal call flow (mixed incoming/outgoing, no supplier invoices — common case)

### Step 1: Fire 5 reads in parallel

```
GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)
GET /invoice/paymentType?count=1000&fields=*,debitAccount(*)
GET /supplier?count=1000&fields=*
GET /supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)
GET /ledger/account?number=1920,2400,2600,7770,8050&fields=*
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

### Step 5: Book non-invoice lines

**CRITICAL: ALL bank statement lines must be accounted for, not just invoice-related ones.** The scorer validates the full reconciliation. Previous runs scored 0.6 (2/10) because non-invoice lines were skipped — Check 1 (worth ~8 points) consistently failed.

Combine non-invoice postings into the same supplier voucher (if one exists) OR create a separate voucher. Each non-invoice line needs 2 postings (bank debit/credit + contra account):

| Line type | Direction | Bank side (1920) | Contra account | Contra acct # |
|---|---|---|---|---|
| Renteinntekter (interest income) | Inn (+) | debit (positive) | credit 8050 "Annen renteinntekt" | 8050 |
| Bankgebyr (bank fee expense) | Ut (-) | credit (negative) | debit 7770 "Bank og kortgebyrer" | 7770 |
| Bankgebyr (fee refund) | Inn (+) | debit (positive) | credit 7770 "Bank og kortgebyrer" | 7770 |
| Skattetrekk (tax withholding) | Ut (-) | credit (negative) | debit 2600 "Forskuddstrekk" | 2600 |
| Skattetrekk (tax refund) | Inn (+) | debit (positive) | credit 2600 "Forskuddstrekk" | 2600 |

For each non-invoice line, add 2 postings:
```typescript
// Example: Renteinntekter 127.20 (Inn column, positive)
{ row: N,   date: "<date>", description: "Renteinntekter", account: { id: <1920_id> }, amount: 127.20,  amountCurrency: 127.20,  amountGross: 127.20,  amountGrossCurrency: 127.20  },
{ row: N+1, date: "<date>", description: "Renteinntekter", account: { id: <8050_id> }, amount: -127.20, amountCurrency: -127.20, amountGross: -127.20, amountGrossCurrency: -127.20 },

// Example: Skattetrekk 1413.40 (Ut column, negative/outgoing)
{ row: N+2, date: "<date>", description: "Skattetrekk",    account: { id: <2600_id> }, amount: 1413.40,  amountCurrency: 1413.40,  amountGross: 1413.40,  amountGrossCurrency: 1413.40  },
{ row: N+3, date: "<date>", description: "Skattetrekk",    account: { id: <1920_id> }, amount: -1413.40, amountCurrency: -1413.40, amountGross: -1413.40, amountGrossCurrency: -1413.40 },

// Example: Skattetrekk 1269.93 (Inn column, positive/incoming refund)
{ row: N+4, date: "<date>", description: "Skattetrekk",    account: { id: <1920_id> }, amount: 1269.93,  amountCurrency: 1269.93,  amountGross: 1269.93,  amountGrossCurrency: 1269.93  },
{ row: N+5, date: "<date>", description: "Skattetrekk",    account: { id: <2600_id> }, amount: -1269.93, amountCurrency: -1269.93, amountGross: -1269.93, amountGrossCurrency: -1269.93 },
```

Sandbox-verified on 2026-03-21: voucher #426 with Bankgebyr/7770, Skattetrekk Inn/2600, Skattetrekk Ut/2600 — all 12 postings booked successfully. Earlier voucher #349 verified Renteinntekter/8050 + Bankgebyr/7770 + Skattetrekk/2600.

## Call count

- **No supplier invoices (common)**: 5 reads + N customer payments + 1 combined voucher (supplier + non-invoice lines)
- **Has supplier invoices**: 6 reads + N customer payments + M supplier invoice payments + 1 non-invoice voucher
- Example: 5 customer + 3 supplier + 3 non-invoice, no supplier invoices = **11 calls** (non-invoice postings merged into the supplier voucher)

## Proven production results

- English run 4: 11 calls, 0 errors, 5 customer (1 partial) + 3 supplier combined into 1 voucher
- Nynorsk run 2 (c76bbef3): 11 calls, 0 errors, 5 customer (all full) + 3 supplier combined into 1 voucher — optimal
- Portuguese run (d1297531): 11 calls, 0 errors, 5 customer (1 partial: Sousa Lda 5675 of 14187.50) + 3 supplier combined into 1 voucher — optimal
- Spanish run (bc688ea1): **0 calls, TIMED OUT** — agent spent all 300s reading documentation and never executed a script; scored 0/1
- Nynorsk run 1: 13 calls (used 3 separate vouchers instead of 1 combined — wasted 2)

## Critical pitfalls

- **TIMEOUT RISK**: This is a time-critical task. Read this trusted standard, then IMMEDIATELY write and execute one comprehensive script. Do NOT also read AGENTS.md, openapi.json, or playbook files. Multiple production runs (including bc688ea1) scored 0 because the agent spent the entire 300s reading documentation and never executed a single API call.
- Bank text invoice labels (e.g. `Faktura 1001`) do NOT equal Tripletex `invoiceNumber` — match on customer name + amount
- `amountCurrencyOutstanding` does NOT exist on `SupplierInvoiceDTO` — using it in `fields=` causes `400`
- For customer invoices use `amountCurrencyOutstanding` (both `amountOutstanding` and `amountCurrencyOutstanding` exist on `InvoiceDTO`; the latter is correct for foreign currency)
- Do NOT fire per-supplier `/supplierInvoice` queries — one broad query decides the path
- Do NOT create separate vouchers per supplier payment — combine into one
- Do NOT split into multiple scripts or debug passes
- **CRITICAL: Non-invoice lines (Bankgebyr, Skattetrekk, Renteinntekter) must NOT be skipped** — they must be booked to the correct accounts (see Step 5); skipping them caused Check 1 to fail in ALL 6 production attempts (scoring 0.6 instead of potentially 6.0)
- After paying a customer invoice, update local outstanding tracker before matching the next line
- Prompts may be in Portuguese, Nynorsk, French, German, Spanish, English — CSV column headers are always Norwegian (Dato, Forklaring, Inn, Ut, Saldo)
