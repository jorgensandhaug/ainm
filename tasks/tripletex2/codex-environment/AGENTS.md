# Tripletex2 Task-Understanding Scenario Knowledge

## Mission
- Decide which of the 18 registered Tripletex2 tasks a prompt belongs to.
- Extract only the typed task input values for that task.
- Help the deterministic runtime choose the right strategy by classifying and extracting correctly.
- Optimize for correct task id and correct typed fields, not for implementation plans.

## Scoring Context
- Real task scoring is based on final Tripletex side effects, not on text output.
- Correctness matters first. Efficiency matters second.
- Classification mistakes are expensive because they route the request to the wrong deterministic strategy.
- Extraction mistakes are expensive because scorer-sensitive fields often differ only by VAT mode, date normalization, payment-vs-credit semantics, or whether a related object already exists.

## Environment Facts
- Prompts may be in `nb`, `nn`, `en`, `de`, `fr`, `es`, or `pt`.
- Files or images may be provided. Read them and extract exact names, dates, amounts, identifiers, and relationships.
- Preserve user-provided business strings exactly, including Unicode.
- The registered task universe is fixed by `../src/registry/tasks.ts` and the task surfaces in `../src/tasks/*/task.ts`.

## Output Boundary
- Return JSON only.
- The runtime enforces an output schema.
- Do not return prose, markdown, code fences, or explanations outside the JSON object.
- Do not return a solve plan, API sequence, strategy hint, or implementation notes.

## Sources Of Truth
- `../src/runtime/contracts.ts` defines the classifier/extractor boundary.
- `../src/registry/tasks.ts` defines the registered task universe.
- `../src/tasks/*/task.ts` files define the classifier-facing task surfaces.
- Prefer task surfaces over strategy files.
- Do not use trusted standards or task playbooks as the primary basis for classification.

## Classification Rules
- Classify only against the 18 registered Tripletex2 task surfaces.
- Choose `resolved` only when one task is the best match and the required extracted fields can be filled confidently.
- Choose `unresolved` when multiple tasks remain plausible, a required field value is ambiguous, no task matches, the request is unsupported, or an attachment is unreadable.
- If a prompt asks for several distinct Tripletex side effects that span different tasks, prefer `unresolved` unless one registered task clearly subsumes the whole request.

## Extraction Rules
- Emit typed values only, using the exact field names from the chosen task surface.
- Do not invent extra fields.
- Normalize dates to ISO `YYYY-MM-DD` when the task surface expects full dates.
- Normalize payroll periods to `YYYY-MM`.
- Normalize amounts into numeric NOK values.
- Normalize VAT expressions into numeric percentages such as `25`, `15`, or `0`.
- Preserve names, addresses, cities, emails, descriptions, invoice numbers, and other business strings exactly.
- If quantity is clearly implicit for a single line or single item, normalize it to `1`.
- If a value is uncertain, prefer `unresolved` over guessing.

## Task Catalog
- `01 Create customer`: create a customer card, not an invoice or supplier. Required `customerName`, `organizationNumber`, `email`. Optional `postalAddress`. One ordinary mailing address maps to `postalAddress` only.
- `02 Create supplier`: create a supplier card, not a supplier invoice. Required `supplierName`, `organizationNumber`, `email`. Optional `invoiceEmail`. Use `invoiceEmail` only when invoice-specific intent is explicit.
- `03 Create department`: create one or more departments. Required `departmentNames` array. Normalize a single department into a one-element array and preserve prompt order.
- `04 Create product`: create a product with number, ex-VAT price, and VAT rate. Required `productName`, `productNumber`, `unitPriceExcludingVatNok`, `vatRatePercent`.
- `05 Create project`: create a project for an existing customer and assign a project manager. Required `projectName`, `customerOrganizationNumber`, `projectManagerEmail`. Optional `startDate`, `customerName`, `projectManagerName`.
- `06 Create employee`: create a new employee, not payroll. Required `employeeName`, `birthDate`, `email`, `startDate`. Optional `userType`. Do not invent department or division fields.
- `07 Create accounting dimension and post voucher`: create a free accounting dimension with values, then post a voucher linked to one named value. Required `dimensionName`, `dimensionValueNames`, `postingDimensionValueName`, `postingAccountNumber`, `amountNok`. Optional `voucherDate`, `balancingAccountNumber`.
- `08 Create and send invoice`: create and send one outgoing invoice for an existing customer by organization number. Required `customerName`, `organizationNumber`, `lineDescription`, `quantity`, `unitPriceExcludingVatNok`. Optional `invoiceDate`, `invoiceComment`.
- `09 Create customer invoice`: create a customer invoice with explicit line items, often existing products or mixed VAT handling. Required `customerOrganizationNumber`, `lines`. Optional `invoiceDate`, `invoiceDueDate`, `customerName`.
- `10 Issue full credit note`: find an existing invoice and reverse the full invoice amount. Required `customerOrganizationNumber`, `lineDescription`, `amountExcludingVatNok`. Optional `creditNoteDate`, `customerName`, `invoiceId`, `invoiceNumber`.
- `11 Create order, invoice, and register payment`: multi-step outgoing sales flow that ends with full payment. Required `customerOrganizationNumber`, `lines`. Optional `invoiceDate`, `customerName`.
- `12 Run payroll with bonus`: payroll for an existing employee in a target month with a separate one-time bonus. Required `employeeEmail`, `payrollMonth`, `baseSalaryNok`, `bonusAmountNok`. Optional `employeeName`, `allowManualVoucherFallback`.
- `13 Register travel expense`: travel expense with explicit travel dates, cost rows, and per-diem rows. Required `employeeEmail`, `title`, `purpose`, `departureDate`, `returnDate`, `costs`, `perDiemCompensations`. Optional `departureFrom`, `employeeName`, `detailedJourneyDescription`.
- `14 Set project fixed price and invoice milestone`: set or confirm a fixed project price and invoice a milestone amount or percentage. Required `projectName`, `customerOrganizationNumber`, `projectManagerEmail`, `fixedPriceExcludingVatNok`, `milestoneAmountExcludingVatNok`. Optional `customerName`, `projectManagerName`, `startDate`, `milestonePercentage`, `invoiceDate`, `milestoneDescription`.
- `15 Register project hours and create project invoice`: log hours to a project activity, then invoice them. Required `employeeEmail`, `projectName`, `customerOrganizationNumber`, `activityName`, `hours`, `hourlyRateExcludingVatNok`. Optional `customerName`, `entryDate`, `invoiceDate`, `invoiceLineDescription`.
- `16 Register supplier invoice`: incoming supplier invoice, not supplier creation. Required `supplierName`, `organizationNumber`, `invoiceNumber`, `lineDescription`, `grossAmountNok`, `expenseAccountNumber`, `vatRatePercent`. Optional `invoiceDate`, `dueDate`, `supplierAlreadyExists`.
- `17 Register customer invoice payment`: find an unpaid outgoing invoice and register payment. Required `customerOrganizationNumber`, `lineDescription`, `amountExcludingVatNok`. Optional `customerName`, `invoiceId`, `invoiceNumber`, `paymentDate`.
- `18 Reverse customer invoice payment`: reverse a payment on an already paid outgoing invoice. Required `customerOrganizationNumber`, `lineDescription`, `amountExcludingVatNok`. Optional `customerName`, `invoiceId`, `invoiceNumber`, `reversalDate`.

## Structured Field Shapes
- Task `09` and task `11` use `lines[]` in prompt order. Each line may include `description`, `quantity`, `unitPriceExcludingVatNok`, and optionally `productNumber`, `productName`, and for task `09` `vatRatePercent`.
- Task `13` uses `costs[]` with `categoryName`, `amountNokInclVat`, optional `comment`, and optional `vatRatePercent`.
- Task `13` also uses `perDiemCompensations[]` with `count`, `rateNok`, `amountNok`, and optional `overnightAccommodation`.
- Task `07` uses `dimensionValueNames[]` in prompt order and exactly one `postingDimensionValueName` that should be linked on the voucher.

## High-Value Classification Distinctions
- Customer vs supplier: outgoing-sales tasks use customers; incoming-bill tasks use suppliers.
- Customer creation vs invoice creation: creating a customer card is task `01`; invoicing an existing customer is task `08`, `09`, `11`, `14`, `15`, `17`, or `18`.
- Create-and-send invoice vs create customer invoice: task `08` is a simple outgoing invoice for an existing customer with one direct line; task `09` is the more explicit invoice-lines shape, often with product identifiers and mixed VAT handling.
- Invoice creation vs order-then-payment: task `11` explicitly includes sales order creation, invoicing, and full payment.
- Credit note vs payment reversal: task `10` reverses the invoice itself; task `18` reverses a payment voucher and reopens the invoice.
- Register payment vs reverse payment: task `17` pays an unpaid invoice; task `18` undoes a payment on a paid invoice.
- Supplier creation vs supplier invoice: task `02` creates the supplier master record; task `16` registers an incoming invoice from that supplier.
- Employee creation vs payroll: task `06` creates the employee record; task `12` runs payroll for an existing employee.
- Project milestone vs project hours: task `14` is fixed-price milestone billing; task `15` is hours-based project work and invoicing.

## Tripletex Domain Map
- Customers and suppliers are distinct master-data entities even when both have organization numbers and emails.
- Departments, divisions, employees, products, projects, vouchers, invoices, orders, and travel expenses are separate task families.
- Outgoing customer invoice flows commonly involve `/customer`, `/order`, `/invoice`, and `/invoice/paymentType`.
- Supplier invoice flows commonly involve `/supplier`, `/ledger/account`, `/ledger/vatType`, and `/ledger/voucher`.
- Project flows commonly involve `/project`, `/employee`, `/activity`, `/timesheet/entry`, `/order`, and `/invoice`.
- Payroll flows commonly involve `/employee`, `/division`, `/salary/type`, `/salary/transaction`, and `/salary/payslip`.
- Travel-expense flows commonly involve `/travelExpense`, `/travelExpense/cost`, `/travelExpense/perDiemCompensation`, and rate-related lookups.

## Response Conventions
- List responses are commonly wrapped as `{"values": [...], "fullResultSize": N}`.
- Single-object responses are commonly wrapped as `{"value": {...}}`.
- Some successful writes or deletes return `204 No Content`.
- For classification, this mainly matters because invoice- and payment-related prompts often refer to objects that are later located by line descriptions, organization numbers, invoice numbers, and ex-VAT amounts.

## Language And Normalization Cues
- Normalize mixed-language month names and date prose into ISO dates.
- Keep Unicode exactly in names like `Lumiere`, `Etoile`, `Joao`, `Odegard`, or `Grunfeld` when the prompt uses accented or Nordic characters.
- Recognize localized ex-VAT phrasing such as `eksklusiv MVA`, `hors TVA`, `ohne MwSt.`, `sin IVA`, and `sem IVA`.
- Recognize localized gross/including-VAT phrasing such as `inklusive MVA`, `TTC`, `inkl. MwSt.`, `con IVA`, and `com IVA`.
- Recognize localized generic email labels such as `Email`, `E-post`, `Correo`, and `Courriel` as the same contact-email concept unless the prompt explicitly distinguishes billing or invoice email.
- Recognize explicit existing-state cues such as "already exists", "existing supplier", "existing customer", "already paid", or "reverse payment".

## Tripletex Gotchas Relevant To Classification And Extraction
- Preserve prompt text exactly for names, addresses, descriptions, and cities. Do not transliterate or ASCII-normalize.
- `amountExcludingVatNok` in tasks `10`, `17`, and `18` is usually a locate key for the target invoice, not the amount the runtime will necessarily write.
- `grossAmountNok` in task `16` is the gross supplier invoice total, not the net or VAT-only amount.
- Task `12` keeps `baseSalaryNok` and `bonusAmountNok` separate. Do not fold the bonus into base salary.
- Set `allowManualVoucherFallback` only when the prompt explicitly permits manual voucher fallback.
- Set `supplierAlreadyExists` only when the prompt explicitly says the supplier already exists or clearly implies a retry/persistent-account context.
- For task `13`, do not invent `departureFrom` when the prompt does not supply a concrete location.
- For task `13`, if the prompt does not provide explicit enough travel dates or per-diem detail to reach a deliverable travel expense, prefer `unresolved`.
- For task `14`, if the prompt gives a milestone percentage, preserve `milestonePercentage` when explicit and normalize the exact `milestoneAmountExcludingVatNok`.
- For task `14`, preserve decimal arithmetic exactly. Do not round milestone amounts during extraction.
- For task `15`, keep the full `hours` value even when it exceeds 24. Runtime can split entries later.
- For task `09` and `11`, keep line order exactly as prompted and capture both `productNumber` and `productName` when given.
- For task `08`, normalize implicit single-line quantity to `1`.
- For tasks `10`, `17`, and `18`, capture `invoiceId` or `invoiceNumber` directly when the prompt gives them.
- Do not confuse a credit note request with refunding, paying, or reversing a payment.

## Discipline
- Do not plan the Tripletex API workflow.
- Do not inspect or reason through trusted standards, task playbooks, or strategy files unless the task surface is genuinely insufficient.
- Optimize for a correct task id and correct typed inputs, not for narrative explanation.
