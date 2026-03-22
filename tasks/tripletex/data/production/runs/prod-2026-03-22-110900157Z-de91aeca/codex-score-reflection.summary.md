# Score Reflection: Create Employee — Solveig Johansen (de91aeca)

## 1. Task Attribution

- **Attributed task**: T01 (create employee)
- **Task tier**: T1 (tasks 1–8), max score **2**
- **Attribution method**: Leaderboard diff — task 01 attempt count increased from 26 → 27 (+1), last_attempt_at updated to match task completion time (11:09:41Z vs task complete 11:09:39Z)
- **Submission score status**: `ambiguous` (candidate_count=2) — scorer could not uniquely attribute to a single submission entry, but leaderboard diff confirms this was a T01 attempt

## 2. Correctness Verdict

**Likely perfect (2/2).**

- best_score before: 2 (already at max)
- best_score after: 2 (unchanged — consistent with this run also scoring 2/2)
- The run created the employee with all required fields: firstName="Solveig", lastName="Johansen", dateOfBirth="1993-05-15", email="solveig.johansen@example.org", startDate="2026-01-18", department assigned, userType="NO_ACCESS"
- The POST response confirmed all field values in the 201 body
- No ambiguity in date normalization or field mapping
- This matches the pattern of all recent optimal pre-read runs (8e8e2e86, 20daf6b5) which also scored the maximum

## 3. Efficiency Verdict

**Optimal — 2 calls, 0 errors.**

| # | Call | Status | Necessary? |
|---|------|--------|------------|
| 1 | GET /department?isInactive=false&count=1&fields=id | 200 | Yes — department pre-read prevents 56%+ 422 rate |
| 2 | POST /employee?fields=*,employments(*) | 201 | Yes — the single write that creates the employee |

- **Wasted calls**: 0
- **Avoidable errors**: 0
- **This is the proven minimum call path.** No lower path exists; a single POST without department pre-read fails 56%+ of the time on production accounts.

## 4. Likely Root Cause

**No issues to diagnose.** The run executed perfectly:
- Correct trusted standard identified and followed
- Optimal pre-read strategy used
- No invented fields in employment object
- Department placed at top level (not inside employment)
- `?fields=*,employments(*)` used to get full response without verification GET
- Norwegian date normalization correct

## 5. What Went Right

1. **Trusted standard adherence**: Agent read `./trusted-standards/create-employee.md` before writing any script — avoided all documented pitfalls
2. **Pre-read strategy**: GET /department before POST /employee — 4th consecutive optimal run using this approach
3. **Minimal employment payload**: Only `startDate` in employment object — avoided code 16000 from invented fields (aa0e0f72's mistake)
4. **Department placement**: `department` at top level, not inside `employments[]` — avoided code 16000 (e9e115f1's mistake)
5. **Response expansion**: `?fields=*,employments(*)` eliminated need for verification GET
6. **Clean execution**: Single script run, no retries, no error recovery needed
7. **Date normalization**: `15. May 1993` → `1993-05-15`, `18. January 2026` → `2026-01-18` — correct ISO conversion

## 6. What To Change Next Time

**Nothing.** This run is the gold standard for the create-employee task shape. The next agent should:

1. Read `./trusted-standards/create-employee.md` (do not skip this step)
2. Follow the pre-read strategy exactly: GET /department → POST /employee with department at top level
3. Use `?fields=*,employments(*)` on POST
4. Include `userType: "NO_ACCESS"`
5. Put only `startDate` in the employment object
6. Include division repair branch in the script (for the rare case it's needed — 0/16 production runs so far)
7. Do not read openapi.json, AGENTS.md, or the playbook — the trusted standard is sufficient

This is the 4th optimal run (out of 16 total create-employee runs) and the 16th production run overall. The create-employee trusted standard is mature and requires no changes.
