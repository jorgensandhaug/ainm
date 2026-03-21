# Score Reflection — prod-2026-03-21-155323641Z-9b2a1d22

## 1. Task Attribution

- **tx_task_id**: 20 (T3 task, max score 6)
- **Prompt**: Register supplier invoice from PDF (Norwegian), create supplier if not exists
- **Supplier**: Bergvik AS / 919398051 / Sjøgata 2, 4611 Kristiansand / bank 58637944698
- **Invoice**: INV-2026-8506 / 2026-02-01 / due 2026-03-03 / net 41050 / VAT 25% 10262 / gross 51312 / account 6500
- **Attempt**: 5th for this task (prior best was 2.1)

## 2. Correctness Verdict

**NOT PERFECT.** correctness = 0.7 (7/10 raw, 2/6 checks failed).

- Checks 1–4: passed
- Check 5: **failed**
- Check 6: **failed**
- normalized_score: 2.1 / 6.0 max
- This is the exact same failure pattern (same checks, same score) as the prior Fjelltopp AS run for this same task

**Critical finding**: The prior trusted standard attributed the Fjelltopp 7/10 failure to missing `postalAddress` and `bankAccountPresentation` on `POST /supplier`. This run included both fields and still scored 7/10 with the same checks failing. **The prior root cause attribution was wrong.** Address and bank account are NOT what checks 5 and 6 test (or they are tested but were already passing, and the real failures are elsewhere).

## 3. Efficiency Verdict

The run used **5 API calls with 0 errors** — the theoretical minimum for this task shape. Efficiency was perfect. The score deficit is entirely due to correctness, not call count.

- POST /supplier → 201
- GET /ledger/account → 200
- GET /ledger/vatType → 200
- POST /ledger/voucher/importDocument → 201
- PUT /ledger/voucher/{id}?sendToLedger=false → 200

No wasted calls, no retries, no 4xx errors.

## 4. Likely Root Cause

The 2 failing checks are **not about supplier address or bank account** (disproven by this run). The most likely hypotheses for what checks 5 and 6 actually test:

### Hypothesis A: `sendToLedger=false` (MOST LIKELY)
The voucher response shows `numberAsString: "<Ikke bokført 1>"` — it was never booked. The trusted standard explicitly uses `sendToLedger=false`, but this was never tested against the actual scorer. If the scorer expects a booked voucher, this would consistently fail across all runs regardless of other data quality. This perfectly explains why both the Fjelltopp and Bergvik runs fail the same 2 checks.

### Hypothesis B: supplierInvoice object not properly linked
The importDocument creates both a voucher and a supplierInvoice object. Our flow PUTs the voucher postings but never touches the supplierInvoice object. If the supplierInvoice needs its `supplier` field explicitly linked (the EHF XML might not auto-link to the newly created supplier), that could be a failing check.

### Hypothesis C: VAT rounding
PDF says net=41050, VAT=10262, gross=51312. But 41050×1.25=51312.5≠51312. Tripletex recalculates: net=41049.6, VAT=10262.4 from gross/1.25. If the scorer expects exact PDF values (41050/10262), this is a persistent 0.4 NOK discrepancy. However, this seems unlikely to account for 3/10 points.

### Hypothesis D: Missing PDF attachment
The original PDF was not attached to the voucher/supplierInvoice. Only the synthetic EHF XML was attached via importDocument. If the scorer checks for the original document, this would fail.

**Recommendation for next sandbox investigation**: Test `sendToLedger=true` and examine the supplierInvoice object (`GET /supplierInvoice?...`) to see if it has the supplier correctly linked and what fields it carries.

## 5. What Went Right

1. **Perfect efficiency**: 5 calls, 0 errors — optimal for this task shape
2. **Complete PDF extraction**: All data fields correctly extracted (name, orgNr, address, bank, invoice number, dates, amounts, account)
3. **Correct flow execution**: Followed trusted standard exactly, no crashes, no retries
4. **importDocument response shape**: Correctly used `values[0]` (not `value`)
5. **PUT postings**: Correctly used `row: 1` and `row: 2` with all amount fields
6. **Supplier creation**: Included `postalAddress` and `bankAccountPresentation` in single POST
7. **Fast execution**: ~113s total, well within 300s budget

## 6. What To Change Next Time

### Immediate investigation needed (sandbox):
1. **Try `sendToLedger=true`** on the PUT voucher — this is the single most likely fix for checks 5+6. If balanced postings work, this should book the voucher immediately
2. **Examine the supplierInvoice object** with `GET /supplierInvoice?invoiceNumber=...&fields=*` to see if it has the supplier linked and what scored fields it carries
3. **Check if attaching the original PDF** to the voucher/supplierInvoice is expected

### Trusted standard corrections needed:
1. **Remove the incorrect attribution** at line 74: "scored 7/10 because the POST /supplier omitted postalAddress and bankAccountPresentation" — this was disproven by this run
2. **Update the sendToLedger guidance** once sandbox testing confirms whether `true` or `false` is correct
3. **Add supplierInvoice object inspection** to the verification flow if it turns out the supplierInvoice needs separate setup

### The next agent should:
1. Keep the same 5-call structure (it's optimal)
2. Change `sendToLedger=false` to `sendToLedger=true` on the PUT voucher
3. After the PUT, do a `GET /supplierInvoice?invoiceNumber=...&fields=*` (adds 1 call but reveals what the scorer sees)
4. If the supplierInvoice needs a supplier link, add a `PUT /supplierInvoice/{id}` step

### Call budget for investigation run:
- 5 calls (current optimal) + 1 GET supplierInvoice for diagnosis = 6 calls
- If sendToLedger=true works and supplierInvoice is auto-linked, the production path stays at 5 calls
