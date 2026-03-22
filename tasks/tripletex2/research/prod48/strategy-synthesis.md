# Prod48 Strategy Synthesis: Task 06 — Create Employee (direct path v2)

## 1. Attempt Family Identification

### Source

48 production runs from `tasks/tripletex/data/production/runs/` spanning 2026-03-21 21:00 UTC through 2026-03-22 01:35 UTC.

### Cluster Distribution

| Task ID | Task Name                        | Runs | Pass Rate | Score Band |
|---------|----------------------------------|------|-----------|------------|
| **06**  | **Create employee**              | **8** | **100%** | **1.4/2 (focus, P1)** |
| 01      | Create customer                  | 6    | 100%      | 2/2 (killed) |
| 16      | Register supplier invoice        | 4    | 25%       | 3/4 (focus, P8) |
| 02      | Create supplier                  | 4    | 100%      | 2/2 (killed) |
| 18      | Reverse customer invoice payment | 4    | 100%      | 4/4 (killed) |
| 14      | Set project fixed price/milestone| 3    | 75%       | 4/4 (killed) |
| 08      | Create and send invoice          | 3    | 100%      | 2/2 (killed) |
| 11      | Create order, invoice, payment   | 2    | 50%       | 1/4 (focus, P12) |
| 04      | Create product                   | 2    | 100%      | 2/2 (killed) |
| 13      | Register travel expense          | 2    | 33%       | 1.125/4 (focus, P11) |
| 29      | Full project lifecycle           | 2    | 0%        | 0.55/6 (focus, P4) |
| Other   | (mixed)                          | 8    | varied    | varied |

### Chosen Attempt Family

**Task 06 — Create employee** is the strongest candidate because:

1. **Largest single-task cluster**: 8 runs (17% of the batch), the most frequent task type.
2. **Highest priority in task-queue.json**: Priority 1, research lane `tier-1-gap`, band `focus`.
3. **100% production pass rate**: All 8 runs achieve all 7 scored checks.
4. **Clear scoring gap**: Best known score 1.4/2 with max 2. Operator note: "Focus on closing the remaining score gap without paying sandbox-only department or division reads in the hot path."
5. **Production evidence proves a better approach** than the current v1 strategy.

Other candidates were weaker:
- Task 16 (supplier invoice): Already has a correct v1 implementation; 75% failure rate in production is from agents deviating from the playbook, not a strategy gap.
- Task 24 (correct ledger errors): Already has v3 in progress from another shard agent.
- Task 22 (receipt expense): 0/6 score but no production runs in the latest 48 to extract patterns from.

## 2. Production Evidence

### Proven 2-Call Path (8/8 runs)

Every task-06 production run follows the identical API sequence:

```
Call 1: POST /employee
  Body: { firstName, lastName, dateOfBirth, email, userType: "NO_ACCESS",
          employments: [{ startDate }] }
  Result: 201 Created

Call 2: GET /employee/employment?employeeId={newId}&fields=*
  Result: 200 OK (confirms startDate)
```

**Why call 2 is mandatory**: The POST /employee response returns sparse employments (link-only objects without `startDate`). The trusted standard explicitly states: "a one-call stop after POST /employee is not yet a trusted standard for start-date-scored tasks because the successful create response often omits the actual startDate."

### Representative Run Evidence

| Run ID | Language | Employee | Calls | Raw Score | Checks |
|--------|----------|----------|-------|-----------|--------|
| `3705040b` | English | Charles Walker | 2 | 8/8 | 7/7 |
| `e9e115f1` | Portuguese | André Almeida | 2 | 8/8 | 7/7 |
| `8e8e2e86` | Nynorsk | Bjørn Neset | 2 | 8/8 | 7/7 |
| `7b40806a` | Nynorsk | (employee run) | 2 | 8/8 | 7/7 |

### Multilingual Prompt Handling

The 8 runs span 4+ languages (English, Portuguese, Norwegian Bokmål, Norwegian Nynorsk). Date normalization must handle:
- `"21. January 1999"` (English with dot)
- `"30. May 1992"` (English with dot)
- `"21. February 1996"` (English with dot)

Name handling must preserve Unicode: `"André"`, `"Bjørn"`, `"João"`.

### Key Behavioral Observations

1. **No department or division needed**: In fresh production accounts, `POST /employee` succeeds without `department.id` or `employments[].division.id`.
2. **userType echoes as null**: The create response returns `userType: null` even when `"NO_ACCESS"` was sent. This is cosmetic — the stored value is correct.
3. **Employment response is link-only**: `employments` in the create response contains only `{ id, url }`. The `startDate` field is absent, requiring the verification read.

## 3. Current v1 Strategy Gap Analysis

### What v1 Does

The current `06.create-employee.v1` implements a 3-level repair ladder:

```
POST /employee                    → 422 "Validering feilet."  (call 1)
GET  /department?isInactive=false → resolve department         (call 2)
POST /employee + department.id    → 422 "Validering feilet."  (call 3)
GET  /division?count=1            → resolve division           (call 4)
POST /employee + dept + div       → 201 Created               (call 5)
GET  /employee/employment         → verify startDate           (call 6)
```

**6 calls** in persistent sandbox. **2 calls** in production fresh accounts (the first POST succeeds directly, skipping the repair ladder).

### Root Cause of the Score Gap

The verification system runs against sandbox, where the repair ladder triggers, inflating the call count from 2 (baseline) to 6. The scoring formula penalizes over-budget calls, resulting in 1.4/2 instead of 2.0/2.

The v1 repair ladder is _correct_ but _sequential_: it tries POST, reads department, tries POST again, reads division, tries POST a third time. Each step adds a call.

### What v2 Must Change

1. **Collapse the repair ladder**: If the first POST fails with a generic 422, read department AND division in one parallel step, then retry once. This reduces sandbox calls from 6 to 5 (POST fail → GET dept + GET div → POST succeed → GET employment).
2. **Preserve the 2-call production path**: The happy path remains unchanged.
3. **Keep all normalization and error discrimination**: v1's date parsing, name splitting, email normalization, and input-field-error detection are correct and production-proven.

### Expected Score Impact

- **Production (happy path)**: 2 calls → same as v1 (no change)
- **Sandbox (repair path)**: 5 calls instead of 6 → better efficiency score
- **Correctness**: All 7 checks continue to pass (repair logic produces the same final state)

## 4. Anti-Patterns from Production Evidence

1. **Do not pre-read department/division unconditionally**: Production accounts accept direct create. Pre-reading wastes calls.
2. **Do not retry POST twice in sequence**: The v1 pattern (retry with dept → retry with dept+div) is wasteful. If repair is needed, resolve both prerequisites before retrying.
3. **Do not skip the employment verification read**: The create response never proves startDate. This has been confirmed across all 8 production runs.
4. **Do not ASCII-normalize employee names**: Unicode must be preserved exactly (`João`, `André`, `Bjørn`).
5. **Do not mask input-field validation errors**: If the 422 message mentions `dateOfBirth`, `email`, `startDate`, etc., that's a real input error — don't attempt repair.

## 5. Implementation Plan

- **File**: `tasks/tripletex2/src/tasks/task-06/strategies/create-employee-direct.ts`
- **Strategy ID**: `06.create-employee-direct.v2`
- **Call profile**: target 2, max 5
- **Status**: `draft`
- **Wiring**: Add to `task.ts` loadTaskModule, pin in `active-strategies.json`
- **Tests**: Node.js `test` module with TripletexClient stubs covering happy path, repair path, and input-field error rejection
