## Task
Post-run learning pass for the production task: create a full credit note for the Elvdal AS invoice identified by `organizationNumber=812449982`, `description="Datarådgjeving"`, `amountExcludingVatCurrency=45300`.

## Reflection
The production run succeeded cleanly. The API shape was matched correctly: one decisive invoice search, then one `PUT /invoice/{id}/:createCreditNote?date=2026-03-20&sendToCustomer=false`.

What went well:
- Correct trusted-standard family chosen.
- Correct resolver fields used: `customer(*)`, `orderLines(*)`, `orders(*,orderLines(*))`.
- Correct credit-note endpoint and `sendToCustomer=false`.
- Correct stop condition: trust write response when it proves `isCreditNote=true` and `creditedInvoice=<original id>`.

What went poorly:
- I still re-opened `openapi.json` even though this was an exact trusted-standard match. That cost time, not API calls.
- I wrote slightly broader local matching logic than the standard strictly needed. Safe, but not necessary for this exact prompt shape.

Correct approach:
- Follow the trusted standard directly for this exact shape.
- Do not add extra spec confirmation, `GET /customer`, or `GET /invoice/{id}`.

## Call Efficiency
The production run was minimal-call.

API calls used:
- `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
- `PUT /invoice/{id}/:createCreditNote?date=2026-03-20&sendToCustomer=false`

Wasted API calls:
- None.

Lower-call path for next agent:
- Same 2-call path for prompts identified by `customer.organizationNumber + exact ex-VAT amount + exact line description`.
- Only 1-call reduction exists if the prompt already gives the exact invoice id.

## Root Causes
- I defaulted to extra local verification out of habit instead of trusting the exact-match trusted standard.
- I optimized for robustness after the standard had already removed the main ambiguity; good for safety, not needed for this prompt.
- The docs already implied the right answer, but they were strengthened to make the no-detour path more explicit.

## Sandbox Verification
Used only sandbox credentials.

Disposable sandbox proof:
- Customer created: `id 108257557`, `organizationNumber 813161251`
- Fixture invoice created: `id 2147536310`, `invoiceNumber 51`
- Locate read uniquely matched that invoice with the same 2-call core after setup.
- The locate response showed `duplicateDescriptionHits=2` for `Datarådgjeving` across top-level `orderLines[]` and nested `orders[].orderLines[]`; this still represented one invoice, not ambiguity.
- Credit note created: `id 2147536312`, `invoiceNumber 52`
- Write response proved success with `isCreditNote=true` and `creditedInvoice=2147536310`

Proven reusable core:
- `GET /invoice?...fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
- `PUT /invoice/{id}/:createCreditNote?date=<run-date>&sendToCustomer=false`

## Playbook Changes
Updated existing docs; created no new files.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [trusted-standards/create-customer-invoice-credit-note.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice-credit-note.md)
- [task-playbooks/create-customer-invoice-credit-note.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer-invoice-credit-note.md)

What changed:
- Added the exact `812449982` + `45300` + `Datarådgjeving` production case as a proven minimal 2-call example.
- Added the sandbox proof that duplicate description hits across top-level and nested line arrays must be deduped at invoice id level.
- Tightened guidance to skip extra `openapi.json` confirmation once this trusted-standard shape already matches.

## Commit
Commit hash: `66aee7dd3437ca540d9123fc6aec9994a350ea89`

Commit message:
- `tripletex playbook: tighten credit-note fast path`

## Reusable Heuristics
- For full customer-invoice credit notes, if the prompt gives org number + exact ex-VAT amount + exact line description, default to 2 calls, not more.
- Search invoices directly; do not burn a separate `GET /customer` when the invoice read already returns `customer.organizationNumber`.
- In invoice locate results, the same description can appear in both `orderLines[]` and `orders[].orderLines[]`; dedupe by invoice id, not raw line-hit count.
- For this task shape, the credit-note write response is enough proof. Do not add `GET /invoice/{id}` after a successful `:createCreditNote`.
- Do not leave `sendToCustomer` at default; set `sendToCustomer=false` unless the prompt explicitly says to send the credit note.
- If the trusted standard is exact, stop re-checking `openapi.json` and execute.