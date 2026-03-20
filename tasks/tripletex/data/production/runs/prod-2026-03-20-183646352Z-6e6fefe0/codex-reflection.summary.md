## 1. Task
Audit the completed production run for the exact prompt shape: full credit note for customer `Cascade SARL`, `organizationNumber=973999966`, line description `Conseil en données`, `amountExcludingVatCurrency=40800`, then update the learning artifacts and commit the changes.

## 2. Reflection
The production run went well.
- It matched the existing trusted standard exactly.
- It used the correct endpoint pair: one decisive `GET /invoice?...fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`, then one `PUT /invoice/{id}/:createCreditNote?date=2026-03-20&sendToCustomer=false`.
- It reused the credit-note write response correctly and stopped without a wasteful verification read.

What was weak:
- The docs already covered the general 2-call shape, but they did not yet include this exact French prompt variant.
- The docs did not explicitly call out the Unicode-preservation point for localized descriptions like `Conseil en données`.

Correct approach:
- Keep the exact 2-call trusted-standard path.
- Match the description exactly as written, including accents.
- Treat duplicate description hits across top-level `orderLines[]` and nested `orders[].orderLines[]` as one invoice candidate, not ambiguity by itself.

## 3. Call Efficiency
The production run was minimal-call for this task shape.
- Calls used: 2.
- Wasted calls: none.
- Realistic lower-call path: none, unless the prompt already gives the exact invoice id.

Exact lower-call path for the next agent:
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=<run-date-plus-one-day>&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
2. Filter locally by `customer.organizationNumber=973999966`, exact ex-VAT amount `40800`, exact description `Conseil en données`, `isCreditNote!=true`, `isCredited!=true`
3. `PUT /invoice/{id}/:createCreditNote?date=<run-date>&sendToCustomer=false`

Do not add:
- `GET /customer`
- `GET /invoice/{id}`
- extra `openapi.json` re-checking once the trusted standard already matches
- manual negative invoices
- voucher reversals

## 4. Root Causes
No production API mistake happened. The only documentation gaps were:
- missing exact evidence for the French `Conseil en données` variant
- missing explicit instruction to preserve Unicode when matching localized descriptions
- missing explicit reminder that duplicated line text in both invoice line arrays is still one invoice-level match

## 5. Sandbox Verification
Persistent sandbox proved the same path.
- Setup created an exact customer fixture and an exact invoice fixture for `973999966` / `Conseil en données` / `40800`.
- The proof path after setup was exactly:
  - `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
  - `PUT /invoice/2147536567/:createCreditNote?date=2026-03-20&sendToCustomer=false`
- The locate read found one invoice and showed the description twice, once in top-level `orderLines[]` and once in nested `orders[].orderLines[]`.
- The credit-note write returned `creditNoteId=2147536569`, `isCreditNote=true`, `creditedInvoiceId=2147536567`.
- No follow-up read was needed.

## 6. Playbook Changes
Updated existing artifacts; created none.
- `AGENTS.md`
- `trusted-standards/create-customer-invoice-credit-note.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/create-customer-invoice-credit-note.md`

Changes made:
- added this exact production shape as another confirmed minimal 2-call case
- added sandbox re-proof for the exact French identifiers
- added explicit Unicode-preservation guidance for localized description matching
- added explicit note that duplicate description hits across both invoice line arrays are not invoice ambiguity by themselves

## 7. Commit
- Commit hash: `4445847ab9f38ebc3ac461cd64282d6d33b081b0`
- Commit message: `tripletex playbook: refine invoice credit-note standard`

## 8. Reusable Heuristics
- For full outgoing invoice credit notes identified by organization number + exact ex-VAT amount + exact line description, default to one decisive invoice search plus one `:createCreditNote` write.
- If the prompt gives no invoice date, use one wide but bounded invoice window instead of adding a resolver read.
- Match localized descriptions exactly; do not ASCII-normalize or strip accents.
- On `GET /invoice`, union `orderLines[]` and `orders[].orderLines[]`, then dedupe at the invoice id level.
- If the credit-note write response already shows `isCreditNote=true` and `creditedInvoice=<original id>`, stop.