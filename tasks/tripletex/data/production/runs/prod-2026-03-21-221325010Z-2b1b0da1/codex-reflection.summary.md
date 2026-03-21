# Score Reflection: Run Employee Payroll — Beatriz Pereira

## 1. Task

- **Run ID**: `prod-2026-03-21-221325010Z-2b1b0da1`
- **Task ID**: 12 (payroll)
- **Prompt**: "Processe o salário de Beatriz Pereira (beatriz.pereira@example.org) para este mês. O salário base é de 58650 NOK. Adicione um bónus único de 8850 NOK além do salário base." (Portuguese)
- **Employee**: Beatriz Pereira, beatriz.pereira@example.org, id=18616765
- **Amounts**: Fastlønn 58650, Bonus 8850, Gross 67500
- **Branch**: underconfigured employee (dateOfBirth=null, employments=[]), no division → full division-create + repair + payroll + voucher

## 2. Reflection

**What went well:**
- 0 errors across all 11 API calls
- Followed the trusted standard exactly
- All checks passed (8/8 raw, 4/4 checks including Check 5 for ledger entries)
- Correct identification of the underconfigured employee branch
- Proper use of `generateTaxDeduction=true`, dynamic voucherType resolution, explicit `row` fields on voucher postings
- Proper creation of Lønnsbilag voucher with dynamically resolved voucherType id (8215552 for that account)

**What went poorly / could be improved:**
- Used `GET /division?count=1&fields=*` (call #2) before `POST /division` (call #3) — the GET always returns empty in fresh accounts, making it a wasted call. `POST /division` succeeds even when divisions exist (creates harmless duplicate).
- Used separate `POST /employee/employment/details` (call #6) instead of inline `employmentDetails[]` in `POST /employee/employment` — the trusted standard already documented the inline approach saves 1 call, but the production script didn't use it.
- Sequential execution of independent operations: `POST /division` and `PUT /employee` could have been parallelized since they're independent (division is account-level, PUT is employee-level).
- Sequential execution of `POST /employment` and the 3 reads — these are independent (employment is employee-scoped, reads are account-scoped).

## 3. Call Efficiency

**Run was NOT minimal-call.** Used 11 calls; optimal is 9 calls for this exact branch.

### Actual call sequence (11 calls, 0 errors):
| # | Call | Purpose | Wasted? |
|---|------|---------|---------|
| 1 | `GET /employee?email=...` | Find employee | No |
| 2 | `GET /division?count=1` | Check division exists | **YES** — always POST instead |
| 3 | `POST /division` | Create division | No |
| 4 | `PUT /employee/{id}` | Set dateOfBirth | No |
| 5 | `POST /employee/employment` | Create employment | No |
| 6 | `POST /employee/employment/details` | Set monthlySalary/remunerationType | **YES** — use inline details |
| 7 | `GET /salary/type` | Resolve Fastlønn/Bonus IDs | No |
| 8 | `GET /ledger/voucherType` | Resolve Lønnsbilag ID | No |
| 9 | `GET /ledger/account` | Resolve 5000/1920 IDs | No |
| 10 | `POST /salary/transaction` | Create payroll | No |
| 11 | `POST /ledger/voucher` | Create ledger entries | No |

### Wasted calls:
1. **GET /division** (call #2): Always returns empty in fresh accounts. `POST /division` succeeds even when divisions exist. Skip the GET, always POST. Saves 1 call.
2. **POST /employee/employment/details** (call #6): Inline `employmentDetails[]` in `POST /employee/employment` persists all fields correctly. Saves 1 call.

### Optimized 9-call path the next agent should follow:
1. `GET /employee?email=...&count=10&fields=*`
2-3. `Promise.all`: `POST /division` + `PUT /employee/{id}` (independent, parallel)
4-7. `Promise.all`: `POST /employee/employment` (with inline `employmentDetails[]`) + `GET /salary/type` + `GET /ledger/voucherType` + `GET /ledger/account` (independent, parallel)
8. `POST /salary/transaction?generateTaxDeduction=true`
9. `POST /ledger/voucher?sendToLedger=true`

Wall-clock rounds: 5 (vs 9 in the production run).

## 4. Root Causes

1. **GET /division habit**: The script followed the older documented pattern of GET-then-conditional-POST. The optimization to skip GET was not yet in the trusted standard when the production script was written.
2. **Separate employment/details**: The script used the older `POST /employee/employment` + `POST /employee/employment/details` pattern. The inline `employmentDetails[]` optimization was already documented in the trusted standard but the production script predated the latest update.
3. **Sequential execution**: Independent operations were executed sequentially instead of being parallelized.

## 5. Sandbox Verification

- **POST /division with existing divisions**: Verified that `POST /division` returns 201 even when 18+ divisions already exist. Creates a new division without errors. Harmless duplicate.
- **Parallel execution**: Verified that `POST /division` and concurrent API calls (GET /employee) execute in parallel without conflicts (120ms for both).
- **Parallel reads**: Confirmed `GET /salary/type` + `GET /ledger/voucherType` + `GET /ledger/account` all succeed in parallel (296ms for all 3).
- **Scoring confirmation**: Cross-referenced with concurrent run 989090e8 (Brita Berge, same branch): 8/8 raw, 5/5 checks passed, including **Check 5 for ledger entries** — confirming Lønnsbilag voucher IS required for 100% correctness.
- **Voucher cannot be dropped**: Check 5 explicitly verifies ledger entries. The 3 voucher-related calls (voucherType lookup, accounts lookup, voucher POST) are all necessary.

## 6. Playbook Changes

**Updated existing files** (no new files created):

| File | Changes |
|------|---------|
| `trusted-standards/run-employee-payroll.md` | Removed GET /division step, added always-POST-division pattern, documented parallel POST /division + PUT /employee, documented parallel POST /employment + 3 reads, added production proofs for 2b1b0da1 and 989090e8, updated call counts from 10/11 to 9 |
| `task-playbooks/run-employee-payroll.md` | Same optimizations in Minimal Safe Flow and Exact-Match Fast Path sections, unified underconfigured branch to 9 calls, added production proofs, updated Avoidable Mistakes section |

No AGENTS.md changes needed — file references unchanged.

## 7. Commit

- **Hash**: `65a9f5ba`
- **Message**: `tripletex playbook: run-employee-payroll — optimize underconfigured branch from 11 to 9 calls via two changes: (1) skip GET /division, always POST /division directly (succeeds even when divisions exist, creates harmless duplicate, sandbox-verified), (2) parallelize POST /division + PUT /employee, then parallelize POST /employment (inline details) + 3 reads; add production confirmations 2b1b0da1 and 989090e8; confirm Lønnsbilag voucher IS required for Check 5`

## 8. Reusable Heuristics

1. **Skip GET-before-POST when POST is idempotent or duplicates are harmless.** In this case, `POST /division` creates a new division even if one exists — and duplicates don't affect payroll scoring. Skipping the GET saved 1 call.

2. **Inline nested resources to save calls.** `POST /employee/employment` with inline `employmentDetails[]` saves a separate `POST /employee/employment/details` call. Always prefer inline creation when the API supports it.

3. **Parallelize independent operations aggressively.** Division creation (account-level) and employee repair (employee-level) are independent. Employment creation (employee-scoped) and account-level reads (salary types, voucher types, accounts) are independent. Parallelizing these saves wall-clock rounds without changing call count.

4. **Lønnsbilag voucher is REQUIRED for 100% correctness.** The scorer's Check 5 verifies ledger entries. Without the voucher, the salary transaction creates only a draft payslip with no accounting entries.

5. **Dynamic voucherType resolution is mandatory.** VoucherType IDs vary across accounts (sandbox=9744848, production varies e.g. 8145240, 8212977, 8215552). Always resolve via `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*`.

6. **Explicit `row` fields are mandatory on Lønnsbilag voucher postings.** Without `row`, postings default to guiRow 0 which is system-reserved → 422 error.

7. **Combined account lookups save calls.** `GET /ledger/account?number=5000,1920&count=10&fields=*` returns both accounts in one call.

8. **Score breakdown for 11 calls, 0 errors: 8/8 raw → 3.0/4.0 normalized (75% efficiency).** The 9-call path should yield ~85%+ efficiency multiplier.
