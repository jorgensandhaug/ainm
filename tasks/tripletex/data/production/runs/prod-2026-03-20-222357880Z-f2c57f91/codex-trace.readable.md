# Codex Trace Snapshot

- session_id: 019d0d59-2695-7c10-95e8-8af2caef6be1
- session_file: /home/jorge/.codex/sessions/2026/03/20/rollout-2026-03-20T23-23-59-019d0d59-2695-7c10-95e8-8af2caef6be1.jsonl
- completed: true
- assistant_messages: 5
- tool_calls: 7
- tool_results: 7

## 2026-03-20T22:24:00.934Z task_event
event: task_started

## 2026-03-20T22:24:00.935Z user_message
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
- If this is an exact trusted-standard match, use it directly and do not re-check ./openapi.json.

Run-specific rules:
- Only interact with the Tripletex API by writing TypeScript and running it with bun.
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222357880Z-f2c57f91/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
Erstellen Sie eine benutzerdefinierte Buchhaltungsdimension "Marked" mit den Werten "Privat" und "Offentlig". Buchen Sie dann einen Beleg auf Konto 6300 über 44950 NOK, verknüpft mit dem Dimensionswert "Offentlig".

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
zJ3T80nvI6A06G7EbsQkF4WuYfEnEJjnjkQVzxiu5Fc

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222357880Z-f2c57f91/scripts

## 2026-03-20T22:24:05.987Z tool_call
tool: exec_command
call_id: call_AmlPHsCPJpeOyU8NKUlSCxc9

```json
{
  "cmd": "pwd",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 200
}
```

## 2026-03-20T22:24:05.990Z tool_call
tool: exec_command
call_id: call_txdL0wX2YUqUle2PRemIQpYE

```json
{
  "cmd": "rg --files ./trusted-standards ./task-playbooks | rg 'create-free-accounting-dimension-and-book-voucher|common-endpoints'",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 400
}
```

## 2026-03-20T22:24:06.033Z tool_result
tool: exec_command
call_id: call_AmlPHsCPJpeOyU8NKUlSCxc9

```text
Command: /run/current-system/sw/bin/zsh -lc pwd
Chunk ID: 056a27
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 15
Output:
/home/jorge/repos/ainm/tasks/tripletex/codex-environment

```

## 2026-03-20T22:24:06.038Z tool_result
tool: exec_command
call_id: call_txdL0wX2YUqUle2PRemIQpYE

```text
Command: /run/current-system/sw/bin/zsh -lc "rg --files ./trusted-standards ./task-playbooks | rg 'create-free-accounting-dimension-and-book-voucher|common-endpoints'"
Chunk ID: b57390
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 46
Output:
./task-playbooks/create-free-accounting-dimension-and-book-voucher.md
./trusted-standards/common-endpoints.md
./trusted-standards/create-free-accounting-dimension-and-book-voucher.md

```

## 2026-03-20T22:24:10.226Z assistant_message
phase: commentary

Prüfe den exakten Trusted-Standard für freie Buchhaltungsdimension plus Belegbuchung und ziehe daraus den minimalen Call-Flow. Danach schreibe ich ein einzelnes Bun-Skript im Run-Verzeichnis und führe es aus.

## 2026-03-20T22:24:10.227Z tool_call
tool: exec_command
call_id: call_PMsybpCuIjS9TfWY8lhtyXsL

```json
{
  "cmd": "sed -n '1,220p' ./trusted-standards/create-free-accounting-dimension-and-book-voucher.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-20T22:24:10.237Z tool_call
tool: exec_command
call_id: call_kqPAUOXbwW9evUa58xL1s9Bg

```json
{
  "cmd": "sed -n '1,220p' ./task-playbooks/create-free-accounting-dimension-and-book-voucher.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-20T22:24:10.237Z tool_call
tool: exec_command
call_id: call_tCGMlrERHWC5BLJh9c5JnABv

```json
{
  "cmd": "sed -n '1,220p' ./trusted-standards/common-endpoints.md",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-20T22:24:10.258Z tool_result
tool: exec_command
call_id: call_PMsybpCuIjS9TfWY8lhtyXsL

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,220p' ./trusted-standards/create-free-accounting-dimension-and-book-voucher.md"
Chunk ID: b96211
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 1597
Output:
# Create Free Accounting Dimension and Book Voucher

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- create one new free accounting dimension
- create one or more new values for that dimension from prompt-provided names
- then book one simple manual voucher
- the scored voucher line is one ledger-account posting linked to one of the newly created dimension values
- no supplier, customer, employee, project, VAT-specific, update, delete, or reversal flow

## Do Not Use This Standard If
- the task modifies or deletes an existing free dimension or value
- the task needs a supplier-invoice, customer-invoice, payroll, project, or travel-expense flow
- the voucher requires linked customer, supplier, employee, or project objects
- the prompt gives a special balancing-account requirement that materially differs from the standard bank-line fallback

## Standard Flow
1. `POST /ledger/accountingDimensionName`
2. `POST /ledger/accountingDimensionValue` once per requested value
3. `GET /ledger/account?number=<target-account>,1920&fields=*`
4. `POST /ledger/voucher`
5. verify from the write responses
6. stop

## Payload Rules
- on `POST /ledger/accountingDimensionName`, send:
  - `dimensionName`
  - `active: true`
- `dimensionName` is validated at max length `20`; if the prompt-provided name exceeds that, treat the run as blocked instead of truncating it
- on each `POST /ledger/accountingDimensionValue`, the minimal proven payload is:
  - `dimensionIndex`
  - `displayName`
  - `active: true`
  - `showInVoucherRegistration: true`
- do not invent `number` or `position` on the dimension values for the standard path; sandbox proved Tripletex accepts the minimal payload and auto-assigns ordering
- `/ledger/accountingDimensionValue/list` is `PUT` batch update, not batch create, so each new prompt-provided value still needs its own `POST /ledger/accountingDimensionValue`
- reuse the returned `dimensionIndex` from the dimension-name create response; persistent sandbox assigned `2` in one run and `3` in later re-verification, not only `1`
- on `POST /ledger/voucher`:
  - set `voucherType: null`
  - build a balanced two-line voucher
  - use the resolved ledger-account ids, not `account.number` alone
  - on the scored posting, attach the chosen value as `freeAccountingDimension1`, `freeAccountingDimension2`, or `freeAccountingDimension3` according to the returned `dimensionIndex`
- if the prompt gives only the target ledger account and omits the balancing account, the standard fallback is the existing bank account `1920`
- for a zero-VAT manual voucher, omit `vatType` and send the same value in:
  - `amount`
  - `amountCurrency`
  - `amountGross`
  - `amountGrossCurrency`

## Reuse From Write Response
- from `POST /ledger/accountingDimensionName`:
  - `value.id`
  - `value.dimensionIndex`
  - `value.dimensionName`
- from each `POST /ledger/accountingDimensionValue`:
  - `value.id`
  - `value.displayName`
- from `POST /ledger/voucher`:
  - `value.id`
  - `value.number`
  - the returned postings with account ids, amounts, and the linked `freeAccountingDimension{1|2|3}.id`

## Verification
- default verification is zero extra calls after the voucher write
- trust the dimension-name write response for the created dimension name and assigned `dimensionIndex`
- trust the value write responses for the created value names
- trust the voucher write response when it already proves:
  - voucher id and number
  - target posting account id
  - target posting amount
  - linked free-dimension value id
- for the exact create-dimension-plus-two-values-plus-one-voucher task shape, this five-call flow remains the minimal realistic path because the lower-call number-only voucher shortcut is not valid

## Known Recovery Branches
- if `GET /ledger/account?number=<target-account>,1920&fields=*` does not return `1920`, do one fallback `GET /ledger/account?isBankAccount=true&fields=*` and choose the existing invoice or bank account from that result
- `GET /ledger/account?number=<target-account>,1920&fields=*` returns `account.number` as an integer; compare numerically when filtering the response locally, or you can falsely conclude the target account is missing and burn extra recovery calls
- if dimension creation fails because all three free dimensions are already in use, treat the run as blocked by account state rather than guessing an update or reuse flow
- if dimension creation fails because the free-dimension feature is disabled, treat the run as blocked by missing module or feature state unless the prompt explicitly instructs an activation step

## OpenAPI / Sandbox Status
- `/ledger/accountingDimensionName`, `/ledger/accountingDimensionValue`, `/ledger/account`, and `/ledger/voucher` verified in `./openapi.json`
- persistent sandbox re-verified on 2026-03-20:
  - `POST /ledger/accountingDimensionName` returned `422` when `dimensionName` exceeded `20` characters
  - the same endpoint also returned `422` with validation message `Maximum of 3 accounting dimensions allowed` when the persistent sandbox already had all three free-dimension slots occupied
  - `POST /ledger/accountingDimensionValue` succeeded with only `dimensionIndex`, `displayName`, `active`, and `showInVoucherRegistration`
  - `PUT /ledger/accountingDimensionValue/list` is batch update only, so it is not a lower-call shortcut for creating the requested values
  - `POST /ledger/voucher` with `account: { "number": "7000" }`, again with `account: { "number": "6590" }`, and later with `account: { "number": 6860 }` failed `422` on `postings.account.name`, so number-only account refs are not the trusted fast path
  - the id-based voucher write succeeded immediately after one decisive `GET /ledger/account?number=6590,1920&fields=*`
  - later same-day re-verification with dimension `KS154433946` assigned `dimensionIndex=3`, created values `Innkjøp` and `Logistikk`, and returned the linked value on `freeAccountingDimension3.id` in the successful voucher write response
  - a same-day voucher-path re-verification on existing sandbox dimension value `15253` confirmed that `GET /ledger/account?number=6860,1920&fields=*` returns both account rows with integer `number` fields and that the next `POST /ledger/voucher` succeeded with the linked `freeAccountingDimension1.id`

```

## 2026-03-20T22:24:10.267Z tool_result
tool: exec_command
call_id: call_kqPAUOXbwW9evUa58xL1s9Bg

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,220p' ./task-playbooks/create-free-accounting-dimension-and-book-voucher.md"
Chunk ID: 7c35b9
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 2225
Output:
# Create Free Accounting Dimension and Book Voucher

## Scope

Use for tasks like:
- create one free accounting dimension with a prompt-provided name
- create one or more prompt-provided values under that dimension
- then book one simple manual voucher
- attach one voucher posting to one of the newly created dimension values

Do not use for:
- supplier-invoice registration
- customer-invoice flows
- project, payroll, or travel-expense flows
- update, delete, or reversal tasks on existing dimensions or vouchers

## Verified Findings

Verified in persistent sandbox on 2026-03-20:
- `POST /ledger/accountingDimensionName` succeeded with only `dimensionName` and `active=true`
- the same endpoint returned `422` when `dimensionName` exceeded `20` characters, so prompt names must fit as-is
- `POST /ledger/accountingDimensionValue` succeeded with the minimal payload:
  - `dimensionIndex`
  - `displayName`
  - `active=true`
  - `showInVoucherRegistration=true`
- the same value-create response returned `number=null` and auto-assigned `position`, so `number` and `position` are not required for the standard create path
- `PUT /ledger/accountingDimensionValue/list` is batch update only, not batch create, so there is no trusted batch shortcut for creating the requested values
- the dimension-name create response assigned `dimensionIndex=2` in one persistent-sandbox run and `dimensionIndex=3` in a later same-day re-verification, so the voucher-link field must always be derived from the returned index instead of assuming `freeAccountingDimension1`
- `POST /ledger/voucher` failed with `422` when the posting account was sent only as `account: { "number": "7000" }`
- the validation message was:
  - `postings.account.name: Kan ikke være null.`
- the same number-only failure reproduced again with ordinary expense account `6590`
- the same number-only failure reproduced again with ordinary expense account `6860`
- one decisive `GET /ledger/account?number=7000,1920&fields=*` resolved the safe account ids
- that account lookup returns `account.number` as an integer in the response; local filters must compare numerically, not as strings
- `POST /ledger/voucher` then succeeded with:
  - `voucherType=null`
  - a debit posting on `7000`
  - a balancing credit posting on `1920`
  - `freeAccountingDimension1={ "id": ... }` on the target posting
- same-day re-verification for the exact `6590` task shape also succeeded with:
  - dimension name `KS154433946`
  - values `Innkjøp` and `Logistikk`
  - linked posting field `freeAccountingDimension3={ "id": 15519 }`
  - voucher `608827949`
- later same-day re-verification for the exact `6860` task shape reused existing dimension value `15253`, confirmed the same `422 postings.account.name: Kan ikke være null.` on the number-only shortcut, then succeeded immediately after `GET /ledger/account?number=6860,1920&fields=*` with voucher `608829214`
- the successful voucher write response already proved the linked free-dimension value id and the booked amounts
- the persistent sandbox later returned `422 Maximum of 3 accounting dimensions allowed` on `POST /ledger/accountingDimensionName` once all three free-dimension slots were occupied; that is a real account-state blocker, not a cue to add search/update/delete calls in a production create-only run

## Minimal Safe Flow

1. Confirm these operations in `./openapi.json`
   - `POST /ledger/accountingDimensionName`
   - `POST /ledger/accountingDimensionValue`
   - `GET /ledger/account`
   - `POST /ledger/voucher`
2. Create the dimension
   - `POST /ledger/accountingDimensionName`
3. Create the requested values
   - `POST /ledger/accountingDimensionValue` once per value
   - reuse the returned `dimensionIndex`
4. Resolve the voucher accounts
   - `GET /ledger/account?number=<target-account>,1920&fields=*`
5. Create the manual voucher
   - `POST /ledger/voucher`
   - link the chosen value through `freeAccountingDimension1`, `freeAccountingDimension2`, or `freeAccountingDimension3` based on the created dimension index
6. Verify from the write responses
7. Stop

## Exact-Match Fast Path

- For a prompt that:
  - asks to create one new free dimension
  - provides the requested value names directly
  - then asks for one plain voucher posting on one ledger account tied to one of those new values
- the winning path is still:
  1. `POST /ledger/accountingDimensionName`
  2. `POST /ledger/accountingDimensionValue`
  3. `POST /ledger/accountingDimensionValue`
  4. `GET /ledger/account?number=<target-account>,1920&fields=*`
  5. `POST /ledger/voucher`
- do not spend a pre-read of existing dimensions in a scored create task
- do not try `account.number` directly on voucher postings just to save the account lookup; that path was re-tested and failed, so there is no trusted four-call shortcut for this exact task shape
- do not chase `/ledger/accountingDimensionValue/list` as a multi-value create optimization; it is update-only and does not reduce the call count for this task shape
- do not add a speculative `GET /ledger/accountingDimensionName` or `GET /ledger/accountingDimensionValue/search` in a fresh-account create task just to guard against local script bugs; the minimal production path is still five calls, and local filtering bugs should be fixed in code rather than repaired with extra Tripletex reads

## Winning Payload Shape

Dimension create:

```json
{
  "dimensionName": "Prosjekttype",
  "active": true
}
```

Dimension value create:

```json
{
  "dimensionIndex": 1,
  "displayName": "Internt",
  "active": true,
  "showInVoucherRegistration": true
}
```

Voucher create:

```json
{
  "date": "2026-03-20",
  "description": "Bilag konto 7000, Prosjekttype \"Internt\"",
  "voucherType": null,
  "postings": [
    {
      "row": 1,
      "date": "2026-03-20",
      "description": "Prosjekttype \"Internt\"",
      "account": { "id": 424191158 },
      "currency": { "id": 1 },
      "amount": 39700,
      "amountCurrency": 39700,
      "amountGross": 39700,
      "amountGrossCurrency": 39700,
      "freeAccountingDimension1": { "id": 15250 }
    },
    {
      "row": 2,
      "date": "2026-03-20",
      "description": "Prosjekttype \"Internt\"",
      "account": { "id": 424190862 },
      "currency": { "id": 1 },
      "amount": -39700,
      "amountCurrency": -39700,
      "amountGross": -39700,
      "amountGrossCurrency": -39700
    }
  ]
}
```

Replace the ids and amounts with the values resolved in the current account. The important shape is: id-based account refs, `voucherType=null`, balanced positive and negative gross amounts, and the correct `freeAccountingDimension{n}` key.

## Validation Traps

- do not send voucher posting accounts only as `account.number`; sandbox returned `422 postings.account.name: Kan ikke være null.`
- do not compare `/ledger/account` response `account.number` as a string; Tripletex returns it as an integer, and a string comparison can trigger a false missing-account branch after a correct lookup
- do not spend a speculative `GET /ledger/accountingDimensionName` in a pure create task; the create response already gives the needed `dimensionIndex`
- do not assume the created free dimension will be slot `1`; persistent sandbox assigned slot `2` on re-verification
- do not invent dimension-value `number` or `position` fields unless the prompt explicitly scores them
- do not attach the dimension value to both voucher postings unless the prompt explicitly requires that
- do not add `vatType` for the standard zero-VAT manual-voucher shape
- do not append sandbox-only uniqueness suffixes that push `dimensionName` past `20` characters
- if `POST /ledger/accountingDimensionName` fails with `422 Maximum of 3 accounting dimensions allowed`, stop and treat the run as blocked by account state unless the prompt explicitly requests a reuse/update path

## Verification Shape

- `POST /ledger/accountingDimensionName` proves:
  - `dimensionName`
  - assigned `dimensionIndex`
  - active state
- each `POST /ledger/accountingDimensionValue` proves:
  - `displayName`
  - `dimensionIndex`
  - `showInVoucherRegistration`
- `POST /ledger/voucher` proves:
  - voucher id and number
  - posting amounts
  - posting account ids
  - linked `freeAccountingDimension{1|2|3}.id`
- no follow-up `GET /ledger/voucher/{id}` is needed unless the task explicitly scores expanded linked display fields that the write response omits

## Counterpart Account Rule

- if the prompt gives only the target ledger account and amount, and does not score a specific balancing account, the sandbox-proven fallback is the existing bank account `1920`
- resolve it in the same decisive `GET /ledger/account?number=<target-account>,1920&fields=*`
- if `1920` is absent from that result, do one fallback `GET /ledger/account?isBankAccount=true&fields=*` and pick the existing invoice or bank account from that response

```

## 2026-03-20T22:24:10.271Z tool_result
tool: exec_command
call_id: call_tCGMlrERHWC5BLJh9c5JnABv

```text
Command: /run/current-system/sw/bin/zsh -lc "sed -n '1,220p' ./trusted-standards/common-endpoints.md"
Chunk ID: b14a71
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 4086
Output:
Total output lines: 220

# Common Endpoints

Verified against `./openapi.json`.

Use this as the exact endpoint-shape reference for the most common Tripletex resources.

## Customer
- `/customer`
  - `GET` search
  - `POST` create
- `/customer/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard create prerequisite:
  - none
- Standard fast-path note:
  - for the exact one-customer create shape with prompt-provided `name`, `email`, Norwegian `organizationNumber`, and optionally one ordinary `postalAddress`, the canonical path is one `POST /customer`
  - no `GET /customer` pre-read and no `GET /customer/{id}` follow-up read are part of the trusted fast path
- Standard verification note:
  - `POST /customer` can return a sparse auto-generated `physicalAddress` link object even when the payload only sent `postalAddress`; verify the prompt-scored fields from `value` and do not add a follow-up read just for that link
  - when the prompt includes one ordinary mailing address, `value.postalAddress.addressLine1`, `value.postalAddress.postalCode`, and `value.postalAddress.city` can already prove the scored address fields
  - localized generic email labels such as `Correo` still map to the same `email` payload field; they are not a reason to add `invoiceEmail`

## Department
- `/department`
  - `GET` search
  - `POST` create one
- `/department/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/department/list`
  - `POST` batch create
- Standard create prerequisite:
  - none
- Standard verification note:
  - for `POST /department/list`, trust `values[]` and the returned department fields; top-level wrapper metadata such as `fullResultSize` can stay `0` on successful writes
  - for exact multi-department create prompts, including multilingual prompts that only supply department names, the canonical path is one `POST /department/list`; do not add a discovery `GET /department` and do not split the task into repeated `POST /department` calls

## Division
- `/division`
  - `GET` search
  - `POST` create
- `/division/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard prerequisite note:
  - division is not part of the default employee-create fast path
  - resolve one existing `/division?count=1&fields=*` only when a live validation branch explicitly requires `employments[].division.id`

## Employee
- `/employee`
  - `GET` search
  - `POST` create
- `/employee/{id}`
  - `GET` read
  - `PUT` update
- `/employee/employment`
  - `GET` search employments
  - `POST` create employment
- Standard create prerequisites:
  - explicit `userType`
- Standard create fast-path note:
  - for the exact create-one-employee shape with prompt-provided name, birth date, email, and start date, the lower-call default is `POST /employee` first with explicit `userType` and nested `employments`
  - 2026-03-20 production re-confirmed that when that first write succeeds in a fresh account, the minimum safe path is usually `2` calls total: the `POST /employee` write plus one decisive `GET /employee/employment?employeeId=...&fields=*`
  - do not default to `GET /department` before the first write; only branch into `GET /department?isInactive=false&count=1&fields=*` if the create fails with `422` where `validationMessages[].field == "department.id"`
  - if that department repair read returns no active department and department is clearly required, `POST /department` with a minimal name-only payload and retry the same employee create once
  - if the employee create then fails with `422` where `validationMessages[].field == "employments.division.id"`, do one decisive `GET /division?count=1&fields=*` and retry once with `division: { "id": ... }` inside the employment row
- Standard verification note:
  - a successful `POST /employee` can still echo `userType: null` plus `employments[]` as link-only objects without `startDate`
  - do not branch on the generic top-level `422 message`; current proven employee-create repair routing depends on `validationMessages[].field`
  - when the prompt scores employment start date, `GET /employee/employment?employeeId=...&fields=*` is the decisive verification read unless the create response unexpectedly already includes the actual `startDate`
  - do not try to save that verification read by trusting the write request itself on a start-date-scored task; that is still an unproven gamble rather than the trusted minimum safe path
- Standard payroll note:
  - `GET /employee?fields=*` can still return `employments[]` as sparse stubs with null `startDate`, null `division`, and empty-looking `employmentDetails[]`
  - for payroll-readiness checks, do one conditional `GET /employee/employment?employeeId=...&fields=*` only when the employee search response is too sparse to judge the payroll period or business linkage

## Salary
- `/salary/type`
  - `GET` search salary types
- `/salary/transaction`
  - `POST` create salary transaction
- `/salary/transaction/{id}`
  - `GET` read salary transaction
  - `DELETE` delete salary transaction
- `/salary/payslip`
  - `GET` search payslips
- `/salary/payslip/{id}`
  - `GET` read payslip
- Standard payroll prerequisites:
  - exact employee id
  - payroll-ready employee data
  - resolved salary-type ids
- Standard fast-path note:
  - for the exact one-employee payroll task shape, prefer `./trusted-standards/run-employee-payroll.md`
  - the winning successful path for a payroll-ready employee is usually employee read, conditional employment read only if needed, salary-type read, then salary-transaction write
  - for the exact task-12-like branch where the employee read shows one exact employee with `dateOfBirth=null` and `employments=[]`, but `GET /salary/type?count=1000&fields=*` succeeds, the lower-zero-risk path is salary-type read, one `GET /division?count=1&fields=*`, `PUT /employee/{id}` with placeholder `dateOfBirth: "1990-01-01"`, `POST /employee/employment`, then `POST /salary/transaction`
  - do not add `POST /employee/employment/details` by default in that repair branch; persistent sandbox on 2026-03-20 proved payroll can succeed without it for manual salary lines
  - do not add speculative `/salary/settings` or company-module activation reads to the default payroll path; only branch into feature-state investigation after a live `403` permission response from salary endpoints
- Standard verification note:
  - `GET /salary/payslip/{id}?fields=*` is enough for `grossAmount`, `amount`, and `specifications.length`
  - `GET /salary/payslip/{id}?fields=*` can still keep individual `specifications[]` as link-only objects
  - for exact line-level verification, use `GET /salary/payslip/{id}?fields=*,specifications(*,salaryType(*))`

## Product
- `/product`
  - `GET` search
  - `POST` create
- `/product/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard create prerequisite:
  - exact prompt-required fields
  - if the prompt requires a non-standard or otherwise non-default exact VAT percentage, resolve a valid outgoing `vatType`
  - if the requested exact VAT percentage is absent from `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`, treat product create as blocked in that account
- Standard create fast-path note:
  - for the exact fresh-account create-one-product shape with prompt-provided `name`, `number`, excluding-VAT price, and standard `25%` VAT wording, the canonical winning path is one `POST /product` with no explicit `vatType`
  - on that exact shortcut, verify directly from the `POST /product` response that Tripletex returned a `vatType` and the computed `priceIncludingVatCurrency` reflects `25%`; the 2026-03-20 `Softwarelizenz` / `7986` / `24900` production run again confirmed that one-write path with `priceIncludingVatCurrency=31125` and `vatType.id=3`
  - for exact `0%`, reduced-rate, or otherwise non-standard VAT prompts, fall back to one filtered outgoing VAT read followed by `POST /product`
  - do not re-check `./openapi.json` for an exact trusted-standard match, and do not…86 tokens truncated… `priceIncludingVatCurrency == priceExcludingVatCurrency`, so do not use that as the trusted fast path when the prompt scores exact VAT outside the exact fresh-account standard-`25%` shortcut
  - exact `0%` product prompts such as books still use the same rule: select the matching `0%` row from the filtered outgoing VAT result in the current account
- Standard search note:
  - `GET /product?fields=*` can still return `vatType` only as a sparse link object (`id`/`url`)
  - `GET /product?productNumber=...&fields=*` can return the matched identifier under `number` rather than `productNumber`; normalize both keys before deciding a direct numeric resolver failed
  - when the prompt clearly provides exact existing product numbers, the lower-call first resolver is one decisive `GET /product?productNumber=<a>&productNumber=<b>...&fields=*`
  - for invoice/order tasks where the prompt gives exact product names plus parenthetical numeric refs of unclear semantics, the lower-call product resolver is one decisive `GET /product?count=1000&fields=*` with local exact filtering by `number` and/or `name`
  - only switch from the direct `productNumber` query to the broader catalog read when those numeric refs are unclear semantics or the direct numeric query returns an incomplete/ambiguous subset
  - only spend `GET /product?ids=...` after the catalog read or numeric query if the earlier resolver still left the products unresolved
  - for explicit-VAT invoice tasks, do not assume that product search alone proves the VAT percentage; if the prompt scores exact VAT and the product read is sparse, do one filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` before the invoice write

## Project
- `/project`
  - `GET` search
  - `POST` create
- `/project/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard create prerequisites:
  - customer id
  - often assignable project manager id
  - `startDate`
- Standard fast-path note:
  - for the exact create-one-project shape with an existing customer identified by `organizationNumber` and an existing manager identified by `email`, the winning path is usually `GET /customer?organizationNumber=...&count=10&fields=*`, `GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*`, then `POST /project`
  - 2026-03-20 production re-confirmed that the same 3-call path is still minimal for a Portuguese prompt that omitted `startDate`; using the run date in the write payload succeeded directly
  - 2026-03-20 persistent sandbox re-proof confirmed there is still no safe `2`-call shortcut for that exact shape: `POST /project` with nested `customer { name, organizationNumber }` can return `201` while leaving `customer=null`, and manager details without `projectManager.id` still fail validation
  - keep exact uniqueness checks local by comparing returned `customer.organizationNumber` and `employee.email`, and use prompt names only as local tie-breakers when they are provided
  - if the filtered reads already leave one exact-`organizationNumber` hit and one exact-`email` hit, reuse those ids directly; do not require the prompt names to match the returned display names
  - if the prompt omits `startDate`, default it to the run date in ISO format instead of omitting the field
- Standard search note:
  - for project-linked task shapes where the prompt gives project name plus customer identifiers, `GET /project?name=...&count=50&fields=*,customer(*)` can often resolve both the project and the linked customer in one read
  - for update-shaped project tasks that also score the existing manager, `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` can often resolve the project, linked customer, and current manager in one read
  - when that expanded project search already leaves one exact `project.name` plus nested `customer.organizationNumber` and/or `customer.name` match, do not add a separate `GET /customer`
  - when that same expanded row also shows nested `projectManager.email` matching the prompt, do not add a separate `GET /employee` just to re-resolve the same manager id
  - for fixed-price partial-billing update tasks, that same expanded project read can also supply the existing `startDate`; reuse it on `PUT /project/{id}` unless the prompt explicitly asks to change the start date
- Standard verification note:
  - the successful `POST /project` response can already prove `name`, `startDate`, `customer.id`, and `projectManager.id`; do not add `GET /project/{id}` unless one of those scored fields is unexpectedly missing
  - in that exact create-project shape, do not add `GET /customer/{id}` or `GET /employee/{id}` after the filtered resolver reads; the search responses plus the project write response already prove the scored linkage

## Activity
- `/activity`
  - `GET` search
  - `POST` create
- `/activity/{id}`
  - `GET` read
- `/activity/>forTimeSheet`
  - `GET` resolve project activities available for one employee on one date
- Standard time-registration note:
  - for project hour tasks, prefer `/activity/>forTimeSheet` over a broad `/activity` search because it proves the activity is actually available on the project for that employee/date
  - if the resolved activity is non-chargeable, do not assume `projectChargeableHours` or a project-specific rate write can still make it billable
  - for prompt shapes that only score requested hours registration plus the customer-facing project invoice, a non-chargeable activity is still not an automatic stop condition: skip the doomed project-specific-rate write, register the hours, and use the manual project-linked order/invoice fallback

## Project Hourly Rates
- `/project/hourlyRates`
  - `GET` search
  - `POST` create
- `/project/hourlyRates/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/project/hourlyRates/projectSpecificRates`
  - `GET` search
  - `POST` create
- `/project/hourlyRates/projectSpecificRates/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- Standard time-registration note:
  - if `GET /project/hourlyRates?projectId=...` returns no holder for a chargeable project, create one with `POST /project/hourlyRates` before writing the employee/activity-specific rate
  - switching an existing project hourly-rate holder to `TYPE_PROJECT_SPECIFIC_HOURLY_RATES` and then creating the employee+activity rate are separate writes
  - `GET /project/hourlyRates?projectId=...&fields=*,projectSpecificRates(*,employee(*),activity(*))` can expose enough nested data to detect an existing exact employee+activity rate without spending a second rate-search call
  - when that same holder read already shows one exact employee+activity rate with the prompt hourly rate, reuse it and skip an extra write; if it shows the exact pair with a different hourly rate, update that existing specific rate once instead of blindly posting a duplicate
  - do not rely on embedded `projectSpecificRates[]` inside the holder `PUT` as the only rate write
  - `POST /project/hourlyRates/projectSpecificRates` rejects non-chargeable activities with `422 activity.id: Ikke fakturerbar.`

## Timesheet
- `/timesheet/entry`
  - `GET` search
  - `POST` create
- `/timesheet/entry/{id}`
  - `GET` read
  - `PUT` update
  - `DELETE` delete
- `/timesheet/week/:approve`
  - `PUT` approve week
- Standard time-registration note:
  - a timesheet write on a non-chargeable project activity can still succeed while returning `chargeable=false` and `hourlyRate=0`
  - that non-chargeable timesheet response is only a true blocker when the prompt explicitly scores internal billability semantics or true project-hour reserve consumption
  - do not make `/timesheet/week/:approve` part of the default fast path for project-hour invoice tasks; it can return `403` even for the token owner

## Project Period
- `/project/{id}/period/hourlistReport`
  - `GET` read hour totals for a date window
- `/project/{id}/period/invoicingReserve`
  - `GET` read invoice reserve for a date window

```

## 2026-03-20T22:24:20.034Z assistant_message
phase: commentary

Schreibe jetzt das Run-Skript mit exakt dem Trusted-Standard-5-Call-Flow plus nur den dokumentierten Recovery-Abzweigen für `1920`-Fallback und klare Blocker.

## 2026-03-20T22:24:50.636Z assistant_message
phase: commentary

Führe das Bun-Skript jetzt aus und verlasse mich nur auf die Write-Responses zur Verifikation.

## 2026-03-20T22:24:51.672Z tool_call
tool: exec_command
call_id: call_SeRnLLLKsGcKfuOmLuh91XXg

```json
{
  "cmd": "bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222357880Z-f2c57f91/scripts/run.ts",
  "workdir": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-20T22:24:52.828Z tool_result
tool: exec_command
call_id: call_SeRnLLLKsGcKfuOmLuh91XXg

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222357880Z-f2c57f91/scripts/run.ts'
Chunk ID: 29cc00
Wall time: 1.0010 seconds
Process running with session ID 88260
Original token count: 0
Output:

```

## 2026-03-20T22:24:54.429Z assistant_message
phase: commentary

Warte auf das Ergebnis. Եթե ein dokumentierter Blocker auftritt, stoppe ich sofort statt Call-Guessing.

## 2026-03-20T22:24:54.690Z tool_call
tool: write_stdin
call_id: call_lCnuLLn2l46ewR8KzXsHCZe7

```json
{
  "session_id": 88260,
  "chars": "",
  "yield_time_ms": 1000,
  "max_output_tokens": 4000
}
```

## 2026-03-20T22:24:54.699Z tool_result
tool: write_stdin
call_id: call_lCnuLLn2l46ewR8KzXsHCZe7

```text
Command: /run/current-system/sw/bin/zsh -lc 'bun run /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222357880Z-f2c57f91/scripts/run.ts'
Chunk ID: a54bbd
Wall time: 0.0000 seconds
Process exited with code 0
Original token count: 113
Output:
{
  "dimension": {
    "id": 1465,
    "name": "Marked",
    "index": 1
  },
  "values": [
    {
      "id": 16584,
      "name": "Privat"
    },
    {
      "id": 16585,
      "name": "Offentlig"
    }
  ],
  "voucher": {
    "id": 608864752,
    "number": 1,
    "accountId": 458635870,
    "accountNumber": 6300,
    "amount": 44950,
    "linkedDimensionValueId": 16585,
    "balancingAccountId": 458635615,
    "balancingAccountNumber": 1920
  }
}

```

## 2026-03-20T22:24:57.412Z assistant_message
phase: final_answer

Ausgeführt. Endzustand korrekt:

`Marked` erstellt, Werte `Privat` und `Offentlig` erstellt, Beleg `#1` über `44950 NOK` auf Konto `6300` gebucht und mit `Offentlig` verknüpft. Skript: [run.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222357880Z-f2c57f91/scripts/run.ts)

## 2026-03-20T22:24:57.427Z task_event
event: task_complete

Ausgeführt. Endzustand korrekt:

`Marked` erstellt, Werte `Privat` und `Offentlig` erstellt, Beleg `#1` über `44950 NOK` auf Konto `6300` gebucht und mit `Offentlig` verknüpft. Skript: [run.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222357880Z-f2c57f91/scripts/run.ts)
