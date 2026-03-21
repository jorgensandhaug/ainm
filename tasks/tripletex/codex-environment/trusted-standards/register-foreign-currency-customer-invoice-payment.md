# Register Foreign Currency Customer Invoice Payment

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## CRITICAL: Read This File First
You MUST `cat` or read this entire file before writing any script. Do NOT write from memory. Every production failure on this task shape came from skipping this file. The API has silent-ignore traps and missing-expansion traps that you will not anticipate from general knowledge.

## Exact Match
- register full payment on one existing outgoing customer invoice
- prompt explicitly describes a non-company-currency invoice payment
- prompt gives customer identifier plus exact invoice-currency amount
- prompt also gives either the settlement exchange rate or the company-currency paid amount
- prompt explicitly wants the realized FX gain or loss booked on payment
- one decisive `GET /invoice` can isolate the target invoice (may be EUR or NOK — this standard handles both via inline fallback)

## Do Not Use This Standard If
- the task includes creating the order or invoice first
- the task is a supplier-invoice payment
- the prompt is too ambiguous to isolate one unpaid invoice safely

## Standard Flow (3 calls, 0 errors)

### Call 1: Locate the invoice
```
GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=<run-date-plus-one-day>&fields=*,currency(*)
```

MANDATORY rules for this call:
- `invoiceDateFrom` and `invoiceDateTo` are REQUIRED — omitting them returns `422`
- `fields=*,currency(*)` is REQUIRED — plain `fields=*` returns `currency` as `{ id, url }` with no `code` field, making currency detection impossible
- DO NOT use `customerOrganizationNumber` as a query param — it is SILENTLY IGNORED (sandbox-proven: `customerOrganizationNumber=000000000` returns identical results to no filter)
- DO NOT use `currency=EUR` as a query param — it is SILENTLY IGNORED (sandbox-proven: `currency=DOESNOTEXIST` returns identical results to no filter)
- The ONLY valid customer filter is `customerId` (internal ID), but in fresh production accounts with few invoices, fetching all and filtering locally is simpler and avoids a preliminary `GET /customer`

After the response, filter locally:
1. `currency.code !== "NOK"` (must be foreign currency)
2. `amountCurrencyOutstanding > 0` (must be unpaid)
3. Match prompt amount: the prompt typically gives an ex-VAT amount, so match `amountExcludingVatCurrency`; the full outstanding incl. 25% VAT is `promptAmount * 1.25`

### MANDATORY: Validate the invoice is actually foreign currency
Before proceeding, you MUST check:
- `currency.code` is NOT `"NOK"`
- `amount !== amountCurrency` (if they are equal, the invoice is in company currency regardless of what `currency.code` says)

If the invoice is in company currency (NOK), go to the Company-Currency Fallback section below. Do NOT apply FX logic to a NOK invoice.

A real EUR invoice example: `amount=160033.50` (NOK) vs `amountCurrency=14575` (EUR) — these are always different.
A NOK invoice example: `amount=14575` vs `amountCurrency=14575` — these are always equal.

### Call 2: Resolve payment type
```
GET /invoice/paymentType?fields=*,debitAccount(*)
```

MANDATORY rules for this call:
- `debitAccount(*)` expansion is REQUIRED — without it, `debitAccount` returns as `{ id, url }` with no `number` or `isBankAccount` fields
- DO NOT filter by `paymentType.isIncoming` — this field DOES NOT EXIST on the payment type object
- DO NOT filter by `paymentType.isBankAccount` — this field DOES NOT EXIST on the payment type object
- These fields exist ONLY on the expanded `debitAccount` subobject

Selection logic (in order):
1. `debitAccount.number >= 1900 && debitAccount.number < 2000 && debitAccount.isBankAccount === true`
2. Fallback: `debitAccount.number >= 1900 && debitAccount.number < 2000` (without `isBankAccount` check)
3. Last resort: `description.toLowerCase().includes("bank")` — "Betalt til bank" is the standard Norwegian bank payment type

Do NOT choose a payment type in the same foreign currency — use a company-currency (NOK) bank payment type so Tripletex can book the FX difference.

### Call 3: Register the payment
```
PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<NOK>&paidAmountCurrency=<foreign-currency-outstanding>
```

Parameter definitions:
- `paidAmountCurrency` = `amountCurrencyOutstanding` from the invoice (the full foreign-currency amount)
- `paidAmount` = `amountCurrencyOutstanding * settlementRate` (the NOK amount at the new exchange rate)

Verify from the response: `amountCurrencyOutstanding === 0` and `amountOutstanding === 0`. Stop.

The `:payment` endpoint AUTO-BOOKS the FX gain/loss:
- Account 8060 (Valutagevinst/agio) for gain
- Account 8160 (Valutatap/disagio) for loss

NEVER create a manual `POST /ledger/voucher` for the FX difference on a EUR invoice. The payment endpoint handles it automatically.

## Company-Currency Fallback (NOK invoice with manual agio — 5 calls)

If the located invoice is in company currency (NOK) despite the prompt saying EUR/foreign:
- The invoice was set up without the foreign currency — the `:payment` endpoint will NOT auto-book FX entries
- Do NOT send FX-adjusted `paidAmount` on a NOK invoice — Tripletex ignores the mismatch and debits bank by only the actual outstanding; no FX posting is created regardless of parameters sent
- Instead, register a simple payment AND manually create an agio/disagio voucher

### NOK Fallback Flow (5 calls)

#### Call 3: Register simple payment
```
PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<amountOutstanding>
```
Omit `paidAmountCurrency`. Verify `amountOutstanding === 0`.

#### Call 4: Resolve agio/disagio account ID
```
GET /ledger/account?number=8060&fields=id,number
```
- Returns the internal ID for agio (8060) account
- If the prompt describes a loss (disagio), use `number=8160` instead
- `account: { number: ... }` does NOT work in POST /ledger/voucher — IDs are required
- The bank account ID does NOT need a separate lookup — reuse `debitAccount.id` from the paymentType resolved in Call 2 (sandbox-proven: vouchers 609133621, 609134241, 609134244)

#### Call 5: Book the FX difference manually
```
POST /ledger/voucher?sendToLedger=true
```
Body (for agio — settlement rate > original rate):
```json
{
  "date": "<payment-date>",
  "description": "Valutagevinst (agio) - kursforskjell",
  "postings": [
    { "row": 1, "date": "<payment-date>", "account": { "id": <paymentTypeBankAcctId> }, "amountGross": <agioAmount>, "amountGrossCurrency": <agioAmount>, "vatType": { "id": 0 }, "description": "Kursgevinst innbetaling" },
    { "row": 2, "date": "<payment-date>", "account": { "id": <agioAcctId> }, "amountGross": <-agioAmount>, "amountGrossCurrency": <-agioAmount>, "vatType": { "id": 0 }, "description": "Valutagevinst (agio)" }
  ]
}
```
Note: `<paymentTypeBankAcctId>` is `debitAccount.id` from the paymentType resolved in Call 2 — do NOT hardcode 1920, reuse the actual bank account from the payment type.

**CRITICAL: `row` must start from 1, NOT 0.** Row 0 is reserved as "system-generated" by Tripletex. Using `row: 0` → 422 (`Posteringene på rad 0 (guiRow 0) er systemgenererte`). This was the root cause of the earlier 0% run that tried manual vouchers.

FX difference amount calculation:
- `fxAmount = promptEurAmount * |settlementRate - originalRate|` (always positive)
- Use the prompt's stated EUR amount (typically ex-VAT, matching how a real EUR export invoice would have 0% VAT)

For **agio** (settlement rate > original rate, FX gain):
- Account lookup: `GET /ledger/account?number=8060&fields=id,number`
- Bank account: reuse `debitAccount.id` from paymentType (Call 2)
- Row 1: bank (paymentType debitAccount), `amountGross: +fxAmount` (debit — bank received more)
- Row 2: agio (8060), `amountGross: -fxAmount` (credit — income)
- Example: 18687 EUR × (10.87 − 10.33) = 18687 × 0.54 = **10090.98** NOK
- Production-confirmed: run 86050544 (12301 × 1.00 = 12301, voucher 609126234), run 3386d6a5 (10781 × 0.38 = 4096.78, voucher 609131777)

For **disagio** (settlement rate < original rate, FX loss):
- Account lookup: `GET /ledger/account?number=8160&fields=id,number`
- Bank account: reuse `debitAccount.id` from paymentType (Call 2)
- Row 1: disagio (8160), `amountGross: +fxAmount` (debit — expense)
- Row 2: bank (paymentType debitAccount), `amountGross: -fxAmount` (credit — bank received less)
- Example: 12689 EUR × (11.28 − 10.71) = 12689 × 0.57 = **7232.73** NOK

Sandbox proof (2026-03-21): NOK invoice `2147609133` (`amount=amountCurrency=2565`): sending `paidAmount=25675.65` + `paidAmountCurrency=2565` still closed the invoice; zero FX posting was created — confirming manual voucher is necessary for agio on NOK invoices.

Sandbox proof (2026-03-21): manual agio voucher with `row: 1` on accounts 1920/8060 created successfully (voucher `609118154`), invoice remained closed (`amountOutstanding=0`), 8060 posting verified with correct amount. Using `row: 0` → 422 for ALL accounts (1920, 8060, 7100, 7140, etc.) — this is NOT account-specific but a universal Tripletex restriction on row 0.

## Canonical Call Count
- standalone EUR invoice payment with no cached payment type: `3` calls
- standalone NOK fallback with manual agio: `5` calls (invoice + paymentType + payment + accountLookup + agioVoucher)
- EUR with cached same-run `paymentTypeId`: `2` calls
- NOK fallback with cached same-run `paymentTypeId`: `4` calls (skip paymentType lookup)
- do not treat cross-run or cross-account cached ids as reusable

## Known Recovery Branches
- if the same run already resolved one valid incoming company-currency `paymentTypeId`, reuse it instead of reading `/invoice/paymentType` again
- if the decisive invoice read shows that the prompt amount only matches `amountExcludingVatCurrency` or `amountExcludingVat` on a company-currency invoice, stop treating the prompt as an exact foreign-currency-payment match
- if the decisive invoice read returns an invoice where `amount === amountCurrency` and `currency.code === "NOK"`, this is a company-currency invoice; use the NOK Fallback Flow with manual agio voucher
- if `POST /ledger/voucher` fails with row 0 error, re-submit with `row: 1` and `row: 2` — row 0 is always system-reserved

## CRITICAL: Script Must Handle Both EUR and NOK Cases

The script MUST contain inline fallback logic for NOK invoices. Do NOT write a script that only handles EUR invoices and exits with an error when it finds NOK. This caused a 0% timeout in production run 67c52406.

The script pattern:
1. Fetch invoices, filter for foreign currency with outstanding > 0
2. If a matching EUR/foreign invoice is found → use FX payment logic (paidAmount + paidAmountCurrency) — 3 calls total
3. If NO foreign invoice found → find the NOK invoice matching `amountExcludingVat`:
   a. Register simple payment (paidAmount = amountOutstanding)
   b. Look up agio/disagio account ID: `GET /ledger/account?number=8060` (or `8160` for disagio) — reuse paymentType `debitAccount.id` for the bank account
   c. POST /ledger/voucher?sendToLedger=true with row=1+ to book agio manually
   d. 5 calls total
4. In BOTH cases, register a payment AND book the FX difference. NEVER stop without paying. NEVER stop without booking agio if the prompt requests it.

## Production Confirmation History

### prod-2026-03-21-222220279Z-507de3ea (Nynorsk prompt, Dalheim AS / 847589930 / 8387 EUR, rate 11.99→12.84 agio):
- NOK fallback path: invoice `2147644847` had `amountExcludingVat=8387`, `amountOutstanding=10483.75`, `amount===amountCurrency` (NOK)
- 5 calls, 0 errors: invoice lookup → paymentType → simple payment → accountLookup(8060) → manual agio voucher
- Agio: 8387 × (12.84 − 11.99) = 8387 × 0.85 = 7128.95 NOK booked on 8060 (voucher `609185286`)
- Payment type `37533286` ("Betalt til bank", debitAccount 1920, id=475152678)
- 5th consecutive full-score NOK-fallback production confirmation; 4th agio confirmation

### prod-2026-03-21-220438743Z-b6a39077 (Norwegian prompt, Tindra AS / 890241662 / 10701 EUR, rate 10.54→11.43 agio):
- NOK fallback path: invoice `2147643129` had `amountExcludingVat=10701`, `amountOutstanding=13376.25`, `amount===amountCurrency` (NOK)
- 5 calls, 0 errors: invoice lookup → paymentType → simple payment → accountLookup(8060) → manual agio voucher
- Agio: 10701 × (11.43 − 10.54) = 10701 × 0.89 = 9523.89 NOK booked on 8060 (voucher `609176454`)
- Payment type `37483992` ("Betalt til bank", debitAccount 1920, id=474619862)
- 4th consecutive full-score NOK-fallback production confirmation; 3rd agio confirmation

### prod-2026-03-21-203449125Z-847457b2 (Nynorsk prompt, Fossekraft AS / 928230651 / 2716 EUR, rate 10.11→9.33 disagio):
- NOK fallback path: invoice `2147635477` had `amountExcludingVat=2716`, `amountOutstanding=3395`, `amount===amountCurrency` (NOK)
- 5 calls, 0 errors: invoice lookup → paymentType → simple payment → accountLookup(8160) → manual disagio voucher
- Disagio: 2716 × (10.11 − 9.33) = 2716 × 0.78 = 2118.48 NOK booked on 8160 (voucher `609139929`)
- Payment type `37201899` ("Betalt til bank", debitAccount 1920, id=471574486)
- 1st full-score NOK-fallback disagio production confirmation — confirms debit 8160 (+fxAmount), credit bank (−fxAmount) direction for loss

### prod-2026-03-21-201703889Z-3386d6a5 (Nynorsk prompt, Elvdal AS / 964825114 / 10781 EUR, rate 11.03→11.41):
- NOK fallback path: invoice `2147633697` had `amountExcludingVat=10781`, `amountOutstanding=13476.25`, `amount===amountCurrency` (NOK)
- 5 calls, 0 errors: invoice lookup → paymentType → simple payment → accountLookup(1920,8060) → manual agio voucher
- Agio: 10781 × (11.41 − 11.03) = 10781 × 0.38 = 4096.78 NOK booked on 8060 (voucher `609131777`)
- Payment type `37142903` ("Betalt til bank", debitAccount 1920)
- 2nd full-score NOK-fallback agio production confirmation

### prod-2026-03-21-200502800Z-86050544 (Nynorsk prompt, Bølgekraft AS / 830993940 / 12301 EUR, rate 10.83→11.83):
- NOK fallback path: invoice `2147632528` had `amountExcludingVat=12301`, `amountOutstanding=15376.25`, `amount===amountCurrency` (NOK)
- 5 calls, 0 errors: invoice lookup → paymentType → simple payment → accountLookup(1920,8060) → manual agio voucher
- Agio: 12301 × (11.83 − 10.83) = 12301 NOK booked on 8060 (voucher `609126234`)
- Payment type `37104879` ("Betalt til bank", debitAccount 1920)
- First full-score NOK-fallback production confirmation with manual agio

## Production Failure History

### prod-2026-03-21-194545009Z-e0bd9a2b (50% score — Océan SARL / 863081793 / 12689 EUR, rate 11.28→10.71 disagio):
- Correctly used `fields=*,currency(*)` and detected invoice was NOK
- Script had NOK fallback: registered simple payment (amountOutstanding=0) ✓
- Did NOT create manual disagio voucher — script implemented "simple payment only" NOK fallback despite trusted standard already having the 5-call NOK fallback flow at this point
- Checks 1-2 passed (payment registered), checks 3-4 failed (no disagio booked on 8160)
- 3 API calls, 0 errors — should have been 5 calls with manual disagio voucher
- Correct disagio: 12689 × (11.28 − 10.71) = 12689 × 0.57 = 7232.73 NOK on account 8160
- Root cause: agent read the trusted standard but did not implement the manual voucher logic in the NOK fallback path
### prod-2026-03-21-193537525Z-840df81a (50% score — task 27, Solmar SL / 877276260 / 18687 EUR):
- Correctly used `fields=*,currency(*)` and detected invoice was NOK
- Script had NOK fallback: registered simple payment (amountOutstanding=0) ✓
- Did NOT create manual agio voucher — trusted standard at the time said not to
- Checks 1-2 passed (payment registered), checks 3-4 failed (no agio booked)
- Root cause: the NOK fallback was "simple payment only" without manual agio — now fixed with 5-call NOK fallback flow
- 3 API calls, 0 errors — call-optimal for the approach used, but agio was missing
### prod-2026-03-21-180635197Z-67c52406 (0% score — task 27, same prompt):
- Correctly used `fields=*,currency(*)` and detected invoice was NOK
- Script only handled EUR case; when 0 foreign candidates found, it exited with error
- Agent wrote a second inspection script but then timed out without ever registering any payment
- Root cause: script had no NOK fallback — should have immediately fallen back to payment + manual agio
### Earlier run (50% score — 2/4 checks failed):
- Used `customerOrganizationNumber` and `currency` as query params — both silently ignored
- Used `fields=*` without `currency(*)` — could not verify invoice was actually EUR
- Used `fields=*` without `debitAccount(*)` on payment type — filtered by nonexistent `p.isIncoming` and `p.isBankAccount`
- Ended up paying a NOK invoice as if it were EUR — checks 1-2 passed (payment registered) but checks 3-4 failed (no agio booked)
### Earlier run (0% score):
- Correctly used `currency(*)` and detected invoice was NOK
- Manually created a `POST /ledger/voucher` to book agio but used `row: 0` which is system-reserved → 422 error
- Root cause: `row: 0` is universally rejected by Tripletex as "systemgenererte" — must use `row: 1`+; this was misdiagnosed as "corrupting the accounting state" but was actually a format error

## OpenAPI / Sandbox Status
- `/invoice`, `/invoice/{id}/:payment`, and `/invoice/paymentType` verified in `./openapi.json`
- persistent sandbox proof on 2026-03-21 created a disposable EUR invoice for `FX Reflection 532193 GmbH` / `999532193`, then located invoice `2147581286` with `currency.code=EUR`, `amountCurrencyOutstanding=19107`, and `amount=215823.12`
- the same proof used incoming bank payment type `32813748` (`currencyCode=NOK`, debit account `1920`) and `PUT /invoice/2147581286/:payment?paymentDate=2026-03-21&paymentTypeId=32813748&paidAmount=214823.12&paidAmountCurrency=19107`
- that payment write closed the invoice with `remainingOutstanding=0`
- the resulting payment voucher `608897955` auto-booked the FX loss on account `8160` with amount `1000`; no manual `/ledger/voucher` write was needed
- 2026-03-21 sandbox re-proof with EUR invoice `2147608960` (`amountCurrency=1000 EUR`, `amount=10001.3 NOK`): payment at settlement rate 10.01 auto-booked FX gain on account 8060 with amount 8.7 NOK
- 2026-03-21 sandbox NOK-mismatch proof with NOK invoice `2147609133` (`amount=amountCurrency=2565`): sending `paidAmount=25675.65` + `paidAmountCurrency=2565` still closed the invoice; zero FX posting was created
- 2026-03-21 sandbox proof: `POST /ledger/voucher` with `row: 0` → 422 for ALL accounts (tested 1920, 8060, 7100, 7140, 3000, 4300, 1500, 1900, 8160); error always says "Posteringene på rad 0 (guiRow 0) er systemgenererte"; `row: 1` succeeds for all accounts — this is a universal Tripletex restriction, not account-specific
- 2026-03-21 sandbox proof: manual agio voucher `609118154` with `row: 1` on 1920 (debit +12613.73) and 8060 (credit -12613.73) succeeded; invoice `2147630683` remained closed (`amountOutstanding=0`); 8060 posting verified
- 2026-03-21 sandbox proof: `GET /ledger/account?number=1920,8060&fields=id,number` returns exactly 2 accounts with correct IDs — comma-separated `number` query param works for precise multi-account lookup
- 2026-03-21 sandbox auto-generated EUR payment voucher structure (voucher 339, invoice 333): `1920 +135899.19` (bank), `1500 -135899.19 / amountCurrency=-12689` (customer), `8160 +7429.41` (disagio), `1500 -7429.41 / amountCurrency=0` (disagio counter); the auto FX posting uses 1500/8160, but manual voucher uses 1920/8060 to avoid touching customer balance
- 2026-03-21 sandbox proof: `POST /ledger/voucher` with `account: { number: 1920 }` (no ID) → 422 "account.name: Kan ikke være null"; with `account: { number: 1920, name: "Bankinnskudd" }` → 422 "Internt felt (account): Feltet må fylles ut" — confirms `account: { id }` is the only working format, `GET /ledger/account` cannot be skipped in the NOK fallback path
- 2026-03-21 sandbox proof: manual disagio voucher `609122714` with `row: 1` on 8160 (debit +7232.73) and `row: 2` on 1920 (credit -7232.73) succeeded — confirming the disagio direction (debit expense, credit bank) works
- 2026-03-21 sandbox proof: `POST /ledger/voucher` with 8160/1500 (no customer) → 422 "Kunde mangler" — account 1500 (Kundefordringer) requires `customer: { id }` on the posting; the manual voucher approach uses 1920 (bank) instead to avoid this dependency
- 2026-03-21 sandbox proof: `POST /ledger/voucher` with 8160/1500 and `customer: { id }` → 201 (voucher `609127910`) — 1500 with customer DOES work, but 1920 is simpler and production-confirmed
- 2026-03-21 sandbox proof: paymentType `debitAccount.id` from `GET /invoice/paymentType?fields=*,debitAccount(*)` can be reused directly in `POST /ledger/voucher` postings as the bank account (vouchers `609133621`, `609134241`, `609134244`); this means `GET /ledger/account` only needs to look up the agio/disagio account (8060 or 8160), not the bank account — the bank account ID is already available from Call 2; call count stays at 5 but the approach is more correct (uses the actual payment bank account rather than hardcoded 1920)
