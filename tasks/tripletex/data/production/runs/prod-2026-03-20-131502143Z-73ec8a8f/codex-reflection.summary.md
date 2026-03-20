## 1. Task

Post-run learning pass for production run `prod-2026-03-20-131502143Z-73ec8a8f`: reflect, verify correct path in sandbox, update playbook docs, commit only `AGENTS.md` and playbook changes, then summarize.

## 2. Reflection

What went well:
- Core project flow was correct: resolve PM, resolve/create customer, resolve/create project, set `isFixedPrice=true` + `fixedprice`, resolve filtered outgoing VAT, create one real project-linked order line, invoice without sending.
- Recovery after failure reused the existing order id instead of creating a second order.

What went poorly:
- Initial run missed the late invoice-stage bank-account prerequisite branch.
- That caused one avoidable `422` on `PUT /order/{id}/:invoice`.
- Recovery was done in a second script instead of being built into the original winning path.

Mistakes:
- I assumed the fixed-price project playbook already covered invoice-bank-account repair. It did not.
- I did not propagate an existing heuristic from invoice playbooks into the fixed-price project playbook before execution.
- I treated the task-specific playbook as complete instead of checking adjacent invoice playbooks for known late-step failures.

Correct approach:
- Do not pre-read `/ledger/account`.
- First try `PUT /order/{id}/:invoice?...sendToCustomer=false`.
- If and only if that returns `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`, do:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - choose existing invoice account, usually `1920` / `isInvoiceAccount=true`
  - `PUT /ledger/account/{id}` with valid unique 11-digit `bankAccountNumber`
  - retry the same order invoice once

## 3. Root Causes

- Playbook gap: `task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md` lacked the conditional `/ledger/account` repair branch.
- Heuristic propagation gap: bank-account repair already existed in invoice playbooks, but not in this related multi-step project flow.
- Planning gap: I optimized the main path correctly, but not the highest-probability late failure branch after order creation.
- Execution consequence: one wasted `422`, then extra recovery work outside the original runner.

## 4. Sandbox Verification

Used sandbox credentials only.

Verified with `bun` script in the run scripts dir:
- created sandbox customer
- created fixed-price project
- created project-linked order with one partial-billing line
- invoiced successfully on the same order
- verified invoice linked back to the project

Observed sandbox result:
- `bankRepairTriggered=false`
- invoice account was already configured:
  - account `1920`
  - `bankAccountNumber=12345678903`
- created order `401957008`
- created invoice `2147526076`
- `amountExcludingVatCurrency=250`
- `amountCurrencyOutstanding=250`
- `linkedProjectId=401957006`

Conclusion:
- Current persistent sandbox state proved the normal fixed-price partial-billing flow.
- The missing-bank-account `422` did not naturally reproduce there because sandbox account `1920` was already configured.
- Production run remains the direct proof for the conditional repair branch.

## 5. Playbook Changes

Updated existing playbook. Created no new playbook.

Changed paths:
- `AGENTS.md`
- `task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`

What changed:
- strengthened shared gotcha in `AGENTS.md` with exact conditional repair flow for `PUT /order/{id}/:invoice` bank-account failure
- clarified in the fixed-price project playbook that `/ledger/account` must remain conditional, not part of default fast path
- tightened repair instruction to use a valid unique 11-digit `bankAccountNumber`
- reinforced recovery rule: retry same order id, do not recreate project/order after that late invoice failure

## 6. Commit

Commit hash:
- `8ede548ac55ebb015a602a338f4627681992a10e`

Commit message:
- `tripletex playbook: add bank-account recovery for fixed-price invoicing`

## 7. Reusable Heuristics

- For invoice-capable flows, do not insert unconditional `/ledger/account` reads before the first invoice write.
- If invoice creation fails only because company bank account is missing, repair `/ledger/account` and resume from the already-created order/invoice candidate.
- When a playbook covers a specialized invoice flow, cross-check neighboring invoice playbooks for known late-stage prerequisites before execution.
- Treat `422` validation text as routing info for one precise correction, not as a reason to restart the whole workflow.
- When a late failure happens after object creation, default to “resume from latest created id” unless the error proves the object itself is invalid.