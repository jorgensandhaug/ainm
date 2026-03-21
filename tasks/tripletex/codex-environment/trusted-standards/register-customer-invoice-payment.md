# Register Customer Invoice Payment

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- register full payment on one existing outgoing customer invoice
- prompt identifies the invoice strongly enough to find it in one decisive read
- no need to create the invoice first in the same task
- same-run context does not already contain the exact invoice id

## Do Not Use This Standard If
- task includes creating the order/invoice first
- task is supplier invoice payment
- prompt explicitly asks to settle a foreign-currency invoice at a new exchange rate and book the realized FX loss
- prompt is too ambiguous to identify one invoice safely

## Standard Flow
1. `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` to identify the exact unpaid invoice
2. filter locally by `customer.organizationNumber`, `amountExcludingVatCurrency`, positive `amountCurrencyOutstanding`, and order-line description match
3. Reuse a previously resolved same-run incoming `paymentTypeId` if one is already known for the same company and currency
4. Otherwise `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` once to resolve a valid incoming payment type
5. `PUT /invoice/{id}/:payment?paymentDate=<YYYY-MM-DD>&paymentTypeId=<id>&paidAmount=<amountCurrencyOutstanding>` — all parameters are **query parameters**, NOT a JSON body
6. verify from payment write response
7. stop

## Critical API Shape Notes
- `GET /invoice` requires both `invoiceDateFrom` and `invoiceDateTo`; omitting either returns `422`
- `fields=*` alone returns ID-only references for nested objects (`orderLines`, `customer`, `orders`); you MUST use `fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` to get descriptions and org numbers for local filtering
- `customerOrganizationNumber` and `invoiceStatus` are NOT valid query parameters on `GET /invoice` (not in OpenAPI spec) and are silently ignored; always filter locally after expanding with `customer(*)`
- the only valid customer-scoping param is `customerId` (requires knowing the numeric ID, which would add a `GET /customer` call)
- `GET /invoice/paymentType` with `fields=*` alone does not expand debit/credit accounts; use `fields=*,debitAccount(*),creditAccount(*)` to get `debitAccount.number` for selection
- `PUT /invoice/{id}/:payment` takes `paymentDate`, `paymentTypeId`, `paidAmount` (and optional `paidAmountCurrency`) as **query parameters**; sending them as a JSON request body causes `422` with all fields reported as null
- for payment type selection: prefer `description === "Betalt til bank"` or `debitAccount.number` starting with `19`; `isBankAccount` and `isInvoiceAccount` may not be consistently available across accounts

## Canonical Call Count
- standalone exact-match payment task with no cached same-run payment type: `3` calls
- same task shape with a cached same-run incoming `paymentTypeId`: `2` calls
- do not treat cross-run or cross-account cached ids as reusable
- the 2026-03-20 Portuguese production run plus same-day persistent-sandbox re-proof found no public `2`-call shortcut from prompt facts alone; without a same-run cached `paymentTypeId`, `3` calls remains the realistic floor

## Payload Rules
- identify invoice by prompt identifiers, not by guessing
- when paying, use actual outstanding amount from invoice object
- do not use the prompt lookup amount if the live outstanding amount differs
- for text matching, treat top-level `orderLines[]` and nested `orders[].orderLines[]` as one invoice-level evidence set
- normalize payment-type account numbers before heuristic matching
- do not require `paymentType.name`; valid incoming payment types can have `name=null`
- acceptable incoming payment types can have `creditAccount=null`
- `paymentTypeId` is required on `PUT /invoice/{id}/:payment`; omitting it is not a valid lower-call shortcut

## Reuse From Write Response
- invoice id from locate step
- outstanding amount from invoice locate step
- post-payment remaining amount from write response

## Verification
- default verification is zero extra calls after payment write if response proves `amountOutstanding=0` or equivalent final state

## Known Recovery Branches
- if a larger multi-step flow already created order/invoice but failed before payment, resume at invoice locate step, do not rebuild earlier objects
- if the same run already resolved one valid incoming `paymentTypeId`, reuse it instead of reading `/invoice/paymentType` again
- if the decisive invoice read shows a true foreign-currency invoice and the prompt explicitly asks for realized FX-loss booking on settlement, switch to `./trusted-standards/register-foreign-currency-customer-invoice-payment.md` instead of reusing the ordinary `paidAmount=<live outstanding>` rule

## OpenAPI / Sandbox Status
- `/invoice/{id}/:payment` verified in `./openapi.json`
- locate-and-pay flow proven in existing payment playbook
- persistent sandbox re-check on 2026-03-20 confirmed `PUT /invoice/{id}/:payment` fails with `422 paymentTypeId: Kan ikke være null.` when `paymentTypeId` is omitted
- same-day persistent sandbox re-proof on invoice `2147531841` confirmed `GET /invoice?...fields=*` still did not expose a reusable incoming `paymentTypeId`, so the standalone public path is still `3` calls unless the same run already cached one
- 2026-03-20 production run for `866440034` + `30000` + `Almacenamiento en la nube` confirmed the exact `3`-call path `GET /invoice` -> `GET /invoice/paymentType` -> `PUT /invoice/{id}/:payment` and proved again that the paid amount must come from `amountCurrencyOutstanding`/`amountOutstanding` (`37500` there), not from the prompt lookup amount
- same-day persistent sandbox re-proof on invoice `2147551675` again settled the invoice in exactly `3` calls; the locate read exposed no reusable payment-related fields at all, and the chosen incoming bank payment type had `name=null`, `debitAccount.number=1920`, and `creditAccount=null`
- 2026-03-20 production run for `830362894` + `32200` + `System Development` confirmed the same exact `3`-call path and again required paying the invoice object's live outstanding amount (`40250` there), not the prompt lookup amount
- 2026-03-20 production run for `939210970` + `23900` + `Manutenção` confirmed the same exact `3`-call path on a Portuguese prompt, located invoice `2147540727`, and again required paying the live outstanding amount (`29875` there), not the prompt lookup amount
- 2026-03-20 production run for `891380690` + `10100` + `Konsulenttimer` confirmed the same exact `3`-call path, located invoice `2147541069`, and again required paying the invoice object's live outstanding amount (`12625` there), not the prompt lookup amount
- 2026-03-20 production run for `913245539` + `36450` + `Session de formation` confirmed the same exact `3`-call path on a French prompt, located invoice `2147541030`, and again required paying the live outstanding amount (`45562.5` there), not the prompt lookup amount
- same-day persistent sandbox re-proof on invoice `2147552467` again settled the invoice in exactly `3` calls; the locate read still exposed no reusable `paymentTypeId`, and the chosen incoming bank payment type remained `32813748` on debit account `1920`
- same-day persistent sandbox re-proof on analog invoice `2147531840` (`907791616` + `6200` + `Fakturerbart arbeid sandbox proof`) again settled the invoice in exactly `3` calls, and the locate read exposed no payment-related keys at all; the chosen incoming bank payment type was still `32813748` with `name=null`, `creditAccount=null`, `debitAccount.number=1920`, `isBankAccount=true`, and `isInvoiceAccount=true`
- same-day persistent sandbox re-proof on invoice `2147551798` (`841254546` + `28500` + `System Development`) again settled the invoice in exactly `3` calls, used payment type `32813748`, and reduced `remainingOutstanding` to `0`
- that same sandbox account also contained duplicate unpaid analogs for the same `customer.organizationNumber + exact ex-VAT amount + exact line description`; treat that as persistent-sandbox state noise, not as a reason to add a default `GET /customer` or weaken the fresh-account exact-match standard
- in the 2026-03-20 persistent sandbox re-proof, all `4` matching analogs belonged to the same customer, so `GET /customer?organizationNumber=...` was not a real disambiguation branch anyway; either rely on extra prompt fields or treat the ambiguity as sandbox-only proof noise rather than adding a wasted read
- 2026-03-21 production run for `896571559` + `15200` + `Datarådgivning` confirmed the same exact `3`-call path, located invoice `2147567128`, and again required paying the invoice object's live outstanding amount (`19000` there), not the prompt lookup amount; payment type was `27869893` with debit account `1920`
- same-day persistent sandbox re-proof confirmed `GET /invoice?...&fields=*,paymentType(*)` returns `400`, so there is no field-expansion shortcut to embed a reusable `paymentTypeId` inside the invoice locate read
- 2026-03-21 production run for `909268265` + `31300` + `Konsulenttimer` located invoice `2147572074` with live outstanding `39125`, used payment type `28180406` (`Betalt til bank`), and reduced remaining outstanding to `0`; this run wasted 3 extra calls (6 total) due to: (a) omitting required `invoiceDateFrom`/`invoiceDateTo` → avoidable 422, (b) using `fields=*` without nested expansions → null descriptions → script logic failure → repeated GET, (c) sending `PUT /:payment` params as JSON body instead of query parameters → avoidable 422
- same-day sandbox re-proof confirmed `customerOrganizationNumber` is silently ignored on `GET /invoice` (returns all invoices even with a nonexistent value); `invoiceStatus` is also silently ignored; only `customerId` (numeric ID) is a valid customer-scoping filter per OpenAPI spec
- same-day sandbox re-proof confirmed `fields=*` on `GET /invoice` returns `orderLines` as ID-only references without `description`; `customer(*)` expansion is required to get `organizationNumber`; `orderLines(*)` expansion is required to get `description`
- same-day sandbox re-proof confirmed `fields=*` on `GET /invoice/paymentType` returns `debitAccount` as ID-only reference without `number`; `debitAccount(*)` expansion is required; `isBankAccount` was `undefined` even with expansion on this account
- 2026-03-21 production run for `841333608` + `14200` + `Skylagring` confirmed the same exact `3`-call path, located invoice `2147573361` with live outstanding `17750`, used payment type `28273555` (`Betalt til bank`, debit `1920`), and reduced remaining outstanding to `0`; this run matched the trusted standard exactly with zero wasted calls or errors
- 2026-03-21 production run for `888415769` + `32800` + `Datenberatung` (German prompt) confirmed the same exact `3`-call path, located invoice `2147574550` with live outstanding `41000`, used payment type `28351269` (`Betalt til bank`, debit `1920`), and reduced remaining outstanding to `0`; this run matched the trusted standard exactly with zero wasted calls or errors
- same-day sandbox re-proof confirmed `GET /invoice?...&fields=*,voucher(*)` returns voucher fields but no payment-type info; `GET /ledger/account?number=1920` returns account info but no paymentTypeId; no 2-call standalone shortcut exists
- 2026-03-21 production run for `924324104` + `44750` + `Cloud Storage` confirmed the same exact `3`-call path, located invoice `2147574655` with live outstanding `55937.5`, used payment type `28358423` (`Betalt til bank`, debit `1920`), and reduced remaining outstanding to `0`; this run matched the trusted standard exactly with zero wasted calls or errors; 12th production confirmation of this task shape
