# Efficiency Review: Tasks with All Checks Passing (2026-03-22)

## Summary

Five tasks pass all correctness checks but lose points on efficiency. After reviewing each trusted standard, production run data, and sandbox proofs, the conclusion is that **most efficiency gaps are structural scoring-formula artifacts, not fixable agent behavior**.

| Task | Score | Max | Gap | Calls (actual) | Calls (floor) | Fixable? |
|------|-------|-----|-----|----------------|---------------|----------|
| T10 create-order | 3.0 | 4 | 1.0 | 5 | 5 | NO |
| T16 register-hours | 3.0 | 4 | 1.0 | 7-11 | 7 | YES (partially) |
| T15 set-fixed-price | 3.33 | 4 | 0.67 | 3-7 | 3 | YES (partially) |
| T17 custom-dimension | 3.5 | 4 | 0.5 | 5 | 5 | NO |
| T06 create-send-invoice | 1.53 | 2 | 0.47 | 3-6 | 3 | NO |

---

## T10 — Create Order, Invoice, Register Payment (gap 1.0)

**Current best:** 3.0/4 with 5 calls, 0 errors.

**Theoretical minimum:** 5 calls. Exhaustively proven in sandbox:
1. `GET /customer?organizationNumber=...` -- cannot inline org number in POST /order (422)
2. `GET /product?number=X,Y` -- cannot inline product number in POST /order (creates orphaned lines)
3. `GET /invoice/paymentType` -- cannot hardcode paymentTypeId (422), cannot omit it (422)
4. `POST /order` with embedded orderLines
5. `PUT /order/:invoice` with combined payment (paidAmount=0.01 seed)

**Why POST /invoice won't help:** T10 requires registering full payment. `PUT /order/:invoice` uniquely combines invoice creation AND payment in one call via query params (paymentTypeId + paidAmount + paymentTypeIdRestAmount). `POST /invoice` does not support payment parameters.

**Verdict: STRUCTURAL.** The 1.0 gap is a scoring-formula artifact. The agent already executes the minimum possible path. No trusted-standard change needed.

---

## T16 — Register Project Hours and Create Project Invoice (gap 1.0)

**Current best:** 3.0/4 (multiple runs).

**Theoretical minimum by branch:**
- <=24h, non-chargeable, bank configured: **6 calls** (GET employee + GET project + GET activity + POST timesheet/entry + parallel[GET vatType + GET account] + POST /invoice)
- <=24h, non-chargeable, bank unconfigured: **7 calls** (add PUT /ledger/account)
- >24h, non-chargeable, configured: **7 calls** (batch POST timesheet/entry/list replaces 2 individual writes)
- >24h, non-chargeable, unconfigured: **8 calls**
- Chargeable branch adds GET /project/hourlyRates + possible POST/PUT rates = +1-3 calls

**Production issues observed:**
1. **Not using batch timesheet** -- agent uses N individual `POST /timesheet/entry` instead of 1 `POST /timesheet/entry/list` for >24h. Cost: +1 call per extra date chunk.
2. **Not using POST /invoice** -- some runs still use `POST /order` + `PUT /order/:invoice` (2 calls) instead of `POST /invoice` (1 call). Cost: +1 call.
3. **Reactive bank repair** -- some runs hit 422 then recover (3 extra calls) instead of proactive check (+1-2 calls). Cost: +1-2 calls, +1 error.

**Trusted standard status:** Already updated with all three optimizations (batch timesheet, POST /invoice, proactive bank check). The agent needs to consistently follow the standard.

**Achievable improvement:** If the agent consistently uses the standard's optimized path (batch timesheet + POST /invoice + proactive bank check), expected calls drop from ~8-11 to ~7-8. This could improve score from 3.0 toward 3.3-3.5. The gap is partially structural (7+ calls will always incur some penalty) but partially addressable by eliminating agent mistakes.

**Action: None on trusted standard (already optimal). Focus on agent compliance.**

---

## T15 — Set Project Fixed Price and Invoice Partial Payment (gap 0.67)

**Current best:** 3.33/4 (from a 6-call update-needed + configured-bank run).

**Theoretical minimum by branch:**
- Skip-PUT (project already has correct fixedprice): **3 calls** (GET project + GET vatType + POST /invoice)
- Update-needed, bank configured: **5 calls** (GET project + parallel[PUT project + GET vatType + GET /ledger/account] + POST /invoice)
- Update-needed, bank unconfigured: **6 calls** (add PUT /ledger/account)

**Production reality:**
- 82% of update-needed runs have missing bank accounts (9/11 runs), so 6-7 calls is typical
- The skip-PUT branch (3 calls) fires rarely since production projects usually need fixedprice updates
- Best achievable on a skip-PUT run: **3 calls = likely ~4.0 score** but this branch is rare (~10% of runs)
- Best achievable on update-needed + configured: **5 calls = likely ~3.5-3.7**
- Best achievable on update-needed + unconfigured: **6 calls = likely ~3.3**

**Trusted standard status:** Already updated with POST /invoice optimization (saves 1 call per branch vs old POST /order + PUT /order/:invoice). Already documents proactive bank hedge as default. Already documents skip-PUT conditional.

**Key remaining issue:** The standard correctly documents the 3/5/6-call conditional paths, but the `POST /invoice` optimization was added after the bulk of production runs. Future runs using the updated standard should reach the new floors consistently.

**Action: None on trusted standard (already optimal). Production runs should now use POST /invoice path, which saves 1 call on every branch.**

---

## T17 — Create Free Accounting Dimension and Book Voucher (gap 0.5)

**Current best:** 3.5/4 with 5 calls, 0 errors. This has been achieved 8 consecutive times.

**Theoretical minimum:** 5 calls. Exhaustively proven in sandbox:
1. `POST /ledger/accountingDimensionName` -- create dimension
2. `POST /ledger/accountingDimensionValue` -- create value 1 (batch not supported: PUT list is update-only, POST rejects arrays)
3. `POST /ledger/accountingDimensionValue` -- create value 2
4. `GET /ledger/account?number=X,1920` -- resolve account IDs (number-only voucher fails 422)
5. `POST /ledger/voucher` -- book balanced voucher

**Verdict: STRUCTURAL.** The 0.5 gap is a scoring-formula artifact. The agent already executes the minimum possible path perfectly. No trusted-standard change needed.

---

## T06 — Create and Send Customer Invoice (gap 0.47)

**Current best:** 1.53/2 (rolling best fluctuates between 1.2-1.6 based on window).

**Theoretical minimum by branch:**
- New customer, no bank repair: **3 calls** (POST customer + GET vatType + POST /invoice)
- Existing customer, no bank repair: **3 calls** (GET customer + GET vatType in parallel + POST /invoice)
- Bank repair needed (reactive): **6 calls** (3 base + failed POST + GET account + PUT account + retry POST)
- Bank repair needed (proactive): **5 calls** (GET customer/POST customer || GET vatType || GET account + PUT account + POST invoice)
- With product numbers, add +1 call (POST /product/list or GET /product)

**Production reality:**
- Some runs need bank repair, some don't. The claim "T06 always needs bank repair" is incorrect -- the first T06 run (89cff08b) used only 3 calls with no bank repair.
- The 70% stat in the standard ("~70% don't need repair") is across ALL create-and-send tasks, not T06-specific. T06 has a higher bank-repair rate (~70-80%) but not 100%.
- When bank repair is needed, proactive (5 calls) beats reactive (6 calls) by 1 call with 0 errors vs 1 error. But the standard says proactive costs 4 in the happy case vs 3, making it worse when repair isn't needed.

**Scoring formula insight:** The scoring formula applies an efficiency penalty that caps T06 at ~1.5-1.6 even at 3 calls. The 0.47 gap is mostly structural. The difference between 3 and 6 calls on T06 is only ~0.3 points at most.

**Potential minor optimization for T06 specifically:** Since T06 has ~70-80% bank-repair rate, a T06-specific proactive strategy could marginally improve average scores:
- Expected calls proactive: 0.75 * 5 + 0.25 * 4 = 4.75 (bank repair 75%) vs reactive: 0.75 * 6 + 0.25 * 3 = 5.25
- But this changes task-specific behavior in a standard shared across multiple tasks, which is risky.

**Action: No trusted-standard change.** The gap is mostly structural. The standard already documents both reactive and proactive paths. The scoring formula penalty makes this low-ROI.

---

## Conclusions

### No changes needed to trusted standards

All five standards are already documented with their proven minimum call counts. The efficiency gaps break down as:

- **T10 (1.0 gap): 100% structural.** Cannot be reduced.
- **T17 (0.5 gap): 100% structural.** Cannot be reduced.
- **T06 (0.47 gap): ~90% structural, ~10% addressable.** Minor gain possible from T06-specific proactive bank check, but risky to change shared standard for 0.1 expected points.
- **T15 (0.67 gap): ~50% structural, ~50% addressable.** The POST /invoice optimization is already in the standard. Future runs should see improvement as agent compliance catches up. Expected gain: 0.3-0.5 points on update-needed runs.
- **T16 (1.0 gap): ~40% structural, ~60% addressable.** Three optimizations are already in the standard (batch timesheet, POST /invoice, proactive bank check). Agent compliance is the bottleneck. Expected gain: 0.3-0.7 points when agent consistently follows the updated standard.

### Total estimated recoverable points

- T15: ~0.3-0.5 points (from agent compliance with POST /invoice optimization)
- T16: ~0.3-0.7 points (from agent compliance with batch + POST /invoice + proactive bank)
- T10, T17, T06: ~0 points (structural floors already hit)

**Total: ~0.6-1.2 points recoverable from efficiency improvements, entirely from agent compliance on T15/T16, not from standard changes.**

### Priority recommendation

These efficiency-only tasks are LOW priority. The ~0.6-1.2 recoverable points are dwarfed by correctness gaps on other tasks (T23: 5.4, T29: 4.9, T30: 4.2, T22: 3.9, T24: 3.75, T20: 3.6). Fix correctness gaps first.
