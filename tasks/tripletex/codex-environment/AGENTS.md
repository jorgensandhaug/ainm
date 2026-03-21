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
- If the provided base URL ends at `/v2` without a trailing slash, `new URL('supplier', baseUrl)` can also drop the `/v2` segment; either append the slash first or build paths with safe string concatenation such as ``${baseUrl.replace(/\/+$/, "")}/supplier``.
- Never switch to any default Tripletex URL and never look up online ever.
- If the provided base URL is obviously a placeholder or non-routable host such as `example.invalid`, or the token is obvious dummy text, treat the run as blocked by unusable credentials rather than by API-shape uncertainty.
- In that case, do not guess alternate hosts, do not swap in default Tripletex URLs, and do not burn time on extra API attempts or unrelated spec exploration.
- If both the host and token are obviously fake placeholders, it is acceptable to stop after local playbook/spec confirmation without attempting a doomed network call.
- If the first attempted call returns `403` with body `{"error":"Invalid or expired token"}`, treat the run as blocked by unusable credentials; do not spend more calls on alternate endpoints or auth variations.
- Treat the proxy-specific `403` body `{"error":"Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.","source":"nmiai-proxy"}` the same way: blocked credentials, stop immediately, no alternate endpoint/auth guesses.

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
| Onboard employee | `./trusted-standards/onboard-employee.md` |
| Set project fixed price and invoice partial payment | `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` |
| Register project hours and create project invoice | `./trusted-standards/register-project-hours-and-create-project-invoice.md` |
| Create employee | `./trusted-standards/create-employee.md` |
| Create free accounting dimension and book voucher | `./trusted-standards/create-free-accounting-dimension-and-book-voucher.md` |
| Register receipt expense voucher | `./trusted-standards/register-receipt-expense-voucher.md` |
| Create customer invoice | `./trusted-standards/create-customer-invoice.md` |
| Create customer invoice credit note | `./trusted-standards/create-customer-invoice-credit-note.md` |
| Create and send customer invoice | `./trusted-standards/create-and-send-customer-invoice.md` |
| Create order, invoice it, and register full payment | `./trusted-standards/create-order-invoice-and-register-payment.md` |
| Run employee payroll | `./trusted-standards/run-employee-payroll.md` |
| Register full payment on customer invoice | `./trusted-standards/register-customer-invoice-payment.md` |
| Register foreign-currency payment on customer invoice | `./trusted-standards/register-foreign-currency-customer-invoice-payment.md` |
| Book reminder fee, invoice it, and register partial payment on overdue invoice | `./trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md` |
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
| Onboard employee | `./task-playbooks/onboard-employee.md` |
| Create product | `./task-playbooks/create-product.md` |
| Create project | `./task-playbooks/create-project.md` |
| Register project hours and create project invoice | `./task-playbooks/register-project-hours-and-create-project-invoice.md` |
| Create free accounting dimension and book voucher | `./task-playbooks/create-free-accounting-dimension-and-book-voucher.md` |
| Register receipt expense voucher | `./task-playbooks/register-receipt-expense-voucher.md` |
| Run employee payroll | `./task-playbooks/run-employee-payroll.md` |
| Set project fixed price and invoice partial payment | `./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md` |
| Register full payment on customer invoice | `./task-playbooks/register-customer-invoice-payment.md` |
| Register foreign-currency payment on customer invoice | `./task-playbooks/register-foreign-currency-customer-invoice-payment.md` |
| Book reminder fee, invoice it, and register partial payment on overdue invoice | `./task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md` |
| Reverse registered payment on customer invoice | `./task-playbooks/reverse-customer-invoice-payment.md` |
| Register supplier invoice | `./task-playbooks/register-supplier-invoice.md` |
| Register travel expense | `./task-playbooks/register-travel-expense.md` |

## Common Endpoints
- Exact common endpoint shapes live in `./trusted-standards/common-endpoints.md`.
- `/customer` and `/customer/{id}` — customer create/search/read/update/delete
- `/company` and `/company/{id}` — company update/read
- `/department`, `/department/{id}`, and `/department/list` — department create/search/update/delete/batch-create
- `/employee`, `/employee/{id}`, `/employee/employment`, and `/employee/employment/details` — employee create/search/update plus employment and employment-details create/search
- `/division` and `/division/{id}` — division search/create/read/update/delete
- `/salary/settings/standardTime` and `/salary/settings/standardTime/byDate` — company standard-worktime create/search/effective-date lookup
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
- `403` with `Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.` also means the run is blocked by unusable credentials, not by API-shape uncertainty.
- `404` usually means wrong path, wrong ID, or wrong endpoint choice.
- `422` usually means validation failure or missing required fields.
- A network/DNS failure before any HTTP status usually means the provided base URL is unusable in this run, not that the request payload is wrong.

## Tripletex Gotchas
- For the exact fresh-account create-customer shape `name + Norwegian organizationNumber + one generic email + optional one ordinary mailing address`, the canonical path remains one `POST /customer` even when the prompt prose is French, German, or Spanish; the 2026-03-20 production French run for `Colline SARL` (`939137599`, `post@colline.no`, `Kirkegata 77`, `4611`, `Kristiansand`), the same-day production Spanish run for `Río Verde SL` (`919234830`, `post@rio.no`, `Solveien 5`, `4006`, `Stavanger`), and same-day persistent-sandbox proof `Río Verde Reflection 017503 AS` (`999017503`) all succeeded with that single write and no follow-up read.
- Department create tasks do not need a pre-read in the normal case, and multi-department prompts should usually use `POST /department/list` instead of repeated `POST /department` calls.
- Prompt language does not change that department-create path; the 2026-03-20 production German three-department run, the same-day production Norwegian runs for `HR`, `Salg`, and `Økonomi` and for `Lager`, `Regnskap`, and `Kvalitetskontroll`, plus same-day persistent-sandbox proofs all confirmed the one-call branch `POST /department/list` with direct verification from `values[]`.
- `POST /department/list` can return a successful batch-create wrapper with `values[]` populated while top-level list metadata still shows `fullResultSize=0`; for create verification, trust `values[]` plus the returned department fields, not `fullResultSize`.
- In invoice flows, avoid unintended sending. If task is to create/register an invoice and not send it, ensure the payload does not trigger customer sending.
- For create-and-send customer-invoice tasks, the lowest-call default is usually `POST /invoice` with the default `sendToCustomer=true`; do not automatically split this into `POST /invoice?sendToCustomer=false` plus `PUT /invoice/{id}/:send`.
- For the exact fresh-account create-and-send one-line service prompt that only gives customer `name + organizationNumber` and does not explicitly say the customer already exists, the canonical low-call path is `POST /customer` with `invoiceSendMethod: "MANUAL"`, then filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`, then `POST /invoice`; do not spend a speculative `GET /customer` first.
- German wording such as `ohne MwSt.` belongs to that same explicit no-VAT branch, not to the taxed `hors TVA` / `eksklusiv MVA` branch. The 2026-03-20 production run for `Bergwerk GmbH` / `981122011` / `Datenberatung` / `45150` and same-day persistent-sandbox analog `Bergwerk Reflection 999518478 GmbH` both succeeded in the canonical `3` calls and returned `amountExcludingVatCurrency=amountCurrency=45150`.
- The 2026-03-20 production French taxed run for `Lumière SARL` / `959714320` / `Stockage cloud` / `34100` re-confirmed that same exact `3`-call branch for `hors TVA`: `POST /customer` with `invoiceSendMethod: "MANUAL"` -> filtered outgoing `GET /ledger/vatType` -> `POST /invoice`, with the Unicode customer name preserved exactly as prompted. The same-day persistent sandbox analog `Lumière Reflection b9572091 SARL` / `957223729` still exposed only VAT code `6` (`0%`), and omitting `orderLines[].vatType` there created a wrong untaxed `34100` total, so that sandbox state is blocked for the taxed branch rather than a valid lower-call shortcut.
- The later 2026-03-20 production French run for `Étoile SARL` / `995085488` / `Rapport d'analyse` / `7250` exposed the conditional bank-account branch for that same exact one-line taxed create-and-send shape: `POST /customer` -> filtered outgoing `GET /ledger/vatType` -> failed `POST /invoice` with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.` -> `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` on invoice account `1920` with minimal payload `{ "bankAccountNumber": "12345678903" }` -> retry the same `POST /invoice`. Do not improvise an unverified generated bank-account number, and do not restart from `POST /customer` after that failure; if in-memory state is lost after the customer create, resume on the existing-customer branch `GET /customer?organizationNumber=...&fields=*` -> filtered `GET /ledger/vatType` -> `POST /invoice` instead of blind customer recreation.
- For the exact fresh-account create-one-employee shape `name + birth date + email + start date`, the canonical path remains `POST /employee` with explicit `userType: "NO_ACCESS"` and nested `employments: [{ startDate }]`, then one decisive `GET /employee/employment?employeeId=...&fields=*`. The 2026-03-20 production English run for `Thomas Harris` (`1991-06-04`, `thomas.harris@example.org`, `2026-10-06`) and later same-day Portuguese run for `João Rodrigues` (`1980-09-05`, `joao.rodrigues@example.org`, `2026-08-08`) re-confirmed that same `2`-call branch, with Unicode names preserved after ISO-normalizing mixed-language date prose. A same-session persistent-sandbox reflection run still needed the repair ladder `422 department.id` -> `GET /department` -> `422 employments.division.id` -> `GET /division` -> retry create -> `GET /employee/employment`, so do not let sandbox behavior justify proactive department or division reads in fresh-account scored runs.
- For the richer exact onboarding shape `new employee + department + employment percentage + annual salary + standard worktime`, the simple create-employee standard is too weak. Persistent sandbox re-proof on 2026-03-21 confirmed that the lower-risk canonical path is `GET /division?count=1&fields=*` -> `POST /department` -> `POST /employee` with nested `employmentDetails[]` -> `POST /salary/settings/standardTime`, and that the tempting shortcut `department: { name: ... }` inside `POST /employee` still fails `422 department.id`. Production scoring feedback on the analogous 2026-03-21 offer-letter run was only `11/14` after omitting the up-front `division.id` and spending a separate `POST /employee/employment/details`, so use the division read on this fuller employment-relation task shape instead of blindly reusing the simpler employee-card fast path.
- For the exact create-project shape `existing customer by organizationNumber + existing project manager by email`, the 2026-03-20 persistent sandbox re-proof confirmed there is still no safe 2-call shortcut: `POST /project` with nested `customer { name, organizationNumber }` can return `201` while leaving `customer=null`, and `projectManager` details without `id` still fail validation. Keep the canonical `3`-call path `GET /customer` -> `GET /employee?assignableProjectManagers=true` -> `POST /project`.
- For multi-day domestic travel-expense prompts that omit explicit dates and `departureFrom`, do not treat the task as an exact trusted-standard match. Persistent sandbox re-proof on 2026-03-20 delivered three otherwise-identical Bergen expenses with the same employee, cost rows, and per-diem row but different inferred values: `2026-03-17..2026-03-20` + `Oslo`, `2026-03-16..2026-03-19` + `Oslo`, and `2026-03-17..2026-03-20` + `Drammen`. A same-day Bodø re-proof with the no-address employee `18478235` plus company-city fallback `Oslo` also delivered both `2026-03-18..2026-03-20` and `2026-03-17..2026-03-19` with the same `3 x 800` per diem and `6200 + 400` cost rows. The API accepted all of them, so neither the old run-date-ending fallback nor company-city fallback is a proven scorer-correct inference for that prompt family.
- For exact full customer-invoice credit-note tasks identified by `customer.organizationNumber + exact ex-VAT amount + exact line description`, the canonical path is one decisive `GET /invoice?invoiceDateFrom=...&invoiceDateTo=...&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` and one `PUT /invoice/{id}/:createCreditNote?date=...&sendToCustomer=false`; the 2026-03-20 production runs for `812449982` + `45300` + `Datarådgjeving`, `973999966` + `40800` + `Conseil en données`, `882988155` + `40900` + `Heures de conseil`, `991882502` + `13100` + `Opplæring`, and `962075754` + `30200` + `Analysebericht` confirmed that path is still minimal. Do not add `GET /customer`, `GET /invoice/{id}`, or extra spec re-checking once the trusted standard already matches.
- If `PUT /order/{id}/:invoice` fails with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`, do one conditional repair branch: `GET /ledger/account?isBankAccount=true&fields=*`, update the existing invoice bank account under `/ledger/account/{id}` (usually `1920` / `isInvoiceAccount=true`) with a valid unique 11-digit `bankAccountNumber`, then retry the same order invoice once; do not create a second order or project.
- In fresh-account runs where `PUT /order/{id}/:invoice` is likely the first outgoing invoice of the run, a proactive `GET /ledger/account?isBankAccount=true&fields=*` is only a situational hedge against the missing-company-bank-account `422`, not the canonical exact order-to-invoice-to-payment fast path. Keep the 5-call default unless the run already gives strong reason to expect that bank-account validation branch; if you do take the hedge and the chosen invoice account already has a `bankAccountNumber`, skip the repair and reuse the same order write.
- The 2026-03-20 production German run for `Waldstein GmbH` / `975687821` / product refs `4366` + `3402` finished on the plain 5-call path `GET /customer` -> `GET /product` -> `GET /invoice/paymentType` -> `POST /order` -> `PUT /order/:invoice` with no `/ledger/account` repair branch; the production payment type was `36030207`, while the same-day persistent sandbox proof for the same prompt family still used `32813748`, so never hardcode a prior payment-type id across accounts or environments.
- For the exact project-first fixed-price partial-billing shape, the 2026-03-20 production run for `Tindra AS` / `870827946` / `Nettbutikk-utvikling` / `kristian.nilsen@example.org` / `181650` / `50%` scored only `3.33/4` because it inserted that proactive `/ledger/account` hedge even though the read showed invoice account `1920` already had a valid `bankAccountNumber`. The lower-call replacement path for that exact shape is the optimistic 5-call branch `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`, with `/ledger/account` reserved for a proven missing-bank-account branch.
- Post-run scoring on 2026-03-20 for `Soleil SARL` / `931336738` / `Mise à niveau infrastructure` / `nathan.thomas@example.org` / `125550` / `25%` showed that the project-first fixed-price partial-billing branch can still waste one call even after removing `/ledger/account`: if the initial `GET /project` already proves the exact project, nested customer, nested manager email, and `fixedprice=125550`, skip `PUT /project` entirely and continue with the `4`-call path `GET /project` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`.
- A later 2026-03-20 production run for `Sjøbris AS` / `825338756` / `Automatiseringsprosjekt` / `knut.kvamme@example.org` / `316000` / `50%` exposed the opposite efficiency miss on the same project-first update branch: the initial `GET /project` already proved the exact project, nested customer, and nested manager email, but the optimistic `PUT /order/:invoice` hit `422 Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.` The successful path became `GET /project` -> `PUT /project` -> `GET /ledger/vatType` -> `POST /order` -> failed `PUT /order/:invoice` -> `GET /ledger/account` -> `PUT /ledger/account/{id}` -> retry `PUT /order/:invoice` for `8` total calls.
- For that exact update-needed partial-billing state, one proactive `/ledger/account` hedge just before the first invoice write would have finished in `7` calls instead. Combined with the same-day `Tindra AS` proof, this task family now has a real branch tradeoff, not a universal winner: optimistic path costs `5` when the invoice account is already configured but `8` when the company bank account is missing, while the hedge costs `6` when configured and `7` when missing. Choose deliberately from run evidence; do not apply either branch by rote.
- A same-session persistent-sandbox analog on 2026-03-20 with current-task arithmetic `498050 * 50% = 249025` re-confirmed both conditional floors for this family when the company invoice bank account is already configured: the skip-`PUT /project` branch still finished in `4` calls, and the update-needed branch still finished in `5` calls. No lower-call replacement was found beyond the existing conditional `4/5`-call rule.
- In that same taxable fixed-price partial-billing shape, compare the prompt-derived milestone amount against `amountExcludingVatCurrency`, not `amountCurrencyOutstanding`; the 2026-03-20 `Soleil SARL` production invoice returned `amountExcludingVatCurrency=31387.5` and `amountCurrencyOutstanding=39234.38` because the account exposed outgoing VAT `25%`.
- A successful `PUT /order/{id}/:invoice` can still return `orders[]` with sparse or null nested `project` data; do not spend a default `GET /invoice/{id}` just to prove linkage unless the prompt explicitly scores linked fields that the write response omits or later workflow depends on them.
- In invoice and order flows, VAT amount mode fields must be internally consistent. Do not mix including-VAT and excluding-VAT fields incorrectly.
- In invoice payment tasks, the prompt may identify the invoice by an excluding-VAT line amount, but the payment write still needs the current outstanding invoice balance from the invoice object. Locate by the prompt identifiers, then pay `amountCurrencyOutstanding` or `amountOutstanding`, not the prompt's lookup amount.
- For the exact standalone customer-invoice-payment shape `customer.organizationNumber + exact ex-VAT amount + exact line description`, the canonical path remains `GET /invoice?invoiceDateFrom=...&invoiceDateTo=...&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` -> `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` -> `PUT /invoice/{id}/:payment?paymentDate=...&paymentTypeId=...&paidAmount=<amountCurrencyOutstanding|amountOutstanding>`. The 2026-03-20 production runs for `866440034` + `30000` + `Almacenamiento en la nube`, `830362894` + `32200` + `System Development`, `909268265` + `31300` + `Konsulenttimer`, `891380690` + `10100` + `Konsulenttimer`, `913245539` + `36450` + `Session de formation`, and `939210970` + `23900` + `Manutenção` confirmed that path is still minimal, paid `37500`, `40250`, `39125`, `12625`, `45562.5`, and `29875` rather than the lookup amounts, and did not need any `GET /customer` or `GET /invoice/{id}` follow-up.
- For the exact existing foreign-currency customer-invoice payment shape `customer identifier + exact invoice-currency amount + settlement exchange rate/company-currency paid amount + explicit realized FX-loss booking`, the canonical path is still only `3` calls: decisive `GET /invoice` -> `GET /invoice/paymentType` -> `PUT /invoice/{id}/:payment` with both `paidAmount=<company-currency settlement amount>` and `paidAmountCurrency=<live invoice-currency outstanding>`. Persistent sandbox proof on 2026-03-21 for EUR invoice `2147581286` / `19107` used payment type `32813748` (`NOK`, debit `1920`) and auto-booked the realized FX loss on account `8160` with no manual `/ledger/voucher` write.
- If that decisive invoice read returns only company-currency invoices and the prompt amount merely matches `amountExcludingVatCurrency` / `amountExcludingVat`, do not keep retrying the same invoice lookup as if it were a foreign-currency exact match; that prompt family is no longer on the trusted FX-payment branch.
- Same-day persistent-sandbox re-proof on analog invoice `2147531840` (`907791616` + `6200` + `Fakturerbart arbeid sandbox proof`) again settled the invoice in exactly `3` calls, and the invoice read exposed no payment-related keys at all while `GET /invoice/paymentType` still returned usable incoming bank payment type `32813748` with `name=null`, `creditAccount=null`, `debitAccount.number=1920`, `isBankAccount=true`, and `isInvoiceAccount=true`. A later same-day persistent-sandbox re-proof on invoice `2147551798` (`841254546` + `28500` + `System Development`) again finished in exactly `3` calls with that same payment type `32813748`. That same sandbox also held `4` matching unpaid analogs for the same `organizationNumber + ex-VAT amount + line description`, and because all `4` shared the same customer, `GET /customer` would not have disambiguated them anyway. Do not let that persistent-sandbox duplicate noise justify a default `GET /customer` on fresh-account production runs.
- For the exact overdue-invoice prompt shape `one implied overdue invoice + prompt-fixed exact manual reminder fee on 1500/3400 + separate fee invoice + partial payment 5000`, do not route through `/invoice/{id}/:createReminder`. Persistent sandbox on 2026-03-21 required an explicit send type, rejected `type=REMINDER`, and the first working branch `type=SOFT_REMINDER&dispatchTypes=EMAIL&includeCharge=true` still charged only `38`, not the prompt-required fee amount. The 2026-03-21 production German run with fee `50` re-confirmed that the correct standalone path is still `7` calls: one decisive overdue-invoice read, one payment-type read, one `GET /ledger/account?number=1500,3400&fields=*`, one filtered outgoing `0%` VAT read, then `POST /ledger/voucher`, `POST /invoice`, and `PUT /invoice/{id}/:payment`. Never hardcode sandbox payment type `32813748`; that production run used `27178699`. A same-day persistent-sandbox unsent probe `POST /invoice` without `orderLines[].vatType` did create untaxed invoice `185` for `50`, but the write response kept `orderLines[].vatType=null`, so that tempting `6`-call omission shortcut is still not strong enough to replace the explicit `GET /ledger/vatType` in production.
- In that same exact overdue-invoice reminder-fee branch, trust prompt-specified ledger account numbers over semantic account names. The 2026-03-21 persistent sandbox returned account `3400` with an unrelated display name and `isInactive=true`, but the id-based voucher write still succeeded on the exact requested `3400` row.
- `POST /invoice` can succeed while returning `orderLines` only as link objects (`id`/`url`). Do not treat that sparse write response as evidence that line creation failed; if exact line-level verification is needed, do one immediate `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`.
- A `POST /invoice` response that shows the expected `orderLines.length` can still be sparse link-only data. Do not attempt exact line verification from that object unless each returned line already includes the scored fields you need, such as `product.number`, `description`, `unitPriceExcludingVatCurrency`, and `vatType.percentage`.
- For create-only customer invoice tasks with existing products, the default fast path is usually `GET /customer`, `GET /product`, then `POST /invoice`. Do not spend an automatic `GET /ledger/account` unless the prompt or a prior validation error already shows bank-account repair is needed.
- For create-only customer invoice tasks where the prompt clearly gives exact existing product numbers, prefer one decisive `GET /product?productNumber=<a>&productNumber=<b>...&fields=*` over a broad catalog read; only switch to `GET /product?count=1000&fields=*` when the parenthetical refs are unclear semantics or the direct numeric search returns an incomplete/ambiguous subset.
- For the exact create-only invoice shape `existing customer by organizationNumber + exact existing product numbers`, the lower-call default is now `GET /customer?organizationNumber=...&fields=*` -> `GET /product?productNumber=<a>&productNumber=<b>...&fields=*` -> `POST /invoice?sendToCustomer=false`; if those resolved products already carry reusable `vatType.id`, either copy that id onto the line or let the line inherit VAT from the product. Do not add `GET /ledger/vatType` by reflex for that exact shape.
- Production reflection on 2026-03-20 for the exact prompt shape `977448239` with `Konsulenttimer (6390)`, `Systemutvikling (1652)`, `Webdesign (3273)`, and VAT `25%` / `15%` / `0%` showed that spending `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` was one wasted call. The products resolved directly by exact number, the invoice still needed the later conditional bank-account repair, and the realistic lower-call replacement in that same fresh-account state is `GET /customer` -> `GET /product?productNumber=6390&productNumber=1652&productNumber=3273&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional `GET /ledger/account` -> `PUT /ledger/account/{id}` -> single invoice retry.
- Even when parenthetical refs look like ordinary product numbers, do not treat them as proven Tripletex lookup keys if the prompt also gives exact product names; the 2026-03-20 production run for `851635874` + `Analyserapport` / `Datarådgivning` / `Nettverkstjeneste` lost the efficiency point because a speculative `GET /product?productNumber=2934&productNumber=8699&productNumber=1355` missed one line and the broader fallback happened only after a script restart. The lower-call path for that shape is one decisive `GET /product?count=1000&fields=*`, then `GET /ledger/vatType`, then `POST /invoice`, with the fallback kept inside the same script.
- Persistent sandbox reduction on 2026-03-20 showed that `POST /invoice` with `product: { number: ... }` can still succeed while leaving invoice lines unlinked to products (`product=null` on readback); that is not a valid lower-call shortcut for existing-product prompts.
- The same sandbox reduction also showed that inline `customer { name, organizationNumber }` on `POST /invoice` does not remove the need for `GET /customer`; the related order still failed with `422` because `customer.id` was missing.
- For the exact one-employee payroll shape where `GET /employee?email=...&count=10&fields=*` shows one exact employee with `dateOfBirth=null` and `employments=[]`, the decisive next call is always `GET /division?count=1&fields=*` before `GET /salary/type`.
- Same-day persistent sandbox re-proof on 2026-03-20 confirmed that reordered branch still succeeds when a division exists: `GET /division` -> `PUT /employee/{id}` with placeholder `dateOfBirth` -> `POST /employee/employment` -> `GET /salary/type` -> `POST /salary/transaction`.
- Same-day production reflection for `Maria Almeida` / `maria.almeida@example.org` / `33550` + `14400` showed the blocker side of that same branch: when `GET /division?count=1&fields=*` returns zero rows and the prompt does not explicitly allow manual vouchers, the minimum-safe outcome is to stop blocked after those two calls; any added `GET /salary/type` is wasted.
- Later same-day production reflection for `Eirik Brekke` / `eirik.brekke@example.org` / `41050` + `9800` re-confirmed that same non-fallback blocker branch: exact employee match with `dateOfBirth=null` and `employments=[]`, then zero-row `GET /division?count=1&fields=*`, then stop blocked after `2` calls because the prompt did not permit manual vouchers.
- Same-day persistent sandbox follow-up on 2026-03-20 closed off the tempting division-create shortcut for that blocker branch: minimal `POST /division` with only `name` failed `422` requiring `organizationNumber`, `startDate`, `municipalityDate`, and `municipality`. For the exact payroll prompt shape without manual-voucher fallback, do not guess a division-create rescue after `GET /division` returns zero rows.
- Same-day production reflection for `Jonas Hansen` / `jonas.hansen@example.org` / `40000` + `10600` showed the fallback-permitted side: when that same zero-division result happens and the prompt explicitly allows manual vouchers, skip `GET /salary/type` and continue directly with `GET /ledger/account?number=5000,1920&fields=*` plus `POST /ledger/voucher`.
- `POST /order` can create embedded `orderLines` even when the `201` response echoes `orderLines=[]`; do not assume line creation failed from that response alone. If decisive pre-invoice verification is needed, use one targeted `GET /order/{id}?fields=*,orderLines(*)`; otherwise prefer reusing the later invoice response instead of branching into unnecessary rewrites.
- For the exact create-order, invoice, and full-payment task shape with existing customer + existing products, the lower-call path is no longer the old split invoice-then-payment tail. Resolve one incoming `paymentTypeId` before invoicing, then use `PUT /order/{id}/:invoice?...&paymentTypeId=<id>&paidAmount=0.01&paymentTypeIdRestAmount=<same-id>` for ordinary NOK runs; the 2026-03-20 persistent sandbox proof settled the full invoice in that same write and removed the extra `PUT /invoice/{id}/:payment` call.
- In that same combined prepayment flow, `paidAmount=0` is not a valid shortcut; Tripletex validation treated it as effectively missing even when `paymentTypeId` was present. Use the smallest positive amount accepted for the invoice currency instead.
- For create-invoice or create-order tasks where the prompt shows exact product names plus parenthetical numeric refs of unclear semantics, do not spend both `GET /product?productNumber=...` and `GET /product?ids=...` by default. The lower-call default is one decisive `GET /product?count=1000&fields=*` and local filtering by exact product `number` and/or exact product `name`.
- In that same ambiguous-product-ref flow, only fall back to `GET /product?productNumber=...` and then `GET /product?ids=...` if the catalog read is ambiguous, truncated for the account, or the prompt does not give exact product names. Do not let an approximate name-only match count as resolution for a missing product.
- If a first product resolver still misses one line, do not abort and rerun the whole script; keep the broader resolver as an in-script callback/fallback branch and reuse the already-resolved customer id and any other safe prior results.
- `GET /product?productNumber=...&fields=*` can return the matched product reference under `number` instead of `productNumber`; normalize both keys before deciding the numeric resolver failed and spending a fallback read.
- For direct-line invoice VAT selection, or any invoice task where the resolved product read does not already give you a reusable `product.vatType.id`, resolve `vatType` from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` on the actual invoice date. Do not hardcode VAT code `3`; some accounts only expose code `6` (0% outgoing VAT), and `POST /invoice` can fail with `Ugyldig mva-kode.` if you use a code outside the filtered result set.
- For explicit no-VAT direct-line invoice prompts, still resolve the filtered outgoing `0%` VAT row and send it on `orderLines[].vatType`; do not assume omitting `vatType` is equivalent just because the requested amount is without VAT.
- For ordinary direct-line service invoice prompts explicitly priced excluding VAT / MVA, the filtered outgoing VAT read must contain an exact `25%` row; use that row on `orderLines[].vatType`. If the filtered result only exposes `0%`, treat the run as blocked in that account instead of omitting `vatType` or downgrading the line to `0%`. The 2026-03-20 production run for `Snøhetta AS` / `871844062` / `Webdesign` / `20100` confirmed the safe 3-call path `POST /customer`, filtered `GET /ledger/vatType`, `POST /invoice`, while the persistent sandbox on the same date still exposed only VAT code `6` and produced a wrong `20100` total when `vatType` was omitted.
- For create-only invoice tasks, do not let a local arithmetic/assertion mistake after a successful `POST /invoice` trigger a retry or duplicate invoice. Recheck the VAT math first and treat the write response as primary evidence of the created state.
- For simple direct invoice/order lines without a product, do not omit `orderLines[].vatType` just to save the VAT lookup when the prompt implies a taxable service. Persistent sandbox on 2026-03-20 accepted that lower-call write but created a no-VAT invoice (`amountCurrency == amountExcludingVatCurrency`), so the filtered outgoing VAT read is still part of the minimum safe path.
- Customer creation may require invoice delivery settings and address details. If EHF-style delivery is implied or defaulted, missing postal address can fail validation.
- For exact supplier-invoice prompts in real fresh accounts that give supplier business fields but do not say the supplier already exists, default to `POST /supplier` first. The 2026-03-20 production run for `Stormberg AS` / `877462137` / `INV-2026-9382` / `61600` / `6340` / `25%` repeated the earlier lookup-first miss: that initial `GET /supplier` was wasted because the supplier did not exist and still had to be created.
- The lower-call replacement for that fresh-account shape is `POST /supplier` -> `GET /ledger/account` -> `GET /ledger/vatType` -> `POST /ledger/voucher/importDocument` -> `PUT /ledger/voucher/{id}?sendToLedger=false`; same-day persistent-sandbox re-proof for `Minimal Proof Supplier 007945 AS` / `910079457` / `kontortjenester` / `61600` gross / `6340` / `25%` confirmed that `5`-call path with no default verification read.
- Keep the lookup-first supplier-invoice branch only when the prompt explicitly says the supplier already exists or the run context is retry/persistent enough that duplicate suppliers are a real risk. The earlier `Brightstone Ltd` duplicate-supplier miss still matters there; if a lookup returns several hits, continue only when exact `organizationNumber` plus exact `name` leaves one unique supplier, otherwise treat the run state as ambiguous.
- For the exact create-one-supplier shape with prompt-provided `name`, `organizationNumber`, and one generic email address, the canonical minimal path is still one `POST /supplier`; do not add `GET /supplier` or `GET /supplier/{id}`. If that lone supplier email is invoice-looking, such as `faktura@...`, mirroring it into both `email` and `invoiceEmail` is still a plausible hedge, but do not treat that as a proven full fix: the later 2026-03-20 `Bergvik AS` rerun still stayed at public `6/7`, so one remaining scorer field is likely non-prompt and unresolved.
- For the exact standard Norwegian create-customer shape with prompt-provided `name`, `email`, and `organizationNumber`, the canonical minimal path is one `POST /customer`; do not add `GET /customer`, `GET /customer/{id}`, or speculative invoice-delivery fields unless the prompt explicitly requires them.
- In standard customer creation tasks with one ordinary address, prefer `postalAddress` (`addressLine1`, `postalCode`, `city`) and do not also invent `physicalAddress` unless the prompt explicitly asks for a separate physical/visiting address.
- `POST /customer` can still return a sparse `physicalAddress` link object even when you sent only `postalAddress`. Do not treat that as evidence that the prompt required a separate visiting address, and do not spend a follow-up `GET` just to inspect it.
- In standard customer creation tasks with one generic prompt email, map it to `email`; do not also populate `invoiceEmail` unless the prompt explicitly asks for an invoice/billing email.
- Treat localized generic email labels such as `Correo` the same as `Email`/`E-post` in create-customer tasks; they still map to `email`, not `invoiceEmail`.
- Prompt language alone does not change the standard create-customer path; the 2026-03-20 production run for `Grünfeld GmbH` / `886669445` / `Kirkegata 87, 6003 Ålesund` confirmed that a German-language prompt with ordinary Norwegian customer fields still stays on the same one-call `POST /customer` path and preserves Unicode without `invoiceEmail` or `physicalAddress`.
- If using a foreign organization number, country/address fields may need to be set consistently.
- Product creation with VAT should resolve `vatType` from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`, not from the unfiltered VAT catalog or `typeOfVat=LEDGER`, whenever the task is not the exact fresh-account standard-`25%` shortcut; broader lists can expose codes that still fail `POST /product` with `Internt felt (vatTypeId): Ugyldig mva-kode.`
- Scoring feedback on 2026-03-20 and the later same-day `Softwarelizenz` / `7986` / `24900`, `Maintenance` / `1327` / `3700 NOK hors TVA`, and `Mantenimiento` / `7266` / `650 NOK sin IVA` production runs confirmed that the exact fresh-account create-one-product shape with prompt-provided `name`, `number`, excluding-VAT price, and standard `25%` VAT is minimal at one `POST /product` without explicit `vatType`, verified from the write response (`priceIncludingVatCurrency` reflects `25%` and `vatType` is assigned). Do not generalize that shortcut to exact `0%`, reduced-rate, or other non-standard VAT prompts.
- `POST /product` without `vatType` can succeed in some sandbox accounts by auto-filling an account default VAT type; persistent sandbox re-verification on 2026-03-20 still auto-filled `0%` VAT code `6`, so do not treat that as a trusted shortcut for scored exact-VAT tasks outside the exact fresh-account standard-`25%` shape.
- If the requested product VAT percentage is absent from that filtered `OUTGOING` result on the task date, treat the product-create task as blocked in that account; do not try a same-percentage code from the broader VAT catalog.
- For product VAT selection, do not filter away base VAT codes by requiring `parentType` to be missing; standard code `3` (`25% Utgående avgift, høy sats`) still has `parentType.id=0`.
- For exact `0%` product prompts such as books, do not search for a special book-only VAT endpoint or hardcode one sandbox's `0%` code; still choose the matching `0%` row from the filtered `OUTGOING` result in the current account.
- For exact create-only employee tasks, do not default to `GET /department` before the first `POST /employee`; scored production feedback on 2026-03-20 showed that pre-read can lose the call-efficiency bonus on accounts that accept the initial write without department repair.
- For the exact create-one-employee prompt shape with prompt-provided name, birth date, email, and start date, the 2026-03-20 production runs for `Miguel Sánchez`, `Thomas Harris`, and `João Rodrigues` confirmed the current minimum safe path in a fresh account: `POST /employee` with `userType: "NO_ACCESS"` and nested `employments`, then one `GET /employee/employment?employeeId=...&fields=*` because the successful create response still did not prove `startDate`. Reserve `GET /department` and `GET /division` strictly for `422` repair branches.
- Prompt language and localized date prose do not change that employee-create path; the 2026-03-20 production French run for `Jules Bernard` with mixed-language dates `8. December 1982` and `27. December 2026` stayed on the same standard employee-create branch after ISO normalization.
- Preserve Unicode employee names exactly as prompted on that branch; the later 2026-03-20 Portuguese run for `João Rodrigues` kept `João` unchanged through the successful write and verification read.
- Employee creation may require a department if department functionality is enabled in the account; when the initial create fails with `validationMessages[].field == "department.id"`, do one decisive `GET /department?isInactive=false&count=1&fields=*`, and only `POST /department` if that repair read proves no active department exists.
- After a `department.id` repair, retry `POST /employee` before reading `/division`; the same-session persistent-sandbox Portuguese analog on 2026-03-20 still needed that second write to prove whether `employments.division.id` was actually required, so a speculative `GET /division` immediately after the first `422` is a wasted-call trap.
- Employee creation may also require explicit `userType`, and the `POST /employee` success response may echo `userType: null` plus `employments` entries with only `id`/`url`, not the submitted `startDate`.
- Employee creation can also fail with `validationMessages[].field == "employments.division.id"`; if validation says the employment must be tied to a business/sub-entity, resolve one existing `/division?count=1&fields=*` and reuse that `division.id` instead of guessing.
- Persistent sandbox re-verification on 2026-03-20 for `Jules Reflection 3d4e5838` re-confirmed the full stacked repair ladder: failed `POST /employee` on `department.id`, `GET /department`, failed `POST /employee` on `employments.division.id`, `GET /division`, successful `POST /employee`, then `GET /employee/employment` to prove `startDate`. Treat that `6`-call path as repair-only, not as a default pre-read strategy.
- For employee-create repair branches, do not branch on the generic top-level `422 message` or on `Feltet må fylles ut.` alone; use `validationMessages[].field` to distinguish `department.id` from other missing-field errors before spending repair calls.
- If employee start date is scored, plan one decisive `GET /employee/employment?employeeId=...&fields=*` unless the create response unexpectedly includes the actual `startDate`.
- Payroll runs through `POST /salary/transaction` require a payroll-ready employee, but for exact one-employee manual payroll tasks scored only on the resulting payroll side effect, `dateOfBirth=null` plus `employments=[]` is no longer an automatic stop. Task-12 investigation on 2026-03-20 showed real accounts can already have `WAGE` active and `GET /salary/settings` working while the target employee is still underconfigured.
- `GET /employee?fields=*` can still return `employments[]` as sparse stubs with null `startDate`, null `division`, and empty-looking `employmentDetails[]`; if `dateOfBirth` is present but the payroll-period check is still ambiguous, do one conditional `GET /employee/employment?employeeId=...&fields=*` before treating the run as blocked or ready.
- `GET /employee/employment?employeeId=...&fields=*` can expand `startDate` and `division.id` while `employmentDetails[]` and `latestSalary` remain partly sparse; do not spend an automatic `GET /employee/employment/details` when active employment plus division-backed payroll setup is already clear enough to proceed.
- For the exact task-12-like branch where `GET /employee?...fields=*` shows one exact employee with `dateOfBirth=null` and no employments, the decisive next call is `GET /division?count=1&fields=*` before any `GET /salary/type`. If that division read returns one usable row, take the repair-first path `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"` -> `POST /employee/employment` with `division.id`, the first day of the payroll month, `isMainEmployer: true`, and `taxDeductionCode: "loennFraHovedarbeidsgiver"` -> `GET /salary/type?count=1000&fields=*` -> `POST /salary/transaction`.
- Do not add `POST /employee/employment/details` by default in that repair branch; persistent sandbox on 2026-03-20 proved the repaired employee could reach a successful manual-line payroll run without employment-details creation.
- For payroll tasks with manual salary lines, resolve salary types from `GET /salary/type?count=1000&fields=*` and use embedded `payslips[].specifications[]` on `POST /salary/transaction`. In accounts without department accounting, omitting `department` from that salary payload avoids `422 department: Selskapet har ikke aktivert avdelingsregnskap.`
- Do not add speculative salary-feature activation or `/salary/settings` preflight reads to an exact payroll run. Only investigate `/company/salesmodules` or `/salary/settings` as an activation branch after a live `403` from `GET /salary/type`, `GET /salary/settings`, or `POST /salary/transaction`; task-12 investigation on 2026-03-20 showed `WAGE` can already be active while the real blocker is employee underconfiguration.
- When a successful `POST /salary/transaction` response is too sparse, the decisive verification branch is `GET /salary/transaction/{id}?fields=*` to get payslip ids, then `GET /salary/payslip/{id}?fields=*` for gross/net amounts and specification count.
- `GET /salary/payslip/{id}?fields=*` can still keep `specifications[]` as link-only objects; for exact manual-line verification use `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))`.
- Project creation may require `startDate` even though the `Project` schema does not clearly mark it as required. Project manager assignment is also validated: a plain employee match may still be ineligible, so prefer resolving managers with `assignableProjectManagers=true`.
- For exact create-project tasks with an existing customer identified by organization number and an existing project manager identified by email, the low-call path is `GET /customer?organizationNumber=...&count=10&fields=*`, `GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*`, then `POST /project`; the 2026-03-20 production run for `986713344` + `bruno.pereira@example.org` re-confirmed that this 3-call path is already minimal. Keep exact uniqueness checks local instead of adding more reads.
- A second 2026-03-20 production create-project run for `Havbris AS` / `999148387` / `Henrik Ødegård` / `henrik.degard@example.org` re-confirmed that same `3`-call floor; do not spend extra reads just because the prompt manager name contains `Ø` while the email local-part is ASCII `degard`.
- In that exact create-project flow, do not make prompt `customer.name` or manager name a hard requirement after the filtered reads already leave one exact `organizationNumber` hit and one exact `email` hit; use names only as local tie-breakers for multi-hit cases.
- If a create-project prompt omits `startDate`, default `startDate` to the run date in ISO format; sandbox create succeeded on `2026-03-20` with that default.
- In that exact create-project flow, do not add `GET /project`, `GET /customer/{id}`, or `GET /employee/{id}` verification reads, and do not spend time re-checking `./openapi.json` once `./trusted-standards/create-project.md` already matches exactly.
- For project-linked task shapes where the prompt gives project name plus customer identifiers, `GET /project?name=...&count=50&fields=*,customer(*)` can often resolve both the project and the linked customer in one read; do not default to a separate `GET /customer` if that expanded project read already leaves one exact match.
- For update-shaped fixed-price project billing tasks, widen that same project resolver to `fields=*,customer(*),projectManager(*)`; if one exact project row already proves both nested `customer.organizationNumber` and nested `projectManager.email`, skip separate `GET /customer` and `GET /employee` reads and reuse the returned `customer.id`, `projectManager.id`, and `startDate` directly on `PUT /project/{id}`.
- For fixed-price partial-billing update tasks, start with that same expanded `GET /project?name=...&count=50&fields=*,customer(*)` read before a customer lookup. If it already returns one exact project hit whose nested customer matches the prompt, reuse `project.id`, `customer.id`, and the existing `startDate`, then skip the separate `GET /customer`.
- In that same fixed-price partial-billing shape, percentage-derived milestone amounts can stay decimal. Do not round `350650 * 0.25` to a whole-NOK amount; Tripletex accepted `87662.5` directly on the order line and invoice.
- For project-hour invoice tasks, `GET /activity/>forTimeSheet?...&fields=*` exposes activity chargeability under `isChargeable`, not `chargeable`; branch the hourly-rate path off `activity.isChargeable`.
- For project-hour billing tasks, switch the project hourly-rate holder with `PUT /project/hourlyRates/{id}` and then create the employee+activity rate with `POST /project/hourlyRates/projectSpecificRates`; sending embedded `projectSpecificRates[]` inside the holder `PUT` is not the proven rate-write path.
- `POST /project/hourlyRates/projectSpecificRates` rejects non-chargeable activities with `422 activity.id: Ikke fakturerbar.`.
- If that activity read already shows `isChargeable=false`, the proven exact-match floor for hours-plus-project-invoice tasks is the 7-call branch `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`.
- The 2026-03-20 production German run `Windkraft GmbH` / `882984826` / `Sicherheitsaudit` / `sophia.schmidt@example.org` / `Design` / `18` hours / `950` re-confirmed that exact non-chargeable branch: `/activity/>forTimeSheet` returned `isChargeable=false`, the 7-call path succeeded, and any added `/project/hourlyRates` read or rate write would have been wasted.
- The 2026-03-20 production Norwegian run `Bergvik AS` / `989231898` / `Plattformintegrasjon` / `ingrid.nilsen@example.org` / `Analyse` / `5` hours / `1400` matched that same non-chargeable branch, returned `amountExcludingVatCurrency=7000` plus `amountCurrencyOutstanding=8750`, and did not expose a lower-call taxable-safe replacement path.
- A later 2026-03-20 production German run `Waldstein GmbH` / `948366207` / `Sicherheitsaudit` / `anna.wagner@example.org` / `Analyse` / `14` hours / `1150` matched that same non-chargeable branch, returned `amountExcludingVatCurrency=16100` plus `amountCurrencyOutstanding=20125`, and again showed that adding `/project/hourlyRates` would only waste calls.
- A same-day persistent-sandbox re-proof on the non-chargeable analog with current-task arithmetic `5` hours at `1400` showed that omitting the manual project-order-line `vatType` can collapse the sandbox branch to `6` calls and still create `amountExcludingVatCurrency=7000` / `amountCurrencyOutstanding=7000` when that account exposes only outgoing VAT row `id=6` (`0%`).
- Do not generalize that sandbox-only 6-call omitted-`vatType` shortcut to scored taxable runs; same-day direct-line invoice/order proofs still showed that omitted `vatType` can silently create a wrong no-VAT invoice on `0%`-only accounts. Keep `GET /ledger/vatType` in the default project-hour invoice path unless the prompt explicitly wants no VAT or run evidence already proves the correct outgoing VAT is `0%`.
- A 2026-03-20 persistent-sandbox re-proof on the same non-chargeable analog with prompt-like arithmetic `14` hours at `1150` again finished in `7` calls on fresh date `2026-06-21`, returned `amountExcludingVatCurrency=16100` plus `amountCurrencyOutstanding=16100`, and found no lower-call public replacement path that stayed VAT-safe for production.
- If that activity read shows `isChargeable=true`, do not skip `GET /project/hourlyRates`; `POST /timesheet/entry` can still succeed on a chargeable activity with `chargeable=true` and `hourlyRate=0` when the exact employee+activity rate is missing.
- `POST /timesheet/entry` on a non-chargeable project activity can still succeed even with `projectChargeableHours`, but the write response keeps `chargeable=false` and `hourlyRate=0`.
- `projectChargeableHours` cannot exceed `24` on one `POST /timesheet/entry`; Tripletex returns `422 projectChargeableHours: Kan ikke være over 24`.
- Tripletex allows only one time entry per `employee + project + activity + date`; a second same-day `POST /timesheet/entry` for the same tuple returns `409 Det er allerede registrert timer ...`.
- For exact hours-plus-project-invoice prompts whose total hours exceed `24`, split the hours across distinct dates before the first write. On the non-chargeable branch, the new exact-match floor for a `39`-hour prompt is `8` calls: `GET /employee` -> `GET /project` -> `GET /activity/>forTimeSheet` -> `POST /timesheet/entry` (`24`) -> `POST /timesheet/entry` (`15` on another date) -> `GET /ledger/vatType` -> `POST /order` -> `PUT /order/:invoice`.
- If a high-hour run already created one day chunk before failing on a duplicate same-day follow-up, recover with one decisive `GET /timesheet/entry?employeeId=...&projectId=...&activityId=...&dateFrom=...&dateTo=...&fields=*`, then write only the missing day chunks; do not restart the whole sequence blindly.
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
- Preserve exact Unicode when matching localized invoice descriptions on that locate read; do not ASCII-normalize strings such as `Conseil en données`.
- For outgoing customer invoice payment-reversal tasks, `GET /invoice` exposes payment voucher candidates under `postings`, not `payments`; `fields=...payments(...)` can fail with `400 Illegal field in fields filter: payments ... InvoiceDTO`. On exact-match scored runs, the winning path is usually one decisive `GET /invoice` to isolate the payment voucher, then `PUT /ledger/voucher/{id}/:reverse`, then stop. Only add a final `GET /invoice` when the prompt explicitly requires balance proof or the locate read left material ambiguity. Also, do not rely only on `posting.type`: the payment posting can be `type=null`, and the correct fallback is the unique negative payment-style posting with text such as `Betaling: ...`. `account.number=1500` is common but not required; real locate reads can return `account=null`, so do not spend an extra resolver read just because the account expansion is missing.
- That reverse-payment fast path assumes the invoice has a standalone payment voucher. Persistent sandbox reflection on 2026-03-20 showed that a combined `PUT /order/{id}/:invoice?...paymentTypeId=...` prepayment flow can place both the invoice posting and the negative payment-style postings on one shared `voucher.id`; do not reverse that shared voucher under the ordinary standalone returned-payment standard.
- In those same outgoing payment-reversal tasks, a prompt ex-VAT amount can be only a locate key. After the first invoice read, capture the invoice object's own pre-reversal total (`amountCurrency` or `amount`) and verify the reopened outstanding amount against that value, not against the prompt lookup amount.
- `GET /invoice/paymentType` can return `debitAccount.number` and `creditAccount.number` as numeric values, not strings. Normalize before applying string-prefix heuristics such as `19xx` bank account or `15xx` customer ledger checks.
- `GET /invoice/paymentType` can also return a perfectly usable incoming bank payment type with `name=null`. Do not reject that row or spend a fallback read just because the label is absent; prefer debit-account traits such as `19xx`, `isBankAccount=true`, and `isInvoiceAccount=true`.
- `GET /invoice/paymentType` can also return perfectly usable incoming payment types with `creditAccount=null`. Do not reject `Betalt til bank` just because there is no `15xx` credit account in the response; prefer a payment type whose debit account is `19xx` and marked `isBankAccount=true` or `isInvoiceAccount=true`.
- `paymentTypeId` on `PUT /invoice/{id}/:payment` is actually required for ordinary first-time payment registration; persistent sandbox re-check on 2026-03-20 returned `422 paymentTypeId: Kan ikke være null.` when it was omitted. Same-day sandbox re-proof on invoice `2147551675` again showed no reusable payment-related field on the `GET /invoice?...fields=*` locate row at all, so there is still no proven public 2-call standalone shortcut from invoice read alone.
- For invoice-payment tasks, cache and reuse a valid incoming `paymentTypeId` only within the same run and same company/currency context. Do not persist that cache across runs or accounts; successful ids varied across production runs and sandbox.
- If a multi-step order/invoice/payment flow already created the order and invoice but failed before payment registration, do not restart from `POST /order`. Resume by locating the unpaid invoice with one decisive `GET /invoice` and finish the payment on that existing invoice.
- Some tasks may require enabling a module or feature before later entity operations can succeed.
- Travel-expense create tasks can use one embedded `POST /travelExpense` for the parent expense plus cost/per-diem lines, but embedded `costs[]` require `amountCurrencyIncVat` even when `amountNOKInclVAT` is present.
- In that same embedded travel-expense flow, `perDiemCompensations[]` can fail with `Kun kostnader kan registreres uten kompensasjon etter satser.` unless `travelDetails.isCompensationFromRates=true`.
- Standard travel-expense create does not need an explicit `department` payload field when the linked employee already belongs to a department; Tripletex can inherit it from the employee.
- The old 4-call travel-expense fast path (`GET /employee`, `GET /travelExpense/costCategory`, `GET /travelExpense/paymentType`, `POST /travelExpense`) is not a trusted full-correctness path for multi-day per-diem tasks. It can persist an `OPEN` expense whose per-diem row still has `rateType=null`, `rateCategory=null`, and `overnightAccommodation=NONE`.
- For deliverable multi-day per-diem travel-expense tasks, resolve a live `rateType` from `GET /travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=...&dateTo=...&count=1000&fields=*`, send `travelDetails.departureFrom`, explicit cost `vatType`, and `perDiemCompensations[].overnightAccommodation`, then use `PUT /travelExpense/:deliver`.
- If a scored run still forces action on a duration-only travel-expense prompt, do not spend extra exploratory reads trying to discover the "right" dates. After the single employee read and conditional company fallback, the lowest-call best-effort branch is one deterministic local date choice plus the normal `GET /travelExpense/rate` -> `POST /travelExpense` -> `PUT /travelExpense/:deliver` tail; extra Tripletex reads do not disambiguate the scorer-correct range.
- That filtered `GET /travelExpense/rate?...fields=*` response can still keep `rateCategory` sparse as only `id`/`url`; do not locally require `rateCategory.isValidDomestic` or spend `GET /travelExpense/rateCategory/{id}` just to recover those booleans.
- When the prompt omits `departureFrom`, only infer it from one concrete employee-address field already returned by `GET /employee`, preferring `address.city`, then `address.addressLine1`, then `address.displayName`; do not invent generic placeholders such as `Hjemsted`.
- If the prompt dates are explicit but `GET /employee?...fields=*` still returns `address=null` and the employee exposes `companyId`, one conditional `GET /company/{companyId}?fields=*,address(*)` is the proven mechanical fallback for `departureFrom`; `fields=*` alone can leave `company.address` link-only.
- `PUT /travelExpense/:deliver` returns `ListResponseTravelExpense` under `values[]`, not `ResponseWrapperTravelExpense`.
- When the prompt omits explicit dates as well as `departureFrom`, the API does not disambiguate a unique final state. Persistent sandbox accepted both `2026-03-17..2026-03-20` and `2026-03-16..2026-03-19`, and it also accepted a non-company `departureFrom`. Treat that prompt shape as scorer-ambiguous rather than as a trusted exact match.
- `PUT /travelExpense/:deliver` can fail even after a successful create. Re-verified sandbox failures included missing `travelDetails.departureFrom`, missing `perDiemCompensations[].rateType`, and non-zero `costs[].vatType` on a non-VAT-registered company.
- `POST /travelExpense` and `GET /travelExpense/{id}?fields=*` can both return `costs[]` and `perDiemCompensations[]` as link-only `id`/`url`; use `GET /travelExpense/cost?travelExpenseId=...&fields=*` and `GET /travelExpense/perDiemCompensation?travelExpenseId=...&fields=*` only as a conditional investigation branch when expanded child fields are genuinely needed or the write response contradicts the intended child counts.
- Do not use top-level travel-expense `amount` or `paymentAmount` as proof that per diem was modeled correctly; sandbox kept those totals limited to reimbursable cost lines even after successful `:deliver`.
- Do not default supplier-invoice registration to `POST /incomingInvoice`; follow-up verification on 2026-03-20 showed that endpoint can fail with `403 You do not have permission to access this feature.` on an ordinary account even when the public supplier-invoice workaround still works.
- For supplier-invoice tasks that score a real supplier invoice, do not default to plain `POST /ledger/voucher` either; 2026-03-20 sandbox verification showed that branch can create a balanced voucher without creating a real `supplierInvoice` object.
- The trusted supplier-invoice path is now split by context: for the exact fresh-account shape that does not say the supplier already exists, use `POST /supplier`, `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`, `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=...&fields=*`, `POST /ledger/voucher/importDocument`, then `PUT /ledger/voucher/{id}?sendToLedger=false`; for explicit existing-supplier or retry/persistent-account contexts, swap only the first step to `GET /supplier?...` and create only on zero hits.
- For the exact standard supplier-create shape with prompt-provided `name`, generic `email`, and `organizationNumber`, the canonical minimal path is one `POST /supplier`; do not add `GET /supplier`, `GET /supplier/{id}`, or speculative address fields unless the prompt explicitly requires them. If the lone supplier email is invoice-looking, mirror it into `invoiceEmail` in that same write. The 2026-03-20 production runs for `Silveroak Ltd` / `943413231` and `Northwave Ltd` / `949044378`, plus same-day persistent sandbox re-checks, all preserved both email fields in that one call.
- If that exact supplier-create write returns `403` with `Invalid or expired token`, treat the run as blocked by credentials and stop; do not burn calls on `/supplier` reads or auth-shape guesses.
- `POST /supplier` can still return sparse `postalAddress` and `physicalAddress` link objects even when you sent no address fields. Do not treat that as evidence that the prompt required addresses, and do not spend a follow-up `GET` just to inspect them.
- In standard supplier creation tasks with one generic prompt email, always populate `email`. If that lone address is invoice-looking, also mirror it to `invoiceEmail`; this is still the same one-call create path. Even so, do not spend extra calls on invented address fields or a follow-up `GET` just because an earlier public supplier-create rerun stayed at `6/7`.
- In that supplier-invoice fast path, `POST /supplier` can already return the supplier ledger account id if the supplier-create branch is needed. Reuse `supplier.ledgerAccount.id` for the liability posting instead of spending an extra `GET /ledger/account?number=2400`.
- For supplier-invoice VAT selection, resolve VAT from `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=...&fields=*`, not `INCOMING_INVOICE`; the standard deductible 25% code can be present in `INCOMING` while missing from `INCOMING_INVOICE`.
- For the imported-voucher `PUT /ledger/voucher/{id}`, do not send `amountVat`; send `amount`, `amountCurrency`, `amountGross`, and `amountGrossCurrency` on the debit row and let Tripletex generate the VAT posting.
- In that imported-voucher flow, do not try to rewrite imported header fields such as root `description` or `vendorInvoiceNumber`; sandbox verification showed those fields are effectively immutable on the later `PUT`.
- In that same flow, place the vendor invoice number on the supplier liability posting as `invoiceNumber`, and keep the XML import itself aligned with the prompt invoice number.
- If a supplier-invoice prompt omits both invoice date and due date, use the run date for XML issue/due date and supplier-posting `termOfPayment`; do not spend extra reads trying to infer dates the prompt did not give.
- The XML file is not a dummy wrapper. It must be valid-enough EHF/UBL with the standard UBL invoice namespaces, `CustomizationID`, `ProfileID`, supplier/customer parties, tax total, legal monetary total, and invoice line. Malformed/minimalized XML attempts failed with `422 Unable to identify document format.`
- For the trusted imported-voucher update branch, keep `sendToLedger=false` by default. Sandbox verification on 2026-03-20 showed `sendToLedger=true` can still fail with `Bilag uten posteringer kan ikke bli sendt til hovedbok.` even after a correct payload.
- Free accounting dimension create tasks can use `POST /ledger/accountingDimensionName` followed by one `POST /ledger/accountingDimensionValue` per value. Persistent sandbox verification on 2026-03-20 showed that `AccountingDimensionValue.number` and `position` can be omitted, `dimensionIndex` must be reused from the create response instead of assuming `1`, and `dimensionName` is validated at max length `20`.
- `POST /ledger/accountingDimensionName` can also fail with `422` and validation message `Maximum of 3 accounting dimensions allowed` when all three free-dimension slots are already occupied. In a create-only task, treat that as blocked by account state rather than burning calls on speculative update/delete/reuse flows.
- `/ledger/accountingDimensionValue/list` is `PUT` batch update, not batch create. For a new free-dimension task with two prompt-provided values, there is no trusted four-call batch-create shortcut; the minimal safe path still needs one `POST /ledger/accountingDimensionValue` per new value.
- For manual voucher tasks, do not assume `account: { "number": "7000" }` or another ordinary ledger number such as `6590`, `6860`, `7300`, or `6340` is enough on `POST /ledger/voucher`; persistent sandbox returned `422 postings.account.name: Kan ikke være null.` on 2026-03-20. Resolve voucher account ids with one decisive `GET /ledger/account?number=...&fields=*` and use `account: { "id": ... }`.
- The 2026-03-20 production runs for exact prompts `Marked` / `Privat` / `Offentlig` / `6300` / `44950`, `Marked` / `Offentlig` / `Privat` / `7300` / `37250`, and `Marked` / `Offentlig` / `Privat` / `6340` / `25200` all finished on the same five-call path `POST /ledger/accountingDimensionName` -> `POST /ledger/accountingDimensionValue` -> `POST /ledger/accountingDimensionValue` -> `GET /ledger/account?number=<target>,1920&fields=*` -> `POST /ledger/voucher`; there is still no trusted four-call shortcut for that exact create-dimension-plus-voucher shape.
- Across those same-day production runs, the linked voucher value was sometimes the first created value and sometimes the second. When the prompt gives several new dimension values, create them in prompt order but always choose the voucher-linked value by exact returned `displayName`, never by assumed position or create order.
- Same-day persistent-sandbox reflection for the exact `6340` amount shape first hit the expected create blocker `422 Maximum of 3 accounting dimensions allowed`, then re-proved the voucher branch by reusing existing value `15253`: number-only `POST /ledger/voucher` failed again with `422 postings.account.name: Kan ikke være null.`, and the next id-based write after `GET /ledger/account?number=6340,1920&fields=*` succeeded with voucher `608868815`.
- `GET /ledger/account?number=...&fields=*` returns `account.number` as an integer, not a string. If you filter locally, compare numerically or you can falsely conclude the target account is missing and waste recovery reads or reruns.
- For manual vouchers that only score one target ledger-account posting and do not specify the balancing account, a simple two-line voucher against existing bank account `1920` succeeded in persistent sandbox on 2026-03-20.
- For exact receipt-backed business-lunch expense prompts like attached `Forretningslunsj` + department name + correct account/VAT treatment, the corrected branch is a manual voucher on `7360` / `1920` plus a separate `POST /ledger/voucher/{voucherId}/attachment`; the earlier 2026-03-21 production run that used `7350` and no attachment scored `0/10`.
- In that same receipt-backed voucher shape, do not use `POST /ledger/voucher/importDocument` followed by `PUT /ledger/voucher/{id}`; 2026-03-21 persistent sandbox returned `422` that `description` and `postings` were not editable for that imported voucher type.
- Also in that receipt-backed voucher shape, do not rely on `department: { "name": "Drift" }`; 2026-03-21 persistent sandbox returned `201` but silently stored `department=null`, and `GET /department?name=Drift...` can return containing matches such as `Drift sandbox ...` unless you exact-filter locally.
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
