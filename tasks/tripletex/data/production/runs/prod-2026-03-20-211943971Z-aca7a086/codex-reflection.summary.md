## 1. Task

Post-run learning pass for the scored Tripletex run that created and sent a no-VAT customer invoice for `Porto Alegre Lda` (`842889154`) for `11200 NOK` with line text `Consultoria de dados`.

## 2. Reflection

The production run went well. It matched the existing trusted standard exactly, used the correct fresh-account branch, and finished with the intended state: customer created, invoice created/sent, no VAT applied, no fallback branch needed.

Nothing went poorly in execution. The only gap was documentation specificity: the system already covered the generic one-line no-VAT create-and-send path, but it did not explicitly say that Portuguese wording like `sem IVA` should stay on the same 3-call branch. That is a small but real ambiguity source for future agents.

The correct approach was:
- `POST /customer` with `invoiceSendMethod: "MANUAL"`
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
- `POST /invoice` with default `sendToCustomer=true`

## 3. Call Efficiency

This run was minimal-call for the exact task shape.

There were no wasted calls.

Exact lower-call path for the next agent:
1. `POST /customer` with `name`, `organizationNumber`, `invoiceSendMethod: "MANUAL"`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
3. `POST /invoice` with one direct order line and explicit `vatType` from step 2

Why 3 calls is the floor:
- customer must be created in the normal fresh-account variant
- the VAT read is still required because omitting `orderLines[].vatType` is not trusted, and hardcoding VAT ids is unsafe
- invoice creation/send is the final required write

Conditional branch only if needed:
- `GET /ledger/account?isBankAccount=true&fields=*`
- `PUT /ledger/account/{id}`
- retry the same `POST /invoice`

## 4. Root Causes

There was no production mistake. The main future failure risks for this shape are heuristic mistakes:

- Misreading `create/send invoice to customer <name> (<org>)` as proof the customer already exists, which wastes a `GET /customer`.
- Treating localized wording like Portuguese `sem IVA` as a special case needing a different flow.
- Splitting send into `POST /invoice?sendToCustomer=false` plus `PUT /invoice/{id}/:send`, which adds a call and can hit known send-channel failures.
- Omitting `orderLines[].vatType` to save the VAT lookup, which can silently create the wrong VAT outcome on other accounts.

## 5. Sandbox Verification

I proved the path in persistent sandbox using only sandbox credentials and a sandbox-only script in the run scripts directory.

Analogous sandbox proof shape:
- customer: `Porto Alegre Lda`
- org: `842889155`
- line: `Consultoria de dados`
- amount: `11200`
- no VAT

Sandbox result:
- `POST /customer` succeeded
- filtered outgoing VAT read returned `vatTypeId=6`, `percentage=0`
- `POST /invoice` succeeded with `invoiceNumber=143`
- write response proved `amountExcludingVatCurrency=11200` and `amountCurrency=11200`

This reconfirmed the same 3-call path with no customer pre-read and no explicit `:send` call.

## 6. Playbook Changes

Updated existing files. No new trusted standard or playbook created.

Changed paths:
- `trusted-standards/create-and-send-customer-invoice.md`
- `task-playbooks/create-and-send-customer-invoice.md`

What changed:
- added production+sandbox proof that Portuguese `sem IVA` still uses the same exact 3-call fresh-account branch
- clarified that this localized wording must not trigger an unnecessary existing-customer lookup
- recorded the exact `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` proof outcome

## 7. Commit

Commit hash: `47b157368679c812b998d9afbbb384c34894f701`

Commit message: `tripletex playbook: refine create-and-send no-vat invoice path`

## 8. Reusable Heuristics

- If the prompt is exact fresh-account `name + organizationNumber + one direct line + create and send`, default to direct customer create, not customer lookup.
- For create-and-send invoice tasks, `POST /invoice` is usually the send step. Do not add `PUT /invoice/{id}/:send` unless the prompt explicitly requires a send override.
- For explicit no-VAT direct lines, still resolve filtered outgoing `0%` VAT and send it on the line.
- Prompt language is not a branching signal by itself. Portuguese `sem IVA`, German `ohne MwSt`, French `sans TVA`, etc. should stay on the same no-VAT direct-line branch unless the prompt adds new requirements.
- Reuse the write response and stop. Do not add verification reads when the invoice write already proves the intended totals.