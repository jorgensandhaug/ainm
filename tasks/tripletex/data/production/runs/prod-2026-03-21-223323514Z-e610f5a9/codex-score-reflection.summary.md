# Score Reflection — prod-2026-03-21-223323514Z-e610f5a9

## 1. Task Attribution

- **Attributed task**: Task 11 (T2, max score 4)
- **Evidence**: Leaderboard diff shows T11 gained +1 attempt (15→16), and `last_attempt_after` timestamp `2026-03-21T22:34:57.809413+00:00` exactly matches the submission's `completed_at`
- **Attribution confidence**: High — timestamp exact match despite ambiguous diff (3 tasks changed: T05, T11, T12)
- **T11 best score**: 1/4 (unchanged by this run — was 1 before, still 1 after)

## 2. Correctness Verdict

**Total failure**: 0/8 raw, 0/4 normalized, correctness=0. All 4 checks failed.

The run executed flawlessly at the API level (5 calls, 0 errors, clean postings, booked voucher) but produced a final Tripletex state that the scorer rejected completely.

Task 11 is systematically problematic: best score across all 16 attempts is only 1/4 (25%). This is the lowest-best-score T2 task, indicating a fundamental mismatch between what agents produce and what the scorer expects.

## 3. Efficiency Verdict

Efficiency is irrelevant when correctness=0. However, the run used the canonical minimum 5 calls with 0 errors — execution was mechanically optimal for the standard supplier invoice flow.

## 4. Likely Root Cause

The most likely root cause is that **the standard supplier invoice EHF/XML import flow does not produce the exact final state that Task 11's scorer checks**. Supporting evidence:

1. **The ONLY run that ever scored >0 on T11** was the Brightstone Ltd run (4 calls, 0 errors) which used the same EHF import path but **without the booking step** — voucher stayed unbooked (number=0). That run scored 1/4 (1 check passed). This run WITH booking scored 0/4 — meaning booking may have caused a previously-passing check to fail.

2. **Booking paradox**: The trusted standard says booking is required for Check 6 to pass. But for T11 specifically, the unbooked Brightstone run scored better than this booked run. This suggests either (a) T11's scorer checks something different than other supplier invoice tasks, or (b) the booking step changes the voucher state in a way that breaks a check that previously passed unbooked.

3. **Possible missing fields**: With 0/4 checks passing, the scorer likely checks fields or relationships that the EHF import path simply doesn't create or populate correctly. This could include:
   - Supplier invoice object fields (e.g., `invoiceDate`, `dueDate`, `invoiceNumber` on the `supplierInvoice` object itself vs. just in the voucher postings)
   - Supplier data fields (address/bank even for text-only prompts?)
   - A completely different expected workflow (manual voucher with direct supplier invoice linkage?)

4. **16 attempts, best=1/4**: The fact that no agent across 16 attempts has scored more than 25% on this task strongly suggests the current approach is fundamentally wrong for this task shape, not just missing a detail.

## 5. What Went Right

- **Flawless execution**: 5 API calls, 0 errors, 0 retries — mechanically perfect
- **Trusted standard followed exactly**: POST supplier → GET account → POST importDocument → PUT postings → PUT booking
- **Correct amounts**: net=28760, gross=35950, VAT=7190 (35950/1.25 exactly)
- **Description preserved**: "serviços de escritório" in exact prompt casing
- **Fast completion**: 94s total duration (well within 300s budget)

## 6. What To Change Next Time

1. **Investigate T11 deeply before next attempt**: The standard supplier invoice flow fails consistently on T11. Before the next run, use sandbox to investigate what the scorer actually checks for this task shape. Read back the `supplierInvoice` object created by the import to compare its fields against what might be scored.

2. **Compare booked vs unbooked**: The Brightstone run (unbooked, 1/4) outperformed this run (booked, 0/4). Test in sandbox whether the booking step modifies or clears fields on the `supplierInvoice` object that the scorer checks.

3. **Investigate alternative flows**: Since 16 attempts with the EHF import path max at 1/4, consider whether T11 requires a fundamentally different approach — e.g., direct `POST /ledger/voucher` with correct type, or a manual supplier invoice creation path that doesn't go through EHF import.

4. **Check supplierInvoice object readback**: After EHF import and voucher update, do a `GET /supplierInvoice?...` to see exactly what fields are populated vs empty. The scorer likely checks the `supplierInvoice` object directly, not just the voucher postings.

5. **Do not assume T11 is the same shape as other supplier invoice tasks**: The consistent 0-1/4 scoring across all attempts means T11 may require different treatment. Consider adding T11-specific handling to the trusted standard if an alternative flow is found.
