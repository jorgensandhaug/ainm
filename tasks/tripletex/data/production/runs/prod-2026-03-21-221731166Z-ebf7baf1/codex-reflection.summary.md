# Codex Reflection Summary

## Task

Create employee Astrid Nilsen (born 1990-07-27, email astrid.nilsen@example.org, start date 2026-07-11). Norwegian prompt. Exact match for `create-employee` trusted standard.

## Reflection

**What went well:**
- Correctly identified the task as an exact `create-employee` trusted standard match
- Read the trusted standard before writing the script (per AGENTS.md rules)
- Used `?fields=*,employments(*)` on POST — the first production run to do so, avoiding the unnecessary verification GET that all previous runs used
- Handled the department repair branch correctly: POST → 422 → GET /department → POST with dept → 201
- All scored fields (firstName, lastName, dateOfBirth, email, startDate) verified in the POST response
- ISO date normalization was correct (27. July 1990 → 1990-07-27, 11. July 2026 → 2026-07-11)
- Used `userType: "NO_ACCESS"` as documented

**What went poorly:**
- Nothing. The run followed the trusted standard exactly and achieved the minimum call count for its branch.

## Call Efficiency

**Verdict: Minimal-call for this account type.**

The run used 3 API calls + 1 error (422):
1. `POST /employee?fields=*,employments(*)` → 422 (department.id required)
2. `GET /department?isInactive=false&count=1&fields=*` → found dept 743235
3. `POST /employee?fields=*,employments(*)` with department → 201 success

**No wasted calls.** Each call was necessary given the account's department requirement. The `?fields=*,employments(*)` expansion eliminated what would have been a 4th call (GET /employee/employment) in the pre-discovery flow.

**Statistical optimality of no-pre-read strategy:**
- 7 production runs: 4 no-dept (1 call), 3 dept-required (3 calls + 1 error)
- No-pre-read average: 1.86 calls/run, 0.43 errors/run
- Always-pre-read average: 2.0 calls/run, 0 errors/run
- Break-even: 50% dept-required (currently 43%) — no-pre-read still optimal

## Root Causes

No mistakes to diagnose. The 422 on department.id is an account-level requirement that cannot be predicted without a pre-read, and the no-pre-read strategy is statistically optimal at the current 43% dept-required rate.

## Sandbox Verification

- Confirmed sandbox requires both `department.id` AND `employments.division.id` (persistent account has more state than fresh production accounts)
- Verified the cascaded repair flow: POST → 422 (dept) → GET dept → POST with dept → 422 (div) → GET div → POST with dept+div → 201
- Production account only needed the first repair level (department), confirming that division repair is a separate, rarer branch
- `?fields=*,employments(*)` returns full employee + expanded employment objects including startDate in both sandbox and production

## Playbook Changes

**Updated existing files (no new files created):**

1. `./trusted-standards/create-employee.md` — updated production run statistics from 6 to 7 runs, added Astrid Nilsen production confirmation, updated dept-required ratio to 3/7 (43%) with break-even analysis
2. `./task-playbooks/create-employee.md` — added 7th production run entry (Astrid Nilsen, 3 calls 1 error, first `?fields=*,employments(*)` production confirmation)

No AGENTS.md changes needed — the trusted standard and playbook entries already exist.

## Commit

- Hash: `b0a72ce2`
- Message: `tripletex playbook: create-employee — add 7th production confirmation (ebf7baf1, Norwegian prompt, Astrid Nilsen / 1990-07-27 / astrid.nilsen@example.org / start 2026-07-11, 3 calls 1 error), first run using ?fields=*,employments(*) in production; update dept-required ratio to 3/7 (43%), no-pre-read still optimal at 1.86 avg vs 2.0`

## Reusable Heuristics

1. **`?fields=*,employments(*)` is essential on every POST /employee attempt** — omitting `employments(*)` returns sparse employment objects without `startDate`, wasting a verification GET. This run is the first production proof.

2. **Do not pre-read `/department` by default** — at 43% dept-required (3/7 runs), the no-pre-read strategy averages 1.86 calls vs 2.0 for always-pre-read. Monitor this ratio; if it reaches 50%, switch to always-pre-read.

3. **Cascade repair branches: department first, then division** — do not speculatively read division after a department 422. Retry with the repaired department first; only read division if a second 422 specifies `employments.division.id`.

4. **Normalize prompt dates to ISO before calling the API** — Norwegian `27. July 1990` → `1990-07-27`. The API only accepts ISO format regardless of prompt language.

5. **`userType: "NO_ACCESS"` is the safe default** — using `"STANDARD"` or omitting it causes 422. Only use other values when the prompt explicitly requests login access.

6. **Reuse POST response data** — the `201` response with `?fields=*,employments(*)` contains all scored fields. Never follow up with a verification GET.
