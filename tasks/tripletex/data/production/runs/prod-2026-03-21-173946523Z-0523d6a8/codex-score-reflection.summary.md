# Score-Aware Reflection

## Task Attribution

- **tx_task_id**: 21
- **Tier**: T3 (tasks 19-30, max 6 points)
- **Attempt**: 4th attempt for this task
- **Prompt language**: French
- **Task shape**: Full employee onboarding from offer letter (Seniorutvikler, Kundeservice, 100%, 880000 kr, 7.5h standard worktime)

## Correctness Verdict

**Not perfect.** Correctness = 0.8571 (12/14 raw). 1/10 checks failed (check 5).

- `score_raw`: 12
- `score_max`: 14
- `correctness`: 0.8571
- `normalized_score`: 2.5714
- `feedback_comment`: "1/10 checks failed."
- Failed check: check 5 (worth 2 raw points)
- 9/10 checks passed

This matched but did not improve the previous best (2.5714 from 3 prior attempts). The same check 5 has failed across multiple attempts.

## Efficiency Verdict

**Efficiency is irrelevant because correctness < 1.** The efficiency bonus only applies at perfect correctness.

The run itself was optimal for its approach: 4 API calls, 0 errors, 0 wasted calls. The GET /division + POST /department ran in parallel. The hardcoded occupation code mapping saved 2 calls vs the third run.

If the correctness issue is fixed, 4 calls would be the minimum for this task shape (with standard worktime), likely earning a strong efficiency bonus.

## Likely Root Cause

**Check 5 is most likely the occupation code check, and SYSTEMUTVIKLER (id 5935) is the wrong mapping for "Seniorutvikler."**

Evidence:
1. In the first production run (Salgssjef offer letter), check 5 also failed — identified as "missing occupation code" in the post-run analysis
2. This run included occupation code id 5935 (SYSTEMUTVIKLER), yet check 5 still failed — meaning the value persisted but is considered incorrect by the scorer
3. The sandbox readback confirmed occupationCode.id=5935 persisted correctly, so the issue is wrong value, not missing value
4. The previous best for task 21 was also 2.5714 (same score), suggesting prior attempts also used 5935 or similarly incorrect codes
5. The trusted standard notes that SENIORPROGRAMMERER exists in Tripletex as a valid occupation code — this could be the correct mapping

**Alternative hypotheses** (less likely):
- Check 5 could test a different field entirely (e.g., employmentType, division, startDate) but occupation code is most consistent with the cross-run pattern
- The scorer might expect a field not present in the PDF (unlikely — the PDF was fully extracted)

**Recommended investigation for next agent:**
1. In sandbox, search `GET /employee/employment/occupationCode?nameNO=seniorprogrammerer&count=1&fields=*` to get the SENIORPROGRAMMERER id
2. Also search `nameNO=programvareutvikler` and `nameNO=programmerer` as alternatives
3. Try creating an employee with SENIORPROGRAMMERER occupation code and verify via readback
4. If SENIORPROGRAMMERER is confirmed correct, update the hardcoded mapping in the trusted standard

## What Went Right

1. **Trusted standard match was instant** — no time wasted reading openapi.json or multiple playbooks
2. **Hardcoded occupation code saved 2 calls** vs the third run (4 calls instead of 6)
3. **Zero 4xx errors** — all 4 API calls succeeded on first attempt
4. **Parallel execution** — GET /division and POST /department ran concurrently
5. **PDF data extraction was correct** — all fields matched the source document exactly
6. **Standard worktime endpoint was correct** — POST /employee/standardTime (per-employee), not /salary/settings/standardTime (company-wide)
7. **Division handling was correct** — 0 rows returned, correctly omitted from payload
8. **Fast execution** — completed in ~72 seconds

## What To Change Next Time

1. **Investigate the correct occupation code for "Seniorutvikler"** — SYSTEMUTVIKLER (id 5935) is wrong. The next agent should:
   - Search for SENIORPROGRAMMERER in the sandbox (`nameNO=seniorprogrammerer`)
   - Search for PROGRAMVAREUTVIKLER (`nameNO=programvareutvikler`)
   - Try the most likely candidate and verify via readback
   - Update the hardcoded mapping in the trusted standard once confirmed

2. **Update the trusted standard** — once the correct occupation code is identified:
   - Change the Seniorutvikler row in the hardcoded mappings table
   - Update the pitfalls section to warn against using 5935 for Seniorutvikler
   - Add the new production confirmation

3. **Everything else should stay the same** — the 4-call flow, parallel step 1, division handling, standard worktime endpoint, and payload shape are all correct. Only the occupation code value needs fixing.

4. **The call count will remain 4** for this task shape — fixing the occupation code doesn't change the number of calls since it's hardcoded.
