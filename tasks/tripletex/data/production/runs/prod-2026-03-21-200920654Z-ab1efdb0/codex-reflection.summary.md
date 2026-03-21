# Codex Reflection Summary — prod-2026-03-21-200920654Z-ab1efdb0

## Task

Run payroll for Fernando López (fernando.lopez@example.org), March 2026, base salary 37850 NOK + one-time bonus 9200 NOK. Spanish prompt. No manual-voucher fallback permitted.

## Reflection

**What went well:**
- Core payroll setup was optimal: calls 1-8 (employee lookup → division creation → employee repair → employment/details → salary types → salary transaction) all succeeded without errors.
- Correctly identified underconfigured employee (dateOfBirth=null, employments=[]) and followed the division-create + repair branch.
- POST /employee/employment/details with remunerationType=MONTHLY_WAGE was included (avoiding the 0/8 scoring trap).
- generateTaxDeduction=true was used on the salary transaction.

**What went poorly:**
- Voucher creation burned 4 consecutive 422 errors and 5 extra API calls before succeeding on the 5th attempt.
- Root cause 1: trusted standard hardcoded voucherType id 9744848 as "stable across all tested instances" — but that was the sandbox ID; this production account's Lønnsbilag was id 8145240.
- Root cause 2: trusted standard did not document the `row` field requirement for voucher postings. Without explicit `row` values, all postings default to guiRow 0, which Lønnsbilag reserves for system-generated content.
- Root cause 3: used two separate GET /ledger/account calls instead of one combined comma-separated call.

**Mistakes:**
1. Attempted POST /ledger/voucher with hardcoded voucherType 9744848 → 422 Ugyldig bilagstype
2. Retried with voucherType null → 422 systemgenererte
3. Retried with no voucherType field → 422 systemgenererte
4. Discovered correct voucherType via GET /ledger/voucherType, but still failed without `row` field → 422 systemgenererte
5. Finally succeeded with correct voucherType + explicit row: 1, 2, 3

## Call Efficiency

**Actual run: 16 API calls, 4 errors (422)**

| # | Call | Status | Note |
|---|------|--------|------|
| 1 | GET /employee?email=fernando.lopez@example.org | 200 | Found underconfigured employee |
| 2 | GET /division?count=1 | 200 | Zero rows → create |
| 3 | POST /division | 201 | Created division |
| 4 | PUT /employee/18614649 | 200 | Set dateOfBirth |
| 5 | POST /employee/employment | 201 | Created employment |
| 6 | POST /employee/employment/details | 201 | Set monthlySalary/remunerationType |
| 7 | GET /salary/type | 200 | Resolved Fastlønn + Bonus |
| 8 | POST /salary/transaction | 201 | Created payroll tx |
| 9 | GET /ledger/account?number=5000 | 200 | Needed |
| 10 | GET /ledger/account?number=1920 | 200 | **Wasted** — could combine with call 9 |
| 11 | POST /ledger/voucher (type 9744848) | 422 | **Wasted** — wrong voucherType ID |
| 12 | POST /ledger/voucher (type null) | 422 | **Wasted** — retry |
| 13 | POST /ledger/voucher (no type) | 422 | **Wasted** — retry |
| 14 | GET /ledger/voucherType | 200 | Discovery call (needed) |
| 15 | POST /ledger/voucher (type 8145240, no row) | 422 | **Wasted** — missing row field |
| 16 | POST /ledger/voucher (type 8145240, row 1,2,3) | 201 | Success |

**Wasted calls: 5** (calls 10, 11, 12, 13, 15)

**Optimal path: 11 calls, 0 errors**

1. GET /employee?email=...&count=10&fields=*
2. GET /division?count=1&fields=*  → zero rows
3. POST /division (with generated org number, municipality id 1)
4. PUT /employee/{id} (dateOfBirth: 1990-01-01)
5. POST /employee/employment
6. POST /employee/employment/details
7. GET /salary/type?count=1000&fields=* (parallel)
8. GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=* (parallel)
9. GET /ledger/account?number=5000,1920&count=10&fields=* (parallel)
10. POST /salary/transaction?generateTaxDeduction=true
11. POST /ledger/voucher?sendToLedger=true (with resolved voucherType + row: 1, 2, 3)

Calls 7-9 are independent and can run in parallel with Promise.all, reducing wall-clock time by ~50%.

## Root Causes

1. **Hardcoded voucherType ID**: The trusted standard stated `voucherType: { id: 9744848 }` was "stable across all tested instances." This was only true for the persistent sandbox. Each production account has its own voucherType IDs. The sandbox Lønnsbilag was 9744848; this production account's was 8145240.

2. **Missing `row` field documentation**: The trusted standard for this payroll task did not document that voucher postings need explicit `row` values. The common-endpoints.md already had this rule for supplier invoice vouchers, but the payroll standard didn't cross-reference it. Lønnsbilag reserves guiRow 0 for system-generated content; any posting without an explicit `row` defaults to guiRow 0 and triggers a 422.

3. **Separate account lookups**: The standard used two separate GET /ledger/account calls (one for 5000, one for 1920) when the API supports comma-separated numbers returning both in one call.

## Sandbox Verification

All fixes verified in persistent sandbox on 2026-03-21:

- `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` → returns exact match (sandbox id=9744848), confirmed by production (id=8145240)
- `GET /ledger/account?number=5000,1920&count=10&fields=*` → returns both accounts in single call
- `POST /ledger/voucher` WITH `row: 1, 2, 3` → 201, voucher id=609131104, number=387
- `POST /ledger/voucher` WITHOUT `row` → 422 `Posteringene på rad 0 er systemgenererte` (same error as production)
- Parallel reads (salary/type + voucherType + accounts) via Promise.all: 203ms vs 469ms sequential

## Playbook Changes

Updated existing files (no new files created):

| File | Changes |
|------|---------|
| `./trusted-standards/run-employee-payroll.md` | Replace hardcoded voucherType 9744848 with dynamic GET /ledger/voucherType?name=Lønnsbilag lookup; add row field requirement; combine account lookups; add Promise.all parallelization; add production proof from ab1efdb0; update all fast path call counts |
| `./task-playbooks/run-employee-payroll.md` | Same changes as trusted standard: dynamic voucherType, row field, combined accounts, parallel reads, updated call counts, production proof |
| `./trusted-standards/common-endpoints.md` | Add new Ledger Voucher Type section with GET /ledger/voucherType endpoint, name filter, and account-specific ID warning |
| `./AGENTS.md` | Add `/ledger/voucherType` to common endpoints list |

## Commit

- Hash: `bfc111ee`
- Message: `tripletex playbook: run-employee-payroll — fix 3 critical voucher creation bugs exposed by production run ab1efdb0 (Fernando López / fernando.lopez@example.org / 37850 + 9200, 16 calls 4 errors → optimal 11 calls 0 errors): (1) voucherType ids are account-specific, not stable — replace hardcoded id 9744848 with dynamic GET /ledger/voucherType?name=Lønnsbilag lookup, (2) voucher postings MUST include explicit row field starting from 1 (without row, Lønnsbilag reserves guiRow 0 for system-generated content → 422), (3) combine GET /ledger/account?number=5000,1920 into single call saving 1 API call; add GET /ledger/voucherType to AGENTS.md common endpoints and common-endpoints.md; sandbox-prove all 3 fixes plus Promise.all parallelization of salary/type + voucherType + accounts reads`

## Reusable Heuristics

1. **Never hardcode voucherType IDs**: Always resolve via `GET /ledger/voucherType?name=<exact name>&count=1&fields=*`. IDs are account-specific. The sandbox may use different IDs than production, and each production account has its own set.

2. **Always include explicit `row` field on voucher postings**: Start from `row: 1`. Without it, postings default to guiRow 0 which is system-reserved for many voucher types (Lønnsbilag, supplier invoices, etc.). This is universal across all Tripletex accounts.

3. **Use comma-separated numbers for batch account lookup**: `GET /ledger/account?number=5000,1920&count=10&fields=*` returns both accounts in one call. This saves 1 API call vs two separate lookups.

4. **Parallelize independent reads**: After the employee repair branch completes, salary/type + voucherType + accounts are all independent reads. Use `Promise.all` to run them concurrently, cutting wall-clock time by ~50% without changing call count.

5. **Optimal call counts for the payroll task with Lønnsbilag voucher**:
   - Payroll-ready employee: 7 calls
   - Underconfigured employee, existing division: 10 calls
   - Underconfigured employee, no division (create one): 11 calls
   - Fallback manual voucher (no division, prompt allows): 4 calls

6. **When you discover a hardcoded ID fails with 422**: Before retrying blindly, look up the correct ID by name filter. The Tripletex API consistently supports name-based filtering on lookup endpoints. One targeted lookup call is cheaper than multiple blind retries.
