# Reflection Summary

## Task

Reconcile a bank statement CSV against open invoices in Tripletex. Match 5 incoming customer payments to customer invoices (including partial payments) and 3 outgoing supplier payments to supplier invoices. Handle non-invoice lines (Bankgebyr, Skattetrekk) by skipping them.

## Reflection

**What went well:**
- Single comprehensive script executed the entire flow — no debug passes or split scripts
- All 5 reads fired in parallel (invoice, paymentType, supplier, supplierInvoice, ledger/account)
- Customer matching correctly handled same-name customer (Lewis Ltd) with 2 invoices: first bank line (2312.50) matched invoice #1 (outstanding 4625) as partial, second bank line (23562.50) matched invoice #5 (outstanding 23562.50) as full
- Local outstanding tracker correctly updated between payments
- Supplier side correctly detected 0 supplier invoices and fell back to combined manual voucher
- All 3 supplier payments combined into 1 voucher with 6 postings
- 0 errors across all 11 API calls

**What went poorly:**
- Nothing. This run executed the optimal path on first attempt.

## Call Efficiency

**The run was minimal-call.** 11 total calls matches the theoretical floor documented in the playbook:

| Call | Purpose |
|------|---------|
| `GET /invoice?...count=1000&fields=*,customer(*)` | Fetch all open customer invoices |
| `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*)` | Resolve payment type (debit 1920) |
| `GET /supplier?count=1000&fields=*` | Resolve supplier IDs for voucher |
| `GET /supplierInvoice?...count=1000&fields=*,supplier(*)` | Check if supplier invoices exist (returned 0) |
| `GET /ledger/account?number=2400,1920&fields=*` | Resolve account IDs for manual voucher |
| 5× `PUT /invoice/{id}/:payment` | 4 full + 1 partial customer payment |
| 1× `POST /ledger/voucher` | Combined supplier voucher (6 postings) |

**Total: 5 reads + 5 customer payments + 1 supplier voucher = 11 calls, 0 errors.**

No wasted calls. No alternative lower-call path exists:
- All 5 reads are mandatory (invoice data, payment type, supplier IDs, supplier invoice check, account IDs)
- Customer payments are per-invoice (no batch endpoint)
- Supplier voucher already combined into 1 call

Sandbox investigation confirmed:
- `/ledger/posting/openPost` could theoretically replace `/supplier` read (gives supplier IDs + names), but only shows suppliers with open 2400 postings — risky if bank payment targets supplier with no open postings
- Skipping `/supplierInvoice` check entirely would save 1 call but risks correctness if supplier invoices DO exist in future runs
- Neither alternative is worth the risk vs. 1-call saving

## Root Causes

No errors or wasted calls to diagnose. The run followed the playbook's documented optimal path exactly.

Key decision points that succeeded:
1. **Matching order**: Lewis Ltd had invoices #1 (4625 outstanding) and #5 (23562.50 outstanding). Bank line 1 was 2312.50 → matched to #1 as partial (smallest outstanding >= amount). Bank line 6 was 23562.50 → matched to #5 as exact full. The "smallest outstanding >= amount" heuristic with local tracker update was critical.
2. **Combined supplier voucher**: 3 supplier payments in 1 POST instead of 3 separate POSTs saved 2 calls vs. earlier Nynorsk run.
3. **Non-invoice line skipping**: Bankgebyr (1762.74) and Skattetrekk (982.45) correctly identified and skipped.

## Sandbox Verification

Verified in persistent sandbox (`kkpqfuj-amager.tripletex.dev`):

1. **Broad `/supplierInvoice` query reliability**: `GET /supplierInvoice?...&fields=*,supplier(*)` returns 200 with results when supplier invoices exist (41 in sandbox). Confirmed the broad query IS reliable.
2. **`amountCurrencyOutstanding` pitfall**: Using `amountCurrencyOutstanding` in `/supplierInvoice` fields filter causes `400 Illegal field in fields filter`. The `SupplierInvoiceDTO` only has `amountOutstanding`, not `amountCurrencyOutstanding`. The `InvoiceDTO` (customer) has both.
3. **`openPost` as supplier resolver**: `GET /ledger/posting/openPost?date=2031-01-01&accountNumberFrom=2400&accountNumberTo=2400&fields=*,supplier(id,name),account(id,number)` works and returns supplier IDs + names + account IDs. Could save 1 read by replacing `/supplier`, but only covers suppliers with open postings — not safe as a general replacement.

## Playbook Changes

### Updated: `./task-playbooks/reconcile-bank-statement-open-invoices.md`
- Added English run 4 production result (11 calls, 0 errors, optimal)
- Condensed earlier run descriptions
- Fixed "what is safe" section: replaced per-supplier query recommendation with single broad query (eliminates contradiction with Minimal-Call Guidance section)
- Fixed "what is unsafe" section: added per-supplier query warning, `amountCurrencyOutstanding` pitfall
- Added pitfalls: `amountCurrencyOutstanding` not on `SupplierInvoiceDTO`, field name difference between customer and supplier invoice DTOs

### Created: `./trusted-standards/reconcile-bank-statement-open-invoices.md`
- Promoted to trusted standard after 4+ production runs with stable optimal 11-call path
- Documents: CSV parsing, 5 parallel reads, customer matching with partial payment support, supplier combined voucher path
- Includes call count formulas, proven production results, critical pitfalls

### Updated: `./AGENTS.md`
- Added trusted standard entry: `Reconcile bank statement with open invoices`

## Commit

```
2dadd281 tripletex playbook: reconcile-bank-statement — promote to trusted standard, add optimal 11-call production confirmation
```

Files committed:
- `AGENTS.md` (trusted standard table entry)
- `task-playbooks/reconcile-bank-statement-open-invoices.md` (updated production results, fixed inconsistencies, new pitfalls)
- `trusted-standards/reconcile-bank-statement-open-invoices.md` (new trusted standard)

## Reusable Heuristics

1. **Same-customer multi-invoice matching**: When a customer has multiple invoices, process bank lines in order and update local outstanding after each payment. Use "smallest outstanding >= bankAmount" to pick the best partial payment candidate.
2. **Combined supplier voucher**: Always combine M supplier payments into 1 voucher with 2M postings. Never create separate vouchers.
3. **Field name asymmetry**: Customer `InvoiceDTO` has `amountCurrencyOutstanding`; supplier `SupplierInvoiceDTO` only has `amountOutstanding`. Using the wrong field in `fields=` causes `400`.
4. **Broad supplierInvoice query**: One `GET /supplierInvoice?...count=1000&fields=*,supplier(*)` decides the path. Never fire per-supplier queries.
5. **Speculative reads**: Fire `/ledger/account?number=2400,1920` in the initial parallel batch even though it's only needed if no supplier invoices exist. The 1 wasted call in the rare has-supplier-invoices case is cheaper than an extra sequential round-trip.
6. **Non-invoice lines**: Bank fees (Bankgebyr), tax (Skattetrekk), interest (Renteinntekter) — skip. Match only on "Innbetaling fra" and "Betaling Supplier" patterns.
7. **Invoice number labels**: Bank text labels like "Faktura 1001" do NOT correspond to Tripletex `invoiceNumber`. Match on customer name + amount against live open-invoice inventory.
