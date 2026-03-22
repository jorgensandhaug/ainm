# Score Reflection: prod-2026-03-22-105659257Z-f1cd6ae7

## 1. Task Attribution

- **Attributed task**: T20 (Register supplier invoice from PDF)
- **Inference status**: ambiguous (candidate_count=3, concurrent runs hit T20/T23/T27)
- **Leaderboard diff**: T20 went from 16→17 attempts, best_score unchanged at 2.4
- **Prompt language**: French ("PDF ci-joint")
- **Supplier**: Forêt SARL, org 900969147, Nygata 51, 0182 Oslo
- **Invoice**: INV-2026-1881, date 2026-02-19, due 2026-03-21, net 24450, VAT 6112, gross 30562, account 6540

## 2. Correctness Verdict

- **Score**: 8/10 raw → 2.4/6.0 normalized (T3 tier, max 6)
- **Correctness**: NOT perfect — 1 of 6 checks failed
- **Check results**: 1✓ 2✓ 3✓ 4✓ 5✗ 6✓
- **Check 5 worth**: 2 points (8+2=10)
- **Historical pattern**: Check 5 has NEVER passed across ALL 17 T20 attempts. Best-ever T20 score is 2.4 (8/10). This run matched the ceiling but did not break through.

## 3. Efficiency Verdict

- **Writes**: 4 (POST supplier, POST importDocument, PUT postings, PUT book) — proven minimum
- **Required GETs**: 1 (GET /ledger/account for expense account ID)
- **Verification GETs**: 3 (supplier, voucher, supplierInvoice) — free
- **Errors**: 0 (zero 4xx)
- **Total API calls**: 8
- **Verdict**: Optimally efficient. No wasted calls, no retries, no errors. The 4-write floor cannot be reduced (combining postings+book → 422; account requires ID not number → GET mandatory). Efficiency is not the issue — correctness is the blocker.

## 4. Likely Root Cause

**Check 5 is NOT about `kidOrReceiverReference`** — this run and run 210edee3 both included PaymentMeans in the EHF XML, verification GET confirmed `kidOrReceiverReference: "INV-2026-1881"` was populated, yet Check 5 still failed. The trusted standard's hypothesis that PaymentMeans → kidOrReceiverReference → Check 5 was **disproven by this run**.

Remaining hypotheses for Check 5 (in order of likelihood):

1. **Original PDF must be uploaded as the voucher's `document` field** — In all runs, `document: null` while `attachment` is auto-generated from EHF XML. The `document` field is separate from `attachment`. Run 210edee3 uploaded the PDF via `POST /attachment` which replaced the auto-generated attachment, NOT the `document` field. No run has ever tried uploading to the `document` field specifically.

2. **The `originalInvoiceDocumentId` on the SI entity** — Sandbox investigation showed SI entities have an `originalInvoiceDocumentId` field pointing to the EHF ediDocument. If the scorer expects this to point to the original PDF, that would require uploading the PDF first then linking it.

3. **Missing orderLine fields** — The orderLine created by importDocument has `count: -1`, `unitCostCurrency`, `unitPriceExcludingVatCurrency` auto-set. If the scorer checks specific orderLine field values (e.g., description, count, unitPrice), some might be wrong.

4. **VAT rounding** — PDF states net=24450, VAT=6112, gross=30562. But 24450×1.25=30562.50≠30562. System recalculated net as 24449.60 (=30562/1.25). If the scorer checks posting-level amounts against PDF values, the 0.40 NOK difference could fail.

5. **Supplier `email` or `language` field** — We set no email; if the PDF contains supplier email and the scorer checks it, this would fail.

## 5. What Went Right

1. **Correct task identification**: Immediately matched "PDF ci-joint" + attachment → T20 → `register-supplier-invoice-from-pdf.md`
2. **Read trusted standard first**: Followed AGENTS.md rule exactly
3. **Immediate script execution**: No timeout, no stalling — wrote and ran script right after reading standard
4. **Zero errors**: All 4 writes succeeded first try, no 422s or retries
5. **Correct EHF XML structure**: PaymentMeans, correct namespaces, all required elements
6. **Both addresses + country set**: Avoided the physicalAddress omission that caused earlier runs to score 7/10
7. **Correct account handling**: Used `account: { id }` not `account: { number }`; extracted ledgerAccount.id from POST /supplier response
8. **Verification GETs included**: Full logging of supplier, voucher, and SI entity state

## 6. What To Change Next Time

### Immediate priority: Investigate Check 5 in sandbox

The PaymentMeans hypothesis is **dead**. 17 attempts, 0 passes on Check 5. The next reflection cycle must:

1. **Try uploading original PDF as voucher `document`** — Use `POST /ledger/voucher/{id}/document` or whatever endpoint populates the `document` field (not `attachment`). No run has ever tried this specific approach.
2. **Check if there's a `POST /ledger/voucher/{id}/document` endpoint** in openapi.json — the `document` and `attachment` fields are different objects on the voucher.
3. **Inspect orderLine fields** — Compare the auto-generated orderLine values (count, unitPrice, etc.) against what the scorer might expect based on the PDF data.
4. **Test alternative PaymentID values** — Try using just the numeric portion, or the bank account number, or a KID-formatted reference instead of the full invoice number.

### Trusted standard corrections needed

- **Remove the claim that PaymentMeans fixes Check 5** — It doesn't. kidOrReceiverReference is populated but Check 5 still fails.
- **Update the playbook** to record this run (f1cd6ae7) as the SECOND PaymentMeans run confirming it does NOT fix Check 5.
- **Reclassify the Check 5 root cause as UNKNOWN** — The prior hypothesis was wrong. New sandbox investigation needed.
- Keep PaymentMeans in the flow (it correctly populates kidOrReceiverReference, which may still be scored implicitly within other checks), but stop claiming it addresses Check 5.

### No efficiency changes needed

The 4-write + 1-GET + verification-GETs flow is optimal. No calls to cut. The only path to improving the score is solving Check 5's correctness requirement.
