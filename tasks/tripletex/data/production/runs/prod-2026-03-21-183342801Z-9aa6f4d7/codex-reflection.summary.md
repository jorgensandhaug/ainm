# Reflection: prod-2026-03-21-183342801Z-9aa6f4d7

## Task

Set fixed price 178450 kr on project "Skymigrering" for Stormberg AS (org.nr 957353681). Project leader Magnus Haugen (magnus.haugen@example.org). Invoice customer for 50% of fixed price (89225 kr) as a partial payment.

## Reflection

**What went well:**
- Exact trusted-standard match identified immediately (`set-project-fixed-price-and-invoice-partial-payment.md`)
- Correct branch selection: update-needed (project had wrong fixedprice) + proactive bank-account hedge
- Proactive hedge saved the run from a 422 error — bank account was missing on account 1920
- Zero errors, correct final state on first attempt
- Milestone arithmetic `178450 * 0.50 = 89225` exact, no rounding needed
- Project-first resolver correctly extracted customer, manager, and startDate from one expanded GET
- No unnecessary GET /customer or GET /employee calls — both were proved by the nested project expansion

**What went poorly:**
- Nothing. The run followed the trusted standard exactly and hit the optimal path for its branch.

**Mistakes:**
- None. The agent correctly applied the proactive hedge default for the update-needed branch.

## Call Efficiency

**Was the run minimal-call?** YES — 7 calls is the proven minimum for update-needed + missing bank account.

**Production path (7 calls, 0 errors):**
1. `GET /project?name=Skymigrering&count=50&fields=*,customer(*),projectManager(*)` — found project, customer matched (957353681), manager matched (magnus.haugen@example.org), fixedprice=0 → needs update
2. `PUT /project/401990998` — set fixedprice=178450, isFixedPrice=true
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` — 25% VAT (id=3)
4. `POST /order` — milestone line 89225, linked to project
5. `GET /ledger/account?isBankAccount=true&fields=*` — proactive hedge, found empty bankAccountNumber on 1920
6. `PUT /ledger/account/373623577` — fixed bank account
7. `PUT /order/402027391/:invoice?invoiceDate=2026-03-21&sendToCustomer=false` — invoice created

**Wasted calls:** None.

**Lower-call path for next agent:** Same path. The conditional standard remains:
- Skip-PUT branch (project already at target state): 4 calls
- Update-needed + configured bank: 6 calls
- Update-needed + missing bank: 7 calls

## Root Causes

No issues to root-cause — the run was optimal for its exact branch.

## Sandbox Verification

Persistent sandbox (`kkpqfuj-amager.tripletex.dev`) verified both branches:

1. **Update-needed proactive hedge** (bank configured in sandbox): 6 measured calls
   - `GET /project` → `PUT /project` → `GET /ledger/vatType` → `POST /order` → `GET /ledger/account` (configured) → `PUT /order/:invoice`
   - Invoice: `amountExcludingVatCurrency=89225`

2. **Skip-PUT branch** (project already at target fixedprice from prior proof): 4 measured calls
   - `GET /project` → `GET /ledger/vatType` → `POST /order` → `PUT /order/:invoice`
   - Invoice: `amountExcludingVatCurrency=89225`

Both branches confirmed the existing call floors. No lower-call shortcut found.

## Playbook Changes

Updated existing trusted standard and playbook (no new files created):

- `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md`
  - Added 5th production confirmation (Stormberg AS, 7 calls, 0 errors, missing bank)
  - Updated bank-account missing rate from 2/4 (50%) to 3/5 (60%)
  - Added sandbox re-verification for 178450 * 0.50 = 89225
  - Updated conditional standard notation to `4/6/7`-call

- `./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`
  - Added Stormberg AS production evidence
  - Updated bank-account statistics from 2/4 to 3/5 (60%)
  - Updated Avoidable Mistakes with 3 named production runs that had missing bank accounts

## Commit

```
b7e0e3ea tripletex playbook: set-project-fixed-price — add 5th production confirmation (9aa6f4d7, Stormberg AS, 7 calls, 0 errors), update bank-account missing rate to 3/5 (60%)
```

## Reusable Heuristics

1. **Proactive bank-account hedge is now clearly the default on update-needed branch.** With 3/5 (60%) production runs hitting missing bank accounts, the proactive hedge averages 6.6 calls + 0 errors vs optimistic at 6.8 calls + 0.6 errors. Never use the old optimistic path on update-needed.

2. **Skip-PUT branch stays optimistic.** No production run on the skip-PUT branch has ever hit a bank-account issue. Do not add `/ledger/account` on this branch — it would waste a call.

3. **Project-first resolver is decisive.** One `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` proves customer, manager, and fixedprice in a single call, eliminating separate `GET /customer` and `GET /employee` when the data is already linked.

4. **Branch discipline is the key optimization.** The difference between 4 and 7 calls is entirely determined by whether the project already has the target state. The agent should check `fixedprice`, `isFixedPrice`, and `projectManager.email` from the first read and take the shortest valid branch.

5. **Percentage milestone amounts are exact.** `178450 * 0.50 = 89225` — no rounding, no string formatting needed. Tripletex accepts the computed value directly.
