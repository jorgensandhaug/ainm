# TASK OVERRIDE — Task 23: Reconcile Bank Statement With Open Invoices

**You are running Task 23. The task is already identified. Do not classify.**

## What this task is

Reconcile a bank statement CSV against open invoices. Match incoming payments to customer invoices, outgoing payments to supplier invoices, book non-invoice lines (bank fees, tax, interest), import the statement, match all transactions, and close the reconciliation.

The prompt will provide:
- A CSV file path (columns: Dato, Forklaring, Inn, Ut, Saldo)
- Tripletex API base URL and session token
- A run scripts directory

## What to read and execute

1. **Read ONLY** `./trusted-standards/reconcile-bank-statement-open-invoices.md`
2. **Use the PRE-BUILT SCRIPT** at `./scripts/reconcile-bank-statement.ts` — copy it to your run scripts directory and execute:
   ```bash
   cp ./scripts/reconcile-bank-statement.ts <RUN_SCRIPTS_DIR>/reconcile.ts
   cd <RUN_SCRIPTS_DIR> && bun run reconcile.ts <BASE_URL> <TOKEN> <CSV_FILE_PATH>
   ```
3. **Do NOT write your own script.** The pre-built script handles ALL 9 steps including multi-period reconciliation, batch matching, and combined vouchers. It was sandbox-verified end-to-end.

## Why this matters

- **ALL prior production runs scored 0.6/6** — they only did steps 1-5 (invoice matching + non-invoice booking)
- **Check 1 (worth 8 points) requires the full 9-step flow**: opening balance voucher → invoice payments → combined voucher → bank statement import → multi-period matching → close reconciliation
- **One production run timed out** because the agent spent 106 seconds generating a 300-line script from the standard instead of using the pre-built script

## Critical facts

- CSVs span 2 months (e.g., Jan 16 – Feb 4) — a bank transaction can ONLY match a reconciliation whose accounting period covers the transaction date. Single-period recon = 422 errors.
- `POST /bank/reconciliation/match` accepts arrays — batch ALL txn+posting pairs per period in ONE call
- Bank import response transaction IDs are positional (matches CSV order) — no extra GET needed
- Reconciliation version does NOT change after matches — use creation version for close PUT
- `/bank/reconciliation*` and `/bank/statement*` are NOT beta — they work normally

## If the pre-built script is missing

If `./scripts/reconcile-bank-statement.ts` does not exist, fall back to reading the trusted standard and writing a script based on it. But this should never happen.

## If the prompt doesn't match

If the incoming prompt is clearly NOT about bank statement reconciliation / CSV matching / invoice payment reconciliation, say so and stop immediately.
