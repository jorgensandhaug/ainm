# Score-Aware Reflection: prod-2026-03-22-091622521Z-4c22beb6

## 1. Task Attribution

- **tx_task_id**: 20 (Register supplier invoice from PDF)
- **Tier**: T3 (max normalized score: 6)
- **Prompt language**: NB (Norwegian Bokmål)
- **Prompt**: "Du har mottatt en leverandorfaktura (se vedlagt PDF). Registrer fakturaen i Tripletex. Opprett leverandoren hvis den ikke finnes. Bruk riktig utgiftskonto og inngaende MVA."
- **Attachment**: `01-leverandorfaktura_nb_08.pdf` (Stormberg AS, INV-2026-2148, 6300 account, net 22950, VAT 5737, gross 28687)

## 2. Correctness Verdict

**NOT PERFECT** — correctness = 0.8 (8/10 raw, 1/6 checks failed)

| Check | Result |
|-------|--------|
| Check 1 | passed |
| Check 2 | passed |
| Check 3 | passed |
| Check 4 | passed |
| **Check 5** | **FAILED** |
| Check 6 | passed |

- normalized_score: **2.4** out of max 6
- Leaderboard T20 best before: 2.4 (from attempt 14, same batch)
- Leaderboard T20 best after: 2.4 (no improvement — this run tied)
- Total T20 attempts: 15
- This run is the **joint best** for T20 but still 60% below tier max

## 3. Efficiency Verdict

**Optimal** — 5 API calls, 0 errors, 0 retries.

The 5-call path (POST supplier → GET account → POST importDocument → PUT postings → PUT book) was sandbox-verified as the minimum possible. No calls were wasted. The efficiency factor is not the bottleneck — correctness is.

## 4. Likely Root Cause

Check 5 fails **consistently** across all T20 runs that score 8/10 — including this run which correctly set both `physicalAddress` and `postalAddress` with `country: { id: 161 }`. The memory hypothesis that "physicalAddress+country fixes Check 5" is **DISPROVEN** by this production result.

**Three hypotheses for persistent Check 5 failure, ranked by likelihood:**

### Hypothesis A: Missing PDF document attachment (STRONGEST)
The task provides a PDF file, but the script only uploads the EHF XML via `importDocument`. The voucher response shows:
- `ediDocument: { id: 1024359718 }` — the EHF XML
- `attachment: { id: 1024359719 }` — auto-generated from XML

The **actual PDF from the task prompt** is never uploaded. If Check 5 verifies that the original PDF document is attached to the supplierInvoice or voucher entity, this explains the persistent 2-point gap. In real Tripletex workflows, the scanned invoice PDF is always attached.

**Investigation needed**: After importDocument, use `POST /document` or the voucher's attachment endpoint to upload the actual PDF file from the task attachment path.

### Hypothesis B: Amount rounding discrepancy
The PDF states net=22950, VAT=5737, gross=28687. But 22950×1.25=28687.5, not 28687. Tripletex treats gross as authoritative and recalculates:
- Stored net: 22949.6 (not 22950)
- Stored VAT: 5737.4 (not 5737)
- Stored gross: 28687 (matches PDF)

If Check 5 validates the net or VAT amounts against PDF values, the 0.4 NOK discrepancy would cause failure. However, this is inherent to Tripletex's internal math (gross / 1.25) and would affect ALL runs equally.

### Hypothesis C: Missing supplier field
Some unset supplier field (e.g., `email`, `invoiceEmail`, `supplierNumber` override, or another attribute) might be checked. Less likely since the supplier was created with all the information from the PDF.

## 5. What Went Right

1. **Correct task identification**: Immediately recognized T20 (supplier invoice from PDF) and selected the matching trusted standard
2. **No wasted time**: Read trusted standard, immediately wrote and executed the script — no timeout risk
3. **Clean execution**: 5 calls, 0 errors, all returned 2xx
4. **Correct supplier setup**: Both postalAddress + physicalAddress with country:{id:161}, bankAccountPresentation
5. **Correct importDocument flow**: Used `.values[0]` (not `.value`), proper EHF XML, proper voucherType booking
6. **Extracted ledgerAccount.id from supplier response**: No wasted GET for account 2400
7. **Best T20 score tied**: 2.4 matches the best score ever achieved for this task

## 6. What To Change Next Time

### MUST investigate (to break 8/10 → 10/10):

1. **Upload actual PDF as document attachment**: After step 3 (importDocument), add:
   ```
   POST /ledger/voucher/{id}/attachment (or POST /document with voucher reference)
   ```
   Upload the actual PDF file from the attachment path. This would add 1 call (6 total) but could fix Check 5 worth 2 points. Net gain: +2 points correctness at cost of 1 extra call.

2. **Sandbox-verify PDF attachment**: In sandbox, create a supplier invoice with importDocument AND attach the PDF. Then compare the voucher's document/attachment fields to see if a new document appears. Check whether the supplierInvoice entity (not just the voucher) has a document reference that needs to be populated.

3. **Amount rounding**: If PDF attachment doesn't fix Check 5, investigate whether sending `amount: net` (exact PDF value) without `amountGross` changes how Tripletex stores the values. Or test whether omitting `amount`/`amountCurrency` and only sending `amountGross`/`amountGrossCurrency` changes the result.

### DO NOT change:
- The 5-call flow structure — it is correct and optimal for the parts it covers
- The EHF XML format — it works correctly for importDocument
- The supplier address setup — both addresses with country are correctly set
- The booking approach — version from step 4, voucherType in step 5

### Key insight:
The **memory note** claiming "sandbox-verified: all 42 field checks pass" for T20 must have used a different scoring methodology than production. The persistent 8/10 across production (even with physicalAddress fix applied) indicates a systematic gap in the flow, not a field-level omission. The most likely gap is the missing PDF attachment — a 6th API call that was never part of the trusted standard.
