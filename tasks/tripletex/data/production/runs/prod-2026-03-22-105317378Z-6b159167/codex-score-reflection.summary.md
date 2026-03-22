# Score Reflection — prod-2026-03-22-105317378Z-6b159167

## 1. Task Attribution

- **Attributed task**: T11 (register supplier invoice, text-only)
- **Task tier**: T2 (tasks 9–18), max score = 4
- **Leaderboard diff**: T11 attempt_delta=+1, best_score unchanged at 1.0/4, total_attempts 24→25
- **Attribution confidence**: High — leaderboard T11 `last_attempt_after` (10:56:46) is within 2s of our `task_complete_timestamp` (10:56:44); prompt content (supplier invoice + importDocument) matches T11 exactly
- **Score status**: **AMBIGUOUS** — our 3 submissions (queued 10:56:50–52) were still `"processing"` when the after-snapshot was captured at 10:57:15. The T11 leaderboard delta corresponds to a *concurrent* submission (queued 10:53:07, scored 0/8) that completed during our run window, NOT to our submissions.

## 2. Correctness Verdict

**Unknown** — our submissions were still processing at snapshot time.

However, the final Tripletex state appeared correct:
- SupplierInvoice entity: amount=-50750, amountExcludingVat=-40600, invoiceNumber=INV-2026-6556, kidOrReceiverReference=INV-2026-6556, invoiceDueDate=2026-04-21
- Voucher 609407276 booked as number 1-2026 with voucherType=Leverandørfaktura
- Postings: expense 6500 (net=40600, gross=50750, vatType=1), supplier 2400 (-50750), system VAT (10150)
- Supplier: Solmar Lda, org=974178680

The concurrent T11 submission that DID complete scored **0/8** (4/4 checks failed), reinforcing that T11 is extremely challenging — best score is 1/4 after 25 attempts across all runs.

## 3. Efficiency Verdict

**Not minimal** — 11 total API calls vs optimal 8.

| Call | Status | Verdict |
|------|--------|---------|
| POST /supplier | 201 | Required |
| GET /ledger/account | 200 | Required |
| POST importDocument (attempt 1) | **422** | **WASTED** — buyer org `000000000` failed PEPPOL mod11 |
| GET /company/whoAmI | **422** | **WASTED** — proxy treats "whoAmI" as numeric ID |
| POST importDocument (attempt 2) | 201 | Required (fix: hard-code `987654325`) |
| GET /supplierInvoice (no dates) | **422** | **WASTED** — missing required `invoiceDateFrom`/`invoiceDateTo` |
| GET /supplierInvoice (with dates) | 200 | Required |
| PUT postings (sendToLedger=false) | 200 | Required |
| PUT book (sendToLedger=true) | 200 | Required |
| GET /ledger/voucher | 200 | Verification (free) |
| GET /supplier | 200 | Verification (free) |

**Wasted calls**: 3 (1 failed importDocument + 1 failed whoAmI + 1 failed supplierInvoice GET)
**Optimal path**: 8 calls = 4 writes + 4 reads (0 errors)

The failed importDocument returned 422, meaning no SI entity was created — so no duplicate-entity problem. But the wasted call still counts against efficiency.

## 4. Likely Root Cause

Three documentation gaps in the trusted standard caused 3 avoidable 4xx errors:

1. **Buyer org number in XML**: The trusted standard said "use company org number from whoAmI or a placeholder" without specifying the placeholder MUST pass mod11 validation. Using `000000000` triggered PEPPOL-COMMON-R041 → 422.

2. **whoAmI endpoint**: The trusted standard referenced `whoAmI` as a fallback for getting the company org number. The proxy interprets `/company/whoAmI` as `/company/{id}` where id="whoAmI" → 422 "Expected number". This endpoint simply doesn't work on the proxy.

3. **supplierInvoice GET date params**: The trusted standard showed `GET /supplierInvoice?voucherId={id}&fields=*` without mentioning that `invoiceDateFrom` and `invoiceDateTo` are REQUIRED query parameters. Omitting them → 422.

All three gaps have been **fixed** in the trusted standard and playbook by the prior reflection pass:
- Hard-code buyer org `987654325` (valid mod11)
- Never use `whoAmI` on the proxy
- Always include `&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31` on supplierInvoice GET

## 5. What Went Right

- **Trusted standard followed correctly**: The importDocument + two-step PUT + booking flow was executed correctly after recovering from the 3 errors.
- **Response shape handled correctly**: `.values[0]` (not `.value`) for importDocument — the bug that caused the d49da665 disaster was avoided.
- **No duplicate entities**: Despite the failed first importDocument (422), no orphaned SI entity was created. The retry created exactly one SI entity.
- **Correct amounts**: gross=50750, net=40600, vat=10150 — exact integers with no rounding issues.
- **PaymentMeans included**: `kidOrReceiverReference` was correctly populated from the XML `PaymentID`.
- **Posting descriptions preserved**: Portuguese text "serviços de escritório" used exactly as in prompt.
- **Recovery was clean**: The agent correctly identified each error, fixed it, and continued without creating duplicate state.

## 6. What To Change Next Time

1. **Hard-code buyer org `987654325`** in the XML template — NEVER use `000000000` or attempt `whoAmI`. This is now documented in the trusted standard.

2. **Always include date params on supplierInvoice GET** — `&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31`. This is now documented.

3. **Write the complete script in one shot** — the agent wrote the script, hit an error, edited it, hit another error, wrote a continuation script. Each retry added wasted calls. The trusted standard now has all pitfalls documented so the next agent should produce a zero-error script on first attempt.

4. **T11 scoring remains unsolved** — best is 1/4 after 25 attempts. The importDocument + booking flow is the correct approach but something about the final state still fails most checks. Possible areas to investigate:
   - Whether the voucher description ("Faktura nummer X fra Y", immutable from importDocument) fails a check expecting the prompt's description
   - Whether supplier address/physicalAddress fields need to be populated even when not in the prompt
   - Whether the orderLines on the SI entity need specific field values that importDocument doesn't set correctly
   - Whether the 0b6fe5b8 run's 1/8 score came from a different check combination than expected

5. **Consolidate into a single script** — avoid the crash-edit-retry pattern that multiplies API calls. The script should be complete and correct before execution.
