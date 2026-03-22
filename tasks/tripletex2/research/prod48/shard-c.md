# Shard C — prod48 Audit

Analyzed 8 production runs from 2026-03-21 22:58–23:11 UTC.

## Per-Run Evidence

### Run 1: prod-2026-03-21-225831114Z-2d9b6947

| Field | Value |
|-------|-------|
| Prompt language | Spanish |
| Prompt | "Crea tres departamentos en Tripletex: 'Lager', 'Økonomi' y 'Drift'." |
| Leaderboard tx_task_id | **05** |
| Inference status | `unique_attempt_delta` (unambiguous) |
| Score | 7/7 raw, correctness 1.0, normalized 2 |
| Checks | 3/3 passed |
| Scripts | `create-departments.ts` — single POST /department/list batch |
| Call count | 1 call, 0 errors |

**Mapping conflict: CRITICAL.** The leaderboard unambiguously attributed this run to tx_task_id **05** with a perfect 7/7 score. The prompt creates **departments**. But `tasks/tripletex2` maps txTaskId 05 to **"Create project"** and txTaskId 03 to **"Create department."** Cross-referencing against `prompt-task-labels.jsonl` reveals this is part of a **full scrambling of tasks 01–08** in the canonical registry. See Cluster Conclusion #1 for the complete mapping table.

---

### Run 2: prod-2026-03-21-225834613Z-e3cb5ff8

| Field | Value |
|-------|-------|
| Prompt language | Nynorsk |
| Prompt | "Opprett ein fri rekneskapsdimensjon 'Region' med verdiane 'Midt-Norge' og 'Vestlandet'. Bokfør deretter eit bilag på konto 7140 for 43750 kr, knytt til dimensjonsverdien 'Midt-Norge'." |
| Leaderboard tx_task_id | ambiguous (05, 07, 17 all changed) |
| Inference status | `ambiguous` |
| Score | Not attributable (2 candidates) |
| Scripts | `run.ts` (5-step dimension+voucher flow), `sandbox-verify-batch-values.ts` |
| Call count | 5 calls, 0 errors |

**Semantic match:** Task 07 — "Create accounting dimension and post voucher." The prompt exactly matches the task 07 contract: create a free accounting dimension with named values, then post a voucher on a specific account linked to one dimension value. The ambiguity is from concurrent runs overlapping in the leaderboard window.

**No mapping conflict.** Consistent with current tripletex2 task-07 definition.

---

### Run 3: prod-2026-03-21-225842000Z-c31672b0

| Field | Value |
|-------|-------|
| Prompt language | Bokmål |
| Prompt | "Gjennomfør hele prosjektsyklusen for 'Dataplattform Brattli' (Brattli AS, org.nr 937190808): 1) budsjett 349100 kr. 2) Registrer timer: Hilde Ødegård 21t + Lars Johansen 141t. 3) Leverandørkostnad 71800 kr fra Lysgård AS. 4) Opprett kundefaktura." |
| Leaderboard tx_task_id | ambiguous (05, 07, 17, 29 all changed) |
| Inference status | `ambiguous` |
| Score | Not attributable (3 candidates) |
| Scripts | `run.ts` (18-call lifecycle), `sandbox-test-batch-participants.ts`, `sandbox-optimized-flow.ts` |
| Call count | 18 calls (17 base + 1 bank fix), 0 errors |

**Semantic match:** Task 29 — "Full project lifecycle." Four numbered steps: budget + hours + supplier cost + invoice. Exact match to task 29 contract.

**No mapping conflict.** Consistent with current tripletex2 task-29 definition.

**Efficiency notes:** 2 wasted calls from individual POST /employee and POST /project/participant instead of batch endpoints. Optimal: 16 calls.

---

### Run 4: prod-2026-03-21-225903427Z-91f3e3c9

| Field | Value |
|-------|-------|
| Prompt language | English |
| Prompt | "The customer Windmill Ltd (org no. 830362894) has an outstanding invoice for 32200 NOK excluding VAT for 'System Development'. Register full payment on this invoice." |
| Leaderboard tx_task_id | ambiguous (07, 17 changed) |
| Inference status | `ambiguous` |
| Score | Not attributable (2 candidates) |
| Scripts | `register-payment.ts` — find invoice, get payment types, PUT payment |
| Call count | 3 calls, 0 errors |

**Semantic match:** Task 17 — "Register customer invoice payment." Locate unpaid customer invoice by org number + description, register full payment. Exact match.

**No mapping conflict.** Consistent with current tripletex2 task-17 definition. The reflection confirms perfect execution: 3 calls (optimal), all checks passed, amountOutstanding=0.

---

### Run 5: prod-2026-03-21-225934265Z-1fe7fd31

| Field | Value |
|-------|-------|
| Prompt language | German |
| Prompt | "Erfassen Sie 33 Stunden für Paul Müller auf der Aktivität 'Testing' im Projekt 'Datenmigration' für Sonnental GmbH. Stundensatz: 900 NOK/h. Erstellen Sie eine Projektrechnung." |
| Leaderboard tx_task_id | ambiguous (07, 16, 17, 29 changed) |
| Inference status | `ambiguous` |
| Score | Not attributable (4 candidates) |
| Scripts | `run.ts` (12-call create-from-scratch), `sandbox-verify-no-participant.ts`, `sandbox-verify-parallel.ts` |
| Call count | 12 calls, 0 errors |

**Semantic match:** Task 15 — "Register project hours and create project invoice." The reflection explicitly calls this "a create-from-scratch variant of register-project-hours-and-create-project-invoice." Single employee, no supplier cost, no numbered lifecycle steps. This is NOT task 29 (which requires budget + 2+ employees + supplier cost + invoice).

**Potential mapping concern:** The leaderboard diff includes task 29 in the ambiguous set, but the prompt semantics clearly belong to task 15. This distinction matters for the classifier — prompts that ask to register hours and invoice on a project (without the full 4-step lifecycle structure) should route to task 15, not task 29.

**Suboptimalities found:** Used 6 sequential steps instead of optimal 4. Used `adminAccess: true` instead of `false` (Paul Müller is not designated as PM).

---

### Run 6: prod-2026-03-21-230013709Z-ff67568b

| Field | Value |
|-------|-------|
| Prompt language | German |
| Prompt | "Führen Sie den vollständigen Projektzyklus für 'Cloud-Migration Eichenhof' (Eichenhof GmbH, Org.-Nr. 986645888) durch: 1) Budget 253000 NOK. 2) Stunden: Hannah Weber 34h + Marie Fischer 118h. 3) Lieferantenkosten 47050 NOK von Silberberg GmbH. 4) Kundenrechnung." |
| Leaderboard tx_task_id | ambiguous (16, 29 changed) |
| Inference status | `ambiguous` |
| Score | Not attributable (3 candidates) |
| Scripts | `run.ts` (18-call lifecycle), `sandbox-batch-test.ts`, `sandbox-optimized-flow.ts`, `sandbox-voucher-invoice-parallel.ts` |
| Call count | 18 calls (17 base + 1 bank fix), 0 errors |

**Semantic match:** Task 29 — "Full project lifecycle." Four numbered steps, 2 employees, supplier cost. Exact match.

**No mapping conflict.** Consistent with task-29.

**Critical finding:** This run included ALL 4 hypothesized "critical fixes" (isFixedPrice+fixedprice, budgetHours, adminAccess:true, POST /project/orderline). The score did NOT improve — best_score stayed at 1.0909. **The "4 critical fields" hypothesis for task 29 is DISPROVEN.** The persistent check failures have a different root cause.

**Batch endpoint confirmation:** Sandbox-verified POST /employee/list and POST /project/participant/list both work. Optimal path: 15 calls (or 16 with bank fix).

---

### Run 7: prod-2026-03-21-230509652Z-e103a5b5

| Field | Value |
|-------|-------|
| Prompt language | Nynorsk |
| Prompt | "Registrer ei reiserekning for Torbjørn Brekke for 'Kundebesøk Trondheim'. 4 dagar med diett (dagssats 800 kr). Utlegg: flybillett 6150 kr og taxi 750 kr." |
| Leaderboard tx_task_id | **13** |
| Inference status | `unique_attempt_delta` (unambiguous) |
| Score | 4.5/8 raw, correctness 0.5625, normalized 1.125 |
| Checks | 1:pass, 2:FAIL, 3:FAIL, 4:pass, 5:pass, 6:FAIL |
| Scripts | 6 scripts including 3 retries and 3 sandbox verifications |
| Call count | 11 calls, 4 errors (optimal: 6 calls, 0 errors) |

**No mapping conflict.** Consistent with task-13.

**Persistent failure pattern:** Same 3 checks (2, 3, 6) have failed across all 18 T13 attempts. Best_score unchanged at 1.125. The per-diem overnights hypothesis (count=days-1) did NOT improve the score.

**New API requirements discovered:**
- `perDiemCompensations[].location` — required at POST time (422 without)
- `travelDetails.destination` — required at deliver time (422 without)
- `costs[].description` — doesn't exist, use `comments`
- `perDiemCompensations[].isDayTrip` — doesn't exist, belongs on `travelDetails`

---

### Run 8: prod-2026-03-21-230908038Z-3aed3b42

| Field | Value |
|-------|-------|
| Prompt language | Bokmål |
| Prompt | "Registrer en reiseregning for Astrid Larsen for 'Konferanse Ålesund'. 4 dager med diett (dagsats 800 kr). Utlegg: flybillett 6750 kr og taxi 500 kr." |
| Leaderboard tx_task_id | **13** |
| Inference status | `unique_attempt_delta` (unambiguous) |
| Score | 4.5/8 raw, correctness 0.5625, normalized 1.125 |
| Checks | 1:pass, 2:FAIL, 3:FAIL, 4:pass, 5:pass, 6:FAIL |
| Scripts | 3 scripts including sandbox verifications |
| Call count | ~17 calls, 3 errors (optimal: 6 calls, 0 errors) |

**No mapping conflict.** Consistent with task-13.

**Same failure pattern as run 7.** Identical check failures (2, 3, 6), identical score (4.5/8). 19th consecutive T13 attempt without improvement.

**Additional field trap discovered:** `costs[].currency` — including `{ code: "NOK" }` without `factor` causes 422. NOK is default; omit entirely.

---

## Cluster-Level Conclusions

### 1. CRITICAL: Tasks 01–08 txTaskId mapping is FULLY SCRAMBLED

**Evidence:** Run 1 (2d9b6947) unambiguously scored as tx_task_id 05 by creating departments. Cross-referencing against the full `prompt-task-labels.jsonl` ledger reveals ALL 8 tier-1 task IDs are misaligned between the leaderboard and the tripletex2 canonical registry.

**Leaderboard prompt evidence (from `prompt-task-labels.jsonl`):**

| Leaderboard tx_task_id | Actual prompt semantics | tripletex2 currently maps to |
|----------------------|------------------------|----------------------------|
| 01 | **create-employee** | create-customer |
| 02 | **create-customer** | create-supplier |
| 03 | **create-product** | create-department |
| 04 | **create-supplier** | create-product |
| 05 | **create-department** | create-project |
| 06 | **create-and-send-invoice** | create-employee |
| 07 | **register-customer-invoice-payment** | create-accounting-dimension-and-post-voucher |
| 08 | **create-project** | create-and-send-invoice |

Every single mapping in the first 8 task IDs is **wrong.** The canonical registry has a completely scrambled permutation.

**Impact:** When tripletex2 classifies a "create department" prompt, it routes it to task-03 (correct internal semantics) but reports txTaskId "03" to the leaderboard. The leaderboard expects tx_task_id "05" for department creation. This means:
- All leaderboard score attributions for tripletex2 runs on tasks 01-08 are landing under the wrong task
- The leaderboard scores appear stale or wrong because submissions are being attributed to mismatched tasks
- The tripletex2 task implementations themselves are semantically correct (the code does the right thing), but the `txTaskId` field in each task definition points to the wrong leaderboard slot

**Evidence strength:**
- tx_task_id 05 = departments: CONFIRMED by run 1 (`unique_attempt_delta`, 7/7 score)
- tx_task_id 07 = register-payment: CONFIRMED by multiple `prompt-task-labels.jsonl` entries with payment prompts
- tx_task_id 08 = create-project: CONFIRMED by multiple `prompt-task-labels.jsonl` entries with project creation prompts
- All other mappings: CONFIRMED by 3+ prompt examples each in `prompt-task-labels.jsonl`

**Required fix:** Update the `txTaskId` field in each task definition file and the canonical registry. The `taskId` (internal) can stay as-is if preferred, but `txTaskId` MUST match the leaderboard's numbering:

```
task-01/task.ts (create-customer):    txTaskId "01" → "02"
task-02/task.ts (create-supplier):    txTaskId "02" → "04"
task-03/task.ts (create-department):  txTaskId "03" → "05"
task-04/task.ts (create-product):     txTaskId "04" → "03"
task-05/task.ts (create-project):     txTaskId "05" → "08"
task-06/task.ts (create-employee):    txTaskId "06" → "01"
task-07/task.ts (dimension+voucher):  txTaskId "07" → ??? (not directly confirmed in this shard)
task-08/task.ts (create-and-send-invoice): txTaskId "08" → "06"
```

**Note on task 07 (dimension+voucher):** The leaderboard's tx_task_id 07 is register-customer-invoice-payment. The current tripletex2 task-17 handles register-customer-invoice-payment with txTaskId "17". The correct leaderboard tx_task_id for the dimension+voucher task was NOT directly confirmed by a `unique_attempt_delta` run in this shard. It needs cross-referencing with other shards.

**Confidence:** HIGH for the 7 mappings confirmed by prompt-task-labels.jsonl. MEDIUM for task 07 (dimension+voucher) which needs additional shard evidence.

### 2. Task 15 vs Task 29 classifier boundary

**Evidence:** Run 5 (1fe7fd31) had a "register hours + create invoice" prompt (single employee, no supplier cost) that the reflection explicitly identified as task 15 ("register-project-hours-and-create-project-invoice"), not task 29. But the leaderboard diff included task 29 in its ambiguous candidate set.

**Impact:** The tripletex2 classifier must distinguish between:
- **Task 15:** Register hours for 1 employee on a project activity + create project invoice. No supplier cost, no numbered lifecycle steps.
- **Task 29:** Full project lifecycle with 4 numbered steps: budget + hours (2+ employees) + supplier cost + invoice.

**Discriminators:**
- Task 29 prompts have numbered lifecycle steps (1, 2, 3, 4) and mention budget, multiple employees, supplier cost.
- Task 15 prompts ask to register hours (single employee) and create a project invoice. No supplier cost.

### 3. Task 13 scoring plateau — root cause unknown

**Evidence:** Runs 7 and 8 are the 18th and 19th attempts on T13. All attempts score 4.5/8 with checks 2, 3, 6 failing. Variations tested and disproven as fixes:
- Per-diem count: days vs days-1 (overnights) — no effect
- rateType: 25886 vs 25888 — no effect
- destination/location presence — no effect on scoring (though now required by API)
- Different employees, languages, amounts — no effect

**Hypothesis still untested:**
- Using system per-diem rate (1012 kr) instead of prompt rate (800 kr)
- Per-diem count=4 (literal days) with correct rateType 25888
- Orphan OPEN expenses from failed attempts confusing the scorer
- Some unknown field combination

**Impact on tripletex2 strategy:** The current `create-and-deliver-travel-expense.ts` strategy uses a `GET /travelExpense/rate` lookup to resolve per-diem rate types and uses the prompt rate. If the scorer expects the system rate instead, the strategy would need to change. This requires sandbox experimentation with the actual scorer.

### 4. Task 29 "4 critical fields" hypothesis DISPROVEN

**Evidence:** Run 6 (ff67568b) implemented all 4 hypothesized critical fields:
- `isFixedPrice: true` + `fixedprice: 253000` on project
- `budgetHours: 152` on activity
- `adminAccess: true` for PM, `false` for consultant
- `POST /project/orderline` with `unitCostCurrency: 47050`

Score did NOT improve — best_score stayed at 1.0909 (≈2/11 checks). The root cause of task 29's persistent failures is something else entirely.

**Impact on tripletex2 strategy:** The current `full-project-lifecycle.ts` strategy focuses on these 4 fields. Since they don't improve the score, the strategy needs research into what the remaining 7+ failing checks actually verify.

### 5. Batch endpoints confirmed in production

Both runs 3 and 6 sandbox-verified (and run 6 production-used):
- `POST /employee/list` — batch create employees (saves 1 call per extra employee)
- `POST /project/participant/list` — batch create participants with per-participant `adminAccess`

These should be incorporated into the tripletex2 task-29 strategy.

### 6. Travel expense API field requirements (as of 2026-03-22)

Required fields discovered/confirmed by runs 7 and 8:
- `perDiemCompensations[].location` — required at POST time
- `travelDetails.destination` — required at deliver time (but best to include at POST)
- `costs[].comments` — correct field (NOT `description`)
- `travelDetails.isDayTrip` — correct location (NOT on `perDiemCompensations`)
- `costs[].currency` — omit entirely for NOK (including without `factor` causes 422)

The tripletex2 strategy (`create-and-deliver-travel-expense.ts`) already includes both `location` and `destination`. It uses `comments` correctly. No strategy-level conflict here; the issues were in the production agent not following the trusted standard's payload shape.

## Suspected Mapping Corrections

### txTaskId corrections for tasks 01–08 (confirmed by prompt-task-labels.jsonl)

| tripletex2 taskId | Task semantics | Current txTaskId | Correct txTaskId | Confidence |
|-------------------|---------------|-----------------|-----------------|------------|
| 01 | create-customer | 01 | **02** | HIGH |
| 02 | create-supplier | 02 | **04** | HIGH |
| 03 | create-department | 03 | **05** | HIGH (run 1 direct confirmation) |
| 04 | create-product | 04 | **03** | HIGH |
| 05 | create-project | 05 | **08** | HIGH |
| 06 | create-employee | 06 | **01** | HIGH |
| 07 | dimension+voucher | 07 | **???** | MEDIUM (needs other shard data) |
| 08 | create-and-send-invoice | 08 | **06** | HIGH |

### Additional corrections for later tasks (from leaderboard evidence)

| tripletex2 taskId | Task semantics | Current txTaskId | Correct txTaskId | Confidence |
|-------------------|---------------|-----------------|-----------------|------------|
| 17 | register-customer-invoice-payment | 17 | **07** | HIGH (prompt-task-labels.jsonl confirms tx_task_id 07 = payment prompts) |

**Note:** The above correction for task-17 means the current tripletex2 txTaskId "17" is wrong. The leaderboard's tx_task_id 17 may map to a different task entirely. This needs full shard cross-referencing.

### Classifier boundary correction

| Issue | Evidence | Recommended Correction |
|-------|----------|----------------------|
| Task 15 vs 29 boundary | Run 5 prompt is single-employee hours+invoice (no supplier, no lifecycle) | Classifier must route these to task 15, not task 29 |
