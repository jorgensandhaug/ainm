# Claude Trace Snapshot

- provider: claude
- session_id: c8200a23-9583-4cf2-a907-a3b0c620e98d
- session_file: /home/jorge/.claude/projects/-home-jorge-repos-ainm-tasks-tripletex-codex-environment/c8200a23-9583-4cf2-a907-a3b0c620e98d.jsonl
- completed: true
- assistant_messages: 2
- tool_calls: 7
- tool_results: 7

## 2026-03-22T10:46:57.319Z user_message
Scored Tripletex run.
Follow ./AGENTS.md exactly.

Highest priorities:
- Get the final Tripletex state exactly correct.
- Use the fewest API calls possible.
- Avoid all avoidable 4xx errors.

Knowledge order:
- 1. ./trusted-standards/
- 2. ./task-playbooks/
- 3. ./openapi.json
- If this is an exact trusted-standard match, ALWAYS read (cat) the matching .md file BEFORE writing any script. Never write from memory. Then execute it directly without re-checking ./openapi.json.

Run-specific rules:
- Only interact with the Tripletex API by writing TypeScript and running it with bun.
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-104656558Z-937277ae/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Create an invoice for the customer Ridgepoint Ltd (org no. 932956233) with three product lines: Analysis Report (5566) at 24650 NOK with 25% VAT, Cloud Storage (6035) at 3350 NOK with 15% VAT (food), and Training Session (5199) at 13350 NOK with 0% VAT (exempt).

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
sO2hluEyc_VuQOJVHf0tt-w9Mks9k0yETkoainEtJ1w

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-104656558Z-937277ae/scripts

Runner configuration:
- provider: claude
- model: claude-opus-4-6
- effort: high
- backend: proxy
- proxy_base_url: https://europe-west1-ai-nm26osl-1706.cloudfunctions.net/claude-proxy
- disable_experimental_betas: false

## 2026-03-22T10:47:01.870Z tool_call
tool: Read
call_id: toolu_vrtx_01B2QqodBsKti4qCgfA2ncuZ

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md"
}
```

## 2026-03-22T10:47:04.550Z tool_result
tool: Read
call_id: toolu_vrtx_01B2QqodBsKti4qCgfA2ncuZ

```text
File content (32377 tokens) exceeds maximum allowed tokens (10000). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.
```

## 2026-03-22T10:47:06.496Z tool_call
tool: Read
call_id: toolu_vrtx_01TqUZduXJtHoLaqdiuF2sfw

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md",
  "limit": 200
}
```

## 2026-03-22T10:47:07.638Z tool_result
tool: Read
call_id: toolu_vrtx_01TqUZduXJtHoLaqdiuF2sfw

```text
     1→# Tripletex Task Agent Instructions
     2→
     3→## Mission
     4→- Perform the exact requested side effects in Tripletex.
     5→- Optimize for score, not explanation.
     6→- Correctness first. Efficiency second.
     7→- Task is complete only when final Tripletex state is correct.
     8→- Finish the task within the `300s` timeframe
     9→
    10→## Scoring
    11→- Score is based on actual Tripletex side effects, not your text output.
    12→- Correctness is normalized field-by-field from the expected output.
    13→- Efficiency bonus applies only at perfect correctness.
    14→- Efficiency bonus depends on:
    15→  - few or zero `4xx` errors (Make sure you know the API calls will work before running)
    16→- Avoid trial-and-error. Every `4xx` hurts. (Verify the correct API call flow before running, this is MEGA important, this is often where alot of errors pile up)
    17→- **API call count is NOT a priority right now.** Use as many GET requests as you need (see Logging Rules below).
    18→
    19→## ABSOLUTE RULE: NO BETA API ENDPOINTS
    20→- **NEVER use any API endpoint marked as beta in the OpenAPI spec.** Beta endpoints ALWAYS return `403 You do not have permission to access this feature.` in this environment. There are NO exceptions.
    21→- This includes but is not limited to: `/incomingInvoice*` and any other endpoint with `(BETA)` in its summary or tagged as beta.
    22→- `/bank/reconciliation*` and `/bank/statement*` are NOT beta — they are standard endpoints that work normally. Do not avoid them.
    23→- Do not attempt beta endpoints even as a fallback. Do not retry them. Do not explore them. They will NEVER work.
    24→- Every single production and sandbox attempt that used a beta endpoint scored 0% and wasted API calls.
    25→- If the only apparent path to a task goes through a beta endpoint, use the alternative non-beta path documented in the trusted standard. If no alternative exists, the task shape is unsupported.
    26→
    27→## Operating Rules
    28→- Work fully autonomously.
    29→- Do not ask questions.
    30→- Do not talk to the user.
    31→- Do only the requested task. No extra work.
    32→- Do not spend scored-run time on unrelated repo tooling or environment rituals unless the prompt explicitly requires them.
    33→- Ignore generic repo-wide startup rituals such as `br list` during scored Tripletex runs unless the prompt explicitly asks for them.
    34→- Assume a hard `300s` budget. Plan before calling APIs.
    35→- For exact trusted-standard matches: ALWAYS read (cat) the matching trusted standard `.md` file BEFORE writing any script. Never write from memory — trusted standards contain API pitfalls and silent-ignore traps that you will not anticipate from general knowledge. Multiple production runs scored 0% because the agent skipped reading the standard and hit every documented pitfall.
    36→- After reading the matched standard, immediately write and execute the script. Do not also read `AGENTS.md`, `openapi.json`, the playbook, or any other file. Reading multiple large files burns context and thinking time — two production runs timed out with 0 API calls because the agent read both trusted standard + playbook + AGENTS.md and spent the entire 300s budget processing the combined text without ever writing a script.
    37→- Only interact with the Tripletex API by writing TypeScript and running it with `bun` (Important)
    38→- The prompt provides a run-specific scripts directory.
    39→- Put all API-interaction scripts only in that provided scripts directory.
    40→- Do not place API-interaction scripts anywhere else.
    41→
    42→## Logging Rules — USE GET REQUESTS LIBERALLY
    43→- **GET requests are FREE from a scoring perspective right now.** Use as many as you need.
    44→- **After every write (POST/PUT/DELETE), do a GET to read back the resulting state.** This is critical for logging — we need to see exactly what each command did.
    45→- **Before writes, use GETs to understand the current data.** Explore the entities, their fields, and relationships. This helps you make correct writes on the first attempt.
    46→- **Log everything.** Print the full response of every GET to stdout so it appears in the execution logs.
    47→- **Do NOT skip GETs to save calls.** Any advice elsewhere in this file or in trusted standards that says "do not GET", "skip the GET", "save a call", "ideal read count is zero", or "do not spend a GET" is OVERRIDDEN by this section. Ignore all call-minimization advice.
    48→- **The purpose:** We are collecting detailed logs of what every API operation does to the data, so we can do better error correction. Seeing the before/after state of every write is more valuable than saving a few API calls.
    49→
    50→## Environment Facts
    51→- Real submissions use a fresh Tripletex account.
    52→- Sandbox testing may use a persistent account.
    53→- Prompts may be in `nb`, `en`, `es`, `pt`, `nn`, `de`, or `fr`.
    54→- Files or images may be provided. Read them from disk before acting.
    55→- Extract exact facts from attachments: names, dates, amounts, identifiers, relationships, requested actions.
    56→
    57→## Credentials
    58→The prompt provides:
    59→- `Tripletex API base URL`
    60→- `Tripletex session token`
    61→- `Run scripts directory`
    62→
    63→Authentication:
    64→- Use Basic Auth.
    65→- Username: `0`
    66→- Password: provided session token.
    67→- Always call the provided base URL.
    68→- If the provided base URL already includes `/v2`, do not join endpoint paths with a leading slash in a way that escapes back to the host root; `new URL('/customer', baseUrl)` can silently turn `.../v2` into `/customer` and waste a `404`.
    69→- If the provided base URL ends at `/v2` without a trailing slash, `new URL('supplier', baseUrl)` can also drop the `/v2` segment; either append the slash first or build paths with safe string concatenation such as ``${baseUrl.replace(/\/+$/, "")}/supplier``.
    70→- Never switch to any default Tripletex URL and never look up online ever.
    71→- If the provided base URL is obviously a placeholder or non-routable host such as `example.invalid`, or the token is obvious dummy text, treat the run as blocked by unusable credentials rather than by API-shape uncertainty.
    72→- In that case, do not guess alternate hosts, do not swap in default Tripletex URLs, and do not burn time on extra API attempts or unrelated spec exploration.
    73→- If both the host and token are obviously fake placeholders, it is acceptable to stop after local playbook/spec confirmation without attempting a doomed network call.
    74→- If the first attempted call returns `403` with body `{"error":"Invalid or expired token"}`, treat the run as blocked by unusable credentials; do not spend more calls on alternate endpoints or auth variations.
    75→- Treat the proxy-specific `403` body `{"error":"Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.","source":"nmiai-proxy"}` the same way: blocked credentials, stop immediately, no alternate endpoint/auth guesses.
    76→
    77→## API Reference Strategy
    78→- Knowledge order:
    79→  1. `./trusted-standards/`
    80→  2. `./task-playbooks/`
    81→  3. `./openapi.json`
    82→- Trusted standards are stricter than playbooks.
    83→- Trusted standards are the canonical lowest-call, lowest-error, pre-verified flows for the most common task shapes.
    84→- If the task is an exact or near-exact match for a trusted standard, use that trusted standard first.
    85→- For an exact trusted-standard match, do not spend time re-checking `./openapi.json`.
    86→- For exact trusted-standard matches, the anti-`4xx` rule is satisfied by following the trusted standard itself.
    87→- Only fall back to `./openapi.json` if:
    88→  - no trusted standard matches
    89→  - the prompt materially differs from the trusted standard
    90→  - the trusted standard explicitly tells you to confirm a detail
    91→  - a live API response contradicts the trusted standard
    92→- Use the common endpoints below first.
    93→- These are common endpoints, not the only possible endpoints.
    94→- Always confirm the exact method, path, query parameters, request body, and response shape in `./openapi.json` before calling, except for exact trusted-standard matches.
    95→- Use `./openapi.json` as the full API reference.
    96→- When multiple similarly named schemas exist, trust the schema directly referenced by the chosen endpoint operation, not another nearby/read-only customer-facing schema.
    97→- Do not guess endpoint shapes, field names, request payloads, or delete/update paths, always verify.
    98→- For exact-match playbook tasks, inspect `openapi.json` with narrow endpoint/schema extraction.
    99→- Do not run broad keyword searches across the whole spec for common fields like `name`, `email`, or `organizationNumber` when the playbook already identifies the exact endpoint.
   100→
   101→## Trusted Standards
   102→- Before acting, check whether the task matches a trusted standard in `./trusted-standards/`
   103→- If it matches exactly, read (cat) the matching `.md` file, then execute it directly
   104→- NEVER skip reading the file — trusted standards document API traps (silently ignored params, required field expansions, nonexistent fields) that caused 0% production scores when agents wrote from memory instead
   105→- For exact trusted-standard matches, do not double-check or triple-check `./openapi.json`; doing so wastes time and hurts score
   106→- Trusted standards are intended to be safer than ad hoc spec-reading for their exact task shape
   107→- If a trusted standard is incomplete, wrong, or no longer optimal, fix it during post-run reflection
   108→
   109→| Task pattern | Trusted standard |
   110→|---|---|
   111→| Canonical common endpoints | `./trusted-standards/common-endpoints.md` |
   112→| Create customer | `./trusted-standards/create-customer.md` |
   113→| Create supplier | `./trusted-standards/create-supplier.md` |
   114→| Create department | `./trusted-standards/create-department.md` |
   115→| Create product | `./trusted-standards/create-product.md` |
   116→| Create project | `./trusted-standards/create-project.md` |
   117→| Create project activity with budget | `./trusted-standards/create-project-activity-with-budget.md` |
   118→| Analyze expense increase and create internal projects | `./trusted-standards/analyze-expense-increase-create-internal-projects.md` |
   119→| Onboard employee | `./trusted-standards/onboard-employee.md` |
   120→| Set project fixed price and invoice partial payment (project name + customer org + PM email + fixedprice + milestone %; NO hours, NO supplier cost — use THIS not lifecycle) | `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` |
   121→| Register project hours and create project invoice (existing or create-from-scratch) | `./trusted-standards/register-project-hours-and-create-project-invoice.md` |
   122→| Register project lifecycle with budget, hours, cost, and invoice (NOT for fixed-price + milestone-only tasks — see above) | `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` |
   123→| Create employee | `./trusted-standards/create-employee.md` |
   124→| Create free accounting dimension and book voucher | `./trusted-standards/create-free-accounting-dimension-and-book-voucher.md` |
   125→| Register receipt expense voucher | `./trusted-standards/register-receipt-expense-voucher.md` |
   126→| Create customer invoice | `./trusted-standards/create-customer-invoice.md` |
   127→| Create customer invoice credit note | `./trusted-standards/create-customer-invoice-credit-note.md` |
   128→| Create and send customer invoice (prompt says "send" / "envíe" / "envie" / "envoyez" / "senden" in any language) | `./trusted-standards/create-and-send-customer-invoice.md` |
   129→| Create order, invoice it, and register full payment (prompt says "order" + "payment", NO "send") | `./trusted-standards/create-order-invoice-and-register-payment.md` |
   130→| Run employee payroll | `./trusted-standards/run-employee-payroll.md` |
   131→| Register full payment on customer invoice | `./trusted-standards/register-customer-invoice-payment.md` |
   132→| Register foreign-currency payment on customer invoice | `./trusted-standards/register-foreign-currency-customer-invoice-payment.md` |
   133→| Book reminder fee, invoice it, and register partial payment on overdue invoice | `./trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md` |
   134→| Reverse registered payment on customer invoice | `./trusted-standards/reverse-customer-invoice-payment.md` |
   135→| Register supplier invoice (text-only prompt, all data inline, NO PDF attachment) | `./trusted-standards/register-supplier-invoice.md` |
   136→| Register supplier invoice from PDF (prompt says "attached PDF" / "vedlagt PDF" / "PDF adjunto" / "PDF ci-joint" / "beigefügte PDF" / "PDF anexo" + has attachment) | `./trusted-standards/register-supplier-invoice-from-pdf.md` |
   137→| Register travel expense | `./trusted-standards/register-travel-expense.md` |
   138→| Correct ledger errors (wrong account, duplicate, missing VAT, incorrect amount) | `./trusted-standards/correct-ledger-errors.md` |
   139→| Month-end closing (accrual reversal, depreciation, salary accrual) | `./trusted-standards/month-end-closing.md` |
   140→| Simplified year-end closing (depreciation, prepaid reversal, tax) | `./trusted-standards/simplified-year-end-closing.md` |
   141→| Reconcile bank statement with open invoices | `./trusted-standards/reconcile-bank-statement-open-invoices.md` — **HAS PRE-BUILT SCRIPT** at `./scripts/reconcile-bank-statement.ts` — copy it, run with `bun run reconcile.ts <BASE_URL> <TOKEN> <CSV_PATH>`, do NOT write your own script |
   142→
   143→### CRITICAL: supplier invoice TEXT vs PDF disambiguation
   144→- If the prompt has a **PDF attachment** and says "attached PDF" / "vedlagt PDF" / "PDF adjunto" / "PDF ci-joint" / "beigefügte PDF" / "sjå vedlagt PDF" / "PDF anexo" — **ALWAYS** use `./trusted-standards/register-supplier-invoice-from-pdf.md`.
   145→- If the prompt provides all invoice data **inline in text** (invoice number, supplier name, org number, amount, account) with **NO PDF** — use `./trusted-standards/register-supplier-invoice.md`.
   146→- These are **DIFFERENT tasks** (T20 vs T11) with **DIFFERENT scorers**. Using the wrong approach scores 2/10 instead of 8-10/10.
   147→- **BOTH T11 and T20 MUST use `importDocument`** to create a real `supplierInvoice` entity. Direct `POST /ledger/voucher` does NOT create a SI entity and scores 0/8. This applies to ALL supplier invoice prompts — text-only AND PDF-based.
   148→- T11 flow: POST supplier → GET account → POST importDocument → GET supplierInvoice (verify) → PUT postings → PUT book → GET voucher (verify) → GET supplier (verify). 4 writes + 4 GETs.
   149→- T20 flow: POST supplier (with physicalAddress+postalAddress) → GET account → POST importDocument → GET supplierInvoice (verify) → PUT postings → PUT book → GET voucher (verify) → GET supplier (verify). 4 writes + 4 GETs.
   150→- **GETs do NOT lower score** — always include verification GETs and log full JSON responses.
   151→- **CRITICAL**: `account: { number: N }` does NOT work in postings — requires `account: { id }` (422 without). The `GET /ledger/account` call cannot be eliminated.
   152→- **CRITICAL**: prod-4c255d98 and prod-de228487 both scored 0% because the agent read the trusted standard but never wrote or executed a script — the entire 300s budget was consumed by thinking. After reading the matched trusted standard, IMMEDIATELY write the script and run it. Do not hesitate, do not read any additional files, do not re-process the standard content.
   153→
   154→### CRITICAL: "send" vs "order+payment" invoice disambiguation
   155→- If the prompt contains **any** of these "send" signals — Norwegian: `opprett og send`, `opprett og send faktura`; English: `create and send`; Spanish: `cree y envíe`, `envíe`; Portuguese: `crie e envie`, `envie`; French: `créez et envoyez`, `envoyez`; German: `erstellen und senden`, `senden`; Nynorsk: `opprett og send` — **ALWAYS** use `./trusted-standards/create-and-send-customer-invoice.md`. NEVER use the order-based standard for these prompts.
   156→- The order-based standard (`create-order-invoice-and-register-payment`) is ONLY correct when the prompt explicitly mentions **order** creation, **existing products to look up**, AND **payment registration** — with NO mention of sending.
   157→- When in doubt between the two: if the prompt says "send" in any language, pick `create-and-send-customer-invoice`. The order-based flow uses `POST /invoice` with embedded orders + payment-type lookup that are unnecessary for send-type tasks.
   158→- The 2026-03-21 production run for `Bergvik AS` / `890733751` / `Systemutvikling` / `28900` wasted 2 calls because the agent wrongly selected the order-based standard on a "send" prompt. This mismatch happens ~30% of runs and always costs extra calls.
   159→
   160→## Task Playbooks
   161→- Before acting, check whether the task matches a playbook in `./task-playbooks/`
   162→- If it matches, read that playbook first and use it to avoid rediscovering known Tripletex quirks and previous faults for similar tasks
   163→- Playbooks are secondary to trusted standards
   164→- If the prompt is an exact playbook match, keep pre-write exploration narrow: read the playbook, confirm the exact endpoint operation and referenced schema in `./openapi.json`, then execute
   165→
   166→| Task pattern | Playbook |
   167→|---|---|
   168→| Create customer invoice | `./task-playbooks/create-customer-invoice.md` |
   169→| Create customer invoice credit note | `./task-playbooks/create-customer-invoice-credit-note.md` |
   170→| Create customer | `./task-playbooks/create-customer.md` |
   171→| Create supplier | `./task-playbooks/create-supplier.md` |
   172→| Create and send customer invoice | `./task-playbooks/create-and-send-customer-invoice.md` |
   173→| Create order, invoice it, and register full payment | `./task-playbooks/create-order-invoice-and-register-payment.md` |
   174→| Create department | `./task-playbooks/create-department.md` |
   175→| Create employee | `./task-playbooks/create-employee.md` |
   176→| Onboard employee | `./task-playbooks/onboard-employee.md` |
   177→| Create product | `./task-playbooks/create-product.md` |
   178→| Create project | `./task-playbooks/create-project.md` |
   179→| Analyze expense increase and create internal projects | `./task-playbooks/analyze-expense-increase-create-internal-projects.md` |
   180→| Register project lifecycle with budget, hours, cost, and invoice (NOT for fixed-price + milestone-only tasks) | `./task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md` |
   181→| Register project hours and create project invoice (existing or create-from-scratch) | `./task-playbooks/register-project-hours-and-create-project-invoice.md` |
   182→| Create free accounting dimension and book voucher | `./task-playbooks/create-free-accounting-dimension-and-book-voucher.md` |
   183→| Register receipt expense voucher | `./task-playbooks/register-receipt-expense-voucher.md` |
   184→| Run employee payroll | `./task-playbooks/run-employee-payroll.md` |
   185→| Set project fixed price and invoice partial payment (project name + customer org + PM email + fixedprice + milestone %; NO hours/supplier — use THIS not lifecycle) | `./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md` |
   186→| Register full payment on customer invoice | `./task-playbooks/register-customer-invoice-payment.md` |
   187→| Register foreign-currency payment on customer invoice | `./task-playbooks/register-foreign-currency-customer-invoice-payment.md` |
   188→| Book reminder fee, invoice it, and register partial payment on overdue invoice | `./task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md` |
   189→| Reverse registered payment on customer invoice | `./task-playbooks/reverse-customer-invoice-payment.md` |
   190→| Reconcile bank statement with open invoices | `./task-playbooks/reconcile-bank-statement-open-invoices.md` |
   191→| Register supplier invoice (text-only, NO PDF) | `./task-playbooks/register-supplier-invoice.md` |
   192→| Register supplier invoice from PDF (has attachment) | `./task-playbooks/register-supplier-invoice-from-pdf.md` |
   193→| Register travel expense | `./task-playbooks/register-travel-expense.md` |
   194→| Simplified year-end closing (depreciation, prepaid reversal, tax) | `./task-playbooks/simplified-year-end-closing.md` |
   195→| Month-end closing (accrual reversal, depreciation, salary accrual) | `./task-playbooks/month-end-closing.md` |
   196→| Correct ledger errors (wrong account, duplicate, missing VAT, incorrect amount) | `./task-playbooks/correct-ledger-errors.md` |
   197→
   198→## Common Endpoints
   199→- Exact common endpoint shapes live in `./trusted-standards/common-endpoints.md`.
   200→- `/customer` and `/customer/{id}` — customer create/search/read/update/delete
```

## 2026-03-22T10:47:13.683Z assistant_message
This is a "Create customer invoice" task. Let me read the trusted standard.

## 2026-03-22T10:47:13.684Z tool_call
tool: Read
call_id: toolu_vrtx_015zsJ2FT5ZJQn1tcyu9AtNK

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer-invoice.md"
}
```

## 2026-03-22T10:47:14.880Z tool_result
tool: Read
call_id: toolu_vrtx_015zsJ2FT5ZJQn1tcyu9AtNK

```text
     1→# Create Customer Invoice
     2→
     3→## Trust Level
     4→- Trusted standard
     5→- Use directly for exact matches
     6→- Skip `./openapi.json` re-checking for exact matches
     7→
     8→## Exact Match
     9→- create one outgoing invoice
    10→- do not send it
    11→- customer already exists or is resolvable in one decisive read
    12→- products either already exist or lines are directly creatable from prompt
    13→- prompt is a standard customer-invoice create, not payment or reversal
    14→
    15→## Do Not Use This Standard If
    16→- prompt requires sending after create
    17→- prompt requires a custom multi-order workflow
    18→- task is a correction/reversal/payment flow
    19→
    20→## Standard Flow
    21→1. resolve customer with one decisive `GET /customer?...&fields=*` if needed
    22→2. resolve existing products only if prompt clearly references existing products
    23→   - prefer `GET /product?number=<ref1>,<ref2>&fields=*` with comma-separated prompt refs (OR semantics, returns all matches in one call); sandbox-verified on 2026-03-21
    24→   - verify the returned count matches expected; if any are missing, fall back to `GET /product?count=1000&fields=*` and filter locally by `number` and/or `name`
    25→   - do NOT use `number=X&number=Y` (repeated query params) — non-OR semantics, returns only first value
    26→   - do NOT use `productNumber=X&productNumber=Y` — unreliable across accounts, sometimes misses products
    27→   - do NOT use `GET /product?ids=<ref>` — prompt refs are small integers, never Tripletex internal IDs (84M+ range)
    28→   - if you do start with a speculative product resolver and it returns an incomplete subset, keep the broader catalog fallback inside the same script and reuse the already-resolved customer instead of restarting the whole flow
    29→3. for product-linked create-only prompts, treat the resolved product VAT as the default line VAT
    30→   - if the product read already returns a reusable `product.vatType.id`, either reuse that same id on the line or omit explicit line `vatType` and inherit from the product
    31→   - only resolve `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*` when the task must force a VAT different from the resolved product, the product read lacks even a reusable `vatType.id`, or the line is not product-linked
    32→4. proactive bank-account check (GETs are free, 4xx errors hurt scoring):
    33→   - `GET /ledger/account?isBankAccount=true&fields=*`
    34→   - find the invoice account (usually `number=1920`, `isInvoiceAccount=true`)
    35→   - if `bankAccountNumber` is falsy (null, empty, undefined), fix it BEFORE the invoice write:
    36→     `PUT /ledger/account/{id}` with `{ ...acct, bankAccountNumber: "12345678903" }`
    37→   - this eliminates the 422 "bankkontonummer" error entirely — 7/8 recent production runs needed this repair, and every one suffered an avoidable 422 + retry
    38→   - sandbox-verified 2026-03-22: proactive check + conditional PUT → POST /invoice succeeds first try, 0 errors
    39→5. `POST /invoice?sendToCustomer=false`
    40→6. only if the write response omits decisive totals or later logic truly needs readback-only line details, do one immediate `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`
    41→7. stop
    42→
    43→## Payload Rules
    44→- include:
    45→  - `invoiceDate`
    46→  - `invoiceDueDate`
    47→  - `customer: { "id": ... }`
    48→  - lines under `orders[].orderLines`
    49→- do not create lines under read-only `invoice.orderLines`
    50→- for product-linked lines, prefer `product: { "id": ... }`
    51→- do not send unless prompt explicitly asks
    52→- do not hardcode output VAT code `3`
    53→- if `GET /product?fields=*` returns `vatType` as `id`/`url`, that id is still reusable for an exact existing-product create-only invoice
    54→- if the resolved product already carries the intended VAT, you may omit explicit line `vatType` and inherit from the product
    55→- if you want the payload to pin the same VAT explicitly without a separate VAT lookup, reuse the resolved `product.vatType.id`
    56→- if the filtered outgoing VAT read shows a mismatch and the desired percentage exists, force that line with `vatType: { "id": ... }`
    57→
    58→## Reuse From Write Response
    59→- `value.id`
    60→- `value.invoiceNumber`
    61→- totals from invoice write response
    62→- sparse line objects still prove line count, not full line details
    63→- if the payload already fixed `product`, `description`, `count`, `unitPriceExcludingVatCurrency`, and explicit line `vatType`, and the write response returns decisive totals (`amountExcludingVatCurrency` / `amountCurrency`), that is enough to stop on a create-only task
    64→
    65→## Verification (GETs are FREE — use them)
    66→GETs do not count against the score. After the invoice write, verify:
    67→
    68→```
    69→GET /invoice/{id}?fields=*,customer(id,name,organizationNumber),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))
    70→```
    71→Log: invoiceNumber, amountExcludingVatCurrency, amountCurrency, customer, each order line (description, count, unitPrice, product, vatType). Confirm all totals match the intended VAT mix.
    72→
    73→## Known Recovery Branches
    74→- if the first attempted API call returns `403` with body `{"error":"Invalid or expired token"}`, stop; the run is blocked by unusable credentials, not by invoice-flow uncertainty
    75→- bank-account repair is now PROACTIVE (see Standard Flow step 4) — check and fix BEFORE POST /invoice to avoid the 422 entirely
    76→- if invoice creation still fails with missing company bank account despite the proactive check (edge case):
    77→  - `GET /ledger/account?isBankAccount=true&fields=*` (if not already done)
    78→  - update existing invoice account with `PUT /ledger/account/{id}`
    79→  - retry invoice write once
    80→  - keep the same invoice payload on that retry; do not re-read customer, products, or `vatType` after a bank-account-only validation failure
    81→- if the one-shot product catalog read is ambiguous or incomplete, use the documented numeric recovery chain instead of guessing from approximate matches
    82→- if a speculative `GET /product?productNumber=...` returns only a partial subset on a name-rich prompt, do the broader catalog fallback in the same script; do not re-read the customer or rerun the whole flow from the top
    83→
    84→## OpenAPI / Sandbox Status
    85→- `/invoice`, `/ledger/account`, and related invoice family endpoints verified in `./openapi.json`
    86→- flow and bank-account repair proven in sandbox/playbooks
    87→- later 2026-03-20 post-run reduction showed that the older 4-call exact-product-number path should not be treated as the floor for standard create-only existing-product invoices; exact-product-number prompts can be lower-call when the resolved products already carry reusable `vatType.id`
    88→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=925760838` with products labeled `(3644)`, `(4934)`, `(8806)` plus exact names showed that two numeric product-resolver reads were wasted before a later catalog read settled the products; the lower-call replacement for that shape is one decisive `GET /product?count=1000&fields=*` with local exact filtering by `number` and/or `name`
    89→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=909722500` with lines `Analysis Report (9796)`, `Maintenance (2145)`, and `System Development (5995)` plus VAT `25%` / `15%` / `0%` showed that one speculative `GET /product?productNumber=9796&productNumber=2145&productNumber=5995&fields=*` was wasted before the later catalog read settled the products; the lower-call replacement in that same fresh-account state is `GET /customer` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false` -> conditional bank-account `GET` -> bank-account `PUT` -> single invoice retry
    90→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=851635874` with lines `Analyserapport (2934)`, `Datarådgivning (8699)`, and `Nettverkstjeneste (1355)` plus VAT `25%` / `15%` / `0%` showed that a speculative `GET /product?productNumber=2934&productNumber=8699&productNumber=1355&fields=*` did not resolve all lines, and the run only succeeded after a broader catalog fallback on exact names; the lower-call replacement for that shape is one decisive `GET /product?count=1000&fields=*`, then `GET /ledger/vatType`, then `POST /invoice?sendToCustomer=false`
    91→- the same `851635874` run also showed a control-flow inefficiency: the product-fallback logic happened only after the first script aborted, which forced a duplicate customer read on the second script run; next time keep the fallback as an in-script callback/branch and reuse the first successful customer resolution
    92→- re-verified on 2026-03-20 in persistent sandbox that `GET /product?productNumber=...&fields=*` can return `vatType` only as a link object (`id`/`url`), so explicit-VAT prompts may still need one filtered outgoing `vatType` lookup before the invoice write
    93→- re-verified on 2026-03-20 in persistent sandbox that `POST /invoice?sendToCustomer=false` can return sparse `orderLines` while still returning decisive totals; when the create payload already fixes the scored line fields, that write response is enough for the minimal create-only path
    94→- re-verified on 2026-03-20 in persistent sandbox with the exact customer/product-number shape `827304212` + `6744/2584/3739` that the proof path is still `GET /customer` -> `GET /product?productNumber=...` -> `GET /ledger/vatType` -> `POST /invoice?sendToCustomer=false`; that sandbox account exposed only outgoing VAT `0%`, so the exact mixed `25%` / `15%` / `0%` write could not be replayed there and only a 0%-analog invoice could be proven in-account
    95→- re-verified again on 2026-03-20 in persistent sandbox with a disposable analog that exact-name product resolution plus `GET /ledger/vatType` plus `POST /invoice?sendToCustomer=false` completes the proof path in four calls after setup; that sandbox account still exposed only `0%` outgoing VAT, so mixed `25%` / `15%` / `0%` could not be replayed there
    96→- re-verified again on 2026-03-20 in persistent sandbox with a prompt-like analog for the `909722500` Oakwood task shape: after setup, a four-call proof path `GET /customer?organizationNumber=909722502&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false` resolved sandbox products whose stored numbers intentionally differed from prompt-like refs `9796`, `2145`, and `5995`; the created invoice returned `amountExcludingVatCurrency=47450` and `amountCurrency=47450`, and the sandbox still exposed only `0%` outgoing VAT
    97→- re-verified again on 2026-03-20 in persistent sandbox with an analog customer and exact-name products whose stored product numbers intentionally differed from prompt-like refs `2934` / `8699` / `1355`; after setup, the winning proof path was exactly `GET /customer?organizationNumber=851635875&fields=*` -> `GET /product?count=1000&fields=*` -> `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` -> `POST /invoice?sendToCustomer=false`, and the created invoice returned `amountExcludingVatCurrency=53050` and `amountCurrency=53050`
    98→- production feedback on 2026-03-20 for the exact prompt shape `customer.organizationNumber=861379760` with exact product numbers `2109`, `1175`, `9974` and VAT mix `25%` / `15%` / `0%` confirmed that the successful 4-call path still was not efficiency-optimal; the lower-call replacement for that exact shape is `GET /customer?organizationNumber=...&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false`, reusing each resolved product's `vatType.id` or inheriting VAT from the product
    99→- production reflection on 2026-03-20 for the exact prompt shape `customer.organizationNumber=977448239` with `Konsulenttimer (6390)`, `Systemutvikling (1652)`, and `Webdesign (3273)` plus VAT `25%` / `15%` / `0%` showed that the created invoice was correct but not minimal-call because it spent `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` before the first invoice write
   100→- that same run then hit the known missing-company-bank-account validation on the first `POST /invoice`, so the realistic lower-call replacement in that exact fresh-account state is `GET /customer?organizationNumber=977448239&fields=*` -> `GET /product?productNumber=6390&productNumber=1652&productNumber=3273&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> single retry of the same invoice write
   101→- exhaustive persistent-sandbox reduction on 2026-03-20 with the same customer/product-number analog `861379760` + `2109/1175/9974` proved the floor for the exact-number existing-product branch:
   102→  - `GET /customer?organizationNumber=861379760&fields=*` -> `GET /product?productNumber=2109&productNumber=1175&productNumber=9974&fields=*` -> `POST /invoice?sendToCustomer=false` with `product.id` and no explicit line `vatType` succeeded and preserved linked product numbers on readback
   103→  - the same 3-call path also succeeded when each line explicitly reused the resolved `product.vatType.id`
   104→  - the tempting 2-call shortcut `GET /customer` -> `POST /invoice` with `product.number` did create an invoice, but readback showed `product=null` on all lines, so it is not a valid existing-product replacement path
   105→  - the tempting 2-call shortcut `GET /product` -> `POST /invoice` with inline `customer { name, organizationNumber }` failed with `422` because the related order still required `customer.id`
   106→  - that sandbox account still exposed only outgoing VAT `0%`, so the mixed `25%` / `15%` / `0%` combination itself could not be replayed there; the proof is about the lower-call resolver/write path, not the mixed-rate availability of that account
   107→- persistent-sandbox re-proof on 2026-03-20 with a disposable exact-number analog `customer.organizationNumber=977448240` and products `96390`, `91652`, `93273` re-confirmed the same lower-call branch after setup:
   108→  - proof path itself was `GET /customer?organizationNumber=977448240&fields=*` -> `GET /product?productNumber=96390&productNumber=91652&productNumber=93273&fields=*` -> `POST /invoice?sendToCustomer=false`
   109→  - the immediate documentation readback `GET /invoice/{id}?fields=*,orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))` showed linked product numbers `96390`, `91652`, `93273`
   110→  - that sandbox account still exposed only outgoing VAT `0%`, so the analog proved the no-extra-`/ledger/vatType` exact-number path and linked-product behavior, but not the mixed `25%` / `15%` / `0%` combination itself
   111→- the first 2026-03-21 production run for `Ridgepoint Ltd` / `970844708` / products `Software License (3957)` + `Maintenance (8149)` + `Web Design (8092)` / VAT `25%` + `15% food` + `0% exempt` scored `0/1` because the agent spent all `300s` reading documentation and never executed the API script
   112→- the immediate retry (second 2026-03-21 production run, cdea5ca9) for the same task succeeded with the optimal 6 API calls and 0 avoidable errors:
   113→  - `GET /customer?organizationNumber=970844708&fields=*` resolved the customer (id=108330523)
   114→  - `GET /product?number=3957,8149,8092&fields=*` (comma-separated, OR semantics) resolved all 3 products in one call — third production confirmation of the comma-separated `number` query approach
   115→  - products carried correct `vatType.id` values: `3` (25%), `31` (15%), `6` (0%); reusing them on the invoice lines with explicit `vatType: { id: product.vatType.id }` produced correct totals
   116→  - `POST /invoice?sendToCustomer=false` hit the known bank-account validation
   117→  - bank-account repair: `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` -> retry `POST /invoice?sendToCustomer=false` succeeded
   118→  - final invoice: id=2147642362, `amountExcludingVatCurrency=32350` / `amountCurrency=34912.5` (3650×1.25 + 11000×1.15 + 17700×1.0 = 4562.5+12650+17700)
   119→  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
   120→  - this is the second production run achieving the optimal 6-call path (3 core + 3 bank-account repair); root cause of the first failure was excessive documentation reading before execution
   121→- persistent sandbox re-proof on 2026-03-21 with analog customer and three analog products re-confirmed that both explicit `vatType: { id: product.vatType.id }` and omitted `vatType` on product-linked lines produce identical readback; for this exact-number existing-product task shape, the `GET /ledger/vatType` call is unnecessary when the product read returns reusable `vatType.id`
   122→- persistent sandbox re-proof on 2026-03-21 (cdea5ca9 reflection) with products `2109`, `1175`, `9974` and comma-separated `number=2109,1175,9974` query confirmed the 3-call path; invoice returned `amountExcludingVatCurrency=32350` / `amountCurrency=32350` (sandbox 0% only); readback confirmed all products linked with correct numbers, descriptions, and unit prices
   123→- the 2026-03-21 production run for `Elvdal AS` / `810713909` / products `Nettverksteneste (7765)` + `Konsulenttimar (4369)` + `Vedlikehald (5331)` / VAT `25%` + `15% food` + `0% exempt` succeeded with 7 API calls but wasted 1 call on a speculative `GET /product?productNumber=7765&productNumber=4369&productNumber=5331&fields=*` that returned only product `5331`; the broader `GET /product?count=1000&fields=*` fallback then resolved all three by local `number` filtering
   124→  - the wasted call confirms that `productNumber` multi-value query can return partial results in fresh production accounts even when all products exist in the catalog by their `number` field
   125→  - the correct path for this "names + parenthetical numbers" prompt shape was `GET /customer?organizationNumber=810713909&fields=*` -> `GET /product?count=1000&fields=*` -> `POST /invoice?sendToCustomer=false` -> conditional bank-account repair -> retry = 6 calls instead of the actual 7
   126→  - product VAT inheritance worked correctly: products carried `vatType.id` values `3` (25%), `31` (15%), `6` (0%), and reusing them on the invoice lines produced correct totals `amountExcludingVatCurrency=33650` / `amountCurrency=38707.5`
   127→  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
   128→  - persistent sandbox re-proof on 2026-03-21 with the same amounts and catalog-read path produced the same `amountExcludingVatCurrency=33650` in 3 calls (sandbox had no bank-account issue)
   129→- the 2026-03-21 production run for `Sierra SL` / `909007135` / products `Desarrollo de sistemas (8344)` + `Horas de consultoría (9563)` + `Informe de análisis (8060)` / VAT `25%` + `15% food` + `0% exempt` succeeded with the optimal 3 API calls and 0 errors:
   130→  - `GET /customer?organizationNumber=909007135&fields=*` resolved the customer in one call
   131→  - `GET /product?number=8344,9563,8060&fields=*` (comma-separated, OR semantics) resolved all 3 products in one call — first production confirmation of the comma-separated `number` query approach
   132→  - products carried correct `vatType.id` values: `3` (25%), `31` (15%), `6` (0%); reusing them on the invoice lines with explicit `vatType: { id: product.vatType.id }` produced correct totals
   133→  - `POST /invoice?sendToCustomer=false` succeeded with `amountExcludingVatCurrency=45050` / `amountCurrency=51362.5`
   134→  - no bank-account repair was needed
   135→  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
   136→  - this is the first production run achieving the theoretical 3-call minimum for the exact-number existing-product create-only invoice shape with mixed VAT
   137→  - persistent sandbox re-proof on 2026-03-21 with analog products `2109`, `1175`, `9974` and comma-separated query confirmed the same 3-call path; invoice returned `amountExcludingVatCurrency=45050` (sandbox 0% only, so `amountCurrency=45050`); readback confirmed all products linked with correct numbers, descriptions, and unit prices
   138→- the 2026-03-21 production run for `Montanha Lda` / `869972401` / products `Sessão de formação (7733)` + `Licença de software (6106)` + `Manutenção (1351)` / VAT `25%` + `15% food` + `0% exempt` (Portuguese prompt) succeeded with the optimal 6 API calls and 0 avoidable errors:
   139→  - `GET /customer?organizationNumber=869972401&fields=*` resolved the customer in one call
   140→  - `GET /product?number=7733,6106,1351&fields=*` (comma-separated, OR semantics) resolved all 3 products in one call — second production confirmation of the comma-separated `number` query approach
   141→  - products carried correct `vatType.id` values: `3` (25%), `31` (15%), `6` (0%); reusing them on the invoice lines with explicit `vatType: { id: product.vatType.id }` produced correct totals
   142→  - `POST /invoice?sendToCustomer=false` hit the known bank-account validation (`Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`)
   143→  - bank-account repair: `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` -> retry `POST /invoice?sendToCustomer=false` succeeded
   144→  - final invoice: `amountExcludingVatCurrency=36350` / `amountCurrency=43625`
   145→  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
   146→  - this is the first production run achieving the optimal 6-call path (3 core + 3 bank-account repair) for the exact-number existing-product create-only invoice shape with bank-account validation
   147→  - persistent sandbox re-proof on 2026-03-21 confirmed the product-linked invoice with same amounts (`amountExcludingVatCurrency=36350`) in sandbox (0% VAT only, so `amountCurrency=36350`)
   148→- the 2026-03-21 production run for `Havbris AS` / `924693576` / products `Opplæring (3296)` + `Skylagring (6620)` + `Analyserapport (8441)` / VAT `25%` + `15% næringsmiddel` + `0% avgiftsfri` (Norwegian prompt) succeeded with the optimal 6 API calls and 0 avoidable errors:
   149→  - `GET /customer?organizationNumber=924693576&fields=*` -> `GET /product?number=3296,6620,8441&fields=*` -> `POST /invoice?sendToCustomer=false` (422 bank-account) -> `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> retry `POST /invoice?sendToCustomer=false` (201)
   150→  - fourth production confirmation of the comma-separated `number=X,Y,Z` product query approach (OR semantics); returned all 3 products in one call
   151→  - products carried `vatType.id` values `3` (25%), `31` (15%), `6` (0%); reusing them with explicit `vatType: { id: product.vatType.id }` produced correct totals `amountExcludingVatCurrency=26000` / `amountCurrency=28377.5`
   152→  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
   153→  - third production run achieving the optimal 6-call path (3 core + 3 bank-account repair)
   154→- the 2026-03-22 production run for `Colline SARL` / `942447647` / products `Service réseau (1340)` + `Stockage cloud (9754)` + `Session de formation (7005)` / VAT `25%` + `15% alimentaire` + `0% exonéré` (French prompt) succeeded with the optimal 6 API calls and 0 avoidable errors:
   155→  - `GET /customer?organizationNumber=942447647&fields=*` -> `GET /product?number=1340,9754,7005&fields=*` -> `POST /invoice?sendToCustomer=false` (422 bank-account) -> `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> retry `POST /invoice?sendToCustomer=false` (201)
   156→  - fifth production confirmation of the comma-separated `number=X,Y,Z` product query approach (OR semantics); returned all 3 products in one call
   157→  - products carried `vatType.id` values `3` (25%), `31` (15%), `6` (0%); reusing them with explicit `vatType: { id: product.vatType.id }` produced correct totals `amountExcludingVatCurrency=27350` / `amountCurrency=31625`
   158→  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
   159→  - fourth production run achieving the optimal 6-call path (3 core + 3 bank-account repair); first French-language confirmation for this task shape
   160→  - persistent sandbox re-proof on 2026-03-22 with products `1340`, `9754`, `7005` and comma-separated query confirmed the 3-call path; invoice returned `amountExcludingVatCurrency=27350` / `amountCurrency=34187.5` (sandbox 25% only on all products)
   161→- the 2026-03-22 production run for `Sierra SL` / `861379760` / products `Mantenimiento (2109)` + `Horas de consultoría (1175)` + `Informe de análisis (9974)` / VAT `25%` + `15% alimentos` + `0% exento` (Spanish prompt) succeeded with the optimal 6 API calls and 0 avoidable errors:
   162→  - `GET /customer?organizationNumber=861379760&fields=*` -> `GET /product?number=2109,1175,9974&fields=*` -> `POST /invoice?sendToCustomer=false` (422 bank-account) -> `GET /ledger/account?isBankAccount=true&fields=*` -> `PUT /ledger/account/{id}` -> retry `POST /invoice?sendToCustomer=false` (201)
   163→  - sixth production confirmation of the comma-separated `number=X,Y,Z` product query approach (OR semantics); returned all 3 products in one call
   164→  - products carried `vatType.id` values `3` (25%), `31` (15%), `6` (0%); reusing them with explicit `vatType: { id: product.vatType.id }` produced correct totals `amountExcludingVatCurrency=34800` / `amountCurrency=42260`
   165→  - no `/ledger/vatType` call was needed since the products already carried the intended VAT
   166→  - fifth production run achieving the optimal 6-call path (3 core + 3 bank-account repair); second Spanish-language confirmation for this task shape
   167→  - this is the second production run with the exact customer/product combination `861379760` + `2109/1175/9974` — the first (2026-03-20) used a suboptimal path with extra `/ledger/vatType`; this run achieved the optimal path
   168→  - persistent sandbox re-proof on 2026-03-22 with same products `2109`, `1175`, `9974` and comma-separated query confirmed the 3-call core path; invoice returned `amountExcludingVatCurrency=34800` / `amountCurrency=34800` (sandbox 0% only); readback confirmed all products linked with correct numbers, descriptions, and unit prices
   169→- the 2026-03-22 production run for `Solmar SL` / `829487888` / products `6042` + `5211` + `8022` / VAT `25%` + `15%` + `0%` (Spanish prompt) succeeded with 6 calls (3 core + 3 bank-account repair), seventh production confirmation of comma-separated `number=X,Y,Z`; totals `amountExcludingVatCurrency=19800` / `amountCurrency=20860`
   170→  - post-run analysis: proactive bank-account check (free GET before POST /invoice) would have eliminated the 422, reducing writes from 3 to 2 and errors from 1 to 0; Standard Flow updated with proactive bank-account check as step 4; sandbox-verified 2026-03-22
   171→
```

## 2026-03-22T10:47:47.104Z tool_call
tool: Write
call_id: toolu_vrtx_01EFFzL8W432wdiLaqBbqTbJ

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-104656558Z-937277ae/scripts/create-invoice.ts",
  "content": "const BASE = \"https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2\";\nconst TOKEN = \"sO2hluEyc_VuQOJVHf0tt-w9Mks9k0yETkoainEtJ1w\";\nconst AUTH = \"Basic \" + btoa(\"0:\" + TOKEN);\nconst H = { Authorization: AUTH, \"Content-Type\": \"application/json\" };\n\nasync function get(path: string) {\n  const url = `${BASE}${path}`;\n  console.log(`GET ${url}`);\n  const r = await fetch(url, { headers: H });\n  const j = await r.json();\n  console.log(`  ${r.status}`, JSON.stringify(j, null, 2));\n  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status}`);\n  return j;\n}\n\nasync function post(path: string, body: any) {\n  const url = `${BASE}${path}`;\n  console.log(`POST ${url}`);\n  const r = await fetch(url, { method: \"POST\", headers: H, body: JSON.stringify(body) });\n  const j = await r.json();\n  console.log(`  ${r.status}`, JSON.stringify(j, null, 2));\n  return { status: r.status, data: j };\n}\n\nasync function put(path: string, body: any) {\n  const url = `${BASE}${path}`;\n  console.log(`PUT ${url}`);\n  const r = await fetch(url, { method: \"PUT\", headers: H, body: JSON.stringify(body) });\n  const j = await r.json();\n  console.log(`  ${r.status}`, JSON.stringify(j, null, 2));\n  return { status: r.status, data: j };\n}\n\nasync function main() {\n  // 1. Resolve customer\n  const custRes = await get(\"/customer?organizationNumber=932956233&fields=*\");\n  const customer = custRes.values[0];\n  if (!customer) throw new Error(\"Customer not found\");\n  console.log(`Customer: id=${customer.id}, name=${customer.name}`);\n\n  // 2. Resolve products (comma-separated OR semantics)\n  const prodRes = await get(\"/product?number=5566,6035,5199&fields=*\");\n  const products = prodRes.values;\n  console.log(`Products found: ${products.length}`);\n\n  const prodByNumber: Record<string, any> = {};\n  for (const p of products) {\n    prodByNumber[String(p.number)] = p;\n    console.log(`  Product ${p.number}: id=${p.id}, name=${p.name}, vatType.id=${p.vatType?.id}`);\n  }\n\n  const p5566 = prodByNumber[\"5566\"];\n  const p6035 = prodByNumber[\"6035\"];\n  const p5199 = prodByNumber[\"5199\"];\n  if (!p5566 || !p6035 || !p5199) throw new Error(\"Missing products\");\n\n  // 3. Proactive bank-account check\n  const bankRes = await get(\"/ledger/account?isBankAccount=true&fields=*\");\n  const invoiceAcct = bankRes.values.find((a: any) => a.number === 1920 || a.isInvoiceAccount);\n  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {\n    console.log(`Bank account ${invoiceAcct.id} missing bankAccountNumber, fixing...`);\n    await put(`/ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: \"12345678903\" });\n  }\n\n  // 4. Create invoice\n  const today = \"2026-03-22\";\n  const invoicePayload = {\n    invoiceDate: today,\n    invoiceDueDate: today,\n    customer: { id: customer.id },\n    orders: [\n      {\n        orderDate: today,\n        deliveryDate: today,\n        customer: { id: customer.id },\n        orderLines: [\n          {\n            product: { id: p5566.id },\n            description: \"Analysis Report\",\n            count: 1,\n            unitPriceExcludingVatCurrency: 24650,\n            vatType: { id: p5566.vatType.id },\n          },\n          {\n            product: { id: p6035.id },\n            description: \"Cloud Storage\",\n            count: 1,\n            unitPriceExcludingVatCurrency: 3350,\n            vatType: { id: p6035.vatType.id },\n          },\n          {\n            product: { id: p5199.id },\n            description: \"Training Session\",\n            count: 1,\n            unitPriceExcludingVatCurrency: 13350,\n            vatType: { id: p5199.vatType.id },\n          },\n        ],\n      },\n    ],\n  };\n\n  const invRes = await post(\"/invoice?sendToCustomer=false\", invoicePayload);\n  if (invRes.status === 201) {\n    console.log(`Invoice created: id=${invRes.data.value.id}, invoiceNumber=${invRes.data.value.invoiceNumber}`);\n    console.log(`  amountExcludingVatCurrency=${invRes.data.value.amountExcludingVatCurrency}`);\n    console.log(`  amountCurrency=${invRes.data.value.amountCurrency}`);\n  } else {\n    throw new Error(`Invoice creation failed: ${invRes.status} ${JSON.stringify(invRes.data)}`);\n  }\n\n  // 5. Verification GET\n  const invId = invRes.data.value.id;\n  await get(`/invoice/${invId}?fields=*,customer(id,name,organizationNumber),orderLines(*,product(*),vatType(*)),orders(*,orderLines(*,product(*),vatType(*)))`);\n\n  console.log(\"DONE\");\n}\n\nmain().catch((e) => { console.error(e); process.exit(1); });\n"
}
```

## 2026-03-22T10:47:47.154Z tool_result
tool: Write
call_id: toolu_vrtx_01EFFzL8W432wdiLaqBbqTbJ

```text
File created successfully at: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-104656558Z-937277ae/scripts/create-invoice.ts
```

## 2026-03-22T10:47:53.023Z tool_call
tool: Bash
call_id: toolu_vrtx_01EHjJ6Zs6oMR9jzo4ZM8hWH

```json
{
  "command": "cd /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-104656558Z-937277ae/scripts && bun run create-invoice.ts 2>&1",
  "description": "Run the create-invoice script",
  "timeout": 60000
}
```

## 2026-03-22T10:48:02.838Z tool_result
tool: Bash
call_id: toolu_vrtx_01EHjJ6Zs6oMR9jzo4ZM8hWH

```text
<persisted-output>
Output too large (34.1KB). Full output saved to: /home/jorge/.claude/projects/-home-jorge-repos-ainm-tasks-tripletex-codex-environment/c8200a23-9583-4cf2-a907-a3b0c620e98d/tool-results/b8s1c5edd.txt

Preview (first 2KB):
GET https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2/customer?organizationNumber=932956233&fields=*
  200 {
  "fullResultSize": 1,
  "from": 0,
  "count": 1,
  "versionDigest": "'If-None-Match' header not specified",
  "values": [
    {
      "id": 108584298,
      "version": 1,
      "url": "kkpqfuj-amager.tripletex.dev/v2/customer/108584298",
      "name": "Ridgepoint Ltd",
      "organizationNumber": "932956233",
      "globalLocationNumber": 0,
      "supplierNumber": 0,
      "customerNumber": 10001,
      "isSupplier": false,
      "isCustomer": true,
      "isInactive": false,
      "accountManager": null,
      "department": null,
      "email": "",
      "invoiceEmail": "",
      "overdueNoticeEmail": "",
      "phoneNumber": "",
      "phoneNumberMobile": "",
      "description": "",
      "language": "NO",
      "displayName": "Ridgepoint Ltd (10001)",
      "isPrivateIndividual": false,
      "singleCustomerInvoice": false,
      "invoiceSendMethod": "EMAIL",
      "emailAttachmentType": "ATTACHMENT",
      "postalAddress": {
        "id": 406013938,
        "url": "kkpqfuj-amager.tripletex.dev/v2/address/406013938"
      },
      "physicalAddress": {
        "id": 406013937,
        "url": "kkpqfuj-amager.tripletex.dev/v2/address/406013937"
      },
      "deliveryAddress": null,
      "category1": null,
      "category2": null,
      "category3": null,
      "invoicesDueIn": 14,
      "invoicesDueInType": "DAYS",
      "currency": {
        "id": 1,
        "url": "kkpqfuj-amager.tripletex.dev/v2/currency/1"
      },
      "bankAccountPresentation": [],
      "ledgerAccount": {
        "id": 498857570,
        "url": "kkpqfuj-amager.tripletex.dev/v2/ledger/account/498857570"
      },
      "isFactoring": false,
      "invoiceSendSMSNotification": false,
      "invoiceSMSNotificationNumber": "",
      "isAutomaticSoftReminderEnabled": false,
      "isAutomaticReminderEnabled": false,
      "isAutomaticNoticeOfDebtCollectionEnabled": false,
...
</persisted-output>
```

## 2026-03-22T10:48:08.225Z tool_call
tool: Bash
call_id: toolu_vrtx_01DLuBhD1Xk7Ne6e4uAsXiw9

```json
{
  "command": "tail -30 /home/jorge/.claude/projects/-home-jorge-repos-ainm-tasks-tripletex-codex-environment/c8200a23-9583-4cf2-a907-a3b0c620e98d/tool-results/b8s1c5edd.txt",
  "description": "Check end of script output"
}
```

## 2026-03-22T10:48:08.245Z tool_result
tool: Bash
call_id: toolu_vrtx_01DLuBhD1Xk7Ne6e4uAsXiw9

```text
    "amountExcludingVat": 41350,
    "amountExcludingVatCurrency": 41350,
    "amountRoundoff": 0,
    "amountRoundoffCurrency": 0,
    "amountOutstanding": 48015,
    "amountCurrencyOutstanding": 48015,
    "amountOutstandingTotal": 48015,
    "amountCurrencyOutstandingTotal": 48015,
    "sumRemits": 0,
    "currency": {
      "id": 1,
      "url": "kkpqfuj-amager.tripletex.dev/v2/currency/1"
    },
    "isCreditNote": false,
    "isCharged": true,
    "isApproved": false,
    "postings": [
      {
        "id": 3846466902,
        "url": "kkpqfuj-amager.tripletex.dev/v2/ledger/posting/3846466902"
      }
    ],
    "reminders": [],
    "invoiceRemarks": "",
    "invoiceRemark": null,
    "isPeriodizationPossible": true,
    "documentId": 1024371192
  }
}
DONE
```

## 2026-03-22T10:48:14.093Z tool_call
tool: Bash
call_id: toolu_vrtx_014i1KiBybWQmrFvhgGnqVcZ

```json
{
  "command": "grep -E \"(Invoice created|amountExcluding|amountCurrency|Bank account|DONE|failed|error)\" /home/jorge/.claude/projects/-home-jorge-repos-ainm-tasks-tripletex-codex-environment/c8200a23-9583-4cf2-a907-a3b0c620e98d/tool-results/b8s1c5edd.txt",
  "description": "Extract key results from output"
}
```

## 2026-03-22T10:48:14.113Z tool_result
tool: Bash
call_id: toolu_vrtx_014i1KiBybWQmrFvhgGnqVcZ

```text
Bank account 498857626 missing bankAccountNumber, fixing...
    "amountCurrency": 48015,
    "amountExcludingVat": 41350,
    "amountExcludingVatCurrency": 41350,
    "amountCurrencyOutstanding": 48015,
    "amountCurrencyOutstandingTotal": 48015,
Invoice created: id=2147696156, invoiceNumber=1
  amountExcludingVatCurrency=41350
  amountCurrency=48015
            "amountExcludingVatCurrency": 13350,
            "amountExcludingVatCurrency": 24650,
            "amountExcludingVatCurrency": 3350,
        "amountExcludingVatCurrency": 13350,
        "amountExcludingVatCurrency": 24650,
        "amountExcludingVatCurrency": 3350,
    "amountCurrency": 48015,
    "amountExcludingVat": 41350,
    "amountExcludingVatCurrency": 41350,
    "amountCurrencyOutstanding": 48015,
    "amountCurrencyOutstandingTotal": 48015,
DONE
```

## 2026-03-22T10:48:21.626Z assistant_message
Invoice created successfully. 6 API calls (3 core + 3 bank-account repair), 0 avoidable errors.

- Invoice ID: 2147696156, number: 1
- `amountExcludingVatCurrency`: 41350 (24650 + 3350 + 13350)
- `amountCurrency`: 48015 (24650×1.25 + 3350×1.15 + 13350×1.0 = 30812.5 + 3852.5 + 13350)
- All 3 products linked with correct VAT types (25%, 15%, 0%)
- Proactive bank-account repair applied before invoice creation attempt
