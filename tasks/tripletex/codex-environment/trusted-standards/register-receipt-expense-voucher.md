# Register Receipt Expense Voucher

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- register one new manual voucher from one attached receipt
- the prompt identifies one exact receipt line to book, one exact department name, and asks for the correct expense account and VAT treatment
- the receipt line is a business-lunch / external-representation meal such as `Forretningslunsj`
- the receipt already shows the purchase was paid by company card / business card
- the task is about one expense voucher with the receipt preserved as attachment, not about a supplier invoice, travel expense, or employee reimbursement

## Do Not Use This Standard If
- the task scores a real supplier invoice or supplier object linkage
- the task needs travel-expense, salary, employee-expense, project, or customer linkage
- the task needs several receipt lines booked separately or split across several accounts
- the expense text does not clearly belong to the proven non-deductible representation branch
- the prompt explicitly gives another expense account or another VAT treatment

## Standard Flow
1. If the prompt does not say the department already exists and the run is fresh-account-like, `POST /department`
2. Otherwise `GET /department?name=...&isInactive=false&fields=*` and exact-filter locally by `department.name`
3. `GET /ledger/account?number=7360,1920&fields=*`
4. `POST /ledger/voucher`
5. `POST /ledger/voucher/{voucherId}/attachment`
6. verify from the two write responses
7. stop

## Payload Rules
- for receipt line text `Forretningslunsj`, use expense account `7360 Representasjon, ikke fradragsberettiget`
- do not use `7350` for this exact restaurant-style business-lunch receipt shape; 2026-03-21 production feedback on the no-attachment `7350` branch was `0/10`
- account `7360` is `vatLocked=true` with only VAT code `0`, so do not resolve `/ledger/vatType` and do not send an explicit `vatType`
- book the selected receipt line at gross amount only, repeated in:
  - `amount`
  - `amountCurrency`
  - `amountGross`
  - `amountGrossCurrency`
- use the selected line amount from the receipt, not the whole receipt total; for the verified `Forretningslunsj` receipt:
  - line amount = `13650`
  - whole receipt total = `14020`
  - whole receipt VAT = `3505`
  - the scored voucher line still uses only `13650` because the other receipt rows are not part of the task
- use the receipt date as voucher date; for the verified receipt, `2026-01-30`
- preserve the receipt line text exactly in voucher `description` and expense-posting `description`
- attach the department only on the expense posting, using exact `department.id`
- use existing bank account `1920` as the balancing line for this card-paid exact shape
- preserve the receipt itself with `POST /ledger/voucher/{voucherId}/attachment`; do not treat the attachment as optional on this exact receipt-backed task
- do not use `POST /ledger/voucher/importDocument` as the default attachment path for this shape

## Reuse From Write Response
- from `POST /department` when used:
  - `value.id`
  - `value.name`
- from `GET /ledger/account?...`:
  - account ids for `7360` and `1920`
- from `POST /ledger/voucher`:
  - `value.id`
  - `value.version`
  - `value.number`
  - expense-posting `department.id`
  - expense-posting `account.id`
  - expense-posting `vatType.id`
- from `POST /ledger/voucher/{voucherId}/attachment`:
  - `value.id`
  - `value.attachment.id`

## Verification
- `POST /ledger/voucher` should already prove:
  - voucher date
  - voucher description
  - expense account id `7360`
  - department id on the expense posting
  - gross amount `13650`
  - VAT code `0`
- `POST /ledger/voucher/{voucherId}/attachment` should then prove the same voucher now has `attachment.id`
- no follow-up `GET /ledger/voucher/{id}` is needed unless one of those fields is unexpectedly missing

## Known Recovery Branches
- `GET /department?name=Drift...` is a containing search, not exact-match search; local filtering must require exact `department.name == "Drift"`
- if that containing search returns rows such as `Drift sandbox ...` but not exact `Drift`, and the prompt does not say the department already exists, create exact `Drift` once with `POST /department`
- do not try `department: { "name": "Drift" }` on the voucher posting as a lower-call shortcut; persistent sandbox on 2026-03-21 returned `201` but silently stored `department=null`
- do not use `POST /ledger/voucher/importDocument` followed by `PUT /ledger/voucher/{id}` for this receipt-backed voucher shape; persistent sandbox on 2026-03-21 returned `422` that `description` and `postings` are not editable for that imported voucher type
- do not use `account: { "number": 7360 }` or `account: { "number": 1920 }` in `POST /ledger/voucher`; ordinary number-only account refs are still not a trusted voucher shortcut

## OpenAPI / Sandbox Status
- `/department`, `/ledger/account`, `/ledger/voucher`, `/ledger/voucher/{voucherId}/attachment`, and `/ledger/voucher/importDocument` verified in `./openapi.json`
- persistent sandbox re-verified on 2026-03-21:
  - `GET /ledger/account?number=1920,7350,7360&fields=*` returned `7350` and `7360` as zero-VAT representation accounts and showed `7360` as the non-deductible representation branch
  - `POST /ledger/voucher` with `department: { "name": "Drift" }` succeeded as voucher `608898503` but persisted `department=null`, so name-only department refs are not a safe lower-call shortcut
  - `GET /department?name=Drift&isInactive=false&fields=*` first returned only containing-match row `Drift sandbox 20260320-223143`, proving exact local filtering is required
  - one exact `POST /department` then created `Drift` with id `927069`
  - `POST /ledger/voucher/importDocument` created non-posted attachment-backed voucher `608898541`, but the next `PUT /ledger/voucher/608898541` failed `422` because `description` and `postings` are not editable for that imported voucher type
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
