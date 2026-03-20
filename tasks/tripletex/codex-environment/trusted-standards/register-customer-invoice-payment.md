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
- prompt is too ambiguous to identify one invoice safely

## Standard Flow
1. `GET /invoice?...&fields=*` to identify the exact unpaid invoice
2. Reuse a previously resolved same-run incoming `paymentTypeId` if one is already known for the same company and currency
3. Otherwise `GET /invoice/paymentType?fields=*` once to resolve a valid incoming payment type
4. `PUT /invoice/{id}/:payment`
5. verify from payment write response
6. stop

## Canonical Call Count
- standalone exact-match payment task with no cached same-run payment type: `3` calls
- same task shape with a cached same-run incoming `paymentTypeId`: `2` calls
- do not treat cross-run or cross-account cached ids as reusable

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

## OpenAPI / Sandbox Status
- `/invoice/{id}/:payment` verified in `./openapi.json`
- locate-and-pay flow proven in existing payment playbook
- persistent sandbox re-check on 2026-03-20 confirmed `PUT /invoice/{id}/:payment` fails with `422 paymentTypeId: Kan ikke være null.` when `paymentTypeId` is omitted
- same-day persistent sandbox re-proof on invoice `2147531841` confirmed `GET /invoice?...fields=*` still did not expose a reusable incoming `paymentTypeId`, so the standalone public path is still `3` calls unless the same run already cached one
- 2026-03-20 production run for `866440034` + `30000` + `Almacenamiento en la nube` confirmed the exact `3`-call path `GET /invoice` -> `GET /invoice/paymentType` -> `PUT /invoice/{id}/:payment` and proved again that the paid amount must come from `amountCurrencyOutstanding`/`amountOutstanding` (`37500` there), not from the prompt lookup amount
- same-day persistent sandbox re-proof on invoice `2147551675` again settled the invoice in exactly `3` calls; the locate read exposed no reusable payment-related fields at all, and the chosen incoming bank payment type had `name=null`, `debitAccount.number=1920`, and `creditAccount=null`
- 2026-03-20 production run for `830362894` + `32200` + `System Development` confirmed the same exact `3`-call path and again required paying the invoice object's live outstanding amount (`40250` there), not the prompt lookup amount
- 2026-03-20 production run for `891380690` + `10100` + `Konsulenttimer` confirmed the same exact `3`-call path, located invoice `2147541069`, and again required paying the invoice object's live outstanding amount (`12625` there), not the prompt lookup amount
- 2026-03-20 production run for `913245539` + `36450` + `Session de formation` confirmed the same exact `3`-call path on a French prompt, located invoice `2147541030`, and again required paying the live outstanding amount (`45562.5` there), not the prompt lookup amount
- same-day persistent sandbox re-proof on invoice `2147552467` again settled the invoice in exactly `3` calls; the locate read still exposed no reusable `paymentTypeId`, and the chosen incoming bank payment type remained `32813748` on debit account `1920`
- same-day persistent sandbox re-proof on analog invoice `2147531840` (`907791616` + `6200` + `Fakturerbart arbeid sandbox proof`) again settled the invoice in exactly `3` calls, and the locate read exposed no payment-related keys at all; the chosen incoming bank payment type was still `32813748` with `name=null`, `creditAccount=null`, `debitAccount.number=1920`, `isBankAccount=true`, and `isInvoiceAccount=true`
- that same sandbox account also contained duplicate unpaid analogs for the same `customer.organizationNumber + exact ex-VAT amount + exact line description`; treat that as persistent-sandbox state noise, not as a reason to add a default `GET /customer` or weaken the fresh-account exact-match standard
- in the 2026-03-20 persistent sandbox re-proof, all `4` matching analogs belonged to the same customer, so `GET /customer?organizationNumber=...` was not a real disambiguation branch anyway; either rely on extra prompt fields or treat the ambiguity as sandbox-only proof noise rather than adding a wasted read
