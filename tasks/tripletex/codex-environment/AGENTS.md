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
- Never switch to any default Tripletex URL and never look up online ever.
- If the provided base URL is obviously a placeholder or non-routable host such as `example.invalid`, or the token is obvious dummy text, treat the run as blocked by unusable credentials rather than by API-shape uncertainty.
- In that case, do not guess alternate hosts, do not swap in default Tripletex URLs, and do not burn time on extra API attempts or unrelated spec exploration.
- If both the host and token are obviously fake placeholders, it is acceptable to stop after local playbook/spec confirmation without attempting a doomed network call.

## API Reference Strategy
- Use the common endpoints below first.
- These are common endpoints, not the only possible endpoints.
- Always confirm the exact method, path, query parameters, request body, and response shape in `./openapi.json` before calling.
- Use `./openapi.json` as the full API reference.
- When multiple similarly named schemas exist, trust the schema directly referenced by the chosen endpoint operation, not another nearby/read-only customer-facing schema.
- Do not guess endpoint shapes, field names, request payloads, or delete/update paths, always verify.
- For exact-match playbook tasks, inspect `openapi.json` with narrow endpoint/schema extraction.
- Do not run broad keyword searches across the whole spec for common fields like `name`, `email`, or `organizationNumber` when the playbook already identifies the exact endpoint.

## Task Playbooks
- Before acting, check whether the task matches a playbook in `./task-playbooks/`
- If it matches, read that playbook first and use it to avoid rediscovering known Tripletex quirks and previous faults for similar tasks
- If the prompt is an exact playbook match, keep pre-write exploration narrow: read the playbook, confirm the exact endpoint operation and referenced schema in `./openapi.json`, then execute

| Task pattern | Playbook |
|---|---|
| Create customer | `./task-playbooks/create-customer.md` |
| Create and send customer invoice | `./task-playbooks/create-and-send-customer-invoice.md` |
| Create order, invoice it, and register full payment | `./task-playbooks/create-order-invoice-and-register-payment.md` |
| Create department | `./task-playbooks/create-department.md` |
| Create employee | `./task-playbooks/create-employee.md` |
| Create product | `./task-playbooks/create-product.md` |
| Create project | `./task-playbooks/create-project.md` |
| Register full payment on customer invoice | `./task-playbooks/register-customer-invoice-payment.md` |

## Common Endpoints
- `/employee` — `GET`, `POST`, `PUT` — employees
- `/customer` — `GET`, `POST`, `PUT` — customers
- `/product` — `GET`, `POST` — products
- `/invoice` — `GET`, `POST` — invoices
- `/order` — `GET`, `POST` — orders
- `/travelExpense` — `GET`, `POST`, `PUT`, `DELETE` — travel expenses
- `/project` — `GET`, `POST` — projects
- `/department` — `GET`, `POST` — departments
- `/ledger/account` — `GET` — chart of accounts
- `/ledger/posting` — `GET` — ledger postings
- `/ledger/voucher` — `GET`, `POST`, `DELETE` — vouchers

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
- Before every write, confirm required fields and allowed payload shape in `./openapi.json`.
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
- Use Tripletex validation details to make only one precise correction if possible.
- Do not loop through guesses.
- Do not keep retrying the same invalid shape.
- `401` usually means wrong auth format or wrong token.
- `404` usually means wrong path, wrong ID, or wrong endpoint choice.
- `422` usually means validation failure or missing required fields.
- A network/DNS failure before any HTTP status usually means the provided base URL is unusable in this run, not that the request payload is wrong.

## Tripletex Gotchas
- Department create tasks do not need a pre-read in the normal case, and multi-department prompts should usually use `POST /department/list` instead of repeated `POST /department` calls.
- In invoice flows, avoid unintended sending. If task is to create/register an invoice and not send it, ensure the payload does not trigger customer sending.
- In invoice and order flows, VAT amount mode fields must be internally consistent. Do not mix including-VAT and excluding-VAT fields incorrectly.
- In invoice payment tasks, the prompt may identify the invoice by an excluding-VAT line amount, but the payment write still needs the current outstanding invoice balance from the invoice object. Locate by the prompt identifiers, then pay `amountCurrencyOutstanding` or `amountOutstanding`, not the prompt's lookup amount.
- `POST /order` can create embedded `orderLines` even when the `201` response echoes `orderLines=[]`; do not assume line creation failed from that response alone. If decisive pre-invoice verification is needed, use one targeted `GET /order/{id}?fields=*,orderLines(*)`; otherwise prefer reusing the later invoice response instead of branching into unnecessary rewrites.
- For invoice and order-line VAT selection, resolve `vatType` from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` on the actual invoice date. Do not hardcode VAT code `3`; some accounts only expose code `6` (0% outgoing VAT), and `POST /invoice` can fail with `Ugyldig mva-kode.` if you use a code outside the filtered result set.
- Customer creation may require invoice delivery settings and address details. If EHF-style delivery is implied or defaulted, missing postal address can fail validation.
- In standard customer creation tasks with one ordinary address, prefer `postalAddress` (`addressLine1`, `postalCode`, `city`) and do not also invent `physicalAddress` unless the prompt explicitly asks for a separate physical/visiting address.
- In standard customer creation tasks with one generic prompt email, map it to `email`; do not also populate `invoiceEmail` unless the prompt explicitly asks for an invoice/billing email.
- If using a foreign organization number, country/address fields may need to be set consistently.
- Product creation with VAT should resolve `vatType` from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`, not from the unfiltered VAT catalog or `typeOfVat=LEDGER`; broader lists can expose codes that still fail `POST /product` with `Internt felt (vatTypeId): Ugyldig mva-kode.`
- For product VAT selection, do not filter away base VAT codes by requiring `parentType` to be missing; standard code `3` (`25% Utgående avgift, høy sats`) still has `parentType.id=0`.
- Employee creation may require a department if department functionality is enabled in the account.
- Employee creation may also require explicit `userType`, and the `POST /employee` success response may echo `userType: null` plus `employments` entries with only `id`/`url`, not the submitted `startDate`.
- If employee start date is scored, plan one decisive `GET /employee/employment?employeeId=...&fields=*` unless the create response unexpectedly includes the actual `startDate`.
- Project creation may require `startDate` even though the `Project` schema does not clearly mark it as required. Project manager assignment is also validated: a plain employee match may still be ineligible, so prefer resolving managers with `assignableProjectManagers=true`.
- For customer invoice payment tasks, `GET /invoice` can often locate the exact outgoing invoice in one read if you request `customer(*)` and `orderLines(*)` and filter locally by organization number, ex-VAT amount, and prompt text such as a service description. The payment write is `PUT /invoice/{id}/:payment`, and the write response can usually verify `amountOutstanding=0` without a follow-up `GET`.
- `GET /invoice/paymentType` can return `debitAccount.number` and `creditAccount.number` as numeric values, not strings. Normalize before applying string-prefix heuristics such as `19xx` bank account or `15xx` customer ledger checks.
- Some tasks may require enabling a module or feature before later entity operations can succeed.
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
- Fewer calls is better.
- Zero `4xx` is ideal.
- Plan before calling.
- Do not browse the API randomly.
- Once a playbook already gives the likely winning path, do not spend time on unrelated repo tooling or broad schema enumeration before the write.
- If an exact-match create playbook applies, confirm only the endpoint operation plus the referenced write schema, then execute.
- For those exact-match create tasks, prefer anchored reads of the exact path block and referenced schemas over noisy whole-file `rg` sweeps.
- Ideal is zero reads when not needed.
- If a read is needed, prefer one decisive `GET ?fields=*` over multiple narrower `GET`s on the same object.
- Do not do a second `GET` for fields you could have received in the first one.
- Do not do a `GET` after a successful `POST` or `PUT` if the response already contains the data needed for the next step.
- Do not re-fetch data you already know from prior responses.
- Fix errors from their message, not from repeated experimentation.
