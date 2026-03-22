# Post-Run Reflection: prod-2026-03-22-034253207Z-5a42f10e

## Task

Create a full credit note reversing an invoice for customer Elvdal AS (org.nr 949502619) for "Programvarelisens" (11250 kr excl. MVA). Norwegian prompt. Exact match for trusted standard `create-customer-invoice-credit-note`.

## Reflection

**What went well:**
- Correctly identified as exact trusted-standard match
- Read the trusted standard before writing any script
- Successfully created the credit note (invoice id 2147663977 → credit note id 2147672127)
- Zero 4xx errors

**What went poorly:**
- The script required exactly 1 candidate match and exited with an error when 2 identical invoices matched all filtering criteria (same customer 949502619, same amount 11250, same description "Programvarelisens", both uncredited)
- A second GET was spent to "inspect" the candidates — but the first GET already contained all the data needed to resolve the duplicates
- This wasted 1 API call (3 total instead of optimal 2)

**Why the mistake happened:**
- The script's client-side filtering logic used a strict `candidates.length !== 1` check
- The trusted standard and playbook at the time said "filter locally to the single correct invoice" but did not document what to do when multiple invoices are truly identical
- The "Known Recovery Branches" section only mentioned adding an extra resolver for ambiguity, not handling identical duplicates

## Call Efficiency

**Was the run minimal-call?** No. 3 API calls instead of the optimal 2.

| # | Call | Purpose | Verdict |
|---|------|---------|---------|
| 1 | `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` | Locate invoice | Necessary |
| 2 | `GET /invoice?...` (same query repeated) | Inspect candidates after script failure | **WASTED** — all candidate data was already in Call 1 |
| 3 | `PUT /invoice/2147663977/:createCreditNote?date=2026-03-22&sendToCustomer=false` | Create credit note | Necessary |

**Exact lower-call path for next agent:**
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
2. Filter locally → if multiple candidates match all criteria identically, pick the one with the **highest `id`** (most recently created)
3. `PUT /invoice/{id}/:createCreditNote?date=2026-03-22&sendToCustomer=false`

Total: **2 API calls, 0 errors**.

## Root Causes

1. **Missing duplicate-handling rule**: The trusted standard documented how to handle cross-array description duplicates on *one* invoice, but not how to handle multiple *invoices* with identical criteria.
2. **Overly strict candidate count check**: The script used `candidates.length !== 1` as a hard failure condition instead of gracefully selecting from identical duplicates.
3. **Repeated GET instead of reusing data**: After the first script failed, the second script re-fetched the exact same data instead of building on the response already obtained.

## Sandbox Verification

- Created customer Elvdal AS (org.nr 949502619) and TWO identical invoices for "Programvarelisens" at 11250 kr excl. MVA in the persistent sandbox
- Ran the corrected 2-call path: GET locate → pick highest id → PUT :createCreditNote
- Result: credit note created successfully (id 2147672267, invoiceNumber 533, isCreditNote=true, creditedInvoice=2147672264, amountExcludingVatCurrency=-11250)
- **2 API calls, 0 errors** — confirms the duplicate-handling heuristic works

## Playbook Changes

**Updated existing files** (not new):

| File | Change |
|------|--------|
| `./trusted-standards/create-customer-invoice-credit-note.md` | Added duplicate-handling rule in Payload Rules, Exact-Match Fast Path (with CRITICAL warning), and Known Recovery Branches; added production run confirmation for `949502619/Programvarelisens/11250`; added sandbox verification with duplicate-invoice setup |
| `./task-playbooks/create-customer-invoice-credit-note.md` | Added duplicate-handling rule in step 3 (filter), Locate Rules, and Avoidable Mistakes |
| `./AGENTS.md` | Added pitfall guidance: when credit-note locate returns multiple identical invoices, pick highest id instead of failing or spending extra calls |

## Commit

- **Hash**: `8d91d5bb`
- **Message**: `tripletex playbook: create-customer-invoice-credit-note — add duplicate-invoice handling rule from prod-2026-03-22-034253207Z-5a42f10e (Elvdal AS / 949502619 / Programvarelisens / 11250, 3 calls 0 errors); when multiple invoices match ALL criteria identically (same customer, amount, description), pick highest id instead of failing; original agent wasted 1 GET by exiting on 2 identical candidates; sandbox-verified 2026-03-22 with duplicate-invoice setup confirming 2-call path works; trusted-standard, playbook, and AGENTS.md all updated with duplicate-handling pitfall`

## Reusable Heuristics

1. **Never fail on identical duplicates**: When a locate query returns multiple candidates that match ALL filtering criteria identically (same customer, amount, description), pick the one with the highest `id` and proceed. Do not treat this as ambiguity requiring an extra resolver call.
2. **Never re-fetch data you already have**: If the first GET already returned all candidate data, do not run a second GET to "inspect" those same candidates. Parse the first response differently instead.
3. **Script resilience over strictness**: Use `candidates.length === 0` as a hard error (no match found), but `candidates.length > 1` should trigger a tiebreaker (highest id), not an exit. Only spend an extra call when candidates differ on key dimensions (different customers, amounts, or descriptions).
4. **Sort by id descending for tiebreaking**: `candidates.sort((a, b) => b.id - a.id)[0]` is the simplest heuristic for picking the most recently created invoice when all other criteria are identical.
