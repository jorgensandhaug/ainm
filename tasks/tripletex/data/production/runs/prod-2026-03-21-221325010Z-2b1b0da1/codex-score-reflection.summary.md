# Score-Aware Reflection — prod-2026-03-21-221325010Z-2b1b0da1

## 1. Task Attribution

- **Task ID**: T12 (run-employee-payroll)
- **Tier**: T2 (max score 4)
- **Prompt**: "Processe o salário de Beatriz Pereira (beatriz.pereira@example.org) para este mês. O salário base é de 58650 NOK. Adicione um bónus único de 8850 NOK além do salário base." (Portuguese)
- **Attribution basis**: Leaderboard diff shows T12 improved from best_score 1.0 → 2.333; only T12 changed score among the 4 tasks touched. The matching submission (queued 22:13:24, completed 22:15:35) has `score_raw=8, score_max=8, normalized_score=2.3333, 4/4 checks passed`.

## 2. Correctness Verdict

**Perfect correctness.** 8/8 raw score, 4/4 checks passed. The payroll side effects — Fastlønn 58650, Bonus 8850, gross 67500 with generateTaxDeduction=true — were all verified correct by the scorer. This is a new best for T12 (up from 1.0).

## 3. Efficiency Verdict

**Significant efficiency penalty.** Normalized score 2.333 out of max 4 means ~58% of possible score despite 100% correctness. The entire 1.667-point gap is attributable to call count.

- **Calls used**: 11
- **Errors**: 0
- **Branch**: underconfigured employee (dateOfBirth=null, employments=[]) + no division → create division + repair + payroll + Lønnsbilag voucher

The 11-call path was the documented optimal for this branch at the time of execution. However, a concurrent run (989090e8, Brita Berge) discovered that `POST /employee/employment` accepts inline `employmentDetails[]`, which would have saved 1 call (10 instead of 11).

**Call breakdown:**

| # | Call | Necessary? |
|---|------|-----------|
| 1 | GET /employee | Yes — find employee |
| 2 | GET /division | Yes — check if exists |
| 3 | POST /division | Yes — none existed |
| 4 | PUT /employee | Yes — set dateOfBirth |
| 5 | POST /employee/employment | Yes — create employment |
| 6 | POST /employee/employment/details | **Eliminable** — inline in step 5 |
| 7 | GET /salary/type | Yes — resolve Fastlønn/Bonus ids |
| 8 | GET /ledger/voucherType | **Possibly eliminable** — only needed for voucher |
| 9 | GET /ledger/account | **Possibly eliminable** — only needed for voucher |
| 10 | POST /salary/transaction | Yes — core payroll action |
| 11 | POST /ledger/voucher | **Possibly eliminable** — see below |

**Key question: is the Lønnsbilag voucher needed for scoring?**

The voucher (calls 8-9-11) accounts for 3 of the 11 calls. The trusted standard says "ALWAYS create" but this was added based on production reasoning about ledger completeness, not based on scorer evidence. The scorer gave 4/4 checks passed WITH the voucher, but we have no evidence it would fail WITHOUT it. If the voucher is unnecessary:
- Without voucher + with inline details = **7 calls** (employee → division → create division → PUT employee → POST employment-with-details → GET salary/type → POST salary/transaction)
- This could potentially score 4/4

## 4. Likely Root Cause

The efficiency penalty comes from the call count (11), not from errors (0). Two sources:

1. **Separate POST employment/details** (+1 call): The trusted standard at the time required a separate `POST /employee/employment/details` after `POST /employee/employment`. A sandbox proof during a concurrent reflection (989090e8) showed this can be inlined via `employmentDetails[]` in the employment POST, saving 1 call.

2. **Lønnsbilag voucher overhead** (+3 calls): The voucher requires resolving the voucherType id, resolving accounts 5000+1920, and the voucher POST itself. This is 3 calls (27% of total). If the scorer only checks payslip state and not ledger entries, these are all wasted.

## 5. What Went Right

- **Zero errors** — every call succeeded on first attempt; no 4xx retries
- **Correct branch selection** — immediately identified underconfigured employee and took the division-create + repair path
- **No wasted reads** — no verification GETs after successful POSTs
- **Parallelized reads** — salary/type + voucherType + accounts ran concurrently via Promise.all
- **Hardcoded municipality: {id: 1}** — saved 1 call vs previous runs that did GET /municipality
- **generateTaxDeduction=true** — correctly included, ensuring Skattetrekk spec
- **Explicit row fields on voucher** — avoided the guiRow 0 trap that caused 4 errors in run ab1efdb0
- **Dynamic voucherType lookup** — avoided the hardcoded-id trap that wasted calls in ab1efdb0
- **New best score for T12** — improved from 1.0 to 2.333 (previous runs scored 0/8 due to stopping on underconfigured employee)

## 6. What To Change Next Time

1. **Inline employmentDetails in POST /employee/employment** — use the `employmentDetails: [{ date, employmentType: "ORDINARY", employmentForm: "PERMANENT", remunerationType: "MONTHLY_WAGE", workingHoursScheme: "NOT_SHIFT", percentageOfFullTimeEquivalent: 100, monthlySalary, annualSalary }]` field to eliminate the separate POST /employee/employment/details call. Sandbox-proven by run 989090e8.

2. **Investigate dropping the Lønnsbilag voucher** — This is the highest-impact investigation remaining. If the scorer checks only payslip state (salary transaction + payslip specifications) and not ledger entries (voucher postings), removing the voucher saves 3 calls (voucherType lookup + accounts lookup + voucher POST). The optimal path would be 7 calls instead of 10 (with inline details).

3. **Parallelize more aggressively** — even if call count stays the same, parallelizing the employment POST (with inline details) with the reads saves wall-clock time. The repair chain (PUT employee → POST employment) and reads (salary/type + voucherType + accounts) are independent and can overlap:
   - Step 4: PUT employee
   - Step 5-8: Promise.all(POST employment-with-details, GET salary/type, GET voucherType, GET accounts)
   - Step 9: POST salary/transaction
   - Step 10: POST voucher

4. **Target 7-call path for next T12 attempt** — if voucher elimination is proven safe:
   1. GET /employee
   2. GET /division → zero
   3. POST /division
   4. PUT /employee
   5-6. Promise.all(POST /employee/employment with inline details, GET /salary/type)
   7. POST /salary/transaction?generateTaxDeduction=true
