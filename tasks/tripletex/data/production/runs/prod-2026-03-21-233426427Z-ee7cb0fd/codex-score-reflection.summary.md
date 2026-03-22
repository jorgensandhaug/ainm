# Score-Aware Reflection

## Task Attribution

- **Run ID**: prod-2026-03-21-233426427Z-ee7cb0fd
- **Task ID**: 14 (T2 tier, max score = 4)
- **Prompt**: Create a full credit note reversing the invoice for "Webdesign" (9900 kr excl. VAT) for customer Lysgård AS (org.nr 866100829). Norwegian prompt.
- **Attempt delta**: 1 (unique attempt confirmed)

## Correctness Verdict

**Perfect.** Correctness = 1.0, score_raw = 8/8, all 5/5 checks passed. The credit note was created correctly with the right customer, amount, and invoice linkage.

## Efficiency Verdict

**Optimal.** normalized_score = 4 = tier max for T2. Tied with leaderboard best_score = 4 (which was already established before this run from 18 prior attempts). This run used exactly 2 API calls with 0 errors — the proven minimum for this task shape.

| Metric | Value |
|--------|-------|
| API calls | 2 |
| Errors | 0 |
| Correctness | 1.0 |
| Normalized score | 4 (tied best) |
| Leaderboard best before | 4 |
| Leaderboard best after | 4 (maintained) |

No wasted calls. No retries. No avoidable 4xx errors. The two-call path (1 GET locate + 1 PUT createCreditNote) is the theoretical minimum for prompts that do not provide the exact invoice ID.

## Likely Root Cause

No issues to diagnose. The run achieved perfect correctness and maximum efficiency score.

## What Went Right

1. **Trusted standard matched exactly** — the agent read the trusted standard before writing any code and followed the two-call path without deviation.
2. **No unnecessary reads** — no `GET /customer`, no `GET /invoice/{id}`, no openapi.json re-checking.
3. **Correct filtering** — excluded `isCreditNote` and `isCredited` invoices, matched on organization number + description + amount.
4. **Write-response verification** — trusted `isCreditNote=true` and `creditedInvoice` from the PUT response instead of spending a follow-up GET.
5. **Explicit `sendToCustomer=false`** — avoided the endpoint default which would send the credit note.
6. **13th consecutive optimal production run** for this task shape, confirming the standard is fully language-independent and stable across en/nb/nn/es/fr/de.

## What To Change Next Time

Nothing. This task shape is fully solved. The two-call path has been confirmed optimal across 13 consecutive production runs with perfect scores. The only possible improvement would be a one-call path, which requires the prompt to provide the exact invoice ID — something the current prompt shape never does.
