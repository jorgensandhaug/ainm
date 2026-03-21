# Post-Run Reflection: prod-2026-03-21-165237770Z-a63caffa

## Task

Set fixed price 429500 kr on project "ERP-implementering" for Elvdal AS (org.nr 834214261). Project manager Marit Kvamme (marit.kvamme@example.org). Invoice customer for 33% of fixed price as partial payment.

## Reflection

**What went well:**
- Correctly identified the trusted standard match and used the project-first resolver (`GET /project?name=...&fields=*,customer(*),projectManager(*)`)
- Correctly reused the expanded project row to skip separate `GET /customer` and `GET /employee` calls
- Correctly identified that `PUT /project` was needed (fixedprice=0 vs target 429500)
- Milestone arithmetic `429500 * 0.33 = 141735` was exact and accepted directly
- Correctly used 25% VAT (id=3) from the filtered outgoing VAT list
- Correctly recovered from the bank-account 422 by repairing `/ledger/account` and retrying

**What went poorly:**
- Used the optimistic path (no proactive bank-account check) on the update-needed branch
- Hit `422 Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.` on the first invoice attempt
- Wasted 1 API call (the failed `PUT /order/:invoice`) and incurred 1 avoidable 4xx error

**Root cause:**
The trusted standard documented both optimistic (5/8) and proactive hedge (6/7) paths but left the choice ambiguous ("only take that proactive `/ledger/account` read when the run evidence makes a missing company bank account more likely"). The agent defaulted to optimistic, which was the wrong bet for a fresh account where `fixedprice=0` signals an unconfigured project.

## Call Efficiency

**Run was NOT minimal-call.** Used 8 calls; achievable minimum was 7 calls with 0 errors.

| # | Call | Status | Needed? |
|---|------|--------|---------|
| 1 | `GET /project?name=ERP-implementering&count=50&fields=*,customer(*),projectManager(*)` | 200 | Yes — discovers project state |
| 2 | `PUT /project/401989399` (set fixedprice=429500) | 200 | Yes — fixedprice was 0 |
| 3 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | 200 | Yes — resolves VAT |
| 4 | `POST /order` (141735 milestone line) | 201 | Yes — creates order |
| 5 | `PUT /order/402019438/:invoice` | **422** | **WASTED** — failed due to missing bank account |
| 6 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Yes — needed to find bank account |
| 7 | `PUT /ledger/account/372300019` (set bankAccountNumber) | 200 | Yes — fixes prerequisite |
| 8 | `PUT /order/402019438/:invoice` (retry) | 200 | Yes — creates invoice |

**Wasted call:** Call 5 (failed `PUT /order/:invoice`). Also produced an avoidable 422 error.

**Correct lower-call path (7 calls, 0 errors):**
1. `GET /project?name=ERP-implementering&count=50&fields=*,customer(*),projectManager(*)`
2. `PUT /project/401989399` (set fixedprice=429500, isFixedPrice=true)
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*`
4. `POST /order` (141735 milestone line with vatType id=3)
5. `GET /ledger/account?isBankAccount=true&fields=*` (proactive check)
6. `PUT /ledger/account/{id}` (fix empty bankAccountNumber)
7. `PUT /order/{id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`

## Root Causes

1. **Ambiguous default in trusted standard:** The standard left the bank-account strategy as a judgment call rather than prescribing a default for the update-needed branch.
2. **Missing signal interpretation:** The agent did not interpret `fixedprice=0` + `isFixedPrice=false` as a signal that the account was fresh and likely missing a bank account.
3. **Asymmetric penalty not accounted for:** The optimistic failure costs +3 calls AND +1 error (double penalty), while the proactive hedge costs only +1 call with 0 errors. This makes proactive strictly better at ≥33% missing-bank probability.

## Sandbox Verification

Persistent-sandbox proof on 2026-03-21 confirmed the proactive hedge path:
- Created fixture project with `fixedprice=0`, then ran the update-needed proactive hedge path
- Bank account was already configured (from previous runs), so the proactive `GET /ledger/account` showed `bankAccountNumber="12345678903"`
- Path completed in **6 measured calls**: GET project → PUT project → GET vatType → POST order → GET ledger/account → PUT order/:invoice
- Invoice returned `amountExcludingVatCurrency=141735`, matching the production result
- Sandbox exposed only outgoing VAT 0% (id=6) vs production's 25% (id=3); the VAT lookup step handles both correctly

## Playbook Changes

**Updated existing trusted standard:** `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md`
- Changed default for update-needed branch from ambiguous choice to proactive hedge
- Added step 9 in Standard Flow: proactive `GET /ledger/account` between `POST /order` and `PUT /order/:invoice` on the update-needed branch only
- Updated call-count commentary: update-needed is now 6/7 calls (not 5/8)
- Added production evidence from this run
- Added sandbox verification from 2026-03-21

**Updated existing playbook:** `./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`
- Changed Minimal Safe Flow step 10/11/12 to include proactive bank-account check on update-needed branch
- Updated bank-account strategy summary to prescribe proactive hedge as default
- Updated Exact-Match Fast Path to include proactive step
- Updated Avoidable Mistakes to reflect new default
- Added production evidence from this run

## Commit

```
30c85ee7 tripletex playbook: fixed-price partial invoice — proactive bank-account hedge is now default for update-needed branch
```

Files changed:
- `trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md`
- `task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`

## Reusable Heuristics

1. **Proactive hedge > optimistic on update-needed branch:** When the initial project read shows `fixedprice=0` or `isFixedPrice=false` (indicating the project has never been configured for fixed-price invoicing), the account is likely fresh and the bank account is likely missing. Default to the proactive hedge (GET /ledger/account before invoice write).

2. **Asymmetric penalty analysis:** When choosing between optimistic and defensive paths, account for ALL penalty dimensions. A failed attempt costs both an extra call AND an error penalty, making it worse than a proactive check that costs only +1 call.

3. **Branch-specific defaults:** The skip-PUT branch (project already fully configured) should stay optimistic because those accounts are more mature. Only the update-needed branch needs the proactive hedge.

4. **Production evidence aggregation:** Track hit/miss rates across runs of the same task shape. At 2/3 miss rate for a defensive check, plus asymmetric penalties, the check becomes a clear default.

5. **Signal from project state:** `fixedprice=0` + `isFixedPrice=false` on a project that the task asks to configure for fixed-price invoicing is a strong signal of a fresh, unconfigured account.
