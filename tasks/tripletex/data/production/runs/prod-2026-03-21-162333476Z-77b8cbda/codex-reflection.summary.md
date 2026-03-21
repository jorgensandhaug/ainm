# Post-Run Reflection: Register FX Customer Invoice Payment

## Task
Register payment on a foreign-currency (EUR) customer invoice for Montagne SARL (org 959783748). Invoice was 11,660 EUR ex-VAT (14,575 EUR incl. 25% MVA) at original rate 10.98 NOK/EUR. Payment at settlement rate 11.65 NOK/EUR. Book the FX gain (agio) on the correct account.

## Reflection

**What went well:**
- Correctly identified the task as an exact match for the `register-foreign-currency-customer-invoice-payment` trusted standard
- Payment registered successfully with correct amounts: `paidAmountCurrency=14575` EUR, `paidAmount=169798.75` NOK
- Response confirmed `amountOutstanding=0`, `amountCurrencyOutstanding=0`
- Tripletex auto-booked the FX gain (agio) — no manual voucher needed
- 3 successful API calls matching the canonical count

**What went poorly:**
1. **Did not read the trusted standard before coding** — despite identifying it as an exact match, the agent wrote the script from general knowledge instead of reading the standard first. The trusted standard explicitly documents every pitfall the agent hit.
2. **422 error on first GET /invoice** — omitted required `invoiceDateFrom` and `invoiceDateTo` params. The trusted standard says at line 37: "omitting them returns `422`".
3. **Used `fields=*` without `currency(*)`** — the standard says `currency(*)` expansion is REQUIRED. Without it, `currency` returns as a link stub. The production response showed `amount === amountCurrency === 14575`, which should have triggered the company-currency fallback check but didn't because the validation wasn't implemented.
4. **Used `fields=*` without `debitAccount(*)`** for payment type — the standard says `debitAccount(*)` is REQUIRED. Without expansion, the filter for `debitAccount.number` and `debitAccount.isBankAccount` always fails (returns undefined).
5. **Filtered by `p.isIncoming` and `p.isBankAccount` on payment type** — these fields do NOT exist as top-level properties on the payment type object. They only exist on the expanded `debitAccount` subobject.
6. **Used `customerOrganizationNumber` and `currency=EUR` as query params** — these are silently ignored by GET /invoice. The only valid customer filter is `customerId` (internal ID).

## Call Efficiency

**Production run: 4 calls (1 wasted 422 + 3 successful)**
- Call 1: `GET /invoice?customerOrganizationNumber=...&currency=EUR&invoiceStatus=UNPAID&fields=*` → **422** (missing required date params)
- Call 2: `GET /invoice?customerOrganizationNumber=...&currency=EUR&invoiceDateFrom=...&invoiceDateTo=...&fields=*` → 200
- Call 3: `GET /invoice/paymentType?fields=*` → 200
- Call 4: `PUT /invoice/{id}/:payment` → 200

**Optimal path: 3 calls, 0 errors:**
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)` — filter locally by `currency.code` and `amountCurrencyOutstanding > 0`
2. `GET /invoice/paymentType?fields=*,debitAccount(*)` — select by `debitAccount.number >= 1900 && < 2000` with `debitAccount.isBankAccount === true`; fallback to description matching `"bank"`
3. `PUT /invoice/{id}/:payment?paymentDate=2026-03-21&paymentTypeId={id}&paidAmount={amountCurrencyOutstanding * 11.65}&paidAmountCurrency={amountCurrencyOutstanding}`

**Wasted calls:** 1 (the 422 from missing date params)

## Root Causes

1. **Agent skipped reading the trusted standard** — AGENTS.md line 27 says "Read only the matching trusted standard, then immediately write and execute the script." The agent identified the standard but wrote from memory instead. Every pitfall hit was explicitly documented in the standard.
2. **Incorrect query params used** — `customerOrganizationNumber`, `currency=EUR` are not valid GET /invoice query params (per OpenAPI spec, only `customerId` is valid). Silently ignored by the API.
3. **Missing field expansions** — `currency(*)` and `debitAccount(*)` are critical expansions. Without them, the response contains sparse link stubs instead of usable objects.
4. **Wrong property names for payment type filtering** — `isIncoming` and `isBankAccount` don't exist on the payment type object; they only exist on the expanded `debitAccount` subobject.

## Sandbox Verification

Verified in persistent sandbox (https://kkpqfuj-amager.tripletex.dev/v2):

1. **GET /invoice without date params → 422** — confirmed required params
2. **`customerOrganizationNumber` and `currency` are silently ignored** — `currency=DOESNOTEXIST` and `customerOrganizationNumber=000000000` both return same `fullResultSize` as unfiltered query
3. **`fields=*` without `currency(*)`** returns `currency` as `{id, url}` link stub; `amount` and `amountCurrency` values are NOT affected by expansion (both correctly show NOK vs foreign currency amounts regardless)
4. **`fields=*` without `debitAccount(*)`** on `/invoice/paymentType` returns debit account as `{id, url}` link stub; `isIncoming` and `isBankAccount` are NOT top-level payment type fields at all
5. **"Betalt til bank" (ID 32813748)** with `debitAccount.number=1920` and `debitAccount.isBankAccount=true` is the standard bank payment type; "Kontant" (ID 32813747) has `debitAccount.number=1900` and `isBankAccount=false`

## Playbook Changes

**Updated existing files (not new):**

1. `./trusted-standards/register-foreign-currency-customer-invoice-payment.md`
   - Removed `customerOrgNumber=<org>` from flow step 1 query template — filter locally instead
   - Added warning that `customerOrganizationNumber`, `customerOrgNumber`, `currency` are silently ignored
   - Added warning that `isIncoming` and `isBankAccount` are NOT top-level payment type fields
   - Added description-based fallback for payment type: match `"bank"` in description
   - Added pitfall about prompt amount typically being ex-VAT

2. `./task-playbooks/register-foreign-currency-customer-invoice-payment.md`
   - Same changes: removed invalid query params from flow template, added warnings about silently-ignored params, payment type field structure, and description fallback

3. `./trusted-standards/common-endpoints.md`
   - Added GET /invoice query param pitfalls (required date params, silently-ignored customer/currency filters, expansion requirements)
   - Added GET /invoice/paymentType expansion and field pitfalls

## Commit

- Hash: `514515a9`
- Message: `tripletex playbook: FX payment pitfalls from prod run — invalid query params, payment type expansion`

## Reusable Heuristics

1. **Always read the trusted standard before writing code** — even when you "know" the flow. The standard documents API quirks that are not obvious from general knowledge.
2. **GET /invoice requires `invoiceDateFrom` and `invoiceDateTo`** — use wide bounds `2000-01-01` to `<run-date+1>`.
3. **`customerOrganizationNumber`, `customerOrgNumber`, and `currency` are NOT valid GET /invoice filters** — they are silently ignored. The only valid customer filter is `customerId` (internal ID). Always filter locally.
4. **Always use `fields=*,currency(*)` for GET /invoice** when currency matters — without expansion, `currency` is a link stub without `code`.
5. **Always use `fields=*,debitAccount(*)` for GET /invoice/paymentType** — without expansion, `debitAccount` is a link stub without `number` or `isBankAccount`.
6. **`isIncoming` and `isBankAccount` do NOT exist on payment type objects** — they only exist on the expanded `debitAccount` subobject. Never filter by `paymentType.isIncoming`.
7. **Use "Betalt til bank" description match as a fallback** for payment type selection when `debitAccount.isBankAccount` is missing.
8. **The prompt amount is typically ex-VAT** — "facture de 11660 EUR" means `amountExcludingVatCurrency=11660`; the full outstanding is `11660 * 1.25 = 14575 EUR`.
9. **FX gain/loss is auto-booked by the `:payment` endpoint** — account 8060 for gain (agio), account 8160 for loss (disagio). Never add a manual voucher.
10. **In fresh production accounts, there are very few invoices** — fetching all and filtering locally is cheap and avoids needing a preliminary GET /customer call.
