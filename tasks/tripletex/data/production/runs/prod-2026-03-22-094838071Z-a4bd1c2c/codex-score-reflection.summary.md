# Score Reflection: prod-2026-03-22-094838071Z-a4bd1c2c

## Task Attribution

- **Task ID**: 07 (register-customer-invoice-payment)
- **Tier**: T1 (tasks 1–8), max normalized score = 2
- **Prompt**: Register full payment on existing invoice for Windmill Ltd (org 830362894), 32200 NOK ex-VAT, "System Development"
- **Attempt**: 27th attempt on this task

## Correctness Verdict

**Perfect.** `correctness: 1`, `score_raw: 7/7`, `all_checks_passed: true`, 2/2 checks passed. The final Tripletex state was exactly correct — invoice located, full payment registered, outstanding reduced to 0.

## Efficiency Verdict

**Optimal.** `normalized_score: 2` equals the tier max of 2 and matches the leaderboard best_score of 2 for task 07. The run achieved the maximum possible score with zero room for improvement.

- 3 API calls (proven minimum for this task shape)
- 0 errors / 0 avoidable 4xx
- 1 write call (`PUT /invoice/{id}/:payment`)
- 2 free GETs (invoice locate + payment type resolve)

The leaderboard before/after confirms: best_score stayed at 2, total_attempts incremented 26→27. This run matched the existing best.

## Likely Root Cause

No issues. This was a flawless execution of the canonical 3-call `register-customer-invoice-payment` trusted standard. The agent:
1. Correctly identified the task shape from the prompt
2. Read the trusted standard before writing any script
3. Wrote a single script following the exact standard flow
4. Executed it once with no retries

## What Went Right

1. **Task routing**: Immediately matched to `register-customer-invoice-payment` trusted standard via glob search — no ambiguity, no wasted reads on other standards
2. **Standard adherence**: Read the trusted standard file, then immediately wrote the script — no unnecessary reads of AGENTS.md, openapi.json, or playbook (following the "read standard, then execute" rule)
3. **Payment amount**: Used `invoice.amountOutstanding` (40250) from the located invoice, not the prompt's ex-VAT amount (32200) — the single most critical rule
4. **API shape**: All three calls used correct parameters — `invoiceDateFrom`/`invoiceDateTo` on GET /invoice, proper field expansions, query params (not JSON body) on PUT /:payment
5. **Payment type selection**: Preferred `Betalt til bank` with debit account 1920 — correct heuristic
6. **Speed**: ~87 seconds from task receipt to completion, well within 300s budget

## What To Change Next Time

Nothing. This is a solved task shape. The next agent should:
1. Match the prompt to `register-customer-invoice-payment` trusted standard
2. Read the trusted standard
3. Write and execute the 3-call script exactly as documented
4. This is the 18th production confirmation of this exact path — it is fully proven and stable
