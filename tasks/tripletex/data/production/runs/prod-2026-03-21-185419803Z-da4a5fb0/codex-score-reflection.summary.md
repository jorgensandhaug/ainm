# Score-Aware Reflection

## Task Attribution
- **Run ID**: `prod-2026-03-21-185419803Z-da4a5fb0`
- **Task ID**: 14 (T2 tier, max score = 4)
- **Prompt**: Create full credit note reversing the "Opplæring" (13100 kr excl. VAT) invoice for Stormberg AS (org.nr 991882502)
- **Attempt**: 14th attempt on this task

## Correctness Verdict
**Perfect.** Correctness = 1.0, score_raw = 8/8, all 5/5 checks passed.

The credit note was created correctly, fully reversing the original invoice. No field mismatches, no missing side effects.

## Efficiency Verdict
**Optimal.** Normalized score = 4/4 (maximum possible for T2 tier). Tied with the existing leaderboard best of 4.

- 2 API calls, 0 errors
- Duration: ~50s
- No wasted calls, no retries, no 4xx errors
- The leaderboard best_score remained at 4 both before and after this run, confirming this run matched the ceiling

There is no room for improvement on this task shape without the prompt providing the invoice ID directly (which would reduce to 1 call).

## Likely Root Cause
No issues to diagnose. The run was a textbook execution of the trusted standard `create-customer-invoice-credit-note.md`, which is fully proven for this exact prompt shape.

## What Went Right
1. **Immediate trusted-standard match**: The agent recognized this as an exact match for the credit-note standard without wasting time on spec exploration or playbook reading beyond the standard itself.
2. **Minimal-call execution**: Exactly 2 calls — one decisive `GET /invoice` to locate, one `PUT /invoice/{id}/:createCreditNote` to write. No `GET /customer`, no `GET /invoice/{id}`, no verification read.
3. **Zero errors**: No 4xx responses, no retries. The locate filter correctly excluded `isCreditNote` and `isCredited` invoices.
4. **Correct parameters**: `sendToCustomer=false` was set explicitly (avoiding unintended dispatch), `date=2026-03-21` used the run date, and the wide date window `2000-01-01..2026-03-22` ensured the invoice would be found regardless of its creation date.
5. **Write-response verification**: Success was confirmed from the `PUT` response alone (`isCreditNote=true`, `creditedInvoice=2147572201`), no follow-up GET needed.

## What To Change Next Time
Nothing. This task shape is fully solved at maximum score. The next agent should:
1. Read the trusted standard `create-customer-invoice-credit-note.md` before writing code.
2. Execute the exact same 2-call flow: `GET /invoice?...` → `PUT /invoice/{id}/:createCreditNote?date=...&sendToCustomer=false`.
3. Do not add any speculative reads, customer lookups, or verification GETs.
4. This exact prompt shape (`991882502` + `Opplæring` + `13100`) has now scored 4/4 in production twice (2026-03-20 and 2026-03-21). No further optimization is possible.
