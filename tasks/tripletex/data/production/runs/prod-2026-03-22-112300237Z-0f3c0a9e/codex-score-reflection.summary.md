# Score Reflection: prod-2026-03-22-112300237Z-0f3c0a9e

## Task Attribution

- **Attributed task**: T18 (reverse customer invoice payment)
- **Evidence**: submission `completed_at` (`2026-03-22T11:24:03.182853+00:00`) matches leaderboard T18 `last_attempt_at` exactly
- **Prompt**: Reverse payment from Snøhetta AS (org.nr 962427715) for invoice "Systemutvikling" (49600 kr excl. MVA), Norwegian Bokmål
- **Task tier**: T2 (tasks 9–18), max score = 4

## Correctness Verdict

- **Correctness**: 1.0 (perfect)
- **Score raw**: 8/8
- **Normalized score**: 4/4 (max for T2)
- **Checks**: 3/3 passed (Check 1: passed, Check 2: passed, Check 3: passed)
- **Verdict**: Perfect correctness. All checks passed. The reversal correctly reopened the invoice outstanding amount.

## Efficiency Verdict

- **Normalized score**: 4 — matches T18 `best_score` of 4 on the leaderboard
- **API calls**: 2 (1 GET + 1 PUT) — the theoretical minimum for this task shape
- **4xx errors**: 0
- **Verdict**: Maximum efficiency. The run achieved the best possible score with the minimum possible API calls. No wasted calls, no retries, no errors.

## Likely Root Cause

No issues to diagnose. The run was flawless:
- Exact trusted-standard match identified immediately
- Trusted standard read before script writing (per AGENTS.md rules)
- Canonical 2-call path executed without deviation
- Local filter on `amountExcludingVatCurrency === 49600` correctly isolated the single invoice (count=1)
- Fallback matcher accepted the `type=null` payment posting with `description="Betaling: ..."` and extracted `voucherId`
- `PUT /ledger/voucher/{id}/:reverse?date=2026-03-22` completed successfully

## What Went Right

1. **Instant task recognition**: The prompt was immediately recognized as an exact match for `reverse-customer-invoice-payment` trusted standard
2. **Trusted standard followed exactly**: Read the `.md` file before writing the script, as required by AGENTS.md
3. **Minimum API calls**: 2 calls (1 GET locate + 1 PUT reverse), which is the theoretical minimum
4. **Zero errors**: No 4xx responses, no retries, no wasted calls
5. **Correct field names**: Used `amountExcludingVatCurrency` (not the wrong `amountExVat` / `amountExVatCurrency`)
6. **Robust payment voucher extraction**: The fallback matcher correctly handled `type=null` posting and did not require `account.number`
7. **Fast execution**: Total duration ~83s including agent overhead, well within 300s budget
8. **Perfect score**: 4/4 normalized, matching the leaderboard best for T18

## What To Change Next Time

Nothing. This is the 15th consecutive optimal run for this task shape. The trusted standard and playbook are fully mature and language-independent (confirmed across en/nb/nn/es/fr/de/pt). The next agent should:

1. Continue using the exact same 2-call path
2. Continue reading the trusted standard before writing the script
3. Continue using `amountExcludingVatCurrency` for local filtering
4. Continue accepting `type=null` payment postings in the fallback matcher
5. Continue ignoring `account.number` in the matcher (it can be null)
6. Not add any verification GETs — the 2-call path is score-optimal
