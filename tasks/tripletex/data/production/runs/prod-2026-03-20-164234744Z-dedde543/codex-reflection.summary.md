## 1. Task
Post-run learning for the credit-note task: audit the original production run, verify the lowest-call path in sandbox, update the relevant Tripletex docs, and commit the doc changes.

## 2. Reflection
The production run succeeded cleanly. It chose the right exact-match standard, used one decisive invoice read, then one `:createCreditNote` write, and reused the write response instead of spending a follow-up `GET`.

What went poorly: I still re-checked `openapi.json` locally even though `trusted-standards/create-customer-invoice-credit-note.md` was already an exact match. That did not cost API calls, but it was unnecessary scored-run thinking/work and violated the intended “trust the trusted standard” rule for exact matches.

Correct approach for the original task shape was:
- `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
- local exact filter on `customer.organizationNumber=900993560`, `amountExcludingVatCurrency=30500`, `description="Maintenance"`, excluding `isCreditNote` and `isCredited`
- `PUT /invoice/{id}/:createCreditNote?date=2026-03-20&sendToCustomer=false`
- stop on write response

## 3. Call Efficiency
The production run was minimal-call for that exact prompt shape.

Wasted API calls: none.

Exact lower-call path next time:
- same 2-call path above if the prompt gives org no + exact ex-VAT amount + exact line description but not invoice id
- only switch to a 1-call path when the prompt already gives the exact invoice id, then call `PUT /invoice/{id}/:createCreditNote?date=<date>&sendToCustomer=false`

Calls that would have been waste for this task:
- `GET /customer`
- `GET /invoice/{id}`
- voucher lookup/reversal
- manual negative invoice creation

## 4. Root Causes
Root cause of the only mistake: I defaulted to endpoint re-confirmation instead of fully trusting the exact trusted standard.

Why that happened:
- habit of defensive schema-checking
- not enforcing the “exact trusted-standard match means skip spec re-check” rule strictly enough

Future correction:
- if the task is an exact full-credit-note match, read the trusted standard and execute it directly
- treat the invoice search itself as the resolver when it already contains `customer.organizationNumber`

## 5. Sandbox Verification
I used sandbox credentials only and proved the path with a disposable fixture.

Sandbox setup calls used only for proof, not for production playbook:
- `POST /customer` -> customer `108249009`
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> only `0%` VAT, `id=6`
- `POST /invoice?sendToCustomer=false` -> invoice `2147532591` / `#46`

Then I proved the production-relevant core:
- `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
- matched the created invoice by exact `organizationNumber=900993560`, `description="Maintenance"`, `amountExcludingVatCurrency=30500`
- duplicate `Maintenance` hits appeared in both top-level and nested line arrays on the same invoice
- `PUT /invoice/2147532591/:createCreditNote?date=2026-03-20&sendToCustomer=false`
- returned credit note `2147532593` / `#47` with `isCreditNote=true` and `creditedInvoice=2147532591`

Sandbox note: because that sandbox account exposed only `0%` outgoing VAT, the proof invoice total was `30500`, not `38125`. That does not change the verified credit-note path.

## 6. Playbook Changes
Updated existing docs; created no new files.

Changed paths:
- `trusted-standards/create-customer-invoice-credit-note.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/create-customer-invoice-credit-note.md`

What changed:
- added exact production-shape confirmation for `900993560` + `Maintenance` + `30500`
- made explicit that this shape is already minimal at 2 API calls
- reinforced that no separate `GET /customer` belongs in this flow
- recorded that duplicate description hits across top-level and nested line arrays do not create ambiguity by themselves
- reinforced that the credit-note write response alone is sufficient verification

`AGENTS.md` was not changed.

## 7. Commit
Commit hash: `4892da8520dbbbe6dadf13599e44e746767786db`

Commit message: `tripletex playbook: tighten credit-note minimal path`

## 8. Reusable Heuristics
- For exact full-credit-note tasks, if the prompt gives org no + exact ex-VAT amount + exact line description but not invoice id, assume the winning path is one invoice search plus one `:createCreditNote` write.
- Use `GET /invoice` as the resolver when it already returns `customer.organizationNumber`; do not add `GET /customer`.
- Filter at invoice level, not raw line-hit count. The same description can appear in both `orderLines[]` and `orders[].orderLines[]` on one invoice.
- Always send `sendToCustomer=false` unless the prompt explicitly requires dispatch.
- After `PUT /invoice/{id}/:createCreditNote`, stop if the write response already shows `isCreditNote=true` and `creditedInvoice=<original id>`.
- Only the prompt’s exact invoice id unlocks the 1-call path. Without that id, 2 calls is the realistic minimum.