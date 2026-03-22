# Score Analysis: Per-Check Failure Patterns (2026-03-22)

## Current State

**Total: 84.43 / 128 (65.9%)**

4 tasks at max (T25,T26,T27,T28 = 6/6 each). 16 tasks with gaps.

## Gap Ranking (points recoverable)

| Task | Score | Max | Gap | Checks Pattern | Priority |
|------|-------|-----|-----|----------------|----------|
| T23 bank-recon | 0.60 | 6 | 5.40 | Check 1 always fails, Check 2 passes. 5/7 runs 0.6, 2/7 runs 0. | HIGH |
| T29 project-lifecycle | 1.09 | 6 | 4.91 | Checks 1-2 pass. Checks 3-5,7 fail. Check 6 passes (new). 7 runs. | HIGH |
| T30 year-end-closing | 1.80 | 6 | 4.20 | Checks 1-3,6 pass. Checks 4-5 ALWAYS fail. 6/6 runs identical. | HIGH |
| T22 receipt-expense | 2.10 | 6 | 3.90 | 4/7 runs scored 0 (total failure). 1 run scored 2.1 (check 3 failed). | HIGH |
| T24 correct-ledger-errors | 2.25 | 6 | 3.75 | Checks 1,2,4 pass. Check 3 ALWAYS fails (7/7 scored runs). | HIGH |
| T20 supplier-invoice-pdf | 2.40 | 6 | 3.60 | Checks 1-4 pass. Check 5 ALWAYS fails. Check 6 passes in 3/6 runs. | HIGH |
| T21 onboard-employee-pdf | 2.57 | 6 | 3.43 | 9/10 checks pass. Check 5 ALWAYS fails (4/4 scored runs). | HIGH |
| T19 arbeidskontrakt-pdf | 2.73 | 6 | 3.27 | Check 10 ALWAYS fails (4/4 scored runs). Check 13 fails in 3/4. | MED |
| T11 register-supplier-invoice | 1.00 | 4 | 3.00 | ALL 4 checks fail in ALL 7 tracked runs (0/8 raw). Best=1 from untracked. | HIGH |
| T13 travel-expense | 1.12 | 4 | 2.88 | Checks 1,4,5 pass. Checks 2,3,6 ALWAYS fail (5/5 scored runs). | HIGH |
| T12 payroll | 2.40 | 4 | 1.60 | 1/6 runs passed all 4 checks. 3/6 runs scored 0. | MED |
| T10 create-order | 3.00 | 4 | 1.00 | All 5 checks pass (correctness=1). Gap is efficiency only. | LOW |
| T16 register-hours | 3.00 | 4 | 1.00 | All 4 checks pass. Gap is efficiency only. | LOW |
| T15 set-fixed-price | 3.33 | 4 | 0.67 | All 4 checks pass. Gap is efficiency only. | LOW |
| T17 custom-dimension | 3.50 | 4 | 0.50 | All 6 checks pass. Gap is efficiency only. | LOW |
| T06 create-send-invoice | 1.53 | 2 | 0.47 | All 5 checks pass (recent runs). Gap is efficiency. 1 old run had check 4 fail. | LOW |

---

## Detailed Per-Task Check Analysis

### T23 — Bank Reconciliation (gap 5.40, max 6)

**Check results across 7 runs:**
- Check 1: ALWAYS FAILS (5/5 scored runs)
- Check 2: ALWAYS PASSES (5/5 scored runs)
- 2 runs scored 0 (0/0 checks — likely timed out before submission)

**Pattern:** Only 2 checks are evaluated. Check 1 is the critical blocker. Check 2 passes (likely basic reconciliation structure exists). The task involves matching CSV bank statement lines to open invoices. Check 1 likely validates the actual matching/payment registration. The scorer may check for specific payment objects or reconciliation records that our approach doesn't create.

**Root cause hypothesis:** The bank reconciliation flow may need to use a specific API endpoint (POST /bank/reconciliation or similar) rather than manual voucher posting. Previous beta ban on /bank/reconciliation* was removed but the flow may still not be using the correct approach.

**Potential fix:** Investigate the bank reconciliation API flow — what object does the scorer look for?

---

### T29 — Project Lifecycle (gap 4.91, max 6)

**Check results across 7 runs:**

| Check | Best result | Pattern |
|-------|-------------|---------|
| 1 | PASS | Customer creation — always passes |
| 2 | PASS | Employee creation — always passes |
| 3 | FAIL | Project config/budget/manager — always fails |
| 4 | FAIL | Hours registration — always fails |
| 5 | FAIL | Supplier cost registration — always fails |
| 6 | PASS (new) | Invoice or participants — passes in 2 latest runs |
| 7 | FAIL | Structural check — always fails |

**Root cause hypotheses (from score reflections):**
1. **Check 3 — Project manager:** Scorer likely checks `project.projectManager.id` matches the employee named as PM. Current flow uses account owner because newly created NO_ACCESS employees can't be PM via API.
2. **Check 4 — Hours:** Timesheet entries created correctly (verified), but scorer may require employee to have employment linkage to division, or specific role fields.
3. **Check 5 — Supplier cost:** Leverandorfaktura voucher with project linkage on 6590 was implemented. May need a different approach (project orderline with working vendor field, or supplierInvoice object).
4. **Check 7 — Invoice details:** May need specific order-line breakdowns (hours vs cost) instead of single total line.

**Most impactful fix:** Solving PM assignment (check 3) and hours linkage (check 4) could add 4+ raw points.

---

### T30 — Simplified Year-End Closing (gap 4.20, max 6)

**Check results across 6 runs (ALL IDENTICAL):**
- Checks 1-3: PASS (three depreciation vouchers)
- Check 4: ALWAYS FAILS
- Check 5: ALWAYS FAILS
- Check 6: PASS (result disposition — recently fixed)

**Root cause (from score reflection):**
- **Check 4 (likely prepaid reversal):** Posts DR 6300 / CR 1700 for prepaid reversal. The contra account 6300 may be wrong for year-end (vs month-end where it works). Score reflections note this mapping works in month-end but may need a different contra for year-end.
- **Check 5 (likely tax provision):** Calculates preTaxProfit from balance sheet range 3000-8699 at 22%. Formula, rounding, or account range may be wrong.

**Key insight:** These 2 checks have NEVER passed across ALL attempts. The trusted standard's previous diagnosis was proven wrong (it claimed disposition was the issue, but disposition is check 6 which now passes). The actual root causes of checks 4-5 remain unidentified.

**Potential fix:** Sandbox investigation needed to determine correct prepaid contra account and tax calculation formula.

---

### T22 — Receipt Expense Booking (gap 3.90, max 6)

**Check results across 7 runs:**
- 4 runs: ALL 5 checks FAIL (score 0) — likely total execution failure
- 1 run: scored 0 from timeout (0/0 checks)
- 1 run: scored 0 (0/0 checks — timeout)
- 1 run (3373fbc9): Checks 1,2,4,5 pass. **Check 3 FAILS.** Score 2.1.

**Root cause for Check 3 (from score reflection):**
The successful run used Togbillett on account 7140 with vatType id=1 (25% VAT). The score reflection hypothesizes:
- **Train tickets should use 12% VAT** (Norwegian statutory transport rate), not 25%
- Account 7140's default vatType is id=12 (incoming 12%)
- The receipt says "herav MVA 25%" but this is a blended line for all items; per-item transport VAT is 12%
- amountGross should be 8750 with vatType id=12 (12% VAT), not vatType id=1 (25%)

**Why most runs score 0:** The receipt-expense flow is fragile — most runs fail to produce any valid voucher (sendToLedger, VAT handling, or department issues). Only 1 of 7 runs produced a scored result.

**Potential fix:** Two-pronged: (1) fix the VAT rate to 12% for transport, (2) improve execution reliability so runs don't score 0.

---

### T24 — Correct Ledger Errors (gap 3.75, max 6)

**Check results across 7 scored runs (ALL IDENTICAL):**
- Check 1: PASS (wrong account reclassification)
- Check 2: PASS (duplicate reversal)
- Check 3: ALWAYS FAILS (missing VAT correction)
- Check 4: PASS (incorrect amount correction)

**Root cause (from score reflection, conclusive):**
The missing-VAT correction always picks the WRONG voucher. Two vouchers exist on the target account with the same gross amount:
1. Correctly-booked voucher (WITH 2710 VAT posting) — script finds this one first
2. Error voucher (WITHOUT 2710 VAT posting) — this is the actual error to fix

The detection logic iterates and stops at the first match. The correctly-booked voucher appears first (earlier date), so the error voucher is never found.

**Fix:** Change the missing-VAT detection to specifically look for vouchers WITHOUT 2710 postings (Case A) rather than those WITH partial 2710 postings (Case B). The error is always a voucher booked with vatType=0 that should have had VAT.

---

### T20 — Register Supplier Invoice from PDF (gap 3.60, max 6)

**Check results across 6 runs:**
- Checks 1-4: ALWAYS PASS
- Check 5: ALWAYS FAILS (6/6 runs)
- Check 6: PASSES in 3/6 runs, FAILS in 3/6

**Pattern:** Check 5 is the persistent blocker. Check 6 improved from failing to passing in later runs.

**Root cause hypotheses:**
- **Check 5:** Likely validates supplier physical address or a specific supplier field not currently set. Investigation file `69-task20-physical-address.ts` exists, suggesting physical address was already explored. May be: invoice payment term, due date calculation, or a specific supplier field.
- **Check 6:** Likely validates a secondary field that was fixed in later runs (maybe attachment or booking status).

**Potential fix:** Investigate what Check 5 validates — physical address, payment terms, bank account, or another supplier/invoice field.

---

### T21 — Onboard Employee from Offer Letter PDF (gap 3.43, max 6)

**Check results across 4 runs (ALL IDENTICAL):**
- Checks 1-4, 6-10: ALWAYS PASS (9 checks)
- Check 5: ALWAYS FAILS

**Root cause hypotheses (from extensive investigation files 71-78):**
Multiple investigation files exist (71 through 78) testing various hypotheses:
- Standard worktime setup
- Employment readback verification
- Company standard time
- Separate details creation
- Payroll tax municipality
- Nested occupation code readback
- Remuneration type alternatives

**Check 5 likely validates:** One of these fields: standard worktime, payroll tax municipality code, employment sub-field, or a specific employment detail that's not being set.

**Key insight:** 4/4 runs have the exact same failure pattern. The fix is structural — one specific field or API call is missing from the flow.

---

### T19 — Arbeidskontrakt PDF Onboarding (gap 3.27, max 6)

**Check results across 4 scored runs:**
- Checks 1-9, 11-12, 14-15: ALWAYS PASS
- Check 10: ALWAYS FAILS (4/4 runs)
- Check 13: FAILS in 3/4 runs, PASSES in 1/4

**Root cause (from score reflection):**
- **Check 10:** Consistently fails. May be standard worktime (the 1 run that passed check 13 had different employment characteristics). The contract doesn't mention standard worktime, so the flow skips it, but the scorer may expect a default.
- **Check 13:** Failed in 3/4 runs. The 1 passing run had STYRK 3323 (vs 3313 in failing runs) or different contract characteristics.

**Potential fix:** Set standard worktime to 7.5h even when not in contract. Investigate STYRK code mapping differences.

---

### T11 — Register Supplier Invoice (gap 3.00, max 4)

**Check results across 7 tracked runs: ALL 4 checks FAIL (0/8 raw) in EVERY run.**

The leaderboard best_score of 1.0 must come from an untracked early run.

**Root cause (from score reflection):**
The entire EHF import + PUT approach is fundamentally broken for scoring. 6 consecutive 0/8 runs across varied suppliers, amounts, languages, and accounts all score 0. The scorer cannot find the expected entities AT ALL.

Possible causes:
1. The scorer looks up supplierInvoice via a field (invoiceNumber, vendorInvoiceNumber) that the EHF import doesn't populate correctly
2. The PUT step overwrites/clears critical fields from the import
3. The invoice date doesn't match expectations
4. An alternative approach (POST /supplierInvoice directly?) may be needed

**Potential fix:** Investigation files 53-63 and 84 exist. The fundamental approach may need to change from EHF import to a direct POST approach.

---

### T13 — Travel Expense (gap 2.88, max 4)

**Check results across 5 scored runs (ALL IDENTICAL):**
- Check 1: PASS (expense exists, delivered, correct employee)
- Check 2: ALWAYS FAILS
- Check 3: ALWAYS FAILS
- Check 4: PASS (flight cost correct)
- Check 5: PASS (taxi cost correct)
- Check 6: ALWAYS FAILS

**Root cause (from score reflection):**
Checks 2, 3, 6 are all per-diem related. The same 3 checks fail regardless of:
- Per-diem count (days vs days-1)
- rateType (25886 vs 25888)
- destination/location presence or absence
- Different employees/prompts/languages

**Explored hypotheses that DID NOT fix it:**
- count = days-1 (overnights) — no improvement
- rateType 25888 vs 25886 — no improvement
- Adding/removing destination/location — no improvement

**Unexplored hypotheses:**
- The `rate` or `amount` might need to be the system rate (1012) not the prompt rate (800)
- `overnightAccommodation` enum value may be wrong
- Some per-diem field combination is incorrect
- Orphan OPEN expenses from failed attempts may confuse the scorer

**Potential fix:** Deep investigation of per-diem compensation fields. Try using the system-defined rate instead of prompt-specified rate.

---

## Opportunity Matrix

### Tier 1 — Highest ROI (large gap + clear fix path)

| Task | Gap | Fix Difficulty | Notes |
|------|-----|---------------|-------|
| T24 | 3.75 | LOW | Just fix voucher selection logic (find no-2710 voucher) |
| T22 | 3.90 | LOW | Fix VAT rate to 12% for transport + improve reliability |
| T21 | 3.43 | MED | Single missing field (check 5) — need to identify which |
| T20 | 3.60 | MED | Single missing field (check 5) — need to identify which |

### Tier 2 — Medium ROI (large gap, harder fix)

| Task | Gap | Fix Difficulty | Notes |
|------|-----|---------------|-------|
| T30 | 4.20 | MED | Checks 4-5 never pass — need sandbox investigation |
| T29 | 4.91 | HIGH | 4 failing checks, structural problems |
| T23 | 5.40 | HIGH | Check 1 never passes — may need different API approach |
| T13 | 2.88 | HIGH | 3 per-diem checks never pass — extensively explored |
| T11 | 3.00 | HIGH | Total scoring failure — may need fundamentally different approach |

### Tier 3 — Low ROI (efficiency-only gaps)

| Task | Gap | Fix | Notes |
|------|-----|-----|-------|
| T10 | 1.00 | Reduce API calls | All checks pass |
| T16 | 1.00 | Reduce API calls | All checks pass |
| T15 | 0.67 | Reduce API calls | All checks pass |
| T17 | 0.50 | Reduce API calls | All checks pass |
| T06 | 0.47 | Reduce API calls | All checks pass |

### T12 — Special Case

Gap: 1.60. Only 1/6 runs scored full marks. 3/6 runs scored 0. The flow works when it works but is unreliable. Fix is reliability (avoiding execution failures) rather than a specific check fix.

---

## Recommended Next Steps (ordered by expected points gained)

1. **T24 fix voucher selection** — Change missing-VAT detection to find vouchers WITHOUT 2710 (not WITH). Expected gain: +3.75 points. Difficulty: trivial code change in trusted standard.

2. **T22 fix VAT rate** — Use vatType id=12 (12%) for transport receipts instead of id=1 (25%). Fix execution reliability. Expected gain: +2-4 points.

3. **T21 identify check 5** — Run one more sandbox investigation to identify the single missing field. Expected gain: +3.43 points.

4. **T20 identify check 5** — Similar to T21, find the one missing field. Expected gain: up to +3.60 points.

5. **T30 sandbox investigation** — Determine correct prepaid contra and tax formula for year-end. Expected gain: +4.20 points.

6. **T19 standard worktime** — Try setting default 7.5h worktime even when not in contract. Expected gain: +1-3 points.

7. **T29 project manager** — Investigate if employees can be assigned PM via different API path. Expected gain: +2-4 points.

8. **T13 per-diem investigation** — Try system rate vs prompt rate, different accommodation enum. Expected gain: +2.88 points.

9. **T23 bank recon API** — Investigate correct bank reconciliation endpoint. Expected gain: +5.40 points.

10. **T11 alternative approach** — Try POST /supplierInvoice directly instead of EHF import. Expected gain: +3 points.
