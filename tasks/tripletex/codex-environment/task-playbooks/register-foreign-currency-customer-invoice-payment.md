# Register Foreign Currency Customer Invoice Payment

## Scope

Use for tasks like:
- register full payment on an existing outgoing customer invoice in a non-company currency
- prompt gives the customer plus the exact invoice-currency amount
- prompt also gives the settlement exchange rate or the exact company-currency paid amount
- prompt explicitly wants the realized FX gain/loss booked on payment

Do not use for:
- creating the invoice itself
- supplier-invoice payments
- prompts too ambiguous to isolate one unpaid invoice safely

## CRITICAL: Read the trusted standard first
Always read `./trusted-standards/register-foreign-currency-customer-invoice-payment.md` before writing any code. It documents API traps that caused 0% scores in production.

## API Traps That Caused Production Failures

These are the exact errors that caused 0% and 50% scores across 3 production runs. Every single one is an API behavior you will not guess correctly from general knowledge.

### Trap 1: Silent query param ignore (caused wrong invoice selection)
`customerOrganizationNumber` and `currency` are NOT valid GET /invoice query params. The API silently ignores them and returns all invoices. You think you're filtering by customer and currency but you're getting everything.
- Fix: fetch all invoices, filter locally after expanding currency

### Trap 2: Missing currency expansion (caused wrong currency detection)
`fields=*` does NOT expand `currency` — it returns `{ id, url }` with no `code` field. You cannot tell if an invoice is EUR or NOK.
- Fix: always use `fields=*,currency(*)`

### Trap 3: Missing debitAccount expansion (caused wrong payment type selection)
`fields=*` on `/invoice/paymentType` does NOT expand `debitAccount` — it returns `{ id, url }` with no `number` or `isBankAccount`.
- Fix: always use `fields=*,debitAccount(*)`

### Trap 4: Nonexistent top-level fields (caused filter to match nothing)
`isIncoming` and `isBankAccount` do NOT exist as top-level fields on payment type objects. They only exist on the expanded `debitAccount` subobject. Filtering by `paymentType.isIncoming` always returns zero matches.
- Fix: filter by `pt.debitAccount.isBankAccount` after expanding with `debitAccount(*)`

### Trap 5: Paying a NOK invoice with FX logic (no auto-agio)
If `amount === amountCurrency`, the invoice is in company currency (NOK). Sending FX-adjusted `paidAmount` is silently ignored — bank is debited by actual outstanding only, no FX posting created.
- Fix: validate `amount !== amountCurrency` before applying FX logic; for NOK invoices, use simple payment + manual agio voucher

### Trap 6: Manual voucher with row=0 (caused 422 error)
Row 0 is universally reserved as "system-generated" by Tripletex. `POST /ledger/voucher` with `row: 0` in any posting → 422 (`Posteringene på rad 0 er systemgenererte`). This applies to ALL accounts, not just bank/system accounts.
- Fix: ALWAYS use `row: 1` and above in voucher postings

### Trap 7: Manual voucher on EUR invoice (unnecessary, risks double-entry)
For EUR invoices, the `:payment` endpoint auto-books FX gain (8060) and loss (8160). Creating an additional manual voucher doubles the entry.
- Fix: ONLY create manual agio vouchers for NOK invoices where the auto-mechanism cannot work

### Trap 8: Voucher `account: { number }` without ID (422 error)
`POST /ledger/voucher` requires `account: { id: ... }`. Using `account: { number: 1920 }` or `account: { number: 1920, name: "Bankinnskudd" }` → 422 ("Internt felt (account): Feltet må fylles ut"). The agio/disagio account ID must be resolved via `GET /ledger/account`.
- Fix: resolve agio/disagio account via `GET /ledger/account?number=8060&fields=id,number` (or `8160` for disagio); reuse paymentType `debitAccount.id` for the bank account

## Minimal Flow (3 calls)

1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=<run-date+1>&fields=*,currency(*),customer(*)`
   - `customer(*)` expansion is REQUIRED — without it, `customer.organizationNumber` is `undefined` (sandbox-proven 2026-03-22)
   - Filter locally: `customer.organizationNumber` matches prompt, `currency.code !== "NOK"` AND `amountCurrencyOutstanding > 0`
   - Validate: `amount !== amountCurrency` (proves genuine foreign-currency invoice)
   - Match prompt ex-VAT amount against `amountExcludingVatCurrency`; full outstanding = `promptAmount * 1.25`

2. `GET /invoice/paymentType?fields=*,debitAccount(*)`
   - Select: `debitAccount.number >= 1900 && < 2000 && debitAccount.isBankAccount === true`
   - Fallback: `debitAccount.number >= 1900 && < 2000`
   - Last resort: `description.toLowerCase().includes("bank")`

3. `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<outstanding * settlementRate>&paidAmountCurrency=<amountCurrencyOutstanding>`
   - Verify: `amountCurrencyOutstanding === 0`. Stop.
   - FX gain/loss is auto-booked by Tripletex. No manual voucher.

## CRITICAL: Script Must Handle Both EUR and NOK

The script MUST contain inline fallback logic for NOK invoices. Do NOT write a script that exits with an error when no foreign-currency invoice is found. Production run 67c52406 scored 0% because the script only handled EUR, found NOK, and the agent timed out without ever calling `:payment`.

Script pattern:
1. Filter for foreign currency invoices with outstanding > 0
2. If found → FX payment (paidAmount = outstanding × rate, paidAmountCurrency = outstanding) — 3 calls
3. If NOT found → match NOK invoice by `amountExcludingVat`:
   a. Register simple payment (paidAmount = amountOutstanding)
   b. Look up agio/disagio account ID: `GET /ledger/account?number=8060&fields=id,number` (or `8160` for disagio) — reuse paymentType `debitAccount.id` for bank account
   c. Create manual agio voucher: `POST /ledger/voucher?sendToLedger=true` with `row: 1`+
   d. FX amount = promptEurAmount × |settlementRate − originalRate| (always positive) — 5 calls total
4. ALWAYS register a payment AND book agio. Never exit without paying.

## Company-Currency Fallback (NOK invoice with manual agio)

If the invoice is NOK despite the prompt describing a foreign-currency payment:
- Register simple payment: `paidAmount = amountOutstanding`, no `paidAmountCurrency`
- Then create a manual agio voucher with `POST /ledger/voucher?sendToLedger=true`:
  - Bank account: reuse `debitAccount.id` from the paymentType resolved in Call 2 (no hardcoded 1920)
  - Agio/disagio account: resolve via `GET /ledger/account?number=8060` (or `8160`)
  - Use `row: 1` and `row: 2` — NEVER row 0 (system-reserved, causes 422)
  - Use `vatType: { id: 0 }` on both postings
  - FX amount = promptEurAmount × |settlementRate − originalRate| (always positive)
- Do NOT apply FX logic on the `:payment` call — Tripletex ignores FX params on NOK invoices
- For disagio (settlement rate < original rate): debit 8160 (+fxAmount), credit bank (−fxAmount)
- For agio (settlement rate > original rate): debit bank (+fxAmount), credit 8060 (−fxAmount)
- The agio/disagio account ID must be resolved via `GET /ledger/account` — `account: { number: ... }` does NOT work in voucher body
- The bank account ID is already available from the paymentType's `debitAccount.id` — no separate lookup needed

## Canonical Call Count

- standalone EUR with no cached payment type: `3` calls
- standalone NOK with manual agio: `5` calls
- EUR with cached same-run payment type: `2` calls
- NOK with cached same-run payment type: `4` calls

## Payment Rules

- `paidAmount` = settlement amount in company currency (NOK) = `amountCurrencyOutstanding * settlementRate`
- `paidAmountCurrency` = live outstanding in invoice currency (EUR) = `amountCurrencyOutstanding`
- Do NOT use the prompt's ex-VAT amount directly as `paidAmountCurrency` — use the full outstanding from the invoice object
- For EUR invoices: do NOT add a manual voucher — `:payment` auto-books FX gain (8060) or loss (8160)
- For NOK invoices: DO add a manual voucher with `row: 1`+ to book agio (see Company-Currency Fallback)

## Payment Type Rules

- Read from `GET /invoice/paymentType?fields=*,debitAccount(*)` — the `debitAccount(*)` expansion is mandatory
- Select a company-currency (NOK) bank payment type, NOT a foreign-currency one
- Filter by `debitAccount.number` and `debitAccount.isBankAccount`, NOT by top-level `isIncoming` or `isBankAccount`
- "Betalt til bank" description match as last resort

## Pitfalls (summary)

- `GET /invoice` without `invoiceDateFrom`/`invoiceDateTo` → `422`
- `fields=*` without `currency(*)` → currency is a link stub, cannot detect EUR vs NOK
- `fields=*` without `debitAccount(*)` on payment type → cannot filter by account number
- `customerOrganizationNumber`, `currency` as query params → silently ignored, returns all invoices
- `paymentType.isIncoming`, `paymentType.isBankAccount` → do not exist, always undefined
- `amount === amountCurrency` → invoice is NOK, not foreign currency — use manual agio voucher
- Manual `POST /ledger/voucher` on EUR invoice → corrupts state (auto-booked by `:payment`)
- Manual `POST /ledger/voucher` on NOK invoice → REQUIRED for agio, use `row: 1`+ (row 0 → 422)
- `account: { number: ... }` in voucher body → 422; must use `account: { id: ... }` — `account: { number, name }` also fails with "Internt felt (account): Feltet må fylles ut"
- Bank account for voucher: reuse paymentType `debitAccount.id` instead of separate lookup — saves hardcoding 1920 and is more correct
- Prompt amount is typically ex-VAT → multiply by 1.25 for full outstanding

## Production Confirmations
- prod-2026-03-22-112740476Z-07f71ed1: NOK fallback, 5 calls, 0 errors — Estrela Lda / 808808773 / 2336 EUR, rate 11.17→12.13, agio 2242.56 NOK on 8060 (8th consecutive full-score NOK-fallback, 7th agio, third Portuguese prompt; confirmed `customer(*)` needed in fields expansion)
- prod-2026-03-22-105704259Z-019858d3: NOK fallback, 5 calls, 0 errors — Forêt SARL / 832101389 / 11764 EUR, rate 10.90→11.19, agio 3411.56 NOK on 8060 (7th consecutive full-score NOK-fallback, 6th agio, second French prompt)
- prod-2026-03-22-104700125Z-54534b47: NOK fallback, 5 calls, 0 errors — Sierra SL / 925302899 / 7045 EUR, rate 11.32→11.99, agio 4720.15 NOK on 8060 (6th consecutive full-score NOK-fallback, 5th agio, first Spanish prompt)
- prod-2026-03-21-222220279Z-507de3ea: NOK fallback, 5 calls, 0 errors — Dalheim AS / 847589930 / 8387 EUR, rate 11.99→12.84, agio 7128.95 NOK on 8060 (5th consecutive full-score NOK-fallback, 4th agio)
- prod-2026-03-21-220438743Z-b6a39077: NOK fallback, 5 calls, 0 errors — Tindra AS / 890241662 / 10701 EUR, rate 10.54→11.43, agio 9523.89 NOK on 8060 (4th consecutive full-score NOK-fallback, 3rd agio)
- prod-2026-03-21-203449125Z-847457b2: NOK fallback, 5 calls, 0 errors — Fossekraft AS / 928230651 / 2716 EUR, rate 10.11→9.33, disagio 2118.48 NOK on 8160 (1st full-score NOK-fallback disagio run)
- prod-2026-03-21-201703889Z-3386d6a5: NOK fallback, 5 calls, 0 errors — Elvdal AS / 964825114 / 10781 EUR, rate 11.03→11.41, agio 4096.78 NOK on 8060 (2nd full-score NOK-fallback agio run)
- prod-2026-03-21-200502800Z-86050544: NOK fallback, 5 calls, 0 errors — Bølgekraft AS / 830993940 / 12301 EUR, rate 10.83→11.83, agio 12301 NOK on 8060 (first full-score NOK-fallback run)

## Production Failures
- prod-2026-03-21-194545009Z-e0bd9a2b: 50%, 3 calls, 0 errors — Océan SARL / 863081793 / 12689 EUR, rate 11.28→10.71 disagio. Script implemented NOK fallback with simple payment only (no manual voucher). Checks 1-2 passed, checks 3-4 failed (no disagio on 8160). Correct approach: 5 calls with manual disagio voucher (debit 8160, credit 1920, amount 7232.73)
