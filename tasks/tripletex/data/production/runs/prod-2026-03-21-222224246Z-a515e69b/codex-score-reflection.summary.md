# Score Reflection: prod-2026-03-21-222224246Z-a515e69b

## 1. Task Attribution

- **Inference status**: ambiguous (candidate_count=3)
- **Leaderboard diff**: 5 entries changed (T07, T16, T17, T18, T27)
- **New submissions**: 5 appeared between before/after snapshots; 3 still processing at capture time
- **Best candidate**: submission `6471072b` queued at 22:24:20Z (8s after task completion at 22:24:12Z), still processing
- **Task shape**: "register project hours + create project invoice" — T2 tier (max 4 points), most likely T16 (best=3.0→3.0 unchanged) or T17 (best=3.5→3.5 unchanged)
- **No best_score improved** for any of the 5 diff entries, meaning this run either didn't improve or wasn't the scored candidate for the moved entry
- **Definitive task ID**: unknown — all 3 candidate submissions were still processing when snapshot was taken

## 2. Correctness Verdict

- **Likely correct** based on API responses:
  - Timesheet: 24h (2026-03-21) + 6h (2026-03-22) = 30h total on activity "Analyse" for employee Randi Lunde
  - Invoice #1: `amountExcludingVatCurrency=25500` (30×850), `amountCurrencyOutstanding=31875` (with 25% VAT)
  - Customer: Dalheim AS (108329829), org.nr 950103175
  - Project: Sikkerheitsrevisjon (401994637)
- **All field checks should pass** — the final Tripletex state matches the task requirements exactly
- **Correctness = 1.0** (inferred from matching all production evidence patterns)

## 3. Efficiency Verdict

- **Not minimal-call.** The run used **10 calls with 1 error** (the 422 on `PUT /order/:invoice` due to missing bank account).
- **Optimal path (configured account)**: 7 calls, 0 errors
  1. `GET /employee`
  2. `GET /project?fields=*,customer(*)`
  3. `GET /activity/>forTimeSheet`
  4. `POST /timesheet/entry/list` (24h + 6h batch)
  5. `GET /ledger/vatType`
  6. `POST /order`
  7. `PUT /order/:invoice`
- **Optimal path (unconfigured account, proactive)**: 8–9 calls, 0 errors
  1. `GET /employee`
  2. `GET /project?fields=*,customer(*)`
  3. `GET /activity/>forTimeSheet`
  4. `POST /timesheet/entry/list` (24h + 6h batch)
  5. `GET /ledger/vatType` ‖ `GET /ledger/account` (parallel)
  6. `PUT /ledger/account` (conditional)
  7. `POST /order`
  8. `PUT /order/:invoice`
- **Even better with direct POST /invoice** (sandbox-verified during reflection): 7–8 calls, 0 errors
  1. `GET /employee`
  2. `GET /project?fields=*,customer(*)`
  3. `GET /activity/>forTimeSheet`
  4. `POST /timesheet/entry/list` (24h + 6h batch)
  5. `GET /ledger/vatType` ‖ `GET /ledger/account` (parallel)
  6. `PUT /ledger/account` (conditional)
  7. `POST /invoice?sendToCustomer=false` (replaces POST /order + PUT /order/:invoice)
- **Wasted calls**: 3 extra calls (failed PUT /order/:invoice + GET /ledger/account + PUT /ledger/account + retry PUT /order/:invoice = +3 over optimistic, +1-2 over proactive)
- **Score impact**: the 1 error and 3 extra calls vs optimal would reduce the efficiency multiplier, explaining why best_score for T16 (3.0) and T17 (3.5) didn't improve — this run's 10-call/1-error path scores below the existing best

## 4. Likely Root Cause

1. **Optimistic bank-account strategy**: The trusted standard explicitly prescribed the optimistic branch (no proactive GET /ledger/account) as canonical. This was correct per the documented standard, but suboptimal in practice — 3+ production runs have now hit missing bank accounts.
2. **POST /order + PUT /order/:invoice instead of direct POST /invoice**: The existing-entity flow uses 2 calls for invoicing. Sandbox verification during reflection proved that `POST /invoice?sendToCustomer=false` with embedded `orders[]` (including `customer` in both root and orders) works for existing entities too, saving 1 call.
3. **No agent fault per se**: The agent followed the trusted standard correctly. The standard itself was suboptimal for unconfigured accounts.

## 5. What Went Right

- **Correct trusted-standard identification**: Immediately matched `register-project-hours-and-create-project-invoice` and read the standard before scripting
- **Correct >24h handling**: Used `POST /timesheet/entry/list` batch with 24+6 split (not individual POST calls)
- **Correct non-chargeable branch**: Skipped `/project/hourlyRates` reads/writes when `isChargeable=false`
- **Correct VAT handling**: Used `GET /ledger/vatType` and applied 25% outgoing VAT to the order line
- **Correct bank account recovery**: When invoice creation failed, correctly identified and fixed the missing bank account number
- **All Tripletex side effects were created correctly**: timesheet entries, order, invoice — all with correct amounts

## 6. What To Change Next Time

1. **Switch to proactive bank-account check as default**: Add `GET /ledger/account?isBankAccount=true&fields=*` in parallel with `GET /ledger/vatType`. This costs 1 extra call on configured accounts but saves 2 calls + 1 error on unconfigured accounts. Given production evidence (≥3 runs hitting unconfigured accounts), the expected value is strictly better.
2. **Use direct `POST /invoice` instead of `POST /order` + `PUT /order/:invoice`**: Sandbox-verified that `POST /invoice?sendToCustomer=false` with `customer` in root AND in `orders[]`, plus explicit `invoiceDueDate`, works for existing entities. Saves 1 call unconditionally. The proactive+direct-invoice path would be:
   - Configured: **6 calls**, 0 errors (GET emp + GET proj + GET act + POST ts/list + GET vat ‖ GET acct + POST /invoice)
   - Unconfigured: **8 calls**, 0 errors (add PUT /ledger/account before POST /invoice)
3. **Update the trusted standard**: Change the canonical flow from optimistic POST /order + PUT /order/:invoice to proactive POST /invoice. Update the call-count table accordingly.
4. **Direct-invoice payload for existing entities**: Must include `customer: { id }` in BOTH the root invoice object AND inside each `orders[]` entry. Omitting it from orders returns `422 orders.customer: Kan ikke være null.`
