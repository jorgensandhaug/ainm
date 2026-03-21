# Corpus Gaps — Semantic Routing Wave 1

**Date:** 2026-03-21
**Source:** canonical-prompt-inventory.jsonl (135 active rows across 26 of 30 canonical tasks)

Tasks are grouped by the reliability and depth of their current routing corpus.

---

## Tier A — Strong Evidence (≥6 rows, high or medium confidence)

These tasks have enough prompt variety to train and evaluate a classifier. High-confidence
(exact-match) rows are preferred; medium-confidence (remapped) rows are usable but should be
validated against trusted-standards before use in classifier training.

| Canonical task | Active rows | H/M/L | Notes |
|---|---|---|---|
| 02 (create-supplier) | 10 | 0/10/0 | Largest group; all remapped from tx=04 |
| 03 (create-department) | 7 | 0/7/0 | Remapped from tx=05 |
| 05 (create-project) | 8 | 0/8/0 | Remapped from tx=08 |
| 07 (accounting-dim+voucher) | 8 | 0/8/0 | Remapped from tx=17 |
| 09 (create-invoice-multiline) | 7 | 6/1/0 | Best high-confidence non-file task |
| 12 (payroll-with-bonus) | 6 | 6/0/0 | All high-confidence; clean exact match |
| 13 (travel-expense) | 8 | 8/0/0 | All high-confidence; best overall |
| 18 (reverse-payment) | 9 | 9/0/0 | All high-confidence; strongest task |
| 11 (order+invoice+payment) | 6 | 0/0/6 | Low confidence; task-10 prompts may only be order creation, not full workflow |

**Action:** These tasks can be included in an initial classifier training run. Remapped rows
need the semantic label validated (prompt → trusted-standard cross-check) before committing.

---

## Tier B — Moderate Evidence (3-5 rows)

Enough to define the task shape for a classifier, but too few examples for robust evaluation.
Classifier may overfit to specific phrasings. Needs augmentation from production runs.

| Canonical task | Active rows | H/M/L | Notes |
|---|---|---|---|
| 01 (create-customer) | 4 | 0/4/0 | Remapped from tx=02; multilingual |
| 04 (create-product) | 4 | 0/4/0 | Remapped from tx=03 |
| 06 (create-employee) | 4 | 0/4/0 | Remapped from tx=01 |
| 08 (create-and-send-invoice) | 5 | 0/5/0 | Remapped from tx=06 |
| 10 (issue-credit-note) | 7 | 0/7/0 | Remapped from tx=14; 7 rows is actually moderate-strong |
| 14 (set-fixed-price) | 7 | 0/7/0 | Remapped from tx=15 (2 contaminations removed) |
| 16 (register-supplier-invoice) | 5 | 0/5/0 | Remapped from tx=11 |
| 19 (onboard-from-contract-PDF) | 2 | 2/0/0 | **FILE-ATTACHED** — only 2 rows; routing can only use prompt text |
| 20 (supplier-invoice-PDF) | 3 | 3/0/0 | **FILE-ATTACHED** |
| 22 (receipt-expense) | 3 | 1/2/0 | **FILE-ATTACHED**; 2 timeout rows |
| 24 (correct-ledger-errors) | 5 | 0/0/5 | Low confidence due to 21/24 ambiguity |
| 25 (overdue-reminder) | 2 | 2/0/0 | High confidence but minimal; 2 rows only |
| 27 (foreign-currency-payment) | 3 | 1/2/0 | 2 timeout rows → medium |
| 28 (analyze-expense+projects) | 3 | 3/0/0 | Exact match; needs more multilingual variety |
| 29 (full-project-lifecycle) | 4 | 2/2/0 | 2 timeout rows |

**Action:** All tasks in this tier need additional production runs to build routing confidence.
Priority: tasks 15, 17, 19, 22, 25, 27.

---

## Tier C — Weak Evidence (≤2 rows, or all low-confidence)

These tasks are dangerous to include in a classifier without more data. Their corpus is too
thin to generalize and too noisy to evaluate against.

| Canonical task | Active rows | H/M/L | Issue |
|---|---|---|---|
| 15 (register-project-hours+invoice) | 2 | 0/2/0 | Only 2 rows after removing 1 timeout; very narrow |
| 17 (register-customer-payment) | 3 | 0/3/0 | Remapped from tx=07; few examples |

**Action:** Must run new production evidence before including in classifier training.

---

## Tier D — Zero Evidence (quarantined or undefined)

These tasks have NO reliable prompt corpus at present.

| Canonical task | Active rows | Quarantined rows | Root cause |
|---|---|---|---|
| 21 (correct-ledger-errors-audit) | **0** | 3 | All tx=21 rows show offer-letter onboarding semantics; canonical definition may be wrong or competition 21 is a different task entirely |
| 23 (unknown = reconcile-bank?) | **0** | 2 | Canonical is a placeholder; strong evidence competition 23 = bank reconciliation with CSV |
| 26 (unknown = month-end-closing?) | **0** | 3 | Canonical is a placeholder; strong evidence competition 26 = month-end closing |
| 30 (unknown = year-end-closing?) | **0** | 3 | Canonical is a placeholder; strong evidence competition 30 = simplified annual closing |

**Action for 23, 26, 30:** Update canonical task registry with observed semantics, then
reclassify the quarantined rows as active at medium confidence. This would immediately add
8 new active rows (2+3+3) to the corpus.

**Action for 21:** Investigate the competition's actual task 21 description. If competition
21 = onboard-from-offer-letter, then:
- Canonical task 21's current slug ("correct-ledger-errors-audit") is WRONG
- The 3 quarantined rows would become valid canonical-21 evidence (offer-letter onboarding)
- The system currently has a ledger-errors-audit strategy under task 21 that may be scoring
  on competition task 24 or a different competition task — this is the source of the
  "21 vs 24 routing mismatch" noted in project memory

---

## Tasks Needing New Production Evidence

The following tasks need fresh production runs to build usable routing corpora:

### Highest priority (Tier C + most impactful):
1. **Task 15** — register-project-hours+invoice (2 rows). Run 3-5 multilingual prompts.
2. **Task 17** — register-customer-payment (3 rows, all remapped). Run 3-5 fresh prompts.
3. **Task 21** — resolve canonical definition confusion first, then run evidence.
4. **Tasks 23, 26, 30** — update canonical definitions, then promote quarantined rows.

### Next priority (Tier B thin spots):
5. **Task 25** — overdue-reminder (2 rows). Run 3-5 more.
6. **Task 19** — onboard-from-contract-PDF (2 rows with files). Hard to augment without real PDF.
7. **Task 22** — receipt-expense (3 rows, 2 timed out). Run 3+ clean completions.
8. **Task 24** — ledger errors (5 rows, all low-confidence due to 21/24 ambiguity). Resolve disambiguation.

### Near-term: augment Tier A remapped tasks with high-confidence rows
9. **Tasks 01-08, 10, 14, 16** — all have 4-10 rows but ALL at medium confidence (remapped).
   Fresh production runs with confirmed canonical labeling would promote these to high confidence.

---

## Contrastive Confusion Pairs (known routing challenges)

These task pairs share surface-level features that may confuse a routing classifier:

| Pair | Shared features | Distinguishing signal |
|---|---|---|
| 09 vs 08 | Both: create invoice for a customer | 08: "send" keyword; 09: explicit product lines |
| 01 vs 02 | Both: create a named entity with org# | 01: "kunde/customer"; 02: "leverandør/supplier/lieferant" |
| 12 vs 13 | Both: involve an employee + amounts | 12: "payroll/bonus"; 13: "travel/trip/days" |
| 10 vs 09 | Both: involve invoice with amounts | 10: "credit note/gutschrift/avskrivning"; 09: no reversal language |
| 21 vs 24 | Both: "correct ledger errors" Jan-Feb | Distinguishing signal TBD; see task 21 investigation |
| 19 vs 21 | Both (if 21=offer-letter): employee onboarding | 19: "contract/arbeidskontrakt"; 21: "offer letter/Angebotsschreiben" |
| 29 vs 05+15+16 | Project lifecycle vs individual steps | 29: explicit multi-step sequence numbered in prompt |

These pairs should be the focus of contrastive task-card documents in Wave 2.
