# Score Reflection — Run ea404bd5

## 1. Task Attribution

- **Run ID:** prod-2026-03-22-094639336Z-ea404bd5
- **Task ID:** 14 (T2 tier, max score = 4)
- **Task:** Issue full credit note for Ridgepoint Ltd (989339028), "Maintenance", 19650 NOK excl. VAT
- **Attempt:** 24th attempt on this task

## 2. Correctness Verdict

**Perfect.** Correctness = 1.0, score_raw = 8/8, all 5/5 checks passed.

No missing or incorrect side effects. The credit note was created correctly with the right customer, amount, and description linkage.

## 3. Efficiency Verdict

**Optimal.** normalized_score = 4 = tier max (T2 max = 4). This ties the leaderboard best for task 14 (best_score = 4 both before and after this run).

- 2 API calls total (1 GET + 1 PUT)
- 0 errors, 0 retries, 0 wasted calls
- Duration: 96s (well within 300s budget)
- No room for improvement — 2 calls is the theoretical minimum when invoice ID is not given in the prompt

## 4. Likely Root Cause

No issues. This is the 19th consecutive optimal production run for the credit note task shape. The trusted standard is fully mature and stable.

## 5. What Went Right

1. **Immediate pattern recognition** — matched the task to `create-customer-invoice-credit-note` trusted standard without hesitation
2. **Read standard first** — followed AGENTS.md's critical rule to read the trusted standard before writing the script
3. **No unnecessary reads** — did not read AGENTS.md fully, openapi.json, or the playbook (which would waste context budget)
4. **Clean 2-call script** — wrote the correct script on the first attempt with proper duplicate-invoice handling
5. **Correct filtering** — checked both `orderLines[].description` and `orders[].orderLines[].description`, excluded `isCreditNote` and `isCredited`
6. **Explicit `sendToCustomer=false`** — did not rely on endpoint default

## 6. What To Change Next Time

**Nothing.** This task shape is fully solved. The next agent should:

1. Match to the `create-customer-invoice-credit-note` trusted standard
2. Read the trusted standard file
3. Write and execute the same 2-call script pattern
4. Achieve the same 4/4 score

The only pitfall that has ever cost a call on this task shape is the duplicate-invoice edge case (run 949502619), which this script already handles by selecting the highest `id`. No further optimization is possible.
