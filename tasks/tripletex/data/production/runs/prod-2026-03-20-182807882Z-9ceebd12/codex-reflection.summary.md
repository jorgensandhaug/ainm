## 1. Task

Post-run learning pass for the exact `Stockage cloud` create-product run, including reflection, call-efficiency audit, sandbox investigation, playbook/trusted-standard updates, and a git commit.

## 2. Reflection

Correctness was perfect, but the run overfit to the older “explicit VAT resolution” rule.  
The product was created correctly because the fresh production account defaulted the standard outgoing VAT as needed, so the extra VAT lookup was unnecessary.

What went well:
- Used the correct writable fields: `name`, `number`, `priceExcludingVatCurrency`.
- Reused the write response and avoided any wasteful `GET /product`.

What went poorly:
- Spent `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` before the create.
- That lookup was the wasted call that cost the half efficiency point.

Correct approach for this exact shape:
- One `POST /product` without explicit `vatType`.
- Verify from `response.value` that `priceIncludingVatCurrency` reflects standard `25%` and that Tripletex assigned a `vatType`.

## 3. Call Efficiency

This run was not minimal-call.

Wasted call:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`

Lower-call replacement path for the next agent on the same exact shape:
1. `POST /product` with `name`, `number`, `priceExcludingVatCurrency`
2. Verify from the `201` body:
   - `name`
   - `number`
   - `priceExcludingVatCurrency`
   - `priceIncludingVatCurrency == 33562.5`
   - returned `vatType`

No `GET /product`, no `GET /product/{id}`, no `openapi.json` re-check once the trusted standard already matches.

## 4. Root Causes

- I generalized the safer multi-account VAT-resolution rule to a fresh-account exact standard-`25%` create-product prompt.
- Prior sandbox knowledge was misleading here because the persistent sandbox defaults omitted-`vatType` creates to `0%`, not `25%`.
- I treated “exact VAT” as always requiring explicit resolution, instead of separating standard fresh-account `25%` from non-standard or account-dependent VAT shapes.

## 5. Sandbox Verification

Used only sandbox credentials.

Findings:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT `id=6`, `0%`.
- `POST /product` without `vatType` succeeded and auto-filled VAT `id=6`.
- That write response showed `priceIncludingVatCurrency == priceExcludingVatCurrency`, proving the inherited VAT default is account-dependent.

Conclusion:
- Persistent sandbox does prove the omitted-`vatType` shortcut exists.
- It also proves that the inherited VAT value is not portable across accounts.
- Therefore the 1-call shortcut must stay narrowly scoped to the exact fresh-account standard-`25%` product-create shape confirmed by scoring feedback.

## 6. Playbook Changes

Updated existing artifacts; created no new files.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/create-product.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-product.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [task-playbooks/create-product.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-product.md)

What changed:
- Replaced the claimed 2-call winning path with the scoring-correct 1-call path for the exact fresh-account standard-`25%` product-create shape.
- Kept filtered `OUTGOING` VAT lookup as the fallback for exact `0%`, reduced-rate, and other non-standard VAT tasks.
- Added the sandbox warning that omitted `vatType` can auto-fill `0%`, so the shortcut is shape-scoped, not general.

## 7. Commit

Commit hash:
- `b0c02778b9ca801d07958e105109d93819b46b96`

Commit message:
- `tripletex playbook: fix create-product winning path`

## 8. Reusable Heuristics

- For exact fresh-account create-product prompts with standard `25%` VAT, prefer one `POST /product` without explicit `vatType`.
- Verify standard `25%` from the write response, not from a pre-read.
- Do not spend `GET /ledger/vatType` on that exact shape; that was the wasted call here.
- Do use filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` for exact `0%`, reduced-rate, or otherwise non-standard VAT prompts.
- Do not hardcode VAT code `3`.
- Do not generalize persistent-sandbox default-VAT behavior to fresh production accounts.
- For pure create-product tasks, never add `GET /product` pre-reads or read-backs when the write response already proves the scored fields.