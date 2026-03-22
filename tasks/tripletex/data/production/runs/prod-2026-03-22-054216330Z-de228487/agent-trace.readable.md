# Claude Trace Snapshot

- provider: claude
- session_id: 2263bdd4-f3cc-42d9-8cb8-49f50da1db80
- session_file: /home/jorge/.claude/projects/-home-jorge-repos-ainm-tasks-tripletex-codex-environment/2263bdd4-f3cc-42d9-8cb8-49f50da1db80.jsonl
- completed: false
- assistant_messages: 0
- tool_calls: 4
- tool_results: 4

## 2026-03-22T05:42:17.356Z user_message
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
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-054216330Z-de228487/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Sie haben eine Lieferantenrechnung erhalten (siehe beigefugte PDF). Registrieren Sie die Rechnung in Tripletex. Erstellen Sie den Lieferanten, falls er nicht existiert. Verwenden Sie das richtige Aufwandskonto und die Vorsteuer.

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
t6OZHB0jVRgpcD0xaeMYB6h5uJhCWx0JKTiLp6oVv_k

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-054216330Z-de228487/scripts

Runner configuration:
- provider: claude
- model: claude-opus-4-6
- effort: high
- backend: proxy
- proxy_base_url: https://europe-west1-ai-nm26osl-1706.cloudfunctions.net/claude-proxy
- disable_experimental_betas: false

Attachment paths:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-054216330Z-de228487/attachments/01-leverandorfaktura_de_03.pdf

## 2026-03-22T05:42:22.439Z tool_call
tool: Read
call_id: toolu_vrtx_01RTwT1hZGFcsMtehSVAmLP8

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md",
  "limit": 100
}
```

## 2026-03-22T05:42:22.445Z tool_call
tool: Read
call_id: toolu_vrtx_017nM5JJLfkqgNDnYb3CzHBW

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-054216330Z-de228487/attachments/01-leverandorfaktura_de_03.pdf"
}
```

## 2026-03-22T05:42:22.451Z tool_result
tool: Read
call_id: toolu_vrtx_01RTwT1hZGFcsMtehSVAmLP8

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
    15→  - low API call count (Important)
    16→  - few or zero `4xx` errors (Make sure you know the API calls will work before running)
    17→- Avoid trial-and-error. Every unnecessary call and every `4xx` hurts. (Verify the correct API call flow before running, this is MEGA important, this is often where alot of errors pile up)
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
    42→## Environment Facts
    43→- Real submissions use a fresh Tripletex account.
    44→- Sandbox testing may use a persistent account.
    45→- Prompts may be in `nb`, `en`, `es`, `pt`, `nn`, `de`, or `fr`.
    46→- Files or images may be provided. Read them from disk before acting.
    47→- Extract exact facts from attachments: names, dates, amounts, identifiers, relationships, requested actions.
    48→
    49→## Credentials
    50→The prompt provides:
    51→- `Tripletex API base URL`
    52→- `Tripletex session token`
    53→- `Run scripts directory`
    54→
    55→Authentication:
    56→- Use Basic Auth.
    57→- Username: `0`
    58→- Password: provided session token.
    59→- Always call the provided base URL.
    60→- If the provided base URL already includes `/v2`, do not join endpoint paths with a leading slash in a way that escapes back to the host root; `new URL('/customer', baseUrl)` can silently turn `.../v2` into `/customer` and waste a `404`.
    61→- If the provided base URL ends at `/v2` without a trailing slash, `new URL('supplier', baseUrl)` can also drop the `/v2` segment; either append the slash first or build paths with safe string concatenation such as ``${baseUrl.replace(/\/+$/, "")}/supplier``.
    62→- Never switch to any default Tripletex URL and never look up online ever.
    63→- If the provided base URL is obviously a placeholder or non-routable host such as `example.invalid`, or the token is obvious dummy text, treat the run as blocked by unusable credentials rather than by API-shape uncertainty.
    64→- In that case, do not guess alternate hosts, do not swap in default Tripletex URLs, and do not burn time on extra API attempts or unrelated spec exploration.
    65→- If both the host and token are obviously fake placeholders, it is acceptable to stop after local playbook/spec confirmation without attempting a doomed network call.
    66→- If the first attempted call returns `403` with body `{"error":"Invalid or expired token"}`, treat the run as blocked by unusable credentials; do not spend more calls on alternate endpoints or auth variations.
    67→- Treat the proxy-specific `403` body `{"error":"Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.","source":"nmiai-proxy"}` the same way: blocked credentials, stop immediately, no alternate endpoint/auth guesses.
    68→
    69→## API Reference Strategy
    70→- Knowledge order:
    71→  1. `./trusted-standards/`
    72→  2. `./task-playbooks/`
    73→  3. `./openapi.json`
    74→- Trusted standards are stricter than playbooks.
    75→- Trusted standards are the canonical lowest-call, lowest-error, pre-verified flows for the most common task shapes.
    76→- If the task is an exact or near-exact match for a trusted standard, use that trusted standard first.
    77→- For an exact trusted-standard match, do not spend time re-checking `./openapi.json`.
    78→- For exact trusted-standard matches, the anti-`4xx` rule is satisfied by following the trusted standard itself.
    79→- Only fall back to `./openapi.json` if:
    80→  - no trusted standard matches
    81→  - the prompt materially differs from the trusted standard
    82→  - the trusted standard explicitly tells you to confirm a detail
    83→  - a live API response contradicts the trusted standard
    84→- Use the common endpoints below first.
    85→- These are common endpoints, not the only possible endpoints.
    86→- Always confirm the exact method, path, query parameters, request body, and response shape in `./openapi.json` before calling, except for exact trusted-standard matches.
    87→- Use `./openapi.json` as the full API reference.
    88→- When multiple similarly named schemas exist, trust the schema directly referenced by the chosen endpoint operation, not another nearby/read-only customer-facing schema.
    89→- Do not guess endpoint shapes, field names, request payloads, or delete/update paths, always verify.
    90→- For exact-match playbook tasks, inspect `openapi.json` with narrow endpoint/schema extraction.
    91→- Do not run broad keyword searches across the whole spec for common fields like `name`, `email`, or `organizationNumber` when the playbook already identifies the exact endpoint.
    92→
    93→## Trusted Standards
    94→- Before acting, check whether the task matches a trusted standard in `./trusted-standards/`
    95→- If it matches exactly, read (cat) the matching `.md` file, then execute it directly
    96→- NEVER skip reading the file — trusted standards document API traps (silently ignored params, required field expansions, nonexistent fields) that caused 0% production scores when agents wrote from memory instead
    97→- For exact trusted-standard matches, do not double-check or triple-check `./openapi.json`; doing so wastes time and hurts score
    98→- Trusted standards are intended to be safer than ad hoc spec-reading for their exact task shape
    99→- If a trusted standard is incomplete, wrong, or no longer optimal, fix it during post-run reflection
   100→
```

## 2026-03-22T05:42:22.453Z tool_result
tool: Read
call_id: toolu_vrtx_017nM5JJLfkqgNDnYb3CzHBW

```text
PDF file read: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-054216330Z-de228487/attachments/01-leverandorfaktura_de_03.pdf (1.4KB)
```

## 2026-03-22T05:42:31.692Z tool_call
tool: Glob
call_id: toolu_vrtx_01ACuS7RiUx35Z5GKh9gBTVZ

```json
{
  "pattern": "trusted-standards/register-supplier-invoice*.md",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-22T05:42:31.714Z tool_result
tool: Glob
call_id: toolu_vrtx_01ACuS7RiUx35Z5GKh9gBTVZ

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice.md
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md
```

## 2026-03-22T05:42:33.679Z tool_call
tool: Read
call_id: toolu_vrtx_01JidbFdHMnc9USMBYtgcANG

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-supplier-invoice-from-pdf.md"
}
```

## 2026-03-22T05:42:34.664Z tool_result
tool: Read
call_id: toolu_vrtx_01JidbFdHMnc9USMBYtgcANG

```text
     1→# Register Supplier Invoice from PDF
     2→
     3→> **NO BETA ENDPOINTS.** NEVER use `/incomingInvoice*` or any `(BETA)` endpoint. They ALL return `403`.
     4→> **USE importDocument.** Direct `POST /ledger/voucher` scored 2/10 — it does NOT create the required `supplierInvoice` entity.
     5→
     6→## Trust Level
     7→- Trusted standard
     8→- Use directly for exact matches
     9→- Skip `./openapi.json` re-checking for exact matches
    10→
    11→## Exact Match
    12→- prompt says "received a supplier invoice" + "see attached PDF" (or equivalent in any language)
    13→  - Portuguese: "recebeu uma fatura de fornecedor" + "ver PDF anexo"
    14→  - Spanish: "factura de proveedor" + "PDF adjunto"
    15→  - French: "facture fournisseur" + "PDF ci-joint"
    16→  - German: "Lieferantenrechnung" + "beigefügte PDF"
    17→  - Norwegian: "leverandørfaktura" + "vedlagt PDF"
    18→- prompt has an actual PDF attachment with supplier name, org number, invoice number, dates, amounts, account, bank account
    19→- prompt says "create the supplier if it does not exist"
    20→- the supplier data comes from the PDF, NOT from the prompt text
    21→
    22→## Do Not Use This Standard If
    23→- prompt provides all invoice data inline (no PDF) — use `./trusted-standards/register-supplier-invoice.md` instead (T11)
    24→- task is reversal, approval, payment, or correction of an existing supplier invoice
    25→
    26→## Why importDocument (NOT direct POST /ledger/voucher)
    27→
    28→Both T20 and T11 use `importDocument` — direct `POST /ledger/voucher` does NOT create a `supplierInvoice` entity.
    29→
    30→| Approach | T20 score | T11 score | Why |
    31→|---|---|---|---|
    32→| importDocument | **7-8/10** | 1/8 | Creates real `supplierInvoice` entity; T11 description mismatch costs 1 check |
    33→| Direct POST /ledger/voucher | **2/10** | best 1/8 | No `supplierInvoice` entity created |
    34→
    35→**NEVER use direct `POST /ledger/voucher` for supplier invoice tasks.**
    36→
    37→## Standard Flow (25% VAT — most common)
    38→1. `POST /supplier` — with physicalAddress + country + bankAccountPresentation
    39→2. `GET /ledger/account?number=...&isApplicableForSupplierInvoice=true&fields=*`
    40→3. `POST /ledger/voucher/importDocument` — with EHF/UBL XML invoice
    41→4. `PUT /ledger/voucher/{id}?sendToLedger=false` — set postings with `vatType: { id: 1 }` on debit
    42→5. `PUT /ledger/voucher/{id}?sendToLedger=true` — book with `{ version, voucherType: { name: "Leverandørfaktura" } }`
    43→
    44→This is **5 calls** total for 25% VAT.
    45→
    46→For **non-25% VAT rates**, insert `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=<invoice-date>&fields=*` between steps 2 and 3, making it **6 calls**.
    47→
    48→## Supplier Creation Rules (CRITICAL for Check 5)
    49→
    50→Extract ALL data from the PDF and include in `POST /supplier`:
    51→
    52→```json
    53→{
    54→  "name": "<supplier name from PDF>",
    55→  "organizationNumber": "<org number from PDF>",
    56→  "postalAddress": {
    57→    "addressLine1": "<street from PDF>",
    58→    "postalCode": "<postal code from PDF>",
    59→    "city": "<city from PDF>",
    60→    "country": { "id": 161 }
    61→  },
    62→  "physicalAddress": {
    63→    "addressLine1": "<street from PDF>",
    64→    "postalCode": "<postal code from PDF>",
    65→    "city": "<city from PDF>",
    66→    "country": { "id": 161 }
    67→  },
    68→  "bankAccountPresentation": [{ "bban": "<bank account from PDF>" }]
    69→}
    70→```
    71→
    72→- **MUST set both `postalAddress` AND `physicalAddress`** to the same address — omitting `physicalAddress` fails Check 5
    73→- **MUST include `country: { id: 161 }`** on both addresses (161 = Norge)
    74→- do NOT use `country: "NO"` (string) — Tripletex rejects with 422
    75→- do NOT use deprecated `bankAccounts` string array — use `bankAccountPresentation` with `bban`
    76→- All 6 production runs that used importDocument but omitted physicalAddress failed Check 5
    77→
    78→## importDocument Rules
    79→
    80→### EHF/UBL XML Structure
    81→```xml
    82→<?xml version="1.0" encoding="UTF-8"?>
    83→<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
    84→         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
    85→         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    86→  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
    87→  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
    88→  <cbc:ID>{invoiceNumber}</cbc:ID>
    89→  <cbc:IssueDate>{invoiceDate}</cbc:IssueDate>
    90→  <cbc:DueDate>{dueDate}</cbc:DueDate>
    91→  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
    92→  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
    93→  <cac:AccountingSupplierParty>
    94→    <cac:Party>
    95→      <cbc:EndpointID schemeID="0192">{orgNumber}</cbc:EndpointID>
    96→      <cac:PartyName><cbc:Name>{supplierName}</cbc:Name></cac:PartyName>
    97→      <cac:PostalAddress>
    98→        <cbc:StreetName>{street}</cbc:StreetName>
    99→        <cbc:CityName>{city}</cbc:CityName>
   100→        <cbc:PostalZone>{postalCode}</cbc:PostalZone>
   101→        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
   102→      </cac:PostalAddress>
   103→      <cac:PartyTaxScheme>
   104→        <cbc:CompanyID>NO{orgNumber}MVA</cbc:CompanyID>
   105→        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
   106→      </cac:PartyTaxScheme>
   107→      <cac:PartyLegalEntity>
   108→        <cbc:RegistrationName>{supplierName}</cbc:RegistrationName>
   109→        <cbc:CompanyID schemeID="0192">{orgNumber}</cbc:CompanyID>
   110→      </cac:PartyLegalEntity>
   111→    </cac:Party>
   112→  </cac:AccountingSupplierParty>
   113→  <cac:AccountingCustomerParty>
   114→    <cac:Party>
   115→      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
   116→      <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
   117→      <cac:PostalAddress>
   118→        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
   119→      </cac:PostalAddress>
   120→      <cac:PartyLegalEntity>
   121→        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
   122→        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
   123→      </cac:PartyLegalEntity>
   124→    </cac:Party>
   125→  </cac:AccountingCustomerParty>
   126→  <cac:TaxTotal>
   127→    <cbc:TaxAmount currencyID="NOK">{vatAmount}</cbc:TaxAmount>
   128→    <cac:TaxSubtotal>
   129→      <cbc:TaxableAmount currencyID="NOK">{net}</cbc:TaxableAmount>
   130→      <cbc:TaxAmount currencyID="NOK">{vatAmount}</cbc:TaxAmount>
   131→      <cac:TaxCategory>
   132→        <cbc:ID>S</cbc:ID>
   133→        <cbc:Percent>25</cbc:Percent>
   134→        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
   135→      </cac:TaxCategory>
   136→    </cac:TaxSubtotal>
   137→  </cac:TaxTotal>
   138→  <cac:LegalMonetaryTotal>
   139→    <cbc:LineExtensionAmount currencyID="NOK">{net}</cbc:LineExtensionAmount>
   140→    <cbc:TaxExclusiveAmount currencyID="NOK">{net}</cbc:TaxExclusiveAmount>
   141→    <cbc:TaxInclusiveAmount currencyID="NOK">{gross}</cbc:TaxInclusiveAmount>
   142→    <cbc:PayableAmount currencyID="NOK">{gross}</cbc:PayableAmount>
   143→  </cac:LegalMonetaryTotal>
   144→  <cac:InvoiceLine>
   145→    <cbc:ID>1</cbc:ID>
   146→    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
   147→    <cbc:LineExtensionAmount currencyID="NOK">{net}</cbc:LineExtensionAmount>
   148→    <cac:Item>
   149→      <cbc:Name>{description}</cbc:Name>
   150→      <cac:ClassifiedTaxCategory>
   151→        <cbc:ID>S</cbc:ID>
   152→        <cbc:Percent>25</cbc:Percent>
   153→        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
   154→      </cac:ClassifiedTaxCategory>
   155→    </cac:Item>
   156→    <cac:Price>
   157→      <cbc:PriceAmount currencyID="NOK">{net}</cbc:PriceAmount>
   158→    </cac:Price>
   159→  </cac:InvoiceLine>
   160→</Invoice>
   161→```
   162→
   163→### Response Shape
   164→- `POST /ledger/voucher/importDocument` returns **`{ values: [{ id, version, ... }] }`**, NOT `{ value: { id } }`
   165→- Extract `response.values[0].id` and `response.values[0].version`
   166→- Using `response.value.id` will crash — 2026-03-21 production run wasted 4 calls recovering from this
   167→
   168→### FormData Upload
   169→```typescript
   170→const formData = new FormData();
   171→formData.append("file", new Blob([xml], { type: "text/xml" }), `${invoiceNumber}.xml`);
   172→const res = await fetch(`${BASE}/ledger/voucher/importDocument`, {
   173→  method: "POST",
   174→  headers: { Authorization: AUTH },  // NO Content-Type — let FormData set it
   175→  body: formData,
   176→});
   177→```
   178→
   179→## Posting Rules (Step 4)
   180→
   181→```json
   182→{
   183→  "version": "<from importDocument response>",
   184→  "postings": [
   185→    {
   186→      "row": 1,
   187→      "account": { "id": "<expense-account-id>" },
   188→      "description": "<description from PDF>",
   189→      "vatType": { "id": 1 },
   190→      "amount": "<net>",
   191→      "amountCurrency": "<net>",
   192→      "amountGross": "<gross>",
   193→      "amountGrossCurrency": "<gross>"
   194→    },
   195→    {
   196→      "row": 2,
   197→      "account": { "id": "<supplier-ledger-account-id>" },
   198→      "supplier": { "id": "<supplier-id>" },
   199→      "description": "<description from PDF>",
   200→      "amount": "<-gross>",
   201→      "amountCurrency": "<-gross>",
   202→      "amountGross": "<-gross>",
   203→      "amountGrossCurrency": "<-gross>",
   204→      "invoiceNumber": "<invoice number from PDF>",
   205→      "termOfPayment": "<due date from PDF>"
   206→    }
   207→  ]
   208→}
   209→```
   210→
   211→- Row 0 is reserved for system-generated VAT posting — do NOT use row 0
   212→- Use `PUT /ledger/voucher/{id}?sendToLedger=false` — do NOT book yet
   213→- Hard-code `vatType: { id: 1 }` for 25% incoming VAT
   214→
   215→## Booking Rules (Step 5 — CRITICAL for Check 6)
   216→
   217→- `PUT /ledger/voucher/{id}?sendToLedger=true` with `{ "version": <version-from-step-4>, "voucherType": { "name": "Leverandørfaktura" } }`
   218→- do NOT include `postings` in the booking PUT — it fails with "Bilag uten posteringer kan ikke bli sendt til hovedbok"
   219→- Use the `version` returned by step 4, NOT the original import version
   220→- The voucher starts UNBOOKED (number=0) — the booking step assigns a real number
   221→- **All production runs that omitted the booking step scored 0 on Check 6**
   222→- 2026-03-22 sandbox proof: booking PUT returns voucher with number=748, confirming booked state
   223→
   224→## Verification (zero extra calls needed)
   225→
   226→The 5 API calls produce all necessary state:
   227→- `POST /supplier` response confirms supplier with all fields
   228→- `POST /ledger/voucher/importDocument` response confirms supplierInvoice entity created
   229→- `PUT sendToLedger=false` response confirms correct postings
   230→- `PUT sendToLedger=true` response confirms voucher booked (number > 0)
   231→
   232→Only add verification GETs if a write response contradicts expected state.
   233→
   234→## What Gets Created
   235→
   236→importDocument creates TWO entities:
   237→1. **Voucher** (`/ledger/voucher/{id}`) — the accounting entry, booked
   238→2. **supplierInvoice** (`/supplierInvoice/{id}`) — the business-level supplier invoice record
   239→
   240→The supplierInvoice has:
   241→- `invoiceNumber` = from XML
   242→- `amount` = -gross (negative)
   243→- `amountExcludingVat` = -net
   244→- `outstandingAmount` = gross (positive)
   245→- `supplier.id` = linked to created supplier
   246→- `voucher.id` = linked to the voucher
   247→
   248→This is what the T20 scorer checks — direct `POST /ledger/voucher` does NOT create the supplierInvoice entity.
   249→
   250→## Known Pitfalls
   251→- do NOT use direct `POST /ledger/voucher` for T20 — it only creates a voucher, not a supplierInvoice entity; scored 2/10
   252→- do NOT access importDocument response as `response.value` — it's `response.values[0]`
   253→- do NOT omit `row` values on PUT postings — causes 422
   254→- do NOT omit `physicalAddress` or `country: { id: 161 }` on supplier — fails Check 5
   255→- do NOT combine postings + sendToLedger=true in one PUT — fails
   256→- do NOT omit the booking step (sendToLedger=true) — fails Check 6
   257→- do NOT use deprecated `bankAccounts` field — use `bankAccountPresentation`
   258→- preserve exact casing of description from PDF
   259→- do NOT use `account: { number: N }` in postings — requires `account: { id }` (422 "account.name Kan ikke være null" without id); the GET /ledger/account call is mandatory
   260→- do NOT spend the run reading AGENTS.md + playbook + trusted standard — read ONLY the trusted standard, then immediately write and execute the script; two production runs scored 0 by reading too much and timing out
   261→
   262→## Check-by-Check Analysis (from 11 production runs)
   263→- **Check 1** (supplier exists): all 11 runs passed — both approaches create the supplier
   264→- **Check 2** (supplierInvoice exists): passed with importDocument, FAILED with direct voucher
   265→- **Check 3** (correct amounts): passed with importDocument, FAILED with direct voucher
   266→- **Check 4** (correct VAT/postings): passed with importDocument, FAILED with direct voucher
   267→- **Check 5** (supplier physicalAddress): FAILED in all 6 importDocument runs (missing physicalAddress+country); **FIX: set both postalAddress AND physicalAddress with country: { id: 161 }**
   268→- **Check 6** (voucher booked): passed in 3 importDocument runs with booking step; FAILED in 3 without
   269→
   270→## Sandbox Proof (2026-03-22)
   271→- supplier `Oakwood SBX T20` / `948453436` created with postalAddress + physicalAddress + country + bank
   272→- importDocument created voucher 609294111 + supplierInvoice 2147670828
   273→- postings set: expense 6340 net=45400 gross=56750 vatType=1; supplier -56750
   274→- voucher booked as number 748
   275→- supplierInvoice verified: invoiceNumber="INV-2026-T20-SBX", amount=-56750, amountExcludingVat=-45400, outstandingAmount=56750
   276→- 5 API calls, 0 errors
   277→
```
