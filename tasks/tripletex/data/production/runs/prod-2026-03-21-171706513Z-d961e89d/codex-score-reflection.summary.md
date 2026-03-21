# Score-Aware Reflection — prod-2026-03-21-171706513Z-d961e89d

## Task Attribution

- **tx_task_id**: 15
- **Tier**: T2 (tasks 9–18), **max score**: 4
- **Prompt**: Set fixed price 313650 NOK on project "Migração para nuvem" for Estrela Lda (org. nº 922471126), manager Leonor Sousa (leonor.sousa@example.org), invoice 50 % as milestone
- **Attempt**: 13th attempt on this task

## Correctness Verdict

**Perfect.** `correctness=1`, `score_raw=8/8`, all 4 checks passed. The final Tripletex state was exactly correct:
- Project `fixedprice=313650`, `isFixedPrice=true`
- Project linked to Estrela Lda (922471126) with manager Leonor Sousa
- Invoice created with `amountExcludingVatCurrency=156825` (50 % of 313650)
- Invoice unsent (`sendToCustomer=false`)

## Efficiency Verdict

**Improved best but not maximal.** `normalized_score=3.3333` out of max 4.

- Leaderboard before: task 15 `best_score=3.0` (12 attempts)
- Leaderboard after: task 15 `best_score=3.333` (13 attempts)
- This run set a new personal best for task 15, gaining +0.333 over the prior best

The 0.667-point gap from max 4 is caused by **1 extra API call** — the proactive `GET /ledger/account?isBankAccount=true&fields=*` hedge on the update-needed branch.

### Call breakdown (6 total, 0 errors)

| # | Call | Needed? |
|---|------|---------|
| 1 | `GET /project?name=...&fields=*,customer(*),projectManager(*)` | Yes — resolve project+customer+manager |
| 2 | `PUT /project/401989764` | Yes — `fixedprice` was 0, needed 313650 |
| 3 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21` | Yes — got 25% (id=3) |
| 4 | `POST /order` | Yes — milestone line 156825 |
| 5 | `GET /ledger/account?isBankAccount=true&fields=*` | Proactive hedge — bank was already configured |
| 6 | `PUT /order/:invoice?invoiceDate=2026-03-21&sendToCustomer=false` | Yes — create invoice |

**Minimum for update-needed branch**: 5 calls (optimistic, no proactive hedge). The proactive hedge added call #5 which found bank already configured — in hindsight unnecessary but correct per the trusted standard's default.

## Likely Root Cause

The efficiency gap is entirely the **proactive bank-account hedge** on the update-needed branch. The trusted standard mandates this as default because production evidence shows 2/4 update-needed runs had missing bank accounts, and the optimistic failure mode costs 8 calls + a 422 error (double penalty).

In this specific run, the bank was configured (`bankAccountNumber=12345678903`), so the hedge was wasted. But this is the expected tradeoff:

| Strategy | Bank configured (50%) | Bank missing (50%) | Expected calls | Error risk |
|----------|----------------------|-------------------|----------------|------------|
| Optimistic | 5 calls → ~4.0 pts | 8 calls + 422 → ~2.0 pts | ~3.0 pts | 50% |
| Proactive hedge | 6 calls → ~3.33 pts | 7 calls → ~3.0 pts | ~3.17 pts | 0% |

The proactive hedge has higher expected score and zero error risk. The trusted standard's recommendation is correct in expectation even though it costs ~0.667 points when the bank happens to be configured.

## What Went Right

1. **Exact trusted-standard match** — recognized the task shape immediately and followed the standard without wasting time on spec reading
2. **Project-first resolver** — one `GET /project` with expanded fields proved customer, manager, and project in a single call, avoiding separate `GET /customer` and `GET /employee`
3. **Correct branch detection** — correctly identified `fixedprice=0` as update-needed and used `PUT /project` instead of skipping it
4. **Exact milestone arithmetic** — `313650 * 0.50 = 156825` accepted directly, no rounding issues
5. **Correct VAT selection** — used 25% (id=3) from the filtered outgoing VAT, not hardcoded
6. **Zero 4xx errors** — clean execution with no retries
7. **New personal best** — improved task 15 from 3.0 to 3.333

## What To Change Next Time

1. **The proactive hedge tradeoff is correctly calibrated** — do not switch back to optimistic on the update-needed branch. The 2/4 miss rate plus double penalty for 422 makes proactive hedge strictly better in expectation. Accept the ~0.667 point cost on configured-bank runs as insurance.

2. **The only path to 4.0 on this task shape when PUT /project is needed would be the 5-call optimistic path** — but this is a gamble. A 422 on a missing bank account would drop the score to ~2.0 or worse. The standard correctly rejects this.

3. **The true path to 4.0 is the skip-PUT branch** (4 calls) — this only applies when the project already has the target fixedprice, correct customer, and correct manager. Since fresh production accounts start with `fixedprice=0`, the skip-PUT branch is unlikely for this task shape unless the scorer pre-configures the project.

4. **No playbook or standard changes needed from this run** — the run validated the existing standard. The bank-account statistics were already updated to 2/4 during the prior reflection pass. The standard's recommendation remains correct.

5. **Scoring pattern confirmed**: 6 calls with 0 errors on this T2 task = 3.333/4. This matches the `Tindra AS` run which also used 6 calls with proactive hedge on a configured bank and scored 3.33/4.
