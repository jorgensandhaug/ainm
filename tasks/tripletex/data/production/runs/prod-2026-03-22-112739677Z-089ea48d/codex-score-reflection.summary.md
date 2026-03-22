# Score-Aware Reflection

## Task Attribution
- **Run ID**: prod-2026-03-22-112739677Z-089ea48d
- **Attributed task**: T14 (create customer invoice credit note)
- **Tier**: T2 (max score: 4)
- **Prompt**: French — issue full credit note for "Conseil en données" (23750 NOK HT), Colline SARL (879581265)

## Correctness Verdict
**Likely perfect (correctness = 1.0).**

The submission-score status is "ambiguous" (candidate_count=2), which is a scoring-infrastructure artifact — the scorer found 2 candidate submissions to match against. However, the leaderboard delta confirms the run landed on task 14:
- Before: best_score=4, total_attempts=26
- After: best_score=4, total_attempts=27

The best_score was already at the T2 maximum of 4 and remained there. Combined with the 22 prior consecutive optimal runs using the identical 2-call path, this run almost certainly scored 4/4 (perfect correctness, maximum efficiency bonus).

## Efficiency Verdict
**Optimal.** 2 API calls, 0 errors, 0 wasted calls.

| # | Call | Wasted? |
|---|------|---------|
| 1 | `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` | No — required to locate invoice (no ID given) |
| 2 | `PUT /invoice/2147700238/:createCreditNote?date=2026-03-22&sendToCustomer=false` | No — the core write |

This is the theoretical minimum for this prompt shape. The only way to use fewer calls would be if the prompt provided the exact invoice ID (which it did not).

## Likely Root Cause
No issues. Nothing to fix. The run executed the proven optimal path with zero deviation.

## What Went Right
1. **Exact trusted standard match** — agent read the standard, recognized the exact-match fast path, and followed it.
2. **No unnecessary file reads** — did not waste time reading AGENTS.md, openapi.json, or the playbook beyond the trusted standard.
3. **Correct client-side filtering** — filtered by org number, amount, description, excluded credit notes and already-credited invoices.
4. **Duplicate-safe** — script sorted by highest `id` in case of duplicates (not needed here, but defensive).
5. **Fast execution** — task completed in ~53 seconds (11:27:39 → 11:28:32).
6. **22nd consecutive optimal run** for this task shape across 6 languages.

## What To Change Next Time
Nothing. This task shape is fully solved. The 2-call path (GET locate + PUT createCreditNote) is the theoretical minimum and has been confirmed 22 times in production across en/nb/nn/es/fr/de with 0 errors. Continue using the identical approach.
