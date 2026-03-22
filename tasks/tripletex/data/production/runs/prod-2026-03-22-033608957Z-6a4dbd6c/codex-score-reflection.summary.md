# Score-Aware Reflection: prod-2026-03-22-033608957Z-6a4dbd6c

## 1. Task Attribution

- **Task ID:** T18 (reverse customer invoice payment)
- **Tier:** T2 (max score 4)
- **Prompt:** Portuguese — reverse payment for Luz do Sol Lda (962812384), invoice "Sessão de formação" (41100 NOK ex-VAT)
- **Repeat:** Exact same prompt shape as 2026-03-21 production run

## 2. Correctness Verdict

**Perfect correctness (1.0).** All 3/3 checks passed.

| Metric | Value |
|--------|-------|
| score_raw | 8/8 |
| correctness | 1.0 |
| normalized_score | 4.0 |
| tier max | 4.0 |
| feedback | "3/3 checks passed." |

The run achieved the maximum possible score for this task tier.

## 3. Efficiency Verdict

**Maximum efficiency.** normalized_score = 4.0 matches the tier max of 4 and equals the leaderboard best_score of 4.

- 2 API calls, 0 errors — the theoretical minimum for this task shape.
- Leaderboard before: T18 best = 4, attempts = 20
- Leaderboard after: T18 best = 4, attempts = 21 (this run counted, maintained the best)
- No wasted calls, no retries, no 4xx errors.

## 4. Likely Root Cause

No issues. This was a flawless execution. The canonical 2-call path from the trusted standard was followed exactly:

1. `GET /invoice?customerOrgNumber=962812384&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,...` → found 1 invoice, extracted payment voucher 609299005
2. `PUT /ledger/voucher/609299005/:reverse?date=2026-03-22` → created reverse voucher 609299148

## 5. What Went Right

- **Immediate task-shape recognition:** Correctly identified this as an exact trusted-standard match within seconds.
- **Read the standard first:** Followed the AGENTS.md rule to read the trusted standard before writing code.
- **Canonical 2-call path:** No unnecessary reads, no verification GET, no customer lookup.
- **Correct field names:** Used `amountExcludingVatCurrency` for local filtering (not the wrong `amountExVat`).
- **Robust fallback matcher:** Accepted `type=null` payment posting without requiring `account.number`.
- **No spec re-reading:** Did not waste time on `openapi.json` since this was an exact trusted-standard match.
- **Perfect score:** 4/4, matching leaderboard best. 14th consecutive optimal run for this task shape.

## 6. What To Change Next Time

**Nothing.** This task shape is fully solved and stable. The next agent should:

1. Recognize the reverse-customer-invoice-payment pattern from prompt cues (org number + ex-VAT amount + bank returned payment).
2. Read `./trusted-standards/reverse-customer-invoice-payment.md`.
3. Execute the canonical 2-call script: locate invoice → reverse payment voucher → stop.
4. Use `amountExcludingVatCurrency` for local filtering.
5. Accept `type=null` payment postings. Do not require `account.number`.
6. Do not add a verification GET after successful reversal.

14 consecutive perfect runs across 7 languages (en/nb/nn/es/fr/de/pt) confirm this standard requires no further changes.
