# Create Free Accounting Dimension and Book Voucher

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one new free accounting dimension
- create one or more new values for that dimension from prompt-provided names
- then book one simple manual voucher
- the scored voucher line is one ledger-account posting linked to one of the newly created dimension values
- no supplier, customer, employee, project, VAT-specific, update, delete, or reversal flow

## Do Not Use This Standard If
- the task modifies or deletes an existing free dimension or value
- the task needs a supplier-invoice, customer-invoice, payroll, project, or travel-expense flow
- the voucher requires linked customer, supplier, employee, or project objects
- the prompt gives a special balancing-account requirement that materially differs from the standard bank-line fallback

## Standard Flow
1. `POST /ledger/accountingDimensionName`
2. `POST /ledger/accountingDimensionValue` once per requested value
3. `GET /ledger/account?number=<target-account>,1920&fields=*`
4. `POST /ledger/voucher`
5. verify from the write responses
6. stop

## Payload Rules
- on `POST /ledger/accountingDimensionName`, send:
  - `dimensionName`
  - `active: true`
- `dimensionName` is validated at max length `20`; if the prompt-provided name exceeds that, treat the run as blocked instead of truncating it
- on each `POST /ledger/accountingDimensionValue`, the minimal proven payload is:
  - `dimensionIndex`
  - `displayName`
  - `active: true`
  - `showInVoucherRegistration: true`
- preserve the prompt-provided create order for new values, but choose the scored voucher link by exact returned `displayName`; same-day production runs proved the linked value can be either the first or second created value depending on the prompt
- do not invent `number` or `position` on the dimension values for the standard path; sandbox proved Tripletex accepts the minimal payload and auto-assigns ordering
- `/ledger/accountingDimensionValue/list` is `PUT` batch update, not batch create, so each new prompt-provided value still needs its own `POST /ledger/accountingDimensionValue`
- reuse the returned `dimensionIndex` from the dimension-name create response; persistent sandbox assigned `2` in one run and `3` in later re-verification, not only `1`
- on `POST /ledger/voucher`:
  - set `voucherType: null`
  - build a balanced two-line voucher
  - use the resolved ledger-account ids, not `account.number` alone
  - on the scored posting, attach the chosen value as `freeAccountingDimension1`, `freeAccountingDimension2`, or `freeAccountingDimension3` according to the returned `dimensionIndex`
  - each posting MUST include `row` starting at `1` (not `0`); row `0` is reserved for system-generated postings and Tripletex will reject the voucher with `422` if any user posting lands on row `0`
  - `date`, `description`, and `currency` on individual postings are optional; Tripletex auto-fills them from the voucher-level values
- if the prompt gives only the target ledger account and omits the balancing account, the standard fallback is the existing bank account `1920`
- for a zero-VAT manual voucher, omit `vatType` and send the same value in:
  - `amount`
  - `amountCurrency`
  - `amountGross`
  - `amountGrossCurrency`

## Reuse From Write Response
- from `POST /ledger/accountingDimensionName`:
  - `value.id`
  - `value.dimensionIndex`
  - `value.dimensionName`
- from each `POST /ledger/accountingDimensionValue`:
  - `value.id`
  - `value.displayName`
- from `POST /ledger/voucher`:
  - `value.id`
  - `value.number`
  - the returned postings with account ids, amounts, and the linked `freeAccountingDimension{1|2|3}.id`

## Verification
- default verification is zero extra calls after the voucher write
- trust the dimension-name write response for the created dimension name and assigned `dimensionIndex`
- trust the value write responses for the created value names
- trust the voucher write response when it already proves:
  - voucher id and number
  - target posting account id
  - target posting amount
  - linked free-dimension value id
- for the exact create-dimension-plus-two-values-plus-one-voucher task shape, this five-call flow remains the minimal realistic path because the lower-call number-only voucher shortcut is not valid

## Minimal Voucher Posting Shape

The true minimal required fields per posting are:
- `row` (integer, starting at `1`)
- `account: { "id": ... }`
- `amount`
- `amountCurrency`
- `amountGross`
- `amountGrossCurrency`
- on the scored posting: `freeAccountingDimension{n}: { "id": ... }`

Optional posting fields (auto-filled by Tripletex): `date`, `description`, `currency`.

## Known Recovery Branches
- if `GET /ledger/account?number=<target-account>,1920&fields=*` does not return `1920`, do one fallback `GET /ledger/account?isBankAccount=true&fields=*` and choose the existing invoice or bank account from that result
- `GET /ledger/account?number=<target-account>,1920&fields=*` returns `account.number` as an integer; compare numerically when filtering the response locally, or you can falsely conclude the target account is missing and burn extra recovery calls
- if dimension creation fails because all three free dimensions are already in use, treat the run as blocked by account state rather than guessing an update or reuse flow
- if a persistent sandbox used for post-run research already has all three free-dimension slots occupied, do not back-port search/reuse workarounds into the scored create-only standard; that blocker is a sandbox-state artifact, not evidence against the fresh-account five-call path
- if dimension creation fails because the free-dimension feature is disabled, treat the run as blocked by missing module or feature state unless the prompt explicitly instructs an activation step

## OpenAPI / Sandbox Status
- `/ledger/accountingDimensionName`, `/ledger/accountingDimensionValue`, `/ledger/account`, and `/ledger/voucher` verified in `./openapi.json`
- persistent sandbox re-verified on 2026-03-20:
  - `POST /ledger/accountingDimensionName` returned `422` when `dimensionName` exceeded `20` characters
  - the same endpoint also returned `422` with validation message `Maximum of 3 accounting dimensions allowed` when the persistent sandbox already had all three free-dimension slots occupied
  - `POST /ledger/accountingDimensionValue` succeeded with only `dimensionIndex`, `displayName`, `active`, and `showInVoucherRegistration`
  - `PUT /ledger/accountingDimensionValue/list` is batch update only, so it is not a lower-call shortcut for creating the requested values
  - `POST /ledger/voucher` with `account: { "number": "7000" }`, again with `account: { "number": "6590" }`, later with `account: { "number": 6860 }`, again with `account: { "number": 7300 }`, and later with `account: { "number": 6340 }` failed `422` on `postings.account.name`, so number-only account refs are not the trusted fast path
  - the id-based voucher write succeeded immediately after one decisive `GET /ledger/account?number=6590,1920&fields=*`
  - later same-day re-verification with dimension `KS154433946` assigned `dimensionIndex=3`, created values `Innkjøp` and `Logistikk`, and returned the linked value on `freeAccountingDimension3.id` in the successful voucher write response
  - a same-day voucher-path re-verification on existing sandbox dimension value `15253` confirmed that `GET /ledger/account?number=6860,1920&fields=*` returns both account rows with integer `number` fields and that the next `POST /ledger/voucher` succeeded with the linked `freeAccountingDimension1.id`
  - the 2026-03-20 production run for exact prompt `Marked` / `Privat` / `Offentlig` / `6300` / `44950` succeeded on the first attempt with the standard five-call path and returned `dimensionIndex=1`, created value `Offentlig`, and a successful voucher write linked to that new value
  - the later 2026-03-20 production run for exact prompt `Marked` / `Offentlig` / `Privat` / `7300` / `37250` also succeeded on the first attempt with the same standard five-call path and returned `dimensionIndex=1`, created value `Privat`, and a successful voucher write linked to that new value
  - the later 2026-03-20 production run for exact prompt `Marked` / `Offentlig` / `Privat` / `6340` / `25200` also succeeded on the first attempt with the same standard five-call path and returned `dimensionIndex=1`, created value `Offentlig`, and voucher `608868584`
  - a same-day persistent-sandbox re-proof for account `6300` reused existing dimension value `15253` only because the sandbox was already full on free dimensions, reproduced the same `422 postings.account.name: Kan ikke være null.` on the number-only voucher shortcut, then succeeded immediately after `GET /ledger/account?number=6300,1920&fields=*` with an id-based voucher write
  - a later same-day persistent-sandbox re-proof for account `7300` hit the same full-dimension blocker, reused existing dimension value `15253` only for voucher-path verification, reproduced the same `422 postings.account.name: Kan ikke være null.` on the number-only shortcut, then succeeded immediately after `GET /ledger/account?number=7300,1920&fields=*` with voucher `608867443`
  - a later same-day persistent-sandbox reflection for account `6340` hit the same full-dimension blocker `422 Maximum of 3 accounting dimensions allowed`, reused existing dimension value `15253` only for voucher-path verification, reproduced the same `422 postings.account.name: Kan ikke være null.` on the number-only shortcut, then succeeded immediately after `GET /ledger/account?number=6340,1920&fields=*` with voucher `608868815`
- persistent sandbox re-verified on 2026-03-21:
  - `POST /ledger/voucher` without `row` on postings → `422 Posteringene på rad 0 (guiRow 0) er systemgenererte og kan ikke opprettes eller endres på utsiden av Tripletex.`; Tripletex defaults unset `row` to `0` which is reserved for system-generated postings
  - adding only `row: 1` and `row: 2` to the same payload → `201` with voucher `609065728`
  - `date`, `description`, and `currency` on individual postings are confirmed optional; Tripletex auto-fills them from the voucher-level values
  - the 2026-03-21 production run for exact prompt `Prosjekttype` / `Forskning` / `Internt` / `7000` / `32550` hit this exact trap: first voucher attempt without `row` → 422, retry with `row` → 201, scored 2.96/4 (6 calls, 1 avoidable 422) — perfect correctness (13/13, 6/6 checks) but suboptimal efficiency
  - the later 2026-03-21 production run for exact prompt `Region` / `Sør-Norge` / `Midt-Norge` / `6540` / `5150` succeeded on the first attempt with the standard five-call path (0 errors), returned `dimensionIndex=1`, and linked the voucher posting to the newly created `Sør-Norge` value with voucher `609087109` — first perfect-efficiency run for this task shape
  - same-day sandbox re-verification: `POST /ledger/voucher` with `account: { number: 6540, name: "Inventar" }` (no id) → `422 Internt felt (account) - Feltet må fylles ut.`; with `account: { id: 0, number: 6540, name: "Inventar" }` → same `422`; account id resolution via GET is mandatory and cannot be bypassed with number+name
  - the later 2026-03-21 production run for exact prompt `Kostsenter` / `IT` / `HR` / `6590` / `38100` succeeded on the first attempt with the standard five-call path (0 errors), returned `dimensionIndex=1`, and linked the voucher posting to the newly created `HR` value with voucher `609093249` — second consecutive perfect-efficiency run
  - same-day sandbox re-verification: `POST /ledger/accountingDimensionValue/list` with array body → `400 HTTP 405 Method Not Allowed`; `POST /ledger/accountingDimensionValue` with array body → `422 Verdien er ikke av korrekt type`; batch value creation is not supported, confirming 5 calls is the minimum for the 2-value task shape
  - the later 2026-03-21 production run for exact prompt `Prosjekttype` / `Utvikling` / `Internt` / `7000` / `39700` succeeded on the first attempt with the standard five-call path (0 errors), returned `dimensionIndex=1`, and linked the voucher posting to the newly created `Internt` value with voucher `609185199` — third consecutive perfect-efficiency run
  - the later 2026-03-21 production run for exact prompt `Marked` / `Bedrift` / `Privat` / `6590` / `16750` (Portuguese prompt) succeeded on the first attempt with the standard five-call path (0 errors), returned `dimensionIndex=1`, and linked the voucher posting to the newly created `Bedrift` value with voucher `609186850` — fourth consecutive perfect-efficiency run
  - the later 2026-03-21 production run for exact prompt `Prosjekttype` / `Internt` / `Utvikling` / `6340` / `44500` (German prompt) succeeded on the first attempt with the standard five-call path (0 errors), returned `dimensionIndex=1`, and linked the voucher posting to the newly created `Internt` value with voucher `609190710` — fifth consecutive perfect-efficiency run
