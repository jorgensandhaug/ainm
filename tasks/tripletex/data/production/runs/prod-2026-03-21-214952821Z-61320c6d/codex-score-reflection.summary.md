# Score Reflection — prod-2026-03-21-214952821Z-61320c6d

## Task Attribution

- **tx_task_id**: 20 (T3, max score 6)
- **Task**: Register supplier invoice from PDF (Nynorsk prompt)
- **Supplier**: Fjelltopp AS / 804872205 / INV-2026-8221 / 60500 gross / 6300 / 25% VAT
- **Attempt**: 9 of 9
- **Prior best**: 2.4 (from attempt 8)

## Correctness Verdict

**Correctness: 0.8 (8/10 raw, 5/6 checks passed, check 5 failed)**

Not perfect. 1 check failed out of 6. The normalized_score of 2.4 reflects both the correctness penalty and the efficiency penalty from 1 wasted API call (422 error).

Check results:
- Check 1: passed
- Check 2: passed
- Check 3: passed
- Check 4: passed
- **Check 5: failed**
- Check 6: passed

This run matched but did not improve the prior best of 2.4. The leaderboard diff confirms: best_score unchanged at 2.4.

## Efficiency Verdict

**6 API calls, 1 error (422) — suboptimal. Optimal is 5 calls, 0 errors.**

Wasted call breakdown:
| # | Call | Status | Verdict |
|---|------|--------|---------|
| 1 | POST /supplier | 201 | Required |
| 2 | GET /ledger/account | 200 | Required |
| 3 | POST /ledger/voucher/importDocument | **422** | **Wasted — buyer block missing PostalAddress (BR-10)** |
| 4 | POST /ledger/voucher/importDocument | 201 | Required (retry after fixing XML) |
| 5 | PUT /ledger/voucher/{id}?sendToLedger=false | 200 | Required |
| 6 | PUT /ledger/voucher/{id}?sendToLedger=true | 200 | Required |

The 422 on call 3 was entirely avoidable. The EHF XML `AccountingCustomerParty` block was missing `<cac:PostalAddress>`, which is required by EHF BR-10 validation. Adding it to the buyer block fixed the issue on the second attempt.

With correctness at 0.8 and max tier score 6, the theoretical base is 0.8 × 6 = 4.8. The actual score of 2.4 is exactly half, suggesting a significant efficiency penalty on top of the correctness loss. An optimal 5-call, 0-error run with perfect correctness would likely score close to 6.0.

## Likely Root Cause

### Check 5 failure (correctness loss)
The exact content of check 5 is unknown. Possible explanations:

1. **Duplicate supplier from importDocument**: The successful importDocument call may have auto-created a second supplier record from the XML org number data, even though the explicit `POST /supplier` already created one. If the scorer checks supplier uniqueness or picks the wrong supplier, check 5 could fail. However, Tripletex normally links to existing suppliers by org number.

2. **Field mismatch from PDF extraction**: Some specific field on the supplier invoice or supplier may not match the expected value. Without knowing what check 5 validates, the exact field is unknown.

3. **Artifact from the failed 422 importDocument**: The failed first import attempt (422) should not have created any objects since it was a validation error, but if it left partial state, that could affect check 5.

Given that this task has never scored above 2.4 across 9 attempts, the check 5 issue appears persistent and likely reflects a structural problem with how this task shape is handled, not a one-off mistake.

### 422 error (efficiency loss)
Root cause: the agent wrote the XML buyer block (`AccountingCustomerParty`) without `<cac:PostalAddress>`. The trusted standard mentioned "a stable buyer block" but did not explicitly require `PostalAddress` or provide a complete template. The agent omitted it and hit EHF BR-10 validation.

This has been fixed in the post-run reflection: the trusted standard and playbook now include an explicit minimal buyer block template with `PostalAddress` and document the BR-10 pitfall.

## What Went Right

1. **Supplier creation with full data**: Correctly extracted address (`Solveien 92, 8006 Bodø`) and bank account (`53239317029`) from PDF and included them in `POST /supplier` via `postalAddress` and `bankAccountPresentation`
2. **Hard-coded vatType.id=1**: Correctly skipped `GET /ledger/vatType` for 25% incoming VAT
3. **importDocument response handling**: Correctly used `values[0]` (not `value`)
4. **Posting rows**: Correctly used `row: 1` and `row: 2`
5. **Two-step booking**: Correctly used `PUT sendToLedger=false` then `PUT sendToLedger=true` with only `{ version }`
6. **Voucher booked**: Final voucher had number=1 (booked), not 0 (unbooked)
7. **Recovery**: After the 422, quickly fixed the XML and succeeded on the retry
8. **Case preservation**: Used "Nettverkstjenester" exactly as extracted from PDF

## What To Change Next Time

1. **Always include buyer PostalAddress in XML**: The trusted standard now includes an explicit minimal buyer block template. Never omit `<cac:PostalAddress>` from `AccountingCustomerParty` — BR-10 rejects it. This alone would save 1 API call and eliminate the only error.

2. **Investigate check 5 failure**: The persistent check 5 failure across 9 attempts needs investigation. On the next run of this task shape, consider adding a diagnostic `GET /supplierInvoice?supplierName=...&fields=*` after the main flow to inspect what the scorer sees. This costs 1 call but may reveal the missing field.

3. **Check for duplicate suppliers**: After `POST /supplier` followed by `importDocument`, verify whether `importDocument` creates a duplicate supplier from the XML data. If it does, the scorer may find two suppliers with the same org number and pick the wrong one (the auto-created one without address/bank).

4. **5-call path is the minimum**: POST supplier → GET account → POST importDocument → PUT sendToLedger=false → PUT sendToLedger=true. No call can be eliminated. The goal is 0 errors.

5. **Max achievable score with current correctness**: Even with perfect efficiency (5 calls, 0 errors), the check 5 failure caps correctness at 0.8. To reach 6.0, the check 5 issue must be resolved first. Efficiency improvements alone cannot overcome the correctness gap.
