# Score-Aware Reflection — prod-2026-03-21-233545711Z-8e8e2e86

## Task Attribution
- **Task ID**: 01 (T1 tier, max score 2)
- **Prompt**: Nynorsk — create employee Bjørn Neset (born 1996-02-21, email bjrn.neset@example.org, start date 2026-06-16)
- **Attributed via**: leaderboard diff — task 01 attempts went from 22 → 23

## Correctness Verdict
**Perfect.** correctness = 1, score_raw = 8/8, normalized_score = 2/2, all 7 checks passed.

No field-level errors. The final Tripletex state matched expectations exactly:
- firstName "Bjørn", lastName "Neset" — Unicode preserved
- dateOfBirth "1996-02-21" — Nynorsk date normalized correctly
- email "bjrn.neset@example.org" — exact match
- employment startDate "2026-06-16" — correct
- userType "NO_ACCESS" — safe default, no check failure

## Efficiency Verdict
**Maximum efficiency.** normalized_score = 2 = leaderboard best (2) for task 01. The run achieved the theoretical maximum score for this T1 task.

- 2 API calls, 0 errors
- GET /department (pre-read) + POST /employee?fields=*,employments(*) (create)
- No wasted calls, no retries, no 4xx errors
- Duration: 52.8s — well within the 300s budget

This is the proven-minimum call count for the create-employee task shape with start date. No lower path exists: the department pre-read is required on 64%+ of production accounts, and the POST with `?fields=*,employments(*)` eliminates the need for any verification GET.

## Likely Root Cause
N/A — no issues. The run was optimal in both correctness and efficiency.

## What Went Right
1. **Followed the current trusted standard exactly.** The agent read `trusted-standards/create-employee.md` before writing the script, unlike runs 9–10 (Torbjørn, Hannah) which cached the old no-pre-read pattern and wasted 1 call + 1 error each.
2. **Department pre-read worked perfectly.** GET /department found id 973047, included it on the POST, which succeeded on the first attempt with 201.
3. **`?fields=*,employments(*)` on POST.** Got the full response with all scored fields (firstName, lastName, dateOfBirth, email, startDate) in a single response. No verification GET needed.
4. **Correct date normalization.** "21. February 1996" → "1996-02-21", "16. June 2026" → "2026-06-16" — standard ISO conversion from Nynorsk mixed-language dates.
5. **Unicode name preservation.** "Bjørn" kept as-is, no ASCII normalization.
6. **`userType: "NO_ACCESS"`** — the proven safe default for create-only tasks.

## What To Change Next Time
Nothing — this run is the reference implementation for the create-employee task shape. Future agents should replicate this exact pattern:

1. Read `trusted-standards/create-employee.md` (do not skip, do not use cached patterns)
2. `GET /department?isInactive=false&count=1&fields=id`
3. `POST /employee?fields=*,employments(*)` with prompt fields + `userType: "NO_ACCESS"` + `department: { id }` + nested `employments: [{ startDate }]`
4. Stop — response proves all scored fields

The only scenario where the flow would change is the division repair branch (0/12 production runs so far, sandbox-only): if POST returns 422 with `validationMessages[].field == "employments.division.id"`, do GET /division?count=1&fields=id and retry once.
