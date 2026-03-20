## 1. Task
Post-run learning pass for the production run that registered supplier invoice `INV-2026-7058` from `Bergwerk GmbH` (`968598546`) for `21100 NOK` gross on account `6300` with `25%` input VAT.

## 2. Reflection
What went well:
- The production run succeeded cleanly.
- The Tripletex API path was correct: supplier voucher through `POST /ledger/voucher`, not `POST /incomingInvoice`.
- The run reused write responses correctly and stopped without an unnecessary verification `GET`.
- The final accounting shape was correct: net `16880`, VAT `4220`, gross payable `21100`.

What went poorly:
- I still read the playbook and `openapi.json` even though this was an exact trusted-standard match. That did not add API calls, but it did waste time and increased decision surface.
- The trusted standard wording `create or resolve supplier` was too soft. It left room for a future agent to waste a `GET /supplier?...` pre-read.
- The date fallback was not explicit enough. The production prompt omitted invoice date and due date, and the docs did not clearly say to use the run date for both `date` and `termOfPayment`.

Correct approach:
- Treat this exact shape as a strict `5`-call create path on fresh accounts.
- Start with direct `POST /supplier`.
- Use the run date when the prompt omits both invoice date and due date.
- Verify from the `POST /ledger/voucher` write response only.

## 3. Call Efficiency
The production run was minimal-call for this exact task shape.

Production API calls used:
1. `POST /supplier`
2. `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*`
3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*`
4. `GET /ledger/voucherType?name=Leverandørfaktura&fields=*`
5. `POST /ledger/voucher`

Wasted API calls:
- None.

Exact lower-call path for the next agent:
- Same `5` calls above. There is no realistic lower-call path with perfect correctness for a fresh-account prompt that gives only supplier business identity, expense account number, invoice number, gross amount, and VAT rate.

Calls that would be wasted if added:
- `GET /supplier?organizationNumber=...&fields=*` before `POST /supplier`
- `GET /ledger/account?number=2400...`
- `GET /ledger/voucher/{id}?fields=*` after a sufficient voucher write response

## 4. Root Causes
- Over-verification habit: I re-opened playbook/spec material even though the trusted standard already matched exactly.
- Ambiguous trusted-standard wording: `create or resolve supplier` did not force the lower-call branch.
- Missing explicit date rule: the docs did not clearly say that omitted invoice date and due date should both default to the run date in this shape.

## 5. Sandbox Verification
I proved the corrected path in persistent sandbox with a dedicated `bun` TypeScript script in the run scripts directory.

Sandbox result:
- Base URL: `https://kkpqfuj-amager.tripletex.dev/v2`
- Verified path succeeded in exactly `5` API calls
- Supplier created: `Bergwerk GmbH Reflection 970123458`
- Invoice number: `REFLECT-INV-2026-03-20-01`
- Voucher ID: `608826400`
- Voucher number: `15`

Verified response shape:
- Expense posting: account id `424191117`, VAT type id `1`, `amount=16880`, `amountGross=21100`
- Supplier posting: account id `424190921`, supplier id `108246382`, `amount=-21100`, `invoiceNumber=REFLECT-INV-2026-03-20-01`, `termOfPayment=2026-03-20`
- Auto VAT posting: row `0`, account id `424190943`, `amount=4220`

This confirmed:
- `POST /supplier` is the correct first step for the fresh-account create-like shape
- `GET /ledger/vatType?typeOfVat=INCOMING...` is the correct VAT lookup
- `POST /ledger/voucher` write response is sufficient for fast-path verification
- No follow-up `GET /ledger/voucher/{id}` is needed

## 6. Playbook Changes
Updated existing docs; no new files created.

Changed paths:
- `AGENTS.md`
- `trusted-standards/register-supplier-invoice.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/register-supplier-invoice.md`

Changes made:
- Tightened the trusted supplier-invoice fast path to start with direct `POST /supplier`
- Added an explicit minimal-call claim: exact fresh-account shape is `5` API calls
- Added explicit rule to use run date for both voucher `date` and supplier-posting `termOfPayment` when the prompt omits both invoice date and due date
- Added common-endpoint guidance to avoid a supplier pre-read on this shape
- Recorded the sandbox proof that the `21100` / `6300` / `25%` example succeeds in `5` calls with no verification read

## 7. Commit
- Commit hash: `140d079`
- Commit message: `tripletex playbook: tighten supplier invoice fast path`

## 8. Reusable Heuristics
- For exact fresh-account supplier-invoice booking prompts, do `POST /supplier` first; do not pre-read the supplier.
- For voucher-based supplier invoices, use `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=...&fields=*`, not `INCOMING_INVOICE`.
- Reuse `supplier.ledgerAccount.id` from the supplier create response; do not read `2400` separately.
- On `POST /ledger/voucher`, send `amount`, `amountCurrency`, `amountGross`, and `amountGrossCurrency`; do not send `amountVat`.
- Put the supplier invoice number on the supplier posting field `invoiceNumber`, not only on root `voucher.vendorInvoiceNumber`.
- If invoice date and due date are both omitted, use the run date for both `date` and `termOfPayment`.
- If the voucher write response already proves posting ids and amounts, stop. Do not add a verification `GET`.