# Score Reflection — prod-2026-03-22-105902698Z-4eaf37df

## 1. Task Attribution

**Task ID: T15** — Set project fixed price and invoice partial payment.

Attribution evidence: leaderboard diff shows T15 attempt_delta=+1 (22→23), last_attempt moved from 05:49:41 to 11:00:41Z (task completed at 11:00:39Z). T25 and T28 also had +1 deltas but are concurrent runs from other agents.

Prompt: `Fixez un prix forfaitaire de 326550 NOK sur le projet "Projet d'automatisation" pour Cascade SARL (nº org. 813648164). Le chef de projet est Hugo Bernard (hugo.bernard@example.org). Facturez au client 75 % du prix fixe comme paiement d'étape.`

## 2. Correctness Verdict

**Perfect correctness (1.0).**

The run scored 3.3333, which exactly matches the formula `2 × (1 + 2/3) = 3.3333` for 3 writes with perfect correctness. If correctness were below 1.0, the score would be strictly lower.

Production output verified:
- Project fixedprice set to 326550, isFixedPrice=true
- Customer Cascade SARL (813648164) correctly linked
- PM Hugo Bernard (hugo.bernard@example.org) correctly linked
- Invoice amountExcludingVatCurrency = 244912.5 (326550 × 0.75)
- Invoice amountCurrencyOutstanding = 306140.63 (with 25% VAT)

## 3. Efficiency Verdict

**Score: 3.3333/4.0 (83.3% of T2 max). Optimal for this instance.**

The run used 3 writes:
1. `PUT /project/{id}` — required (fixedprice was 0, needed 326550)
2. `PUT /ledger/account/{id}` — required (bank account 1920 had empty bankAccountNumber)
3. `POST /invoice?sendToCustomer=false` — required (create the milestone invoice)

Scoring formula: `score = 2 × (1 + 2/writes)`. For 3 writes → 3.3333. For 2 writes → 4.0. For 1 write → 4.0.

The leaderboard best for T15 was already 3.3333 before this run and remained 3.3333 after. This run matched the best — no run has yet achieved ≤2 writes (which would require either the skip-PUT branch or a configured bank account).

To reach 4.0, the run would need ≤2 writes, which requires either:
- **Skip-PUT branch** (1 write): project already has fixedprice=326550 → not possible here (was 0)
- **Update-needed + configured bank** (2 writes): bank already configured → not possible here (was missing)

Since both conditions were outside the agent's control, **3 writes was the minimum achievable for this instance**. No call was wasted.

## 4. Likely Root Cause

**No root cause needed — the run was optimal.** The 3.3333 score (vs 4.0 max) is entirely due to the environment state (missing bank account forcing a 3rd write), not agent behavior. The proactive bank-account hedge avoided a 422 error that would have added both an extra write AND an error penalty.

The only theoretical path to 4.0 on this task would be a production instance where:
- The project already has the correct fixedprice (skip-PUT → 1 write), OR
- The bank account is already configured (update-needed+configured → 2 writes)

Neither has occurred for T15 across 23 attempts. 85% of update-needed production runs have missing bank accounts.

## 5. What Went Right

1. **Correct task matching**: Immediately identified this as the `set-project-fixed-price-and-invoice-partial-payment` trusted standard, not the lifecycle standard. Read the trusted standard before scripting.
2. **POST /invoice optimization**: Used `POST /invoice?sendToCustomer=false` with embedded `orders[]` instead of old `POST /order` + `PUT /order/:invoice`, saving 1 write (3 writes instead of 4).
3. **Proactive bank hedge**: Parallelized `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account` — discovered missing bank account proactively, fixed it before the invoice write. Zero 422 errors.
4. **Project-first resolver**: Single `GET /project?name=...&fields=*,customer(*),projectManager(*)` proved existing project, customer, and PM in one call — no separate GET /customer or GET /employee needed.
5. **Correct milestone arithmetic**: 326550 × 0.75 = 244912.5 sent as-is (decimal accepted).
6. **VAT resolution**: Used `GET /ledger/vatType` (free) to resolve 25% VAT, avoided hardcoding.
7. **Zero errors**: No 4xx responses, no retries.

## 6. What To Change Next Time

**Nothing actionable.** This run followed the documented optimal path and achieved the best possible score for its environment state. The trusted standard and playbook are up to date.

The only marginal improvement would be achieving the skip-PUT branch (1 write → 4.0) on a future instance where the project already has the correct fixedprice — but this is entirely determined by the fresh production account's initial state, not agent behavior.

**Monitoring note**: After 23 T15 attempts, the best score remains 3.3333. No production instance has yet presented the skip-PUT opportunity (project already at target fixedprice). This suggests fresh production accounts always start with fixedprice=0 for this task, making 3.3333 the effective ceiling unless bank account configuration varies.
