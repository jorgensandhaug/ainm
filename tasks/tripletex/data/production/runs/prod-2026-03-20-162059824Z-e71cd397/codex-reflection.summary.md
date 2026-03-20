## 1. Task
Post-run audit for the exact production run that created an order for customer `962176127`, invoiced it, and registered full payment.

## 2. Reflection
What went well:
- The production side effects were correct: order created, invoice created, payment registered, outstanding `0`.
- The agent reused write responses correctly for `orderId`, `invoiceId`, and payment amount.
- The agent did not waste a follow-up `GET /order/{id}` or `GET /invoice/{id}`.

What went poorly:
- The first script version built URLs incorrectly with `new URL('/path', base)` and stripped `/v2`. That caused a local script failure before the real Tripletex flow started.
- The production script also inserted an unconditional `/ledger/account` preflight hedge. That is not the canonical path for this exact task shape.

Correct approach:
- Fix URL joining so all calls stay under the provided base URL path prefix.
- Keep the canonical exact path at 6 calls.
- Treat `/ledger/account` as a conditional hedge/repair branch, not a default step.

## 3. Call Efficiency
The production run was not minimal-call.

Wasted calls:
- At least 1 extra Tripletex call: `GET /ledger/account?isBankAccount=true&fields=*`.
- Possibly 1 more extra call: `PUT /ledger/account/{id}` if the hedge found a missing `bankAccountNumber`.

Minimal exact path for this task shape:
1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /product?productNumber=<a>&productNumber=<b>&fields=*`
3. `POST /order`
4. `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
5. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
6. `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<outstanding>`

Lower-call replacement for next time:
- Use the 6-call path above by default.
- Only add proactive `/ledger/account` if there is strong run-specific evidence that the first invoice write will hit the missing-company-bank-account `422`.

## 4. Root Causes
- Local coding bug: URL construction ignored the `/v2` base path.
- Weak assumption: I let the fresh-account bank-account hedge become a default step instead of a conditional branch.
- Documentation ambiguity: some shared guidance mentioned proactive `/ledger/account` as potentially lower-call in fresh accounts, but the exact task playbook already treated it as non-default. I aligned the docs to make that distinction explicit.

## 5. Sandbox Verification
I proved the canonical path in persistent sandbox with a dedicated `bun` TypeScript script in the run scripts directory.

Verified 6-call success path:
1. `GET /v2/customer?organizationNumber=864062245&fields=*`
2. `GET /v2/product?productNumber=6749&productNumber=3048&fields=*`
3. `POST /v2/order`
4. `PUT /v2/order/401961116/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
5. `GET /v2/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
6. `PUT /v2/invoice/2147531869/:payment?paymentDate=2026-03-20&paymentTypeId=32813748&paidAmount=12650`

Result:
- `invoiceNumber=43`
- `paymentTypeId=32813748`
- remaining outstanding `0`

Sandbox proof script:
- [verify-create-order-invoice-pay-sandbox.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-162059824Z-e71cd397/scripts/verify-create-order-invoice-pay-sandbox.ts)

## 6. Playbook Changes
Updated existing artifacts. No new trusted standard or playbook created.

Changed files:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [trusted-standards/create-order-invoice-and-register-payment.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-order-invoice-and-register-payment.md)
- [task-playbooks/create-order-invoice-and-register-payment.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-order-invoice-and-register-payment.md)

What changed:
- Clarified that the canonical exact path is still 6 calls.
- Clarified that proactive `/ledger/account` is only a situational hedge, not the default exact-match flow.
- Added the efficiency pitfall explicitly so future agents do not auto-upgrade the hedge into a seventh default call.

## 7. Commit
- Commit: `3e48846dc94bf091695e9d8222b66785d3cf10bb`
- Message: `tripletex playbook: clarify canonical order invoice payment path`

## 8. Reusable Heuristics
- Reuse write responses; do not pay from prompt ex-VAT totals.
- For this exact task shape, default to 6 calls, not 7.
- Do not add `GET /order/{id}` just because `POST /order` echoes empty `orderLines`.
- Do not reject a valid payment type just because `creditAccount` is `null`; prefer `19xx` debit accounts, especially bank/invoice accounts.
- Keep `/ledger/account` as a repair or explicit hedge branch only.
- When scripting against provided base URLs, never build request URLs in a way that can drop a required path prefix like `/v2`.