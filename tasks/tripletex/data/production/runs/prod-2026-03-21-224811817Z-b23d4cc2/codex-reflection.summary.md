# Codex Reflection Summary — b23d4cc2

## Task

Create employee Torbjørn Neset (DOB 1991-11-14, email torbjrn.neset@example.org, start 2026-02-11). Nynorsk prompt. Exact match for `create-employee` trusted standard.

## Reflection

**What went well:**
- Correctly matched to `create-employee` trusted standard
- Read the trusted standard before writing the script
- Used `?fields=*,employments(*)` to avoid verification GET
- Correctly normalized Nynorsk dates: `14. November 1991` → `1991-11-14`, `11. February 2026` → `2026-02-11`
- Preserved Unicode name `Torbjørn` exactly
- Used `userType: "NO_ACCESS"` correctly
- Correctly handled department repair branch when 422 occurred

**What went poorly:**
- Agent used the OLD no-pre-read strategy (POST first, repair on 422) despite the trusted standard having already been updated to pre-read strategy (GET /department first, then POST with dept)
- This caused 1 unnecessary API call and 1 avoidable 422 error
- Root cause: the agent cached the old pattern from memory/prior runs instead of faithfully implementing the CURRENT standard flow it had just read

## Call Efficiency

**NOT minimal.** The run used 3 calls + 1 error. The optimal path per the current trusted standard is 2 calls + 0 errors.

| Call | Method | Status | Necessary? |
|------|--------|--------|------------|
| 1 | POST /employee (no dept) | 422 | WASTED — should have pre-read department first |
| 2 | GET /department | 200 | Necessary — but should have been call 1 |
| 3 | POST /employee (with dept) | 201 | Necessary |

**Lower-call path (2 calls, 0 errors):**
1. `GET /department?isInactive=false&count=1&fields=id` → get dept ID
2. `POST /employee?fields=*,employments(*)` with `department: { id: ... }` → 201

**Savings:** 1 fewer call, 1 fewer 4xx error.

## Root Causes

1. **Agent didn't follow the updated trusted standard flow.** The trusted standard was updated (after the Charles Walker run) to specify pre-reading department as step 1. But the agent's script implementation used the old no-pre-read pattern — POST first, handle 422 with repair. The agent read the standard but didn't translate its current flow into the script.

2. **Pattern caching.** The agent likely relied on a cached mental model of the create-employee flow from previous runs rather than carefully following the step-by-step flow in the current trusted standard document.

## Sandbox Verification

- Verified pre-read strategy in persistent sandbox (kkpqfuj-amager.tripletex.dev)
- `GET /department?isInactive=false&count=1&fields=id` → 200, found dept 837842
- `POST /employee?fields=*,employments(*)` with dept → 422 (division required — sandbox-only, 0% production)
- After division repair: full flow succeeded with all fields confirmed
- In production (no division needed): pre-read strategy = 2 calls, 0 errors

## Playbook Changes

**Updated existing files (no new files created):**

1. `./AGENTS.md` (line 289): Replaced outdated create-employee canonical path (old 2-call POST+GET pattern) with current pre-read strategy (`GET /department` → `POST /employee?fields=*,employments(*)`). Added explicit warning not to use old no-pre-read pattern. Updated dept-required rate to 7/11 (64%).

2. `./trusted-standards/create-employee.md`: Updated production stats to 11 runs, 64% dept-required rate. Added Torbjørn Neset + Hannah Becker runs as examples of old-pattern failure. (Concurrent process also added Hannah Becker data.)

3. `./task-playbooks/create-employee.md`: Added Torbjørn Neset run to production history. Updated avoidable mistakes section: emphasized following CURRENT trusted standard flow. Updated dept-required rate to 60%→64%. Updated division stats to 0/10→0/11.

## Commit

- Hash: `4242ba90`
- Message: `tripletex playbook: create-employee — add 11th production confirmation (b23d4cc2, Nynorsk prompt, Torbjørn Neset / 1991-11-14 / torbjrn.neset@example.org / start 2026-02-11, 3 calls 1 error); agent used OLD no-pre-read strategy despite trusted standard already specifying pre-read, wasting 1 call + 1 error (would have been 2 calls 0 errors with pre-read); update AGENTS.md canonical create-employee path to match current pre-read strategy; dept-required rate now 7/11 (64%)`

## Reusable Heuristics

1. **Always implement the CURRENT trusted standard flow, not a cached version.** Reading the standard is not enough — the agent must translate its exact step ordering into the script. The Torbjørn Neset and Hannah Becker runs both read the standard but implemented the old pattern.

2. **Pre-read department for create-employee tasks.** At 64% dept-required rate (7/11 production runs), pre-reading saves 1 call and 1 error in the majority case, while costing only 1 extra call in the minority case where department isn't required.

3. **Do NOT pre-read division.** At 0% production occurrence (0/11 runs), pre-reading division would waste 1 call every time. Only repair on 422.

4. **Always use `?fields=*,employments(*)` on POST /employee.** Without `employments(*)`, the response returns sparse employment objects (id+url only, no startDate). This expansion eliminates the need for a verification GET.

5. **The canonical create-employee minimum is 2 calls, 0 errors:** `GET /department` → `POST /employee?fields=*,employments(*)` with department included upfront.
