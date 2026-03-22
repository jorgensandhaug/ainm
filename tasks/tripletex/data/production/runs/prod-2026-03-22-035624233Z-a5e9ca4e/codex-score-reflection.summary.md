# Score-Aware Reflection

## Task Attribution

- **Run ID**: prod-2026-03-22-035624233Z-a5e9ca4e
- **tx_task_id**: 14 (T2 task, tier max = 4)
- **Prompt**: Norwegian nynorsk — create a full credit note reversing the invoice for "Programvarelisens" (47350 kr excl. VAT) to Nordlys AS (org.nr 902392165)
- **Attempt**: 21st attempt on task 14 (previous best: 4.0 — perfect T2 score)

## Correctness Verdict

**FAILED.** correctness = 0.125 (1/8 raw points). 4/5 checks failed.

| Check | Result |
|-------|--------|
| Check 1 | passed |
| Check 2 | failed |
| Check 3 | failed |
| Check 4 | failed |
| Check 5 | failed |

- **score_raw**: 1
- **score_max**: 8
- **normalized_score**: 0.25 (out of tier max 4)
- **Leaderboard best for task 14**: 4.0 (unchanged — this run did not improve it)

This is a severe correctness regression. The prior reflection wrongly concluded the run was optimal and successful based solely on the API returning `isCreditNote=true`. The credit note entity was created (Check 1 passed), but 4 other checks about the credit note's correctness or the resulting Tripletex state failed.

## Efficiency Verdict

Efficiency is moot when correctness is this poor. The run used 2 API calls with 0 errors, which is the proven minimal-call count for this task shape. If the final state had been correct, the score would have been 4.0 (perfect). The problem is entirely in correctness, not call count.

## Likely Root Cause

The exact root cause cannot be determined without seeing the scorer's check definitions, but the most plausible explanations are:

1. **Wrong invoice credited (stale environment)**: This was the 21st attempt on task 14. If the scoring environment retains state between attempts, a prior successful attempt (one of the 20 previous) may have already credited the correct invoice, marking it `isCredited=true`. This run's filter would exclude it and either find no candidates or find a DIFFERENT invoice with the same customer/amount/description (e.g., one created by a different prior attempt). The script would then create a credit note on the wrong invoice — explaining why Check 1 (credit note exists) passes but Checks 2-5 (correctness of the reversal) fail.

2. **Duplicate invoice ambiguity**: The script picks the highest `id` among matching uncredited invoices. If the environment has multiple invoices for Nordlys AS / Programvarelisens / 47350 from different attempts, the highest-id one may NOT be the one the scorer expects. The scorer likely expects the credit note on a specific invoice (identified internally by the scorer), and the script may have picked a different one.

3. **Environment state not reset**: `invoiceNumber=2` on the found invoice is suspiciously low, suggesting a fresh or partially-reset environment. But if partial state from prior attempts leaked through, the credit note target could be misaligned with what the scorer expects.

## What Went Right

1. **API execution was flawless**: 2 calls, 0 HTTP errors, 0 4xx responses.
2. **Trusted standard was followed exactly**: The agent read the standard, wrote the script, and executed the proven 2-call path.
3. **Duplicate handling was present**: The `reduce((a,b) => a.id > b.id ? a : b)` logic correctly handles multiple identical candidates.
4. **Correct endpoint used**: `PUT /invoice/{id}/:createCreditNote?date=...&sendToCustomer=false` is verified correct.
5. **Credit note was created**: The API confirmed `isCreditNote=true` and `creditedInvoice=<original id>`.

## What To Change Next Time

1. **Do NOT assume API success = scorer success.** The prior reflection concluded the run was "perfect" based solely on the API response. The scorer checks the final Tripletex state, which can differ from what the API reports. Future reflections should note when scoring data is unavailable rather than claiming perfection.

2. **Investigate stale environment state as a failure mode.** If the scoring environment retains state from prior attempts, the standard `isCredited=true` filter may exclude the correct invoice. The agent cannot control this, but the reflection should flag it as a known risk rather than ignoring it.

3. **Consider logging ALL candidates, not just the selected one.** In production, the script logged only the selected invoice. Logging all matching candidates (and all excluded `isCredited=true` ones) would help diagnose wrong-invoice selection.

4. **The 2-call path remains correct for fresh environments.** 16 prior production runs achieved perfect scores with this exact path. The flow itself is not broken — this failure is likely environmental. Do not change the standard flow.

5. **No playbook/standard changes warranted by this score alone.** The failure is not reproducible from the standard alone — it requires knowing whether the environment was clean. If future runs on task 14 also fail with the same pattern (Check 1 pass, rest fail), investigate whether the environment needs explicit cleanup or whether the scorer expects a specific invoice id rather than matching by attributes.
