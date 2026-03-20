## 1. Task
Review the scored production run for creating and sending an invoice to `Colline SARL` (`944164340`) for `Service réseau`, `44750 NOK` `hors TVA`, audit call efficiency, verify the correct path in persistent sandbox, update the learning docs, commit the doc changes, and record the result.

## 2. Reflection
The scored run itself went well. It matched the exact trusted-standard shape, used the normal fresh-account branch, selected dynamic outgoing VAT, created the customer directly, and let `POST /invoice` do the send. It finished with the intended taxed totals and no avoidable `4xx`.

What was weak was not the execution but the documentation gap around French wording. `hors TVA` can be misread as no-VAT if the agent maps it too loosely to `sans TVA`. The correct interpretation for this task shape is ordinary taxed ex-VAT pricing, so the agent must still resolve an exact outgoing `25%` VAT row and must not downgrade to `0%`.

The correct approach for this exact shape remains:
- `POST /customer` with `name`, `organizationNumber`, `invoiceSendMethod: "MANUAL"`
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*` and select exact `25%`
- `POST /invoice` with default send behavior

## 3. Call Efficiency
The scored run was minimal-call for this exact production task shape.

Wasted calls: none.

The exact lower-call path for the next agent is the same `3`-call branch:
1. `POST /customer`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`
3. `POST /invoice`

Calls that would have been unnecessary or harmful here:
- `GET /customer` before the customer create
- `PUT /invoice/{id}/:send`
- proactive `GET /ledger/account` before a live bank-account validation failure
- skipping the VAT read by omitting `orderLines[].vatType`

If the VAT read exposes only `0%` for an ordinary `hors TVA` / excluding-VAT service prompt, the correct branch is blocked-for-that-account after the VAT read. Do not create a wrong `0%` invoice.

## 4. Root Causes
- Semantic ambiguity: French `hors TVA` looks similar to no-VAT wording but actually means excluding VAT.
- False optimization pressure: omitting `orderLines[].vatType` can reduce one call but silently creates the wrong tax outcome.
- Unsafe hardcoding: `vatType.id=3` is not portable across accounts and can fail with `422 Ugyldig mva-kode.`
- Fresh-account confusion: customer identity in the prompt is not proof that the customer already exists, so a speculative `GET /customer` would waste a call.

## 5. Sandbox Verification
Persistent sandbox investigation used `bun` script `scripts/sandbox_probe_french_ex_vat.ts`.

Verified facts:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`).
- `POST /invoice` with the `44750` line and omitted `orderLines[].vatType` succeeded but created the wrong untaxed result: `amountExcludingVatCurrency=44750`, `amountCurrency=44750`.
- `POST /invoice` with hardcoded `vatType.id=3` failed with `422` and `Ugyldig mva-kode.`
- `POST /invoice` with resolved `vatType.id=6` also created `44750` / `44750`, proving that a `0%` fallback would be wrong for this taxed prompt.

So the sandbox proof supports two conclusions:
- there is no safe `2`-call shortcut for this exact taxed direct-line shape
- when an account exposes only `0%`, the correct behavior for `hors TVA` is to stop as blocked rather than downgrade the invoice to no-VAT

## 6. Playbook Changes
Updated existing files:
- `trusted-standards/create-and-send-customer-invoice.md`
- `task-playbooks/create-and-send-customer-invoice.md`

Changes made:
- added an explicit note that French `hors TVA` belongs to the taxed ex-VAT branch, not the no-VAT branch
- added the exact production proof from `Colline SARL` / `944164340` / `Service réseau` / `44750`
- added the matching sandbox proof that omission creates a wrong untaxed invoice and hardcoded VAT `3` fails

No new trusted standard or playbook was created.

## 7. Commit
Commit hash: `ac82c2b31fb9a50b6be77db73f1c3661e5a73391`

Commit message: `tripletex playbook: clarify french ex-vat send-invoice path`

## 8. Reusable Heuristics
- Treat `hors TVA`, `excluding VAT`, `ex VAT`, and `ekskl. mva` as taxed-price wording unless the prompt explicitly says no-VAT.
- For fresh-account create-and-send invoice prompts with only `name + organizationNumber`, default to direct `POST /customer`; do not pre-read the customer.
- For direct service lines, resolve VAT dynamically from filtered outgoing VAT on the invoice date; do not hardcode VAT code `3`.
- A successful invoice write without explicit `vatType` is not proof of correct VAT.
- Use `POST /invoice` default send behavior as the send step; do not split into create-then-`:send` unless the prompt requires it.