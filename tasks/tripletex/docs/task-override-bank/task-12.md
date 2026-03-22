# TASK OVERRIDE — Task 12: Run Employee Payroll

**You are running Task 12. The task is already identified. Do not classify.**

## What this task is

Run payroll for one existing employee (identified by email) for a specific month. The prompt gives:
- Employee email to look up
- Target payroll month (explicit or implied)
- Base salary amount
- Optionally a one-off bonus amount

## What to read and execute

1. **Read ONLY** `./trusted-standards/run-employee-payroll.md`
2. The trusted standard has the complete flow for both branches (payroll-ready: 2 writes, underconfigured: 5 writes). Follow it exactly.
3. **Immediately write and execute** with `bun`. Do NOT read AGENTS.md, openapi.json, or playbooks.

## Two branches based on employee state

### Payroll-ready employee (2 writes)
Employee already has `dateOfBirth`, active employment, division → skip to salary transaction + voucher.

### Underconfigured employee (5 writes) — the common case
Employee has `dateOfBirth=null` and `employments=[]`. Must:
1. **POST /division** + **PUT /employee** (dateOfBirth repair) — parallel
2. **POST /employee/employment** with inline `employmentDetails[]` — needs division.id
3. **POST /salary/transaction?generateTaxDeduction=true** + **POST /ledger/voucher?sendToLedger=true** — parallel

## Critical instructions

- **Step 1 (4 parallel GETs — all free)**: `GET /employee?email=...` + `GET /salary/type?count=1000` + `GET /ledger/account?number=5000,1920` + `GET /ledger/voucherType?name=Lønnsbilag`
- **Division**: always `POST /division` (never GET first — harmless duplicate). Use municipality `{ id: 1 }`, generate a random valid Norwegian org number (with checksum), NOT the company's own org number.
- **Employment**: must include inline `employmentDetails[]` with `monthlySalary`, `annualSalary: salary * 12`, `remunerationType: "MONTHLY_WAGE"`, `employmentType: "ORDINARY"`, `employmentForm: "PERMANENT"`, `workingHoursScheme: "NOT_SHIFT"`, `percentageOfFullTimeEquivalent: 100`
- **Salary transaction**: `?generateTaxDeduction=true` is MANDATORY — auto-generates Skattetrekk spec
- **Lønnsbilag voucher**: use `voucherType: { id: <from GET> }` (id-based, not name-based). Every posting MUST have explicit `row: 1, 2, 3...` and use `amountGross`/`amountGrossCurrency` (not just `amount`). Debit on 5000, credit on 1920.
- **Salary types**: resolve by exact name match — `Fastlønn` for base salary, `Bonus` for bonus
- **Verification GETs after every write** — free, confirm state

## Known traps

- `amount` field alone silently stores 0 — MUST use `amountGross` + `amountGrossCurrency`
- Without `row` field, postings default to row 0 (system-reserved for Lønnsbilag) → 422
- `voucherType: { name: "Lønnsbilag" }` stores null — use `{ id: <resolved> }`
- Company's own org number on division → 422 (juridisk enhet). Generate a random valid one.
- `dateOfBirth=null` blocks employment creation — repair with PUT first
- Missing `?generateTaxDeduction=true` → no Skattetrekk spec → scorer may reject

## Production track record

- Run 08a38984 (2026-03-22): 8 calls, 0 errors, 4/4 checks
- Run 2b1b0da1 (2026-03-21): 11 calls, 0 errors, 4/4 checks, scored 2.333/4.0

## If the prompt doesn't match

If the incoming prompt is NOT about running payroll for an employee (salary, bonus, payslip), say so and stop.
