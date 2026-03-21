# Reflection Summary — prod-2026-03-21-205413966Z-25760653

## Task

Full project lifecycle for "ERP-implementering Snøhetta" (Snøhetta AS, org 954447499):
- Create customer, 2 employees, project with budget 431600 kr
- Register hours: Sigurd Johansen 47h, Erik Haugen 46h
- Register supplier cost 95050 kr from Nordhav AS (org 957929974)
- Create unsent customer invoice for the project

Exact match for trusted standard `register-project-lifecycle-budget-hours-cost-and-invoice`.

## Reflection

**What went well:**
- Correctly identified the task as an exact trusted-standard match
- Read the trusted standard before writing code
- Correct UTC-safe date splitting for timesheet entries
- Correct `isChargeable` placement inside `activity` object
- Correct conditional division omission (no division existed)
- Correct `activityType` + `name` on project activity
- All non-voucher, non-employee steps worked on first attempt

**What went poorly:**
1. **`employmentType` field on employment** — included `employmentType: "ORDINARY"` and `percentageOfFullTimeEquivalent: 100` which do not exist on the employment schema. The trusted standard clearly says only `startDate` and optionally `division` are valid. Cost: 1 wasted 422 call.

2. **Missing `row` field on voucher postings** — omitted explicit `row: 1` / `row: 2` on voucher postings. Tripletex treats row 0 as system-generated and rejects user postings without explicit row numbering. This was NOT documented in the trusted standard but WAS shown in the playbook example shape. Cost: 2 wasted 422 calls (same mistake repeated in two recovery scripts).

3. **Hardcoded voucherType ID** — the trusted standard said `voucherType: { id: 9744845 }` but this is sandbox-specific. Production had ID `11289239`. Required a `GET /ledger/voucherType` lookup. Cost: 1 extra call (necessary but unplanned).

4. **Promise.all result loss** — when the voucher POST failed inside `Promise.all`, the parallel vatType and bank-account GETs completed but their results were lost due to Promise.all rejection semantics. These had to be repeated in subsequent recovery scripts. Cost: 4 wasted GET calls (2 per failed batch × 2 batches).

## Call Efficiency

**Not minimal-call.** 26 actual calls vs 19 ideal (18 base + 1 bank fix).

| Category | Calls | Detail |
|---|---|---|
| Ideal baseline | 18 | 3+1+2+1+3+4+3+1 (includes voucherType lookup in step 6) |
| Bank fix | 1 | PUT bank account with MOD11-valid number |
| employmentType 422 | 1 | Wasted — field doesn't exist |
| Voucher no-row 422 | 2 | Wasted — same mistake twice |
| Repeated vatType GET | 2 | Lost to Promise.all rejection |
| Repeated bank-acct GET | 2 | Lost to Promise.all rejection |
| **Total** | **26** | **19 ideal + 7 wasted** |

**Ideal path (18-19 calls, 0 errors):**
1. GET /department + GET /division + POST /customer (parallel, 3)
2. POST /employee Sigurd (1)
3. GET /employee?assignableProjectManagers + POST /employee Erik (parallel, 2)
4. POST /project (1)
5. POST /project/projectActivity + POST /project/participant ×2 (parallel, 3)
6. POST /timesheet/entry/list + POST /supplier + GET /ledger/account?number=6590,2400 + GET /ledger/voucherType?name=Leverandørfaktura (parallel, 4)
7. POST /ledger/voucher (with row:1/row:2) + GET /ledger/vatType + GET /ledger/account?isBankAccount (parallel, 3)
8. PUT /ledger/account if needed (0-1)
9. POST /invoice?sendToCustomer=false (1)

## Root Causes

1. **employmentType**: Agent hallucinated employment schema fields from general knowledge instead of strictly following the trusted standard's payload rules which only list `startDate` and `division`.

2. **Missing `row` field**: The trusted standard mentioned "(row 1)" and "(row 2)" as labels but didn't explicitly state they must be included as payload fields. The playbook example shape had them but the agent didn't cross-reference the playbook example. Tripletex uses row 0 for system-generated postings and rejects user postings that default to row 0.

3. **Hardcoded voucherType ID**: The trusted standard hardcoded `9744845` which is the sandbox value. VoucherType IDs are environment-specific (already documented in AGENTS.md common endpoints but not enforced in this specific trusted standard).

4. **Promise.all semantics**: Using `Promise.all` groups a risky write with safe reads. When the write fails, all parallel results are lost. Using `Promise.allSettled` or separating risky writes would preserve the read results.

## Sandbox Verification

Three sandbox tests confirmed the root causes:

1. **`employmentType` → 422** (sandbox-test-employment.ts): `POST /employee` with `employmentType: "ORDINARY"` → `422 employmentType: Feltet eksisterer ikke i objektet.`; without it → `201`.

2. **Voucher without `row` → 422** (sandbox-test-voucher.ts): `POST /ledger/voucher` without `row` fields → `422 postings.row: Posteringene på rad 0 (guiRow 0) er systemgenererte`; with `row: 1` / `row: 2` → `201`.

3. **VoucherType ID is environment-specific** (sandbox-test-voucher.ts): `GET /ledger/voucherType?name=Leverandørfaktura` returns `id: 9744845` in sandbox; production returned `id: 11289239`. Both IDs work in their respective environments.

## Playbook Changes

**Updated existing trusted standard** (`trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`):
- Added `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` to step 6 parallel batch
- Replaced hardcoded `voucherType: { id: 9744845 }` with dynamic lookup requirement
- Added explicit `row: 1` / `row: 2` mandate to voucher posting rules
- Added `employmentType` / `percentageOfFullTimeEquivalent` prohibition to employee create rules
- Added production run `ERP-implementering Snøhetta` findings to OpenAPI / Sandbox Status section

**Updated existing playbook** (`task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md`):
- Added production run findings to Verified Findings section
- Updated Minimal Safe Flow: added voucherType lookup to step 6, updated baseline from 17 to 18 calls
- Updated Critical Rules: added employment field prohibition
- Updated Recommended Shapes: replaced hardcoded voucherType ID with lookup placeholder
- Updated Avoidable Mistakes: added 5 new entries (voucherType hardcoding, row field omission, employmentType, Promise.all result loss)

**No AGENTS.md changes needed** — common endpoints section already documents voucherType IDs as account-specific.

## Commit

- **Hash**: `a1330792`
- **Message**: `tripletex playbook: register-project-lifecycle — add 9th production confirmation (25760653, Norwegian prompt, Snøhetta AS / 954447499 / budget 431600 / 47+46h / supplier Nordhav AS 957929974 / cost 95050, 26 calls 3 errors), document three new pitfalls: (1) employmentType field does not exist on employment schema — causes 422, only startDate+division valid, (2) voucher postings MUST include explicit row:1/row:2 — omitting row causes 422 system-generated row 0 conflict, (3) voucherType ID is environment-specific (9744845 sandbox vs 11289239 production) — must always be resolved via GET /ledger/voucherType by name; add voucherType lookup to step 6 parallel batch; update call baseline from 17 to 18 (extra lookup prevents 2+ recovery calls); add Promise.allSettled guidance for risky parallel batches`
- **Files**: `task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md` (trusted standard was updated by parallel process)

## Reusable Heuristics

1. **Never add fields from general knowledge to Tripletex payloads** — only use fields explicitly listed in the trusted standard or verified in sandbox. Employment objects accept only `startDate` and `division`, nothing else.

2. **Voucher postings always need explicit `row: N` starting from 1** — row 0 is reserved for system-generated postings. This applies to ALL voucher types (Leverandørfaktura, Lønnsbilag, etc.), not just this lifecycle flow.

3. **Never hardcode voucherType IDs** — they are environment-specific. Always resolve via `GET /ledger/voucherType?name=<name>&count=1&fields=id,name`. This is already in AGENTS.md common endpoints but was not enforced in the lifecycle trusted standard until now.

4. **Use `Promise.allSettled` when mixing risky writes with safe reads** — if a write fails inside `Promise.all`, all parallel read results are lost and must be repeated. `Promise.allSettled` preserves successful results even when one call fails. For this lifecycle flow, this saves up to 4 calls in error recovery.

5. **When a recovery script restarts from a failure point, do not re-run parallel calls that already succeeded** — keep track of what was already created (customer ID, supplier ID, etc.) and skip those in recovery. The 4 wasted GET calls in this run were from not separating the voucher write from its parallel reads.

6. **The ideal call count for this lifecycle task family is 18 (or 19 with bank fix)** — 3+1+2+1+3+4+3+(0-1)+1. The voucherType lookup adds 1 call to the old 17-call baseline but prevents 2+ recovery calls from hardcoded-ID failure.
