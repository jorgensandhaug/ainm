# Register Receipt Expense Voucher

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- register one new manual voucher from one attached receipt
- the prompt identifies one exact receipt line to book, one exact department name, and asks for the correct expense account and VAT treatment
- the receipt already shows the purchase was paid by company card / business card
- the task is about one expense voucher with the receipt preserved as attachment, not about a supplier invoice, travel expense, or employee reimbursement
- three proven expense-type branches exist:
  - **Branch A (non-deductible representation)**: receipt line is a business-lunch / restaurant meal such as `Forretningslunsj` or `Kundemøte lunsj` → account `7360`, VAT code `0`
  - **Branch B (deductible purchase, 25% VAT)**: receipt line is office furniture, equipment, or supplies such as `Kontorstoler` → account `6540` (Inventar), incoming 25% VAT (vatType id from account response)
  - **Branch C (deductible accommodation, 12% VAT)**: receipt line is hotel / accommodation such as `Overnatting` → account `7140` (Reisekostnad, ikke oppgavepliktig), incoming 12% VAT (vatType id from account response)
- select the branch based on the receipt line text, not the receipt vendor or total

## Do Not Use This Standard If
- the task scores a real supplier invoice or supplier object linkage
- the task needs travel-expense, salary, employee-expense, project, or customer linkage
- the task needs several receipt lines booked separately or split across several accounts
- the prompt explicitly gives another expense account or another VAT treatment

## Account Selection Rule
- `Forretningslunsj` / `Kundemøte lunsj` / restaurant meals / business lunch / customer meeting lunch → `7360` (non-deductible representation)
- `Kontorstoler` / office chairs / furniture / equipment → `6540` (Inventar)
- `Overnatting` / hotel / accommodation → `7140` (Reisekostnad, ikke oppgavepliktig)
- do not use `7350` for any representation receipt line; 2026-03-21 production scored `0/10` on that branch
- if the receipt line text does not clearly map to a known account, check Norwegian standard chart of accounts (6500-series for office costs, 7100-series for travel/accommodation, 7300-series for representation)

## Standard Flow

### Branch A — Non-deductible representation (`7360`)
1. If the prompt does not say the department already exists and the run is fresh-account-like, `POST /department`
2. Otherwise `GET /department?name=...&isInactive=false&fields=*` and exact-filter locally by `department.name`
3. `GET /ledger/account?number=7360,1920&fields=*`
4. `POST /ledger/voucher`
5. `POST /ledger/voucher/{voucherId}/attachment`
6. verify from the two write responses
7. stop
- **Total: 4 API calls** (fresh account with POST department)

### Branch B — Deductible purchase (`6540` with incoming 25% VAT)
1. If the prompt does not say the department already exists and the run is fresh-account-like, `POST /department`
2. Otherwise `GET /department?name=...&isInactive=false&fields=*` and exact-filter locally by `department.name`
3. `GET /ledger/account?number=6540,1920&fields=id,number,name,vatType(*)` — extract `vatType.id` from account `6540` response
4. `POST /ledger/voucher` — with explicit `vatType: { id: <from step 3> }` on the expense posting
5. `POST /ledger/voucher/{voucherId}/attachment`
6. verify from the two write responses
7. stop
- **Total: 4 API calls** (fresh account with POST department)
- **No separate `GET /ledger/vatType` needed** — the account's default vatType.id is extracted from step 3

### Branch C — Deductible accommodation (`7140` with incoming 12% VAT)
1. If the prompt does not say the department already exists and the run is fresh-account-like, `POST /department`
2. Otherwise `GET /department?name=...&isInactive=false&fields=*` and exact-filter locally by `department.name`
3. `GET /ledger/account?number=7140,1920&fields=id,number,name,vatType(*)` — extract `vatType.id` from account `7140` response
4. `POST /ledger/voucher` — with explicit `vatType: { id: <from step 3> }` on the expense posting
5. `POST /ledger/voucher/{voucherId}/attachment`
6. verify from the two write responses
7. stop
- **Total: 4 API calls** (fresh account with POST department)
- **No separate `GET /ledger/vatType` needed** — the account's default vatType.id is extracted from step 3
- Identical flow to Branch B but with different account and VAT rate

## Payload Rules

### Branch A — Non-deductible representation
- expense account: `7360 Representasjon, ikke fradragsberettiget`
- account `7360` is `vatLocked=true` with only VAT code `0`, so do not resolve `/ledger/vatType` and do not send an explicit `vatType`
- book the selected receipt line amount repeated in all four fields:
  - `amount` = `amountCurrency` = `amountGross` = `amountGrossCurrency` = receipt line price
- balancing line on `1920` with negated amount in all four fields
- no auto-generated VAT posting (code `0`)

### Branch B — Deductible purchase
- expense account: `6540 Inventar` (or other deductible expense account based on receipt line text)
- account `6540` is `vatLocked=false` with default `vatType.id=1` (incoming 25%)
- **CRITICAL**: must send explicit `vatType: { id: <from account response> }` on the expense posting; omitting vatType defaults to code `0` (no VAT), which is WRONG for deductible purchases
- set `amountGross` = `amountGrossCurrency` = receipt line price (the receipt line price is the gross amount including VAT)
- Tripletex auto-calculates:
  - `amount` = receipt line price / 1.25 (net)
  - auto-generated 3rd posting on account `2710` for the VAT recovery amount
- balancing line on `1920` with `amount` = `amountCurrency` = `amountGross` = `amountGrossCurrency` = negated receipt line price

### Branch C — Deductible accommodation
- expense account: `7140 Reisekostnad, ikke oppgavepliktig`
- account `7140` is `vatLocked=false` with default `vatType.id=12` (incoming 12%, lav sats)
- **CRITICAL**: must send explicit `vatType: { id: <from account response> }` on the expense posting; omitting vatType defaults to code `0` (no VAT), which is WRONG
- set `amountGross` = `amountGrossCurrency` = receipt line price (gross amount including VAT)
- Tripletex auto-calculates:
  - `amount` = receipt line price / 1.12 (net)
  - auto-generated 3rd posting on account `2711` or `2710` for the VAT recovery amount
- balancing line on `1920` with `amount` = `amountCurrency` = `amountGross` = `amountGrossCurrency` = negated receipt line price
- identical payload shape to Branch B; only the account number and VAT rate differ

### Common rules (all branches)
- use the selected line amount from the receipt, not the whole receipt total
- use the receipt date as voucher date
- preserve the receipt line text exactly in voucher `description` and expense-posting `description`
- attach the department only on the expense posting, using exact `department.id`
- use existing bank account `1920` as the balancing line for this card-paid exact shape
- preserve the receipt itself with `POST /ledger/voucher/{voucherId}/attachment`; do not treat the attachment as optional
- do not use `POST /ledger/voucher/importDocument` as the default attachment path for this shape

## Reuse From Write Response
- from `POST /department` when used:
  - `value.id`
  - `value.name`
- from `GET /ledger/account?...`:
  - account ids for the expense account and `1920`
  - for Branch B/C: `vatType.id` from the expense account response (use `fields=id,number,name,vatType(*)` to expand)
- from `POST /ledger/voucher`:
  - `value.id`
  - `value.version`
  - `value.number`
  - expense-posting `department.id`
  - expense-posting `account.id`
  - expense-posting `vatType.id`
  - for Branch B/C: auto-generated VAT posting on `2710`/`2711` with `amount` = VAT recovery
- from `POST /ledger/voucher/{voucherId}/attachment`:
  - `value.id`
  - `value.attachment.id`

## Verification
- `POST /ledger/voucher` should already prove:
  - voucher date
  - voucher description
  - expense account id
  - department id on the expense posting
  - amount / amountGross values
  - vatType.id on expense posting
  - for Branch B/C: auto-generated VAT posting with correct VAT amount
- `POST /ledger/voucher/{voucherId}/attachment` should then prove the same voucher now has `attachment.id`
- no follow-up `GET /ledger/voucher/{id}` is needed unless one of those fields is unexpectedly missing

## Known Recovery Branches
- `GET /department?name=Drift...` is a containing search, not exact-match search; local filtering must require exact `department.name == "Drift"`
- if that containing search returns rows such as `Drift sandbox ...` but not exact `Drift`, and the prompt does not say the department already exists, create exact `Drift` once with `POST /department`
- do not try `department: { "name": "Drift" }` on the voucher posting as a lower-call shortcut; persistent sandbox on 2026-03-21 returned `201` but silently stored `department=null`
- do not use `POST /ledger/voucher/importDocument` followed by `PUT /ledger/voucher/{id}` for this receipt-backed voucher shape; persistent sandbox on 2026-03-21 returned `422` that `description` and `postings` are not editable for that imported voucher type
- do not use `account: { "number": 7360 }` or `account: { "number": 6540 }` or `account: { "number": 1920 }` in `POST /ledger/voucher`; number-only account refs fail with `422 postings.account.name: Kan ikke være null.`
- for Branch B/C: do not omit `vatType` on the expense posting; Tripletex defaults to vatType `0` (no VAT) when not specified, even if the account has a non-zero default
- for Branch B/C: do not hardcode `vatType.id` without checking the account response; use the id from `GET /ledger/account?...&fields=id,number,name,vatType(*)` (Branch B: vatType.id=`1` for 25%; Branch C: vatType.id=`12` for 12%)

## OpenAPI / Sandbox Status
- `/department`, `/ledger/account`, `/ledger/voucher`, `/ledger/voucher/{voucherId}/attachment`, and `/ledger/voucher/importDocument` verified in `./openapi.json`

### Branch A sandbox proof (2026-03-21)
- `GET /ledger/account?number=1920,7350,7360&fields=*` returned `7350` and `7360` as zero-VAT representation accounts and showed `7360` as the non-deductible representation branch
- `POST /ledger/voucher` with `department: { "name": "Drift" }` succeeded as voucher `608898503` but persisted `department=null`, so name-only department refs are not a safe lower-call shortcut
- `GET /department?name=Drift&isInactive=false&fields=*` first returned only containing-match row `Drift sandbox 20260320-223143`, proving exact local filtering is required
- one exact `POST /department` then created `Drift` with id `927069`
- the successful exact-shape proof was:
  1. exact `Drift` department available as id `927069`
  2. `GET /ledger/account?number=1920,7360&fields=*`
  3. `POST /ledger/voucher` with expense posting on `7360`, balancing line on `1920`, amount `13650`, date `2026-01-30`, and department `927069`
  4. `POST /ledger/voucher/608898560/attachment`
- that final proof returned voucher `608898560` with:
  - expense posting `account.id=424191174` (`7360`)
  - expense posting `department.id=927069`
  - expense posting `vatType.id=0`
  - gross amount `13650`
  - attachment id `1024214336`

### Branch B sandbox proof (2026-03-21)
- `GET /ledger/account?number=6540,1920&fields=id,number,name,vatType(*)` returned:
  - account `6540` "Inventar": id=`424191132`, vatLocked=`false`, vatType.id=`1` ("Fradrag inngående avgift, høy sats", 25%, deductionPercentage=100)
  - account `1920` "Bankinnskudd": id=`424190862`, vatLocked=`true`, vatType.id=`0`
- `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-02-22&fields=*` confirmed id=`1` is incoming 25% — but this call is unnecessary if extracted from account response
- `POST /ledger/voucher` with amountGross=`13500`, vatType={id:`1`}, account 6540, department 927069 returned voucher `609014744` with:
  - expense posting: account=`6540`, amount=`10800`, amountGross=`13500`, vatType.id=`1`, department=`927069`
  - bank posting: account=`1920`, amount=`-13500`, amountGross=`-13500`
  - auto-generated VAT posting: account=`2710` (Inngående merverdiavgift, høy sats), amount=`2700`, amountGross=`2700`
- `POST /ledger/voucher/609014744/attachment` attached the PDF and returned attachment.id=`1024249955`
- omitting explicit `vatType` on the posting defaulted to vatType.id=`0` (no VAT), which is wrong — voucher `609014755` had amount=`13500`, amountGross=`13500` with no VAT splitting
- `account: { number: 6540 }` failed with `422 postings.account.name: Kan ikke være null.`, confirming number-only refs are still unsafe

### Branch C sandbox proof (2026-03-21)
- `GET /ledger/account?number=7140,1920&fields=id,number,name,vatType(*),vatLocked` returned:
  - account `7140` "Reisekostnad, ikke oppgavepliktig": id=`424191165`, vatLocked=`false`, vatType.id=`12` ("Fradrag inngående avgift, lav sats", 12%, deductionPercentage=100)
  - account `1920` "Bankinnskudd": id=`424190862`, vatLocked=`true`, vatType.id=`0`
- `POST /ledger/voucher` with amountGross=`4850`, vatType={id:`12`}, account 7140, department 927069 returned voucher with:
  - expense posting: account=`7140`, amount=`4330.36`, amountGross=`4850`, vatType.id=`12`, department=`927069`
  - bank posting: account=`1920`, amount=`-4850`, amountGross=`-4850`
  - auto-generated VAT posting: account=`2711` (Inngående merverdiavgift, lav sats), amount=`519.64`, amountGross=`519.64`
- net = 4850 / 1.12 = 4330.36, VAT = 4850 - 4330.36 = 519.64 — both match
- identical payload shape to Branch B; only the account number (7140 vs 6540) and vatType.id (12 vs 1) differ

### Branch C production proof (2026-03-21, run 67d4ddca)
- receipt: Thon Hotels, 20.06.2026, line "Overnatting" 4850 kr, paid by Bedriftskort
- 4 calls, 0 errors: POST /department → GET accounts → POST voucher → POST attachment
- voucher 609101338: expense on 7140 (amount=4330.36, amountGross=4850, vatType.id=12, dept=948839), bank on 1920 (-4850), auto-VAT on 2710 (519.64), attachment 1024278801

### Branch A production proof (2026-03-21, run 01420e60)
- receipt: Peppes Pizza, 26.04.2026, line "Kundemøte lunsj" 14050 kr, paid by Bedriftskort
- 4 calls, 0 errors: POST /department → GET accounts → POST voucher → POST attachment
- voucher 609104663: expense on 7360 (amount=14050, amountGross=14050, vatType.id=0, dept=949741), bank on 1920 (-14050), attachment uploaded
- confirms "Kundemøte lunsj" maps to Branch A (non-deductible representation, account 7360)

## Winning Payload Shapes

### Branch A — Non-deductible representation
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<7360-id>" },
      "department": { "id": "<dept-id>" },
      "amount": "<line-price>",
      "amountCurrency": "<line-price>",
      "amountGross": "<line-price>",
      "amountGrossCurrency": "<line-price>"
    },
    {
      "row": 2,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amount": "-<line-price>",
      "amountCurrency": "-<line-price>",
      "amountGross": "-<line-price>",
      "amountGrossCurrency": "-<line-price>"
    }
  ]
}
```

### Branch B — Deductible purchase
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<6540-id>" },
      "department": { "id": "<dept-id>" },
      "vatType": { "id": "<vatType-id-from-account>" },
      "amountGross": "<line-price>",
      "amountGrossCurrency": "<line-price>"
    },
    {
      "row": 2,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amount": "-<line-price>",
      "amountCurrency": "-<line-price>",
      "amountGross": "-<line-price>",
      "amountGrossCurrency": "-<line-price>"
    }
  ]
}
```
- Tripletex will auto-compute `amount` on the expense posting (net = line-price / 1.25) and auto-generate a 3rd posting on `2710`

### Branch C — Deductible accommodation
```json
{
  "date": "<receipt-date>",
  "description": "<receipt-line-text>",
  "postings": [
    {
      "row": 1,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<7140-id>" },
      "department": { "id": "<dept-id>" },
      "vatType": { "id": "<vatType-id-from-account>" },
      "amountGross": "<line-price>",
      "amountGrossCurrency": "<line-price>"
    },
    {
      "row": 2,
      "date": "<receipt-date>",
      "description": "<receipt-line-text>",
      "account": { "id": "<1920-id>" },
      "amount": "-<line-price>",
      "amountCurrency": "-<line-price>",
      "amountGross": "-<line-price>",
      "amountGrossCurrency": "-<line-price>"
    }
  ]
}
```
- Tripletex will auto-compute `amount` on the expense posting (net = line-price / 1.12) and auto-generate a 3rd posting on `2711`
