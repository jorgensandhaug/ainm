# Score Reflection — prod-2026-03-21-212237391Z-aa847819

## 1. Task Attribution

- **Task ID**: 11 (T2 tier, max 4 normalized points)
- **Prompt**: Register supplier invoice from Tindra AS (org.nr 983514650), invoice INV-2026-3624, 42100 kr gross (25% MVA), account 6540, description "kontortjenester"
- **Task shape**: Standard supplier invoice registration, text-only (no PDF), fresh account

## 2. Correctness Verdict

**FAILED — 0% correctness (0/8 raw, 4/4 checks failed)**

Despite the run executing mechanically without error (5 calls, 0 HTTP errors, voucher booked with number=1), the scorer returned 0/8 with every single check failing. This is a correctness failure, not an efficiency issue.

Key observation: Task 11's **best_score across all 15 attempts is only 1** (out of max 4 normalized). This means the best any approach has ever achieved on task 11 is 1 check passing out of 4. This task variant appears fundamentally resistant to the current EHF import approach.

## 3. Efficiency Verdict

Efficiency is irrelevant because correctness = 0. The 5-call path was the canonical minimum for this standard, but since all checks failed, the calls produced wrong or unrecognized final state regardless of count.

- 5 API calls executed (POST supplier, GET account, POST importDocument, PUT sendToLedger=false, PUT sendToLedger=true)
- 0 HTTP errors (all 2xx)
- No wasted calls from a mechanical standpoint
- Efficiency bonus does not apply at 0% correctness

## 4. Likely Root Cause

The run followed the trusted standard `register-supplier-invoice.md` exactly and produced what appeared to be correct state:
- Supplier created: Tindra AS / 983514650 (ID 108428564)
- Voucher 609159040 booked (number=1)
- Postings: debit 6540 net=33680 gross=42100 vatType=1, credit supplier -42100, system VAT 8420

Yet all 4 checks failed. The most likely root causes, ranked by probability:

1. **The EHF import approach may not produce the supplierInvoice object with the exact fields the scorer checks.** The import creates a supplierInvoice automatically, but fields like `amount`, `invoiceDate`, `dueDate`, `supplier` linkage, or `invoiceNumber` on the supplierInvoice object itself (distinct from the voucher postings) may not match scorer expectations. We never verified the supplierInvoice object directly.

2. **Duplicate supplier creation.** POST /supplier creates supplier 108428564. Then importDocument with the same org number 983514650 in the XML may auto-create a SECOND supplier entity. The supplierInvoice may then link to the auto-created supplier (with empty fields) rather than the one we explicitly created. The scorer checking the supplier linked to the invoice might find the wrong entity.

3. **The scorer checks the supplierInvoice state via a path that our approach doesn't satisfy.** Since task 11's best score across ALL attempts (14 prior + ours) is only 1/4, this task variant may require a fundamentally different approach that nobody has found yet — e.g., a different API path, or additional fields/steps not covered in the trusted standard.

4. **The trusted standard's "8 consecutive optimal runs" claim is misleading.** Those 8 runs were on different task IDs (different supplier invoice prompts). Task 11 specifically has never scored above 1/4. The standard works for SOME supplier invoice task variants but not for task 11.

## 5. What Went Right

- **Mechanical execution was flawless**: 5 calls, 0 errors, exact casing preserved, two-step booking completed, voucher booked with number=1
- **Followed trusted standard precisely**: Used `values[0]`, explicit `row: 1`/`row: 2`, hard-coded `vatType: { id: 1 }`, sendToLedger=false then sendToLedger=true
- **Fast execution**: ~96s total, well within 300s budget
- **No wasted time on documentation**: Read trusted standard, wrote script, executed — efficient use of time

## 6. What To Change Next Time

1. **Investigate the supplierInvoice object after creation.** Add a diagnostic `GET /supplierInvoice?supplierName=Tindra*&fields=*` after booking to see what fields the supplierInvoice actually contains. Compare against what the scorer likely checks (supplier linkage, amount, invoiceNumber, dates). This costs 1 extra call but provides critical diagnostic information for a task that has never scored above 25%.

2. **Test whether importDocument auto-creates a duplicate supplier.** In sandbox, POST a supplier with org X, then import an EHF with the same org X. Check if Tripletex creates a second supplier entity. If it does, test whether creating the supplier AFTER import (or skipping the explicit POST and relying on auto-creation) produces a cleaner state.

3. **Consider alternative approaches for task 11.** Since the best score is only 1/4 across 15 attempts, the EHF import path may be fundamentally wrong for this task variant. Investigate whether:
   - A direct `POST /ledger/voucher` approach (without EHF import) would satisfy the scorer differently
   - The scorer expects specific supplierInvoice fields that the import doesn't set
   - The scorer requires `incomingInvoice` endpoints (even though they return 403) — in which case this task is unsolvable with current permissions

4. **Do not claim the trusted standard is "proven" for all supplier invoice tasks.** The standard works for some task IDs but task 11 specifically has been resistant. Update the standard to note that task 11 is a known failure case requiring further investigation.

5. **Read the correct trusted standard first.** The agent initially read `register-receipt-expense-voucher.md` (wrong file) instead of `register-supplier-invoice.md`. While it recovered and ultimately read the correct file, this wasted one Read call. The agent should match the task to the correct standard immediately.
