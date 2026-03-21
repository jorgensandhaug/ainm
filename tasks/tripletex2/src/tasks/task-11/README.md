# Create order, invoice, and register payment

Canonical task surface: `task.ts`

Current strategies:

- `strategies/order-invoice-combined-payment.ts` keeps the older split-tail baseline: create the invoice first, then resolve payment type, then pay the live outstanding amount with a separate write.
- `strategies/order-invoice-prepaid.ts` is the current research challenger aligned to the trusted exact-match frontier: resolve payment type before invoicing and settle during `PUT /order/{id}/:invoice`.

Key research notes:

- The documented exact-match frontier for Task 11 is a 5-call path when direct product-number resolution succeeds and no bank-account repair is needed.
- Keep `/ledger/account` as a conditional repair branch for the missing-company-bank-account `422`, not as a default preflight hedge.
- Use `research/proofs/task-11/task-11-proof-input.json` and the Task 11 verification plan in `src/research/verification-plan.ts` when verifying challengers through the research OS.
