# Post-Run Reflection: prod-2026-03-22-105909436Z-919fd827

## 1. Task
German prompt: find the overdue invoice, book a 60 NOK reminder fee (debit 1500, credit 3400), create and send a fee invoice to the customer, register a 5000 NOK partial payment on the overdue invoice.

## 2. Reflection
**What went well:**
- Exact match to the trusted standard `overdue-invoice-reminder-fee-and-partial-payment.md`
- Agent read the trusted standard first, then immediately wrote and executed the script
- All 6 write-path calls succeeded on the first attempt with zero errors
- All known pitfalls avoided: explicit `row: 1`/`row: 2` on voucher postings, no `currency` at voucher level, `orders[{orderLines}]` structure on fee invoice, no `vatType` on order line, `paymentTypeId` included on `:payment`
- Correct response parsing (`values` vs `value`) from the first call
- All verification GETs confirmed correct final state

**What went poorly:**
- Nothing. This was a clean execution.

**Mistakes:**
- None.

## 3. Call Efficiency
**Was the run minimal-call?** Yes — exactly 6 write-path calls, matching the canonical minimum.

**Write calls (6):**
1. `GET /invoice` — locate overdue invoice
2. `GET /invoice/paymentType` — resolve incoming payment type
3. `GET /ledger/account?number=1500,3400` — resolve account IDs
4. `POST /ledger/voucher` — book reminder fee (debit 1500 +60, credit 3400 -60)
5. `POST /invoice` — create and send fee invoice (60 NOK)
6. `PUT /invoice/{id}/:payment` — register 5000 NOK partial payment

**Free verification GETs (3):**
- `GET /ledger/voucher/{id}` — confirmed accounts 1500/3400, amounts ±60, customer linkage
- `GET /invoice/{id}` — confirmed fee invoice amount 60
- `GET /invoice/{id}` — confirmed outstanding reduced from 28312.5 to 23312.5

**Wasted calls:** 0

**Lower-call path:** None exists. Sandbox investigation on 2026-03-22 confirmed:
- Invoice postings only contain account 1500 (not 3400), so `GET /ledger/account` cannot be eliminated
- `paymentType` is not a valid field expansion on InvoiceDTO, so `GET /invoice/paymentType` cannot be eliminated
- `paymentTypeId` is mandatory on `PUT /invoice/:payment` (422 without it), so the payment type read cannot be skipped
- The 3 writes (voucher, invoice, payment) are all different operations on different entities — irreducible

## 4. Root Causes
No failures or wasted calls in this run. The 6-call path has been stable across 13 clean production runs spanning `nb`, `nn`, `en`, `es`, `pt`, `de`, `fr` prompts with fee amounts 35, 40, 50, 55, 60, 65, 70.

## 5. Sandbox Verification
Sandbox investigations on 2026-03-22 confirmed:
- Invoice `fields=*` does not include `paymentTypeId`, `payment`, or `paymentType` — no way to extract payment type from the invoice response
- Invoice `postings(account(*))` only shows account 1500 (receivables), never 3400 (fee income) — the account GET remains necessary
- `paymentTypeId` field request on invoice returns nothing — not a valid InvoiceDTO field
- Company settings endpoint has no payment type information
- The 6-call floor is conclusively proven with no viable reduction path

## 6. Playbook Changes
**Updated:** `./trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md`
- Added production proof for run `919fd827` (German/60 NOK, 0 errors)
- Updated total count from 12 to 13 clean production runs

**No changes needed to:**
- `./task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md` — already complete
- `./AGENTS.md` — task pattern and standard path already documented
- `./trusted-standards/common-endpoints.md` — no endpoint changes

## 7. Commit
- **Hash:** `e0413e38`
- **Message:** `tripletex playbook: overdue-invoice — add 13th consecutive clean 6-call run (919fd827, German/60NOK)`

## 8. Reusable Heuristics
1. **The 6-call path is the proven floor for this task shape.** No 5-call path exists. All 3 reads and all 3 writes are independently necessary.
2. **Read the trusted standard, then immediately write the script.** Do not also read AGENTS.md, playbook, or openapi.json for exact-match tasks — this wastes context budget.
3. **Always set `row: 1` and `row: 2` on voucher postings.** Omitting `row` defaults to row 0 (system-generated) → 422.
4. **Never include `currency` at voucher level.** VoucherDTO has no `currency` field → 422. Omit it entirely (posting-level is optional and unnecessary).
5. **Order lines go inside `orders[{orderLines}]`, not at invoice top level.** Top-level `orderLines` with `orders: []` → 422.
6. **Omit `vatType` on fee invoice order lines.** API defaults to 0% (correct for reminder fees), saving a `GET /ledger/vatType` call.
7. **Always include `paymentTypeId` on `:payment`.** Omitting it → 422.
8. **Handle both `values` and `value` response shapes in the generic parser.** List endpoints use `values`, single-object use `value`. Getting this wrong crashes the script and wastes a retry call.
9. **Payment type IDs are environment-specific.** Never hardcode or reuse IDs from a prior account. Always resolve via `GET /invoice/paymentType`.
10. **Account IDs are mandatory on voucher postings.** Neither `account.number` nor `account.number + account.name` works — `account.id` is strictly required.
