# Post-Run Reflection: prod-2026-03-21-184424564Z-d022ee19

## Task

Find the one overdue customer invoice, book a manual reminder fee of 70 NOK (debit 1500, credit 3400), create and send a fee invoice for 70 NOK to that customer, and register a partial payment of 5000 NOK on the overdue invoice.

Exact trusted-standard match: `overdue-invoice-reminder-fee-and-partial-payment`.

## Reflection

**What went well:**
- Correctly identified the exact trusted-standard match and read it before scripting.
- Correct response parsing (handled both `values` and `value` shapes from the start).
- Correct invoice filtering (due date < today, positive outstanding, exactly 1 match).
- Correct payment type selection, account lookup, fee invoice creation (omitted vatType), and partial payment amount.
- After the voucher 422, correctly reused cached data from the first 3 calls instead of re-reading.

**What went poorly:**
- The voucher `POST /ledger/voucher` failed with `422 Posteringene på rad 0 (guiRow 0) er systemgenererte` because postings lacked explicit `row` values.
- This wasted 1 API call (the failed POST), bringing the total from the optimal 6 to 7 calls.

**Why it happened:**
- The trusted standard at run time did not include the `row: 1` / `row: 2` requirement on voucher postings.
- The playbook's "Winning Payload Shapes" section already had explicit `row` values in its JSON examples, but per AGENTS.md the agent reads only the trusted standard for exact matches.
- Previous production runs that succeeded likely used scripts derived from the playbook examples (which included `row`), but the trusted standard's Payload Rules section omitted this field.

## Call Efficiency

**Not minimal.** 7 calls instead of the optimal 6.

| # | Call | Status | Notes |
|---|------|--------|-------|
| 1 | `GET /invoice?...&fields=*,customer(*)` | 200 | Located overdue invoice #1 |
| 2 | `GET /invoice/paymentType?...` | 200 | Found payment type 36850274 |
| 3 | `GET /ledger/account?number=1500,3400&fields=*` | 200 | Got account ids |
| 4 | `POST /ledger/voucher` (no `row`) | **422** | **Wasted** — row 0 system-generated trap |
| 5 | `POST /ledger/voucher` (with `row: 1`, `row: 2`) | 201 | Voucher #1 created |
| 6 | `POST /invoice` | 201 | Fee invoice #4, amount=70 |
| 7 | `PUT /invoice/{id}/:payment?...&paidAmount=5000` | 200 | Outstanding 19687.5 → 14687.5 |

**Wasted calls:** 1 (failed voucher POST without `row` values).

**Optimal 6-call path for next agent:**
1. `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=<today>&count=1000&sorting=-invoiceDate&fields=*,customer(*)` — filter for overdue
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` — pick bank-style incoming type
3. `GET /ledger/account?number=1500,3400&fields=*` — get account ids
4. `POST /ledger/voucher` — with `row: 1` on debit 1500, `row: 2` on credit 3400
5. `POST /invoice` — fee invoice with one order line, omit vatType
6. `PUT /invoice/{id}/:payment?paymentDate=<today>&paymentTypeId=<id>&paidAmount=5000`

## Root Causes

1. **Documentation gap between trusted standard and playbook.** The playbook already had `row: 1`/`row: 2` in its payload examples, but the trusted standard's Payload Rules did not mention `row` at all. Since agents read only the trusted standard for exact matches, they missed this critical field.
2. **Assumption from prior production successes.** Previous runs succeeded without explicit `row` documentation in the trusted standard, likely because those scripts were written using playbook payload examples as templates. This masked the documentation gap.

## Sandbox Verification

Three sandbox tests were performed on `kkpqfuj-amager.tripletex.dev`:

1. **Row omission test:** `POST /ledger/voucher` without `row` → `422 Posteringene på rad 0 (guiRow 0) er systemgenererte`. Same payload with `row: 1`/`row: 2` → `201` (voucher `609095912`). Confirms the issue is consistent, not account-specific.

2. **Full 6-call end-to-end:** Created fixture invoice #318 (id=2147626400, outstanding=10000), then ran the complete 6-call flow with `row` fix: voucher `609096514`, fee invoice #319 (id=2147626402, amount=70), payment reduced outstanding to 5000. All 6 calls succeeded, 0 errors.

3. **No lower-call path exists:** The 3 GET calls are all mandatory (account.id required for voucher, paymentTypeId required for payment, invoice locate required). No call can be eliminated.

## Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md`**:
  - Added mandatory `row: 1`/`row: 2` requirement to Payload Rules (line 49)
  - Updated wording to "sandbox-verified as consistent, not account-specific"
  - Added production proof for `prod-2026-03-21-184424564Z-d022ee19` (lines 151-157)
  - Added sandbox re-proof confirming `row` requirement consistency (lines 158-161)

- **`./task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md`**:
  - Added `row` omission pitfall to Pitfalls section (line 166)
  - Added production run evidence and critical fix to Reflection Delta (lines 218-223)

## Commit

```
63ead465c56edb35aabd8ef3c4e2e693c4328bc7
tripletex playbook: overdue-invoice-reminder-fee — add mandatory row values on voucher postings, sandbox re-proof
```

## Reusable Heuristics

1. **Always set explicit `row` values on `POST /ledger/voucher` postings.** Use `row: 1` for the first posting, `row: 2` for the second. Omitting `row` defaults to row 0 which is system-reserved and always fails with `422`. This applies to ALL voucher POST operations, not just this task shape.

2. **Trusted standards must be complete relative to playbook payload examples.** If a playbook's "Winning Payload Shapes" includes a field, the trusted standard's Payload Rules must also mention it. Agents reading only the trusted standard will miss any field documented only in the playbook.

3. **When a voucher POST fails, reuse cached data from prior GETs.** The 3 GET calls (invoice locate, payment type, accounts) return stable data within a single task run. Don't re-execute them on retry.

4. **The 6-call path is the proven optimal for this task shape.** No call can be eliminated: account.id is mandatory for voucher postings (number-based fails), paymentTypeId is mandatory for invoice payment (omission fails with 422), and invoice locate is required to find the overdue invoice id and customer id.
