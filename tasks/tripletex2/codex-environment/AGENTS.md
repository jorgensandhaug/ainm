# Tripletex2 Scenario Knowledge

## Task Understanding Contract
- Decide which registered Tripletex2 task a request belongs to.
- Extract only the typed task input values for that task.
- Return a small JSON result to the deterministic runtime.
- Return JSON only; no prose, markdown, code fences, plans, API sequences, or execution notes.
- `src/runtime/contracts.ts` defines the classifier/extractor boundary.
- `src/registry/tasks.ts` defines the registered task universe.
- `src/tasks/*/task.ts` files are the classifier-facing task surfaces.
- Prefer task surfaces over strategy files.
- Classify only against the registered Tripletex2 task surfaces provided in the prompt.
- Choose `resolved` only when one task is the best match and the required extracted fields can be filled confidently.
- Choose `unresolved` when multiple tasks remain plausible, a required field value is ambiguous, no task matches, the request is unsupported, or an attachment is unreadable.
- Emit typed values only, using the exact field names from the chosen task surface.
- Do not invent extra fields.
- Normalize dates to ISO `YYYY-MM-DD` when the task surface expects dates.
- Preserve user-provided business strings exactly, including Unicode.
- Use attachment text when relevant.
- If a value is uncertain, prefer `ambiguous` or `failed` over guessing.
- If a request clearly belongs to a placeholder or otherwise unsupported task surface, return `unresolved` with `taskId`, `code: "unsupported-request"`, and a short explanation.
- Do not plan the Tripletex API workflow.
- Do not inspect or reason through strategy files unless the task surface is genuinely insufficient.
- Optimize for a correct task id and correct typed inputs, not for narrative explanation.

## Environment Facts
- Real submissions usually use a fresh Tripletex account.
- Sandbox testing may use a persistent account with leftover state.
- Prompts may be in `nb`, `nn`, `en`, `es`, `pt`, `de`, or `fr`.
- Files or images may be attached; extract exact names, dates, amounts, ids, and relationships from them.
- Fresh-account prompts often imply prerequisites do not exist yet; persistent-account prompts may describe updates, reversals, retries, or already-existing entities.

## Scoring Context
- Correctness is scored field-by-field from the final expected state.
- Efficiency bonus matters only at perfect correctness.
- Fewer API calls and fewer `4xx` errors are better, so prompts often describe the narrowest safe locator fields.
- For task understanding, this means extraction should preserve the exact discriminator fields the runtime will need.

## Task Patterns
| ID | Task pattern | Description |
|---|---|---|
| `01` | Create customer | Create a customer with organization number, address, and contact email. |
| `02` | Create supplier | Create a supplier with organization number and invoice email details. |
| `03` | Create department | Create one or more new departments with the requested names. |
| `04` | Create product | Create a product with product number, price, and the required VAT treatment. |
| `05` | Create project | Create a project for an existing customer and assign a project manager. |
| `06` | Create employee | Create a new employee with identifying details, contact email, and start date. |
| `07` | Create accounting dimension and post voucher | Create a custom accounting dimension with values, then post a voucher linked to one value. |
| `08` | Create and send invoice | Create and send an outgoing invoice for a customer. |
| `09` | Create customer invoice | Create a customer invoice with explicit product lines and mixed VAT handling. |
| `10` | Issue full credit note | Find an invoice and issue a full credit note that reverses the entire amount. |
| `11` | Create order, invoice, and register payment | Create a sales order, convert it to an invoice, and register full payment. |
| `12` | Run payroll with bonus | Process payroll for an employee and include a one-time bonus amount. |
| `13` | Register travel expense | Register a travel expense claim with per diem and named out-of-pocket expenses. |
| `14` | Set project fixed price and invoice milestone | Set a fixed project price and invoice a requested milestone percentage. |
| `15` | Register project hours and create project invoice | Register project hours to a project activity and generate the resulting invoice. |
| `16` | Register supplier invoice | Register an incoming supplier invoice with the requested account and input VAT. |
| `17` | Register customer invoice payment | Locate an unpaid customer invoice and register full payment against it. |
| `18` | Reverse customer invoice payment | Reverse a customer invoice payment so the invoice becomes unpaid again. |
| `19` | Unknown task type | Unknown task type for `tx_task_id 19`. |
| `20` | Unknown task type | Unknown task type for `tx_task_id 20`. |
| `21` | Unknown task type | Unknown task type for `tx_task_id 21`. |
| `22` | Register receipt expense voucher | Book one receipt-backed expense voucher to a named department, balance it against bank account 1920, and upload the receipt. |
| `23` | Unknown task type | Unknown task type for `tx_task_id 23`. |
| `25` | Unknown task type | Unknown task type for `tx_task_id 25`. |
| `26` | Unknown task type | Unknown task type for `tx_task_id 26`. |
| `27` | Unknown task type | Unknown task type for `tx_task_id 27`. |
| `28` | Unknown task type | Unknown task type for `tx_task_id 28`. |
| `29` | Unknown task type | Unknown task type for `tx_task_id 29`. |
| `30` | Unknown task type | Unknown task type for `tx_task_id 30`. |

## Common Endpoints
- `/customer`, `/customer/{id}`: customer create/search/read/update/delete.
- `/company`, `/company/{id}`: company read/update, often relevant to travel-expense fallback data.
- `/department`, `/department/{id}`, `/department/list`: department create/search/update/delete and batch create.
- `/employee`, `/employee/{id}`, `/employee/employment`: employee create/search/update and employment verification/create.
- `/division`, `/division/{id}`: division search/create/read/update/delete.
- `/salary/type`, `/salary/transaction`, `/salary/transaction/{id}`, `/salary/payslip`, `/salary/payslip/{id}`: salary type lookup, payroll transaction create/read/delete, payslip search/read.
- `/product`, `/product/{id}`: product create/search/update/delete.
- `/project`, `/project/{id}`, `/project/hourlyRates`, `/project/hourlyRates/projectSpecificRates`: project create/search/update/delete and project rate configuration.
- `/activity/>forTimeSheet`, `/timesheet/entry`, `/timesheet/week/:approve`: time registration and project-hour billing support.
- `/order`, `/order/{id}`, `/order/{id}/:invoice`: order create/search/update/delete and order-to-invoice.
- `/invoice`, `/invoice/{id}`, `/invoice/{id}/:createCreditNote`, `/invoice/{id}/:payment`, `/invoice/{id}/:send`, `/invoice/paymentType`: invoice create/search/read/full-credit-note/payment/send/payment-type lookup.
- `/supplier`, `/supplier/{id}`: supplier create/search/read/update/delete.
- `/travelExpense`, `/travelExpense/{id}`, `/travelExpense/:deliver`, `/travelExpense/cost`, `/travelExpense/perDiemCompensation`, `/travelExpense/costCategory`, `/travelExpense/paymentType`, `/travelExpense/rate`: travel-expense create/update/delete plus child-line and lookup endpoints.
- `/ledger/account`, `/ledger/account/{id}`: chart-of-accounts search/create/update/delete.
- `/ledger/vatType`: VAT lookup for outgoing and incoming VAT handling.
- `/ledger/accountingDimensionName`, `/ledger/accountingDimensionValue`, `/ledger/accountingDimensionValue/list`: free accounting dimension name/value create/search/update.
- `/ledger/posting`: ledger posting search/read.
- `/ledger/voucher`, `/ledger/voucher/{id}`, `/ledger/voucher/{id}/:reverse`, `/ledger/voucher/importDocument`: voucher search/create/update/delete/reverse and imported supplier-invoice path.

## Response Conventions
- List responses are commonly wrapped as `{"values": [...], "fullResultSize": N}`.
- Single-object responses are commonly wrapped as `{"value": {...}}`.
- Successful writes or deletes may return `204 No Content`.
- `values[]` can be authoritative even when summary metadata such as `fullResultSize` looks stale or zero.
- Some write responses return sparse link objects rather than fully expanded nested data.

## Tripletex Gotchas
- Prompt language does not change task identity; the same create/update/payment patterns appear across Norwegian, English, German, French, Spanish, and Portuguese.
- Preserve user strings exactly. Do not ASCII-normalize names, addresses, cities, emails, project names, or invoice descriptions.
- Normalize dates to ISO `YYYY-MM-DD`, but keep business text exactly as written.
- Fresh-account create tasks often classify cleanly even when sandbox accounts show extra repair branches from old state.
- Persistent sandbox state can create duplicates or ambiguity that would not exist in production fresh-account runs.
- `403 Invalid or expired token` and proxy-token failures indicate unusable credentials, not task ambiguity.
- Many decisive Tripletex validation details live in `validationMessages[]`, not in the top-level error `message`.
- `fields=*` is often the decisive read shape for locating or verifying existing objects.
- Related-object references usually resolve by `id`; nested name-only objects can look accepted while failing to link correctly.
- `POST /department/list` is the batch-create shape for multi-department prompts, and its `values[]` can be correct even when `fullResultSize=0`.
- Standard create-customer prompts usually mean one generic `email` plus optional `postalAddress`; do not infer `physicalAddress` or `invoiceEmail` unless the prompt distinguishes them.
- Standard create-supplier prompts usually mean one generic `email`; if the prompt explicitly distinguishes billing email, capture `invoiceEmail` too.
- A single invoice-looking supplier email may map to both supplier contact and invoice email, but that is still the same create-supplier task shape.
- Create-product prompts are keyed by exact `productName`, `productNumber`, excluding-VAT price, and VAT percentage.
- `POST /product` without explicit `vatType` can silently inherit the wrong VAT in some accounts; extraction must preserve the requested VAT rate exactly.
- Create-project prompts are usually defined by existing customer organization number plus project-manager email; customer name and manager name are tie-breakers, not the primary keys.
- `POST /project` with nested customer or manager details but without resolved ids can appear to work while leaving links missing or validation incomplete.
- Create-employee prompts are keyed by person name, birth date, email, and start date; department and division are repair concepts, not extraction fields.
- Employee create responses can be too sparse to prove `startDate`, so the runtime often verifies via `/employee/employment`.
- Employee creation may require `department.id` or `employments.division.id` in some accounts, but those are runtime repair branches, not classification features.
- Payroll tasks are not the same as employee-creation tasks: payroll prompts focus on an existing employee plus salary amounts, not a new employee profile.
- Payroll-related employee reads can show sparse `employments[]`; lack of expanded employment detail is not by itself proof that the task is unsupported.
- Payroll tasks may need manual salary lines and exact salary-type resolution; they are distinct from simple employee updates.
- Travel-expense tasks require explicit enough trip dates and per-diem detail to reach a deliverable expense.
- If a travel-expense prompt omits both explicit dates and `departureFrom`, the final correct state may be scorer-ambiguous rather than safely inferable.
- Travel-expense creation can accept an expense that is still incomplete for delivery; create-only success is not proof of a correct delivered expense.
- Travel-expense cost rows can require gross amount plus explicit VAT treatment, and per-diem rows can require a concrete rate type plus accommodation context.
- `PUT /travelExpense/:deliver` returns a list wrapper under `values[]`, not a single `value` object.
- Create-and-send invoice tasks and create-customer-invoice tasks are different: the former is usually one outgoing service-style invoice shape, while the latter may include multiple explicit lines or product references.
- Invoice tasks can turn on sending unintentionally; whether the invoice should be sent is task-defining.
- For create-and-send invoice prompts, the customer may need to be created first if the prompt reads like a fresh-account customer-plus-invoice request.
- For create-only customer invoice prompts, exact existing `productNumber` or exact product names are major classification cues.
- Parenthetical product references can be genuine Tripletex product numbers or just prompt-local references; if the meaning is unclear, that ambiguity matters to task understanding.
- `POST /invoice` or `POST /order` can succeed while returning sparse or link-only `orderLines[]`; sparse lines do not mean line creation failed.
- Direct invoice/order lines without a product still need correct VAT semantics; omitting VAT can silently produce a wrong no-VAT invoice.
- VAT wording matters: phrases like excluding VAT / `eksklusiv MVA` / `hors TVA` imply taxed ex-VAT amounts, while explicit no-VAT wording such as `uten MVA` or `ohne MwSt.` implies a different branch.
- In invoice and order flows, including-VAT and excluding-VAT fields must be internally consistent.
- Invoice creation can fail until the company invoice bank account is configured; a missing-bank-account validation error is a known conditional branch, not a task mismatch.
- Credit-note tasks are not payment-reversal tasks. Full credit notes use `:createCreditNote`; payment reversal reopens the invoice by reversing the payment voucher.
- For full credit-note prompts, the invoice is often located by customer organization number, exact ex-VAT amount, and exact line description.
- The same invoice line description can appear in both top-level `orderLines[]` and nested `orders[].orderLines[]`; treat that as one invoice, not automatic ambiguity.
- Customer invoice payment prompts are keyed by an unpaid invoice and usually identify it by customer organization number, exact ex-VAT amount, and exact service description.
- In customer invoice payment tasks, the prompt amount is often only a locate key; the actual paid amount comes from the invoice’s live outstanding balance.
- `paymentTypeId` is required for ordinary `PUT /invoice/{id}/:payment` flows.
- `GET /invoice/paymentType` can return usable incoming payment types even when `name=null`, `creditAccount=null`, or account numbers are numeric instead of strings.
- Reusing a `paymentTypeId` across different companies or runs is unsafe; it is account-specific context.
- Customer invoice payment reversal prompts use the same locate keys as payment prompts, but the goal is to reopen a paid invoice, not to create a credit note.
- On invoice reads, payment evidence may live under `postings`, not `payments`.
- A payment reversal must target the right voucher; some combined order-invoice-payment flows share voucher ids in ways that make naive reversal unsafe.
- Create-order-invoice-and-register-payment tasks are multi-step by definition and should not be confused with standalone payment registration on an already existing invoice.
- Some combined order-to-invoice flows can settle payment within the invoice step itself; that does not change the task family, only the runtime strategy.
- Project fixed-price milestone tasks are defined by project identity plus fixed-price amount and milestone amount or percentage.
- In fixed-price milestone tasks, the scored milestone amount should be compared with the invoice ex-VAT amount, not necessarily the outstanding total including VAT.
- If a project read already proves the desired fixed price and linked customer/manager, runtime may skip the project update; that does not change the task classification.
- Project-hour invoice tasks are defined by employee email, project, activity, hours, and customer-facing hourly rate.
- The activity read for project hours can expose `isChargeable`; `isChargeable=false` does not necessarily block the customer-facing invoice task.
- A non-chargeable activity can still allow time registration while leaving internal `hourlyRate=0`; invoice-side billing may still be produced through a separate project-linked order line.
- `projectChargeableHours` cannot exceed `24` in one time-entry write, and Tripletex allows only one time entry per employee + project + activity + date tuple.
- High-hour project prompts may require runtime date-splitting, but extraction should keep the full requested hour total intact.
- Public APIs do not expose a reliable write path for every internal project preliminary-invoice workflow; some project-invoice tasks are satisfied by hours plus a manual project-linked order line.
- Supplier-invoice tasks are not plain voucher tasks. A balanced voucher alone may fail to create a real supplier invoice object.
- The workable supplier-invoice branch typically uses supplier resolution/creation plus imported voucher flows, not `POST /incomingInvoice` on ordinary accounts.
- Supplier-invoice prompts are keyed by supplier identity, invoice number, gross amount, expense account, and VAT rate.
- If the prompt does not say the supplier already exists, fresh-account supplier-invoice prompts usually imply creation-first rather than lookup-first.
- For supplier-invoice VAT, the relevant lookup family is incoming VAT for the invoice date; a broader VAT catalog can expose unusable codes.
- Imported supplier-invoice XML must be structurally valid enough for Tripletex to recognize it; malformed minimal XML is not equivalent.
- In imported supplier-invoice updates, imported header fields such as invoice number or description can behave as effectively immutable after import.
- Free accounting dimension tasks are keyed by one new dimension name, new dimension values, one value to post against, ledger account, and amount.
- `dimensionIndex` must be reused from the created dimension-name object; it should not be guessed.
- `POST /ledger/accountingDimensionName` can fail because the account already uses all free-dimension slots; that is an account-state blocker, not a different task.
- `/ledger/accountingDimensionValue/list` is batch update, not batch create.
- Voucher posting tasks need real ledger account ids; number-only shorthand can fail validation.
- Ledger account numbers can come back as integers, so numeric normalization matters when extracting or disambiguating account references.
- Voucher postings to customer, supplier, or employee accounts can require the matching business object reference, not just the ledger account.
- Some correction prompts describe reversals rather than deletes. Distinguish delete/update/reverse semantics carefully during classification.
