# Score-Aware Reflection

## Task Attribution
- **Task ID**: 18 (T2 tier, max score = 4)
- **Run ID**: prod-2026-03-21-233732739Z-8c1a4192
- **Prompt**: Reverse the payment from Windmill Ltd (858237033) for "Consulting Hours" (25500 NOK excl. VAT)
- **Trusted standard**: `reverse-customer-invoice-payment`

## Correctness Verdict
**Perfect.** Correctness = 1.0, score_raw = 8/8, all 3/3 checks passed. The reversal produced the exact expected Tripletex state.

## Efficiency Verdict
**Maximum score achieved.** Normalized score = 4/4, which equals the T2 tier maximum and matches the leaderboard best (4). The run used exactly 2 API calls with 0 errors — the proven minimum for this task shape. Duration was 49s, well within the 300s budget.

Leaderboard before: T18 best = 4, attempts = 18. Leaderboard after: T18 best = 4, attempts = 19. No regression; the run tied the existing best at the theoretical ceiling.

## Likely Root Cause
No issues. The run was optimal on every axis: correctness, call count, error count, and time.

## What Went Right
1. **Exact trusted-standard match recognized immediately** — the agent read the `.md` file, wrote a single script, and executed the canonical 2-call path without detours
2. **No unnecessary reads** — skipped openapi.json, playbook, and AGENTS.md (correct for exact matches)
3. **Correct fallback matcher** — accepted the `type=null` payment posting without requiring `account.number`
4. **Correct field names** — used `amountExcludingVatCurrency` for the multi-invoice filter (only 1 invoice existed here, but the code was correct for the general case)
5. **No verification read** — stopped after the reverse write, which is the score-optimal path
6. **Zero 4xx errors** — both calls succeeded on first attempt

## What To Change Next Time
Nothing. This run is the reference execution for task 18. The 2-call path (`GET /invoice` → `PUT /ledger/voucher/:reverse`) is the proven minimum. 12 consecutive production runs (en/nb/nn/es/fr/de) have all achieved 4/4 with this exact flow. The standard is fully stable and language-independent.
