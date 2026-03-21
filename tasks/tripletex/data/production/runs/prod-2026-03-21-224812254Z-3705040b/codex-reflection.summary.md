# Codex Reflection Summary

## Task
Create employee Hannah Becker, born 1996-01-31, email hannah.becker@example.org, start date 2026-07-15. German-language prompt with mixed-language dates ("31. January 1996", "15. July 2026").

## Reflection
**What went well:**
- Agent correctly matched the task to the `create-employee` trusted standard
- Read the trusted standard before writing the script (following AGENTS.md rule)
- Correctly normalized German mixed-language dates to ISO format
- Used `?fields=*,employments(*)` to avoid a verification GET
- Used `userType: "NO_ACCESS"` correctly
- Department repair branch worked correctly (POST→422→GET dept→POST with dept→201)

**What went poorly:**
- Agent used the OLD no-pre-read strategy (POST without department first) instead of the CURRENT trusted standard which specifies pre-reading department
- This caused 1 avoidable 422 error and 1 wasted call

**Why it happened:**
- The trusted standard had already been updated to the pre-read strategy by a concurrent reflection run (Charles Walker / Torbjørn Neset). However, when this agent read the trusted standard at session start, it saw the old version (the file was updated between the time the agent read it and when this reflection runs). The agent's script hardcoded the old pattern.
- Root cause: the agent read the trusted standard once and followed the pattern it saw. The old version did not include department pre-reading.

## Call Efficiency
**Not minimal-call.** The run used 3 calls + 1 error. With the current pre-read strategy, it would have been 2 calls + 0 errors.

| Call | Endpoint | Status | Necessary? |
|------|----------|--------|------------|
| 1 | POST /employee?fields=*,employments(*) | 422 | Avoidable — should have pre-read department |
| 2 | GET /department?isInactive=false&count=1&fields=* | 200 | Yes (but should have been call #1) |
| 3 | POST /employee?fields=*,employments(*) with dept | 201 | Yes |

**Wasted calls:** 1 (the initial POST without department that triggered 422)
**Wasted errors:** 1 (the 422 on department.id)

**Lower-call path:**
1. `GET /department?isInactive=false&count=1&fields=id` → get dept ID (1 call)
2. `POST /employee?fields=*,employments(*)` with `department: { id: ... }` included → 201 (1 call)
Total: 2 calls, 0 errors

## Root Causes
1. **Stale strategy pattern:** The agent read the trusted standard at a point when it still had the old no-pre-read strategy. The standard had been updated by concurrent reflection runs but the agent session had the old version cached.
2. **Department-required rate above threshold:** 7/11 (64%) of production create-employee runs require department. The break-even for pre-reading was 50%, crossed after the 9th run. Every subsequent run using the old strategy wastes 1 call + 1 error when department is required.

## Sandbox Verification
- Confirmed `GET /department?isInactive=false&count=1&fields=id` returns active department (ID 837842 in sandbox)
- Confirmed `POST /employee?fields=*,employments(*)` with pre-included department succeeds (sandbox also requires division, handled by repair branch)
- Strategy B (pre-read dept only): 2 calls, 0 errors in production (where division hasn't been needed)
- Strategy C (pre-read dept + div): 3 calls, 0 errors always — confirmed working as fallback
- Strategy B is optimal for current production data (division needed in 0/11 runs)

## Playbook Changes
Updated existing files (no new files created):

- **`./trusted-standards/create-employee.md`**: Updated production run count to 11; dept-required rate to 7/11 (64%); division stats to 0/11; added Hannah Becker run details; updated strategy rationale math
- **`./task-playbooks/create-employee.md`**: Added Hannah Becker as 11th production confirmation (German prompt, 3 calls 1 error, dept-repair branch); updated dept-required rate to 7/11 (64%); updated avoidable mistakes with both Torbjørn Neset and Hannah Becker as examples of old-strategy waste

No AGENTS.md changes needed (table entries unchanged).

## Commit
- **Hash:** `06d681f5`
- **Message:** `tripletex playbook: create-employee — add 11th production confirmation (3705040b, German prompt, Hannah Becker / 1996-01-31 / hannah.becker@example.org / start 2026-07-15, 3 calls 1 error); dept-required rate now 7/11 (64%); update stats in trusted standard and playbook to reflect current production data; both Torbjørn Neset and Hannah Becker runs used old no-pre-read strategy despite trusted standard already specifying pre-read — reinforces that agents must follow the CURRENT trusted standard flow`

## Reusable Heuristics
1. **Pre-read department for create-employee.** At 64% dept-required rate, always doing `GET /department` first saves 0.3 calls and 0.64 errors per run on average vs no-pre-read. The 2-call path (GET dept + POST employee) is the new minimum.
2. **Do NOT pre-read division.** 0/11 production runs needed it. Only the persistent sandbox requires it. Keep division as a repair-only branch.
3. **Always follow the CURRENT trusted standard, not cached patterns.** Two consecutive runs (Torbjørn Neset and Hannah Becker) used the old no-pre-read pattern after the standard was updated, each wasting 1 call + 1 error.
4. **Use `fields=id` not `fields=*` for pre-read GETs.** When the only value needed is the ID, requesting `fields=id` is more efficient than `fields=*`.
5. **German date normalization works the same as other languages.** "31. January 1996" → "1996-01-31" and "15. July 2026" → "2026-07-15". No special handling needed beyond standard date parsing.
6. **Strategy break-even tracking matters.** The no-pre-read strategy was correct when dept-required was <50%. Once it crossed 50%, pre-reading became strictly better. Future strategy decisions should track production rates and flip at the threshold.
