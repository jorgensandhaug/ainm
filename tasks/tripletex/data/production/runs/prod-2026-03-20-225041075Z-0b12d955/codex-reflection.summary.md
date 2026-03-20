## 1. Task
Post-run learning pass for the scored Tripletex task: register full payment on the existing customer invoice for `Luz do Sol Lda` (`939210970`), located by ex-VAT amount `23900` and line text `Manutenção`.

## 2. Reflection
The scored run went well. It matched the existing exact trusted standard, used the canonical locate -> payment-type -> pay flow, and finished with the correct side effect.

What went poorly: nothing on the production API path. The only weak point was outside the scored run: my first sandbox candidate scan double-counted the same invoice text because Tripletex can expose the same description in both top-level `orderLines[]` and nested `orders[].orderLines[]`. That was a reflection-time probing issue, not a scored-run issue.

Correct approach for this task shape remained:
`GET /invoice?...fields=*` -> `GET /invoice/paymentType?...fields=*` -> `PUT /invoice/{id}/:payment?...paidAmount=<live outstanding>`.

## 3. Call Efficiency
The scored run was minimal-call for a standalone exact-match payment task with no same-run cached `paymentTypeId`.

Calls used:
1. `GET /invoice?...` located invoice `2147540727`
2. `GET /invoice/paymentType?...` resolved `paymentTypeId=27116469`
3. `PUT /invoice/2147540727/:payment?paymentDate=2026-03-20&paymentTypeId=27116469&paidAmount=29875`

Wasted calls: none.

Lower-call path for next agent:
- Same exact 3-call path above.
- Only valid 2-call variant: same run already holds a proven reusable incoming `paymentTypeId` for the same company/currency.

## 4. Root Causes
Why this run stayed correct:
- I trusted the exact trusted standard instead of re-opening `openapi.json`.
- I used the prompt amount only as locator, not as payment amount.
- I reused the invoice read for both identification and `paidAmount`.
- I avoided speculative `GET /customer` and avoided a verification `GET /invoice/{id}`.

Main pitfalls to avoid:
- Do not pay the prompt’s ex-VAT amount `23900`; the live outstanding was `29875`.
- Do not guess or reuse a cross-run `paymentTypeId`.
- Do not add `GET /customer`; org number + ex-VAT amount + line text is enough in fresh-account production.
- Do not add `GET /invoice/{id}` after the payment write if the write response already shows zero remaining outstanding.

## 5. Sandbox Verification
I proved the same path in the persistent sandbox with a real payment on analog invoice `2147551798` for customer `841254546`, ex-VAT amount `28500`, line text `System Development`.

Sandbox proof:
1. `GET /invoice?...fields=*` located the exact unpaid invoice.
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` resolved incoming bank payment type `32813748`.
3. `PUT /invoice/2147551798/:payment?paymentDate=2026-03-20&paymentTypeId=32813748&paidAmount=28500` returned `remainingOutstanding=0`.

This re-confirmed no public 2-call shortcut from prompt facts alone when no same-run cached `paymentTypeId` exists.

## 6. Playbook Changes
Updated existing artifacts; created nothing new.

Changed paths:
- `tasks/tripletex/codex-environment/trusted-standards/register-customer-invoice-payment.md`
- `tasks/tripletex/codex-environment/task-playbooks/register-customer-invoice-payment.md`

What changed:
- Added an explicit floor statement: without same-run cached `paymentTypeId`, standalone exact-match invoice payment still has no proven public 2-call shortcut.
- Preserved the existing canonical 3-call path.

`AGENTS.md` needed no new change because this task-family evidence was already present in `HEAD`.

## 7. Commit
Commit hash: `42b85dc`

Commit message:
`tripletex playbook: tighten customer invoice payment floor`

## 8. Reusable Heuristics
- For exact customer-invoice payment tasks, first try one decisive `GET /invoice` with wide date bounds and `fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`.
- Match locally on `customer.organizationNumber`, `amountExcludingVatCurrency|amountExcludingVat`, positive `amountCurrencyOutstanding|amountOutstanding`, and line text across both top-level and nested order lines.
- Resolve payment type once from `GET /invoice/paymentType`; prefer debit account `19xx`, especially `isBankAccount=true` or `isInvoiceAccount=true`.
- `paymentType.name` may be `null`; `creditAccount` may be `null`; neither disqualifies a valid incoming bank payment type.
- Verify from the payment write response only; if remaining outstanding is `0`, stop.