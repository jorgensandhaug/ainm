# Register Supplier Invoice

> **NO BETA ENDPOINTS.** NEVER use `/incomingInvoice*` or any `(BETA)` endpoint. They ALL return `403`. Use the EHF/XML import path via `/ledger/voucher/importDocument`.

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

The current best public path for **25% incoming VAT** (most common) is:
1. create the supplier directly when the prompt gives supplier business fields but does not say the supplier already exists
2. resolve expense-account id by account number
3. import a valid EHF/UBL XML invoice with the prompt values
4. partially update that imported voucher with the correct debit and supplier postings (`sendToLedger=false`), using hard-coded `vatType: { id: 1 }` for 25% incoming VAT
5. book the voucher with `PUT /ledger/voucher/{id}?sendToLedger=true` sending ONLY `{ version }` (NO postings)

This path is preferred because it creates both:
- a real `supplierInvoice` object
- the correct ledger postings with correct VAT split
- a BOOKED voucher (number > 0) which is required for scoring

For the exact fresh-account-like shape with 25% VAT, that is `5` calls total.

For **non-25% VAT rates**, insert `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*` between steps 2 and 3, making it `6` calls total.

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

### Wrong path: omitting the booking step (sendToLedger=true)
- all pre-2026-03-21 production runs ended with `PUT sendToLedger=false`, leaving vouchers unbooked (number=0)
- every such run scored 0% on supplier-invoice tasks
- the scorer requires a booked voucher
- fix: add `PUT /ledger/voucher/{id}?sendToLedger=true` with only `{ version }` as the final step
- CRITICAL: the booking PUT must NOT include postings — combining postings + sendToLedger=true fails because Tripletex clears existing postings before applying new ones, creating a transient empty state that triggers "Bilag uten posteringer kan ikke bli sendt til hovedbok"
- the version in the booking PUT must come from the postings PUT response, not the import response

### Wrong path: balanced voucher update without debit `vatType`
- sandbox accepted the write
- but Tripletex flattened the debit line to gross amount with `vatType.id=0`
- conclusion: explicit debit `vatType` is required for correct supplier-invoice VAT

### Wrong path: voucher update without currency amounts
- several branches produced `500`
- conclusion: keep `amountCurrency` and `amountGrossCurrency` on both manual rows

## Exact Minimal Flow

### Fresh-account-like, 25% VAT (5 calls — optimal):
1. `POST /supplier`
2. `GET /ledger/account?number=<expense-account>&isApplicableForSupplierInvoice=true&fields=*`
3. `POST /ledger/voucher/importDocument`
4. `PUT /ledger/voucher/{id}?sendToLedger=false` with hard-coded `vatType: { id: 1 }`
5. `PUT /ledger/voucher/{id}?sendToLedger=true` with only `{ version }` (books the voucher)

### Fresh-account-like, non-25% VAT (6 calls):
1. `POST /supplier`
2. `GET /ledger/account?number=<expense-account>&isApplicableForSupplierInvoice=true&fields=*`
3. `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*`
4. `POST /ledger/voucher/importDocument`
5. `PUT /ledger/voucher/{id}?sendToLedger=false`
6. `PUT /ledger/voucher/{id}?sendToLedger=true` with only `{ version }`

### Existing-supplier, 25% VAT (5 calls):
1. `GET /supplier?organizationNumber=...&fields=*`
2. `GET /ledger/account?number=<expense-account>&isApplicableForSupplierInvoice=true&fields=*`
3. `POST /ledger/voucher/importDocument`
4. `PUT /ledger/voucher/{id}?sendToLedger=false` with hard-coded `vatType: { id: 1 }`
5. `PUT /ledger/voucher/{id}?sendToLedger=true` with only `{ version }`

### Existing-supplier lookup returns zero hits, 25% VAT (6 calls):
1. `GET /supplier?...`
2. `POST /supplier`
3. `GET /ledger/account?...`
4. `POST /ledger/voucher/importDocument`
5. `PUT /ledger/voucher/{id}?sendToLedger=false` with hard-coded `vatType: { id: 1 }`
6. `PUT /ledger/voucher/{id}?sendToLedger=true` with only `{ version }`

Fresh-account-like re-proof:
- 2026-03-20 persistent sandbox re-proof for `Océan Reflection SARL 321000010` / `321000010` / `services de bureau` / `56300` gross / `6500` / `25%` completed in the lower-call `5`-call create-first branch
- 2026-03-20 persistent sandbox re-proof for this session's exact amount/account shape `Minimal Proof Supplier 007945 AS` / `910079457` / `kontortjenester` / `61600` gross / `6340` / `25%` also completed in the same lower-call `5`-call create-first branch
- 2026-03-20 persistent sandbox re-proof for `Lumière SARL` / `913175212` / `services de bureau` / `72350` gross / `6300` / `25%` took exactly this `6`-call zero-hit branch
- no extra `GET /supplierInvoice` or `GET /ledger/voucher/{id}` was needed; the final `PUT /ledger/voucher/{id}` response already proved the expense row, supplier row, and auto VAT row

Do not add:
- `GET /ledger/voucherType`
- `POST /ledger/voucher` as the main registration write
- `GET /supplierInvoice` or `GET /ledger/voucher/{id}` by default

The booking step (`PUT sendToLedger=true` with only `{ version }`) is REQUIRED — without it the voucher stays unbooked (number=0) and the scorer returns 0%.

## Supplier Data Extraction (CRITICAL)

When the prompt includes an attached PDF invoice, extract ALL supplier data from it:
- `name` and `organizationNumber` (always present)
- `postalAddress` with `addressLine1`, `postalCode`, `city` (if address appears on PDF)
- `bankAccountPresentation: [{ bban: "<bank-account-number>" }]` (if bank account appears on PDF)

Include all extracted fields in the same `POST /supplier` call — this costs zero extra API calls.

The deprecated `bankAccounts` string array field silently does nothing. Always use `bankAccountPresentation` with `bban` instead.

2026-03-21 production run for `Fjelltopp AS` scored 7/10 (not 10/10) because `postalAddress` and `bankAccountPresentation` from the PDF were omitted from the supplier create.

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
- `account: { number: ..., name: ... }` does NOT work in PUT postings — returns `422` ("Internt felt (account) — Feltet må fylles ut."); only `account: { id: <numeric-id> }` is accepted, so the GET is required and cannot be skipped

## VAT Resolution Rules

- for **25% incoming VAT**: hard-code `vatType: { id: 1 }` — no lookup needed; this has been stable across all tested Tripletex instances (2026-03-20 and 2026-03-21 proofs)
- for **non-25% VAT rates**: resolve VAT through `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*`
- choose the prompt percentage
- if several rows match the percentage, prefer the base code
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

### Booking step (step 5)
After the postings PUT succeeds, book the voucher:
- `PUT /ledger/voucher/{id}?sendToLedger=true`
- body: `{ version: <version from step 4 response> }`
- do NOT include `postings` in this PUT
- the response should show a voucher with `number > 0` (booked)

### Expected result
- Tripletex adds a third system-generated VAT posting
- final voucher should show:
  - debit expense row with requested account and input VAT
  - supplier/AP row linked to supplier id
  - system VAT row
  - voucher `number > 0` (booked)

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

Trust the postings PUT and booking PUT responses when they show:
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

## Sandbox Proof (historical — postings mechanics only, pre-booking-fix)

These proofs confirmed the postings mechanics work correctly but predate the booking step discovery. They ended with `sendToLedger=false` which left vouchers unbooked. See "Sandbox Proof — 5-call Path with Booking" below for the complete correct flow.

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

## Production Proof — 5-call Path with Booking (OPTIMAL)

2026-03-21 production run for `Stormberg AS` / `877462137` / `INV-2026-9382` / `61600` / `6340` / `25%`:
- used exactly 5 calls, 0 errors — optimal execution
- text-only prompt (no PDF), so no address/bank data to extract
- 5 calls:
  1. `POST /supplier` → supplier `108401290`
  2. `GET /ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*`
  3. `POST /ledger/voucher/importDocument` → voucher `609103298` (accessed via `values[0]`)
  4. `PUT /ledger/voucher/{id}?sendToLedger=false` with `vatType: { id: 1 }`, `row: 1`/`row: 2`
  5. `PUT /ledger/voucher/{id}?sendToLedger=true` with only `{ version }`
- final state: expense 6340 amount=49280 amountGross=61600 vatType.id=1; supplier -61600; system VAT 12320
- voucher booked with number=1
- minor issue: used "Kontortjenester" (capital K) instead of prompt's "kontortjenester" — preserve exact casing
- this is the 3rd consecutive optimal 5-call production run with 0 errors

2026-03-21 production run for `Luz do Sol Lda` / `964942366` / `INV-2026-8987` / `30937` / `6500` / `25%`:
- used exactly 5 calls, 0 errors — optimal execution with PDF attachment
- PDF data fully extracted: address `Kirkegata 135, 5003 Bergen`, bank account `53342237408`
- supplier created with `postalAddress` and `bankAccountPresentation` in same `POST /supplier`
- hard-coded `vatType: { id: 1 }`, skipping `GET /ledger/vatType`
- two-step booking: PUT sendToLedger=false (version→3), then PUT sendToLedger=true (version→6, number=1)
- VAT rounding: PDF net=24750, gross=30937 → Tripletex stored net=24749.6, VAT=6187.4
- voucher `609107692`, supplier `108403892`
- 2nd production confirmation of the full 5-call path with booking, 1st with PDF (address + bank)

2026-03-21 production run for `Waldstein GmbH` / `927720523` / `INV-2026-6337` / `55950` / `7000` / `25%`:
- used exactly 5 calls, 0 errors — optimal execution
- German-language prompt (no PDF), text-only, no address/bank data to extract
- description "Bürodienstleistungen" preserved with exact casing from German prompt
- first production use of account 7000 in this standard
- hard-coded `vatType: { id: 1 }`, no `GET /ledger/vatType`
- two-step booking: PUT sendToLedger=false (version→3), then PUT sendToLedger=true (version→6, number=1)
- net=44760, VAT=11190 (exact, no rounding)
- voucher `609122334`, supplier `108410856`
- 5th consecutive optimal 5-call production run with 0 errors

2026-03-21 production run for `Océan SARL` / `955986881` / `INV-2026-8825` / `75312` / `6340` / `25%`:
- used exactly 5 calls, 0 errors — optimal execution with PDF attachment
- French-language prompt with PDF, description "Skylagring"
- PDF data fully extracted: address `Torggata 92, 4611 Kristiansand`, bank account `36069835664`
- supplier created with `postalAddress` and `bankAccountPresentation` in same `POST /supplier`
- hard-coded `vatType: { id: 1 }`, skipping `GET /ledger/vatType`
- two-step booking: PUT sendToLedger=false (version→3), then PUT sendToLedger=true (version→6, number=1)
- VAT rounding: PDF net=60250, gross=75312 (60250×1.25=75312.5) → Tripletex stored net=60249.6, VAT=15062.4
- voucher `609130518`, supplier `108414532`
- 6th consecutive optimal 5-call production run with 0 errors
- languages confirmed across consecutive optimal runs: en, es, pt, de, fr — standard is language-independent

## Production Proof — 4-call Path (SCORED 0% — missing booking step)

2026-03-21 production run for `Brightstone Ltd` / `890932991` / `INV-2026-9075` / `59800` / `6300` / `25%`:
- used 4 calls, 0 errors — but voucher left UNBOOKED → scored 0%
- text-only prompt (no PDF), so no address/bank data to extract
- 4 calls:
  1. `POST /supplier` → supplier `108391283`
  2. `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*`
  3. `POST /ledger/voucher/importDocument` → voucher `609080159` (accessed via `values[0]`)
  4. `PUT /ledger/voucher/{id}?sendToLedger=false` with `vatType: { id: 1 }`, `row: 1`/`row: 2`
- final state: expense 6300 amount=47840 amountGross=59800 vatType.id=1; supplier -59800; system VAT 11960
- **root cause of 0% score**: missing step 5 `PUT /ledger/voucher/{id}?sendToLedger=true` — voucher stayed at number=0 (unbooked)

## Sandbox Proof — 5-call Path with Booking (CORRECT)

2026-03-21 sandbox proof of the two-step booking:
- full 5-call flow: POST supplier → GET account → POST importDocument → PUT sendToLedger=false → PUT sendToLedger=true
- supplier `108398155` (ledger account `424190921`), expense account 6300 (`424191117`)
- import returned voucher `609097742` version 1
- PUT sendToLedger=false with postings: OK, returned version 2
- PUT sendToLedger=true with only `{ version: 2 }` (NO postings): OK
- voucher booked with number=296 (was number=0 before booking step)
- supplierInvoice: amount=-59800, outstandingAmount=59800
- postings: expense 6300 amount=47840 amountGross=59800 vatType=1; supplier -59800; system VAT 11960
- this proves the booking step is essential for scoring

## Critical Implementation Details

### importDocument response shape
- `POST /ledger/voucher/importDocument` returns a **list wrapper**: `{ values: [{ id, version, ... }] }`
- extract the voucher from `response.values[0].id` and `response.values[0].version`
- do NOT use `response.value.id` — that field does not exist and will crash
- this mismatch from the typical single-object `{ value: {...} }` wrapper caused a 4-call recovery penalty in the 2026-03-21 production run

### PUT postings require explicit row values
- always include `row: 1` on the debit posting and `row: 2` on the supplier liability posting
- row `0` is reserved for the system-generated VAT posting
- omitting `row` causes `422 "Posteringene på rad 0 (guiRow 0) er systemgenererte og kan ikke opprettes eller endres på utsiden av Tripletex."`

### XML org number validation
- the org number in `EndpointID` and `CompanyID` must pass PEPPOL mod11 check
- random 9-digit numbers will fail `422`; use the real supplier org number from the prompt

### VAT rounding on non-reconciling PDF amounts
- when the PDF's net × (1 + VAT%) ≠ gross (e.g. net=41050, gross=51312, but 41050×1.25=51312.5), Tripletex recalculates net from gross
- stored net = gross / 1.25, stored VAT = gross - net
- this is unavoidable system behavior; the sent `amount` value is overridden
- does not affect scoring since the scorer checks Tripletex state

## Reusable Heuristics

- if the task says register a supplier invoice, optimize for creating a real `supplierInvoice` object, not just a balanced voucher
- import first, mutate second
- in the voucher update, keep the header immutable and change only `postings`
- if the balance is wrong, add currency amounts
- if VAT is wrong, add explicit debit `vatType`
- if XML import fails, fix the XML structure; do not pivot back to the old voucher-first path
- always access the importDocument response via `values[0]`, never via `value`
- always set explicit `row` values on PUT postings (1 for debit, 2 for supplier)
- for 25% incoming VAT, hard-code `vatType: { id: 1 }` — do not waste a call on `GET /ledger/vatType`
- `account: { number: ... }` and `account: { number: ..., name: ... }` do NOT work in PUT postings — only `account: { id }` is accepted; the GET /ledger/account lookup is still required
- ALWAYS book the voucher after setting postings: `PUT sendToLedger=true` with only `{ version }` — without this the voucher is unbooked and scores 0%
- NEVER send postings in the booking PUT — only send `{ version }`
- preserve the prompt description's exact casing — do NOT capitalize or normalize; if the prompt says "kontortjenester" use exactly that, not "Kontortjenester"
