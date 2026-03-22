# Score-Aware Reflection — prod-2026-03-22-105715783Z-0c420db1

## 1. Task Attribution

- **Attributed task**: T23 (bank reconciliation)
- **Task tier**: T3 (max normalized = 6)
- **Prompt**: "Avstem bankutskriften (vedlagt CSV) mot apne fakturaer i Tripletex. Match innbetalinger til kundefakturaer og utbetalinger til leverandorfakturaer. Handter delbetalinger korrekt."
- **Attribution method**: Leaderboard diff — task 23 went from 16 to 17 attempts, last_attempt moved to 2026-03-22T10:58:58
- **Submission**: 633910cd — queued 10:56:50, completed 10:58:58
- **Inference status**: ambiguous (3 concurrent tasks in batch: T20, T23, T27)

## 2. Correctness Verdict

- **Score**: 0/10 raw, **0.0 normalized** (0% correctness)
- **Checks**: 2/2 failed (Check 1: failed, Check 2: failed)
- **Previous best**: 0.6 normalized (1/10 raw — Check 2 partial pass from earlier amount-only runs)
- **Verdict**: **Complete correctness failure.** This run scored WORSE than previous runs that didn't even attempt bank reconciliation.

## 3. Efficiency Verdict

- **Mutating calls**: 13 (theoretical minimum for 2-month, 5-customer, 3-supplier, 2-non-invoice shape)
- **GET calls**: 29 (free)
- **Errors**: 0
- **Efficiency**: Optimal call count. **The problem is exclusively correctness, not efficiency.**

## 4. Likely Root Cause

### PRIMARY: Invoice matching swapped Moe AS invoices

The CSV contained:
- "Innbetaling fra Moe AS / Faktura 1001" → 4200 NOK
- "Innbetaling fra Moe AS / Faktura 1003" → 5250 NOK

Tripletex had:
- Invoice #1 (Moe AS): 7000 total
- Invoice #3 (Moe AS): 5250 total

**The script matched by amount proximity, not by invoice reference number.** The "smallest outstanding >= bankAmount" heuristic picked:
- 4200 → inv #3 (5250, smallest ≥ 4200) — **WRONG**, should be inv #1 (7000)
- 5250 → inv #1 (7000, only remaining ≥ 5250) — **WRONG**, should be inv #3 (5250)

**Result**: Two incorrect partial payments instead of one correct partial (4200 on 7000) + one correct full (5250 on 5250).

**Check 2 failed** because:
- Invoice #1: expected outstanding = 2800, actual = 1750
- Invoice #3: expected outstanding = 0, actual = 1050

**Check 1 failed** likely because:
- The bank reconciliation matched transactions to postings that referenced the wrong invoices
- Transaction "Faktura 1001" was matched to posting "Betaling: Faktura nummer 3 til Moe AS (10003)"
- The scorer may validate that transaction-posting reference pairs are consistent

### Why this didn't happen in earlier runs

Previous 0.6-scoring runs had CSV data where the amount-based matching was unambiguous:
- Each customer had only one invoice, OR
- The partial payment amount uniquely identified the correct invoice

This run was the first where a customer (Moe AS) had two invoices AND the payment amounts didn't uniquely match either invoice, exposing the matching algorithm's weakness.

### The invoice number mapping pattern

CSV "Faktura XXXX" consistently maps to `invoiceNumber = XXXX % 1000`:
- Faktura 1001 → Invoice #1 (Moe AS, 7000) — verified via Johansen/Nilsen exact matches
- Faktura 1002 → Invoice #2 (Johansen AS, 14500) ✓
- Faktura 1003 → Invoice #3 (Moe AS, 5250) ✓
- Faktura 1004 → Invoice #4 (Nilsen AS, 13250) ✓
- Faktura 1005 → Invoice #5 (Nilsen AS, 16562.50) ✓

## 5. What Went Right

1. **Zero API errors**: 13 mutating calls, all succeeded
2. **Optimal call count**: Achieved theoretical minimum (1 combined voucher + 5 payments + 1 import + 2 recon create + 2 batch match + 2 recon close = 13)
3. **Cross-month handling**: Correctly created separate reconciliations for January and February
4. **Batch matching**: Both batch matches succeeded (8 Jan txns + 2 Feb txns)
5. **Non-invoice booking**: Both Bankgebyr lines correctly booked to account 7770
6. **Opening balance**: Correctly computed as 100,000 and posted DR 1920 / CR 2050
7. **Closing balances**: Both months closed correctly (Jan: 105,912.50, Feb: 103,506.43)
8. **Fast execution**: Pre-built script copied and ran in ~30s, well within 300s budget

## 6. What To Change Next Time

### CRITICAL FIX (already applied to pre-built script v3):

**Add invoice reference matching as highest-priority matching step.** Before falling back to amount-based matching, extract the invoice number from the CSV description using regex `(?:Faktura|Invoice|Rechnung|Fatura|Factura|Facture)\s+(\d+)` and match via:
1. Direct: `invoiceNumber === csvRef`
2. Modulo 1000: `invoiceNumber === csvRef % 1000`
3. Modulo 10000: `invoiceNumber === csvRef % 10000`

Only fall back to amount-based matching if no reference match is found.

### Already updated:
- Pre-built script `./scripts/reconcile-bank-statement.ts` → v3 with invoice reference matching
- Trusted standard updated with new 3-tier matching priority and this run's failure documented
- Playbook updated with matching heuristics and root cause

### Verification needed:
The next production run for task 23 should confirm that invoice reference matching resolves the Moe AS swap and achieves Check 2 pass. Combined with the bank reconciliation flow (Check 1), the target is 10/10 raw (6.0 normalized).
