# Reflection Summary — prod-2026-03-21-220450230Z-4fe69f6b

## Task

Set fixed price 363850 kr on project "Nettbutikk-utvikling" for Havbris AS (org.nr 876325497). Project manager Ingrid Moe (ingrid.moe@example.org). Invoice the customer for 75% of the fixed price (272887.5 kr) as a partial payment.

## Reflection

The run executed flawlessly with 7 API calls and 0 errors. The agent correctly identified this as an exact match for the "set project fixed price and invoice partial payment" trusted standard, read the playbook, and followed the update-needed proactive-hedge branch precisely.

**What went well:**
- Correctly identified the task as a trusted-standard match and read the playbook before writing the script
- Used the project-first resolver (`GET /project?name=...&fields=*,customer(*),projectManager(*)`) to avoid separate customer and employee lookups
- Detected that the project needed `fixedprice` update (existed with `fixedprice=0, isFixedPrice=false`)
- Applied the proactive bank-account hedge, which discovered the missing bank account number and fixed it pre-emptively — avoiding a 422 error
- Computed the exact decimal milestone amount `363850 * 0.75 = 272887.5` without rounding

**What went poorly:**
- Nothing. The run was optimal for the observed production state.

## Call Efficiency

**The run was minimal-call for its branch.** 7 calls is the documented minimum for the update-needed + missing-bank-account scenario.

| # | Call | Purpose |
|---|------|---------|
| 1 | `GET /project?name=Nettbutikk-utvikling&count=50&fields=*,customer(*),projectManager(*)` | Find project, prove customer and PM |
| 2 | `PUT /project/401994539` | Update fixedprice to 363850 |
| 3 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | Resolve outgoing VAT type |
| 4 | `POST /order` | Create order with 75% milestone line (272887.5) |
| 5 | `GET /ledger/account?isBankAccount=true&fields=*` | Proactive bank-account check |
| 6 | `PUT /ledger/account/376836723` | Fix missing bankAccountNumber |
| 7 | `PUT /order/402040614/:invoice?invoiceDate=2026-03-21&sendToCustomer=false` | Invoice the order |

**Wasted calls: 0**

The only theoretical way to reduce below 7 on this branch would be skipping the proactive bank check and going optimistic — but that would have caused a 422 error (bank was missing), leading to 8 calls + 1 error. The proactive hedge saved both a call and an error.

## Root Causes

No mistakes occurred. The production state was:
- Project existed with `fixedprice=0`, `isFixedPrice=false` — required `PUT /project`
- Customer and PM already linked to the project — no extra lookups needed
- Invoice account 1920 had empty `bankAccountNumber` — proactive hedge caught this
- Outgoing VAT `25%` (id=3) was available

## Sandbox Verification

Persistent-sandbox analog with identical arithmetic (`363850 * 0.75 = 272887.5`) confirmed:
- Update-needed proactive-hedge path: **6 measured calls** (bank already configured in sandbox from prior proofs)
- Invoice returned `amountExcludingVatCurrency=272887.5`
- Sandbox exposed only outgoing VAT `0%` (id=6), but the path structure is identical
- The `4/6/7`-call conditional standard remains the proven minimum for this task family

## Playbook Changes

**Updated existing files (no new files created):**

1. `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md`
   - Added 8th production confirmation (Havbris AS / 876325497 / 363850 / 75%)
   - Added sandbox re-verification with 272887.5 arithmetic
   - Updated bank-account missing rate from 5/7 (71%) to 6/8 (75%) in Known Recovery Branches

2. `./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`
   - Added 8th production confirmation entry in Verified Findings
   - Updated statistics: 6/8 missing bank accounts (75%), proactive hedge 6.75 calls + 0 errors vs optimistic 7.25 + 0.75 errors

## Commit

- **Hash:** `21b0a6c2`
- **Message:** `tripletex playbook: set-project-fixed-price-and-invoice-partial-payment — add 8th production confirmation (4fe69f6b, Norwegian prompt, Havbris AS / 876325497 / Nettbutikk-utvikling / ingrid.moe@example.org / 363850 / 75%, 7 calls 0 errors); update-needed proactive-hedge with missing bank account; second 75% milestone confirmation (272887.5 decimal accepted); update bank-account missing rate to 6/8 (75%); proactive hedge averages 6.75 calls + 0 errors vs optimistic 7.25 + 0.75 errors`

## Reusable Heuristics

1. **Proactive bank-account hedge is strongly validated.** With 6/8 (75%) of update-needed production runs having missing bank accounts, the proactive `GET /ledger/account` between `POST /order` and `PUT /order/:invoice` is clearly the correct default. The optimistic path saves 1 call only 25% of the time, while the proactive path avoids a double-penalized 422 error 75% of the time.

2. **Project-first resolver eliminates 2-3 extra calls.** `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` in one call proves the project, nested customer (by `organizationNumber`), and nested manager (by `email`), eliminating separate `GET /customer` and `GET /employee` calls.

3. **Skip `PUT /project` when the initial read already proves the target state.** If `fixedprice` already matches and `isFixedPrice=true`, the skip-PUT branch saves 1-3 calls (depending on bank-account state). This branch has never needed bank-account repair in production.

4. **Decimal milestone amounts work.** Both `75%` milestone runs in production (`244912.5` from Cascade SARL, `272887.5` from this run) were accepted directly without rounding. Never coerce milestone amounts to whole NOK.

5. **Branch discipline summary for this task family:**
   - Skip-PUT branch (project already correct): **4 calls**, no bank check needed
   - Update-needed + bank configured: **6 calls** (proactive hedge finds bank OK)
   - Update-needed + bank missing: **7 calls** (proactive hedge fixes bank pre-emptively)
   - Never use the old optimistic 5/8 path on the update-needed branch
