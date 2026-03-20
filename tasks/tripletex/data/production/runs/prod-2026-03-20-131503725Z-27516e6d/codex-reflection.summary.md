## 1. Task
- Reflect on the production run for setting fixed price and invoicing a 33% milestone on a project.
- Prove the corrected path in persistent sandbox using only TypeScript + `bun` scripts in the run scripts dir.
- Update only learning artifacts.
- Commit only `AGENTS.md` and relevant playbooks.
- Write this summary.

## 2. Reflection
- What went well: the main production flow logic was mostly right. Project-manager lookup, customer lookup/create, project upsert, real project-linked order line, and same-order invoice conversion were all correct.
- What went poorly: the fixed-price partial-invoice playbook did not carry forward the known bank-account repair branch from invoice playbooks. That gap caused a `422` at `PUT /order/{id}/:invoice`.
- Mistake made: after the invoice failure, the recovery path had to be improvised from a different playbook instead of already being explicit in the matching playbook.
- Correct approach: treat missing company bank account as an invoice-stage prerequisite failure, repair `/ledger/account`, then retry the same `PUT /order/{id}/:invoice` once. Do not recreate project or order.
- Efficiency impact: one avoidable `422`, plus recovery work and extra scripts. The side effects were still recovered correctly, but the documented optimal path was incomplete.

## 3. Root Causes
- Cross-playbook learning was not propagated: `create-customer-invoice.md` already had the bank-account repair branch, but the fixed-price and broader order→invoice playbooks did not.
- `create-order-invoice-and-register-payment.md` had the bank-account repair step placed before order creation, which is logically wrong for an error that only appears at invoice time.
- The fixed-price playbook lacked an explicit “resume from existing order” rule for invoice-only prerequisite failures.
- The production script did not include inline handling for that specific validated `422`; it stopped and required a second script.

## 4. Sandbox Verification
- I used sandbox credentials only, via `/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-131503725Z-27516e6d/scripts/sandbox-verify-fixed-price-partial-flow.ts`.
- Proven flow in sandbox:
  - resolve assignable project manager
  - resolve/create customer
  - resolve outgoing VAT
  - `POST /project`
  - `PUT /project/{id}` to update fixed price from `170400` to `170500`
  - `POST /order` with one project-linked line for `56265`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
  - `GET /invoice/{id}` with expanded fields to verify project link and fixed-price state
- Sandbox result:
  - `createdCustomer: true`
  - `repairedBankAccount: false`
  - `projectManagerEmail: simen.sandhaug@gmail.com`
  - `customerId: 108244202`
  - `projectId: 401956995`
  - `orderId: 401956996`
  - `invoiceId: 2147526064`
  - `invoiceAmountExcludingVatCurrency: 56265`
  - `projectFixedPrice: 170500`
- Conclusion: the corrected core flow is valid in sandbox. The bank-account repair branch was not needed there because the sandbox account already had a usable bank account, but production proved that branch and the retry-on-same-order behavior.

## 5. Playbook Changes
- Updated existing playbooks. No new playbook created.
- Changed paths:
  - `./AGENTS.md`
  - `./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`
  - `./task-playbooks/create-order-invoice-and-register-payment.md`
- `AGENTS.md`:
  - added a general gotcha: if `PUT /order/{id}/:invoice` fails on missing company bank account number, repair `/ledger/account` and retry the same order invoice once; do not create a second order/project.
- `set-project-fixed-price-and-invoice-partial-payment.md`:
  - added the production-proven bank-account failure branch
  - added explicit “resume from same order” guidance
  - added sandbox proof for `POST /project` then `PUT /project/{id}` to `170500`, then order + invoice + decisive invoice verification
  - added “do not do unconditional `GET /ledger/account` before first invoice write”
- `create-order-invoice-and-register-payment.md`:
  - corrected the flow order so bank-account repair happens only after invoice failure, not before order creation
  - added same-order retry guidance
  - expanded recovery rules to cover invoice-stage prerequisite failure, not only payment-stage failure

## 6. Commit
- Commit hash: `018b378192fc72ea901c297b7524016301191bf5`
- Commit message: `tripletex playbook: resume same order after bank-account repair`

## 7. Reusable Heuristics
- If an order already exists, late-stage invoice prerequisite failures should usually resume from that order, not restart the whole workflow.
- Do not pre-read `/ledger/account` in order/invoice flows unless the prompt already indicates bank-account repair is needed or the invoice write actually fails with that validation.
- When a validation error is precise, fix exactly that prerequisite once and retry exactly the failed step once.
- Keep recovery rules at the exact failure stage in the playbook; placing them earlier makes the execution path less efficient and easier to misuse.
- Reuse write responses aggressively, but add one decisive verification read when link proof is still needed for scored fields like project linkage.