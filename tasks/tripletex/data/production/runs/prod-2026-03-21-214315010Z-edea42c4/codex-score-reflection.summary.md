# Score Reflection — prod-2026-03-21-214315010Z-edea42c4

## 1. Task Attribution

- **tx_task_id**: 15
- **Tier**: T2 (tasks 9–18), max score = 4
- **Prompt**: French — set fixed price 326550 on "Projet d'automatisation" for Cascade SARL (813648164), PM Hugo Bernard, invoice 75% milestone
- **Trusted standard**: `set-project-fixed-price-and-invoice-partial-payment`

## 2. Correctness Verdict

**Perfect.** correctness = 1.0, score_raw = 8/8, all 4 checks passed. The final Tripletex state was exactly correct: fixedprice set, customer linked, PM matched, and milestone invoice created for 244912.5 NOK (75% of 326550).

## 3. Efficiency Verdict

**normalized_score = 3.0 / 4.0 (75%).** The run did not improve the prior best of 3.3333.

- Prior best: 3.3333 (attempt 15, at 2026-03-21T19:07:07)
- This run: 3.0 (attempt 16, 7 calls, 0 errors)
- Leaderboard best unchanged at 3.3333

The score gap is **purely efficiency** — correctness was perfect. The 7-call path is the minimum for the update-needed + missing-bank branch, but the scorer penalizes the absolute call count without adjusting for environmental state (missing bank account).

The prior best of 3.3333 was likely from a run that either:
- Hit the update-needed + configured-bank branch (6 calls), or
- Hit the skip-PUT branch (4 calls) where the project already had the correct fixedprice

## 4. Likely Root Cause

**Not a mistake — environmental state penalty.** The production account had a missing `bankAccountNumber` on account 1920, requiring 2 extra calls (GET + PUT) that a configured-bank account would not need. This is the 5th of 7 update-needed runs to have a missing bank account (71% rate).

Breakdown of the 7 calls vs hypothetical minimum:

| Call | Purpose | Avoidable? |
|------|---------|-----------|
| GET /project | Discover state | No |
| PUT /project | Set fixedprice | No (was different) |
| GET /ledger/vatType | Resolve VAT | No |
| POST /order | Create milestone order | No |
| GET /ledger/account | Proactive hedge | No — bank was missing; skipping would have caused 422 + retry = 8 calls + 1 error |
| PUT /ledger/account | Fix bank | No — required for invoice |
| PUT /order/:invoice | Create invoice | No |

**Going optimistic instead (skipping the proactive hedge) would have scored worse**: 8 calls + 1 error (422) vs 7 calls + 0 errors. The proactive hedge saved both a call and an error penalty.

## 5. What Went Right

1. **Perfect correctness** — all 4 checks passed, 0 errors, all fields correct
2. **Trusted standard followed exactly** — no wasted exploration, no openapi.json reads, no unnecessary calls
3. **Proactive hedge justified** — bank was missing; hedge saved 1 call and 1 error vs optimistic
4. **Single-script execution** — one script, one run, no retries or recovery needed
5. **75% milestone decimal** — 244912.5 accepted directly (first production confirmation of this percentage)
6. **French prompt handled cleanly** — org number, email, amounts extracted correctly
7. **Existing startDate preserved** — reused `2026-01-01` from project read instead of overwriting with run date

## 6. What To Change Next Time

**Nothing actionable for this exact branch.** The 7-call path is the proven minimum for update-needed + missing-bank. The score of 3.0/4.0 is the ceiling for this environmental state.

Possible improvements that depend on state, not agent behavior:
- If the project already has the correct fixedprice → skip-PUT branch = 4 calls → likely score ~4.0
- If the bank account is already configured → update-needed + configured = 6 calls → likely score ~3.3333
- Neither of these is controllable by the agent

The proactive hedge remains the correct default strategy:
- At 71% missing rate, expected calls = 6.71 + 0 errors (hedge) vs 7.14 + 0.71 errors (optimistic)
- The optimistic path is strictly dominated in expectation

**No playbook or trusted-standard changes needed** — the prior reflection already updated both with this production confirmation and the updated 5/7 (71%) statistics.
