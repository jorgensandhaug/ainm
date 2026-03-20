# Task

Reflect on the failed production run for: create and send one invoice to `Ironbridge Ltd` (`841254546`) for `28500 NOK` excluding VAT for `System Development`, audit call efficiency, prove the corrected path in sandbox, update the Tripletex learning artifacts, commit those docs changes, and write this summary.

# Reflection

What went well:
- Customer create, VAT lookup, bank-account repair, and invoice creation were all directionally correct.
- The bank-account repair branch was needed and the second invoice write succeeded.
- The production failure was isolated to the send strategy, not the invoice payload itself.

What went poorly:
- I split create and send into two phases by forcing `sendToCustomer=false`, then guessed send channels afterward.
- I burned an unnecessary initial `GET /customer` even though this task shape was the normal fresh-account new-customer variant.
- I treated explicit `:send` as safer than letting `POST /invoice` send directly. That assumption was wrong for this shape.
- I generated a random 11-digit bank account number first; Tripletex accepted only a checksum-valid 11-digit number.

Correct approach:
- For this exact shape, create the customer directly, resolve VAT, then `POST /invoice` with the default `sendToCustomer=true`.
- Keep the bank-account repair as a conditional branch only if the invoice write itself demands it.
- Do not plan a follow-up `PUT /invoice/{id}/:send` unless the prompt explicitly requires a later send-channel override.

# Call Efficiency

The production run was not minimal-call.

Actual production calls:
1. `GET /customer?organizationNumber=841254546&fields=*`
2. `POST /customer`
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
4. `POST /invoice?sendToCustomer=false` -> `422` missing bank account
5. `GET /ledger/account?isBankAccount=true&fields=*`
6. `PUT /ledger/account/{id}`
7. `POST /invoice?sendToCustomer=false`
8. `PUT /invoice/{id}/:send?sendType=MANUAL` -> `500`
9. `PUT /invoice/{id}/:send?sendType=EHF` -> `422`
10. `GET /customer?...&fields=*` diagnostic read

Wasted calls:
- Call 1: unnecessary customer pre-read for the normal fresh-account new-customer variant.
- Call 8: wrong send path.
- Call 9: recovery guess, still wrong.
- Call 10: diagnostic-only read after the run was already off the winning path.

Lower-call replacement path for the next agent:
1. `POST /customer` with `name`, `organizationNumber`, `invoiceSendMethod: "MANUAL"`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
3. `POST /invoice` with default `sendToCustomer=true`
4. Only if call 3 fails with missing company bank account:
5. `GET /ledger/account?isBankAccount=true&fields=*`
6. `PUT /ledger/account/{id}` with a checksum-valid unique 11-digit `bankAccountNumber`
7. Retry the same `POST /invoice`

For this exact task shape with the observed bank-account prerequisite, the realistic minimum was `6` calls. I used `10`.

# Root Causes

- I overrode `sendToCustomer` to `false` without proving that explicit later `:send` was the best path.
- I leaned on generic “manual send fallback” intuition instead of proven Tripletex behavior for this task shape.
- I did not exploit the repo rule that real submissions use fresh accounts, so I paid an unnecessary customer lookup read.
- I assumed “valid unique 11-digit bank account number” meant any 11 digits, instead of checksum-valid 11 digits.
- I treated sparse customer address links and organization number as enough evidence for `PAPER`/`EHF`; both assumptions were wrong.

# Sandbox Verification

Using only the provided sandbox credentials, I verified:

- `POST /customer` with:
  - `name: "Ironbridge Ltd"`
  - `organizationNumber: "841254546"`
  - `invoiceSendMethod: "MANUAL"`
  succeeded as customer `108245853`.
- That customer came back with:
  - `invoiceSendMethod: "MANUAL"`
  - empty `email`
  - empty `invoiceEmail`
  - sparse `postalAddress` and `physicalAddress` links
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT type `id=6`, `percentage=0`.
- `PUT /invoice/2147527950/:send?sendType=PAPER` returned `422 Faktura kan ikke sendes via PAPER`.
- `PUT /invoice/2147527952/:send?sendType=MANUAL` returned `500`.
- `POST /invoice` with default `sendToCustomer=true` for that same customer succeeded and created invoice `2147528033` / invoice number `19` / `documentId=1024152320`.

This proves the corrected lower-call path for the same shape:
- do not split create and send by default
- let the invoice create perform the send
- do not rely on later `MANUAL` or `PAPER` send calls for this no-email/no-address customer shape

# Playbook Changes

Updated existing docs and created one new trusted standard.

Changed paths:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `trusted-standards/create-and-send-customer-invoice.md` (new)
- `task-playbooks/create-and-send-customer-invoice.md`

What changed:
- Added a new trusted standard for create-and-send customer invoices.
- Updated the playbook to prefer `POST /invoice` with default `sendToCustomer=true`.
- Added the fresh-account optimization: skip `GET /customer` on the normal new-customer variant.
- Added the checksum-valid bank-account-number note for the repair branch.
- Added explicit warnings that later `sendType=MANUAL` can `500`, `sendType=PAPER` can `422`, and org number alone does not prove EHF sendability.

# Commit

- Commit hash: `3d8f1439e32f83bee00f6fe15bc13787f307a3ae`
- Commit message: `tripletex playbook: optimize create-and-send invoice path`

# Reusable Heuristics

- For create-and-send invoice tasks, default to the fewest-write path: let `POST /invoice` send unless the prompt explicitly requires a separate later send step.
- In fresh-account scored runs, do not spend a customer lookup read when the prompt already gives all create fields.
- Treat bank-account repair as conditional, but when it is needed, use a checksum-valid unique 11-digit number.
- Sparse customer address links are not proof that paper send is enabled.
- Organization number alone is not proof that EHF is available.
- When explicit send-channel guessing begins, the run is usually already off the lowest-call path.
