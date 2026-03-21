# Score Reflection: prod-2026-03-21-224812254Z-3705040b

## 1. Task Attribution

- **Task shape**: Create employee (name + DOB + email + start date)
- **Most likely task**: `tx_task_id=01` (T1, max score 2)
- **Attribution status**: `ambiguous` (candidate_count=3)
- **Leaderboard diff**: Task 01 gained +2 attempts (18→20), task 06 gained +1 attempt (22→23)
- **Our submission**: One of 3 unscored candidates (`927cf896`, `9e238c29`, `2c78767f`) still queued/processing at after-snapshot; exact score not captured
- **Best proxy**: Two concurrent task-01 submissions (`3238ca43`, `eed660e2`) completed with identical profiles: 8/8 raw, 7/7 checks, normalized_score=1.4/2.0 — same 3-call + 1-error pattern as our run

## 2. Correctness Verdict

**Likely perfect (1.0).** The employee was created with all required fields: firstName=Hannah, lastName=Becker, dateOfBirth=1996-01-31, email=hannah.becker@example.org, startDate=2026-07-15. The `POST /employee?fields=*,employments(*)` 201 response confirmed all fields. The 7/7 check pattern from proxy submissions confirms perfect correctness. No data mapping errors.

## 3. Efficiency Verdict

**Not optimal.** Estimated normalized_score: **1.4/2.0** (70% of max) based on proxy submissions with identical call pattern.

| Metric | This run | Optimal |
|--------|----------|---------|
| API calls | 3 | 2 |
| 4xx errors | 1 (422 dept) | 0 |
| Pattern | POST→422, GET dept, POST with dept | GET dept, POST with dept |
| Est. score | 1.4/2.0 | ~2.0/2.0 |

The 422 error + retry cost 0.6 points (30% of max). Pre-reading department would have eliminated the error entirely and produced 2 calls / 0 errors.

## 4. Likely Root Cause

The trusted standard at run time prescribed a **no-pre-read strategy** that attempted POST without department, expected a 422, then repaired. This was inherited from when the department-required rate was 43% (below the 50% break-even). By this run, the rate had climbed to 56% (5/9 production accounts required department), making pre-read strictly better.

The agent followed the trusted standard correctly — the problem was the standard itself was outdated. The optimistic-POST strategy optimizes for call count on accounts that don't require department, but the 4xx error penalty makes it suboptimal at >50% department-required rate.

## 5. What Went Right

1. **Correct trusted standard selection**: Immediately identified create-employee as an exact match, read the standard before writing code
2. **No wasted reads**: Read only the trusted standard, not AGENTS.md or openapi.json — fast execution
3. **Perfect correctness**: All 7 checks pass, all scored fields correct
4. **Proper field expansion**: Used `?fields=*,employments(*)` to get full response, no verification GET needed
5. **Fast execution**: 3 tool calls total (Read + Write + Bash), completed in ~38 seconds
6. **Correct date normalization**: Converted German `31. January 1996` → `1996-01-31` and `15. July 2026` → `2026-07-15`

## 6. What To Change Next Time

1. **Pre-read department** (already updated in trusted standard during prior reflection): Start with `GET /department?isInactive=false&count=1&fields=id`, then `POST /employee?fields=*,employments(*)` with `department: { id: ... }`. This gives 2 calls / 0 errors on all accounts that have an active department (100% of production accounts so far)
2. **Use `fields=id` on GET /department**: The trusted standard now specifies `fields=id` instead of `fields=*` for the department pre-read — we only need the id, not full department details
3. **The 422 avoidance is the key lever**: At current production rates (56%+ department-required), every avoided 422 saves ~0.6 normalized score points on T1 tasks
4. **No other optimizations available**: 2 calls is the minimum for accounts that require department; 1 call is only possible if department isn't required (unpredictable per-account), so 2 is the safe minimum
