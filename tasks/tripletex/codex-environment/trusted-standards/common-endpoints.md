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
- Standard payroll note:
  - `GET /employee?fields=*` can still return `employments[]` as sparse stubs with null `startDate`, null `division`, and empty-looking `employmentDetails[]`
  - for payroll-readiness checks, do one conditional `GET /employee/employment?employeeId=...&fields=*` only when the employee search response is too sparse to judge the payroll period or business linkage

## Salary
- `/salary/type`
  - `GET` search salary types
- `/salary/transaction`
  - `POST` create salary transaction
- `/salary/transaction/{id}`
  - `GET` read salary transaction
  - `DELETE` delete salary transaction
- `/salary/payslip`
  - `GET` search payslips
- `/salary/payslip/{id}`
  - `GET` read payslip
- Standard payroll prerequisites:
  - exact employee id
  - payroll-ready employee data
  - resolved salary-type ids
- Standard fast-path note:
  - for the exact one-employee payroll task shape, prefer `./trusted-standards/run-employee-payroll.md`
  - the winning blocked path can be one decisive employee read
  - the winning successful path is usually employee read, conditional employment read only if needed, salary-type read, then salary-transaction write
- Standard verification note:
  - `GET /salary/payslip/{id}?fields=*` is enough for `grossAmount`, `amount`, and `specifications.length`
  - `GET /salary/payslip/{id}?fields=*` can still keep individual `specifications[]` as link-only objects
  - for exact line-level verification, use `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))`

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
  - if the prompt requires an exact VAT percentage and that percentage is absent from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`, treat product create as blocked in that account
- Standard create note:
  - `POST /product` without `vatType` can silently inherit an account default in some sandbox accounts; do not use that as the trusted fast path when the prompt scores exact VAT
  - exact `0%` product prompts such as books still use the same rule: select the matching `0%` row from the filtered outgoing VAT result in the current account
- Standard search note:
  - `GET /product?fields=*` can still return `vatType` only as a sparse link object (`id`/`url`)
  - for explicit-VAT invoice tasks, do not assume that product search alone proves the VAT percentage; if the prompt scores exact VAT and the product read is sparse, do one filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` before the invoice write

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
- Standard fast-path note:
  - for the exact create-one-project shape with an existing customer identified by `organizationNumber` and an existing manager identified by `email`, the winning path is usually `GET /customer?organizationNumber=...&count=10&fields=*`, `GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*`, then `POST /project`
  - keep exact uniqueness checks local by comparing returned `customer.organizationNumber` and `employee.email`, and use prompt names only as local tie-breakers when they are provided
  - if the filtered reads already leave one exact-`organizationNumber` hit and one exact-`email` hit, reuse those ids directly; do not require the prompt names to match the returned display names
  - if the prompt omits `startDate`, default it to the run date in ISO format instead of omitting the field
- Standard verification note:
  - the successful `POST /project` response can already prove `name`, `startDate`, `customer.id`, and `projectManager.id`; do not add `GET /project/{id}` unless one of those scored fields is unexpectedly missing

## Activity
- `/activity`
  - `GET` search
  - `POST` create
- `/activity/{id}`
  - `GET` read
- `/activity/>forTimeSheet`
  - `GET` resolve project activities available for one employee on one date
- Standard time-registration note:
  - for project hour tasks, prefer `/activity/>forTimeSheet` over a broad `/activity` search because it proves the activity is actually available on the project for that employee/date
  - if the resolved activity is non-chargeable, do not assume `projectChargeableHours` or a project-specific rate write can still make it billable

## Project Hourly Rates
- `/project/hourlyRates`
  - `GET` search
  - `POST` create
- `/project/hourlyRates/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/project/hourlyRates/projectSpecificRates`
  - `GET` search
  - `POST` create
- `/project/hourlyRates/projectSpecificRates/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard time-registration note:
  - switching an existing project hourly-rate holder to `TYPE_PROJECT_SPECIFIC_HOURLY_RATES` and then creating the employee+activity rate are separate writes
  - do not rely on embedded `projectSpecificRates[]` inside the holder `PUT` as the only rate write
  - `POST /project/hourlyRates/projectSpecificRates` rejects non-chargeable activities with `422 activity.id: Ikke fakturerbar.`

## Timesheet
- `/timesheet/entry`
  - `GET` search
  - `POST` create
- `/timesheet/entry/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/timesheet/week/:approve`
  - `PUT` approve week
- Standard time-registration note:
  - a timesheet write on a non-chargeable project activity can still succeed while returning `chargeable=false` and `hourlyRate=0`
  - do not make `/timesheet/week/:approve` part of the default fast path for project-hour invoice tasks; it can return `403` even for the token owner

## Project Period
- `/project/{id}/period/hourlistReport`
  - `GET` read hour totals for a date window
- `/project/{id}/period/invoicingReserve`
  - `GET` read invoice reserve for a date window
- Standard verification note:
  - `hourlistReport` is the decisive read for how Tripletex classifies the registered hours (`chargeableHours`, `nonChargeableHours`, `nonApprovedHours`)
  - a positive `invoicingReserve` is not proof that the public API can actually convert those hours into an invoice; line-less project orders still fail invoicing

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
  - for project-hour invoice tasks, do not assume a project-linked order with no real order lines can charge the project hour reserve; public verification left `includeHours=false` on the preliminary invoice and `PUT /order/{id}/:invoice` then failed with `422 Fakturaen inneholder ingen ordrelinjer.`

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
- `/invoice/details`
  - `GET` search project-invoice details
- `/invoice/details/{id}`
  - `GET` read project-invoice details
- Standard prerequisites:
  - customer id
  - line or order data
  - sometimes outgoing `vatType`
  - sometimes company bank-account repair through `/ledger/account/{id}`
- Standard explicit-VAT note:
  - for existing-product invoice creates where the prompt gives exact VAT rates, `GET /product?fields=*` may still leave `vatType` too sparse to prove the percentages
  - in that case, the winning create-only path is customer read, product read, one filtered outgoing `vatType` read, then invoice write
  - add an immediate invoice read only if the write response omits decisive totals or later logic truly needs readback-only line details
  - sparse `orderLines` in the write response do not, by themselves, justify the extra `GET /invoice/{id}` when the payload already fixed the line fields and the write response totals match the intended VAT outcome
- Standard direct-line VAT note:
  - for simple direct `orders[].orderLines[]` invoice writes without a product, do not omit line `vatType` just to save the `GET /ledger/vatType` call when the prompt implies a taxable service
  - persistent sandbox on 2026-03-20 accepted that lower-call write shape but created a no-VAT invoice (`amountCurrency == amountExcludingVatCurrency`)
  - hardcoding `vatType.id=3` is not the safe shortcut either; accounts that only expose VAT code `6` on `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` reject hardcoded `3` with `422 ... Ugyldig mva-kode.`
  - the minimum safe path for direct taxable-service lines is still one filtered outgoing VAT read plus the invoice write
- Standard create-and-send note:
  - `POST /invoice` defaults `sendToCustomer=true`
  - for the common create-and-send task shape, prefer that single write over `POST /invoice?sendToCustomer=false` plus a later `PUT /invoice/{id}/:send`
  - when creating a new customer with no email/address, explicit later `sendType=MANUAL` is not the trusted default; persistent sandbox reproduced `500` on 2026-03-20
- Standard fast-path note:
  - for exact existing-invoice full-credit-note tasks, prefer `./trusted-standards/create-customer-invoice-credit-note.md`; the winning path is usually one decisive invoice read and one `:createCreditNote` write
  - for exact existing-invoice payment-reversal tasks, prefer `./trusted-standards/reverse-customer-invoice-payment.md`; the winning score-first path is usually one decisive invoice read and one voucher-reverse write
  - only add a later invoice verify read when the prompt explicitly requires balance proof or the locate read left material ambiguity that the reverse write alone does not settle
- Standard search note:
  - `GET /invoice` requires both `invoiceDateFrom` and `invoiceDateTo`
  - if the prompt gives no invoice date, use one wide but bounded window such as `invoiceDateFrom=2000-01-01` and `invoiceDateTo=<run-date-plus-one-day>` instead of adding a separate resolver read first
  - the same line description can appear in both top-level `orderLines[]` and nested `orders[].orderLines[]` for one invoice; filter across the union and keep uniqueness at the invoice level, not the raw line-hit count
- Standard field note:
  - on outgoing invoice reads, use `postings(...)` for payment-voucher discovery; `payments(...)` is not a valid `fields` member on the endpoint response shape
  - for payment reversals, do not rely only on `posting.type`; the payment posting can be `type=null` and still be the unique negative customer-ledger posting, often `account.number=1500` with payment text such as `Betaling: ...`
  - in payment-reversal tasks identified by a prompt ex-VAT amount, treat that amount as a locate key only; the reopened-balance verification target should be the invoice object's own pre-reversal total from the locate read, usually `amountCurrency` or `amount`
- Standard credit-note note:
  - the verified full-credit action path is `PUT /invoice/{id}/:createCreditNote`
  - default to `sendToCustomer=false` unless the prompt explicitly requires sending the credit note
  - the write response can already prove success with `isCreditNote=true` and `creditedInvoice=<original invoice id>`, so an extra `GET /invoice/{id}` is not part of the trusted fast path
- Standard project-invoice note:
  - `GET /invoice/details/{id}?fields=*` is useful for diagnosing whether a preliminary project invoice has `includeHours=false`
  - public verification on 2026-03-20 showed no working write path on `/invoice` or `/invoice/details` to flip that field; `PUT /invoice/{id}` and `PUT /invoice/details/{id}` were method-not-allowed

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
  - an invoice-looking contact address such as `faktura@...` is still just `email` unless the prompt explicitly asks for a separate invoice/billing email field
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
  - for the exact create-only existing-employee travel-expense shape, the canonical scoring path is `GET /employee?email=...&count=10&fields=*`, `GET /travelExpense/costCategory?count=1000&fields=*`, `GET /travelExpense/paymentType?count=1000&fields=*`, then `POST /travelExpense`
  - for a normal existing-employee expense, do not send `department` unless the prompt explicitly scores another department or live validation requires it
- Standard verification note:
  - parent write/read responses can keep `costs[]` and `perDiemCompensations[]` sparse as `id`/`url`
  - for the exact create-only scored flow, do not add `/travelExpense/cost?...` or `/travelExpense/perDiemCompensation?...` just to double-check embedded child persistence
  - use those two child endpoints only as a conditional investigation branch when a later step needs expanded child fields or the live write response contradicts the intended child counts
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
  - `/ledger/accountingDimensionValue/list` is `PUT` batch update only, not batch create, so creating two new values still requires two `POST /ledger/accountingDimensionValue` calls
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
  - on 2026-03-20 persistent sandbox re-verification, the exact `6590` manual-voucher path succeeded with linkage under `freeAccountingDimension3`, proving again that the posting field must be derived from the returned dimension index
- Standard verification note:
  - write responses may be sufficient by ids/amounts even when linked display fields stay sparse; only read back when the task needs expanded linked fields
  - for the exact supplier-invoice ledger-voucher shape, the minimal verified create path is supplier write, expense-account read, incoming-VAT read, voucher-type read, then voucher write
