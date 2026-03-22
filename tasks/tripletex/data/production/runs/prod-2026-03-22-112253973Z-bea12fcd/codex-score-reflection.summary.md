# Score-Aware Reflection

## 1. Task Attribution

- **Run ID:** prod-2026-03-22-112253973Z-bea12fcd
- **Attributed task:** T18 (T2 tier, max 4 points)
- **Attribution method:** exact timestamp match — submission `completed_at` (2026-03-22T11:24:03.182853) matches leaderboard task 18 `last_attempt_at` exactly
- **Prompt:** Issue full credit note for Ridgepoint Ltd (900993560), "Maintenance", 30500 NOK excl. VAT

## 2. Correctness Verdict

**PERFECT.** correctness=1.0, score_raw=8/8, all 3/3 checks passed.

| Check | Result |
|-------|--------|
| Check 1 | passed |
| Check 2 | passed |
| Check 3 | passed |

## 3. Efficiency Verdict

**OPTIMAL.** normalized_score=4 = tier max (T2 max is 4). Tied with leaderboard best_score=4 for task 18 (both before and after this run).

- 2 API calls total (1 GET locate + 1 PUT createCreditNote)
- 0 errors, 0 retries, 0 avoidable 4xx
- No wasted calls

This is the 21st consecutive optimal production run for the credit-note task shape.

## 4. Likely Root Cause

No root cause needed — no issues. The run achieved perfect correctness and maximum efficiency.

## 5. What Went Right

1. **Exact trusted-standard match** recognized immediately; no time spent consulting openapi.json or exploring alternatives
2. **2-call minimal path** executed flawlessly: one decisive `GET /invoice` with wide date window and full field expansion, then one `PUT /invoice/{id}/:createCreditNote`
3. **Duplicate-invoice handling** pre-built into the script (pick highest `id`), preventing the pitfall that caused a wasted call in the 949502619/Programvarelisens run
4. **`sendToCustomer=false`** set explicitly, avoiding unintended dispatch
5. **No verification GET** — success proven from the PUT response alone (`isCreditNote=true`, `creditedInvoice=<original id>`)
6. **Zero errors** — no 4xx, no retries, no fallback paths triggered

## 6. What To Change Next Time

**Nothing.** This task shape is fully solved and stable. The next agent should:

1. Recognize the credit-note exact match from the trusted standard
2. Execute the same 2-call path without deviation
3. Continue handling duplicate invoices by picking highest `id`
4. Not add any extra GETs for customer lookup, invoice detail, or verification

The only theoretical improvement would be a 1-call path, which is only possible if the prompt provides the exact invoice ID (it never has in 21 runs).
