# TASK OVERRIDE — Task 23: Reconcile Bank Statement With Open Invoices

**You are running Task 23. The task is already identified. Do not classify.**

## What this task is

Reconcile a bank statement CSV against open invoices. Match incoming payments to customer invoices, outgoing payments to supplier invoices, book non-invoice lines (bank fees, tax, interest), import the statement, match all transactions, and close the reconciliation.

The prompt will provide (in any of nb/nn/en/es/pt/fr/de):
- A CSV file path (columns: Dato, Forklaring, Inn, Ut, Saldo)
- Tripletex API base URL and session token
- A run scripts directory

## What to read and execute

1. **Read ONLY** `./trusted-standards/reconcile-bank-statement-open-invoices.md`
2. **Use the PRE-BUILT SCRIPT (v3)** at `./scripts/reconcile-bank-statement.ts` — copy and run:
   ```bash
   cp ./scripts/reconcile-bank-statement.ts <RUN_SCRIPTS_DIR>/reconcile.ts
   cd <RUN_SCRIPTS_DIR> && bun run reconcile.ts <BASE_URL> <TOKEN> <CSV_FILE_PATH>
   ```
3. **Do NOT write your own script.** The pre-built script handles ALL 9 steps of the mandatory checklist including multi-period reconciliation, batch matching, combined vouchers, and multi-language invoice matching. It was sandbox-verified END-TO-END: 11/11 matches, 0 errors, all checks passed (2026-03-22).

## The 9-step mandatory checklist (all required for Check 1)

Steps 1–5 alone = 0.6/6 (Check 2 only). Steps 6+7 alone also fail (proven by runs 57c8f4db, 02daaa35). **ALL of Steps 0, 6, 7, 8 are required for Check 1 (worth 8 points).**

| Step | Action |
|------|--------|
| 1 | 6 parallel reads (invoices, paymentTypes, suppliers, supplierInvoices, accounts incl. 2050, accountingPeriod) |
| 2 | Select payment type (debitAccount.number === 1920) |
| 3 | Match and pay customer invoices (`PUT /invoice/{id}/:payment`) |
| 0+4+5 | ONE combined `POST /ledger/voucher`: opening balance (DR 1920 / CR 2050) + supplier payments (DR 2400 / CR 1920) + non-invoice lines (Bankgebyr 7770, Skattetrekk 2600, Renteinntekter 8050) |
| 6 | `POST /bank/statement/import` with SBANKEN_BEDRIFT_CSV format — txn IDs are positional (CSV order) |
| 7 | Create SEPARATE reconciliation PER accounting period + BATCH `POST /bank/reconciliation/match` per period (all txn+posting pairs in ONE call) |
| 8 | Close ALL reconciliations: `PUT /bank/reconciliation/{id}` with `isClosed: true` |

## Why this matters — production evidence

| Run | What happened | Score |
|-----|---------------|-------|
| 8bf4760c, 4edaedea, c76bbef3, d1297531 | Steps 1–5 only, no bank recon | 0.6/6 |
| 5c02a044 | Booked ALL non-invoice lines but no bank recon | 0.6/6 |
| 57c8f4db | Bank recon created but `transactions: []` (no import/matching) | 0.6/6 |
| 02daaa35 | Bank recon closed but no statement import or matching | 0.6/6 |
| 1d375699 | **Timed out (0/0)** — agent spent 106s writing own 300-line script | 0/1 |
| a986e65f | **Timed out** (Spanish prompt, same problem) | 0/1 |
| b8a43ac0 | French prompt, v3 script, 13 mutating calls, 0 errors | ambiguous |

**Key insight**: every scored run hit 0.6/6 because Check 1 requires the FULL flow — not just vouchers.

## Critical facts

- **CSVs always span 2 months** (e.g., Jan 16 – Feb 4). A bank transaction can ONLY match a reconciliation whose accounting period covers the transaction date. Single-period recon = 422 errors.
- **Invoice number matching**: CSV says "Faktura 1001" but Tripletex `invoiceNumber` is `1`. Match by `csvRef % 1000` + customer name + amount. Amount-only matching is WRONG when a customer has multiple invoices (run 0c420db1 scored 0/10 from swapped Moe AS invoices).
- **Supplier prefix matching**: multi-language regex handles "Betaling Fournisseur", "Betaling Leverandør", etc.
- `POST /bank/reconciliation/match` accepts arrays — batch ALL pairs per period in ONE call.
- Bank import response txn IDs are positional (CSV order) — no extra GET needed.
- `/bank/reconciliation*` and `/bank/statement*` are NOT beta — they work normally.

## If the pre-built script is missing

If `./scripts/reconcile-bank-statement.ts` does not exist, fall back to reading the trusted standard and writing a script based on it. But this should never happen.

## If the prompt doesn't match

If the incoming prompt is clearly NOT about bank statement reconciliation / CSV matching / invoice payment reconciliation, say so and stop immediately.
