# Score-Aware Reflection

## 1. Task Attribution

- **Run ID**: prod-2026-03-21-233302338Z-b8f958e4
- **Task ID**: 11 (T2 tier, max 4 points)
- **Prompt**: French-language, register supplier invoice for Colline SARL (938165742) / INV-2026-8953 / 32650 NOK TTC / account 7300 / 25% VAT
- **Completion**: 2026-03-21T23:34:09Z (73.6s duration)

## 2. Correctness Verdict

**TOTAL FAILURE: correctness = 0, score = 0/8 raw = 0/4 normalized, 4/4 checks failed.**

Despite mechanically flawless execution (5 calls, 0 errors, voucher booked), every single check failed. The final Tripletex state does not match what the task 11 scorer expects.

Leaderboard context: task 11 best_score = 1/4 both before and after this run (unchanged). This run was attempt #21. The all-time best for task 11 is only 25% correctness, meaning this task has never been fully solved by any approach.

## 3. Efficiency Verdict

**N/A — correctness is 0, so efficiency is irrelevant.** The 5-call / 0-error execution was mechanically optimal, but optimizing call count matters nothing when the final state is completely wrong.

## 4. Likely Root Cause

All 4 checks failed despite:
- Correct supplier creation (name, org number)
- Correct EHF XML import creating a supplierInvoice object
- Correct postings (expense 7300, vatType:{id:1}, net 26120, gross 32650)
- Correct two-step booking (voucher booked, number=1)

**Possible explanations for total failure:**

1. **Task 11 scorer checks fundamentally different things** than what the EHF import path produces. Task 11 has only 4 checks (vs 8-10 checks on other supplier invoice tasks), suggesting it may be a different task variant with different expectations.

2. **The EHF import approach may not produce the correct supplierInvoice object state** for task 11's specific scorer requirements. The import creates a real `supplierInvoice`, but perhaps key fields on that object (e.g., `invoiceNumber`, `invoiceDate`, `amount`, `supplier` linkage, or `voucherNumber`) don't match what the scorer reads back.

3. **Date mismatch**: The script used `2026-03-22` (from system prompt "Today's date is 2026-03-22") but the run completed at `2026-03-21T23:34:09Z` UTC. If the scorer expects the invoice date to match the actual run date in UTC, this would be wrong. However, a date mismatch alone wouldn't explain ALL 4 checks failing.

4. **Task 11 may require a different registration approach entirely** — the consistently low best_score (1/4 = 25%) across 21 attempts suggests no existing approach has cracked this task. The EHF import path that works well for other supplier invoice tasks (consistent 5-call / 0-error optimal runs) does not work for task 11.

**Key signal**: Task 11's all-time best is 1/4 (one check passing). This strongly suggests the core approach — EHF import + postings PUT + booking — is fundamentally misaligned with what this specific task's scorer checks. This is not a minor tweak issue; it likely requires a completely different investigation.

## 5. What Went Right

- Read the trusted standard before writing the script
- Executed the proven 5-call path with 0 errors
- Hard-coded `vatType:{id:1}` (no wasted GET)
- Used `values[0]` for importDocument response
- Used explicit `row: 1` / `row: 2`
- Two-step booking completed correctly
- Description preserved with exact casing ("services de bureau")
- Buyer EndpointID `123456785` used correctly
- No Content-Type header on FormData
- All previously-documented pitfalls avoided

The mechanical execution was flawless. The problem is upstream: the approach itself may be wrong for task 11.

## 6. What To Change Next Time

1. **Do not assume task 11 uses the same scorer as other supplier invoice tasks.** Despite identical prompt format, task 11 consistently scores near-zero. The next agent should investigate what task 11's scorer actually checks, using sandbox read-back of the created objects.

2. **Investigate the supplierInvoice object state after import** — specifically: what fields does the scorer read, and do they match the prompt values? Key fields to verify: `invoiceNumber`, `invoiceDate`, `dueDate`, `amount`, `amountCurrency`, `supplier.id`, `voucher.id`, and the voucher's `number` (booked state).

3. **Try alternative approaches for task 11** — since the EHF import path has never achieved more than 1/4 on this task, consider:
   - Whether `POST /supplierInvoice` (non-beta) exists and works differently from the import path
   - Whether the scorer checks fields that importDocument doesn't populate correctly
   - Whether the postings structure needs to be different for task 11

4. **Use the run date, not the local date, for invoice/due dates** — the script used `2026-03-22` but the run completed at `2026-03-21` UTC. While unlikely to be the sole cause, this should be fixed.

5. **Task 11 needs dedicated sandbox investigation** — create the exact same objects (supplier + EHF import + postings + booking) in the sandbox, then read back ALL fields of the supplierInvoice and voucher to understand what state is actually produced. Compare this against what a direct `POST /supplierInvoice` would create (if available), or against what the scorer likely expects.

6. **Do not treat task 11's 0% score as a regression from the trusted standard** — the standard is correct for OTHER supplier invoice tasks (14+ consecutive optimal runs). Task 11 is a distinct problem that requires its own investigation path.
