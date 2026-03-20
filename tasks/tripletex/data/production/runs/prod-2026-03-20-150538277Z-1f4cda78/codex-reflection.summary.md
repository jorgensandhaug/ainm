# 1. Task

Post-run learning pass for the production task: full credit note for customer `Sonnental GmbH` (`organizationNumber=809303829`) on the invoice for `Systementwicklung` (`10400 NOK` ex VAT), then update learning artifacts and commit docs.

# 2. Reflection

What went well:
- Production run used the correct trusted-standard shape immediately.
- It chose the correct endpoint pair: one invoice locate read, one `:createCreditNote` write.
- It reused the write response for verification, so no extra `GET /invoice/{id}` was spent.
- It set `sendToCustomer=false`, avoiding unintended dispatch.

What went poorly:
- No scored-run execution bug.
- Main gap was documentation clarity, not runtime behavior: the docs did not state strongly enough that this prompt shape is already minimal at 2 calls, and that 1 call is only possible when the prompt already gives the exact invoice id.
- The no-invoice-date prompt shape also needed a clearer default locate window in the docs.

Correct approach:
- If prompt gives org number + exact ex-VAT amount + exact line description, use exactly:
  1. `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
  2. `PUT /invoice/{id}/:createCreditNote?date=<run-date>&sendToCustomer=false`
- Verify from write response only.

# 3. Call Efficiency

Production run was minimal-call for this exact prompt shape.

Production calls:
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
2. `PUT /invoice/2147490970/:createCreditNote?date=2026-03-20&sendToCustomer=false`

Wasted calls:
- None.

Exact lower-call path next agent should use:
- Same 2-call path when prompt does not provide invoice id.
- 1-call path only when prompt already provides exact invoice id:
  - `PUT /invoice/{id}/:createCreditNote?date=<run-date>&sendToCustomer=false`

Pitfalls to avoid:
- Do not add `GET /customer`.
- Do not add `GET /invoice/{id}` after the write when response already shows `isCreditNote=true` and `creditedInvoice=<originalId>`.
- Do not reverse vouchers.
- Do not create a manual negative invoice.
- Do not leave `sendToCustomer` at default.
- Do not spend an extra resolver read just because prompt omitted invoice date; use one wide but bounded invoice window.

# 4. Root Causes

- No runtime failure root cause; scored run was correct.
- Documentation root cause: minimal-call rule for full credit-note prompts without invoice id was implicit, not explicit.
- Documentation root cause: `GET /invoice` needing both `invoiceDateFrom` and `invoiceDateTo`, plus a default no-date window, was not stated in the common-endpoints reference.
- Potential future waste root cause: agents might incorrectly believe a separate customer resolver read is needed before invoice locate.

# 5. Sandbox Verification

Used only sandbox credentials.

Sandbox proof script created fixture data, then proved the same credit-note core path:
- Created sandbox customer `id=108246757`, `organizationNumber=811924000`
- Created sandbox invoice `id=2147529528`, `invoiceNumber=23`, marker description `Reflection Credit 19240008`, amount `10400`
- Located that exact invoice with one `GET /invoice?...fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
- Credited it with `PUT /invoice/2147529528/:createCreditNote?date=2026-03-20&sendToCustomer=false`
- Verified from write response:
  - credit note `id=2147529530`
  - credit note `invoiceNumber=24`
  - `creditedInvoiceId=2147529528`

Sandbox conclusion:
- The trusted 2-call core is correct.
- Locate logic by `organizationNumber` + `amountExcludingVatCurrency` + nested order-line description is sufficient.
- Write-response-only verification is sufficient.

# 6. Playbook Changes

Updated existing artifacts; created no new files.

Changed paths:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `trusted-standards/create-customer-invoice-credit-note.md`
- `task-playbooks/create-customer-invoice-credit-note.md`

Changes made:
- Explicitly documented that this prompt shape is already minimal at 2 calls.
- Explicitly documented that 1-call path exists only when exact invoice id is already given.
- Added no-invoice-date guidance: default to one wide but bounded invoice window, e.g. `invoiceDateFrom=2000-01-01` and `invoiceDateTo=<run-date-plus-one-day>`.
- Added common-endpoints note that `GET /invoice` requires both `invoiceDateFrom` and `invoiceDateTo`.

# 7. Commit

Commit hash:
- `366de6b68b6dc5ebea6ab76ffc4d4d18161afb36`

Commit message:
- `tripletex playbook: tighten customer invoice credit note path`

# 8. Reusable Heuristics

- For full outgoing invoice credit notes, default family is `GET /invoice` then `PUT /invoice/{id}/:createCreditNote`, not vouchers.
- If prompt gives org number + ex-VAT amount + exact service text, filter locally on those three plus `isCreditNote != true` and `isCredited != true`.
- If prompt gives no invoice date, do not branch into extra reads; use one wide bounded date window on `/invoice`.
- Trust the credit-note write response when it already returns `isCreditNote=true` and `creditedInvoice=<originalId>`.
- Minimal-call audit rule: without exact invoice id, 2 calls is optimal; with exact invoice id, 1 call is optimal.