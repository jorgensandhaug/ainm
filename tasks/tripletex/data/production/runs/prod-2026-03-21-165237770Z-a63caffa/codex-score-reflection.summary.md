# Score Reflection: prod-2026-03-21-165237770Z-a63caffa

## 1. Task Attribution

- **tx_task_id**: 15
- **Tier**: T2 (max score 4)
- **Prompt**: Set fixed price 429500 kr on project "ERP-implementering" for Elvdal AS (org.nr 834214261), project manager Marit Kvamme (marit.kvamme@example.org), invoice 33% partial payment
- **Task shape**: set-project-fixed-price-and-invoice-partial-payment (exact trusted-standard match)

## 2. Correctness Verdict

**Perfect correctness.** Score raw 8/8, correctness 1.0, all 4 checks passed.

The final Tripletex state was fully correct:
- Project "ERP-implementering" updated with `isFixedPrice=true`, `fixedprice=429500`
- Customer Elvdal AS (834214261) correctly linked
- Project manager Marit Kvamme (marit.kvamme@example.org) correctly linked
- Invoice created for 141735 kr (429500 × 0.33), unsent, with 25% VAT → outstanding 177168.75 kr

## 3. Efficiency Verdict

**Not efficient enough.** Normalized score 2.64/4, below the previous best of 3.0/4. This run did NOT improve the leaderboard best.

| Metric | Value |
|--------|-------|
| Normalized score | 2.64 |
| Previous best | 3.0 |
| Leaderboard max | 4 |
| Total API calls | 8 |
| 4xx errors | 1 (422 on first invoice attempt) |
| Attempt number | 12 of 12 |

**API call trace (8 calls):**
1. `GET /project?name=ERP-implementering&count=50&fields=*,customer(*),projectManager(*)` — found project, customer and manager matched, but `fixedprice=0` (update needed)
2. `PUT /project/401989399` — set fixedprice=429500, isFixedPrice=true
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` — found 25% VAT (id=3)
4. `POST /order` — created order with 33% milestone line (141735 kr)
5. `PUT /order/402019438/:invoice` — **FAILED 422**: "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."
6. `GET /ledger/account?isBankAccount=true&fields=*` — found account 1920 with empty bankAccountNumber
7. `PUT /ledger/account/372300019` — set bankAccountNumber="12345678903"
8. `PUT /order/402019438/:invoice` — succeeded, invoice created

**Wasted calls:** Call 5 (failed 422). This was the optimistic invoice attempt that failed because the company bank account was not configured. The failed attempt cost both +1 call and +1 error (double penalty in scoring).

**Proactive hedge path (7 calls, 0 errors):**
1. `GET /project` (discover state)
2. `PUT /project` (set fixedprice)
3. `GET /ledger/vatType` (resolve VAT)
4. `POST /order` (create milestone order)
5. `GET /ledger/account` (proactive bank account check)
6. `PUT /ledger/account` (fix missing bank number)
7. `PUT /order/:invoice` (create invoice)

This would have saved 1 call and 1 error. Whether it would have reached the best of 3.0 is uncertain but likely closer.

## 4. Likely Root Cause

The run followed the **optimistic path** on the update-needed branch, which the trusted standard at that time documented as the default. The project had `fixedprice=0` and `isFixedPrice=false`, strong signals of a fresh account that had never been configured for invoicing. On such accounts, the company bank account is almost always unconfigured.

**Root causes:**
1. **Optimistic default on update-needed branch**: The trusted standard recommended the optimistic 5/8 path as default, reserving the proactive hedge for cases where evidence suggested the bank account was missing. But on fresh test accounts (which is what scored runs use), the bank account is consistently missing — 2 out of 3 production update-needed runs had this issue.
2. **Double penalty not weighted**: The optimistic failure costs both +1 API call (the failed attempt) and +1 error (the 422), while the proactive hedge costs only +1 call when the bank is already configured. The expected cost of the optimistic path is strictly worse on the update-needed branch.
3. **No fresh-account heuristic**: The agent had no signal-based heuristic to detect that `fixedprice=0` + `isFixedPrice=false` strongly correlates with a fresh account where the bank account will be empty.

## 5. What Went Right

1. **Correct trusted-standard match**: Immediately identified the exact standard and followed it
2. **Efficient project resolution**: The expanded `GET /project?...&fields=*,customer(*),projectManager(*)` resolved project, customer, and manager in a single call — no separate `GET /customer` or `GET /employee`
3. **Correct branch detection**: Correctly identified that `fixedprice=0` required `PUT /project` (update-needed branch)
4. **Correct VAT selection**: Used 25% VAT (id=3) from the filtered outgoing VAT list
5. **Exact milestone amount**: 429500 × 0.33 = 141735 exactly, no rounding issues
6. **Clean recovery**: After the 422, correctly followed the documented recovery path (GET ledger/account → PUT ledger/account → retry invoice)
7. **No unnecessary verification reads**: Stopped after successful invoice write, no extra `GET /invoice/{id}`

## 6. What To Change Next Time

1. **Use proactive hedge on update-needed branch** (already updated in trusted standard and playbook): On the update-needed branch (where `PUT /project` is required), always insert `GET /ledger/account?isBankAccount=true&fields=*` between `POST /order` and `PUT /order/:invoice`. Fix the bank account if empty before attempting the invoice write. This is now the default in both the trusted standard and playbook.

2. **Keep optimistic on skip-PUT branch**: On the skip-PUT branch (where the project already proves the target state), do NOT add the proactive bank account check. Production runs on this branch have never hit the bank-account issue.

3. **Expected call counts for task 15 (set-project-fixed-price-and-invoice-partial-payment):**
   - Skip-PUT branch (fixedprice already matches): 4 calls
   - Update-needed + configured bank: 6 calls (proactive hedge, bank already set)
   - Update-needed + missing bank: 7 calls (proactive hedge, bank needs fixing)
   - Never use the old optimistic 5/8 path on the update-needed branch

4. **Signal interpretation**: `fixedprice=0` + `isFixedPrice=false` on the initial project read is a strong signal that the account is fresh and the bank account will be missing. This should always trigger the proactive hedge.
