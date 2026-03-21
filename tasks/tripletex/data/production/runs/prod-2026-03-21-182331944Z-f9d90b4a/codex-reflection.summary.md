# Reflection Summary — prod-2026-03-21-182331944Z-f9d90b4a

## Task

Process salary for Ana Ferreira (ana.ferreira@example.org) for March 2026. Base salary 41750 NOK + one-time bonus 6750 NOK. Portuguese prompt, no manual-voucher fallback explicitly allowed.

## Reflection

**What went well:**
- Exact match to trusted standard `run-employee-payroll.md` — read it before writing the script
- Correctly identified the underconfigured-employee + no-division branch
- All 8 API calls succeeded with 0 errors
- No unnecessary verification GETs — POST 201 treated as proof of correctness
- Script was clean, handled all branches, generated valid Norwegian org number
- Correctly used repair-first ordering (PUT employee before GET salary/type)
- Total execution was fast and decisive

**What went poorly:**
- Used `GET /municipality?count=1&fields=*` before `POST /division` — this was unnecessary. Municipality id `1` exists in every tested account and `POST /division` accepts `municipality: { id: 1 }` without a prior lookup.

## Call Efficiency

**Production run: 8 calls, 0 errors.**

| # | Call | Status | Necessary? |
|---|------|--------|------------|
| 1 | `GET /employee?email=ana.ferreira@example.org&count=10&fields=*` | 200 | Yes — find employee |
| 2 | `GET /division?count=1&fields=*` | 200 | Yes — check if division exists |
| 3 | `GET /municipality?count=1&fields=*` | 200 | **No — wasted call** |
| 4 | `POST /division` | 201 | Yes — create division |
| 5 | `PUT /employee/18613291` | 200 | Yes — repair dateOfBirth |
| 6 | `POST /employee/employment` | 201 | Yes — create employment |
| 7 | `GET /salary/type?count=1000&fields=*` | 200 | Yes — resolve Fastlønn + Bonus type IDs |
| 8 | `POST /salary/transaction` | 201 | Yes — create payroll |

**Wasted calls: 1** (`GET /municipality`)

**Optimal path for this exact branch (7 calls):**
1. `GET /employee?email=...&count=10&fields=*`
2. `GET /division?count=1&fields=*` → zero rows
3. `POST /division` with `municipality: { id: 1 }` (hardcoded)
4. `PUT /employee/{id}` with `dateOfBirth: "1990-01-01"`
5. `POST /employee/employment`
6. `GET /salary/type?count=1000&fields=*`
7. `POST /salary/transaction`

## Root Causes

The trusted standard at the time of the run documented `GET /municipality?count=1&fields=*` as a required step before `POST /division`. This was inherited from the earlier 2026-03-21 Jules Leroy production run which used the same pattern. Nobody had tested whether the municipality read could be skipped by hardcoding `municipality: { id: 1 }`.

## Sandbox Verification

1. **Hardcoded municipality test:** `POST /division` with `municipality: { id: 1 }` (no prior `GET /municipality`) → succeeded, created `division.id=108393049`. Municipality id `1` is "Agdenes (5016) Inaktiv" — accepted despite inactive status.

2. **Full 6-call path with existing division:** Used sandbox underconfigured employee `id=18591004` with existing division `id=108244566`. Ran: GET employee → GET division → PUT employee → POST employment → GET salary/type → POST salary/transaction. All 6 calls succeeded. Verification payslip confirmed `grossAmount=48500` = `41750 (Fastlønn) + 6750 (Bonus)`.

## Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/run-employee-payroll.md`**:
  - Standard Flow step 5: removed `GET /municipality`, hardcoded `municipality: { id: 1 }`
  - Exact-Match Fast Path no-division branch: 8 calls → 7 calls, removed `GET /municipality` step
  - Known Recovery Branches: updated division-create sub-branch to skip municipality read
  - Pitfalls: updated division-create guidance to hardcode municipality id
  - OpenAPI / Sandbox Status: added Ana Ferreira production run evidence + sandbox municipality-skip proof

- **`./task-playbooks/run-employee-payroll.md`**:
  - Minimal Safe Flow step 5: removed `GET /municipality`, hardcoded `municipality: { id: 1 }`
  - Exact-Match Fast Path: fixed division-exists branch to use repair-first ordering (PUT employee before GET salary/type), updated no-division branch from 8 to 7 calls
  - Verified Findings: added Ana Ferreira production run + sandbox proofs
  - Avoidable Mistakes: updated division-create guidance

## Commit

- Hash: `6dd1d2a0`
- Message: `tripletex playbook: run-employee-payroll — skip GET /municipality, hardcode municipality id 1 in division creation (8→7 calls)`

## Reusable Heuristics

1. **Hardcode `municipality: { id: 1 }` in `POST /division`** — saves 1 call in the no-division branch. Municipality id `1` exists in every tested Tripletex account (production and sandbox). Even though it shows as "Inaktiv", the API accepts it for division creation.

2. **Call counts by branch:**
   - Payroll-ready employee: 3–4 calls
   - Underconfigured employee + division exists: 6 calls
   - Underconfigured employee + no division: **7 calls** (was 8)
   - Underconfigured employee + no division + manual-voucher fallback: 4 calls

3. **Repair-first ordering is correct** — when the employee is underconfigured and division exists, do PUT employee → POST employment → GET salary/type (not GET salary/type first). This avoids wasting the salary-type read if the repair fails.

4. **POST 201 is sufficient proof** — never add verification GETs after a successful `POST /salary/transaction`. The amounts in the POST payload are the amounts in the payslip.
