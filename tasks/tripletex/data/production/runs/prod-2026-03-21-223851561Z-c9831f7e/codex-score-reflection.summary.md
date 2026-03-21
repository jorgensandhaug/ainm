# Score Reflection — prod-2026-03-21-223851561Z-c9831f7e

## Task Attribution

- **Inference status**: ambiguous (5 diff entries, 3 candidates)
- **Most likely task**: task 15 (set-project-fixed-price-and-invoice-partial-payment)
- **Evidence**: The submission completed at `2026-03-21T22:40:55.714662+00:00` matches task 15's `last_attempt_after` timestamp exactly. The prompt ("Legen Sie einen Festpreis... fest") is the canonical German wording for the "set fixed price + invoice milestone" task family.
- **Tier**: T2 (max 4)
- **Best score before**: 3.3333
- **Best score after**: 3.3333 (no improvement)

## Correctness Verdict

**Correctness was NOT perfect.** 3 of 4 checks failed.

| Check | Result | Likely meaning |
|-------|--------|----------------|
| Check 1 | PASSED | Customer with org 800357314 exists |
| Check 2 | FAILED | Project fixedprice not set to 292550 on the original pre-existing project |
| Check 3 | FAILED | PM linkage or project manager not correctly set on the original project |
| Check 4 | FAILED | Milestone invoice (33% of 292550 = 96541.50) not found linked to the original project |

- **score_raw**: 2/8
- **normalized_score**: 0.5 (out of max 4)

## Efficiency Verdict

Even if correctness had been perfect, 10 API calls with 0 errors would have been significantly above the optimal 5–6 calls (update-needed + proactive hedge) or 3 calls (skip-PUT branch). The best score of 3.3333 was achieved by prior runs using 6–7 calls with the old POST /order + PUT /order/:invoice path. The direct POST /invoice approach (used in this run) would have been optimal at 5 calls — but the wrong task matching made this moot.

## Likely Root Cause

**Critical task-matching error: the agent used the wrong trusted standard.**

The agent read `trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` (the "create everything from scratch" lifecycle standard) instead of `trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` (the "find existing project, update fixed price, invoice milestone" standard).

This caused the agent to:
1. **Created a NEW customer** (`POST /customer`) instead of finding the pre-existing one — the customer Brückentor GmbH with org 800357314 was already in the account
2. **Created a NEW employee** (`POST /employee` for Felix Fischer) instead of recognizing that Felix Fischer already existed as the project's PM
3. **Created a NEW project** (`POST /project`) instead of finding and updating (`PUT /project/{id}`) the pre-existing "E-Commerce-Entwicklung" project
4. **Created an invoice linked to the new project** instead of the original project — so the scorer couldn't find the invoice on the original project

The original pre-existing project was left untouched with `fixedprice: 0` and `isFixedPrice: false`, causing 3 of 4 checks to fail.

**Why it happened**: The German prompt says "Legen Sie einen Festpreis von 292550 NOK für das Projekt fest" — "set a fixed price for the project". The agent misinterpreted this as a "create a new project with a fixed price" instruction rather than an "update the existing project's fixed price" instruction. ALL 10+ prior production runs for this task shape found the project already existing with `fixedprice=0` that needed updating.

## What Went Right

1. **Zero API errors** — all 10 calls succeeded with no 4xx/5xx
2. **Correct fixed price arithmetic** — 292550 * 0.33 = 96541.50 was computed correctly
3. **Correct invoice shape** — `POST /invoice?sendToCustomer=false` with embedded `orders[]`, explicit `invoiceDueDate`, and `vatType` was correct
4. **Bank account fix** — proactive check on account 1920 and fix with MOD11-valid `12345678903` was correct
5. **PM participant with adminAccess** — this would have been correct for the lifecycle task shape (but was wrong for this task shape)
6. **Fast execution** — completed within budget, no retries

## What To Change Next Time

### 1. ALWAYS match the correct trusted standard FIRST

The prompt shape determines the standard:
- **"Set/update fixed price + invoice milestone"** → `set-project-fixed-price-and-invoice-partial-payment.md`
  - Key signals: project name given, customer org given, PM email given, fixed price amount, percentage for milestone
  - These entities ALREADY EXIST on fresh production accounts
  - Start with `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)`
- **"Create customer + employees + project + hours + supplier cost + invoice"** → `register-project-lifecycle-budget-hours-cost-and-invoice.md`
  - Key signals: mentions creating employees, registering hours, supplier costs, budget hours

### 2. For task 15, ALWAYS start with GET /project

The correct flow for this exact task is:
1. `GET /project?name=E-Commerce-Entwicklung&count=50&fields=*,customer(*),projectManager(*)`
2. Verify `customer.organizationNumber == "800357314"` and `projectManager.email == "felix.fischer@example.org"`
3. If `fixedprice != 292550`: `PUT /project/{id}` with `isFixedPrice: true, fixedprice: 292550` + `GET /ledger/vatType` + `GET /ledger/account` (parallel, 3 calls)
4. If bank fix needed: `PUT /ledger/account/{id}` (0-1 calls)
5. `POST /invoice?sendToCustomer=false` with 33% of 292550 = 96541.50 (1 call)

Total: **5-6 calls** (vs 10 in this run), with **perfect correctness** (vs 1/4 checks in this run).

### 3. Never create entities that the prompt doesn't explicitly ask to create

The prompt said "set a fixed price for the project" — not "create a project". The prompt said "project leader is Felix Fischer" — not "hire a new employee named Felix Fischer". Always check for existing entities first.

### 4. German language signals

"Legen Sie... fest" = "set/establish" (update existing)
"Erstellen Sie" / "Anlegen Sie" = "create" (new entity)
"Projektleiter ist" = "the project leader is" (already assigned, not "should become")
