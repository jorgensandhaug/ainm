# Score Reflection — prod-2026-03-21-192157347Z-2db258c9

## Task Attribution

- **Task ID**: 26 (T3, max 6 normalized points)
- **Prompt**: Register supplier invoice from attached PDF (Portuguese)
- **Attachment**: `leverandorfaktura_pt_08.pdf`
- **Attribution method**: Leaderboard diff from next run (`prod-2026-03-21-193204301Z-4c05e8f7`) shows task 26 gained 1 attempt with `last_attempt_after` matching our `completed_at` exactly (`2026-03-21T19:33:09.924800+00:00`)
- **Prior best**: 6.0 (already perfect)
- **Submission ID**: `5989f88a-b9f5-4db1-8873-94527e1346d8`

## Correctness Verdict

- **Score**: 2/10 raw, **0.6 normalized** (out of max 6)
- **Checks**: 5/6 failed — only Check 5 passed
- **Verdict**: **CORRECTNESS FAILURE** — the final Tripletex state did not match what the scorer expected on 5 of 6 dimensions

The run executed mechanically perfectly (5 API calls, 0 errors, voucher booked with number=1), yet scored terribly. This means the DATA fed into the API calls was wrong, not the API call pattern.

## Efficiency Verdict

Efficiency is moot at correctness < 1. The 5-call path with 0 errors would have been optimal IF the data had been correct. No API calls were wasted mechanically.

## Likely Root Cause

**PDF data misread.** The agent extracted these values from the PDF:
- Supplier: Luz do Sol Lda / 964942366
- Address: Kirkegata 135, 5003 Bergen / Bank: 53342237408
- Invoice: INV-2026-8987 / Date: 2026-01-06 / Due: 2026-02-05
- Description: Kontorrekvisita / Net: 24750 / VAT: 6187 / Gross: 30937 / Account: 6500

5/6 checks failed despite voucher being booked (Check 5 passed). This strongly suggests:
1. One or more extracted fields were wrong (name, org number, amounts, account, dates, description)
2. The PDF content was misinterpreted — possibly the layout was ambiguous or the agent misread a field during the initial PDF rendering
3. The single passing check (Check 5) is likely the structural check ("supplier invoice / voucher exists and is booked"), confirming the API flow pattern is correct

A secondary possibility is a **scoring delay issue**: the submission took ~11 minutes to score (queued 19:21:51, completed 19:33:09), which is much longer than the typical ~1 minute. If the Tripletex account was recycled or modified before the scorer read the state, fields could appear missing or corrupted. However, this is less likely than a simple data extraction error.

## What Went Right

1. **API flow pattern is correct**: 5 calls, 0 errors, voucher booked — the trusted standard's mechanical flow is proven
2. **Two-step booking works**: PUT sendToLedger=false then PUT sendToLedger=true confirmed again
3. **Hard-coded vatType.id=1** for 25% VAT works
4. **importDocument response**: correctly accessed via `values[0]`
5. **Posting rows**: `row: 1` and `row: 2` correctly set
6. **Supplier with address + bank**: included postalAddress and bankAccountPresentation in POST /supplier

## What To Change Next Time

1. **Double-check PDF extraction**: After extracting data from the PDF, verify internally that all values are consistent and plausible. If possible, re-read the PDF a second time to confirm critical fields (especially org number, amounts, and account number).

2. **Log extracted PDF values explicitly before writing the script**: Print a structured summary of all extracted fields so the trace shows exactly what the agent believed the PDF contained. This makes post-mortem diagnosis much easier when checks fail.

3. **Consider reading the PDF twice**: Read once to extract data, then read again to verify. The cost of an extra PDF read (0 API calls, only local I/O) is negligible compared to the cost of a 0.6 score.

4. **No changes to the API call pattern needed**: The 5-call trusted standard flow is mechanically correct. The issue is upstream (data extraction), not downstream (API execution).

5. **Investigate whether task 26 has special requirements**: Since the prior best is already 6 (perfect), some previous run got this task right. Understanding what that run did differently (if trace is available) could reveal what the scorer expects.

6. **Watch for scoring delays**: An 11-minute scoring delay is abnormal and could indicate backend issues. If scoring takes >5 minutes, the result may be unreliable, but there's nothing the agent can do about this during the run itself.
