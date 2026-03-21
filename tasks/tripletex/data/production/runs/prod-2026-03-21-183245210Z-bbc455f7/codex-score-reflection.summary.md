# Score-Aware Reflection

## Task Attribution

- **Run ID**: `prod-2026-03-21-183245210Z-bbc455f7`
- **Task ID**: 14 (T2 tier, max score = 4)
- **Prompt**: Create full credit note reversing "Datarådgjeving" invoice (45300 kr excl. VAT) for Elvdal AS (org.nr 812449982)
- **Attempt**: 13th attempt on this task (12 prior)

## Correctness Verdict

**Perfect.** Correctness = 1.0, 5/5 checks passed, score_raw = 8/8.

The credit note was created correctly: invoice 2147571523 was located and credit note 2147624127 was issued via `PUT /invoice/{id}/:createCreditNote?date=2026-03-21&sendToCustomer=false`. The write response confirmed `isCreditNote=true` and `creditedInvoice=2147571523`.

## Efficiency Verdict

**Maximum efficiency achieved.** Normalized score = 4/4, which is the tier ceiling for T2 tasks.

- Leaderboard best before: 4 (already at ceiling)
- Leaderboard best after: 4 (tied, still at ceiling)
- This run scored the maximum possible — no efficiency gap exists.

API calls used: 2 (the theoretical minimum for this task shape without a pre-known invoice ID).

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` | 200 | Locate invoice |
| 2 | `PUT /invoice/2147571523/:createCreditNote?date=2026-03-21&sendToCustomer=false` | 200 | Create credit note |

Zero wasted calls. Zero 4xx errors. Zero retries.

## Likely Root Cause

No issues to diagnose. The run was a flawless execution of the trusted standard for an already-proven prompt shape. The exact combination (`812449982` + `Datarådgjeving` + `45300`) had already succeeded on 2026-03-20 with the identical two-call path; this run replicated that success exactly.

## What Went Right

1. **Immediate trusted-standard recognition.** The agent matched the task to `create-customer-invoice-credit-note` on first inspection and read the standard before writing code.
2. **No documentation over-reading.** The agent did not waste time reading `AGENTS.md`, `openapi.json`, or multiple playbooks — it went straight from trusted standard to script execution.
3. **Single script, single execution.** One TypeScript file, one `bun run`, no retries or corrections needed.
4. **Correct field expansion.** The `fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` expansion embedded all needed data in the locate response, avoiding any need for separate `GET /customer` or `GET /invoice/{id}` calls.
5. **Proper filtering.** The script correctly filtered by `organizationNumber`, `amountExcludingVatCurrency`, description match in both `orderLines[]` and `orders[].orderLines[]`, and excluded `isCreditNote`/`isCredited` invoices.
6. **Explicit `sendToCustomer=false`.** Avoided the endpoint default which could trigger unintended dispatch.

## What To Change Next Time

Nothing. This task shape is fully optimized:
- 2 API calls is the minimum possible without a pre-known invoice ID
- The normalized score of 4/4 is the tier ceiling
- The trusted standard is complete and production-verified 9 times across 8 distinct prompt shapes
- The playbook captures all known pitfalls

The only hypothetical improvement would be if the prompt provided the exact invoice ID, reducing to 1 call — but that is a different prompt shape entirely. For the current shape (org nr + description + amount, no invoice ID), the path is already optimal.
