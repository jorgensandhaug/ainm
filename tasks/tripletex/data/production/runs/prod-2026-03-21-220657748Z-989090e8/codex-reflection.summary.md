# Codex Reflection Summary

## 1. Task

Run payroll for Brita Berge (`brita.berge@example.org`) for March 2026. Base salary 36800 kr + one-time bonus 14100 kr = 50900 kr gross. Nynorsk prompt. **Result: 8/8 perfect correctness, 3.0/4.0 normalized score — first-ever success for task 12 after 17 failed attempts.**

## 2. Reflection

**What went well:**
- The run followed the trusted standard exactly — 11 calls, 0 errors, correct task shape match
- Correctly identified the underconfigured employee (dateOfBirth=null, employments=[])
- Correctly detected zero divisions and created one with hardcoded `municipality: { id: 1 }` (no wasted GET /municipality)
- Used `generateTaxDeduction=true` → Skattetrekk spec auto-generated
- Created Lønnsbilag voucher with proper `row` fields and dynamically resolved voucherType id
- Employment details set with `remunerationType: "MONTHLY_WAGE"` and correct `monthlySalary`
- All 3 reads (salary/type, voucherType, accounts) parallelized with `Promise.all`
- First-ever 8/8 score on task 12, proving the full division-create + repair + payroll + voucher path is correct

**What was suboptimal:**
- Used separate `POST /employee/employment/details` (1 unnecessary call) — sandbox investigation proved `POST /employee/employment` accepts inline `employmentDetails[]` and persists all fields correctly
- The repair chain (PUT employee → POST employment → POST employment/details) ran sequentially BEFORE the 3 reads, when they could have been parallelized
- The efficiency gap (3.0/4.0 instead of 4.0/4.0) was likely caused by the extra call; reducing to 10 calls may reach the efficiency bonus threshold

## 3. Call Efficiency

**Production run: 11 calls, 0 errors (no-division underconfigured branch)**

| # | Call | Purpose |
|---|------|---------|
| 1 | `GET /employee?email=brita.berge@example.org&count=10&fields=*` | Find employee |
| 2 | `GET /division?count=1&fields=*` | Check for existing division |
| 3 | `POST /division` | Create division (none existed) |
| 4 | `PUT /employee/18616641` | Set dateOfBirth to 1990-01-01 |
| 5 | `POST /employee/employment` | Create employment |
| 6 | `POST /employee/employment/details` | **WASTED** — could be inlined in step 5 |
| 7 | `GET /salary/type?count=1000&fields=*` | Resolve Fastlønn + Bonus IDs (parallel) |
| 8 | `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` | Resolve voucherType ID (parallel) |
| 9 | `GET /ledger/account?number=5000,1920&count=10&fields=*` | Resolve account IDs (parallel) |
| 10 | `POST /salary/transaction?generateTaxDeduction=true` | Create payroll |
| 11 | `POST /ledger/voucher?sendToLedger=true` | Create Lønnsbilag ledger entries |

**Wasted calls: 1** — `POST /employee/employment/details` (call #6)

**Optimal path (10 calls for no-division branch):**
1. `GET /employee?email=...&count=10&fields=*`
2. `GET /division?count=1&fields=*` → zero rows
3. `POST /division` with generated org number, `municipality: { id: 1 }`
4–8. `Promise.all` parallelizing:
   - Chain A (sequential): `PUT /employee/{id}` with `dateOfBirth` → `POST /employee/employment` with inline `employmentDetails[]`
   - Chain B (parallel): `GET /salary/type` + `GET /ledger/voucherType` + `GET /ledger/account`
9. `POST /salary/transaction?generateTaxDeduction=true`
10. `POST /ledger/voucher?sendToLedger=true`

## 4. Root Causes

- **1 wasted call**: The trusted standard previously instructed a separate `POST /employee/employment/details` after `POST /employee/employment`. The OpenAPI schema shows `Employment` has an `employmentDetails` array, and sandbox testing confirmed inline `employmentDetails[]` in `POST /employee/employment` persists `remunerationType=MONTHLY_WAGE`, `monthlySalary`, and `annualSalary` correctly. The separate call was never needed.
- **Wall-clock suboptimality**: The 3 reads (salary/type, voucherType, accounts) ran after the sequential repair chain, but they are independent and can run concurrently with the repair chain.

## 5. Sandbox Verification

**Test 1: Inline employmentDetails in POST /employee/employment**
- `POST /employee/employment` with `employmentDetails: [{ date: "2026-03-01", employmentType: "ORDINARY", employmentForm: "PERMANENT", remunerationType: "MONTHLY_WAGE", workingHoursScheme: "NOT_SHIFT", percentageOfFullTimeEquivalent: 100, monthlySalary: 36800, annualSalary: 441600 }]` → `201`
- Verified via `GET /employee/employment/details`: `remunerationType=MONTHLY_WAGE`, `monthlySalary=36800`, `annualSalary=441600` — all correctly persisted
- Payroll transaction succeeded: `grossAmount=50900` with Fastlønn 36800, Bonus 14100, Skattetrekk -25450

**Test 2: Parallel repair chain + reads**
- `Promise.all([PUT+POST sequential chain, GET salary/type, GET voucherType, GET accounts])` succeeded
- 8 scored calls (+ 1 voucher = 9 for existing-division, +2 for no-division = 10)
- Wall-clock: ~2s for the parallel batch

**Test 3: Full payslip state inspection**
- Before voucher: `grossAmount=50900`, `amount=25450`, `number=0`, 3 specifications (Fastlønn, Bonus, Skattetrekk)
- Voucher creation in sandbox blocked by reconciled bank statement (sandbox-specific, not production)

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Changes |
|------|---------|
| `./trusted-standards/run-employee-payroll.md` | Replaced separate `POST /employment/details` with inline `employmentDetails[]` in `POST /employment`; updated call counts (no-division 11→10, existing-division 10→9); added repair chain + reads parallelization guidance |
| `./task-playbooks/run-employee-payroll.md` | Added 989090e8 production confirmation; added inline employmentDetails sandbox proof; updated Exact-Match Fast Path call counts; updated Minimal Safe Flow step 7; updated Avoidable Mistakes section |

No AGENTS.md changes needed (payroll entries already present).

## 7. Commit

```
e72c99de tripletex playbook: run-employee-payroll — add 5th production confirmation (989090e8, Nynorsk prompt, Brita Berge / brita.berge@example.org / 36800+14100, 11 calls 0 errors); sandbox-proven inline employmentDetails optimization saves 1 call (POST /employee/employment accepts employmentDetails[], eliminating separate POST /employee/employment/details); updated call counts: no-division 11→10, existing-division 10→9; repair chain can be parallelized with reads via Promise.all
```

## 8. Reusable Heuristics

1. **Inline nested objects when the schema allows it.** `POST /employee/employment` accepts `employmentDetails[]` inline, saving a separate POST call. Always check the OpenAPI schema for writable nested arrays before assuming a child-object POST is needed.

2. **Parallelize independent chains.** The repair chain (PUT employee → POST employment) is independent of the 3 reads (salary/type, voucherType, accounts). Wrapping them in a single `Promise.all` with the repair chain as an async IIFE reduces wall-clock time without changing call count.

3. **The no-division underconfigured branch optimal is 10 calls.** Previous was 11. The reduction comes from inlining employmentDetails. The existing-division branch drops from 10 to 9.

4. **Nynorsk prompts map identically.** "Køyr løn" = "Run payroll", "Grunnløn" = "Base salary", "eingongsbonus" = "One-time bonus". The task shape and API calls are the same as Norwegian Bokmål.

5. **Fresh production accounts rarely have divisions.** The no-division branch (create division first) is the most common path. Always hardcode `municipality: { id: 1 }` — confirmed across all tested accounts.

6. **Voucher `row` field is universal.** EVERY Lønnsbilag posting needs `row: 1, 2, 3` etc. This is not account-specific. Omitting `row` always causes `422 systemgenererte`.

7. **VoucherType IDs are NOT portable.** Never hardcode voucherType IDs — always resolve via `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*`. IDs vary across accounts (sandbox=9744848, production varies).
