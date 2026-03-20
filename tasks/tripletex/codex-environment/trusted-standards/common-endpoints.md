# Common Endpoints

Verified against `./openapi.json`.

Use this as the exact endpoint-shape reference for the most common Tripletex resources.

## Customer
- `/customer`
  - `GET` search
  - `POST` create
- `/customer/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard create prerequisite:
  - none

## Department
- `/department`
  - `GET` search
  - `POST` create one
- `/department/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/department/list`
  - `POST` batch create
- Standard create prerequisite:
  - none

## Employee
- `/employee`
  - `GET` search
  - `POST` create
- `/employee/{id}`
  - `GET` read
  - `PUT` update
- `/employee/employment`
  - `GET` search employments
  - `POST` create employment
- Standard create prerequisites:
  - explicit `userType`
  - often a department

## Product
- `/product`
  - `GET` search
  - `POST` create
- `/product/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard create prerequisite:
  - resolve valid outgoing `vatType`

## Project
- `/project`
  - `GET` search
  - `POST` create
- `/project/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard create prerequisites:
  - customer id
  - often assignable project manager id
  - `startDate`

## Order
- `/order`
  - `GET` search
  - `POST` create
- `/order/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/order/{id}/:invoice`
  - `PUT` convert order to invoice
- Standard create prerequisites:
  - customer id
  - often product ids
- Standard fast-path note:
  - for exact existing-customer plus existing-product order-to-invoice-to-payment tasks, prefer `./trusted-standards/create-order-invoice-and-register-payment.md`; the winning path is usually customer read, product read, order write, invoice write, payment-type read, payment write

## Invoice
- `/invoice`
  - `GET` search charged outgoing invoices
  - `POST` create
- `/invoice/{id}`
  - `GET` read
- `/invoice/{id}/:payment`
  - `PUT` register payment
- `/invoice/{id}/:send`
  - `PUT` send
- `/invoice/paymentType`
  - `GET` payment-type lookup
- Standard prerequisites:
  - customer id
  - line or order data
  - sometimes outgoing `vatType`
  - sometimes company bank-account repair through `/ledger/account/{id}`

## Supplier
- `/supplier`
  - `GET` search
  - `POST` create
- `/supplier/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard create prerequisite:
  - none
- Standard fast-path note:
  - the create response can already include `ledgerAccount.id`; reuse it when the next step needs the supplier liability account id

## Travel Expense
- `/travelExpense`
  - `GET` search
  - `POST` create
- `/travelExpense/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Related action family also exists:
  - `/travelExpense/{id}/:deliver`
  - `/travelExpense/{id}/:approve`
  - `/travelExpense/{id}/:createVouchers`

## Ledger Account
- `/ledger/account`
  - `GET` search
  - `POST` create
- `/ledger/account/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard prerequisite note:
  - this is the canonical bank-account repair endpoint

## Ledger Posting
- `/ledger/posting`
  - `GET` search/read postings

## Ledger Voucher
- `/ledger/voucher`
  - `GET` search
  - `POST` create
- `/ledger/voucher/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/ledger/voucher/{id}/:reverse`
  - `PUT` reverse
- Standard correction note:
  - prefer reverse over ad hoc mutation when task allows
- Standard verification note:
  - write responses may be sufficient by ids/amounts even when linked display fields stay sparse; only read back when the task needs expanded linked fields
