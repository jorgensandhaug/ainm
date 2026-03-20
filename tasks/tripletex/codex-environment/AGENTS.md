# Tripletex Task Agent Instructions

## Mission
- Perform the exact requested side effects in Tripletex.
- Optimize for score, not explanation.
- Correctness first. Efficiency second.
- Task is complete only when final Tripletex state is correct.
- Finish the task within the `300s` timeframe

## Scoring
- Score is based on actual Tripletex side effects, not your text output.
- Correctness is normalized field-by-field from the expected output.
- Efficiency bonus applies only at perfect correctness.
- Efficiency bonus depends on:
  - low API call count (Important)
  - few or zero `4xx` errors (Make sure you know the API calls will work before running)
- Avoid trial-and-error. Every unnecessary call and every `4xx` hurts. (Verify the correct API call flow before running, this is MEGA important, this is often where alot of errors pile up)

## Operating Rules
- Work fully autonomously.
- Do not ask questions.
- Do not talk to the user.
- Do only the requested task. No extra work.
- Do not spend scored-run time on unrelated repo tooling or environment rituals unless the prompt explicitly requires them.
- Ignore generic repo-wide startup rituals such as `br list` during scored Tripletex runs unless the prompt explicitly asks for them.
- Assume a hard `300s` budget. Plan before calling APIs.
- Only interact with the Tripletex API by writing TypeScript and running it with `bun` (Important)
- The prompt provides a run-specific scripts directory.
- Put all API-interaction scripts only in that provided scripts directory.
- Do not place API-interaction scripts anywhere else.

## Environment Facts
- Real submissions use a fresh Tripletex account.
- Sandbox testing may use a persistent account.
- Prompts may be in `nb`, `en`, `es`, `pt`, `nn`, `de`, or `fr`.
- Files or images may be provided. Read them from disk before acting.
- Extract exact facts from attachments: names, dates, amounts, identifiers, relationships, requested actions.

## Credentials
The prompt provides:
- `Tripletex API base URL`
- `Tripletex session token`
- `Run scripts directory`

Authentication:
- Use Basic Auth.
- Username: `0`
- Password: provided session token.
- Always call the provided base URL.
- If the provided base URL already includes `/v2`, do not join endpoint paths with a leading slash in a way that escapes back to the host root; `new URL('/customer', baseUrl)` can silently turn `.../v2` into `/customer` and waste a `404`.
- Never switch to any default Tripletex URL and never look up online ever.
- If the provided base URL is obviously a placeholder or non-routable host such as `example.invalid`, or the token is obvious dummy text, treat the run as blocked by unusable credentials rather than by API-shape uncertainty.
- In that case, do not guess alternate hosts, do not swap in default Tripletex URLs, and do not burn time on extra API attempts or unrelated spec exploration.
- If both the host and token are obviously fake placeholders, it is acceptable to stop after local playbook/spec confirmation without attempting a doomed network call.
- If the first attempted call returns `403` with body `{"error":"Invalid or expired token"}`, treat the run as blocked by unusable credentials; do not spend more calls on alternate endpoints or auth variations.

## API Reference Strategy
- Knowledge order:
  1. `./trusted-standards/`
  2. `./task-playbooks/`
  3. `./openapi.json`
- Trusted standards are stricter than playbooks.
- Trusted standards are the canonical lowest-call, lowest-error, pre-verified flows for the most common task shapes.
- If the task is an exact or near-exact match for a trusted standard, use that trusted standard first.
- For an exact trusted-standard match, do not spend time re-checking `./openapi.json`.
- For exact trusted-standard matches, the anti-`4xx` rule is satisfied by following the trusted standard itself.
- Only fall back to `./openapi.json` if:
  - no trusted standard matches
  - the prompt materially differs from the trusted standard
  - the trusted standard explicitly tells you to confirm a detail
  - a live API response contradicts the trusted standard
- Use the common endpoints below first.
- These are common endpoints, not the only possible endpoints.
- Always confirm the exact method, path, query parameters, request body, and response shape in `./openapi.json` before calling, except for exact trusted-standard matches.
- Use `./openapi.json` as the full API reference.
- When multiple similarly named schemas exist, trust the schema directly referenced by the chosen endpoint operation, not another nearby/read-only customer-facing schema.
- Do not guess endpoint shapes, field names, request payloads, or delete/update paths, always verify.
- For exact-match playbook tasks, inspect `openapi.json` with narrow endpoint/schema extraction.
- Do not run broad keyword searches across the whole spec for common fields like `name`, `email`, or `organizationNumber` when the playbook already identifies the exact endpoint.

## Trusted Standards
- Before acting, check whether the task matches a trusted standard in `./trusted-standards/`
- If it matches exactly, execute the trusted standard directly
- For exact trusted-standard matches, do not double-check or triple-check `./openapi.json`; doing so wastes time and hurts score
- Trusted standards are intended to be safer than ad hoc spec-reading for their exact task shape
- If a trusted standard is incomplete, wrong, or no longer optimal, fix it during post-run reflection

| Task pattern | Trusted standard |
|---|---|
| Canonical common endpoints | `./trusted-standards/common-endpoints.md` |
| Create customer | `./trusted-standards/create-customer.md` |
| Create supplier | `./trusted-standards/create-supplier.md` |
| Create department | `./trusted-standards/create-department.md` |
| Create product | `./trusted-standards/create-product.md` |
| Create project | `./trusted-standards/create-project.md` |
| Set project fixed price and invoice partial payment | `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` |
| Register project hours and create project invoice | `./trusted-standards/register-project-hours-and-create-project-invoice.md` |
| Create employee | `./trusted-standards/create-employee.md` |
| Create free accounting dimension and book voucher | `./trusted-standards/create-free-accounting-dimension-and-book-voucher.md` |
| Create customer invoice | `./trusted-standards/create-customer-invoice.md` |
| Create customer invoice credit note | `./trusted-standards/create-customer-invoice-credit-note.md` |
| Create and send customer invoice | `./trusted-standards/create-and-send-customer-invoice.md` |
| Create order, invoice it, and register full payment | `./trusted-standards/create-order-invoice-and-register-payment.md` |
| Run employee payroll | `./trusted-standards/run-employee-payroll.md` |
| Register full payment on customer invoice | `./trusted-standards/register-customer-invoice-payment.md` |
| Reverse registered payment on customer invoice | `./trusted-standards/reverse-customer-invoice-payment.md` |
| Register supplier invoice | `./trusted-standards/register-supplier-invoice.md` |
| Register travel expense | `./trusted-standards/register-travel-expense.md` |

## Task Playbooks
- Before acting, check whether the task matches a playbook in `./task-playbooks/`
- If it matches, read that playbook first and use it to avoid rediscovering known Tripletex quirks and previous faults for similar tasks
- Playbooks are secondary to trusted standards
- If the prompt is an exact playbook match, keep pre-write exploration narrow: read the playbook, confirm the exact endpoint operation and referenced schema in `./openapi.json`, then execute

| Task pattern | Playbook |
|---|---|
| Create customer invoice | `./task-playbooks/create-customer-invoice.md` |
| Create customer invoice credit note | `./task-playbooks/create-customer-invoice-credit-note.md` |
| Create customer | `./task-playbooks/create-customer.md` |
| Create supplier | `./task-playbooks/create-supplier.md` |
| Create and send customer invoice | `./task-playbooks/create-and-send-customer-invoice.md` |
| Create order, invoice it, and register full payment | `./task-playbooks/create-order-invoice-and-register-payment.md` |
| Create department | `./task-playbooks/create-department.md` |
| Create employee | `./task-playbooks/create-employee.md` |
| Create product | `./task-playbooks/create-product.md` |
| Create project | `./task-playbooks/create-project.md` |
| Register project hours and create project invoice | `./task-playbooks/register-project-hours-and-create-project-invoice.md` |
| Create free accounting dimension and book voucher | `./task-playbooks/create-free-accounting-dimension-and-book-voucher.md` |
| Run employee payroll | `./task-playbooks/run-employee-payroll.md` |
| Set project fixed price and invoice partial payment | `./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md` |
| Register full payment on customer invoice | `./task-playbooks/register-customer-invoice-payment.md` |
| Reverse registered payment on customer invoice | `./task-playbooks/reverse-customer-invoice-payment.md` |
| Register supplier invoice | `./task-playbooks/register-supplier-invoice.md` |
| Register travel expense | `./task-playbooks/register-travel-expense.md` |

## Common Endpoints
- Exact common endpoint shapes live in `./trusted-standards/common-endpoints.md`.
- `/customer` and `/customer/{id}` — customer create/search/read/update/delete
- `/department`, `/department/{id}`, and `/department/list` — department create/search/update/delete/batch-create
- `/employee`, `/employee/{id}`, and `/employee/employment` — employee create/search/update and employment verification/create
- `/salary/type`, `/salary/transaction`, `/salary/transaction/{id}`, `/salary/payslip`, and `/salary/payslip/{id}` — salary-type lookup, payroll transaction create/read/delete, and payslip search/read
- `/product` and `/product/{id}` — product create/search/update/delete
- `/project` and `/project/{id}` — project create/search/update/delete
- `/order`, `/order/{id}`, and `/order/{id}/:invoice` — order create/search/update/delete and order-to-invoice
- `/invoice`, `/invoice/{id}`, `/invoice/{id}/:createCreditNote`, `/invoice/{id}/:payment`, `/invoice/{id}/:send`, and `/invoice/paymentType` — invoice create/search/read/full-credit-note/payment/send/payment-type lookup
- `/supplier` and `/supplier/{id}` — supplier create/search/read/update/delete
- `/travelExpense`, `/travelExpense/{id}`, `/travelExpense/cost`, `/travelExpense/perDiemCompensation`, `/travelExpense/costCategory`, and `/travelExpense/paymentType` — travel-expense create/search/update/delete plus child-line and lookup endpoints
- `/ledger/account` and `/ledger/account/{id}` — chart-of-accounts search/create/update/delete
- `/ledger/accountingDimensionName`, `/ledger/accountingDimensionName/{id}`, and `/ledger/accountingDimensionName/search` — free-dimension name create/search/read/update/delete
- `/ledger/accountingDimensionValue`, `/ledger/accountingDimensionValue/{id}`, `/ledger/accountingDimensionValue/list`, and `/ledger/accountingDimensionValue/search` — free-dimension value create/search/read/update/delete/batch-update
- `/ledger/posting` — ledger postings search/read
- `/ledger/voucher`, `/ledger/voucher/{id}`, and `/ledger/voucher/{id}/:reverse` — voucher search/create/update/delete/reverse

## Response Conventions
- List responses are typically wrapped as `{"values": [...], "fullResultSize": N}`.
- Single-object responses are typically wrapped as `{"value": {...}}`.
- Some successful writes or deletes may return `204 No Content`.
- Confirm exact response shape in `./openapi.json` before relying on it.

## API Usage Rules
- Parse the full prompt before making any API calls.
- Identify:
  - requested action
  - target entities
  - required fields
  - dates
  - amounts
  - relationships
  - prerequisites
- Plan the full dependency graph before the first API call. This is to ensure that things are created or edited in the right order.
- Determine which entities must exist before others can be created, updated, linked, reversed, paid, or deleted.
- Determine whether the task first requires enabling a module or feature before the main workflow can succeed. This may be very important.
- Choose the minimal correct API flow before acting.
- Fresh account means prerequisites often do not exist yet. Create them when needed, but if the prompt given states information about the environment you are to assume they exist and use that information, do not use unnecessary `GET`s.
- Do not add sandbox-idempotency reads to a scored run unless the prompt implies an update/delete/existing-object lookup problem.
- If task is update/delete/reverse, first locate the correct existing entity, unless specifically given the ID or information to delete or update in the prompt, then you should not use unnecessary requests to confirm.
- If you just created an object, reuse the returned ID. Do not fetch it again. Remember, the goal is as few API calls as possible for correct solution. Be efficient.
- After `POST` or `PUT`, always inspect and reuse the returned object data before considering any `GET`.
- Treat write responses as the primary source for IDs, linked objects, computed fields, and resulting state when they contain what you need.
- If the next step depends on the object you just created or updated, use the data from that write response instead of issuing a follow-up `GET`.
- Ideal read count is zero.
- If a read is required, aim to solve it with a single decisive `GET`, not several follow-up `GET`s.
- For reads, prefer `fields=*` unless a different shape is clearly required.
- Reason: `fields=*` helps avoid extra follow-up reads for the same entity.
- Use `count` and `from` for pagination when needed.
- Use search parameters to narrow candidates before reading more.
- Normalize prompt dates to ISO `YYYY-MM-DD` before writing to Tripletex. Prompts may mix language and month names.
- Before every write, confirm required fields and allowed payload shape in `./openapi.json`, except for exact trusted-standard matches.
- When referencing an existing related object, prefer `{ "id": ... }` if the schema supports it. Do not send large nested objects unless required.
- Preserve prompt-provided string fields exactly as written when they are part of the scored state. Do not transliterate or ASCII-normalize names, addresses, cities, emails, or other user-provided text.

## Execution Pattern
1. Parse the task completely.
2. Read any attachments and extract relevant facts.
3. Plan the dependency-aware API workflow from start to finish.
4. Create or locate prerequisites in the correct order.
5. Perform the required writes in the smallest correct sequence.
6. Reuse returned IDs and prior knowledge to avoid unnecessary reads.
7. Verify only the fields needed to prove correctness.
8. Stop when final state matches the request.

## Common Workflow Patterns
- Create single entity: one targeted `POST`.
- Create with linking: create or find prerequisites, then link by ID.
- Modify existing: locate exact target, then `PUT` the minimal correct update.
- Delete or reverse: locate exact target, then use the exact delete/reversal endpoint from `./openapi.json`.
- Multi-step accounting flow: do prerequisite resources first, then final scored object.
- When several valid flows are possible, choose the one with the fewest calls, the least ambiguity, and the lowest risk of `4xx` errors.

## Error Handling
- Prevent errors before calling, always verify your requests correctness and logic.
- If by chance a call fails, read the error body carefully.
- Many `422` responses keep a generic top-level `message` such as `Validering feilet.` while the decisive branch condition is only inside `validationMessages[]`; read those detailed validation messages before choosing a repair path.
- Use Tripletex validation details to make only one precise correction if possible.
- Do not loop through guesses.
- Do not keep retrying the same invalid shape.
- `401` usually means wrong auth format or wrong token.
- `403` with `Invalid or expired token` usually means the provided session token is unusable for this run, not that the endpoint or payload is wrong.
- `404` usually means wrong path, wrong ID, or wrong endpoint choice.
- `422` usually means validation failure or missing required fields.
- A network/DNS failure before any HTTP status usually means the provided base URL is unusable in this run, not that the request payload is wrong.

## Tripletex Gotchas
- Department create tasks do not need a pre-read in the normal case, and multi-department prompts should usually use `POST /department/list` instead of repeated `POST /department` calls.
- `POST /department/list` can return a successful batch-create wrapper with `values[]` populated while top-level list metadata still shows `fullResultSize=0`; for create verification, trust `values[]` plus the returned department fields, not `fullResultSize`.
- In invoice flows, avoid unintended sending. If task is to create/register an invoice and not send it, ensure the payload does not trigger customer sending.
- For create-and-send customer-invoice tasks, the lowest-call default is usually `POST /invoice` with the default `sendToCustomer=true`; do not automatically split this into `POST /invoice?sendToCustomer=false` plus `PUT /invoice/{id}/:send`.
- If `PUT /order/{id}/:invoice` fails with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`, do one conditional repair branch: `GET /ledger/account?isBankAccount=true&fields=*`, update the existing invoice bank account under `/ledger/account/{id}` (usually `1920` / `isInvoiceAccount=true`) with a valid unique 11-digit `bankAccountNumber`, then retry the same order invoice once; do not create a second order or project.
- In fresh-account runs where `PUT /order/{id}/:invoice` is likely the first outgoing invoice of the run, a proactive `GET /ledger/account?isBankAccount=true&fields=*` is only a situational hedge against the missing-company-bank-account `422`, not the canonical exact order-to-invoice-to-payment fast path. Keep the 6-call default unless the run already gives strong reason to expect that bank-account validation branch; if you do take the hedge and the chosen invoice account already has a `bankAccountNumber`, skip the repair and reuse the same order write.
- A successful `PUT /order/{id}/:invoice` can still return `orders[]` with sparse or null nested `project` data; do not spend a default `GET /invoice/{id}` just to prove linkage unless the prompt explicitly scores linked fields that the write response omits or later workflow depends on them.
- In invoice and order flows, VAT amount mode fields must be internally consistent. Do not mix including-VAT and excluding-VAT fields incorrectly.
- In invoice payment tasks, the prompt may identify the invoice by an excluding-VAT line amount, but the payment write still needs the current outstanding invoice balance from the invoice object. Locate by the prompt identifiers, then pay `amountCurrencyOutstanding` or `amountOutstanding`, not the prompt's lookup amount.
- `POST /invoice` can succeed while returning `orderLines` only as link objects (`id`/`url`). Do not treat that sparse write response as evidence that line creation failed; if exact line-level verification is needed, do one immediate `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`.
- A `POST /invoice` response that shows the expected `orderLines.length` can still be sparse link-only data. Do not attempt exact line verification from that object unless each returned line already includes the scored fields you need, such as `product.number`, `description`, `unitPriceExcludingVatCurrency`, and `vatType.percentage`.
- For create-only customer invoice tasks with existing products, the default fast path is usually `GET /customer`, `GET /product`, then `POST /invoice`. Do not spend an automatic `GET /ledger/account` unless the prompt or a prior validation error already shows bank-account repair is needed.
- For create-only customer invoice tasks where the prompt clearly gives exact existing product numbers, prefer one decisive `GET /product?productNumber=<a>&productNumber=<b>...&fields=*` over a broad catalog read; only switch to `GET /product?count=1000&fields=*` when the parenthetical refs are unclear semantics or the direct numeric search returns an incomplete/ambiguous subset.
- Even when parenthetical refs look like ordinary product numbers, do not treat them as proven Tripletex lookup keys if the prompt also gives exact product names; the 2026-03-20 production run for `851635874` + `Analyserapport` / `Datarådgivning` / `Nettverkstjeneste` lost the efficiency point because a speculative `GET /product?productNumber=2934&productNumber=8699&productNumber=1355` missed one line and the broader fallback happened only after a script restart. The lower-call path for that shape is one decisive `GET /product?count=1000&fields=*`, then `GET /ledger/vatType`, then `POST /invoice`, with the fallback kept inside the same script.
- `POST /order` can create embedded `orderLines` even when the `201` response echoes `orderLines=[]`; do not assume line creation failed from that response alone. If decisive pre-invoice verification is needed, use one targeted `GET /order/{id}?fields=*,orderLines(*)`; otherwise prefer reusing the later invoice response instead of branching into unnecessary rewrites.
- For create-invoice or create-order tasks where the prompt shows exact product names plus parenthetical numeric refs of unclear semantics, do not spend both `GET /product?productNumber=...` and `GET /product?ids=...` by default. The lower-call default is one decisive `GET /product?count=1000&fields=*` and local filtering by exact product `number` and/or exact product `name`.
- In that same ambiguous-product-ref flow, only fall back to `GET /product?productNumber=...` and then `GET /product?ids=...` if the catalog read is ambiguous, truncated for the account, or the prompt does not give exact product names. Do not let an approximate name-only match count as resolution for a missing product.
- If a first product resolver still misses one line, do not abort and rerun the whole script; keep the broader resolver as an in-script callback/fallback branch and reuse the already-resolved customer id and any other safe prior results.
- For invoice and order-line VAT selection, resolve `vatType` from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` on the actual invoice date. Do not hardcode VAT code `3`; some accounts only expose code `6` (0% outgoing VAT), and `POST /invoice` can fail with `Ugyldig mva-kode.` if you use a code outside the filtered result set.
- For create-only invoice tasks, do not let a local arithmetic/assertion mistake after a successful `POST /invoice` trigger a retry or duplicate invoice. Recheck the VAT math first and treat the write response as primary evidence of the created state.
- For simple direct invoice/order lines without a product, do not omit `orderLines[].vatType` just to save the VAT lookup when the prompt implies a taxable service. Persistent sandbox on 2026-03-20 accepted that lower-call write but created a no-VAT invoice (`amountCurrency == amountExcludingVatCurrency`), so the filtered outgoing VAT read is still part of the minimum safe path.
- Customer creation may require invoice delivery settings and address details. If EHF-style delivery is implied or defaulted, missing postal address can fail validation.
- For ordinary supplier-invoice tasks phrased as invoice from `the supplier <name>`, do one decisive `GET /supplier?organizationNumber=...&fields=*` first. The 2026-03-20 production miss for `Brightstone Ltd` showed that direct `POST /supplier` can create a duplicate and book the voucher against the wrong supplier even when the accounting postings are otherwise correct.
- In that same supplier-invoice shape, if the supplier lookup returns one exact hit, reuse it and keep the path at `5` calls; only `POST /supplier` when the lookup returns zero hits. If the lookup returns several hits, continue only when exact `organizationNumber` plus exact `name` leaves one unique supplier, otherwise treat the run state as ambiguous.
- For the exact standard Norwegian create-customer shape with prompt-provided `name`, `email`, and `organizationNumber`, the canonical minimal path is one `POST /customer`; do not add `GET /customer`, `GET /customer/{id}`, or speculative invoice-delivery fields unless the prompt explicitly requires them.
- In standard customer creation tasks with one ordinary address, prefer `postalAddress` (`addressLine1`, `postalCode`, `city`) and do not also invent `physicalAddress` unless the prompt explicitly asks for a separate physical/visiting address.
- `POST /customer` can still return a sparse `physicalAddress` link object even when you sent only `postalAddress`. Do not treat that as evidence that the prompt required a separate visiting address, and do not spend a follow-up `GET` just to inspect it.
- In standard customer creation tasks with one generic prompt email, map it to `email`; do not also populate `invoiceEmail` unless the prompt explicitly asks for an invoice/billing email.
- Treat localized generic email labels such as `Correo` the same as `Email`/`E-post` in create-customer tasks; they still map to `email`, not `invoiceEmail`.
- If using a foreign organization number, country/address fields may need to be set consistently.
- Product creation with VAT should resolve `vatType` from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`, not from the unfiltered VAT catalog or `typeOfVat=LEDGER`; broader lists can expose codes that still fail `POST /product` with `Internt felt (vatTypeId): Ugyldig mva-kode.`
- For the exact create-one-product shape with prompt-provided `name`, `number`, one exact price field, and one exact VAT percentage, the canonical path is two API calls: filtered outgoing VAT read, then `POST /product`; do not add `GET /product`, `GET /product/{id}`, or an `openapi.json` re-check once the trusted standard already matches.
- `POST /product` without `vatType` can succeed in some sandbox accounts by auto-filling an account default VAT type; do not treat that as a trusted shortcut for scored exact-VAT tasks.
- If the requested product VAT percentage is absent from that filtered `OUTGOING` result on the task date, treat the product-create task as blocked in that account; do not try a same-percentage code from the broader VAT catalog.
- For product VAT selection, do not filter away base VAT codes by requiring `parentType` to be missing; standard code `3` (`25% Utgående avgift, høy sats`) still has `parentType.id=0`.
- For exact `0%` product prompts such as books, do not search for a special book-only VAT endpoint or hardcode one sandbox's `0%` code; still choose the matching `0%` row from the filtered `OUTGOING` result in the current account.
- For exact create-only employee tasks, do not default to `GET /department` before the first `POST /employee`; scored production feedback on 2026-03-20 showed that pre-read can lose the call-efficiency bonus on accounts that accept the initial write without department repair.
- Employee creation may require a department if department functionality is enabled in the account; when the initial create fails on `department.id`, do one decisive `GET /department?isInactive=false&count=1&fields=*`, and only `POST /department` if that repair read proves no active department exists.
- Employee creation may also require explicit `userType`, and the `POST /employee` success response may echo `userType: null` plus `employments` entries with only `id`/`url`, not the submitted `startDate`.
- Employee creation can also fail on `employments.division.id`; if validation says the employment must be tied to a business/sub-entity, resolve one existing `/division?count=1&fields=*` and reuse that `division.id` instead of guessing.
- If employee start date is scored, plan one decisive `GET /employee/employment?employeeId=...&fields=*` unless the create response unexpectedly includes the actual `startDate`.
- Payroll runs through `POST /salary/transaction` require a payroll-ready employee. One decisive `GET /employee?email=...&fields=*` should confirm at least `dateOfBirth` plus an employment covering the target period before the salary write. If that first employee read already shows `dateOfBirth=null`, stop immediately; do not spend `/employee/employment`, `/salary/type`, `/salary/settings`, or company-module reads unless a later live permission error proves a missing feature branch instead of a missing employee prerequisite.
- `GET /employee?fields=*` can still return `employments[]` as sparse stubs with null `startDate`, null `division`, and empty-looking `employmentDetails[]`; if `dateOfBirth` is present but the payroll-period check is still ambiguous, do one conditional `GET /employee/employment?employeeId=...&fields=*` before treating the run as blocked or ready.
- `GET /employee/employment?employeeId=...&fields=*` can expand `startDate` and `division.id` while `employmentDetails[]` and `latestSalary` remain partly sparse; do not spend an automatic `GET /employee/employment/details` when active employment plus division-backed payroll setup is already clear enough to proceed.
- For payroll tasks with manual salary lines, resolve salary types from `GET /salary/type?count=1000&fields=*` and use embedded `payslips[].specifications[]` on `POST /salary/transaction`. In accounts without department accounting, omitting `department` from that salary payload avoids `422 department: Selskapet har ikke aktivert avdelingsregnskap.`
- Do not add speculative salary-feature activation or `/salary/settings` preflight reads to an exact payroll run. Persistent sandbox re-verification on 2026-03-20 showed the standard employee-read -> optional employment-read -> salary-type-read -> salary-write path succeeds directly when employee prerequisites are present.
- When a successful `POST /salary/transaction` response is too sparse, the decisive verification branch is `GET /salary/transaction/{id}?fields=*` to get payslip ids, then `GET /salary/payslip/{id}?fields=*` for gross/net amounts and specification count.
- `GET /salary/payslip/{id}?fields=*` can still keep `specifications[]` as link-only objects; for exact manual-line verification use `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))`.
- Project creation may require `startDate` even though the `Project` schema does not clearly mark it as required. Project manager assignment is also validated: a plain employee match may still be ineligible, so prefer resolving managers with `assignableProjectManagers=true`.
- For exact create-project tasks with an existing customer identified by organization number and an existing project manager identified by email, the low-call path is usually `GET /customer?organizationNumber=...&count=10&fields=*`, `GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*`, then `POST /project`; keep exact uniqueness checks local instead of adding more reads.
- In that exact create-project flow, do not make prompt `customer.name` or manager name a hard requirement after the filtered reads already leave one exact `organizationNumber` hit and one exact `email` hit; use names only as local tie-breakers for multi-hit cases.
- If a create-project prompt omits `startDate`, default `startDate` to the run date in ISO format; sandbox create succeeded on `2026-03-20` with that default.
- For project-linked task shapes where the prompt gives project name plus customer identifiers, `GET /project?name=...&count=50&fields=*,customer(*)` can often resolve both the project and the linked customer in one read; do not default to a separate `GET /customer` if that expanded project read already leaves one exact match.
- For project-hour billing tasks, switch the project hourly-rate holder with `PUT /project/hourlyRates/{id}` and then create the employee+activity rate with `POST /project/hourlyRates/projectSpecificRates`; sending embedded `projectSpecificRates[]` inside the holder `PUT` is not the proven rate-write path.
- `POST /project/hourlyRates/projectSpecificRates` rejects non-chargeable activities with `422 activity.id: Ikke fakturerbar.`.
- `POST /timesheet/entry` on a non-chargeable project activity can still succeed even with `projectChargeableHours`, but the write response keeps `chargeable=false` and `hourlyRate=0`.
- Do not treat that non-chargeable timesheet response as an automatic stop condition when the prompt only scores the requested hours side effect plus the customer-facing invoice side effect; the scoring-first fallback is still the time write plus one manual project-linked order line and normal invoicing.
- Only treat the non-chargeable branch as blocked when the prompt explicitly scores internal timesheet billability (`chargeable=true`, `hourlyRate=<prompt rate>`) or true project-hour reserve consumption.
- `PUT /timesheet/week/:approve` can return `403` even for the token owner; do not make week approval a default prerequisite for project-hour invoice tasks.
- `GET /project/{id}/period/invoicingReserve` can show a positive reserve even while `GET /project/{id}/period/hourlistReport` reports the hours as `nonApprovedHours`; that reserve is not proof that the public API can actually invoice those hours.
- Public re-verification on 2026-03-20 showed no working public write path that flips a project preliminary invoice to `includeHours=true`: project-linked `POST /order` or `POST /invoice` without real order lines still fail charging, nested writable-looking `preliminaryInvoice.projectInvoiceDetails[].includeHours=true` is ignored, and `PUT /invoice/{id}` / `PUT /invoice/details/{id}` are method-not-allowed.
- For practical unsent project-invoice tasks where scoring is based on final invoice totals and project linkage rather than actual time-reserve consumption, the proven public fallback is: register the hours separately, then create one real project-linked order line from prompt hours x prompt rate and invoice that order once.
- For fixed-price project partial-billing tasks, do not assume `PUT /order/{id}/:invoice?...createOnAccount=...` can invoice an order with no real order lines; sandbox returned `422` with `Fakturaen inneholder ingen ordrelinjer.`. The safer path is one real project-linked order line for the partial amount, then normal `:invoice` without `createOnAccount`.
- In that fixed-price partial-billing flow, `POST /order` may still echo `orderLines=[]` even when the embedded line was created. If the invoice write response does not already prove the project link, one targeted `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)` can confirm both the line and `orders[0].project.id`.
- If such a task requires creating the customer and the prompt gives no delivery/contact details, prefer `invoiceSendMethod: "MANUAL"` instead of inventing email or address fields.
- In the create-and-send variant of that task shape, do not treat later `PUT /invoice/{id}/:send?sendType=MANUAL` as a trusted fallback; persistent sandbox reproduced `500` on 2026-03-20, while the same customer shape succeeded through `POST /invoice` with default send behavior.
- For that same no-email/no-address customer shape, sparse customer address links are not proof that `PAPER` is available, and organization number alone is not proof that `EHF` is available.
- For customer invoice payment tasks, `GET /invoice` can often locate the exact outgoing invoice in one read if you request `customer(*)`, `orderLines(*)`, and `orders(*,orderLines(*))` and filter locally by organization number, ex-VAT amount, and prompt text such as a service description. The payment write is `PUT /invoice/{id}/:payment`, and the write response can usually verify `amountOutstanding=0` without a follow-up `GET`.
- For full outgoing customer-invoice credit-note tasks, use `PUT /invoice/{id}/:createCreditNote`, not manual negative invoices, voucher reversals, or guessed `:credit` paths.
- Those full-credit-note tasks are already minimal at two calls when the prompt gives only organization number, ex-VAT amount, and service description: one decisive `GET /invoice?invoiceDateFrom=...&invoiceDateTo=...&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` to identify the exact uncredited invoice, then `PUT /invoice/{id}/:createCreditNote?date=...&sendToCustomer=false`; only reduce to one call when the prompt already gives the exact invoice id.
- If such a credit-note prompt gives no invoice date, prefer one wide but bounded locate window such as `invoiceDateFrom=2000-01-01` and `invoiceDateTo=<run-date-plus-one-day>` instead of spending a separate resolver read.
- On `GET /invoice?fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`, the same invoice-line description can appear in both top-level `orderLines[]` and nested `orders[].orderLines[]` for one invoice. Treat that as two views of one invoice, not as locate ambiguity by itself.
- For outgoing customer invoice payment-reversal tasks, `GET /invoice` exposes payment voucher candidates under `postings`, not `payments`; `fields=...payments(...)` can fail with `400 Illegal field in fields filter: payments ... InvoiceDTO`. On exact-match scored runs, the winning path is usually one decisive `GET /invoice` to isolate the payment voucher, then `PUT /ledger/voucher/{id}/:reverse`, then stop. Only add a final `GET /invoice` when the prompt explicitly requires balance proof or the locate read left material ambiguity. Also, do not rely only on `posting.type`: the payment posting can be `type=null`, and the correct fallback is often the unique negative `1500` customer-ledger posting with payment text such as `Betaling: ...`.
- In those same outgoing payment-reversal tasks, a prompt ex-VAT amount can be only a locate key. After the first invoice read, capture the invoice object's own pre-reversal total (`amountCurrency` or `amount`) and verify the reopened outstanding amount against that value, not against the prompt lookup amount.
- `GET /invoice/paymentType` can return `debitAccount.number` and `creditAccount.number` as numeric values, not strings. Normalize before applying string-prefix heuristics such as `19xx` bank account or `15xx` customer ledger checks.
- `GET /invoice/paymentType` can also return perfectly usable incoming payment types with `creditAccount=null`. Do not reject `Betalt til bank` just because there is no `15xx` credit account in the response; prefer a payment type whose debit account is `19xx` and marked `isBankAccount=true` or `isInvoiceAccount=true`.
- `paymentTypeId` on `PUT /invoice/{id}/:payment` is actually required for ordinary first-time payment registration; persistent sandbox re-check on 2026-03-20 returned `422 paymentTypeId: Kan ikke være null.` when it was omitted. There is no proven public 2-call standalone shortcut from invoice read alone.
- For invoice-payment tasks, cache and reuse a valid incoming `paymentTypeId` only within the same run and same company/currency context. Do not persist that cache across runs or accounts; successful ids varied across production runs and sandbox.
- If a multi-step order/invoice/payment flow already created the order and invoice but failed before payment registration, do not restart from `POST /order`. Resume by locating the unpaid invoice with one decisive `GET /invoice` and finish the payment on that existing invoice.
- Some tasks may require enabling a module or feature before later entity operations can succeed.
- Travel-expense create tasks can use one embedded `POST /travelExpense` for the parent expense plus cost/per-diem lines, but embedded `costs[]` require `amountCurrencyIncVat` even when `amountNOKInclVAT` is present.
- In that same embedded travel-expense flow, `perDiemCompensations[]` can fail with `Kun kostnader kan registreres uten kompensasjon etter satser.` unless `travelDetails.isCompensationFromRates=true`.
- Standard travel-expense create does not need an explicit `department` payload field when the linked employee already belongs to a department; Tripletex can inherit it from the employee.
- The old 4-call travel-expense fast path (`GET /employee`, `GET /travelExpense/costCategory`, `GET /travelExpense/paymentType`, `POST /travelExpense`) is not a trusted full-correctness path for multi-day per-diem tasks. It can persist an `OPEN` expense whose per-diem row still has `rateType=null`, `rateCategory=null`, and `overnightAccommodation=NONE`.
- For deliverable multi-day per-diem travel-expense tasks, resolve a live `rateType` from `GET /travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=...&dateTo=...&count=1000&fields=*`, send `travelDetails.departureFrom`, explicit cost `vatType`, and `perDiemCompensations[].overnightAccommodation`, then use `PUT /travelExpense/:deliver`.
- That filtered `GET /travelExpense/rate?...fields=*` response can still keep `rateCategory` sparse as only `id`/`url`; do not locally require `rateCategory.isValidDomestic` or spend `GET /travelExpense/rateCategory/{id}` just to recover those booleans.
- When the prompt omits `departureFrom`, only infer it from one concrete employee-address field already returned by `GET /employee`, preferring `address.city`, then `address.addressLine1`, then `address.displayName`; do not invent generic placeholders such as `Hjemsted`.
- `PUT /travelExpense/:deliver` can fail even after a successful create. Re-verified sandbox failures included missing `travelDetails.departureFrom`, missing `perDiemCompensations[].rateType`, and non-zero `costs[].vatType` on a non-VAT-registered company.
- `POST /travelExpense` and `GET /travelExpense/{id}?fields=*` can both return `costs[]` and `perDiemCompensations[]` as link-only `id`/`url`; use `GET /travelExpense/cost?travelExpenseId=...&fields=*` and `GET /travelExpense/perDiemCompensation?travelExpenseId=...&fields=*` only as a conditional investigation branch when expanded child fields are genuinely needed or the write response contradicts the intended child counts.
- Do not use top-level travel-expense `amount` or `paymentAmount` as proof that per diem was modeled correctly; sandbox kept those totals limited to reimbursable cost lines even after successful `:deliver`.
- Do not default supplier-invoice registration to `POST /incomingInvoice`; follow-up verification on 2026-03-20 showed that endpoint can fail with `403 You do not have permission to access this feature.` on an ordinary account even when generic ledger-voucher booking is allowed.
- For the exact fresh-account supplier-invoice booking shape with one prompt-provided supplier identity, start with direct `POST /supplier`; do not spend `GET /supplier?...` unless the prompt explicitly indicates an existing-supplier lookup problem.
- For the exact standard supplier-create shape with prompt-provided `name`, generic `email`, and `organizationNumber`, the canonical minimal path is one `POST /supplier`; do not add `GET /supplier`, `GET /supplier/{id}`, `invoiceEmail`, or speculative address fields unless the prompt explicitly requires them.
- If that exact supplier-create write returns `403` with `Invalid or expired token`, treat the run as blocked by credentials and stop; do not burn calls on `/supplier` reads or auth-shape guesses.
- `POST /supplier` can still return sparse `postalAddress` and `physicalAddress` link objects even when you sent no address fields. Do not treat that as evidence that the prompt required addresses, and do not spend a follow-up `GET` just to inspect them.
- In standard supplier creation tasks with one generic prompt email, map it to `email`; do not also populate `invoiceEmail` unless the prompt explicitly asks for an invoice/billing email.
- In the supplier-invoice fast path, `POST /supplier` can already return the supplier ledger account id. Reuse `supplier.ledgerAccount.id` for the `2400` liability posting instead of spending an extra `GET /ledger/account?number=2400`.
- For supplier-invoice registration through `POST /ledger/voucher`, resolve VAT from `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=...&fields=*`, not `INCOMING_INVOICE`; the standard deductible 25% code can be present in `INCOMING` while missing from `INCOMING_INVOICE`.
- For `POST /ledger/voucher`, do not send `amountVat` even though nearby schemas/documentation mention it; sandbox mapping rejected that field on 2026-03-20. Send `amount`, `amountCurrency`, `amountGross`, and `amountGrossCurrency` and let Tripletex generate the VAT posting.
- In that supplier-voucher flow, place the vendor invoice number on the supplier liability posting as `invoiceNumber`; sending root-level `voucher.vendorInvoiceNumber` did not persist it in sandbox verification.
- If a supplier-invoice prompt omits both invoice date and due date, use the run date for voucher `date` and supplier-posting `termOfPayment`; do not spend extra reads trying to infer dates the prompt did not give.
- `POST /ledger/voucher` can return supplier-invoice postings with enough ids and amounts to prove the fast path, while linked human-readable fields such as `account.number`, `vatType.number`, and `supplier.organizationNumber` stay sparse. Verify the write response by ids plus amounts first; only spend `GET /ledger/voucher/{id}?fields=*` when the scored task specifically needs expanded linked fields.
- Free accounting dimension create tasks can use `POST /ledger/accountingDimensionName` followed by one `POST /ledger/accountingDimensionValue` per value. Persistent sandbox verification on 2026-03-20 showed that `AccountingDimensionValue.number` and `position` can be omitted, `dimensionIndex` must be reused from the create response instead of assuming `1`, and `dimensionName` is validated at max length `20`.
- `POST /ledger/accountingDimensionName` can also fail with `422` and validation message `Maximum of 3 accounting dimensions allowed` when all three free-dimension slots are already occupied. In a create-only task, treat that as blocked by account state rather than burning calls on speculative update/delete/reuse flows.
- `/ledger/accountingDimensionValue/list` is `PUT` batch update, not batch create. For a new free-dimension task with two prompt-provided values, there is no trusted four-call batch-create shortcut; the minimal safe path still needs one `POST /ledger/accountingDimensionValue` per new value.
- For manual voucher tasks, do not assume `account: { "number": "7000" }` or another ordinary ledger number such as `6590` or `6860` is enough on `POST /ledger/voucher`; persistent sandbox returned `422 postings.account.name: Kan ikke være null.` on 2026-03-20. Resolve voucher account ids with one decisive `GET /ledger/account?number=...&fields=*` and use `account: { "id": ... }`.
- `GET /ledger/account?number=...&fields=*` returns `account.number` as an integer, not a string. If you filter locally, compare numerically or you can falsely conclude the target account is missing and waste recovery reads or reruns.
- For manual vouchers that only score one target ledger-account posting and do not specify the balancing account, a simple two-line voucher against existing bank account `1920` succeeded in persistent sandbox on 2026-03-20.
- Ledger and voucher postings to customer, supplier, or employee accounts may require the matching object reference, not just the ledger account.
- Some corrections are reversals or credit flows, not hard deletes. Confirm exact correction path in `./openapi.json` before acting.

## Verification Rules
- Verify after every meaningful write.
- Verify the scored state completely enough to prove correctness.
- Default to `fields=*` on verification reads unless a different shape is clearly better.
- Confirm exact values, not just existence.
- If task asked for linking, verify the relationship too.
- Return success only when the requested state is actually present.

## Efficiency Rules
- Fewer calls is better. IT IS MANDATORY THAT YOU COMPLETE THE TASK IN THE THEORETICALLY MINIMAL POSSIBLE NUMBER OF API CALLS! THIS IS THE THING TO OPTIMIZE FOR SECONDARY ONLJ AFTER TASK COMPLETION
- Zero `4xx` is ideal.
- YOU HAVE TO BE QUICK, DON'T DO UNNECESSARY THINGS. YOU HAVE 300 SECONDS.
- Plan before calling.
- Do not browse the API randomly.
- Once a playbook already gives the likely winning path, do not spend time on unrelated repo tooling or broad schema enumeration before the write.
- Once a trusted standard already gives the exact winning path, execute it directly and do not inspect `./openapi.json`.
- If an exact-match create playbook applies, confirm only the endpoint operation plus the referenced write schema, then execute.
- For those exact-match create tasks, prefer anchored reads of the exact path block and referenced schemas over noisy whole-file `rg` sweeps.
- Ideal is zero reads when not needed.
- If a read is needed, prefer one decisive `GET ?fields=*` over multiple narrower `GET`s on the same object.
- Do not do a second `GET` for fields you could have received in the first one.
- Do not do a `GET` after a successful `POST` or `PUT` if the response already contains the data needed for the next step.
- Do not re-fetch data you already know from prior responses.
- Fix errors from their message, not from repeated experimentation.
