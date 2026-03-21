# Score Reflection: prod-2026-03-21-221944980Z-9b177d7c

## 1. Task Attribution

- **Run ID**: prod-2026-03-21-221944980Z-9b177d7c
- **Prompt**: Set fixed price 457650 NOK on project "Implementación ERP" for Solmar SL (org 866378843), PM María Sánchez (maria.sanchez@example.org), invoice 25% as partial payment
- **Attribution status**: `ambiguous` — 3 submissions were still processing at snapshot time
- **Candidate diff entries**: T07 (+1 attempt), T15 (+1 attempt), T19 (+1 attempt), T23 (+1 attempt)
- **Most likely task**: **T15** (set-project-fixed-price-and-invoice-partial-payment) — task shape is an exact match, and the T15 `last_attempt_after` of `22:21:33` aligns closest with our completion at `22:21:17`
- **T15 tier**: T2 (max score 4)
- **T15 best_score**: 3.3333 (unchanged before/after)
- **Our submission**: likely `d189ae02` (queued 22:21:26, still processing at snapshot)

## 2. Correctness Verdict

- **Verdict**: almost certainly **perfect correctness**
- The run completed all 7 API calls with 0 errors
- The invoice write returned `amountExcludingVatCurrency=114412.5` (= 457650 × 0.25) and `amountCurrencyOutstanding=143015.63` (with 25% VAT)
- The project was updated with `fixedprice=457650`, `isFixedPrice=true`, correct customer and PM
- A concurrent T15 submission (`87c89a5d`, queued 22:19:44, completed 22:21:33) scored 8/8 raw with 4/4 checks passed and normalized 3.0 — our run used the same trusted-standard path and should also pass all 4 checks
- No payload mapping errors or missing side effects detected

## 3. Efficiency Verdict

- **Run call count**: 7 (GET /project → PUT /project → GET /ledger/vatType → POST /order → GET /ledger/account → PUT /ledger/account → PUT /order/:invoice)
- **Run error count**: 0
- **Branch**: update-needed + missing bank account
- **Minimum for this branch**: 7 calls — this was optimal
- **Minimum for other branches**: 4 (skip-PUT) or 6 (update-needed + configured bank)
- **T15 best_score**: 3.3333/4 — likely achieved by a prior 6-call run (update-needed + configured bank) or possibly a skip-PUT 4-call run
- **Expected score for our run**: ~3.0/4 (matching the concurrent T15 run that also scored 3.0 with 4/4 correctness)
- **Score improvement**: unlikely — our 7-call run cannot beat the existing 3.3333 best set by a more efficient prior run
- **Verdict**: the run was optimal for its specific state (missing bank account), but the bank-account state was unlucky — a configured-bank account would have saved 1 call (6 vs 7) and a pre-configured project would have saved 3 calls (4 vs 7)

## 4. Likely Root Cause

No agent error caused the 7-call path. The root cause of the efficiency gap vs the T15 best (3.3333) is **environmental state variance**:

1. **Bank account was missing** (78% of update-needed runs hit this): the proactive hedge correctly discovered the empty `bankAccountNumber` on account 1920 and fixed it before the invoice write, avoiding a 422. This added 2 calls (GET + PUT /ledger/account) compared to the configured-bank path.
2. **Project needed a fixed-price update**: the initial GET /project showed `fixedprice` was not already 457650, requiring a PUT /project. This prevented the skip-PUT 4-call branch.

Neither condition was controllable by the agent. The proactive hedge strategy was the correct decision — without it, the run would have been 8 calls + 1 error (422) instead of 7 calls + 0 errors.

## 5. What Went Right

- **Exact trusted-standard match**: agent read the trusted standard before writing any script
- **Project-first resolver**: single GET /project with expanded customer(*) and projectManager(*) avoided separate GET /customer and GET /employee calls
- **Proactive bank-account hedge**: discovered missing bank account before the invoice write, avoiding a 422 and 8-call recovery path
- **Correct milestone arithmetic**: `457650 × 0.25 = 114412.5` sent as exact decimal, accepted directly
- **Correct VAT selection**: used filtered outgoing VAT 25% (id=3) from the live account
- **Zero errors**: all 7 calls succeeded
- **Fast execution**: completed within seconds, well under the 300s budget

## 6. What To Change Next Time

**Nothing to change in the agent logic.** The run followed the trusted standard perfectly. The 7-call count is the proven minimum for the update-needed + missing bank branch.

The only way to improve T15 scoring is:
1. **Get lucky with bank state**: if the fresh account already has a configured bank account, the run saves 1 call (6 vs 7) and would likely score ~3.3333 (matching the current best)
2. **Get lucky with project state**: if the project already has the target fixed price + correct PM, the skip-PUT branch saves 3 calls (4 vs 7) and would likely score close to 4/4
3. Neither condition is controllable — the proactive hedge remains the correct default for the update-needed branch (78% missing rate across 9 production runs)

The trusted standard and playbook have already been updated with this run's production evidence (7/9 missing rate). No further documentation changes needed.
