# Score-Aware Reflection: prod-2026-03-21-222129064Z-34869e1c

## 1. Task Attribution

- **Prompt**: Create full credit note reversing invoice for Lysgård AS (org.nr 962467210), "Nettverkstjeneste", 41600 kr excl. VAT
- **Inference status**: ambiguous (4 candidates: T04, T14, T15, T18)
- **Most likely task**: T14 (create customer invoice credit note)
- **Attribution reasoning**: Credit note is historically T14. Leaderboard diff shows T14 went from 15→16 attempts, last_attempt moved to 22:22:14 — only 2 seconds after our task_complete_timestamp of 22:22:12. Submission `92b392b3` (queued 22:21:03, completed 22:22:14) scored 8/8 raw, 5/5 checks passed, normalized_score=4. This matches the credit note 5-check pattern seen in previous confirmed T14 runs.

## 2. Correctness Verdict

- **Score**: 8/8 raw → normalized_score = 4 (max for T2)
- **Checks**: 5/5 passed
- **Correctness**: perfect (1.0)
- **Best score before**: 4, **best score after**: 4 — tied the existing best

## 3. Efficiency Verdict

- **API calls used**: 2
- **Errors**: 0
- **Normalized score**: 4/4 (tied best, which is the T2 maximum)
- **Verdict**: optimal efficiency — 2 calls is the theoretical minimum for this task shape (no invoice ID given in prompt, so one locate read + one credit note write is irreducible)
- No wasted calls, no retries, no 4xx errors

## 4. Likely Root Cause

No issues. The run executed the exact trusted standard two-call path flawlessly:
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` — located invoice 2147644728
2. `PUT /invoice/2147644728/:createCreditNote?date=2026-03-21&sendToCustomer=false` — created credit note 2147644822 with `isCreditNote=true`, `creditedInvoice=2147644728`, `amountExcludingVatCurrency=-41600`

## 5. What Went Right

- Immediately recognized the task as an exact match for the `create-customer-invoice-credit-note` trusted standard
- Read the trusted standard before writing any script (per AGENTS.md knowledge order)
- Used the exact two-call path with no deviation
- Correct filter logic: checked both `orderLines[].description` and `orders[].orderLines[].description`, excluded `isCreditNote` and `isCredited`
- Used `sendToCustomer=false` as required by the trusted standard
- Used wide date window `2000-01-01` to `2026-03-22` (run date + 1)
- Trusted the write response for verification — no follow-up GET
- Zero errors, zero wasted calls

## 6. What To Change Next Time

Nothing. This is the 12th production confirmation of the same two-call credit note path. The run achieved the maximum possible score (4/4) with the minimum possible API calls (2) and zero errors. The trusted standard and playbook are correct and complete for this task shape.

For future credit note runs with the same shape (org number + description + ex-VAT amount, no invoice ID given):
- Continue using the exact same two-call path
- Do not add `GET /customer` — the invoice read already includes `customer(*)`
- Do not add `GET /invoice/{id}` — the write response already proves success
- Do not add any verification read — trust `isCreditNote=true` and `creditedInvoice` from the write response
