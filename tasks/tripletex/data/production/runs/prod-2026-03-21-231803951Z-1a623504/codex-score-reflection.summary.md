# Score-Aware Reflection: prod-2026-03-21-231803951Z-1a623504

## 1. Task Attribution

- **Task ID**: 11 (register supplier invoice)
- **Tier**: T2 (max 4 normalized)
- **Prompt language**: Spanish
- **Prompt**: Register invoice INV-2026-1443 from Montaña SL (org 831519975) for 50050 NOK VAT-inclusive, office services (account 6300), 25% input VAT
- **Text-only** (no PDF attachment)

## 2. Correctness Verdict

**Score: 0/8 raw, correctness=0, normalized=0. All 4 checks failed.**

This is a total failure — not a partial miss. Every single check failed, meaning the scorer could not find or verify ANY expected side effect.

Cross-referencing with all other tracked task 11 runs:

| Run | Score | Checks |
|-----|-------|--------|
| prod-2026-03-20-202623091Z-aa17fe23 | 0/8 | 4/4 failed |
| prod-2026-03-21-181408946Z-db7151ac | 0/8 | 4/4 failed |
| prod-2026-03-21-190910708Z-a3b089eb | 0/8 | 4/4 failed |
| prod-2026-03-21-195645795Z-8c302260 | 0/8 | 4/4 failed |
| prod-2026-03-21-212237391Z-aa847819 | 0/8 | 4/4 failed |
| **This run** | **0/8** | **4/4 failed** |

**Every single tracked task 11 run scored 0/8 with identical 4/4 check failure.** The leaderboard best_score of 1 (out of 4 normalized) must come from an earlier untracked run using a different approach.

## 3. Efficiency Verdict

The run used **5 API calls with 0 errors** — the documented minimum for the trusted standard's 5-call path with booking. Mechanically, the execution was flawless.

However, efficiency is irrelevant when correctness is 0. A perfectly efficient run that produces wrong state still scores 0.

## 4. Likely Root Cause

**The entire EHF import + PUT approach is fundamentally broken for task 11 scoring.** Evidence:

1. **6 consecutive 0/8 runs** using the same trusted standard, with varied supplier names, amounts, languages (English, Spanish, Norwegian), and accounts (6300, 6340, 6500, 6540) — all 0/8.
2. **All 4 checks fail every time** — this is not a partial correctness issue (like wrong VAT rate or missing field). The scorer cannot find the expected entities at all.
3. The trusted standard documents that a Brightstone Ltd run "scored >0" but that run predates our score-tracking and cannot be verified. The same Brightstone data re-run on 2026-03-21 also scored 0/8.

**Possible root causes** (in order of likelihood):
- The scorer expects the supplierInvoice object to have specific fields (like `vendorInvoiceNumber`, `invoiceDate`, etc.) that the EHF import sets differently than expected, or that the PUT step overwrites/clears.
- The scorer may look for the supplier invoice via a specific lookup path (e.g., `/supplierInvoice?supplierName=...` or `/supplierInvoice?invoiceNumber=...`) and the import-created object may not be indexed under the expected key.
- The invoice date used (2026-03-22 from system context) may not match what the scorer expects — the task was submitted at 2026-03-21T23:18 UTC, so the "correct" date could be 2026-03-21.
- There may be a fundamental mapping issue where the EHF import creates a supplierInvoice with `invoiceNumber` from the XML `cbc:ID` field, but the scorer checks a different field like `vendorInvoiceNumber`.

**Key insight**: With 20 total attempts on the leaderboard and best_score=1 (25% correctness), task 11 is deeply undertested. The trusted standard was built from sandbox mechanics proofs, not from scoring feedback loops. The approach may be technically correct in Tripletex but may not satisfy the scorer's specific check criteria.

## 5. What Went Right

1. **Flawless mechanical execution**: 5 calls, 0 errors, correct response parsing.
2. **Correct trusted standard matching**: Correctly identified "register supplier invoice" shape.
3. **Correct VAT math**: gross=50050, net=40040, VAT=10010 (50050/1.25 exact).
4. **Hard-coded vatType.id=1**: Skipped unnecessary GET /ledger/vatType call.
5. **Correct XML structure**: Used buyer EndpointID 123456785, included buyer PostalAddress, proper EHF namespaces.
6. **Correct booking**: Two-step PUT (sendToLedger=false then sendToLedger=true with version-only).
7. **Description casing preserved**: Used "servicios de oficina" exactly from prompt.
8. **Response parsing**: Used `values[0]` not `value`, used explicit `row: 1` / `row: 2`.

## 6. What To Change Next Time

### Immediate investigation needed (before next task 11 run):
1. **Sandbox deep dive**: After creating a supplier invoice via the EHF import path, query `/supplierInvoice?supplierName=...&fields=*` to verify what the scorer would see. Check if `invoiceNumber`, `vendorInvoiceNumber`, `invoiceDate`, and `supplier.name` are populated correctly on the supplierInvoice object.
2. **Check field mapping**: The XML `cbc:ID` (invoice number) may map to a different field than what the scorer checks. Verify by reading back the supplierInvoice after import.
3. **Try alternative date**: Use the run date from UTC perspective (2026-03-21) instead of system context date (2026-03-22) to see if date matching is the issue.
4. **Investigate if POST /supplierInvoice works**: The beta ban is on `/incomingInvoice*`. Check if `/supplierInvoice` POST is a non-beta alternative.
5. **Check if the PUT step clears imported fields**: After import, the supplierInvoice may have correct fields. The postings PUT might be overwriting or clearing critical fields. Try reading the supplierInvoice both before and after the PUT to see if anything changes.

### Process improvements:
- The trusted standard should NOT claim "scored >0" for specific runs without verified score data. The Brightstone claim was unverifiable and led to false confidence in the approach.
- Task 11 needs a scoring feedback loop: sandbox-prove what the scorer checks, then verify those specific fields exist in the final state.
- Consider building a "scorer simulation" step: after completing the flow, GET back the supplierInvoice and verify all likely checked fields match expectations.
