## 1. Task

Post-run learning pass for the scored Tripletex run that created and sent an invoice to `Snøhetta AS` (`871844062`) for `Webdesign`, `20100` NOK excluding VAT.

## 2. Reflection

What went well:
- The run matched the existing trusted standard exactly.
- The execution used the correct fresh-account branch: direct `POST /customer`, one filtered VAT read, then `POST /invoice`.
- It reused write responses and avoided all avoidable `4xx` errors.
- Final state was correct: `amountExcludingVatCurrency=20100`, `amountCurrency=25125`, invoice sent in the create call.

What went poorly:
- The docs did not state explicitly enough that this exact prompt shape requires selecting an exact `25%` VAT row from the filtered outgoing VAT result.
- The existing wording was strong about “do not omit `vatType`” and “do not hardcode `3`”, but weaker about “do not accept `0%` when the prompt clearly says excluding VAT for an ordinary service”.
- My local repair-branch helper had a dead reuse condition for an existing bank-account number. It did not affect the run because that branch was never used, but it was still sloppy.

Correct approach:
- For ordinary direct-service prompts explicitly priced excluding VAT / MVA, the canonical path is still `POST /customer` -> filtered `GET /ledger/vatType` -> `POST /invoice`, but the VAT selector must require an exact `25%` row.
- If the filtered outgoing VAT read exposes only `0%`, the correct conclusion is blocked-in-that-account, not “send a 0% invoice”.

## 3. Call Efficiency

The scored run was minimal-call for this exact task shape.

Calls used:
1. `POST /customer`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
3. `POST /invoice`

Wasted calls:
- None.

Lower-call path for the next agent:
- The same 3-call path.
- There is no realistic 2-call safe replacement for this prompt shape.
- Omitting `vatType` is not a safe reduction.
- Hardcoding `vatType.id=3` is not a safe reduction.
- Adding `GET /customer` first is waste.
- Adding `PUT /invoice/{id}/:send` after create is waste and can be worse than waste.

## 4. Root Causes

- Documentation gap: the standard-VAT branch was implicit, not explicit.
- Sandbox/account variance: persistent sandbox still exposes only outgoing VAT code `6` (`0%`) on the test date, while the scored production account exposed a valid `25%` row.
- This variance means “pick the first filtered VAT row” is unsafe even when the filtered read itself is correct.

## 5. Sandbox Verification

Sandbox base URL used: `https://kkpqfuj-amager.tripletex.dev/v2`

Verified findings:
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` with `percentage=0`.
- Creating the same direct-service invoice shape without `orderLines[].vatType` succeeded but produced `amountExcludingVatCurrency=20100` and `amountCurrency=20100`, proving the fake-optimization failure.
- Hardcoding `orderLines[].vatType.id=3` failed with `422` and `Ugyldig mva-kode.`

Interpretation:
- The sandbox could not re-prove the taxed `25%` branch directly because the account does not expose a `25%` outgoing VAT row on that date.
- It did prove the important negative branch: omit-`vatType` and hardcoded-`3` are both wrong.
- The production run itself proved the positive branch: the exact `Snøhetta AS` task succeeded with the canonical 3 calls and returned `25125` including VAT.

## 6. Playbook Changes

Updated existing files:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `trusted-standards/create-and-send-customer-invoice.md`
- `task-playbooks/create-and-send-customer-invoice.md`

What changed:
- Added an explicit rule that ordinary direct-line service prompts priced excluding VAT / MVA must select an exact `25%` row from the filtered outgoing VAT read.
- Added the blocked-account rule when that filtered read exposes only `0%`.
- Added the exact production proof for `Snøhetta AS` / `871844062` / `Webdesign` / `20100`.
- Added the matching persistent-sandbox proof that omit-`vatType` creates a wrong `0%` invoice and hardcoded `3` still fails.

No new trusted standard or playbook was created.

## 7. Commit

Commit hash:
- `517f54118aba3f2989ce94a21d3b2e637627e54d`

Commit message:
- `tripletex playbook: clarify standard-vat create-and-send invoice path`

## 8. Reusable Heuristics

- If the prompt is an ordinary service explicitly priced excluding VAT / MVA, require exact `25%` from the filtered outgoing VAT read.
- If the filtered outgoing VAT read only exposes `0%`, stop as blocked for that account; do not silently downgrade the invoice to `0%`.
- For fresh-account create-and-send prompts with only customer `name + organizationNumber`, do not pre-read the customer.
- For direct service lines, never omit `orderLines[].vatType` to save a call.
- Never hardcode `vatType.id=3`.
- Let `POST /invoice` do the send; do not split into create-then-send unless the prompt explicitly requires a separate send step or send-channel override.