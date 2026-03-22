# Score-Aware Reflection: prod-2026-03-22-105224979Z-f1046aaf

## Task Attribution

- **Attributed task**: T25 (overdue invoice reminder fee and partial payment)
- **Task tier**: T3 (max score 6)
- **Inference status**: ambiguous (candidate_count=2), but leaderboard diff confirms T25 (attempt_delta=2, best_score=6 stable) and T14 (delta=1, concurrent run from another agent)
- **Prompt language**: English
- **Fee amount**: 55 NOK
- **Partial payment**: 5000 NOK

## Correctness Verdict

**Perfect correctness.** Score: 10/10 raw, normalized 6/6, all 6 checks passed.

- Check 1: passed
- Check 2: passed
- Check 3: passed
- Check 4: passed
- Check 5: passed
- Check 6: passed

This is the 13th run for this task shape. All production runs that completed without credential issues have scored 6/6 (perfect). The task shape is fully solved.

## Efficiency Verdict

**Near-optimal, 1 avoidable 422.** The run used 10 total API calls:

| # | Call | Result | Necessary? |
|---|------|--------|------------|
| 1 | GET /invoice (locate overdue) | 200 | Yes |
| 2 | GET /invoice/paymentType | 200 | Yes |
| 3 | GET /ledger/account?number=1500,3400 | 200 | Yes |
| 4 | POST /ledger/voucher (with `currency` at voucher level) | 422 | **WASTED** |
| 5 | POST /ledger/voucher (without `currency`) | 201 | Yes |
| 6 | POST /invoice (fee invoice) | 201 | Yes |
| 7 | PUT /invoice/:payment (partial payment) | 200 | Yes |
| 8 | GET /ledger/voucher (verification) | 200 | Free |
| 9 | GET /invoice (fee invoice verification) | 200 | Free |
| 10 | GET /invoice (overdue verification) | 200 | Free |

- **Optimal write path**: 6 calls (3 GETs + 3 writes)
- **Actual write path**: 7 calls (3 GETs + 4 writes, 1 wasted 422)
- **Verification GETs**: 3 (free, don't affect score)
- The 422 did not prevent perfect correctness (6/6), so the efficiency penalty was absorbed without score loss

Since best_score for T25 was already 6 and stayed at 6, this run matched but did not exceed the established optimum. The 1 wasted 422 means any efficiency bonus was slightly lower than the cleanest 6-call runs, but since normalized_score=6 regardless, the penalty was inconsequential.

## Likely Root Cause

The single wasted call was caused by **ambiguous `currency` placement in the trusted standard**:

- The trusted standard listed `currency: { "id": 1 }` as a bullet point under "on POST /ledger/voucher, send:" at the same indentation as other voucher-level fields
- The agent interpreted this as a voucher-level field and placed it on the VoucherDTO body
- VoucherDTO has no `currency` field — `currency` is a PostingDTO field, and it's optional
- The API returned `422 currency: Feltet eksisterer ikke i objektet`
- The agent recovered by writing a second script without `currency`, which succeeded

This is a **documentation bug**, not a logic error. The trusted standard and playbook have now been corrected to explicitly warn against voucher-level `currency` and to omit it entirely (sandbox-verified 2026-03-22).

## What Went Right

1. **Correct trusted-standard match**: immediately identified the exact match and read the standard before writing
2. **Correct data extraction**: found the single overdue invoice (#1, Blueshore Ltd, outstanding 31625, due 2026-02-13)
3. **Correct voucher structure**: row:1/row:2, account IDs (not numbers), customer on 1500 posting, balanced amounts
4. **Correct invoice structure**: orders[].orderLines[] (not top-level orderLines), no vatType (API defaults 0%)
5. **Correct partial payment**: paidAmount=5000 with paymentTypeId
6. **Fast recovery**: after the 422, immediately wrote a second script with hardcoded IDs from the successful GETs, avoiding re-reading anything
7. **All 6 checks passed**: perfect correctness across voucher, fee invoice, and partial payment
8. **Verification GETs**: logged full state for debugging

## What To Change Next Time

1. **Currency is already fixed**: The trusted standard and playbook now explicitly say "do NOT include `currency` at the voucher level" and omit it from the winning payload. No future agent should hit this trap.
2. **Single-script resilience**: The agent split into two scripts (overdue-reminder.ts then overdue-reminder2.ts) after the 422. A more resilient approach would be a single script with try/catch that retries without `currency` on the specific 422. However, since the root cause is now fixed in the docs, this is moot.
3. **No other improvements needed**: The 6-call path is confirmed optimal across 13+ production runs. No 5-call path exists (paymentTypeId is mandatory, account IDs are mandatory, currency field omission is the only simplification possible and is already applied). The task shape is fully solved.
