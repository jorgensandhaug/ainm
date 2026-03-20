## 1. Task

Post-run learning pass for the production task shape: issue a full credit note that reverses one existing outgoing customer invoice identified by customer organization number, exact line description, and exact ex-VAT amount.

## 2. Reflection

What went well:
- Production run succeeded cleanly with no `4xx`.
- The script reused the `PUT /invoice/{id}/:createCreditNote` write response for verification.
- It avoided unnecessary `GET /customer` and `GET /invoice/{id}` calls.

What went poorly:
- There was no existing trusted standard or playbook for full customer-invoice credit notes, so the run had to rediscover the endpoint from `openapi.json`.
- The endpoint name was not already documented in local guidance, so there was avoidable local uncertainty between a guessed `:credit` style path and the real `:createCreditNote` path.
- The send-suppression rule for credit notes was not documented; using `sendToCustomer=false` was correct, but that was inferred rather than guided.

Mistakes:
- No API-call mistake happened in production.
- The main gap was documentation coverage, not execution.

Correct approach:
- One decisive `GET /invoice` to locate the unique uncredited outgoing invoice.
- One `PUT /invoice/{id}/:createCreditNote?date=<run-date>&sendToCustomer=false`.
- Verify directly from the write response via `isCreditNote=true` and `creditedInvoice=<originalId>`.

## 3. Call Efficiency

The production run was minimal-call for this exact task shape.

Production API calls:
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
2. `PUT /invoice/{id}/:createCreditNote?date=2026-03-20&sendToCustomer=false`

Wasted API calls:
- None.

Exact lower-call path the next agent should follow:
- Same 2-call path above when the prompt identifies the invoice by org number, description, and amount but does not give the invoice id.
- Only if the prompt already gives the exact invoice id is there a lower 1-call path:
  - `PUT /invoice/{id}/:createCreditNote?date=<date>&sendToCustomer=false`

Calls that would have been unnecessary for this exact task:
- `GET /customer?organizationNumber=...`
- `GET /invoice/{id}`
- Any voucher read/reversal
- Any manual negative-invoice creation flow

## 4. Root Causes

- Missing learning artifact for this task shape.
- Missing invoice-endpoint note that the verified action path is `:createCreditNote`.
- Missing documented rule that the credit-note write response itself is enough to verify success.
- Missing documented warning that the default send behavior should be overridden with `sendToCustomer=false` for create-only credit-note tasks.

## 5. Sandbox Verification

Used only sandbox credentials.

Proof run:
- Created sandbox fixture customer `id=108246641`, org `999885560`.
- Created fixture invoice `id=2147529327`, `invoiceNumber=20`, line description `Consultoria de dados`, ex-VAT `12000`.
- Located that invoice with one `GET /invoice` using:
  - `customer.organizationNumber`
  - `amountExcludingVat` / `amountExcludingVatCurrency`
  - nested line description
  - `isCreditNote != true`
  - `isCredited != true`
- Created the credit note with:
  - `PUT /invoice/2147529327/:createCreditNote?date=2026-03-20&sendToCustomer=false`
- Verified from the write response:
  - `creditNoteId=2147529329`
  - `creditNoteInvoiceNumber=21`
  - `isCreditNote=true`
  - `creditedInvoice=2147529327`

Conclusion:
- The correct solution path is proven.
- The write response is sufficient; no follow-up `GET /invoice/{id}` is needed.

## 6. Playbook Changes

Created new trusted standard:
- [trusted-standards/create-customer-invoice-credit-note.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice-credit-note.md)

Created new playbook:
- [task-playbooks/create-customer-invoice-credit-note.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer-invoice-credit-note.md)

Updated shared guidance:
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)

What changed:
- Added the missing trusted standard/playbook for full outgoing customer-invoice credit notes.
- Added `/invoice/{id}/:createCreditNote` to common invoice endpoint guidance.
- Documented the 2-call fast path.
- Documented `sendToCustomer=false` as the safe default for create-only credit-note tasks.
- Documented that `ResponseWrapperInvoice.value` can directly prove success via `isCreditNote` and `creditedInvoice`.
- Documented pitfalls: no guessed `:credit`, no `GET /customer` when one `GET /invoice` is enough, no voucher reversal, no manual negative invoice.

## 7. Commit

Commit hash:
- `d4c830570ba398fcb06b36f7e54063afb49cb68d`

Commit message:
- `tripletex playbook: add customer invoice credit-note standard`

## 8. Reusable Heuristics

- For full outgoing invoice credit-note tasks, prefer the built-in invoice action endpoint over manual accounting work.
- When the prompt gives org number + exact description + exact ex-VAT amount, try solving invoice identification with one `GET /invoice` before adding `GET /customer`.
- On invoice action tasks, explicitly disable sending unless the prompt asks for dispatch.
- Treat `isCreditNote=true` plus `creditedInvoice=<originalId>` in the write response as decisive proof.
- If the exact invoice id is already in the prompt, skip the locate read entirely.
- Reserve voucher reversal for payment-reversal workflows, not invoice-credit-note workflows.