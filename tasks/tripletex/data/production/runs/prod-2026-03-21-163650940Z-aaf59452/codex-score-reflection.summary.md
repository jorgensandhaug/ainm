# Score Reflection — prod-2026-03-21-163650940Z-aaf59452

## Task Attribution

- **tx_task_id**: 20
- **Tier**: T3 (tasks 19–30), max score = 6
- **Prompt**: Register a supplier invoice from attached PDF. Create supplier if needed. Use correct expense account and incoming VAT.
- **Supplier**: Luna SL / 966941901 / Fjordveien 86, 3015 Drammen / bank 36204404121
- **Invoice**: INV-2026-7337, date 2026-03-13, due 2026-04-12, Programvarelisens, net 38900, VAT 9725 (25%), gross 48625, account 6340

## Correctness Verdict

**Not perfect.** 7/10 raw, correctness = 0.7, normalized = 2.1/6.

- Checks 1–4: passed
- Check 5: **failed**
- Check 6: **failed**
- Feedback: "2/6 checks failed."

This score (2.1) **ties the all-time best** for task 20 across 6 total attempts. The best_score in the leaderboard was already 2.1 before this run and remained 2.1 after. This means the 2 failing checks represent a **structural gap** in the current approach, not a one-off mistake — every attempt on this task has hit the same ceiling.

## Efficiency Verdict

The run used **5 API calls, 0 errors** — mechanically clean execution following the trusted standard exactly. However:

- The post-run sandbox investigation proved a **4-call path** is possible by hard-coding `vatType: { id: 1 }` for 25% incoming VAT (skipping `GET /ledger/vatType`). This was not known at execution time.
- The normalized score (2.1) is lower than expected for 0.7 correctness on a max-6 task (0.7 × 6 = 4.2 if no efficiency penalty). The normalized 2.1 = 0.35 × 6, suggesting an efficiency factor of ~0.5. The extra `GET /ledger/vatType` call partially contributes to this, but the magnitude of the penalty (50%) suggests the scoring formula weights call count more heavily than expected, or there's another factor at play.
- The prior run for Bergvik AS (also task 20 shape, also 5 calls, 0 errors) had previously achieved the same 2.1 best, confirming the 5-call path consistently produces this score level.

## Likely Root Cause

### For the 2 failing checks (correctness gap):

The exact nature of checks 5 and 6 for task 20 is unknown. The run correctly included:
- All PDF fields (name, org nr, address, bank account, invoice details, amounts)
- `postalAddress` and `bankAccountPresentation` in `POST /supplier`
- Correct expense account 6340
- Correct VAT (25% incoming, vatType.id=1)
- Correct postings with `row: 1`, `row: 2`, currency amounts

**Hypotheses for failing checks** (in order of likelihood):
1. **Missing or incorrect field on the supplier invoice object** — the EHF import creates the supplierInvoice object, but some metadata field (e.g., a specific date format, currency field, or classification) may not be set correctly by the import, and the PUT only touches voucher postings, not the supplier invoice object itself.
2. **A field format or encoding issue** — e.g., the description "Programvarelisens" or supplier name "Luna SL" may need specific handling that isn't captured.
3. **A structural limitation of the EHF import path** — the imported supplier invoice may lack a specific scored property that a different registration method would provide.

Since all 6 attempts on task 20 hit the same ceiling (2.1), this is likely a systemic issue with the current approach rather than a field omission fixable by one agent.

### For the efficiency gap:

- The `GET /ledger/vatType` call (call 3 of 5) was unnecessary for 25% VAT — `vatType: { id: 1 }` can be hard-coded.
- This reduces the optimal path from 5 to 4 calls. The post-run sandbox proof confirmed this works.

## What Went Right

1. **Perfect mechanical execution**: 5 calls, 0 errors, no retries, no recovery branches
2. **Complete PDF data extraction**: all supplier fields (name, org nr, address, bank account) included in the supplier create — learned from the Fjelltopp failure
3. **Correct response parsing**: `values[0]` used for importDocument (not `value`) — learned from the Bølgekraft failure
4. **Correct posting structure**: explicit `row: 1` and `row: 2`, currency amounts on both rows
5. **Matched the all-time best**: 2.1 = best ever for task 20 across all attempts
6. **Post-run sandbox discovery**: proved a 4-call path by eliminating the vatType lookup

## What To Change Next Time

### Immediate (reduces call count from 5 to 4):
- **Hard-code `vatType: { id: 1 }`** for 25% incoming VAT — skip the `GET /ledger/vatType` call entirely. This was proven in sandbox (2026-03-21) and is now documented in the updated trusted standard and playbook.

### Investigative (to break the 2.1 ceiling for task 20):
- **Inspect the supplier invoice object** after creation: add a diagnostic `GET /supplierInvoice?supplierInvoiceNumber=INV-2026-7337&fields=*` in a sandbox test to see what fields the EHF import sets on the supplier invoice object. The failing checks may verify a field on the supplier invoice that the EHF import doesn't populate correctly.
- **Compare the supplier invoice object** from the EHF import path vs. alternative registration methods to identify missing scored fields.
- **Test if `PUT /supplierInvoice/{id}`** can update additional fields on the imported supplier invoice object (dates, amounts, references) that the import may set incorrectly.
- **Consider whether the checks verify the voucher's `date` field** — the postings don't explicitly set `date`, relying on the import to set it. If the import sets a different date than the invoice date, this could fail a check.

### Structural note:
The 2.1 ceiling across all 6 attempts suggests the 2 failing checks require either a different API approach or additional fields/calls not yet attempted by any run. This should be treated as a research problem for future reflection passes, not a simple field fix.
