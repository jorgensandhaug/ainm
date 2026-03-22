# Score-Aware Reflection: prod-2026-03-22-054826843Z-dec75cfd

## 1. Task Attribution

- **tx_task_id**: 15
- **Tier**: T2 (max 4 points)
- **Task shape**: Set project fixed price and invoice partial payment
- **Prompt**: French — "Fixez un prix forfaitaire de 170650 NOK sur le projet 'Projet d'automatisation' pour Rivière SARL (852968737). Nathan Martin (nathan.martin@example.org). 25% milestone."

## 2. Correctness Verdict

**Perfect correctness.** score_raw=8/8, correctness=1.0, 4/4 checks passed.

- Check 1: passed
- Check 2: passed
- Check 3: passed
- Check 4: passed

All checks passed — project fixedprice, customer linkage, PM linkage, and invoice with correct milestone amount were all correct.

## 3. Efficiency Verdict

- **normalized_score**: 3.3333 / 4.0 (83.3%)
- **Leaderboard best before**: 3.3333 (21 attempts)
- **Leaderboard best after**: 3.3333 (22 attempts)
- **Delta**: 0 — tied the existing best, did not improve

The run used **6 API calls with 0 errors**:
1. `GET /project?name=...&fields=*,customer(*),projectManager(*)` — found project with fixedprice=0
2. `PUT /project/{id}` — set isFixedPrice=true, fixedprice=170650 (parallel)
3. `GET /ledger/vatType` — got 25% VAT id=3 (parallel)
4. `GET /ledger/account?isBankAccount=true` — found 1920 with empty bankAccountNumber (parallel)
5. `PUT /ledger/account/{id}` — fixed bank account
6. `POST /invoice?sendToCustomer=false` — created invoice with amountExcludingVatCurrency=42662.5

**This was optimal for the update-needed+missing-bank branch.** The score gap (3.3333 vs 4.0) is purely an efficiency penalty for 6 calls vs the theoretical minimum of 3 calls (skip-PUT branch). However, the skip-PUT branch was impossible here because fixedprice was 0 and isFixedPrice was false — the project genuinely needed updating.

Consistent scoring pattern across all T15 production runs:
- 6 calls → 3.3333/4 (this run, Tindra AS, etc.)
- The skip-PUT branch (3 calls) has never occurred in T15 production — project always needs updating
- No prior T15 run has exceeded 3.3333, confirming 6 calls is the floor for this branch

## 4. Likely Root Cause

**No root cause issue.** The run was optimal for its branch. The score of 3.3333/4 is the ceiling for update-needed+missing-bank, which is the most common branch (10/12 = 83% of update-needed runs hit missing bank).

The only theoretical path to 4/4 on T15 would require the project to already have fixedprice=170650 and isFixedPrice=true on the fresh production account, which has never happened — fresh accounts always start with fixedprice=0.

## 5. What Went Right

1. **Correct task matching**: Immediately identified as set-project-fixed-price task (not lifecycle), read the trusted standard, executed without hesitation.
2. **Optimal branch selection**: Used project-first resolver with `fields=*,customer(*),projectManager(*)` — proved customer + PM in one call, skipped separate GET /customer and GET /employee.
3. **POST /invoice optimization**: First successful production use of `POST /invoice?sendToCustomer=false` with embedded `orders[]` on correct entities — saved 1 call vs old `POST /order` + `PUT /order/:invoice` path (would have been 7 calls instead of 6).
4. **Proactive hedge**: Parallelized `PUT /project` + `GET /vatType` + `GET /ledger/account` — caught the missing bank account before `POST /invoice`, avoiding a 422 + retry (would have been 8 calls with optimistic path).
5. **Zero errors**: No 4xx errors, no retries, clean execution.
6. **Correct arithmetic**: 170650 × 0.25 = 42662.5 sent as decimal, accepted directly.
7. **Fast execution**: 82.5s total duration.

## 6. What To Change Next Time

**Nothing to change.** This run executed the optimal path for T15's invariant branch (update-needed+missing-bank). The 3.3333/4 score is the best achievable when the project needs updating and the bank account is missing — both conditions that the agent cannot control.

Specific confirmations for future T15 runs:
- **Keep using POST /invoice** (not POST /order + PUT /order/:invoice) — confirmed in production
- **Keep proactive hedge** for update-needed branch — 83% missing bank rate makes it strictly better
- **Keep project-first resolver** with `customer(*),projectManager(*)` — eliminates 2 calls
- **Keep parallelizing** PUT project + GET vatType + GET ledger/account — saves wall-clock time
- **Do not add any verification GET** after POST /invoice — the write response has all needed fields

The score ceiling for this task family is structurally limited by the fresh-account invariant (project always starts with fixedprice=0), not by any agent mistake.
