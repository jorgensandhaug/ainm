# Reflection Summary — prod-2026-03-22-105022400Z-7b9089af

## Task

Run payroll for Miguel Martínez (miguel.martinez@example.org) for March 2026. Base salary 46800 NOK, one-time bonus 13350 NOK. Spanish-language prompt.

## Reflection

**What went well:**
- Exact trusted-standard match identified immediately — no wasted time on openapi.json or additional file reads
- Script followed the proven 5-write underconfigured-employee path exactly
- All parallelization opportunities exploited: 4 reads in round 1, POST /division + PUT /employee in round 2, POST /salary/transaction + POST /ledger/voucher in round 4
- 0 errors — no 4xx retries, no wasted calls
- All verification GETs confirmed correct state: payslip grossAmount=60150, Skattetrekk=-30075, Lønnsbilag voucher persisted correctly
- Used `voucherType: { id }` (correctly persists) instead of `{ name }` (stores null)

**What could be improved:**
- Nothing material. The run achieved the proven-minimum write count for the underconfigured branch.

## Call Efficiency

**The run was minimal-call.** 5 writes (the proven minimum for underconfigured employees), 0 errors, 14 total calls (9 free GETs).

| Call | Type | Purpose |
|------|------|---------|
| GET /employee | free | Resolve employee by email |
| GET /salary/type | free | Resolve Fastlønn/Bonus ids |
| GET /ledger/account | free | Resolve 5000/1920 account ids |
| GET /ledger/voucherType | free | Resolve Lønnsbilag voucherType id |
| POST /division | **write** | Create division for employment |
| PUT /employee | **write** | Repair dateOfBirth |
| GET /employee (verify) | free | Confirm dateOfBirth repair |
| POST /employee/employment | **write** | Create employment with inline details |
| GET /employee/employment (verify) | free | Confirm division/salary |
| POST /salary/transaction | **write** | Create payroll transaction |
| POST /ledger/voucher | **write** | Create Lønnsbilag ledger entries |
| GET /salary/payslip (verify) | free | Confirm grossAmount/specs |
| GET /ledger/voucher (verify) | free | Confirm postings/type |
| GET /salary/transaction (verify) | free | Confirm transaction exists |

**Wasted calls:** None.

**Lower-call path:** This IS the optimal path. 5 writes cannot be reduced — each is mandatory (sandbox-verified).

## Root Causes

No errors or failures occurred. The run was clean.

**Contradictory documentation found and fixed:**
- AGENTS.md line 222 previously said "prefer `voucherType: { name }`, saves 1 call" — outdated since GETs are free. Updated to recommend `{ id }` for data quality at zero cost.
- Playbook line 140 said "do NOT add GET /ledger/voucherType — wastes 1 call" while the Exact-Match Fast Path section included it. Resolved: since GETs are free, include GET /ledger/voucherType and use `{ id }`.

## Sandbox Verification

**Experiment: Can POST /ledger/voucher be eliminated (reducing to 4 writes)?**
- Created a salary transaction (id=6959437) for sandbox employee (id=18564428) in November 2026 WITHOUT creating a separate Lønnsbilag voucher
- Result: payslip has number=0 (draft), voucher=undefined, compilation=undefined
- Ledger postings in November 2026 existed but were from OTHER pre-existing vouchers, NOT from the salary transaction
- **Conclusion: POST /salary/transaction creates DRAFT payslip only — no ledger entries. POST /ledger/voucher IS mandatory. 5-write path cannot be reduced to 4 writes.**

## Playbook Changes

Updated existing files (no new files created):

| File | Change |
|------|--------|
| `./AGENTS.md` | Line 222: Updated voucherType note — prefer `{ id }` via free GET instead of `{ name }`; removed outdated "saves 1 call" claim |
| `./trusted-standards/run-employee-payroll.md` | Added 7b9089af production proof (5 writes, 0 errors, voucherType { id }, Spanish prompt) + sandbox re-confirmation that voucher is mandatory |
| `./task-playbooks/run-employee-payroll.md` | Fixed contradictory voucherType note (was "do NOT add GET", now "prefer GET + { id }"); added 7b9089af production proof; added sandbox confirmation in Scoring Ceiling Analysis |

## Commit

`df02dddd` — `tripletex playbook: run-employee-payroll — add 7b9089af production proof (5 writes 0 errors) + fix outdated voucherType notes`

## Reusable Heuristics

1. **5 writes is the proven minimum for underconfigured employees.** POST /division, PUT /employee, POST /employment, POST /salary/transaction, POST /ledger/voucher. Each is mandatory and cannot be eliminated (422 sandbox-verified).

2. **POST /salary/transaction creates ONLY a draft payslip** (number=0, no voucher, no compilation, no ledger entries). POST /ledger/voucher is mandatory for ledger-entry scoring checks.

3. **GETs are free — use `voucherType: { id }` over `{ name }`.** The GET /ledger/voucherType costs nothing and `{ id }` correctly persists on readback. `{ name }` stores null. While scorer doesn't check voucherType, `{ id }` is better for data quality at zero cost.

4. **4 rounds is the minimum for underconfigured branch.** Round 1: parallel reads. Round 2: POST /division + PUT /employee (parallel). Round 3: POST /employment (needs divisionId). Round 4: POST /salary/transaction + POST /ledger/voucher (parallel).

5. **All 4 free reads in step 1 are mandatory and cannot be eliminated.** GET /salary/type and GET /ledger/account are required because `salaryType: { name }` and `account: { number }` both fail 422 — only `{ id }` works. These GETs must be done before the salary transaction and voucher writes.

6. **Always include explicit `row` field on voucher postings** starting from 1. Without `row`, Lønnsbilag reserves guiRow 0 for system-generated content → 422.

7. **Always use `amountGross` + `amountGrossCurrency` on voucher postings.** The `amount` field alone is silently accepted but stored as 0.
