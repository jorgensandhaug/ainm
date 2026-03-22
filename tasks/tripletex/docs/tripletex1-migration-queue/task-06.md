# Task 06 — Create Employee

**Status: `review-ready`**

## Snapshot
- Tripletex1 current best score: 2.0/2 (perfect — stable since 2026-03-22, 27 attempts, 4 consecutive optimal 2-call / 0-error production runs)
- Priority: low — T1 is at max score; T2 is behind (1.4–1.53/2, 24 attempts)
- Target Tripletex1 surface: `trusted-standards/create-employee.md`, `task-playbooks/create-employee.md`, `AGENTS.md` (lines 308, 398–409)
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-06/RESEARCH.md`
  - `tasks/tripletex2/src/tasks/task-06/task.ts`
  - `tasks/tripletex2/src/tasks/task-06/strategies/create-employee.ts` (v1)
  - `tasks/tripletex2/src/tasks/task-06/strategies/create-employee-v2.ts` (v2 challenger)
  - `tasks/tripletex2/src/tasks/task-06/strategies/create-employee-direct.ts`
  - `tasks/tripletex2/research/verifications/task-06/verify-06-06.create-employee.v2-2026-03-22T02-31-28-857Z/`
  - `tasks/tripletex2/research/packets/task-06/task-06-packet-2026-03-22T02-12-21-076Z.json`

## Task Identity Mapping

Tripletex2 task-06 maps to **tx_task_id "01"** (confirmed via `task.ts` line 9: `CREATE_EMPLOYEE_TX_TASK_ID = "01"`). This is an unusual mapping: the queue file number follows T2's internal task numbering, not the Tripletex production `tx_task_id`.

**Attribution caveat:** T2's RESEARCH.md (line 39) notes that all five production employee-creation runs were attributed to `tx_task_id: "01"` in their `task-attribution.json` files, while the leaderboard independently shows `tx_task_id: "06"` at `best_score: 1.4`. The attribution pipeline is noisy for this task shape. This does not affect T1 since T1 routes via trusted-standard matching, not task IDs.

## Current Tripletex1 Coverage

### What already exists

T1's create-employee coverage is **comprehensive and production-proven at perfect score**.

**AGENTS.md** (lines 308, 398–409):
- Line 308: Full canonical path — `GET /department` → `POST /employee?fields=*,employments(*)` with `userType: "NO_ACCESS"`, department from pre-read, nested `employments: [{ startDate }]`. Documents the employment-object field restriction (ONLY `startDate` + `division` for repair; no `employmentType`, `percentageOfFullTimeEquivalent`, etc.) and the code 16000 unmappable-field error from `aa0e0f72`.
- Line 398: Department pre-read rationale (5/9 → 56% at adoption; now 9/16 in trusted standard). Explicit "Do NOT pre-read `/division`".
- Line 399: Minimum safe path summary. `?fields=*,employments(*)` eliminates verification GET.
- Lines 400–409: Language normalization, Unicode preservation, department fallback, division repair, structured `validationMessages[].field` routing.

**Trusted standard** (`create-employee.md`, 93 lines):
- Standard flow (lines 21–24): `GET /department` → `POST /employee?fields=*,employments(*)` → conditional division repair → stop.
- Payload rules (lines 27–36): Department top-level only, division employment-only, `userType: "NO_ACCESS"`, employment field restrictions, ISO date normalization, Unicode preservation.
- Validation rules (lines 39–43): Structured `validationMessages[].field` routing. Code 16000 documentation.
- Reuse from write response (lines 46–49): `value.employments[0].startDate` proves scored state in one response.
- Call counts (lines 63–65): 2 calls common, 3 if no dept exists, +2/+1 error for division repair.
- Strategy rationale (lines 72–75): Pre-read adopted at 64% dept-required rate; strictly better on both calls and errors.
- 16 production runs documented (lines 78–92), 4 achieving the optimal 2-call/0-error path.

**Playbook** (`create-employee.md`, 121 lines):
- Mirrors trusted standard. Includes the `fields=*,employments(*)` discovery, sandbox verification notes, recommended payload shape with JSON example, and 16 production run histories with error analysis.

### Important gaps / contradictions

**Gap 1 — AGENTS.md line 398 vs line 404 (division pre-read):**
- Line 398: "Do NOT pre-read `/division` (0/9 production runs needed it); keep division as a repair-only branch."
- Line 404: "Pre-read `/division` with `GET /division?count=1&fields=*` before `POST /employee` to log the division state."
- These directly contradict. Line 404 was likely added after the logging rule (line 47: "GET requests are FREE... Use as many GET requests as you need") which overrides call-saving advice. An agent reading both could be confused about whether division pre-read is expected.
- **Impact:** Low. GETs are free, so pre-reading division wastes no scored calls. The only risk is an agent misinterpreting the pre-read as a flow requirement and adding division to the POST payload unnecessarily.

**Gap 2 — AGENTS.md line 405 (stale response description):**
- Line 405: "the `POST /employee` success response may echo `userType: null` plus `employments` entries with only `id`/`url`, not the submitted `startDate`."
- This is true WITHOUT `?fields=*,employments(*)`, but misleading in context since lines 399 and 409, plus the trusted standard, all prescribe `?fields=*,employments(*)` which DOES return `startDate`.
- An agent reading line 405 in isolation could conclude a verification GET is needed, contradicting lines 399 and 409.
- **Impact:** Low-medium. Could cause 1 wasted GET call, but GETs are free under the current logging rule.

**Gap 3 — Stale department statistics in AGENTS.md line 398:**
- Line 398 says "5/9 production runs (56%)" which was the count when pre-read was adopted. The trusted standard now reports 9/16 runs needed department (also 56%, coincidentally). This is a minor staleness issue, not a contradiction.

## Candidate Imports from Tripletex2

### Import 1: V2 fields=employments(*) eliminates readback — ALREADY IN T1
- **Insight:** T2's v2 strategy discovered that `fields=employments(*)` on `POST /employee` expands nested employment data including `startDate` in the response, eliminating the need for a separate `GET /employee/employment` verification call.
- **Why it seems new:** It doesn't — T1 already has this. T1's trusted standard (line 22) uses `POST /employee?fields=*,employments(*)` and explicitly documents the behavior (lines 47–49, 59–60). T1's playbook (lines 13–17) documents the discovery. AGENTS.md lines 399 and 409 prescribe the same.
- **Evidence:** T1 trusted standard lines 22, 47–49, 59–60. T2 RESEARCH.md lines 58–63. T2 verification report `verify-06-06.create-employee.v2-2026-03-22T02-31-28-857Z` confirmed correctness.
- **Confidence:** HIGH that this is a no-op — T1 already has it and is scoring 2.0/2 with it.

### Import 2: Structured validation routing via validationMessages[].field — ALREADY IN T1
- **Insight:** T2's v2 hardened repair routing to use structured `validationMessages[].field` checks (`department.id`, `employments.division.id`) instead of the v1 negative message heuristics.
- **Why it seems new:** It doesn't — T1's trusted standard (lines 39–43) already uses structured `validationMessages[].field` routing and explicitly warns against branching on generic `422 message`. AGENTS.md line 408 says the same.
- **Evidence:** T1 trusted standard lines 39–43. T2 RESEARCH.md lines 56, 79–81.
- **Confidence:** HIGH that this is a no-op.

### Import 3: Department pre-read strategy — ALREADY IN T1
- **Insight:** T2 uses `GET /department` before `POST /employee` to avoid 422 repair on accounts requiring department.
- **Why it seems new:** It doesn't — T1 adopted pre-read at 64% department-required rate. AGENTS.md line 398 and trusted standard line 21 prescribe it. Strategy rationale is documented (trusted standard lines 72–75).
- **Evidence:** T1 trusted standard lines 21, 72–75. AGENTS.md line 398.
- **Confidence:** HIGH that this is a no-op.

### Import 4: V2 1-call projection (sandbox-only, NOT production-proven)
- **Insight:** T2's v2 projects that on fresh accounts, `POST /employee?fields=id,...,employments(*)` could theoretically achieve a 1-call solution by returning `startDate` in the response, eliminating even the department pre-read.
- **Why it seems new:** T1 pre-reads department by default (2 calls). A 1-call path would skip department pre-read entirely.
- **Evidence:** T2 RESEARCH.md lines 51–55. **Sandbox-only** — v2 used 5 calls in sandbox verification (with repair ladder), not 1. The 1-call projection assumes a fresh account with no department/division requirement — but T1's production data shows 56%+ accounts require department, making a no-pre-read approach worse on average.
- **Confidence:** LOW. The 1-call projection is not production-proven. T1's data shows pre-read is strictly better at 56%+ department-required rate. Skipping department pre-read to save 1 GET would reintroduce 422 errors on the majority of accounts. T2's own RESEARCH.md (line 122) says this requires "one production proof run" before promotion. **Not safe to port.**

### Import 5: T2 score attribution caveat (tx_task_id noisy for employee-create)
- **Insight:** T2's best production run (`a392afd8`, scored 1.4) was attributed to `tx_task_id: "01"` in task-attribution.json despite leaderboard showing `tx_task_id: "06"` at 1.4. The attribution pipeline is "known to be noisy" for this task shape.
- **Why it seems new:** T1 does not use task-ID-based routing (it uses trusted-standard pattern matching), so this is irrelevant to T1 operations.
- **Evidence:** T2 RESEARCH.md lines 39, 45, 99.
- **Confidence:** HIGH that this is a no-op for T1. Informational only.

## Proposed Markdown Deltas

### AGENTS.md

No net-new T2 imports proposed. However, two internal T1 consistency improvements are noted:

- **Optional cleanup 1 — Resolve lines 398 vs 404 (division pre-read contradiction):** Line 398 says "Do NOT pre-read `/division`" while line 404 says "Pre-read `/division`... to log the division state." Since the logging rule (line 47) overrides call-saving advice, line 398's "Do NOT pre-read" should be softened to distinguish the core flow (division is repair-only) from the logging recommendation (pre-read for observability). Alternatively, line 404 could be removed since it was superseded by the logging rule.
- **Reason:** Avoid agent confusion between flow requirements and logging recommendations.

- **Optional cleanup 2 — Mark line 405 as stale or qualified:** Line 405 says the POST response echoes `employments` entries with only `id`/`url`, not `startDate`. Add a qualifier: "...when NOT using `?fields=*,employments(*)`; with that expansion, `startDate` IS included (see line 399)."
- **Reason:** Prevent agents from adding unnecessary verification GETs when lines 399 and 409 already prescribe the fields expansion.

### Trusted standard
- **Target file:** `trusted-standards/create-employee.md`
- **No changes proposed.** The trusted standard is already comprehensive, production-proven, and scoring 2.0/2.

### Playbook
- **Target file:** `task-playbooks/create-employee.md`
- **No changes proposed.** The playbook mirrors the trusted standard accurately.

## Risks / Caveats

- **Mapping ambiguity:** T2 task-06 uses tx_task_id "01", not "06". The queue file number follows T2's internal numbering. T1 does not use task IDs for routing (it uses trusted-standard matching), so this mismatch has no operational impact. However, anyone cross-referencing T1 and T2 leaderboards should be aware that T1's `tx_task_id 01` scores and T2's `task-06` scores refer to the same underlying Tripletex task.
- **Conflicting evidence:** None. T1 and T2 agree on all major findings (department pre-read, `fields=*,employments(*)`, structured validation routing, `userType: "NO_ACCESS"`, employment field restrictions).
- **Not safe to port:** T2's v2 1-call projection (Import 4) should NOT be ported. It has not been production-proven, and T1's production data (56%+ department-required rate) makes skipping the department pre-read strictly worse on average.

## Recommendation

- **Hold — T1 is at perfect score with no net-new T2 imports available.**
- T1's create-employee guidance is already more mature than T2's: T1 has 16 documented production runs and achieves 2.0/2, while T2 has 5 documented production runs at 1.4/2 with an unproven challenger strategy.
- The two optional AGENTS.md cleanups (lines 398/404 and 405) are internal T1 consistency issues, not T2 imports. They carry low risk and could be picked up in a regular T1 maintenance pass.
- If T2's v2 is ever production-proven to score higher than 2.0 (e.g., if scoring criteria change), revisit this proposal. Until then, T1's current approach is the proven winner.
