# Score-Aware Reflection

## Task Attribution

- **Inference status**: ambiguous (4 leaderboard entries changed: tasks 05, 06, 11, 12)
- **Most likely task**: **Task 11** — completion time 22:36:29 matches task 11's `last_attempt_after` (22:36:29.827183); task 11 also had +2 attempts during the window (15→17)
- **Task tier**: T2 (tasks 9-18), max 4 normalized
- **Task 11 historical best**: 1.0/4 across 17 attempts — systematically the hardest supplier-invoice task

## Correctness Verdict

**Correctness: 0.** All 4 checks failed. Score: 0/8 raw, 0/4 normalized.

Despite mechanically perfect execution (5 calls, 0 errors, all HTTP 2xx), the scorer found zero correct state. This is NOT an efficiency problem — it's a fundamental correctness failure where the final Tripletex state does not match what the scorer expects.

Feedback: "4/4 checks failed."
- Check 1: failed
- Check 2: failed
- Check 3: failed
- Check 4: failed

## Efficiency Verdict

Efficiency is irrelevant when correctness is 0. The 5-call path with 0 errors would have been optimal IF the final state were correct. The problem is upstream of efficiency.

## Likely Root Cause

The root cause is **unknown but likely systematic** — task 11 has best_score=1 across 17 attempts, meaning only 1 check has EVER passed on any run for this task.

**Leading hypotheses (all speculative without further investigation):**

1. **EHF import may produce the wrong supplierInvoice shape for task 11's scorer.** The import path creates a supplierInvoice object from the XML, but the scorer may check supplierInvoice fields (e.g., `amount`, `currency`, `invoiceNumber`, `supplier.id`, `invoiceDate`) that the EHF import either doesn't populate or populates differently than a native `/supplierInvoice` POST would. Since `/incomingInvoice*` is beta-locked (403), we've been working around it — but the workaround may not produce scorer-compatible state for this specific task.

2. **The all-checks-failing pattern suggests even the supplier check failed.** Since POST /supplier returned 201 with correct data, this could mean: (a) the scorer looks for the supplier in a non-obvious way (e.g., by name exact-match in a different locale), (b) the fresh account had environment issues, or (c) the proxy returned synthetic 201 responses that didn't persist to the actual Tripletex state.

3. **The submission inference_status "existing_processing_transition"** indicates another submission was already being processed. If the scorer evaluates state on a shared account and another run's submission modified the same account concurrently, the state may have been corrupted or the wrong snapshot was evaluated.

4. **Task 11 may have a fundamentally different expected flow** — perhaps it expects a different registration method than EHF import, or checks fields that our standard flow doesn't set (e.g., `paymentTypeId`, `invoiceDate` on the supplierInvoice object, `kid` number, or specific voucher metadata).

## What Went Right

- Read the trusted standard before writing any code
- Used hardcoded `vatType: { id: 1 }` (no wasted lookup)
- Accessed `importDocument` response correctly via `values[0]`
- Used explicit `row: 1` / `row: 2` on PUT postings
- Used `123456785` as buyer EndpointID
- Did not manually set Content-Type on FormData
- Two-step booking (sendToLedger=false then sendToLedger=true with version-only)
- Preserved exact casing "services de bureau"
- Correct VAT math: 75500/1.25 = 60400 net, 15100 VAT
- 5 calls, 0 HTTP errors — mechanically clean execution

## What To Change Next Time

1. **Investigate task 11 specifically.** With best_score=1/4 across 17 attempts, this task needs targeted sandbox investigation. The standard flow works for other supplier-invoice task IDs but apparently not for task 11. Future work should:
   - Check what the supplierInvoice object looks like after EHF import (read it back with `GET /supplierInvoice?...&fields=*`) to see if key fields are empty
   - Compare the supplierInvoice fields produced by EHF import vs what the scorer likely checks
   - Investigate whether a different import format or a direct voucher POST path could produce better results for this task specifically

2. **Do not assume mechanical success equals scoring success.** The prior reflection confidently declared this a "flawless" run based solely on HTTP status codes. The score was 0. Future reflections should note when task IDs have historically low best scores as a warning signal.

3. **Track task-to-score mapping.** Knowing which task IDs correspond to which prompt shapes would allow targeted investigation. Task 11 (best_score=1) is clearly different from other supplier-invoice tasks that score well (likely tasks 20 or others in the T3 range).

4. **Consider the "existing_processing_transition" signal.** When another submission is already being processed at capture time, the scoring may be unreliable. Future runs should note this status and consider whether the score should be treated with lower confidence.

5. **The prior reflection's production confirmation should be treated with skepticism.** The commit added this as a "13th production confirmation" for the register-supplier-invoice standard — but since it scored 0, it should not be considered confirmatory. A future reflection pass should update the trusted standard and playbook to note this failure.
