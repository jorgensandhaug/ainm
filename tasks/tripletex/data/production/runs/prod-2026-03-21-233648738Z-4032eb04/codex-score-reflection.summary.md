# Score-Aware Reflection: prod-2026-03-21-233648738Z-4032eb04

## Task Attribution
- **Attributed task**: T14 (create-customer-invoice-credit-note)
- **Tier**: T2 (tasks 9–18), max score = 4
- **Prompt**: German — Brückentor GmbH / 901668566 / Webdesign / 38800 NOK ex-VAT
- **Attempt**: 20th for T14

## Correctness Verdict
**Perfect.** `correctness=1.0`, `score_raw=8/8`, `all_checks_passed=true`, 5/5 checks passed.

No field errors, no missing side effects, no incorrect state. The credit note was created correctly and fully reversed the original invoice.

## Efficiency Verdict
**Maximum score achieved.** `normalized_score=4` — tied with the leaderboard best of 4 (which was already established before this run).

- 2 API calls, 0 errors — this is the provably minimal path for this task shape (no invoice ID in the prompt forces one locate read + one write)
- No wasted calls, no retries, no 4xx errors
- Duration: 49s — well within the 300s budget
- The run matched the theoretical and practical ceiling for T14

## Likely Root Cause
No issues to diagnose. The run was optimal in every dimension: correctness, call count, and error count.

## What Went Right
1. **Trusted standard match detected immediately** — the agent recognized this as an exact match for `create-customer-invoice-credit-note` and read the standard before writing any code
2. **Two-call path executed cleanly** — `GET /invoice?...` located the invoice, `PUT /:createCreditNote` created the credit note, no fallback needed
3. **No unnecessary reads** — no `GET /customer`, no `GET /invoice/{id}`, no verification read after the write
4. **German prompt handled correctly** — "Rechnung", "Gutschrift", "reklamiert" parsed correctly; the API data (org number, description, amount) is language-independent
5. **Write response trusted as verification** — `isCreditNote=true` and `creditedInvoice=2147652358` from the PUT response proved success without a follow-up GET
6. **`sendToCustomer=false` explicitly set** — avoided unintended dispatch

## What To Change Next Time
Nothing. This is a fully solved task shape. The trusted standard has now been confirmed across 14 consecutive production runs with 0 errors across en/nb/nn/es/fr/de prompts. The next agent should follow the identical two-call path:

1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=<date+1>&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` — filter locally by org number + amount + description + `!isCreditNote` + `!isCredited`
2. `PUT /invoice/{id}/:createCreditNote?date=<today>&sendToCustomer=false`

No improvements are possible for this task shape without being given the invoice ID directly in the prompt (which would allow a 1-call path).
