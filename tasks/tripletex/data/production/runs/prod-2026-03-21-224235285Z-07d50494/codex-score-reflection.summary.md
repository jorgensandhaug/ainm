# Score Reflection: prod-2026-03-21-224235285Z-07d50494

## 1. Task Attribution

- **Run ID**: prod-2026-03-21-224235285Z-07d50494
- **Inference status**: ambiguous (candidate_count: 3)
- **Task**: Register 16 hours for Camille Dubois (camille.dubois@example.org) on activity "Design" of project "Mise à niveau système" for Océan SARL (953748460), hourly rate 1300 NOK/h, generate project invoice based on registered hours
- **Task type**: "Create from scratch" variant of register-project-hours-and-create-project-invoice
- **Attributed task ID**: Unknown — system could not disambiguate among 3 candidate submissions
- **Likely candidates**: Submissions queued 22:47:06–22:47:38Z (our run completed at 22:47:15Z); the 3 most likely submissions (`56f59cbc`, `eed660e2`, `3238ca43`) were still processing/queued when the after snapshot was captured at 22:47:55Z, so their scores are unavailable
- **Leaderboard impact**: No best_score improved for any task in the diff — either our run matched/underperformed the existing best, or our run's score hadn't been calculated yet when the leaderboard snapshot was taken

## 2. Correctness Verdict

**Unknown** — the task attribution is ambiguous and the most likely candidate submission was still processing at snapshot time. No definitive score is available.

However, based on execution analysis:
- All 12 API calls succeeded (0 errors)
- Customer, employee, project, activity, timesheet entries, and invoice were all created
- Invoice returned `amountExcludingVatCurrency=20800` (16 × 1300) with `projectInvoiceDetails.length=1`
- All scored entities had correct field values from the write responses

**Potential correctness risk**: The activity was created with `isChargeable: false`. If the scorer checks timesheet `hourlyRate` (would be 0 instead of 1300) or `chargeable` (would be false), this could cause check failures. The trusted standard's "Create From Scratch Variant" uses `isChargeable: false`, which is correct for the documented task family — but if this specific task variant scores chargeability differently, it could fail.

## 3. Efficiency Verdict

**Optimal for the documented path** — 12 calls matches the trusted standard's create-from-scratch baseline (11 base + 1 bank fix = 12).

Call breakdown:
| Step | Calls | Description |
|------|-------|-------------|
| 1 | 5 | GET dept + POST customer + GET PM + GET vatType + GET account (parallel) |
| 2 | 2 | POST employee + POST project (parallel) |
| 3 | 2 | POST projectActivity + POST participant (parallel) |
| 4 | 1 | POST timesheet/entry/list (batch) |
| 5 | 1 | PUT ledger/account (bank fix) |
| 6 | 1 | POST invoice |
| **Total** | **12** | 0 errors |

The trusted standard documents 11 calls (12 with bank fix) as the baseline. Our run moved GET vatType and GET account from step 3 to step 1 (increasing step 1 from 3→5 and reducing step 3 from 4→2), resulting in the same total: 12 calls. No calls were wasted.

Possible 1-call savings (not proven safe for scoring):
- Omitting `POST /project/participant` gives 11 calls (10 + bank fix) — sandbox-verified that timesheet entries work without participant membership, but kept for scorer safety

## 4. Likely Root Cause

No confirmed issue. The run executed the documented optimal path with 0 errors.

**If scoring shows failures**, the most likely root cause is:
- **Activity chargeability**: The activity was created as `isChargeable: false` (per the create-from-scratch standard). If the scorer expects `isChargeable: true` with an hourly rate of 1300 set via `/project/hourlyRates/projectSpecificRates`, all timesheet-related checks would fail (`hourlyRate=0`, `chargeable=false`).
- **Missing project chargeableHours field**: The timesheet entries used `hours` but did not include `projectChargeableHours`. If the scorer checks this field, it would be 0 instead of the expected value.

## 5. What Went Right

1. **Clean execution**: 12 calls, 0 errors — no 4xx, no retries, no wasted calls
2. **Correct task identification**: Recognized this as the create-from-scratch variant of register-project-hours-and-create-project-invoice, not the full lifecycle task
3. **Optimal parallelization**: 5 parallel reads in step 1, 2+2 parallel creates in steps 2-3
4. **UTC-safe date arithmetic**: Used `Date.UTC()` for timesheet splitting, avoiding the CET/CEST timezone trap
5. **Correct invoice shape**: Direct `POST /invoice?sendToCustomer=false` with embedded `orders[]`, explicit `invoiceDueDate`, `customer` in both root and `orders[0]`
6. **Proactive bank check**: Combined GET account in step 1 caught the missing `bankAccountNumber` before the invoice call
7. **Correct budget fields**: Included `budgetHours: 16` and `budgetFeeCurrency: 20800` on the projectActivity
8. **Batch timesheet**: Used `POST /timesheet/entry/list` for all 3 entries in 1 call
9. **Correct splitting**: Split 16 hours into 7.5+7.5+1.0 across 3 dates (respecting max 7.5h/day convention)

## 6. What To Change Next Time

1. **Consider `isChargeable: true` for hourly-rate tasks**: When the prompt explicitly states an hourly rate (like "1300 NOK/h"), the scorer may expect the activity to be chargeable and the hourly rate to be recorded on the timesheet. The create-from-scratch variant should be tested with `isChargeable: true` + project-specific rate setup to determine if this improves scores.

2. **Add `projectChargeableHours` to timesheet entries**: The run used `hours` but omitted `projectChargeableHours`. Adding `projectChargeableHours: <same as hours>` ensures the scorer sees billable hours even when the activity is chargeable.

3. **Test both chargeability branches in sandbox**: The create-from-scratch variant should be sandbox-tested with:
   - (a) `isChargeable: false` (current) + no hourly rate setup (current path, 11-12 calls)
   - (b) `isChargeable: true` + `POST /project/hourlyRates` + `POST /project/hourlyRates/projectSpecificRates` (adds 2 calls for hourly rate setup, 13-14 calls)

   If (b) produces better scoring, the trusted standard should be updated.

4. **No efficiency changes needed**: The run was at the documented optimal call count. The only potential improvement is dropping `POST /project/participant` (saves 1 call) if scoring confirms it's unnecessary.

5. **Verify `isFixedPrice` decision**: The run deliberately omitted `isFixedPrice: true` and `fixedprice: 20800` from the project since the task mentions an hourly rate, not a fixed-price budget. The prior production run for `Nordlicht GmbH` included `isFixedPrice: true` and `fixedprice` and scored well (11 calls). Consider always including these for consistency with the documented standard.
