# Score-Aware Reflection

## Task Attribution

- **Run ID**: `prod-2026-03-21-205204261Z-dc79b842`
- **Task ID**: 18 (T2 tier, max score 4)
- **Prompt**: Spanish — reverse payment for Sierra SL (910318144) on invoice "Almacenamiento en la nube" (19250 NOK ex-VAT)
- **Trusted standard**: `reverse-customer-invoice-payment`

## Correctness Verdict

**Perfect correctness.** `correctness = 1`, `score_raw = 8 / score_max = 8`, all 3 checks passed.

The payment voucher was correctly reversed and the invoice outstanding amount was restored. No field-level or state-level errors.

## Efficiency Verdict

**Maximum efficiency.** `normalized_score = 4`, which equals the T2 tier max of 4 and matches the leaderboard best for task 18 (`best_score = 4`).

The run used exactly 2 API calls — the theoretical minimum for this task shape:
1. `GET /invoice?customerOrgNumber=910318144&...fields=*,...postings(*)...` → located invoice, extracted payment voucher ID
2. `PUT /ledger/voucher/608889441/:reverse?date=2026-03-21` → reversed payment

Zero 4xx errors. Zero wasted calls. Zero retries. This is the canonical optimal execution.

## Likely Root Cause

No issues. The run achieved the maximum possible score. No root cause analysis needed.

## What Went Right

1. **Immediate trusted-standard recognition.** The agent identified this as an exact match for `reverse-customer-invoice-payment` and read the trusted standard before writing any code.
2. **Canonical 2-call path executed perfectly.** One decisive GET with full field expansion, one PUT reverse. No extra reads, no verification read.
3. **Correct field names in local filter.** Used `amountExcludingVatCurrency === 19250` (not the incorrect `amountExVat` variants that caused silent filter failures in earlier runs).
4. **Robust fallback matcher.** Accepted the `type=null` payment posting without requiring `account.number`, avoiding the matcher bug that cost a call in the 2026-03-20 run for a similar Spanish prompt.
5. **Single-invoice shortcut.** With `count=1`, the local filter was bypassed cleanly — the only invoice was the target.
6. **Spanish prompt parsing.** Correctly mapped "fue devuelto por el banco / Revierta el pago" to the reverse-payment task shape.

## What To Change Next Time

Nothing. This run is the reference execution for task 18. The next agent should replicate this exact approach:

1. Read `trusted-standards/reverse-customer-invoice-payment.md`
2. Write a script with the 2-call path: `GET /invoice?customerOrgNumber=...&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` → extract payment voucher ID → `PUT /ledger/voucher/{id}/:reverse?date=...`
3. Stop immediately after the reverse write succeeds

This is now the 8th production confirmation of the 2-call path and the 4th Spanish-prompt confirmation. The flow is fully proven and should not be modified.
