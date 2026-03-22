# Book Reminder Fee, Invoice It, And Register Partial Payment On Overdue Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- exactly one existing overdue outgoing customer invoice is implied by the prompt
- prompt requires an exact manual reminder fee booking of the prompt-fixed amount to ledger accounts `1500` and `3400`
- prompt also requires a separate outgoing fee invoice for the same customer and wants it sent
- prompt also requires a partial payment of exactly `5000` on the overdue invoice
- prompt does not give the overdue invoice id directly

## Do Not Use This Standard If
- several overdue invoices remain after one decisive invoice read
- the prompt explicitly says to use Tripletex reminder/remittance/debt-collection functionality instead of a manual fee booking
- the prompt requires different ledger accounts or a different payment amount
- the located overdue invoice has outstanding amount below `5000`
- the prompt requires a specific send-channel override for the fee invoice

## Standard Flow
1. `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&count=1000&sorting=-invoiceDate&fields=*,customer(*)`
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
3. `GET /ledger/account?number=1500,3400&fields=*`
4. `POST /ledger/voucher`
5. `POST /invoice`
6. `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=5000`
7. stop

## Payload Rules
- on the locate read, treat the winning invoice as:
  - `invoiceDueDate < run-date`
  - positive `amountCurrencyOutstanding` or `amountOutstanding`
  - the only overdue row left after local filtering
- reuse the located `customer.id` for both the manual voucher and the fee invoice
- on `GET /invoice/paymentType`, prefer an incoming bank-style payment type whose debit account is `19xx`, `isBankAccount=true`, or `isInvoiceAccount=true`
- do not reject a usable payment type just because `name=null` or `creditAccount=null`
- do not try to save a call by omitting `paymentTypeId` on `PUT /invoice/{id}/:payment`; persistent sandbox on `2026-03-21` returned `422 paymentTypeId: Kan ikke være null.` on fixture invoice `206`
- on `GET /ledger/account?number=1500,3400&fields=*`, choose by exact numeric `account.number`, not by account name
- do not reject prompt-required account `3400` only because the returned row is marked `isInactive=true`; the id-based voucher write is the decisive test
- on `POST /ledger/voucher`, send:
  - `voucherType: null`
  - one positive posting on account `1500`
  - `customer: { "id": ... }` on that `1500` posting
  - one negative posting on account `3400`
  - `currency: { "id": 1 }`
  - `amount`, `amountCurrency`, `amountGross`, and `amountGrossCurrency` all set to the prompt fee amount / negative prompt fee amount
  - explicit `row: 1` on the first posting and `row: 2` on the second posting; omitting `row` defaults to row 0 which is system-generated, causing `422 Posteringene på rad 0 (guiRow 0) er systemgenererte` — sandbox-verified as consistent, not account-specific
- on the fee-invoice `POST /invoice`, create one direct order line for the prompt fee amount using `orders[].orderLines[]` — the order line goes **inside** an order object within the `orders` array, not as a top-level `orderLines` field on the invoice; the invoice must include `orders[{ customer, orderDate, deliveryDate, orderLines: [...] }]`; using `orders: []` with top-level `orderLines: [...]` fails `422 orders: Listen kan ikke være tom.` — sandbox-verified on `2026-03-21` and hit in production run `ba977073`
- omit `vatType` on the order line; the API defaults to vatType id=0 ("Ingen avgiftsbehandling", 0%) which is correct for a no-VAT reminder fee and produces the correct invoice amount
- do not use `/invoice/{id}/:createReminder` for this exact task shape:
  - the fee amount there is account-configured, not prompt-controlled
  - sandbox on `2026-03-21` required an explicit send type
  - sandbox rejected `type=REMINDER`
  - sandbox accepted `type=SOFT_REMINDER&dispatchTypes=EMAIL` but charged `38`, not the prompt-required fee amount
- on the partial-payment write, use the prompt-fixed `paidAmount=5000`, not the full outstanding amount
- because the task already proves an existing charged outgoing invoice, do not add a proactive company-bank-account hedge before the fee-invoice write

## Response Parsing
- Tripletex list endpoints return `{ values: [...] }`, single-object endpoints return `{ value: {...} }`
- always handle both shapes from the very first script write; the `GET /invoice` response uses `values` (list), not `value`
- a response-parsing bug in the `prod-2026-03-21` run crashed the script after the first GET, wasting 1 API call; the fix-up added handling for both shapes before the successful re-run
- the correct generic parser: `if (json.values !== undefined) return json.values; if (json.value !== undefined) return json.value; return json;`

## Reuse From Write Response
- from the locate read:
  - overdue invoice id
  - overdue invoice number
  - overdue invoice outstanding amount before payment
  - customer id
- from `POST /ledger/voucher`:
  - voucher id and number
  - returned postings proving `1500` / `3400` and the prompt fee amount / negative prompt fee amount
- from `POST /invoice`:
  - fee invoice id
  - fee invoice number
  - `amountCurrency=<prompt-fee>`
- from `PUT /invoice/{id}/:payment`:
  - remaining outstanding amount after the partial payment

## Verification
- default verification is zero extra calls after the payment write
- trust the voucher write response when it already proves:
  - voucher id and number
  - one `1500` posting with `customer.id`
  - one `3400` posting
  - prompt fee amount / negative prompt fee amount
- trust the fee-invoice write response when it already proves `amountCurrency=<prompt-fee>` and a new fee invoice number
- trust the payment write response when it reduces outstanding by exactly `5000` from the locate-read amount

## Known Recovery Branches
- if the first invoice read returns zero overdue invoices or more than one overdue invoice, stop treating the task as an exact-match standard
- if the same run already holds a proven incoming `paymentTypeId` for the same company and currency, reuse it instead of reading `/invoice/paymentType` again
- if the fee-invoice write fails only on the missing-company-bank-account validation, use the normal repair branch:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - `PUT /ledger/account/{id}` on the existing invoice account with minimal payload `{ "bankAccountNumber": "12345678903" }`
  - retry the same fee-invoice write once
- if that repair branch was already forced, do not restart from the voucher write or payment-type read

## Canonical Call Count
- exact standalone task with no cached same-run ids: `6` calls
- same task shape with cached same-run incoming `paymentTypeId`: `5` calls
- no public lower-call standalone shortcut was proven for the exact task shape

## OpenAPI / Sandbox Status
- `/invoice`, `/invoice/{id}/:payment`, `/invoice/paymentType`, `/ledger/account`, and `/ledger/voucher` verified in `./openapi.json`
- persistent sandbox proof on `2026-03-21` first disproved the tempting reminder shortcut:
  - `PUT /invoice/{id}/:createReminder` without a send type failed `422 Minst én sendetype må oppgis.`
  - `PUT /invoice/{id}/:createReminder?type=REMINDER...` failed `422 type: Ugyldig verdi.`
  - `PUT /invoice/{id}/:createReminder?type=SOFT_REMINDER&dispatchTypes=EMAIL&includeCharge=true` succeeded but created reminder charge `38`, not the prompt-controlled fee amount
  - that reminder branch therefore is not a correct exact-match replacement for prompt-controlled reminder-fee tasks on `1500` / `3400`
- persistent sandbox proof on `2026-03-21` confirmed the manual exact-fee branch on disposable fixture customer `995205756` / invoice `180`:
  - one decisive overdue-invoice locate read found the fixture invoice with `amountCurrencyOutstanding=10000` and `invoiceDueDate=2026-03-01`
  - `GET /invoice/paymentType` returned usable incoming bank payment type `32813748`
  - `GET /ledger/account?number=1500,3400&fields=*` returned both required account rows; account `3400` came back `isInactive=true` with an unrelated display name, and the later id-based voucher write still succeeded
  - `POST /ledger/voucher` succeeded with voucher `608897119`
  - `POST /invoice` created fee invoice `181` with `amountCurrency=65`
  - `PUT /invoice/2147580713/:payment?paymentDate=2026-03-21&paymentTypeId=32813748&paidAmount=5000` reduced the overdue invoice outstanding from `10000` to `5000`
- production proof on `2026-03-21` confirmed the `7`-call branch (with vatType GET) for German prompt amount `50`:
  - `POST /invoice` created and sent fee invoice `5` with `amountCurrency=50`
  - `PUT /invoice/2147546735/:payment?paymentDate=2026-03-21&paymentTypeId=27178699&paidAmount=5000` reduced outstanding to `28562.5`
- production proof on `2026-03-21` (`prod-2026-03-21-124240715Z-4117f590`) confirmed `7`-call branch for Portuguese prompt amount `35` on fresh account, scoring 6/6 (normalized_score=6, best possible):
  - overdue invoice #2 (id=2147587824), customer=108342547, outstanding=18687.5
  - voucher #1, fee invoice #4 (amount=35), payment reduced outstanding to 13687.5
  - 1 wasted GET /invoice call due to response-parsing bug (`value` vs `values`) in the initial script
- persistent sandbox proof on `2026-03-21` confirmed the `6`-call path (omitting vatType GET):
  - `POST /invoice` without `orderLines[].vatType` succeeded for fee amount `35`; API defaulted to vatType id=0 ("Ingen avgiftsbehandling", 0%); invoice amount was correct at `35`
  - full end-to-end 6-call run: locate → paymentType → accounts → voucher → invoice → payment all succeeded
  - `POST /invoice` with the omitted vatType showed `amountCurrency=35`, `amountExcludingVatCurrency=35`, `amountIncludingVatCurrency=35` — all identical, confirming 0% VAT was applied
  - voucher posting with `account: { number: 1500 }` (instead of `account: { id: ... }`) failed `422 postings.account.name: Kan ikke være null` — the account GET is still required
- persistent sandbox re-proof on `2026-03-21` with a one-call disposable setup invoice `206` (`id=2147594276`, customer `108334046`, amount `9000`, due `2026-03-05`) re-confirmed two things:
  - the tempting `5`-call branch `... -> PUT /invoice/{id}/:payment?paymentDate=...&paidAmount=...` without `paymentTypeId` failed `422 paymentTypeId: Kan ikke være null.`
  - the full `6`-call branch with fee `50` then succeeded on that same fixture: payment type `32813748`, voucher `608963784`, fee invoice `207` (`amountCurrency=50`), and payment reduced outstanding from `9000` to `4000`
- production proof on `2026-03-21` (`prod-2026-03-21-134955068Z-b244cce3`) confirmed the `6`-call branch for a Spanish prompt with fee `50` and no bank-account repair:
  - overdue invoice `#2` (`id=2147593896`), customer `108352269`, outstanding `24812.5`
  - voucher `#1` (`id=608962870`), fee invoice `#4` (`id=2147594063`, amount `50`)
  - payment type `36469300`
  - payment reduced outstanding to `19812.5`
- persistent sandbox re-proof on `2026-03-21` tested whether `account: { number: 1500, name: "Kundefordringer" }` (number+name, no id) could skip the account GET:
  - `POST /ledger/voucher` with `account: { number: 1500, name: "Kundefordringer" }` failed `422 Internt felt (account): Feltet må fylles ut.`
  - this confirms `account.id` is strictly mandatory; neither `number` alone nor `number+name` is accepted
  - the `GET /ledger/account` call cannot be eliminated
- production proof on `2026-03-21` (`prod-2026-03-21-171051701Z-de935656`) confirmed the `6`-call path for Norwegian prompt with fee `50`, 0 errors, 0 wasted calls:
  - overdue invoice `#1` (`id=2147613724`), customer `108381232`, outstanding `16250`
  - voucher `#1` (`id=609051585`)
  - fee invoice `#4` (`id=2147613830`, amount `50`)
  - payment type `36723119`
  - payment reduced outstanding to `11250`
- the `6`-call path is now the default for this task shape; the previous `7`-call path included a now-unnecessary `GET /ledger/vatType` call
- production proof on `2026-03-21` (`prod-2026-03-21-184424564Z-d022ee19`) hit the `row 0 systemgenererte` trap on voucher POST without explicit `row` values, requiring 7 calls (1 wasted 422):
  - overdue invoice `#1` (`id=2147625691`), customer `108395937`, outstanding `19687.5`
  - voucher POST without `row` failed `422 Posteringene på rad 0 (guiRow 0) er systemgenererte`; retry with `row: 1` and `row: 2` succeeded as voucher `#1` (`id=609094799`)
  - fee invoice `#4` (`id=2147625942`, amount `70`)
  - payment type `36850274`
  - payment reduced outstanding to `14687.5`
  - **fix**: always set explicit `row: 1` and `row: 2` on voucher postings to avoid the system-generated row 0 trap
- persistent sandbox re-proof on `2026-03-21` confirmed the `row` requirement is consistent, not account-specific:
  - `POST /ledger/voucher` without `row` failed `422 Posteringene på rad 0 (guiRow 0) er systemgenererte`
  - same payload with `row: 1` and `row: 2` succeeded as voucher `609095912`
  - full 6-call end-to-end re-proof with `row` fix: fixture invoice `#318` (`id=2147626400`, outstanding `10000`), voucher `609096514`, fee invoice `#319` (`id=2147626402`, amount `70`), payment reduced outstanding to `5000`
- production proof on `2026-03-21` (`prod-2026-03-21-203931462Z-00a15d2d`) confirmed the `6`-call path for French prompt with fee `50`, 0 errors, 0 wasted calls:
  - overdue invoice `#2` (`id=2147635863`), customer `108419715`, outstanding `29375`
  - voucher `#1` (`id=609142150`)
  - fee invoice `#4` (`id=2147635928`, amount `50`)
  - payment type `37216892`
  - payment reduced outstanding to `24375`
  - 5th production confirmation of the `6`-call path; now verified across `nb`, `es`, `pt`, `de`, and `fr` prompts
- production proof on `2026-03-21` (`prod-2026-03-21-214826630Z-16c30378`) confirmed the `6`-call path for French prompt with fee `60`, 0 errors, 0 wasted calls:
  - overdue invoice `#1` (`id=2147641528`), customer `108433770`, outstanding `23562.5`
  - voucher `#1` (`id=609169374`)
  - fee invoice `#4` (`id=2147641603`, amount `60`)
  - payment type `37435187`
  - payment reduced outstanding to `18562.5`
  - 6th production confirmation of the `6`-call path; verified across `nb`, `es`, `pt`, `de`, and `fr` prompts with fee amounts `35`, `50`, `60`, `70`
- production proof on `2026-03-21` (`prod-2026-03-21-215357856Z-a1e81130`) confirmed the `6`-call path for Spanish prompt with fee `60`, 0 errors, 0 wasted calls:
  - overdue invoice `#3` (`id=2147642065`), customer `108434854`, outstanding `35000`
  - voucher `#1` (`id=609171478`)
  - fee invoice `#4` (`id=2147642189`, amount `60`)
  - payment type `37451308`
  - payment reduced outstanding to `30000`
  - 7th production confirmation of the `6`-call path; no new language or fee amount combination but re-confirms `es`+`60` stability
- production proof on `2026-03-21` (`prod-2026-03-21-222433471Z-ba977073`) hit the `orders: []` + top-level `orderLines` trap on fee-invoice POST, requiring 7 calls (1 wasted 422):
  - overdue invoice `#1` (`id=2147645103`), customer `108441398`, outstanding `36875`, due `2026-02-07`
  - voucher `#1` (`id=609186182`), accounts 1500 (id=475220342) / 3400 (id=475220538), fee `40`
  - first `POST /invoice` with `orders: [], orderLines: [...]` failed `422 orders: Listen kan ikke være tom.`; fix-up used correct `orders: [{ customer, orderDate, deliveryDate, orderLines: [...] }]` structure
  - fee invoice `#4` (`id=2147645318`, amount `40`)
  - payment type `37539606`
  - payment reduced outstanding from `36875` to `31875`
  - **fix**: the Payload Rules section now explicitly documents the `orders[].orderLines[]` structure requirement to prevent this trap
- persistent sandbox re-proof on `2026-03-21` confirmed: `POST /invoice` with `orders: [], orderLines: [...]` fails `422 orders: Listen kan ikke være tom.`; same payload with `orders: [{ orderLines: [...] }]` succeeds `201` with `amountCurrency=40`
- production proof on `2026-03-21` (`prod-2026-03-21-223053963Z-9109b98e`) confirmed the `6`-call path for English prompt with fee `40`, 0 errors, 0 wasted calls:
  - overdue invoice `#3` (`id=2147645684`), customer `108442732`, outstanding `26312.5`, due `2026-02-04`
  - voucher `#1` (`id=609188183`), accounts 1500 (id=475406588) / 3400 (id=475406784)
  - fee invoice `#4` (`id=2147645759`, amount `40`)
  - payment type `37556805`
  - payment reduced outstanding from `26312.5` to `21312.5`
  - 9th production confirmation of the `6`-call path; first clean `en`+`40` combination; now verified across `nb`, `en`, `es`, `pt`, `de`, and `fr` prompts with fee amounts `35`, `40`, `50`, `60`, `70`
- production run on `2026-03-22` (`prod-2026-03-22-034304639Z-37825322`) was blocked by expired proxy token (403 on first GET); script was correctly structured for the `6`-call path with Spanish prompt and fee `35`; scored `0/10` purely due to credential expiry, not a logic error
- persistent sandbox re-proof on `2026-03-22` confirmed the `6`-call path end-to-end: fixture invoice `#529` (`id=2147672215`, outstanding `10000`), voucher `609301160`, fee invoice `#530` (`amountCurrency=35`), payment reduced outstanding to `5000`; 0 errors
- sandbox investigation on `2026-03-22` tested whether invoice postings contain enough account ids to skip `GET /ledger/account`: the overdue invoice's auto-generated postings include account `1500` (`id=424190806`) but NOT account `3400`; therefore the `GET /ledger/account?number=1500,3400` call cannot be eliminated — `3400` is only obtainable from the ledger account endpoint
- the `6`-call path is confirmed across 9 clean production runs + 1 blocked run and multiple sandbox proofs on `2026-03-21` and `2026-03-22`; no `5`-call standalone path exists
