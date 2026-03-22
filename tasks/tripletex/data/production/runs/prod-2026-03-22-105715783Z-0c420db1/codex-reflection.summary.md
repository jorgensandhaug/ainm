# Post-Run Reflection: prod-2026-03-22-105715783Z-0c420db1

## 1. Task

Bank reconciliation (Task 23) — Norwegian. Reconcile a 10-line CSV bank statement spanning Jan 16 – Feb 3, 2026 against open invoices. 5 customer incoming payments (Moe AS ×2, Johansen AS, Nilsen AS ×2), 3 supplier outgoing payments (Ødegård AS, Moe AS, Hansen AS), 2 Bankgebyr. Handle partial payments correctly.

## 2. Reflection

**What went well:**
- Pre-built script v2 was copied and executed in one command — no script generation delay.
- 0 API errors across 13 mutating + 29 GET calls.
- Combined voucher (OB + 3 suppliers + 2 bankgebyr = 12 postings) in 1 POST.
- Batch matching (2 batches for 2 months) — 0 failures.
- Both monthly recons closed with correct closing balances (105912.50 / 103506.43).
- Bank statement import succeeded with correct Sbanken CSV format.
- Cross-month handling worked perfectly (separate recons per period).

**What went poorly:**
- **Invoice matching was wrong for Moe AS** — the critical correctness failure that likely caused 0/10 score.
- Moe AS had 2 invoices: #1 (7000 NOK) and #3 (5250 NOK).
- CSV had: Faktura 1001 (4200, partial) and Faktura 1003 (5250, full payment).
- Amount-based matching picked inv #3 for 4200 (smallest outstanding ≥ 4200 = 5250) and inv #1 for 5250.
- Result: inv #1 outstanding=1750 (wrong, should be 2800), inv #3 outstanding=1050 (wrong, should be 0).
- This swapped the partial payment assignment entirely.

**Why it happened:**
- The matching algorithm had no awareness of invoice reference numbers in the CSV description.
- The pattern "Faktura 1001" maps to `invoiceNumber: 1` (via `csvRef % 1000`), but the script never extracted or used this mapping.
- Previous playbook notes said "do not require the bank text invoice label to equal Tripletex invoiceNumber" — this was correct (they DON'T equal) but led to completely ignoring the reference signal.

## 3. Call Efficiency

**The run was minimal-call for its shape.** 13 mutating calls is the theoretical minimum for a 2-period, 5-customer-payment CSV:

| Step | Calls | Detail |
|---|---|---|
| Combined voucher (OB + suppliers + non-invoice) | 1 | 12 postings |
| Customer payments | 5 | PUT /invoice/:payment |
| Bank import | 1 | POST /bank/statement/import |
| Create recons | 2 | 1 per month (Jan + Feb) |
| Batch matches | 2 | 1 per month |
| Close recons | 2 | 1 per month |
| **Total mutating** | **13** | **Optimal** |

29 GET calls were used for verification (free from scoring perspective). No wasted mutating calls.

**The problem was not call count — it was correctness.** A perfectly efficient script that pays the wrong invoices scores 0.

## 4. Root Causes

1. **Invoice reference matching was missing.** The script's matching priority was: exact outstanding amount → smallest outstanding ≥ bankAmount → lowest invoiceNumber. When a customer has multiple invoices and the payment doesn't exactly match any outstanding, this heuristic picks the wrong invoice. The CSV description contains an invoice reference ("Faktura XXXX") that reliably maps to the internal `invoiceNumber` via `csvRef % 1000`.

2. **Playbook guidance was misleading.** The note "do not require the bank text invoice label to equal Tripletex invoiceNumber" was interpreted as "ignore the invoice reference entirely" rather than "apply a modulo mapping."

## 5. Sandbox Verification

Tested the invoice reference extraction with all known language variants:
- `Faktura`(nb/nn), `Invoice`(en), `Rechnung`(de), `Fatura`(pt), `Factura`(es), `Facture`(fr)
- All extract correctly via regex `(?:Faktura|Invoice|Rechnung|Fatura|Factura|Facture)\s+(\d+)`
- `csvRef % 1000` correctly maps 1001→1, 1002→2, ..., 1005→5

Simulated the production scenario with mock data:
- **OLD matching**: Faktura 1001 (4200) → inv #3 (WRONG), Faktura 1003 (5250) → inv #1 (WRONG)
- **NEW matching**: Faktura 1001 (4200) → inv #1 (CORRECT, partial, 2800 remaining), Faktura 1003 (5250) → inv #3 (CORRECT, full, 0 remaining)

The fix correctly handles the partial payment scenario without changing any API call flow.

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Changes |
|---|---|
| `scripts/reconcile-bank-statement.ts` | v3: Added invoice reference extraction (`invRefRegex`), multi-language customer name extraction (`custNameRegex`), 3-tier matching priority (ref → amount → fallback). Also improved supplier line regex to handle `Leverandør` (with ø), `Zahlung` (de), and other language variants. |
| `trusted-standards/reconcile-bank-statement-open-invoices.md` | Updated Step 3 matching to document 3-tier priority: invoice reference match → exact outstanding → smallest outstanding. Added explanation of why reference matching matters for partial payments with concrete example. |
| `task-playbooks/reconcile-bank-statement-open-invoices.md` | Added run 0c420db1 to production results. Updated matching heuristics to document 3-tier priority. Added CRITICAL pitfall about invoice reference matching. |

## 7. Commit

```
d5f982bd tripletex playbook: bank recon — fix invoice matching (ref priority over amount), v3 script (Run 0c420db1)
```

Files committed:
- `scripts/reconcile-bank-statement.ts`
- `trusted-standards/reconcile-bank-statement-open-invoices.md`
- `task-playbooks/reconcile-bank-statement-open-invoices.md`

## 8. Reusable Heuristics

1. **Always use invoice reference numbers for matching.** When the CSV description contains "Faktura XXXX" (or equivalent in any language), extract the number and try `invoiceNumber === csvRef`, then `invoiceNumber === csvRef % 1000`, then `invoiceNumber === csvRef % 10000`. This is the highest-priority matching signal for partial payments.

2. **Amount-based matching is a fallback, not the primary heuristic.** When a customer has multiple invoices, amount-proximity matching can swap assignments. Reference matching prevents this.

3. **"Don't require equality" ≠ "ignore the signal."** The invoice reference in the CSV (e.g., 1001) doesn't literally equal the internal `invoiceNumber` (e.g., 1), but a simple modulo mapping resolves it. Don't discard informative signals just because they're not exact matches.

4. **Multi-language regex patterns are essential.** The script now handles Norwegian (Faktura, Innbetaling fra), Nynorsk (Innbetaling frå), English (Invoice, Payment from), German (Rechnung, Einzahlung von), Spanish (Factura, Pago de), Portuguese (Fatura, Pagamento de), French (Facture, Paiement de) for both customer line classification and supplier line classification.

5. **Call efficiency was already optimal at 13 mutating calls.** The batch matching (v2) and combined voucher optimizations are working. No further call reduction is possible for this task shape. Future improvements should focus on correctness, not efficiency.

6. **Score is binary on correctness.** A perfectly efficient but incorrectly-matched run scores 0. Always verify that the matching logic handles the specific scenario in the CSV (especially partial payments across multiple invoices from the same customer).
