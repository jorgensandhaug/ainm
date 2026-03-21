# Score Reflection — prod-2026-03-21-203657923Z-b57fefd1

## 1. Task Attribution

- **tx_task_id**: 07 (T1 tier, max 2 points)
- **Prompt**: "Kunden Brattli AS (org.nr 909268265) har en utestående faktura på 31300 kr eksklusiv MVA for "Konsulenttimer". Registrer full betaling på denne fakturaen."
- **Task shape**: register-customer-invoice-payment (exact trusted-standard match)
- **Attempt**: 18th attempt on task 07

## 2. Correctness Verdict

**Perfect correctness.** score_raw = 7/7, correctness = 1.0, 2/2 checks passed, `all_checks_passed = true`.

The final Tripletex state was exactly correct: invoice 2147572074 for Brattli AS (909268265), 39125 kr incl. VAT (31300 ex VAT), fully paid with `amountOutstanding = 0`, `amountCurrencyOutstanding = 0`.

## 3. Efficiency Verdict

**Significantly inefficient.** normalized_score = 1.4 out of max 2.0 (70%). The leaderboard best for task 07 is 2.0, meaning prior runs achieved maximum efficiency. This run lost 0.6 points purely to efficiency/error penalties.

**Call count**: 6 API calls (optimal: 3). 3 wasted calls.
**Avoidable 4xx errors**: 2 (a 422 from missing date params, and a 422 from JSON body instead of query params).

| # | Call | Status | Verdict |
|---|------|--------|---------|
| 1 | `GET /invoice?customerOrganizationNumber=...&invoiceStatus=UNPAID&fields=*` (no date params) | 422 | **Avoidable error** — `invoiceDateFrom`/`invoiceDateTo` are required |
| 2 | `GET /invoice?...&invoiceDateFrom=...&invoiceDateTo=...&fields=*` (no nested expansion) | 200 | Successful but script logic failed locally (null descriptions) → forced re-run |
| 3 | `GET /invoice?...` (re-run of fixed script) | 200 | **Wasted duplicate** — already had this data from call 2 |
| 4 | `GET /invoice/paymentType?fields=*` (no debitAccount expansion) | 200 | Needed, but used weaker `fields=*` |
| 5 | `PUT /invoice/{id}/:payment` with JSON body | 422 | **Avoidable error** — endpoint uses query params, not body |
| 6 | `PUT /invoice/{id}/:payment?paymentDate=...&paymentTypeId=...&paidAmount=...` | 200 | Correct and necessary |

**Optimal 3-call path** (proven in 8 prior production runs):
1. `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
3. `PUT /invoice/{id}/:payment?paymentDate=2026-03-21&paymentTypeId=<id>&paidAmount=<amountCurrencyOutstanding>`

## 4. Likely Root Cause

All 3 wasted calls and both 422 errors stem from a single root cause: **the agent did not internalize the playbook details before writing the script**, despite the AGENTS.md rule requiring it. The trusted standard and playbook both document:

1. `GET /invoice` requires `invoiceDateFrom` and `invoiceDateTo` → agent omitted them → 422
2. `fields=*` without nested expansions returns ID-only stubs for `orderLines` and `customer` → agent used `fields=*` alone → null descriptions → script logic failure → duplicate re-run
3. `PUT /invoice/{id}/:payment` uses query parameters, not JSON body → agent sent JSON → 422

The agent read the trusted standard but wrote the script from general-purpose patterns (JSON body for PUT, `fields=*` without expansion, fabricated filter params like `customerOrganizationNumber` and `invoiceStatus` that are silently ignored by the API). Each of these is explicitly documented in the playbook.

A secondary cause: the script was monolithic (all 3 steps in one file) and non-resumable. When step 1 or step 3 failed, re-running the script repeated all prior successful calls.

## 5. What Went Right

- **Correct task identification**: immediately recognized this as an exact trusted-standard match for `register-customer-invoice-payment`
- **Read the trusted standard first**: followed the AGENTS.md rule to read the trusted standard before writing code
- **Correct payment amount**: used `amountCurrencyOutstanding` (39125) from the invoice object, not the prompt's ex-VAT amount (31300)
- **Correct payment type**: selected "Betalt til bank" (id 28180406), a standard bank payment type
- **Perfect final state**: invoice fully paid, all checks passed, correctness = 1.0
- **Fast recovery after errors**: identified and fixed each issue within one retry attempt rather than looping

## 6. What To Change Next Time

1. **Use the full URL patterns from the playbook exactly as documented.** The playbook's "Minimal Flow" section has copy-paste-ready URLs with all required params and field expansions. Use them verbatim:
   - Invoice locate: `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`
   - Payment type: `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
   - Payment write: `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<outstanding>` (query params, no body)

2. **Do not fabricate server-side filter parameters.** `customerOrganizationNumber` and `invoiceStatus` are NOT valid OpenAPI params for `GET /invoice` and are silently ignored. The only valid customer filter is `customerId` (numeric). Always filter locally after expanding with `customer(*)`.

3. **Write resumable scripts.** Structure scripts so each step can be skipped if its output is already known. When a later step fails, avoid re-running successful earlier steps.

4. **The trusted standard's "Critical API Shape Notes" section now documents all three pitfalls** (missing dates → 422, `fields=*` without expansion → null descriptions, JSON body → 422). Future agents reading the updated trusted standard will see these warnings explicitly before writing any script.

5. **For this exact task shape, 3 calls with 0 errors = score 2.0.** There is no shortcut below 3 calls for a standalone invoice payment without a cached `paymentTypeId`.
