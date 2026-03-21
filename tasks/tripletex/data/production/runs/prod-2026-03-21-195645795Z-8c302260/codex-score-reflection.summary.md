# Score-Aware Reflection — prod-2026-03-21-195645795Z-8c302260

## 1. Task Attribution

- **tx_task_id**: 11
- **Tier**: T2 (tasks 9–18), max leaderboard score = 4
- **Prompt**: Register supplier invoice INV-2026-6337 from Waldstein GmbH (Org.-Nr. 927720523), 55950 NOK incl. MwSt., account 7000, 25% input VAT (German prompt)
- **request_id**: f99dfd98
- **Leaderboard best before**: 1/4
- **Leaderboard best after**: 1/4 (unchanged — our 0 did not improve it)
- **Total attempts**: 14 (was 13)

## 2. Correctness Verdict

**Correctness: 0 — complete failure.** All 4/4 checks failed. Score: 0/8 raw, 0/4 normalized.

This is a **systemic failure on task 11**, not an issue specific to this run. Analysis of all known task 11 runs:

| Run | Supplier | Account | Calls | Errors | Score |
|-----|----------|---------|-------|--------|-------|
| aa17fe23 | Elvdal AS / 889157917 | 6500 | ? | ? | 0/8 |
| db7151ac | Brightstone Ltd / 890932991 | 6300 | 4 | 0 | 0/8 (no booking) |
| a3b089eb | Stormberg AS / 877462137 | 6340 | 5 | 0 | 0/8 |
| **8c302260** | **Waldstein GmbH / 927720523** | **7000** | **5** | **0** | **0/8** |

Every scored task 11 run: 0/8, all 4 checks failed, regardless of:
- Language (Norwegian, Nynorsk, English, German)
- Supplier name and org number
- Expense account (6300, 6340, 6500, 7000)
- Whether booking step was included or not
- Description casing

The leaderboard best of 1/4 (from an earlier, possibly non-import-based attempt) shows this task has never been fully solved.

## 3. Efficiency Verdict

**Efficiency is moot.** With correctness = 0, no efficiency bonus applies. The 5-call path was mechanically optimal and had 0 errors, but none of that matters when the final Tripletex state doesn't pass any scorer checks.

## 4. Likely Root Cause

The **importDocument-based supplier invoice approach is fundamentally wrong for task 11**. Evidence:

1. **All 4 checks fail consistently** — not 1 or 2, but ALL 4. This rules out minor field-value issues (wrong casing, wrong amount, etc.) and points to a fundamental mismatch between what the scorer expects and what the import approach creates.

2. **The same approach scores 7/10 on task 20** (PDF-based supplier invoices). So the import approach works for some supplier invoice tasks but not task 11 specifically.

3. **The Brightstone Ltd run** (db7151ac) omitted the booking step (4 calls, voucher unbooked) and scored 0/8. The Stormberg AS run (a3b089eb) included the booking step (5 calls, voucher booked with number=1) and also scored 0/8. **The booking step, while mechanically important, doesn't fix the fundamental issue.**

4. **Account variation makes no difference** — runs used accounts 6300, 6340, 6500, and 7000. All scored 0/8.

Likely hypotheses for WHY the import approach fails task 11:

- **The import may create a supplier invoice object that's not properly linked to the agent-created supplier.** The EHF XML contains supplier info, so importDocument may create or reference its own internal supplier entity rather than linking to the supplier we created via `POST /supplier`.

- **The supplier invoice object's fields (invoiceDate, dueDate, amount, vendorInvoiceNumber) may not be populated as the scorer expects.** The import path writes these into the XML, and Tripletex may parse/store them differently than what the scorer validates.

- **Task 11 may require a direct `POST /supplierInvoice` or another non-import endpoint** that creates the supplier invoice object with explicit field control. The trusted standard explicitly excludes `/incomingInvoice*` (beta/403), but there may be other paths.

- **The scorer may check the supplierInvoice object independently from the voucher**, and the importDocument-created supplierInvoice may have incorrect or missing critical fields that a direct creation path would populate correctly.

## 5. What Went Right

- **Mechanically perfect execution**: 5 calls, 0 errors, 0 4xx responses
- **All trusted standard pitfalls avoided**: `values[0]` extraction, explicit `row: 1/2`, hardcoded `vatType: { id: 1 }`, two-step booking, description casing preserved
- **German prompt handled correctly**: "Bürodienstleistungen" preserved exactly
- **Voucher booked**: number=1
- **Postings correct**: expense 7000 net=44760 gross=55950 vatType.id=1; supplier -55950; system VAT 11190
- **Fast execution**: ~124 seconds
- **Prior reflection correctly identified run as mechanically optimal** (but incorrectly assumed scoring would follow)

## 6. What To Change Next Time

### Critical investigation needed for task 11

1. **Read back the supplier invoice object after import.** After the 5-call flow, add `GET /supplierInvoice?supplierName=<name>&fields=*` to inspect what the scorer actually sees. Check whether `invoiceNumber`, `invoiceDate`, `amount`, `supplier.id`, and `outstandingAmount` are correctly populated and linked to the agent-created supplier.

2. **Try an alternative approach entirely.** The importDocument path has failed ALL 14 attempts on task 11. Consider:
   - `POST /supplierInvoice` if available in the OpenAPI spec (check the spec for this endpoint)
   - Creating the voucher directly via `POST /ledger/voucher` with explicit supplier linkage (the trusted standard says this scored 0/8 on supplier invoice tasks, but that was tested on different task IDs)
   - Check if there's a way to create a supplier invoice through `POST /supplierInvoice/voucher` or similar

3. **Investigate the supplier linkage.** The import creates a supplier invoice from the XML. Does Tripletex link this to our `POST /supplier`-created supplier, or does it create/match a different supplier entity? If the linkage is broken, all supplier-related checks would fail.

4. **Compare task 11 scorer checks to task 20 scorer checks.** Task 20 uses the same approach and scores 7/10. What are the 3 checks task 20 passes that task 11 doesn't? Understanding this difference would reveal what task 11 specifically requires.

5. **Do NOT assume the prior reflection's "optimal" assessment is correct.** This run was mechanically clean but the approach is fundamentally wrong for task 11. The trusted standard needs a task-11-specific branch or a complete rethink of the supplier invoice registration path for text-only prompts.

### Priority

Task 11 is the highest-priority investigation target. With a leaderboard best of only 1/4, solving this task would be a significant improvement. The current trusted standard is proven wrong for this task — 14 attempts, 0 successes.
