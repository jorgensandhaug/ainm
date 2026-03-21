# Tripletex2 Classifier

## Classification Contract
- Your only job is to classify the request into one Tripletex2 task and extract typed input fields.
- Read this file, choose the best task id, build one JSON object, then run `bun submit-classification.ts '<json>'`.
- Do not return prose, markdown, plans, API steps, strategy ideas, or extra keys.
- Use `resolved` only when one task is the clear match and all required fields are confidently extracted.
- Use `unresolved` for ambiguous task match, missing required data, ambiguous/conflicting values, invalid values, unreadable files, or unsupported tasks.
- Use exact top-level fields: `status`, `taskId`, `inputJson`, `code`, `message`, `partialInputJson`, `notes`.
- `inputJson` and `partialInputJson` must be JSON-stringified objects, not nested objects.
- Use `null` for unused fields. For zero-field resolved tasks, use `inputJson: "{}"`.
- Allowed unresolved codes: `ambiguous-task`, `no-task-match`, `missing-required-field`, `ambiguous-field-value`, `conflicting-field-values`, `invalid-field-value`, `unreadable-file`, `unsupported-request`.

## Task Table
| ID | Task | Match when | Fields |
|---|---|---|---|
| `01` | Create customer | Create customer with org number, email, optional mailing address | req: `customerName`, `organizationNumber`, `email`; opt: `postalAddress` |
| `02` | Create supplier | Create supplier with org number and contact email, optional invoice email | req: `supplierName`, `organizationNumber`, `email`; opt: `invoiceEmail` |
| `03` | Create department | Create one or more departments | req: `departmentNames` |
| `04` | Create product | Create product with product number, ex-VAT price, VAT rate | req: `productName`, `productNumber`, `unitPriceExcludingVatNok`, `vatRatePercent` |
| `05` | Create project | Create project for customer and assign project manager | req: `projectName`, `customerOrganizationNumber`, `projectManagerEmail`; opt: `startDate`, `customerName`, `projectManagerName` |
| `06` | Create employee | Create employee with identity, email, start date | req: `employeeName`, `birthDate`, `email`, `startDate`; opt: `userType` |
| `07` | Create accounting dimension + post voucher | Create one free accounting dimension, create values, post voucher against one value | req: `dimensionName`, `dimensionValueNames`, `postingDimensionValueName`, `postingAccountNumber`, `amountNok`; opt: `voucherDate`, `balancingAccountNumber` |
| `08` | Create and send invoice | Create outgoing invoice and send it; usually one service-style line | req: `customerName`, `organizationNumber`, `lineDescription`, `quantity`, `unitPriceExcludingVatNok`; opt: `invoiceDate`, `invoiceComment` |
| `09` | Create customer invoice | Create invoice with explicit `lines[]`, often multiple lines and mixed VAT/product refs, not defined by sending | req: `customerOrganizationNumber`, `lines`; opt: `invoiceDate`, `invoiceDueDate`, `customerName` |
| `10` | Issue full credit note | Find invoice and issue full credit note for entire amount | req: `customerOrganizationNumber`, `lineDescription`, `amountExcludingVatNok`; opt: `creditNoteDate`, `customerName`, `invoiceId`, `invoiceNumber` |
| `11` | Create order -> invoice -> register payment | Multi-step sales flow from order to invoice to full payment | req: `customerOrganizationNumber`, `lines`; opt: `invoiceDate`, `customerName` |
| `12` | Run payroll with bonus | Run payroll for existing employee with base salary plus one-time bonus | req: `employeeEmail`, `payrollMonth`, `baseSalaryNok`, `bonusAmountNok`; opt: `employeeName`, `allowManualVoucherFallback` |
| `13` | Register travel expense with per diem | Travel expense with dates, expense rows, and per-diem rows | req: `employeeEmail`, `title`, `purpose`, `departureDate`, `returnDate`, `costs`, `perDiemCompensations`; opt: `departureFrom`, `employeeName`, `detailedJourneyDescription` |
| `14` | Set project fixed price + invoice milestone | Fixed-price project plus milestone invoice amount or percentage | req: `projectName`, `customerOrganizationNumber`, `projectManagerEmail`, `fixedPriceExcludingVatNok`, `milestoneAmountExcludingVatNok`; opt: `customerName`, `projectManagerName`, `startDate`, `milestonePercentage`, `invoiceDate`, `milestoneDescription` |
| `15` | Register project hours + project invoice | Register hours to one project activity and generate project invoice | req: `employeeEmail`, `projectName`, `customerOrganizationNumber`, `activityName`, `hours`, `hourlyRateExcludingVatNok`; opt: `customerName`, `entryDate`, `invoiceDate`, `invoiceLineDescription` |
| `16` | Register supplier invoice | Supplier invoice from prompt data, no PDF attachment required | req: `supplierName`, `organizationNumber`, `invoiceNumber`, `lineDescription`, `grossAmountNok`, `expenseAccountNumber`, `vatRatePercent`; opt: `invoiceDate`, `dueDate`, `supplierAlreadyExists` |
| `17` | Register customer invoice payment | Find unpaid customer invoice and register payment | req: `customerOrganizationNumber`, `lineDescription`, `amountExcludingVatNok`; opt: `customerName`, `invoiceId`, `invoiceNumber`, `paymentDate` |
| `18` | Reverse customer invoice payment | Reverse existing payment so invoice becomes unpaid again | req: `customerOrganizationNumber`, `lineDescription`, `amountExcludingVatNok`; opt: `customerName`, `invoiceId`, `invoiceNumber`, `reversalDate` |
| `19` | Onboard employee from PDF contract | Create employee from attached contract PDF with employment details | req: `employeeName`, `birthDate`, `departmentName`, `occupationCodeId`, `annualSalaryNok`, `percentageOfFullTimeEquivalent`, `startDate`; opt: `email`, `nationalIdentityNumber`, `bankAccountNumber`, `employmentType`, `employmentForm`, `remunerationType`, `workingHoursScheme`, `standardHoursPerDay` |
| `20` | Register supplier invoice from PDF | Supplier invoice extracted from prompt + attached PDF and PDF must be attached later | req: `supplierName`, `organizationNumber`, `invoiceNumber`, `lineDescription`, `grossAmountNok`, `expenseAccountNumber`, `vatRatePercent`, `attachmentFileName`; opt: `invoiceDate`, `dueDate`, `supplierAlreadyExists` |
| `21` | Correct ledger errors | Ledger repair task with four fixed Jan-Feb 2026 error patterns; no extracted arguments | req: none |
| `22` | Book receipt expense to department | Receipt-backed expense voucher to named department with uploaded receipt | req: `departmentName`, `lineDescription`, `grossAmountNok`, `voucherDate`, `attachmentFileName`; opt: `expenseAccountNumber`, `vatRatePercent`, `departmentAlreadyExists` |
| `23` | Unknown | Unknown task 23. Classify as unresolved unsupported request | unresolved |
| `24` | Correct ledger errors | Same task family as `21`, but different fixed Jan-Feb 2026 anomaly parameters; no extracted arguments | req: none |
| `25` | Overdue invoice reminder fee + partial payment | Find sole overdue invoice, post reminder fee, create/send fee invoice, register partial payment | req: none |
| `26` | Unknown | Unknown task 26. Classify as unresolved unsupported request | unresolved |
| `27` | Unknown | Foreign-currency customer payment with agio booking is known prompt family, but task is still unsupported here. Classify as unresolved | unresolved |
| `28` | Analyze expense increase + create internal projects | Compare Jan vs Feb 2026 expense accounts, take top three increases, create one internal project and one activity per account | req: none |
| `29` | Full project lifecycle | End-to-end project flow: customer, employees, hours, supplier cost, invoice | req: `projectName`, `customerName`, `customerOrganizationNumber`, `projectBudgetNok`, `employees`, `supplierName`, `supplierOrganizationNumber`, `supplierCostNok`; opt: `activityName`, `invoiceLineDescription`, `supplierCostDescription`, `projectManagerEmail`, `startDate`, `invoiceDate`, `deliveryDate` |
| `30` | Unknown | Unknown task 30. Classify as unresolved unsupported request | unresolved |

## Classification Cues
- `08` vs `09`: `08` is create-and-send and usually one service-style line. `09` is defined by explicit `lines[]`, product references, mixed VAT, or invoice creation without the send requirement.
- `10` vs `18`: `10` creates a full credit note. `18` reverses an existing payment and reopens the invoice.
- `16` vs `20`: both are supplier invoices; `20` requires an attached PDF and `attachmentFileName`. Without the PDF attachment path, use `16`.
- `17` vs `18`: `17` registers a payment on an unpaid invoice. `18` reverses an already registered payment.
- `21` vs `24`: both are fixed-pattern ledger-correction tasks with empty input `{}`. They are the same task family but different prompt parameters; choose the exact task id from the prompt wording.
- `15` vs `29`: `15` is one employee + one project activity + hours + invoice. `29` is the broader lifecycle with customer/supplier/employee creation or reuse, supplier cost, and final invoicing.
- `25` vs `17`: `25` is the overdue-invoice workflow with reminder fee plus a 5000 NOK partial payment. `17` is just payment registration.

## Field Extraction Rules
- Normalize dates to ISO `YYYY-MM-DD`. Normalize `payrollMonth` to `YYYY-MM`.
- Preserve names, addresses, descriptions, emails, and other business strings exactly, including Unicode.
- Convert numeric amounts, percentages, quantities, ids, and account numbers to numbers.
- If quantity is clearly implicit for a single line, set `quantity: 1`.
- Use attachment text as first-class evidence for `19`, `20`, and `22`. If the file is unreadable, return `unresolved` with `code: "unreadable-file"`.
- Always copy the exact uploaded filename into `attachmentFileName`; do not rename or normalize it.
- Only set `supplierAlreadyExists`, `departmentAlreadyExists`, or `allowManualVoucherFallback` when the prompt says so explicitly.
- Leave optional fields unset when the prompt or attachment does not provide them.
- Nested objects/arrays use exact child fields:
  - `postalAddress = { addressLine1, postalCode, city }`
  - `09.lines[] = { description, quantity, unitPriceExcludingVatNok, vatRatePercent?, productNumber?, productName? }`
  - `11.lines[] = { description, quantity, unitPriceExcludingVatNok, productNumber?, productName? }`
  - `13.costs[] = { categoryName, amountNokInclVat, comment?, vatRatePercent? }`
  - `13.perDiemCompensations[] = { count, rateNok, amountNok, overnightAccommodation? }`
  - `29.employees[] = { employeeName, email, hours, birthDate? }`
- For `19`, resolve the STYRK-only 2511 contract shape to `occupationCodeId: 301`.
- For `21`, `24`, `25`, and `28`, resolve with `inputJson: "{}"` when the prompt clearly matches.
- For `23`, `26`, `27`, and `30`, return `status: "unresolved"`, `code: "unsupported-request"`, and include the recognized `taskId` when clear.
