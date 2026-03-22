# Score-Aware Reflection: prod-2026-03-22-104029218Z-210edee3

## 1. Task Attribution

- **Inference status**: ambiguous (candidate_count=2)
- **Diff entries**: T10 (+1 attempt, 22→23) and T20 (+1 attempt, 15→16)
- **Prompt**: Nynorsk supplier invoice from PDF (T20 shape)
- **Actual task**: T20 — register supplier invoice from PDF
- The ambiguity is a scoring-system artifact: the system detected changes in both T10 and T20 leaderboard entries during the capture window, but this includes a concurrent run's submissions (5f7bd963 for T20, f51460fc for T10) that completed within the same window.
- Our run's own two submissions (9aa6e4a5 and 3bff4488, queued at 10:42:26-27) were **still "queued"** at capture time (10:42:51). No final score is available for this specific run.

## 2. Correctness Verdict

**Score: PENDING (submissions still queued at capture)**

Available context:
- The concurrent T20 submission (5f7bd963, from a different run queued at 10:38:04) scored **8/10** (normalized 2.4), with **Check 5 failed** and checks 1-4,6 passed.
- T20 best_score remained at **2.4** (8/10), unchanged after this run — because our submissions hadn't been scored yet.
- T20 tier: T3 (tasks 19-30), max normalized = 6.0.

**Key difference from prior runs**: This run (210edee3) is the **FIRST production run to include PaymentMeans** in the EHF XML. The verification GET confirmed `kidOrReceiverReference = "INV-2026-8221"` (populated), which should resolve Check 5 — the only check that has EVER failed on T20 across all 16 attempts.

**Expected correctness**: 10/10 (6/6 checks pass) if PaymentMeans correctly populates `kidOrReceiverReference` as sandbox-verified. This would improve T20 best from 2.4 to potentially 3.0+ depending on efficiency scoring.

## 3. Efficiency Verdict

**The run used 5 writes + 1 required GET + 3 verification GETs = 9 total calls, 0 errors.**

| Call | Type | Necessary? |
|------|------|------------|
| POST /supplier | write | Yes — create supplier entity |
| GET /ledger/account?number=6300 | read (free) | Yes — need account ID (number-only → 422) |
| POST /ledger/voucher/importDocument | write | Yes — creates SI entity |
| POST /ledger/voucher/{id}/attachment | write | **NO — wasted 1 write** |
| PUT /ledger/voucher (postings) | write | Yes — set expense/credit postings |
| PUT /ledger/voucher (book) | write | Yes — book the voucher |
| GET /supplier (verify) | read (free) | Free, correct to include |
| GET /ledger/voucher (verify) | read (free) | Free, correct to include |
| GET /supplierInvoice (verify) | read (free) | Free, correct to include |

**Wasted call**: `POST /ledger/voucher/{id}/attachment` — importDocument auto-generates a PDF attachment from the EHF XML (sandbox-verified: `voucher.attachment` is already populated with `mimeType=application/pdf` after importDocument alone). This extra write provides zero scoring benefit.

**Optimal write count**: 4 (POST supplier, POST importDocument, PUT postings, PUT book).
**Actual write count**: 5 (1 extra attachment upload).

The prior reflection already corrected the trusted standard to remove the attachment step (4 writes).

## 4. Likely Root Cause

**Primary issue: Score unavailable (queued submissions)**

The run itself executed cleanly. The question is whether Check 5 passes with PaymentMeans. Based on:
- Sandbox verification: PaymentMeans → `kidOrReceiverReference` populated ✓
- Production verification GET: `kidOrReceiverReference: "INV-2026-8221"` ✓
- All 11+ prior T20 runs without PaymentMeans → Check 5 ALWAYS failed
- The fix is confirmed at every level except the final production score

**Secondary issue: 1 wasted write (attachment upload)**

The trusted standard at the time of the run included step 4 (PDF attachment upload) as part of the flow. This was unnecessary because importDocument auto-generates the PDF from the XML. The prior reflection already identified and corrected this in the trusted standard.

**Tertiary issue: Ambiguous attribution**

The scoring system attributed changes to both T10 and T20 because a concurrent run's submissions completed within the same capture window. This is a timing artifact, not an agent error.

## 5. What Went Right

1. **Correct task identification**: Immediately identified T20 (supplier invoice from PDF) and selected the correct trusted standard.
2. **Read-then-execute discipline**: Read the trusted standard, then IMMEDIATELY wrote and executed the script. No timeout, no stalling, no re-reading other files. This avoided the 0% outcome of prod-4c255d98 and prod-de228487.
3. **PaymentMeans inclusion**: First production run to include `<cac:PaymentMeans>` with `<cbc:PaymentID>` in the EHF XML, which should resolve the persistent Check 5 failure.
4. **Zero 4xx errors**: Clean execution with no validation errors, no retries, no wasted calls from mistakes.
5. **Both addresses + country**: Correctly set both `postalAddress` and `physicalAddress` with `country: { id: 161 }`.
6. **Correct response parsing**: Used `.values[0]` (not `.value`) for importDocument response.
7. **Correct posting structure**: Row 1 (expense, vatType 1) and Row 2 (credit, supplier linkage, invoiceNumber, termOfPayment).
8. **Verification GETs**: Included 3 verification GETs to confirm all entities, enabling the PaymentMeans fix to be validated.

## 6. What To Change Next Time

1. **Drop the attachment upload**: The trusted standard has been updated to remove `POST /ledger/voucher/{id}/attachment`. importDocument auto-generates both `ediDocument` (XML) and `attachment` (PDF). This saves 1 write, reducing the flow from 5 writes to 4 writes.

2. **Target flow (4 writes + 1 required GET + free verification GETs)**:
   - POST /supplier (with both addresses + country + bankAccountPresentation)
   - GET /ledger/account (expense account ID — free)
   - POST /ledger/voucher/importDocument (EHF XML with PaymentMeans)
   - PUT /ledger/voucher (postings, sendToLedger=false)
   - PUT /ledger/voucher (book, sendToLedger=true)
   - Verification GETs (free)

3. **Continue including PaymentMeans**: This is the critical fix for Check 5. Include `<cac:PaymentMeans>` with `<cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>` and `<cac:PayeeFinancialAccount><cbc:ID>${bankAccount}</cbc:ID></cac:PayeeFinancialAccount>` in every T20 EHF XML.

4. **Monitor this run's final score**: The two queued submissions should eventually complete. If T20 best improves beyond 2.4, the PaymentMeans fix is confirmed in production. If it stays at 2.4, investigate whether `kidOrReceiverReference` population alone isn't sufficient for Check 5.
