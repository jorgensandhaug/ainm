# Create Customer Invoice Credit Note

## Scope

Use for tasks like:
- issue a full credit note for one existing outgoing customer invoice
- locate the original invoice from prompt facts such as customer organization number, ex-VAT amount, and invoice-line/service description
- reverse the full invoice without manually touching vouchers or payments

Do not use for:
- partial credit notes
- payment reversals
- creating the original invoice first
- tasks that explicitly require sending the credit note unless you have already confirmed the correct send behavior

## Key Findings

- the correct full-credit endpoint is `PUT /invoice/{id}/:createCreditNote`
- required query parameter:
  - `date`
- optional but important query parameter:
  - `sendToCustomer`
- `GET /invoice` requires both `invoiceDateFrom` and `invoiceDateTo`
- a single decisive invoice read can often replace a separate `GET /customer` if the prompt already gives enough identifying facts
- the credit-note write returns `ResponseWrapperInvoice`, and in sandbox it returned the created credit note itself, not just the updated original invoice
- for prompts without an exact invoice id, two API calls are the minimal realistic path
- a one-call path exists only when the prompt already gives the exact invoice id

Verified on 2026-03-20:
- original production run succeeded in two API calls:
  - `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
  - `PUT /invoice/{id}/:createCreditNote?date=2026-03-20&sendToCustomer=false`
- the exact successful production prompt shape was:
  - `customer.organizationNumber=900993560`
  - `amountExcludingVatCurrency=30500`
  - `description="Maintenance"`
- that production run was already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no voucher lookup or reversal
- a second production run on 2026-03-20 again succeeded in the same two API calls for:
  - `customer.organizationNumber=812449982`
  - `amountExcludingVatCurrency=45300`
  - `description="Datarådgjeving"`
- that second production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
- a third production run on 2026-03-20 again succeeded in the same two API calls for:
  - `customer.organizationNumber=973999966`
  - `amountExcludingVatCurrency=40800`
  - `description="Conseil en données"`
- that third production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
- a fourth production run on 2026-03-20 again succeeded in the same two API calls for:
  - `customer.organizationNumber=882988155`
  - `amountExcludingVatCurrency=40900`
  - `description="Heures de conseil"`
- that fourth production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
- a fifth production run on 2026-03-20 again succeeded in the same two API calls for:
  - `customer.organizationNumber=991882502`
  - `amountExcludingVatCurrency=13100`
  - `description="Opplæring"`
- that fifth production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
- a sixth production run on 2026-03-20 again succeeded in the same two API calls for:
  - `customer.organizationNumber=962075754`
  - `amountExcludingVatCurrency=30200`
  - `description="Analysebericht"`
- that sixth production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
- persistent-sandbox re-verification created a fixture invoice and then proved that:
  - one `GET /invoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2027-01-01&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` was enough to locate the unique target invoice by:
    - `customer.organizationNumber`
    - `amountExcludingVat` or `amountExcludingVatCurrency`
    - exact `orderLines[].description` / `orders[].orderLines[].description`
    - `isCreditNote != true`
    - `isCredited != true`
  - the same exact line description can appear in both `orderLines[]` and `orders[].orderLines[]` on that one invoice; keep uniqueness at the invoice id level instead of treating duplicate line hits as ambiguity
  - `PUT /invoice/{id}/:createCreditNote?date=2026-03-20&sendToCustomer=false` returned a new invoice object with:
    - `isCreditNote=true`
    - `creditedInvoice=<original invoice id>`
    - its own credit-note `id`
    - its own credit-note `invoiceNumber`
  - a disposable sandbox fixture matching the current production-style facts `description="Datarådgjeving"` and `amountExcludingVatCurrency=45300` again proved the same two-call core after setup
  - on that disposable `Datarådgjeving` fixture, the locate read showed two identical description hits across top-level and nested line arrays on the same invoice; dedupe at the invoice id and keep the flow at two API calls
  - a disposable sandbox fixture matching the exact production identifiers `organizationNumber=900993560`, `description="Maintenance"`, `amountExcludingVatCurrency=30500` again proved the same two-call core after setup
  - on that exact-identifier fixture, the locate read still showed duplicate `Maintenance` hits across top-level and nested line arrays on the same invoice, and the write response alone still proved success
  - a disposable sandbox fixture matching the exact production identifiers `organizationNumber=973999966`, `description="Conseil en données"`, `amountExcludingVatCurrency=40800` again proved the same two-call core after setup
  - on that exact-identifier French fixture, the locate read still showed duplicate `Conseil en données` hits across top-level and nested line arrays on the same invoice, and the write response alone still proved success
  - a disposable sandbox analog matching this production task shape with exact `description="Heures de conseil"` and `amountExcludingVatCurrency=40900` again proved the same two-call core after setup
  - on that `Heures de conseil` analog, the decisive locate read uniquely matched the fixture invoice by organization number + exact amount + exact line description, the same description still appeared across top-level and nested line arrays on the same invoice, and the `:createCreditNote` write returned a distinct credit note with `isCreditNote=true` and `creditedInvoice=<original id>` and still needed no follow-up read
  - a disposable sandbox analog matching this production task shape with exact `description="Opplæring"` and `amountExcludingVatCurrency=13100` again proved the same two-call core after setup
  - on that `Opplæring` analog, the decisive locate read uniquely matched the fixture invoice by organization number + exact amount + exact line description, and the `:createCreditNote` write returned a distinct credit note with `isCreditNote=true` and `creditedInvoice=<original id>` and still needed no follow-up read
  - a disposable sandbox analog matching this production task shape with exact `description="Analysebericht"` and `amountExcludingVatCurrency=30200` again proved the same two-call core after setup
  - on that `Analysebericht` analog, the decisive locate read uniquely matched the fixture invoice by organization number + exact amount + exact line description, and the `:createCreditNote` write returned a distinct credit note with `isCreditNote=true` and `creditedInvoice=<original id>` and still needed no follow-up read

Verified on 2026-03-21:
- a seventh production run succeeded in the same two API calls for:
  - `customer.organizationNumber=996887898`
  - `amountExcludingVatCurrency=19200`
  - `description="Vedlikehold"`
- that seventh production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
- an eighth production run succeeded in the same two API calls for:
  - `customer.organizationNumber=911680521`
  - `amountExcludingVatCurrency=8050`
  - `description="Systemutvikling"`
- that eighth production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
  - correctness=1.0, normalized_score=4 (tied best), 5/5 checks passed
- persistent-sandbox re-verification on 2026-03-21 with a disposable fixture matching `organizationNumber=911680521`, `description="Systemutvikling"`, `amountExcludingVatCurrency=8050` again proved the same two-call core after setup
- a ninth production run succeeded in the same two API calls for:
  - `customer.organizationNumber=812449982`
  - `amountExcludingVatCurrency=45300`
  - `description="Datarådgjeving"`
- this is the second production confirmation for this exact prompt shape (first was 2026-03-20):
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
  - 2 API calls, 0 errors
- a tenth production run succeeded in the same two API calls for:
  - `customer.organizationNumber=991882502`
  - `amountExcludingVatCurrency=13100`
  - `description="Opplæring"`
- this is the second production confirmation for this exact prompt shape (first was 2026-03-20):
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
  - 2 API calls, 0 errors
- an eleventh production run succeeded in the same two API calls for:
  - `customer.organizationNumber=962467210`
  - `amountExcludingVatCurrency=41600`
  - `description="Nettverkstjeneste"`
- that eleventh production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
  - 2 API calls, 0 errors
- persistent-sandbox re-verification on 2026-03-21 with a disposable fixture matching `organizationNumber=962467210`, `description="Nettverkstjeneste"`, `amountExcludingVatCurrency=41600` again proved the same two-call core after setup

Verified on 2026-03-22:
- a twelfth production run succeeded in the same two API calls for:
  - `customer.organizationNumber=978503071`
  - `amountExcludingVatCurrency=25450`
  - `description="Licencia de software"` (Spanish prompt)
- that twelfth production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
  - 2 API calls, 0 errors
- persistent-sandbox re-verification on 2026-03-22 with a disposable fixture matching `organizationNumber=978503071`, `description="Licencia de software"`, `amountExcludingVatCurrency=25450` again proved the same two-call core after setup
- a thirteenth production run succeeded in the same two API calls for:
  - `customer.organizationNumber=866100829`
  - `amountExcludingVatCurrency=9900`
  - `description="Webdesign"` (Norwegian prompt)
- that thirteenth production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
  - 2 API calls, 0 errors
- persistent-sandbox re-verification on 2026-03-22 with a disposable fixture matching `organizationNumber=866100829`, `description="Webdesign"`, `amountExcludingVatCurrency=9900` again proved the same two-call core after setup
- a fourteenth production run succeeded in the same two API calls for:
  - `customer.organizationNumber=901668566`
  - `amountExcludingVatCurrency=38800`
  - `description="Webdesign"` (German prompt)
- that fourteenth production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
  - 2 API calls, 0 errors
- persistent-sandbox re-verification on 2026-03-22 with a disposable fixture matching `organizationNumber=901668566`, `description="Webdesign"`, `amountExcludingVatCurrency=38800` again proved the same two-call core after setup
- a fifteenth production run succeeded in the same two API calls for:
  - `customer.organizationNumber=902392165`
  - `amountExcludingVatCurrency=47350`
  - `description="Programvarelisens"` (Norwegian nynorsk prompt)
- that fifteenth production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
  - 2 API calls, 0 errors
- persistent-sandbox re-verification on 2026-03-22 with a disposable fixture matching `organizationNumber=902392165`, `description="Programvarelisens"`, `amountExcludingVatCurrency=47350` again proved the same two-call core after setup
- 16 consecutive optimal production runs across en/nb/nn/es/fr/de confirm the standard is fully language-independent and stable
- a sixteenth production run succeeded in the same two API calls for:
  - `customer.organizationNumber=871338140`
  - `amountExcludingVatCurrency=39850`
  - `description="Diseño web"` (Spanish prompt)
- that sixteenth production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
  - 2 API calls, 0 errors
- persistent-sandbox re-verification on 2026-03-22 with a disposable fixture matching `organizationNumber=871338140`, `description="Diseño web"`, `amountExcludingVatCurrency=39850` again proved the same two-call core after setup
- 17 consecutive optimal production runs across en/nb/nn/es/fr/de confirm the standard is fully language-independent and stable
- an eighteenth production run succeeded in the same two API calls for:
  - `customer.organizationNumber=910441930`
  - `amountExcludingVatCurrency=6150`
  - `description="Rapport d'analyse"` (French prompt)
- that eighteenth production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
  - 2 API calls, 0 errors
- persistent-sandbox re-verification on 2026-03-22 with a disposable fixture matching `organizationNumber=910441930`, `description="Rapport d'analyse"`, `amountExcludingVatCurrency=6150` again proved the same two-call core after setup
- a nineteenth production run succeeded in the same two API calls for:
  - `customer.organizationNumber=989339028`
  - `amountExcludingVatCurrency=19650`
  - `description="Maintenance"` (English prompt)
- that nineteenth production run was also already minimal-call for this prompt shape:
  - no `GET /customer`
  - no `GET /invoice/{id}`
  - no extra `openapi.json` confirmation was needed once the trusted standard already matched
  - 2 API calls, 0 errors
- persistent-sandbox re-verification on 2026-03-22 with a disposable fixture matching `organizationNumber=989339028`, `description="Maintenance"`, `amountExcludingVatCurrency=19650` again proved the same two-call core after setup
- 19 consecutive optimal production runs across en/nb/nn/es/fr/de confirm the standard is fully language-independent and stable

## Minimal Flow

1. Confirm these operations in `./openapi.json`
   - `GET /invoice`
   - `PUT /invoice/{id}/:createCreditNote`
2. Locate the original invoice with one decisive read
   - usually `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
   - if the prompt gives no invoice date, default to one wide but bounded window such as `invoiceDateFrom=2000-01-01` and `invoiceDateTo=<run-date-plus-one-day>`
3. Filter locally to the correct invoice
   - exact customer organization number if provided
   - exact ex-VAT amount from `amountExcludingVatCurrency` or `amountExcludingVat`
   - exact prompt text match in `orderLines[].description` or `orders[].orderLines[].description`
   - if the same exact description appears in both arrays on one invoice, still count that as one invoice candidate
   - exclude `isCreditNote=true`
   - exclude `isCredited=true`
   - if multiple invoices match all criteria identically (same customer, same amount, same description), pick the one with the highest `id` (most recently created) — do NOT fail or spend an extra resolver call
4. Create the full credit note
   - `PUT /invoice/{id}/:createCreditNote?date=<date>&sendToCustomer=false`
5. Verify from the write response
   - prefer `isCreditNote`
   - verify `creditedInvoice=<original id>`
   - reuse the returned credit-note `id` and `invoiceNumber`
6. Stop

## Exact-Match Fast Path

- For a prompt that:
  - identifies an existing outgoing invoice by customer organization number
  - gives the invoice line/service description
  - gives the ex-VAT amount
  - asks only for a full credit note, not sending or payment reversal
- the winning path is:
  1. `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
  2. `PUT /invoice/{id}/:createCreditNote?date=<date>&sendToCustomer=false`
- that two-call path is already minimal for this prompt shape
- for the exact `900993560` + `Maintenance` + `30500` prompt shape, do not try to improve it with a separate customer lookup; that only adds waste
- only skip step 1 when the prompt already provides the exact invoice id
- do not insert:
  - `GET /customer`
  - `GET /invoice/{id}`
  - manual voucher reads/reversals
  - manual negative-invoice creation

## Locate Rules

- `GET /invoice` only returns charged outgoing invoices, which is the right family for this task shape
- use a wide but bounded date window
- when filtering locally, check both invoice-level and nested line-level fields
- if the same description appears in both top-level and nested line arrays on one invoice, dedupe at the invoice level
- prefer exact string matching on the prompt’s description before broader fuzzy matching
- preserve exact Unicode in the prompt description; do not ASCII-normalize strings such as `Conseil en données`
- if the locate result returns multiple candidates with DIFFERENT customers, amounts, or descriptions, only then add one extra targeted resolver such as `GET /customer?organizationNumber=...&fields=*`
- if multiple candidates are truly identical (same customer org number, same amount, same description), that is NOT ambiguity — pick the highest `id` and proceed; do NOT spend an extra call

## Send And Verification Rules

- default to `sendToCustomer=false`
- do not rely on the endpoint default, because the default is sending-enabled and can trigger unintended dispatch behavior
- the write response can already prove success when it returns a credit-note invoice object with:
  - `isCreditNote=true`
  - `creditedInvoice=<original id>`
- do not spend a follow-up `GET /invoice/{id}` when that write response already proves the reversal

## Avoidable Mistakes

- do not guess the action path as `:credit`; the verified endpoint is `:createCreditNote`
- do not fetch the customer separately when one `GET /invoice` already contains `customer.organizationNumber`
- do not treat duplicate description hits from `orderLines[]` plus `orders[].orderLines[]` on the same invoice as proof that multiple invoices matched
- do not use a voucher reversal for this task shape; voucher reversal belongs to payment-reversal workflows
- do not create a manual negative invoice as a substitute for the built-in credit-note action
- do not leave `sendToCustomer` at the default when the task only asks to issue the credit note, not send it
- do not fail or exit when multiple invoices match all criteria identically — the production environment can have duplicate invoices; pick the highest `id` and proceed
- do not spend an extra GET to "inspect" candidates that the first GET already returned; all candidate data is in the first response
