# Register Foreign Currency Customer Invoice Payment

## Scope

Use for tasks like:
- register full payment on an existing outgoing customer invoice in a non-company currency
- prompt gives the customer plus the exact invoice-currency amount
- prompt also gives the settlement exchange rate or the exact company-currency paid amount
- prompt explicitly wants the realized FX gain/loss booked on payment

Do not use for:
- creating the invoice itself
- ordinary company-currency invoice payments
- supplier-invoice payments
- prompts where the decisive invoice read returns only company-currency invoices or only an ex-VAT coincidence

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

## Minimal Flow (3 calls)

1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=<run-date+1>&fields=*,currency(*)`
   - Filter locally: `currency.code !== "NOK"` AND `amountCurrencyOutstanding > 0`
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
   b. Look up account IDs: `GET /ledger/account?number=1920,8060&fields=id,number`
   c. Create manual agio voucher: `POST /ledger/voucher?sendToLedger=true` with `row: 1`+
   d. Agio = promptEurAmount × (settlementRate − originalRate) — 5 calls total
4. ALWAYS register a payment AND book agio. Never exit without paying.

## Company-Currency Fallback (NOK invoice with manual agio)

If the invoice is NOK despite the prompt describing a foreign-currency payment:
- Register simple payment: `paidAmount = amountOutstanding`, no `paidAmountCurrency`
- Then create a manual agio voucher with `POST /ledger/voucher?sendToLedger=true`:
  - Debit 1920 (bank) for the agio amount
  - Credit 8060 (agio) for the agio amount (negative amountGross)
  - Use `row: 1` and `row: 2` — NEVER row 0 (system-reserved, causes 422)
  - Use `vatType: { id: 0 }` on both postings
  - Agio = promptEurAmount × (settlementRate − originalRate)
- Do NOT apply FX logic on the `:payment` call — Tripletex ignores FX params on NOK invoices
- For disagio (settlement rate < original rate): debit 8160, credit 1920
- The account IDs must be resolved via `GET /ledger/account?number=1920,8060` — `account: { number: ... }` does NOT work in voucher body

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
- `account: { number: ... }` in voucher body → 422; must use `account: { id: ... }` from GET /ledger/account
- Prompt amount is typically ex-VAT → multiply by 1.25 for full outstanding
