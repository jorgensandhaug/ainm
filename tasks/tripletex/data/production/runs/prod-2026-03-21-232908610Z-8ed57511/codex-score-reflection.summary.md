# Score-Aware Reflection

## Task Attribution
- **Run ID**: prod-2026-03-21-232908610Z-8ed57511
- **Attributed task**: T14 (create-customer-invoice-credit-note)
- **Tier**: T2 (max score = 4)
- **Prompt language**: Spanish
- **Prompt**: Issue full credit note for Viento SL (978503071) / "Licencia de software" / 25450 NOK ex-VAT

## Correctness Verdict
**Perfect.** Correctness = 1.0, score_raw = 8/8, all 5/5 checks passed, normalized_score = 4/4 (tied best on leaderboard for T14).

## Efficiency Verdict
**Optimal.** 2 API calls, 0 errors. The normalized score of 4 equals the leaderboard best for task 14, confirming this run achieved maximum efficiency bonus alongside perfect correctness. Duration was ~55s — well within the 300s budget.

The two-call path (1× GET locate + 1× PUT createCreditNote) is the proven minimum for this prompt shape where the invoice ID is not given upfront.

## Likely Root Cause
No issues. No wasted calls, no 4xx errors, no retries. The trusted standard was followed exactly and produced the optimal result.

## What Went Right
1. **Instant task recognition** — the agent matched the trusted standard immediately without reading AGENTS.md or openapi.json during the scored run.
2. **Standard compliance** — read the trusted standard file before writing any script, as required.
3. **Exact two-call path** — GET to locate, PUT to credit. No extra customer lookup, no verification GET, no spec exploration.
4. **Clean filtering** — correctly filtered by org number (978503071), amount (25450), description ("Licencia de software"), and excluded credit notes / already-credited invoices.
5. **Trusted write response** — verified success from the PUT response (isCreditNote=true, creditedInvoice=original id) without a follow-up read.
6. **Language independence** — Spanish prompt handled identically to all other languages. This is the 12th consecutive optimal run across 6 languages.

## What To Change Next Time
Nothing. This task shape is fully optimized:
- 2 calls is the proven minimum when the invoice ID is not provided
- 0 errors is the floor
- normalized_score = 4 is the ceiling for T2
- The trusted standard covers this exact flow with 12 production confirmations

The only theoretical improvement would be if the prompt provided the exact invoice ID, reducing to 1 call — but that is a different prompt shape not under agent control.
