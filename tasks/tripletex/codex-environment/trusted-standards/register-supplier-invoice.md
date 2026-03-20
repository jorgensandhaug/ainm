# Register Supplier Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- register one supplier invoice as a ledger voucher
- prompt gives one supplier, one invoice number, one amount, one expense account, and VAT context
- prompt identifies the supplier by ordinary business fields such as `name` and `organizationNumber`, not by a known Tripletex supplier id
- task is a standard supplier-invoice booking, not a broader accounting workflow

## Do Not Use This Standard If
- prompt requires a feature-specific incoming-invoice module flow
- task is a reversal/correction flow
- prompt is missing the core accounting facts

## Standard Flow
1. `GET /supplier?organizationNumber=...&fields=*`
2. if the lookup returns one exact supplier, reuse that `supplier.id` and `supplier.ledgerAccount.id`
3. if the lookup returns zero suppliers, `POST /supplier` once and keep the returned ids in memory
4. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
5. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<date>&fields=*`
6. `GET /ledger/voucherType?name=Leverandørfaktura&fields=*`
7. `POST /ledger/voucher`
8. verify from write response
9. stop

## Minimal-Call Claim
- for the exact task shape where the supplier already exists, the canonical path is `5` API calls
- that `5`-call path is:
  1. `GET /supplier?organizationNumber=...&fields=*`
  2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
  3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<date>&fields=*`
  4. `GET /ledger/voucherType?name=Leverandørfaktura&fields=*`
  5. `POST /ledger/voucher`
- only use direct `POST /supplier` without a preceding lookup when the prompt explicitly says the supplier must be created or the surrounding task shape clearly proves the supplier does not already exist
- if the lookup returns zero suppliers and you then create one, the correct path becomes `6` calls; that is still preferable to risking a wrong-target duplicate in a register-existing-supplier task

## Payload Rules
- for ordinary supplier-invoice registration prompts phrased as invoice from `the supplier <name>`, first resolve the existing supplier by `organizationNumber`
- if that supplier lookup returns one exact hit, reuse that supplier directly and do not create a duplicate
- if the supplier lookup returns zero hits, create the supplier once, then continue with the returned `supplier.id` and `supplier.ledgerAccount.id`
- after a supplier write succeeds, keep those ids in memory and finish the rest of the flow in the same script
- if a later resolver branch such as VAT-type selection needs local repair, repair it in-process and continue; do not restart from scratch after the supplier write
- use supplier linkage on supplier-liability posting
- do not use `POST /incomingInvoice` as default standard path
- do not send `amountVat`
- put supplier invoice number on the supplier posting `invoiceNumber`, not only on root voucher object
- let Tripletex generate the VAT posting automatically
- if the prompt omits both invoice date and due date, use the current run date for voucher `date` and supplier-posting `termOfPayment`

## Reuse From Write Response
- supplier id and supplier ledger account id for the `2400` liability posting when the supplier create branch was used
- voucher id
- posting count
- expense posting account/vat ids
- supplier posting supplier id / invoice number / due date

## Verification
- default verification is zero extra calls if `POST /ledger/voucher` response already proves the scored fields by ids and amounts
- in the fast path, verify the expense line by known `account.id`, `vatType.id`, `amount`, and `amountGross`
- in the fast path, verify the supplier line by known supplier-ledger `account.id`, `supplier.id`, negative gross amount, `invoiceNumber`, and `termOfPayment`
- expect linked display fields such as `account.number`, `vatType.number`, and `supplier.organizationNumber` to stay sparse in the write response
- only do `GET /ledger/voucher/{id}?fields=*` if the task needs those expanded linked fields or the write response omits a scored id/amount field

## Known Recovery Branches
- use `typeOfVat=INCOMING`, not `INCOMING_INVOICE`, for this voucher flow
- if `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=...&fields=*` returns several rows with the same requested percentage, prefer the plain numeric base code over derived codes such as `TAP-1`
- ledger postings to supplier accounts require supplier object linkage
- if `GET /supplier?organizationNumber=...&fields=*` returns several suppliers, only continue when one exact unique candidate remains after exact `organizationNumber` plus exact `name` filtering; otherwise treat the run state as ambiguous
- if a retry context already contains duplicate suppliers with the same prompt `organizationNumber`, do not guess by newest id or any other heuristic; only reuse the exact supplier id already captured earlier in the same run, or treat the run state as ambiguous

## OpenAPI / Sandbox Status
- `/supplier`, `/ledger/account`, `/ledger/vatType`, `/ledger/voucher` verified in `./openapi.json`
- voucher-based supplier-invoice flow proven in sandbox/playbooks
- persistent sandbox re-check on 2026-03-20 also proved the existing-supplier branch in `5` calls by resolving supplier `organizationNumber=321000002`, then booking the same `6300 / 25% / 59800` voucher shape without any supplier create
