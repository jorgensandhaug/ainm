# Reflection Summary — prod-2026-03-21-202524268Z-c1a2056e

## 1. Task

Register 28 hours for Bjorn Kvamme (bjrn.kvamme@example.org) on activity "Analyse" in project "Datamigrering" for Fjelltopp AS (org.nr 986191127). Hourly rate 1200 kr/t. Generate an unsent project invoice. Nynorsk prompt.

## 2. Reflection

**What went well:**
- Correctly identified as an exact match for the `register-project-hours-and-create-project-invoice` trusted standard
- Read the trusted standard before writing the script
- Correctly split 28 hours (>24) into two timesheet entries: 24h on 2026-03-21, 4h on 2026-03-22
- Activity "Analyse" returned `isChargeable=false` — correctly skipped the hourly-rate path
- Bank-account recovery worked on first retry
- Final Tripletex state was correct: `amountExcludingVatCurrency=33600` (28 x 1200), `amountCurrencyOutstanding=42000` (with 25% VAT)

**What went poorly:**
- Used 2 individual `POST /timesheet/entry` calls instead of 1 `POST /timesheet/entry/list` batch call — wasted 1 call
- Used the optimistic branch (no proactive bank account check), hitting the missing-bank-account `422` on first `PUT /order/:invoice` — added 3 recovery calls and 1 error

**Mistakes:**
- Did not use `POST /timesheet/entry/list` for the >24h split despite it being a proven batch endpoint in the codebase (used in `register-project-lifecycle-budget-hours-cost-and-invoice`)
- The trusted standard at the time did not recommend batch for this task shape, so the agent followed the standard correctly but the standard was suboptimal

## 3. Call Efficiency

**Run was NOT minimal-call.** Used 11 calls with 1 error.

| # | Call | Status |
|---|------|--------|
| 1 | GET /employee | 200 |
| 2 | GET /project | 200 |
| 3 | GET /activity/>forTimeSheet | 200 |
| 4 | POST /timesheet/entry (24h) | 201 |
| 5 | POST /timesheet/entry (4h) | 201 |
| 6 | GET /ledger/vatType | 200 |
| 7 | POST /order | 201 |
| 8 | PUT /order/:invoice | **422** (missing bank account) |
| 9 | GET /ledger/account | 200 |
| 10 | PUT /ledger/account | 200 |
| 11 | PUT /order/:invoice (retry) | 200 |

**Wasted calls:**
- Call #5 could have been eliminated by batching calls #4 and #5 into `POST /timesheet/entry/list`
- Call #8 was a failed attempt that could have been avoided with a proactive bank account check (but the tradeoff is documented and optimistic is canonical)

**Optimal paths for this exact shape (>24h, non-chargeable, unconfigured bank):**

| Strategy | Calls | Errors |
|----------|-------|--------|
| Optimistic + individual timesheet (what we did) | 11 | 1 |
| **Optimistic + batch timesheet** | **10** | **1** |
| Proactive + individual timesheet | 10 | 0 |
| **Proactive + batch timesheet** | **9** | **0** |

**Optimal path for configured bank account (most common):**

| Strategy | Calls | Errors |
|----------|-------|--------|
| Optimistic + individual timesheet (old standard) | 8 | 0 |
| **Optimistic + batch timesheet (new standard)** | **7** | **0** |

## 4. Root Causes

1. **Trusted standard did not recommend `POST /timesheet/entry/list`** for this task shape's >24h branch. The batch endpoint was only documented in the lifecycle playbook. Now added to this standard.
2. **Optimistic bank-account strategy** is correct on average (4 of 6 prior production runs had configured bank accounts) but cost 3 extra calls + 1 error on this fresh account. The standard's explicit guidance to keep optimistic as canonical is sound since it saves 1 call on the majority of runs.

## 5. Sandbox Verification

Persistent sandbox re-proof on 2026-03-21 with `codex.verify.1773957815637@example.org` + `Sandbox Hour Invoice Project 1774020541520` + `Prosjektadministrasjon` + 28 hours at 1200 on dates `2026-10-15` / `2026-10-16`:

- `POST /timesheet/entry/list` with 2 entries (24h + 4h on different dates) succeeded in 1 call
- Both entries returned correct `hours` (24, 4) and `projectChargeableHours` (24, 4), `chargeable=false`, `hourlyRate=0`
- Full 7-call path confirmed: `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry/list` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`
- Invoice returned `amountExcludingVatCurrency=33600` (sandbox has 0% VAT vs production 25%)

## 6. Playbook Changes

Updated existing files (no new files created):

- `./trusted-standards/register-project-hours-and-create-project-invoice.md`:
  - Step 5: Changed from individual `POST /timesheet/entry` to `POST /timesheet/entry/list` for >24h
  - Payload Rules: Added batch recommendation for >24h
  - Known Recovery Branches: Added batch to >24h recovery, updated call count tradeoff
  - Reuse From Write Response: Added batch
  - Verification: Added batch
  - OpenAPI / Sandbox Status: Added Fjelltopp AS production evidence and batch sandbox proof

- `./task-playbooks/register-project-hours-and-create-project-invoice.md`:
  - Verified Findings: Added production evidence and batch sandbox proof
  - Minimal Safe Flow: Updated step 11 and operations list for batch
  - Exact-Match Fast Path: Updated steps 5, 16 for batch
  - Verification Shape: Updated for batch response type
  - Avoidable Mistakes: Added batch recommendation, updated bank-account tradeoff numbers

## 7. Commit

- Hash: `800640a3`
- Message: `tripletex playbook: register-project-hours-and-create-project-invoice — add batch timesheet optimization for >24h tasks (POST /timesheet/entry/list saves 1 call), add 8th production confirmation (c1a2056e, Nynorsk prompt, Fjelltopp AS / 986191127 / Datamigrering / Analyse / 28h at 1200, 11 calls 1 error on unconfigured bank account), sandbox-proved 7-call batch path on 2026-10-15/2026-10-16`

## 8. Reusable Heuristics

1. **Use `POST /timesheet/entry/list` for >24h tasks.** Batching N date chunks into 1 call saves N-1 API calls. Proven for same-employee multi-date entries on non-chargeable activities.
2. **Batch timesheet reduces the >24h non-chargeable floor from 8 to 7 calls** (configured) or from 11 to 10 calls (unconfigured optimistic) or from 10 to 9 calls (unconfigured proactive).
3. **Fresh production accounts often lack bank accounts.** 2 of 8 production runs hit the missing-bank-account recovery path. The optimistic branch is still canonical since configured accounts are more common (6 of 8 runs).
4. **The optimistic vs proactive tradeoff is a genuine judgment call**: optimistic saves 1 call on ~75% of accounts but costs 3 extra calls + 1 error on ~25%. Keep optimistic as default unless prior same-run or same-account evidence already proves the bank account is missing.
5. **Always check if a proven batch endpoint exists** before planning N individual writes. The lifecycle playbook already used `/timesheet/entry/list`; this standard should have adopted it earlier for the >24h branch.
