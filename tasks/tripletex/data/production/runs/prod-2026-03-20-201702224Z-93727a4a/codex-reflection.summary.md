## 1. Task

Issue a full customer-invoice credit note for `Sonnental GmbH` (`organizationNumber=962075754`) on the invoice identified by exact line description `Analysebericht` and exact ex-VAT amount `30200 NOK`, without sending it.

## 2. Reflection

The scored run went well. It matched the existing trusted standard exactly, used the correct two-step flow, preserved the provided `/v2` base URL, and reused the credit-note write response instead of spending a verification `GET`.

Nothing went poorly in the production run itself. No extra reads, no 4xxs, no speculative resolver branches. The only mistake in this follow-up pass was sandbox-only: my first disposable fixture generator produced an invalid organization number and caused one `422`. That was local setup noise, not a weakness in the production credit-note path.

The correct approach for this task shape remains: one decisive invoice locate read, then one `:createCreditNote` write with `sendToCustomer=false`.

## 3. Call Efficiency

The scored run was minimal-call for this exact task shape.

Production calls used:
- `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
- `PUT /invoice/{id}/:createCreditNote?date=2026-03-20&sendToCustomer=false`

Wasted production calls: none.

Lower-call path for the next agent: same two-call path above. Only reduce to one call if the prompt already gives the exact invoice id.

## 4. Root Causes

Production-side root causes of failure or waste: none.

Key reasons the run stayed minimal:
- trusted standard already matched exactly, so no `openapi.json` re-check was needed
- invoice identity facts were strong enough to skip `GET /customer`
- write response already proved success, so `GET /invoice/{id}` was unnecessary
- `sendToCustomer=false` avoided unintended sending side effects

Sandbox-only root cause of the one `422` during reflection:
- I initially used a wrong local org-number checksum assumption and generated 10 digits instead of 9 for the disposable fixture

## 5. Sandbox Verification

I proved the same solution shape in the persistent sandbox with a disposable analog fixture.

Sandbox setup created:
- customer `organizationNumber=036001818`, `id=108268819`
- invoice `id=2147543627`
- credit note `id=2147543631`, `invoiceNumber=79`
- outgoing VAT resolver returned `vatTypeId=6` (`0%`), which was sufficient for the analog fixture

After setup, the proof path was the same two-call core:
- decisive `GET /invoice?...fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
- `PUT /invoice/2147543627/:createCreditNote?date=2026-03-20&sendToCustomer=false`

The write response returned `isCreditNote=true` and `creditedInvoice=2147543627`, so no follow-up read was needed.

## 6. Playbook Changes

Updated existing artifacts, no new files created.

Changed paths:
- `AGENTS.md`
- `trusted-standards/create-customer-invoice-credit-note.md`
- `task-playbooks/create-customer-invoice-credit-note.md`

What changed:
- added this exact production shape `962075754 + Analysebericht + 30200` as another confirmed minimal two-call credit-note case
- added sandbox analog proof for `Analysebericht` + `30200`
- kept the canonical recommendation unchanged: one decisive invoice read, one credit-note write

## 7. Commit

Commit hash: `dff8fe65daa3425ab50561444cdad875150e3775`

Commit message: `tripletex playbook: extend invoice credit note fast path`

## 8. Reusable Heuristics

- For full customer-invoice credit-note tasks identified by `organizationNumber + exact ex-VAT amount + exact line description`, default to `GET /invoice?...fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` then `PUT /invoice/{id}/:createCreditNote?...`.
- Do not add `GET /customer` when the decisive invoice read already contains `customer.organizationNumber`.
- Do not add `GET /invoice/{id}` when the credit-note write already returns `isCreditNote=true` and `creditedInvoice=<original id>`.
- Always force `sendToCustomer=false` unless the prompt explicitly requires sending.
- Check both `orderLines[].description` and `orders[].orderLines[].description`.
- Deduplicate duplicate description hits at the invoice id level; the same line can appear in both arrays on one invoice.
- Do not replace `:createCreditNote` with manual negative invoices or voucher reversals for this task shape.