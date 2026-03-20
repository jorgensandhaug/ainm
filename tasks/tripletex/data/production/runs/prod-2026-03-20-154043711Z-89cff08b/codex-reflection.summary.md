## 1. Task

Post-run learning pass for the production task: create and send one invoice to `Ironbridge Ltd` (`841254546`) for `28500 NOK` excluding VAT, line `System Development`, then update the Tripletex learning artifacts and commit the changes.

## 2. Reflection

What went well:
- The production run used the correct send path: `POST /customer` with `invoiceSendMethod: "MANUAL"` and then `POST /invoice` with default `sendToCustomer=true`.
- The production run resolved outgoing VAT dynamically and got a valid taxable VAT type in production (`vatTypeId=3`, `25%`), so the final invoice had the correct totals (`28500` ex VAT, `35625` incl VAT).
- No bank-account repair branch was needed and no `4xx` errors were triggered in production.

What went poorly:
- I still spent local time re-reading `openapi.json` even though the task was an exact trusted-standard match. That did not cost API calls, but it was still wasted scored-run time.
- I had not previously proven whether omitting direct-line `vatType` was a valid lower-call optimization, so the trusted standard was missing an explicit warning for that trap.
- My production script included a conditional duplicate-customer recovery read. It did not fire, so it did not hurt the run, but it was unnecessary complexity for the fresh-account default path.

Correct approach:
- For this exact fresh-account create-and-send shape, the right path is still: create customer, resolve filtered outgoing VAT on the invoice date, create invoice and let the create perform the send.

## 3. Call Efficiency

The production run was minimal-call for perfect correctness on this task shape.

Production API calls used:
- `POST /customer`
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
- `POST /invoice`

Wasted production API calls:
- None.

Tempting lower-call path that should not be used:
- `POST /customer`
- `POST /invoice` without `orderLines[].vatType`

Why that lower-call path is wrong:
- Sandbox proved that omitting line `vatType` can succeed while silently producing a no-VAT invoice.
- Sandbox also proved that hardcoding `vatType.id=3` is unsafe because some accounts only expose code `6` and reject `3` with `422`.

Exact lower-call path the next agent should follow:
- There is no lower-call safe replacement for this exact taxable-service shape.
- Next agent should still use exactly:
  1. `POST /customer` with `name`, `organizationNumber`, `invoiceSendMethod: "MANUAL"`
  2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
  3. `POST /invoice`

## 4. Root Causes

- Missing prior proof for the direct-line VAT omission case. The docs warned against hardcoding VAT code `3`, but they did not explicitly warn that omitting `vatType` can also be wrong.
- Over-caution on spec-checking. I treated an exact trusted-standard match as if it still needed broader schema confirmation.
- Ambiguity around “excluding VAT”. The prompt did not name `25%`, so a future agent might try to save one call by letting Tripletex infer VAT. Sandbox showed that this is not safe.

## 5. Sandbox Verification

Persistent sandbox used:
- base URL `https://kkpqfuj-amager.tripletex.dev/v2`
- sandbox-only Bun script in run dir: `scripts/sandbox_verify_create_send_invoice.ts`

What I proved:
- `POST /customer` with `invoiceSendMethod: "MANUAL"` succeeded.
- `POST /invoice` without line `vatType` succeeded, but produced:
  - `amountExcludingVatCurrency=28500`
  - `amountCurrency=28500`
  - meaning the invoice was created with no VAT.
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` with `0%`.
- `POST /invoice` with the dynamically resolved code `6` also produced a no-VAT invoice, which is consistent with that sandbox account’s available outgoing VAT setup.
- `POST /invoice` with hardcoded `vatType.id=3` failed with:
  - `422`
  - `... Ugyldig mva-kode.`

Conclusion from sandbox:
- Omitting `vatType` is not a safe optimization.
- Hardcoding `3` is not a safe optimization.
- The filtered outgoing VAT lookup remains the minimum safe path for direct taxable-service invoice lines.

## 6. Playbook Changes

Updated existing files:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `trusted-standards/create-and-send-customer-invoice.md`
- `task-playbooks/create-and-send-customer-invoice.md`

What changed:
- Added an explicit rule that direct invoice lines without a product must not omit `orderLines[].vatType` to save a call when the prompt implies taxable service.
- Added sandbox proof that omission can succeed and still create a no-VAT invoice.
- Added sandbox proof that hardcoded `vatType.id=3` can fail with `422` when the account only exposes VAT code `6`.
- Clarified that the minimum safe path for this create-and-send invoice shape remains customer create/read, filtered outgoing VAT read, invoice write.

No new trusted standard or playbook was created.

## 7. Commit

Commit hash:
- `50a1a0b`

Commit message:
- `tripletex playbook: tighten create-and-send invoice VAT guidance`

## 8. Reusable Heuristics

- Trust an exact trusted standard; do not spend scored-run time re-reading broad schema sections unless the standard says to confirm something.
- For create-and-send customer invoices, prefer `POST /invoice` with default `sendToCustomer=true`; do not split create and send unless the prompt explicitly requires it.
- For new customers with no email/address in this task shape, use `invoiceSendMethod: "MANUAL"` on customer create.
- For direct invoice lines without a product, do not omit `vatType` as a call-saving shortcut when the prompt implies taxable service.
- Do not hardcode outgoing VAT code `3`; always use the filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` result.
- A successful write is not always a correct write; if a lower-call variant can silently change VAT behavior, it is not actually the minimal safe path.