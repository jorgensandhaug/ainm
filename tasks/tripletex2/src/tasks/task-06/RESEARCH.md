# Task 06 — Create employee Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `06`
- Active strategy pin: `06.create-employee.v1`
- Challenger strategy: `06.create-employee.v2`
- Task implementation: `task.ts`
- Stable task summary: `README.md`

## Current Research Queue Snapshot

- Priority: `1`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `tier-1-gap`
- Best known score: `1.4` / `2`
- Baseline call budget: `2`
- Proof input: `research/proofs/task-06/task-06-proof-input.json`
- Verification plan: `task-06.create-employee.v1`

## Current State

### Queue Notes

- Only remaining Tier 1 gap.
- Fresh-account production evidence says the winning floor is still the 2-call employee create plus employment readback branch (v1).
- V2 challenger discovered that `fields=employments(*)` on POST /employee returns startDate in the response, reducing the call floor to 1.

### Operator Notes

- Focus on closing the remaining 0.6 score gap.
- V2 is sandbox-verified and eliminates the employment readback call entirely.
- Production validation needed: v2 has not been tested in a scored production run yet.

## Frontier Memory

### Strongest known branch (v1 — active)
- POST /employee + GET /employee/employment (2 calls on fresh accounts)
- Score: 1.4/2 with all 7/7 checks passed, 8/8 raw
- Proven in production: runs a392afd8 (João Rodrigues), 16b4baa8 (Thomas Harris), 8fe4b18f (Miguel Sánchez)

### Challenger branch (v2 — needs-review)
- POST /employee?fields=id,...,employments(*) (1 call on fresh accounts)
- The `fields=employments(*)` parameter causes Tripletex to expand nested employment data including startDate in the POST response
- When startDate is proven in the response, the employment readback GET is skipped
- Sandbox-verified on 2026-03-22: 5 calls with full repair ladder (vs v1's 6), correctness passed
- Fresh-account projection: 1 call (no repair needed, startDate in response → no readback needed)

### Key API Discovery
- `fields=*` on POST /employee does NOT expand nested objects — returns sparse employment links `{id, url}`
- `fields=employments(*)` on POST /employee DOES expand employment data including `startDate`, `division`, `employee` link, etc.
- `fields=id,firstName,lastName,email,dateOfBirth,userType,employments(*)` returns both employee identity fields and expanded employment data
- This was manually verified on sandbox on 2026-03-22 via disposable test script

### Call Budget Comparison
| Scenario | v1 | v2 |
|----------|----|----|
| Fresh account (no repair) | 2 calls | **1 call** |
| Sandbox repair (dept + div) | 6 calls | **5 calls** |
| Repair + no startDate fallback | 6 calls | 6 calls |

### Score-improvement ceiling
- v1: 1.4/2 (2 calls, all checks pass)
- v2 projection: potentially higher (1 call on fresh accounts, same correctness)
- The 0.6 gap may be related to call efficiency — fewer calls could unlock the remaining points

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
| `prod-2026-03-20-224058181Z-16b4baa8` | English | 2 | ambiguous | Thomas Harris re-proof |
| `prod-2026-03-20-224201582Z-3d4e5838` | French | 2 | — | Mixed-language date normalization |
| `prod-2026-03-20-224447345Z-a392afd8` | Portuguese | 2 | 1.4 | João Rodrigues, 7/7 checks, Unicode preserved |

Production script files consulted:
- `create_employee_joao_rodrigues.ts` (a392afd8)
- `sandbox_reflect_create_employee.ts` (a392afd8)

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

1. **Sandbox reset**: 3 old v1 employee records (18667403, 18667476, 18667507) cannot be neutralized by the reset script. Workaround: use fresh proof input emails. Not a production blocker.
2. **Production validation**: v2 has not been tested in a scored production run. The `fields=employments(*)` behavior needs to be confirmed on the production Tripletex proxy.
3. **Budget classification**: The verification pipeline marks v2 as "withinBudget: false" because the persistent sandbox path (5 calls) exceeds the 2-call baseline. On fresh accounts, v2 uses 1 call — well within budget.

## Next Hypothesis

1. **Promote v2 to production** — Run a scored production attempt with v2 to see if the 1-call path improves the score above 1.4.
2. **Validate fields param on production proxy** — The production Tripletex proxy may handle `fields` differently than the sandbox. Needs a production run to confirm.
3. **If v2 scores higher**: Promote to active-strategies.json.
4. **If v2 scores the same**: The 0.6 gap may not be call-efficiency related; investigate other scoring factors.

## Next Improving-Agent Update Checklist

- Read the generated packet first.
- Compare against the current active strategy before editing code.
- Verify with the research OS / sandbox instead of writing strategy tests.
- Write back the outcome here, even if the result is "no import" or "frontier unchanged".
