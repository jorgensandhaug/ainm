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
| `01` | Create customer | Create a customer with organization number, address, and contact email. | req: `customerName`, `organizationNumber`, `email`; opt: `postalAddress` |
| `02` | Create supplier | Create a supplier with organization number and invoice email details. | req: `supplierName`, `organizationNumber`, `email`; opt: `invoiceEmail` |
| `03` | Create department | Create one or more new departments with the requested names. | req: `departmentNames` |
| `04` | Create product | Create a product with product number, price, and the required VAT treatment. | req: `productName`, `productNumber`, `unitPriceExcludingVatNok`, `vatRatePercent` |
| `05` | Create project | Create a project for an existing customer and assign a project manager. | req: `projectName`, `customerOrganizationNumber`, `projectManagerEmail`; opt: `startDate`, `customerName`, `projectManagerName` |
| `06` | Create employee | Create a new employee with identifying details, contact email, and start date. | req: `employeeName`, `birthDate`, `email`, `startDate`; opt: `userType` |
| `07` | Create accounting dimension and post voucher | Create a custom accounting dimension with values, then post a voucher linked to one value. | req: `dimensionName`, `dimensionValueNames`, `postingDimensionValueName`, `postingAccountNumber`, `amountNok`; opt: `voucherDate`, `balancingAccountNumber` |
| `08` | Create and send invoice | Create and send an outgoing invoice for an existing customer identified by organization number. | req: `customerName`, `organizationNumber`, `lineDescription`, `quantity`, `unitPriceExcludingVatNok`; opt: `invoiceDate`, `invoiceComment` |
| `09` | Create customer invoice | Create a customer invoice with explicit product lines and mixed VAT handling. | req: `customerOrganizationNumber`, `lines`; opt: `invoiceDate`, `invoiceDueDate`, `customerName` |
| `10` | Issue full credit note | Find an invoice and issue a full credit note that reverses the entire amount. | req: `customerOrganizationNumber`, `lineDescription`, `amountExcludingVatNok`; opt: `creditNoteDate`, `customerName`, `invoiceId`, `invoiceNumber` |
| `11` | Create order, invoice, and register payment | Create a sales order, convert it to an invoice, and register full payment. | req: `customerOrganizationNumber`, `lines`; opt: `invoiceDate`, `customerName` |
| `12` | Run payroll with bonus | Process payroll for an employee and include a one-time bonus amount. | req: `employeeEmail`, `payrollMonth`, `baseSalaryNok`, `bonusAmountNok`; opt: `employeeName`, `allowManualVoucherFallback` |
| `13` | Register travel expense | Register a travel expense claim with per diem and named out-of-pocket expenses. | req: `employeeEmail`, `title`, `purpose`, `departureDate`, `returnDate`, `costs`, `perDiemCompensations`; opt: `departureFrom`, `employeeName`, `detailedJourneyDescription` |
| `14` | Set project fixed price and invoice milestone | Set a fixed project price and invoice a requested milestone percentage. | req: `projectName`, `customerOrganizationNumber`, `projectManagerEmail`, `fixedPriceExcludingVatNok`, `milestoneAmountExcludingVatNok`; opt: `customerName`, `projectManagerName`, `startDate`, `milestonePercentage`, `invoiceDate`, `milestoneDescription` |
| `15` | Register project hours and create project invoice | Register billable hours to a project activity and generate the resulting project invoice. | req: `employeeEmail`, `projectName`, `customerOrganizationNumber`, `activityName`, `hours`, `hourlyRateExcludingVatNok`; opt: `customerName`, `entryDate`, `invoiceDate`, `invoiceLineDescription` |
| `16` | Register supplier invoice | Register an incoming supplier invoice with the requested account and input VAT. | req: `supplierName`, `organizationNumber`, `invoiceNumber`, `lineDescription`, `grossAmountNok`, `expenseAccountNumber`, `vatRatePercent`; opt: `invoiceDate`, `dueDate`, `supplierAlreadyExists` |
| `17` | Register customer invoice payment | Locate an unpaid customer invoice and register full payment against it. | req: `customerOrganizationNumber`, `lineDescription`, `amountExcludingVatNok`; opt: `customerName`, `invoiceId`, `invoiceNumber`, `paymentDate` |
| `18` | Reverse customer invoice payment | Reverse a customer invoice payment so the invoice becomes unpaid again. | req: `customerOrganizationNumber`, `lineDescription`, `amountExcludingVatNok`; opt: `customerName`, `invoiceId`, `invoiceNumber`, `reversalDate` |
| `19` | Onboard employee from contract | Create a new employee from a contract, creating the department if needed and writing nested employment details with the resolved occupation code. | req: `employeeName`, `birthDate`, `departmentName`, `occupationCodeId`, `annualSalaryNok`, `percentageOfFullTimeEquivalent`, `startDate`; opt: `email`, `nationalIdentityNumber`, `bankAccountNumber`, `employmentType`, `employmentForm`, `remunerationType`, `workingHoursScheme`, `standardHoursPerDay` |
| `20` | Register supplier invoice with PDF attachment | Register an incoming supplier invoice from prompt-plus-PDF data and attach the source PDF to the created voucher. | req: `supplierName`, `organizationNumber`, `invoiceNumber`, `lineDescription`, `grossAmountNok`, `expenseAccountNumber`, `vatRatePercent`, `attachmentFileName`; opt: `invoiceDate`, `dueDate`, `supplierAlreadyExists` |
| `21` | Correct ledger errors | Audit Jan-Feb 2026 vouchers for four known ledger errors and post the corrective entries. | req: none |
| `22` | Register receipt expense voucher | Book one receipt-backed expense voucher to the requested department, balance it against bank account 1920, and upload the source receipt. | req: `departmentName`, `lineDescription`, `grossAmountNok`, `voucherDate`, `attachmentFileName`; opt: `expenseAccountNumber`, `vatRatePercent`, `departmentAlreadyExists` |
| `23` | Unknown task 23 | Tier 3 placeholder for tx_task_id 23 with no checked-in prompt examples yet. | unresolved |
| `24` | Correct ledger errors | Review the Jan-Feb 2026 ledger for the four known anomalies and post one corrective voucher that repairs them. | req: none |
| `25` | Overdue reminder fee and partial payment | Find the one overdue customer invoice, post a 50 NOK reminder fee, create and send the fee invoice, and register a 5000 NOK partial payment. | req: none |
| `26` | Unknown task 26 | Tier 3 placeholder for tx_task_id 26 with no checked-in prompt examples yet. | unresolved |
| `27` | Register foreign-currency payment with exchange gain | Register a customer invoice payment in a foreign currency and book the exchange rate difference (agio) to the correct account. | unresolved |
| `28` | Analyze expense increase and create internal projects | Analyze January-versus-February 2026 ledger expenses, select the three expense accounts with the largest increase, and create one internal project plus one activity for each selected account. | req: none |
| `29` | Full project lifecycle | Create or reuse the customer, supplier, and employees needed for a project, register project hours and supplier costs, then create the project invoice through the order-to-invoice path. | req: `projectName`, `customerName`, `customerOrganizationNumber`, `projectBudgetNok`, `employees`, `supplierName`, `supplierOrganizationNumber`, `supplierCostNok`; opt: `activityName`, `invoiceLineDescription`, `supplierCostDescription`, `projectManagerEmail`, `startDate`, `invoiceDate`, `deliveryDate` |
| `30` | Unknown task 30 | Tier 3 placeholder for tx_task_id 30 with no checked-in prompt examples yet. | unresolved |

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
