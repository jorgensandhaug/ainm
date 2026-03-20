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
- Standard fast-path note:
  - for the exact one-customer create shape with prompt-provided `name`, `email`, and Norwegian `organizationNumber`, the canonical path is one `POST /customer`
  - no `GET /customer` pre-read and no `GET /customer/{id}` follow-up read are part of the trusted fast path
- Standard verification note:
  - `POST /customer` can return a sparse auto-generated `physicalAddress` link object even when the payload only sent `postalAddress`; verify the prompt-scored fields from `value` and do not add a follow-up read just for that link
  - localized generic email labels such as `Correo` still map to the same `email` payload field; they are not a reason to add `invoiceEmail`

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
- Standard verification note:
  - for `POST /department/list`, trust `values[]` and the returned department fields; top-level wrapper metadata such as `fullResultSize` can stay `0` on successful writes

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
- `/invoice/{id}/:createCreditNote`
  - `PUT` create full credit note for an existing outgoing invoice
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
- Standard create-and-send note:
  - `POST /invoice` defaults `sendToCustomer=true`
  - for the common create-and-send task shape, prefer that single write over `POST /invoice?sendToCustomer=false` plus a later `PUT /invoice/{id}/:send`
  - when creating a new customer with no email/address, explicit later `sendType=MANUAL` is not the trusted default; persistent sandbox reproduced `500` on 2026-03-20
- Standard fast-path note:
  - for exact existing-invoice full-credit-note tasks, prefer `./trusted-standards/create-customer-invoice-credit-note.md`; the winning path is usually one decisive invoice read and one `:createCreditNote` write
  - for exact existing-invoice payment-reversal tasks, prefer `./trusted-standards/reverse-customer-invoice-payment.md`; the winning path is usually invoice read, voucher reverse, invoice verify
- Standard search note:
  - `GET /invoice` requires both `invoiceDateFrom` and `invoiceDateTo`
  - if the prompt gives no invoice date, use one wide but bounded window such as `invoiceDateFrom=2000-01-01` and `invoiceDateTo=<run-date-plus-one-day>` instead of adding a separate resolver read first
  - the same line description can appear in both top-level `orderLines[]` and nested `orders[].orderLines[]` for one invoice; filter across the union and keep uniqueness at the invoice level, not the raw line-hit count
- Standard field note:
  - on outgoing invoice reads, use `postings(...)` for payment-voucher discovery; `payments(...)` is not a valid `fields` member on the endpoint response shape
- Standard credit-note note:
  - the verified full-credit action path is `PUT /invoice/{id}/:createCreditNote`
  - default to `sendToCustomer=false` unless the prompt explicitly requires sending the credit note
  - the write response can already prove success with `isCreditNote=true` and `creditedInvoice=<original invoice id>`, so an extra `GET /invoice/{id}` is not part of the trusted fast path

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
  - for the exact one-supplier create shape with prompt-provided `name`, generic `email`, and `organizationNumber`, the canonical path is one `POST /supplier`
  - no `GET /supplier` pre-read and no `GET /supplier/{id}` follow-up read are part of the trusted fast path
  - the create response can already include `ledgerAccount.id`; reuse it when the next step needs the supplier liability account id
  - for the exact fresh-account supplier-invoice booking shape, prefer direct `POST /supplier` and do not spend a supplier search read first
  - if that first write returns `403` with `Invalid or expired token`, treat the run as blocked by credentials rather than by supplier payload shape; do not spend fallback reads or auth-variation retries
- Standard verification note:
  - map a single generic prompt email to `email`, not `invoiceEmail`
  - `POST /supplier` can auto-return sparse `postalAddress` and `physicalAddress` links even when the payload sent no address fields; verify the prompt-scored fields from `value` and do not add a follow-up read just for those links

## Travel Expense
- `/travelExpense`
  - `GET` search
  - `POST` create
- `/travelExpense/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/travelExpense/cost`
  - `GET` search child costs
  - `POST` create child cost
- `/travelExpense/perDiemCompensation`
  - `GET` search child per-diem rows
  - `POST` create child per-diem row
- `/travelExpense/costCategory`
  - `GET` lookup travel cost categories
- `/travelExpense/paymentType`
  - `GET` lookup travel payment types
- Standard create prerequisites:
  - employee id
  - travel payment type id
  - travel cost category id for each cost row
  - if per diem is included, `travelDetails.isCompensationFromRates=true`
- Standard fast-path note:
  - `POST /travelExpense` can create embedded `costs[]` and `perDiemCompensations[]` in one write
  - for a normal existing-employee expense, do not send `department` unless the prompt explicitly scores another department or live validation requires it
- Standard verification note:
  - parent write/read responses can keep `costs[]` and `perDiemCompensations[]` sparse as `id`/`url`; use `/travelExpense/cost?...` and `/travelExpense/perDiemCompensation?...` for exact child verification
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
  - this is also the safe one-read resolver for manual-voucher ledger accounts such as `7000`, `6590`, and `1920`; do not rely on `account.number` alone inside `POST /ledger/voucher`

## Ledger Accounting Dimension Name
- `/ledger/accountingDimensionName`
  - `GET` list
  - `POST` create
- `/ledger/accountingDimensionName/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/ledger/accountingDimensionName/search`
  - `GET` search
- Standard create prerequisites:
  - free-dimension feature enabled
  - at least one free-dimension slot available
- Standard create note:
  - `dimensionName` is validated at max length `20`
  - the create response can assign `dimensionIndex` `1`, `2`, or `3`; reuse that returned index instead of assuming `1`

## Ledger Accounting Dimension Value
- `/ledger/accountingDimensionValue`
  - `POST` create
- `/ledger/accountingDimensionValue/{id}`
  - `GET` read
  - `DELETE` delete
- `/ledger/accountingDimensionValue/list`
  - `PUT` batch update
- `/ledger/accountingDimensionValue/search`
  - `GET` search
- Standard create prerequisite:
  - `dimensionIndex` from the dimension-name create or read flow
- Standard create note:
  - the proven minimal create payload can omit `number` and `position`
  - set `showInVoucherRegistration=true` when the next step is voucher registration

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
- Standard create note:
  - for manual vouchers, resolve ledger-account ids first and send `account: { "id": ... }`
  - number-only account refs still failed with `422 postings.account.name: Kan ikke være null.` in persistent sandbox on ordinary ledger accounts such as `7000` and `6590`, so there is no trusted lower-call shortcut that skips the account-id lookup
  - number-only account refs on voucher postings are not the trusted fast path
  - free-dimension linkage on a posting uses `freeAccountingDimension1`, `freeAccountingDimension2`, or `freeAccountingDimension3` according to the dimension index
- Standard verification note:
  - write responses may be sufficient by ids/amounts even when linked display fields stay sparse; only read back when the task needs expanded linked fields
  - for the exact supplier-invoice ledger-voucher shape, the minimal verified create path is supplier write, expense-account read, incoming-VAT read, voucher-type read, then voucher write
