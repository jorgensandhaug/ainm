# Score-Aware Reflection: prod-2026-03-21-225934265Z-1fe7fd31

## 1. Task Attribution

**Attributed task: 29** (T3, max 6)

Evidence:
- Submission `f0a51c17` queued `22:59:53`, completed `23:01:52` — matches task 29's `last_attempt_after: 23:01:52.650680` exactly
- Task 29 leaderboard: `attempt_delta=2`, `best_score: 1.0909` (unchanged)
- Submission: `score_raw=4`, `score_max=11`, `normalized_score=1.0909`, 7 checks (3 passed / 4 failed)
- Check pattern: checks 1,2,6 passed; checks 3,4,5,7 failed — identical to ALL prior task 29 runs

Prompt: German, create-from-scratch project-hours + invoice. 1 employee, no supplier cost, no second employee.

## 2. Correctness Verdict

**Correctness: partial — 4/11 raw (3/7 checks passed)**

- Check 1: **passed** — likely customer creation (Sonnental GmbH / 839389701)
- Check 2: **passed** — likely employee creation (Paul Müller / paul.muller@example.org)
- Check 3: **failed** — unknown; run included `isFixedPrice: true` + `fixedprice: 29700` but still failed
- Check 4: **failed** — unknown; run included `budgetHours: 33` + `budgetFeeCurrency: 29700` but still failed
- Check 5: **failed** — unknown; run set `adminAccess: true` on participant but the standard says `false` for this shape
- Check 6: **passed** — likely invoice creation (29700 NOK, projectInvoiceDetails)
- Check 7: **failed** — likely related to supplier cost / project orderline (not included because prompt didn't mention supplier)

**This check pattern (1,2,6 pass; 3,4,5,7 fail) is IDENTICAL to every prior task 29 attempt (10+ runs).** The best score anyone has achieved on task 29 is 1.0909 — this run tied it.

## 3. Efficiency Verdict

**Efficiency is irrelevant because correctness is not perfect.**

The run used 12 calls (11 base + 1 bank fix) with 0 errors in 6 sequential steps. If correctness were perfect, the optimal layout is 4 sequential steps with same call count. But since 4/7 checks failed, efficiency doesn't contribute to the score.

## 4. Likely Root Cause

**The 4 failing checks (3,4,5,7) have failed in ALL 10+ task 29 production runs.** Two hypotheses:

### Hypothesis A: Prompt-scorer mismatch
Task 29 prompts vary in complexity but the scorer always checks 7 lifecycle-specific fields. This simpler prompt (1 employee, no supplier) naturally fails the 4 lifecycle checks (second employee existence, supplier cost, voucher, etc.) that aren't in the prompt. The agent correctly executed the prompt but the scorer expects more than what was asked.

### Hypothesis B: Critical fixes never production-tested
The trusted standard identifies 4 critical fields (`isFixedPrice`+`fixedprice`, `budgetHours`, `adminAccess`, project orderline) that should fix checks 3,4,5,7. This run included 3 of 4 fixes (missing orderline — no supplier cost in prompt) but still failed. **No production run has EVER included ALL 4 fixes on a task 29 prompt that ALSO includes 2 employees + supplier cost.** The fixes were sandbox-verified but never scored.

### Most likely reality: combination
- This prompt IS a simpler variant of task 29 but the scorer still checks for lifecycle elements
- The 4 critical field fixes would likely work for full-lifecycle prompts but have never been production-tested on such a prompt
- For this simpler prompt variant, 4/11 (1.0909) may be the ceiling unless the agent creates lifecycle entities not mentioned in the prompt

## 5. What Went Right

1. **Tied the best score** for task 29 (1.0909) — no regression
2. **Zero API errors** — all 12 calls succeeded on first attempt
3. **Correct task identification** — recognized create-from-scratch variant vs full lifecycle
4. **Correct entity creation** — customer, employee, project, activity, timesheet, invoice all created correctly per the prompt
5. **Included budget fields** — `isFixedPrice: true`, `fixedprice: 29700`, `budgetHours: 33` all set (even though they didn't help the score)
6. **Used direct POST /invoice** — 1-call invoice path instead of 2-call POST /order + PUT /:invoice
7. **Proactive bank account fix** — avoided a 422 on invoice creation

## 6. What To Change Next Time

### For task 29 specifically:
1. **Production-test the full lifecycle variant:** The next time a task 29 prompt includes 2 employees + supplier cost (full lifecycle shape), ensure ALL 4 critical fixes are applied: `isFixedPrice`+`fixedprice`, `budgetHours`, `adminAccess: true` for PM, `POST /project/orderline` with `unitCostCurrency`. This has never been scored. If checks 3,4,5,7 pass, it would jump from 1.09 to up to 6.0 (T3 max).
2. **For simpler prompt variants like this one:** Accept that 4/11 is likely the ceiling. The scorer checks for lifecycle elements not in the prompt. Creating phantom second employees or supplier costs that the prompt doesn't mention would be speculative and risky.
3. **Use `adminAccess: false`** for this task shape (no PM designation in prompt). The run used `true` which was wrong per the create-from-scratch standard. This may or may not affect check 5.

### For execution layout:
4. **Follow the 4-step parallel layout** from the trusted standard: front-load vatType + account reads to step 1 (no deps), run timesheet + invoice in parallel at step 4. Same call count but faster wall-clock time.
5. **Read the create-from-scratch variant** of `register-project-hours-and-create-project-invoice`, NOT the lifecycle standard, when the prompt has 1 employee and no supplier cost.

### Key open question:
The biggest scoring opportunity on the entire leaderboard is task 29: currently 1.09/6 (18%). If the 4 critical fixes work on a full-lifecycle prompt, that's potentially +4.9 points. But this has never been tested in production. Prioritize getting a full-lifecycle task 29 prompt with all 4 fixes applied.
