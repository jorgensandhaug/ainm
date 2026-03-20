## 1. Task

Reflect on the scored invoice-payment run, verify the correct flow in sandbox using only sandbox credentials, update the playbook system, commit only `AGENTS.md` and playbook changes, and summarize the result.

## 2. Reflection

What went well:
- The scored run chose the right primary write endpoint: `PUT /invoice/{id}/:payment`.
- The live task was solved without any `4xx`.
- The script reused the payment write response for verification and stopped once the invoice balance was zero.

What went poorly:
- The scored run had no dedicated payment playbook, so the flow was rediscovered ad hoc.
- It spent one extra read on `/customer`; the invoice could also be located in one decisive invoice search if the account was small enough, though the safer scored path was still customer-first.
- Payment-type choice was under-justified. The script picked the first compatible general type and happened to succeed.
- The script did not encode the key heuristic explicitly enough: prompt amount identified the invoice, but payment amount came from invoice outstanding balance.

Correct approach:
- Match the invoice by prompt identifiers.
- Resolve payment type via `/invoice/paymentType`.
- Pay `amountOutstandingTotal` for full settlement, falling back to `amountOutstanding` only if total is absent.
- Verify zero balance directly from the `PUT /invoice/{id}/:payment` response.

## 3. Root Causes

- Missing playbook: no existing guidance for customer-invoice payment tasks.
- Weak assumption: payment-type selection relied on “first compatible result” instead of a documented heuristic.
- Ambiguity risk: the prompt’s `37550 NOK excluding VAT` was invoice-identification data, not necessarily the payment amount.
- Process gap: no prior sandbox proof for invoice-payment flow, so the scored run leaned on inference more than documented evidence.

## 4. Sandbox Verification

Used sandbox credentials only.

Probe findings:
- `GET /invoice/paymentType?count=1000&fields=*` returned valid types:
  - `32813747` `Kontant`
  - `32813748` `Betalt til bank`
- `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2100-01-01&count=1000&sorting=-id&fields=*,customer(*),orderLines(*),currency(*)` found open invoices.

Proof write:
- Target invoice: `2147515695` / invoice number `2`
- Before payment: `amountOutstanding=101`, `amountOutstandingTotal=101`
- Write:
  - `PUT /invoice/2147515695/:payment?paymentDate=2026-03-19&paymentTypeId=32813747&paidAmount=101`
- Result from same write response:
  - `amountOutstanding=0`
  - `amountOutstandingTotal=0`

This proved the correct flow:
1. locate open invoice
2. get valid invoice payment type
3. pay current outstanding balance
4. trust write response for verification

## 5. Playbook Changes

Created new playbook, did not update an existing one.

Changed paths:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-customer-invoice-payment.md`

Changes made:
- Added a new Task Playbooks table entry for full customer-invoice payment.
- Added an `AGENTS.md` gotcha clarifying:
  - prompt ex-VAT amount may be only a lookup key
  - full payment should use `amountOutstandingTotal` or `amountOutstanding`
- Added a new playbook covering:
  - exact endpoint set
  - minimal flow
  - payment-amount trap
  - payment-type resolution
  - verification from write response
  - avoidable mistakes

## 6. Commit

Commit hash:
- `c23701c1cb4ae21659be380363dd8cb3bf802376`

Commit message:
- `tripletex playbook: add customer invoice payment flow`

## 7. Reusable Heuristics

- For invoice-payment tasks, start with `/invoice/{id}/:payment`, not ledger/voucher workarounds.
- Treat prompt amounts on invoice tasks as identifiers until proven otherwise.
- For full payment, use current outstanding balance from the invoice object:
  - prefer `amountOutstandingTotal`
  - fallback `amountOutstanding`
- Resolve payment types only from `/invoice/paymentType`; prefer general types with no customer binding and matching currency.
- If the payment `PUT` response already shows zero remaining balance, do not spend a verification `GET`.
- When no playbook exists for a recurring pattern, add one immediately after sandbox proof so future scored runs do not rely on inference.