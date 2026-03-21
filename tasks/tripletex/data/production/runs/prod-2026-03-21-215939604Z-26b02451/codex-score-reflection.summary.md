# Score Reflection — prod-2026-03-21-215939604Z-26b02451

## Task Attribution

- **Leaderboard diff**: two tasks changed — tx_task_id `02` (T1, max 2) and `18` (T2, max 4)
- **Inference status**: `ambiguous` (two tasks had attempt deltas)
- **Resolved attribution**: **task 18** — normalized_score=4 matches T2 max (4), not T1 max (2); task 02 was a concurrent submission from another run
- **Prompt**: German — reverse payment for Windkraft GmbH (823566441) / Wartung / 29500 NOK ex-VAT

## Correctness Verdict

- **correctness**: 1.0 (perfect)
- **score_raw**: 8/8
- **normalized_score**: 4/4 (T2 maximum)
- **feedback**: 3/3 checks passed
- **best_score before**: 4 → **after**: 4 (matched existing best)

All three checks passed. The payment reversal left the invoice in the exact expected state — outstanding amount reopened to the full invoice balance.

## Efficiency Verdict

- **Score**: 4/4 — maximum possible for this T2 task
- **API calls**: 2 (1 GET + 1 PUT), 0 errors
- **Call path**: canonical minimum — `GET /invoice?customerOrgNumber=...` → `PUT /ledger/voucher/{id}/:reverse`
- **Verdict**: **optimal**. No wasted calls, no retries, no 4xx errors. The run achieved the theoretical minimum call count for this task shape.

## Likely Root Cause

No issues. The run executed the trusted standard exactly as documented:
1. Single decisive `GET /invoice` with `customerOrgNumber=823566441` returned 1 invoice (count=1), no multi-invoice filtering needed
2. Payment voucher extracted via `type=null` fallback matcher (`Betaling: ...` + negative `amountCurrency`)
3. `PUT /ledger/voucher/608890368/:reverse?date=2026-03-21` succeeded immediately, producing reverse voucher `609174125`
4. No verification read needed — the write itself was the scored side effect

## What Went Right

1. **Exact trusted-standard match recognized immediately** — no time wasted reading AGENTS.md beyond the table, no openapi.json consultation
2. **Trusted standard read before script** — the agent read the full `reverse-customer-invoice-payment.md` standard, which contains all the API pitfalls (type=null matcher, account=null tolerance, shared-voucher trap detection)
3. **Correct field names** — used `amountExcludingVatCurrency` (not the wrong `amountExVat`) for local filtering
4. **German prompt parsed correctly** — extracted org number, ex-VAT amount, and service text from the German prompt without confusion
5. **No unnecessary verification read** — stopped after the reverse write, trusting the trusted standard's guidance that the side effect is the scored target
6. **Script execution was clean** — no retries, no error handling branches triggered, no fallback paths needed

## What To Change Next Time

Nothing. This run is the reference implementation for the reverse-customer-invoice-payment task shape:
- 2 calls, 0 errors, 4/4 score, 3/3 checks
- Ninth overall production confirmation of this canonical path
- First German-prompt confirmation (extends proven language set to en/es/pt/nn/de)

The only marginal improvement would be if the scoring system ever rewarded sub-2-call paths, but 2 calls is the theoretical minimum (must locate before reversing). The trusted standard and playbook have been updated with this confirmation.
