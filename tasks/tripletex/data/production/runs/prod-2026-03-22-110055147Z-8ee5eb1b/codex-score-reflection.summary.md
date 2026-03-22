# Score Reflection: prod-2026-03-22-110055147Z-8ee5eb1b

## 1. Task Attribution

- **Attributed task**: T15 — set project fixed price and invoice partial payment
- **Task tier**: T2 (max 4 points)
- **Submission**: `ed5391f6`, completed at `2026-03-22T11:02:37Z`
- **Prompt**: German — "Legen Sie einen Festpreis von 415050 NOK für das Projekt 'ERP-Implementierung' für Sonnental GmbH (Org.-Nr. 896608479) fest. Projektleiter ist Mia Meyer. Stellen Sie dem Kunden 50% des Festpreises als Meilensteinzahlung in Rechnung."
- **Evidence**: T15 `last_attempt_after` = `11:02:37.560947Z` matches submission completion exactly; leaderboard diff shows T15 attempt_delta=1

## 2. Correctness Verdict

**Perfect correctness.** Score: 8/8 raw (4/4 checks passed). `normalized_score = 3.3333`.

All 4 checks passed:
- Check 1: passed (project fixedprice)
- Check 2: passed (customer linkage)
- Check 3: passed (project manager)
- Check 4: passed (milestone invoice amount)

## 3. Efficiency Verdict

**Optimal for the account state encountered.** 3 writes → `2 × (1 + 2/3) = 3.3333/4`.

The 3 writes were:
1. `PUT /project/{id}` — necessary (fixedprice was 0, needed 415050)
2. `PUT /ledger/account/{id}` — necessary (bankAccountNumber was empty)
3. `POST /invoice?sendToCustomer=false` — always necessary

To score 4.0 (≤2 writes), the run would need either:
- The project to already have fixedprice=415050 (skip PUT project → 2 writes with bank fix, or 1 write if bank configured)
- OR the bank to already be configured (skip PUT bank → 2 writes with PUT project)

Neither condition held on this fresh account. All 3 writes were unavoidable.

**Leaderboard**: T15 best_score stayed at 3.3333 (before=3.3333, after=3.3333). This run matched the existing best. No prior run has achieved 4.0 on an update-needed+missing-bank account for T15 — that would require the impossible condition of already-correct fixedprice on a fresh account.

**0 errors, 0 retries.** The proactive bank-account hedge prevented the 422 that would occur on the optimistic path.

## 4. Likely Root Cause

No root cause for failure — the run was clean. The 3.3333 score (vs max 4.0) is purely a function of account state:
- 86% of update-needed production runs (12/14) have had missing bank accounts → 3 writes is the expected outcome
- Only the skip-PUT branch (project already at target fixedprice) can achieve ≤2 writes → 4.0, but this branch has never been observed for T15 on fresh accounts where `fixedprice=0`

The efficiency gap is structural, not a mistake.

## 5. What Went Right

1. **Correct task matching**: Used `set-project-fixed-price-and-invoice-partial-payment` trusted standard, not the lifecycle standard (which caused 0.5/4 on the Brückentor run)
2. **Proactive bank hedge**: Parallelized `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account` — discovered empty bank and fixed it pre-emptively, avoiding a 422 error + retry
3. **POST /invoice optimization**: Used single `POST /invoice?sendToCustomer=false` with embedded `orders[]` instead of old 2-call `POST /order` + `PUT /order/:invoice` — saved 1 write
4. **Exact PM match skip**: Project's `projectManager.email` matched `mia.meyer@example.org` exactly, so no separate `GET /employee` was needed
5. **VAT resolution via GET**: Used `GET /ledger/vatType` (free) to resolve 25% VAT (id=3), avoiding the silent 0% default trap
6. **Milestone arithmetic**: `415050 × 0.50 = 207525` sent as exact integer, verified against `amountExcludingVatCurrency`
7. **Verification GETs**: Added free verification reads confirming project fixedprice=415050 and invoice amount=207525

## 6. What To Change Next Time

**Nothing actionable.** This run executed the optimal path for its branch. The only theoretical improvement would require a fresh account where the project already has the correct fixedprice — a condition that has never been observed for T15.

Specifically:
- The trusted standard's conditional `1/2/3`-write branching logic is correct
- The proactive bank hedge default is validated (12/14 = 86% missing bank rate)
- The `POST /invoice` optimization over `POST /order` + `PUT /order/:invoice` is validated (3rd production success)
- No additional GETs should be removed (all GETs are free)
- No additional writes can be eliminated given the account state

The run represents the ceiling for the update-needed+missing-bank branch at 3.3333/4. Improving the T15 best_score to 4.0 requires encountering a skip-PUT account state (project already at target fixedprice).
