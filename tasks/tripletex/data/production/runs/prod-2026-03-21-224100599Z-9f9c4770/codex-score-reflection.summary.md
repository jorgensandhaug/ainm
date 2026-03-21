# Score-Aware Reflection: prod-2026-03-21-224100599Z-9f9c4770

## 1. Task Attribution

- **Inference status**: ambiguous (candidate_count=2)
- **Most likely task**: Task 12 (run employee payroll) — prompt is "Køyr løn for Brita Berge" which matches the T12 payroll shape exactly
- **Leaderboard diff**: Task 12 got +1 attempt (20→21), best stayed at 2.333/4.0
- **Concurrent submission** (8058e1ac, queued 22:41:00, completed 22:42:39): scored 4/8 raw, normalized 1.0, Checks 1-2 passed, Checks 3-4 failed — this is from a concurrent run, not ours
- **Our submissions** (queued 22:42:34 and 22:42:51) were still "processing" at capture time (22:42:59), so our final score is not in the snapshot

## 2. Correctness Verdict

**Correctness: partial — likely < 1.0 due to voucher amount bug.**

The salary transaction was created correctly:
- `POST /salary/transaction?generateTaxDeduction=true` returned 201
- Payslip id=32629331, transaction id=6958313
- Fastlønn 36800 + Bonus 14100 = 50900 gross

But the Lønnsbilag voucher (id=609192724) stored **zero amounts on all postings**. The script sent `amount: 36800`, `amount: 14100`, `amount: -50900` but the API response shows:
```
"amount": 0, "amountCurrency": 0, "amountGross": 0, "amountGrossCurrency": 0
```
on every posting. The Tripletex API silently ignores the `amount` field on voucher postings and requires `amountGross` + `amountGrossCurrency` instead. The API returns 201 regardless, making this a silent data loss bug.

**Expected impact**: Check 5 (ledger entries) would fail because the posting amounts are all zero. Other checks related to the payslip itself (gross amount, salary specifications) likely passed.

## 3. Efficiency Verdict

**Call count: 9 calls, 0 errors — this is the optimal count for the underconfigured branch.**

The 9-call path was:
1. `GET /employee` → find employee (underconfigured: dob=null, employments=[])
2. `POST /division` + `PUT /employee` (parallel) → repair
3. `POST /employment` + `GET /salary/type` + `GET /voucherType` + `GET /account` (parallel) → setup + lookups
4. `POST /salary/transaction` → payroll
5. `POST /ledger/voucher` → ledger entries

No wasted calls. No retries. No avoidable errors. The parallelization was optimal (4 rounds: 1→2→4→1→1 = 9 calls in 5 sequential steps).

Sandbox testing confirmed POST /salary/transaction and POST /ledger/voucher can run in parallel (both succeeded in 357ms total), which would reduce to 4 sequential rounds. But call count stays at 9.

Sandbox testing also confirmed:
- `salaryType` by number → 422 (cannot eliminate GET /salary/type)
- `account` by number in voucher → 422 (cannot eliminate GET /ledger/account)
- `voucherType` by name → 201 (COULD eliminate GET /ledger/voucherType → **potential 8-call path**)

## 4. Likely Root Cause

**The voucher posting field bug is the sole root cause of score loss.**

The trusted standard and playbook at the time of this run specified posting payloads with `amount` only. This field is silently ignored by the Tripletex API for voucher postings — the API requires `amountGross` and `amountGrossCurrency` (both must be set to the same value for NOK transactions). The API returns 201 even with zero amounts, providing no validation error.

This bug was discovered after this run and the playbook was updated to require `amountGross` + `amountGrossCurrency` on every posting (see system-reminder noting the playbook update).

Prior production runs (989090e8, 2b1b0da1) had the same bug but the impact was masked because:
- 989090e8 scored 3.0/4.0 (75% efficiency) — suggesting Check 5 may not always verify exact amounts
- 2b1b0da1 scored 4/4 (8/8 raw) — suggesting that run's check suite may not have included amount verification

The inconsistency suggests Check 5 scoring criteria may vary across runs or the amounts were verified differently.

## 5. What Went Right

- **Optimal call count**: 9 calls for the underconfigured branch, matching the trusted standard's best-known path
- **Zero errors**: No 4xx responses, no retries
- **Correct parallelization**: POST /division + PUT /employee parallel; POST /employment + 3 reads parallel
- **Inline employmentDetails**: Saved 1 call vs separate POST /employee/employment/details
- **Skipped GET /division**: Directly created division, saving 1 call (11→9 improvement over earlier runs)
- **Salary transaction correct**: All amounts, salary types, and tax deduction configuration were correct
- **Matched trusted standard exactly**: The agent followed the documented 9-call fast path without deviation

## 6. What To Change Next Time

1. **CRITICAL: Use `amountGross` + `amountGrossCurrency` on voucher postings, not `amount`**
   - The `amount` field is silently stored as 0 — API returns 201 but amounts are zero
   - Both `amountGross` and `amountGrossCurrency` must be set (same value for NOK)
   - The playbook has already been updated to reflect this

2. **Consider 8-call path**: Sandbox proved `voucherType: { name: "Lønnsbilag" }` works on POST /ledger/voucher, eliminating GET /ledger/voucherType. This would reduce the underconfigured branch to 8 calls. However, this needs production verification before trusting — the sandbox voucherType-by-name behavior may not be universal.

3. **Parallelize final two writes**: POST /salary/transaction and POST /ledger/voucher are data-independent and can run in parallel (sandbox-verified, both succeeded in 357ms). This doesn't reduce call count but improves wall-clock time.

4. **Verify voucher amounts in response**: After POST /ledger/voucher, the response includes posting amounts. A quick sanity check of the response `amountGross` values against the sent values would catch the zero-amount bug immediately, allowing a fix without a wasted submission.
