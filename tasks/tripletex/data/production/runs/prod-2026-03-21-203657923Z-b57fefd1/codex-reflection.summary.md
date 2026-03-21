# Codex Reflection Summary

## Task

Register full payment on an existing customer invoice for Brattli AS (org.nr 909268265), outstanding 31300 kr excl. MVA for "Konsulenttimer". Exact match for `register-customer-invoice-payment` trusted standard. Optimal path: 3 calls.

## Reflection

**What went well:**
- Correctly identified the task as an exact match for the `register-customer-invoice-payment` trusted standard
- Read the trusted standard before writing the script
- Used the live outstanding amount (39125) from the invoice object, not the prompt's ex-VAT amount (31300)
- Final state was correct: invoice fully paid, `amountOutstanding=0`

**What went poorly:**
- Used 6 API calls instead of the optimal 3 — doubled the call count
- 2 avoidable 422 errors
- Script was not resumable; each re-run repeated all prior successful calls

**Mistakes:**
1. Omitted required `invoiceDateFrom`/`invoiceDateTo` on `GET /invoice` → avoidable 422
2. Used `fields=*` without nested expansions (`customer(*)`, `orderLines(*)`) → null descriptions → script logic failure → had to re-run
3. Used invalid server-side filters (`customerOrganizationNumber`, `invoiceStatus`) that were silently ignored — happened to work because fresh account had only 1 invoice
4. Used `fields=*` without `debitAccount(*)` on `GET /invoice/paymentType` → `isBankAccount` unavailable → had to fall back to description matching
5. Sent `PUT /invoice/{id}/:payment` parameters as JSON body instead of query parameters → avoidable 422

## Call Efficiency

**NOT minimal-call.** Used 6 calls; optimal is 3.

| # | Call | Status | Verdict |
|---|------|--------|---------|
| 1 | `GET /invoice?customerOrganizationNumber=...&invoiceStatus=UNPAID&fields=*` | 422 | Avoidable — missing required date params |
| 2 | `GET /invoice?...&invoiceDateFrom=...&invoiceDateTo=...&fields=*` | 200 | Useful data obtained, but script failed on null descriptions (no expansions) |
| 3 | `GET /invoice?...` (re-run) | 200 | Wasted — duplicate of call 2 due to non-resumable script |
| 4 | `GET /invoice/paymentType?fields=*` | 200 | Useful but insufficient expansion (missing `debitAccount(*)`) |
| 5 | `PUT /invoice/{id}/:payment` (JSON body) | 422 | Avoidable — params must be query params, not JSON body |
| 6 | `PUT /invoice/{id}/:payment?...` (query params) | 200 | Correct final call |

**Correct 3-call path the next agent should follow:**
1. `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
3. `PUT /invoice/{id}/:payment?paymentDate=<YYYY-MM-DD>&paymentTypeId=<id>&paidAmount=<amountCurrencyOutstanding>`

## Root Causes

1. **Trusted standard was too terse**: The Standard Flow said `GET /invoice?...&fields=*` with `...` hiding critical required params. The agent followed the terse notation literally rather than cross-referencing the playbook's detailed examples.
2. **PUT /:payment body vs query params**: The trusted standard said just `PUT /invoice/{id}/:payment` without specifying parameter delivery. The playbook documented "Required query parameters" but the agent didn't cross-reference.
3. **False sense of server-side filtering**: The agent assumed `customerOrganizationNumber` and `invoiceStatus` were valid filter params on GET /invoice. OpenAPI spec only has `customerId`, `invoiceNumber`, `kid`, `voucherId` as valid filters. The silently-ignored params returned correct results only by coincidence.
4. **No field expansion knowledge**: The agent used bare `fields=*` without understanding that nested objects need explicit expansion (`customer(*)`, `orderLines(*)`, `debitAccount(*)`) to return useful data.

## Sandbox Verification

Verified in persistent sandbox (`kkpqfuj-amager.tripletex.dev`):
- `customerOrganizationNumber` is silently ignored on `GET /invoice` — even `customerOrganizationNumber=DOESNOTEXIST999` returns results
- `invoiceStatus=UNPAID` is silently ignored — returned invoices with `amountOutstanding=0`
- `customerId` IS a valid working filter (but requires prior `GET /customer` to resolve, adding 1 call)
- `fields=*` without `orderLines(*)` returns `orderLines` as `[{id: N}]` without `description`
- `fields=*` without `customer(*)` returns `customer` as `{id, url}` without `organizationNumber` or `name`
- `fields=*` without `debitAccount(*)` on `/invoice/paymentType` returns `debitAccount` as `{id, url}` without `number`; `isBankAccount` is `undefined` even with expansion on some accounts
- `description === "Betalt til bank"` or `debitAccount.number` starting with `19` are reliable selection heuristics

## Playbook Changes

Updated existing files (no new files created):
- `./trusted-standards/register-customer-invoice-payment.md` — made Standard Flow explicit with full URLs/params/expansions instead of `...` notation; added "Critical API Shape Notes" section documenting all 7 API pitfalls; added 9th production confirmation with wasted-call annotation; added sandbox re-proof of silently-ignored filters and expansion requirements
- `./task-playbooks/register-customer-invoice-payment.md` — added 6 new key findings about required expansions and silently-ignored params; added "Common Pitfalls" section with 5 numbered production-proven pitfalls; added production confirmation for payment type 28180406; added fallback guidance for payment type selection when `isBankAccount` is undefined
- `./trusted-standards/common-endpoints.md` — added `PUT /:payment` query-params-only critical note; added GET /invoice expansion pitfall for `orderLines(*)` and `customer(*)`; added `invoiceStatus` silently-ignored pitfall

## Commit

- Hash: `94e0c4bd`
- Message: `tripletex playbook: register-customer-invoice-payment — make trusted standard self-sufficient with explicit URLs/params/expansions, add 9th production confirmation (b57fefd1, Norwegian prompt, Brattli AS / 909268265 / 31300+Konsulenttimer / 39125 outstanding, 6 calls 2 avoidable 422s), add Critical API Shape Notes section documenting: (1) PUT /:payment params must be query params not JSON body, (2) customerOrganizationNumber/invoiceStatus silently ignored on GET /invoice, (3) fields=* without nested expansions returns ID-only refs, (4) debitAccount(*) expansion needed on paymentType; add Common Pitfalls section to playbook; update common-endpoints.md with PUT /:payment query-params-only note and orderLines/invoiceStatus expansion/filter pitfalls`

## Reusable Heuristics

1. **Always copy exact URLs from playbook, not from general knowledge.** The Standard Flow's `GET /invoice?...&fields=*` was too vague and led to 2 avoidable errors. Now the trusted standard has full explicit URLs.
2. **`PUT /invoice/{id}/:payment` takes query params, not JSON body.** This is now documented in trusted standard, playbook, and common-endpoints.
3. **`fields=*` is never sufficient for nested objects.** Always expand: `customer(*)`, `orderLines(*)`, `orders(*,orderLines(*))`, `debitAccount(*)`, `creditAccount(*)`.
4. **Do not invent server-side filter params.** Only use params listed in OpenAPI spec. `customerOrganizationNumber` and `invoiceStatus` are silently ignored. Always filter locally.
5. **Payment type selection fallback chain:** `description === "Betalt til bank"` → `debitAccount.number` starting with `19` → `isBankAccount=true` (may be undefined on some accounts).
6. **Write resumable scripts.** Separate API calls into independent steps so a retry after script logic error doesn't repeat successful calls.
7. **For this exact task shape (register customer invoice payment), the floor is 3 calls.** No shortcut exists: invoice locate + payment type lookup + payment write.
