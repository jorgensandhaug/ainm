# Score-Aware Reflection

## Task Attribution

- **Run ID:** prod-2026-03-21-223847665Z-a287981f
- **Prompt:** Register supplier invoice INV-2026-4995 from Fossekraft AS (949805727), 62850 kr, account 7000, 25% VAT (Nynorsk)
- **Task completed at:** 2026-03-21T22:40:06Z
- **Inference status:** ambiguous (candidate_count=2)
- **Candidates:** Task 06 (T1, max 2) and Task 11 (T2, max 4)
- **Most likely attribution:** Task 11 based on timing (last_attempt 22:40:08Z, 2s after completion)
- **Score:** **Unknown / not captured.** Our submission (`3f33fc28`, queued 22:40:16) was still "processing" when the after-snapshot was captured at 22:40:37Z. The leaderboard changes for task 06 and task 11 during the observation window came from other concurrent runs, not ours.

## Correctness Verdict

**Indeterminate.** The submission was not scored within the capture window. No normalized_score, score_raw, or check feedback is available for this run.

From the API responses alone, the run appears correct:
- Supplier created with correct name and org number
- Expense account 7000 resolved
- EHF XML imported successfully (201), voucher created
- Postings set correctly: debit 50280 on acct 7000 with vatType 1, credit -62850 linked to supplier, system VAT 12570
- Voucher booked (number=1-2026)

However, task 11's historical best_score=1/4 (25%) across 18 attempts is concerning. If this run IS task 11, the task type has a systemic correctness problem that 5-call optimal execution hasn't fixed. Possible causes:
- The scorer checks fields or objects that the EHF import path doesn't properly create
- The supplier invoice object created via importDocument may differ from what the scorer queries
- There may be a missing field (e.g., email, payment terms, or linked invoice reference) that costs 0/4 on every attempt

## Efficiency Verdict

**Optimal at the API level.** 5 calls, 0 errors, 0 retries. This matches the proven minimal path for fresh-account 25% VAT supplier invoice.

| # | Call | Status |
|---|------|--------|
| 1 | POST /supplier | 201 |
| 2 | GET /ledger/account?number=7000 | 200 |
| 3 | POST /ledger/voucher/importDocument | 201 |
| 4 | PUT /ledger/voucher/{id}?sendToLedger=false | 200 |
| 5 | PUT /ledger/voucher/{id}?sendToLedger=true | 200 |

No wasted calls. No avoidable 4xx errors.

## Likely Root Cause

No execution errors occurred. If the score turns out to be poor, the root cause is NOT efficiency — it's a correctness gap in the final Tripletex state that the API responses don't reveal.

The prior reflection incorrectly assumed the run was flawless based solely on API response data. The correct approach would have been to also verify the final state with a readback GET (at the cost of 1 extra call) to confirm the scorer-visible fields are correct.

**Systemic concern for task 11:** best_score=1/4 across 18 attempts means ~75% of correctness checks consistently fail. This is not an efficiency problem — something fundamental is missing from the approach. Investigation needed:
1. What exactly does the scorer check for register-supplier-invoice tasks?
2. Does the EHF import path create a proper `supplierInvoice` object visible via `GET /supplierInvoice`?
3. Are there supplier or invoice fields (email, payment terms, currency, category) that the scorer checks but we never set?
4. Does the scorer use a different readback query than we expect?

## What Went Right

1. Read trusted standard before writing script — avoided all documented pitfalls
2. Used `values[0]` (not `value`) for importDocument response
3. Explicit `row: 1` and `row: 2` on postings — avoided system-row 422
4. Hardcoded `vatType: { id: 1 }` — saved 1 GET call
5. Two-step booking (sendToLedger=false then sendToLedger=true with only version)
6. Preserved exact Nynorsk spelling "kontortenester" (not Bokmål "kontortjenester")
7. Used buyer EndpointID `123456785` — no PEPPOL validation errors
8. Let fetch set FormData Content-Type — no 415 error
9. Correct version chaining (1 → 3 for booking PUT)

## What To Change Next Time

1. **Investigate task 11 scorer expectations.** The 25% historical best across 18 attempts is a red flag. Before the next task 11 run, use sandbox to do a full readback of the supplier invoice, supplier, and voucher objects to understand what fields the scorer might check that we're not setting.

2. **Consider adding a diagnostic readback.** For task types with consistently poor scores, add a single `GET /supplierInvoice?supplierInvoiceNumber=...&fields=*` at the end to verify the scorer-visible state. The 1-call cost is worth it if it reveals what's missing.

3. **Check if the supplier invoice object exists at all.** The EHF import creates a voucher and supposedly a supplier invoice, but we've never verified the supplier invoice object via `GET /supplierInvoice`. If the import doesn't create a proper supplier invoice, that would explain 0/4 consistently.

4. **Score capture timing.** The submission wasn't scored within the 30s capture window. This may be systemic — consider extending the polling window for future runs to actually capture the score.
