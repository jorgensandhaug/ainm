# Register Supplier Invoice

## Scope

Use for tasks like:
- register one unpaid supplier invoice
- prompt gives supplier identity, invoice number, gross amount, expense account, and VAT rate
- prompt expects a real supplier-invoice state, not merely a balanced generic voucher

Do not use for:
- supplier creation as the main task
- payment/remittance of an already-booked supplier invoice
- reversal/correction of an existing supplier invoice
- tasks that explicitly require a different incoming-invoice feature path

## Proven Best Path

The current best public path is:
1. create the supplier directly when the prompt gives supplier business fields but does not say the supplier already exists
2. resolve expense-account id by account number
3. resolve incoming VAT id on the actual invoice date
4. import a valid EHF/UBL XML invoice with the prompt values
5. partially update that imported voucher with the correct debit and supplier postings

This path is preferred because it creates both:
- a real `supplierInvoice` object
- the correct ledger postings with correct VAT split

For the exact fresh-account-like shape, that is `5` calls total.

If the prompt explicitly says the supplier already exists, or the run context is persistent/retry-like enough that duplicate suppliers are a real risk, switch the first step to `GET /supplier?organizationNumber=...&fields=*` and only create on zero hits.

## What Failed And Why

### Wrong path: direct `POST /ledger/voucher`
- it can create a balanced voucher
- it did not create a real `supplierInvoice` object in sandbox verification
- production supplier-invoice tasks scored `0/8` on that branch
- conclusion: do not treat generic voucher booking as equivalent to supplier-invoice registration

### Wrong path: `POST /incomingInvoice`
- never use `/incomingInvoice*` in scored runs for this repo
- these endpoints are beta-only here and should be treated as unavailable, not as a fallback branch
- the 2026-03-21 reflection re-check again returned `403 You do not have permission to access this feature`

### Wrong path: PDF import then mutate
- PDF import can create an empty voucher shell
- that shell did not provide a reliable supplier-invoice registration path
- `PUT /supplierInvoice/voucher/{id}/postings` either failed or crashed

### Wrong path: malformed or oversimplified XML
- earlier reduced XML attempts failed with `422 Unable to identify document format`
- conclusion: the XML must be valid-enough EHF/UBL, not a dummy blob

### Wrong path: imported voucher `PUT` with immutable header fields
- sending `description` or `vendorInvoiceNumber` in the later voucher update returned `422`
- conclusion: those values must be correct in the XML import itself; do not try to rewrite them later

### Later-payment caveat on this object family
- do not assume a supplier invoice created through this public import path is automatically payable later through `POST /supplierInvoice/{id}/:addPayment`
- persistent sandbox on 2026-03-21 returned `422 Cannot add payment to unregistered voucher` on imported supplier invoice `2147547151`
- that same invoice later read back with booked voucher number `100`, so `voucher.number > 0` alone is still not enough proof that `:addPayment` will work on this imported object family
- conclusion: keep supplier-invoice registration and later supplier-payment playbooks logically separate; the create proof here does not settle the payment path

### Wrong path: balanced voucher update without debit `vatType`
- sandbox accepted the write
- but Tripletex flattened the debit line to gross amount with `vatType.id=0`
- conclusion: explicit debit `vatType` is required for correct supplier-invoice VAT

### Wrong path: voucher update without currency amounts
- several branches produced `500`
- conclusion: keep `amountCurrency` and `amountGrossCurrency` on both manual rows

## Exact Minimal Flow

For the fresh-account-like shape where the prompt does not say the supplier already exists:
1. `POST /supplier`
2. `GET /ledger/account?number=<expense-account>&isApplicableForSupplierInvoice=true&fields=*`
3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*`
4. `POST /ledger/voucher/importDocument`
5. `PUT /ledger/voucher/{id}?sendToLedger=false`

For an explicit existing-supplier or retry/persistent-account shape:
1. `GET /supplier?organizationNumber=...&fields=*`
2. `GET /ledger/account?number=<expense-account>&isApplicableForSupplierInvoice=true&fields=*`
3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*`
4. `POST /ledger/voucher/importDocument`
5. `PUT /ledger/voucher/{id}?sendToLedger=false`

If that lookup-first branch returns zero hits:
1. `GET /supplier?...`
2. `POST /supplier`
3. `GET /ledger/account?...`
4. `GET /ledger/vatType?...`
5. `POST /ledger/voucher/importDocument`
6. `PUT /ledger/voucher/{id}?sendToLedger=false`

Fresh-account-like re-proof:
- 2026-03-20 persistent sandbox re-proof for `Océan Reflection SARL 321000010` / `321000010` / `services de bureau` / `56300` gross / `6500` / `25%` completed in the lower-call `5`-call create-first branch
- 2026-03-20 persistent sandbox re-proof for this session's exact amount/account shape `Minimal Proof Supplier 007945 AS` / `910079457` / `kontortjenester` / `61600` gross / `6340` / `25%` also completed in the same lower-call `5`-call create-first branch
- 2026-03-20 persistent sandbox re-proof for `Lumière SARL` / `913175212` / `services de bureau` / `72350` gross / `6300` / `25%` took exactly this `6`-call zero-hit branch
- no extra `GET /supplierInvoice` or `GET /ledger/voucher/{id}` was needed; the final `PUT /ledger/voucher/{id}` response already proved the expense row, supplier row, and auto VAT row

Do not add:
- `GET /ledger/voucherType`
- `POST /ledger/voucher` as the main registration write
- `GET /supplierInvoice` or `GET /ledger/voucher/{id}` by default
- `sendToLedger=true` by default

## Supplier Resolution Rules

- for fresh-account-like prompts that give supplier business fields but do not say the supplier already exists, create the supplier directly and reuse the returned `id` plus `ledgerAccount.id`
- only spend `GET /supplier?organizationNumber=...&fields=*` first when the prompt explicitly says the supplier already exists or the run context is a retry/persistent account where duplicates are plausible
- if that lookup returns exactly one exact `organizationNumber` + exact `name` hit, reuse it
- if that lookup returns zero hits, create the supplier once
- if that lookup returns several hits, the run state is ambiguous; do not guess by newest id

Why this matters:
- the 2026-03-20 production run for `Océan SARL` / `853705209` proved that lookup-first wastes one call in the normal fresh-account branch when the supplier does not exist
- earlier duplicate-supplier evidence still matters in retry/persistent-account contexts, so keep the lookup-first branch there instead of creating blindly

## Account Resolution Rules

- resolve the expense account through `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
- do not hardcode account ids across runs or accounts
- the prompt gives account number, not Tripletex internal id
- `isApplicableForSupplierInvoice=true` reduces wrong-account and `422` risk

## VAT Resolution Rules

- resolve VAT through `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*`
- choose the prompt percentage
- if several rows match the percentage, prefer the base code, typically `number="1"` for ordinary `25%` input VAT
- cache the selection rule in docs, not the concrete `vatType.id`
- do not use `INCOMING_INVOICE`

## XML Rules

The XML is not a dummy transport wrapper. It has to be structurally valid enough for Tripletex to recognize it as EHF/UBL.

### Keep these required pieces
- UBL `Invoice` root namespaces
- `cbc:CustomizationID`
- `cbc:ProfileID`
- `cbc:ID`
- `cbc:IssueDate`
- `cbc:DueDate`
- `cbc:InvoiceTypeCode = 380`
- `cbc:DocumentCurrencyCode = NOK`
- `cac:AccountingSupplierParty`
- `cac:AccountingCustomerParty`
- `cac:TaxTotal`
- `cac:LegalMonetaryTotal`
- one `cac:InvoiceLine`

### Supplier block requirements
- supplier endpoint id
- supplier legal entity company id
- supplier tax scheme company id in `NO<orgnr>MVA` form
- supplier name
- a non-empty postal address and country

### Customer block requirements
- keep a stable buyer block in the template
- do not omit the customer block just because the supplier is the scored entity
- sandbox proof accepted a generic placeholder buyer, but that does not justify stripping the block down further

### Amount rules inside XML
- XML line and totals use net amount
- tax subtotal carries taxable amount and tax amount
- legal monetary total carries both net and gross
- invoice line item name should be the prompt description exactly

## Trusted Voucher Update Shape

After import, update the imported voucher with a partial body containing only:
- `version`
- `postings`

### Debit row
- `row = 1`
- `date = <invoice-date>`
- `description = <prompt description>`
- `account.id = <resolved expense-account-id>`
- `vatType.id = <resolved incoming-vat-id>`
- `amount = net`
- `amountCurrency = net`
- `amountGross = gross`
- `amountGrossCurrency = gross`

### Supplier row
- `row = 2`
- `date = <invoice-date>`
- `description = <prompt description>`
- `account.id = <supplier.ledgerAccount.id>`
- `supplier.id = <supplier.id>`
- `amount = -gross`
- `amountCurrency = -gross`
- `amountGross = -gross`
- `amountGrossCurrency = -gross`
- `invoiceNumber = <prompt invoice number>`
- `termOfPayment = <due date>`

### Expected result
- Tripletex adds a third system-generated VAT posting
- final voucher should show:
  - debit expense row with requested account and input VAT
  - supplier/AP row linked to supplier id
  - system VAT row

## Example Numbers

For `gross=39750` and `25%` VAT:
- `net = 31800`
- `vat = 7950`

For `gross=72350` and `25%` VAT:
- `net = 57880`
- `vat = 14470`

For `gross=56300` and `25%` VAT:
- `net = 45040`
- `vat = 11260`

Expected final accounting shape:
- expense row: `6500`, `vatType.id=1`, `amount=31800`, `amountGross=39750`
- supplier row: supplier ledger account, `amount=-39750`, `invoiceNumber=<prompt invoice number>`
- system VAT row: `7950`

## Verification Strategy

Default: zero extra reads.

Trust the final `PUT /ledger/voucher/{id}` response when it already shows:
- the expense posting on the resolved expense account id
- the debit row `vatType.id`
- debit row `amount` and `amountGross`
- supplier liability row linked to supplier id
- supplier row `invoiceNumber`
- one extra system-generated VAT row

Only add one decisive read if the write response is unexpectedly sparse or contradictory:
- `GET /ledger/voucher/{id}?fields=*`
or
- `GET /supplierInvoice?...`

Do not add both by default.

## Sandbox Proof

2026-03-20 sandbox proof for the exact original production task values:
- supplier `Elvdal AS` / `889157917`
- invoice number `INV-2026-8662`
- description `kontortenester`
- gross `39750`
- net `31800`
- VAT `25%`
- expense account `6500`

Proven outcome:
- imported voucher `608856087`
- supplier invoice `2147547151`
- final voucher update returned:
  - expense row on `6500` with `vatType.id=1`, `amount=31800`, `amountGross=39750`
  - supplier row `-39750` linked to supplier id
  - system VAT row `7950`
- 2026-03-20 persistent-sandbox re-proof for the exact production-like French office-services shape (`Océan Reflection SARL 321000010` / `321000010` / `services de bureau` / `56300` / `6500` / `25%`) succeeded on the lower-call create-first path
- that re-proof used the `5`-call branch:
  1. `POST /supplier`
  2. `GET /ledger/account?number=6500&isApplicableForSupplierInvoice=true&fields=*`
  3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*`
  4. `POST /ledger/voucher/importDocument`
  5. `PUT /ledger/voucher/{id}?sendToLedger=false`
- final write response proved:
  - expense row on `6500` with `vatType.id=1`, `amount=45040`, `amountGross=56300`
  - supplier row `-56300` linked to the created supplier id
  - system VAT row `11260`
- 2026-03-20 persistent-sandbox re-proof for the French office-services shape (`Lumière SARL` / `913175212` / `services de bureau` / `72350` / `6300` / `25%`) also succeeded
- that re-proof hit the zero-hit supplier branch, so the measured path was `6` calls:
  1. `GET /supplier?organizationNumber=913175212&fields=*`
  2. `POST /supplier`
  3. `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*`
  4. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*`
  5. `POST /ledger/voucher/importDocument`
  6. `PUT /ledger/voucher/{id}?sendToLedger=false`
- final write response proved:
  - expense row on `6300` with `vatType.id=1`, `amount=57880`, `amountGross=72350`
  - supplier row `-72350` linked to the created supplier id
  - system VAT row `14470`
- 2026-03-20 persistent-sandbox re-proof for this session's exact amount/account shape (`Minimal Proof Supplier 007945 AS` / `910079457` / `kontortjenester` / `61600` / `6340` / `25%`) also succeeded
- that re-proof used the same lower-call `5`-call branch:
  1. `POST /supplier`
  2. `GET /ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*`
  3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-20&fields=*`
  4. `POST /ledger/voucher/importDocument`
  5. `PUT /ledger/voucher/{id}?sendToLedger=false`
- final write response proved:
  - expense row on `6340` with `vatType.id=1`, `amount=49280`, `amountGross=61600`
  - supplier row `-61600` linked to the created supplier id
  - system VAT row `12320`

## Reusable Heuristics

- if the task says register a supplier invoice, optimize for creating a real `supplierInvoice` object, not just a balanced voucher
- import first, mutate second
- in the voucher update, keep the header immutable and change only `postings`
- if the balance is wrong, add currency amounts
- if VAT is wrong, add explicit debit `vatType`
- if XML import fails, fix the XML structure; do not pivot back to the old voucher-first path
