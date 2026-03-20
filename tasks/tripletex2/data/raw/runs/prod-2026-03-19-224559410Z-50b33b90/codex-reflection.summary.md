## 1. Task

Post-run learning pass for the completed production task: reflect on the run, verify the correct path in sandbox, update the Tripletex playbook system, commit only `AGENTS.md` and playbook changes, and summarize.

## 2. Reflection

What went well:
- Production run chose the correct write endpoint: `PUT /invoice/{id}/:payment`.
- Production run reused the invoice read to pay the actual outstanding amount, not the prompt’s ex-VAT lookup amount.
- Production run verified success from the payment write response itself, with `remainingOutstanding: 0`.
- No Tripletex `4xx` errors in the production task.

What went poorly:
- I did more schema reading than necessary before writing the script.
- I introduced a local TypeScript bug by assuming `debitAccount.number`/`creditAccount.number` were strings; they were numeric in practice.
- That local bug forced a second run of the production script, wasting two successful read calls.
- The invoice-create playbook still hardcoded `vatType.id = 3`, which sandbox proved is not portable across accounts.

Correct approach:
- Use one decisive `GET /invoice` with `fields=*,customer(*),currency(*),orderLines(*),orders(*)` and a broad date window.
- Filter locally by org number, ex-VAT amount, positive outstanding balance, and service text.
- Read payment types once from `GET /invoice/paymentType`.
- Pay `amountCurrencyOutstanding` or `amountOutstanding`.
- Verify from the `PUT /invoice/{id}/:payment` response, not a follow-up `GET`.

## 3. Root Causes

- Weak type assumption: treated account numbers from `/invoice/paymentType` as strings without normalizing.
- Missing playbook coverage: invoice-payment guidance existed but needed refinement around one-read invoice identification and numeric account-number handling.
- Stale invoice-create guidance: hardcoded VAT code `3` in `create-and-send-customer-invoice.md` was too account-specific.
- Over-browsing tendency: inspected more of `openapi.json` than the winning path required.

## 4. Sandbox Verification

Investigative proof:
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&count=50&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*)` returned open invoice data including customer, ex-VAT amount, outstanding amount, and line descriptions.
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable payment types and confirmed account numbers came back as numbers (`1900`, `1920`), not strings.
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*` returned only VAT code `6` in this sandbox account, proving hardcoded VAT code `3` is unsafe.

End-to-end proof:
- Created customer `Codex Payment Probe 752963`, org.nr `889752963`, customer id `108162307`.
- Created invoice id `2147518216`, invoice number `3`, line `Datarådgivning`, ex-VAT amount `15200`, using dynamically resolved VAT type `6`.
- Located that invoice again via one `GET /invoice` using org.nr + ex-VAT + line description.
- Selected payment type `32813748` (`Betalt til bank`).
- Registered payment with `PUT /invoice/2147518216/:payment?...&paidAmount=15200`.
- Verified from the write response: `remainingOutstanding = 0`.

## 5. Playbook Changes

Updated existing playbooks; no new playbook was created.

Files changed:
- `./task-playbooks/register-customer-invoice-payment.md`
- `./task-playbooks/create-and-send-customer-invoice.md`

Also updated:
- `./AGENTS.md`

What changed:
- Refined invoice-payment playbook to prefer one decisive `GET /invoice`, local filtering, one `GET /invoice/paymentType`, and write-response verification.
- Added explicit rule to pay `amountCurrencyOutstanding`/`amountOutstanding`, not the prompt’s ex-VAT lookup amount.
- Added explicit rule that `/invoice/paymentType` account numbers may be numeric and must be normalized before prefix checks.
- Fixed invoice-create guidance to resolve VAT dynamically from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` instead of hardcoding `vatType.id = 3`.

## 6. Commit

- Commit hash: `a7eee56da9f2eec03d5eb83b05754dfd88849235`
- Commit message: `tripletex playbook: refine invoice payment and VAT guidance`

## 7. Reusable Heuristics

- For invoice-payment tasks, treat prompt amounts as lookup clues unless the API object confirms they equal the current outstanding balance.
- Prefer `GET /invoice` with expanded `customer(*)` and `orderLines(*)` before doing a separate customer lookup.
- Prefer `PUT /invoice/{id}/:payment` over ledger/voucher workarounds when the task is just “register payment”.
- Trust write responses for verification when they already expose zero outstanding balance.
- Normalize numeric-looking API fields before string heuristics.
- Never hardcode invoice VAT IDs across accounts; resolve them from filtered `/ledger/vatType` on the actual invoice date.