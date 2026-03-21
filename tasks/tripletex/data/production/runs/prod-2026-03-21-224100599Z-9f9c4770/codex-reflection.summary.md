# Codex Reflection: prod-2026-03-21-224100599Z-9f9c4770

## 1. Task

Run payroll for Brita Berge (brita.berge@example.org) for March 2026. Base salary 36800 kr, one-time bonus 14100 kr. Nynorsk prompt. Exact match for the `run-employee-payroll` trusted standard — underconfigured employee branch.

## 2. Reflection

**What went well:**
- Correctly identified this as an exact trusted-standard match and read the standard before writing any script
- Used the 9-call underconfigured path: GET employee → POST division + PUT employee (parallel) → POST employment + 3 reads (parallel) → POST salary/transaction → POST voucher
- All 9 calls returned 2xx; zero errors
- Inline `employmentDetails[]` used correctly (saves 1 call vs separate POST)
- Skipped `GET /division` — always POST directly (saves 1 call)
- Parallelized correctly: POST division + PUT employee, then POST employment + 3 reads

**What went poorly:**
1. **Voucher amounts stored as 0**: The script sent only `amount` on voucher postings. The Tripletex API silently accepts `amount` but stores it as 0; the correct field is `amountGross` and `amountGrossCurrency`. All three voucher postings have zero financial amounts in the database.
2. **Wasted GET /ledger/voucherType call**: The script spent 1 call on `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` when `voucherType: { name: "Lønnsbilag" }` can be passed inline in `POST /ledger/voucher`.
3. **Reads not optimized to step 1**: `GET /salary/type` and `GET /ledger/account` were placed in step 3 (parallel with POST employment) instead of step 1 (parallel with GET employee). This doesn't change call count but adds an unnecessary round when combined with the voucherType-by-name optimization.

## 3. Call Efficiency

**This run used 9 calls. It was NOT minimal.**

| Call | Endpoint | Status | Necessary? |
|------|----------|--------|------------|
| 1 | GET /employee | 200 | Yes |
| 2 | POST /division | 201 | Yes |
| 3 | PUT /employee | 200 | Yes |
| 4 | POST /employee/employment | 201 | Yes |
| 5 | GET /salary/type | 200 | Yes |
| 6 | **GET /ledger/voucherType** | 200 | **No — use name inline** |
| 7 | GET /ledger/account | 200 | Yes |
| 8 | POST /salary/transaction | 201 | Yes |
| 9 | POST /ledger/voucher | 201 | Yes (but amounts=0 due to missing amountGross) |

**Wasted calls:** 1 (GET /ledger/voucherType)

**Optimal path: 8 calls, 4 rounds:**
1. `Promise.all`: GET /employee + GET /salary/type + GET /ledger/account (3 reads parallel)
2. `Promise.all`: POST /division + PUT /employee (2 writes parallel)
3. POST /employee/employment (needs division.id from step 2)
4. `Promise.all`: POST /salary/transaction + POST /ledger/voucher with `voucherType: { name: "Lønnsbilag" }` (2 writes parallel)

## 4. Root Causes

1. **amountGross bug**: The trusted standard at the time of the run did not yet document the `amountGross`/`amountGrossCurrency` requirement for voucher postings. The `amount` field is accepted by the API (201 response) but silently stored as 0. This was discovered by a concurrent reflection process and documented shortly after this run.

2. **GET /voucherType wasted call**: The trusted standard at the time of the run specified `GET /ledger/voucherType?name=Lønnsbilag&count=1&fields=*` as a required read. This sandbox investigation proved `voucherType: { name: "Lønnsbilag" }` works inline, eliminating the lookup entirely.

3. **Reads placement**: The trusted standard placed the 3 reads in step 6 (parallel with POST employment). Moving 2 of those reads to step 1 (parallel with GET employee) reduces total rounds from 5 to 4 when combined with the voucherType-by-name optimization.

## 5. Sandbox Verification

**Test: voucherType by name** — `POST /ledger/voucher?sendToLedger=true` with `voucherType: { name: "Lønnsbilag" }` → 201, correct type and amounts. Eliminates GET /ledger/voucherType.

**Test: amountGross vs amount** — Four-way comparison:
- `amount: 5000` only → stored as `amount: 0, amountGross: 0` (WRONG)
- `amountGross: 5000, amountGrossCurrency: 5000` → stored as `amount: 5000, amountGross: 5000` (CORRECT)
- All fields together → stored correctly
- voucherType by name + amountGross → stored correctly

**Test: parallel salary transaction + voucher** — Both POST calls succeeded in a single `Promise.all` (357ms, ids 6958320 and 609194458). Confirms they are independent.

**Test: salaryType by number** — `salaryType: { number: "2000" }` → 422 "Kan ikke opprette subelement". Must use id.

**Test: account by number** — `account: { number: 5000 }` → 422 "account.name: Kan ikke være null". Must use id.

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Changes |
|------|---------|
| `./trusted-standards/run-employee-payroll.md` | 8-call path (was 9); voucherType by name; amountGross requirement; move reads to step 1; parallelize final writes; add 9f9c4770 production proof and sandbox proofs |
| `./task-playbooks/run-employee-payroll.md` | Same 8-call path updates; step 1 parallel reads; voucherType by name; amountGross requirement; deprecate 9-call references |
| `./trusted-standards/common-endpoints.md` | voucherType by name for Lønnsbilag; update 9-call → 8-call reference |
| `./AGENTS.md` | voucherType by name hint at /ledger/voucherType entry; update 9-call → 8-call reference in DEPRECATED voucher fallback note |

## 7. Commit

```
96a3035f tripletex playbook: run-employee-payroll — optimize from 9 to 8 calls via voucherType-by-name; add amountGross requirement; production run 9f9c4770 (Brita Berge 36800+14100, 9 calls 0 errors) exposed two bugs: (1) voucher postings sent only `amount` → stored as 0 (must use amountGross/amountGrossCurrency), (2) spent GET /ledger/voucherType when voucherType: { name: "Lønnsbilag" } works inline; sandbox-verified both optimizations; new 8-call underconfigured path: step 1 GET employee + GET salary/type + GET account (parallel), step 2 POST division + PUT employee (parallel), step 3 POST employment, step 4 POST salary/transaction + POST voucher (parallel); payroll-ready path drops from 7 to 5 calls
```

## 8. Reusable Heuristics

1. **`voucherType: { name }` works inline** — For known voucher types like Lønnsbilag, pass the name directly in POST /ledger/voucher instead of spending a GET call. This saves 1 call per voucher creation. (Does NOT apply to salaryType or account — those still require id resolution.)

2. **`amount` silently stores 0** — On POST /ledger/voucher, always use `amountGross` and `amountGrossCurrency`. The `amount` field is accepted but stored as 0. This is a silent data loss bug with no API error. The API returns 201 and the voucher looks correct in the response, but readback shows zero amounts.

3. **Move account-scoped reads to step 1** — GET /salary/type and GET /ledger/account are account-level lookups with no dependency on the employee result. Running them in parallel with GET /employee in step 1 saves a full sequential round.

4. **Parallelize final writes** — POST /salary/transaction (creates payslip, employee-scoped) and POST /ledger/voucher (creates ledger entries, account-scoped) are independent and can run in Promise.all.

5. **salaryType and account need ids** — `salaryType: { number }` and `account: { number }` both fail with 422. These lookups cannot be eliminated.
