# Tripletex2 Classifier

## Classification Contract
- Your only job is to classify the request into one Tripletex2 task and extract typed input fields.
- Read this file, choose the best canonical task id, build one JSON object, then run `bun submit-classification.ts '<json>'`.
- Do not return prose, markdown, plans, API steps, strategy ideas, alternative candidates, ranked lists, or extra keys.
- Use only the canonical Tripletex2 task ids defined in this file. Do not use legacy prompt-label ids, old competition labels, or any external task-id namespace.
- Return exactly one task-understanding object for exactly one final task id.
- Use `resolved` only when one task is the clear match and all required fields are confidently extracted.
- Use `unresolved` for ambiguous task match, missing required data, ambiguous/conflicting values, invalid values, unreadable files, or unsupported tasks.
- Use exact top-level fields: `status`, `taskId`, `inputJson`, `code`, `message`, `partialInputJson`, `notes`.
- `inputJson` and `partialInputJson` must be JSON-stringified objects, not nested objects.
- Use `null` for unused fields. For zero-field resolved tasks, use `inputJson: "{}"`.
- Allowed unresolved codes: `ambiguous-task`, `no-task-match`, `missing-required-field`, `ambiguous-field-value`, `conflicting-field-values`, `invalid-field-value`, `unreadable-file`, `unsupported-request`.

## Attachment Handling
- Attachment entries may include:
  - `path`: absolute staged file path on local disk
  - `hasTextContent: yes|no`: whether text was already inlined into the prompt
  - `textContent`: pre-extracted text when available
- `hasTextContent: no` does NOT mean the attachment is missing or unreadable. PDFs and other binary files are intentionally staged on disk without inline text.
- When a required attachment has `hasTextContent: no`, inspect the file at `path` before deciding it is unreadable.
- Prefer the local helper first:
  - `bun read-attachment.ts '<absolute-path>'`
- For PDFs, `pdftotext` is also available locally if needed.
- Only use `code: "unreadable-file"` after a concrete read attempt against the staged `path` fails or the file is genuinely absent.
- Never claim that no readable file was available when the prompt provided a staged `path` that you did not check.

## Retry Contract
- First-pass classification always uses the full canonical task universe in this file. A later runtime retry does NOT mean your earlier interpretation was false.
- If the prompt includes a `Retry context:` block, treat the listed excluded task ids as semantically real but non-eligible for final live selection in that retry.
- On retry, you MUST choose a DIFFERENT canonical task id from the listed remaining task ids.
- On retry, never return an excluded task id again.
- On retry, do NOT return `unresolved` while the runtime still lists remaining task ids. Pick the most plausible different remaining task id, even if it is weaker than the first choice.
- On retry, never invent a task outside the listed remaining task ids.
- Preserve the one-task / one-strategy handoff: classify one final task id, extract only that task's fields, and do not leak input for any rejected task id.

## Legacy Label Hazard
- The old prompt corpus under `tasks/tripletex/data/prompt-task-labels.jsonl` uses a legacy task-id namespace that does NOT match canonical Tripletex2 ids.
- Confirmed mismatches include: old `01→06`, `02→01`, `03→04`, `04→02`, `14→10`, `17→07`, plus broader drift across much of old `01–17`.
- Therefore: never reason from raw old `tx_task_id` labels. Reason from prompt semantics only.

## Family Router
Apply these gates in order before drilling into the detailed task table.

### 1) Attachment gate — check this FIRST
- Employment contract (arbeidskontrakt / contrato de trabalho) PDF → `19`
- Offer letter (tilbudsbrev / lettre d'offre / Angebotsschreiben / tilbodsbrev) PDF → `21`
- Supplier-invoice PDF → `20`
- Receipt / kvittering attachment with department expense booking → `22`
- Bank-statement CSV → `23`

### 2) High-confidence single-signal routes
- `returned by bank` / `returnert av banken` / `retourné par la banque` → `18`
- `EUR` + two exchange rates → `27`
- `create AND send` invoice, usually one service line → `08`
- three product lines + product numbers + mixed VAT (25% + 15% + 0%) → `09`
- order / Auftrag / commande + convert to invoice + register payment → `11`
- complaint + full credit note / Gutschrift / avoir complet → `10`
- fixed price / fastpris / Festpreis / prix forfaitaire → `14`
- register N hours for one employee on one activity + invoice → `15`
- four numbered lifecycle steps: budget + employee hours + supplier cost + invoice → `29`
- salary / payroll / lønn / salário / Gehalt → `12`
- travel expense / reiseregning / Reisekostenabrechnung + per diem + itemized trip costs → `13`
- overdue + reminder fee / purregebyr + partial payment → `25`
- `INV-2026-XXXX` + supplier invoice data inline, no attachment → `16`
- accounting dimension / fri regnskapsdimensjon + voucher posting → `07`
- largest increase January→February 2026 + internal projects/activities → `28`
- year-end / årsoppgjør + year 2025 + three named assets + 22% tax → `30`
- month-end / månedsavslutning + accruals + monthly depreciation + salary provision → `26`

### 3) Entity-creation family
- customer + org number + email → `01`
- supplier + org number + email → `02`
- list of department names → `03`
- product + product number + price + VAT rate → `04`
- project + customer org number + PM email, no financial ops → `05`
- employee + birthdate + email + start date, no attachment → `06`

### 4) Ledger-correction family
- Jan-Feb 2026 ledger + four listed anomalies with concrete account numbers and NOK amounts → `24`

### 5) Simple payment fallback
- Existing unpaid customer invoice + register full NOK payment, after ruling out `18`, `25`, and `27` → `17`

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
| `21` | Onboard employee from offer letter | Create a new employee from a tilbudsbrev (offer letter) PDF, creating the department if needed. The offer letter does NOT contain Lonnstype so remunerationType is forced to NOT_CHOSEN. | req: `employeeName`, `birthDate`, `departmentName`, `occupationCodeId`, `annualSalaryNok`, `percentageOfFullTimeEquivalent`, `startDate`; opt: `employmentForm`, `standardHoursPerDay` |
| `22` | Register receipt expense voucher | Book one receipt-backed expense voucher to the requested department, balance it against bank account 1920, and upload the source receipt. | req: `departmentName`, `lineDescription`, `grossAmountNok`, `voucherDate`, `attachmentFileName`; opt: `expenseAccountNumber`, `vatRatePercent`, `departmentAlreadyExists` |
| `23` | Reconcile bank statement | Reconcile an attached bank-statement CSV against open customer and supplier invoices, handling partial payments and booking non-invoice bank lines. | req: `attachmentFileName` |
| `24` | Correct ledger errors — explicit listing | Review the Jan-Feb 2026 ledger for the four known anomalies when the prompt explicitly lists each error with concrete account/amount details, then post one corrective voucher that repairs them. | req: none |
| `25` | Overdue reminder fee and partial payment | Find the one overdue customer invoice, post a 50 NOK reminder fee, create and send the fee invoice, and register a 5000 NOK partial payment. | req: none |
| `26` | Month-end closing | Perform month-end closing steps such as accruals, monthly depreciation, and salary provision. | unresolved |
| `27` | Register foreign-currency payment with exchange gain | Register a customer invoice payment in a foreign currency and book the exchange-rate difference (agio) to the correct account. | unresolved |
| `28` | Analyze expense increase and create internal projects | Analyze January-versus-February 2026 ledger expenses, select the three expense accounts with the largest increase, and create one internal project plus one activity for each selected account. | req: none |
| `29` | Full project lifecycle | Create or reuse the customer, supplier, and employees needed for a project, register project hours and supplier costs, then create the project invoice through the order-to-invoice path. | req: `projectName`, `customerName`, `customerOrganizationNumber`, `projectBudgetNok`, `employees`, `supplierName`, `supplierOrganizationNumber`, `supplierCostNok`; opt: `activityName`, `invoiceLineDescription`, `supplierCostDescription`, `projectManagerEmail`, `startDate`, `invoiceDate`, `deliveryDate` |
| `30` | Simplified year-end closing | Perform simplified year-end closing steps, including year-2025 asset depreciation, prepaid reversal, and 22% tax handling. | unresolved |

## Contrastive Cues
- `08` vs `09` vs `11`:
  - `08` → create AND send, usually one service-style line.
  - `09` → three product lines, product numbers in parentheses, mixed VAT, create-only.
  - `11` → order + convert to invoice + register payment.
- `10` vs `18`:
  - `10` → complaint / credit note / Gutschrift / avoir complet.
  - `18` → bank returned payment / returnert av banken.
- `16` vs `20` vs `22`:
  - `20` → supplier invoice with PDF attachment.
  - `16` → supplier invoice all inline, usually `INV-2026-XXXX`, no attachment.
  - `22` → receipt / kvittering, department expense booking.
- `06` vs `12` vs `13` vs `19` vs `21`:
  - `06` → create employee from inline identity data.
  - `12` → payroll / salary / bonus.
  - `13` → travel expense with per diem and itemized costs.
  - `19` → employment contract (arbeidskontrakt) PDF — has STYRK code, may include national ID / bank account / email; remunerationType=MONTHLY_WAGE.
  - `21` → offer letter (tilbudsbrev) PDF — has job title (not STYRK), no national ID / bank account / email; remunerationType=NOT_CHOSEN.
- `05` vs `14` vs `15` vs `29`:
  - `05` → create project only.
  - `14` → fixed price + milestone invoice.
  - `15` → one employee, one activity, hours + invoice.
  - `29` → full lifecycle: budget + multiple employees + supplier cost + invoice.
- `17` vs `25` vs `27`:
  - `17` → simple full NOK payment.
  - `25` → overdue invoice + 50 NOK reminder fee + 5000 NOK partial payment.
  - `27` → EUR payment + two exchange rates.
- `24` vs `28`:
  - `28` → largest expense increase January→February 2026 + internal project/activity creation.
  - `24` → four listed ledger anomalies with concrete account numbers and NOK amounts + one corrective voucher.

## Field Extraction Rules
- Normalize dates to ISO `YYYY-MM-DD`. Normalize `payrollMonth` to `YYYY-MM`.
- Preserve names, addresses, descriptions, emails, and other business strings exactly, including Unicode.
- Convert numeric amounts, percentages, quantities, ids, and account numbers to numbers.
- If quantity is clearly implicit for a single line, set `quantity: 1`.
- Use attachment contents as first-class evidence for `19`, `20`, `21`, `22`, and `23`. Read from `textContent` when present; otherwise read the staged file at `path`. If the file is unreadable after an actual read attempt, return `unresolved` with `code: "unreadable-file"`.
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
- For `21`, resolve the job title (Stilling field) in the tilbudsbrev to `occupationCodeId` using these hardcoded mappings: Seniorutvikler→5935, Regnskapssjef→4679, HR-rådgiver→4169, Salgssjef→4930, Kontormedarbeider→2951, IT-konsulent→2610. Do NOT extract `remunerationType` — the strategy forces `NOT_CHOSEN`. Do NOT extract `email`, `nationalIdentityNumber`, or `bankAccountNumber` — offer letters do not contain them.
- For zero-field tasks `24`, `25`, and `28`, resolve with `inputJson: "{}"` when the prompt clearly matches.
- For recognized but unsupported tasks `26`, `27`, and `30`, return `status: "unresolved"`, `code: "unsupported-request"`, and include the recognized `taskId` when clear.
