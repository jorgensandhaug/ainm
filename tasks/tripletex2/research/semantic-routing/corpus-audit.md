# Corpus Audit — Semantic Routing Wave 1

**Date:** 2026-03-21
**Scope:** Evidence mapping for a prompt-routing classifier that assigns incoming prompts to
the correct canonical Tripletex2 task (tx_task_id 01-30) with near-zero false positives.

---

## 1. Evidence Hierarchy (most → least trustworthy)

### Tier 1 — Authoritative semantic ground truth
| Source | Why trustworthy |
|--------|----------------|
| `tasks/tripletex/codex-environment/trusted-standards/*.md` | Production-verified API patterns with sandbox execution logs. Defines the canonical shape of each task's prompt inputs and API flow. |
| `tasks/tripletex2/research/legacy/task-playbooks/*.md` | Researcher-curated playbooks with verified execution records (Unicode, multilingual, edge cases). |
| `tasks/tripletex2/codex-environment/AGENTS.md` | Operational task classifier contract. Contains the intent descriptions used in live production classification. |
| `tasks/tripletex2/src/tasks/task-*/task.ts` | Frozen TypeScript task definitions: canonical `txTaskId`, required fields, extraction notes. |

### Tier 2 — Useful with verification
| Source | Why useful | Why to verify |
|--------|------------|---------------|
| `tasks/tripletex/data/production/runs/*/request.json` | Real competition prompts; multilingual; reflect actual phrasing. | Only reliable when paired with a verified `task-attribution.json`. |
| `tasks/tripletex/data/production/runs/*/task-attribution.json` where `inference_status = unique_attempt_delta` | Leaderboard-backed attribution. A unique attempt delta is strong evidence the run scored. | The claimed `tx_task_id` is ONLY trustworthy if the prompt text also matches the canonical task semantics (see §3). |

### Tier 3 — Not directly trustworthy as routing labels
| Source | Why to distrust |
|--------|----------------|
| `tasks/tripletex/data/prompt-task-labels.jsonl` raw `tx_task_id` field | Contains systematic label offset (§2.1) and inference-drift contamination (§2.2). **Do not use `tx_task_id` as a routing label without semantic validation.** |
| Runs with `inference_status = ambiguous` (80 runs, not in inventory) | Leaderboard window captured multiple task deltas; attribution is unreliable. Quarantined from inventory. |
| Runs with `inference_status = no_change_detected` | No leaderboard credit; run likely failed silently. |

---

## 2. Failure Modes in Existing Prompt Datasets

### 2.1 Systematic Label Offset (Primary Failure Mode)

**Finding:** For competition task IDs 01-17 (and partially 11, 14-17), the `tx_task_id` value
in `prompt-task-labels.jsonl` and `task-attribution.json` does NOT match the canonical
`tx_task_id` in the Tripletex2 task registry.

**Confirmed by:** Cross-referencing `request.json` prompt text with canonical task semantics
across all 152 unique_attempt_delta runs.

| Claimed tx_task_id | Prompt semantics (actual) | Canonical task (correct) |
|---|---|---|
| 01 | Create employee (name, DOB, email) | 06 |
| 02 | Create customer (name, org#, address, email) | 01 |
| 03 | Create product (product#, price, VAT type) | 04 |
| 04 | Create supplier (name, org#, invoice email) | 02 |
| 05 | Create department(s) | 03 |
| 06 | Create and send customer invoice | 08 |
| 07 | Register customer invoice payment | 17 |
| 08 | Create project (client, manager) | 05 |
| 09 | Create customer invoice (product lines) | **09 (MATCH)** |
| 10 | Create sales order (products, amounts) | **11 (uncertain)** |
| 11 | Register supplier invoice (INV-XXXX) | 16 |
| 12 | Run payroll with bonus | **12 (MATCH)** |
| 13 | Register travel expense | **13 (MATCH)** |
| 14 | Issue full credit note | 10 |
| 15 | Set project fixed price + invoice milestone | 14 |
| 16 | Register project hours | 15 |
| 17 | Create accounting dimension + post voucher | 07 |
| 18-29 | See table in §4 | Mostly MATCH |

**Root cause:** Unknown with certainty. Most likely one of:
- The competition renumbered tasks between an early wave and the current wave, and the legacy
  `tripletex1` system recorded old task numbers.
- The leaderboard-delta inference algorithm consistently captured wrong columns when
  multiple concurrent runs were in flight.

**Consequence for the bridge module:** `legacy-tripletex1-task-bridge.ts` currently uses a
1:1 identity mapping (`legacyTripletex1TaskIds: ["01"]` for every task). This is incorrect
for tasks 01-08, 11, 14-17. The bridge needs the actual competition→canonical table above.
**Do not update the bridge in Wave 1 — record here only.**

### 2.2 Inference-Drift Contamination (Secondary Failure Mode)

Within an otherwise correctly-attributed task group, 5 individual runs are outright wrong —
the prompt text has unambiguous semantics for a different task:

| Run ID | Claimed tx_task_id | Actual semantics | Canonical task |
|---|---|---|---|
| prod-2026-03-20-151341523Z-1e345deb | 04 (create-supplier) | Create customer invoice (Bølgekraft AS, 3 product lines) | 09 |
| prod-2026-03-20-164819684Z-afc5fde0 | 09 (create-invoice) | Register project hours (Sigrid Haugen, 11 timar, Rådgivning) | 15 |
| prod-2026-03-20-202049730Z-06edfe91 | 15 (set-fixed-price) | Register travel expense (Miguel Pérez, Visita cliente Tromsø) | 13 |
| prod-2026-03-21-183449812Z-49332405 | 15 (set-fixed-price) | Correct ledger errors (Jan-Feb 2026, 4 errors) | 24 |
| prod-2026-03-20-154433919Z-c844c6eb | 17 (accounting-dim) | Create customer invoice (Floresta Lda, 3 product lines) | 09 |

**Mechanism:** Leaderboard observation window captured a delta from a different concurrent run.
All 5 are quarantined in the canonical inventory.

### 2.3 Timeout Contamination

6 runs in `prompt-task-labels.jsonl` (and matching count in task-attribution.json) have
`completion_reason: timeout`. The prompts are valid, but the run did not complete. For exact
tasks (MATCH group), timeouts are included at medium confidence. For remapped tasks, timeouts
are quarantined.

### 2.4 Uncertain-Canonical Tasks (Tasks 21, 23, 26, 30)

Four competition task IDs have evidence that their SEMANTICS do not match the current canonical
placeholders or definitions in the Tripletex2 registry:

| Competition tx_task_id | Observed prompt semantics | Current canonical definition | Gap |
|---|---|---|---|
| 21 | Employee onboarding from offer letter (PDF) | correct-ledger-errors-audit | Canonical definition may be wrong |
| 23 | Reconcile bank statement against open invoices (CSV) | unknown-task-23 (placeholder) | Canonical needs defining |
| 26 | Month-end closing (periodification, accruals, closure) | unknown-task-26 (placeholder) | Canonical needs defining |
| 30 | Simplified annual closing (depreciation, tax) | unknown-task-30 (placeholder) | Canonical needs defining |

For tasks 23, 26, 30: the placeholder definitions should be replaced with real task definitions
based on the observed prompt semantics. These are strong evidence for what the competition
actually asks.

For task 21: requires investigation. Either canonical 21's current definition ("correct ledger
errors audit") is wrong for competition task 21, OR the runs attributed to tx_task_id=21 are
inference-drift contamination from actual ledger-error runs. Project memory notes a
"21 vs 24 classifier routing mismatch" which suggests the system does have two ledger-error
variants. If competition 21 = "onboard from offer letter," that is a gap in the canonical
registry entirely.

All four are quarantined in the canonical inventory pending canonical definition updates.

---

## 3. Canonical Gold-Labeling Rules

These rules define how to add new rows to the canonical prompt corpus reliably:

1. **Prompt text is ground truth.** The semantic task is determined from the prompt, not from
   `tx_task_id`. Cross-reference with the trusted-standards files for the canonical task shape.

2. **`tx_task_id` is a hint, not a label.** Use it only to find candidate runs. Always verify
   the prompt text matches the claimed task before accepting the label.

3. **Only `unique_attempt_delta` runs qualify** as initial candidates. `ambiguous`,
   `metadata_changed`, and `no_change_detected` are automatically excluded.

4. **Remap systematically.** For competition tx_task_ids 01-08, 11, 14-17 (the offset group),
   apply the mapping table in §2.1. Label the row with the **canonical** task ID, not the
   claimed one. Set confidence = "medium" for remapped rows (labeling uncertainty remains).

5. **Quarantine rather than coerce.** When the prompt semantics are ambiguous between two
   canonical tasks, or when no canonical task definition exists for the observed semantics,
   quarantine the row. Do not guess.

6. **File-attached runs need separate handling.** Runs with `files: []` non-empty are tasks
   19, 20, 21, 22, 23 (PDF/CSV attachments). The file content is not preserved in `request.json`
   for replay — only the prompt text is. Label these rows but note that a routing classifier
   trained on prompt text alone may not capture the full signal for these tasks.

7. **Timeout rows.** Include at confidence=medium if the task semantics are clear (MATCH group).
   Quarantine if remapped (adds too much uncertainty stacking).

8. **Do not de-duplicate prompts** in the canonical corpus. Repeated prompts with different
   org#/amounts are useful for measuring classifier robustness.

---

## 4. Prompt Availability and Confidence by Canonical Task

> All counts are from the canonical-prompt-inventory.jsonl (152 total rows, 135 active).

| Canonical task | Task name | Active rows | High | Medium | Low | Files | Notes |
|---|---|---|---|---|---|---|---|
| 01 | Create customer | 4 | 0 | 4 | 0 | 0 | Remapped from tx=02 |
| 02 | Create supplier | 10 | 0 | 10 | 0 | 0 | Remapped from tx=04 (1 contamination removed) |
| 03 | Create department | 7 | 0 | 7 | 0 | 0 | Remapped from tx=05 |
| 04 | Create product | 4 | 0 | 4 | 0 | 0 | Remapped from tx=03 |
| 05 | Create project | 8 | 0 | 8 | 0 | 0 | Remapped from tx=08 |
| 06 | Create employee | 4 | 0 | 4 | 0 | 0 | Remapped from tx=01 |
| 07 | Accounting dimension + voucher | 8 | 0 | 8 | 0 | 0 | Remapped from tx=17 (1 contamination removed) |
| 08 | Create and send invoice | 5 | 0 | 5 | 0 | 0 | Remapped from tx=06 |
| 09 | Create customer invoice | 7 | 6 | 1 | 0 | 0 | MATCH (tx=09). 1 contamination removed. |
| 10 | Issue full credit note | 7 | 0 | 7 | 0 | 0 | Remapped from tx=14 |
| 11 | Create order+invoice+payment | 6 | 0 | 0 | 6 | 0 | tx=10 (order creation). Uncertain if full workflow. |
| 12 | Run payroll with bonus | 6 | 6 | 0 | 0 | 0 | MATCH (tx=12). Strongest non-file task corpus. |
| 13 | Register travel expense | 8 | 8 | 0 | 0 | 0 | MATCH (tx=13). Strongest non-file task corpus. |
| 14 | Set project fixed price | 7 | 0 | 7 | 0 | 0 | Remapped from tx=15 (2 contaminations removed) |
| 15 | Register project hours + invoice | 2 | 0 | 2 | 0 | 0 | Remapped from tx=16. **WEAK — only 2 rows.** |
| 16 | Register supplier invoice | 5 | 0 | 5 | 0 | 0 | Remapped from tx=11 |
| 17 | Register customer payment | 3 | 0 | 3 | 0 | 0 | Remapped from tx=07 |
| 18 | Reverse customer payment | 9 | 9 | 0 | 0 | 0 | MATCH (tx=18). Strongest overall. |
| 19 | Onboard from contract PDF | 2 | 2 | 0 | 0 | 2 | MATCH (tx=19). File-attached; small corpus. |
| 20 | Supplier invoice PDF | 3 | 3 | 0 | 0 | 3 | MATCH (tx=20). File-attached. |
| 21 | Correct ledger errors (audit) | 0 | — | — | — | — | **ZERO ROWS.** tx=21 rows quarantined (offer-letter semantics). |
| 22 | Register receipt expense | 3 | 1 | 2 | 0 | 3 | MATCH (tx=22). 2 timeouts → medium. |
| 23 | Unknown (reconcile bank?) | 0 | — | — | — | — | **ZERO ROWS.** Canonical = placeholder. |
| 24 | Correct ledger errors | 5 | 0 | 0 | 5 | 0 | tx=24 tentative. 21 vs 24 ambiguity unresolved. |
| 25 | Overdue reminder + partial payment | 2 | 2 | 0 | 0 | 0 | MATCH (tx=25). Minimal but clean. |
| 26 | Unknown (month-end closing?) | 0 | — | — | — | — | **ZERO ROWS.** Canonical = placeholder. |
| 27 | Foreign currency payment | 3 | 1 | 2 | 0 | 0 | MATCH (tx=27). 2 timeouts → medium. |
| 28 | Analyze expense + internal projects | 3 | 3 | 0 | 0 | 0 | MATCH (tx=28). |
| 29 | Full project lifecycle | 4 | 2 | 2 | 0 | 0 | MATCH (tx=29). 2 timeouts → medium. |
| 30 | Unknown (year-end closing?) | 0 | — | — | — | — | **ZERO ROWS.** Canonical = placeholder. |

---

## 5. Quarantine Rules

A row is quarantined (excluded from active corpus) if ANY of the following apply:

1. **Known contamination run** — the run_id is in the 5 confirmed inference-drift rows (§2.2).
2. **Uncertain canonical definition** — tx_task_id is 21, 23, 26, or 30 (no reliable canonical).
3. **Remap + timeout** — the claimed tx_task_id requires remapping AND the run timed out
   (two independent sources of uncertainty stack to low-value for routing training).
4. **Future: prompt text contradiction** — any row where the prompt text clearly describes
   a different task than the assigned canonical_id. New contamination should be added to the
   `CONTAMINATION_RUNS` dict in the inventory generation script.

A quarantined row is **not deleted** — it remains in the JSONL with `"quarantine": true`
and a `quarantine_reason` field. Quarantine status may be reversed as evidence improves.

---

## 6. Solved-Task Exclusion Policy Support

The canonical corpus intentionally includes ALL 30 tasks, including those with perfect
leaderboard scores (e.g., tasks 12=6/6, 13=6/6, 18=4/4). This is by design:

- **Negative anchors:** A routing classifier must know that a "run payroll" prompt belongs to
  task 12 even if task 12 is already solved. Removing solved tasks from the semantic universe
  breaks contrastive training and creates false-negative failure modes.
- **Routing = classification, not selection.** The corpus trains a classifier to identify the
  TRUE nearest task. Whether the runtime then *selects* that task or skips it is a separate
  policy layer.

**How to implement solved-task exclusion without contaminating the corpus:**

1. Train the router on the full canonical corpus (all 30 tasks present).
2. At inference time, the router outputs a ranked list: `[task_id_1, task_id_2, ...]`
   with confidence scores.
3. The runtime policy layer consults `configs/active-strategies.json` and a "solved-task
   registry" (task IDs at theoretical maximum score) to decide which task to actually execute.
4. If the top-ranked task is excluded (already perfect), the runtime passes the full ranked
   list plus the excluded set to a rejection-aware re-router that selects the next eligible
   candidate. Observability: log `first_choice`, `excluded_reason`, `final_choice`.

**Never remove solved tasks from:**
- `canonical-prompt-inventory.jsonl` rows
- Classifier training data
- Task cards / contrastive analysis documents

**Only exclude solved tasks from:**
- The runtime selection step (not from classification)
- Logged as a policy decision with explicit `excluded_task_ids` field
