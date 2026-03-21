# Codex Reflection — run-employee-payroll (prod-2026-03-21-223000082Z-5cfc2bc5)

## Task
Run payroll for James Williams (james.williams@example.org) for March 2026: base salary 34950 NOK + one-time bonus 15450 NOK = 50400 NOK total. Prompt explicitly allowed manual vouchers as fallback if salary API unavailable.

## Reflection
The run chose the **voucher fallback path** (4 calls) instead of the correct **salary path** (8–9 calls). Two independent bugs compounded:

1. **Wrong path**: The voucher fallback creates **no payslip** and **no tax deduction**. Scoring checks for payslip state (Fastlønn, Bonus, Skattetrekk specifications) will all fail. The salary path via `POST /division` → `POST /employment` → `POST /salary/transaction` is the only path that creates payslips.

2. **Wrong amount field**: Voucher postings used the `amount` field alone. The Tripletex API silently accepts this (returns 201) but stores all amounts as **zero**. The correct fields are `amountGross` + `amountGrossCurrency` (both required, same value for NOK).

Result: a voucher was created but had zero financial impact, and no payslip or salary transaction exists.

## Call Efficiency

### Actual production run (4 calls)
| # | Call | Result |
|---|------|--------|
| 1 | `GET /employee?email=james.williams@example.org` | Found employee, underconfigured (dateOfBirth=null, employments=[]) |
| 2 | `GET /ledger/voucherType?name=Lønnsbilag` | Resolved voucherType id |
| 3 | `GET /ledger/account?number=5000,1920` | Resolved both account ids |
| 4 | `POST /ledger/voucher?sendToLedger=true` | 201 but amounts stored as 0 |

### Optimal path (8 calls, 3 rounds)
| Round | Calls | Purpose |
|-------|-------|---------|
| 1 | `GET /employee` ‖ `GET /salary/type` ‖ `GET /ledger/account?number=5000,1920` | Identify employee + resolve account-scoped lookups (3 parallel) |
| 2 | `POST /division` ‖ `PUT /employee` (dateOfBirth) → `POST /employment` (inline details) | Repair underconfigured employee (2 parallel + 1 chained = 3 calls) |
| 3 | `POST /salary/transaction?generateTaxDeduction=true` ‖ `POST /ledger/voucher?sendToLedger=true` (voucherType by name, amountGross) | Create payslip + ledger entries (2 parallel) |

**Savings vs previous 9-call path**: eliminate `GET /ledger/voucherType` by using `voucherType: { name: "Lønnsbilag" }` inline.

## Root Causes

1. **Trusted standard at read-time recommended voucher fallback** when no division existed and prompt allowed manual vouchers. The standard has since been updated to deprecate this path entirely.

2. **`amount` field bug undocumented**: No prior run or standard mentioned that `amount` alone silently stores zero. This was a zero-knowledge failure — the API gives no error signal.

3. **Underconfigured employee not repaired**: The run saw `dateOfBirth=null` + `employments=[]` but chose the voucher shortcut rather than repairing via `POST /division` + `PUT /employee` + `POST /employment`.

## Sandbox Verification

All sandbox proofs run on 2026-03-21 against `https://kkpqfuj-amager.tripletex.dev/v2`:

| Test | Result |
|------|--------|
| `amount: 50400` only on voucher posting | 201 but read-back: `amount=0, amountGross=0` |
| `amountGross: 50400, amountGrossCurrency: 50400` | 201, read-back: `amount=50400, amountGross=50400` ✓ |
| `amountCurrency` without `amountGross` | 422 error |
| All four fields (amount + amountCurrency + amountGross + amountGrossCurrency) | 201, correct amounts ✓ |
| `voucherType: { name: "Lønnsbilag" }` inline | 201, correct voucherType resolved ✓ |
| `POST /salary/transaction` ‖ `POST /ledger/voucher` parallel | Both 201 in single Promise.all (357ms) ✓ |
| `salaryType: { number: "2000" }` | 422 — must use `salaryType: { id }` |
| `account: { number: 5000 }` in voucher | 422 — must use `account: { id }` |

## Playbook Changes

**Committed** in `b61d9443`:
- `trusted-standards/run-employee-payroll.md`: deprecated voucher fallback; added amountGross requirement; switched to `voucherType: { name }` (saves 1 call); moved GET /salary/type + GET /ledger/account to step 1 (parallel with GET /employee); documented salary tx ‖ voucher parallelization; added production + sandbox evidence
- `task-playbooks/run-employee-payroll.md`: same structural changes — deprecated fallback, name-based voucherType, step-1 parallel reads, amountGross critical note

**Already committed by concurrent processes**:
- `AGENTS.md`: payroll voucher fallback deprecation + amountGross warning
- `trusted-standards/common-endpoints.md`: general amountGross/amountGrossCurrency rule + payroll fallback deprecation

## Commit
```
b61d9443 tripletex playbook: run-employee-payroll — deprecate voucher fallback, fix amountGross bug, optimize to 8-call path
```

## Reusable Heuristics

1. **`amountGross` + `amountGrossCurrency` are mandatory on all voucher postings** — the `amount` field alone is silently accepted but stored as zero. This applies to Lønnsbilag and all other voucher types. Always set both to the same value for NOK.

2. **Never use the voucher-only fallback for payroll** — even when the prompt allows manual vouchers. The voucher path creates no payslip, no tax deduction, and fails all payslip-related scoring checks. The salary path via `POST /division` (harmless duplicate) is always correct.

3. **`voucherType: { name: "Lønnsbilag" }` works inline** — eliminates `GET /ledger/voucherType` entirely (saves 1 call). Sandbox-verified.

4. **`POST /salary/transaction` and `POST /ledger/voucher` are independent** — they can and should be parallelized. Salary transaction is employee-scoped (creates payslip), voucher is account-scoped (creates ledger entries).

5. **Move account-scoped reads to step 1** — `GET /salary/type` and `GET /ledger/account` don't depend on the employee result. Running them parallel with `GET /employee` reduces rounds without adding calls.

6. **Name-based resolution only works for `voucherType`** — `salaryType: { number }` and `account: { number }` both fail with 422. These still require id-based lookup via GET.

7. **`POST /division` is always safe** — it creates a harmless duplicate even when divisions exist. Never spend `GET /division` before creating one in the payroll underconfigured branch.
