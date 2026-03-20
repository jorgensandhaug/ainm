## 1. Task
Post-run learning pass for the production task: create one order for existing customer `Vestfjord AS` (`970769994`) with existing products `Nettverksteneste (3237)` and `Analyserapport (4609)`, convert to invoice, register full payment, then update the learning artifacts and commit them.

## 2. Reflection
- Production run succeeded first try and reached correct final Tripletex state: order created, invoice created, full payment registered, outstanding `0`.
- The Tripletex execution matched the exact trusted standard and did not waste any Tripletex API calls.
- The only real process mistake was local, not Tripletex-side: I briefly re-checked `openapi.json` for the `/ledger/account/{id}` repair payload even though this was an exact trusted-standard match. That did not affect score, but it was unnecessary and contradicted the “use trusted standard directly” rule.
- Correct approach in future scored runs: trust the exact standard, use the uncached 5-call path directly, and only enter the documented bank-account repair branch if the invoice write actually returns that specific validation error.

## 3. Call Efficiency
- Original run was minimal-call for this exact uncached task shape.
- Tripletex API calls used: `5`.
- Wasted Tripletex calls: `none`.
- Exact minimal path for the next agent from a blank run:
  - `GET /customer?organizationNumber=970769994&fields=*`
  - `GET /product?productNumber=3237&productNumber=4609&fields=*`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false&paymentTypeId=<resolved>&paidAmount=0.01&paymentTypeIdRestAmount=<same-id>`
- No lower-call replacement was found for a fresh run without a cached payment type.
- The only conditional lower-call variant remains the already-known same-run cached branch: if the run already holds a proven reusable incoming `paymentTypeId` for that same company/currency, skip the payment-type read and do the downstream work in `4` calls.

## 4. Root Causes
- No Tripletex-side mistake occurred in the production run.
- Minor local inefficiency happened because the trusted standard did not spell out the minimal `/ledger/account/{id}` repair payload as explicitly as it could, which invited unnecessary local spec-checking.
- Corrective change: document the repair payload directly as `{"bankAccountNumber":"12345678903"}` so future agents can follow the recovery branch without extra local uncertainty.
- Another important contextual fact: the exact production customer/product fixtures were not present in persistent sandbox, so the proof run had to use an analogous exact-shape sandbox pair instead of replaying the exact production entities.

## 5. Sandbox Verification
- Exact production fixtures were absent in sandbox:
  - `GET /customer?organizationNumber=970769994&fields=*` returned `values=[]`
  - `GET /product?productNumber=3237&productNumber=4609&fields=*` returned `values=[]`
- I proved the same exact task family in persistent sandbox with existing analogous fixtures:
  - customer `975687821`
  - products `4366` / `3402`
- Proven sandbox 5-call path:
  - `GET /customer?organizationNumber=975687821&fields=*`
  - `GET /product?productNumber=4366&productNumber=3402&fields=*`
  - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
  - `POST /order`
  - `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false&paymentTypeId=32813748&paidAmount=0.01&paymentTypeIdRestAmount=32813748`
- Sandbox result:
  - `orderId=401975853`
  - `invoiceId=2147552362`
  - `invoiceNumber=169`
  - `amountExcludingVatCurrency=27650`
  - `amountCurrency=27650`
  - `outstanding=0`
- Extra proof from that sandbox run:
  - product lookup returned refs under `number`, not `productNumber`
  - the winning payment type had `name=null`
  - the winning payment type had `creditAccount=null`
  - debit account was still `1920`, so selector logic must prioritize account traits, not label presence

## 6. Playbook Changes
- Updated existing trusted standard: `trusted-standards/create-order-invoice-and-register-payment.md`
- Updated existing playbook: `task-playbooks/create-order-invoice-and-register-payment.md`
- No new trusted standard created.
- No new playbook created.
- No `AGENTS.md` change was needed because no trusted-standard/playbook file was added, removed, or renamed, and the canonical path did not change.
- No `trusted-standards/common-endpoints.md` change was needed because the common endpoint shape and canonical low-call path were unchanged.
- Changes made:
  - added this exact Norwegian production run as another confirmed 5-call proof
  - made the bank-account repair payload explicit as the minimal `PUT /ledger/account/{id}` body `{"bankAccountNumber":"12345678903"}`

## 7. Commit
- Commit hash: `1a69d1d4010c1aa357cd5c31a7affc3679bf0459`
- Commit message: `tripletex playbook: refine order invoice payment fast path`

## 8. Reusable Heuristics
- For exact existing-customer plus exact existing-product order-to-invoice-to-full-payment tasks, default to the uncached `5`-call path; do not split invoice and payment unless the combined write fails.
- Do not hardcode `paymentTypeId` across accounts or environments.
- On `GET /invoice/paymentType`, do not require `name` or `creditAccount`; prefer debit-account traits such as `19xx`, `isBankAccount=true`, or `isInvoiceAccount=true`.
- Use `paidAmount=0.01` for ordinary NOK combined invoice-payment writes; `paidAmount=0` is not a valid shortcut.
- Do not add a default `/ledger/account` preflight; keep bank-account repair conditional unless the run already has strong evidence that the first invoice write will hit that branch.
- If the bank-account validation appears, repair the existing invoice bank account with the minimal payload `{"bankAccountNumber":"12345678903"}` and retry the same order invoice once.
- Normalize both `product.number` and `product.productNumber` when resolving exact numeric product refs.
