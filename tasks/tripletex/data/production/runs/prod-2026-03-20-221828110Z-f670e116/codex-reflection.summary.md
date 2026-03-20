# 1. Task

Set fixed price `316000 NOK` on project `Automatiseringsprosjekt` for `Sjøbris AS` (`825338756`), keep project manager `Knut Kvamme <knut.kvamme@example.org>`, and invoice `50%` of the fixed price as an unsent partial billing.

# 2. Reflection

What went well:
- The run was correct. Final production state matched the prompt: project fixed price updated, partial invoice created, no extra verification reads, no extra customer or employee lookups.
- The script followed the exact trusted-standard shape first: project-first resolver, conditional project update, VAT lookup, order create, invoice write.
- The `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` resolver was effective. The production call count `8` implies the initial project read already proved the exact project, linked customer, and linked manager, so no separate `GET /customer` or `GET /employee` was burned.
- The run also avoided the known wasted `GET /invoice/{id}` verification call.

What went poorly:
- The first `PUT /order/{id}/:invoice` was optimistic and hit the known bank-account prerequisite failure. That added one avoidable `422` and one avoidable extra API call versus the best path for this exact production state.
- The run therefore finished on the reactive-repair branch instead of the lower-call proactive hedge branch for a fresh-account first-outgoing-invoice state.

Correct approach for this exact production state:
- Because the project existed and needed a real `PUT /project`, the base branch was `5` calls.
- Because the company invoice bank account was missing, the minimal realistic path was the proactive hedge branch: `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `GET /ledger/account` -> `PUT /ledger/account/{id}` -> `PUT /order/{id}/:invoice`.
- The actual run instead did the same path plus one failed invoice attempt before the account repair.

# 3. Call Efficiency

The run was not minimal-call for its exact production state.

Actual production path:
1. `GET /project?name=Automatiseringsprosjekt&count=50&fields=*,customer(*),projectManager(*)`
2. `PUT /project/{id}`
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
4. `POST /order`
5. failed `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`
6. `GET /ledger/account?isBankAccount=true&fields=*`
7. `PUT /ledger/account/{id}`
8. retry `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`

Wasted calls:
- One wasted call: the first failed `PUT /order/{id}/:invoice`.

Lower-call replacement for the same exact production state:
1. `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)`
2. `PUT /project/{id}`
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
4. `POST /order`
5. `GET /ledger/account?isBankAccount=true&fields=*`
6. `PUT /ledger/account/{id}`
7. `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`

Minimality verdict:
- Exact production state: `7` calls was realistic minimum.
- Actual run: `8` calls.
- Delta: `+1` call and `+1` avoidable `422`.

# 4. Root Causes

- The trusted-standard family already had conflicting same-day evidence: one production run (`Tindra AS`) proved proactive `/ledger/account` can be wasted, while this run proved reactive recovery can also be worse. The branch was still under-specified.
- The run defaulted to the optimistic `5`-call update branch even though the account context was a fresh production account and this was likely the first outgoing invoice.
- The real decision on this task family is not “always optimistic” or “always hedge”; it is a concrete tradeoff:
  - optimistic branch: `5` calls when configured, `8` when missing
  - proactive hedge branch: `6` calls when configured, `7` when missing
- For this exact run, the hedge would have been better because the company invoice bank account was in fact missing.

# 5. Sandbox Verification

Persistent sandbox proof used script:
- `/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-221828110Z-f670e116/scripts/sandbox-proof-fixed-price-partial.ts`

Proved facts:
- Sandbox invoice account `1920` was already configured:
  - `id=424190862`
  - `isInvoiceAccount=true`
  - `bankAccountNumber=12345678903`
- Sandbox outgoing VAT on `2026-03-20` still exposed only:
  - `vatType.id=6`
  - `percentage=0`
- Measured configured-account update-needed branch:
  - `5` calls
  - invoice `2147551103`
  - `amountExcludingVatCurrency=158000`
  - `amountCurrencyOutstanding=158000`
- Measured configured-account skip-`PUT /project` branch:
  - `4` calls
  - invoice `2147551105`
  - `amountExcludingVatCurrency=158000`
  - `amountCurrencyOutstanding=158000`

What this proves:
- The existing `4`-call and `5`-call configured-account branches are still correct.
- The production miss was not a bad project resolver or bad VAT logic.
- The only missed optimization on the exact production state was the bank-account strategy choice.

# 6. Playbook Changes

Updated existing files. No new trusted standard or playbook was created.

Direct updates for this reflection:
- `./AGENTS.md`
- `./trusted-standards/common-endpoints.md`
- `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md`
- `./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`

What changed:
- Added the exact `Sjøbris AS` production miss.
- Documented the explicit tradeoff on the update-needed fixed-price partial-billing branch:
  - optimistic `5/8`
  - proactive hedge `6/7`
- Recorded the new same-day sandbox proof that the configured-account update branch still measures `5` calls and the skip-`PUT` branch still measures `4`.
- Tightened the guidance so future agents choose the bank-account strategy deliberately from run evidence instead of by habit.

Commit also included already-staged documentation paths from the dirty index:
- `./task-playbooks/create-customer-invoice.md`
- `./task-playbooks/create-project.md`
- `./task-playbooks/create-supplier.md`
- `./trusted-standards/create-customer-invoice.md`
- `./trusted-standards/create-project.md`
- `./trusted-standards/create-supplier.md`

# 7. Commit

- Commit hash: `44f6305`
- Commit message: `tripletex playbook: capture fixed-price bank-account tradeoff`

# 8. Reusable Heuristics

- For exact project-first fixed-price partial-billing tasks, let the first `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` do as much work as possible. It can eliminate both `GET /customer` and `GET /employee`, and sometimes `PUT /project`.
- If that project read already proves the target fixed price and manager, the winning branch is still `4` calls: `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`.
- If the project exists but still needs the fixed-price update, the configured-account branch is still `5` calls.
- On that exact update-needed branch, think in payoff pairs, not slogans:
  - optimistic `5/8`
  - proactive hedge `6/7`
- Use the hedge only when fresh-account evidence makes missing company bank account more likely than already-configured invoice account.
- If invoice creation fails with only `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`, repair `/ledger/account` and retry the same order once. Never recreate the order or project.
- Compare milestone correctness on taxable accounts against `amountExcludingVatCurrency`, not `amountCurrencyOutstanding`.
