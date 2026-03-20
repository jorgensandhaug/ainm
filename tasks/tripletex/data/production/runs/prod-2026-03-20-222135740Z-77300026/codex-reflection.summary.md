## Task
Post-run learning pass for the production task: set fixed price `430750` on project `Automatiseringsprosjekt` for `Fossekraft AS` (`907433498`), with project manager `solveig.eide@example.org`, then invoice `50%` as an unsent partial billing.

## Reflection
The original run went well. It matched the trusted standard exactly, reused the initial expanded `GET /project` to avoid separate customer and employee reads, skipped `PUT /project` because the existing row already proved the target fixed-price + manager state, and stopped after the successful invoice write.

What was still uncertain after the run was whether a lower-call shortcut than the used `4` calls existed on a taxable account. The production result itself strongly suggested no, because the account exposed `25%` VAT and the invoice write returned `amountExcludingVatCurrency=215375` and `amountCurrencyOutstanding=269218.75`. Post-run proof confirmed that the run already used the true minimum.

## Call Efficiency
The production run was minimal-call for that exact task shape.

Wasted calls: none.

Exact lower-call path for the next agent:
1. `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`
3. `POST /order`
4. `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`

Why no realistic `3`-call path exists:
- Removing the initial `GET /project` removes the proof that the exact existing project, linked customer, linked manager, and target `fixedprice` already match, so skipping `PUT /project` becomes unjustified.
- Removing `GET /ledger/vatType` risks silently writing the wrong VAT on taxable accounts.

## Root Causes
The main historical waste pattern in this task family is not this run; it is future-agent temptation to over-read or over-write.

Specific root causes of waste/4xx risk:
- Blind `PUT /project` even when the initial expanded project row already proves the target state.
- Separate `GET /customer` and `GET /employee` even when the same project read already proves nested `customer.id` and `projectManager.id`.
- Trying to invent a `3`-call shortcut by omitting either the project resolver or the filtered VAT read.
- Unconditional `GET /ledger/account` hedge before the first invoice write, even when the configured-account branch is more likely.
- Checking milestone correctness against `amountCurrencyOutstanding` instead of `amountExcludingVatCurrency` on taxable accounts.

## Sandbox Verification
Persistent sandbox proof used only sandbox credentials and only scripts in the run script directory.

Proof result:
- Existing fixture used: project `401969688` (`Desarrollo e-commerce`, customer `816896770`).
- Script confirmed the skip-`PUT /project` branch in exactly `4` calls.
- Output: `invoiceId=2147551401`, `amountExcludingVatCurrency=123832.5`, `amountCurrencyOutstanding=123832.5`, `vatTypeId=6`.
- Sandbox still exposed only outgoing VAT `0%`, so the sandbox proof confirmed call count and branch shape, while the production run confirmed the taxable `25%` variant.

## Playbook Changes
Updated existing artifacts; no new trusted standard or playbook created. `AGENTS.md` was re-read but did not need edits.

Changed paths:
- `trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`

What changed:
- Added exact production confirmation that the `Fossekraft AS` run used the true minimal `4`-call skip-`PUT /project` path on a taxable account.
- Added explicit guidance that the skip-`PUT` branch has no safe `3`-call shortcut.
- Added sandbox analog proof reference showing the same `4`-call structure on persistent fixture `401969688`.

## Commit
Commit hash: `ac245fc`

Commit message: `tripletex playbook: confirm minimal 4-call skip-put path`

## Reusable Heuristics
- On fixed-price partial-billing prompts, start with one decisive expanded `GET /project`; let that single read decide whether customer read, employee read, and `PUT /project` can all be skipped.
- If the first project row already proves exact project + customer + manager + `fixedprice`, the canonical path is `4` calls, not `5`.
- Treat `GET /ledger/vatType` as mandatory on the skip-`PUT` branch; taxable accounts make VAT omission unsafe.
- On taxable accounts, validate the milestone against `amountExcludingVatCurrency`; `amountCurrencyOutstanding` includes VAT.
- Keep `/ledger/account` as a deliberate branch decision, not a reflex. For update-needed runs the tradeoff stays `5/8` optimistic versus `6/7` proactive hedge.