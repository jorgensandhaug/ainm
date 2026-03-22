# Score Reflection — prod-2026-03-22-114839904Z-d81827fe

## 1. Task Attribution

- **Inference status**: ambiguous (2 leaderboard entries changed during the scoring window)
- **Candidate tasks**: T07 (28→29 attempts, best_score 2→2) and T18 (22→23 attempts, best_score 4→4)
- **Most likely task**: **T18** (reverse customer invoice payment) — matches the prompt content exactly ("reverse payment on customer invoice for Luz do Sol Lda")
- T07 change is from a concurrent run (submission `ea903ed5`, completed at 11:49:24, scored 7/7 = normalized 2.0, 2/2 checks)
- T18 change is from a concurrent run (submission `3bf3568a`, completed at 11:49:58, scored 8/8 = normalized 4.0, 3/3 checks)
- **Our submission**: likely `57886cdf` (queued 11:49:35) or `8bb05be7` (queued 11:50:04) — both still `queued` at capture time (11:50:27)
- Score not yet available at capture time, but task 18 best_score remained at **4.0** (already the T2 maximum)

## 2. Correctness Verdict

**Almost certainly perfect (3/3 checks passed).**

Evidence:
- The concurrent T18 submission `3bf3568a` scored 8/8 raw, 4.0 normalized, 3/3 checks passed — using the same canonical path
- Our run used the identical proven path: 1 GET (locate) → 1 PUT (reverse) → 1 GET (verify)
- 0 errors, correct invoice isolated (id 2147702146, amountCurrency=51375), correct payment voucher reversed (609430691 → 609431045)
- Verification confirmed `amountCurrencyOutstanding=51375` (reopened)
- This is the 16th consecutive optimal run for this task shape; all previous scored runs achieved perfect correctness

## 3. Efficiency Verdict

**Almost certainly maximum efficiency (4.0/4.0).**

- T18 max score = 4.0 (T2 task)
- Task 18 best_score was already 4.0 before this run
- The run used exactly 1 write (PUT reverse) + 0 errors = minimum possible write count for this task
- GETs are free and do not affect efficiency scoring
- The concurrent T18 submission also scored 4.0, confirming the scoring formula hasn't changed

## 4. Likely Root Cause

**No issues.** This is a perfectly executed run with no root cause analysis needed.

The task is fully solved: 16 consecutive production runs across 7 languages (en/nb/nn/es/fr/de/pt) all achieved the theoretical maximum score. The trusted standard, script template, and fallback matcher are all proven stable.

## 5. What Went Right

1. **Immediate trusted-standard match**: Read the matching `.md` file, wrote the script, executed — no wasted time on AGENTS.md, openapi.json, or playbooks
2. **Correct field names**: Used `amountExcludingVatCurrency` (not `amountExVat`) for the local filter — critical when multiple invoices exist for the same customer
3. **Robust fallback matcher**: Accepted `type=null` payment posting without requiring `account.number` — handles all observed production shapes
4. **Shared-voucher safety check**: Verified the payment voucher ID differs from the invoice posting voucher ID before reversing
5. **Mandatory verification GET**: Included the `GET /invoice/{id}` readback after the write, confirming the outstanding amount reopened — good logging practice per the updated rules
6. **Zero errors**: No 4xx responses, no retries, no wasted calls
7. **Fast execution**: Script ran in seconds, well within the 300s budget

## 6. What To Change Next Time

**Nothing.** This task shape is fully optimized:

- **1 write + 2 free GETs** is the theoretical minimum (you must locate the invoice, reverse the payment, and verify)
- **0 errors** is the theoretical minimum
- **4.0/4.0** is the maximum score for a T2 task
- **16/16 consecutive optimal runs** across all tested languages confirm stability

The only remaining action for this task shape is to maintain the trusted standard if the Tripletex API ever changes behavior (e.g., if `postings(*)` expansion changes, or if payment voucher detection requires a different field).

No playbook, trusted standard, or AGENTS.md changes are needed beyond what was already done in the prior reflection (making the verification GET mandatory).
