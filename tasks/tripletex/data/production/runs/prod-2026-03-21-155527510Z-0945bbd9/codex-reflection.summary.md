# Codex Reflection Summary

## 1. Task

Full project lifecycle for "Cloud-Migration Eichenhof" (Eichenhof GmbH, Org.Nr. 986645888):
- Create customer, two employees, project with 253000 NOK budget
- Register hours: Hannah Weber 34h, Marie Fischer 118h
- Register supplier cost 47050 NOK from Silberberg GmbH (Org.Nr. 823323948)
- Create unsent customer invoice

Matched trusted standard: `register-project-lifecycle-budget-hours-cost-and-invoice.md`

## 2. Reflection

**What went well:**
- Correctly identified the exact trusted standard match
- Customer, employees (on retry), project, project activity, supplier, timesheet batch, and cost line all created successfully
- Batch timesheet `POST /timesheet/entry/list` worked correctly with 21 entries across 2 employees

**What went poorly:**
- 3 avoidable `422`/`409` errors across 3 script executions
- Task left INCOMPLETE — the invoice was never created
- Agent stopped after the bank-account repair failure instead of retrying with the correct value

**Mistakes:**
1. `division: { id: undefined }` sent on first employee create — `422`
2. Timesheet batch returned transient `409` on second script (succeeded on third)
3. Bank account repair used `"12345678901"` (invalid MOD11) — `422`

## 3. Call Efficiency

**Run was NOT minimal-call. Task was INCOMPLETE.**

| Script | Success | Errors | Total |
|--------|---------|--------|-------|
| lifecycle.ts | 3 | 1 | 4 |
| lifecycle2.ts | 6 | 1 | 7 |
| lifecycle3.ts | 4 | 1 | 5 |
| **Total** | **13** | **3** | **16** |

**Ideal path: 14 calls, 0 errors** (or 15 with bank account repair).

**Wasted calls:**
1. `POST /employee` with `division: { id: undefined }` → `422` (wasted 1 call)
2. `POST /timesheet/entry/list` transient `409` (wasted 1 call)
3. `PUT /ledger/account/{id}` with invalid bank number → `422` (wasted 1 call, and blocked the invoice)

**Correct lower-call path (14-15 calls, 0 errors):**
1. `GET /department` + `GET /division` + `POST /customer` (3 parallel)
2. `POST /employee` (Hannah) — conditionally omit division if none exists
3. `GET /employee?assignableProjectManagers=true` + `POST /employee` (Marie) (2 parallel)
4. `POST /project`
5. `POST /project/projectActivity`
6. `POST /timesheet/entry/list` + `POST /supplier` (2 parallel)
7. `POST /project/orderline` + `GET /ledger/vatType` + `GET /ledger/account` (3 parallel)
8. (conditional) `PUT /ledger/account/{id}` with `"12345678903"` if bank account needs number
9. `POST /invoice?sendToCustomer=false`

## 4. Root Causes

### Division guard missing
- `GET /division?count=1&fields=*` returned an empty array in this production account (no divisions configured)
- The script unconditionally built `division: { id: divId }` where `divId` was `undefined`
- Tripletex interprets `division: { id: undefined }` as an attempt to create a new division and fails with `422 employments.division.name: Feltet kan ikke være tomt.`
- **Fix:** Conditionally include `division` only when the division read returned a usable row

### Invalid bank account number
- The bank account repair step used `"12345678901"` — a random 11-digit number
- Norwegian bank account numbers use MOD11 check digits; arbitrary numbers fail validation
- The correct proven value `"12345678903"` was already documented in other trusted standards (`create-and-send-customer-invoice.md`, `create-order-invoice-and-register-payment.md`, `common-endpoints.md`) but NOT in the lifecycle trusted standard
- **Fix:** Always use `"12345678903"` for bank account repair; documented it in the lifecycle standard

### Transient timesheet 409
- `POST /timesheet/entry/list` returned `409` ("Det er allerede registrert timer") despite all entries having unique (employee, date, activity, project) tuples
- The same batch succeeded on immediate retry
- Likely a transient server-side conflict, not a payload shape error
- **Fix:** No payload change needed; the retry succeeded

## 5. Sandbox Verification

Persistent sandbox re-proof (`kkpqfuj-amager.tripletex.dev`) confirmed:
- Full lifecycle path succeeds in **14 calls** when bank account already has a number
- Employee create succeeds without `division` when the division read returned empty — sandbox had divisions, so the no-division branch was proven by the production run
- `POST /timesheet/entry/list` with 21 entries (2 employees, overlapping dates) → `201` with all entries
- `POST /project/orderline` non-chargeable cost → `201`
- `POST /invoice?sendToCustomer=false` → `201`, `amountExcludingVatCurrency=253000`, `projectInvoiceDetails.length=1`
- Bank account already had `bankAccountNumber=12345678903` in sandbox, so PUT was not needed
- Sandbox outgoing VAT filter only returns id=6 (0%); production returns id=3 (25%) — this is environment-specific, not a bug

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Changes |
|------|---------|
| `trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` | Added division-empty guard in Payload Rules; added division-empty recovery branch; specified `"12345678903"` for bank account repair; added production run evidence |
| `task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md` | Added division-empty guard in Critical Rules and Conditional Branches; added no-division employee shape example; specified `"12345678903"` for bank account; added production run evidence; added two avoidable mistakes |
| `trusted-standards/common-endpoints.md` | Added division-empty guard in Employee section with production evidence |
| `AGENTS.md` | Updated bank account repair instruction with exact `"12345678903"` value, added `POST /invoice` failure case, added MOD11 warning with production evidence |

## 7. Commit

```
2773395e tripletex playbook: guard division-empty and bank-account MOD11 in project lifecycle
```

4 files changed, 48 insertions, 8 deletions.

## 8. Reusable Heuristics

1. **Division guard is mandatory**: When `GET /division` returns empty, omit `division` from all employment payloads. Sending `division: { id: undefined }` is a Tripletex create-division intent, not a no-op.

2. **Bank account numbers must be MOD11-valid**: Norwegian bank accounts (`kontonummer`) have 11 digits with a MOD11 check digit. Always use the proven value `"12345678903"`. Never generate random 11-digit numbers.

3. **Conditional object construction**: When building payloads that reference optional resources (division, vendor, etc.), use conditional inclusion patterns: `const row: any = { startDate }; if (divId) row.division = { id: divId };` — not unconditional spread.

4. **Cross-reference bank account numbers**: The `"12345678903"` value was already documented in 5+ other standards but missing from the lifecycle standard. When adding recovery branches to new standards, check existing standards for proven values.

5. **Transient 409 on batch timesheet**: `POST /timesheet/entry/list` can return transient `409` even with unique entries. Retry once before investigating payload shape.

6. **Script resilience**: Write scripts that can continue from the point of failure. The production run required 3 separate scripts because each stopped at the first error. A single script with error handling and continuation would have been more efficient.
