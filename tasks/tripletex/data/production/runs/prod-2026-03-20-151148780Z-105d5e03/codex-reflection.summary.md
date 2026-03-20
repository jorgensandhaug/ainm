## Task

Issue a full credit note for the existing outgoing invoice to customer Étoile SARL (`organizationNumber=955361490`) for `Maintenance`, `45550 NOK` excluding VAT.

## Reflection

The production run executed the correct Tripletex flow and completed successfully: one decisive `GET /invoice` locate call, then one `PUT /invoice/{id}/:createCreditNote?date=2026-03-20&sendToCustomer=false`. The write response proved success immediately with `isCreditNote=true`, a new credit-note id/number, and `creditedInvoiceId=2147490986`.

What went well:
- I matched the exact trusted standard task shape and used the correct built-in credit-note endpoint instead of manual invoice/voucher work.
- I reused the write response for verification and avoided any follow-up `GET /invoice/{id}`.
- I kept the actual Tripletex production flow to 2 calls, which is the realistic minimum for this prompt shape.

What went poorly:
- I still re-opened `openapi.json` locally before acting even though this was an exact trusted-standard match. That did not cost Tripletex API calls, but it wasted scored-run time and reflected insufficient trust in the standard.
- I had not explicitly documented one subtle locate-read behavior: the same invoice-line description can appear in both top-level `orderLines[]` and nested `orders[].orderLines[]` for one invoice. My script handled both arrays correctly, but the learning artifact was missing that rule.

Correct approach:
- For this exact task shape, trust the existing credit-note standard immediately.
- Filter the single `GET /invoice` result set at the invoice level by org number, ex-VAT amount, and exact description across both line arrays.
- Treat duplicate line-description hits inside one invoice as one invoice candidate, not as ambiguity.

## Call Efficiency

The production run was minimal-call for this exact prompt shape.

Tripletex API calls used:
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
2. `PUT /invoice/2147490986/:createCreditNote?date=2026-03-20&sendToCustomer=false`

Wasted Tripletex API calls: none.

Lower-call replacement path for the next agent: none for this exact prompt shape. Two calls are already minimal when the prompt gives only organization number, ex-VAT amount, and service description. The only lower-call variant is a one-write path when the prompt already gives the exact invoice id.

## Root Causes

- Habitual over-verification: I checked `openapi.json` even though the trusted standard already covered this exact task shape.
- Missing documented nuance: the playbook/standard did not yet state that one invoice can expose the same description in both `orderLines[]` and `orders[].orderLines[]`, which could make a future agent misread one invoice as multiple matches.

## Sandbox Verification

I used only the provided persistent sandbox credentials and a TypeScript `bun` script in the run scripts directory to prove the path.

Fixture setup used only for sandbox proof:
- created disposable customer `id=108246925`, `organizationNumber=397255158`
- resolved outgoing VAT type `id=6`, `number=6`, `percentage=0`
- created disposable invoice `id=2147529747`, `invoiceNumber=25` with `description="Maintenance"` and `amountExcludingVatCurrency=45550`

Proven credit-note core:
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
2. `PUT /invoice/2147529747/:createCreditNote?date=2026-03-20&sendToCustomer=false`

Proof points from sandbox:
- the locate read uniquely matched invoice `2147529747` by organization number + ex-VAT amount + exact `Maintenance` description
- that same `Maintenance` description appeared in both top-level `orderLines[]` and nested `orders[].orderLines[]` on the same invoice
- the credit-note write returned credit note `id=2147529749`, `invoiceNumber=26`, `creditedInvoiceId=2147529747`, `isCreditNote=true`

## Playbook Changes

Updated existing artifacts; no new trusted standard or playbook created.

Changed paths:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `trusted-standards/create-customer-invoice-credit-note.md`
- `task-playbooks/create-customer-invoice-credit-note.md`

What changed:
- added the invoice-search dedupe rule: the same line description can appear in both `orderLines[]` and `orders[].orderLines[]` for one invoice
- clarified that uniqueness must be judged at the invoice level, not the raw line-hit count
- recorded a new persistent-sandbox proof using production-style facts: `Maintenance`, `45550` excluding VAT

## Commit

Commit hash: `9526923`

Commit message: `tripletex playbook: clarify invoice locate dedupe for credit notes`

## Reusable Heuristics

- For full outgoing invoice credit notes, default to the built-in action path: `PUT /invoice/{id}/:createCreditNote`.
- If the prompt gives org number + ex-VAT amount + exact description but no invoice id, the trusted minimum is one decisive `GET /invoice` plus one `PUT :createCreditNote`.
- Use `fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` on the locate read and filter locally.
- Match descriptions across both top-level and nested line arrays.
- If the same exact description appears in both arrays on one invoice, dedupe by invoice id; do not mistake that for multiple invoices.
- Exclude `isCreditNote=true` and `isCredited=true` during locate.
- Default `sendToCustomer=false` unless the prompt explicitly requires sending the credit note.
- Do not add `GET /customer`, `GET /invoice/{id}`, manual negative invoices, or voucher reversals to this task shape.
