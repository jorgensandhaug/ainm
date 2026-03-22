# Post-Run Reflection: prod-2026-03-22-123700409Z-5d8bb344

## 1. Task

T15 — Set project fixed price and invoice partial payment.
Prompt: Set fixed price 135300 NOK on project "CRM Integration" for Greenfield Ltd (org 989358626), PM Daniel Johnson (daniel.johnson@example.org), invoice 33% milestone.

Milestone amount: 135300 × 0.33 = 44649 NOK.

## 2. Reflection

**What went well:**
- Correctly identified task as T15 and immediately read the trusted standard before writing the script
- Used the optimal flow: `GET /project` → parallel(`PUT /project` + `GET /ledger/vatType` + `GET /ledger/account`) → `PUT /ledger/account` → `POST /invoice?sendToCustomer=false`
- 0 errors, 4/4 checks passed (8/8 raw correctness)
- Used `POST /invoice` with embedded `orders[]` (saves 1 write vs old `POST /order` + `PUT /order/:invoice`)
- Proactive bank hedge caught the missing bank account before the invoice write, avoiding a 422
- All verification GETs properly placed after writes

**What went "poorly":**
- Score: 3.3333/4 (not 4.0) — but this is the minimum possible for this account state (update-needed + missing-bank = 3 writes)
- No actual mistakes; the account's random bank-account state (missing) forced the 3rd write
- No improvement over previous best (3.3333)

**No mistakes occurred.** This was a clean execution of the proven trusted standard.

## 3. GET Strategy

The run used an appropriate GET strategy:

| GET | Purpose | Timing | Assessment |
|-----|---------|--------|------------|
| `GET /project?name=...&fields=*,customer(*),projectManager(*)` | Resolve project + customer + PM | Step 1 | Correct — identified project, customer org match, PM email match |
| `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...` | Resolve VAT (free) | Parallel with PUT project | Correct — found 25% (id=3) |
| `GET /ledger/account?isBankAccount=true` | Proactive bank hedge (free) | Parallel with PUT project | Correct — caught empty bankAccountNumber |
| `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)` | Invoice verification (free) | After POST invoice | Correct — confirmed all amounts and project linkage |
| `GET /project/{id}?fields=*,customer(id,name)` | Project verification (free) | After POST invoice | Correct — confirmed fixedprice=135300 |

**Assessment:** The GET strategy was complete. Every write had a verification readback. No missing GETs identified. The parallel execution of `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account` was optimal.

## 4. Root Causes

No root causes to investigate — all 4 checks passed with 0 errors. The only "limitation" is the random bank-account state:

- 13 out of 15 update-needed production runs (87%) had missing bank accounts
- When bank is missing: 3 writes minimum (PUT project + PUT bank + POST invoice → 3.3333)
- When bank configured: 2 writes minimum (PUT project + POST invoice → 4.0)
- This is an account-state lottery, not a fixable agent behavior

## 5. Sandbox Verification

Sandbox test confirmed the complete flow:
- Created fixture project with fixedprice=0, isFixedPrice=false
- Executed the production flow: GET project → parallel(PUT project + GET vatType + GET bank) → POST invoice
- Bank was configured in sandbox (from prior proofs) → 2 writes
- Results: `fixedprice=135300` ✓, `amountExcludingVatCurrency=44649` ✓, `amountCurrencyOutstanding=55811.25` ✓
- Project linked to invoice ✓, vatType id=3 (25%) ✓

No new API behaviors discovered.

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Change |
|------|--------|
| `trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` | Added 15th production confirmation (5d8bb344, Greenfield Ltd, 135300×33%=44649, 3 writes 0 errors) + sandbox re-verification |
| `task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md` | Updated production statistics from 13th to 15th run (87% missing bank rate); added 4th POST /invoice production confirmation |
| `AGENTS.md` | Updated T15 gotcha with 15th run stats (87% missing bank, 4th POST /invoice confirmation, run 5d8bb344 details) |

## 7. Commit

```
f8100c3e7 tripletex playbook: set-project-fixed-price — add 15th production run (5d8bb344, Greenfield Ltd, 135300×33%=44649, 3 writes 0 errors, 87% missing-bank rate)
```

## 8. Reusable Heuristics

1. **T15 is a mature, fully optimized task.** The conditional 1/2/3-write standard is the proven minimum. No further call reduction is possible — the write count depends entirely on account state.
2. **Proactive bank hedge is mandatory for update-needed branch.** 87% of production runs have missing bank accounts. The hedge costs 0 (GET is free) when bank is configured and saves 1 write + 1 error when missing.
3. **`POST /invoice` with embedded `orders[]`** replaces `POST /order` + `PUT /order/:invoice`, saving 1 write. This is now confirmed across 4 production runs.
4. **Resolve VAT via GET (free)**, never hardcode vatType ids. All production accounts exposed id=3 (25%), but this may not be universal.
5. **Milestone arithmetic: 135300 × 0.33 = 44649** — exact, no decimals. Tripletex accepts decimal milestone amounts (e.g., 87662.5) when the percentage produces them.
6. **PM email match from expanded project read** eliminates the need for separate `GET /employee`. The project-first read with `projectManager(*)` expansion is sufficient.
7. **No score improvement possible** beyond 3.3333 for this account state. To reach 4.0, the agent would need an account with pre-configured bank (13% chance historically).
