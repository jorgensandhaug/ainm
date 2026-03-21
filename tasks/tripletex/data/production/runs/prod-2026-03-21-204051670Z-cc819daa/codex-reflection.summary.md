# Codex Reflection Summary

## Task

Create an order for customer Strandvik AS (org.nr 911845016) with products Skylagring (7865) at 38500 kr and Datarådgjeving (3949) at 18500 kr. Convert the order to an invoice and register full payment. Nynorsk prompt.

## Reflection

**What went well:**
- Correctly identified the exact trusted standard match: `create-order-invoice-and-register-payment.md`
- Read the trusted standard before writing the script (as required)
- Comma-separated `number=7865,3949` product lookup resolved both products in one call
- `paidAmount=0.01` seed correctly settled the full invoice
- Bank account was already configured (no repair needed)
- Final state was correct: order created, invoice created, full payment registered (outstanding=0)
- Invoice totals correct: ex-VAT 57000, incl. VAT 71250 (both products carry 25% VAT)

**What went poorly:**
- First script filtered payment types by `pt.isIncoming === true`, a field that does not exist on payment type objects
- This caused the first script to abort after 3 successful API calls, wasting the paymentType read
- A debug script was written and run to inspect payment type structure (1 extra API call)
- A second script hardcoded IDs from the first run and completed the remaining 2 calls

**Mistake root cause:**
- The `isIncoming` field does not exist on invoice payment type objects. The actual keys are: `id`, `version`, `url`, `description`, `displayName`, `debitAccount`, `creditAccount`, `vatType`, `sequence`, `customer`, `supplier`, `currencyId`, `currencyCode`
- The trusted standard did not explicitly warn about this pitfall before this run
- The agent hallucinated the `isIncoming` field, likely from general API knowledge or confusion with `debitAccount.isBankAccount`

## Call Efficiency

**Actual calls: 6** (1 wasted)
- Call 1: `GET /customer?organizationNumber=911845016&fields=*` → 200
- Call 2: `GET /product?number=7865,3949&fields=*` → 200
- Call 3: `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` → 200 (wasted by JS logic failure)
- Call 4: `GET /invoice/paymentType?count=1000&fields=*` → 200 (debug duplicate — **WASTED**)
- Call 5: `POST /order` → 201
- Call 6: `PUT /order/{id}/:invoice?...&paymentTypeId=28377288&paidAmount=0.01&paymentTypeIdRestAmount=28377288` → 200

**Canonical minimum: 5 calls**
1. `GET /customer?organizationNumber=911845016&fields=*`
2. `GET /product?number=7865,3949&fields=*`
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
4. `POST /order` with embedded orderLines
5. `PUT /order/{id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false&paymentTypeId=<first-available>&paidAmount=0.01&paymentTypeIdRestAmount=<same-id>`

**Wasted calls: 1** — duplicate `GET /invoice/paymentType` caused by the first script's incorrect `isIncoming` filter.

**Lower-call path for next agent:** The same 5-call canonical path, but with the payment type selection fixed to `pts[0]` instead of filtering by nonexistent `isIncoming`.

## Root Causes

1. **Nonexistent field filter**: The agent used `pt.isIncoming === true` to select a payment type, but `isIncoming` is not a field on payment type objects. This blocked the first script and caused a wasted debug call.
2. **Missing trusted standard warning**: The trusted standard did not previously document the absence of `isIncoming` on payment type objects, making it easy for agents to hallucinate this field.

## Sandbox Verification

- Confirmed `paymentTypeId` is required for the combined invoice-and-payment write — omitting it returns 422: "Både paidAmount og paymentTypeId må oppgis ved registrering av en forhåndsbetalt faktura."
- Confirmed both "Kontant" (id 32813747) and "Betalt til bank" (id 32813748) work as `paymentTypeId` for full payment settlement
- Confirmed payment type objects have no `isIncoming` field — only `id`, `version`, `url`, `description`, `displayName`, `debitAccount`, `creditAccount`, `vatType`, `sequence`, `customer`, `supplier`, `currencyId`, `currencyCode`
- Confirmed `pts[0]` (first available payment type) is sufficient for the combined write
- The canonical 5-call path cannot be reduced further: `paymentTypeId` is required and must be resolved dynamically

## Playbook Changes

**Updated existing trusted standard:** `./trusted-standards/create-order-invoice-and-register-payment.md`
- Added CRITICAL payment-type pitfall: `isIncoming` does not exist on payment type objects, do NOT filter by it, just use `pts[0]`
- Changed wording from "incoming paymentTypeId" to just "paymentTypeId" to avoid implying the existence of an `isIncoming` field
- Added 3rd production confirmation (cc819daa, Nynorsk prompt, Strandvik AS / 911845016 / Skylagring 7865 + Datarådgjeving 3949)

**Updated existing playbook:** `./task-playbooks/create-order-invoice-and-register-payment.md`
- Added CRITICAL warning: payment type objects have no `isIncoming` field, do NOT filter by it
- Listed the actual available keys on payment type objects for reference
- Simplified payment type selection guidance: just use first available payment type
- Added production confirmation for this run

## Commit

- Hash: `43e3f60a`
- Message: `tripletex playbook: create-order-invoice-and-register-payment — add 3rd production confirmation (cc819daa, Nynorsk prompt, Strandvik AS / 911845016 / Skylagring 7865 + Datarådgjeving 3949 / 38500+18500, 6 calls 1 wasted 0 errors), documents CRITICAL isIncoming pitfall: payment type objects have no isIncoming field, filtering by pt.isIncoming===true always finds nothing and blocks the run; correct approach is pts[0]; sandbox re-verified both Kontant and Betalt til bank work`

## Reusable Heuristics

1. **Payment type objects have no `isIncoming` field.** Do not filter by `pt.isIncoming`. Just use `pts[0]` — any payment type in the list works for the combined invoice-and-payment write. This pitfall was already documented in `common-endpoints.md` and the foreign-currency payment files but was missing from the order-invoice-and-register-payment standard.

2. **When a script fails due to a logic error (not an API error), reuse already-fetched data.** The second script correctly hardcoded the IDs from the first script's successful API calls instead of re-fetching them. However, the debug call was unnecessary — the payment type data was already available in the first script's API response; the agent should have just inspected the console output more carefully.

3. **The canonical 5-call path for order+invoice+payment cannot be reduced.** `paymentTypeId` is required for the combined write (422 without it), and it must be resolved dynamically per account. The minimum is: customer → products → paymentType → order → invoice-with-payment.

4. **`paidAmount=0.01` is the proven seed for NOK.** Do not use `paidAmount=0` (rejected as missing). Tripletex calculates the remaining full payment automatically from the seed.
