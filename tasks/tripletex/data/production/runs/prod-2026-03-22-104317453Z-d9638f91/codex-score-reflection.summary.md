# Score-Aware Reflection: prod-2026-03-22-104317453Z-d9638f91

## 1. Task Attribution

- **Attributed tasks:** T24 and T25 (both "correct ledger errors" variants)
- **T24:** attempt 15, best_score 6→6 (already maxed)
- **T25:** attempt 14, best_score 6→6 (already maxed)
- **Task tier:** T3 (tasks 19–30), max score = 6
- **This run's normalized_score:** 6 (maximum)

## 2. Correctness Verdict

**Perfect.** correctness=1, score_raw=10/10, all 6/6 checks passed, normalized_score=6/6.

No correctness issues. Every correction was applied correctly:
- Check 1 (wrong account 6300→7100): passed
- Check 2 (duplicate 7100/1700 reversed): passed
- Check 3 (missing VAT on 6500, 2710 corrected): passed
- Check 4–6 (incorrect amount 6590 24950→12600 + efficiency): passed

## 3. Efficiency Verdict

**Maximum efficiency.** The run used 1 POST (scored) + 3 free GETs. This is the theoretical minimum for this task shape:

| Call | Purpose | Cost |
|------|---------|------|
| GET /ledger/account | Resolve account IDs + vatTypes | Free |
| GET /ledger/voucher | Discover all vouchers with nested posting expansion | Free |
| POST /ledger/voucher | Combined correction (all 4 fixes in one voucher) | 1 write |
| GET /ledger/voucher | Post-correction verification | Free |

No wasted calls, no retries, no 4xx errors. The leaderboard best for both T24 and T25 was already 6 (set by the previous run 463433ee), and this run matched it.

## 4. Likely Root Cause

No root cause to investigate — the run achieved perfect score. The trusted standard template with 4-layer missing-VAT detection handled all edge cases correctly:

- Layer 3 (description keyword "uten MVA") correctly identified V#29 as the missing-VAT error voucher
- Layers 1 (vatType=0) and 2 (no-2710) returned 0 candidates — consistent with the known edge case where the error voucher has vatType=1 applied
- Supplier.id on account 2400 was correctly propagated from the original posting

## 5. What Went Right

1. **Exact trusted-standard match recognized instantly.** Agent read the standard, extracted 10 constants from the prompt, filled in the template, and ran it — no wasted time on AGENTS.md/openapi.json/playbook.
2. **4-layer missing-VAT detection worked.** This is the second consecutive 6/6 run using this template (after 463433ee). Layer 3 caught the edge case both times.
3. **Single combined POST.** All 4 corrections in one voucher = maximum efficiency bonus.
4. **Pre-POST validation.** Gross sum check (must be 0) and account.id check caught potential issues before the only scored call.
5. **Zero 4xx errors.** vatType copied from originals (not hardcoded), supplier.id propagated for account 2400, account IDs resolved via GET.
6. **Duration ~152s** — well within the 300s budget.

## 6. What To Change Next Time

**Nothing to change.** This is a fully optimized flow:

- Template is stable (2 consecutive 6/6 runs)
- 1 POST is the minimum possible
- 4-layer detection handles all known edge cases
- Pre/post validation provides safety without cost

The only forward-looking note: if a future run encounters a missing-VAT voucher where *all 4 layers fail* (vatType≠0, has2710, no description keyword, amount mismatch), the template falls back to the first candidate with a WARNING log. This hasn't happened yet but would be the next edge case to watch for.
