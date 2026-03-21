# Score Reflection — prod-2026-03-21-181408946Z-db7151ac

## 1. Task Attribution

- **Task ID:** 11 (T2, max normalized score: 4)
- **Prompt:** Register supplier invoice INV-2026-9075 from Brightstone Ltd (org no. 890932991) for 59800 NOK including VAT, office services (account 6300), 25% input VAT
- **Attempt:** 12 of 12 total on this task
- **Best score before:** 1 (normalized)
- **Best score after:** 1 (unchanged — this run did not improve)

## 2. Correctness Verdict

**Correctness: 0.** All 4 checks failed. Score: 0/8 raw, 0 normalized.

Despite all 4 API calls returning success (201, 200, 201, 200) with detailed response data including valid IDs and correct-looking postings, the scorer found the final Tripletex state did not satisfy any of the 4 checks. This is a **total correctness failure**, not an efficiency issue.

The prior post-run reflection was wrong — it concluded the run was "mechanically perfect" and "first production confirmation of the 4-call path." In reality, the approach produced a 0/8 score.

**Critical context:** Task 11 has a best_score of only 1 across 12 total attempts. This means no approach has ever scored higher than 1/4 normalized (≈2/8 raw, 1 of 4 checks passing) on this task. The problem is systematic, not specific to this run.

## 3. Efficiency Verdict

Efficiency is irrelevant — correctness was 0. The 4-call path was minimal in call count, but an efficient wrong answer scores worse than an inefficient correct one.

- 4 API calls used, 0 errors/retries
- No wasted calls in the mechanical sense
- But the entire approach may be fundamentally wrong for this task's scoring criteria

## 4. Likely Root Cause

The exact root cause cannot be determined without seeing the scorer's check definitions, but the most likely explanations ranked by probability:

1. **The EHF import + voucher PUT approach does not create the supplierInvoice object in the state the scorer expects.** The import creates a voucher and associated supplierInvoice shell, but the scorer may check specific fields on the supplierInvoice object itself (via `/supplierInvoice`) that the import+PUT path doesn't set correctly. The voucher remained unbooked (`number: 0`, `sendToLedger=false`), which may prevent the supplierInvoice from being fully registered.

2. **The scorer checks against a different Tripletex company or state than where the proxy forwarded calls.** The proxy token `G15I9kHWAwvEwD4e5WuUn255YBvmDp7SeWU13karSMQ` is an opaque string (not a JSON token like the sandbox). If the proxy mis-routed or failed to forward, the responses could be cached/mock while no actual state was created. However, the responses contain specific IDs and URLs pointing to `kkpqfuj-amager.tripletex.dev`, making this less likely.

3. **Task 11 has a fundamentally different scoring structure than other "register supplier invoice" tasks.** The fact that best_score is only 1 across 12 attempts — while similar tasks with the same approach have scored much higher — suggests task 11 may require something unique: a different endpoint, a booked voucher, specific supplierInvoice fields, or a different workflow entirely.

4. **The `sendToLedger=false` setting may be blocking the score.** The trusted standard explicitly says to use `sendToLedger=false`, but the scorer might require the voucher to be booked (`sendToLedger=true`) for the supplierInvoice to be considered "registered."

## 5. What Went Right

- Fast execution: 4 calls, 0 errors, well within 300s budget
- Correct identification of task as register-supplier-invoice pattern
- Correct use of trusted standard conventions (`values[0]`, explicit `row`, hard-coded `vatType.id=1`)
- No mechanical errors or retries in the API interaction
- Script structure was clean and reusable

## 6. What To Change Next Time

1. **Do not trust the trusted standard blindly for task 11.** The EHF import + voucher PUT approach has consistently scored poorly on this specific task (best 1/4 across 12 attempts). The playbook documents sandbox success but never proved production correctness for task 11 specifically.

2. **Investigate whether `sendToLedger=true` is needed.** The trusted standard says to use `sendToLedger=false`, but if the scorer checks for a booked voucher or a fully registered supplierInvoice, the voucher must be sent to ledger. Test this in sandbox.

3. **Investigate the supplierInvoice object state after import.** Use `GET /supplierInvoice?supplierInvoiceNumber=<invoice-number>&fields=*` in the sandbox to see what fields the import actually populates. Compare with what a manual Tripletex user would see. The scorer likely checks the supplierInvoice object directly, not just the voucher.

4. **Consider alternative approaches for task 11:**
   - Try `sendToLedger=true` on the PUT
   - Try setting `invoiceDate` and `dueDate` on the supplierInvoice object directly
   - Try using `PUT /supplierInvoice/{id}` instead of (or in addition to) `PUT /ledger/voucher/{id}` to set invoice-level fields
   - Investigate whether a `POST /supplierInvoice` endpoint exists and works (different from the EHF import path)

5. **The prior reflection committed playbook changes celebrating this run as "first production confirmation of the 4-call path."** This claim is invalidated by the 0/8 score. Future reflections should wait for score data before declaring production success.

6. **Add a cross-check step:** after the final PUT, do a `GET /supplierInvoice?supplierInvoiceNumber=INV-...&fields=*` to verify the supplierInvoice object state matches expectations. This costs 1 extra call but prevents silent correctness failures like this one.
