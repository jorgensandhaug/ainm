# Score-Aware Reflection

## 1. Task Attribution
- **Task ID:** T14 (credit note — create customer invoice credit note)
- **Tier:** T2 (max normalized score: 4)
- **Request ID:** 73782596
- **Prompt language:** Spanish

## 2. Correctness Verdict
**PERFECT.** correctness=1.0, score_raw=8/8, 5/5 checks passed.

All 5 checks passed. The credit note was correctly created with the right customer linkage, amount reversal (-8550 NOK ex VAT), and `sendToCustomer=false`.

## 3. Efficiency Verdict
**OPTIMAL.** normalized_score=4/4 (maximum for T2 tier).

- 2 API calls total (GET locate + PUT createCreditNote)
- 0 errors / 0 retries / 0 wasted calls
- Leaderboard best_score before run: 4 (already maxed at attempt 24)
- Leaderboard best_score after run: 4 (tied, attempt 25)
- This is the 20th consecutive optimal-score production run for this task shape

## 4. Likely Root Cause
No issues. Nothing to diagnose. The run achieved perfect correctness and maximum efficiency score on the first and only attempt.

## 5. What Went Right
1. **Immediate trusted-standard match** — recognized the credit note task shape instantly, read the trusted standard, and wrote the script without consulting openapi.json or other files.
2. **Exact 2-call path** — GET /invoice (wide locate with customer/orderLine expansion) → PUT /invoice/{id}/:createCreditNote. No unnecessary customer lookups, no verification GETs, no retries.
3. **Duplicate-invoice guard** — script included `reduce` to pick highest `id` if multiple identical invoices matched, preventing the pitfall from run 15.
4. **Unicode preservation** — "Asesoría de datos" matched correctly without ASCII normalization.
5. **Explicit `sendToCustomer=false`** — avoided the sending-enabled default.
6. **Fast execution** — 67s total duration including agent overhead.

## 6. What To Change Next Time
**Nothing.** This task shape is fully solved and has been producing maximum scores consistently across 20 runs in 6 languages (en/nb/nn/es/fr/de). The trusted standard and playbook are up to date with this run's confirmation.

The only theoretical improvement would be a 1-call path (skip the locate GET), but that requires a pre-known invoice ID which the prompt never provides. The 2-call path is the theoretical minimum for this task shape.
