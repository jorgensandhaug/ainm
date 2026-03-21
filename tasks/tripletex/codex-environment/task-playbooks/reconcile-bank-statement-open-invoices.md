# Reconcile Bank Statement With Open Invoices

> **NO BETA ENDPOINTS.** NEVER use `/bank/reconciliation*`, `/incomingInvoice*`, or any `(BETA)` endpoint. They ALL return `403`. Use manual voucher and `/invoice/:payment` paths only.

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

The task has a hard 300s budget. **Three production runs have scored 0 due to timeout** — agents spent all 300s reading docs (bc688ea1), or the LLM took too long generating output after reading extra files (2f10e207). Do not read AGENTS.md, openapi.json, or additional playbook files once the trusted standard is loaded. Read the trusted standard, parse the CSV, write one comprehensive TypeScript script, and execute immediately. The actual API interaction takes ~4s; the remaining 296s is wasted if spent on documentation exploration or slow LLM generation. Skip Glob/search for trusted-standard files — go directly to `cat ./trusted-standards/reconcile-bank-statement-open-invoices.md`.

## Production Run Results (2026-03-21)

### English run 4 (task 23, 11 calls, 0 errors) — SCORED 0.6/6 (skipped non-invoice lines)
- 5 reads fired in parallel: `/invoice`, `/invoice/paymentType`, `/supplier`, `/supplierInvoice`, `/ledger/account`
- 5 customer payments via `PUT /invoice/{id}/:payment` (4 full + 1 partial 2312.50 of 4625 outstanding)
- `GET /supplierInvoice` returned 0 results; fell back to manual voucher path
- 3 supplier payments combined into 1 `POST /ledger/voucher` with 6 postings (debit 2400, credit 1920)
- total: 5 reads + 5 customer payments + 1 combined supplier voucher = **11 calls** (matches theoretical floor)
- matching order mattered: Lewis Ltd had 2 invoices (#1 outstanding 4625, #5 outstanding 23562.50); first bank line (2312.50) matched #1 as partial, second bank line (23562.50) matched #5 as full

### Nynorsk run 2 (c76bbef3, 11 calls, 0 errors) — SCORED 0.6/6 (skipped non-invoice lines)
- 5 reads fired in parallel, 5 customer payments (all full, no partial), 3 supplier payments combined into 1 voucher
- CSV had non-invoice lines (Renteinntekter, Bankgebyr) that were INCORRECTLY skipped — this caused Check 1 to fail
- names: Neset AS, Eide AS, Lunde AS, Stølsvik AS, Haugen AS (customers); Lunde AS, Neset AS, Stølsvik AS (suppliers)
- confirms trusted standard is correct for Nynorsk task variant

### Portuguese run (d1297531, 11 calls, 0 errors) — SCORED 0.6/6 (skipped non-invoice lines)
- 5 reads fired in parallel, 5 customer payments (4 full + 1 partial: Sousa Lda 5675 of 14187.50), 3 supplier payments combined into 1 voucher
- CSV had non-invoice lines (Renteinntekter, Skattetrekk, Bankgebyr) that were INCORRECTLY skipped
- customers: Oliveira Lda (2 invoices), Silva Lda, Ferreira Lda, Sousa Lda; suppliers: Martins Lda, Pereira Lda, Costa Lda
- confirms trusted standard is correct for Portuguese task variant
- Bankgebyr appeared in Inn column (positive 1956.88 — likely refund) — correctly skipped as non-invoice

### Earlier Nynorsk run 1 (task 23, 13 calls, 0 errors)
- same shape but 3 separate supplier vouchers instead of 1 combined → wasted 2 calls

### Nynorsk run 3 (2f10e207, 11 calls, 0 errors) — SCORED 0/1 (endpoint_unreachable, proxy timeout)
- 5 reads in parallel, 5 customer payments (4 full + 1 partial: Aasen AS 6500 of 13000), 3 supplier + 2 Renteinntekter Ut combined into 1 voucher (10 postings)
- CSV had 2 "Renteinntekter" lines in the Ut column (outgoing: -1282.21 and -1910.48) — booked to 8050 with reversed direction (debit 8050, credit 1920)
- API execution completed in 4 seconds, but LLM output generation took 4.5 minutes; proxy expired before scorer could verify
- Agent wasted time reading AGENTS.md (200 lines) in addition to the trusted standard — unnecessary for exact match
- **Lesson**: for exact trusted-standard matches, read ONLY the trusted standard file, then write and execute. Skip AGENTS.md, Glob searches, and all other documentation reads.

### Spanish run (bc688ea1, 0 calls, timed out) — SCORED 0/1
- Agent spent all 300s reading documentation (AGENTS.md, trusted standard, openapi.json) and never wrote or executed a script
- CSV had 5 customer payments, 3 supplier payments, 1 Bankgebyr (-1083.95), 1 Skattetrekk Inn (+1269.93), 1 Skattetrekk Ut (-600.07)
- This is the third timeout failure for this task shape; the correct approach takes ~4–15s to execute
- **Lesson**: read ONLY the trusted standard, then immediately execute — do not read additional documentation files

### Earlier English run (task 23, score 0/0)
- customer payments succeeded (4 full, 1 partial) but agent wasted 300s on supplier debug scripts after `/supplierInvoice` returned 0 → timed out

### Earlier French run
- bank text `Faktura 1001`..`1005` did not equal Tripletex `invoiceNumber`; live invoices were `1`..`5`
- decisive signal was customer name + amount + open-invoice inventory, not invoice number label

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
- fire one broad `GET /supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)` in the initial parallel batch
- do NOT query `/supplierInvoice` per-supplier — use the broad query to decide the path in one call
- if broad query returns payable rows, match by supplier name + amount, then use `POST /supplierInvoice/{id}/:addPayment`
- if broad query returns 0 (common case in production), fall back to manual voucher payment (debit 2400, credit 1920)
- resolve supplier ids from one `GET /supplier?count=1000&fields=*` (needed for manual voucher's `supplier: { id }` field)
- to resolve account ids for manual voucher, use one `GET /ledger/account?number=1920,2400,2600,7770,8050&fields=*`

### What is unsafe
- do not fire per-supplier `GET /supplierInvoice?supplierId=...` queries — use one broad query instead
- do not trust `voucherId=` lookup on `/supplierInvoice` as a decisive resolver
- do not assume `POST /supplierInvoice/{id}/:addPayment` is always usable on imported supplier invoices
- do not spend calls on `:approve` or `putPostings` retries after the validation errors above
- do not use `amountCurrencyOutstanding` in `/supplierInvoice` fields filter — it causes `400`

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
   - `GET /ledger/account?number=1920,2400,2600,7770,8050&fields=*` (speculative; needed if no supplier invoices)
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

### Non-invoice lines — MUST BE BOOKED
**CRITICAL: Do NOT skip non-invoice lines.** All previous production runs skipped them and consistently failed Check 1 (worth ~8/10 points), scoring only 0.6 instead of potentially 6.0.

Book each non-invoice line with 2 postings (bank + contra account):

| Line type | Direction | Bank 1920 | Contra account |
|---|---|---|---|
| Renteinntekter (interest income) | Inn (+) | debit | credit 8050 |
| Renteinntekter (negative interest / reversal) | Ut (-) | credit | debit 8050 |
| Bankgebyr (bank fee) | Ut (-) | credit | debit 7770 |
| Bankgebyr (fee refund) | Inn (+) | debit | credit 7770 |
| Skattetrekk (tax withholding) | Ut (-) | credit | debit 2600 |
| Skattetrekk (tax refund) | Inn (+) | debit | credit 2600 |

Add these postings to the combined supplier voucher (no extra API calls needed).
Sandbox-verified: voucher #609157175 with Renteinntekter Ut/8050 posted successfully. Earlier voucher #426 verified Bankgebyr/7770 + Skattetrekk Inn/Ut/2600. Voucher #349 verified Renteinntekter Inn/8050 + Bankgebyr/7770 + Skattetrekk/2600.

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
- row 0 is system-reserved; start manual voucher postings at `row: 1` and increment per posting
- do not create M separate `POST /ledger/voucher` calls for M supplier payments; combine all into one voucher with 2M postings
- fire `GET /ledger/account?number=1920,2400,2600,7770,8050&fields=*` speculatively in the initial parallel batch; it is wasted only in the rare has-supplier-invoices case
- `amountCurrencyOutstanding` does NOT exist on `SupplierInvoiceDTO` — using it in `fields=` causes a `400`; use `fields=*,supplier(*)` instead (the DTO only has `amountOutstanding`)
- when matching customer invoices, use `amountCurrencyOutstanding` (exists on `InvoiceDTO`); when matching supplier invoices, use `amountOutstanding`
