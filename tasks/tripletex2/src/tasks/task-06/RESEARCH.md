# Task 06 — Create employee Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `06`
- Active strategy pin: `06.create-employee.v1`
- Challenger strategy: `06.create-employee.v2` (sandbox-verified, NOT production-proven)
- Task implementation: `task.ts`
- Stable task summary: `README.md`

## Current Research Queue Snapshot

- Priority: `1`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `tier-1-gap`
- Best known score: `1.4` / `2` (probable — see attribution caveat below)
- Baseline call budget: `2`
- Proof input: `research/proofs/task-06/task-06-proof-input.json`
- Verification plan: `task-06.create-employee.v1`

## Current State

### Queue Notes

- Only remaining Tier 1 gap.
- Fresh-account production evidence says the winning floor is still the 2-call employee create plus employment readback branch (v1).
- V2 challenger discovered that `fields=employments(*)` on POST /employee returns startDate in the response, reducing the **sandbox-verified** call floor to 1 on fresh accounts.
- **V2 is NOT promotion-ready.** It requires one production proof run to confirm both the `fields=employments(*)` behavior on the production proxy and the actual score impact.

### Operator Notes

- Focus on closing the remaining score gap without pretending v2 is proven.
- V2 repair routing was hardened in follow-up: now routes off structured `validationMessages[].field` instead of negative message heuristics.
- The `1.4/2` baseline score attribution is probable but not cleanly proven — the best-scoring production run (`a392afd8`, João Rodrigues) was attributed to `tx_task_id: "01"` in task-attribution.json, while the leaderboard shows `tx_task_id: "06"` at `best_score: 1.4`. The attribution pipeline is known to be noisy for this task shape.

## Frontier Memory

### Strongest known branch (v1 — active, production-proven)
- POST /employee + GET /employee/employment (2 calls on fresh accounts)
- Score: probably 1.4/2 — leaderboard shows tx_task_id 06 at 1.4 as of 2026-03-20; the João Rodrigues run scored 8/8 raw (7/7 checks) with normalizedScore 1.4 but was attributed to tx_task_id 01 (noisy attribution)
- Correctness: 7/7 checks passed across all production runs
- Proven in production: runs a392afd8 (João Rodrigues), 16b4baa8 (Thomas Harris), 8fe4b18f (Miguel Sánchez)
- Repair routing: negative message heuristic (v1 only) — if the 422 message does NOT contain input-field hints, attempt department/division repair

### Challenger branch (v2 — sandbox-verified, NOT production-proven)
- POST /employee?fields=id,...,employments(*) (1 call on fresh accounts, sandbox-proven)
- The `fields=employments(*)` parameter causes Tripletex to expand nested employment data including startDate in the POST response — **verified only on sandbox, not on production proxy**
- When startDate is proven in the response, the employment readback GET is skipped
- Sandbox-verified on 2026-03-22: 5 calls with full repair ladder (vs v1's 6), correctness passed
- Fresh-account projection: 1 call — but this is a projection, not a production-proven fact
- Repair routing: structured `validationMessages[].field` checks (`department.id`, `employments.division.id`) — safer than v1's negative heuristic

### Key API Discovery (sandbox-only evidence)
- `fields=*` on POST /employee does NOT expand nested objects — returns sparse employment links `{id, url}`
- `fields=employments(*)` on POST /employee DOES expand employment data including `startDate`, `division`, `employee` link, etc.
- `fields=id,firstName,lastName,email,dateOfBirth,userType,employments(*)` returns both employee identity fields and expanded employment data
- Manually verified on sandbox on 2026-03-22 via disposable test script
- **Not yet verified on the production Tripletex proxy** — the proxy may strip or ignore `fields` on POST requests

### Call Budget Comparison
| Scenario | v1 (production-proven) | v2 (sandbox-only) |
|----------|----|----|
| Fresh account (no repair) | 2 calls | **1 call** (projected) |
| Sandbox repair (dept + div) | 6 calls | **5 calls** (verified) |
| Repair + no startDate fallback | 6 calls | 6 calls |

### Score-improvement ceiling
- v1: 1.4/2 (probable — see attribution caveat)
- v2 projection: potentially higher if call efficiency contributes to scoring
- The gap between 1.4 and 2.0 may be related to call count, or to scoring factors we don't yet understand
- **Only a production proof run can resolve this**

### Code quality improvements (v2 over v1)
- Repair routing uses structured `validationMessages[].field` checks instead of negative message heuristics
- This is strictly safer: routes to department repair only when `validationMessages` explicitly contains `field == "department.id"`, and to division repair only when it contains `field == "employments.division.id"`
- v1's negative heuristic could theoretically misroute on novel 422 messages that happen to NOT match the input-field-error hints list

### Anti-patterns / dead ends
- `fields=*` on POST does not help — it only returns top-level fields, not nested expansions
- Proactive GET /department or GET /division wastes calls on fresh accounts
- A 1-call stop WITHOUT `fields=employments(*)` is NOT safe — the default POST response does not include startDate
- Cannot delete employees from the persistent sandbox (Tripletex returns "Validering feilet." on employee neutralization)

## Production Runs Consulted

| Run ID | Prompt Language | Calls | Score | Key Finding |
|--------|----------------|-------|-------|-------------|
| `prod-2026-03-20-161444237Z-7ff6c14f` | Portuguese | 3 | — | Wasted proactive department pre-read |
| `prod-2026-03-20-201151100Z-8fe4b18f` | Spanish | 2 | skipped | Fresh-account 2-call proof |
| `prod-2026-03-20-224058181Z-16b4baa8` | English | 2 | ambiguous (3 candidates) | Thomas Harris, attributed to tx_task_ids 01/02/04/08/12 |
| `prod-2026-03-20-224201582Z-3d4e5838` | French | 2 | — | Mixed-language date normalization |
| `prod-2026-03-20-224447345Z-a392afd8` | Portuguese | 2 | 1.4 (attributed to tx_task_id 01, not 06) | João Rodrigues, 7/7 checks, Unicode preserved |

**Attribution caveat**: All five employee-creation production runs were attributed to `tx_task_id: "01"` (not `"06"`) in their task-attribution.json files. The leaderboard independently shows `tx_task_id: "06"` at `best_score: 1.4`. The packet warns that "tx_task_id attribution is noisy" for this task shape.

Production script files consulted:
- `scripts/create_employee_joao_rodrigues.ts` (a392afd8) — most relevant
- `scripts/sandbox_reflect_create_employee.ts` (a392afd8)

## Verification Outcome

### V2 Sandbox Verification (2026-03-22T02:31:28.857Z)
- Report: `verify-06-06.create-employee.v2-2026-03-22T02-31-28-857Z`
- Status: **needs-review** (correctness passed, budget exceeded due to sandbox repair ladder)
- API calls: 5 (POST→422, GET /department, POST→422, GET /division, POST→201)
- Employment readback: **SKIPPED** — startDate proven in POST response via `fields=employments(*)`
- All correctness assertions passed: firstName, lastName, email, dateOfBirth, startDate
- Input: Maria Lindqvist / 1988-03-15 / maria.lindqvist@example.org / 2026-11-01

### Manual Disposable Test (2026-03-22)
- POST /employee WITHOUT fields param: employments = `[{id, url}]` (sparse, no startDate)
- POST /employee WITH `fields=*`: employments = `[{id, url}]` (still sparse)
- POST /employee WITH `fields=employments(*)`: employments include full data with startDate=2026-11-15

## Blockers

1. **Production proof run required**: V2 has not been tested in a scored production run. The `fields=employments(*)` behavior needs to be confirmed on the production Tripletex proxy. **This is the single blocking next step.**
2. **Sandbox reset**: 3 old v1 employee records (18667403, 18667476, 18667507) cannot be neutralized by the reset script. Workaround: use fresh proof input emails. Not a production blocker.
3. **Budget classification**: The verification pipeline marks v2 as "withinBudget: false" because the persistent sandbox path (5 calls) exceeds the 2-call baseline. On fresh accounts, v2 would use 1 call — well within budget.

## Next Steps

1. **One production proof run with v2** — confirm `fields=employments(*)` works on the production proxy and measure the actual score impact.
2. **If production confirms**: promote v2 to active-strategies.json.
3. **If production `fields` is stripped/ignored**: v2 falls back to the same 2-call path as v1 (safe fallback), and the improvement narrows to the repair-routing hardening only.
4. **If the score doesn't improve with 1 call**: the gap is not call-efficiency-related; investigate other scoring factors.

## Next Improving-Agent Update Checklist

- Read the generated packet first.
- Compare against the current active strategy before editing code.
- Verify with the research OS / sandbox instead of writing strategy tests.
- Write back the outcome here, even if the result is "no import" or "frontier unchanged".
