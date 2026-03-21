# Score-Aware Reflection — prod-2026-03-21-190910708Z-a3b089eb

## 1. Task Attribution

- **tx_task_id**: 11
- **Tier**: T2 (tasks 9–18), max leaderboard score = 4
- **Prompt**: Register supplier invoice INV-2026-9382 from Stormberg AS (org.nr 877462137), 61600 kr incl. MVA, account 6340, 25% incoming VAT
- **request_id**: 11384293

## 2. Correctness Verdict

**Correctness: 0 — complete failure.** All 4 checks failed. Score: 0/8 raw, 0/4 normalized.

Despite the agent believing the run was optimal (5 calls, 0 errors, voucher booked with number=1), the scorer rejected every single check. This is a correctness failure, not an efficiency issue.

The leaderboard best for task 11 is only 1/4 across 13 total attempts, meaning no attempt has ever fully succeeded on this task. Our run scored 0, worse than the previous best of 1.

## 3. Efficiency Verdict

Efficiency is moot — correctness was 0. The 5-call path was mechanically optimal, but since the final Tripletex state failed all checks, no efficiency bonus could apply.

## 4. Likely Root Cause

All 4 checks failed, which indicates a **fundamental problem** with the final Tripletex state, not a minor field-level issue. Possible root causes (in order of likelihood):

1. **importDocument-based supplier invoice may not create a correctly recognized supplier invoice for the scorer.** The importDocument path creates a voucher + supplier invoice object, but the scorer may validate the supplier invoice through a different lens (e.g., checking fields on the `/supplierInvoice` object itself that importDocument doesn't populate correctly, or expecting the invoice to be registered through a different workflow entirely).

2. **The supplier may need to exist before import or be matched differently.** If the scorer checks the supplier invoice's supplier linkage and the importDocument import creates its own internal supplier reference (separate from the POST /supplier-created entity), the supplier check would fail.

3. **Description casing mismatch.** The agent used "Kontortjenester" (capital K) while the prompt says "kontortjenester" (lowercase). If the scorer does case-sensitive matching on description, this could fail a check. However, this alone would not explain ALL 4 checks failing.

4. **The scorer may check fields not explicitly set in this flow**, such as:
   - `invoiceDate` on the supplier invoice object
   - `dueDate` on the supplier invoice object
   - Supplier invoice `amount` matching the expected gross
   - Whether the supplier invoice is properly linked to the created supplier id

5. **Task 11 may require a fundamentally different approach** than the EHF import path — possibly the beta `/incomingInvoice` endpoints or a direct supplier invoice creation path that the trusted standard explicitly excludes.

The fact that the leaderboard best is only 1/4 across 13 attempts suggests this task shape has a systemic unsolved problem — either the scorer expects something non-obvious, or the available API paths don't fully satisfy all 4 checks.

## 5. What Went Right

- **Mechanically optimal execution**: 5 calls, 0 errors, correct response parsing
- **Correctly followed trusted standard**: `values[0]` access, `row: 1`/`row: 2`, hard-coded `vatType: { id: 1 }`, two-step booking
- **Voucher booked successfully**: number=1 (non-zero)
- **Postings appeared correct**: expense 6340 net=49280 gross=61600, supplier -61600, system VAT 12320
- **Fast execution**: completed in ~89 seconds

## 6. What To Change Next Time

1. **Investigate the `/supplierInvoice` object created by importDocument.** After import + booking, do a `GET /supplierInvoice?supplierName=...&fields=*` to inspect what the scorer actually sees. Check whether `invoiceNumber`, `invoiceDate`, `amount`, `supplier.id`, and other scored fields are correctly populated.

2. **Preserve prompt description casing exactly.** Use "kontortjenester" (lowercase) not "Kontortjenester". The trusted standard already says this, but the agent violated it.

3. **Investigate alternative approaches for task 11.** Since the leaderboard best is only 1/4, the importDocument approach may fundamentally not produce a scorer-passing supplier invoice for this task shape. Consider:
   - Direct `POST /supplierInvoice` (if available in the openapi spec)
   - Checking whether importDocument's supplier invoice links to the agent-created supplier or creates its own
   - Reading back the supplier invoice after creation to verify field population

4. **Add a verification GET in sandbox proofs for task 11.** Read back `GET /supplierInvoice?...&fields=*` after the full flow to see exactly what Tripletex stores on the supplier invoice object. Compare against what the scorer likely checks.

5. **Do not assume "booked voucher + correct postings = correct supplier invoice."** The voucher may be correctly booked but the supplier invoice object may have wrong or missing field values that the scorer validates independently.

6. **The prior reflection was overconfident.** It declared the run optimal based on API response appearances without knowing the score. Future reflections should caveat that "mechanically clean ≠ scorer-correct" until confirmed by actual score.
