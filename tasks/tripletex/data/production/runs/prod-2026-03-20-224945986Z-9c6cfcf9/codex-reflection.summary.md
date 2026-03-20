## 1. Task

Reflect on the scored production run for:

- create and send one customer invoice
- customer `Bergwerk GmbH` / `981122011`
- line `Datenberatung`
- amount `45150 NOK`
- explicit German no-VAT wording `ohne MwSt.`

Then verify the exact path in persistent sandbox, update the learning docs, commit the doc changes, and write this summary.

## 2. Reflection

What went well:
- The production run matched the existing trusted standard exactly.
- The scored run used the correct fresh-account branch:
  - `POST /customer`
  - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`
  - `POST /invoice`
- It reused the customer write response, did not add `GET /customer`, did not add `PUT /invoice/{id}/:send`, and did not need the bank-account repair branch.
- The invoice write response already proved correctness: `amountExcludingVatCurrency=45150`, `amountCurrency=45150`.

What went poorly:
- I did not have explicit German `ohne MwSt.` evidence recorded in the create-and-send docs before this run; the run succeeded because the broader no-VAT standard was already right, but the language normalization proof was missing.
- The reflection commit was made in a dirty repo and accidentally captured two already-staged register-payment doc hunks unrelated to this exact task.

Correct approach:
- Treat German `ohne MwSt.` as the same explicit no-VAT branch as Portuguese `sem IVA`.
- Keep the scored path at 3 calls unless `POST /invoice` proves the company bank-account repair branch is needed.
- In reflection mode, check the staged set immediately before commit in a dirty worktree.

## 3. Call Efficiency

This production run was minimal-call for the exact task shape.

Wasted calls:
- None in the scored Tripletex run.

Exact lower-call path the next agent should use:
1. `POST /customer` with `name`, `organizationNumber`, `invoiceSendMethod: "MANUAL"`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
3. `POST /invoice` with default send behavior and direct line `vatType` from step 2

Why not 2 calls:
- Omitting `orderLines[].vatType` is not a realistic safe shortcut.
- The trusted standard requires resolving the actual outgoing `0%` row for the account/date instead of assuming omission is equivalent.

Avoid:
- `GET /customer` before the customer create on this fresh-account shape
- `PUT /invoice/{id}/:send`
- `GET /ledger/account` unless the first `POST /invoice` fails with missing company bank account
- hardcoded VAT ids
- omitting `orderLines[].vatType`

## 4. Root Causes

- Localization ambiguity: German `ohne MwSt.` can be misread unless explicitly documented; it is a no-VAT branch, unlike French `hors TVA` and Norwegian `eksklusiv MVA`, which belong to the taxed ex-VAT branch.
- Fresh-account discipline: the prompt only gave business identity, not proof of an existing customer, so the correct path stayed on direct customer create.
- Dirty index handling: unrelated already-staged documentation changes leaked into the reflection commit.

## 5. Sandbox Verification

Persistent sandbox proof used only sandbox credentials and a TypeScript `bun` script in the run scripts directory.

Verified path:
1. `POST /customer` for `Bergwerk Reflection 999518478 GmbH` / `999518478`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
3. `POST /invoice`

Sandbox result:
- `vatRows=[{ id: 6, percentage: 0 }]`
- chosen `vatTypeId=6`
- `invoiceId=2147553223`
- `invoiceNumber=177`
- `amountExcludingVatCurrency=45150`
- `amountCurrency=45150`

This proved the exact German no-VAT branch still works in 3 calls with no customer pre-read, no bank-account repair, and no explicit send call.

## 6. Playbook Changes

Updated existing docs, no new trusted standard or playbook created.

Intended task-specific updates:
- `trusted-standards/create-and-send-customer-invoice.md`
- `task-playbooks/create-and-send-customer-invoice.md`

What changed:
- Added explicit German `ohne MwSt.` normalization to the no-VAT create-and-send branch.
- Added the exact production proof for `Bergwerk GmbH`.
- Added the exact persistent-sandbox analog proof showing the same 3-call floor.

No AGENTS update was needed from this reflection because `AGENTS.md` already contained the German no-VAT guidance in `HEAD`.

Commit contamination:
- The commit also captured already-staged unrelated doc updates in:
  - `trusted-standards/register-customer-invoice-payment.md`
  - `task-playbooks/register-customer-invoice-payment.md`

## 7. Commit

Git commit:
- `6f65e0d0d111df0ee53bfb4aed200d9e755e702e`
- `tripletex playbook: record german no-vat invoice path`

Note:
- That commit includes the intended create-and-send invoice doc updates plus two unrelated already-staged register-payment doc hunks from the dirty worktree.

## 8. Reusable Heuristics

- Normalize `ohne MwSt.` to the explicit `0%` invoice branch.
- Do not normalize `hors TVA` or `eksklusiv MVA` to `0%`; those belong to the taxed ex-VAT branch.
- For fresh-account create-and-send prompts with only `name + organizationNumber`, do not spend `GET /customer` first.
- Even for explicit no-VAT direct lines, still resolve the filtered outgoing VAT row with `GET /ledger/vatType?...&fields=*`.
- For create-and-send tasks, default send is the invoice create itself; do not split into create-then-send unless the prompt explicitly requires it.
- In reflection mode on a dirty repo, inspect the staged file list immediately before commit.