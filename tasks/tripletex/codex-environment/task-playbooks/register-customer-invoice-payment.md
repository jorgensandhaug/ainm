# Register Customer Invoice Payment

## Scope

Use for tasks like:
- register full payment on an existing outgoing customer invoice
- locate the invoice from prompt facts such as customer organization number, ex-VAT amount, and line/service description
- mark the invoice fully paid without creating reminders, credit notes, or vouchers manually

Do not use for:
- creating the invoice itself
- sending the invoice
- reversing or deleting invoice/accounting entries
- explicit foreign-currency settlement tasks that give a new exchange rate and require realized FX-loss booking

## Key Findings

- The payment write is `PUT /invoice/{id}/:payment`
- Required query parameters are:
  - `paymentDate`
  - `paymentTypeId`
  - `paidAmount`
- `GET /invoice` requires both `invoiceDateFrom` and `invoiceDateTo`; omitting either returns `422`
- `PUT /invoice/{id}/:payment` parameters (`paymentDate`, `paymentTypeId`, `paidAmount`) must be **query parameters**, NOT a JSON request body; sending them as JSON body causes `422` with all fields reported as null
- `customerOrganizationNumber` and `invoiceStatus` are NOT valid query parameters on `GET /invoice` (not in OpenAPI spec) and are silently ignored by the server; the only valid customer filter is `customerId` (numeric)
- `fields=*` alone on `GET /invoice` returns ID-only references for nested objects; you MUST use `fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` to get `customer.organizationNumber` and `orderLines[].description` for local filtering
- `fields=*` alone on `GET /invoice/paymentType` returns ID-only references for `debitAccount`; you MUST use `fields=*,debitAccount(*),creditAccount(*)` to get `debitAccount.number` for selection
- A single decisive invoice read can often replace a separate `GET /customer` if the prompt already gives enough identifying facts
- The payment write response returns `ResponseWrapperInvoice`, and that response can verify the remaining outstanding amount directly
- `paymentTypeId` can be cached and reused within the same run for the same company/currency context
- cross-run `paymentTypeId` caching is not safe; ids vary across accounts and environments

Verified in sandbox on 2026-03-19:
- `GET /invoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2027-01-01&fields=*,customer(*),currency(*),orderLines(*),orders(*)` returned enough data to locate a unique invoice by:
  - `customer.organizationNumber`
  - `amountExcludingVatCurrency`
  - `orderLines[].description`
  - positive `amountCurrencyOutstanding`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable payment types including:
  - `32813747` `Kontant` with debit account `1900`
  - `32813748` `Betalt til bank` with debit account `1920`
- `PUT /invoice/{id}/:payment?...` updated the invoice and returned `remainingOutstanding = 0`
- re-verified on 2026-03-20 in persistent sandbox:
  - `Betalt til bank` (`id=32813748`) had `debitAccount.number=1920`, `isBankAccount=true`, `isInvoiceAccount=true`, and `creditAccount=null`
  - despite `creditAccount=null`, `PUT /invoice/{id}/:payment?...` with that payment type still reduced `remainingOutstanding` to `0`
  - `PUT /invoice/{id}/:payment?...` without `paymentTypeId` failed with `422` and validation message `paymentTypeId: Kan ikke være null.`
  - ordinary `GET /invoice?...fields=*` responses did not expose a reusable incoming payment-type id, so there is no proven public 2-call standalone shortcut from invoice read alone
  - same-day persistent sandbox re-proof on invoice `2147531841` again settled the invoice in exactly `3` calls, and the invoice read still had no reusable `paymentTypeId`
  - same-day persistent sandbox re-proof on invoice `2147551675` again settled the invoice in exactly `3` calls; the locate read exposed no reusable payment-related fields at all, and the usable incoming bank payment type still had `name=null`

Verified in production on 2026-03-20:
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147540787` for customer `866440034` by `amountExcludingVatCurrency=30000`, line description `Almacenamiento en la nube`, and positive `amountCurrencyOutstanding=37500`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `27076191`
- `PUT /invoice/2147540787/:payment?paymentDate=2026-03-20&paymentTypeId=27076191&paidAmount=37500` reduced the remaining outstanding amount to `0`
- this production run reconfirmed that the prompt ex-VAT amount was only the locator, not the payment amount
- `GET /invoice?invoiceDateFrom=2024-01-01&invoiceDateTo=2027-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147540820` for customer `830362894` by `amountExcludingVatCurrency=32200`, line description `System Development`, and positive `amountCurrencyOutstanding=40250`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `27077955`
- `PUT /invoice/2147540820/:payment?paymentDate=2026-03-20&paymentTypeId=27077955&paidAmount=40250` reduced the remaining outstanding amount to `0`
- this second production run on the same exact task shape reconfirmed that the prompt ex-VAT amount was only the locator, not the payment amount
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147540727` for customer `939210970` by `amountExcludingVatCurrency=23900`, line description `Manutenção`, and positive `amountCurrencyOutstanding=29875`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `27116469`
- `PUT /invoice/2147540727/:payment?paymentDate=2026-03-20&paymentTypeId=27116469&paidAmount=29875` reduced the remaining outstanding amount to `0`
- this Portuguese production run reconfirmed that prompt language does not change the path and that a prompt saying `sem IVA` still uses the invoice object's live outstanding amount for `paidAmount`
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147541069` for customer `891380690` by `amountExcludingVatCurrency=10100`, line description `Konsulenttimer`, and positive `amountCurrencyOutstanding=12625`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `27093292`
- `PUT /invoice/2147541069/:payment?paymentDate=2026-03-20&paymentTypeId=27093292&paidAmount=12625` reduced the remaining outstanding amount to `0`
- this third Norwegian production run on the same exact task shape reconfirmed that the prompt ex-VAT amount was only the locator, not the payment amount
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147541030` for customer `913245539` by `amountExcludingVatCurrency=36450`, line description `Session de formation`, and positive `amountCurrencyOutstanding=45562.5`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `27087363`
- `PUT /invoice/2147541030/:payment?paymentDate=2026-03-20&paymentTypeId=27087363&paidAmount=45562.5` reduced the remaining outstanding amount to `0`
- this third production run on the same exact task shape reconfirmed that prompt language does not change the path and that the prompt ex-VAT amount was only the locator, not the payment amount
- same-day persistent sandbox re-proof on analog invoice `2147531840` (`907791616` + `6200` + `Fakturerbart arbeid sandbox proof`) again settled the invoice in exactly `3` calls; the invoice read exposed no payment-related keys at all, and `GET /invoice/paymentType` still returned usable incoming bank payment type `32813748` with `name=null`, `creditAccount=null`, `debitAccount.number=1920`, `isBankAccount=true`, and `isInvoiceAccount=true`
- that same sandbox account contained `4` unpaid analogs for the same `customer.organizationNumber + exact ex-VAT amount + exact line description`, so persistent-sandbox duplicate noise is not proof that the fresh-account production task shape needs an extra resolver read
- same-day persistent sandbox re-proof on invoice `2147551798` for customer `841254546`, ex-VAT amount `28500`, and line description `System Development` again finished in exactly `3` calls and used incoming bank payment type `32813748`

Verified in production on 2026-03-21:
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147567128` for customer `896571559` by `amountExcludingVatCurrency=15200`, line description `Datarådgivning`, and positive `amountCurrencyOutstanding=19000`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `27869893` with debit account `1920`
- `PUT /invoice/2147567128/:payment?paymentDate=2026-03-21&paymentTypeId=27869893&paidAmount=19000` reduced the remaining outstanding amount to `0`
- same-day persistent sandbox re-proof confirmed `GET /invoice?...&fields=*,paymentType(*)` returns `400`, so there is no field-expansion shortcut to embed a reusable `paymentTypeId` inside the invoice locate read; the standalone `3`-call floor remains proven
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147572074` for customer `909268265` by `amountExcludingVatCurrency=31300`, line description `Konsulenttimer`, and positive `amountCurrencyOutstanding=39125`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `28180406` (`Betalt til bank`)
- `PUT /invoice/2147572074/:payment?paymentDate=2026-03-21&paymentTypeId=28180406&paidAmount=39125` reduced the remaining outstanding amount to `0`
- this run initially wasted 3 extra calls (6 total) due to: (a) omitting required date params on GET /invoice → avoidable 422, (b) using `fields=*` without expansions → null descriptions → logic failure → repeat GET, (c) sending PUT /:payment params as JSON body → avoidable 422
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147573361` for customer `841333608` by `amountExcludingVatCurrency=14200`, line description `Skylagring`, and positive `amountCurrencyOutstanding=17750`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `28273555` (`Betalt til bank`, debit `1920`)
- `PUT /invoice/2147573361/:payment?paymentDate=2026-03-21&paymentTypeId=28273555&paidAmount=17750` reduced the remaining outstanding amount to `0`
- this run matched the trusted standard exactly: 3 calls, 0 errors, zero wasted calls
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147574550` for customer `888415769` by `amountExcludingVatCurrency=32800`, line description `Datenberatung`, and positive `amountCurrencyOutstanding=41000`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `28351269` (`Betalt til bank`, debit `1920`)
- `PUT /invoice/2147574550/:payment?paymentDate=2026-03-21&paymentTypeId=28351269&paidAmount=41000` reduced the remaining outstanding amount to `0`
- this German-language run matched the trusted standard exactly: 3 calls, 0 errors, zero wasted calls
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147574655` for customer `924324104` by `amountExcludingVatCurrency=44750`, line description `Cloud Storage`, and positive `amountCurrencyOutstanding=55937.5`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `28358423` (`Betalt til bank`, debit `1920`)
- `PUT /invoice/2147574655/:payment?paymentDate=2026-03-21&paymentTypeId=28358423&paidAmount=55937.5` reduced the remaining outstanding amount to `0`
- this English-language run matched the trusted standard exactly: 3 calls, 0 errors, zero wasted calls; 12th production confirmation of this task shape

Verified in production on 2026-03-21 (continued):
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147575109` for customer `975013723` by `amountExcludingVatCurrency=45100`, line description `Licence logicielle`, and positive `amountCurrencyOutstanding=56375`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `28394732` (`Betalt til bank`, debit `1920`)
- `PUT /invoice/2147575109/:payment?paymentDate=2026-03-21&paymentTypeId=28394732&paidAmount=56375` reduced the remaining outstanding amount to `0`
- this French-language run matched the trusted standard exactly: 3 calls, 0 errors, zero wasted calls; 13th production confirmation of this task shape
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147575326` for customer `939210970` by `amountExcludingVatCurrency=23900`, line description `Manutenção`, and positive `amountCurrencyOutstanding=29875`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `28406443` (`Betalt til bank`, debit `1920`)
- `PUT /invoice/2147575326/:payment?paymentDate=2026-03-21&paymentTypeId=28406443&paidAmount=29875` reduced the remaining outstanding amount to `0`
- this Portuguese-language run matched the trusted standard exactly: 3 calls, 0 errors, zero wasted calls; 14th production confirmation of this task shape; second Portuguese confirmation
- `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` uniquely located invoice `2147575475` for customer `866946108` by `amountExcludingVatCurrency=43300`, line description `Sesión de formación`, and positive `amountCurrencyOutstanding=54125`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming payment type `28417664` (`Betalt til bank`, debit `1920`)
- `PUT /invoice/2147575475/:payment?paymentDate=2026-03-21&paymentTypeId=28417664&paidAmount=54125` reduced the remaining outstanding amount to `0`
- this Spanish-language run matched the trusted standard exactly: 3 calls, 0 errors, zero wasted calls; 15th production confirmation of this task shape; second Spanish confirmation

Observed production/account variance:
- payment type ids differed across successful runs and environments, for example `26150973`, `26185322`, `26292975`, `26293906`, `26295180`, `26301697`, `26308312`, `26309488`, production `27076191`, production `27077955`, and sandbox `32813748`
- therefore cache resolved incoming payment types only in-memory within the same run; do not persist or trust a cross-run id cache
- production `27869893` added on 2026-03-21
- production `28180406` added on 2026-03-21
- production `28273555` added on 2026-03-21
- production `28351269` added on 2026-03-21
- production `28358423` added on 2026-03-21
- production `28394732` added on 2026-03-21
- production `28406443` added on 2026-03-21
- production `28417664` added on 2026-03-21

## Minimal Flow

1. Confirm these operations in `./openapi.json`
   - `GET /invoice`
   - `GET /invoice/paymentType`
   - `PUT /invoice/{id}/:payment`
2. Locate the invoice with one decisive read
   - usually `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`
3. Filter locally to the single correct invoice
   - exact customer organization number if provided
   - exact ex-VAT amount from `amountExcludingVatCurrency` or `amountExcludingVat`
   - positive `amountCurrencyOutstanding` or `amountOutstanding`
   - prompt text match in `orderLines[].description`, `orderLines[].displayName`, `orders[].orderLines[].description`, `orders[].invoiceComment`, or nearby invoice text fields
4. Reuse a previously resolved same-run incoming payment type if available
   - only when it was resolved earlier in the same run for the same company and invoice currency
5. Otherwise resolve one usable payment type
   - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
   - prefer a bank-style incoming payment type when available, typically debit account `19xx`
   - if available, prefer `isBankAccount=true` or `isInvoiceAccount=true` on that debit account
   - do not reject the candidate just because `creditAccount` is `null`
6. Register full payment
   - `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<outstanding>`
7. Verify from the write response
   - prefer `amountCurrencyOutstanding`
   - otherwise `amountOutstanding`
   - stop if it is `0`

## Canonical Call Count

- standalone exact-match payment task with no cached same-run `paymentTypeId`: `3` calls
- if the same run already holds a proven valid incoming `paymentTypeId`: `2` calls
- do not claim a cross-run 2-call path unless the prompt explicitly gives the exact `paymentTypeId`
- the 2026-03-20 Portuguese production run plus same-day persistent-sandbox re-proof still found no public `2`-call standalone shortcut from prompt facts alone

## Payment Amount Rules

- Do not derive the payment amount from the prompt’s ex-VAT amount
- Use the outstanding amount returned by the located invoice:
  - `amountCurrencyOutstanding` first
  - otherwise `amountOutstanding`
- This ordinary rule does not cover explicit foreign-currency settlement prompts where Tripletex expects `paidAmount` in the payment-type currency and `paidAmountCurrency` in the invoice currency; use the dedicated foreign-currency payment standard for that shape
- exact-match production proof on 2026-03-20: prompt locator `30000` ex VAT for `Almacenamiento en la nube` still required `paidAmount=37500`
- exact-match production proof on 2026-03-20: prompt locator `32200` ex VAT for `System Development` still required `paidAmount=40250`
- exact-match production proof on 2026-03-20: Portuguese prompt locator `23900` ex VAT for `Manutenção` still required `paidAmount=29875`
- This avoids incorrect VAT assumptions and avoids partial/over-payments when reminders, alternate currencies, or non-standard VAT setups exist
- Only send `paidAmountCurrency` when the invoice currency differs from the payment type currency and the endpoint requires both values

## Payment Type Rules

- Do not guess the payment type ID
- Read from `GET /invoice/paymentType` unless the same run already resolved a valid reusable incoming payment type for the same company/currency
- Normalize `debitAccount.number` and `creditAccount.number` before applying string-prefix checks; they may be returned as numbers rather than strings
- Do not require `paymentType.name`; persistent sandbox re-proof on 2026-03-20 showed a valid incoming bank payment type with `name=null`
- Prefer an ordinary bank payment type over niche/custom types when several are available
- Prefer a `19xx` debit account with `isBankAccount=true` or `isInvoiceAccount=true` when present; if those boolean flags are `undefined`, fall back to matching `description === "Betalt til bank"` or `debitAccount.number` starting with `19`
- Do not require a `15xx` credit account; `creditAccount` may be `null` on a valid incoming payment type such as `Betalt til bank`
- Do not persist a payment-type id cache across runs or accounts; successful ids vary materially between environments
- Do not attempt to omit `paymentTypeId` from the payment write; sandbox re-check returned `422 paymentTypeId: Kan ikke være null.`

## Common Pitfalls (each caused wasted calls in production)

1. **Missing date params on GET /invoice**: `invoiceDateFrom` and `invoiceDateTo` are both required; omitting them returns `422`
2. **JSON body on PUT /:payment**: all parameters (`paymentDate`, `paymentTypeId`, `paidAmount`) must be query parameters; a JSON body causes `422` with all fields null
3. **Insufficient field expansion**: `fields=*` alone returns ID-only references for nested objects; use `fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` on GET /invoice and `fields=*,debitAccount(*),creditAccount(*)` on GET /invoice/paymentType
4. **Fake server-side filters**: `customerOrganizationNumber` and `invoiceStatus` are NOT valid GET /invoice params and are silently ignored; always filter locally after expanding with `customer(*)`
5. **Non-resumable scripts**: each script should separate locate/resolve/pay into independent steps or cache results between runs to avoid repeating successful calls on retry

## If You Still Need to Probe

- First inspect the `GET /invoice` result before doing any write
- If the invoice search is ambiguous, only then add one extra read such as `GET /customer?organizationNumber=...&fields=*`
- Do not add that `GET /customer` just because a persistent sandbox account has duplicate unpaid analogs; in fresh-account production, exact `organizationNumber + ex-VAT amount + line description` has repeatedly been sufficient
- In the 2026-03-20 persistent sandbox re-proof, all `4` matching analogs shared the same customer, so that `GET /customer` still did not disambiguate which invoice to pay. Treat that ambiguity as sandbox-only noise unless the prompt provides another resolver field
- Reuse the located invoice object for:
  - payment amount
  - currency context
  - verification target
- Reuse the same-run resolved `paymentTypeId` whenever later steps in the same run need another incoming customer-invoice payment
- Do not add a follow-up `GET /invoice/{id}` if the payment write response already proves `amountOutstanding = 0`
