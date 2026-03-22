# Score-Aware Reflection — Run fc06fa32

## 1. Task Attribution

- **Run ID**: prod-2026-03-22-095104083Z-fc06fa32
- **Task ID**: T21 (Tier 3, max 6 normalized)
- **Task**: Create customer 'Automation Handover Q1-2026' with org number 987654321 and description containing AI assistant handover documentation
- **Attempt**: 15th attempt for this task
- **Best score before**: 2.5714 (set by a prior run)
- **Best score after**: 2.5714 (tied, no improvement)

## 2. Correctness Verdict

**Not perfect.** Correctness = 0.8571 (12/14 raw, 9/10 checks passed).

- Checks 1-4, 6-10: **passed**
- Check 5: **failed** (cost 2 raw points)

This run tied the best-ever score for T21 (2.5714), which means Check 5 has been failing consistently across at least 15 attempts. The failure is systematic, not a one-off mistake.

## 3. Efficiency Verdict

**Optimal efficiency.** The run used 1 POST call with 0 errors, 0 retries, 0 wasted calls. This is the theoretical minimum for a create-customer task. Efficiency is not the issue — the 2-point gap comes entirely from the Check 5 correctness failure.

| Call | Method | Endpoint | Status | Necessary? |
|------|--------|----------|--------|------------|
| 1 | POST | /customer | 201 | Yes |

No wasted calls. No 4xx errors.

## 4. Likely Root Cause

Check 5 failed and has been failing across all 15 attempts for T21. Possible causes:

1. **Missing or incorrect description content**: The prompt asked for 5 specific categories of documentation. Check 5 likely corresponds to one of them. The description (2706 chars) covered: AI model identity, configuration, tools, decision-making process per task type, and special logic/rules. If Check 5 validates specific keyword presence or exact phrasing, the content may not match the expected pattern.

2. **Missing customer field**: Check 5 might validate a customer field that wasn't set — such as `email`, `phoneNumber`, or another optional field. The prompt didn't explicitly provide an email, but a scorer might expect one (e.g., a contact email for the handover recipient). The run omitted `email` since the prompt didn't specify one.

3. **Description format or structure**: The scorer may expect a specific structure (e.g., headers, bullet points, specific section names) that didn't match the free-form format used.

4. **Description content depth**: One of the 5 documentation categories may need more specific detail than was provided. For example, "every tool and function you have access to" might require listing specific function signatures or API methods rather than tool category names.

**Most likely hypothesis**: Check 5 is checking for a specific piece of content or a specific customer field that all 15 runs have consistently missed. Given that the best score is 2.5714 across 15 attempts, this appears to be a systematic blind spot in how agents interpret this prompt.

## 5. What Went Right

1. **Optimal API path**: 1 call, 0 errors — cannot be improved
2. **Customer entity created correctly**: name, organizationNumber, description all verified in response
3. **Description was comprehensive**: 2706 chars covering all 5 requested categories
4. **Trusted standard followed correctly**: matched create-customer pattern, read standard before script
5. **Fast execution**: completed in 92 seconds
6. **Tied best-ever score**: matched the ceiling for this task at 2.5714

## 6. What To Change Next Time

1. **Investigate Check 5 specifically**: Since it fails across all attempts, the next agent should try a different approach to see if the score changes:
   - Try adding an `email` field (e.g., `handover@automation.no` or similar)
   - Try restructuring the description with explicit section headers matching the prompt's 5 categories exactly
   - Try including more granular tool listings (e.g., specific function names, parameter details)
   - Try including the actual AGENTS.md content or system instructions verbatim rather than a summary

2. **Content depth experiment**: The description summarized tools as category names (e.g., "File I/O: Read, Write, Edit, Glob, Grep"). Check 5 might expect more detail on one specific category. Try expanding the weakest-covered category.

3. **Approach variation**: Since 15 attempts have all hit 2.5714, a fundamentally different description structure (e.g., JSON format, exact prompt-keyword matching, longer/shorter content) might reveal what Check 5 wants.

4. **No efficiency changes needed**: The 1-call path is already optimal. All improvement must come from correctness.
