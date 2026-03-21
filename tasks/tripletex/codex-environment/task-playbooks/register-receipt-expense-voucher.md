# Register Receipt Expense Voucher

## Scope

Use for tasks like:
- register one manual expense voucher from one attached receipt
- book only one specific receipt line, not the whole receipt
- put the expense in one named department
- preserve the receipt as a voucher attachment
- use the correct expense account and VAT treatment for a business-lunch / representation line such as `Forretningslunsj`

Do not use for:
- supplier-invoice tasks
- travel-expense or employee-reimbursement tasks
- prompts that need several receipt lines booked separately
- prompts that already provide an exact different expense account or VAT code
- prompts that score supplier, employee, project, or customer linkage

## Verified Findings

Verified in persistent sandbox on 2026-03-21:
- `GET /department?name=Drift&isInactive=false&fields=*` is a containing search, not an exact-match search
- that same read returned only `Drift sandbox 20260320-223143` until an exact `Drift` department was created, so local exact filtering by `department.name` is mandatory
- `POST /department` with `{ "name": "Drift" }` succeeded directly and returned exact department id `927069`
- `GET /ledger/account?number=1920,7350,7360&fields=*` showed:
  - `7350 Representasjon, fradragsberettiget`
  - `7360 Representasjon, ikke fradragsberettiget`
  - both were `vatLocked=true` with VAT code `0`
- 2026-03-21 production scoring feedback on the no-attachment `7350` branch was `0/10`, so the deductible-representation assumption was wrong for this exact restaurant-style `Forretningslunsj` receipt task
- `POST /ledger/voucher` with expense account `7360`, balancing account `1920`, gross amount `13650`, and exact department id succeeded directly and returned:
  - voucher `608898560`
  - expense posting `vatType.id=0`
  - expense posting `department.id=927069`
- `POST /ledger/voucher/608898560/attachment` then attached the PDF receipt and returned `attachment.id=1024214336`
- `POST /ledger/voucher` with `department: { "name": "Drift" }` looked tempting as a 2-call shortcut after the account read, but the response for voucher `608898503` showed `department=null`; the name-only shortcut is not safe
- `POST /ledger/voucher/importDocument` created non-posted voucher `608898541` with the receipt attached in one call, but the next `PUT /ledger/voucher/608898541` failed `422` on immutable `description` and `postings`
- therefore the attachment-preserving winning branch is not import-first; it is manual voucher first, then attachment upload
- the receipt facts for the verified prompt were:
  - vendor `Olivia`
  - date `2026-01-30`
  - line `Forretningslunsj` at `13650.00 kr`
  - whole receipt total `14020.00 kr`
  - whole receipt VAT `3505.00 kr`
  - paid with `Bedriftskort`
- the scored voucher line still uses only `13650`, because the other receipt rows are outside the prompt

## Minimal Safe Flow

1. Confirm these operations in `./openapi.json`
   - `POST /department` or `GET /department`
   - `GET /ledger/account`
   - `POST /ledger/voucher`
   - `POST /ledger/voucher/{voucherId}/attachment`
2. Resolve the department
   - fresh-account-like prompt that only gives the target department name and does not say it already exists:
     - `POST /department`
   - persistent / retry / explicit-existing-department branch:
     - `GET /department?name=...&isInactive=false&fields=*`
     - exact-filter locally by `department.name`
3. Resolve the voucher accounts
   - `GET /ledger/account?number=7360,1920&fields=*`
4. Create the manual voucher
   - `POST /ledger/voucher`
5. Attach the receipt PDF to that voucher
   - `POST /ledger/voucher/{voucherId}/attachment`
6. Verify from the two write responses
7. Stop

## Exact-Match Fast Path

- For the exact prompt family:
  - one attached receipt
  - one selected business-lunch line like `Forretningslunsj`
  - one department name
  - paid by company card
  - correct expense account and VAT treatment requested
- the best path is:
  1. `POST /department` if the department is not explicitly stated as existing in a fresh-account-like run, otherwise one exact-name `GET /department?...`
  2. `GET /ledger/account?number=7360,1920&fields=*`
  3. `POST /ledger/voucher`
  4. `POST /ledger/voucher/{voucherId}/attachment`
- there is no trusted 3-call shortcut for the exact attachment-backed shape:
  - `department.name` on voucher postings is not reliable
  - `importDocument` creates an attachment-backed shell but not an editable voucher for this flow
  - number-only voucher account refs are still unsafe

## Winning Payload Shape

Voucher create:

```json
{
  "date": "2026-01-30",
  "description": "Forretningslunsj",
  "voucherType": null,
  "postings": [
    {
      "row": 1,
      "date": "2026-01-30",
      "description": "Forretningslunsj",
      "account": { "id": 424191174 },
      "department": { "id": 927069 },
      "amount": 13650,
      "amountCurrency": 13650,
      "amountGross": 13650,
      "amountGrossCurrency": 13650
    },
    {
      "row": 2,
      "date": "2026-01-30",
      "description": "Forretningslunsj",
      "account": { "id": 424190862 },
      "amount": -13650,
      "amountCurrency": -13650,
      "amountGross": -13650,
      "amountGrossCurrency": -13650
    }
  ]
}
```

Then upload the original receipt PDF to `/ledger/voucher/{voucherId}/attachment`.

Replace the ids with the current account ids. The important shape is:
- account `7360` for the expense line
- exact `department.id`
- gross-only amounts repeated in both amount fields
- balancing line on `1920`
- separate attachment upload on the created voucher

## Validation Traps

- do not use `7350` for this exact receipt line; the 2026-03-21 production run scored `0/10` on that deductible-representation branch
- do not use the whole receipt total `14020`; the selected expense line is only `13650`
- do not add `/ledger/vatType`; account `7360` is already locked to VAT code `0`
- do not rely on `department: { "name": "Drift" }`; the voucher can be created while silently dropping the department
- do not trust `GET /department?name=Drift...` by itself; it can return containing matches such as `Drift sandbox ...`
- do not use `POST /ledger/voucher/importDocument` as the default create step when you still need to control postings or description
- do not assume the receipt attachment is optional on this task family
- do not use `account.number` instead of resolved account ids on `POST /ledger/voucher`

## Verification Shape

- `POST /ledger/voucher` should prove:
  - voucher date
  - description
  - expense account id
  - department id on the expense posting
  - gross amount
  - VAT code `0`
- `POST /ledger/voucher/{voucherId}/attachment` should prove:
  - same voucher id
  - `attachment.id`
- no follow-up `GET /ledger/voucher/{id}` is needed unless either write response is unexpectedly sparse

## Attachment Rule

- for receipt-backed manual-voucher tasks, preserve the source document on the final voucher
- the trusted branch is:
  - create the final voucher first
  - then upload the receipt with `POST /ledger/voucher/{voucherId}/attachment`
- do not swap that order to `importDocument -> PUT voucher`; that imported voucher type was not editable enough for this flow in persistent sandbox on 2026-03-21
